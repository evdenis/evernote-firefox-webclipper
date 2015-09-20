var _ = require("sdk/l10n").get;
var {readURI} = require('sdk/net/url');
var AddonWindow = require("sdk/addon/window");
var Data = require('sdk/self').data;
const { getMostRecentBrowserWindow } = require('sdk/window/utils');
const { resolve, reject, defer, promised, all } = require('sdk/core/promise');
const { DOMParser, XSLTProcessor, FileReader, atob, btoa } = AddonWindow.window;

var Log = require('./log');
var Net = require('./net');
var NoteUtil = require('./note-util');
var Util = require('./util');
var Thrift = require('./thrift-box');
var md5 = require('./md5');

var global = Util.global;
var xsltProcessor;
var xsltStylesheet;
var xmlDocument;
var runningTransform;

//const INDEX_ATTRIBUTE = 'data-ever' + Util.generateRandomHex(12);
const INDEX_ATTRIBUTE = "xyzzy";

function TransformBuffer(doc) {
  this.document = doc;
  this.xmlDocument = null;
  this.coreDocument = null;
  this.note = null;
  this.descriptors = {};
  Log.log("new TransformBuffer", doc);
}


TransformBuffer.prototype.dispose = function dispose() {

  //docBuffers[this.document]=null;
  delete this.document;
  delete this.xmlDocument;
  delete this.coreDocument;
  delete this.descriptors;
  delete this.note;

  //if (this === runningTransform) runningTransform = null;

}

TransformBuffer.prototype.transform = function transform(options) {

  this.options = Util.merge(options || {}, {
    output: 'enml',
    styles: true,
    debug: false,
    pseudoElements: true,
    removeDefaults: true,
    clipDestination: 'cloud',
    selection: true,
    ignoreSelection: false,
    source: 'web.clip'
  });

  var that = this;

  // Factor out
  var note = this.note = NoteUtil.createNote();
  this.note.title = options.title || this.document.title || _("Untitled");
  this.note.tagNames = options.tagNames || [];

  this.timeStamp = Util.now();
  this.xmlDocument = Util.newXmlDocument('http://www.w3.org/1999/xhtml', 'html');

  var location = this.document && this.document.location && this.document.location.href;
  note.attributes.sourceURL = location || "about:blank";

  if (options.source) {
    note.attributes.source = options.source;
  }
  var t1 = Util.now();
  this.createElementMapping(options.selectedElement);
  var t2 = Util.now();
  // TODO(olegd): use promise<xsltProcessor> instead
  this.coreDocument = xsltProcessor.transformToDocument(this.xmlDocument);
  this.note.xmlDoc = this.coreDocument;

  var t3 = Util.now();
  //Log.info("TRANSFORMED=" + this.coreDocument.documentElement.outerHTML);
  var t4 = Util.now();
  this.deleteInvisible();
  var t4a = Util.now();
  this.normalizeLinks();
  var t4b = Util.now();

  var promise = this.fetchImages()
  .then(this.fetchIframes.bind(this))
  .then(this.fetchCanvases.bind(this))
  .then(function(result){
    var t5 = Util.now();

    if (this.options.styles) {
      this.extractStyles();
    }
    var t6 = Util.now();
    if (!this.options.debug) {
      //clear Attributes
      Util.toArray(getAll(this.coreDocument))
      .forEach(function(el){
          el.removeAttribute(INDEX_ATTRIBUTE);
          el.removeAttribute('xform');
      });
    }
    this.descriptors = null;
    var t7 = Util.now();

    appendComment(this.coreDocument, this.options.comment);

    var xmlContent;
    if (this.options.output === 'enml') {
      xmlContent = Util.serializeXmlDocument(this.coreDocument);
    } else if (this.options.output === 'html5') {
      xmlContent = "<!DOCTYPE html>"
      + this.coreDocument.documentElement.outerHTML
    }
    Log.info('FINAL',xmlContent)
    this.note.content = xmlContent;
    var t8 = Util.now();

    Log.log("newXmlDocument:" + (t1 - this.timeStamp));
    Log.log("createElementMapping:" + (t2 - t1));
    Log.log("transformToDocument:" + (t3 - t2));
    Log.log("adjustElementMapping:" + (t4 - t3));
    Log.log("deleteInvisible:" + (t4a - t4));
    Log.log("normalizeLinks:" + (t4b - t4a));
    Log.log("fetch external resources:" + (t5 - t4b));
    Log.log("styles:" + (t6 - t5));
    Log.log("cleanUp:" + (t7 - t6));
    Log.log("XMLSerializer:" + (t8 - t7));
    Log.log("Total:" + (t8 - this.timeStamp));

    Log.log(this.note.tagNames);
    return this.note;
  }.bind(this));
  return promise;
}

TransformBuffer.prototype.deleteInvisible = function() {
  Log.log("deleteInvisible");
  var els = Util.toArray(this.coreDocument.querySelectorAll("*"));
  Log.log(els.length);
  var t1 = Util.now();
  els.forEach((function(el){
    if (!el.parentElement) return;
    // this element was added by us and shouldnt be matched.
    if (!el.getAttribute(INDEX_ATTRIBUTE)) return;
    var srcEl = this.getSourceElementFor(el);
    if (!srcEl) {
      Log.error("source not found for " + el.outerHTML);
      Log.log("Element removed (invisible)",el);
      el.parentElement.removeChild(el);
      return;
    }
  }).bind(this));
  var t2 = Util.now();
  Log.log("done in " + (t2-t1) + "ms");
}

TransformBuffer.prototype.normalizeLinks = function normalizeLinks() {
  var els = Util.toArray(this.coreDocument.querySelectorAll('a'));
  var anchor = this.document.createElement('a');
  Log.log("Normalize" + els.length + " <A>");
  els.forEach(function(el){
    anchor.href = el.getAttribute('href');
    if (anchor.protocol == 'http:' || anchor.protocol == 'https:') {
      Log.log(anchor.href + " " + el.outerHTML);
      el.setAttribute('href', anchor.href);
    } else {
      el.setAttribute('href', '#');
    }
  });
}


TransformBuffer.prototype.fetchImages = function fetchImages() {
  Log.log("fetchImages");
  var embedData = true; //this.options.rebaseIframes;

  var els = Util.toArray(this.coreDocument.querySelectorAll("en-media[xform='img']"));
  var anchor = this.document.createElement('a');
  Log.log(els.length);
  var promises = [];
  var that = this;
  els.forEach((function(el){
    if (!el.getAttribute(INDEX_ATTRIBUTE)) return;
    if (!el.hasAttribute('src')) {
      // TODO: copy image via canvas.drawImage
      Log.log("Element removed (src=null)",el);
      el.parentElement.removeChild(el);
      return;
    }
    var src = el.getAttribute('src');
    anchor.href = src;
    src = anchor.href;
    var srcEl = this.getSourceElementFor(el);

    if (!srcEl || !srcEl.parentElement) {
      Log.error("source not found for " + el.outerHTML);
      Log.log("Element removed (invisible)",el);
      el.parentElement.removeChild(el);
      return;
    }

    Log.log("Fetching " + srcEl.outerHTML);
    var srcRect = srcEl.getBoundingClientRect();
    if (srcRect.width <= 0 || srcRect.height <= 0) {
      Log.log("Zero size image removed " + el.getAttribute(INDEX_ATTRIBUTE));
      Log.log("Element removed (size=0)",el);
      el.parentElement.removeChild(el);
      return;
    }

    var p = Net.sendXhrBinary(null, src).then(function(data){
      Log.log("FETCHED ");
      var bytes = new Uint8Array(data, 0);
      Log.log("DATA LENGTH=" + bytes.length);

      var srcDoc = el.ownerDocument;

      var t1 = Util.now();
      // TODO: OPTIMIZATION BOTTLENECK
      var hash = md5.ArrayBuffer.hash(data);
      var t2 = Util.now();
      var type = Util.getImageType(data);
      //dstDoc.resources[hash] = data;
      that.addResource(data, src, type, hash);
      el.setAttribute('hash', hash);
      el.setAttribute('type', type);
      el.removeAttribute('src');
      var t3 = Util.now();
      Log.log("MD5=" + hash+ " " + (t2-t1));
      Log.log("Type=" + type+ " " + (t3-t2));
      Log.log("IMG as " + el.outerHTML);
      return data;
    }, function(error) {
      Log.exception(error);

      // TODO: Replace with an error message?
      if (el.parentElement) {
        Log.log("Element removed",el);
        Log.log("Element removed (network error)",el);
        el.parentElement.removeChild(el);
      }
      return null;
    });
    promises.push(p);
  }).bind(this));
  return all.call(null, promises);
}

TransformBuffer.prototype.fetchIframes = function() {
  var embedData = true; //this.options.rebaseIframes;
  var els = Util.toArray(this.coreDocument.querySelectorAll("en-media[xform='iframe']"));
  var anchor = this.document.createElement('a');
  var that = this;
  Log.log("fetchIframes "+els.length);
  var promises = [];
  els.forEach((function(el){
    var src;
    if (!el.getAttribute(INDEX_ATTRIBUTE)) return;
    if (el.hasAttribute('src')) {
      src = el.getAttribute('src');
      anchor.href = src;
      src = anchor.href;
    }
    var type = "image/png"; //Util.getImageType(data);

    var srcEl = this.getSourceElementFor(el);
    if (!srcEl || !srcEl.parentElement) {
      Log.error("source not found for " + el.outerHTML);
      Log.log("Element removed (Invisible)",el);
      el.parentElement.removeChild(el);
      return;
    }
    Log.log("Fetching " + srcEl.outerHTML);
    var srcRect = srcEl.getBoundingClientRect();
    if (srcRect.width <= 0 || srcRect.height <= 0) {
      Log.log("Zero size iframe removed " + el.getAttribute(INDEX_ATTRIBUTE));
      Log.log("Element removed (size=0)",el);
      el.parentElement.removeChild(el);
      return;
    }

    var promise = snapshotIframe(srcEl).then(function(data) {
        data = data || "";
        var t1 = Util.now();

        // TODO: OPTIMIZATION BOTTLENECK
        var bytes = new Uint8Array(data)
        var hash = md5.ArrayBuffer.hash(data);
        var t2 = Util.now();
        Log.log("IFRAME image = " + bytes.length + "bytes");
        //dstDoc.resources[hash] = data;
        that.addResource(data, src, type, hash);
        el.setAttribute('hash', hash);
        el.setAttribute('type', type);
        el.setAttribute('width', srcRect.width);
        el.setAttribute('height', srcRect.height);
        el.removeAttribute('src');
        Log.log("IFRAME as " + el.outerHTML);
    }, function(error) {
      Log.exception(error);
      // TODO: Replace with an error message?
      if (el.parentElement) {
        Log.log("Element removed",el);
        Log.log("Element removed (snapshot error)",el);
        el.parentElement.removeChild(el);
      }
      return null;
    });
    promises.push(promise);
  }).bind(this));
  return all.call(null, promises);
}

function canvasToBlob(canvas, type) {
  var deferred = defer();
  Log.log("canvasToBlob");

  canvas.toBlob(function(blob) {
    deferred.resolve(blob);
  });
  return deferred.promise;
}

function blobToArrayBuffer(blob) {
  Log.log("blobToArrayBuffer");
  var deferred = defer();
  var reader = new FileReader();
  reader.addEventListener("load", function() {
    // reader.result contains the contents of blob as a typed array
    Log.log("blobToArrayBuffer.onload");
    deferred.resolve(reader.result);
  });
  reader.addEventListener("error", function() {
    deferred.reject(reader.error);
  });
  reader.addEventListener("abort", function() {
    deferred.reject(reader.error);
  });
  reader.readAsArrayBuffer(blob);
  return deferred.promise;
}

function snapshotIframe(iframe) {
  var srcRect = iframe.getBoundingClientRect();
  var srcWindow = iframe.contentWindow;
  var document = srcWindow.document;
  var canvas = document.createElement('CANVAS');
  canvas.width = srcRect.width;
  canvas.height = srcRect.height;
  Log.log(srcRect.width + '*' + srcRect.height);
  var scrollX = srcWindow.scrollX || 0;
  var scrollY = srcWindow.scrollY || 0;

  try {
  var ctx = canvas.getContext("2d");
  ctx.drawWindow(
        srcWindow,
        scrollX,
        scrollY,
        srcRect.width,
        srcRect.height,
        "rgb(255,255,255)");
  } catch(e) {
    Log.exception(e);
    return resolve(new ArrayBuffer(0));
  }
  var t1 = Util.now();
  var t3 = Util.now();
  var promise = canvasToBlob(canvas, 'image/png')
  .then(blobToArrayBuffer)
  .then(function(arrayBuffer) {
    var t4 = Util.now();
    Log.log("Blob reader :" + (t4-t3));
    Log.log("SUCCESS");
    return arrayBuffer;
  },function(e){
    Log.exception(e);
    throw e;
  });
  return promise;
}

function snapshotCanvas(canvasEl, mime) {
  mime = mime || 'image/png';

  var t1 = Util.now();

  var promise = canvasToBlob(canvasEl, mime)
  .then(blobToArrayBuffer)
  .then(function(arrayBuffer) {
      var t2 = Util.now();
      Log.log("Blob reader :" + (t2-t1));
      Log.log("SUCCESS");
      return arrayBuffer;
  },function(e){
     Log.exception(e);
     throw e;
  });
  return promise;
}

TransformBuffer.prototype.fetchCanvases = function() {
  var embedData = true; //this.options.rebaseIframes;
  var els = Util.toArray(this.coreDocument.querySelectorAll("en-media[xform='canvas']"));
  var that = this;
  Log.log("fetchCanvases "+els.length);
  var promises = [];
  els.forEach((function(el){
    var src;
    if (!el.getAttribute(INDEX_ATTRIBUTE)) return;

    var type = "image/png"; //Util.getImageType(data);

    var srcEl = this.getSourceElementFor(el);
    if (!srcEl || !srcEl.parentElement) {
      Log.error("source not found for " + el.outerHTML);
      Log.log("Element removed (Invisible)",el);
      el.parentElement.removeChild(el);
      return;
    }

    var srcRect = srcEl.getBoundingClientRect();
    if (srcRect.width <= 0 || srcRect.height <= 0) {
      Log.log("Zero size iframe removed " + el.getAttribute(INDEX_ATTRIBUTE));
      Log.log("Element removed (size=0)",el);
      el.parentElement.removeChild(el);
      return;
    }

    var promise = snapshotCanvas(srcEl, type).then(function(data) {
      data = data || "";
      var t1 = Util.now();

      // TODO: OPTIMIZATION BOTTLENECK
      var bytes = new Uint8Array(data)
      var hash = md5.ArrayBuffer.hash(data);
      var t2 = Util.now();
      Log.log("CANVAS image = " + bytes.length + "bytes");
      //dstDoc.resources[hash] = data;
      that.addResource(data, src, type, hash);
      el.setAttribute('hash', hash);
      el.setAttribute('type', type);
      //el.setAttribute('width', srcRect.width);
      //el.setAttribute('height', srcRect.height);
      el.removeAttribute('src');
      Log.log("CANVAS as " + el.outerHTML);
    }, function(error) {
      Log.exception(error);
      // TODO: Replace with an error message?
      if (el.parentElement) {
        Log.log("Element removed",el);
        Log.log("Element removed (snapshot error)",el);
        el.parentElement.removeChild(el);
      }
      return null;
    });
    promises.push(promise);
  }).bind(this));
  return all.call(null, promises);
}


var defaultStyles = {};


function getDefaultStyle(el, pseudo) {
  pseudo = pseudo || "";
  var k = el.nodeName + ':' + pseudo;
  if (k in defaultStyles) return defaultStyles[k];
  var v = el.ownerDocument.defaultView.getDefaultComputedStyle(el, pseudo);
  var s = {};
  var len = v.length;
  for (var i = 0; i < len; i++) {
    var name = v[i];
    s[name] = v.getPropertyValue(name);
  }
  defaultStyles[k] = s;
  return s;
}

function getActiveStyles(el, pseudo) {
  function addStyles(src, dst) {
    var len = src.length;
    for (var i = 0; i < len; i++) {
      dst[src[i]] = true;
    }
  }

  // Process rules.
  pseudo = pseudo || "";
  var result = {};
  var rules = Util.system.DomUtils.getCSSStyleRules(el, pseudo);
  if (!rules) return result;

  var count = rules.Count();

  for (var i = 0; i < count; i++) {
    var cssRule = rules.GetElementAt( i );
    // Style rule?
    if (cssRule.type != 1) continue;
    addStyles(cssRule.style, result);
  }
  if (el.style && pseudo === '') {
    addStyles(el.style, result);
  }
  return result;
}

function getActualStyle(active, el, pseudo) {
  pseudo = pseudo || "";
  var computedStyle = el.ownerDocument.defaultView.getComputedStyle(el, pseudo);
  var style = {};
  for(var k in active) {
    if (!active[k]) continue;
    var v = computedStyle.getPropertyValue(k);
    if (v !== undefined) style[k] = v;
  }
  return style;
}

function rectStyle(style, combined, top, right, bottom, left) {
  if (style[top] && style[right]
      && style[bottom] && style[left]) {
    if (style[right] == style[left]) {
      if (style[top] == style[bottom]) {
        if (style[top] == style[right]) {
          style[combined] = style[top];
        } else {
          style[combined] = style[top] + ' ' + style[right];
        }
      } else {
        style[combined] = style[top] + ' ' + style[right] + ' ' + style[bottom];
      }
    } else {
      style[combined] = style[top] + ' ' + style[right]
          + ' ' + style[bottom] + ' ' + style[left];
    }
    delete style[top];
    delete style[bottom];
    delete style[left];
    delete style[right];
  }
}

function pruneStyle(style, defaultStyle) {
  var result = {};
  for(var k in style) {
    var v = style[k];
    var defaultV = defaultStyle[k];
    if (v != defaultV) {
      result[k] = v;
    }
  }
  return result;
}

function combineStyle(style) {
  rectStyle(
      style,
      'padding',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left'
  );
  rectStyle(
      style,
      'margin',
      'margin-top', 'margin-right', 'margin-bottom', 'margin-left'
  );
  rectStyle(
      style,
      'border-width',
      'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'
  );
  rectStyle(
      style,
      'border-color',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'
  );
  rectStyle(
      style,
      'border-style',
      'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'
  );

  return style;
}

function adjustActiveStyle(active) {
  active['display'] = true;
  active['padding-left'] = active['padding-left-value'];
  active['padding-left-rtl-source'] = false;
  active['padding-left-ltr-source'] = false;
  active['padding-left-value'] = false;

  active['padding-right'] = active['padding-right-value'];
  active['padding-right-value'] = false;
  active['padding-right-rtl-source'] = false;
  active['padding-right-ltr-source'] = false;

  active['margin-left-rtl-source'] = false;
  active['margin-left-ltr-source'] = false;
  active['margin-left'] = active['margin-left-value'];
  active['margin-left-value'] = false;

  active['margin-right-rtl-source'] = false;
  active['margin-right-ltr-source'] = false;
  active['margin-right'] = active['margin-right-value'];
  active['margin-right-value'] = false;

  active['border-right-width'] = active['border-right-width-value'];
  active['border-right-width-ltr-source'] = false;
  active['border-right-width-rtl-source'] = false;
  active['border-right-width-value'] = false;

  active['border-left-width'] = active['border-left-width-value'];
  active['border-left-width-value'] = false;
  active['border-left-width-ltr-source'] = false;
  active['border-left-width-rtl-source'] = false;

  active['border-right-color'] = active['border-right-color-value'];
  active['border-right-color-ltr-source'] = false;
  active['border-right-color-rtl-source'] = false;
  active['border-right-color-value'] = false;

  active['border-left-color'] = active['border-left-color-value'];
  active['border-left-color-value'] = false;
  active['border-left-color-ltr-source'] = false;
  active['border-left-color-rtl-source'] = false;

  active['border-right-style'] = active['border-right-style-value'];
  active['border-right-style-ltr-source'] = false;
  active['border-right-style-rtl-source'] = false;
  active['border-right-style-value'] = false;

  active['border-left-style'] = active['border-left-style-value'];
  active['border-left-style-value'] = false;
  active['border-left-style-ltr-source'] = false;
  active['border-left-style-rtl-source'] = false;
  active['-moz-border-top-colors'] = false;
  active['-moz-border-right-colors'] = false;
  active['-moz-border-bottom-colors'] = false;
  active['-moz-border-left-colors'] = false;
  active['unicode-bidi'] = false;
}

function styleAsString(style) {
  // Style to string
  var str = "";
  for (var k in style) {
    str += k + ':' + style[k] + ';';
  }
  return str;
}

TransformBuffer.prototype.extractStyles = function extractStyles() {
  var styleNames = Util.toArray(Util.system.DomUtils.getCSSPropertyNames());

  Log.log("extractStyles");
  var els = Util.toArray(this.coreDocument.querySelectorAll("*"));
  Log.log(els.length);
  var wnd = this.document.defaultView;
  var t1 = Util.now();

  var styleFilter = function(k, v) { return v; };
  if (typeof(this.options.styles) === 'function') {
    styleFilter = this.options.styles;
  }
  this.processElements(els, function(el, srcEl, srcRect){
      // Get and cache the Default style (if not cached).
      var tag = el.tagName;
      var active = getActiveStyles(srcEl, '');
       // Convert non-style attrs
      if (srcEl.hasAttribute('bgcolor')) {
        active['background-color'] = true;
      }
      adjustActiveStyle(active);

      var actualStyle = getActualStyle(active, srcEl, '');
      // Skip invisible elements.
      if (actualStyle['display'] == 'none') {
        if (el.parentElement) {
          Log.log("Element removed (display none)",el);
          el.parentElement.removeChild(el);
        }
        return;
      }

      var baseStyle = getDefaultStyle(srcEl, '');
      var simplifiedStyle;
      // TODO: use the basestyle of the replacing element instead of replaced
      simplifiedStyle = pruneStyle(actualStyle, baseStyle);
      combineStyle(simplifiedStyle);
      // TODO: resolve url("...") properties such as background-image.
      // Convert to data: urls?

      // Style to string
      var str = styleAsString(simplifiedStyle);
      if (str) {
        el.setAttribute('style', str);
      }
      if (this.options.pseudoElements) {
        var activeAfter = getActiveStyles(srcEl, ':after');
        if (activeAfter['content']) {
          adjustActiveStyle(activeAfter);
          var actualStyleAfter = getActualStyle(activeAfter, srcEl, ':after');
          // TODO: extract content("") style and put it inside span text content

          // TODO: use standard <SPAN> style here instead of baseStyle
          var simplifiedStyleAfter = pruneStyle(actualStyleAfter, baseStyle);
          combineStyle(simplifiedStyleAfter);

          var afterEl = el.ownerDocument.createElement('span');
          str = styleAsString(simplifiedStyleAfter);
          if (str) {
            afterEl.setAttribute('style', str);
          }
          // Cannot be any en- tag really.
          if (el.tagName !== 'en-media') {
            el.appendChild(afterEl);
          }
        }
      }
  }.bind(this));
  var t2 = Util.now();
  Log.log("finished:" + (t2-t1) + "ms");
}

function createElementDesc(elementMap, srcEl, xmlEl, srcId) {
  var elementDesc = {
    src: srcEl,
    xml: xmlEl,
    srcId: srcId,
  };
  //Log.log(JSON.stringify(elementDesc));
  //elementMap[srcEl] = elementDesc;
  //elementMap[xmlEl] = elementDesc;
  //elementMap[srcId] = elementDesc;

  return elementDesc;
}

function getAll(doc) {
  return doc.querySelectorAll('*['+INDEX_ATTRIBUTE+']');
}

function getByIndex(doc,id) {
  //Log.log('*['+INDEX_ATTRIBUTE+'="'+id+'"]');
  return doc.querySelector('*['+INDEX_ATTRIBUTE+'="'+id+'"]');
}

function setIndex(el, index) {
  el.setAttribute(INDEX_ATTRIBUTE, index);
}


function clearIndex(el) {
  el.removeAttribute(INDEX_ATTRIBUTE);
}

function getIndex(el, index) {
  if (!el.hasAttribute(INDEX_ATTRIBUTE)) return false;
  return el.getAttribute(INDEX_ATTRIBUTE);
}

function findElementByDomIndex(srcDoc, id) {
  return srcDoc.querySelector('*['+INDEX_ATTRIBUTE+'='+id+']');
}

function getDocumentSelection(document) {
  var window = document.defaultView;
  Log.log('TransformBuffer.getDocumentSelection window=', window);

  if (!window) return null;
  var selection = window.getSelection();
  Log.log('TransformBuffer.getDocumentSelection selection=', selection);

  if (!selection) return null;
  if (selection.isCollapsed) return null;
  var rangeCount = selection.rangeCount;
  Log.log('TransformBuffer.getDocumentSelection rangeCount=', rangeCount);

  if (!rangeCount) return null;
  return selection;
}

function intersectRanges(result, a, b) {
  result.collapse(true);
  if (a.collapsed || b.collapsed) return result;
  var ee = a.compareBoundaryPoints(a.END_TO_END, b);
  var es = a.compareBoundaryPoints(a.END_TO_START, b);
  var se = a.compareBoundaryPoints(a.START_TO_END, b);
  var ss = a.compareBoundaryPoints(a.START_TO_START, b);

  if (es == 1 || se == -1) {
    return result; // empty range
  }
  var startContainer, startOffset;
  if (ss == 1) {
    startContainer = a.startContainer;
    startOffset = a.startOffset;
  } else {
    startContainer = b.startContainer;
    startOffset = b.startOffset;
  }
  var endContainer, endOffset;
  if (ee == 1) {
    endContainer = b.endContainer;
    endOffset = b.endOffset;
  } else {
    endContainer = a.endContainer;
    endOffset = a.endOffset;
  }
  try {
    result.setStart(startContainer, startOffset);
    result.setEnd(endContainer, endOffset);
  } catch(e) {
    Log.exception(e);
  }
  return result;
}

/**
 * copies intersection of the selected article with the document selection
 * if intersection is empty then returns the selected article.
 * @param articleEl selected article (null = entire document)
 * @returns {*}
 */
TransformBuffer.prototype.copySelection = function(articleEl) {
  articleEl = articleEl || this.document.documentElement;
  Log.log('TransformBuffer.copySelection', articleEl);
  //if (!this.options.selection) return null;
  var selection = getDocumentSelection(this.document);
  var articleRange = this.document.createRange();
  articleRange.selectNode(articleEl);
  Log.log('TransformBuffer.copySelection articleRange=', rangeCount);

  var rangeCount;
  if (selection) {
    rangeCount = selection.rangeCount;
  } else {
    rangeCount = 0;
  }
  Log.log('TransformBuffer.copySelection rangeCount=', rangeCount);

  //var copyHolder = this.document.createElement('BODY');
  var copyHolder = this.document.documentElement.cloneNode(false);
  var cloneMap = new WeakMap();

  for(var i = 0; i < rangeCount; i++) {
    let range = selection.getRangeAt(i);
    let irange = this.document.createRange();
    intersectRanges(irange, range, articleRange);
    if (!irange.collapsed) {
      let rangeCopy = cloneRange(irange);
      Log.info("Range=", i, rangeCopy);
      if (rangeCopy.parentElement !== copyHolder) {
        copyHolder.appendChild(rangeCopy);
      }
    } else {
      Log.warn("range:", i, "collapsed");
    }
    irange.detach();
  }
  articleRange.detach();

  if (!copyHolder.childNodes.length) {
    Log.warn("Selection doesnt intersect article. Copying article");
    return articleEl;
  }
  return copyHolder;

  function cloneNode(node) {
    if (cloneMap.has(node)) {
      return cloneMap.get(node);
    }
    var c = node.cloneNode(false);
    cloneMap.set(node, c);
    return c;
  }

  function cloneRange(range) {
    var root = range.commonAncestorContainer;
    if (root.nodeType == 3) {
      root = root.parentElement;
    }
    var rcopy = cloneNode(root);

    var docFrag = range.cloneContents();
    // adjust docFragment to include HTML nodes
    rcopy.appendChild(docFrag);
    return rcopy;
  }
}

function importInnerNodes(el, dstDoc) {
  let childNodes = el.childNodes;
  let len = childNodes.length;
  let dstRoot = dstDoc.documentElement;
  for(var i = 0; i < len; i++) {
    let srcNode = childNodes[i];
    let newNode = this.xmlDocument.importNode(srcNode, true);
    dstRoot.appendChild(newNode);
  }
}

TransformBuffer.prototype.createElementMapping = function(articleEl) {
  articleEl = articleEl || this.document.documentElement;

  var that = this;
  var elementMap = this.elementMap = new WeakMap();

  if (articleEl) {
    if (articleEl.ownerDocument !== this.document) {
      Log.log("Owner document doesn't match." );
      throw new Error("Owner document doesn't match.");
    }
  }
  var srcElements = this.srcElements = Util.toArray(this.document.querySelectorAll('*'));
  var srcDoc = this.document;
  var descriptors = this.descriptors = {};

  // Write temporary attributes.
  srcElements.forEach(function (el, index) {
    setIndex(el, index);
  });

  var countSrc = srcElements.length;
  Log.log("Source Elements:" + countSrc);
  Log.log('articleEl',articleEl);

  // Copy selected elements
  if (!this.options.ignoreSelection) {
    let sel = this.copySelection(articleEl);
    Util.copyDocumentNode(sel, this.xmlDocument);
    Log.info('IMPORTED=', this.xmlDocument.documentElement.outerHTML);
  } else {
    Util.copyDocumentNode(articleEl, this.xmlDocument);
  }

  var xmlElements = this.xmlElements =
                    Util.toArray(this.xmlDocument.querySelectorAll('*'));

  // Find counterparts of copied elements in the source doc
  var countXml = 0;
  xmlElements.forEach(function(xmlEl, index) {
    var id = getIndex(xmlEl);
    if (!id) {
      Log.warn("unmarked elem");
      return;
    }
    var srcEl = getByIndex(srcDoc, id);
    if (srcEl) {
      descriptors[id] = {
        src: srcEl,
        xml: xmlEl,
        srcId: id,
      };
      countXml++;
    } else {
      clearIndex(xmlEl);
    }
  }.bind(this));
  Log.log("Xml Elements:" + countXml);

  // clear Attributes
  Util.toArray(getAll(this.document)).forEach(function(el){
    clearIndex(el);
  });

  Log.log("left=" + getAll(this.document).length);
  Log.log("left=" + getAll(this.xmlDocument).length);
}

TransformBuffer.prototype.adjustElementMapping = function(doc) {
  var descriptors = this.descriptors;
  var els = Util.toArray(getAll(doc));
  var countXslt = els.length;
  Log.log("Transformed Xml Elements:" + countXslt);
}

TransformBuffer.prototype.getSourceElementFor = function(el) {
  if (el.ownerDocument === this.document) {
    Log.warn("Already source");
    return el;
  }
  var id = el.getAttribute(INDEX_ATTRIBUTE);
  if (!id) return null;
  var srcDesc = this.descriptors[id];
  if (srcDesc) {
    return srcDesc.src;
  }
  Log.warn("Element not found in descriptor table");
  return findElementByDomIndex(this.document, id);
}


TransformBuffer.prototype.processElements = function(els, callback) {
  var t1 = Util.now();
  els.forEach((function(el){
    if (!el.parentElement) return;
    if (!el.getAttribute(INDEX_ATTRIBUTE)) return;
    var srcEl = this.getSourceElementFor(el);
    if (!srcEl) {
      Log.error("source not found for " + el.outerHTML);
      Log.log("Element removed",el);
      el.parentElement.removeChild(el);
      return;
    }

    //Log.log("Fetching " + srcEl.outerHTML);
    var srcRect = srcEl.getBoundingClientRect();

    callback(el, srcEl, srcRect);
  }).bind(this));
  var t2 = Util.now();
  Log.log("done in " + (t2-t1) + "ms");
}

TransformBuffer.prototype.addResource = function addResource(data, url, mime, hash) {
  var resource = new Thrift.Resource();
  resource.data = new Thrift.Data();
  resource.data.body = data;
  resource.data.size = data.length;
  resource.mime = mime;
  resource.hash = hash;
  resource.attributes = new Thrift.ResourceAttributes();
  if (url) {
    url = url.toLowerCase();
    // SourceURL protocol is only allowed to be http or https
    if (url.startsWith('http:') || url.startsWith('https:')) {
      resource.attributes.sourceURL = url;
    }
  }
  this.note.resources.push(resource);
  Log.log("Resource added");
}

function readFromUrlAsync(url) {
  return readURI(url, { sync: false, charset: 'US-ASCII' });
}

function parseXml(str) {
  var parser = new DOMParser();
  return parser.parseFromString(str, "application/xml");
}

function createXsltProcessor(xslt) {
  var xsltProcessor = new XSLTProcessor();
  xsltProcessor.importStylesheet(xslt);
  return xsltProcessor;
}

function logExceptionAndContinue(e) {
  Log.exception(e);
  throw e;
}

function init() {

  readFromUrlAsync(Data.url('transform.xsl'))
  .then(parseXml)
  .then(createXsltProcessor)
  .then(function(proc){
    xsltProcessor = proc;
  },logExceptionAndContinue);
}


function docText(doc) {
  return doc.documentElement.outerHTML;
}

function docHash(doc) {
  var h = doc.documentElement.outerHTML.length;
  if (doc.location) h = h + doc.location.href;
  return h;
}

function serialize(doc, options) {
  options = options || {};

  Log.log('serialize:'+doc);

  var runningTransform = new TransformBuffer(doc);
  Log.log("active="+runningTransform);
  return runningTransform.transform(options)
  .then(function(result){
    //Log.log(docText(result.xmlDocument));
    //Log.log(result);
    runningTransform.dispose();
    return result;
  }, function(e) {
    Log.exception(e);
    runningTransform.dispose();
    throw e;
  });
}

function processTemplate(templateDoc, mapping, options) {
  Log.log("mapping",mapping);
  Log.log(Util.serializeXmlDocument(templateDoc));
  Log.log(templateDoc.doctype.name);
  Log.log(templateDoc.doctype.systemId);
  Log.log(templateDoc.doctype.publicId);

  options = options || {};
  var ns = options.ns || 'h';
  var nsPrefix = ns + ':';
  var textNode = options.textNode || 'txt';
  var textNodeQuery =  '//' + nsPrefix + textNode;
  var textNodeKey = options.textNodeKey || 'id';
  var attrNodeQuery = '//@' + nsPrefix + '*';
  var template = templateDoc;
  if (!options.replaceOriginal) {
    template = Util.newXmlDocument(templateDoc.namespaceURI, templateDoc.doctype.name);
    Util.copyDocument(templateDoc, template);
  }
  template.characterSet = templateDoc.characterSet;

  var nsResolver = template.createNSResolver(template.documentElement);

  var nodesSnapshot = template.evaluate(
    textNodeQuery,
    template.documentElement,
    nsResolver,
    6/*XPathResult.ORDERED_NODE_SNAPSHOT_TYPE*/,
    null);

  Log.log('nodesSnapshot.snapshotLength',nodesSnapshot.snapshotLength)
  for (var i=0 ; i < nodesSnapshot.snapshotLength; i++ ) {
    var el = nodesSnapshot.snapshotItem(i);
    Log.log(el);

    var key = el.getAttribute(textNodeKey);
    var pel = el.parentElement;
    if (!pel) return;
    try {
      if (!key in mapping) {
        throw new ReferenceError(key + " is not defined in mapping");
      }
      let value = mapping[key];
      if (typeof(value) !== 'string') {
        throw new TypeError("value for " + key + " doesn't map to a string", value);
      }

      var txt = template.createTextNode(value);
      pel.replaceChild(txt, el);
    } catch(e) {
      Log.exception(e);
      if (options.discardErrors) {
        Log.log("Element removed (error)",el);
        pel.removeChild(el);
      }
    }
  }
  //Log.log(Util.serializeXmlDocument(template));
  nodesSnapshot = template.evaluate(
    attrNodeQuery,
    template.documentElement,
    nsResolver, 6/*XPathResult.ORDERED_NODE_SNAPSHOT_TYPE*/, null);

  for (var i=0 ; i < nodesSnapshot.snapshotLength; i++) {
    try {
      var el = nodesSnapshot.snapshotItem(i);
      let pel = el.ownerElement;
      let name = el.name;
      let localName = el.localName;

      let key = el.value;
      Log.log(pel,name,localName);

      if (!key in mapping) {
        throw new ReferenceError(key + " is not defined in mapping");
      }
      let value = mapping[key];
      if (typeof(value) !== 'string') {
        throw new TypeError("value for " + key + " doesn't map to a string", value);
      }

      pel.removeAttribute(el.name);
      pel.setAttribute(localName, value);
    } catch(e) {
      Log.error("Mapping not found for attribute:" , el, "on", pel);
      if (options.discardErrors) {
        pel.removeAttribute(el.name);
      }
    }
  }

  // Clean up xmlns that wouldn't be needed in the resulting xml.
  var docEl = template.documentElement;
  template.documentElement.removeAttribute('xmlns:' + ns);

  return template;
}

function appendComment(xmlDoc, comment) {
  if (!comment) return;
  var div = xmlDoc.createElement('div');
  div.textContent = comment;
  div.setAttribute('style',
    'border-bottom:1px solid #000;'
    + 'margin-bottom:1em;'
    + 'padding:1em');
  xmlDoc.documentElement.insertBefore(div, xmlDoc.documentElement.firstChild);
}

exports.init = init;
exports.serialize = serialize;
exports.docHash = docHash;
exports.docText = docText;
exports.processTemplate = processTemplate;
exports.appendComment = appendComment;
