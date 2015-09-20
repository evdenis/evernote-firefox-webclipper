/**
 * Created by mz on 15-02-04.
 */
const Data = require('sdk/self').data;
const Sandbox = require('sdk/loader/sandbox');
var { emit, on, once, off } = require('sdk/event/core');
const { defer, resolve, reject, promised } = require('sdk/core/promise');

const Log = require('./log');
const TabTracker = require('./tracker').TabTracker;
const Util = require('./util');

function ArticleDetector(tabInfo) {
  this.tabInfo = tabInfo;
  this._id = tabInfo.id;
  this._sandbox = null;
  this._deferred = null;

  Util.bindAll(this);

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);

}

ArticleDetector.prototype.onEnterPage = function(tab) {
  Log.log('ArticleDetector.onEnterPage');
};

ArticleDetector.prototype.onLeavePage = function(tab) {
  Log.log('ArticleDetector.onLeavePage');
  if (this._deferred) {
    this._deferred.reject(new Error('onLeavePage'));
    this._deferred = null;
  }
  if (this._sandbox) {
    Sandbox.nuke(this._sandbox);
    this._sandbox = null;
  }
};

ArticleDetector.prototype.fetchArticle = function() {
  Log.log('ArticleDetector.fetchArticle');

  return this._runDetect().then(function(pageInfo) {
    Log.log('ArticleDetector._runDetect.resolve',pageInfo);
    return pageInfo;
  }.bind(this), function(e) {
    Log.exception(e);
    // will retry article detection on the next call.
    this._deferred = null;
    throw e;
  }.bind(this));
};

ArticleDetector.prototype._runDetect = function() {
  Log.log('ArticleDetector._runDetect');
  if (this._deferred) {
    Log.log('Already started');
    return this._deferred.promise;
  }

  this._deferred = defer();

  var contentWindow = this.tabInfo.contentWindow || Util.getTabWindow(this.tabInfo.tab);
  if (!contentWindow) {
    this._deferred.reject(new Error('No content window'));
    return this._deferred.promise;
  }

  this._sandbox = Sandbox.sandbox(contentWindow,
  {
    sandboxName: 'Clearly-' + this._id,
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
  this._sandbox.debug = /*!!this.options.debug*/false;

  Sandbox.load(this._sandbox, Data.url('third_party/jquery-1.8.3.min.js'));
  Sandbox.load(this._sandbox, Data.url('clearly/js/detect.js'));
  Sandbox.load(this._sandbox, Data.url('article.js'));

  var deferred = this._deferred;
  function callback(clearlyInfo) {
    var pageInfo = {
      selectedElement: null,
      title: null,
      rtl: null,
      other: null,
      html: null,
    };

    if (clearlyInfo._elements && clearlyInfo._elements.length) {
      Log.log('Articles found:', clearlyInfo._elements.length);
      pageInfo.selectedElement = clearlyInfo._elements[clearlyInfo._elements.length - 1];
    }
    if (clearlyInfo._title) {
      let title = clearlyInfo._title;
      title = title.replace(/<[^>]*>/gi, '');
      pageInfo.title = title;
    }
    pageInfo.other = clearlyInfo._elements;
    pageInfo.html = clearlyInfo._html;
    deferred.resolve(pageInfo);
  }

  this._sandbox.startDetect(callback);
  return deferred.promise;
};

TabTracker.addClass(ArticleDetector, 'ArticleDetector');
