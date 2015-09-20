var {imported, exported} = channel;
try {

Content.localizeHtml(document.body);

const HTML_TOOLBAR_TITLE=$('#toolbar_title');
const HTML_ADD_TAG = $('#add_tag');

const Focus = {
  SAVE: 'save',
  TITLE: 'title',
  NOTEBOOK: 'notebook',
  TAG: 'tag',
  COMMENT: 'comment'
};

var gShowing = false;

function setFocus(elementId) {
  //console.log("Content/Toolbar.setFocus", elementId);
  switch(elementId) {
    case 'save':
      $('#toolbar_save').focus();
      break;
    case 'title':
      $('#toolbar_title_static').focus();
      break;
    case 'notebook':
      //let {left, top}  = $('#notebook .anchor').getBoundingClientRect();
      showNotebookSelector();
      break;
    case 'tag':
      $("#add_tag").focus();
      break;
    case 'comment':
      $('#add_comment').focus();
      break;
    default:
      console.error("Unknown element", elementId);
  }
}
exported.setFocus = setFocus;

function adjustSize() {
  imported.adjustSize(document.body.clientWidth, document.body.clientHeight);
}

function clear() {
  //console.log("Data/Toolbar.clear");
  clipMode = null;
  clearTitle();
  clearTags();
  clearNotebook();
  clearComment();
  clearSpecialMode();
}

exported.clear = clear;

function cancelEditing() {
  clearSpecialMode();
  cancelEditTitle();
  hideSuggestedTags();
}

exported.cancelEditing = cancelEditing;

/** Special mode **/
var setSpecialMode = exported.setSpecialMode = function(mode) {
  document.body.setAttribute('class', mode);
  adjustSize();
};

var clearSpecialMode = exported.clearSpecialMode = function() {
  document.body.setAttribute('class', 'normal');
  adjustSize();
};

/*$('#toolbar_cancel').addEventListener('click', function(evt) {
  clearSpecialMode();
  imported.screenshotCancelled();
});*/

function hideSubPanels(except) {
  imported.hideSubPanels(except || '');
}

/// Clip menu

var clipMode = '';
function clearMenu() {
  var prevItem = document.querySelector('.toolbar_text .selected');
  if (prevItem) {
    prevItem.classList.remove('selected');
  }
}

function selectMenu(item) {
  clearMenu();

  if (item) {
    //console.log(item.nodeName);
    if (item.nodeName == 'SPAN') {
      item = item.parentElement;
    }

    item.classList.add('selected');
  }
}

const ClipMode = {
  URL: 'url',
  FULL: 'full',
  SCREENSHOT: 'screenshot',
  CLEARLY: 'clearly',
  ARTICLE: 'article',
  SELECTION: 'selection',
  PDF: 'pdf',
  IMAGE: 'image',
  AUDIO: 'audio'
};

function setClipMode(mode, start) {

  if (mode === clipMode) return;

  switch(mode) {
    case ClipMode.URL:
      selectMenu($('#clip_bookmark'));
      break;
    case ClipMode.PDF:
      selectMenu($('#clip_pdf'));
      break;
    case ClipMode.IMAGE:
      selectMenu($('#clip_image'));
      break;
    case ClipMode.AUDIO:
      selectMenu($('#clip_audio'));
      break;
    case ClipMode.FULL:
      selectMenu($('#clip_full_page'));
      break;
    case ClipMode.SCREENSHOT:
      selectMenu($('#clip_screenshot'));
      break;
    case ClipMode.CLEARLY:
      selectMenu($('#clip_simplified'));
      break;
    case ClipMode.ARTICLE:
      selectMenu($('#clip_article'));
      break;
    case ClipMode.SELECTION:
      selectMenu($('#clip_selection'));
      break;
  }

  clipMode = mode;
  if (start) {
    imported.clip(mode);
  }
}

exported.setClipMode = setClipMode;

$('#clip_bookmark').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.URL, true);
  }, false);

$('#clip_full_page').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.FULL, true);
  }, false);

$('#clip_selection').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.SELECTION, true);
  }, false);

$('#clip_screenshot').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.SCREENSHOT, true);
  }, false);

$('#clip_simplified').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.CLEARLY, true);
  }, false);

$('#clip_article').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.ARTICLE, true);
  }, false);

$('#clip_pdf').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.PDF, true);
  }, false);

$('#clip_image').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.IMAGE, true);
  }, false);

$('#clip_audio').addEventListener('click',
  function(evt) {
    setClipMode(ClipMode.AUDIO, true);
  }, false);



document.body.addEventListener('keydown', function(evt) {
  if (!gShowing) return;
  switch(evt.keyCode) {
    case KeyboardEvent.DOM_VK_A:
      if (getSynthMode() == 'text') {
        setClipMode(ClipMode.ARTICLE, true);
      }
      evt.preventDefault();
      evt.stopPropagation();
    break;
    case KeyboardEvent.DOM_VK_C:
      if (getSynthMode() == 'text') {
        setClipMode(ClipMode.CLEARLY, true);
      }
      evt.preventDefault();
      evt.stopPropagation();
      break;
    case KeyboardEvent.DOM_VK_F:
      if (getSynthMode() == 'text') {
        setClipMode(ClipMode.FULL, true);
      }
      evt.preventDefault();
      evt.stopPropagation();
      break;
    case KeyboardEvent.DOM_VK_B:
      setClipMode(ClipMode.URL, true);
      evt.preventDefault();
      evt.stopPropagation();
      break;
    case KeyboardEvent.DOM_VK_M:
      setClipMode(ClipMode.SCREENSHOT, true);
      evt.preventDefault();
      evt.stopPropagation();
      break;
  }

});

  // disabled?
var setSkitchMode = exported.setSkitchMode = function(mode) {
  adjustSize();
}

/// close button ///
$('#toolbar_close_icon').addEventListener('click', function(){
  imported.close();
  this.blur();
});

/// Settings ///
$('#settings').addEventListener('click', function() {
  imported.openOptionsDialog();
  this.blur();
});


/// Title ///
var title = "";
var titleDirty = false;
var titleEdited = false;
var titleEditBox = $("#toolbar_title");
var titleTextBox = $("#toolbar_title_static");

function beginEditTitle() {
  titleEditBox.value = title;
  titleEditBox.style.display = 'block';
  titleEditBox.focus();
  titleTextBox.style.display = 'none';
  titleEdited = true;
}

function endEditTitle() {
  titleEditBox.style.display = 'none';
  titleTextBox.style.display = 'block';
  titleEdited = false;
}

function finishEditTitle() {
  title = titleEditBox.value.substr(0,1000);
  titleDirty = true;
  setStaticTitle(title);
  endEditTitle();
}

function cancelEditTitle() {
  titleEditBox.value = title;
  setStaticTitle(title);
  endEditTitle();
}

function setStaticTitle(str) {
  if (str.length > 45) {
    str = title.substr(0, 45) + '\u2026';
  }
  titleTextBox.textContent = str;
}


$("#toolbar_title").addEventListener('keydown', function(evt) {
  if (evt.keyCode === KeyboardEvent.DOM_VK_RETURN) {
    if (!evt.shiftKey) {
      finishEditTitle();
      this.blur();
      evt.preventDefault();
      evt.stopPropagation();
    }
  }
  if (evt.keyCode == KeyboardEvent.DOM_VK_ESCAPE) {
    cancelEditTitle();
    this.blur();
    evt.preventDefault();
    evt.stopPropagation();
  }
  if (evt.keyCode == KeyboardEvent.DOM_VK_TAB) {
    if (!isCloudClipping()) {
      setFocus('save');
    } else {
      if (evt.shiftKey) { // Shift-Tab
        setFocus('comment');
      } else {
        setFocus('save');
      }
    }
    evt.preventDefault();
  }
  evt.stopPropagation();
});


$("#toolbar_title").addEventListener('blur', function(evt) {
  //console.log("Title blur");
  finishEditTitle();
});

$("#toolbar_title").addEventListener('focus', function(evt) {
  //console.log("Title focus");
});

$("#toolbar_title").addEventListener('input', function(evt) {
  //console.log("Title input", this.value);
});

$("#toolbar_title_static").addEventListener('blur', function(evt) {
  //console.log("Title blur static");
});

$("#toolbar_title_static").addEventListener('focus', function(evt) {
  //console.log("Title focus static");
  beginEditTitle();
});

$("#toolbar_title_static").addEventListener('click', function(evt) {
  //console.log("Title focus click");
  beginEditTitle();
});


function clearTitle() {
  title = "";
  titleDirty = false;
  titleTextBox.textContent = "";
  titleEditBox.value = "";
  endEditTitle();
}

exported.clearTitle = clearTitle;

function setTitle(str) {
  if (titleDirty) { return; }

  title = str || "";
  if (!titleEdited) {
    titleEditBox.value = title;
  }
  setStaticTitle(title);
}

exported.setTitle = setTitle;

function getTitle() {
  return title;
}

exported.getTitle = getTitle;

/// Tag editor ///
var tagEditBox = $("#add_tag");

var tagList = [];

function tagExists(tag) {
  tag = tag.toLowerCase();
  for(var i = 0; i < tagList.length; i++) {
    if (tagList[i].toLowerCase() === tag) return true;
  }
  return false;
}

function addTag(str) {
  str = str.trim();
  str = str.replace(/\s+/g,' ');
  if (str === '' || tagExists(str)) { return; }

  //console.log("not found");

  var parent = $('#tags');
  var s1 = document.createElement('SPAN');
  s1.setAttribute('class','tag');
  var s2 = document.createElement('SPAN');
  s2.setAttribute('class','tag_text');
  s2.textContent = str;
  s1.appendChild(s2);
  var s3 = document.createElement('SPAN');
  s3.setAttribute('class','remove_tag');

  s1.appendChild(s3);

  parent.appendChild(s1);
  s3.addEventListener('click', function() {
    s1.parentElement.removeChild(s1);
    var index = tagList.indexOf(str);
    if (index >= 0) {
      tagList.splice(index,1);
    }
    adjustSize();
  });

  tagList.push(str);
  //console.log(tagList);
}

function addTags(tags) {
  tags = tags || [];
  tags.forEach(addTag);
  adjustSize();
}

exported.addTags = addTags;

function suggestTags() {
  var inputValue = HTML_ADD_TAG.value;
  var parent = HTML_ADD_TAG.parentElement;
  var x = parent.offsetLeft + parent.offsetWidth/2 + 12;
  var y = parent.offsetTop + parent.offsetHeight;
  imported.suggestTags(inputValue, x, y);
}

function clearTags() {
  var parent = $('#tags');
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
  HTML_ADD_TAG.value = "";

  tagList = [];
  hideSuggestedTags();
  adjustSize();
}

exported.clearTags = clearTags;

function hideSuggestedTags() {
  imported.hideSuggestedTags();
}

HTML_ADD_TAG.addEventListener('input', function(evt) {
  suggestTags();
});

HTML_ADD_TAG.addEventListener('focus', function(evt) {
  suggestTags();
});

HTML_ADD_TAG.addEventListener('click', function(evt) {
  hideSubPanels('tagPanel');
  evt.preventDefault();
  evt.stopPropagation();
});

document.body.addEventListener('click', function(evt) {
  hideSubPanels('');
});

HTML_ADD_TAG.addEventListener('blur', function(evt) {
  //console.log("onBlur", evt.target.nodeName);
});

function selectTag(value) {
  addTag(value);
  HTML_ADD_TAG.value = "";
  adjustSize();
  hideSuggestedTags();
}

exported.selectTag = selectTag;

function autocompleteTag(tag) {
  HTML_ADD_TAG.value = tag;
  HTML_ADD_TAG.setSelectionRange(tag.length, tag.length); // put cursor at the end.
}
exported.autocompleteTag = autocompleteTag;

HTML_ADD_TAG.addEventListener('keydown', function(evt) {
  if (evt.keyCode === KeyboardEvent.DOM_VK_RETURN) {
    var value = this.value;
    selectTag(value);
    evt.preventDefault();
  } else if (evt.keyCode === KeyboardEvent.DOM_VK_ESCAPE
      || evt.keyCode === KeyboardEvent.DOM_VK_PERIOD && evt.metaKey) {
    hideSuggestedTags();
    evt.preventDefault();
  } else if (evt.keyCode === KeyboardEvent.DOM_VK_UP) {
    //console.log("Tag Arrow up");
    evt.preventDefault();
    imported.previousTag();
  } else if (evt.keyCode === KeyboardEvent.DOM_VK_DOWN) {
    //console.log("Tag Arrow down");
    evt.preventDefault();
    imported.nextTag();
  } else if (evt.keyCode == KeyboardEvent.DOM_VK_TAB) {
    hideSuggestedTags();

    if (isCloudClipping()) {
      if (evt.shiftKey) { // Shift-Tab
        setFocus('notebook');
      } else {
        setFocus('comment');
      }
    } else {
      setFocus('save');
    }
    evt.preventDefault();
  }
  evt.stopPropagation();
});

HTML_ADD_TAG.addEventListener('keypress', function(evt) {
    if (evt.charCode == 44) {
      var value = this.value;
      selectTag(value);
      // http://www.quirksmode.org/dom/events/keys.html
      evt.preventDefault();
      evt.stopPropagation();
    }
  });

/// Notebook selector
var notebook = null;

function clearNotebook() {
  notebook = null;
  $('#notebook').classList.add('loading');
}

function selectNotebook(nb, replace) {
  $('#notebook').classList.remove('loading');

  if (replace || !notebook) {
    notebook = nb;
    // show notebook name
    $('#notebook span').textContent = notebook.name;
    if (notebook.linked) {
      $('#notebook').classList.add('linked');
    } else {
      $('#notebook').classList.remove('linked');
    }
    if (notebook.business) {
      $('#notebook').classList.add('business');
    } else {
      $('#notebook').classList.remove('business');
    }
  }
}

exported.selectNotebook = selectNotebook;

function notebookOpened() {
  $('#notebook').classList.remove('closed');
}

exported.notebookOpened = notebookOpened;
function notebookClosed() {
   $('#notebook').classList.add('closed');
}
exported.notebookClosed = notebookClosed;

$('#notebook').addEventListener('keydown', function(evt){
  if (evt.keyCode == KeyboardEvent.DOM_VK_TAB) {
    imported.hideNotebookSelector();
    if (isCloudClipping()) {
      if (evt.shiftKey) { // Shift-Tab
        setFocus('save');
      } else {
        setFocus('tag');
      }
    } else {
      setFocus('save');
    }
    evt.preventDefault();
    evt.stopPropagation();
  }
});
/// Notebook selector

$('#notebook').addEventListener('click', function(evt) {
  toggleNotebookSelector();
  evt.preventDefault();
  evt.stopPropagation();
 });


/// Comment editor ///

var comment = "";
function clearComment() {
  comment = "";
  $('#add_comment').value = "";
}

exported.clearComment = clearComment;

$('#add_comment').addEventListener('blur', function() {
  comment = this.value.substr(0,1000);
  this.value = comment;
});

$('#add_comment').addEventListener('focus', function() {
});

$('#add_comment').addEventListener('keydown', function(evt) {
  if (evt.keyCode == KeyboardEvent.DOM_VK_RETURN) {
    this.blur();
    evt.preventDefault();

  } else if (evt.keyCode == KeyboardEvent.DOM_VK_ESCAPE) {
    $('#add_comment').value = comment;
    this.blur();
    evt.preventDefault();
  } else if (evt.keyCode == KeyboardEvent.DOM_VK_TAB) {
    if (!isCloudClipping()) {
      setFocus('title')
    } else {
      if (evt.shiftKey) { // Shift-Tab
        setFocus('tag');
      } else {
        setFocus('title');
      }
    }
    evt.preventDefault();
  }
  evt.stopPropagation();
});


function useTool(tool) {
  self.port.emit('ui-cmd', {
    type: 'tool',
    tool: tool
  });
}

/// Skitch
function addToolHandlers() {
  var els = document.querySelectorAll('.tool[selection]');
  for (var i = 0; i < els.length; i++) {
    let el = els[i];
    el.addEventListener('click', function(evt) {
      let selection = this.getAttribute('selection');
      //console.log("Requested tool=", selection);
      //self.port.emit('ui-cmd', { type: 'tool', tool: selection });
      imported.doUICommand({ type: 'tool', tool: selection });
    });
  }
}

$('#color_tool').addEventListener('click', function(evt) {
  var selection = this.getAttribute('selection') || 'red';
  //console.log("Toolbar.js:color_tool", selection);

  //self.port.emit('ui-cmd', { type: 'color', color: selection });
  imported.doUICommand({ type: 'color', color: selection });
  //hideSubPanels('colorPanel');
  imported.toggleSubPanel('colorPanel', {
      x: this.offsetLeft + this.offsetWidth * 0.5,
      y: this.offsetTop + this.offsetHeight
  });
  evt.preventDefault();
  evt.stopPropagation();
});

$('#shape_tool').addEventListener('click', function(evt) {

  //hideSubPanels('shapePanel');
  imported.toggleSubPanel('shapePanel', {
    x: this.offsetLeft + this.offsetWidth * 0.5,
    y: this.offsetTop + this.offsetHeight
  });
  evt.preventDefault();
  evt.stopPropagation();
});

$('#mark_tool').addEventListener('click', function(evt) {

  //hideSubPanels('markPanel');
  imported.toggleSubPanel('markPanel', {
    x: this.offsetLeft + this.offsetWidth * 0.5,
    y: this.offsetTop + this.offsetHeight
  });
  evt.preventDefault();
  evt.stopPropagation();

});

self.port.on('show', function() {
  gShowing = true;
  setFocus('save');
  endEditTitle();
  $('#shape_tool').setAttribute('selection', 'arrow');
  $('#pen_tool').setAttribute('selection', 'pen');
  $('#hilite_tool').setAttribute('selection', 'highlighter');
  $('#frame_tool').setAttribute('selection', 'crop');
  $('#zoomout_tool').setAttribute('selection', 'zoom-out');
  $('#mark_tool').setAttribute('selection', 'stampDefault');
  $('#type_tool').setAttribute('selection', 'text');
  $('#pixel_tool').setAttribute('selection', 'pixelate');
  $('#color_tool').setAttribute('selection', 'pink');
  $('#zoomin_tool').setAttribute('selection', 'zoom-in');
  imported.getTitle().then(function(title){
    setTitle(title);
  });
  adjustSize();
});

self.port.on('hide', function() {
  gShowing = false;
  setFocus('save');
});

function setActiveTool(toolEl) {
  var els = document.querySelectorAll('.tool.active');
  for (var i = 0; i < els.length; i++) {
    let el = els[i];
    el.classList.remove('active');
  }
  if (toolEl) {
    toolEl.classList.add('active');
  }
}

function doUICommand(cmd) {
  if (cmd.type === 'color') {
    $('#color_tool').setAttribute('selection', cmd.color);
  } else if (cmd.type === 'tool') {
    let tool = cmd.tool;
    if (tool === 'arrow'
        || tool === 'ellipse'
        || tool === 'line'
        || tool === 'rectangle'
        || tool === 'roundedRectangle') {
      $('#shape_tool').setAttribute('selection', tool);
      setActiveTool($('#shape_tool'));
    } else if (tool === 'stampAccept'
        || tool === 'stampExclaim'
        || tool === 'stampQuestion'
        || tool === 'stampReject'
        || tool === 'stampPerfect'
        || tool === 'stampDefault') {
      $('#mark_tool').setAttribute('selection', tool);
      setActiveTool($('#mark_tool'));
    } else if (tool === 'highlighter') {
      setActiveTool($('#hilite_tool'));
    } else if (tool === 'pen') {
      setActiveTool($('#pen_tool'));
    } else if (tool === 'crop') {
      setActiveTool($('#frame_tool'));
    } else if (tool === 'text') {
      setActiveTool($('#type_tool'));
    } else if (tool === 'pixelate') {
      setActiveTool($('#pixel_tool'));
    }
  }
}
exported.doUICommand = doUICommand;

/// Save button
$('#toolbar_save').addEventListener('click', function(evt) {
  imported.saveNote(title, tagList, notebook && notebook.guid, comment);
  //evt.preventDefault();
  //evt.stopPropagation();

});

$('#toolbar_save').addEventListener('keydown', function(evt) {
  if (evt.keyCode == KeyboardEvent.DOM_VK_TAB) {
    if (!isCloudClipping()) {
      setFocus('title');
    } else {
      if (evt.shiftKey) { // Shift-Tab
        setFocus('title');
      } else {
        setFocus('notebook');
      }
    }
    evt.preventDefault();
    evt.stopPropagation();
  } else if (evt.keyCode == KeyboardEvent.DOM_VK_RETURN) {
    imported.saveNote(title, tagList, comment);
    evt.preventDefault();
    evt.stopPropagation();
  }
});

// sign out
function setUserName(username) {
  //console.log("Content.setUserName", username);
  var msg = Content.localize('signOutAccount', {name: username});
  //$('#logout').textContent = msg;
}

exported.setUserName = setUserName;

const ClipDestination = {
  CLOUD: 'cloud',
  NATIVE: 'native',
  FILE: 'file'
};

var clipDestination = ClipDestination.CLOUD;

function isCloudClipping() {
  return clipDestination === ClipDestination.CLOUD;
}

function _setClipDestination(dst) {
  clipDestination = dst;
  document.body.setAttribute('data-dst', dst);
}

function setClipDestination(dst) {
  //console.log("TOOLBAR.setClipDestination", dst);
  _setClipDestination(dst);
  if (!isCloudClipping()) {
    setFocus('save');
    imported.hideNotebookSelector();
  }
  adjustSize();
}
exported.setClipDestination = setClipDestination;
_setClipDestination(options.clipDestination);

function setSelection(hasSelection) {
  if (hasSelection) {
    $('#clip_selection').style.display = 'block';
  } else {
    $('#clip_selection').style.display = 'none';
  }
}
exported.setSelection = setSelection;

function setSynthMode(synthMode) {
  document.body.setAttribute('data-synth-mode', synthMode);
  adjustSize();
}

exported.setSynthMode = setSynthMode;

function  getSynthMode() {
  return document.body.getAttribute('data-synth-mode');
}

function showSubPanel(panelName, anchor) {
  let {top, left} = anchor.getBoundingClientRect();
  //console.log("Toolbar#showSubPanel", panelName, left, top);
  imported.showSubPanel(panelName, {x:left, y:top});
}
function toggleSubPanel(panelName, anchor) {
  let {top, left} = anchor.getBoundingClientRect();
  //console.log("Toolbar#toggleSubPanel", panelName, left, top);

  imported.toggleSubPanel(panelName, {x:left, y:top});
}
function hideSubPanel(panelName) {
  imported.hideSubPanel(panelName);
}

function showNotebookSelector() {
  showSubPanel('notebookPanel', $('#notebook .anchor'));
}

function toggleNotebookSelector() {
  toggleSubPanel('notebookPanel', $('#notebook .anchor'));
}


  addToolHandlers();

} catch(e) {
  console.exception(e);
}
