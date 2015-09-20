/**
 * Created by mz on 15-01-09.
 */
const { emit, on, once, off } = require('sdk/event/core');
const _ = require('sdk/l10n').get;
const l10ndata = require('@l10n/data');

const Data = require('sdk/self').data;
const Sandbox = require('sdk/loader/sandbox');
const { defer, resolve, reject, promised } = require('sdk/core/promise');

const Log = require('./log');
const TabTracker = require('./tracker').TabTracker;
const UIDispatch = require('./ui-dispatch');
const Util = require('./util');

const VEIL_COLOR = 'rgba(0, 0, 0, 0.3)'; //'rgba(128, 128, 128, 0.75)';
const BOX_SHADOW = '0px 0px 1px rgba(0, 0, 0, 0.3)';

const XUL_NS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

const VEIL_STYLE = {
  position: 'absolute',
  top: '0px',
  left: '0px',
  bottom: '0px',
  right: '0px',
  display: 'none',
  overflow: 'hidden',
  backgroundColor: VEIL_COLOR,
};

function Skitch(tabInfo) {
  this._tabInfo = tabInfo;
  this._id = tabInfo.id;
  this._domId = 'evernote-skitch' + this._id;
 // this._canvasId = this._domId + '-canvas';
  this._canvasContainerId = this._domId + '-cbox';
  this._iframeId = this._domId + '-editor';
  //this._channel = UIDispatch.createChannel(null, this, {});

  this.readyState = 'detached';
  this.showing = false;
  this.mime = 'image/png';

  Util.bindAll(this);

  this._tabInfo.on('ui-action', this._onUiAction);
}

Skitch.prototype._getRootElement = function _getRootElement() {
  var document = this._tabInfo.ownerDocument;
  if (!document) { return null; }
  return document.getElementById(this._domId);
};

Skitch.prototype._getIframeElement = function _getIframeElement() {
  var document = this._tabInfo.ownerDocument;
  if (!document) { return null; }
  return document.getElementById(this._iframeId);
};

Skitch.prototype._getScreenshotSelector = function _getScreenshotSelector() {
  return this._tabInfo.getInstance('ScreenshotSelector');
};

Skitch.prototype._injectContent = function _injectContent() {
  Log.log("Skitch._injectContent");

  var document = this._tabInfo.ownerDocument;

  var outerBox = document.getElementById(this._domId);
  if (outerBox) {
    return resolve(outerBox);
  }

  var deferred = defer();

  outerBox = document.createElement('box');
  Util.merge({
    position: 'absolute',
    top: '0px',
    left: '0px',
    bottom: '0px',
    right: '0px',
    overflow: 'hidden',
    opacity: '0',
    pointerEvents: 'none',
  }, outerBox.style);
  outerBox.setAttribute('id', this._domId);

  this._tabInfo.injectRoot.appendChild(outerBox);

  /*var iframe = Util.createIframe(this._src, outerBox, {
    contentScriptFile: [
      Data.url('third_party/jquery-1.8.3.js'),
      Data.url('skitch/js/markup.js'),
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('skitch-runner.js'),
    ],
    contentScriptOptions: {
      l10n: require('@l10n/data'),
    },
    channel: this._channel,
    onLoad: function onLoad(iframe, workerPort, channel) {
      this._port = workerPort;
      deferred.resolve(outerBox);
    }.bind(this),
    onUnload: function onUnload() {
      this._port = null;
    }.bind(this),
  });*/
  var iframe = document.createElementNS(XUL_NS, 'iframe');
  Util.merge({
    position: 'absolute',
    top: '0px',
    left: '0px',
    bottom: '0px',
    right: '0px',
    width: '100%',
    height: '100%',
    backgroundColor:'rgb(224, 222, 222)',
  }, iframe.style);

  iframe.setAttribute('id', this._iframeId);
  outerBox.appendChild(iframe);
  iframe.addEventListener('DOMContentLoaded', function onLoad(evt){
    this.removeEventListener('DOMContentLoaded', onLoad);
    Log.log('Skitch Iframe Attached');
    deferred.resolve(iframe);
    //handleLoad(this, options);
  }, true);

  return deferred.promise;
};

Skitch.prototype._dispose = function() {
  Log.log('Toolbar._disposeView');

  var root = this._getRootElement();
  if (root) {
    root.parentElement.removeChild(root);
  }
  if (this._sandbox) {
    Sandbox.nuke(this._sandbox);
  }
  this._sandbox = null;

};

Skitch.prototype.onEnterPage = function() {
};

Skitch.prototype.onLeavePage = function() {
  this.hide();
  this._dispose();
};


Skitch.prototype.cancel = function() {
  this.hide();
};

Skitch.prototype.show = function() {
  var root = this._getRootElement();

  //this._injectContent().then(function(root){
  if (root) {
    root.style.display = 'block';
    root.style.opacity = '1';
    root.style.pointerEvents = 'auto';
  }
  //});

  this.showing = true;
};

Skitch.prototype.hide = function() {
  var root = this._getRootElement();
  if (root) {
    root.style.display = 'none';
  }
  /*var iframe = this._getIframeElement();
  if (iframe && iframe.parentElement) {
    iframe.parentElement.style.opacity = '0';
    iframe.parentElement.style.pointerEvents = 'none';
  }*/

  this.showing = false;
};

Skitch.prototype.start = function(window, left, top, width, height) {
  Log.log('Skitch.start', window.location.href, left, top, width, height);

  if (width <= 0 || height <= 0 ) {
    Log.error('Illegal image for skitch:', window.location.href, width, height);
    this.cancel();
    return;
  }
  var document = this._tabInfo.contentDocument;
  this._canvas = document.createElementNS(XHTML_NS, 'canvas');
  this._canvas.width = width;
  this._canvas.height = height;
  this._canvas.style.left = (-width/2)+'px';
  this._canvas.style.top = (-height/2)+'px';
  this._canvas.style.width = width+'px';
  this._canvas.style.height = height+'px';
  this._canvas.style.border = '1px solid red';

  var ctx = this._canvas.getContext('2d');
  ctx.drawWindow(
      window,
      left,
      top,
      width,
      height,
      'rgb(255,255,255)');


  this._startEditor({
    mime: this.mime,
    width: this._canvas.width,
    height: this._canvas.height,
    url: this._canvas.toDataURL(this.mime)
  });
};

Skitch.prototype._startEditor = function(screenshot) {
  this._injectContent().then(function(root){
    //this._channel.imported.createSkitch(screenshot);
    var iframe = this._getIframeElement();

    var contentWindow = iframe.contentWindow;

    this._sandbox = Sandbox.sandbox(contentWindow, {
      sandboxName: 'Skitch-' + this._id + '-' + this._tabInfo.tab.title,
      wantXHRConstructor: true,
      metadata: {
        SDKContentScript: false
      },
      sandboxPrototype: contentWindow,
      wantXrays: true,
      sameZoneAs: contentWindow
    });

    this._sandbox.console = Log;
    this._sandbox.XMLHttpRequest = require('sdk/net/xhr').XMLHttpRequest;

    this._loadJs('third_party/jquery-1.8.3.min.js');
    //this._loadJs('skitch/js/markup-cilpper-1.1.0.860.min.js');
    this._loadJs('skitch/js/markup.min.js');
    this._loadJs('skitch-runner.js');
    var skitchRunner = this._sandbox.SkitchRunner;

    skitchRunner.createSkitch(screenshot, l10ndata.hash);
    skitchRunner.localizeSkitch(l10ndata.hash);

    this.show();
  }.bind(this));

};

Skitch.prototype._loadJs = function _loadJs(filename) {
  Log.log('Skitch._loadJs', filename);
  var url = Data.url(filename);
  var old = [];
  //for(let x in this._sandbox) {
  //  old.push(x);
  //}
  Sandbox.load(this._sandbox, url);
  //for(let x in this._sandbox) {
  //  if (old.indexOf(x) === -1) {
  //    console.log('+', x);
  //  }
  //}
};

Skitch.prototype.onActivate = function() {
};

Skitch.prototype.onDeactivate = function() {
};

Skitch.prototype.doUICommand = function doUICommand(cmd) {
  if (this._sandbox && this._sandbox.SkitchRunner) {
    this._sandbox.SkitchRunner.doUICommand(cmd);
  }
};

Skitch.prototype._onUiAction = function(cmd) {

};

Skitch.prototype.getImageData = function() {
  Log.log('Skitch.getImageData');
  if (this._sandbox && this._sandbox.SkitchRunner) {
    let deferred = defer();
    let that = this;
    this._sandbox.SkitchRunner.getImageData(function(data){
      Log.log('SkitchRunner.getImageData', data.mime);
      let length = data.bytes.length;
      let copyBytes = new Uint8Array(length);

      for(var i = 0; i < length; i++) {
        copyBytes[i] = data.bytes[i];
      }
      that._sandbox.SkitchRunner.deleteSkitch();

      deferred.resolve({
        mime: '' + data.mime,
        bytes: copyBytes
      });
    });
    return deferred.promise;
  }
  return reject('no skitch found');
};

TabTracker.addClass(Skitch, 'Skitch');
