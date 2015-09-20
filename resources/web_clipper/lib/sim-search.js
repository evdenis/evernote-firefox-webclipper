/**
 * Created by mz on 2014-10-04.
 */


var { emit, on, once, off } = require("sdk/event/core");
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');

const Data = require('sdk/self').data;
const { setTimeout } = require("sdk/timers");
var ContentWorker = require('sdk/content/worker').Worker;
var Prefs = require("sdk/simple-prefs");

var Auth = require('./auth');
var Boot = require('./boot');
var Evernote = require('./evernote');
var Log = require('./log');
var Net = require('./net');
var Popup = require('./popup').Popup;
var UIDispatch = require('./ui-dispatch');
var TabTracker = require('./tracker').TabTracker;
var Util = require('./util');

function SimSearch(tabInfo) {
  Util.bindAll(this);
  this.initialize(tabInfo);
}

SimSearch.prototype.initialize = function(tabInfo) {
  this.classId = 'SimSearch';

  this.tabInfo = tabInfo;
  this.id = tabInfo.id;
  //this.viewer = this.tabInfo.getInstance('UrlViewer');
  this.showing = false;
  this.observer = null;

  this.on = on.bind(null, this);
  this.once = once.bind(null, this);
  this.off = off.bind(null, this);

  this.injected = false;
  this.readyState = 'detached';
  this.channel = this.imported = null;

}
//SimSearch.prototype = Object.create(TabbedClass.prototype);

SimSearch.prototype.start = function() {
  Log.log("SimSearch.start");
  this.readyState = 'loading';
  this.article = this.clip.article;
  this.article.selectedElement = null;
  this.show();
}

SimSearch.prototype.show = function() {
  Log.log("SimSearch.show");
  //var browser = this.tabInfo.browser;
  //var parent = browser.parentElement;
  var injected = document.getElementById(INJECT_ID);
  if (injected) {
    this.adjustSize();
    injected.style.visibility = 'visible';

  }
  this.showing = true;
}

SimSearch.prototype.hide = function() {
  Log.log("SimSearch.hide");
  var document = this.tabInfo.getContentDocument();
  // document can be null if it was already destroyed when we received onLeavePage
  if (document) {
    var injected = document.getElementById(INJECT_ID);
    if (injected) {
      injected.style.width = '0px';
      injected.style.height = '0px';
      injected.style.visibility = 'hidden';
    }
  }
  this.showing = false;
}

const GOOGLE_RE = /^(www\.)?google(\.com|\.ad|\.ae|\.com\.af|\.com\.ag|\.com\.ai|\.al|\.am|\.co\.ao|\.com\.ar|\.as|\.at|\.com\.au|\.az|\.ba|\.com\.bd|\.be|\.bf|\.bg|\.com\.bh|\.bi|\.bj|\.com\.bn|\.com\.bo|\.com\.br|\.bs|\.bt|\.co\.bw|\.by|\.com\.bz|\.ca|\.cd|\.cf|\.cg|\.ch|\.ci|\.co\.ck|\.cl|\.cm|\.cn|\.com\.co|\.co\.cr|\.com\.cu|\.cv|\.com\.cy|\.cz|\.de|\.dj|\.dk|\.dm|\.com\.do|\.dz|\.com\.ec|\.ee|\.com\.eg|\.es|\.com\.et|\.fi|\.com\.fj|\.fm|\.fr|\.ga|\.ge|\.gg|\.com\.gh|\.com\.gi|\.gl|\.gm|\.gp|\.gr|\.com\.gt|\.gy|\.com\.hk|\.hn|\.hr|\.ht|\.hu|\.co\.id|\.ie|\.co\.il|\.im|\.co\.in|\.iq|\.is|\.it|\.je|\.com\.jm|\.jo|\.co\.jp|\.co\.ke|\.com\.kh|\.ki|\.kg|\.co\.kr|\.com\.kw|\.kz|\.la|\.com\.lb|\.li|\.lk|\.co\.ls|\.lt|\.lu|\.lv|\.com\.ly|\.co\.ma|\.md|\.me|\.mg|\.mk|\.ml|\.com\.mm|\.mn|\.ms|\.com\.mt|\.mu|\.mv|\.mw|\.com\.mx|\.com\.my|\.co\.mz|\.com\.na|\.com\.nf|\.com\.ng|\.com\.ni|\.ne|\.nl|\.no|\.com\.np|\.nr|\.nu|\.co\.nz|\.com\.om|\.com\.pa|\.com\.pe|\.com\.pg|\.com\.ph|\.com\.pk|\.pl|\.pn|\.com\.pr|\.ps|\.pt|\.com\.py|\.com\.qa|\.ro|\.ru|\.rw|\.com\.sa|\.com\.sb|\.sc|\.se|\.com\.sg|\.sh|\.si|\.sk|\.com\.sl|\.sn|\.so|\.sm|\.st|\.com\.sv|\.td|\.tg|\.co\.th|\.com\.tj|\.tk|\.tl|\.tm|\.tn|\.to|\.com\.tr|\.tt|\.com\.tw|\.co\.tz|\.com\.ua|\.co\.ug|\.co\.uk|\.com\.uy|\.co\.uz|\.com\.vc|\.co\.ve|\.vg|\.co\.vi|\.com\.vn|\.vu|\.ws|\.rs|\.co\.za|\.co\.zm|\.co\.zw|\.cat)$/;

SimSearch.prototype.onEnterPage = function(tab) {
  Log.log("SimSearch.onEnterPage");

  var document = this.tabInfo.getContentDocument();
  var window = document.defaultView;
  // create an observer instance
  var location = document.location;
  var host = location.hostname;
  if (GOOGLE_RE.test(host)) {
    this.beginInjection(document, {
      injectSelector: '#rhs_block',
      contentId: 'rhs',
      snippetSelector: '#ires',
      inputSelector: 'input[type="text"]',
      iframeStyle: {
        float: 'left',
        paddingLeft: '15px'
      },
    });
  } else if (/^(www\.)?bing\.com$/.test(host)) {
    this.beginInjection(document, {
      injectSelector: '#b_context',
      contentId: 'b_results',
      snippetSelector: '#b_results',
      inputSelector: 'input[type="search"]'
    });
  } else if (/^(\w+\.)*(search\.)?yahoo\.com$/.test(host)) {
    this.beginInjection(document, {
      injectSelector: '#right',
      contentId: 'results',
      snippetSelector: '#web ol',
      inputSelector: 'input#yschsp',
      iframeStyle: {
        float: 'left'
      },
    });
  } else if (/^(www\.)?yandex(\.com|\.ru)$/.test(host)) {
    this.beginInjection(document, {
      injectSelector: '.main__content > .content > .content__right',
      contentId: null,
      snippetSelector: 'div.serp-list',
      inputSelector: 'input[type="search"]',
      iframeStyle: {
        float: 'left',
        paddingLeft: '16px'
      },
    });
  } else if (/^(www\.)?baidu(\.com|\.cn)$/.test(host)) {
    this.beginInjection(document, {
      injectSelector: '#content_right',
      contentId: 'container',
      snippetSelector: '#content_left',
      inputSelector: 'input#kw',
      iframeStyle: {
        float: 'left',
      }
    });
  }
  this.readyState = 'attached';
}

SimSearch.prototype.beginInjection = function(document, options) {
  var window = document.defaultView;
  if (!window || !document.body) return;
  // create an observer instance
  var injectContent = this.injectContent.bind(this);
  var done = false;

  if (options.contentId) {
    this.observer = new window.MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (done) return;
        var lst = mutation.addedNodes;
        var len = lst.length;
        for(var i = 0; i < len; i++) {
          let el = lst[i];
          if (el.id === options.contentId) {
            done = injectContent(options);
            return;
          }
        }
      });
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }
  // try to inject right away
  done = this.injectContent(options);
}

const INJECT_ID = 'evernoteSimSearchResults';

SimSearch.prototype.getIframe = function() {
  var document = this.tabInfo.getContentDocument();
  return document.getElementById(INJECT_ID);
}

SimSearch.prototype.injectContent = function(options) {
  Log.log("SimSearch.injectContent");

  if (!Prefs.prefs.simSearch) return true;

  var document = this.tabInfo.getContentDocument();
  var injected = document.getElementById(INJECT_ID);
  if (injected) {
    Log.log("injectContent:Already injected");
    return true;
  }
  var injectPoint = document.querySelector(options.injectSelector);

  if (!injectPoint) {
    Log.log("injectContent:inject point (" + options.injectSelector + ") not found");
    let retry = this.injectContent.bind(this);
    let that = this;
    let input = document.querySelector(options.inputSelector);
    if (options.instantSearch && input) {
       input.addEventListener('input', function onInput(evt) {
         input.removeEventListener('input', onInput);
         // retry now that user has typed something
         retry(options);
       })
    }
    // ghetto injection: wait until the inject element appears
    //setTimeout(retry, 250);
    return false;
  }
  Log.log("injectContent:inject point found");
  this.doInjectContent(injectPoint, options);
  return true;
}

SimSearch.prototype.doInjectContent = function(injectPoint, options) {
  var document = injectPoint.ownerDocument;
  Log.log("SimSearch.doInjectContent", injectPoint);
  var iframe = document.createElement('IFRAME');

  var style = {
    float: 'right',
    padding: '0px',
    margin: '0px',
    top: '0px',
    right:  '0px',
    minWidth: '452px',
    width: '100%',
    height: '0px',
    //height: '0px',
    border: 'none',
    display: 'inline-block',
    zIndex: '999'
  };

  if (options.iframeStyle) {
    Util.merge(options.iframeStyle, style);
  }

  Util.merge(style, iframe.style);

  try {
    iframe.setAttribute('id', INJECT_ID);
    iframe.setAttribute('src', 'about:blank');
    iframe.setAttribute('transparent', '1');
    iframe.setAttribute('seamless', '1');

    injectPoint.insertBefore(iframe, injectPoint.firstChild);

    var clear = document.createElement('BR');
    Util.merge({
      clear: 'both',
      padding: '0px',
      margin: '0px',
      width: '0px',
      height: '0px',
    }, clear.style);
    injectPoint.insertBefore(clear, iframe.nextSibling);

    var injectWorker = this.injectWorker.bind(this);

    iframe.addEventListener("load", function onLoad(evt) {
      this.removeEventListener("load", onLoad);
      injectWorker(this, options);
    }, true);
    iframe.contentWindow.location = Data.url('sim-search.html');

  } catch(e) {
    Log.exception(e);
  }
}

SimSearch.prototype.injectWorker = function(iframe, options) {
  var loggedIn = Auth.isLoggedIn();
  var that = this;
  var contentOpts = {
    window: iframe.contentWindow,
    contentScriptFile: [
      Data.url('promise.js'),
      Data.url('content.js'),
      Data.url('sim-search.js'),
    ],
    contentScriptOptions: {
      l10n: require("@l10n/data"),
      region: Boot.getBootRegion(),
      loggedIn: loggedIn,
    },
    onDetach: function() {
      Log.log("Sim Search detached");
      that.channel = that.imported = null;
      var document;
      try {
        document = this.tabInfo.getContentDocument();
        that.beginInjection(document, options);
      } catch(e) {
        // document is dead, baby
        // doesn't matter.
        Log.error(e);
      }
    }.bind(this),
  };

  this.worker = ContentWorker(contentOpts);
  this.channel = UIDispatch.createChannel(this.worker.port, this); // that.channel.attach(that.worker.port)

  Util.merge({
    hide: this.hide,
    adjustSize: this.adjustSize,
    openNoteWithGuid: this.openNoteWithGuid,
    loadImage: this.loadImage,
    openLogin: this.openLogin,
    disable: this.disable,
  }, this.channel.exported)

  var document = iframe.ownerDocument;
  var snippetEl = document.querySelector(options.snippetSelector)
  var snippet = '';
  if (snippetEl) {
    snippet = Util.retrieveText(snippetEl);
  }
  if (!loggedIn) {
    return;
  }

  var input = document.querySelector(options.inputSelector);
  var query = input && input.value || '';
  Evernote.fetchFilingRecommendations(document.location.href, snippet, query)
  .then(function(recommendation){
    // post processing here.
    Log.log("processFilingInfo finished @" + this.filingInfoId);
    Log.log("WebClip recommends:", recommendation);

    var result = {
      tags: [],
    };

    var notebooks = {};

    function collectNotebooks(rec) {
      if (!rec) return;
      if (!rec.containingNotebooks) return;
      if (!rec.containingNotebooks.list) return;
      rec.containingNotebooks.list.forEach(function(notebook) {
        notebook.token = rec.token;
        notebooks[notebook.guid] = notebook;
      });
    }

    collectNotebooks(recommendation.personal);
    collectNotebooks(recommendation.business);

    function collectNotes(rec, openerToken) {
      if (!rec || !rec.relatedNotes || !rec.relatedNotes.list) {
        //Log.warn('no list of notes found. isbusiness=', isBusiness);
        return [];
      }

      var notes = [];
      rec.relatedNotes.list.forEach(function(n){
        var guid = n.notebookGuid;
        if (!(guid in notebooks)) return;

        var notebook = notebooks[guid];

        var note = {
          guid: n.guid,
          notebookGuid: guid,
          title: n.title,
          snippet: n.snippet,
          thumbsquare: n.thumbsquare,
          sourceUrl: n.attributes.sourceURL,
          notebookName: notebook.name || notebook.notebookDisplayName,
          token: notebook.token,
          contact: n.attributes.lastEditedBy || n.attributes.author  || notebook.contact || notebook.contactName,
          joined: notebook.hasSharedNotebook,
          openerToken: openerToken,
          timestamp: Math.max(n.updated, n.created),
        }
        notes.push(note);
      });
      return notes;
    }

    result.personal = collectNotes(recommendation.personal, 'main');
    result.business = collectNotes(recommendation.business, 'biz');

    Log.log("SimSearch.processFilingInfo Produced recommendation ", result);
    return result;
  })
  .then(function(result){
    if (!this.channel) return;
    if (!result.personal.length && !result.business.length) {
      //this.hide();
      return;
    }
    this.channel.imported.start(result);
  }.bind(this))
}


SimSearch.prototype.adjustSize = function() {
  Log.log("SimSearch.adjustSize");
  var el = this.getIframe();
  if (!el) return;
  var body = el.contentDocument.body;
  if (!body) {
    Log.error('SimSearch: iframe body not loaded');
    return;
  }

  var width = body.clientWidth;
  var height = body.clientHeight;

  // Resize iframe to accomodate its content
  //el.style.width = width + 'px';
  el.style.height = height + 'px';
}

SimSearch.prototype.onLeavePage = function(tab) {
  Log.log("SimSearch.onLeavePage");
  this.hide();
  this.readyState = 'detached';
  if (this.observer) {
    this.observer.disconnect();
    this.observer = null;
  }
}

SimSearch.prototype.openNoteWithGuid = function(noteGuid, notebookGuid, token) {
  Log.log('SimSearch.openNoteWithGuid', noteGuid, notebookGuid, token);
  Evernote.openNoteWithGuid(noteGuid, notebookGuid, token);
}

SimSearch.prototype.loadImage = function(url, token) {
  Log.log('SimSearch.loadImage', url, token);
  return Evernote.fetchThumbnailWithAuth(token, url);
}

SimSearch.prototype.openLogin = function() {
  Popup.showPopup();
}

SimSearch.prototype.disable = function() {
  Prefs.prefs.simSearch = false;
}

function getInstance(tab) {
  return TabTracker.getInstance(tab, 'SimSearch');
}

TabTracker.addClass(SimSearch, 'SimSearch');

exports.getInstance = getInstance;
