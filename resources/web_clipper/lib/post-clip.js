/**
 * Created by mz on 2014-09-16.
 */
const {Cc, Ci, Cu} = require('chrome');

var { emit, on, once, off } = require("sdk/event/core");
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');
var ContentWorker = require('sdk/content/worker').Worker;
var Data = require('sdk/self').data;

var { setTimeout } = require("sdk/timers");

const { create: createFrame, swapFrameLoaders } = require("sdk/frame/utils");
const AddonWindow = require("sdk/addon/window");

var Auth = require('./auth');
var Evernote = require('./evernote');
var Log = require('./log');
var Net = require('./net');
var Prefs = require("sdk/simple-prefs");
var TabTracker = require('./tracker').TabTracker;
var UIDispatch = require('./ui-dispatch');
var Util = require('./util');

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function PostClip(tabInfo) {
  Util.bindAll(this);
  this.initialize(tabInfo);
}

PostClip.prototype.initialize = function(tabInfo) {
  Log.log("PostClip", tabInfo.id);

  this.tabInfo = tabInfo;
  this.id = this.tabInfo.id;
  this.domId = 'evernote-post-clip' + this.id;
  this.iframeId = this.domId + '-iframe';
  this.clip = this.tabInfo.getInstance('WebClip');
  Util.bindAll(this);

  this.channel = UIDispatch.createChannel(null, this, {
    adjustSize: this.adjustSize,
    hide: this.hide,
    getFilingInfo: this.getFilingInfo,
    loadImage: this.loadImage,
    openNoteWithGuid: this.openNoteWithGuid,
    openNotebookWithGuid: this.openNotebookWithGuid,
    getSiteRecommendations: this.getSiteRecommendations,
  });

  //this.on = on.bind(null, this);
  //this.once = once.bind(null, this);
  //this.off = off.bind(null, this);

  this.size = {width: 0, height: 0};
  this.clickAwayElement = null;

  Auth.on('logged-out', this.onLoggedOut);
};

PostClip.prototype.injectContent = function() {
  var root = this.tabInfo.injectRoot;
  var document = this.tabInfo.ownerDocument;
  var box = document.getElementById(this.domId);
  if (box) {
    return resolve(box);
  }

  box = document.createElement('box');
  Util.merge({
      position: 'absolute',
      top: '16px',
      left: 'auto',
      bottom: 'auto',
      right: '16px',
      width: '456px',
      height: '0px',
      border: '2px solid rgba(178, 186, 193, 0.6)',
      borderRadius: '2px',
      backgroundColor: '#2f373d',
      overflow: 'hidden',
      zIndex: '300',
      visibility: 'hidden',
      MozBoxSizing: 'content-box',
      boxSizing: 'content-box',
      transition: 'all 0.4s ease',
      MozTransition: 'all 0.4s ease',
      pointerEvents: 'none',
    }, box.style);

  Util.mergeAttr({
    'id': this.domId,
    'class': 'evernote-postclip-box',
  }, box);


  root.appendChild(box);

  return this.injectIframe(Data.url('post-clip.html'), box, {
    style: {
      backgroundColor: 'red',
    },
    contentScriptFile: [
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('post-clip.js')
    ],
    contentScriptOptions: {
      l10n: require("@l10n/data"),
    },

    exported: {
      adjustSize: this.adjustSize,
      hide: this.hide,
      getFilingInfo: this.getFilingInfo,
      loadImage: this.loadImage,
      openNoteWithGuid: this.openNoteWithGuid,
      openNotebookWithGuid: this.openNotebookWithGuid,
      getSiteRecommendations: this.getSiteRecommendations,
    }
  });
}

// Can be moved to the base class
PostClip.prototype.injectIframe = function(src, parentElement, options) {
  options = options || {};
  var document = parentElement.ownerDocument;
  var deferred = defer();

  var frameOptions =  {
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

  var iframe = createFrame(parentElement, frameOptions);

  var style = {
    position: 'absolute',
    width: '100%',
    height: '100%',
    right: '0px',
    bottom: '0px',
    left: '0px',
    top: '0px'
  };

  if (options.style) {
    Util.merge(options.style, style);
  }
  Util.merge(style, iframe.style);

  var that = this;
  // Note: this might not work for old firefox.
  iframe.addEventListener("DOMContentLoaded", function onLoad(evt){
    this.removeEventListener("DOMContentLoaded", onLoad);
    handleLoad(this, options);
    deferred.resolve(iframe);
  }, true);

  iframe.setAttribute('id', this.iframeId);
  iframe.setAttribute('src', src);

  function handleUnload() {
    Log.log('PostClip:Iframe Detached');
    that.channel.detach();
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
    that.worker = ContentWorker(contentOpts);
    that.channel.attach(that.worker.port, that); // that.channel.attach(that.worker.port)

    if (options.exported) {
      Util.merge(options.exported, that.channel.exported)
    }
    if (options.onLoaded) {
      options.onLoaded(iframe);
    }
  }

  iframe.addEventListener('click', this.onClick);
  return deferred.promise;
};

// Can be moved to the base class
PostClip.prototype.getRootElement = function() {
  var document = this.tabInfo.ownerDocument;
  return document.getElementById(this.domId);
}

PostClip.prototype.getIframeElement = function() {
  var document = this.tabInfo.ownerDocument;
  return document.getElementById(this.iframeId);
}

PostClip.prototype.onIframeLoaded = function(iframe) {
  Log.log('PostClip.onIframeLoaded');
}

PostClip.prototype.adjustSize = function(width, height) {
  Log.log('PostClip.adjustSize', width, height);

  var iframe = this.getIframeElement();
  if (iframe) {
    let el = iframe.parentElement;
    // Resize iframe to accomodate its content
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    this.size = {width: width, height: height};
  }
}

PostClip.prototype.show = function() {

  var root = this.getRootElement();
  if (root) {
    root.style.visibility = 'visible';
    root.style.pointerEvents = 'auto';
  }
  if (!this.showing) {
    let el = this.tabInfo.injectRoot;// this.tabInfo.ownerWindow;
    el.addEventListener('click', this.onClickAway);
    this.clickAwayElement = el;
  }
  this.showing = true;
  Log.log('PostClip.show', root);
}

PostClip.prototype.onClick = function(evt) {
  evt.preventDefault();
  evt.stopPropagation();
}

PostClip.prototype.onClickAway = function(evt) {
  this.hide();
}

PostClip.prototype.hide = function() {
  if (this.clickAwayElement) {
    this.clickAwayElement.removeEventListener('click', this.onClickAway);
    this.clickAwayElement = null;
  }

  var root = this.getRootElement();
  if (root) {
    root.style.visibility = 'hidden';
    root.style.pointerEvents = 'none';
  }
  this.showing = false;
}

PostClip.prototype.start = function(options) {
  Log.log("PostClip.start", options);
  if (Prefs.prefs.afterClip === 'close') return;

  return this.injectContent().then(function(){
    options = options || {};
    options.shrink = (Prefs.prefs.afterClip === 'shrink');

    this.channel.imported.start(options);
    this.show();
  }.bind(this));
}

PostClip.prototype.getFilingInfo = function() {
  return this.clip.getFilingInfoPromise();
}


PostClip.prototype.getSiteRecommendations = function(hostName) {
  return this.clip.getSiteRecommendationsPromise(hostName);
}

PostClip.prototype.loadImage = function(url, token) {
  Log.log('PostClip.loadImage', url, token);
  return Evernote.fetchThumbnailWithAuth(token, url);
}

PostClip.prototype.openNoteWithGuid = function(noteGuid, notebookGuid, token) {
  Log.log('PostClip.openNoteWithGuid', noteGuid, notebookGuid, token);
  Evernote.openNoteWithGuid(noteGuid, notebookGuid, token);
}

PostClip.prototype.openNotebookWithGuid = function(tokenId, notebookGuid) {
  Log.log('PostClip.openNotebookWithGuid', tokenId, notebookGuid);
  Evernote.openNotebookWithGuid(tokenId, notebookGuid);
}

PostClip.prototype.dispose = function dispose() {
	var root = this.getRootElement();
  if (root) {
     root.parentElement.removeChild(root);
  }
  if (this.clickAwayElement) {
    this.clickAwayElement.removeEventListener('click', this.onClickAway);
    this.clickAwayElement = null;
  }
}

PostClip.prototype.onLoggedOut = function onLoggedOut() {
  // destroy UI
  this.dispose();
};

PostClip.prototype.onEnterPage = function onEnterPage() {
}

PostClip.prototype.onLeavePage = function() {
  this.dispose();
}

PostClip.prototype.onTabClosed = function() {
  this.dispose();
  Auth.removeListener('logged-out', this.onLoggedOut);
}

TabTracker.addClass(PostClip, 'PostClip');

