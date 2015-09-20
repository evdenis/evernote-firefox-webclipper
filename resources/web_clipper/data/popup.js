
try{
var options = self.options;
var submitUrl = null;
var secondFactorInfo = null;
var expiredPassFunction = function() {};

var Popup = (function(){
  var Promise = window['promise/core'];

  var switchService = Lpc.Client.remote("switchService");
  var hidePopup = Lpc.Client.remote("hidePopup");
  var resizePopup = Lpc.Client.remote("resizePopup");
  var authenticate = Lpc.Client.remoteAsync("authenticate");
  var authenticateTwoFactor = Lpc.Client.remoteAsync("authenticateTwoFactor");
  var forgotPassword = Lpc.Client.remote("forgotPassword");
  var beginRegistration = Lpc.Client.remoteAsync("beginRegistration");
  var checkUsernameRemote = Lpc.Client.remoteAsync("checkUsernameRemote");
  var checkEmailRemote = Lpc.Client.remoteAsync("checkEmailRemote");

  var finishRegistration = Lpc.Client.remoteAsync("finishRegistration");
  var openHomePage = Lpc.Client.remote("openHomePage");
  var openForgotPasswordPage = Lpc.Client.remote("openForgotPasswordPage");
  var openTwoStepHelpPage = Lpc.Client.remote("openTwoStepHelpPage");
  var simSearch = Lpc.Client.remote('simSearch');
  var switchProfile = Lpc.Client.remoteAsync('switchProfile');
  var expirePassword = Lpc.Client.remote('expirePassword');

  var currentPage = "login";

  function setError(elt, error) {
    elt.classList.remove("success");
    elt.classList.add("error");
    var parent = elt.parentElement;
    var textElement = parent.querySelector(".msg_text");
    if (!textElement) {
      Dbg.error("cannot insert text for " + elt.id);
      return;
    }
    textElement.textContent = error;
  }

  function setSuccess(elt) {
    elt.classList.remove("error");
    elt.classList.add("success");
  }

  function clearError(elt) {
    elt.classList.remove("error", "success");
  }

  function adjustPopupSize(el) {
    el = el || document.body;
    resizePopup(document.body.clientWidth, document.body.clientHeight);
  }

  function setGlobalError(elt, error) {
    Dbg.log('setGlobalError(#'+elt.id+','+error+')');
    elt.classList.add("error");
    elt.textContent = error;
  }

  function clearGlobalError() {
    var  els = document.querySelectorAll(".logo");
    for(var i = 0; i < els.length; i++) {
      let elt = els[i];
      elt.classList.remove("error");
    }
  }

  const PASSWORD_RE = new RegExp("^[A-Za-z0-9!#$%&'\\(\\)*+,./:;<=>?@^_`{|}~\\[\\]\\\\-]{6,64}$");;

  function validatePassword(elt) {
    var pass = elt.value;

    if (pass.length == 0) {
      setError(elt, _("regForm_password_required"));
      return false;
    } else if (!PASSWORD_RE.test(pass)) {
      setError(elt, _("regForm_invalid_password"));
      return false;
    }
    return true;
  }

  function validateSignInPassword(elt) {
    var pass = elt.value;

    if (pass.length == 0) {
      setError(elt, _("loginForm_passwordError_5"));
      return false;
    } else if (!PASSWORD_RE.test(pass)) {
      setError(elt, _("loginForm_passwordInvalidError"));
      return false;
    }
    return true;
  }

  function checkPassword() {
    if (!validatePassword(this)) {
      return;
    }
    setSuccess(this);
  }

  const USERNAME_RE = /^[a-z0-9]([a-z0-9_-]{0,62}[a-z0-9])?$/;

  function validateUsername(elt) {
    var user = elt.value;

    if (user === '') {
      setError(elt, _("loginForm_usernameError_5"));
      return false;
    }
    if (!USERNAME_RE.test(user)) {
      setError(elt, _("regForm_invalid_username"));
      return false;
    }

    return true;
  }

  function validateSignInUsername(elt) {
    var user = elt.value;
    if (user === '') {
      setError(elt, _("loginForm_usernameError_5"));
      return false;
    }
    return true;
  }

  function checkUsername() {
    var that = this;
    if (!validateUsername(this)) {
      return;
    }
    checkUsernameRemote(this.value).then(function onSuccess(result){
      // mark username as valid.
      Dbg.log("SUCCESS " + JSON.stringify(result));
      setSuccess(that);
      clearGlobalError($('#registration_global_error'));

    }, function(error) {
      if (error.code === 400) {
        setError(that, _("regForm_invalid_username"));
      } else if (error.code === 409) {
        setError(that, _("regForm_taken_username"));
      } else if (error.code === 412) {
        setError(that, _("regForm_deactivated_username"));
      } else if (error.code === 500) {
        setError(that, _("EDAMError_1"));
      } else {
        setGlobalError($('#registration_global_error'), _('Error_Network_Unavailable'));
      }
      // mark username as invalid, depending on result.
      Dbg.log("ERROR " + JSON.stringify(error));
    });
  }

  const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~\-]+(\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~\-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9\-]+)*\.([A-Za-z]{2,})$/;

  function validateEmail(elt) {
    var email = elt.value;
    if (email === '') {
      setError(elt, _("regForm_email_required"));
      return false;
    }
    if (!EMAIL_RE.test(email)) {
      setError(elt, _("regForm_invalid_email"));
      return false;
    }
    return true;
  }

  function checkEmail() {
    if (!validateEmail(this)) {
      return;
    }
    var that = this;

    checkEmailRemote(this.value+'').then(function onSuccess(result){
      // mark username as valid.
      //console.log("SUCCESS " + JSON.stringify(result));
      setSuccess(that);
      clearGlobalError($('#registration_global_error'));
    }, function(error) {
      if (error.code === 400) {
        setError(that, _("regForm_invalid_email"));
      } else if (error.code === 409) {
        setError(that, _("regForm_taken_email"));
      } else if (error.code === 500) {
        // Unknown Server error
        setError(that, _("EDAMError_1"));
      } else {
        setGlobalError($('#registration_global_error'),_('Error_Network_Unavailable'));
      }
      // mark username as invalid, depending on result.
      console.error("error:" + JSON.stringify(error));
    });
  }

  const CAPTCHA_RE = /\d+/;

  function validateCaptcha(elt) {
    var captcha = elt.value;

    if (!CAPTCHA_RE.test(captcha)) {
      setError(elt, _("regForm_invalid_captcha"));
      return false;
    }
    return true;
  }

  function checkCaptcha() {
    if (!validateCaptcha(this)) {
      return;
    }
    setSuccess(this);
  }

  function validateTwoFactor(elt) {
    var code = elt.value;
    if (code === '') {
      setError(elt, _('incorrectCode')); // TODO:empty code
      return false;
    }
    code = code.replace('-', '');
    if (code.length != 6 && code.length != 16) {
      setError(elt, _('incorrectCode')); // TODO:invalid code length
      return false;
    }
    if (!(/\d+/.test(code))) {
      setError(elt, _('incorrectCode')); // TODO:digits only
      return false;
    }
    if (!secondFactorInfo) return false;
    var time = +Date();
    if (secondFactorInfo.expiration < time) {
      setGlobalError($('#signin_global_error'), _('expiredTwoStepCode'));
      setPage('login');
      return false;
    }
    return true;
  }

  function addActionHandler(elt, handler) {
    elt.addEventListener("click", handler);
    elt.addEventListener("keypress", function(evt) {
      if (evt.keyCode == 13) {
        handler.call(this, evt);
      }
    });
  }

  function login() {
    var userElt = $('#signin_user');
    var ok = validateSignInUsername(userElt);
    var passElt = $('#signin_password');
    ok = validateSignInPassword(passElt) && ok;
    if (!ok) return;

    var user = userElt.value;
    var pass = passElt.value;
    authenticate(user, pass).then(
      function onSuccess(result) {
        //console.log("SUCCESS " + JSON.stringify(result));
        clearGlobalError($('#twofactor_global_error'));
        clearGlobalError($('#signin_global_error'));
        if (result.secondFactorRequired) {
          initTwoFactor(result);
        }
      },
      function onError(error) {
        console.error("Popup.onError ", error);

        if (error.errorType === 'NetworkError') {
          setGlobalError($('#signin_global_error'),_('Error_Network_Unavailable'));
          return;
        }

        switch(error) {
          case "INVALID_USERNAME":
            setError($('#signin_user'), _("loginForm_usernameInvalidError"));
            break;
          case "INVALID_PASSWORD":
            setError($('#signin_password'), _("loginForm_passwordInvalidError"));
            break;
          case "USER_DEACTIVATED":
              // TODO: Translate string.
              setError($('#signin_user'),'Username has been deactivated');
            break;
          case 'EXPIRED_PASSWORD':
//                setError($('#signin_password'), _('expiredV1Password'));
              $('#password_expired').style.display = 'block';
              adjustPopupSize($('#page_signin'));

              expiredPassFunction = function() {
                hidePopup();
                expirePassword(user);
              }
            break;

          default:
            setGlobalError($('#signin_global_error'), '' + error);
        }
      }
    );
  }
  function refreshCaptcha() {
    //console.log("refreshCaptcha");
    submitUrl = null;
    beginRegistration().then(
      function onSuccess(result) {
        Dbg.log("SUCCESS " + JSON.stringify(result));
        $('#registration_captcha_req').src = result.captcha+'?cache='+(Math.random());
        submitUrl = result.submit;
        Dbg.log("$('#registration_captcha_req').src = " + result.captcha);
        //$('#registration_email').focus();
        //clearGlobalError($('#registration_global_error'));
      }, function onError(error) {
        Dbg.log("ERROR " + JSON.stringify(error));
        setGlobalError($('#registration_global_error'), _('Error_Network_Unavailable'));
     });
  }

  function initNewUser() {
    setPage('registration');
    submitUrl = null;
    beginRegistration().then(
      function onSuccess(result) {
        Dbg.log("SUCCESS " + JSON.stringify(result));
        $('#registration_captcha_req').src = result.captcha+'?cache='+(Math.random());
        submitUrl = result.submit;
        Dbg.log("$('#registration_captcha_req').src = " + result.captcha);
        $('#registration_email').focus();
        clearGlobalError($('#registration_global_error'));
      }, function onError(error) {
        Dbg.log("ERROR " + JSON.stringify(error));
        setGlobalError($('#registration_global_error'), _('Error_Network_Unavailable'));
     });
  }

  function registerNewUser() {
    if (!submitUrl) return;
    var ok = true;
    var userElt = $('#registration_user');
    // we put ok at the end to force evaluation.
    ok = validateUsername(userElt) && ok;
    var passElt = $('#registration_password');
    ok = validatePassword(passElt) && ok;
    var emailElt = $('#registration_email');
    ok = validateEmail(emailElt) && ok;
    var captchaRespElt = $('#registration_captcha_resp');
    ok = validateCaptcha(captchaRespElt) && ok;
    if (!ok) return;

    var user = userElt.value;
    var pass = passElt.value;
    var email = emailElt.value;
    var captcha = captchaRespElt.value;

    finishRegistration(submitUrl, user, pass, email, captcha).then(
      function (result){
        $('#signin_user').value = user;
        $('#signin_password').value = pass;
        clearGlobalError($('#registration_global_error'));
        return authenticate(user, pass)
        .then(function(result){
          setPage("login");
        },function(err){
          setPage("login");
        });
      },
      function onError(error) {
        Dbg.log("ERROR " + JSON.stringify(error));
        if (typeof(error) == 'object' && error.length) {
          Dbg.log("errors");
          for (var i = 0; i < error.length; i++) {
            let err = error[i];
            let fieldName = err["field-name"];
            let message = err.message;
            //TODO: move to a lookup table.
            // and to Auth.js
            if (fieldName ===  "email") {
              if (err.code === 'registrationAction.email.invalid') {
                message = _("regForm_invalid_email");
              } else if (err.code === 'validation.mask.valueDoesNotMatch') {
                message = _("regForm_invalid_email");
              } else if (err.code === 'registrationAction.email.conflict') {
                message = _("regForm_taken_email");
              } else if (err.code === 'validation.required.valueNotPresent') {
                message = _("regForm_email_required");
              }
              setError($('#registration_email'), message);
            } else if (fieldName ===  "username") {
              if (err.code === 'registrationAction.username.conflict') {
                message = _('regForm_taken_username');
              } else if (err.code === 'validation.mask.valueDoesNotMatch') {
                message = _('regForm_invalid_username');
              } else if (err.code === 'validation.required.valueNotPresent') {
                message = _('loginForm_usernameError_5');
              }
              setError($('#registration_user'), message);
            } else if (fieldName ===  "password") {
              if (err.code === 'validation.required.valueNotPresent') {
                message = _('loginForm_passwordError_5');
              } else if (err.code === 'validation.minlength.valueTooShort') {
                message = _('regForm_invalid_password');
              } else if (err.code === 'validation.mask.valueDoesNotMatch') {
                message = _('regForm_invalid_password');
              }
              setError($('#registration_password'), err.code);
            } else if (fieldName ===  "captcha") {
              Dbg.log("Captcha incorrect");
              setError($('#registration_captcha_resp'), _("regForm_invalid_captcha"));
              refreshCaptcha();
            }
          }
        } else {
          setGlobalError($('#registration_global_error'), _('Error_Network_Unavailable'));
        }
      }
    );
  }

  function initTwoFactor(info) {
    secondFactorInfo = info;
    if (info.secondFactorDeliveryHint) {
      let sms = _('smsMessage');
      sms = sms.replace('$phone$', info.secondFactorDeliveryHint)
      $('#secondFactorExplanation').textContent = sms;
    } else {
      $('#secondFactorExplanation').textContent = _('gaMessage');
    }
    setPage('twofactor');
    $('#code').focus();
  }

  function loginTwoFactor() {
    if (!validateTwoFactor($('#code'))) return;

    var code = $('#code').value;

    authenticateTwoFactor(code, secondFactorInfo.authenticationToken).then(
      function onSuccess(result) {
        Dbg.log("authenticateTwoFactor SUCCESS " + JSON.stringify(result));
        clearGlobalError($('#twofactor_global_error'));
        setPage('login');
        $('#signin_password').value = '';
        $('#registration_password').value = '';
      },
      function onError(error) {
        Dbg.log("ERROR " + JSON.stringify(error));
        if (error === "INVALID_TWO_STEP_CODE") {
          setError($('#code'), _("incorrectCode"));
        } else if (error === "EXPIRED_AUTHENTICATION_TOKEN") {
          setError($('#signin_global_error'),_('expiredTwoStepCode'));
          setPage('signin');
        } else {
          setGlobalError($('#twofactor_global_error'),_('Error_Network_Unavailable'));
        }
      }
    );
  }

  function setPage(pageId) {
    Dbg.info("setpage="+pageId);
    currentPage = pageId;
    document.body.setAttribute('class', 'page_' + pageId);
    switch(pageId) {
      case 'login':
        page = 'login';
        //$('#page_signin').setAttribute('data-visibility', 'visible');
        //$('#page_registration').setAttribute('data-visibility', 'invisible');
        //$('#page_twofactor').setAttribute('data-visibility', 'invisible');
        $('#signin_user').focus();
        $('#signin_user').select();
        adjustPopupSize($('#page_signin'));
      break;
      case 'registration':
        page = 'registration';
        //$('#page_signin').setAttribute('data-visibility', 'invisible');
        //$('#page_registration').setAttribute('data-visibility', 'visible');
        //$('#page_twofactor').setAttribute('data-visibility', 'invisible');
        $('#registration_email').focus();
        $('#registration_email').select();
        adjustPopupSize($('#page_registration'));
      break;
      case 'twofactor':
        //$('#page_signin').setAttribute('data-visibility', 'invisible');
        //$('#page_registration').setAttribute('data-visibility', 'invisible');
        //$('#page_twofactor').setAttribute('data-visibility', 'visible');
        $('#code').focus();
        $('#code').select();
        adjustPopupSize($('#page_twofactor'));
      break;
    }
  }

  function init() {
    if (options.china) {
      document.documentElement.setAttribute('class', 'china');
    }
    if (options.testUser) {
      $('#signin_user').value = options.testUser;
    }
    if (options.testPassword) {
      $('#signin_password').value = options.testPassword;
    }

    $('#simsearch').checked = !!options.simSearch;

    addActionHandler($('#signin'), login);
    addActionHandler($('#register'), initNewUser);
    addActionHandler($('#registration'), registerNewUser);
    addActionHandler($('#page_registration .sign_in'), function() {
      setPage("login");
      $('#signin_user').focus();
    });
    addActionHandler($('#page_twofactor .cancel'), function() {
      setPage("login");
      $('#signin_user').focus();
    });
    addActionHandler($('#continue'), loginTwoFactor);
    $('#code').addEventListener("keypress", function(evt) {
      if (evt.keyCode == 13) {
        loginTwoFactor();
      }
    });
    $('#simsearch').addEventListener('change', function(evt){
      simSearch(this.checked);
    });


    $('#registration_email').addEventListener('blur', checkEmail);
    $('#registration_user').addEventListener('blur', checkUsername);
    $('#registration_password').addEventListener('blur', checkPassword);
    $('#registration_captcha_resp').addEventListener('blur', checkCaptcha);

    // Whenever user changes the inputfield, it clears the associated error
    var els = document.querySelectorAll(".inputfield");
    for(var i = 0; i < els.length; i++) {
      let el = els[i];
      el.addEventListener("input", function() {
        clearError(this);
      });
      el.addEventListener("focus", function() {
        this.select();
      });
    }

    // Whenever user clicks on a logo, it opens up the evernote home page
    els = document.querySelectorAll(".logo");
    for(var i = 0; i < els.length; i++) {
      let el = els[i];
      addActionHandler(el, function() {
        openHomePage();
        hidePopup();
      });
    }

    // Whenever user clicks on a close box, it closes the popup.
    els = document.querySelectorAll(".close");
    for(var i = 0; i < els.length; i++) {
      let el = els[i];
      addActionHandler(el, hidePopup);
    }
    addActionHandler($('#forgot_password'), function() {
      openForgotPasswordPage();
    });
    addActionHandler($('#verification_code'), function() {
      openTwoStepHelpPage(secondFactorInfo.authenticationToken);
    });

    Content.localizeHtml(document, {
      'tos_url' : 'http://evernote.com/legal/tos.php',
      'pp_url' : 'http://evernote.com/legal/privacy.php'
    });

    $('#signin_user').addEventListener("keypress", function(evt) {
      if (evt.keyCode == 13) {
        login();
        evt.preventDefault();
        evt.stopPropagation();
      }
    });
    $('#signin_password').addEventListener("keypress", function(evt) {
      if (evt.keyCode == 13) {
        login();
        evt.preventDefault();
        evt.stopPropagation();
      }
    });
    $('#page_signin').addEventListener("keypress", function(evt) {
      if (evt.keyCode == 13) {
        login();
        evt.preventDefault();
        evt.stopPropagation();
      }
    });
    $('#page_registration').addEventListener("keypress", function(evt) {
      if (evt.keyCode == 13) {
        registerNewUser();
        evt.preventDefault();
        evt.stopPropagation();
      }
    });
    $('#page_twofactor').addEventListener("keypress", function(evt) {
      if (evt.keyCode == 13) {
        loginTwoFactor();
        evt.preventDefault();
        evt.stopPropagation();
      }
    });

    $('#code').addEventListener("keypress", function(evt) {
      if (evt.keyCode == 13) {
        loginTwoFactor();
        evt.preventDefault();
        evt.stopPropagation();
      }
    });

    addActionHandler($('#switcher'), function() {

      switchProfile().then(function(region){
        setRegion(region);
        setPage(currentPage);
      });


    });

    addActionHandler($('#password_expired button'), function() {
      if (typeof(expiredPassFunction) === 'function') {
        expiredPassFunction();
      }
    });

    if (/^en(-.*)?/.test(navigator.language)) {
      $('#password_expired p').innerHTML = 'Your password has expired.<br>Please reset it now.';
    }
    setPage("login");

  }

  init();

  window.addEventListener('unload', function(evt) {
    Dbg.log('Panel unloaded');
  });

  self.port.on("show", function() {
    $('#password_expired').style.display = 'none';
    setPage(currentPage);
    if (!options.testPassword) {
      $('#signin_password').value = '';
    }
  });

  function setRegion(region) {
    //console.log("setRegion", region);
    if (region === 'zh') {
      document.documentElement.setAttribute('class', 'china');
    } else {
      document.documentElement.setAttribute('class', 'us');
    }
  }

  self.port.on("set-opts", function(opts) {
    setRegion(opts.region);

    if (opts.enableSwitch) {
      $('#switcher').style.display = 'inline-block';
    } else {
      $('#switcher').style.display = 'none';
    }
    $('#simsearch').checked = !!opts.simSearch;
    setPage(currentPage);
  });


  return {};
})();
} catch(e) {
  Dbg.log("Popup.js ERROR:" + e);
  Dbg.exception(e.stack);
  window.alert(e);
}
