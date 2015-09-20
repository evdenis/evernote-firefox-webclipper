if (typeof($) === 'undefined') {
  $ = function(str) {
    return document.querySelector(str);
  }
}

if (typeof($$) === 'undefined') {
  $$ = function(str) {
    return [].slice.call(document.querySelectorAll(str));
  }
}

function setEnabled(el, enable) {
  if (enable) {
    el.removeAttribute('disabled');
  } else {
    el.setAttribute('disabled', 1);
  }
}

function dumpVar(obj) {
  var str = '';
  if (obj === null) {
    document.body.textContent += 'null';
    return;
  }
  try {
  for(var k in obj) {
    str += ' ' + k+'='+obj[k]+';';
  }
  } catch(e) {
    str += e;
  }
  document.body.textContent = str;

}

function saveChanges() {
  if (typeof(doneCallback) == 'function') {
    settings = saveSettings();
    doneCallback(JSON.stringify(settings));
  } else {
    console.error("Undefined doneCallback");
  }
}

function setCurrentPage(page) {
  //console.log("setCurrentPage",page);
  if (page === 'keyboard') {
    $('#goto_keyboard').checked = true;
  } else if (page === 'legal') {
    $('#goto_legal').checked = true;
  } else if (page === 'options') {
    $('#goto_options').checked = true;
  } else {
    throw new Error("Unknown page " + page);
  }

  document.getElementById('pages').setAttribute('selection', page);
}

function loadNotebooks(nbs, selectedGuid) {
  var el = document.getElementById('startNotebook');
  if (!el) return;
  while(el.lastChild) {
    el.removeChild(el.lastChild);
  }

  nbs.sort(function(a,b) {
    var aname = a.name.toLowerCase();
    var bname = b.name.toLowerCase();
    if (aname < bname) return -1;
    if (aname > bname) return 1;
    return 0;
  });

  for(var i = 0; i < nbs.length;i++) {
    var optEl = document.createElement('option');
    var nb = nbs[i];
    optEl.setAttribute('value', nb.guid);
    optEl.textContent = nb.name;
    if (nb.guid === selectedGuid) {
      optEl.setAttribute('selected', 1);
    }
    el.appendChild(optEl);
  }
  setEnabled($('#nbs_fixed'), nbs.length > 0);
  setEnabled($('#startNotebook'), nbs.length > 0);


}

function getCurrentPage() {
  var form = $('header form');
  var page = form.querySelector('input[name="tab_selection"]:checked').value;
  return page;
}

function setKeyboardEnabled(enabled) {
  var els = document.querySelectorAll('#page_keyboard input[type=text]');
  var len = els.length;
  for(var i = 0; i < len; ++i) {
    var el = els[i];
    if (enabled) {
      el.setAttribute('enabled', '1');
    // enable all
    } else {
      el.removeAttribute('enabled');
    }
  }
  var checkBox = document.querySelector('#enable_shortcuts');
  if (checkBox.checked !== enabled) {
    checkBox.checked = enabled;
  }
}

function getKeyboardEnabled() {
  var form = $('#page_keyboard form');
  return form.enable_shortcuts.checked;
}

function loadSettings(settings) {
  //console.log('loading settings=', settings);
  //console.log('options.userName', options.userName + '');
  //console.log('options.version', options.version + '');

  setVersion(options.version);
  setUser(options.userName);
  setCurrentPage(settings.page || 'options');
  setKeyboardEnabled(!!settings.globalShortcuts);
  if (settings.useHttps) {
    $('#use_https').checked = true;
  } else {
    $('#use_http').checked = true;
  }
  if (settings.configType == 'prod') {
    $('#use_prod').checked = true;
  } else if (settings.configType == 'staging'){
    $('#use_staging').checked = true;
  }
  if (settings.preferredLocation == 'auto') {
    $('#location_auto').checked = true;
  } else {
    $('#location_override').checked = true;
    if (settings.preferredLocation == 'us') {
      $('#location_name').value = 'us';
    } else if (settings.preferredLocation == 'zh') {
      $('#location_name').value = 'zh';
    }
  }

  if (settings.server == 'auto') {
    $('#server_auto').checked = true;
  } else {
    $('#server_override').checked = true;
    if (settings.server == 'us-prod') {
      $('#server_name').value = 'us-prod';
    } else if (settings.server == 'us-stage') {
      $('#server_name').value = 'us-stage';
    } else if (settings.server == 'cn-prod') {
      $('#server_name').value = 'cn-prod';
    } else if (settings.server == 'cn-stage') {
      $('#server_name').value = 'cn-stage';
    }
  }
  if (settings.clipDestination == 'cloud') {
    $('#use_cloud').checked = true;
  } else if (settings.clipDestination == 'native'){
    $('#use_native').checked = true;
  } else if (settings.clipDestination == 'file'){
    $('#use_file').checked = true;
  }

  $('#show_simsearch').checked = settings.simSearch;
  $('#tag_smart').checked = !!settings.smartTags;

  $('#tag_fixed').checked = !!settings.defaultTags;
  setEnabled($('#startTag'), settings.defaultTags);
  $('#startTag').value = settings.defaultTagString;
  $('#startTag').placeholder = options._quickNote_addTags;
  $('#tag_fixed').addEventListener('change', function(){
    setEnabled($('#startTag'), this.checked);
  });
  setEnabled($('#use_native'), options.desktopClientInstalled);
  if (!options.desktopClientInstalled) {
    $('#use_cloud').checked = true;
  }

  loadNotebooks(options.notebooks, settings.defaultNotebookGuid);

  switch (settings.notebookSelection) {
    case 'fixed':
      $('#nbs_fixed').checked = true;
      break;
    case 'smart':
      $('#nbs_smart').checked = true;
      break;
    case 'last':
    default:
      $('#nbs_last').checked = true;
      break;
  }

  $('#nbs_smart_biz').checked = !!settings.smartFilingBiz;
  setEnabled($('#nbs_smart_biz'), settings.notebookSelection == 'smart');

  $('#nbs_smart').addEventListener('change', function(evt) {
    setEnabled($('#nbs_smart_biz'), true);
  });
  $('#nbs_fixed').addEventListener('change', function(evt) {
    setEnabled($('#nbs_smart_biz'), false);
  });
  $('#nbs_last').addEventListener('change', function(evt) {
    setEnabled($('#nbs_smart_biz'), false);
  });

  switch (settings.afterClip) {
    case 'full':
      $('#pc_full').checked = true;
      break;
    case 'shrink':
      $('#pc_shrink').checked = true;
      break;
    case 'close':
    default :
      $('#pc_close').checked = true;
      break;
  }

  switch (settings.defaultClipAction) {
    case 'last':
      $('#act_last').checked = true;
      break;
    default:
      $('#act_fixed').checked = true;
      var clipActionOption = $('#act_select option[value="'+settings.defaultClipAction+'"]');
      if (clipActionOption) {
        clipActionOption.setAttribute('selected', true);
      }
      break;
  }
}

function saveSettings() {

  settings.page = getCurrentPage();
  //console.log("PREFS.page=",settings.page);
  settings.globalShortcuts = getKeyboardEnabled();
  //console.log("PREFS.keyboard_enabled=",settings.keyboard_enabled);
  //settings.hotkeys = saveHotkeys();
  settings.useHttps = !!$('INPUT#use_https').checked;
  //console.log("PREFS.useHttps=",settings.useHttps);
  settings.configType = $('INPUT#use_prod').checked ? 'prod' : 'staging';
  //console.log("PREFS.configType=",settings.configType);

  if ($('#location_auto').checked) {
    settings.preferredLocation = 'auto';
  } else {
    settings.preferredLocation = $('SELECT#location_name').value;
  }
  //console.log("PREFS.preferredLocation=",settings.preferredLocation);

  if ($('#server_auto').checked) {
    settings.server = 'auto';
  } else {
    settings.server = $('SELECT#server_name').value;
  }
  //console.log("PREFS.server=",settings.server);

  if ($('#use_cloud').checked) {
    settings.clipDestination = 'cloud';
  } else if ($('#use_native').checked) {
    settings.clipDestination = 'native';
  } else if ($('#use_file').checked) {
    settings.clipDestination = 'file';
  }

  settings.simSearch = !!$('INPUT#show_simsearch').checked;
  settings.smartTags = !!$('#tag_smart').checked;
  settings.defaultTags = !!$('#tag_fixed').checked;
  settings.defaultTagString = $('#startTag').value;
  settings.smartFilingBiz = !!$('#nbs_smart_biz');
  if ($('#nbs_fixed').checked) {
    settings.notebookSelection = 'fixed';
  } else if ($('#nbs_smart').checked) {
    settings.notebookSelection = 'smart';
  } else if ($('#nbs_last').checked) {
    settings.notebookSelection = 'last';
  }

  if ($('#pc_full').checked) {
    settings.afterClip = 'full'
  } else if ($('#pc_shrink').checked) {
    settings.afterClip = 'shrink'
  } else if ($('#pc_close').checked) {
    settings.afterClip = 'close'
  }

  if ($('#act_last').checked) {
    settings.defaultClipAction = 'last';
  } else {
    settings.defaultClipAction = $('#act_select').value;
  }
  settings.defaultNotebookGuid = $('#startNotebook').value;

  //console.log("PREFS=",JSON.stringify(settings));
  return settings;
}

/** Represents a keyboard event as a user-readable string */
function hotkeyString(evt) {
  var combo = [];
  if (evt.metaKey) {
    combo.push(METAKEY_STR);
  }
  if (evt.altKey) {
    combo.push(ALTKEY_STR);
  }
  if (evt.ctrlKey) {
    combo.push(CTRLKEY_STR);
  }
  if(evt.shiftKey) {
    combo.push(SHIFTKEY_STR);
  }
  var code = evt.keyCode;
  var name = '' + code;
  if (code in KEY_NAME) {
    name = KEY_NAME[code];
  }
  combo.push(name);
  return combo.join('+');
}

function isValidHotkey(evt) {
  if (!evt) return false;
  var code = evt.keyCode;
  //console.log(JSON.stringify(code), JSON.stringify(RESERVED_KEYS));
  if (RESERVED_KEYS.indexOf(code)>=0) return false;

  return true;
}

function getHotkey(el) {
  var evt = {};
  evt.keyCode = parseInt(el.getAttribute('data-keyCode'));
  if (!(evt.keyCode>0)) return null;
  evt.shiftKey = el.getAttribute('data-shiftKey');
  evt.altKey = el.getAttribute('data-altKey');
  evt.ctrlKey = el.getAttribute('data-ctrlKey');
  evt.metaKey = el.getAttribute('data-metaKey');
  return evt;
}

function setHotkey(el, evt) {
  el.setAttribute('data-keyCode', evt.keyCode);
  el.setAttribute('data-shiftKey', evt.shiftKey);
  el.setAttribute('data-altKey', evt.altKey);
  el.setAttribute('data-ctrlKey', evt.ctrlKey);
  el.setAttribute('data-metaKey', evt.metaKey);
  el.value = hotkeyString(evt);
}

function loadHotkeys(hotkeys) {
  hotkeys = hotkeys || {};
  var els = document.querySelectorAll('#page_keyboard input[type=text]');
  var len = els.length;

  for(var i = 0; i < len; ++i) {
    var el = els[i];
    var name = el.id;
    if (!name) {
      console.error("unnamed element",el);
      continue;
    }
    if (!(name in hotkeys)) {
      //console.info("unknown name ",name);
      continue;
    }
    var evt = hotkeys[name];
    setHotkey(el, evt);
  }
}

function saveHotkeys() {
  var hotkeys = {};
  var els = document.querySelectorAll('#page_keyboard input[type=text]');
  var len = els.length;

  for(var i = 0; i < len; ++i) {
    var el = els[i];
    var name = el.id;
    if (!name) {
      console.error("unnamed element",el);
      continue;
    }
    var evt = getHotkey(el);
    if (!evt) {
      console.error("no data on ", el);
      continue;
    }
    hotkeys[name] = evt;
  }
  return hotkeys;
}

// todo:load from a file
function initKeyNames() {
  for(var k in KeyboardEvent) {
    var code = KeyboardEvent[k];
    if (!k.startsWith('DOM_VK_')) continue;
    var name = k.substr(7);
    name = name.replace('_', ' ');

    //console.log(name);
    KEY_NAME[KeyboardEvent[k]] = name;
  }
}

function translateModifiers(platform) {
  var els = document.querySelectorAll('#page_keyboard input[type=text]');
  var len = els.length;
  for(var i = 0; i < len; ++i) {
    var el = els[i];
    if (el.classList.contains('noxlate')) continue;
    var val = el.value;

    if (platform.startsWith('Mac')) {
      val = val.replace('CTRL','CMD').replace('ALT','OPT');
    } else {
      val = val.replace('CMD','CTRL').replace('OPT','ALT');
    }
    el.value = val;
  }
}

var args = window.arguments;
// we cannot pass the settings object directly, because the arguments are wrapped
// by a proxy of some sort and their members are not accessible from the local environment
if (args[0]) {console = args[0];}


var settings = JSON.parse(args[1]);
var options = JSON.parse(args[2]);
var doneCallback = args[3];
var logoutCallback = args[4];

var RESERVED_KEYS = [
  KeyboardEvent.DOM_VK_SHIFT,
  KeyboardEvent.DOM_VK_CONTROL,
  KeyboardEvent.DOM_VK_ALT,
  KeyboardEvent.DOM_VK_META,
  KeyboardEvent.DOM_VK_ALTGR,
  KeyboardEvent.DOM_VK_WIN,
  KeyboardEvent.DOM_VK_TAB,
  KeyboardEvent.DOM_VK_CONTEXT_MENU,
  KeyboardEvent.DOM_VK_CAPS_LOCK,
  KeyboardEvent.DOM_VK_LEFT,
  KeyboardEvent.DOM_VK_UP,
  KeyboardEvent.DOM_VK_RIGHT,
  KeyboardEvent.DOM_VK_DOWN,
];

// todo: localize
var KEY_NAME = {
};

function logout() {
  //console.log('logout');
  if (typeof(logoutCallback) == 'function') {
    logoutCallback();
  } else {
    console.error('undefined logout callback');
  }
}
function setUser(userName) {
  if (userName) {
    $('.logged-out').style.display = 'none';
    $('.logged-in').style.display = 'block';
    $('#username').textContent = userName;
  } else {
    $('.logged-out').style.display = 'block';
    $('.logged-in').style.display = 'none';
  }
}

function setVersion(version) {
  $('#version').textContent = version;
}

function start() {

  $('#logout').addEventListener('click', function(evt) {
    logout();
    setUser(null);
  });


  $('#done').addEventListener('click', function(evt) {

    saveChanges();
    window.close();
  });


  $('#goto_options').addEventListener('change', function(evt) {
    setCurrentPage('options');
  });
  $('#goto_keyboard').addEventListener('change', function(evt) {
    setCurrentPage('keyboard');
  });
  $('#goto_legal').addEventListener('change', function(evt) {
    setCurrentPage('legal');
  });

  $('#enable_shortcuts').addEventListener('change', function(evt) {
    //console.log("EVENT ", evt.type,evt.target);
    var enabled = this.checked;
    var els = document.querySelectorAll('#page_keyboard input[type=text]');
    var len = els.length;
    for(var i = 0; i < len; ++i) {
      var el = els[i];
      if (enabled) {
        el.setAttribute('enabled', '1');
        // enable all
      } else {
        el.removeAttribute('enabled');
      }
    }
  });


  $('#startTag').addEventListener('click', function(evt){
    $('#tag_fixed').checked = true;
    evt.stopPropagation();
    evt.preventDefault();
  });

  document.addEventListener('keydown', function(evt) {
    if (evt.keyCode === 220 && evt.shiftKey && evt.altKey && evt.ctrlKey) {
      document.body.classList.toggle('dbg');
    }
  });


  translateModifiers(navigator.platform);


  loadSettings(settings);
}

window.onload = start;


