/*jshint nonew:true, nonstandard:true, curly:true, latedef:nofunc, unused:vars, esnext:true, trailing:true, forin:true, noempty:true, quotmark:single, rhino:true, eqeqeq:true, moz:true, undef:true, expr:true, bitwise:true, immed:true, camelcase:true, devel:true, freeze:true */

/*global require,exports */

const { defer, resolve, reject, promised, all } = require('sdk/core/promise');

const ContentWorker = require('sdk/content/worker').Worker;
const Data = require('sdk/self').data;
const Event = require('sdk/event/core');
const FrameUtils = require('sdk/frame/utils');
const Prefs = require('sdk/simple-prefs');
const Tabs = require('sdk/tabs');
const Auth = require('./auth');
const Evernote = require('./evernote');
const Log = require('./log');
const Notebooks = require('./notebooks');
const PopBox = require('./pop-box').PopBox;
const SubPanel = require('./sub-panel').SubPanel;
const TabTracker = require('./tracker').TabTracker;
const Ui = require('./ui');
const UIDispatch = require('./ui-dispatch');
const Util = require('./util');
const Widget = require('./widget');

var emit = Event.emit.bind(null, exports);

const XUL_NS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const TAB_PANEL_ID = 'evernote-toolbar';
const TOOLBAR_HTML = Data.url('toolbar.html');

const STYLE_ROOT = {
  position: 'absolute',
  left: 'auto',
  top: '16px',
  right: '16px',
  width: '266px',
  height: '0px',
  transition: 'all 0.4s ease',
  MozTransition: 'all 0.4s ease',
  XBoxShadow: '0px 5px 10px 0px rgba(0,0,0,0.5)',
  borderRadius: '4px',
  border: '2px solid rgba(34,40,44,0.38)',
  zIndex: '10',
};

const STYLE_IFRAME = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  right: '0px',
  bottom: '0px',
  left: '0px',
  top: '0px'
};

const STYLE_HIDE = {
  opacity: '0',
  pointerEvents: 'none',
  //transform: 'translate(200px, 0px)',
  //MozTransform: 'translate(200px, 0px)',
};

const STYLE_SHOW = {
  transition: 'all 0.4s ease',
  MozTransition: 'all 0.4s ease',
  opacity: '1',
  pointerEvents: 'auto',
  transform: 'translate(0px, 0px)',
  MozTransform: 'translate(0px, 0px)',
};

const IFRAME_CLASS = 'evernote-iframe';


function init() {
  Auth.on('logged-out', function onLoggedOut() {
    Toolbar.lastNotebookGuid = null;

    for (var i = 0; i < Tabs.length; i++) {
      try {
        TabTracker.getInstance('Toolbar', Tabs[i]).onLoggedOut();
      } catch(e) {
        Log.exception(e);
      }
    }
  });

}

/**
 * Creates a toolbar widget in a tab.
 * @param tabInfo the tab where the toolbar will be created.
 * @constructor
 */
function Toolbar(tabInfo) {
  this._tabInfo = tabInfo;
  this._id = tabInfo.id;
  this._domId = TAB_PANEL_ID + this._id;

  Util.bindAll(this);
  this._modelClipType = 'article';
  this._modelRevertClipType = 'article'; // which clip type to revert to if screenshot is cancelled.

  this._viewSize = { width: 0, height: 0 };
  this._viewShowing = false;

  this._selectedNotebookGuid = null;

  this._channel = UIDispatch.createChannel(null, this, {
    adjustSize: this._adjustSize,
    close: this.close,
    hideSubPanels: this._hideSubPanels,
    showNotebookSelector: function(x, y) {
      // this._subPanels.notebookPanel.imported.startEdit(Toolbar.selectedNotebookGUID);
      this._showSubPanel('notebookPanel', x, y);
    }.bind(this),
    hideNotebookSelector: function() {
      this._hideSubPanel('notebookPanel');
    }.bind(this),
    toggleNotebookSelector: function(pt) {
      // this._subPanels.notebookPanel.imported.startEdit(Toolbar.selectedNotebookGUID);
      this._toggleSubPanel('notebookPanel',pt);
    }.bind(this),
    startNotebookSelector: function startNotebookSelector() {
    }.bind(this),

    screenshotCancelled: function screenshotCancelled() {
      this.onScreenshotCancelled(true);
    }.bind(this),
    /**
     * Switch to another clip mode
     */
    clip: function(clipType) {
      return this._startNote(clipType);
    }.bind(this),

    saveNote: function(title, tags, guid, comment) {
      this._getWebClip().saveNote(title, tags, guid || this._selectedNotebookGuid, comment);
      Toolbar.lastNotebookGuid = this._selectedNotebookGuid;

    }.bind(this),
    openOptionsDialog: function() {
      Ui.openOptionsDialog();
    }.bind(this),
    suggestTags: this._suggestTags,
    hideSuggestedTags: function() {
      this._subPanels.tagPanel.hide();
    }.bind(this),
    previousTag: function() {
      this._subPanels.tagPanel.imported.previousTag();
    }.bind(this),
    nextTag: function() {
      this._subPanels.tagPanel.imported.nextTag();
    }.bind(this),
    getTitle: function() {
      return this._getWebClip().getTitle();
    }.bind(this),
    showSubPanel: this._showSubPanel,
    toggleSubPanel: this._toggleSubPanel,
    hideSubPanel: this._hideSubPanel,
    doUICommand: this.doUICommand,
  });

  Log.log('subPanels deleted');
  this._subPanels = {};

  Auth.on('logged-out', this.onLoggedOut);
  Evernote.on('clipDestination', this.onClipDestinationChanged);
}

Toolbar.lastNotebookGuid = null;


/** Gets the instance of Web Clip manager on the current tab. */
Toolbar.prototype._getWebClip = function _getWebClip() {
  return this._tabInfo.getInstance('WebClip');
};

/** Gets the instance of PostClip dialog on the current tab. */
Toolbar.prototype._getPostClip = function _getPostClip() {
  return this._tabInfo.getInstance('PostClip');
};

/**
 * Get the DOM root of injected UI
 * @returns {Element|null}
 * @private
 */
Toolbar.prototype._getViewRootElement = function _getRootElement() {
  var document = this._tabInfo.ownerDocument;
  return document.getElementById(this._domId);
};

/**
 * Returns the Iframe DOM Element that contains the toolbar.
 * @returns {Element|null}
 * @private
 */
Toolbar.prototype._getViewIframe = function() {
  var root = this._getViewRootElement();
  return root.firstChild;
};

Toolbar.prototype._offsetByIframe = function _offsetByIframe(x, y) {
  var root = this._getViewRootElement();
  var parent = root.parentElement;
  if (!parent) {
    return {x: Math.floor(x), y: Math.floor(y)};
  }
  return {x: Math.floor(x) + root.boxObject.x, y: Math.floor(y) + root.boxObject.y};
};
/**
 * Make toolbar visible
 * @private
 */
Toolbar.prototype._show = function _show() {
  Log.log('Toolbar._show');
  var root = this._getViewRootElement();
  if (!this._viewShowing) {
    if (this._port) {
      this._port.emit('show');
    }
    if (root) {
      Util.merge(STYLE_SHOW, root.style);
    }
    if (this._tabInfo.isActive) {
      Log.log('Toolbar opened');
      Widget.setSidebarState(true);
    }
    this._getPostClip().hide();
  }
  this._viewShowing = true;
};

/**
 * Hide toolbar UI
 * @private
 */
Toolbar.prototype._hide = function _hide() {
  Log.log('Toolbar._hide', this._viewShowing);
  if (this._viewShowing && this._port) {
    this._port.emit('hide');
    var root = this._getViewRootElement();
    if (root) {
      Util.merge(STYLE_HIDE, root.style);
    }
  }
  if (this._tabInfo.isActive) {
    Log.log('Toolbar closed');
    Widget.setSidebarState(false);
  }

  this._viewShowing = false;
};

Toolbar.prototype._createView = function _createView() {
  var deferred = defer();
  Log.log('Toolbar._createView', this._domId);
  var root = this._getViewRootElement();
  if (root) { return resolve(root); }


  var parent = this._tabInfo.injectRoot;
  var document = this._tabInfo.ownerDocument;

  root = document.createElement('vbox');

  Util.merge(STYLE_ROOT, root.style);
  Util.merge(STYLE_HIDE, root.style);
  //Util.merge(STYLE_HIDE, root.style);
  root.setAttribute('id', this._domId);
  root.setAttribute('class', 'evernote-toolbar');

  parent.appendChild(root);
  this._tabInfo.ownerWindow.addEventListener('keydown', this.onKeyDown);

  var iframe = this._createIframe(Data.url('toolbar.html'), root, {
    style: {},

    contentScriptFile: [
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('toolbar.js')
    ],

    contentScriptOptions: {
      l10n: require('@l10n/data'),
      clipDestination: Evernote.getClipDestination()
    },

    channel: this._channel,

    onLoad: function(iframe, workerPort, channel) {
      this._port = workerPort;
      // TODO: remove the forward on unload
      Util.portForward(workerPort, this._tabInfo, 'ui-cmd', 'ui-action');
      Util.portForward(this._tabInfo, workerPort, 'ui-action', 'ui-action');
      deferred.resolve(root);
    }.bind(this),

    onUnload: function() {
      this._port = null;
    }.bind(this),

    context: this,
  });

  iframe.addEventListener('click', this.onClick);

  Log.log('Toolbar: tagPanel created');
  this._subPanels.tagPanel = new PopBox({
    parentElement: parent,
    id: this._domId + '-tag-panel',
    arrowType: 'top',
    exported: {
      selectTag: function(tag){
        this._channel.imported.selectTag(tag);
      }.bind(this),
      autocompleteTag: function(tag){
        this._channel.imported.autocompleteTag(tag);
      }.bind(this),
    },
    context: this,
    src: Data.url('tag-pane.html'),
    contentScriptFile: [
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('tag-pane.js')
    ],
    contentScriptOptions: {
      l10n: require('@l10n/data'),
    },
    width: 182,
    height: 104,
  });

  Log.log('Toolbar: notebookPanel created');
  this._subPanels.notebookPanel = new PopBox({
    parentElement: parent,
    id: this._domId + '-nb-panel',
    arrowType: 'top',
    exported: {
      selectNotebook: function(guid) {
        Log.log('selectNotebook', guid);
        var nb = Evernote.getNotebookByGuid(guid);
        if (nb) {
          this._channel.imported.selectNotebook(nb, true);
        }
        this._selectedNotebookGuid = guid;
      }.bind(this),
      setToolbarFocus: function(focus) {
        //Log.log('setToolbarFocus', focus);
        this._channel.imported.setFocus(focus);
      }.bind(this),
    },
    onShow: function() {
      this._channel.imported.notebookOpened();
    }.bind(this),
    onHide: function() {
      this._channel.imported.notebookClosed();
    }.bind(this),
    context: this,
    src: Data.url('notebook-pane.html'),
    contentScriptFile: [
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('notebook-pane.js')
    ],
    contentScriptOptions: {
      l10n: require('@l10n/data'),
    },
    width: 182,
    height: 104,
  });
//colorPanel, shapePanel, markPanel
  Log.log('Toolbar: colorPanel created');
  this._subPanels.colorPanel = new PopBox({
    parentElement: parent,
    id: this._domId + '-color-panel',
    arrowType: 'top',
    exported: {
      doUICommand: this.doUICommand
    },
    context: this,
    src: Data.url('color-pane.html'),
    contentScriptFile: [
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('color-pane.js')
    ],
    contentScriptOptions: {
      l10n: require('@l10n/data'),
    },
    width: 140,
    height: 70,
  });
  Log.log('Toolbar: shapePanel created');
  this._subPanels.shapePanel = new PopBox({
    parentElement: parent,
    id: this._domId + '-shape-panel',
    arrowType: 'top',
    exported: {
      doUICommand: this.doUICommand
    },
    context: this,
    src: Data.url('shape-pane.html'),
    contentScriptFile: [
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('tool-pane.js')
    ],

    contentScriptOptions: {
      l10n: require('@l10n/data'),
    },
    width: 175,
    height: 35,
  });

  Log.log('Toolbar: markPanel created');
  this._subPanels.markPanel = new PopBox({
    parentElement: parent,
    id: this._domId + '-mark-panel',
    arrowType: 'top',
    exported: {
      doUICommand: this.doUICommand
    },
    context: this,
    src: Data.url('mark-pane.html'),
    contentScriptFile: [
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('tool-pane.js')
    ],
    contentScriptOptions: {
      l10n: require('@l10n/data'),
    },
    width: 175,
    height: 35,
  });

  return deferred.promise;
};


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

Toolbar.prototype._createIframe = function _createIframe(src, parentElement, options) {

  function handleUnload() {
    Log.log('Toolbar Iframe Detached');
    channel.detach();
    if (typeof(options.onUnload) === 'function') {
      options.onUnload();
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

    if (options.exported) {
      Util.merge(options.exported, channel.exported);
    }

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

  if (options.style) {
    Util.merge(options.style, style);
  }
  Util.merge(style, iframe.style);

  // Note: this might not work for old firefox.
  iframe.addEventListener('DOMContentLoaded', function onLoad(evt){
    this.removeEventListener('DOMContentLoaded', onLoad);
    Log.log('Toolbar Iframe Attached');

    handleLoad(this, options);
  }, true);

  iframe.setAttribute('src', src);
  return iframe;
};

Toolbar.prototype.onClick = function(evt) {
  Log.log('Toolbar.onClick');
};

/**
 * Destroy injected UI and event listeners.
 * @private
 */
Toolbar.prototype._disposeView = function _disposeView() {
  Log.log('Toolbar._disposeView');

  var root = this._getViewRootElement();
  if (root) {
    root.parentElement.removeChild(root);
  }
  this._tabInfo.ownerWindow.removeEventListener('keydown', this.onKeyDown);

  // dispose of all panels
  for(var panel in this._subPanels) {
    if (this._subPanels.hasOwnProperty(panel)) {
      this._subPanels[panel].dispose();
    }
  }
  Log.log('Toolbar._disposeView: subpanels deleted');
  this._subPanels = {};
};

///// Forwarding to the content script.
Toolbar.prototype._viewSetClipType = function _viewSetClipType(clipType) {
  return this._channel.imported.setClipMode(clipType);
};

Toolbar.prototype._viewSetClipDestination = function _viewSetClipDestination(dest) {
  return this._channel.imported.setClipDestination(dest);
};

Toolbar.prototype._viewClear = function _viewClear() {
  return this._channel.imported.clear();
};

Toolbar.prototype._viewCancelEditing = function _viewCancelEditing() {
  return this._channel.imported.cancelEditing();
};

Toolbar.prototype._viewSetSpecialMode = function _viewSetSpecialMode(specialMode) {
  return this._channel.imported.setSpecialMode(specialMode);
};

Toolbar.prototype._viewSetSelectionMode = function _viewSetSelectionMode(mode) {
  return this._channel.imported.setSelection(mode);
};

Toolbar.prototype._viewSetSynthMode = function _viewSetSynthMode(synthMode) {
  return this._channel.imported.setSynthMode(synthMode);
};

// Disabled
Toolbar.prototype._viewSetSkitchMode = function _viewSetSkitchMode() {
  //return this._channel.imported.setSkitchMode();
};

Toolbar.prototype._viewClearTitle = function _viewClearTitle() {
  return this._channel.imported.clearTitle();
};

Toolbar.prototype._viewGetTitle = function _viewGetTitle() {
  return this._channel.imported.getTitle();
};

Toolbar.prototype._viewAddTags = function _viewAddTags() {
  return this._channel.imported.addTags();
};

Toolbar.prototype._viewClearTags = function _viewClearTags() {
  return this._channel.imported.clearTags();
};

Toolbar.prototype._viewEnterTags = function _viewEnterTags() {
  return this._channel.imported.selectTag();
};

Toolbar.prototype._viewAutocompleteTag = function _viewAutocompleteTag() {
  return this._channel.imported.autocompleteTag();
};

Toolbar.prototype._viewSelectNotebook = function _viewSelectNotebook() {
  return this._channel.imported.selectNotebook();
};

Toolbar.prototype._viewNotebookOpened = function _viewNotebookOpened() {
  return this._channel.imported.notebookOpened();
};

Toolbar.prototype._viewNotebookClosed = function _viewNotebookClosed() {
  return this._channel.imported.notebookClosed();
};

Toolbar.prototype._viewClearComment = function _viewClearComment() {
  return this._channel.imported.clearComment();
};

/**
 * Web Clipper finished work.
 */
Toolbar.prototype.onClipCompleted = function onClipCompleted() {
  Log.log('Toolbar.onClipCompleted');
  this._hide();
};

/**
 * Invoked when you cancel out of screenshot mode
 */
Toolbar.prototype.onScreenshotCancelled = function onScreenshotCancelled(restart) {
  Log.log('Toolbar.onScreenshotCancelled', restart);
  this._viewSetSpecialMode('normal');
  this._hideSubPanels();
  //
  if (restart) {
    this.startEdit(this._modelRevertClipType);
  } else {
    this.close();
  }
};

Toolbar.prototype.onClipDestinationChanged = function(dst) {
  Log.warn('Toolbar. Opts changed', dst);
  this._viewSetClipDestination(dst);
  this._createView().then(function(){
    this._updateNotebooks();
  });
};

/**
 * Web Clipper was closed (by the close button, by ESC key, by Logging out, or from context menu)
 */
Toolbar.prototype.close = function close() {
  // dispose of all edits.
  this._getWebClip().cancel();
  // hide subpanels
  this._hideSubPanels();
  // hide main UI
  this._hide();
};


/**
 * Logged out of Web Clipper account
 */
Toolbar.prototype.onLoggedOut = function onLoggedOut() {
  // set all values back to default
  this._selectedNotebookGuid = null;
  this.close();
  // destroy UI
  this._disposeView();
};

Toolbar.prototype.isShowing = function isShowing() {
  return this._viewShowing;
};

Toolbar.prototype.onKeyDown = function(evt) {
  //Log.log('Toolbar.onKeyDown', evt.keyCode);
  if (evt.keyCode === 27) { //esc
    Log.log('[ESC] pressed');
    this.close();
  }
};

Toolbar.prototype.onEnterPage = function(tab) {
  Log.log('Toolbar.onEnterPage');
};

Toolbar.prototype.onLeavePage = function(tab) {
  Log.log('Toolbar.onLeavePage');
  this.close();
  // destroy UI
  this._disposeView();
  this._selectedNotebookGuid = null;
};

Toolbar.prototype.onTabClosed = function() {
  this._disposeView();
  if (this._tabInfo.isActive) {
    Widget.setSidebarState(false);
  }
  Auth.removeListener('logged-out', this.onLoggedOut);
};


Toolbar.prototype.onActivate = function onActivate() {
  Log.log('Toolbar.onActivate '+ this._tabInfo.id + ' active');
  if (this._tabInfo.isActive) {
    Widget.setSidebarState(this._viewShowing);
  }
};

Toolbar.prototype._adjustSize = function _adjustSize(w, h) {
  Log.log('Toolbar._adjustSize', w, h);
  var root = this._getViewRootElement();
  if (root) {
    root.style.width = w + 'px';
    root.style.height = h + 'px';
  }
};

Toolbar.prototype._hideSubPanels = function _hideSubPanels(except) {
  Log.log('Toolbar._hideSubPanels', except);
  for(var panel in this._subPanels) {
    if (this._subPanels.hasOwnProperty(panel) && panel !== except) {
      this._subPanels[panel].hide();
    }
  }
};

//Toolbar.prototype.setTitle = function setTitle(title) {
//  Log.log('Toolbar.setTitle', title);
//  this._channel.imported.setTitle(title);
//};

Toolbar.prototype._viewSetTitle = function _viewSetTitle(title) {
  Log.log('Toolbar._viewSetTitle', title);
  this._channel.imported.setTitle(title);
};

Toolbar.prototype._showSubPanel = function _showSubPanel(panelName, pt) {
  var panel = this._subPanels[panelName];
  if (!panel) {
    Log.error('Panel doesn\'t exist', panelName);
    return;
  }
  this._hideSubPanels(panelName);

  pt = this._offsetByIframe(pt.x, pt.y);

  return panel.show(pt.x, pt.y);
};

Toolbar.prototype._toggleSubPanel = function _toggleSubPanel(panelName, pt) {
  var panel = this._subPanels[panelName];
  if (!panel) {
    Log.error('Panel doesn\'t exist', panelName);
    return;
  }
  this._hideSubPanels(panelName);

  pt = this._offsetByIframe(pt.x, pt.y);

  return panel.toggle(pt.x, pt.y);
};

Toolbar.prototype._hideSubPanel = function _hideSubPanel(panelName) {
  var panel = this._subPanels[panelName];
  if (!panel) {
    Log.error('Panel doesn\'t exist', panelName);
    return;
  }
  return panel.hide();
};

const ClipType = {
  ARTICLE: 'article',
  CLEARLY: 'clearly',
  FULL: 'full',
  BOOKMARK: 'url',
  SCREENSHOT: 'screenshot',
  SELECTION: 'selection',
  PDF: 'pdf',
  IMAGE: 'image'
};

const ELIGIBLE_CLIPTYPES = new Set([
  ClipType.ARTICLE,
  ClipType.CLEARLY,
  ClipType.FULL,
  ClipType.BOOKMARK,
]);

/**
 * Chooses which clip type to use when opening
 * @param synthType Synthetic Type of the current document
 * @param selection true if there's a selection
 * @private
 */
Toolbar.prototype._modelGetStartingClipType = function _modelGetStartingClipType(synthMode, selection) {
  // default
  Log.log("Toolbar._modelGetStartingClipType", synthMode, selection);
  if (synthMode === SynthMode.BINARY ||
      synthMode === SynthMode.AUDIO ||
      synthMode === SynthMode.VIDEO) {//TODO: implement audio/video clips
    return ClipType.BOOKMARK;
  } else if (synthMode === SynthMode.PDF) {
    return ClipType.PDF;
  } else if (synthMode === SynthMode.IMAGE) {
    return ClipType.IMAGE;
  } else if (synthMode === SynthMode.TEXT) {
    if (selection) {
      return ClipType.SELECTION;
    } else {
      let prefClipType = Prefs.prefs.defaultClipAction;
      if (prefClipType === 'last') {
        return this._getWebClip().getLastClipType();
      } else if (prefClipType === ClipType.ARTICLE ||
                 prefClipType === ClipType.CLEARLY ||
                 prefClipType === ClipType.FULL ||
                 prefClipType === ClipType.BOOKMARK ||
                 prefClipType === ClipType.SCREENSHOT) {
        return prefClipType;
      } else {
        Log.error('Unknown defaultClipAction', prefClipType);
        return ClipType.ARTICLE;
      }
    }
  } else {
    Log.error('Unknown SynthMode', synthMode);
    return ClipType.BOOKMARK;
  }
};

/**
 * Activates clip mode and stores previous state
 */
Toolbar.prototype._startNote = function _startNote(clipType) {
  Log.log('Toolbar._startNote', clipType);

  if (clipType === ClipType.SCREENSHOT && this._modelClipType !== ClipType.SCREENSHOT) {
    this._modelRevertClipType = this._modelClipType;
  }

  this._modelClipType = clipType;
  this._getWebClip().startNote(clipType);
}

const SynthMode = {
  TEXT: 'text',
  AUDIO: 'audio',
  VIDEO: 'video',
  IMAGE: 'image',
  PDF: 'pdf',
  BINARY: 'binary'
};

Toolbar.prototype._getModelSynthMode = function _getModelSynthMode() {
  var document = this._tabInfo.getContentDocument();
  if (!document) {
    Log.error('Document not found');
    return '';
  }

  //var isSynthetic = doc.mozSyntheticDocument; // it's full of lies. PDF is reported as non-synthetic!
  var mime = document.contentType;
  Log.log('CONTENT-TYPE=', mime);
  var majorType = mime.split('/')[0].toLowerCase();
  switch(majorType) {
    case 'text':
      return SynthMode.TEXT;
    case 'image':
      return SynthMode.IMAGE;
    case 'audio':
    case 'video':
      return SynthMode.BINARY; // SynthMode.VIDEO and SynthMode.AUDIO are not supported yet by the server.

    // fall-through
  }
  if (mime === 'application/pdf') {
    if (Evernote.specialClipSupported('pdf')) {
      return SynthMode.PDF;
    }
  } else if (mime === 'application/xhtml+xml') {
    return SynthMode.TEXT;
  }

  return SynthMode.BINARY;
};

/**
 * Checks if user has selected something on the current page
 */
Toolbar.prototype._getModelSelection = function () {
  var window = this._tabInfo.contentWindow;
  if (!window) { return false; }
  var selection = window.getSelection();
  if (!selection) { return false; }
  if (selection.isCollapsed) { return false; }
  return true;
};


/**
 * Web Clipper was invoked.
 * @param clipType starting Clip Type or null to deduce the type automatically
 */
Toolbar.prototype.startEdit = function startEdit(clipType) {
  Log.log('Toolbar.startEdit', clipType);
  // start article
  var synthMode = this._getModelSynthMode();

  var selection = false;
  if (synthMode === SynthMode.TEXT) {
    selection = this._getModelSelection();
  }
  if (!clipType) {
    clipType = this._modelGetStartingClipType(synthMode, selection);
  }
  this._startNote(clipType);
  let title = this._getWebClip().getTitle();
  // create UI
  var that = this;
  this._createView()
  .then(function() {
    that._viewClear();
    that._viewSetClipDestination(Evernote.getClipDestination());
    that._viewSetSelectionMode(selection);
    that._viewSetClipType(clipType);
    that._viewSetSynthMode(synthMode);
    that._viewSetSpecialMode('normal');
    that._viewSetTitle(title);
    that._show();
  })
  .then(this._updateNotebooks);
};


Toolbar.prototype.setSpecialMode = function setSpecialMode(specialMode) {
  Log.log('Toolbar.setSpecialMode', specialMode);
  this._hideSubPanels('*');
  return this._viewSetSpecialMode(specialMode);
};

Toolbar.prototype.getScreenRect = function getScreenRect() {
  var root = this._getViewRootElement();
  if (!root) {
    return null;
  }
  return {
    left: root.boxObject.screenX,
    top: root.boxObject.screenY,
    right: root.boxObject.screenX + root.boxObject.width,
    bottom: root.boxObject.screenY + root.boxObject.height,
    width: root.boxObject.width,
    height: root.boxObject.height
  };
};

Toolbar.prototype.doUICommand = function doUICommand(cmd) {
  var skitch = this._tabInfo.getInstance('Skitch');
  Log.log('Toolbar.doUICommand',cmd);
  skitch.doUICommand(cmd);
  this._channel.imported.doUICommand(cmd);
};

Toolbar.prototype._updateNotebooks = function() {
  function getDefault(nbs) {
    if (nbs.length === 0) { return ''; }

    for(var i = 0; i < nbs.length; i++) {
      if (nbs.defaultNotebook) {
        return nbs.guid;
      }
    }
    return nbs[0].guid;
  }

  if (Evernote.getClipDestination() !== Evernote.ClipDestination.CLOUD) {
    return resolve();
  }

  return this._subPanels.notebookPanel.create()
  .then(Evernote.updateNotebooks)
  .then(function _update(result) {
    Log.log('Notebooks._update(result):', result);

    this._subPanels.notebookPanel.imported.updateNotebooks(result);
    if (this._selectedNotebookGuid) {
      Log.log('_selectedNotebookGuid=', this._selectedNotebookGuid);

      return {
        notebookGuid: this._selectedNotebookGuid,
        tags: []
      };
    }


    var notebookSelection = Prefs.prefs.notebookSelection;
    Log.log('nbSelection=',notebookSelection);

    ///this._subPanels.notebookPanel.imported.highlightNotebookByGuid(defaultSelectionGuid);
    if (notebookSelection === 'smart') {
      // select smart filing notebook
      return this._getWebClip().getFilingInfoPromise().then(function(r) {
        return {
          notebookGuid: r.notebook && r.notebook.guid || getDefault(result),
          tags: r.tags,
        };
      });
    } else if (notebookSelection === 'fixed') {
      return {
        notebookGuid: Prefs.prefs.defaultNotebookGuid || getDefault(result),
        tags: [],
      };
    } else /*if (Prefs.prefs.notebookSelection == 'last')*/ {
      // Select previously chosen notebook
      return {
        notebookGuid: Toolbar.lastNotebookGuid || getDefault(result),
        tags: []
      };
    }
  }.bind(this))
  .then(function(selection){
    var {notebookGuid, tags} = selection;

    tags = tags.concat(Evernote.getDefaultTags());
    tags = Util.unique(tags);

    this._selectedNotebookGuid = notebookGuid;

    if (notebookGuid) {
      let notebook = Evernote.getNotebookByGuid(notebookGuid);
      if (notebook) {
        this._channel.imported.selectNotebook(notebook, true);
      }
      this._subPanels.notebookPanel.imported.highlightNotebookByGuid(notebookGuid);
    }
    this._channel.imported.addTags(tags);
  }.bind(this), function(err){
        Log.log('FAILED in _updateNotebooks');
        Log.exception(err);
      });

};

Toolbar.prototype._suggestTags = function _suggestTags(prefix, x, y) {
  if (!this._selectedNotebookGuid) { return; }
  var pt = this._offsetByIframe(x, y);
  this._subPanels.tagPanel.create().then(function(){
    var nb = Evernote.getNotebookByGuid(this._selectedNotebookGuid);
    var tags = Evernote.suggestTags(nb, prefix);
    if (tags && tags.length > 0) {
      Log.log("SUGGESTED TAGS", tags);
      this._subPanels.tagPanel.imported.showTags(tags);
      this._subPanels.tagPanel.show(pt.x, pt.y);
    } else {
      this._subPanels.tagPanel.hide();
    }
  }.bind(this));
};

TabTracker.addClass(Toolbar, 'Toolbar');


exports.init = init;
exports.on = Event.on.bind(null, exports);
exports.once = Event.once.bind(null, exports);
exports.removeListener = function removeListener(type, listener) {
  Event.off(exports, type, listener);
};

