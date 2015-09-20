/**
 * Module to support asynchronous execution of tasks.
 * @module
 */

const { setTimeout } = require("sdk/timers");
const { defer, promised, resolve, reject } = require('sdk/core/promise');
require('sdk/core/promise')._reportErrors = true;

const Log = require('./log');

function delay(ms, value) {
  let { promise, resolve } = defer();
  setTimeout(resolve, ms, value);
  return promise;
}

/**
 * Add a timeout to an async function.
 * Example (from Firefox docs):
 * var tweets = readAsync(url);
 * timeout(tweets, 20).then(function(data) {
 *  ui.display(data);
 * }, function() {
 *  console.log('Network is being too slow, try again later');
 * });
 *
 * @param promise promise to be run asynchronously.
 * @param {number} ms number of milliseconds before reject is triggered.
 * @return promise with timeout included.
 */
function timeout(promise, ms) {
  let deferred = defer();
  promise.then(deferred.resolve, deferred.reject);
  delay(ms, 'timeout').then(deferred.reject);
  return deferred.promise;
}

function any(promises) {
  let deferred = defer();
  let count = promises.length;
  let error;
  for(var i = 0; i < promises.length; i++) {

    promises.then(deferred.resolve, function(err) {
      count--;
      if (!count) deferred.reject(err);
    });
  }
  return deferred.promise;
}

// Code that converts callback-based code to a promise-based one
function wrapCallbacks(obj, f) {
  var obj = obj || this;
  function wrapper() {
    var args = Array.prototype.slice.call(arguments, 0);
    return addCallbacks(this, args);
  }
  function addCallbacks(obj, args) {
    var deferred = defer();
    // check that nobody tries async on their own.
    args.push(function(x){ deferred.resolve(x); });
    args.push(function(x){ deferred.reject(x); });

    f.apply(obj, args);
    return deferred.promise;
  }
  return promised(wrapper);
}

function isPromise(p) {
  return typeof(p) == 'object' && typeof(p.then) == 'function';
}

function after(p, fn) {
  return p.then(function(r) {
    fn(r, null);
    return r;
  }, function(e) {
    fn(null, e);
    throw e;
  });
}

function showError(p) {
  return p.then(null, function(e) {
    Log.exception(e);
    throw e;
  })
}

function eatError(p, dflt) {
  return p.then(null, function(e) {
    Log.exception(e);
    return dflt;
  });
}

exports.any = any;
exports.delay = delay;
exports.timeout = timeout;
exports.wrapCallbacks = wrapCallbacks;
exports.after = after;
exports.showError = showError;
exports.eatError = eatError;
