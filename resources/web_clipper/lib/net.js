const { defer, resolve, reject, promised } = require('sdk/core/promise');
var XMLHttpRequest = require("sdk/net/xhr").XMLHttpRequest;

const Async = require("./async");
const Util  = require("./util");
const Log = require('./log');

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Sends a message to URL and takes the response.
 * @return {promise<string>} text of response or an error
 */

function sendXhr(data, url, options) {
  options = options || {};
  var isData = url.toLowerCase().startsWith('data:');
  var method = options.method || 'POST';
  var mimeType = options.mimeType || 'application/x-www-form-urlencoded';
  var timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  var language = options.language || Util.getLocale();
  var deferred = defer();
  var xhr = new XMLHttpRequest();
  xhr.open(method, url, true);

  xhr.setRequestHeader("Content-type", mimeType);
  xhr.setRequestHeader("Accept-Language", language);
  if (options.overrideMimeType) {
    xhr.overrideMimeType(options.overrideMimeType);
  }
  xhr.onerror = function(e) {
    deferred.reject({
        errorType: "NetworkError",
        code: -1,
        message: "No connection"
    });
  };
  xhr.onabort = function(e) {
    Log.error("xhr.onabort");
    deferred.reject({
        errorType: "NetworkAborted",
        code: -1,
        message: "No connection"
    });
  };
  xhr.onload = function() {
    Log.log("readyState=" + xhr.readyState + " xhr.status=" + xhr.status);
    if (xhr.status == 200) {
      if (options.verbose) {
        let d = '' + data;
        d = d.substr(0, 24);
        Log.info("("+url+")", d);
        Log.info('xhr.responseText=[',xhr.responseText, ']');
      }
      if (mimeType == 'text/xml') {
        let xml = xhr.responseXML;
        if (!xml) {
          deferred.reject({
            errorType: "XMLError",
            code: -2,
            message: xhr.responseText
          });
        } else {
          deferred.resolve(xhr.responseXML);
        }
      } else {
        deferred.resolve(xhr.responseText);
      }
    } else {
      deferred.reject({
        errorType: "HTTPError",
        code: xhr.status,
        message: xhr.responseText
      });
    }
  };
  xhr.onreadystatechange = function() {

    if (options.verbose) {
      let d = '' + data;
      d = d.substr(0, 24);
      Log.info("("+url+")", d);
      Log.info("readyState=" + xhr.readyState + " xhr.status=" + xhr.status);
    }
  }

  xhr.send(data);
  return Async.timeout(deferred.promise, timeout);
}

function sendXhrBinary(data, url, options) {
  options = options || {};
  var method = options.method || 'GET';
  var timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  var deferred = defer();
  var xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  if (options.mimeType) {
    xhr.setRequestHeader("Content-type", options.mimeType);
  }
  xhr.overrideMimeType("text/plain; charset=x-user-defined");
  xhr.responseType = "arraybuffer";
  xhr.onerror = function(e) {
    deferred.reject({
        errorType: "NetworkError",
        code: -1,
        message: "No connection"
    });
  };
  xhr.onabort = function(e) {
    Log.error("xhr.onabort");
    deferred.reject({
        errorType: "NetworkAborted",
        code: -1,
        message: "No connection"
    });
  }
  xhr.onload = function() {
    Log.info("readyState=" + xhr.readyState + " xhr.status=" + xhr.status);
    if (xhr.status == 200 || xhr.status === 0 ) {
      Log.info("XHR.response = ", xhr.response);
       deferred.resolve(xhr.response);
    } else {
      deferred.reject({
        errorType: "HTTPError",
        code: xhr.status,
        message: xhr.response
      });
    }
  };

  xhr.send(data);
  return Async.timeout(deferred.promise, timeout);

}

exports.sendXhr = sendXhr;
exports.sendXhrBinary = sendXhrBinary;
