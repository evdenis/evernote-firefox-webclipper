/**
 * Created by mz on 2014-07-31.
 */

var { emit, on, once, off } = require("sdk/event/core");
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');

const Data = require('sdk/self').data;

var Evernote = require('./evernote');
var Log = require('./log');
var Net = require('./net');
var NoteUtil = require('./note-util');
var TabTracker = require('./tracker').TabTracker;
var Xslt = require('./xslt');
var Util = require('./util');
var md5 = require('./md5');

function DataClipper(tabInfo) {
  this.initialize(tabInfo);
}

DataClipper.prototype.initialize = function(tabInfo) {
  this.classId = 'DataClipper';

  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  this.clip = this.tabInfo.getInstance('WebClip');
  //this.viewer = this.tabInfo.getInstance('UrlViewer');
  this.showing = false;

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);

  this.cancel = this.cancel.bind(this);
  this.finish = this.finish.bind(this);
  this.onDiscarded = this.onDiscarded.bind(this);
  this.onClipSaved = this.onClipSaved.bind(this);
  this.onClipHidden = this.onClipHidden.bind(this);

  this.clip.on("discarded", this.onDiscarded);
  this.clip.on("saved", this.onClipSaved);
  this.clip.on("hide", this.onClipHidden);

  this.readyState = 'detached';
}
//DataClipper.prototype = Object.create(TabbedClass.prototype);

DataClipper.prototype.start = function() {
  Log.log("DataClipper.start");
  this.readyState = 'loading';
  this.article = this.clip.article;
  this.article.selectedElement = null;
  this.show();
}

DataClipper.prototype.show = function() {
  Log.log("DataClipper.show");
  //var browser = this.tabInfo.browser;
  //var parent = browser.parentElement;

  this.showing = true;
}

DataClipper.prototype.hide = function() {
  Log.log("DataClipper.hide");

  this.showing = false;
}

DataClipper.prototype.cancel = function(e) {
  this.hide();
  Log.log("DataClipper.cancel");
  Log.exception(e);
  this.readyState = 'attached';
}

DataClipper.prototype.finish = function() {
  Log.log("DataClipper.finish");
}

DataClipper.prototype.onDiscarded = function() {
  Log.log("DataClipper.onDiscarded");
  this.hide();
  this.readyState = 'attached';
}

DataClipper.prototype.onClipHidden = function() {
  Log.log("DataClipper.onClipHidden");
  this.hide();
  this.readyState = 'loaded';
}

DataClipper.prototype.onClipSaved = function() {
  Log.log("DataClipper.onClipSaved");
  this.hide();
  this.readyState = 'loaded';
}

DataClipper.prototype.onEnterPage = function(tab) {
  Log.log("DataClipper.onEnterPage");
  this.readyState = 'attached';
}

DataClipper.prototype.onLeavePage = function(tab) {
  Log.log("DataClipper.onLeavePage");
  this.hide();
  this.readyState = 'detached';
}

/**
 * creates a note
 */
DataClipper.prototype.createNote = promised(function(note, template, hash, title, srcUrl, mime, comment) {
  var rsrc = note.resources[0];
  mime = mime || rsrc.mime;
  hash = hash || rsrc.hash;

  var mapping = {
    hash: hash,
    title: title,
    url: srcUrl,
    mime: mime
  };

  var outputDoc = Xslt.processTemplate(template, mapping, {replaceOriginal: true});
  Xslt.appendComment(outputDoc, comment);
  note.xmlDoc = outputDoc;
  note.content = Util.serializeXmlDocument(outputDoc);
  Log.log("created note:", note);
  Log.log(Util.serializeXmlDocument(outputDoc));
  return note;
});

DataClipper.prototype.serialize = function(clip) {

  Log.log("DataClipper.serialize", clip.article);
  var doc = this.tabInfo.getContentDocument();
  if (!doc) {
    return reject("Cannot find source doc");
  }
  var mime = doc.contentType;

  var note = NoteUtil.createNote();
  var templatePromise = Util.loadXmlDocument(Data.url('screenshot-tmpl.xml'), false);
  var article = clip.article;
  var title =  article.title;
  var src = article.sourceUrl.href;

  var contentHashPromise = Net.sendXhrBinary(null, src)
  .then(function(data){
     var {resource, hash} = NoteUtil.arrayBufferToResource(data, src, mime);
     resource.attributes.attachment = false;
     resource.attributes.fileName = article.sourceUrl.filename;
     // Store resources inside the note.
     note.resources.push(resource);
     return hash;
  }.bind(this));
  return this.createNote(note, templatePromise, contentHashPromise, title, src, mime, article.comment);
}

DataClipper.prototype.clipImmediate = function(src, mime, fileName, title) {
  var note = NoteUtil.createNote();

  var templatePromise = Util.loadXmlDocument(Data.url('screenshot-tmpl.xml'), false);
  var contentHashPromise = Net.sendXhrBinary(null, src)
  .then(function(data){
    // images will have to have mime type deduced, it's done inside of arrayBufferToResource
    // and then stored inside the resource
    var {resource, hash} = NoteUtil.arrayBufferToResource(data, src, mime);
    resource.attributes.attachment = false;
    resource.attributes.fileName = fileName;
    // Store resources inside the note.
    note.resources.push(resource);
    return hash;
  }.bind(this));
  return this.createNote(note, templatePromise, contentHashPromise, title, src, mime);
}

function getInstance(tab) {
  return TabTracker.getInstance(tab, 'DataClipper');
}

TabTracker.addClass(DataClipper, 'DataClipper');

exports.getInstance = getInstance;
