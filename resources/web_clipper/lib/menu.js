/**
 * Created by mz on 2014-07-12.
 */
const ContextMenu = require("sdk/context-menu");
const Data = require('sdk/self').data;
const _ = require("sdk/l10n").get;

const Evernote = require('./evernote');
const Log = require('./log');
const Util = require('./util');
const TabTracker = require('./tracker').TabTracker;

var { Hotkey } = require("sdk/hotkeys");
var menuItems = [];

function getSelectedNode(target) {
  if (!target || !target.id || !target.value) return null;


  var tab = Util.getActiveTab();
  var window = Util.getTabWindow(tab);
  if (!window) return null;
  var document = window.document;
  if (!document) return null;
  var node = document.querySelector('['+target.id + '=\'' + target.value +'\']');
  if (!node) return null;
  node.removeAttribute(target.id);
  return node;
}

function isEnabled() {
  if (menuItems.length > 0) {
    return true;
  }
  return false;
}

function onLogin() {
  if (isEnabled()) return;

  var clipPage = ContextMenu.Item(
      {
        label: _('contextMenuClipPage'),
        context: ContextMenu.SelectorContext('html'),
        contentScriptFile: Data.url('menu.js'),
        onMessage: function(msg) {
          Log.log("contextMenuClipPage", msg.attrId, msg.attrValue);
          var webClip = TabTracker.getInstance('WebClip');
          var node = getSelectedNode(msg.target);
          webClip && webClip.clipFullPageImmediate();
        }
      }
  );
  menuItems.push(clipPage);

  if (1/* bookmark clipping enabled*/) {
    var clipUrl = ContextMenu.Item(
        {
          label: _('contextMenuClipUrl') + " (u)",
          context: ContextMenu.SelectorContext('html'),
          contentScriptFile: Data.url('menu.js'),
          accesskey: "u",
          onMessage: function(msg) {
            Log.log("clipURL", JSON.stringify(msg));
            var webClip = TabTracker.getInstance('WebClip');
            var node = getSelectedNode(msg.target);
            webClip && webClip.clipUrlImmediate();
          }
        }
    );
    var hk_clipUrl = Hotkey({
       combo: "alt-u",
       onPress: function () {
         var webClip = TabTracker.getInstance('WebClip');
         webClip && webClip.clipUrlImmediate();
       }
    });
    menuItems.push(clipUrl);
    menuItems.push(hk_clipUrl);
  }

  if (1/* selection implemented*/) {
    var clipSelection = ContextMenu.Item(
        {
          label: _('contextMenuClipSelection') + " (l)",
          context: ContextMenu.SelectionContext(),
          contentScriptFile: Data.url('menu.js'),
          accesskey: "l",
          onMessage: function(msg) {
            Log.log("clipSelection", JSON.stringify(msg));
            var webClip = TabTracker.getInstance('WebClip');
            var node = getSelectedNode(msg.target);
            webClip && webClip.clipSelectionImmediate();
          }
        }
    );
    var hk_clipSelection = Hotkey({
       combo: "alt-l",
       onPress: function () {
          var s = Util.getTabWindow(Util.getActiveTab()).getSelection().toString();
          if (s) {
             var webClip = TabTracker.getInstance('WebClip');
             webClip && webClip.clipSelectionImmediate();
          }
       }
    });
    menuItems.push(clipSelection);
    menuItems.push(hk_clipSelection);
  }

  if (1/* clip screenshot enabled */) {
    var clipScreenshot = ContextMenu.Item(
        {
          label:_('contextMenuClipScreenshot'),
          context: ContextMenu.SelectorContext('html'),
          contentScriptFile: Data.url('menu.js'),
          onMessage: function(msg) {
            Log.log("clipScreenshot", JSON.stringify(msg));
            var webClip = TabTracker.getInstance('WebClip');
            var node = getSelectedNode(msg.target);
            webClip && webClip.clipScreenshotImmediate();
          }
        }
    );
    menuItems.push(clipScreenshot);
  }

  if (0/* old clip image enabled */) {
    var clipImage = ContextMenu.Item(
        {
          label: _('contextMenuClipImage'),
          context: ContextMenu.SelectorContext('img,image'),
          contentScriptFile: Data.url('menu.js'),
          onMessage: function(msg) {
            Log.log("contextMenuClipImage", JSON.stringify(msg));
            var webClip = TabTracker.getInstance('WebClip');
            var node = getSelectedNode(msg.target);
            node && webClip && webClip.clipElementImmediate(node, true);
          }

        }
    );
    menuItems.push(clipImage);
  }

  if (1/* clip image implemented*/) {
    clipImage = ContextMenu.Item(
        {
          label: _('contextMenuClipImage'),
          context: ContextMenu.PredicateContext(function(context){
            if (context.documentType.startsWith('image/')) return true;
            if (context.targetName == 'image' || context.targetName == 'img') return true;
            return false;
          }),
          data: 'image',
          contentScriptFile: Data.url('menu-data.js'),
          onMessage: function(msg) {
            Log.log("contextMenuClipImage", JSON.stringify(msg));
            var webClip = TabTracker.getInstance('WebClip');
            webClip && webClip.clipDataImmediate(msg.src, msg.mime, msg.fileName, msg.title);
          }

        }
    );
    menuItems.push(clipImage);
  }
  if (1/* clip PDF implemented*/) {
    clipPDF = ContextMenu.Item(
        {
          label: _('contextMenuClipPDF'),
          context: ContextMenu.PredicateContext(function(context){
            if (!Evernote.specialClipSupported('pdf')) return false;
            if (context.documentType === 'application/pdf') return true;
            return false;
          }),
          data: 'pdf',
          contentScriptFile: Data.url('menu-data.js'),
          onMessage: function(msg) {
            Log.log("contextMenuClipPDF", JSON.stringify(msg));
            var webClip = TabTracker.getInstance('WebClip');
            webClip && webClip.clipDataImmediate(msg.src, 'application/pdf', msg.fileName, msg.title);
          }
        }
    );
    menuItems.push(clipPDF);
  }
}

function onLogout() {
  for (var i = 0; i < menuItems.length; i++) {
    let menuItem = menuItems[i];
    menuItem.destroy();
  }
  menuItems = [];
}

exports.onLogin = onLogin;
exports.onLogout = onLogout;
exports.isEnabled = isEnabled;
