const { Cu } = require('chrome');
const Env = require('sdk/system/environment').env;
const File = require('sdk/io/file');
const Prefs = require("sdk/simple-prefs");
const SimpleStorage = require("sdk/simple-storage").storage;
const System = require('sdk/system');
const Tabs = require('sdk/tabs');

const { emit, on, once, off } = require('sdk/event/core');
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');

// For OS.Path.join and OS.Constants.Path.tmpDir
const { OS } = Cu.import("resource://gre/modules/osfile.jsm", {});

const {Thrift, NoteStoreClient, UserStoreClient, Note, ClientUsageMetrics} =
    require('./thrift-box');
const Async = require('./async');
const Boot = require('./boot');
const Log = require('./log');
const Metrics = require('./metrics');
const Native = require('./native');
const Net = require('./net');
const Rpc = require('./rpc');
const Url = require('./url');
const Util = require('./util');
const Xslt = require('./xslt');

const LOGIN_TIMEOUT_MS = 30000;

var UserStore = {};

UserStore.init = function(url) {
  this.jsonRpcUrl = url;
  this.opts = {
    url: url,
    method: 'POST',
    timeout: LOGIN_TIMEOUT_MS
  };

  this.jsonRpc = new Rpc.Client(this.opts);
  this.authenticateLongSession = this.jsonRpc.remote("UserStore.authenticateLongSession");
  this.completeTwoFactorAuthentication = this.jsonRpc.remote("UserStore.completeTwoFactorAuthentication");
  this.getUser = this.jsonRpc.remote("UserStore.getUser");
  this.refreshAuthentication = this.jsonRpc.remote("UserStore.refreshAuthentication");
  this.authenticateToBusiness = this.jsonRpc.remote("UserStore.authenticateToBusiness");
  this.revokeLongSession = this.jsonRpc.remote("UserStore.revokeLongSession");
  this.createSessionAuthenticationToken = this.jsonRpc.remote('UserStore.createSessionAuthenticationToken');
}


function getUserStore() {
  if (!UserStore) {
    throw new ReferenceError("User store not initialized");
  }
  return UserStore;
}


var Session = function(info) {
  this.info = info;
  this.expiration = +(new Date()) - info.currentTime + info.expiration;
  this.token = info.authenticationToken;
  this.noteStoreUrl = info.noteStoreUrl;
  this.webApiUrlPrefix = info.webApiUrlPrefix;
  this.noteServer = null;
  //Log.log("SESSION CREATED =" + this.token + " " + (new Date(this.expiration))
  //  + " " + this.noteStoreUrl);
}

Session.prototype.validate = function() {
  if (!this.token) {
    return false;
  } // revoked.
  var time = +(new Date());
  if (time > this.expiration) {
    this.revoke('expired');
    return false;
  }
  return true;
}

Session.prototype.revoke = function(reason) {
  // TODO: User store revoke session

  this.token = false;
  this.expiration = 0;
  this.noteServer = null;
  // notify all dependents.
}

var NoteStore = function NoteStore(session) {
  this.url = session.noteStoreUrl;
  this.session = session;
  this.client = new NoteStoreClient(this.url);
};

NoteStore.prototype.listNotebooks = function() {
  if (!this.session || !this.session.validate()) {
    return reject('EXPIRED_AUTHENTICATION_TOKEN');
  }
  //Log.log("Thrift request:listNotebooks (" + this.session.token + ")");
  return this.client.listNotebooks(this.session.token).then(
      function(result) {
        var json = {};
        for (var k in result) {
          json[k] = result[k];
        }
        Log.log("Thrift resp:listNotebooks", JSON.stringify(json));
        return result;
      }
  );
};

NoteStore.prototype.createNote = function(notebook, note) {
  var noteApi;
  if (!this.session || !this.session.validate()) {
    return reject('EXPIRED_AUTHENTICATION_TOKEN');
  }

  if (!(note instanceof Note)) {
    return reject(new Error("Must be a Note"));
  }
  if (notebook) {
    note.notebookGuid = notebook.guid;
  }

  return this.client.createNote(this.session.token, note)
      .then(function(result) {
              //Log.log("createNote ok");
              //Log.log(result);
              return result;
            }, function(error) {
              Log.log("createNote error");
              Log.log(error);
              throw require('./auth').parseException(error);
            });
};

NoteStore.prototype.listTags = function() {
  if (!this.session || !this.session.validate()) {
    return reject('EXPIRED_AUTHENTICATION_TOKEN');
  }
  return this.client.listTags(this.session.token);
};

var USER_EXCEPTION_RE = /^EDAMUserException\(errorCode:([A-Z_]+)\s*,\s*parameter:([\w.]+)\)$/;

function parseException(error) {
  Log.log('parseException',error);
  if (!("trace" in error)) {
    if (error.errorCode === 9) {
      if (error.parameter === 'authenticationToken') {
        // auth token was somehow invalidated from outside
        return 'INVALID_AUTHENTICATION_TOKEN';
      }
    }
    return error;
  }
  let trace = error.trace;
  let stackTop = trace.split("\n")[0];
  let match = USER_EXCEPTION_RE.exec(stackTop);
  if (!match) {
    return error;
  }
  var errorCode = match[1];
  var parameterName = match[2];
  if (errorCode === "DATA_REQUIRED") {
    if (parameterName === 'password') {
      return 'PASSWORD_REQUIRED';
    } else if (parameterName === 'username') {
      return 'USERNAME_REQUIRED';
    }
  } else if (errorCode === "INVALID_AUTH") {
    if (parameterName === 'password') {
      return 'INVALID_PASSWORD';
    } else if (parameterName === 'username') {
      return 'INVALID_USERNAME';
    } else if (parameterName === 'oneTimeCode') {
      return 'INVALID_TWO_STEP_CODE';
    }
  } else if (errorCode === "PERMISSION_DENIED") {
    if (parameterName === 'authenticationToken') {
      return 'EXPIRED_AUTHENTICATION_TOKEN';
    } else if (parameterName === 'Business') {
      return 'BUSINESS_ACCOUNT_INVALID';
    }
  } else if (errorCode === "AUTH_EXPIRED") {
    if (parameterName === 'password') {
      return 'EXPIRED_PASSWORD';
    } else if (parameterName === 'authenticationToken') {
      return 'EXPIRED_AUTHENTICATION_TOKEN';
    }
  } else if (errorCode === "BAD_DATA_FORMAT") {
    if (parameterName === 'username') {
      return 'INVALID_USERNAME';
    }
  }
  return errorCode;
}

var gNotebookData = {};
var gNotebookDataExpiration = 0;

var noteStoreCache = {};
var noteStoreExtraCache = {};

var tagData = {
  personal: [],
  business: []
};
var userInfo = null;
var gAuthTokens = {};

// Parse inner structure of the auth token.
// We shouldn't use the information except as a fallback
// when we cannot get the info the proper way.
function parseAuthToken(token) {
  var parts = token.split(':');
  var parsed = {};
  parts.forEach(function(part){
    var ps = part.split('=');
    if (ps.length < 2) return;
    var k = ps[0].substr(0,3); // max length
    var v = ps[1];
    parsed[k]=v;
  });
  if ('U' in parsed) {
    // user
    parsed['U'] = parseInt(parsed['U'], 16);
  }
  if ('E' in parsed) {
    // expiration
    parsed['E'] = parseInt(parsed['E'], 16);
  }
  if ('C' in parsed) {
    // created
    parsed['C'] = parseInt(parsed['C'], 16);
  }
  return parsed;
}

function createAuthToken(id, authResult, options) {
  options = options || {};
  var authToken = {};

  authToken.expiration = +(new Date()) - authResult.currentTime + authResult.expiration;
  authToken.token = authResult.authenticationToken;
  authToken.parsedToken = parseAuthToken(authResult.authenticationToken);
  authToken.noteStoreUrl = authResult.noteStoreUrl;
  authToken.webApiUrlPrefix = authResult.webApiUrlPrefix;
  authToken.id = id || ("token-" + Util.generateId());
  authToken.userId = (authResult.user && authResult.user.id) || authToken.parsedToken['U'];
  authToken.shardId = (authResult.user && authResult.user.shardId) || authToken.parsedToken['S'];
  authToken.parent = options.parent && options.parent.id;
  authToken.primary = options.primary;

  authToken.refresh = options.refresh || null;
  authToken.valid = true;
  if (options.businessId) {
    authToken.businessId = options.businessId;
  } else if (authResult.user && authResult.user.businessUserInfo) {
    authToken.businessId = authResult.user.businessUserInfo.businessId;
  }

  Log.log('Token ' + id + ' created:', authToken);
  if (authToken.id in gAuthTokens) {
    Log.log('Token ' + id + ' reloaded');
  }
  gAuthTokens[authToken.id] = authToken;
  return authToken;
}

function rejectAuthTokenId(id, error) {
  //Log.error("Token Error:", error);
  //Log.error("in :", id);
  var authToken = {};
  authToken.valid = false;
  authToken.error = error;
  gAuthTokens[authToken.id] = authToken;
  return authToken;
}

function revokeAuthToken(authToken, error) {
  //Log.error("Token Error:", error);
  //Log.error("in :", authToken);
  if (!authToken) {
    return;
  }

  authToken.error = error;
  authToken.valid = false;
  return reject(error);
}

function getAuthToken(tokenId) {
  Log.log('Evernote.getAuthToken', tokenId);
  var authToken = gAuthTokens[tokenId];
  if (!authToken) {
    return reject(new Error("Token " + tokenId + " doesn't exist"));
  }
  if (authToken.error) {
    return reject(authToken.error);
  }
  if (!authToken.token || !authToken.noteStoreUrl) {
    authToken = rejectAuthTokenId(tokenId, new Error("Malformed token"));
    return reject(authToken.error);
  }
  var time = +(new Date());
  if (time > authToken.expiration) {
    if (!authToken.refresh) {
      authToken = rejectAuthTokenId(tokenId, 'EXPIRED_AUTHENTICATION_TOKEN');
      return reject(authToken.error);
    }
    return authToken.refresh();
  }
  return resolve(authToken);
}
function getAuthTokenImmediate(tokenId) {
  var authToken = gAuthTokens[tokenId];
  //if (!authToken) {
  //  throw new Error("Token " + tokenId + " doesn't exist");
  // }
  //if (!authToken.token || !authToken.noteStoreUrl) {
  //  throw new Error("Malformed token");
  //}
  return authToken;
}

function getNoteStoreClient(authToken) {
  var url = authToken.noteStoreUrl;
  return getNoteStoreClientForUrl(url);
}

function getNoteStoreClientForUrl(url) {
  if (url in noteStoreCache) {
    return noteStoreCache[url];
  }
  var client = noteStoreCache[url] = new NoteStoreClient(url);
  return client;
}

function getNoteStoreExtraClient(authToken) {

  var url = authToken.webApiUrlPrefix + 'json';
  return getNoteStoreExtraClientForUrl(url, authToken);
}

function getNoteStoreExtraClientForUrl(url) {
  return new NoteStoreExtraClient(url);

  //if (url in noteStoreExtraCache) {
  //  return noteStoreExtraCache[url];
  // }
  //var client = noteStoreExtraCache[url] = new NoteStoreExtraClient(url);
  //return client;
}

const NSE_TIMEOUT_MS = 20 * 1000; // 20 secs

function NoteStoreExtraClient(url) {

  this.jsonRpcUrl = url;
  this.jsonRpc = new Rpc.Client({
    url: this.jsonRpcUrl,
    method: 'POST',
    timeout: NSE_TIMEOUT_MS,
    verbose: true,
  });

  this.getFilingRecommendations = this.jsonRpc.remote('NoteStoreExtra.getFilingRecommendations');
  this.findNotesWithSnippet = this.jsonRpc.remote('NoteStoreExtra.findNotesWithSnippet');
}

function getFilingRecommendations(tokenId, pageUrl, snippet, query) {
  //Log.log("evernote.getFilingRecommendations", tokenId);
  tokenId = tokenId || 'main';
  snippet = snippet || '';
  query = query || '';

  var req = {
    query: query,
    text: snippet,
    plainText: '',
    url: pageUrl,
    relatedNotesResultSpec: {
      includeTitle: true,
      includeUpdated: true,
      includeAttributes: true,
      includeNotebookGuid: true
    }
  };

  return getAuthToken(tokenId)
  .then(function(authToken) {
     var noteStoreExtra = getNoteStoreExtraClient(authToken);
     return noteStoreExtra.getFilingRecommendations(authToken.token, req);
  }).then(function(r){
    r.token = tokenId;
    return r;
  });
}
function fetchFilingRecommendations(pageUrl, snippet, query) {
 // Log.log("Evernote.fetchFilingRecommendations", pageUrl, snippet, query);

  var recommendations = {
    personal: null,
    business: null
  };

  if (getClipDestination() !== ClipDestination.CLOUD) {
    return resolve(recommendations);
  }

  var promise = getFilingRecommendations('main', pageUrl, snippet, query);
  promise = promise.then(function(res) {
    recommendations.personal = res;
  }, function(e) {
    Log.error('personal getFilingRecommendations failed');
    Log.exception(e);
    recommendations.personal = null;
  });
  promise = promise.then(function(){
    return getFilingRecommendations('biz', pageUrl, snippet, query);
  });
  promise = promise.then(function(res) {
    recommendations.business = res;
    return recommendations;
  }, function(e) {
    //Log.error('business getFilingRecommendations failed');
    //Log.exception(e);
    recommendations.business = null;
    return recommendations;
  });
  return promise;
}

function buildSiteQuery(domain) {
  domain = domain.toLowerCase();
  if (domain.startsWith('www.')) {
    domain = domain.substr(4);
  }

  var query = "any: "
      + ["http://", "https://", "http://www.", "https://www."].map(function(prefix){
    return "sourceUrl:" + prefix + domain + "/*";
  }).join(' ');
  return query;
}

function fetchSiteRecommendations(domain) {
  Log.log("Evernote.fetchSiteRecommendations", domain);
  var query = buildSiteQuery(domain);

  var recommendations = {
    personal: null,
    business: null
  };

  var noteFilter = {
      order: 2, // NoteSortOrder.UPDATED
      words: query
  };

  var resultSpec = {
    includeTitle: true,
    includeUpdated: true,
    includeLargestResourceMime: true,
    includeLargestResourceSize: true,
    //includeAttributes: true,
    includeNotebookGuid: true
  };

  var promise = findNotesWithSnippet('main', noteFilter, 10, resultSpec);
  promise = promise.then(function(res) {
    recommendations.personal = res;
  }, function(e) {
    Log.error('personal getFilingRecommendations failed');
    Log.exception(e);
    recommendations.personal = null;
  });
  promise = promise.then(function(){
    return findNotesWithSnippet('biz', noteFilter, 10, resultSpec);
  });
  promise = promise.then(function(res) {
    recommendations.business = res;
    return recommendations;
  }, function(e) {
    Log.error('business getFilingRecommendations failed');
    Log.exception(e);
    recommendations.business = null;
    return recommendations;
  });
  return promise;

  return findNotesWithSnippet('main', noteFilter, 10, resultSpec)
  .then(function(r){
    recommendations.personal = r;
    return findNotesWithSnippet('biz', noteFilter, 10, resultSpec);
  })
  .then(function(r){
    recommendations.business = r;
    return recommendations;
  });
}

function findNotesWithSnippet(tokenId, noteFilter, maxResults, resultSpec) {
  return getAuthToken(tokenId)
  .then(function(authToken) {
    var noteStoreExtra = getNoteStoreExtraClient(authToken);
    return noteStoreExtra.findNotesWithSnippet(authToken.token, noteFilter, 0, maxResults, resultSpec);
  }).then(function(r){
    r.token = tokenId;
    return r;
  }, function(e){
    Log.error(e.stack);
    Log.exception(e);
    return null;
  });
}

function authenticateToBusiness(tokenId) {
  Log.log("Evernote.authenticateToBusiness", tokenId);
  tokenId = tokenId || 'main';

  function refresh() {
    Log.log("Refreshing biz auth");
    return authenticateToBusiness(tokenId);
  }

  return getAuthToken(tokenId)
      .then(function(authToken) {
              var userStore = getUserStore();
              return userStore.authenticateToBusiness(authToken.token);
            })
      .then(function(authResult) {
              return createAuthToken("biz", authResult, {refresh: refresh, parent: tokenId, primary: true});
            }, function onError(err) {
              //if (error is permanent) {
              err = parseException(err);
              rejectAuthTokenId("biz", err);
              throw err;
            });

}

var listNotebooks = promised(function listNotebooks(authToken) {
  Log.log('Evernote.listNotebooks', authToken.token);
  var client = getNoteStoreClient(authToken);
  return client.listNotebooks(authToken.token).then(null, function(err) {
    err = parseException(err);
    Log.error("Evernote.listNotebooks failed", authToken, err);
    return [];
  });
});

var listLinkedNotebooks = promised(function listLinkedNotebooks(authToken) {
  Log.log('Evernote.listLinkedNotebooks', authToken.token);
  var client = getNoteStoreClient(authToken);
  return client.listLinkedNotebooks(authToken.token).then(null, function(err) {
    err = parseException(err);
    Log.error("Evernote.listLinkedNotebooks failed", authToken, err);
    return [];
  });
});

var processNotebooks = promised(function processNotebooks(authToken, nbs, options) {
  //Log.log('Evernote.processNotebooks', authToken.id, nbs, options);
  var result = [];
  for (var i = 0; i < nbs.length; i++) {
    let processed = createNotebook(authToken, nbs[i], options);
    if (processed) {
      result.push(processed);
    }
  }
  return all(result);
});

var processLinkedNotebooks = promised(function processLinkedNotebooks(authToken, nbs, options) {
  Log.log('Evernote.processLinkedNotebooks'/*, authToken, nbs, options*/);
  var result = [];
  for (var i = 0; i < nbs.length; i++) {
    let nb = nbs[i];
    let processed = processLinked(authToken, nb, options);
    if (processed) {
      result.push(processed);
    }
  }
  return all(result);
});

var processLinked = promised(function processLinked(authToken, linkedNb, options) {
  var tokenId = authToken.id;

  function refresh() {
    return getAuthToken(tokenId)
        .then(function(authToken) {
                var client = getNoteStoreClient(authToken);
                return client.authenticateToSharedNotebook(shareKey, authToken.token);
              });
  }

  Log.log('Evernote processLinked'/*, authToken, linkedNb*/);
  Log.log('==========');
  Log.log('guid:', linkedNb.guid);
  Log.log('name:', linkedNb.name);
  Log.log('stack:', linkedNb.stack);
  Log.log('businessId:', linkedNb.businessId);
  Log.log('source token:', authToken.id);

  Log.log('user:', linkedNb.username);
  Log.log('shard:', linkedNb.shardId);
  Log.log('RPC:', linkedNb.noteStoreUrl);
  Log.log('secret key:', linkedNb.shareKey);
  Log.log('URI:', linkedNb.uri);
  Log.log('==========');
  Log.log();
  var shareKey = linkedNb.shareKey;
  if (!shareKey) {
    Log.error('Notebook has no shared key', linkedNb);
    return null;
  }
  var url = linkedNb.noteStoreUrl || authToken.noteStoreUrl;
  var client = getNoteStoreClientForUrl(url);
  var sharedClient = null;
  var sharedAuthToken = null;
  var sharedNb = null;
  var fullNb = null;
  var businessId = authToken.businessId;

  //Log.log("authenticateToSharedNotebook", shareKey, authToken.token);
  var op = ["authenticateToSharedNotebook", url, shareKey, authToken.token];

  return client.authenticateToSharedNotebook(shareKey, authToken.token)
      .then(function(authResult) {
              //Log.log('authenticateToSharedNotebook', authResult);
              var newId = "shared-" + linkedNb.guid;
              var newToken = createAuthToken(newId, authResult, { primary: false, refresh: refresh, parent: authToken, shareToken: true });
              newToken.businessId = businessId;
              return newToken;
            })
      .then(function(sharedAuth) {
              sharedAuthToken = sharedAuth;
              sharedClient = getNoteStoreClient(sharedAuthToken);
              op = ["getSharedNotebookByAuth", sharedAuth.noteStoreUrl, sharedAuth.token];
              return sharedClient.getSharedNotebookByAuth(sharedAuthToken.token)
                  .then(function(nb) {
                          sharedNb = nb;
                          var notebookGuid = sharedNb.notebookGuid
                          //Log.log("getSharedNotebookByAuth", sharedNb);
                          op = ["getNotebook", sharedAuthToken.noteStoreUrl, sharedAuthToken.token, notebookGuid];
                          return sharedClient.getNotebook(sharedAuthToken.token, notebookGuid)
                              .then(function(nb) {
                                      //Log.log("getNotebook", nb);
                                      fullNb = nb;
                                      return createLinkedNotebook(sharedAuthToken, linkedNb, sharedNb, fullNb);
                                    });
                        });
            })
      .then(null, function(err) {
              Log.error("getSharedNotebookByAuth error", op);
              Log.exception(err);
              return null;
            });
});

var storeNotebooks = promised(function storeNotebooks(personal, linked) {
  Log.log('Evernote.storeNotebooks', personal, linked);

  var result = [];
  if (personal) {
    result = result.concat(personal);
  }

  if (linked) {
    result = result.concat(linked);
  }

  result = result.filter(function(nb) {
    return !!nb;
  });

  return result;

});

function registerNotebook(notebook) {
  gNotebookData = gNotebookData || {};
  gNotebookData[notebook.guid] = notebook;
}

function clearNotebookData(cacheTtl) {
  cacheTtl = cacheTtl || 60 * 60 * 1000;
  gNotebookDataExpiration = +new Date() + cacheTtl;
  gNotebookData = {};
}

function getNotebookByGuid(guid) {
  if (!guid) return null;

  if (!gNotebookData) {
    return null;
  }

  if (!(guid in gNotebookData)) {
    Log.error('guid:', guid);
    Log.error('getNotebookByGuid: available notebooks', Object.getOwnPropertyNames(gNotebookData));
    return null;
  }

  return gNotebookData[guid]
}

function createLinkedNotebook(authToken, linkedNotebook, sharedNotebook, fullNotebook, options) {
  Log.log('createLinkedNotebook');
//  Log.log('Auth=', authToken);
//  Log.log('Linked=',linkedNotebook);
//  Log.log('Shared=',sharedNotebook);
//  Log.log('Full=',fullNotebook);

  options = options || {};
  if (!sharedNotebook.notebookModifiable && !options.showReadOnly) {
    return null;
  }

//  Log.log('Linked Notebook created');
//  Log.log('guid:', sharedNotebook.notebookGuid);
//  Log.log('token:', authToken.id);
//  Log.log('name:', linkedNotebook.shareName);
//  Log.log('stack:', linkedNotebook.stack || fullNotebook.stack);
//  Log.log('Linked businessId:', linkedNotebook.businessId, '(' + authToken.businessId + ')');
//  Log.log('Shared businessId:', sharedNotebook.businessId);
//  Log.log('Full businessId:', fullNotebook.businessId);
//
//  Log.log('linked:', true);
//  Log.log('created:', new Date(fullNotebook.serviceCreated));
//  Log.log('modified:', new Date(fullNotebook.serviceUpdated));
//  Log.log('email:', sharedNotebook.email, fullNotebook.contact && fullNotebook.contact.email);
//  Log.log('default:', fullNotebook.defaultNotebook);
//  Log.log('readOnly:', !sharedNotebook.notebookModifiable);
//  Log.log('==========');
//  Log.log();

  var notebook = {
    guid: sharedNotebook.notebookGuid,
    linkedGuid: linkedNotebook.guid,
    token: authToken.id,
    name: linkedNotebook.shareName,

    linked: true,
    business: linkedNotebook.businessId && linkedNotebook.businessId == authToken.businessId,

    stack: linkedNotebook.stack || fullNotebook.stack,

    username: linkedNotebook.username || sharedNotebook.username,
    created: fullNotebook.serviceCreated,
    modified: fullNotebook.serviceUpdated,
    email: sharedNotebook.email,
    readOnly: !sharedNotebook.notebookModifiable,
    defaultNotebook: fullNotebook.defaultNotebook,
  };
  if (fullNotebook.contact) {
    if (fullNotebook.contact.name) {
      notebook.fullName = fullNotebook.contact.name;
    }
    if (fullNotebook.contact.username) {
      notebook.username = fullNotebook.contact.username;
    }
    if (fullNotebook.contact.email) {
      notebook.email = fullNotebook.contact.email;
    }
  }
  Log.log("-----------");
  Log.log(notebook);
  Log.log("-----------");
  registerNotebook(notebook);

  return notebook;
}

function createNotebook(authToken, nb, options) {
  Log.log('createNotebook');
  if (!nb) return null;

  options = options || {};

//  Log.log('==========');
//  Log.log('Notebook created');
//  Log.log('guid:', nb.guid);
//  Log.log('token:', authToken.id);
//  Log.log('name:', nb.name);
//  Log.log('stack:', nb.stack);
//  Log.log('businessId:', nb.businessId, '(' + authToken.businessId + ')');
//  Log.log('linked:', false);
//  Log.log('created:', new Date(nb.serviceCreated));
//  Log.log('modified:', new Date(nb.serviceUpdated));
//  Log.log('default:', nb.defaultNotebook);
//  Log.log('readOnly:', nb.restrictions.noCreateNotes);
//  Log.log('==========');
//  Log.log();

  if (nb.restrictions && nb.restrictions.noCreateNotes && !options.showReadOnly) {
    Log.error("Notebook is Read only!");
    return null;
  }
  var notebook = {
    guid: nb.guid,
    token: authToken.id || "main",
    name: nb.name,

    linked: false,
    business: nb.businessId && nb.businessId == authToken.businessId,
    stack: nb.stack,
    created: nb.serviceCreated,
    modified: nb.serviceUpdated,
    defaultNotebook: nb.defaultNotebook,
  };

  registerNotebook(notebook);
  return notebook;
}

var createUpdateInfo = promised(function createUpdateInfo(notebooks) {
  Log.log("createUpdateInfo");

  return {
    notebooks: notebooks,
  };
});

/*** External API ***/
function init() {
  Log.log("Evernote.init");
  Native.init().then(function(isLoaded) {
    nativeLoaded = isLoaded;
  });
  Prefs.on('clipDestination', function() {
    nativeLoaded = Native.isLoaded();
    emit(exports, 'clipDestination', getClipDestination());
  });
}

function login(info) {
  //Log.log("Evernote.login");
  //Log.log('========');
  //Log.log("username:", info.user.username);
  //Log.log("authenticationToken:", info.authenticationToken);
  //Log.log("expiration:", info.expiration);
  //Log.log("premium:", info.user.premiumInfo);
  //Log.log("shard:", info.user.shardId);
  //Log.log("full name:", info.user.name || info.user.username);
  //Log.log("email:", info.user.email);
  //Log.log("quota:", info.user.accounting.uploadLimit);
  //Log.log("month end:", info.user.accounting.uploadLimitEnd);
  //Log.log("businessUserInfo:", info.user.businessUserInfo);
  //Log.log('========');
  //Log.log();

  if (!info) {
    throw new Error("Null user info");
  }
  if (info.secondFactorRequired) {
    throw new Error("2ND factor required");
  }
  Metrics.appEvent('Account', 'sign_in');

  userInfo = info.user;

  createAuthToken("main", info, { primary: true });

  return authenticateToBusiness("main");
  //return resolve(userInfo);
}

function logout() {
  Log.log("Evernote.logout");
  if (userInfo) {
    // notify everybody of logout
    userInfo = null;
    gAuthTokens = {};
    Metrics.appEvent('Account', 'sign_out');
  }
  gTempTokenExpiration = 0;
  gTempTokenPromise = null;

  clearNotebookData();
}

function getUserName() {
  if (!userInfo) {
    return null;
  }
  return userInfo.name || userInfo.username;
}

function updateNotebooks() {
  Log.log("Evernote.updateNotebooks");

  var dst = getClipDestination();
  Log.log("Evernote.updateNotebooks", dst);

  if (dst === ClipDestination.CLOUD) {
    return updateNotebooksFromCloud();
  } else if (dst === ClipDestination.FILE) {
    return updateNotebooksFromFile();
  } else if (dst === ClipDestination.NATIVE) {
    return updateNotebooksFromNative();
  } else {
    Log.error('Clip Destination:' + dst + ' not implmented')
    return reject(new Error("Clip Destination not implemented"));
  }
}

function getNotebookList() {
  var result = [];
  for(var k in gNotebookData) {
    let nb = gNotebookData[k];
    result.push(nb);
  }
  return result;
}

function promiseFinally(promise, finFn) {
  return promise.then(function(x) {
    return finFn(x, null) || x;
  }, function(e) {
    finFn(null, e);
    throw e;
  });
}

function clearDerivedTokens() {
  for(var k in gAuthTokens) {
    let v = gAuthTokens[k];
    if (!v.primary) {
      Log.log('----Token to BE DELETED', gAuthTokens[k].id);
      v.toBeDeleted = true;
    }
  }
}
function flushTokens() {
  for(var k in gAuthTokens) {
    let v = gAuthTokens[k];
    if (v.toBeDeleted) {
      Log.log('----Token DELETING', gAuthTokens[k].id);
      delete  gAuthTokens[k];
    }
  }
}

/**
 * returns promised array of notebook descriptors and selected notebook.
 */
function updateNotebooksFromCloud() {
  try {
    Log.log("Evernote.updateNotebooksFromCloud");
    clearDerivedTokens();
    var personalToken = getAuthToken('main');
    var businessToken = getAuthToken('biz');

    var personalNotebooks = listNotebooks(personalToken);
    personalNotebooks = processNotebooks(personalToken, personalNotebooks, {business: false});

    var linkedNotebooks = listLinkedNotebooks(personalToken);
    linkedNotebooks = processLinkedNotebooks(personalToken, linkedNotebooks);

    var notebooks = storeNotebooks(personalNotebooks, linkedNotebooks).then(function(nbs){
      flushTokens();
      return nbs;
    }, function(e) {
      flushTokens();
      throw e;
    });

    var personalTags = listTags(personalToken);
    var businessTags = listTags(businessToken);
    sortTags(personalTags).then(function(r) {
      //Log.log("personal tags", r);
      tagData.personal = r;
    }, function(err) {
      Log.error(err);
      tagData.personal = [];
    });
    sortTags(businessTags).then(function(r) {
      //Log.log("business tags", r);
      tagData.business = r;
    }, function(err) {
      //Log.error(err);
      tagData.business = [];
    });

    return notebooks;
  } catch(e) {
    Log.exception(e);
  }
}

function updateNotebooksFromFile() {
  tagData.business = tagData.personal = [];
  gNotebookData = {};
  return resolve([]);
}

function updateNotebooksFromNative() {
  tagData.business = tagData.personal = [];
  gNotebookData = {};
  return resolve([]);


  return reject(new Error('updateNotebooksFromNative not implemented'));

}

/**
 * Returns array of tag suggestions based on prefix and selected notebook
 */
function suggestTags(notebook, prefix) {
  Log.log("Evernote.suggestTags", notebook, prefix);
  if (prefix.length == 0) {
    return [];
  }
  var prefixNormalized = prefix.toLowerCase();
  var result = [prefix];

  var tags = tagData.personal;

  if (notebook && notebook.business) {
    Log.log("business tags selected");
    tags = tagData.business
  }
  if (!tags || !tags.length) {
    Log.error('no tags loaded');
    return result;
  }

  var i = bsearch(tags, prefixNormalized);
  var tagCount = tags.length;

  if (i >= tagCount) {
    return result;
  }
  var item = tags[i];
  var itemName = item.name.toLowerCase();
  if (!itemName.startsWith(prefixNormalized)) {
    i++;
    if (i >= tagCount) {
      return result;
    }

    item = tags[i];
    itemName = item.name.toLowerCase()
    if (!itemName.startsWith(prefixNormalized)) {
      return result; // no such prefix
    }
  }
  if (item.name.toLowerCase() !== prefixNormalized) {
    result.push(item.name);
  }

  var j = i + 1;
  while (j < tagCount && tags[j].name.toLowerCase().startsWith(prefixNormalized)) {
    result.push(tags[j++].name);
  }
  return result;
};

function bsearch(sorted, x) {
  //for(var i = 0; i < sorted.length; i++) {
  //  Log.log(i,sorted[i].name);
  //}

  var i = 0;
  var j = sorted.length;

  while (j > i) {
    var k = (i + j) >>> 1;
    var name = sorted[k].name.toLowerCase();
    if (x < name) {
      j = k - 1;
    } else if (x > name) {
      i = k + 1;
    } else {
      i = j = k;
    }
  }
  return i;
}

/**
 * Loads tags in background. No callback is provided for now.
 */
function loadTags() {
  var personalToken = getAuthToken('main');
  var businessToken = getAuthToken('biz');

  var personalTags = listTags(personalToken);
  var businessTags = listTags(businessToken);
  sortTags(personalTags).then(function(r) {
    //Log.log("personal tags", r);
    tagData.personal = r;
  }, function(err) {
    Log.error(err);
    tagData.personal = [];
  });
  sortTags(businessTags).then(function(r) {
    //Log.log("business tags", r);
    tagData.business = r;
  }, function(err) {
    //Log.error(err);
    tagData.business = [];
  });

}
var listTags = promised(function listTags(authToken) {
  if (!authToken) {
    return null;
  }
  Log.log('Evernote.listTags', authToken);
  try {
    var client = getNoteStoreClient(authToken);
    return client.listTags(authToken.token)
        .then(function(r) {
                //Log.log("listTags ok", r);
                return r;
              }, function(err) {
                err = parseException(err);
                Log.error("Evernote.listTags failed", err);
                return [];
              });
  }
  catch (e) {
    Log.error("Evernote.listTags failed", err);
    Log.exception(e);
    return reject(e);
  }
});

var sortTags = promised(function sortTags(tags) {
  function tagComparator(a, b) {
    var aname = a.name.toLowerCase();
    var bname = b.name.toLowerCase();
    if (aname > bname) {
      return 1;
    }
    if (aname < bname) {
      return -1;
    }
    return 0;
  }

  tags = tags ? tags.sort(tagComparator) : [];
  //Log.log('storeTags', tags);
  return tags;
});

const NOTE_TAGS_MAX = 100;

function uploadNote(note) {
  var dst = getClipDestination();
  if (dst === ClipDestination.CLOUD) {
    return uploadNoteToCloud(note);
  } else if (dst === ClipDestination.FILE) {
    return uploadNoteToFile(note);
  } else if (dst === ClipDestination.NATIVE) {
    return uploadNoteToNative(note);
  } else {
    return reject(new Error("Clip Destination not implemented"));
  }
}
/**
 * uploads note to an appropriate note server. Derives the note server address from the notebook metadata.
 */
function uploadNoteToCloud(note) {

  if (note.xmlDoc) {
    //note.content = Util.serializeXmlDocument(note.xmlDoc);
    note.xmlDoc = null;
  }

  var guid = note.notebookGuid;
  Log.log("Evernote.uploadNote", guid);

  var tokenId = 'main';
  if (guid) {
    var nb = getNotebookByGuid(guid);
    if (!nb) {
      throw new Error("Notebook " + guid + " not found");
    }
    if (nb.token) {
      tokenId = nb.token;
    }
  }
  else {
    Log.error("No guid in note");
  }
  if (!(note instanceof Note)) {
    return reject(new Error("Must be a Note"));
  }
  if (note.tagNames && note.tagNames.length > NOTE_TAGS_MAX) {
    note.tagNames = note.tagNames.slice(0, NOTE_TAGS_MAX);
  }
  var uploadToken = getAuthToken(tokenId);
  return createNote(uploadToken, note);
}

/**
 * Promised Wrapper around Thrift call to NoteStore.createNote
 */
var createNote = promised(function createNote(authToken, note) {
  //Log.log('Evernote.createNote', authToken, note);
  var client = getNoteStoreClient(authToken);
  return client.createNote(authToken.token, note).then(function(r){
    r['native'] = false;
    return r;
  }, function(err) {
    var parsedErr = parseException(err);
    Log.error("Evernote.createNote failed", parsedErr);
    throw new Error(parsedErr);
  });
});

function getClipFilePath() {
  return OS.Path.join(
      OS.Constants.Path.tmpDir,
      'clip.html'
  );
}

/**
 * Stores attached note resources as data URLs
 *
 * @param note
 * @returns {null|Document} modified XML Document
 */
function embedData(note) {
  var rsrcMap = {};
  note.resources.forEach(function(rsrc){
    var hash = rsrc.hash;
    if (!hash) {
      Log.error("Resource", rsrc, "has no hash");
    }
    rsrcMap[hash] = rsrc;
  });


  var xmlDoc = note.xmlDoc;
  var els = Util.toArray(xmlDoc.querySelectorAll('en-media'));
  els.forEach(function(el) {
    var mime = el.getAttribute('type') || 'text/plain';

    var hash = el.getAttribute('hash');
    if (!hash) {
      el.parentElement.removeChild(el);
      return;
    }
    var rsrc = rsrcMap[hash];
    if (!rsrc) {
      el.parentElement.removeChild(el);
      return;
    }
    Log.info("EN-MEDIA", el.outerHTML);

    var newEl;
    if (mime.startsWith('image/')) {
      newEl = xmlDoc.createElement('img');
      for(var i = 0; i < el.attributes.length; i++) {
        let k = el.attributes[i];
        newEl.setAttribute(k.name, k.value);
      }
    } else {
      // PDF?
      Log.warn("Resource ", hash, " has unsupported mime", mime);
      el.parentElement.removeChild(el);
      return;
    }

    if (!rsrc.data || !rsrc.data.body) {
      Log.warn("Resource ", hash, " has no data");
      if (rsrc.attributes && rsrc.attributes.sourceURL) {
        newEl.setAttribute('src', rsrc.attributes.sourceURL);
      } else {
        Log.warn("Resource ", hash, " has no source");
        el.parentElement.removeChild(el);
        return;
      }
    } else {
      let data = rsrc.data.body;
      let bytes = new Uint8Array(data);
      let b64 = Util.base64encode(bytes);
      let src = 'data:' + mime + ';base64,' + b64;
      newEl.setAttribute('src', src);
    }
    el.parentElement.replaceChild(newEl, el);

  });
  return note.xmlDoc;
}

/**
 * Serialization that produces kind of ok HTML5

 * @param doc ENML document for the note
 * @returns {string|*}
 */
function serializeToHTML5(doc) {
  content = doc.documentElement.outerHTML; //Util.serializeXmlDocument(note.xmlDoc);
  content = content.replace('<en-note', '<div').replace('</en-note>', '</div>');
  content = '<!DOCTYPE html><html><body>'
                + content
      + '</body></html>';
  return content;
}

function uploadNoteToNative(note) {
  Log.log('Evernote.uploadNoteToNative');
  if (Native.saveNoteExSupported()) {
    return Native.saveNoteEx(note).then(function(response){
      return {
        response: response,
        native: true
      };
      // looks smth like
      // <enclipper_response request="add_note />" because XML is still fashionable in some deep jungle forests
    });
  }
  // Wrapper for older saveNote
  var filePath = OS.Path.join(
      OS.Constants.Path.tmpDir,
      'clip.html'
  );
  Log.info(filePath);
  var content = note.content;
  if (note.xmlDoc) {
    let doc = embedData(note);
    content = serializeToHTML5(doc);
    //note.xmlDoc = null;
  }
  return writeFile(filePath, content)
  .then(function(){
    var r = Native.saveNote(note, filePath);
    return {
      response: r,
      native: true
    };
  });
}

function writeFile(filePath, data) {
  Log.log("Evernote.writeFile", filePath);
  var f = File.open(filePath, 'w');
  var deferred = defer();
  try {
    f.writeAsync(data, function(err) {
      if (err) {
        Log.error("Error writing simple storage file: " + filePath);
        deferred.reject(err);
      } else {
        deferred.resolve();
      }
    });
  } catch (err) {
    // writeAsync closes the stream after it's done, so only close on error.
    f.close();
    deferred.reject(err);
  }
  return deferred.promise;
}
function uploadNoteToFile(note) {
  var filePath = OS.Path.join(
      OS.Constants.Path.tmpDir,
      'clip.html'
  );
  return writeFile(filePath, note.content)
}

const ClipDestination = {
  CLOUD: 'cloud',
  NATIVE: 'native',
  FILE: 'file'
};

var nativeLoaded = false;


function setClipDestination(dst) {
  Prefs.prefs.clipDestination = dst;
}

function getClipDestination() {
  if (!nativeLoaded) return ClipDestination.CLOUD;
  return Prefs.prefs.clipDestination;
}

function specialClipSupported(mode) {
  if (mode === 'pdf') {
    if (getClipDestination() == ClipDestination.NATIVE &&
        !Native.saveNoteExSupported()) {
        // PDF can be saved only with SaveNoteEx
        return false;
    }
  }
  return true;
}

function uploadSessionMetrics(sessionCount) {
  var dst = getClipDestination();
  if (dst == ClipDestination.CLOUD) {
    var metrics = new ClientUsageMetrics();
    metrics.sessions = sessionCount;
    return getAuthToken('main')
    .then(function(authToken){
      var client = getNoteStoreClient(authToken);
      return client.getSyncStateWithMetrics(authToken.token, metrics);
    })
    .then(null, function(err) {
      var parsedErr = parseException(err);
      Log.error("Evernote.uploadSessionMetrics failed", parsedErr);
      throw new Error(parsedErr);
    });
  } else {
    // Use the JSON Api
  }
}


function fetchThumbnailWithAuth(token, url) {
  Log.log('Evernote.fetchThumbnailWithAuth', url);
  return getAuthToken(token)
  .then(function(authToken){
    var postData = 'auth=' + encodeURIComponent(authToken.token);
    var fullUrl = Url.getEvernoteUrl(url + '.jpg');
    return Net.sendXhrBinary(postData, fullUrl, {
      method: 'POST',
      mimeType: 'application/x-www-form-urlencoded',
      overrideMimeType: 'text/plain; charset=x-user-defined'
    });
  })
  .then(function(data){
    var bytes = new Uint8Array(data);
    var dataUrl = 'data:image/jpeg;base64,' + Util.base64encode(bytes);
    return dataUrl;
  }, function(e){
    Log.error(e);
    throw e;
  });
}

function openBusinessNoteWithGuid(tokenId, noteGuid) {
  Log.log('Authenticating with token biz');

  return getAuthToken('main')
  .then(function(personalAuthToken){

    var url = Url.getAuthBusinessNotePage(authToken.token, noteGuid, authToken.shardId, authToken.userId);
    Log.log('Opening ', url);
    Tabs.open(url);
  });
}

function openNoteWithGuid(noteGuid, notebookGuid, tokenId) {
  Log.log('Evernote.openNoteWithGuid', noteGuid, notebookGuid);

  if (notebookGuid) {
    let notebook = getNotebookByGuid(notebookGuid);

    if (notebook) {
      tokenId = notebook.token;
      Log.log('Overridden:', tokenId);
    }
  }

  let noteToken = getAuthTokenImmediate(tokenId);
  if (!noteToken) return reject("Token not found")

  Log.log('Authenticating with token ', tokenId);

  return createTempToken()
  .then(function(tempToken){
     var url = Url.getAuthNotePage(tempToken, noteGuid, noteToken.shardId, noteToken.userId);
     Log.log('Opening ', url);
     Tabs.open(url);
  });
}

function openNotebookWithGuid(tokenId, notebookGuid) {
  Log.log('Evernote.openNotebookWithGuid', tokenId, notebookGuid);
  return getAuthToken(tokenId)
  .then(function(authToken){

  });
}

function getDefaultTags() {
  if (!Prefs.prefs.defaultTags) return [];
  var tagStr = Prefs.prefs.defaultTagString;
  return tagStr.split(',').map(function(x){return x.trim()});
}

var gTempTokenPromise = null;
var gTempTokenExpiration = 0;

function createTempToken(tokenId) {

  if (gTempTokenPromise && gTempTokenExpiration > Date.now()) {
    return gTempTokenPromise;
  }
  gTempTokenPromise = null;

  var userStore = getUserStore();
  var authToken = getAuthTokenImmediate('main');
  if (!authToken) {
    return reject('Not authenticated');
  }
  gTempTokenPromise = userStore.createSessionAuthenticationToken(authToken.token)
  .then(function(token){
    gTempToken = token;
    gTempTokenExpiration = Date.now() + 30 * 60 * 1000; // 0.5 hours
    return token;
  }, function(e) {
    Log.error("createSessionAuthenticationToken error", e);
    throw e;
  });
  return gTempTokenPromise;
}

exports.ClipDestination = ClipDestination;
exports.UserStore = UserStore;
exports.NoteStore = NoteStore;
exports.Session = Session;


exports.init = init;
exports.login = login;
exports.logout = logout;
exports.updateNotebooks = updateNotebooks;
exports.uploadNote = uploadNote;
exports.suggestTags = suggestTags;
exports.getUserName = getUserName;
exports.uploadSessionMetrics = uploadSessionMetrics;

exports.getClipDestination = getClipDestination;
exports.setClipDestination = setClipDestination;
exports.specialClipSupported = specialClipSupported;

exports.fetchFilingRecommendations = fetchFilingRecommendations;
exports.getNotebookByGuid = getNotebookByGuid;
exports.fetchThumbnailWithAuth = fetchThumbnailWithAuth;
exports.openNoteWithGuid = openNoteWithGuid;
exports.openBusinessNoteWithGuid = openBusinessNoteWithGuid;

exports.openNotebookWithGuid = openNotebookWithGuid;
exports.fetchSiteRecommendations = fetchSiteRecommendations;
exports.getNotebookList = getNotebookList;
exports.getDefaultTags = getDefaultTags;

exports.createTempToken = createTempToken;

exports.on = on.bind(null, exports);
exports.once = once.bind(null, exports);
exports.off = off.bind(null, exports);

exports.removeListener = function removeListener(type, listener) {
  off(exports, type, listener);
};
