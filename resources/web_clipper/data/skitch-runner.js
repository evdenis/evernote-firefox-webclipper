this['SkitchRunner'] = (function (global) {
  var surface = null;

  function createSkitch(options, l10ndata) {
    //console.log("Skitch.CreateSkitch");
    //console.log(Object.getOwnPropertyNames(Promise));

    options = options || {};

    var width = (options.width !== undefined) ? options.width : window.innerWidth;
    var height = (options.height !== undefined) ? options.height : window.innerHeight;
    var tool = options.tool || 'pen';
    var color = options.color || 'red';

    if (surface) {
      deleteSkitch();
    }
    var surfaceEl = document.body;
    //surfaceEl.style.width = width + 'px';
    //surfaceEl.style.height = height + 'px';
    surfaceEl.style.width = '100%';
    surfaceEl.style.height = '100%';
    //surfaceEl.style.width = window.innerWidth + 'px';
    //surfaceEl.style.height = window.innerHeight + 'px';

    while(surfaceEl.firstChild) {
      surfaceEl.removeChild(surfaceEl.firstChild);
    }

    surface = Markup({
      top: 0,
      left: 0,
      margin: 0,
      allowZoom: false,
      width: width,
      height: height,
      //url: options.url,
      success: function onOK(surface) {
        //var el = surface.getElement();
        //document.body.appendChild(el);

        surface.useTool(tool);
        surface.useColor(color);
        surface.enableEvents();
        surface.toast(l10ndata['screenshotToast']);
      },
      fail: function(surface, url, err) {
       console.error("Markup creation failed");
       console.error([].slice.apply(arguments));
       console.error(err);
       console.error(err.stack);
      },

      document: options.url,
      enableToolbar: false,
      container: surfaceEl,
    });

    return surface;
  }

  function deleteSkitch() {
    //console.log('Skitch.deleteSkitch');
    if (surface) {
      surface.disableEvents();
      var el = surface.getElement();
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
      surface.destroy();
    }
    surface = null;
  }

  function localizeSkitch(l10ndata) {
    if (!surface) throw new ReferenceError("No Skitch surface created");
    surface.localize({
       CROP_APPLY_TEXT: l10ndata["apply"],
       CROP_CANCEL_TEXT: l10ndata["regForm_cancel"],
       MARKUP_STAMP_APPROVED_TEXT: l10ndata["approved"],
       MARKUP_STAMP_EXCLAIM_TEXT: l10ndata["wow"],
       MARKUP_STAMP_PERFECT_TEXT: l10ndata["perfect"],
       MARKUP_STAMP_QUESTION_TEXT: l10ndata["what"],
       MARKUP_STAMP_REJECTED_TEXT: l10ndata["rejected"],
       ZOOM_RESET_TEXT: l10ndata["reset"],
       ZOOM_TIP_TEXT: l10ndata["panInstruction"]
    });
  }

  // called when tab is brought to front
  function activate() {
    if (!surface) return;
    surface.enableEvents();
  }

  // called when tab is no longer active
  function deactivate() {
    if (!surface) return;
    surface.disableEvents();
  }

  function useTool(tool) {
    if (!surface) return;
    surface.useTool(tool);
  }

  function zoomIn() {
    if (!surface) { return; }
    surface.zoom(1.1, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }

  function zoomOut() {
    if (!surface) { return; }
    surface.zoom(1/1.1, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }

  function doUICommand(cmd) {
    //console.log('SKitch.doUICommand', cmd);
    if (!surface) { return; }
    if (cmd.type === 'color') {
      surface.updateSelectedElementsColor(cmd.color);
      surface.useColor(cmd.color);
    } else if (cmd.type === 'tool') {
      let tool = cmd.tool;
      if (tool === 'zoom-in') {
        zoomIn();
        return;
      } else if (tool === 'zoom-out') {
        zoomOut();
        return;
      }
      if (tool === 'stampDefault') {
        tool = 'stampAccept';
      }
      surface.useTool(cmd.tool);
    }
  }

  function getImageData(callback) {
    //console.log('Skitch.getImageData', callback);
    if (!surface) return;
    surface.getFile(function(file) {
      callback(file);
    });
  }
  return {
    localizeSkitch: localizeSkitch,
    deleteSkitch: deleteSkitch,
    createSkitch: createSkitch,
    activate: activate,
    deactivate: deactivate,
    doUICommand: doUICommand,
    getImageData: getImageData,
  };

})(this);
/*
function createSkitch(options) {
options = options || {};

var width = (options.width !== undefined) ? options.width : window.innerWidth;
var height = (options.height !== undefined) ? options.height : window.innerHeight;
var tool = options.tool || 'pen';
var color = options.color || 'red';

//if (surface) {
//  deleteSkitch();
//}
document.body.style.width = window.innerWidth+'px';
document.body.style.height = window.innerHeight+'px';

function onOK(surface) {
  //var el = surface.getElement();
  //document.body.appendChild(el);
  // console.log("onOK");
  surface.useTool(tool);
  surface.useColor(color);

  surface.enableEvents();

  surface.toast(_("screenshotToast"));
}

try {
  surface = Markup({
    top: 0,
    left: 0,
    margin: 0,
    allowZoom: false,
    width: window.innerWidth,
    height: window.innerHeight,
    url: options.url,
    success: onOK,
    fail: function(surface, err) {
      console.exception(err);
      console.error(err.stack);
    },

    document: options.url,
    enableToolbar: false,
    container: document.body,
    tool: options.tool,
    color: options.color
  });
} catch(e) {
  console.exception(e);
  console.error(e.stack);
}
console.log('Surface created', surface);
//return surface;
}
exported.createSkitch = createSkitch;
*/
