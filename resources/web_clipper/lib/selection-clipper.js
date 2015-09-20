/**
 * Created by mz on 2014-07-31.
 */

var { emit, on, once, off } = require("sdk/event/core");

var Evernote = require('./evernote');
var Log = require('./log');
var TabTracker = require('./tracker').TabTracker;
var Xslt = require('./xslt');
var Util = require('./util');

function TabbedClass(tabInfo) {

}


function SelectionClipper(tabInfo) {
  this.classId = 'SelectionClipper';

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

SelectionClipper.prototype = Object.create(TabbedClass.prototype);

SelectionClipper.prototype.start = function() {
  Log.log("SelectionClipper.start");

  this.readyState = 'loading';
  this.article = this.clip.article;
  this.article.selectedElement = null;
  this.show();
}

SelectionClipper.prototype.show = function(element) {
  Log.log("SelectionClipper.show");
  //var browser = this.tabInfo.browser;
  //var parent = browser.parentElement;

  this.showing = true;
}

SelectionClipper.prototype.hide = function(element) {
  Log.log("SelectionClipper.hide");

  this.showing = false;
}

SelectionClipper.prototype.cancel = function(e) {
  this.hide();
  Log.log("SelectionClipper.cancel");
  Log.exception(e);
  this.readyState = 'attached';
}

SelectionClipper.prototype.finish = function() {
  Log.log("SelectionClipper.finish");
}

SelectionClipper.prototype.onDiscarded = function() {
  Log.log("SelectionClipper.onDiscarded");
  this.hide();
  this.readyState = 'attached';
}

SelectionClipper.prototype.onClipHidden = function() {
  Log.log("SelectionClipper.onClipHidden");
  this.hide();
  this.readyState = 'loaded';
}

SelectionClipper.prototype.onClipSaved = function() {
  Log.log("SelectionClipper.onClipSaved");
  this.hide();
  this.readyState = 'loaded';
}

SelectionClipper.prototype.onEnterPage = function(tab) {
  Log.log("SelectionClipper.onEnterPage");
  this.readyState = 'attached';
}

SelectionClipper.prototype.onLeavePage = function(tab) {
  Log.log("SelectionClipper.onLeavePage");
  this.hide();
  this.readyState = 'detached';
}

SelectionClipper.prototype.serialize = function(clip) {
  Log.log("SelectionClipper.serialize", clip, this.tabInfo.contentDocument);
  return Xslt.serialize(this.tabInfo.contentDocument, {
    title: clip.article.title,
    tagNames: clip.article.tagNames,
    comment: clip.article.comment,
    selectedElement: this.selectedElement,
    ignoreSelection: false,
    output: 'enml',
    debug: false,
    styles: true,
    pseudoElements: true,
    removeDefaults: true,
    clipDestination: Evernote.getClipDestination(),
  });
}

function getInstance(tab) {
  return TabTracker.getInstance(tab, 'SelectionClipper');
}

TabTracker.addClass(SelectionClipper, 'SelectionClipper');

exports.getInstance = getInstance;