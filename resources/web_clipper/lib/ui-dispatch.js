const { promised, defer, reject, resolve } = require('sdk/core/promise');
var { emit, on, once, off } = require("sdk/event/core");

const Log = require('./log');
const Util = require('./util');

const EventType = {
  CALL: 'call',
};

function createPort() {
  var target = {};
  target.on = on.bind(null, target);
  target.once = once.bind(null, target);
  target.removeListener = function removeListener(type, listener) {
    off(target, type, listener);
  };
  return target;
}

function log(what, msg) {
  if (0) {
    Log.log(what + ":" + JSON.stringify(msg));
  }
}

function createChannel(port, context, exported) {
  exported = exported || {};
  context = context || exported;
  port = port || null;

  var msgId = 0;

  function invoke(method, args) {
    if (!(method in exported)) {
      Log.error(Object.getOwnPropertyNames(exported));
      Log.error('Unknown method', method);
      return reject(new ReferenceError(method + ' is not defined'));
    }
    var f = exported[method];
    if (typeof(f) !== 'function') {
      return reject(new TypeError(method + ' is not a function' ));
    }
    try{
      return resolve(f.apply(context, args));
    } catch(e) {
      return reject(e);
    }
  }


  function wrapResult(result) {
    return { result: result || null };
  }

  function wrapError(error) {
    var msg = {};
    if (typeof(error) !== 'object') {
      msg.error = {
        name: typeof(error),
        message: error.toString()
      };
    } else {
      msg.error = {
        name: error.name || 'object',
        message: error.message || error.toString(),
      };
    }
    return msg;
  }

  function handler(msg, port) {
    var {key, params, id, replyId} = msg;
    //Log.log("rcv:CALL", msg);
    invoke(key, params).then(wrapResult, wrapError)
    .then(function(replyMsg) {
      replyMsg.id = id;
      //Log.log(replyId, replyMsg);
      if (port) {
        port.emit(replyId, replyMsg);
      }
    });
  }

  function attach(p) {
    if (p) {
      p.on('call', function(msg) {
        handler(msg, p);
      });
    }
    port = p;
  }

  function detach() {
    if (port) {
      port.removeListener('call', handler);
    }
    port = null;
  }

  function transport(req) {
    var deferred = defer();

    if (!port) {
      return reject(new Error('Channel disconnected'));
    }

    req.id = ++msgId;
    req.replyId = 'return-' + req.id;

    port.once(req.replyId, function(resp) {
      Log.log("MAIN Return", req.key, resp);
      if ('result' in resp) { deferred.resolve(resp.result); }
      else if ('error' in resp) { deferred.reject(resp.error); }
      else {
        Log.error('MAIN Empty message');
        Log.error('req:', req);
        Log.error('resp:', resp);
        deferred.reject('Empty message');
      }
    });

    //Log.log("emit:call", req);
    port.emit(EventType.CALL, req);
    return deferred.promise;
  }

  var imported = new Proxy({}, {
    'get': function (oTarget, sKey) {
      return function(/* args */) {

        if (sKey === 'toJSON') {
          return;
        }

        var req = {
          key: sKey,
          params: Array.prototype.slice.apply(arguments),
        };

        //Log.log('Proxy:', sKey);
        Log.log(req);
        return transport(req);
      };
    }
  });

  attach(port);

  return {
    imported: imported,
    exported: exported,
    detach: detach,
    attach: attach,
    getPort: function() {
      return port;
    }
  };
}

function dispatch(port, context, opt_vtable) {
  opt_vtable = opt_vtable || context;
  var handler = function handler(msg) {
    //log("MAIN Received", JSON.stringify(msg));

    var {method, params, id, reply} = msg;
    var promise;
    if (typeof(opt_vtable[method]) === 'function') {
      let bound = promised(opt_vtable[method].bind(context));
      promise = bound.apply(context, params);
    } else {
      Log.error("Unknown method", method);
      return;
    }

    if (reply) {
      // return value back to caller.
      promise.then(function(result) {
        //log("UI-Dispatch " + method, result);
        var replyMsg = {
          id: id,
          result: result || null
        };
        //log("Message sent " + reply, replyMsg);
        port.emit(reply, replyMsg);
      }, function(error) {
        Log.error(error);
        if (error instanceof Error) {
          error = {
            name: error.name,
            message: error.message
          }
        }
        var replyMsg = {
          id: id,
          error: error
        };
        //log("Sent", replyMsg);
        port.emit(reply, replyMsg);
      });
    }
  }
  port.on("message", handler);
  return handler;
}

function remote(port, name) {
  return (function () {
    var req = {
      method: name,
      id: Util.generateId(),
      params: Array.prototype.slice.apply(arguments)
    };
    //log("Page to main (remote): ", req);
    port.emit("message", req);
  });
};

function remoteAsync(port, name) {
  return (function () {
    log("remoteAsync ", name);
    var deferred = defer();
    var id = Util.generateId();
    var reply = name + "-" + id;
    var req = {
      method: name,
      id: id,
      params: Array.prototype.slice.apply(arguments),
      reply: reply
    };

    log("message expected ", reply);
    port.once(reply, function(resp) {
      log("Content received " + reply, resp);
      if ("result" in resp) {
        deferred.resolve(resp.result);
      } else if ("error" in resp) {
        deferred.reject(resp.error);
      } else {
        deferred.resolve(undefined);
      }
    });
    //Log.log("(" + id + ")Page to main sent (async) " + JSON.stringify(req));
    port.emit("message", req);
    return deferred.promise;
  });
};

exports.createPort = createPort;
exports.dispatch = dispatch;
exports.remote = remote;
exports.remoteAsync = remoteAsync;
exports.createChannel = createChannel;
