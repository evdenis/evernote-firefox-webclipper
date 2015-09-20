var Settings = require('sdk/simple-prefs').prefs;

const Log = require('./log');
const Metrics = require('./metrics');
const Net = require('./net');
const Url = require('./url');
const Util = require('./util');

function beginRegistration() {
  var url = Url.createUser();
  Log.log('beginRegistration URL=' + url);
  var promise = Net.sendXhr(null, url, {method: 'GET'}).then(function(result){
    Log.log("CAPTCHA\n",result);
    result = JSON.parse(result);
    if (!result.captcha) throw new Error("No captcha returned");
    if (!result.submit) throw new Error("No sumbit link returned");
    result.captcha = Url.getEvernoteUrl(result.captcha);
    result.submit = Url.getEvernoteUrl(result.submit);
    return result;
  }, function(error) {
    Log.error("Error" + JSON.stringify(error));
  });
  return promise;
}

function checkUsernameRemote(user) {
  var url = Url.checkUsername(user);
  var promise = Net.sendXhr(null, url, {method: 'GET'}).then(function(result){
    Log.log("checkUsernameRemote OK:" + url + " " + JSON.stringify(result));
    return result;
  });
  return promise;
}

function checkEmailRemote(email) {
  var url = Url.checkEmail(email);
  var promise = Net.sendXhr(null, url, {method: 'GET'}).then(function(result){
    Log.log("checkEmailRemote OK:" + url + " " + JSON.stringify(result));
    return result;
  });
  return promise;
}

function finishRegistration(url, user, pass, email, captcha) {
  var data = Url.encodeObject({
    "email": email,
    "username": user,
    "password": pass,
    "captcha": captcha,
    "code": "Firenote",
    "terms": "true",
    "create": "true"
  });
  return Net.sendXhr(data, url, {method: "POST"})
  .then(function(result){
    Log.log("finishRegistration OK " + url + " " + JSON.stringify(result));
    var resultParsed = JSON.parse(result);
    if (!resultParsed.success) {
      if (resultParsed.errors) {
        throw resultParsed.errors;
      } else {
        throw "generic error";
      }
    }
    Metrics.appEvent('Account', 'create_account');

    return result;
  });
}

exports.beginRegistration = beginRegistration;
exports.checkEmailRemote = checkEmailRemote;
exports.checkUsernameRemote = checkUsernameRemote;
exports.finishRegistration = finishRegistration;
