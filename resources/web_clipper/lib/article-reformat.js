const AddonWindow = require('sdk/addon/window');
const Data = require('sdk/self').data;

const { defer, resolve, reject, promised } = require('sdk/core/promise');

const Evernote = require('./evernote');
const Log = require('./log');
const TabTracker = require('./tracker').TabTracker;
const Util = require('./util');
const Xslt = require('./xslt');

const XUL_NS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

function ArticleReformat(tabInfo) {
  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  this.domId = 'evernote-clearly-frame' + this.id;
  this.readyState = 'detached';
  this.detector = this.tabInfo.getInstance('ArticleDetector');
  this.clip = this.tabInfo.getInstance('WebClip');
  this.article = this.clip.article;

  // flags
  this.addFootnotes = false;
  this.start = this.start.bind(this);

  this.injectContent(this.tabInfo.injectRoot);
}

ArticleReformat.prototype.injectContent = function(root) {
 var document = this.tabInfo.ownerDocument;

 var vbox = document.createElement('vbox');
 Util.merge({
    position: 'absolute',
    top: '0px',
    left: '0px',
    bottom: '0px',
    right: '0px',
    backgroundColor: 'blue',
    visibility: 'hidden',
    pointerEvents: 'none',
  }, vbox.style);
  Util.mergeAttr({
    id: this.domId,
  }, vbox);
  var iframe = document.createElementNS(XUL_NS, 'iframe');
  Util.merge({
    position: 'absolute',
    top: '0px',
    left: '0px',
    bottom: '0px',
    right: '0px',
    width: '100%',
    height: '100%',
  }, iframe.style);
  vbox.appendChild(iframe);
  root.appendChild(vbox);

  var iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    Log.log('ArticleReformat: no iframe');
    return;
  }
  iframe.addEventListener('load', function onLoaded(event) {
    iframe.removeEventListener('load', onLoaded, true);
    this.prepareIframe(iframe);
  }.bind(this), true);

  iframeWindow.location.href = Data.url('reformat.html');
};

ArticleReformat.prototype.getRootElement = function() {
  var document = this.tabInfo.ownerDocument;
  return document.getElementById(this.domId);
};

ArticleReformat.prototype.prepareIframe = function(iframe) {

};

ArticleReformat.prototype.hide = function() {
  var root = this.getRootElement();
  if (root) {
    root.style.visibility = 'hidden';
    root.style.pointerEvents = 'none';
  }
  Log.log('ArticleReformat.hide');
  this.showing = false;
};

ArticleReformat.prototype.show = function() {
  var root = this.getRootElement();
  if (root) {
    root.style.visibility = 'visible';
    root.style.pointerEvents = 'auto';
  }
  Log.log('ArticleReformat.show');
  this.showing = true;
};

ArticleReformat.prototype.onTabClosed = function() {
  var root = this.getRootElement();
  if (root) {
    root.parentElement.removeChild(root);
  }
  this.showing = false;
};

ArticleReformat.prototype.onEnterPage = function(tab) {
  this.readyState = 'empty';
  this.article = {};
  this.deferred = null;

  var location = this.tabInfo.contentDocument.location;
  Log.log('Enter:',location.href);
};

ArticleReformat.prototype.onLeavePage = function(tab) {
  this.sandbox = null;
  this.readyState = 'detached';
  this.article = null;
  //this.clip.on('discarded', this.onDiscarded.bind(this));
  //this.clip.on('saved', this.onClipSaved.bind(this));
  //this.clip.on('hide', this.onClipHidden.bind(this));
};

ArticleReformat.prototype.start = function(options) {
  if (this.readyState === 'loading') { return reject('ArticleSelector already running'); }
  if (!this.tabInfo.contentDocument) { return reject('ArticleSelector:No contentdocument'); }
  Log.log('ArticleReformat.start');

  this.readyState = 'loading';
  this.article = this.clip.article;
  this.pageCount = 0;
  this.footnotedLinksCount = 0;
  this.show();

  return this.reload()
    .then(this.detector.fetchArticle)
    .then(this._start.bind(this))
    .then(null,function(e){
    Log.exception(e);
    throw e;
  });
};

ArticleReformat.prototype.reload = function() {
  Log.log('ArticleReformat.reload');
  var deferred = defer();
  var root = this.getRootElement();
  var iframe = root.querySelector('iframe');
  var iframeDocument = iframe.contentDocument;
  iframe.addEventListener('load', function onLoaded(event) {
    iframe.removeEventListener('load', onLoaded, true);
    deferred.resolve(iframe);
  }.bind(this), true);

  iframeDocument.location.reload();
  return deferred.promise;
};

ArticleReformat.prototype.addNewPage = function(html) {
  Log.log('ArticleReformat.addNewPage', html);
  var root = this.getRootElement();
  var iframe = root.querySelector('iframe');
  var iframeDocument = iframe.contentDocument;

  let fragment = Util.parseHTML(iframeDocument, html, false, this.tabInfo.contentDocument.location.href, false);
  let iframePages = iframeDocument.querySelector('#pages');

  this.pageCount++;
  if (this.pageCount > 1) {
    //              $R.$iframePages.append(''           +
    //                  '<div class="pageSeparator">'   +
    //                      '<div class="pageSeparatorLine setTextColorAsBackgroundColor"></div>' +
    //                      '<div class="pageSeparatorLabel"><em>' + $R.escape_html($R.settings.pageLabel($R.escape_html(''+_pageNr))) + '</em></div>' +
    //                  '</div>'                        +
    //              '');

    let div1 = iframeDocument.createElement('DIV');
    div1.setAttribute('class', 'pageSeparator');
    let div2 = iframeDocument.createElement('DIV');
    div2.setAttribute('class', 'pageSeparatorLine setTextColorAsBackgroundColor');
    div1.appendChild(div2);
    let div3 = iframeDocument.createElement('DIV');
    div1.setAttribute('class', 'pageSeparatorLabel');
    let em = iframeDocument.createElement('EM');
    em.textContent = this.pageCount + '';
    div3.appendChild(em);
    div1.appendChild(div3);
    iframePages.appendChild(div1);
  }

  // '<div class="page" id="page' + $R.escape_html(''+_pageNr) + '">'   +
  //                    '<div class="page_content">'            +
  //                        _pageHTML                           +
  //                    '</div>'                                +
  //                '</div>'                                    +
  let div1 = iframeDocument.createElement('DIV');
  div1.setAttribute('class', 'page');
  div1.setAttribute('id', 'page' + this.pageCount);
  let div2 = iframeDocument.createElement('DIV');
  div2.setAttribute('class', 'page_content');
  div2.appendChild(fragment);
  div1.appendChild(div2);
  iframePages.appendChild(div1);
};

ArticleReformat.prototype.addNewPage2 = function(html) {
  Log.log('ArticleReformat.addNewPage', html);
  var root = this.getRootElement();
  var iframe = root.querySelector('iframe');
  var iframeDocument = iframe.contentDocument;
  var { DOMParser } = AddonWindow.window;

  let fragment = Util.parseHTML(iframeDocument, html, false, this.tabInfo.contentDocument.location.href, false);

  var domParser = new DOMParser();
  let srcDoc = domParser.parseFromString(html, 'text/html');
  // post processing can go here
  var newNode = iframeDocument.importNode(srcDoc.documentElement, true);
  let body = newNode.querySelector('body');
  if (body) { newNode = body; }

  let iframePages = iframeDocument.querySelector('#pages');

  this.pageCount++;
  if (this.pageCount > 1) {
    //              $R.$iframePages.append(''           +
    //                  '<div class="pageSeparator">'   +
    //                      '<div class="pageSeparatorLine setTextColorAsBackgroundColor"></div>' +
    //                      '<div class="pageSeparatorLabel"><em>' + $R.escape_html($R.settings.pageLabel($R.escape_html(''+_pageNr))) + '</em></div>' +
    //                  '</div>'                        +
    //              '');

    let div1 = iframeDocument.createElement('DIV');
    div1.setAttribute('class', 'pageSeparator');
    let div2 = iframeDocument.createElement('DIV');
    div2.setAttribute('class', 'pageSeparatorLine setTextColorAsBackgroundColor');
    div1.appendChild(div2);
    let div3 = iframeDocument.createElement('DIV');
    div1.setAttribute('class', 'pageSeparatorLabel');
    let em = iframeDocument.createElement('EM');
    em.textContent = this.pageCount + '';
    div3.appendChild(em);
    div1.appendChild(div3);
    iframePages.appendChild(div1);
  }

  // '<div class="page" id="page' + $R.escape_html(''+_pageNr) + '">'   +
  //                    '<div class="page_content">'            +
  //                        _pageHTML                           +
  //                    '</div>'                                +
  //                '</div>'                                    +
  let div1 = iframeDocument.createElement('DIV');
  div1.setAttribute('class', 'page');
  div1.setAttribute('id', 'page' + this.pageCount);
  let div2 = iframeDocument.createElement('DIV');
  div2.setAttribute('class', 'page_content');
  Util.toArray(newNode.childNodes).forEach(function(node){
    div2.appendChild(node);
  });
  //div2.appendChild(fragment);
  div1.appendChild(div2);
  iframePages.appendChild(div1);

  this.rebaseImages(div2);
  this.rebaseLinks(div2, iframeDocument);
};

ArticleReformat.prototype.rebaseLinks = function(srcNode, document) {
  Log.log('ArticleReformat.addLinkFootnotes');
  var footNotes = document.querySelector('#footnotedLinks');
  var ownerDoc = this.tabInfo.contentDocument;
  var a = ownerDoc.createElement('A');
  Util.toArray(srcNode.querySelectorAll('a[href]')).forEach(function(link) {
    var proto = link.protocol;
    if (proto === 'data:' || proto === 'javascript:') { return; }
    if (link.hash !== '') { return; }
    a.href = link.getAttribute('href');
    var absUrl = a.href;

    this.footnotedLinksCount++;
    if (this.addFootnotes) {
      let sup = document.createElement('SUP');
      sup.setAttribute('class', 'readableLinkFootnote');
      sup.textContent = '[' + this.footnotedLinksCount + ']';
      link.appendChild(sup);

      let li = document.createElement('LI');

      link.setAttribute('href', absUrl);

      li.textContent = absUrl;
      footNotes.appendChild(li);
    }
  }.bind(this));
};

ArticleReformat.prototype.rebaseImages = function(srcNode) {
  Log.log('ArticleReformat.rebaseImages');
  var ownerDoc = this.tabInfo.contentDocument;
  var a = ownerDoc.createElement('A');
  var re = /^data:.*/im;

  Util.toArray(srcNode.querySelectorAll('img[src]')).forEach(function(img) {
    var src = img.getAttribute('src');
    if (re.test(src)) { return; }// skip data urls
    a.href = src;
    src = a.href;
    img.setAttribute('src', src);
  });
};

ArticleReformat.prototype._start = function(pageInfo) {
  this.addNewPage(pageInfo.html);
};

ArticleReformat.prototype.serialize = function(clip) {
  Log.log('ArticleReformat.serialize'/*, clip*/);
  var root = this.getRootElement();
  var iframe = root.querySelector('iframe');
  if (!iframe) {
    return reject('Cannot find iframe');
  }

  var dst = Evernote.getClipDestination();
  var keepStyles = false;
  // For native clipping we have to keep styles, because source=Clearly doesn't work.
  if (dst !== Evernote.ClipDestination.CLOUD) {
    keepStyles = true;
  }

  return Xslt.serialize(iframe.contentDocument,{
    title: clip.article.title,
    tagNames: clip.article.tagNames,
    output: 'enml',
    debug: false,
    styles: keepStyles,
    ignoreSelection: true,
    pseudoElements: true,
    removeDefaults: true,
    comment: clip.article.comment,
    source: 'Clearly',
    clipDestination: dst,
  }).then(function(note){
    return note;
  });

};

ArticleReformat.prototype.abort = function(e) {
  Log.exception(e);
  this.readyState = 'empty';
  this.hide();

  return reject(e);
};

ArticleReformat.prototype.cancel = function(e) {
  Log.exception(e);
  this.readyState = 'empty';
  this.hide();
  return reject(e);
};

ArticleReformat.prototype.finish = function(pageInfo) {
  Log.log('ArticleReformat.finish');
  this.readyState = 'complete';
  emit(this, 'complete', this.pageInfo);
  return null;
};

ArticleReformat.prototype.onDiscarded = function() {
};

ArticleReformat.prototype.onClipSaved = function() {
};

ArticleReformat.prototype.onClipHidden = function() {
};

TabTracker.addClass(ArticleReformat, 'ArticleReformat');
