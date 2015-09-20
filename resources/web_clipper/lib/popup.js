/**
 * Created by mz on 2014-08-23.
 */
var Data = require('sdk/self').data;
var Env = require('sdk/system/environment').env;
var Event = require('sdk/event/core');
var Prefs = require("sdk/simple-prefs");
var Tabs = require('sdk/tabs');

var Auth = require('./auth');
var Boot = require('./boot');
var dispatch = require('./ui-dispatch').dispatch;
var Log = require('./log');

var Registration = require('./registration');
var Toolbar = require('./toolbar');
var Url = require('./url');

var Widget = require('./widget');

var Popup = (function(){
  var panel;
  let l10nData = require("@l10n/data");
  var enableAutoShow = true;
  var locale = Boot.getBootLocale().toLowerCase();
  var isChina = (locale == 'zh' || locale == 'zh-cn');
  var widgetCtl = null;
  var isAustralisEnabled = false;

  function init() {
    panel = require("sdk/panel").Panel({
        id: "evernote-web-clipper-login",
        label: "Web Clipper Login",
        width: 292+2,
        height:376+2,
        contentURL: Data.url("popup.html"),
        contentScriptFile: [
         Data.url("promise.js"),
         Data.url("content.js"),
         Data.url("popup.js")
        ],
        contentScriptWhen: "end",
        contentScriptOptions: {
         l10n: l10nData,
         china: isChina,
         testUser: Env['FIRENOTE_USER'],
         testPassword: Env['FIRENOTE_PASS'],
         simSearch: Prefs.prefs.simSearch,
        },
        onShow: handleShow,
        onHide: handleHide,
        });
    var _show = panel.show;

    panel.show = function() {
      /** Horrible hack to prevent showing of panel on clicks
       * when we are supposed to show sidebar instead. */
      if (!enableAutoShow) return;

      this.port.emit('show');

      this.port.emit('set-opts', {
        region: Boot.getServiceHostLocation(),
        enableSwitch: Boot.getProfileCount() > 1,
        simSearch: Prefs.prefs.simSearch
      });

      if (isAustralisEnabled && widgetCtl) {
        // australis style attachment
        return _show.call(this, {position: widgetCtl});
      } else {
        return _show.apply(this, arguments);
      }
    }
    dispatch(panel.port, Popup);
  }

  function handleShow() {
    Event.emit(Popup, 'show');
  }

  function handleHide() {
    Event.emit(Popup, 'hide');
  }

  var Popup = {
    init: init,

    hidePopup: function() {
      Log.log("Popup.hidePopup");
      panel.hide();
    },

    showPopup: function() {
      Log.log("Popup.showPopup");
      panel.show();
    },

    setWidgetCtl: function(widget) {
      widgetCtl = widget;
    },

    setAustralisEnabled: function(enabled) {
      isAustralisEnabled = enabled;
    },

    resizePopup: function(w, h) {
      Log.log("resizePopup", w, h);
      panel.resize(w, h);
    },

    openTab: function(url) {
      Log.log("openTab " + url);
      require("sdk/tabs").open(url);
    },

    authenticate: function(user, pass) {
      Log.log("Main::authenticate " + user + ":" + pass);
      return Auth.login(user, pass);
    },

    authenticateTwoFactor: function(code, auth) {
      Log.log("Main::authenticateTwoFactor " + code + ":" + auth);
      return Auth.loginTwoFactor(code, auth)
          .then(function onSuccess(result) {
                  Toolbar.startEdit();
                  Popup.autoShow(false);
                  Popup.hidePopup();
                  Widget.setAuthState(true);
                  Widget.setSidebarState(true);
                  return result;
                });
    },

    beginRegistration: Registration.beginRegistration,

    checkUsernameRemote: Registration.checkUsernameRemote,

    checkEmailRemote: Registration.checkEmailRemote,

    finishRegistration: Registration.finishRegistration,

    openHomePage: function() {
      Tabs.open(Url.homePage());
    },

    switchProfile: function() {
      Boot.switchToNextProfile();
      return Boot.getServiceHostLocation();
    },

    openForgotPasswordPage: function() {
      Tabs.open(Url.forgotPasswordPage());
    },

    openTwoStepHelpPage: function(auth) {
      Tabs.open(Url.twoStepHelpPage(auth));
    },

    simSearch: function(enable) {
      Prefs.prefs.simSearch = enable;
    },

    get panel() {
      return panel;
    },

    autoShow: function(enable) {
      enableAutoShow = enable;
    },

    expirePassword: function expirePassword(userName) {
      Tabs.open(Url.getPasswordExpiredPage(userName));
    }

  };

  Popup.on = Event.on.bind(null, Popup);
  Popup.once = Event.once.bind(null, Popup);
  Popup.off = Event.off.bind(null, Popup);
  Popup.removeListener = function removeListener(type, listener) {
    Event.off(Popup, type, listener);
  };

  return Popup;
})();

exports.Popup = Popup;
