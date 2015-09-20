try {
  var {imported, exported} = channel;
  Content.localizeHtml();

  var gNotebooks = [];
  var gHighlightedGuid = null;
  var gActive = false;

  var HTML_FIND = $('#find');
  var HTML_NOTEBOOKS = $('#notebooks');

  /**
   * Creates a regex that looks for a word that starts with a given pattern
   */
  function createRegex(str) {
    if (!str) return /.*/;

    // remove spaces
    str = str.trim();

    // to prevent confusion with metacharacters with escape every non-alphanum character
    function replacer(str) {
      return '\\u' + ('0000' + str.charCodeAt(0).toString(16)).substr(-4);
    }
    str = str.replace(/\W/g, replacer);

    // if search string starst with a word character, then it should be only
    // at the beginning of a word.
    if (/^\w/.test(str)) {
    // prepend the word boundary symbol
      str = '\\b' + str;
    }

    //console.log('/' + str + '/');
    // create a regex
    return new RegExp(str, "i");
  }

  function findElementByGuid(guid) {
    if (!guid) {
      return null;
    }
    return document.querySelector("#notebooks li[guid='" + guid + "']");
  }

  function deselect() {
    //console.log("NotebookPane.deselect");
    var selected = document.querySelectorAll('.selected');
    var len = selected.length;
    for (var i = 0; i < len; ++i) {
      let sel = selected[i];
      sel.classList.remove('selected');
    }
  }

  function enableAll() {
    //console.log("NotebookPane.enableAll");
    var els = document.querySelectorAll('.disabled');
    var len = els.length;
    for (var i = 0; i < len; i++) {
      els[i].classList.remove('disabled');
    }
    var ul = document.querySelector('#notebooks');
    ul.classList.remove('filtered');
  }

  function enableFilter(pattern) {
    //console.log("NotebookPane.enableFilter", pattern);
    if (!pattern) {
      enableAll();
      return;
    }
    pattern = createRegex(pattern);

    var ul = document.querySelector('#notebooks');
    ul.classList.add('filtered');

    // hide all notebook LIs that dont fit the pattern
    var els = document.querySelectorAll('#notebooks li');
    var len = els.length;
    var selected = null;
    var lastStackEl = null;
    var lastStackSize = 0;
    for (var i = 0; i < len; i++) {
      let el = els[i];
      if (el.classList.contains('stack')) {
        if (lastStackEl && lastStackSize === 0) {
          lastStackEl.classList.add('disabled');
        }
        lastStackEl = el;
        lastStackSize = 0;
        continue;
      }

      let guid = el.getAttribute('guid');
      let txt = el.textContent.toLowerCase();
      if (pattern.test(txt)) {
        el.classList.remove('disabled');
        selected = selected || el;
        lastStackSize++;
      } else {
        el.classList.add('disabled');
      }
    }
    if (lastStackEl && lastStackSize === 0) {
      lastStackEl.classList.add('disabled');
    }
    deselect();
    if (selected) {
      selected.classList.add('selected');
    }
  }

  function getSelectedElement() {
    return $('.selected');
  }

  function getSelectedGuid() {
    var el = getSelectedElement();
    if (!el) {
      return null;
    }
    return el.getAttribute('guid');
  }

  function clearFindField() {
    //console.log("NotebookPane.clearFindField");
    HTML_FIND.value = '';
    enableAll();
  }

  /**
   * Picks the next DOM element for selection from a sequence.
   * @param el starting DOM element.
   * @param step function that produces the next DOM element for scanning.
   */
  function jumpItem(step) {

    function skipElement(el) {
      return (el.nodeType != 1
        || el.classList.contains('stack')
        || el.classList.contains('disabled'));
    }

    var el = getSelectedElement();
    if (!el) { return el; }
    newEl = el;

    do {
      newEl = step(newEl);
    }  while (newEl && skipElement(newEl));

    if (newEl && el !== newEl) {
      el.classList.remove('selected');
      newEl.classList.add('selected');
    }
    return newEl;
  }

  function scrollIntoView(el, up) {
    if (!el) return;
    el.scrollIntoView(up);
    document.documentElement.scrollTop = 0; // prevent scrolling of entire window
  }

  function previousItem() {
    var el = jumpItem(function(x) { return x.previousSibling; });
    scrollIntoView(el, true);
    let guid = getSelectedGuid();
    if (guid) {
      imported.selectNotebook(guid);
    }
  }

  function nextItem() {
    var el = jumpItem(function(x) { return x.nextSibling; });
    if (el) {
      //el.scrollIntoView(false);
      scrollIntoView(el, false);
    }
    let guid = getSelectedGuid();
    if (guid) {
      imported.selectNotebook(guid);
    }
  }


// exported
  function clearNotebooks() {
    var listEl = HTML_NOTEBOOKS;
    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }
    gNotebooks = [];
  }

// exported
  function highlightNotebookByGuid(guid) {
    gHighlightedGuid = guid;
    deselect();
    var el = findElementByGuid(guid);
    if (!el) {
      return;
    }
    el.classList.add('selected');
  }


// exported
  function updateNotebooks(nbs) {
    function comparator(a, b) {
      if (a.stack == b.stack) {
        if (a.name > b.name) {
          return 1;
        }
        if (a.name < b.name) {
          return -1;
        }
        return 0;
      }

      var aname = a.stack || a.name;
      var bname = b.stack || b.name;

      if (aname > bname) {
        return 1;
      }
      if (aname < bname) {
        return -1;
      }
      return 0;
    }

    function onClick(evt) {
      var guid = this.getAttribute('guid');
      if (guid) {
        highlightNotebookByGuid(guid);
        imported.selectNotebook(guid);
        imported.hide();
      }
    }

    gNotebooks = nbs = nbs.sort(comparator);
    clearNotebooks();

    var stackName = undefined;
    var ul = HTML_NOTEBOOKS;

    for (var i = 0; i < nbs.length; i++) {
      let li = document.createElement('LI');
      let notebook = nbs[i];
      let guid = notebook.guid;
      let titleStr = notebook.name;
      li.classList.add('notebook');
      if (notebook.business) {
        li.classList.add('business');
      }
      if (notebook.linked) {
        li.classList.add('linked');
      }
      if (notebook.stack) {
        li.classList.add('stacked');
        if (stackName != notebook.stack) {
          stackName = notebook.stack;
          let stackLi = document.createElement('LI');
          stackLi.setAttribute('class', 'stack');
          stackLi.textContent = stackName;
          ul.appendChild(stackLi);
        }
      }

      li.textContent = notebook.name;
      let userName = notebook.fullName || notebook.email || notebook.username;
      if (userName) {
        let span = document.createElement('SPAN');
        let fullName = '(' + userName + ')';
        span.textContent = fullName;
        titleStr += fullName;
        li.appendChild(span);
      }

      li.setAttribute('title', titleStr);
      li.setAttribute('id', 'nb-' + i);
      li.setAttribute('guid', notebook.guid);

      ul.appendChild(li);

      li.addEventListener('click', onClick);
    }
    adjustSize();
  }

  function adjustSize() {
    imported.adjustSize(document.body.offsetWidth, document.body.offsetHeight);
  }

// exported
  function startEdit() {
    //console.log("NotebookPane.startEdit", guid);
    enableAll();
    highlightNotebookByGuid(gHighlightedGuid);
    adjustSize();
    HTML_FIND.value = '';
    HTML_FIND.focus();
  }

  HTML_FIND.addEventListener('click', function(evt) {
    this.focus();
    evt.preventDefault();
    evt.stopPropagation();
  });

  HTML_FIND.addEventListener('input', function(evt) {
    var pattern = this.value;
    enableFilter(pattern);
    adjustSize();
  });

  HTML_FIND.addEventListener('keydown', function(evt) {
    //console.log('Notebook.FIND.onKeyDown', evt.keyCode, gActive);
    if (!gActive) { return; }
    var keyCode = evt.keyCode;
    if (keyCode === KeyboardEvent.DOM_VK_RETURN) { // ENTER
      let guid = getSelectedGuid();
      if (guid) {
        imported.selectNotebook(guid);
      }
      imported.hide();
      evt.preventDefault();
      evt.stopPropagation();
    } else {
      //console.log(keyCode,
      //            "shift=" + evt.shiftKey,
      //            "alt=" + evt.altKey,
      //            "ctrl=" + evt.ctrlKey,
      //            "meta=" + evt.metaKey);
    }
  });

  window.addEventListener('keydown', function(evt){
    //console.log('Notebook.window.onKeyDown', evt.keyCode, gActive);
    if (!gActive) { return; }
    var keyCode = evt.keyCode;

    if (keyCode === KeyboardEvent.DOM_VK_ESCAPE // ESC 27
        || keyCode === KeyboardEvent.DOM_VK_PERIOD && evt.metaKey) { //Cmd+.
      //console.log('Notebook [ESC] Pressed');
      imported.hide();
      evt.preventDefault();
      evt.stopPropagation();
    } else if (keyCode === KeyboardEvent.DOM_VK_UP) { // UP
      previousItem();
      evt.preventDefault();
      evt.stopPropagation();
    } else if (keyCode === KeyboardEvent.DOM_VK_DOWN) { // DOWN\

      nextItem();
      evt.preventDefault();
      evt.stopPropagation();
    } else if (keyCode === KeyboardEvent.DOM_VK_TAB || keyCode === 3) { // TAB or shift-TAB or ENTER or shift-ENTER
      let guid = getSelectedGuid();
      if (guid) {
        imported.selectNotebook(guid);
      }
      imported.hide();
      if (evt.shiftKey) {
        imported.setToolbarFocus('save');
      } else {
        imported.setToolbarFocus('tag');
      }
      evt.preventDefault();
      evt.stopPropagation();
    } else {
      evt.stopPropagation();
    }
  });

  self.port.on('hide', function() {
    gActive = false;
  });

  self.port.on('show', function() {
    gActive = true;

    HTML_FIND.focus();
    startEdit();
  });

  exported.highlightNotebookByGuid = highlightNotebookByGuid;
  exported.clearNotebooks = clearNotebooks;
  exported.updateNotebooks = updateNotebooks;
  exported.startEdit = startEdit;

  clearNotebooks();

}
catch (e) {
  console.exception(e);
  console.error(e.stack);
}
