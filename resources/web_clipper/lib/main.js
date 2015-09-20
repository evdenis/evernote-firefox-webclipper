const { merge } = require('sdk/util/object');
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');
var Settings = require('sdk/simple-prefs').prefs;
var Data = require('sdk/self').data;

const Auth = require('./auth');
const Async = require('./async');
const Boot = require('./boot');
const Evernote = require('./evernote');
const Log = require('./log');
const Native = require('./native');
const Metrics = require('./metrics');
const Rpc = require('./rpc');
const UI = require('./ui');

const BOOT_RETRY_TIMEOUT_MS = 60*60*12*1000;

/**
 * Entry point
 */

function main(options, callbacks) {

  Log.init();
  Metrics.init();
  Metrics.event("Main.start", options.loadReason);
  Evernote.init();
  UI.init();
  bootstrap();
}

/**
 * Loads configuration from the server.
 */
function bootstrap() {

  Metrics.event("Main.boot");
  Log.log("bootstrap");
  return Boot.boot(Settings).then(
    function bootOk(result) {
      Log.log("bootOk", result);
      //log(result);
      UI.booted(result);
      Auth.init();
      Metrics.event("Main.boot.ok", "start");
    },
    function bootFailed(err) {
      Log.log("bootFailed", err);
      Metrics.event("Main.boot.failed", "fatal");
      // Notify the user about failure.
      UI.bootFailed(err);
      // Retry in 12 hours;
      return Async.delay(BOOT_RETRY_TIMEOUT_MS).then(bootstrap);
    }
  );
}

/**
 * The add-on was unloaded.
 * @param {string} reason for unloading.
 */
function onUnload(reason) {
  Metrics.event("Main.unload", reason);
  Log.log("onUnload(" + reason + ")");
  if (reason !== 'shutdown') {
    Auth.logout();
  }
  Native.cleanUp();
}

exports.main = main;
exports.onUnload = onUnload;
