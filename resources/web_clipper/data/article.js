/**
 * Wrapper for sandboxed Clearly.
 */
window.initDetect = function() {
  if (window.ClearlyComponent__detect) return window.ClearlyComponent__detect;
  if (!jQuery) {
    Log.error("jQuery not found");
    return null;
  }
  window.ClearlyComponent__detect = initClearlyComponent__detect({
    'callbacks': {
      'finished': function(data) {Log.log('detect.finished', data);}
    },
    'window': window,
    'document': document,
    'jQuery': jQuery,
    'debug': debug || false,

  });
  // correct value from http://www.w3.org/html/wg/drafts/html/master/syntax.html#void-elements
  window.ClearlyComponent__detect.parseOptions._elements_self_closing =
    '|area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr|';

  return window.ClearlyComponent__detect;
}


window.startDetect = function(onFinished) {
  if (!window.ClearlyComponent__detect) return null;
  if (onFinished) {
    ClearlyComponent__detect.callbacks.finished = onFinished;
  }
  window.ClearlyComponent__detect.start();
  return window.ClearlyComponent__detect;
}

/*
window.initNext = function(){
  if (window.ClearlyComponent__next) return window.ClearlyComponent__next;
  if (!window.ClearlyComponent__detect) return null;
  window.ClearlyComponent__next = initClearlyComponent__next({
    'callbacks': {
      'newPageFound': function(page) { Log.log("next.newPageFound",page); }
    },
    'settings': {},
    'detectComponentInstance': window.ClearlyComponent__detect
  });
  //Log.log("initNext:", !!window.ClearlyComponent__next);
  return window.ClearlyComponent__next;
}

window.createNextContainer = function(containerId) {
  if (!window.ClearlyComponent__next) return null;
  if (containerId) {
    ClearlyComponent__next.settings.onCreateNextPagesContainerUseThisId =
      containerId;
  }
  window.ClearlyComponent__next.createNextPagesContainer();
  return window.ClearlyComponent__next;
}

window.startNext = function(onNewPageFound) {
  if (!window.ClearlyComponent__next) return null;
  if (onNewPageFound) {
    window.ClearlyComponent__next.callbacks.newPageFound = onNewPageFound;
  }
  window.createNextPagesContainer();
  window.ClearlyComponent__next.start();
  return window.ClearlyComponent__next;
}

const CLEARLY_IFRAME_ID = 'evernote-clearly-iframe';

window.initReformat = function(cssPath) {
  function doDocumentWrite(document, html) {
    var parser = DOMParser();
    var newDoc = parser.parseFromString(html, "text/html");
    var newNode = document.importNode(newDoc.documentElement, true);
    document.replaceChild(newNode, document.documentElement);
    Log.log(document.documentElement.outerHTML);

  }
  function assignInnerHTML(element, html) {
    while(element.firstChild) {
      element.removeChild(element.firstChild);
    }
    var document = element.ownerDocument;
    var parser = DOMParser();
    var newDoc = parser.parseFromString(html, "text/html");
    var newNode = document.importNode(newDoc.documentElement, true);
    element.appendChild(newNode);
    Log.log(element.outerHTML);
  }

  cssPath = cssPath || '../css/';
  if (window.ClearlyComponent__reformat) return window.ClearlyComponent__reformat;
  if (!jQuery) {
    Log.error("jQuery not found");
    return null;
  }

  window.ClearlyComponent__reformat = initClearlyComponent__reformat({
    'callbacks': {
      'frameCreated': function () { Log.log('frameCreated'); },
    },
    'settings': {
      'cssPath': cssPath,
      'pageLabel': function (_nr) { return 'Page '+_nr; },
      'onCreateFrameDoNotInsertCSS': true,
      'doDocumentWrite': doDocumentWrite,
      'assignInnerHTML': assignInnerHTML,
      'onCreateFrameUseThisId': CLEARLY_IFRAME_ID,
    },
    'debug': true,
    'window': window,
    'document': window.document,
    'jQuery': jQuery
  });
  return window.ClearlyComponent__reformat;
}


window.startReformat = function(html, callback) {
  var reformat = window.ClearlyComponent__reformat;
  function onFrameCreated() {
    // apply theme
    reformat.applyUnencodedOptions(window.ClearlyComponent__reformat.defaultThemes['newsprint']);
    reformat.applyCustomCSSFile('newsprint');
    reformat.loadGoogleFontsRequiredByAppliedOptions();
    reformat.addNewPage(html, window.location.href);
    var frameElement = document.getElementById(CLEARLY_IFRAME_ID);
    if (!frameElement) {
      Log.log("Element " + CLEARLY_IFRAME_ID + " not found");
    } else {
      var width = document.body.scrollWidth;
      var height = document.body.scrollHeight;
      frameElement.style.position = 'absolute';
      frameElement.style.display = 'block';
      frameElement.style.height = '100%';
      frameElement.style.width = '100%';
      frameElement.style.top = '0px';
      frameElement.style.left = '0px';
      frameElement.style.bottom = '0px';
//      frameElement.style.cssText =
//        'position: fixed;'
//        + 'top: 0px;'
//        + 'left: 0px;'
//        + 'right: 0px;'
//        + 'bottom: 0px;'
         //+ 'width: ' + width + 'px;'
        //+ 'height:' + height + 'px;'
      Log.log(frameElement.outerHTML);
   }
    if (callback) { callback(); }
  }
  reformat.callbacks.frameCreated = onFrameCreated;
  reformat.createFrame();
  startNext(function(nextPage) {
    Log.log('next page', nextPage);
  });
}
*/
initDetect();

