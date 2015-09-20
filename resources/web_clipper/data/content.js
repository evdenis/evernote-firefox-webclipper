/**
 * Common functionality for content scripts.
 */


var options = self.options;
var gPromise = window['promise/core'];
var Dbg = {};
Dbg.nop = function() {};
Dbg.log = function() {}; //console.log.bind(console);
Dbg.info = Dbg.nop; //console.info.bind(console); //
Dbg.error = console.error.bind(console);
Dbg.warn = console.warn.bind(console);
Dbg.exception = console.exception.bind(console);

var global = this;

if (global.$ === undefined) {
 // A nod to jquery
  global.$ = function(sel) {
    //TODO: cache results
    // Dbg.info("$("+sel+")");
    var el = document.querySelector(sel);
    if (!el) {
      Dbg.error(sel + " Not found");
    }
    return el;
  }
}

/**
 * Common utility class
 */
var Content = (function(){

  function escapeHTML(str) {
    if (!str) { return str; }
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  var localStrings = {};
  var SUBSTITUTE = /\$([\w_]+)\$/g;

  function localize(msg, substitute) {
    //substitute = substitute || options.vars;
    if (options.l10n && msg in options.l10n.hash) {
      msg = options.l10n.hash[msg];
      if (substitute) {
        msg = msg.replace(SUBSTITUTE, function(match, p1, offset, str) {
          if (p1 in substitute) {
            let str = substitute[p1] + '';
            return escapeHTML(str);
          }
          return str;
        });
      }
      return msg;
    }
    return '%' + msg + '%';
  }

  function localizeAttr(root, substitute, attr) {
    var children = root.querySelectorAll('*['+attr+']');
    var elementCount = children.length;
    for (var i = 0; i < elementCount; i++) {
      let child = children[i];

      // translate the child
      let key = child.getAttribute(attr);
      let data = localize(key, substitute);
      if (data) {
        child.setAttribute(attr, data);
        // Dbg.info("LOC." + attr+'='+ key + "=>" + data);
      }
    }
  }

  /** Localize strings in a way that mimics the Chrome API */
  function localizeHtml(root, substitute) {
    root = root || document;
    //Dbg.log('localizeHtml', root);

    // check all translatable children (= w/ a `data-message' attribute)
    var children = root.querySelectorAll('*[data-message]');
    var elementCount = children.length;
    for (var i = 0; i < elementCount; i++) {
      let child = children[i];

      // translate the child
      let key = child.dataset.message;
      let data = localize(key, substitute);
      if (data) {
        child.innerHTML = data;
        //Dbg.info("LOC:" + key + "=>" + data);
      }
    }
    localizeAttr(root, substitute, 'placeholder');
    localizeAttr(root, substitute, 'title');
    localizeAttr(root, substitute, 'alt');
  }

  return {
    localize : localize,
    localizeHtml: localizeHtml
  };
})();
try{

var channel = (function createChannel(port) {
  var exported = {};
  var msgId = 0;

  function invoke(obj, method, args) {
    if (!(method in obj)) {
      Dbg.error("Unknown method", method);
      return gPromise.reject(new ReferenceError(method + " is not defined!"));
    }
    var f = obj[method];
    if (typeof(f) !== 'function') {
      return gPromise.reject(new TypeError(method + " is not a function!"));
    }
    try {
      return gPromise.resolve(f.apply(obj, args));
    } catch(e) {
      return gPromise.reject(e);
    }
  }


  function wrapResult(result) {
    return { result: result || null }
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
      }
    }
    return msg;
  }

  port.on("call", function(msg) {
    var {key, params, id, replyId} = msg;
    Dbg.log("content:rcv:CALL", key);
    invoke(exported, key, params).then(wrapResult, wrapError)
    .then(function(replyMsg) {
      replyMsg.id = id;
      Dbg.log("CONTENT REPLY", replyId, JSON.stringify(replyMsg));
      port.emit(replyId, replyMsg);
    });
  });

  function transport(req) {
    var deferred = gPromise.defer();
    req.id = ++msgId;
    req.replyId = 'return-' + req.id;
    port.once(req.replyId, function(resp) {
      Dbg.log('CONTENT Return', req.replyId);
      deferred.resolve(resp);
    });

    //Dbg.log('emit:call', req);
    port.emit("call", req);
    return deferred.promise;
  }

  var imported = new Proxy({}, {
     'get': function (oTarget, sKey) {
      Dbg.log('get ' + sKey );
      oTarget[sKey] = oTarget[sKey] || function(/* args */) {
        var req = {
          key: sKey,
          params: Array.prototype.slice.apply(arguments),
        };
        return transport(req).then(function(resp) {
          if ('result' in resp) { return resp.result; }
          else if ('error' in resp) { throw resp.error; }
          else {
            Dbg.error('Empty message');
            Dbg.error('req:', req);
            Dbg.error('resp:', resp);
            return undefined;
          }
        });
      }
      return oTarget[sKey];
    }
  });
  return {
    imported: imported,
    exported: exported
  };
})(self.port);

} catch(e) { Dbg.exception(e)}

var Lpc = (function(){
  var id = 0;
  var LpcClient = {};
  var port = self.port;
  LpcClient._msgId = 0;
  LpcClient.remote = function remote(name) {
    return (function () {
      var req = {
        method: name,
        id: id,
        params: Array.prototype.slice.apply(arguments)
      };
      Dbg.log("Page to main (remote): " + JSON.stringify(req));
      port.emit("message", req);
      id++;
    });
  };

  LpcClient.remoteAsync = function methodAsync(name) {
    return (function () {
      var deferred = gPromise.defer();
      var reply = name + "-" + id;
      var req = {
        method: name,
        id: id,
        params: Array.prototype.slice.apply(arguments),
        reply: reply
      };
      id++;

      Dbg.log("message expected " + reply);
      port.once(reply, function(resp) {
        Dbg.log("Content received " + reply + "->" + JSON.stringify(resp));
        if ("result" in resp) {
          Dbg.log("OK");
          deferred.resolve(resp.result);
        } else if ("error" in resp) {
          Dbg.log("FAIL1");
          deferred.reject(resp.error);
        } else {
          deferred.resolve(undefined);
        }
      });
      Dbg.log("(" + id + ")Page to main sent (async) " + JSON.stringify(req));
      port.emit("message", req);
      return deferred.promise;
    });
  };

  var LpcServer = {};

  LpcServer.dispatch = function dispatch(port, context, opt_vtable) {
    Dbg.warn("LpcServer.dispatch is deprecated");
    opt_vtable = opt_vtable || context;
    function handler(msg) {
      //Dbg.log("MAIN Received " + JSON.stringify(msg));

      var {method, params, id, reply} = msg;
      var promise;
      if (typeof(opt_vtable[method]) == 'function') {
        let bound = gPromise.promised(opt_vtable[method].bind(context));
        promise = bound.apply(context, params);
      } else {
        Dbg.log("Unknown method " + method);
        return;
      }

      if (reply) {
        // return value back to caller.
        promise.then(function(result) {
          //Dbg.log("OK " + result);
          var replyMsg = {
            id: id,
            result: result || null
          };
          //Dbg.log("Message sent " + reply + ':' + JSON.stringify(replyMsg));
          port.emit(reply, replyMsg);
        }, function(error) {
          Dbg.log("FAIL " + error);
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
          Dbg.log("Sent " + JSON.stringify(replyMsg));
          port.emit(reply, replyMsg);
        });
      }
    }
    port.on("message", handler);
    return handler;
  }

  return {
    Client: LpcClient,
    Server: LpcServer
  };
})();

var _ = Content.localize;


