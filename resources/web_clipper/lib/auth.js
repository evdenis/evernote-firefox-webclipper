//var { emit, on, once, off } = require("sdk/event/core");
var Event = require('sdk/event/core');
const { resolve, reject, defer, promised } = require('sdk/core/promise');
var SimpleStorage = require("sdk/simple-storage").storage;

const Async = require('./async');
const Boot = require('./boot');
var {UserStore, NoteStore, Session} = require('./evernote');
var Evernote = require('./evernote');
var Log = require('./log');
var Metrics = require('./metrics');
const Rpc = require('./rpc');
const Util = require('./util');
const Url = require('./url');

const LOGIN_TIMEOUT_MS = 30000;

var emit = Event.emit.bind(null, exports);

var testIsLoggedIn = false;
var currentUser = null;

const EventType = {
  LOGGED_OUT: 'logged-out',
  LOGGED_IN: 'logged-in',
  TWO_FACTOR: 'two-factor'
};

SimpleStorage.sessions = SimpleStorage.sessions || {};

var sessions = {
  main: null,
  business: null,
  twoFactor: null
};

var users = {
  main: null,
  business: null
};

// If false then UserStore.refreshAuthentication is stubbed to return
// the old auth token

const RELOGIN_ENABLED = false;

function init(serviceHost, options) {
  try {
    options = options || {};
    var url = Url.getJsonRpc();
    Log.log('Auth.init', url);

    UserStore.init(url);

    loadAuth();

    Evernote.on('clipDestination', function(dst) {
      if (dst === Evernote.ClipDestination.CLOUD) {
        if (isLoggedIn()) {
          emit(EventType.LOGGED_IN, sessions.main);
        } else {
          // Clip to cloud but not logged in to cloud.
          Log.warn('Clip Destination set to cloud but not authenticated yet');
          emit(EventType.LOGGED_OUT);
        }
      } else {
        emit(EventType.LOGGED_IN);
      }
    });
  } catch(e) {
    Log.exception(e);
  }
}

// standard cred data:
// cred instance uniqueId,
// cred class uniqueid,
// owner,
// [userId, pass/secret], auth method, url(or resource) to be accessed.
// expiration, usage, datatype, active/inactive/revoked/etc
// descriptor for reach.
// methods:
// constructor
// validator
// serialize toJSON/fromJSON.
// serialize toPassword/fromPassword,

function secondFactorInfo(info) {
  return {
    secondFactorRequired: true,
    authenticationToken: info.authenticationToken,
    secondFactorDeliveryHint: info.secondFactorDeliveryHint,
    // expiration is standard,
    expiration: +(new Date()) - info.currentTime + info.expiration
  };
}

function loginInfo(info) {
  return {
    secondFactorRequired: false,
    authenticationToken: info.authenticationToken,
    username: info.user.username,
    userId: currentUser,
    error: false,
    premium: info.user.premiumInfo || false,
    fullName: info.user.name || info.user.username
  };
}

var USER_EXCEPTION_RE = /^EDAMUserException\(errorCode:([A-Z_]+)\s*,\s*parameter:([\w.]+)\)$/;

function parseException(error) {
  Log.log(error);
  if (typeof(error) != "object") return error;
  if (error === null) return error;
  if (!("trace" in error)) {
    if (error.errorType === 'HTTPError') {
      if (error.code >= 500) {
        return 'SERVICE_NOT_AVAILABLE';
      } else if (error.code === 404) {
        return 'SERVICE_NOT_FOUND'
      }
    }
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
  if (!match) { return error; }
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
    }
    if (parameterName === 'User.active') {
      return 'USER_DEACTIVATED';
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

function loadAuth() {

  if (!SimpleStorage.sessions) {
    Log.log("Nothing to load");
    SimpleStorage.sessions = {};
    return;
  }
  if (SimpleStorage.sessions.main) {

    let info = SimpleStorage.sessions.main;

    //Log.log("Main login " + JSON.stringify(info));

     let session = new Session(info);
    relogin(session).then(function(result){
      successfulLogin(result);
    },function(error){
      Log.log("Error relogin");
      delete SimpleStorage.sessions.main;
      throw parseException(error);
    });

  }
}

//var defaultNoteStore;
function successfulLogin(ses) {
  sessions.main = ses;
  // make sesssion keep state across launches
  SimpleStorage.sessions.main = ses.info;
 // defaultNoteStore = new NoteStore(ses);
  // Notify user that we successfully logged in
  //Log.log("successfulLogin", ses.info);
  Evernote.login(ses.info);
  emit("logged-in", ses.info);
}

function relogin(session) {
  if (!session || !session.validate()) {
    return reject('EXPIRED_AUTHENTICATION_TOKEN');
  }
  if (RELOGIN_ENABLED) {
    return UserStore.refreshAuthentication(session.token)
    .then(function(result){
      return new Session(result);
    },function(error){
      Log.log("Error relogin");
      throw parseException(error);
    });
  } else {
    return resolve(session);
  }
}

function login(user, pass) {
  Log.log('Auth.login', user, pass);
  // also pass Cred objects.
  init();
  var promise = UserStore.authenticateLongSession(
    user,
    pass,
    "en-ff-clipper-xauth-new",
    "ea8ef2ed5aabf10e",
    Util.getUniqueBrowserId(),
    Util.getParsedUserAgent(),
    true)
  .then(function(result) {
    var ses = new Session(result);
    if (result.secondFactorRequired) {
      sessions.twoFactor = ses;
      // Notify user that we need 2nd factor
      // should be a broadcast
      emit(EventType.TWO_FACTOR, ses.info);
      return secondFactorInfo(result);
    } else {
      successfulLogin(ses);
      return loginInfo(result);
    }
  }, function(error) {
    Log.error("Error login", error);
    throw parseException(error);
  });
  return promise;
}

function logout() {
  // have to invalidate all the dependent objects as well
  defaultNoteStore = null;
  SimpleStorage.sessions = {};
  for (var k in sessions) {
    let s = sessions[k];
    s && s.revoke('logout');
  }
  sessions = {};
  Evernote.logout();
  emit(EventType.LOGGED_OUT);
}

function loginTwoFactor(code, auth) {
   // Convert to Cred.
   var session = sessions.twoFactor;
   if (!session || !session.validate()) {
     return reject('EXPIRED_AUTHENTICATION_TOKEN');
   }
   var promise = UserStore.completeTwoFactorAuthentication(
      session.token,
      code,
      Util.getUniqueBrowserId(),
      Util.getParsedUserAgent())
    .then(function(result) {
      var ses = new Session(result);
      successfulLogin(ses);
      return loginInfo(result);
    }, function(error) {
      emit(EventType.LOGGED_OUT);
      Log.log("Error login");
      throw parseException(error);
    });
  return promise;
}

function isLoggedIn() {
  // verify/update session
  return sessions.main && sessions.main.validate();
}

exports.getNoteStore = function() {
  return defaultNoteStore;
}

exports.init = init;
exports.loadAuth = loadAuth;
exports.login = login;
exports.logout = logout;
exports.loginTwoFactor = loginTwoFactor;
exports.isLoggedIn = isLoggedIn;
exports.parseException = parseException;
exports.EventType = EventType;

exports.on = Event.on.bind(null, exports);
exports.once = Event.once.bind(null, exports);
exports.removeListener = function removeListener(type, listener) {
  Event.off(exports, type, listener);
};
