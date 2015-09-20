var AddonWindow = require('sdk/addon/window');
var { emit, on, once, off } = require('sdk/event/core');
var _ = require('sdk/l10n').get;
var l10ndata = require('@l10n/data');
var Prefs = require('sdk/simple-prefs');

const { DOMParser } = AddonWindow.window;
const Data = require('sdk/self').data;
const Sandbox = require('sdk/loader/sandbox');
const { defer, resolve, reject, promised } = require('sdk/core/promise');

var ArticleDetector = require('./article-detector');
var ArticleReformat = require('./article-reformat');
var Async = require('./async');
var Auth = require('./auth');
var Evernote = require('./evernote');
var Log = require('./log');
var Metrics = require('./metrics');
var NoteUtil = require('./note-util');
var DataClipper = require('./data-clipper'); // jshint ignore:line
var PostClip = require('./post-clip'); // jshint ignore:line
var RectSelector = require('./rect-selector');  // jshint ignore:line
var ScreenshotSelector = require('./screenshot-selector');  // jshint ignore:line
var SelectionClipper = require('./selection-clipper'); // jshint ignore:line
var SessionTracker = require('./session-tracker');
var SimSearch = require('./sim-search'); // jshint ignore:line
var Skitch = require('./skitch');
var TabTracker = require('./tracker').TabTracker;
var Xslt = require('./xslt');
var Util = require('./util');

const VEIL_COLOR = 'rgba(0, 0, 0, 0.3)'; //'rgba(128, 128, 128, 0.75)';
const BOX_SHADOW = '0px 0px 1px rgba(0, 0, 0, 0.3)';

const GOOGLE_RE = /^(www\.)?google(\.com|\.ad|\.ae|\.com\.af|\.com\.ag|\.com\.ai|\.al|\.am|\.co\.ao|\.com\.ar|\.as|\.at|\.com\.au|\.az|\.ba|\.com\.bd|\.be|\.bf|\.bg|\.com\.bh|\.bi|\.bj|\.com\.bn|\.com\.bo|\.com\.br|\.bs|\.bt|\.co\.bw|\.by|\.com\.bz|\.ca|\.cd|\.cf|\.cg|\.ch|\.ci|\.co\.ck|\.cl|\.cm|\.cn|\.com\.co|\.co\.cr|\.com\.cu|\.cv|\.com\.cy|\.cz|\.de|\.dj|\.dk|\.dm|\.com\.do|\.dz|\.com\.ec|\.ee|\.com\.eg|\.es|\.com\.et|\.fi|\.com\.fj|\.fm|\.fr|\.ga|\.ge|\.gg|\.com\.gh|\.com\.gi|\.gl|\.gm|\.gp|\.gr|\.com\.gt|\.gy|\.com\.hk|\.hn|\.hr|\.ht|\.hu|\.co\.id|\.ie|\.co\.il|\.im|\.co\.in|\.iq|\.is|\.it|\.je|\.com\.jm|\.jo|\.co\.jp|\.co\.ke|\.com\.kh|\.ki|\.kg|\.co\.kr|\.com\.kw|\.kz|\.la|\.com\.lb|\.li|\.lk|\.co\.ls|\.lt|\.lu|\.lv|\.com\.ly|\.co\.ma|\.md|\.me|\.mg|\.mk|\.ml|\.com\.mm|\.mn|\.ms|\.com\.mt|\.mu|\.mv|\.mw|\.com\.mx|\.com\.my|\.co\.mz|\.com\.na|\.com\.nf|\.com\.ng|\.com\.ni|\.ne|\.nl|\.no|\.com\.np|\.nr|\.nu|\.co\.nz|\.com\.om|\.com\.pa|\.com\.pe|\.com\.pg|\.com\.ph|\.com\.pk|\.pl|\.pn|\.com\.pr|\.ps|\.pt|\.com\.py|\.com\.qa|\.ro|\.ru|\.rw|\.com\.sa|\.com\.sb|\.sc|\.se|\.com\.sg|\.sh|\.si|\.sk|\.com\.sl|\.sn|\.so|\.sm|\.st|\.com\.sv|\.td|\.tg|\.co\.th|\.com\.tj|\.tk|\.tl|\.tm|\.tn|\.to|\.com\.tr|\.tt|\.com\.tw|\.co\.tz|\.com\.ua|\.co\.ug|\.co\.uk|\.com\.uy|\.co\.uz|\.com\.vc|\.co\.ve|\.vg|\.co\.vi|\.com\.vn|\.vu|\.ws|\.rs|\.co\.za|\.co\.zm|\.co\.zw|\.cat)$/;


/*function whiteListElements(root, whiteList) {
  if (!whiteList) { return root; }
  var el = root.cloneNode(false);
  Util.toArray(root.querySelectorAll(whiteList)).forEach(function(e){
    if (e.parentElement) {
      el.appendChild(e.cloneNode(true));
    }
  });
}*/

const WEBSITES = {
  Google: {
    pattern: {
      hostname: GOOGLE_RE
    },
    articleSelector: 'div#rcnt',
    useClearly: false,
    titleFilter: /^(.*)(?: - )/,
  },
};


/**************************************************************
 * Location parsing/handling
 **************************************************************/
const PORTS = {
  'http': 80,
  'https': 443,
  'ftp': 21
};

function parseLocation(loc) {
  if (!loc) {
    return {
      protocol: 'about',
      href: 'about:blank'
    };
  }

  var protocol = loc.protocol || 'http';
  if (protocol.endsWith(':')) {
    protocol = protocol.slice(0, -1);
  }

  if (!(protocol in PORTS)) {
    return {
      protocol: protocol,
      href: loc.href
    };
  }
  var query = loc.search;
  if (query.startsWith('?')) { query = query.substr(1); }
  var queryArgs = {};
  query.split('&').forEach(function(param) {
    if (param === '') { return; }
    var arr = param.split('=');
    var k = unescape(arr.shift());
    var v = unescape(arr.join('='));
    queryArgs[k] = v;
  });

  var filename = undefined; // jshint ignore:line
  if (loc.pathname) {
    let parts = loc.pathname.split('/');
    if (parts.length > 0) {
      filename = parts.pop();
    }
  }

  var hash = loc.hash;
  if (hash.startsWith('?')) { hash = hash.substr(1); }

  var hostname = loc.hostname;
  var domain = hostname;
  if (domain.startsWith('www.')) {
    domain = domain.substr(4);
  }
  var pageLocation = {
    protocol: protocol || 'http',
    hostname: hostname,
    domain: domain,
    pathname: loc.pathname || '/',
    filename: filename,
    query: query,
    queryArgs: queryArgs,
    hash: hash,
    href: loc.href
  };
  pageLocation.port = loc.port || PORTS[pageLocation.protocol] || 0;

  return pageLocation;
}

function matchObj(obj, test) {
  function applyTest(val, cond) {
    Log.log(val);
    if (typeof(cond) === 'function') {
      Log.log('func', cond);
      return !!(cond.call(obj, val));
    }
    if (typeof(cond) === 'object') {
      if (typeof(cond.indexOf) === 'function') {
        Log.log('array',cond);
        return (cond.indexOf(val) >= 0);
      }
      if (typeof(cond.test) === 'function') {
        Log.log('re',cond);
        return cond.test(val);
      }
      Log.log('set',cond);
      return val in cond;
    }
    Log.log('const',cond);
    return val === cond;
  }

  for (var k in test) {
    if (!test.hasOwnProperty(k)) { continue; }
    Log.log(k);
    var t = test[k];
    var v = obj[k];
    if (!v) { return !t; }
    if (!applyTest(v, t)) { return false; }
  }
  return true;
}

function findMatch(val, exprs, defaultExpr) {
  for (var k in exprs) {
    if (!exprs.hasOwnProperty(k)) { continue; }
    let expr = exprs[k];
    Log.log(k,expr);
    if (matchObj(val, expr.pattern)) { Log.log('Matched:', k, expr.pattern); return expr; }
  }
  return defaultExpr;
}

function WebClip(tabInfo) {
  this.tabInfo = tabInfo;
  this.id = tabInfo.id;

  bindAll(this);

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);
  this.detector = this.tabInfo.getInstance('ArticleDetector');
  this.msgBox = this.tabInfo.getInstance('MsgBox');
  this.wantEdit = null;
  this.on('logged-in', this.onLogin);
  this.on('logged-out', this.onLogout);

  /**
   * State of the webclip document.
   * attached = no active webclip document, html source loaded and ready.
   * detached = tab has no document (it was probably discarded)
   * created = webclip document has been created.
   * ready = document can be serialized now
   * saving = in process of serializing data.
   *
   * in case of an error, the document cleans itself up and goes to attached state.
   */
  this.readyState = 'detached';

  /** Source Document we are clipping.*/
  this.document = null;

  /** the working copy of the clipped document. */
  this.article = {};

  Log.info('WebClip ctor: filingInfo cleared');
  this.filingInfo = null;
  this.filingInfoDeferred = null;
  this.filingInfoId = 0; // synchronization counter to avoid writing stale data.

  this.articleDeferred = null;
  /** the Note object containing serialized data for uploading. */

  Auth.on('logged-out', this.onLoggedOut);
}

WebClip.lastClipType = 'article';


WebClip.prototype.onLoggedOut = function() {
  // initialize everything to default
  this.cancel();
};

WebClip.prototype.getToolbar = function() {
  var toolbar = this.tabInfo.getInstance('Toolbar');
  if (!toolbar) {
    throw new ReferenceError('No toolbar ' + this.id);
  }
  return toolbar;
};

WebClip.prototype.onEnterPage = function(/*tab*/) {
  Log.log('WebClip.onEnterPage');
  this.readyState = 'empty';
  this.document = this.tabInfo.contentDocument;
  Log.info('WebClip onEnterPage: filingInfo cleared');

  // TODO:this entire check is a kludge for the case when
  // user launches editor before the page has finished loading.
  // there must be a better way.
  if (this.wantEdit) {
    Log.log('Document loaded... resume note');
    let that = this;
    // TODO: Ugly hack!
    // We cannot guarantee that all enterPage handlers have fired at that point.
    // and thus some editors might be still not initialized.
    require('sdk/timers').setImmediate(function(){
      that.startNote(that.wantEdit);
    });
  }
};

WebClip.prototype.discardFilingInfo = function() {

  // if filing info is still being processed then we don't need it anymore.
  if (this.filingInfoDeferred) {
    this.filingInfoDeferred.reject('discardFilingInfo');
  }
  this.filingInfoDeferred = null;

  this.filingInfoId++; // Invalidate sync counter to prevent writes.
  Log.info('WebClip discardFilingInfo: filingInfo = null');

  this.filingInfo = null;

  if (this.articleDeferred) {
    this.articleDeferred.reject('discardFilingInfo');
  }
  this.articleDeferred = null;
};

WebClip.prototype.onLeavePage = function(tab) {
  this.discardArticle();
  this.readyState = 'detached';
  this.document = null;
  this.urlInfo = null;
  this.discardFilingInfo();
};

WebClip.prototype.onLogin = function() {
  Log.log('WebClip.onLogin');
};

WebClip.prototype.onLogout = function() {
  Log.log('WebClip.onLogout');
  this.discardFilingInfo();
};

WebClip.prototype.discardArticle = function(tab) {
  Log.log('discardArticle');

  this.readyState = 'attached';
  this.selectedElement = null;
  emit(this, 'discarded');
};

/**
 * Article title, if present.
 * @returns {{}|String}
 */
WebClip.prototype.getTitle = function() {
  if (!this.article) {
    Log.error('WebClip.getTitle: article not initialized');
    return '';
  }
  if (this.article.title) {
    return this.article.title;
  }
  this.article.title = this.storeTitle();
  return this.article.title;
};

function bindAll(obj, obj2) {
  obj2 = obj2 || obj;
  for (var k in obj) { // jshint ignore:line
    let v = obj[k];
    if (typeof(v) === 'function') {
      obj[k] = v.bind(obj2);
    }
  }
  return obj;
}

WebClip.prototype.validateDocument = function() {
  try {
    this.document = this.tabInfo.contentDocument;
    return this.document.location.href !== '';
  } catch(e) {
    //Log.exception(e);
    return false;
  }
};

WebClip.prototype.cancel = function() {
  if (this.editor) {
    this.editor.cancel();
    this.editor = null;
  }
  if (this.msgBox) {
    this.msgBox.hide();
  }

  this.article = null;
  this.selectedElement = null;
};

WebClip.prototype.getClipEditor = function(clipType) {
  if (clipType === 'article') {
    return this.tabInfo.getInstance('ArticleSelector');
  } else if (clipType === 'clearly') {
    return this.tabInfo.getInstance('ArticleReformat');
  } else if (clipType === 'url') {
    return this.tabInfo.getInstance('UrlClipper');
  } else if (clipType === 'pdf') {
    return this.tabInfo.getInstance('DataClipper');
  } else if (clipType === 'image') {
    return this.tabInfo.getInstance('DataClipper');
  } else if (clipType === 'audio') {
    return this.tabInfo.getInstance('DataClipper');
  } else if (clipType === 'full') {
    return this.tabInfo.getInstance('FullPageClipper');
  } else if (clipType === 'screenshot') {
    return this.tabInfo.getInstance('ScreenshotSelector');
  } else if (clipType === 'selection') {
    return this.tabInfo.getInstance('SelectionClipper');
  } else {
    throw new Error('Unknown mode ' + clipType);
  }
};

WebClip.prototype.getLastClipType = function() {
  return WebClip.lastClipType;
}

WebClip.prototype.startNote = function(clipType) {
  Log.log('WebClip.startNote', clipType);
  SessionTracker.trackEvent();

  if (!this.validateDocument()) {
    Log.log('Document not loaded yet... waiting');
    this.wantEdit = clipType;
    return false;
  }
  this.wantEdit = null;

  if (this.editor) {
    this.editor.cancel();
    this.editor = null;
  }

  try {
   this.editor = this.getClipEditor(clipType);


   if (!this.editor) {
      throw new ReferenceError('Cannot edit ' + clipType);
    }
    this.clipType = clipType;
  } catch(e) {
    Log.error('startNote failed');
    Log.error(e);
    this.editor = null;
    return false;
  }

 // TODO: move inside a class
  this.options = findMatch(this.getUrlInfo(), WEBSITES, {});

  // create blank document.
  this.article = {
    sourceUrl: this.getUrlInfo(),
    clipType: clipType,
    creationDate: new Date(),
    author: null,

    canonicUrl: null,

    title: '',
    originalTitle: '',
    comment: null,
    notebookGuid: null,

    favIconUrl: null,
    imageData: null,
    snippet: null,
    xmlDocument: null,
  };
  this.article.title = this.article.originalTitle = this.storeTitle();

  this.beginLoadingFilingInfo();

  this.editor.start();

  return true;
};

WebClip.prototype.beginLoadingFilingInfo = function beginLoadingFilingInfo() {
  this.loadFilingInfo(this.detectArticle());
};

WebClip.prototype.getUrlInfo = function() {
  if (this.urlInfo) { return this.urlInfo; }
  var document = this.getDocument();
  if (!document) {
    return {
      href: 'about:blank'
    };
  }

  var location = document.location;

  this.urlInfo = parseLocation(location);
  return this.urlInfo;
};

WebClip.prototype.loadFilingInfo = function(articlePromise) {
  Log.log('WebClip.loadFilingInfo');

  if (this.filingInfo) {
    Log.info('WebClip.loadFilingInfo has filingInfo already:', this.filingInfo);
    return resolve(this.filingInfo);
  }
  if (this.filingInfoDeferred) {
    Log.info('WebClip.loadFilingInfo was already launched but didnt finish');
    return this.filingInfoDeferred.promise;
  }


  this.filingInfoId++; // prevent writes from previous callbacks.
  let fid = this.filingInfoId;
  let deferred = this.filingInfoDeferred = defer();

  Log.log('loadFilingInfo started @', fid);

  articlePromise.then(this.processFilingInfo.bind(this), function(e) {
    // failed to extract snippet.
    Log.error('failed to load the snippet', e);
    return this.processFilingInfo(null);
  }.bind(this))
  .then(function(notes) {
    Log.info('@' + fid + ' processFilingInfo returned ', notes);
    if (fid === this.filingInfoId) {
      // lock is valid
      Log.info('@' + fid + ' stored  filingInfo = ', notes);
      this.filingInfo = notes;
      this.filingInfoId++; // prevent further writes.
    } else {
      Log.info('@ '  + fid + ' filingInfo was already stored @', this.filingInfoId);
    }
    Log.info('filingInfo is now Tags:', this.filingInfo.tags, 'notebook:', this.filingInfo.notebook && this.filingInfo.notebook.name);
    deferred.resolve(this.filingInfo);
    return notes;
  }.bind(this), function(e) {
    Log.log('Error in processFilingInfo');
    Log.exception(e);
    deferred.reject(e);
    throw e;
  });
  return deferred.promise;
};

WebClip.prototype.processFilingInfo = function(element) {
  Log.log('WebClip.processFilingInfo @' + this.filingInfoId, element);
  var snippet = '';
  var document = this.getDocument();

  element = element || (document && document.body);
  if (element) {
    snippet = this.getSnippet(element, {removePunctuation: true, noEllipsis: true, maxSize: 5000});
  } else {
    snippet = '';
  }
  Log.log('Snippet found', snippet);

  var location = this.getUrlInfo();
  if (!location) {
    return reject('No document');
  }
  return Evernote.fetchFilingRecommendations(location.href, snippet, '')
  .then(function(recommendation){
     // post processing here.
     var result = {
       tags: [],
       notebook: null,
       notes: [],
     };

     // copy smart tags
     if (recommendation.personal && recommendation.personal.notebook) {
       result.notebook = recommendation.personal.notebook;
     }
     if (recommendation.personal && recommendation.personal.tags && recommendation.personal.tags.list) {
       recommendation.personal.tags.list.forEach(function(tag){
         if (tag.name) {
           result.tags.push(tag.name);
         }
       });
     }
     if (Prefs.prefs.smartFilingBiz && recommendation.business && recommendation.business.notebook) {
       result.notebook = recommendation.business.notebook;
     }

     if (recommendation.business && recommendation.business.tags && recommendation.business.tags.list) {
       recommendation.business.tags.list.forEach(function(tag){
         if (tag.name) {
           result.tags.push(tag.name);
         }
       });
     }

     var notebooks = {};

     function collectNotebooks(rec) {
       if (!rec) { return; }
       if (!rec.containingNotebooks) { return; }
       if (!rec.containingNotebooks.list) { return; }
       rec.containingNotebooks.list.forEach(function(notebook) {
         notebook.token = rec.token;
         notebooks[notebook.guid] = notebook;
       });
     }

     collectNotebooks(recommendation.personal, 'main');
     collectNotebooks(recommendation.business, 'biz');

     function collectNotes(rec, openerToken) {
       if (!rec || !rec.relatedNotes || !rec.relatedNotes.list) {
         //Log.warn('no list of notes found. isbusiness=', isBusiness);
         return [];
       }

       var notes = [];
       rec.relatedNotes.list.forEach(function(n){
         var guid = n.notebookGuid;
         if (!(guid in notebooks)) { return; }

         var notebook = notebooks[guid];

         var note = {
           guid: n.guid,
           notebookGuid: guid,
           title: n.title,
           snippet: n.snippet,
           thumbsquare: n.thumbsquare,
           sourceUrl: n.attributes.sourceURL,
           notebookName: notebook.name || notebook.notebookDisplayName,
           token: rec.token,
           contact: n.attributes.lastEditedBy || n.attributes.author  || notebook.contact || notebook.contactName,
           joined: notebook.hasSharedNotebook,
           openerToken: openerToken,
           timestamp: Math.max(n.updated, n.created),
         };
         notes.push(note);
       });
       return notes;
     }

     var personalNotes = collectNotes(recommendation.personal, false);
     var businessNotes = collectNotes(recommendation.business, true);

     // TODO: ordering heuristic
     result.notes = personalNotes.concat(businessNotes);
     Log.info('WebcClip.processFilingInfo Produced recommendation ', result);
     return result;
  }.bind(this));
};

WebClip.prototype.getFilingInfoPromise = function() {
  Log.log('WebClip.getFilingInfoPromise');
  if (this.filingInfo) {
    Log.info('filingInfo was alreasy set to ', this.filingInfo);
  }
  if (this.filingInfoDeferred) {
    Log.info('loadFilingInfo has already started', this.filingInfo);
    return this.filingInfoDeferred.promise;
  }

  return this.loadFilingInfo(this.detectArticle());

 };

WebClip.prototype.getFilingInfoImmediate = function() {
  return this.filingInfo;
};

WebClip.prototype.getSiteRecommendationsPromise = function(domain) {
  Log.log('WebClip.getSiteRecommendationsPromise', domain);
  return Evernote.fetchSiteRecommendations(domain)
  .then(function(rec){
    if (!rec) { return []; }
    function collectNotes(recs, openerToken) {
      if (!recs) { return []; }
      if (!recs.notes) { return []; }
      if (!recs.notes.list) { return []; }
      var tokenId = recs.token;
      return recs.notes.list.map(function(r) {
        return {
          token: tokenId,
          snippet: r.snippet,
          title: r.title,
          timestamp: Math.max(r.updated, r.created),
          thumbsquare: r.thumbsquare,
          guid: r.guid,
          notebookGuid: r.notebookGuid,
          openerToken: openerToken,
        };
      });
    }

    var personal = collectNotes(rec.personal, 'main');
    var business = collectNotes(rec.business, 'biz');
    var lst = personal.concat(business);
    lst.sort(function(a, b) { return a.timestamp - b.timestamp; });
    return lst;
  });
};

WebClip.prototype.saveNote = function(title, tagNames, notebookGuid, comment) {
  Log.log('WebClip.saveNote', title, tagNames, notebookGuid, comment);
  // returns a Note object.
  if (!this.editor) {
    Log.log('Editor not found');
    return reject(new Error('Article editor not found'));
  }
  if (!this.article) {
    return reject(new Error('Article data not found'));
  }
  this.article.userTitle = title;
  this.article.title = title;
  this.article.tagNames = tagNames;
  this.article.notebookGuid = notebookGuid;
  this.article.comment = comment;

  if (this.clipType === 'article' ||
      this.clipType === 'clearly' ||
      this.clipType === 'url' ||
      this.clipType === 'full') {
    WebClip.lastClipType = this.clipType;
  }

  if (this.editor.saveClip) {
    this.editor.saveClip();
  }

  this.readyState = 'saving';
  Log.log('serializing', this.article.notebookGuid, this.article.tagNames);
  emit(this, 'saving', this.article);

  this.getToolbar().onClipCompleted();
  this.logClippingEvent(this.article.clipType, this.article.sourceUrl.href);

  // why did I add this delay? I don't remember, but it's necessary.
  var promise = Async.delay(10).then(this.serialize.bind(this));

  this.msgBox.show('clipping', this.article.title, {});

  promise = promise.then(function(note) {
    Log.log('Serialization done');
    this.attachMetadata(note);
    this.msgBox.hide();
    Log.log('saved');
    this.editor && this.editor.cancel(); // jshint ignore:line
    this.editor = null;
    return note;
  }.bind(this))
  .then(this.uploadNote.bind(this))
  .then(null, function(e) {
    Log.exception(e);
    this.msgBox.hide();
    this.tabInfo.contentWindow.alert(e);
    Metrics.appEvent('Errors', 'clip_error', this.article.sourceUrl.href);
    if (this.isAuthError(e)) {
      Auth.logout();
    }
    this.article = null;
    throw e;
  }.bind(this))
  .then(this.postClip.bind(this));

  return promise;
};

/**
 * Serializes the current Article into a (promised) Note
 * @returns {*} promise of serialized Note
 */
WebClip.prototype.serialize = function() {

  if (this.editor && this.editor.serialize) {
    Log.log('custom serialization');
    return this.editor.serialize(this);
  }
  return reject(new Error('Article serialization not implemented'));
};

WebClip.prototype.isAuthError = function(e) {
  Log.log('isAuthError', e);
  if (e && typeof(e) === 'object') {
    if ('message' in e) {
      var msg = e.message;
      if (msg === 'EXPIRED_AUTHENTICATION_TOKEN' || msg === 'INVALID_AUTHENTICATION_TOKEN') {
        return true;
      }
    }
  }
  return false;
};

WebClip.prototype.logClippingEvent = function(clipType, url) {
  SessionTracker.trackEvent();

  switch(clipType) {
    case 'article':
      Metrics.appEvent('Clip', 'article', url);
      break;
    case 'clearly':
      Metrics.appEvent('Clip', 'clearly', url);
      break;
    case 'full':
      Metrics.appEvent('Clip', 'full_page', url);
      break;
    case 'url':
      Metrics.appEvent('Clip', 'url', url);
      break;
    case 'screenshot':
      Metrics.appEvent('Clip', 'skitch', url);
      break;
    case 'selection':
      Metrics.appEvent('Clip', 'selection', url);
      break;
    case 'pdf':
      Metrics.appEvent('Clip', 'pdf', url);
      break;
    case 'image':
      Metrics.appEvent('Clip', 'image', url);
      break;
  }
};

/**
 * Get the document object for the web page displayed in the tab.
 * @param fullyLoaded return null if the document is not fully loaded.
 * @returns {Document|null}
 */
WebClip.prototype.getDocument = function(fullyLoaded) {
  var tab = this.tabInfo.tab;
  var window = Util.getTabWindow(tab);
  if (!window) {
    Log.warn('No tab window');
    return null;
  }
  var document = window.document;
  if (!document) {
    Log.error('No tab document');
    return null;
  }
  return document;
};

WebClip.prototype.clipSelectionImmediate = function() {
  Log.log('WebClip.clipSelectionImmediate');
  var document = this.getDocument();
  if (!document) { return reject('No document'); }

  var el = document.documentElement;
  this.clipElementImmediate(el, false);
};

WebClip.prototype.clipUrlImmediate = function() {
  Log.log('WebClip.clipUrlImmediate');

  var document = this.getDocument();
  if (!document) { return reject('No document'); }

  this.beginClipImmediate(document, 'url');
  WebClip.lastClipType = 'url';

  this.msgBox.show('clipping', this.article.title, {});

  var note = NoteUtil.createNote();

  var that = this;

  function getFaviconRsrcPromise() {
    var p = that.getFavIconUrl();
    p = p.then(function(url) {
      return NoteUtil.loadImageData(url, 16, 16);
    });
    p = p.then(null, function(e){
      Log.error('getFaviconPromise failed', e);
      return NoteUtil.loadImageData(Data.url(DEFAULT_FAVICON_URL), 16, 16);
    });
    return p;
  }

  function getThumbnailRsrc() {
    var thumbnailUrl = that.getThumbnailUrl();
    if (thumbnailUrl && thumbnailUrl.startsWith('data:')) {
      return resolve(NoteUtil.dataUrlToResource(thumbnailUrl));
    }
    return reject('failed to take thumbnail');
  }

  var templatePromise = Util.loadXmlDocument(Data.url('bookmark-tmpl2.xml'), false);

  var articlePromise = this.detectArticle();

  var faviconUrlPromise = getFaviconRsrcPromise();

  var thumbNailRsrc = getThumbnailRsrc();

  this.loadFilingInfo(articlePromise);

  var createXmlPromise = promised(function(tmpl, article, favicon, thumbnail){

    note.resources.push(favicon.resource);
    note.resources.push(thumbnail.resource);

    var mapping = {
      title: that.storeTitle(document),
      url: that.article.sourceUrl.href,
      snippet: that.getSnippet(article),
      faviconHash: favicon.hash,
      faviconMime: favicon.resource.mime,
      hash: thumbnail.hash,
      mime: thumbnail.resource.mime
    };

    return Xslt.processTemplate(tmpl, mapping, {
      replaceOriginal: true
    });
  });

  var p = createXmlPromise(templatePromise, articlePromise, faviconUrlPromise, thumbNailRsrc);
  p = p.then(function(outputDoc){
    note.xmlDoc = outputDoc;
    note.content = Util.serializeXmlDocument(outputDoc);
    return note;
  });
  p = p.then(function(note) {
    Log.log('Serialization done');
    this.attachMetadata(note);
    return note;
  }.bind(this));
  p = p.then(this.uploadNote.bind(this));
  p = p.then(function(r) {
    this.msgBox.hide();
    return r;
  }.bind(this), function(e) {
    Log.exception(e);
    this.msgBox.hide();
    var tab = this.tabInfo.tab;
    var window = Util.getTabWindow(tab);
    window.alert(e);

    Metrics.appEvent('Errors', 'clip_error', this.article.sourceUrl.href);
    if (this.isAuthError(e)) {
      Auth.logout();
    }
    throw e;
  }.bind(this))
  .then(this.postClip.bind(this));

  return p;
};

WebClip.prototype.clipScreenshotImmediate = function() {
  Log.log('WebClip.clipScreenshotImmediate');

  var document = this.getDocument();
  if (!document) { return reject('No document'); }

  this.beginClipImmediate(document, 'screenshot');

  this.msgBox.show('clipping', this.article.title, {});

  var note = NoteUtil.createNote();

  var that = this;

  function getThumbnailPromise() {
    var thumbnailUrl = that.getScreenshotUrl();
    if (thumbnailUrl && thumbnailUrl.startsWith('data:')) {
      return resolve(NoteUtil.dataUrlToResource(thumbnailUrl));
    }
    return reject('failed to take thumbnail');
  }

  var templatePromise = Util.loadXmlDocument(Data.url('screenshot-tmpl.xml'), false);

  var thumbNailPromise = getThumbnailPromise();

  var createXmlPromise = promised(function(tmpl, thumbnail){

    note.resources.push(thumbnail.resource);

    var mapping = {
      title: that.storeTitle(document),
      url: that.article.sourceUrl.href,
      hash: thumbnail.hash,
      mime: thumbnail.resource.mime
    };

    return Xslt.processTemplate(tmpl, mapping, {
      replaceOriginal: true
    });
  });

  var p = createXmlPromise(templatePromise, thumbNailPromise);
  p = p.then(function(outputDoc){
    note.xmlDoc = outputDoc;
    note.content = Util.serializeXmlDocument(outputDoc);
    Log.log(note.content);
    return note;
  });
  p = p.then(function(note) {
    Log.log('Serialization done');
    this.attachMetadata(note);
    return note;
  }.bind(this));
  p = p.then(this.uploadNote.bind(this));
  p = p.then(function(r) {
    this.msgBox.hide();
    return r;
  }.bind(this), function(e) {
    Log.exception(e);
    this.msgBox.hide();
    var window = Util.getTabWindow(this.tabInfo.tab);
    window.alert(e);
    Metrics.appEvent('Errors', 'clip_error', this.article.sourceUrl.href);
    if (this.isAuthError(e)) {
      Auth.logout();
    }
    throw e;
  }.bind(this))
  .then(this.postClip.bind(this));

  return p;
};

WebClip.prototype.clipFullPageImmediate = function() {
  var document = this.getDocument();
  if (!document) { return reject('No document'); }

  var el = document.documentElement;
  this.clipElementImmediate(el, true);
  WebClip.lastClipType = 'full';
};

WebClip.prototype.beginClipImmediate = function(document, clipType) {

  // cancel out of the previous editor
  this.getToolbar().close();

  this.urlInfo = parseLocation(document.location);
  // TODO: move inside a class
  this.options = findMatch(this.urlInfo, WEBSITES, {});

  // create blank document.
  this.article = {
    sourceUrl: this.urlInfo,
    clipType: clipType,
    creationDate: new Date(),
    author: null,
    canonicUrl: null,
    comment: null,
    notebookGuid: null,
    favIconUrl: null,
    imageData: null,
    snippet: null,
    xmlDocument: null,
    title: this.storeTitle()
  };
  this.logClippingEvent(this.article.clipType, this.article.sourceUrl.href);

  var articlePromise = this.detectArticle();

  this.loadFilingInfo(articlePromise);
};

WebClip.prototype.clipElementImmediate = function(rootElement, ignoreSelection) {
  var document = rootElement.ownerDocument;

  this.beginClipImmediate(document, 'article');

  this.readyState = 'saving';
  Log.log('serializing');

  var promise;
  this.msgBox.show('clipping', this.article.title, {});

  promise = Xslt.serialize(document, {
    title: this.article.title,
    tagNames: [],
    comment: null,
    selectedElement: rootElement,
    ignoreSelection: ignoreSelection,
    output: 'enml',
    debug: false,
    styles: true,
    pseudoElements: true,
    removeDefaults: true,
    clipDestination: Evernote.getClipDestination(),
  });

  promise = promise.then(function(note) {
    Log.log('Serialization done');
    this.attachMetadata(note);
    return note;
  }.bind(this))
  .then(this.uploadNote.bind(this))
  .then(function(r) {
    this.msgBox.hide();
    return r;
  }.bind(this), function(e) {
    Log.exception(e);
    this.msgBox.hide();
    this.tabInfo.contentWindow.alert(e);
    Metrics.appEvent('Errors', 'clip_error', this.article.sourceUrl.href);
    if (this.isAuthError(e)) {
      Auth.logout();
    }
    throw e;
  }.bind(this))
  .then(this.postClip.bind(this));

  return promise;
};

WebClip.prototype.sendNote = function(note) {
    Log.log('Serialization done');
    this.attachMetadata(note);
    var p = this.uploadNote(note);
    p = p.then(function(r) {
      this.msgBox.hide();
      return r;
    }.bind(this), function(e) {
      Log.exception(e);
      this.msgBox.hide();
      this.tabInfo.contentWindow.alert(e);
      Metrics.appEvent('Errors', 'clip_error', this.article.sourceUrl.href);
      if (this.isAuthError(e)) {
        Auth.logout();
      }
      throw e;
    }.bind(this))
    .then(this.postClip.bind(this));

  return p;
};

WebClip.prototype.clipDataImmediate = function(src, mime, fileName, title) {
  var document = this.getDocument();
  if (!document) { return reject('No document'); }

  var clipType = (mime === 'application/pdf') ? 'clip_pdf' : 'clip_image';
  this.beginClipImmediate(document, clipType);

  this.article.title = title;

  this.msgBox.show('clipping', this.article.title, {});

  var dataClipper = TabTracker.getInstance('DataClipper', this.tab);
  var promise = dataClipper.clipImmediate(src, mime, fileName, title);
  promise = promise.then(this.sendNote.bind(this));
  return promise;
};

const PUNCTUATION = '[\\-_\u2013\u2014\u00B7' +
                    '\\(\\)\\[\\]\\{\\}\u300A\u300B' +
                    '\uFF08\uFF09\u3010\u3011\u300C\u300D\u00BB' +
                    '.!:;\"\',?\u3002' +
                    '\u3001\uFF01\uFF0C\uFF1A\u2026\u201C\u201D' +
                    '@#$%\\^&\\*\\+=`~' +
                    '/\\\\|><\u25CF]';
const PUNCTUATION_RE = new RegExp(PUNCTUATION, 'g');

/**
 * Extracts a snippet of text from an element.
 * @param element an element to get text from
 * @param options extraction options.
 * @returns {string} snippet
 */
WebClip.prototype.getSnippet = function(element, options) {

  function blackListElements(root, blackList) {
    if (!root) {
      Log.log('root is NULL');
      return null;
    }
    if (!blackList) { return root; }

    if (root.nodeType !== 1) { return root; }

    var el = root.cloneNode(true);
    Util.toArray(el.querySelectorAll(blackList)).forEach(function(e){
      if (e.parentElement) {
        e.parentElement.removeChild(e);
      }
    });

    return el;
  }

  function insertSpaces(root) {
    var document = root.ownerDocument;
    Util.toArray(root.querySelectorAll('*')).forEach(function(el){
      if (el.firstChild) {
        var txtNode1 = document.createTextNode(' ');
        el.insertBefore(txtNode1, el.firstChild);
      }
      var txtNode2 = document.createTextNode(' ');
      el.appendChild(txtNode2);
    });

  }

  options = options || this.options || {};

  Log.log('WebClip.getSnippet',element);
  if (!element) {
    let document = this.getDocument();
    if (!document) { return; }
    element = document.body;
  }

  var text = '';
  while(element) {
    // extract text from html
    let cleanedEl = blackListElements(element, BAD_TAGS);
    insertSpaces(cleanedEl);
    text = cleanedEl.textContent;
    if (options.removePunctuation) {
      text = text.replace(PUNCTUATION_RE, ' ');
    }
    text = text.replace(/\s+/gm, ' ').trim();

    if (text.length > 0) {
      Log.log('OK');
      break;
    }
    // Mis-assigned element. Try going up a level.
    element = element.parentElement;
  }
  var maxSize = ('maxSize' in options) ? options.maxSize : MAX_SNIPPET_SIZE;

  if (text.length > maxSize) {
    text = text.substr(0, maxSize);
    if (!options.noEllipsis) {
      text += '\u2026';
    }
  }
  return text;
};

WebClip.prototype.trimTitle = function(title) {
  title = title || '';
  title = title.replace(/\s+/g, ' ');
  title = title
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '\'')
        .replace(/&#039;/g, '\"');

  title = title.trim();
  if (title.length === 0) {
    title = _('quickNote_untitledNote');
  } else if (title.length > 255) {
    title = title.substr(0,255);
  }
  return title;
};

/**
 * Writes clip properties into the Note object.
 */
WebClip.prototype.attachMetadata = function(note) {
  note.title = this.trimTitle(this.article.title);
  if (this.article.sourceUrl && this.article.sourceUrl.href) {
    note.attributes.sourceURL = this.article.sourceUrl.href;
  }
  note.attributes.sourceApplication = 'WebClipper for Firefox';
  note.tagNames = this.article.tagNames;
  note.notebookGuid = this.article.notebookGuid;
  if (!note.notebookGuid) {
    Log.warn('no notebookGuid');
  }
  return note;
};

/**
 * Deduce the clip type that will be selected at first when the webclipper is invoked.
 *
 */
WebClip.prototype.getStartingClipType = function getStartingClipType() {
  return 'article';
};

WebClip.prototype.uploadNote = function(note) {
  Log.log('WebClip.uploadNote', note);
  if (!note) {
    return reject(new Error('No note generated'));
  }

  this.msgBox.show('syncing', this.article.title, {});
  return Evernote.uploadNote(note, this.article.notebookGuid)
  .then(function(r){
    Log.log('uploadNote ok');
    this.msgBox.hide();
    emit(this, 'uploaded', r);
    return r;
  }.bind(this));
};

WebClip.prototype.postClip = function(r) {
  //Log.log('WebClip.postClip', r);
  if (r.native) {
    Log.log('Clipped to native');
    return;
  }
  var guid = r.guid;
  var nbGuid = r.notebookGuid;

  var title = r.title;
  if (!guid && !title) {
    Log.error('Invalid server response', r);
    throw new Error('Invalid server response');
  }

  var notebook = nbGuid && Evernote.getNotebookByGuid(nbGuid);
  if (!notebook) {
    // notebook data was not loaded, in which case we use default data.

  }

  var urlInfo = this.getUrlInfo();
  if (!urlInfo) {
    Log.error('Failed find the page document object');
    throw new Error('No document');
  }

  Log.log('Note:', title);
  Log.log('Clipped to notebook:', notebook);

  this.tabInfo.getInstance('PostClip').start({
    noteGuid: guid,
    title: title,
    notebook: notebook,
    urlInfo: urlInfo
  });
};


/**
 * Returns (a promise of) the dom element chosen by Clearly.
 * Also stores other data calculated by clearly
 */
WebClip.prototype.detectArticle = function() {
  if (this.articleDeferred) {
    return this.articleDeferred.promise;
  }
  var deferred = this.articleDeferred = defer();

  this.detector.fetchArticle().then(function(pageInfo){
    deferred.resolve(pageInfo.selectedElement);
  });

  return this.articleDeferred.promise;
};


/** Asynchronously retrieves the favIcon Url */
WebClip.prototype.getFavIconUrl = function() {
  var tab = this.tabInfo.tab;
  return require('sdk/places/favicon').getFavicon(tab)
  .then(null, function(e) {
     return Data.url(DEFAULT_FAVICON_URL);
  });
};

/** Synchronously retrieves thumbnail url */
WebClip.prototype.getThumbnailUrl = function() {
  return this.tabInfo.tab.getThumbnail();
};

WebClip.prototype.getScreenshotUrl = function() {
  var document = this.getDocument();
  if (!document) { throw new Error('No document'); }

  var window = document.defaultView;
  var {scrollX, scrollY, innerWidth, innerHeight} = window;

  var canvasEl = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
  canvasEl.mozOpaque = true;
  canvasEl.width = innerWidth;
  canvasEl.height = innerHeight;

  let ctx = canvasEl.getContext('2d');

  ctx.drawWindow(window, scrollX, scrollY, innerWidth, innerHeight, 'rgb(255,255,255)');
  Log.log('SCREENSHOT:',scrollX, scrollY, innerWidth, innerHeight);
  return canvasEl.toDataURL();
};


WebClip.prototype.storeArticleElementBasic = function() {
  var document = this.getDocument();
  if (!document) {
    return false;
  }

  var topElement = document.body || document.documentElement;
  this.selectedElement = topElement;

  if (this.options.articleSelector) {
    var el = document.querySelector(this.options.articleSelector);
    if (el) { this.selectedElement = el; }
  }
  return this.selectedElement;
};

WebClip.prototype.storeTitle = function(document) {
  document = document || this.getDocument();
  if (!document) {
    return false;
  }

  // possibly by applying a custom dom selector
  var title = null;

  if (this.options) {
      if (this.options.titleSelector) {
        let titleEl = document.querySelector(this.options.titleSelector);
        if (titleEl) { title = titleEl.textContent; }
      }
  }

  title = title || document.title;
  title = title || this.tabInfo.tab.title;

  // Clean up the data.
  title = title.trim();

  if (this.options) {
    var filter = this.options.titleFilter;
    if (filter) {
      let m = filter.exec(title);
      title = m ? m[1] : title;
    }
  }

  title = this.trimTitle(title);
  Log.log('Final version:', title);

  return title;
};


WebClip.prototype.removeElements = function(srcEl, selector) {
  if (!selector) { return srcEl; }
  var dstEl = srcEl.cloneNode(true);
  Util.toArray(dstEl.querySelectorAll(selector)).forEach(function(el){
    if (el.parentElement) {
      el.parentElement.removeChild(el);
    }
  });
  return dstEl;
};

WebClip.prototype.hide = function() {
  Log.log('hide webclip');
  emit(this, 'hide', this.article);
};

TabTracker.addClass(WebClip, 'WebClip');

function ArticleSelector(tabInfo) {
  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  this.document = null;
  this.article = null;
  this.selectedElement = null;
  this.contentVeil = this.tabInfo.getInstance('ContentVeil');
  this.detector = this.tabInfo.getInstance('ArticleDetector');
  this.clip = this.tabInfo.getInstance('WebClip');

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);


  this.readyState = 'detached';

  this._start = this._start.bind(this);
  this.cancel = this.cancel.bind(this);
  this.finish = this.finish.bind(this);
  this.onDiscarded = this.onDiscarded.bind(this);
  this.onClipSaved = this.onClipSaved.bind(this);
  this.onPrevElement = this.onPrevElement.bind(this);
  this.onNextElement = this.onNextElement.bind(this);

  this.contentVeil.on('finish', this.finish.bind(this));
  this.contentVeil.on('cancel', this.cancel.bind(this));
  this.contentVeil.on('prev-element', this.onPrevElement.bind(this));
  this.contentVeil.on('next-element', this.onNextElement.bind(this));
  this.contentVeil.on('zoom-element', this.onZoomElement.bind(this));


  this.clip.on('discarded', this.onDiscarded);
  this.clip.on('saved', this.onClipSaved);

}

ArticleSelector.prototype.start = function() {
  Log.log('ArticleSelector.start', this.id);

  this.clip = this.tabInfo.getInstance('WebClip');

  this.readyState = 'loading';
  this.article = this.clip.article;

  var selectedNodePromise = this.clip.detectArticle();

  // if we want to start with current selection:
  //var selectedNode = this.getSelectedNode();
  //if (!selectedNode) {
  //  Log.log('Empty selection');
  //  selectedNode = this.clip.detectArticle();
  //}

  var p = this._start(selectedNodePromise);

  p = p.then(null, function(e) {
    Log.warn(e);
    this.cancel();
    throw e;
  }.bind(this));
  return p;
};

ArticleSelector.prototype.getSelectedNode = function() {
  Log.info('ArticleSelector.getSelectedNode');

  var document = this.tabInfo.contentDocument;
  var window = document.defaultView;

  if (!window) { return null; }

  var selection = window.getSelection();

  if (!selection) { return null; }
  if (selection.isCollapsed || !selection.rangeCount) { return null; }

  var range = selection.getRangeAt(0);
  var container = range.commonAncestorContainer;
  if (container.nodeType === 3) {
    container = container.parentElement;
  }
  Log.info('Found ', container);
  return container;
};

/**
 * Receives a pageInfo structure that contains
 * an automatically detected main element
 */
ArticleSelector.prototype._start = promised(function(selectedElement) {
  Log.log('ArticleSelector._start', selectedElement);

  this.selectedElement = selectedElement;

  this.readyState = 'loaded';
  this.targetDepth = this.measureDepth(this.selectedElement);
  this.currentDepth = this.targetDepth;
  this.contentVeil.show();
  //  Util.enterModalState(this.tabInfo.contentWindow);

  this.readyState = 'viewing';

  this.revealElement(this.selectedElement);
});

ArticleSelector.prototype.serialize = function(clip) {
  Log.log('ArticleSelector.serialize');

  return Xslt.serialize(this.tabInfo.contentDocument, {
    title: clip.article.title,
    tagNames: clip.article.tagNames,
    comment: clip.article.comment,
    selectedElement: this.selectedElement,
    ignoreSelection: true,
    output: 'enml',
    debug: false,
    styles: true,
    pseudoElements: true,
    removeDefaults: true,
    clipDestination: Evernote.getClipDestination(),
  });
};

ArticleSelector.prototype.getArticle = function() {
  return this.selectedElement;
};

ArticleSelector.prototype.getClip = function() {
  return this.tabInfo.getInstance('WebClip');
};

ArticleSelector.prototype.processClearlyInfo = function(pageInfo) {
  if (pageInfo.title) {
    this.article.title = pageInfo.title;
  }
  if (!pageInfo.selectedElement) {
    this.cancel('Element wasn\'t detected');
    throw new Error('Element wasn\'t detected');
  }
  return pageInfo.selectedElement;
};

ArticleSelector.prototype.onEnterPage = function(tab) {
  Log.log('ArticleSelector.onEnterPage', tab.id);
  this.readyState = 'attached';
  this.document = this.tabInfo.contentDocument;
};

ArticleSelector.prototype.onLeavePage = function(tab) {
  Log.log('ArticleSelector.onLeavePage', tab.id);

  this.document = null;
  this.selectedElement = null;
  this.readyState = 'detached';
  //Util.leaveModalState(this.tabInfo.contentWindow);

};

ArticleSelector.prototype.revealElement = function(element, mode) {
  var r = element.getBoundingClientRect();
  this.contentVeil.revealRect(r, mode);
};

ArticleSelector.prototype.cancel = function(e) {
  Log.log('ArticleSelector.cancel');
  this.contentVeil.hide();
 // Util.leaveModalState(this.tabInfo.contentWindow);
  this.selectedElement = null;
  this.readyState = 'aborted';
  emit(this, 'aborted');
};

ArticleSelector.prototype.onDiscarded = function(e) {
  Log.log('ArticleSelector.onDiscarded',e);
  this.contentVeil.hide();
  //Util.leaveModalState(this.tabInfo.contentWindow);
  this.selectedElement = null;
  this.readyState = 'aborted';
  emit(this, 'aborted');
};

ArticleSelector.prototype.finish = function() {
  Log.log('ArticleSelector.finish');
  this.contentVeil.hide();
  //Util.leaveModalState(this.tabInfo.contentWindow);
  emit(this, 'complete', this.selectedElement);
  this.clip.selectedElement = this.selectedElement;
  return this.selectedElement;
};

ArticleSelector.prototype.saveClip = function() {
  Log.log('ArticleSelector.saveClip');
  this.finish();
};

ArticleSelector.prototype.onClipSaved = function(e) {
  Log.log('ArticleSelector.onClipSaved',e);
  this.contentVeil.hide();
  //Util.leaveModalState(this.tabInfo.contentWindow);
};

ArticleSelector.prototype.measureDepth = function(el) {
  var depth = 0;
  while (el && el.parentElement) {
    el = el.parentElement;
    depth++;
  }
  return depth;
};

ArticleSelector.prototype.onZoomElement = function(mode) {
  Log.log('ArticleSelector.onZoomElement', mode);

  if (mode === 'step-in') {
    // select the first available child.
    let el = this.selectedElement;
    el = el.firstChild;
    while (el && this.skipElement(el)) {
      el = el.nextSibling;
    }
    if (el) {
      this.currentDepth++;
      this.targetDepth = this.currentDepth;
      this.selectedElement = el;
    }
    this.revealElement(this.selectedElement, 'down');

  } else if (mode === 'step-out') {
    let el = this.selectedElement;
    el = el.parentElement;
    if (el && !this.skipElement(el)) {
      this.selectedElement = el;
      this.currentDepth--;
      this.targetDepth = this.currentDepth;
      this.revealElement(this.selectedElement, 'up');
    }
  }
};

ArticleSelector.prototype.onPrevElement = function(mode) {
  Log.log('ArticleSelector.onPrevElement', mode);

  if (mode === 'step-over') {
    this.prev(this.targetDepth);
  } else if (mode === 'step-out') {
    // go up one level and make it the maximum
    this.prev(this.currentDepth - 1);
    this.targetDepth = this.currentDepth;
  } else {
    this.prev(0x7FFFFFFF);
    this.targetDepth = this.currentDepth;
  }
  this.revealElement(this.selectedElement, 'up');
};

ArticleSelector.prototype.prev = function(maxDepth) {
  Log.log('ArticleSelector.prev', maxDepth);

    function stepPrev(el) {
      if (!el) { return null; }
      if (el.previousSibling && depth <= maxDepth) {
        el = el.previousSibling;
        while(el.lastChild && depth < maxDepth) {
          el = el.lastChild;
          depth++;
        }
        return el;
      }
      if (el.parentElement) {
        depth--;
        return el.parentElement;
      }
      return null;
    }
    var depth = this.currentDepth;
    var el = this.selectedElement;
    el = stepPrev(el);
    if (!el) { return; }
    while(this.skipElement(el)) {
      el = stepPrev(el);
      if (!el) { return; }
    }
    this.currentDepth = depth;
    this.selectedElement = el;
};

ArticleSelector.prototype.onNextElement = function(mode) {
  Log.log('ArticleSelector.onNextElement ', mode);
  if (mode === 'step-over') {
    this.next(this.targetDepth);
  } else {
    this.next(0x7FFFFFFF);
    this.targetDepth = this.currentDepth;
  }
  this.revealElement(this.selectedElement, 'down');
};

ArticleSelector.prototype.next = function(maxDepth) {
  Log.log('ArticleSelector.next ', maxDepth);
    var depth = this.currentDepth;
    function stepNext(el) {
      if (!el) { return null; }
      if (el.firstChild && depth < maxDepth) {
        depth++;
        return el.firstChild;
      }
      while (el && (!el.nextSibling || depth > maxDepth)) {
        el = el.parentElement;
        depth--;
      }
      if (el && el.nextSibling) { return el.nextSibling; }
      return null;
    }

    var el = this.selectedElement;
    el = stepNext(el);
    if (!el) { return; }
    while(this.skipElement(el)) {
      el = stepNext(el);
      if (!el) { return; }
    }
    this.selectedElement = el;
    this.currentDepth = depth;
};

ArticleSelector.prototype.skipElement = function(el) {
  // non HTML elements.
  if (el.nodeType !== 1) { return true; }
  // our injected element.
  //if (el === backdropEl || el === previewEl || el === decorEl) return true;
  // other injected elements.
  var body = el.ownerDocument.body;
  if (body && !body.contains(el)) { return true; }
  // zero sized elements.
  var rtarget = el.getBoundingClientRect();
  if (rtarget.width <= 0 || rtarget.height <= 0) { return true; }
  // elements that fill entire parent (clip the parent instead).
  if (el.parentElement) {
    var rparent = el.parentElement.getBoundingClientRect();
    if (rparent.top === rtarget.top && rparent.left === rtarget.left &&
        rparent.bottom === rtarget.bottom && rparent.right === rtarget.right) { return true; }
  }
  var style = el.ownerDocument.defaultView.getComputedStyle(el);
  if (!style) { return true; }
  // inline elements and hidden elements.
  var display = style.display;
  if (display === 'inline' || display === 'none') { return true; }
  if (style.visibility === 'hidden') { return true; }
  return false;
};

TabTracker.addClass(ArticleSelector, 'ArticleSelector');

function ContentVeil(info) {
  this.info = info;
  this.id = this.info.id;
  Log.log('ContentVeil', this.info.id);
  this.domId = 'evernote-clip-box'+this.id;
  this.onResize = this.onResize.bind(this);
  this.onScroll = this.onScroll.bind(this);
  this.onKeyDown = this.onKeyDown.bind(this);
  this.onClickPlus = this.onClickPlus.bind(this);
  this.onClickMinus = this.onClickMinus.bind(this);

  this.showing = false;
  this.rect = null;
  this.info.ownerWindow.addEventListener('keydown', this.onKeyDown);
  this.uiElement = this.injectContent();
  //injectContent(this.info.injectRoot, Data.url('content-veil.xml'))
  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);

  this.clip = this.info.getInstance('WebClip');
  this.onClipHidden = this.onClipHidden.bind(this);
  this.clip.on('hide', this.onClipHidden);

}

ContentVeil.prototype.show = function() {
  if (!this.uiElement) { return null; }
  Log.log('ContentVeil.show');
  this.uiElement.style.display = 'block';
  this.showing = true;
};

ContentVeil.prototype.hide = function() {
  this.showing = false;
  Log.log('ContentVeil.hide');
  if (!this.uiElement) { return null; }
  this.uiElement.style.display = 'none';
};

ContentVeil.prototype.onClipHidden = function() {
  this.hide();
};

const INFLATE_BOX = 5;
const SCROLL_MARGINS = 30;
const EXTRA_BORDER = 9999;

ContentVeil.prototype.revealRect = function(r, mode) {
  var window = this.info.browser.contentWindow;
  var {scrollX, scrollY, innerHeight} = window;
  this.rect = {
    left: r.left + scrollX - INFLATE_BOX,
    top: r.top + scrollY - INFLATE_BOX,
    width: r.width + INFLATE_BOX * 2,
    height: r.height + INFLATE_BOX * 2
  };

  let bottom = r.top  + r.height;
  // let right = r.left  + r.width;

  this.update();
  if (mode === 'down') {
    if (r.height + 2*SCROLL_MARGINS > innerHeight) {
      // align bottom
      window.scrollBy(0, bottom - innerHeight + SCROLL_MARGINS);
    } else {
      if (bottom >= innerHeight || bottom < 0) {
        window.scrollBy(0, r.top - SCROLL_MARGINS);
      }
    }
  } else if (mode === 'up') {
    if (r.height + 2*SCROLL_MARGINS > innerHeight) {
      // doesn't fit into the window, align top
      window.scrollBy(0, r.top - SCROLL_MARGINS);
    } else {
      // partially out of view?
      if (r.top < 0 || r.top > innerHeight) {
        // align bottom
        window.scrollBy(0, bottom - innerHeight + SCROLL_MARGINS);
      }
    }
  }
};

ContentVeil.prototype.update = function() {
  if (!this.rect) { return; }
  var box = this.injectContent();
  if (!box) { return; }
  var veil = box.querySelector('.evernote-clip-veil');
  let rect = this.rect;
  var window = this.info.browser.contentWindow;
  var x = rect.left - window.scrollX;
  var y = rect.top - window.scrollY;
  veil.style.left = (-EXTRA_BORDER + x) + 'px';
  veil.style.top = (-EXTRA_BORDER + y) + 'px';
  veil.style.width = (EXTRA_BORDER*2 + this.rect.width) + 'px';
  veil.style.height = (EXTRA_BORDER*2 + this.rect.height) + 'px';
};

ContentVeil.prototype.injectContent = function() {
  var document = this.info.ownerDocument;
  var box = document.getElementById(this.domId);
  if (box) {
    Log.log('ContentVeil.injectContent', this.domId + ' already present');
    return box;
  }
  box = document.createElement('div');
  Util.merge({
      position: 'absolute',
      top: '0px',
      left: '0px',
      right: '0px',
      bottom: '0px',
      overflow: 'hidden',
      display: 'none',
      pointerEvents: 'none'
  }, box.style);
  box.setAttribute('id', this.domId);
  var veil = document.createElement('div');

  Util.merge({
      position: 'absolute',
      padding: '0px',
      margin: '0px',
      top: (-EXTRA_BORDER + 0) + 'px',
      left:  (-EXTRA_BORDER + 0) + 'px',
      width: (EXTRA_BORDER*2 + 0) + 'px',
      height: (EXTRA_BORDER*2 + 0) + 'px',
      borderWidth: EXTRA_BORDER + 'px',
      borderStyle: 'solid',
      borderColor: VEIL_COLOR,
      display: 'block',
  }, veil.style);
  veil.setAttribute('class', 'evernote-clip-veil');
  box.appendChild(veil);
  var frame = document.createElement('box');
  Util.merge({
      position: 'absolute',
      top: '0px',
      bottom: '0px',
      left: '0px',
      right: '0px',
      padding: '0px',
      margin: '0px',
      border: '1px solid #444',
      boxShadow: '0px 1px 2px 0px rgba(0,0,0,0.3), inset 0px 0px 2px 3px rgba(255,255,255,0.7)',
  }, frame.style);
  frame.setAttribute('class', 'evernote-clip-frame');
  veil.appendChild(frame);

  if (1/* top handle*/) {
    let handle1 = document.createElement('box');
    Util.merge({
        position: 'absolute',
        top: '0%',
        left: '50%',
        width: '0px',
        height: '0px'
    }, handle1.style);
    handle1.setAttribute('class', 'evernote-clip-handle-outer');
    let handle2 = document.createElement('box');
    Util.merge({
        position: 'absolute',
        top: '-12px',
        left: '-24px',
        width: '24px',
        height: '24px',
        borderStyle: 'solid',
        borderColor: '#ccc',
        borderWidth: '1px 0px 1px 1px',
        borderRadius: '4px 0px 0px 4px',
        backgroundImage: 'url(\'' + Data.url('images/minus.png') + '\')',
        backgroundColor: '#2f373d',
        backgroundSize: '14px 5px',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        pointerEvents: 'auto',
        MozBoxSizing: 'content-box'
    }, handle2.style);
    handle2.setAttribute('class', 'evernote-clip-handle-inner');
    handle1.appendChild(handle2);
    handle2.addEventListener('click', this.onClickMinus);

    let handle3 = document.createElement('box');
    Util.merge({
        position: 'absolute',
        top: '-12px',
        left: '0px',
        width: '24px',
        height: '24px',
        borderStyle: 'solid',
        borderColor: '#ccc',
        borderWidth: '1px 1px 1px 0px',
        borderRadius: '0px 4px 4px 0px',
        backgroundImage: 'url(\'' + Data.url('images/plus.png') + '\')',
        backgroundColor: '#2f373d',
        backgroundSize: '14px 15px',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        pointerEvents: 'auto',
        MozBoxSizing: 'content-box'
    }, handle3.style);
    handle3.setAttribute('class', 'evernote-clip-handle-inner');
    handle1.appendChild(handle3);
    handle3.addEventListener('click', this.onClickPlus);
    veil.appendChild(handle1);
  }
  if (1/* bottom handle*/) {
    let handle1 = document.createElement('box');
    Util.merge({
        position: 'absolute',
        top: '100%',
        left: '50%',
        width: '0px',
        height: '0px'
    }, handle1.style);
    handle1.setAttribute('class', 'evernote-clip-handle-outer');
    let handle2 = document.createElement('box');
    Util.merge({
       position: 'absolute',
       top: '-12px',
       left: '-24px',
       width: '24px',
       height: '24px',
       borderStyle: 'solid',
       borderColor: '#ccc',
       borderWidth: '1px 0px 1px 1px',
       borderRadius: '4px 0px 0px 4px',
       backgroundImage: 'url(\'' + Data.url('images/minus.png') + '\')',
       backgroundColor: '#2f373d',
       backgroundSize: '14px 5px',
       backgroundPosition: 'center center',
       backgroundRepeat: 'no-repeat',
       pointerEvents: 'auto',
       MozBoxSizing: 'content-box'
    }, handle2.style);
    handle2.setAttribute('class', 'evernote-clip-handle-inner');
    handle1.appendChild(handle2);
    handle2.addEventListener('click', this.onClickMinus);

    let handle3 = document.createElement('box');
    Util.merge({
        position: 'absolute',
        top: '-12px',
        left: '0px',
        width: '24px',
        height: '24px',
        borderStyle: 'solid',
        borderColor: '#ccc',
        borderWidth: '1px 1px 1px 0px',
        borderRadius: '0px 4px 4px 0px',
        backgroundImage: 'url(\'' + Data.url('images/plus.png') + '\')',
        backgroundColor: '#2f373d',
        backgroundSize: '14px 15px',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        pointerEvents: 'auto',
        MozBoxSizing: 'content-box'
    }, handle3.style);
    handle3.setAttribute('class', 'evernote-clip-handle-inner');
    handle1.appendChild(handle3);
    handle3.addEventListener('click', this.onClickPlus);
    veil.appendChild(handle1);
  }

  this.info.injectRoot.appendChild(box);
  for(var i = 0; i < this.info.injectRoot.attributes.length; i++) {
    let attr = this.info.injectRoot.attributes[i];
    Log.log(attr.name, attr.value);
  }
  return box;
};

ContentVeil.prototype.onCloseTab = function(tab) {
  Log.log('ContentVeil.onCloseTab:', tab.id);
  if (this.uiElement) {
    var document = this.info.ownerDocument;
    var box = document.getElementById(this.domId);
    if (box && box.parentElement) {
      box.parentElement.removeChild(box);
    }
    this.uiElement = null;
  }
  this.info.ownerWindow.removeEventListener('keydown', this.onKeyDown);
  var contentWindow = this.info.browser.contentWindow;
  if (contentWindow) {
    contentWindow.removeEventListener('resize', this.onResize);
    contentWindow.removeEventListener('scroll', this.onScroll);
  }

};

ContentVeil.prototype.onEnterPage = function(tab) {
  Log.log('ContentVeil.onEnterPage');
  var contentWindow = this.info.browser.contentWindow;
  var contentDocument =  this.info.browser.contentDocument;
  if (!contentWindow) { return; }
  Log.log('ContentVeil.onEnterPage2',contentDocument.readyState);
  contentWindow.addEventListener('resize', this.onResize);
  contentWindow.addEventListener('scroll', this.onScroll);
  //contentWindow.addEventListener('click', this.onClick);
};

ContentVeil.prototype.onLeavePage = function(tab) {
  Log.log('ContentVeil.onLeavePage');
  var contentWindow = this.info.browser.contentWindow;
  if (!contentWindow) { return; }
  contentWindow.removeEventListener('resize', this.onResize);
  contentWindow.removeEventListener('scroll', this.onScroll);
  //contentWindow.removeEventListener('click', this.onClick);
  this.hide();
};

ContentVeil.prototype.onDiscarded = function() {
  Log.log('ContentVeil.onDiscarded');
  var contentWindow = this.info.browser.contentWindow;
  if (!contentWindow) { return; }
  this.hide();
};

ContentVeil.prototype.onScroll = function(evt) {
  //Log.log('ContentVei.onScroll',this.showing);
  if (!this.showing) { return; }
  this.update();
};

ContentVeil.prototype.onResize = function(evt) {
  //Log.log('ContentVei.onResize',this.showing);
  if (!this.showing) { return; }

  this.update();
};

ContentVeil.prototype.onClickPlus = function(evt) {
  Log.log('ContentVeil.onClickPlus',evt);
  emit(this, 'zoom-element', 'step-out');
};

ContentVeil.prototype.onClickMinus = function(evt) {
  Log.log('ContentVeil.onClickMinus',evt);
  emit(this, 'zoom-element', 'step-in');
};

ContentVeil.prototype.onKeyDown = function(evt) {
  if (!this.info.isActive || !this.showing) { return; }
  //Log.log(this.id+'keydown:' + evt.keyCode);
  //evt.preventDefault();
  switch(evt.keyCode) {
    case 13 /*KeyEvent.DOM_VK_RETURN*/:
      emit(this, 'finish');
      evt.preventDefault();
      evt.stopPropagation();
    break;
    case 27/*KeyEvent.DOM_VK_ESCAPE*/:
      emit(this, 'cancel');
      evt.preventDefault();
      evt.stopPropagation();
    break;
    case 37/*KeyEvent.DOM_VK_LEFT*/:
      if (evt.shiftKey) {
        emit(this, 'prev-element', 'step-in');
      } else {
        emit(this, 'prev-element', 'step-over');
      }
      evt.preventDefault();
      evt.stopPropagation();
    break;
    case 38/*KeyEvent.DOM_VK_DOWN*/:
      /*if (evt.shiftKey) {
        emit(this, 'prev-element', 'step-over');
      } else if (evt.altKey) {
        // go up one level and make it the maximum
        emit(this, 'prev-element', 'step-out');
      } else {
        emit(this, 'prev-element', 'step-in');
      }
      */
      emit(this, 'zoom-element', 'step-out');
      evt.preventDefault();
      evt.stopPropagation();
    break;
    case 39/*KeyEvent.DOM_VK_RIGHT*/:
      if (evt.shiftKey) {
        emit(this, 'next-element', 'step-in');
      } else {
        emit(this, 'next-element', 'step-over');
      }
      evt.preventDefault();
      evt.stopPropagation();
    break;
    case 40 /*KeyEvent.DOM_VK_DOWN*/:
      emit(this, 'zoom-element', 'step-in');
      evt.preventDefault();
      evt.stopPropagation();
    break;
  }
};

TabTracker.addClass(ContentVeil, 'ContentVeil');

const DEFAULT_FAVICON_URL = 'images/favicon32.ico';

function UrlClipper(tabInfo) {

  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  this.detector = this.tabInfo.getInstance('ArticleDetector');
  this.clip = this.tabInfo.getInstance('WebClip');
  this.viewer = this.tabInfo.getInstance('UrlViewer');

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);

  this.cancel = this.cancel.bind(this);
  this.finish = this.finish.bind(this);
  this.onDiscarded = this.onDiscarded.bind(this);
  this.onClipSaved = this.onClipSaved.bind(this);
  this.onClipHidden = this.onClipHidden.bind(this);

  this.clip.on('discarded', this.onDiscarded);
  this.clip.on('saved', this.onClipSaved);
  this.clip.on('hide', this.onClipHidden);

  this.readyState = 'detached';
}

UrlClipper.prototype.start = function() {
  Log.log('UrlClipper.start');
  if (!this.tabInfo.contentDocument) { return; }
  Log.log('Content is ', this.tabInfo.contentDocument.readyState);
  this.readyState = 'loading';
  this.article = this.clip.article;

  return this.clip.detectArticle()
    .then(this.storeSnippet.bind(this))
    .then(this.storeImageUrls.bind(this))
    .then(this.showBookmark.bind(this)) //TODO: Don't show if Clipping from ContextMenu
    .then(null, this.cancel);
};

UrlClipper.prototype.storeImageUrls = function() {
  Log.log('UrlClipper.storeImageUrls');

  var article = this.clip.article;
  var dataUrl = this.tabInfo.tab.getThumbnail();
  this.clip.article.imageData = dataUrl;
  //Log.log('Thumbnail=', this.clip.article);
  return require('sdk/places/favicon').getFavicon(this.tabInfo.tab)
  .then(function(url){

    article.favIconUrl = url;
    Log.log('favicon ' + url);
    return url;
  }).then(null,function(e){
    Log.log('getFavicon failed',JSON.stringify(e));
    Log.exception(e);
    article.favIconUrl = Data.url(DEFAULT_FAVICON_URL);
    // ignore otherwise
    return '';
  });
};

const BAD_TAGS = 'embed,object,param,head,script,noscript,link,meta,style,iframe,textarea,frameset';
const MAX_SNIPPET_SIZE = 512;

UrlClipper.prototype.storeSnippet = function(element) {
  Log.log('UrlClipper.storeSnippet',element);
  var text = this.clip.getSnippet(element);
  Log.log('Snippet = ', text);
  this.clip.article.snippet = text;
  return this.clip.article;
};

UrlClipper.prototype.showBookmark = function(element) {
  Log.log('UrlClipper.showBookmark', this.clip.article);

  this.viewer.insertData(this.clip.article);
  this.viewer.show();
};


UrlClipper.prototype.serialize = function(clip) {
  Log.log('UrlClipper.serialize');
  var note = NoteUtil.createNote();

  function storeFavicon(r) {
    note.resources.push(r.resource);
    mapping.faviconHash = r.hash;
    mapping.faviconMime = r.resource.mime;

    Log.log('Favicon stored', mapping.faviconMime, mapping.faviconHash);
  }

  var mapping = {
    title: clip.article.title,
    url: clip.article.sourceUrl.href,
    snippet: clip.article.snippet,
    favIconUrl: clip.article.favIconUrl,
  };

  if (clip.article.imageData && clip.article.imageData.startsWith('data:')) {
    var {resource, hash} = NoteUtil.dataUrlToResource(clip.article.imageData);
    note.resources.push(resource);
    mapping.hash = hash;
    mapping.mime = resource.mime;
  }
  var p = NoteUtil.loadImageData(clip.article.favIconUrl, 16, 16);
  p = p.then(
    storeFavicon,
    function(e) {
      Log.error('NoteUtil.loadImageData failed', e);
      return NoteUtil.loadImageData(Data.url(DEFAULT_FAVICON_URL), 16, 16)
      .then(storeFavicon);
  });

  p = p.then(function() {
    return Util.loadXmlDocument(Data.url('bookmark-tmpl2.xml'), false);
  });

  return p.then(function(xml){
    var outputDoc = Xslt.processTemplate(xml, mapping, {
      replaceOriginal: true
    });
    Xslt.appendComment(outputDoc, clip.article.comment);
    note.xmlDoc = outputDoc;
    note.content = Util.serializeXmlDocument(outputDoc);

    return note;
  }.bind(this));
};

UrlClipper.prototype.cancel = function(e) {
  Log.log('UrlClipper.cancel');
  this.viewer.hide();
  this.selectedElement = null;
  this.article = null;
  this.readyState = 'attached';
};

UrlClipper.prototype.finish = function() {
  Log.log('UrlClipper.finish');
  this.selectedElement = null;
};

UrlClipper.prototype.onDiscarded = function() {
  Log.log('UrlClipper.onDiscarded');
  this.selectedElement = null;
  this.viewer.hide();
  this.readyState = 'attached';
};

UrlClipper.prototype.onClipHidden = function() {
  Log.log('UrlClipper.onClipHidden');
  this.viewer.hide();
  this.readyState = 'loaded';
};

UrlClipper.prototype.onClipSaved = function() {
  Log.log('UrlClipper.onClipSaved');
  this.viewer.hide();
  this.readyState = 'loaded';
};

UrlClipper.prototype.onEnterPage = function(tab) {
  Log.log('UrlClipper.onEnterPage');
  this.readyState = 'attached';
};

UrlClipper.prototype.onLeavePage = function(tab) {
  Log.log('UrlClipper.onLeavePage');
  this.selectedElement = null;
  this.readyState = 'detached';
};

TabTracker.addClass(UrlClipper, 'UrlClipper');


const XUL_NS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

function UrlViewer(tabInfo) {
  this.tabInfo = tabInfo;
  this.id = this.tabInfo.id;
  this.domId = 'evernote-url-viewer' + this.id;
  Log.log('UrlViewer' + this.tabInfo.id);
  this.onKeyDown = this.onKeyDown.bind(this);
  this.tabInfo.ownerWindow.addEventListener('keydown', this.onKeyDown);
  /**this.uiElements = Util.loadInjection(
    this.tabInfo.injectRoot,
    Data.url('url-viewer.xml'),
    { suffix: this.id }
  );
  **/
  this.clip = this.tabInfo.getInstance('WebClip');

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);
  this.injectContent(this.tabInfo.injectRoot);
}

UrlViewer.prototype.getRootElement = function() {
  var document = this.tabInfo.ownerDocument;
  return document.getElementById(this.domId);
};

UrlViewer.prototype.injectContent = function(root) {
  var document = this.tabInfo.ownerDocument;
  var outerBox = document.createElement('box');
  Util.merge({
    position: 'absolute',
    backgroundColor: VEIL_COLOR,
    pointerEvents: 'none',
    visibility: 'hidden',
    transition: 'opacity 0.3s',
    MozTransition: 'opacity 0.3s',
    opacity: '0',
  }, outerBox.style);
  outerBox.setAttribute('id', this.domId);
  var innerBox = document.createElement('hbox');
  Util.merge({
    position: 'absolute',
    left: '50%',
    top: '50%',
    right: '50%',
    bottom: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  }, innerBox.style);
  outerBox.appendChild(innerBox);

  var iframe = document.createElementNS(XUL_NS, 'iframe'); //doc.createElement('IFRAME');
  Util.merge({
    position: 'relative',
    width: 400 + 'px',
    height: 256 + 'px',
    left: -200 + 'px',
    top: -128 + 'px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    overflow: 'hidden',
    boxShadow: '0px 0px 4px rgba(0, 0, 0, 0.3)',
    pointerEvents: 'none',
  }, iframe.style);

  Util.mergeAttr({
    seamless: true,
    transparent: true,
    src: 'about:blank'
  }, iframe);

  innerBox.appendChild(iframe);
  root.appendChild(outerBox);

  var iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    return;
  }
  iframe.addEventListener('load', function onLoaded(event) {
    iframe.removeEventListener('load', onLoaded, true);
    this.resizeIframe();
  }.bind(this), true);

  iframeWindow.location.href = Data.url('url-preview.html');
};

UrlViewer.prototype.resizeIframe = function() {
  var iframe = this.getRootElement().querySelector('iframe');
  var innerDocument = iframe.contentDocument;
  var el = innerDocument.body;
  var width = el.scrollWidth;
  var height = el.scrollHeight;
  iframe.style.width = width + 'px';
  iframe.style.height = height + 'px';
  iframe.style.left = -(width / 2) + 'px';
  iframe.style.top = -(height / 2) + 'px';
};

UrlViewer.prototype.onKeyDown = function(evt) {
  //if (!this.tabInfo.isActive || !this.showing) return;
};

UrlViewer.prototype.onCloseTab = function(tab) {
  this.tabInfo.ownerWindow.removeEventListener('keydown', this.onKeyDown);
  Log.log('UrlViewer.onCloseTab:', tab.id);
};

UrlViewer.prototype.onEnterPage = function(tab) {
  Log.log('UrlViewer.onEnterPage');
};

UrlViewer.prototype.onLeavePage = function(tab) {
  Log.log('UrlViewer.onLeavePage');
  var contentWindow = this.tabInfo.browser.contentWindow;
  if (!contentWindow) { return; }
  this.hide();
};

UrlViewer.prototype.show = function(article) {
  var topEl = this.getRootElement();
  Log.log('UrlViewer.show');
  if (!topEl) {
    Log.error('UrlViewer.show','Top el is null');
    return;
  }
  Util.merge({
    opacity: '1',
    display: 'block',
    visibility: 'visible',
    left: '0px',
    top: '0px',
    right: '0px',
    bottom: '0px',
    width: '100%',
    height: '100%',
  }, topEl.style);

  var iframe = topEl.querySelector('iframe');
  iframe.style.pointerEvents = 'auto';

  this.showing = true;
  emit(this, 'show');
  this.resizeIframe();
};

UrlViewer.prototype.hide = function() {
  var topEl = this.getRootElement();
  if (!topEl) { return; }

  Util.merge({
    opacity: '0',
    visibility: 'hidden',
    left: '0px',
    top: '0px',
    right: 'auto',
    bottom: 'auto',
    width: '0px',
    height: '0px',
  }, topEl.style);

  topEl.style.opacity = '0';
  topEl.style.pointerEvents = 'none';
  var iframe = topEl.querySelector('iframe');
  iframe.style.pointerEvents = 'none';
  this.showing = false;
  emit(this,'hide');
};

UrlViewer.prototype.insertData = function(article) {
  // Move to content script?
  var iframe = this.getRootElement().querySelector('iframe');
  var innerDocument = iframe.contentDocument;

  if (article.title) {
    innerDocument.querySelector('#title').textContent = article.title;
  } else {
    innerDocument.querySelector('#title').textContent = _('Untitled');
  }
  Log.log('title inserted', innerDocument.querySelector('#title').textContent);

  if (article.favIconUrl) {
    innerDocument.querySelector('#favicon').style.visibility = 'visible';
    innerDocument.querySelector('#favicon').src = article.favIconUrl;
  } else {
    innerDocument.querySelector('#favicon').style.visibility = 'hidden';
  }
  Log.log('favicon inserted', article.favIconUrl);
  if (article.imageData) {
    innerDocument.querySelector('#thumbnail').style.visibility = 'visible';
    innerDocument.querySelector('#thumbnail').src = article.imageData;
  } else {
    innerDocument.querySelector('#thumbnail').style.visibility = 'hidden';
  }
  //Log.log('thumbnail inserted', article.imageData);

  innerDocument.querySelector('#url').textContent = article.sourceUrl.href;
  innerDocument.querySelector('#url').href = article.sourceUrl.href;
  innerDocument.querySelector('#url').target = '__blank';

  Log.log('Snippet inserted', article.snippet);
  innerDocument.querySelector('#snippet').textContent = article.snippet || '';
  this.resizeIframe();
};

TabTracker.addClass(UrlViewer, 'UrlViewer');

function FullPageClipper(tabInfo) {

  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  this.clip = this.tabInfo.getInstance('WebClip');
  //this.viewer = this.tabInfo.getInstance('UrlViewer');
  this.showing = false;

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);

  this.cancel = this.cancel.bind(this);
  this.finish = this.finish.bind(this);
  this.onDiscarded = this.onDiscarded.bind(this);
  this.onClipSaved = this.onClipSaved.bind(this);
  this.onClipHidden = this.onClipHidden.bind(this);

  this.clip.on('discarded', this.onDiscarded);
  this.clip.on('saved', this.onClipSaved);
  this.clip.on('hide', this.onClipHidden);

  this.readyState = 'detached';
}

FullPageClipper.prototype.start = function() {
  Log.log('FullPageClipper.start');

  this.readyState = 'loading';
  this.article = this.clip.article;
  this.article.selectedElement = null;
  this.show();
};

FullPageClipper.prototype.serialize= function(clip) {
  Log.log('FullPageClipper.serialize', clip);
  return Xslt.serialize(this.tabInfo.contentDocument, {
    title: clip.article.title,
    tagNames: clip.article.tagNames,
    comment: clip.article.comment,
    selectedElement: null,
    ignoreSelection: true,
    output: 'enml',
    debug: false,
    styles: true,
    pseudoElements: true,
    removeDefaults: true,
    clipDestination: Evernote.getClipDestination(),
  }).then(function(note){
    return note;
  }.bind(this));
};

FullPageClipper.prototype.show = function(element) {
  Log.log('FullPageClipper.show');
  var browser = this.tabInfo.browser;

  browser.style.boxShadow = '0px 0px 0px 10px #33CC78';
  browser.style.MozTransition = 'all 0.2s ease-in';
  browser.style.MozTransform = 'scale(0.99)';
  this.showing = true;
};

FullPageClipper.prototype.hide = function(element) {
  var browser = this.tabInfo.browser;

  Log.log('FullPageClipper.hide');
  Util.merge({
    transform: 'none',
    MozTransform: 'none',
    transition: 'none',
    MozTransition: 'none',
    border: 'none',
    boxShadow: 'none',
  }, browser.style);
  this.showing = false;
};


FullPageClipper.prototype.cancel = function(e) {
  this.hide();
  Log.log('FullPageClipper.cancel');
  Log.exception(e);
  this.readyState = 'attached';
};

FullPageClipper.prototype.finish = function() {
  Log.log('FullPageClipper.finish');
};

FullPageClipper.prototype.onDiscarded = function() {
  Log.log('FullPageClipper.onDiscarded');
  this.hide();
  this.readyState = 'attached';
};

FullPageClipper.prototype.onClipHidden = function() {
  Log.log('FullPageClipper.onClipHidden');
  this.hide();
  this.readyState = 'loaded';
};

FullPageClipper.prototype.onClipSaved = function() {
  Log.log('FullPageClipper.onClipSaved');
  this.hide();
  this.readyState = 'loaded';
};

FullPageClipper.prototype.onEnterPage = function(tab) {
  Log.log('FullPageClipper.onEnterPage');
  this.readyState = 'attached';
};

FullPageClipper.prototype.onLeavePage = function(tab) {
  Log.log('FullPageClipper.onLeavePage');
  this.hide();
  this.readyState = 'detached';
};

TabTracker.addClass(FullPageClipper, 'FullPageClipper');

/**
 * Message box
 */
function MsgBox(tabInfo) {

  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  this.domId = 'evernote-message-box' + this.id;
  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);

  this.cancel = this.cancel.bind(this);

  this.readyState = 'detached';
  this.injectContent();
}

MsgBox.prototype.injectContent = function() {
  var parent = this.tabInfo.injectRoot;
  var document = parent.ownerDocument;
  var box = document.createElement('box');
    Util.merge({
    position: 'absolute',
    top: '16px',
    left: 'auto',
    bottom: 'auto',
    right: '16px',
    width: '424px',
    height: '80px',
    border: '2px solid rgba(178, 186, 193, 0.6)',
    borderRadius: '2px',
    pointerEvents: 'none',
    overflow: 'hidden',
    opacity: '0',
    zIndex: '200',
  }, box.style);
  Util.mergeAttr({
    id: this.domId,
  }, box);

  var iframe = document.createElementNS(XUL_NS, 'iframe'); //doc.createElement('IFRAME');
  Util.merge({
    position: 'absolute',
    width: '100%',
    height: '100%',
    left: '0px',
    top: '0px',
    backgroundColor: '#fff',
    borderRadius: '2px',
    overflow: 'hidden',
    pointerEvents: 'none',
  }, iframe.style);

  Util.mergeAttr({
    seamless: true,
    transparent: true,
    src: 'about:blank'
  }, iframe);

  box.appendChild(iframe);

  parent.appendChild(box);

  var iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    return;
  }
  iframe.addEventListener('load', function onLoaded(event) {
    iframe.removeEventListener('load', onLoaded, true);
    // do onload
  }.bind(this), true);

  iframeWindow.location.href = Data.url('msg-box.html');

  return box;
};

MsgBox.prototype.show = function(action, title) {
  Log.log('MsgBox.show:', action, title);

  var iframe = this.getIframeElement();
  if (!iframe) {
    throw new Error('Msg panel not found');
  }

  var iframeDoc = iframe.contentDocument;
  var msgEl = iframeDoc.body;
  if (msgEl) {
    // toLowerCase for backward compatibility
    msgEl.setAttribute('action', action.toLowerCase());
  }
  var titleEl = iframeDoc.getElementById('title');
  if (titleEl) {
    titleEl.textContent = title;
  }
  var root = this.getRootElement();
  if (root) {
    root.style.opacity = '1';
    root.style.display = 'block';
  }
  this.showing = true;
};

MsgBox.prototype.hide = function(element) {
  var root = this.getRootElement();
  if (root) {
    root.style.opacity = '0';
  }
  Log.log('MsgBox.hide');
};

MsgBox.prototype.onTabClosed = function() {
  var root = this.getRootElement();
  if (root) {
    root.parentElement.removeChild(root);
  }
};

MsgBox.prototype.getRootElement = function() {
  var parent = this.tabInfo.injectRoot;
  var root = parent.querySelector('#' + this.domId);
  return root;
};

MsgBox.prototype.getIframeElement = function() {
  var parent = this.tabInfo.injectRoot;
  var iframe = parent.querySelector('#' + this.domId+' iframe');
  return iframe;
};

MsgBox.prototype.cancel = function(e) {
  this.hide();
  Log.log('MsgBox.cancel');
  Log.exception(e);
  this.readyState = 'attached';
};

MsgBox.prototype.onEnterPage = function(tab) {
  Log.log('MsgBox.onEnterPage');
  this.readyState = 'attached';
};

MsgBox.prototype.onLeavePage = function(tab) {
  Log.log('MsgBox.onLeavePage');
  this.hide();
  this.readyState = 'detached';
};

TabTracker.addClass(MsgBox, 'MsgBox');


exports.parseLocation = parseLocation;
