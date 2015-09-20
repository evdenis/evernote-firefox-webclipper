/**
 * Created by mz on 15-01-12.
 */

const { WindowTracker, browserWindowIterator } = require('sdk/deprecated/window-utils');
const { isBrowser, getInnerId } = require('sdk/window/utils');
const Data = require('sdk/self').data;

const Auth = require('./auth');
const Log = require('./log');
const UI = require('./ui');

var MenuWrapper = function MenuWrapper(window) {
  const SEPARATOR_CLASS = 'addon-context-menu-separator';

  var menuItem;
  var separatorItem;

  function addMenu() {
    var menu = window.document.getElementById('menu_ToolsPopup');
    separatorItem = window.document.createElement('menuseparator');
    separatorItem.setAttribute('class', SEPARATOR_CLASS);
    menu.appendChild(separatorItem);

    menuItem = window.document.createElement('menuitem');
    menuItem.setAttribute('id', 'evernote-webclipper-menu');
    menuItem.setAttribute('label', 'WebClipper');
    menuItem.setAttribute('disabled', 'true');
    menu.appendChild(menuItem);

    menuItem.addEventListener('command', onCommand);
  }


  function onCommand(evt) {
    UI.onActivate();
  }

  addMenu();

  //console.log(Util.serializeXmlDocument(window.document));

  //Add Custom Styles

  var that = {
    destroy: function() {
      if (menuItem) {
        menuItem.parentElement.removeChild(menuItem);
        menuItem = null;
      }
      if (separatorItem) {
        separatorItem.parentElement.removeChild(separatorItem);
        separatorItem = null;
      }
    },
    enable: function enable() {
      if (menuItem) {
        menuItem.removeAttribute('disabled');
      }
    },

    disable: function disable() {
      if (menuItem) {
        menuItem.setAttribute('disabled', 'true');
      }
    }

  };
  return that;
};

var MenuManager = {
  _windowMap: new Map(),

  // When a new window is added start watching it for context menu shows
  onTrack: function onTrack(window) {
    if (!isBrowser(window)) { return; }
    Log.log('GlobalUI.MenuManager.onTrack');
    // Generally shouldn't happen, but just in case
    if (this._windowMap.has(window)) {
      Log.warn('Already seen this window');
      return;
    }
    let wrapper = MenuWrapper(window);
    this._windowMap.set(window, wrapper);
  },

  onUntrack: function onUntrack(window) {
    if (!isBrowser(window)) { return; }
    Log.log('GlobalUI.MenuManager.onUntrack');

    var wrapper = this._windowMap.get(window);
    // This shouldn't happen but protect against it anyway
    if (!wrapper) { return; }
    wrapper.destroy();

    this._windowMap.delete(window);
  },

  onLogin: function onLogin() {
    for (let [window, wrapper] of this._windowMap) {
      wrapper.enable();
    }
  },

  onLogout: function onLogout() {
    for (let [window, wrapper] of this._windowMap) {
      wrapper.disable();
    }
  },

  onLogout: function onLogout() {

  }
};

const GLOBAL_STYLE_PATH = 'chrome://firenote/content/global.css';

var StyleManager = {
  _windowSet: new Set(),

  addXmlStylesheet: function addXmlStylesheet(window, stylesheet) {
    var pi = window.document.createProcessingInstruction('xml-stylesheet', 'href="' + stylesheet + '" type="text/css"');
    window.document.insertBefore(pi, window.document.firstChild);
  },

  // When a new window is added start watching it for context menu shows
  onTrack: function onTrack(window) {
    if (!isBrowser(window)) { return; }
    Log.log('GlobalUI.StyleManager.onTrack');

    // Generally shouldn't happen, but just in case
    if (this._windowSet.has(window)) {
      Log.warn('Already seen this window');
      return;
    }
    this.addXmlStylesheet(window, GLOBAL_STYLE_PATH);
    this._windowSet.add(window);
  },

  onUntrack: function onUntrack(window) {
    if (!isBrowser(window)) { return; }
    Log.log('GlobalUI.StyleManager.onUntrack');

    this._windowSet.delete(window);
  },
};

function init() {
  WindowTracker(MenuManager);
  WindowTracker(StyleManager);
  Auth.on('logged-in', function() {
    MenuManager.onLogin();
  });
  Auth.on('logged-out', function() {
    MenuManager.onLogout();
  });
}
exports.init = init;
