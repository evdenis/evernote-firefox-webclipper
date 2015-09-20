var _ = require('sdk/l10n').get;
var data = require('sdk/self').data;
var Event = require('sdk/event/core');
var Env = require('sdk/system/environment').env;
var Prefs = require("sdk/simple-prefs");
var { ToolbarWidget } = require("toolbarwidget")


var Auth = require('./auth');
var Log = require('./log');
var Evernote = require('./evernote');
var Popup = require('./popup');
var { dispatch } = require('./ui-dispatch');

 // the system object that controls the widget.
var widgetCtl;
var popupPanelCtl;
var australisButton;
var australisEnabled;

var appState = { auth: false, update: false, sidebar: false };

var handlers;
var emit = Event.emit.bind(null, exports);

const ICONS = {
  'sidebar-open': {
    '16': data.url('images/wc6_close.png'),
    '32': data.url('images/wc6_close@2x.png'),
  },
  'update-available': {
    '16': data.url('images/wc6_update.png'),
    '32': data.url('images/wc6_update@2x.png'),
  },
  'logged-in': {
    '16': data.url('images/wc6.png'),
    '32': data.url('images/wc6@2x.png'),
  },
  'logged-out': {
    '16': data.url('images/wc6_signin.png'),
    '32': data.url('images/wc6_signin@2x.png'),
  },
};


function init(popup) {

  australisEnabled = true;

  popupPanelCtl = popup;

  if (australisEnabled) {
    australisEnabled = initAustralis(popup);
  }
  // can be false if initAustralis has failed or australis was disabled.
  if (!australisEnabled) {
    handlers = {};
    handlers.widgetLeftClick = function widgetLeftClick() {
      Log.log("leftClick");
      emit("click", appState);
    };

    handlers.widgetLoaded = function() {
      Log.info('ATTACHED');
      updateView();
    }

    widgetCtl = ToolbarWidget({
        toolbarID: 'nav-bar',
        id: 'web-clipper',
        label: _('ExtensionName'),
        contentScriptWhen: 'ready',
        contentURL: data.url('widget.html'),
        contentScriptFile: [data.url('content.js'), data.url('widget.js')],
        width: 19, // pixels
        panel: popupPanelCtl.panel,
        contentScriptOptions: {}
    });

    dispatch(widgetCtl.port, handlers);
  }

  Evernote.on('clipDestination', function(dst) {
    Log.warn("Widget:Opts changed", dst);
    updateView();
  });

}

function setAuthState(loggedin) {
  Log.log('setAuthState(' + loggedin + ')');
  appState.auth = loggedin;
  updateView();
}

// New update available.
function setUpdateAvailable(available) {
  Log.log('setUpdateAvailable(' + available + ')');

  appState.update = available;
  updateView();
}

// Sidebar is opened.
function setSidebarState(open) {
  Log.log('setSidebarState(' + open + ')');

  appState.sidebar = open;
  updateView();
}

function updateView() {
  var state, text;
  var clipDestination = Evernote.getClipDestination();
  if (appState.sidebar) {
    state = 'sidebar-open';
    text = _('BrowserActionTitle');
  } else if (appState.update) {
    state = 'update-available';
    text = _('webClipperUpdated');
  } else if (appState.auth) {
    state = 'logged-in';
    text = _('BrowserActionTitle');
  } else if (clipDestination === Evernote.ClipDestination.NATIVE
      || clipDestination === Evernote.ClipDestination.FILE) {
    state = 'logged-in';
    text = _('BrowserActionTitle');
  } else {
    state = 'logged-out';
    text = _('signInPrompt');
  }
  Log.log('state=' + state + ' ' + text);
  if (widgetCtl) {
    widgetCtl.tooltip = text;
    widgetCtl.port.emit('set-state', state);
  }
  setButtonState(state, text);
}


function initAustralis(popup) {
  try {
    var { ActionButton } = require("sdk/ui/button/action");

    australisButton = ActionButton({
      id: "evernote-button",
      label: _("ExtensionName"),
      icon: ICONS['logged-in'],
      onClick: handleClick,
    });

  } catch(e) {
    Log.error("Australis not detected");
    australisEnabled = false;
    return false;
  }

  popup.on('hide', function handleHide() { /*console.log("Panel HIDE");*/ });
  popup.on('show', function handleShow() { /*console.log("Panel SHOW");*/ });

  function handleClick(state) {
    Log.log("WIDGET: leftClick", state);
    emit("click", appState);
  }
  return true;
}

function setButtonState(icon, text) {
  if (australisButton) {
    australisButton.label = text;
    australisButton.icon = ICONS[icon];
  }
}

function isAustralisEnabled() {
  return australisEnabled;
}

function getWidgetCtl() {
  return australisButton;
}

exports.init = init;
exports.setSidebarState = setSidebarState;
exports.setUpdateAvailable = setUpdateAvailable;
exports.setAuthState = setAuthState;
exports.isAustralisEnabled = isAustralisEnabled;
exports.getWidgetCtl  = getWidgetCtl;

exports.on = Event.on.bind(null, exports);
exports.once = Event.once.bind(null, exports);
exports.removeListener = function removeListener(type, listener) {
  Event.off(exports, type, listener);
};
