/**
 * Created by mz on 15-01-10.
 */

const { defer, resolve, reject, promised, all } = require('sdk/core/promise');
const { emit, on, once, off } = require('sdk/event/core');
const _ = require('sdk/l10n').get;

const Data = require('sdk/self').data;
const Log = require('./log');
const TabTracker = require('./tracker').TabTracker;
const Util = require('./util');

const VEIL_COLOR = 'rgba(0, 0, 0, 0.3)'; //'rgba(128, 128, 128, 0.75)';
const EXTRA_BORDER = 9999;
const BOX_SHADOW = '0px 0px 1px rgba(0, 0, 0, 0.3)';

const XUL_NS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

function RectSelector(tabInfo) {
  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  this.domId = 'evernote-rect-frame' + this.id;
  this.readyState = 'detached';
  this.left = this.top = this.width = this.height = 0;
  this.showing = false;
  this.toastActive = false;

  this.active = false;
  this._tracking = false;
  this.isClick = true;

  Util.bindAll(this);

  //this.onMouseDown = this.onMouseDown.bind(this);
  //this.onMouseUp = this.onMouseUp.bind(this);
  //this.onMouseMove = this.onMouseMove.bind(this);
  //this.injectContent(this.tabInfo.injectRoot);

  this._deferred = null;

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);

}

RectSelector.prototype.injectContent = function() {

  var document = this.tabInfo.ownerDocument;
  var outerBox = document.getElementById(this.domId);
  if (outerBox) { return; }

  var root = this.tabInfo.injectRoot;

  outerBox = document.createElement('box');
  Util.merge({
    position: 'absolute',
    top: '0px',
    left: '0px',
    bottom: '0px',
    right: '0px',
    display: 'none',
    overflow: 'hidden',
    pointerEvents: 'auto',
  }, outerBox.style);
  outerBox.setAttribute('id', this.domId);

  var box = document.createElement('box');
  Util.merge({
    position: 'absolute',
    borderColor: VEIL_COLOR,
    borderWidth: EXTRA_BORDER+'px',
    borderStyle: 'solid',

    top: '0px',  // variable
    left: '0px',
    height: '0px',
    width: '0px',
  }, box.style);
  box.setAttribute('id', this.domId+'-box');
  outerBox.appendChild(box);

  var box2 = document.createElement('box');
  Util.merge({
    position: 'absolute',
    border: '1px solid #444',
    boxShadow: BOX_SHADOW,

    top: '-1px',  // variable
    left: '-1px',
    bottom: '0px',
    right: '0px',
  }, box2.style);
  box.appendChild(box2);

  var vbar = document.createElement('box');
  Util.merge({
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    top: '0px',
    left: '100px', // variable
    width: '1px',
    bottom: '0px',
    right: 'auto',
//    display: 'none',
  }, vbar.style);
  vbar.setAttribute('id', this.domId+'-x');
  outerBox.appendChild(vbar);

  var hbar = document.createElement('box');
  Util.merge({
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    top: '100px',  // variable
    left: '0px',
    height: '1px',
    bottom: 'auto',
    right: '0px',
    //   display: 'none',
  }, hbar.style);
  hbar.setAttribute('id', this.domId+'-y');
  outerBox.appendChild(hbar);

  var outerToast = document.createElement('box');
  Util.merge({
    position: 'absolute',
    top: '50%',  // variable
    left: '50%',
    height: '0px',
    width: '0px',
    bottom: '50%',
    right: '50%',
    pointerEvents: 'none',
    opacity: '0',
    visibility: 'hidden',
    transition: 'opacity 0.3s',
    MozTransition: 'opacity 0.3s',
  }, outerToast.style);
  outerToast.setAttribute('id', this.domId+'-outer-toast');

  var innerToast = document.createElement('box');
  Util.merge({
    position: 'absolute',
    width: '342px',
    height: '116px',
    top: '-58px',
    left: '-171px',
    bottom: '-58px',
    right: '-171px',
    border: '2px solid rgba(255,255,255,0.4)',
    borderRadius: '2px',
    //   display: 'none',
    MozBoxSizing: 'border-box',

  }, innerToast.style);
  innerToast.setAttribute('id', this.domId+'-inner-toast');
  outerToast.appendChild(innerToast);

  var iframe = document.createElementNS(XUL_NS, 'iframe');
  Util.merge({
    position: 'absolute',
    top: '0px',
    left: '0px',
    bottom: '0px',
    right: '0px',
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  }, iframe.style);


  iframe.setAttribute('width', '338');
  iframe.setAttribute('height', '112');
  iframe.setAttribute('src', Data.url('screenshot-toast.html'));

  innerToast.appendChild(iframe);
  iframe.addEventListener('DOMContentLoaded', function onLoad(evt) {
    iframe.removeEventListener('DOMContentLoaded', onLoad);
    try {
      let document = iframe.contentDocument;
      // Re-localize the iframe contents because we need innerHTML
      Util.toArray(document.querySelectorAll('*[data-l10n-id]')).forEach(function(el){
        var id = el.getAttribute('data-l10n-id');
        el.innerHTML = _(id);
      });
    } catch(e) {
      Log.exception(e);
    }
  });

  root.appendChild(outerBox);
  root.appendChild(outerToast);
  return outerBox;
};

RectSelector.prototype.removeContent = function() {
  this.hide();
  this.tabInfo.injectRoot.releaseCapture();
  var document = this.tabInfo.ownerDocument;

  var outerBox = document.getElementById(this.domId);
  if (outerBox) {
    outerBox.parentElement.removeChild(outerBox);
  }
  var outerToast = document.getElementById(this.domId+'-outer-toast');
  if (outerToast) {
    outerToast.parentElement.removeChild(outerToast);
  }
};

RectSelector.prototype.removeHandlers = function() {
  var root = this.tabInfo.injectRoot;
  if (!root) { return; }

  root.removeEventListener('mousedown', this.onMouseDown);
  root.removeEventListener('mouseup', this.onMouseUp);
  root.removeEventListener('mousemove', this.onMouseMove);
  root.removeEventListener('keydown', this.onKeyDown);

};

RectSelector.prototype.addHandlers = function() {
  var root = this.tabInfo.injectRoot;
  if (!root) { return; }


  root.addEventListener('mousedown', this.onMouseDown);
  root.addEventListener('mouseup', this.onMouseUp);
  root.addEventListener('mousemove', this.onMouseMove);
  root.addEventListener('keydown', this.onKeyDown);

};

RectSelector.prototype.onTabClosed = function() {
  this.removeHandlers();
};

RectSelector.toScreenCoord = function(root, evt) {
  root = root || evt.target;
  var srcX = evt.screenX;
  var srcY = evt.screenY;
  var boxObj = root.boxObject;
  var winX = boxObj.screenX;
  var winY = boxObj.screenY;

  return {x: srcX - winX, y:srcY - winY};
};

RectSelector.prototype.onMouseMove = function(evt) {
  if (!this.active) { return; }

  var root = this.tabInfo.injectRoot;
  var {x, y} = RectSelector.toScreenCoord(root, evt);

  this.drawCursor(x, y);
  if (!this._tracking) { return; }
  this.revealRect(this.anchorX, this.anchorY, x, y);
  if (evt.movementX > 5 || evt.movementX <-5 || evt.movementY > 5 || evt.movementY <-5) {
    this.isClick = false;
  }
};

RectSelector.prototype.onKeyDown = function(evt) {
  Log.log("RectSelector.onKeyDown",evt.keyCode);
  if (evt.keyCode === 27 && this.active) { //esc
    Log.log('RectSelector [ESC] pressed');
    var root = this.tabInfo.injectRoot;
    root.releaseCapture();
    // remove listeners here.
    this._tracking = false;
    this.hide();

    if (this._deferred) {
      this._deferred.reject();
      this._deferred = null;
    }
    evt.stopPropagation();
    evt.preventDefault();
  }
};


RectSelector.prototype.onMouseUp = function(evt) {
  if (!this.active) { return; }
  this.removeHandlers();

  var root = this.tabInfo.injectRoot;
  root.releaseCapture();
  // remove listeners here.
  this._tracking = false;

  var window = this.tabInfo.contentWindow;

  var dt = +new Date() - this.startTime;
  if (dt > 200) {
    this.isClick = false;
  }
  var {scrollX, scrollY, innerWidth, innerHeight} = window;

  this.hide();

  if (this.isClick) {
    this.width = innerWidth;
    this.height = innerHeight;
    this.left = 0;
    this.top = 0;

    // HACK: Check that if click happened inside the Toolbar, then don't take screenshot.
    // This allows user cancel action.
    let x = evt.screenX;
    let y = evt.screenY;

    let r = this.tabInfo.getInstance('Toolbar').getScreenRect();
    if (r) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        if (this._deferred) {
          this._deferred.reject();
          this._deferred = null;
        }
      }
    }
  } else {
    if (this.width <= 1) { this.width = 1; }
    if (this.height <= 1) { this.height = 1; }
  }

  if (this._deferred) {
    this._deferred.resolve({
      window: window,
      left: this.left + scrollX,
      top: this.top + scrollY,
      width: this.width,
      height: this.height
    });
    this._deferred = null;
  }
};

RectSelector.prototype.onMouseDown = function(evt) {

  if (!this.active) { return; }
  this.hideToast();
  var root = this.tabInfo.injectRoot;

  var {x, y} = RectSelector.toScreenCoord(root, evt);

  root.setCapture();
  this._tracking = true;
  this.anchorX = x;
  this.anchorY = y;
  this.isClick = true;
  this.startTime = +new Date();
};

RectSelector.prototype.getRootElement = function() {
  var document = this.tabInfo.ownerDocument;
  if (!document) { return null; }
  return document.getElementById(this.domId);
};

RectSelector.prototype.getToastElement = function() {
  var document = this.tabInfo.ownerDocument;
  if (!document) { return null; }
  return document.getElementById(this.domId+'-outer-toast');
};

RectSelector.prototype.getScreenshotViewer = function() {
  return this.tabInfo.getInstance('ScreenshotSelector');
};

RectSelector.prototype.drawCursor = function(x, y) {
  if (!this.showing) { return; }
  var document = this.tabInfo.ownerDocument;
  if (!document) { return; }

  let vbar = document.getElementById(this.domId+'-x');
  let hbar = document.getElementById(this.domId+'-y');
  vbar.style.left = x + 'px';
  hbar.style.top = y + 'px';
};

RectSelector.prototype.start = function() {
  Log.log('RectSelector.start');
  if (this._deferred) {
    return this._deferred.promise;
  }
  this._deferred = defer();
  this.injectContent();
  this.addHandlers();
  this.revealRect(0,0,0,0);
  this.show();
  return this._deferred.promise;
};

RectSelector.prototype.show = function() {
  Log.log('RectSelector.show');
  var root = this.getRootElement();
  if (!root) { return; }

  root.style.display = 'block';

  var toast = this.getToastElement();
  toast.style.visibility = 'visible';
  toast.style.opacity = '1';

  this.tabInfo.ownerWindow.setCursor('crosshair');
  this.showing = true;
  this.active = true;
  this.toastActive = true;
  this.addHandlers();
};

RectSelector.prototype.hideToast = function() {
  if (!this.toastActive) { return; }
  this.toastActive = false;

  var toast = this.getToastElement();
  if (!toast) { return; }

  toast.style.opacity = '0';
};

RectSelector.prototype.hide = function() {
  Log.log('RectSelector.hide');
  var parent = this.getRootElement();
  if (parent) {
    parent.style.display = 'none';
  }
  var toast = this.getToastElement();
  if (toast) {
    toast.style.visibility = 'hidden';
    toast.style.opacity = '0';
  }
  this.tabInfo.ownerWindow.setCursor('auto');
  this.showing = false;
  this.active = false;
  this._tracking = false;
  this.toastActive = false;
  this.removeHandlers();
};

RectSelector.prototype.revealRect = function(x1, y1, x2, y2) {
  //Log.log("RectSelector.revealRect:',x1,y1,x2,y2);
  var document = this.tabInfo.ownerDocument;
  if (!document) { return; }
  let veil = document.getElementById(this.domId+'-box');

  var left = Math.min(x1, x2);
  var right = Math.max(x1, x2);
  var top = Math.min(y1, y2);
  var bottom = Math.max(y1, y2);
  var width = right - left;
  var height = bottom - top;

  veil.style.left = (left - EXTRA_BORDER)+ 'px';
  veil.style.top = (top - EXTRA_BORDER) + 'px';
  veil.style.width = (width + 2*EXTRA_BORDER) + 'px';
  veil.style.height = (height + 2*EXTRA_BORDER) + 'px';

  this.left = left;
  this.top = top;
  this.width = width;
  this.height = height;
  if (width > 5 || height > 5) {
    this.isClick = false;
  }
};

RectSelector.prototype.onLeavePage = function onLeavePage() {
  this.removeContent();

  if (this._deferred) {
    this._deferred.reject();
    this._deferred = null;
  }
};

TabTracker.addClass(RectSelector, 'RectSelector');

