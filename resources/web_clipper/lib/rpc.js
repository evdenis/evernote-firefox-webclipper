/**
 * Module to support RPC calls to the servers.
 * TODO: merge with ui-dispatch
 * @module
 */


const { defer, resolve, reject, promised } = require('sdk/core/promise');
var XMLHttpRequest = require("sdk/net/xhr").XMLHttpRequest;

const Async = require("./async");
const Log = require('./log');
const Net = require('./net');
const Util = require('./util');

var id = 1;

function isArray(value) {
  return Object.prototype.toString.call(value) === "[object Array]";
}

function unpackResponse(str, req) {
  //Log.log("JSON Received ["+ str + "]");

  var resp = JSON.parse(str);

  if ("result" in resp) {
    Log.log("Received OK");
    return resp.result;
  } else if ("error" in resp) {
    Log.log("Received Error");
    Log.log("REQ=", req);
    Log.log("RESP=", str);

    throw resp.error;
  } else {
    throw new SyntaxError("Invalid JSON response");
  }
}

function packRequest(name, args) {
  var req = {
    id: id++,
    method: name,
    params: args
  };
  return JSON.stringify(req);
}

function Client(options) {
  self = this;

  this.url = options.url;
  this.mimeType = options.mimeType || "text/plain";
  this.method = options.method || "POST";
  this.timeout = options.timeout || 10000;

    this.xhrOpts = {
        method: self.method,
        timeout: self.timeout,
        mimeType: self.mimeType
    };

  /**
   * Creates a function object that calls a remote method with a given name.
   */
  this.remote = function (name) {
    function thunk(/* ... */) {
      var args = Array.prototype.slice.apply(arguments);

      var data = packRequest(name, args);
      Log.log("Remote send to " + self.url + " :[" + data + "]");

      return Net.sendXhr(data, self.url, {
        method: self.method,
        timeout: self.timeout,
        mimeType: self.mimeType,
        verbose: options.verbose
      }).then(function(resp) { return unpackResponse(resp , data); });
    }
    return promised(thunk);
  }
}

Client.method = function(url, name, opts) {
  opts = Util.merge(opts, {
    mimeType: "text/plain",
    method: "Post",
    timeout: 10000});

  function thunk(/* ... */) {
    var args = Util.toArray(arguments);
    var data = packRequest(name, args);
    Log.log("Remote send to " + url + " :" + data);
    return Net.sendXhr(data, url, opts).then(unpackResponse);
  }
  return promised(thunk);

}


exports.Client = Client;
