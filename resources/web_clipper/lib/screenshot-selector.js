/**
 * Created by mz on 15-01-10.
 */
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');
const { emit, on, once, off } = require('sdk/event/core');
const _ = require('sdk/l10n').get;

const Data = require('sdk/self').data;
const Log = require('./log');
const NoteUtil = require('./note-util');
const TabTracker = require('./tracker').TabTracker;
const Util = require('./util');
const Xslt = require('./xslt');

function ScreenshotSelector(tabInfo) {
  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  this.readyState = 'detached';
  this.rectSelector = this.tabInfo.getInstance('RectSelector');
  Util.bindAll(this);
}

ScreenshotSelector.prototype.getSkitch = function() {
  return this.tabInfo.getInstance('Skitch');
};

ScreenshotSelector.prototype.getToolbar = function() {
  var toolbar = this.tabInfo.getInstance('Toolbar');
  return toolbar;
};

ScreenshotSelector.prototype.start = function() {
  this.readyState = 'loading';
  this.document = this.tabInfo.contentDocument;
  this.rectSelector.start().then(
      function(sc) {
        this.doCapture(sc.window, sc.left, sc.top, sc.width, sc.height);
      }.bind(this),
      function onCancel() {
        Log.log('ScreenshotSelector cancel');
        this.getToolbar().onScreenshotCancelled(true);
      }.bind(this)
  );
  this.getToolbar().setSpecialMode('screenshot');
};

ScreenshotSelector.prototype.onEnterPage = function(tab) {
  this.readyState = 'attached';
};

ScreenshotSelector.prototype.onLeavePage = function(tab) {
  this.document = null;
  this.readyState = 'detached';
  this.cancel();
};

ScreenshotSelector.prototype.cancel = function(e) {
  Log.log('ScreenshotSelector.cancel',e);
  this.getSkitch().cancel();
  // Util.leaveModalState(this.tabInfo.contentWindow);
};

ScreenshotSelector.prototype.onDiscarded = function(e) {
  Log.log('ScreenshotSelector.onDiscarded',e);
  this.rectSelector.hide();
};

ScreenshotSelector.prototype.finish = function() {
  Log.log('ScreenshotSelector.finish');
  this.rectSelector.hide();
  this.getSkitch().cancel();
};

ScreenshotSelector.prototype.doCapture = function(window,left,top,width,height) {
  Log.log('ScreenshotSelector.doCapture',window.location.href, left, top, width, height);

  this.document = this.tabInfo.contentDocument;

  // click
  if (width === 0 || height === 0) {
    width = window.innerWidth;
    height = window.innerHeight;
    left = 0;
    top = 0;
  }
  if (width < 0) {
    left += width;
    width = -width;
  }
  if (height < 0) {
    top += height;
    height = -width;
  }
  this.rectSelector.hide();
  this.getToolbar().setSpecialMode('annotate');
  this.getSkitch().start(window, left, top, width, height);
};

ScreenshotSelector.prototype.saveClip = function(clip) {
  Log.log('ScreenshotSelector.saveClip');
  //this.getToolbar().onScreenshotCancelled();
  this.getToolbar().onClipCompleted();
};

ScreenshotSelector.prototype.serialize = function(clip) {

  Log.log('ScreenshotSelector.serialize');
  this.document = clip.document;

  var note = NoteUtil.createNote();

  var mapping = {
    title: clip.article.title,
    url: clip.article.sourceUrl.href,
    hash: '',
    mime: 'image/jpeg'
  };

  var promise = this.getSkitch().getImageData().then(function(data){
    mapping.mime = data.mime;
    return data.bytes;
  }).then(function(ab) {
    var {resource, hash} = NoteUtil.arrayBufferToResource(ab, mapping.url, mapping.mime);
    note.resources.push(resource);
    mapping.hash = hash;
    return Util.loadXmlDocument(Data.url('screenshot-tmpl.xml'), false);
  }).then(function(xml){
    var outputDoc = Xslt.processTemplate(xml, mapping, {
      replaceOriginal: true
    });
    Xslt.appendComment(outputDoc, clip.article.comment);
    note.xmlDoc = outputDoc;
    note.content = Util.serializeXmlDocument(outputDoc);
    Log.log(note.content);
    return note;
  });
  return promise;
};

ScreenshotSelector.prototype.onClipSaved = function(e) {
  Log.log('ScreenshotSelector.onClipSaved',e);
};

TabTracker.addClass(ScreenshotSelector, 'ScreenshotSelector');
