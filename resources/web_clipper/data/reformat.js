function initReformat(cssPath) {
  cssPath = cssPath || '../css/';
  if (window.ClearlyComponent__reformat) return window.ClearlyComponent__reformat;
  if (!jQuery) {
    console.error("jQuery not found");
    return null;
  }

  window.ClearlyComponent__reformat = initClearlyComponent__reformat({
    'callbacks': {
      'frameCreated': function () { /*console.log('frameCreated'); */},
    },
    'settings': {
      'cssPath': cssPath,
      'pageLabel': function (_nr) { return 'Page '+_nr; },
      'onCreateFrameDoNotInsertCSS': true,
    },
    'debug': true,
    'window': window,
    'document': window.document,
    'jQuery': jQuery
  });
  return window.ClearlyComponent__reformat;
}


function startReformat(callback) {
  var reformat = window.ClearlyComponent__reformat;
  function onFrameCreated() {
                   // apply theme
    reformat.applyUnencodedOptions(window.ClearlyComponent__reformat.defaultThemes['newsprint']);
    reformat.applyCustomCSSFile('newsprint');
    reformat.loadGoogleFontsRequiredByAppliedOptions();
    reformat.addNewPage(document.getElementById('main_content').innerHTML, window.location.href);
    if (callback) { callback(); }
  }
  reformat.callbacks.frameCreated = onFrameCreated;
  reformat.createFrame();
}

initReformat();
startReformat();
