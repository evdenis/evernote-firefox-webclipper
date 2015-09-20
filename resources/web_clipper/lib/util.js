const {Cc, Ci, Cu} = require('chrome');
const ContentWorker = require('sdk/content/worker').Worker;
const FrameUtils = require('sdk/frame/utils');
const {readURI} = require('sdk/net/url');
const {XSLTProcessor, DOMParser} = require('sdk/addon/window').window;
const TabsUtil = require('sdk/tabs/utils');
const { getMostRecentBrowserWindow } = require('sdk/window/utils');

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

var SysTools = require('sdk/system');

var Log = require('./log');

var lazyGetter = exports.lazyGetter = function lazyGetter(obj, name, getter) {
    Object.defineProperty(obj, name, {
      get: function () {
        delete obj[name];
        return (obj[name] = getter.call(obj, name));
      },
      configurable: true,
      enumerable: true
    });
    return obj;
};

var system = {};
exports.system = system;

var systemService = exports.systemService = function systemService(name, comp, service) {
  lazyGetter(system, name, function() {
    return Cc[comp].getService(service);
  });
};

var systemInstance = exports.systemInstance = function systemInstance(name, comp, inst) {
  lazyGetter(system, name, function() {
    return Cc[comp].createInstance(inst);
  });
};

systemService('PrefManager', '@mozilla.org/preferences-service;1', Ci.nsIPrefBranch);
systemService('UuidManager', '@mozilla.org/uuid-generator;1', Ci.nsIUUIDGenerator);
systemInstance('RandomGenerator','@mozilla.org/security/random-generator;1', Ci.nsIRandomGenerator);
systemService('HttpManager', '@mozilla.org/network/protocol;1?name=http', Ci.nsIHttpProtocolHandler);
systemService('DomUtils', '@mozilla.org/inspector/dom-utils;1',Ci.inIDOMUtils);

var globalCache = new WeakMap();
var global = {};
exports.global = global;

Object.defineProperty(global, 'window', {
  get: function() {
    var w = globalCache['window'];
    if (!w) {
      w = require('sdk/window/utils').getHiddenWindow();
    }
    return (globalCache['window'] = w);
  },
  configurable: true,
  enumerable: true
});

function defineGlobal(name) {
  Object.defineProperty(this, name, {
    get: function() {
      if (name in globalCache) return globalCache[name];
      var w = global.window;
      if (!(name in w)) return undefined;
      return (globalCache[name] = w[name]);
    },

    configurable: true,
    enumerable: true
  });
}

lazyGetter(global, 'escaper', function() {
  return require('sdk/addon/window').window.document.createElement('label');
});


var getLocale = exports.getLocale = function getLocale() {
  return system.PrefManager.getCharPref('general.useragent.locale');
}

function byteToHex(b) {
  return (0x100 + (b & 0xFF)).toString(16).substring(1);
}

/**
 * Generate a random (version 4) UUID.
 * See http://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_.28random.29
 * Note: Mozilla SDK example of using the built-in PRNG is wrong.
 * @return {String} a new random uuid
 */
var generateRandomUuid = exports.generateRandomUuid = function generateRandomUuid() {
  var buffer = system.RandomGenerator.generateRandomBytes(128);

  var out = byteToHex(buffer[0]) + byteToHex(buffer[1])
      + byteToHex(buffer[2]) + byteToHex(buffer[3])
      + '-' + byteToHex(0x40 + (buffer[4] & 0x0F)) + byteToHex(buffer[5])
      + '-' + byteToHex(0x80 + (buffer[6] & 0x3F)) + byteToHex(buffer[7])
      + '-' + byteToHex(buffer[8]) + byteToHex(buffer[9])
      + '-' + byteToHex(buffer[10]) + byteToHex(buffer[11])
      + byteToHex(buffer[12]) + byteToHex(buffer[13])
      + byteToHex(buffer[14]) + byteToHex(buffer[15]);
  return out;
};

var generateRandomHex = exports.generateRandomHex = function generateRandomHex(size) {
  size = size || 8;
  var buffer = system.RandomGenerator.generateRandomBytes((size+1)/2);
  var hexBytes = [];
  for (var i = 0; i < buffer.length; i++) {
    hexBytes.push(byteToHex(buffer[i]));
  }
  return hexBytes.join('').substr(size);
};

/**
 * Generate a UUID string using the built-in API. Note that Evernote doesn't wrap its UUIDs
 * into curly brackets { }
 * @return {String} a new random uuid string
 */
var generateUuid = exports.generateUuid = function generateUuid() {
  var uuidString = system.UuidManager.generateUUID().toString();
  // Strip curly brackets.
  uuidString = uuidString.substr(1,36);
  return uuidString;
};

/**
 * Generate a unique id. */
var uniqueId = 10000;
exports.generateId = function generateId() {
  return uniqueId++;
};

/**
 * Read the User Agent string that is sent with http requests
 * (similar to navigator.userAgent in the default world)
 * From http://stackoverflow.com/questions/6755087/how-to-obtain-firefox-user-agent-string
 * @return {String} user agent string
 */
var getUserAgent = exports.getUserAgent = function getUserAgent() {
  return system.HttpManager.userAgent;
};

/**
 * Check if the browser is currently connected to internet. It's not a very reliable test,
 * but it works in simplest situations.
 * @return {Boolean} true if we detect internet connection (or if we not sure.)
 */
exports.isOnline = function isOnline() {
  var navigator = require('sdk/addon/window').window.navigator;
  return navigator.onLine;
};

/**
 * Get DOMWindow interface to the chrome for the given window.
 * See for example http://stackoverflow.com/questions/8548561/how-can-i-notify-the-correct-tab-at-firefox-page-load-time
 */
function getChromeWindow(window) {
  return window.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIWebNavigation)
      .QueryInterface(Ci.nsIDocShellTreeItem)
      .rootTreeItem
      .QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindow);
}

var getNativeTab = exports.getNativeTab = function getNativeTab(tab) {
  var tabId = tab.id;
  for (let t of TabsUtil.getTabs()) {
    var id = TabsUtil.getTabId(t);
    if(id == tabId) {
      return t;
    }
  }
  // Tab was closed already
  Log.warn('Tab closed already');
  return null;
};

var getTabWindow = exports.getTabWindow = function getTabWindow(tab) {
  tab = tab ||  getActiveTab();
  var tabNative = getNativeTab(tab);
  if (!tabNative) return null;
  return require('sdk/tabs/utils').getTabContentWindow(tabNative);
};

var getTabBrowser = exports.getTabBrowser = function getTabBrowser(tab) {
  tab = tab ||  getActiveTab();
  var tabNative = getNativeTab(tab);
  if (!tabNative) return null;
  return require('sdk/tabs/utils').getBrowserForTab(tabNative);
};

var getTabOwnerWindow = exports.getTabOwnerWindow = function getTabOwnerWindow(tab) {
  tab = tab ||  getActiveTab();
  var tabNative = getNativeTab(tab);
  if (!tabNative) return null;
  return require('sdk/tabs/utils').getOwnerWindow(tabNative);
};

var getBrowserVersion = exports.getBrowserVersion = function getBrowserVersion() {
  return SysTools.version;
};

/**
 * Copy content from one document to another. Even works
 * between different types of documents (XML and HTML)
 */
exports.copyDocument = function copyDocument(srcDoc, dstDoc) {
  var newNode = dstDoc.importNode(srcDoc.documentElement, true);
  dstDoc.replaceChild(newNode, dstDoc.documentElement);
};

exports.copyDocumentNode = function copyDocumentNode(srcDocNode, dstDoc) {
  var newNode = dstDoc.importNode(srcDocNode, true);
  dstDoc.replaceChild(newNode, dstDoc.documentElement);
  // this is the correct way, but I cannot make XSLT not process the root
  // element twice, so the above code works instead.
  //dstDoc.documentElement.appendChild(newNode);
};


exports.newHtmlDocument = function newHtmlDocument(title) {
  var docImplementation = require('sdk/addon/window').window.document.implementation;
  return docImplementation.createHTMLDocument(title || 'new');
};

var newXmlDocument = exports.newXmlDocument = function newXmlDocument(ns, docType) {
  Log.log('newXmlDocument', ns, docType);
  var docImplementation = require('sdk/addon/window').window.document.implementation;
  return docImplementation.createDocument(
    ns || 'http://www.w3.org/1999/xhtml' ,
    docType || 'html');
};

exports.base64encode = function(data) {
  if (data.length !== undefined && typeof(data) !== 'string') {
    let str = '';
    let len = data.length;
    // String.fromCharCode.apply(null, data); only works for small strings.
    for(var i = 0; i < len; i++) {
      str += String.fromCharCode(data[i]);
    }
    //data = String.fromCharCode.apply(null, data);
    data = str;
  }
  return require('sdk/addon/window').window.btoa(data);
};

function dumpNodes(node, depth) {
  if (!node) return;
  var prefix = new Array(depth+1).join(' ');

  Log.log(prefix + node.nodeType, node.nodeName, node.localName);
  var children = node.childNodes;
  var len = children.length;
  for(var i = 0; i < len; i++) {
    let child = children[i];
    dumpNodes(child, depth+1);
  }
  Log.log(prefix + '/' + node.nodeName);
};

var documentCache =  {};
var loadXmlDocument = exports.loadXmlDocument = function loadXmlDocument(url, caching, sync) {
  if (caching === undefined) caching = true;
  if (sync === undefined) sync = false;

  if (caching && (url in documentCache)) {
    return documentCache[url];
  }
  var parser = new DOMParser();

  var promise = readURI(url, {
    sync: sync,
    charset: 'US-ASCII'
  }).then(function(data) {
    return parser.parseFromString(data, 'application/xml');
  }).then(null, function(e) {
    Log.error(e);
    throw e;
  });
  if (caching) { documentCache[url] = promise; }
  return promise;
};

/**
 * RE that matches all chars that are not valid in XML1.0
 * @see http://en.wikipedia.org/wiki/Valid_characters_in_XML
 * @type {RegExp}
 */
const INVALID_XML_RE = /[^\u0009\u000a\u000d\u0020-\u007e\u0085\u0086-\u009f\u00a0-\ud7ff\ue000-\ufffd]/g;
function filterValidXmlChars(str) {
  return str.replace(INVALID_XML_RE, ' ');
}

var serializeXmlDocument = exports.serializeXmlDocument = function serializeXmlDocument(xmlDocument) {
  var XMLSerializer = require('sdk/addon/window').window.XMLSerializer;
  var serializer = new XMLSerializer();
  var str =  serializer.serializeToString(xmlDocument);
  return filterValidXmlChars(str);
};

var writeHtml = exports.writeHtml = function writeHtml(dstDoc, htmlStr, mimeType) {
  mimeType = mimeType || 'application/xml';

  var parser = new DOMParser();
  var srcDoc = parser.parseFromString(data, mimeType); // or 'text/html'
  // post processing can go here
  var newNode = dstDoc.importNode(srcDoc.documentElement, true);
  dstDoc.replaceChild(newNode, dstDoc.documentElement);
  return dstDoc.documentElement;
};

var writeInnerHtml = exports.writeInnerHtml = function writeInnerHtml(dstEl, htmlStr, mimeType) {
  mimeType = mimeType || 'text/html';
  var dstDoc = dstEl.ownerDocument;
  var parser = new DOMParser();
  var srcDoc = parser.parseFromString(htmlStr, mimeType); // or 'text/html'
  //var newNode = dstDoc.importNode(srcDoc.documentElement, true);
};

/** Convert an array-like object to a true array. */
var toArray = exports.toArray = function toArray(xs) {

  if (xs === null || xs === undefined) return [];
  if (typeof(xs) != 'object') return [xs];
  if (xs.toString() == '[object Array]') return xs;
  return [].slice.call(xs);
};

var memoize = exports.memoize = function memoize(f) {
  var cache = {};
  function wrapped(x) {
    var key = x.toString();
    if (cache[key]) return cache[key];
    return (cache[key] = f(x));
  }
  return wrapped;
};

var memoizeWeak = exports.memoizeWeak = function memoizeWeak(f) {
  var cache = new WeakMap();
  function wrapped(x) {
    if (cache[x]) return cache[key];
    return (cache[x] = f(x));
  }
  return wrapped;
};

const performance = require('sdk/addon/window').window.performance;
var now = exports.now = function() {
  return performance.now();
};

var profileFunc = exports.profileFunc = function profileFunc(f, times) {
  times = times || 100;
  var t1 = now();
  for (var i = 0; i < times; i++) {
    f();
  }
  var t2 = now();
  return t2 - t1;
};

var getUniqueBrowserId = exports.getUniqueBrowserId = function getUniqueBrowserId() {
  var SimpleStorage = require('sdk/simple-storage').storage;

  if (SimpleStorage.deviceId) {
    return SimpleStorage.deviceId;
  }
  var uid = generateUuid().substr(0,32);
  SimpleStorage.deviceId = uid;
  return uid;
};

var getParsedUserAgent = exports.getParsedUserAgent = function getParsedUserAgent() {
  var userAgent = getUserAgent();
  if (/macintosh/i.test(userAgent)) {
    os = 'MacOS';
  } else if (/windows/i.test(userAgent)) {
    var m = userAgent.match(/Windows NT (.+);/);
    if (m) {
      switch (m[1]) {
        case '3.1':
          os = 'Windows NT 3.1';
          break;
        case '3.5':
          os = 'Windows NT 3.5';
          break;
        case '3.51':
          os = 'Windows NT 3.51';
          break;
        case '4.0':
          os = 'Windows NT 4.0';
          break;
        case '5.0':
          os = 'Windows 2000';
          break;
        case '5.1':
          os = 'Windows XP';
          break;
        case '5.2':
          os = 'Windows XP';
          break;
        case '6.0':
          os = 'Windows Vista';
          break;
        case '6.1':
          os = 'Windows 7';
          break;
        case '6.2':
          os = 'Windows 8';
          break;
        default:
          os = 'Windows';
          break;
      }
    }
    else {
      os = 'Windows';
    }
  } else if (/linux/i.test(userAgent)) {
    os = 'Linux';
  } else {
    os = 'Unknown Operating System';
  }
  return 'Firefox (' + os + ')';
};

var getImageType = exports.getImageType = function getImageType(data) {
  if (data instanceof ArrayBuffer) {
    data = String.fromCharCode.apply(null, new Uint8Array(data, 0, 16))
  }
  if (typeof(data) === 'string') {
    if (data.substr(1,3) === 'PNG') {
        return 'image/png'
    } else if (data.substr(6,4) === 'JFIF' || data.substr(6,4) == 'Exif') {
      return 'image/jpeg';
    } else if (data.substr(0,5) === 'GIF89') {
      return 'image/gif';
    }
  }
  return 'image/png';
};

/**
 * Copies object properties.
 */
var merge = exports.merge = function merge(src, dst) {
  dst = dst || {};
  if (typeof(src) === 'object') {
    for (var k in src) {
      dst[k] = src[k];
    }
  }
  return dst;
};

/**
 * Copies object into DOM element attributes.
 */
var mergeAttr = exports.mergeAttr = function mergeAttr(src, dst) {
  if (typeof(src) === 'object') {
    for (var k in src) {
      dst.setAttribute(k, src[k]);
    }
  }
  return dst;
};

/**
 * Escapes all HTML entities using built-in browser escaping. (doesn't escape quotes and apostrophes)
 */
var escapeHTMLEntities = exports.escapeHTMLEntities = function escapeHTMLEntities(str) {
  var escaper = global.escaper;
  escaper.textContent = str;
  return escaper.innerHTML;
};

var createDomElement = exports.createDomElement = function createDomElement(document, tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) {
    for (var k in attrs) {
      let v = attrs[k];
      if (k === 'style') {
        if (typeof(v) === 'object') {
          for (var k1 in v) {
            el.style[k1] = v[k1];
          }
        } else if (typeof(v) === 'string') {
          el.style.cssText = v;
        }
      } else {
        el.setAttribute(k, v + '');
      }
    }
  }
  return el;
};

var removeDomElement = exports.removeDomElement = function removeDomElement(el) {
  if (el && el.parentElement) {
    el.parentElement.removeChild(el);
  }
};

var modalState = false, modalStateX = 0;

function enterModalState(window) {
  var domWindowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIDOMWindowUtils);
  domWindowUtils.enterModalState();
  Log.log('ENTER MODAL',modalState,modalStateX);
  modalState = true;
  modalStateX++;
}

exports.enterModalState = enterModalState;

function leaveModalState(window) {
  var domWindowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIDOMWindowUtils);
  domWindowUtils.leaveModalState();
  Log.log('EXIT MODAL',modalState,modalStateX);
  modalState = false;
  modalStateX--;
}

exports.leaveModalState = leaveModalState;

function isInModalState(window) {
  var domWindowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIDOMWindowUtils);

  Log.log('isInModalState=' + domWindowUtils.isInModalState,
  'leaveModalState=' + domWindowUtils.leaveModalState,
  'enterModalState=' + domWindowUtils.enterModalState);
  Log.log('MODAL=',modalState,modalStateX);
  return modalState;
}

exports.isInModalState = isInModalState;

/**
 * Returns the target element for injecting content if we need per-Tab GUI
 */
var getTabInjection = exports.getTabInjection = function getTabInjection(tab) {
  tab = tab || getActiveTab();

  var browser = getTabBrowser(tab);
  if (browser && browser.parentElement) {
    let parentEl = browser.parentElement;

    let el = parentEl.querySelector('.evernoteStack');
    if (el) { return el; }

    el = browser.ownerDocument.createElement('box');
    el.setAttribute('class', 'evernoteStack');
    el.setAttribute('top', '0');
    el.setAttribute('left', '0');
    el.setAttribute('right', '0');
    el.setAttribute('bottom', '0');

    parentEl.appendChild(el);
    return el;
  }
  throw new Error('Cannot find injection point for tab ' + tab);
};

/**
 * Returns the target element for injecting content if we need UI inside a web page.
 */
var getContentWindowInjection = exports.getContentWindowInjection = function getContentWindowInjection(tab) {
  tab = tab || getActiveTab();

	var wnd = getTabWindow(tab);
  var document = wnd.document;
  var el = document.documentElement;
  if (!el) throw new Error('Cannot find injection point for tab ' + tab);
  return el;
};

var getActiveTab = exports.getActiveTab = function getActiveTab(window) {
  window = window || getMostRecentBrowserWindow();
  var tab = require('sdk/tabs').activeTab;//require('sdk/tabs/utils').getActiveTab(window);
  if (!tab) {
    Log.error('cannot find active tab');
  }

  return tab;
};

function loadInjection(dstNode, url, options) {
  // experimental, not working yet
  options = options || {};
  function insertXml(srcDoc){
    var docEl = srcDoc.documentElement;

    var dstDoc = dstNode.ownerDocument;
    var newNode = dstDoc.importNode(docEl, true);

    if (options.suffix) {
      toArray(newNode.querySelectorAll('[id]')).forEach(function(el){
        var id = el.getAttribute('id');
        if (id && !id.endsWith(options.suffix)) {
          id += options.suffix;
        }
        el.setAttribute('id', id);
      });
    }
    els = toArray(newNode.children);
    for(var i = 0; i < newNode.children.length; i++) {
      let el = els[i];
      dstNode.appendChild(el);
      Log.log(el,el+'', el.outerHTML);
      Log.log(el.style.cssText);
    }

    return els;
  }
  loadXmlDocument(url).then(insertXml).then(null,function(e){Log.exception(e);});
}

exports.loadInjection = loadInjection;

function bindAll(obj, obj2) {
  obj2 = obj2 || obj;
  for (var k in obj) {
    let v = obj[k];
    if (typeof(v) === 'function') {
      obj[k] = v.bind(obj2);
    }
  }
  return obj;
}

exports.bindAll = bindAll;


function portForward(from, to, fromEvent, toEvent) {
  toEvent = toEvent || fromEvent;
  var { emit, on } = require('sdk/event/core');
  var recv = (from.on) ? from.on.bind(from, fromEvent) : on.bind(null, from, fromEvent);
  var send = (to.emit) ? to.emit.bind(to, toEvent) : emit.bind(null, to, toEvent);

  recv(send);
}

exports.portForward = portForward;


function insertSpaces(root) {
  var document = root.ownerDocument;
  Util.toArray(root.querySelectorAll('*')).forEach(function(el){
    if (el.firstChild) {
      var txtNode1 = document.createTextNode(' ');
      el.insertBefore(txtNode1, el.firstChild);
    }
    var txtNode2 = document.createTextNode(' ');
    el.appendChild(txtNode2);
  });

}

const PUNCTUATION = '[\\-_\u2013\u2014\u00B7'
                        + '\\(\\)\\[\\]\\{\\}\u300A\u300B'
                        + '\uFF08\uFF09\u3010\u3011\u300C\u300D\u00BB'
                        + '.!:;\'\",?\u3002'
                        + '\u3001\uFF01\uFF0C\uFF1A\u2026\u201C\u201D'
                        +  '@#$%^&*+=`~'
                        + '/\\\\|><\u25CF]';
const PUNCTUATION_RE = new RegExp(PUNCTUATION, 'g');

function retrieveText(el, options) {
  options = options || {};
  var b = el.querySelector('body');
  el = b || el;
  var sourceDoc = el.ownerDocument;
  var xmlDocument =  newXmlDocument('http://www.w3.org/1999/xhtml', 'html');
  var newNode = xmlDocument.importNode(el, true);
  xmlDocument.replaceChild(newNode, xmlDocument.documentElement);
  var blackListed =
          ['head','script','noscript','link','meta','style','iframe','textarea'];
  if (options.blackListed) {
    blackListed.append(options.blackListed);
  }
  blackListed.forEach(function(selector){
    toArray(xmlDocument.querySelectorAll(selector))
        .forEach(function(element){
                   if (element.parentElement) {
                     element.parentElement.removeChild(element);
                   }
                 });
  });

  var xmlContent = xmlDocument.documentElement.textContent;
  if (options.removePunctuation) {
    xmlContent = xmlContent.replace(PUNCTUATION_RE, ' ');
  }
  xmlContent = xmlContent.replace(/\s+/g, ' ').trim();
  if (xmlContent.startsWith(' ')) xmlContent = xmlContent.substr(1);
  if (xmlContent.endsWith(' ')) xmlContent = xmlContent.substr(0, xmlContent.length-1);
  if (options.maxLength) {
    xmlContent = xmlContent.substr(0, options.maxLength);
  }
  return xmlContent;
}

exports.retrieveText = retrieveText;

function getObjectKeys(obj) {
  return Object.getOwnPropertyNames(obj);
}

exports.getObjectKeys = getObjectKeys;

function getObjectValues(obj) {
  return Object.getOwnPropertyNames(obj).map(function(k){return obj[k]});
}

exports.getObjectValues = getObjectValues;


function getObjectEntries(obj) {
  return Object.getOwnPropertyNames(obj).map(function(k){return [k, obj[k]]});
}

exports.getObjectEntries = getObjectEntries;

function createMap(src) {
  return new Map(getObjectEntries(src));
}

exports.createMap = createMap;

function reverseMap(src) {
  var r = new Map();
  for(var k of src) {
    r.set(src[1], src[0]);
  }
  return r;
}

exports.reverseMap = reverseMap;

/**
 * Returns (unsorted) arrays which contains every value from arr only once.
 * @param arr
 */
function unique(arr) {
  arr = arr || [];
  return Array.from(new Set(arr));
}

exports.unique = unique;


function dumpStack() {
  var stack;
  try {
    Array(-1);
  } catch(e) {
    stack = e.stack;
  }
  var lines = stack.split('\n')
  lines.shift(); // remove last item which is dumpStack itself
  lines.forEach(function(line) {
    let parts = line.split('@');
    let name = parts.shift();
    let rest = parts.join('@');
    let path = rest.split(' -> ').pop();
    Log.log('    >' + name + '@' + path);
  });
  Log.log();
}

exports.dumpStack = dumpStack;


const FRAME_OPTIONS =  {
  allowJavascript: true,
  allowPlugins: false,
  allowAuth: true,
  allowWindowControl: false,
  // Need to override `nodeName` to use `iframe` as `browsers` save session
  // history and in consequence do not dispatch "inner-window-destroyed"
  // notifications.
  browser: false,
  // Note that use of this URL let's use swap frame loaders earlier
  // than if we used default "about:blank".
  uri: 'data:text/plain;charset=utf-8,'
};

/**
 *
 * @param src source HTML for Iframe
 * @param parentElement element to attach the iframe to
 * @param options a structure containing optional named args
 *    contentScriptFile: content scripts to run in the iframe
 *    contentScriptOptions: options to pass top the content script
 *    context: context for forwarded calls
 *    channel: channel object to attach to the iframe worker
 *    onLoad: callback to invoke when the iframe content completes loading
 *    onUnload: callback to invoke when the iframe is deleted.
 * @returns {Element} created iframe DOM element
 */
function createIframe(src, parentElement, options) {

  function handleUnload() {
    Log.log('Toolbar Iframe Detached');
    channel.detach();
    if (typeof(options.onUnload) === 'function') {
      options.onUnload();
    }
    if (iframe.parentElement) {
      iframe.parentElement.removeChild(iframe);
    }
  }

  function handleLoad(iframe, options) {
    var contentOpts = {
      window: iframe.contentWindow
    };
    if (options.contentScriptFile) {
      contentOpts.contentScriptFile = options.contentScriptFile;
    }
    if (options.contentScriptOptions) {
      contentOpts.contentScriptOptions = options.contentScriptOptions;
    }
    contentOpts.onDetach = handleUnload;

    var worker = ContentWorker(contentOpts);
    channel.attach(worker.port, options.context); // that.channel.attach(that._worker.port)

    if (typeof(options.onLoad) === 'function') {
      options.onLoad(iframe, worker.port, channel);
    }
  }

  options = options || {};

  var channel = options.channel || UIDispatch.createChannel(null, this, {});

  var iframe = FrameUtils.create(parentElement, FRAME_OPTIONS);

  var style = {
    position: 'absolute',
    width: '100%',
    height: '100%',
    right: '0px',
    bottom: '0px',
    left: '0px',
    top: '0px'
  };
  iframe.setAttribute('class', 'evernote-iframe');

  if (options.style) {
    merge(options.style, style);
  }
  merge(style, iframe.style);

  // Note: this might not work for old firefox.
  iframe.addEventListener('DOMContentLoaded', function onLoad(evt){
    this.removeEventListener('DOMContentLoaded', onLoad);
    Log.log('Toolbar Iframe Attached');

    handleLoad(this, options);
  }, true);

  iframe.setAttribute('src', src);
  return iframe;
};

exports.createIframe = createIframe;

function makeURI(aURL, aOriginCharset, aBaseURI) {
  var ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
  return ioService.newURI(aURL, aOriginCharset, aBaseURI);
}

/**
 * Safely parse an HTML fragment, removing any executable
 * JavaScript, and return a document fragment.
 * taken from https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/DOM_Building_and_HTML_Insertion
 *
 * @param {Document} doc The document in which to create the
 *     returned DOM tree.
 * @param {string} html The HTML fragment to parse.
 * @param {boolean} allowStyle If true, allow <style> nodes and
 *     style attributes in the parsed fragment. Gecko 14+ only.
 * @param {nsIURI} baseURI The base URI relative to which resource
 *     URLs should be processed. Note that this will not work for
 *     XML fragments.
 * @param {boolean} isXML If true, parse the fragment as XML.
 */
function parseHTML(doc, html, allowStyle, baseURI, isXML) {
    const PARSER_UTILS = "@mozilla.org/parserutils;1";
    var url = makeURI(baseURI, null, null);
    // User the newer nsIParserUtils on versions that support it.
    if (PARSER_UTILS in Cc) {
        let parser = Cc[PARSER_UTILS].getService(Ci.nsIParserUtils);
        if ("parseFragment" in parser)
            return parser.parseFragment(html, allowStyle ? parser.SanitizerAllowStyle : 0,
                                        !!isXML, url, doc.documentElement);
    }

    return Cc["@mozilla.org/feed-unescapehtml;1"]
                     .getService(Ci.nsIScriptableUnescapeHTML)
                     .parseFragment(html, !!isXML, url, doc.documentElement);
}

exports.parseHTML = parseHTML;
