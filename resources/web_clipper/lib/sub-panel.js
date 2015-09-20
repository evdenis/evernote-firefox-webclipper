var { emit, on, once, off } = require("sdk/event/core");

var Auth = require('./auth');
var ContentWorker = require("sdk/content/worker").Worker;
var Data = require('sdk/self').data;
var Tabs = require("sdk/tabs");
var TabsUtil = require("sdk/tabs/utils");

var Log = require('./log');
var TabTracker = require('./tracker').TabTracker;
var UIDispatch = require('./ui-dispatch');
var Url = require('./url');
var Util = require('./util');
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

/**
 * Reimplementation of arrow panels with more options.
 */
function SubPanel(parent, options) {
  options = options || {};
  this.parent = parent;
  this.loaded = false;

  if (options.parentElement) {
    this._document = options.parentElement.ownerDocument;
  } else {
    this._document = this.parent.getOwnerDocument();
  }
  this._window = this._document.defaultView;
  this.tabInfo = this.parent.tabInfo;
  if (!this.tabInfo) {
    throw new Error("NO TAB INFO");
  }

  this.id = parent.id + '-subpanel';

  this.parentElement = options.parentElement || this._document.body;
  this.anchorElement = options.anchorElement;
  this.fixedSize = !!options.fixedSize;

  this.onLoaded = options.onLoaded;
  this.contentScriptOptions = options.contentScriptOptions || {};
  this.contentScriptOptions.l10n = require("@l10n/data");

  this.contentScriptFile = options.contentScriptFile || [];
  this.width = options.width || 280;
  this.height = options.height || 280;
  this.borderRadius = options.borderRadius === undefined ? 4 : options.borderRadius;
  this.borderWidth = options.borderWidth === undefined ? 1 : options.borderWidth;
  this.maxHeight = options.maxHeight;
  this.maxWidth = options.maxHeight;
  this.minHeight = options.minHeight;
  this.minWidth = options.minWidth;

  this.arrowWidth = options.arrowWidth || 6;
  this.arrowHeight = options.arrowHeight || 12;
  this.arrowUrl = options.arrowUrl || Data.url('images/arrow-right.png');
  this.arrowInset = options.arrowInset || 1;
  this.arrowType = options.arrowType || 'right' // 'none'

  this.x = (options.x === undefined) ? 100 : options.x;
  this.y = (options.y === undefined) ? 100 : options.y;
  this.contentUrl = options.contentUrl || 'about:blank';
  this.showing = false;
  this.vtable = options.vtable || this;


  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);
  this.emit = emit.bind(null, this);
}

SubPanel.prototype.create = function create() {
  this._pane = this._document.createElement('box');
  this._arrow = this._document.createElement('box');
  this._pane.appendChild(this._arrow);

  this._createArrowBox(this.arrowType, this.x, this.y, this.width, this.height);
  Util.merge({
    backgroundColor: '#fff',
    transition: 'all 0.3s',
    MozTransition: 'all 0.3s',
    overflow: 'visible',
    pointerEvents: 'none',
    opacity: '0',
    borderRadius: this.borderRadius + 'px',
    boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.3)',
    borderColor: '#000',
    borderStyle: 'solid',
    borderWidth: this.borderWidth + 'px',
  }, this._pane.style);

  Util.merge(options.paneStyle, this._pane.style);
  Util.merge(options.arrowStyle, this._pane.firstChild.style);

  var innerBox = this._document.createElement('box');
  Util.merge({
    position: 'absolute',
    top: '0px',
    left: '0px',
    right: '0px',
    bottom: '0px',
    border: 'none',
    overflow: 'hidden',
    borderRadius: this.borderRadius + 'px',
  }, innerBox.style);
  this._pane.appendChild(innerBox);

  var iframe = this._iframe = this._document.createElementNS(XUL_NS, 'iframe'); //doc.createElement('IFRAME');
  Util.merge({
    position: 'absolute',
    top: '0px',
    left: '0px',
    right: '0px',
    bottom: '0px',
    border: 'none',
    width: '100%',
    height: '100%',
  }, iframe.style);
  Util.merge(options.iframeStyle, iframe.style);

  Util.mergeAttr({
    border: 0,
    seamless: true,
    transparent: true,
    src: 'about:blank'
  }, iframe);
  innerBox.appendChild(iframe);

  this.parentElement.appendChild(this._pane);

  var contentWindow = this.contentWindow = iframe.contentWindow;
  if (!contentWindow) {
    Log.error("IFRAME doesn't have a contentWindow");
    return;
  }

  if (this.contentUrl) {
    contentWindow.location.href = this.contentUrl;
    Log.log("URL=" + this.contentUrl);
  }

  var that = this;

  iframe.addEventListener('load', function onLoaded(event) {
    iframe.removeEventListener('load', onLoaded, true);
    that._createWorker();
  }.bind(this), true);
};

SubPanel.prototype.getRootElement = function() {
  return this._pane;
}

SubPanel.prototype._createBox = function(x, y, width, height) {
  var box = this._document.createElement('box');
  Util.merge({
    position: 'absolute',
    left: x + 'px',
    top: y + 'px',
    width: width + 'px',
    height: height + 'px',
    backgroundSize: width + 'px ' + height + 'px',
  }, box.style);

  return box;
}

SubPanel.prototype._createArrowBox = function(type, anchorX, anchorY, width, height, offset) {
  var arrowX, arrowY;
  var paneX, paneY;
  var arrow = this._arrow;
  var panel = this._pane;
  anchorX = Math.floor(anchorX);
  anchorY = Math.floor(anchorY);
  width = Math.floor(width);
  height = Math.floor(height);
  var arrowStyle = {
    position: 'absolute',
    width: this.arrowWidth + 'px',
    height: this.arrowHeight + 'px',
    transformOrigin: 'left center',
    backgroundSize: this.arrowWidth + 'px ' + this.arrowHeight + 'px',
    backgroundImage: 'url(\''+this.arrowUrl+'\')',
    top: 0 + 'px',
    left: 0 + 'px',
    zIndex: '1',
  };
  var panelStyle = {
    position: 'absolute',
    overflow: 'visible',
    left: 0 + 'px',
    top: 0 + 'px',
    width: width + 'px',
    height: height + 'px',
  };
  if (type === 'right') {
    offset = offset || height/2;

    arrowX = anchorX - this.arrowWidth;
    arrowY = anchorY;
    paneX = arrowX - width + this.arrowInset;
    paneY = arrowY - offset;

    arrowStyle.left = (arrowX - paneX - this.arrowInset) + 'px';
    arrowStyle.top = (arrowY - paneY - this.arrowHeight/2) + 'px';
    panelStyle.left = paneX + 'px';
    panelStyle.top = paneY + 'px';

  } else if (type === 'bottom') {
    offset = offset || width/2;

    arrowX = anchorX;
    arrowY = anchorY - this.arrowWidth;
    paneX = arrowX - width/2;
    paneY = arrowY - height + this.arrowInset;
    arrowStyle.transform = arrowStyle.MozTransform = 'rotate(90deg)';

    panelStyle.left = paneX + 'px';
    panelStyle.top = paneY + 'px';
    arrowStyle.left = (arrowX - paneX) + 'px';
    arrowStyle.top = (arrowY - paneY - this.arrowInset - this.arrowWidth) + 'px';
  } else if (type === 'left') {
    offset = offset || height/2;

    arrowX = anchorX + this.arrowWidth;
    arrowY = anchorY;
    paneX = arrowX - this.arrowInset;
    paneY = arrowY - offset;
    arrowStyle.transform = arrowStyle.MozTransform = 'rotate(180deg)';

    arrowStyle.left = (this.arrowInset - 1) + 'px'; // why -1 ??
    arrowStyle.top = (arrowY - paneY - this.arrowHeight/2) + 'px';
    panelStyle.left = paneX + 'px';
    panelStyle.top = paneY + 'px';
  } else if (type === 'top') {
    offset = offset || width/2;

    arrowX = anchorX;
    arrowY = anchorY + this.arrowWidth;
    paneX = arrowX - offset;
    paneY = arrowY - this.arrowInset;
    arrowStyle.transform = arrowStyle.MozTransform = 'rotate(270deg)';
    arrowStyle.left = (arrowX - paneX) + 'px';
    arrowStyle.top = (this.arrowInset - this.arrowWidth - 1) + 'px';
    panelStyle.left = paneX + 'px';
    panelStyle.top = paneY + 'px';
  }

  Util.merge(arrowStyle, arrow.style);
  Util.merge(panelStyle, panel.style);

  //Log.log("panel::", panel.style.left, panel.style.top);
  return panel;
}

SubPanel.prototype._createWorker = function _createWorker() {
  var that = this;
  this.worker = ContentWorker({
    window: this.contentWindow,
    contentScriptFile: this.contentScriptFile,
    contentScriptOptions: this.contentScriptOptions,

    onDetach: function() {
      Log.log('SubPanel:onDetach ' + this.id);
      this.release();
    }.bind(this),

    onError: function(err) {
      Log.log('SubPanel:onError ' + this.id + ' ' + err);
    }.bind(this),

    onMessage: function(msg) {
      Log.log('SubPanel:onMessage '+ msg);

    }.bind(this)
  });

  this.port = this.worker.port;
  UIDispatch.dispatch(this.port, this.vtable);

  Util.portForward(this.port, this.tabInfo, 'ui-cmd', 'ui-action');
  Util.portForward(this.tabInfo, this.port, 'ui-action', 'ui-action' );

  this.channel = UIDispatch.createChannel(this.port);
  var exported = this.channel.exported;
  exported.adjustSize = this.adjustSize.bind(this);
  exported.adjust = this.adjust.bind(this);
  exported.hide = this.hide.bind(this);
  exported.show = this.show.bind(this);

  this.loaded = true;

  if (this.onLoaded) {
    this.onLoaded();
  }
  this.emit('loaded');

  this.adjust();
  this.adjustSize();
}

function afterLoaded(f) {
  return function(/* arguments */) {
    if (this.loaded) {
      return f.apply(this, arguments);
    }
    var args = Array.prototype.slice.apply(arguments);
    var that = this;
    this.once('loaded', function() {
      f.apply(that, args);
    });
  }
}
SubPanel.prototype.adjustSize = function(width, height) {
  if (this.fixedSize) return;
  if (!this.loaded) {
    let that = this;
    this.once('loaded', function() {
      that.adjustSize(width, height);
    });
    return;
  }
  var content = this._iframe.contentDocument;
  if (width === undefined) {
    width = content.body.clientWidth;
  }
  if (height === undefined) {
    height = content.body.clientHeight;
  }
  this._pane.style.width = width + this.borderWidth*2 + 'px';
  this._pane.style.height = height + this.borderWidth*2 + 'px';
}

SubPanel.prototype.adjust = function() {

  function printBoxObject(bo) {
    if (!bo) {
      Log.log('none'); return;
    }
    Log.log('('+bo.x+','+bo.y+')',
    '('+bo.screenX+','+bo.screenY+')',
    bo.width+' x ' + bo.height);
  }

  function getBoxObject(el) {

    if (el.boxObject) return el.boxObject;
    let window = el.ownerDocument.defaultView;

    if (!el.getBoundingClientRect) {
      return {
        x: el.clientLeft || 0,
        y: el.clientTop || 0,
        width: el.clientWidth || 0,
        height: el.clientHeight || 0,
        screenX: (el.clientLeft||0) + window.mozInnerScreenX,
        screenY: (el.clientTop||0) + window.mozInnerScreenY,
      };
    }

    let clientRect = el.getBoundingClientRect();
    //Log.log("using getBoundingClientRect");
    return {
          x: clientRect.left,
          y: clientRect.top,
          width: clientRect.width,
          height: clientRect.height,
          screenX: clientRect.left + window.mozInnerScreenX,
          screenY: clientRect.top + window.mozInnerScreenY,
    };
  }
  if (!this.loaded) {
    let that = this;
    this.once('loaded', function() {
      that.adjust();
    })
    return;
  }

  if (this.anchorElement) {

    let parentBox = getBoxObject(this.parentElement);
    //printBoxObject(parentBox);
    //Log.log('anchor',this.anchorElement);
    let anchorBox = getBoxObject(this.anchorElement);
    //printBoxObject(anchorBox);

    let ax = anchorBox.screenX - parentBox.screenX;
    let ay = anchorBox.screenY - parentBox.screenY;
    //Log.log('delta=',ax,ay);
    //Log.log('offset=',this.x, this.y);

    this._createArrowBox(this.arrowType, ax + this.x, ay + this.y, this.width, this.height);

  } else {
    //Log.log('parent');
    //printBoxObject(this.parentElement.boxObject);

  }
}

SubPanel.prototype._createArrow = function(type, offset, fromEnd) {
  //options = options || {};
  var baseOffsetX = this.arrowInset;
  //type = type || this.arrowType;
  var baseOffsetY = this.arrowHeight/2;
  if (offset < baseOffsetY) {
    offset = baseOffsetY;
  }
  var style = {
    position: 'absolute',
    width: this.arrowWidth + 'px',
    height: this.arrowHeight + 'px',
    transformOrigin: 'left center',
    backgroundSize: this.arrowWidth + 'px ' + this.arrowHeight + 'px',
    backgroundImage: 'url(\''+this.arrowUrl+'\')',
  };
  if (type === 'right') {
    if (fromEnd) {
      style.bottom = (offset - baseOffsetY) + 'px';
    } else {
      style.top = (offset - baseOffsetY) + 'px';
    }
    style.right = (baseOffsetX - this.arrowWidth) + 'px';
  } else if (type === 'bottom') {
    style.transform = style.MozTransform = 'rotate(90deg)';
    if (fromEnd) {
      style.right = (offset - baseOffsetY) + 'px';
    } else {
      style.left = offset + 'px';
    }
    style.bottom = (baseOffsetX - this.arrowWidth) + 'px';
  } else if (type === 'left') {
    style.transform = style.MozTransform = 'rotate(180deg)';
    style.left = baseOffsetX + 'px';
    if (fromEnd) {
      style.bottom = (offset - baseOffsetY) + 'px';
    } else {
      style.top = (offset - baseOffsetY) + 'px';
    }
  } else if (type === 'top') {
    style.transform = style.MozTransform = 'rotate(270deg)';
    style.top = (baseOffsetX - this.arrowWidth) + 'px';
    if (fromEnd) {
      style.left = offset + 'px';
    } else {
      style.right = (offset - baseOffsetY) + 'px';
    }
  }
  var box = this._document.createElement('box');
  Util.merge(style, box.style);
  return box;
}

SubPanel.prototype.show = function() {
  Log.log('SubPanel.show',this.contentUrl);
  if (this._pane) {
    this._pane.style.pointerEvents = 'auto';
    this._pane.style.opacity = "1";
  }
  if (!this.showing) {
    if (this.port) {
      this.port.emit('show');
    }
    this.emit('show');
  }
  this.showing = true;
}

SubPanel.prototype.hide = function() {
  Log.log('SubPanel.hide',this.contentUrl);
  if (this._pane) {
    this._pane.style.pointerEvents = 'none';
    this._pane.style.opacity = "0";
  }
  if (this.showing) {
    if (this.port) {
      this.port.emit('hide');
    }
    this.emit('hide');
  }
  this.showing = false;
}

SubPanel.prototype.toggle = function() {
  Log.log('SubPanel.toggle',this.contentUrl);

  if (this.showing) {
    this.hide();
  } else {
    this.show();
  }
}

SubPanel.prototype.release = function() {
  Log.log('Subpanel ', this.id, 'Detached');
  this.showing = false;
  this._document = null;
  this._window = null;
  if (this._pane && this._pane.parentElement) {
    this._pane.parentElement.removeChild(this._pane);
  }
  this._pane = null;
  this.worker = this.port = this.channel = null;
}

exports.SubPanel = SubPanel;
