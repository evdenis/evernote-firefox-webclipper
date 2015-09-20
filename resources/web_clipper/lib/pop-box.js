/**
 * Created by mz on 15-01-05.
 */
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');

var Data = require('sdk/self').data;
const Log = require('./log');
const UIDispatch = require('./ui-dispatch');
const Util = require('./util');

function PopBox(args) {
  // validate args.
  this._id = args.id;
  this._arrowType = args.arrowType || 'top';
  if (!args.parentElement) {
    throw ReferenceError('PopBox: Null window passed');
  }
  this._parentElement = args.parentElement;
  this._document = this._parentElement.ownerDocument;
  this._window = this._document.defaultView;
  this._channel = UIDispatch.createChannel(null, args.context, args.exported);

  this._screenX = this._screenY = 0;
  this._width = args.width || 100;
  this._height = args.height || 100;

  this._src = args.src;
  this._contentScriptFile = args.contentScriptFile;
  this._contentScriptOptions = args.contentScriptOptions;
  this._port = null;

  Util.bindAll(this);

  this._channel.exported.show = this.show;
  this._channel.exported.hide = this.hide;
  this._channel.exported.toggle = this.toggle;
  this._channel.exported.adjustSize = this.adjustSize;

  this._onShow = args.onShow || 0;
  this._onHide = args.onHide || 0;

  var that = this;
  Object.defineProperty(this, 'imported', {
    get: function () {
      return that._channel.imported;
    }.bind(this),
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(this, 'port', {
    get: function () {
      return that._port;
    }.bind(this),
    configurable: true,
    enumerable: true
  });
}



/**
 * Actually creates necessary DOM elements and allocates resources.
 * Called as needed by _show
 * @private
 */
PopBox.prototype.create = function _create() {
  Log.log('PopBox._create');
  var root = this._getRootElement();
  if (root) { return resolve(root); }
  var deferred = defer();

  root = this._document.createElement('box');
  root.setAttribute('id', this._id);

  var arrow = this._createArrow(this._arrowType);
  root.appendChild(arrow);

  Util.merge({
        //position: 'absolute',
        //overflow: 'visible',
        width: this._width + 'px',
        height: this._height + 'px',
        //border: '1px solid rgba(0,0,0,0.3)',
        //borderRadius: '4px',
        //backgroundColor: '#fff',
        //zIndex: '20',
        opacity: '0',
        pointerEvents: 'none'
      }, root.style
  );
  root.setAttribute('class', 'evernote-popbox');
  this._parentElement.appendChild(root);

  var iframe = Util.createIframe(this._src, root, {
    contentScriptFile: this._contentScriptFile,
    contentScriptOptions: this._contentScriptOptions,
    channel: this._channel,
    onLoad: function onLoad(iframe, workerPort, channel) {
      this._port = workerPort;
      deferred.resolve(root);
    }.bind(this),
    onUnload: function onUnload() {
      this._port = null;
    }.bind(this),
  });


  return deferred.promise;
};

const ARROW_WIDTH = 6;
const ARROW_HEIGHT = 12;

PopBox.prototype._createArrow = function _createArrow(arrowType) {
  var arrow = this._document.createElement('box');
  arrow.setAttribute('id', this._id + '-arrow');
  arrow.setAttribute('class', 'evernote-popbox-arrow');

  Util.merge({
    overflow: 'visible',
    position: 'absolute',
    width: '0',
    height: '0',
  }, arrow.style);

  var inner = this._document.createElement('box');
  inner.setAttribute('id', this._id + '-arrowimg');
  arrow.setAttribute('class', 'evernote-popbox-arrowimg');

  Util.merge({
    position: 'absolute',
    top: (-ARROW_HEIGHT/2) + 'px',
    left: '0',
    width: ARROW_WIDTH + 'px',
    height: ARROW_HEIGHT + 'px',
    transformOrigin: 'left center',
    backgroundSize: ARROW_WIDTH + 'px ' + ARROW_HEIGHT + 'px',
    backgroundImage: 'url(\''+ Data.url('images/arrow-right.png') +'\')',
  }, inner.style);

  switch(arrowType) {
    case 'top':
      arrow.style.top = '0';
      arrow.style.left = '50%';
      inner.style.transform = inner.style.MozTransform = 'rotate(270deg)';
      break;
    case 'bottom':
      arrow.style.bottom = '0';
      arrow.style.left = '50%';
      inner.style.transform = inner.style.MozTransform = 'rotate(90deg)';
      break;
    case 'left':
      arrow.style.top = '50%';
      arrow.style.left = '0';
      inner.style.transform = inner.style.MozTransform = 'rotate(180deg)';
      break;
    case 'right':
      arrow.style.top = '50%';
      arrow.style.right = '0';
      break;
  }

  arrow.appendChild(inner);

  return arrow;
};

/**
 * Release all allocated resources and DOM elements
 *
 */
PopBox.prototype.dispose = function destroy() {
  var root = this._getRootElement();
  if (root) {
    root.parentElement.removeChild(root);
  }
};

PopBox.prototype._getRootElement = function _getRootElement() {
  return this._document.getElementById(this._id);
};

PopBox.prototype._getArrowElement = function _getRootElement() {
  return this._document.getElementById(this._id + '-arrow');
};

PopBox.prototype.show = function show(x, y) {
  Log.log('PobBox.show',x, y);
  this.create().then(function(root){
    this._positionBox(root, x, y, this._width, this._height);
    root.style.opacity = '1';
    root.style.pointerEvents = 'auto';

    if (this._port) {
      this._port.emit('show');
    }
    if (typeof(this._onShow) === 'function') {
      this._onShow();
    }
    this._showing = true;
  }.bind(this));
};

PopBox.prototype._positionBox = function _poistionBox(root, screenX, screenY, width, height) {
  var parent = root.parentElement;
  if (this._screenX === screenX && this._screenY === screenY && this._width === width && this._height === height) {
    // nothing to change
    return;
  }

  var x = screenX - parent.boxObject.x;
  var y = screenY - parent.boxObject.y;
  switch(this._arrowType) {
    case 'left':
      root.style.top = (y - height/2) + 'px';
      root.style.left = (x + ARROW_WIDTH) + 'px';
      break;
    case 'right':
      root.style.top = (y - height/2) + 'px';
      root.style.left = (x - width - ARROW_WIDTH) + 'px';
      break;
    case 'top':
      root.style.top = (y + ARROW_WIDTH) + 'px';
      root.style.left = (x - width/2) + 'px';
      break;
    case 'bottom':
      root.style.top = (y - height - ARROW_WIDTH) + 'px';
      root.style.left = (x -  width/2) + 'px';
      break;
  }
  root.style.width = width + 'px';
  root.style.height = height + 'px';

  this._width = width;
  this._height = height;
  this._screenX = screenX;
  this._screenY = screenY;
};

PopBox.prototype.hide = function hide() {
  if (this._showing) {
    var root = this._getRootElement();
    if (root) {
      root.style.opacity = '0';
      root.style.pointerEvents = 'none';
    }
    if (this._port) {
      this._port.emit('hide');
    }
    if (typeof(this._onHide) === 'function') {
      this._onHide();
    }
  }
  this._showing = false;
};

PopBox.prototype.toggle = function toggle(x, y) {
  if (this._showing) {
    this.hide();
  } else {
    this.show(x, y);
  }
};

PopBox.prototype.adjustSize = function adjustSize(w, h) {
  var root = this._getRootElement();
  this._positionBox(root, this._screenX, this._screenY, w, h);
};



exports.PopBox = PopBox;