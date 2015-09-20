var Prefs = require('sdk/simple-prefs').prefs;

const Boot = require('./boot');
const Util = require('./util');

const ServerAddr = {
  'us-prod': 'www.evernote.com',
  'cn-prod': 'app.yinxiang.com',
  'us-stage': 'stage.evernote.com',
  'cn-stage': 'stage-china.evernote.com'
};

function getEvernoteUrl(path, params) {
  var proto = Boot.getCurrentServiceProto();

  var host = Boot.getCurrentServiceHost();

  path = path || '/';
  if (path[0] !== '/') path = '/' + path;

  var url = proto + host + path;
  if (typeof(params) == 'object') {
    url += '?' + encodeObject(params);
  }
  return url;
}

function encodeObject(obj) {
  var buffer = [];
  for(var k in obj) {
    buffer.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
  }
  return buffer.join('&');
}


function createUser(code) {
  code = code || 'Firenote';
  return getEvernoteUrl(
    '/CreateUserJSON.action',
    {
      'code': code,
      'unique': Util.generateRandomUuid()
    });
}

function checkEmail(email) {
  return getEvernoteUrl(
    '/RegistrationCheck.action',
    {
      'email': email,
      'checkEmail': 'true'
    });
}

function checkUsername(username) {
  return getEvernoteUrl(
    '/RegistrationCheck.action',
    {
      'username': username,
      'checkUsername': 'true'
    });
}

function passwordChangePage(user) {
  return getEvernoteUrl(
    '/Login.action',
    {
      'username': user,
      'targetUrl': '/ChangePassword.action?v1=true'
    });
}

function accountReactivationPage() {
  return getEvernoteUrl('/AccountReactivation.action');
}

function webClientPage(auth) {
  return getEvernoteUrl(
    '/SetAuthToken.action',
    {
      'auth': auth, // Authtoken passed in cleartext??
      'targetUrl': '/Home.action'
    });
}

function twoStepHelpPage(auth) {
  return getEvernoteUrl(
    '/TwoStepHelp.action',
    {
      'auth': auth
    });
}

function homePage() {
  return getEvernoteUrl('/Home.action');
}

function forgotPasswordPage() {
  return getEvernoteUrl('/ForgotPassword.action');
}

function getJsonRpc() {
  return getEvernoteUrl('/json');
}

function getTutorialPage() {
  return getEvernoteUrl('/webclipper/guide');
}

function getUpgradePage() {
  return getEvernoteUrl('/Checkout.action',
    {
      origin: 'clipper-firefox',
      offer: 'settings'
    });
}

function getNotePage(noteGuid) {
  return getEvernoteUrl('/view/notebook/' + noteGuid);
}

function getAuthNotePage(authToken, noteGuid, shardId, userId) {
  var targetUrl = "/shard/" + shardId + "/nl/" + userId + "/" +noteGuid + "/";
  return getEvernoteUrl('SetAuthToken.action', {'auth': authToken, 'targetUrl': targetUrl});
}

function getAuthPersonalNotePage(authToken, noteGuid, shardId, userId) {
  var targetUrl = "/view/notebook/" + noteGuid;
  return getEvernoteUrl('SetAuthToken.action', {'auth': authToken, 'targetUrl': targetUrl});
}

function getAuthBusinessNotePage(authToken, noteGuid, shardId, userId) {
  var targetUrl = "/shard/" + shardId + "/business/dispatch/view/notebook/" + noteGuid;
  //var targetUrl = "/shard/" + shardId + "/view/notebook/" + noteGuid;
  //var targetUrl = "/shard/" + shardId + "/nl/" + userId + "/" +noteGuid + "/";

  return getEvernoteUrl('SetAuthToken.action', {'auth': authToken, 'targetUrl': targetUrl});
}

function getPasswordExpiredPage(userName) {
  return getEvernoteUrl('Login.action', {
    'username': userName,
    'targetUrl': '/ChangePassword.action'
  });
}

exports.encodeObject = encodeObject;
exports.getEvernoteUrl = getEvernoteUrl;

exports.createUser = createUser;
exports.checkEmail = checkEmail;
exports.checkUsername = checkUsername;
exports.accountReactivationPage = accountReactivationPage;
exports.passwordChangePage = passwordChangePage;
exports.webClientPage = webClientPage;
exports.twoStepHelpPage = twoStepHelpPage;
exports.getTutorialPage = getTutorialPage;
exports.homePage = homePage;
exports.forgotPasswordPage = forgotPasswordPage;
exports.getJsonRpc = getJsonRpc;
exports.getUpgradePage = getUpgradePage;
exports.getNotePage = getNotePage;
exports.getAuthNotePage = getAuthNotePage;
exports.getAuthPersonalNotePage = getAuthPersonalNotePage;
exports.getAuthBusinessNotePage = getAuthBusinessNotePage;
exports.getPasswordExpiredPage = getPasswordExpiredPage;
