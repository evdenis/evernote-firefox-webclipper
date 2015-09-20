/**
 * Logging module.
 */
const { Cc, Ci, Cr } = require("chrome");
var Env = require('sdk/system/environment').env;
var PreferenceService = require("sdk/preferences/service");
var Prefs = require("sdk/simple-prefs").prefs;

var PlainTextConsole = require("sdk/console/plain-text").PlainTextConsole;
var logBuffer = '';
var gLogLevel = 1;

var con = new PlainTextConsole(print);

function print(msg) {
  dump(msg);
  if (Prefs.storeMemoryLog) {
    logBuffer += msg;
  }
}

var theConsoleListener = {
  observe:function(aMessage) {
    if (Prefs.storeMemoryLog) {
      logBuffer += msg;
    }
  },
  QueryInterface: function (iid) {
	  if (!iid.equals(Ci.nsIConsoleListener) &&
        !iid.equals(Ci.nsISupports)) {
		  throw Cr.NS_ERROR_NO_INTERFACE;
	  }
    return this;
  }
};

/**
 * logs a message to the console.
 */
function log(str) {
  if (gLogLevel  < 3) return;
  dump('LOG ')
  con.log.apply(con, arguments);
}

/**
 * logs a message to the console.
 */
function warn(str) {
  if (gLogLevel  < 2) return;

  dump('WARNING ')
  con.warn.apply(con, arguments);
}

/**
 * logs a message to the console.
 */
function error(/* args */) {
  if (gLogLevel  < 1) return;

  dump('ERROR ');
  con.error.apply(con, arguments);
}

/**
 * logs a message to the console.
 */
function info(args) {
  if (gLogLevel < 4) return;

  dump('INFO ')
  con.info.apply(con, arguments);
}

/**
 * logs a message to the console.
 */
function exception(args) {
  if (gLogLevel  < 1) return;

  con.exception.apply(con, arguments);
}

const LEVELS = {
  'none': 0,
  'error': 1,
  'warn': 2,
  'log': 3,
  'info': 4,
  'all': 10
};
/**
 * initializes console logging.
 */
function init() {
  var level = Env['FIRENOTE_LOGLEVEL'] || 'error';
  level = level.toLowerCase().trim();
  gLogLevel = LEVELS[level]  || 1
  log('Log level set to ', gLogLevel);
}

function trace() {

  function splitAt(str, sym) {
    var x = str.split(sym);
    var h = x.shift();
    return [h, x.join(sym)];
  }

  function splitLastAt(str, sym) {
    var x = str.split(sym);
    var t = x.pop();
    return [x.join(sym), t];
  }

  function parseRsrc(s) {
    var url = '';
    var line = 0;
    var proto = '';
    var path = '';
    var file = '';
    var dir = '';

    var m = /^((\w+):\/\/([^:]*))(:(\d*))$/.exec(s);

    if (!m) return {url: s, line: 0, proto: '', path: s, file: s, dir: ''}
    url = m[1] || '';
    proto = m[2] || '';
    path = m[3] || '';
    line = m[5] || 0;
    [dir, file] = splitLastAt(path, '/');

    return { url: url, proto: proto, path: path, file: file, line: line, dir: dir};
  }
  try {
    Array(-1);
  } catch(e) {
    var lines = e.stack.split('\n');
    lines.shift();
    lines.pop();
    var items = lines.map(function(line){
      var [func, load] = splitAt(line, '@');
      var urls = load.split(' -> ');
      var url = urls.pop();
      return parseRsrc(url);
    });
    return items;
  }
}

function getLog() {
  return logBuffer;
}

exports.getLog = getLog;
exports.log = log;
exports.warn = warn;
exports.info = info;
exports.error = error;
exports.exception = exception;
exports.console = con;

exports.info = info;
exports.init = init;
