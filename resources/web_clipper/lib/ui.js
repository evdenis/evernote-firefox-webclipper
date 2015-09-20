/**
 * Module for the User Interface in the main program.
 * @module
 */
var Data = require('sdk/self').data;
const { promised, all, defer } = require('sdk/core/promise');
var { Hotkey } = require("sdk/hotkeys");
var log = require('./log').log;

const { getMostRecentBrowserWindow } = require('sdk/window/utils');

var _ = require("sdk/l10n").get;
var { emit, on, once, off } = require("sdk/event/core");
var Env = require('sdk/system/environment').env;
var Prefs = require("sdk/simple-prefs");
var Self = require('sdk/self');
var Tabs = require('sdk/tabs');

var Article = require('./article');
var Auth = require('./auth');
var Boot = require('./boot');
var dispatch = require('./ui-dispatch').dispatch;
var GlobalUI = require('./global-ui');
var Evernote = require('./evernote');
var Log = require('./log');
var Menu = require('./menu');
var Native = require('./native');
var Popup = require('./popup').Popup;
var Registration = require('./registration');
var SessionTracker = require('./session-tracker');
var TabTracker = require('./tracker').TabTracker;
var Toolbar = require('./toolbar');
var Tracker = require('./tracker').Tracker;
var Url = require('./url');
var Util = require('./util');
var Widget = require('./widget');
var Xslt = require('./xslt');

var Shortcuts = {};
Shortcuts.init = function init() {
  this.key1 = Hotkey({
    combo: "accel-alt-shift-O",
    onPress: function() {
      Log.log(this.combo);
      openOptionsDialog();
    }
  });
  this.key2 = Hotkey({
    combo: "accel-alt-shift-C",
    onPress: function() {
      var clipboard = require("sdk/clipboard");
      clipboard.set(Log.getLog(), "text");
    }
  });
  this.key3 = Hotkey({
    combo: "control-`",
    onPress: function() {
      if (Prefs.prefs.globalShortcuts) {
        onActivate();
      }
    }
  });

  this.key4 = Hotkey({
  combo: "control-shift-`",
    onPress: function() {
      if (Prefs.prefs.globalShortcuts) {
        onActivate('clearly');
      }
    }
  });
};

/// Dev code

function init() {
  Log.log('starting...');
  loadSettings();
  Log.log('settings loaded');
  SessionTracker.init();
  Log.log('session tracking started');
  Popup.init();
  Widget.init(Popup);
  Log.log('widget inited');
  Popup.setAustralisEnabled(Widget.isAustralisEnabled());
  Popup.setWidgetCtl(Widget.getWidgetCtl());
  Log.log('login popup inited');
  Tracker.init();
  Log.log('window tracking inited');
  Shortcuts.init();
  Log.log('hotkeys inited');
  Xslt.init();
  Log.log('serializer inited');
  initEventHandlers();
  Log.log('event handlers inited');
  TabTracker.init();
  Log.log('tab tracking inited');
  Toolbar.init();
  Log.log('toolbar inited');
  GlobalUI.init();
  Log.log('global styles inited');

  if (Self.loadReason === 'install' || Self.loadReason === 'upgrade') {
    Tabs.open('http://evernote.com/webclipper/guide/');
  }

  if (Env['FIRENOTE_START']) { // jshint ignore:line
    Tabs.open(Env['FIRENOTE_START']); // jshint ignore:line
  }
  Log.log('loading done');
}

var wantsEdit = false;
var wantsMode = undefined;

function onActivate(clipType) {
    Log.log('*event*Widget Clicked');

    var toolbar = TabTracker.getInstance('Toolbar');
    if (!toolbar) {
      Log.error('No Toolbar');
      return;
    }

    if (toolbar.isShowing()) {
      toolbar.close();
      return;
    }

    if (Auth.isLoggedIn() || Evernote.getClipDestination() !== Evernote.ClipDestination.CLOUD) {
      Popup.autoShow(false);
      toolbar.startEdit(clipType);
      return;
    } else {
      Popup.autoShow(true);
      Popup.showPopup();
      // on popup done -> call toolbar edit
      wantsEdit = true;
    }

}

function initEventHandlers() {
  Auth.on('logged-in', function onLoggedIn(info) {
    Log.log('onLoggedIn');
    Widget.setAuthState(true);
    Popup.autoShow(false);
    Popup.hidePopup();

    if (wantsEdit) {
      let toolbar = TabTracker.getInstance('Toolbar');;
      if (!toolbar) {
        Log.error('No Toolbar');
        return;
      }

      toolbar.startEdit();

      wantsEdit = false;
    }
    Menu.onLogin();
  });

  Auth.on('logged-out', function onLoggedOut() {
    Log.log('*event*onLoggedOut');
    Widget.setAuthState(false);
    Popup.autoShow(true);
    Menu.onLogout();
    // WebClip.cancelAll();
  });
  /*Evernote.on('clipDestination', function onClipDestination(dst) {
    if (dst === Evernote.ClipDestination.CLOUD) {
      if (Auth.isLoggedIn()) {
        Popup.autoShow(false);
        Menu.onLogin();
      } else {
        // Clip to cloud but not logged in to cloud.
        Log.warn('Clip Destination set to cloud but not authenticated yet');
        Popup.autoShow(true);
        Toolbar.onLoggedOut();
        Menu.onLogout();
      }
    } else {
      Popup.autoShow(false);
      Menu.onLogin();
    }
  });*/

  Widget.on('click', function(state) { onActivate(); });
}

// Incoming events
function booted(result) {
  // Update widget.
  // Possibly show system notification.
  Log.log('boot succeeded');
}

function bootFailed(error) {
  // Notify user of an error.
  Log.log('boot failed');
}

function alert(msg) {
  var wnd = Util.getTabWindow() || getMostRecentBrowserWindow();
  wnd.alert(msg);
  Log.log('Alert',wnd,msg);
}

var settings = {
  page: 'options',
};

function loadSettings() {
  var persistent = require('sdk/simple-prefs').prefs;
  for(var k in persistent) {
    settings[k] = persistent[k];
  }
  // Log.log('loaded settings=',settings);
  return settings;
}

function saveSettings(newSettings) {
  try {
    // store settings in preference object.
    var persistent = require('sdk/simple-prefs').prefs;
    for (var k in persistent) {
      if (k in settings) {
        var v = settings[k];
        if (v !== undefined) {
          // Log.log(k,'=>',v);
          persistent[k] = v;
        }
      }
    }
  } catch(e) {
    Log.exception(e);
  }
}

function openOptionsDialog() {
  function doneCallback(result) {
    Log.log('received', result);
    var newSettings = JSON.parse(result);
    Log.log('options saved', newSettings);
    for(var k in newSettings) {
      if (newSettings.hasOwnProperty(k)) {
        settings[k] = newSettings[k];
      }
    }
    Log.log('saved settings=',settings);
    saveSettings(newSettings);
    //w.close();
  }

  function logoutCallback() {
    Log.log('asked to logout');
    Auth.logout();
  }

  var options = {
    version: Self.version,
    userName: Evernote.getUserName(),
    notebooks: Evernote.getNotebookList(),
    _quickNote_addTags: _('quickNote_addTags'),
    desktopClientInstalled: Native.isLoaded()
  };

  Log.log('OPTIONS', options);

  var wnd = getMostRecentBrowserWindow();
  var settings = loadSettings();

  var w = wnd.openDialog(
    Data.url('options.html'),
    'options',
    'chrome=yes,centerscreen=yes,width=610,height=623,dialog=yes,resizable=no'/*,titlebar=no'*/,
    Log.console, //1
    JSON.stringify(settings), //2
    JSON.stringify(options), //3
    doneCallback, //4
    logoutCallback //5
  );
  return w;
}

exports.init = init;
exports.booted = booted;
exports.bootFailed = bootFailed;
exports.alert = alert;
exports.openOptionsDialog = openOptionsDialog;
exports.onActivate = onActivate;
