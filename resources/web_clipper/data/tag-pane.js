
try {

var {imported, exported} = channel;
var gTagList = [];

function clearTags() {
  var tagEl = document.getElementById('tags');
  //console.log(tagEl.outerHTML);
  while (tagEl.firstChild) {
    tagEl.firstChild.removeEventListener('click',  onClick);
    tagEl.removeChild(tagEl.firstChild);
  }

  gTagList = [];
  adjustSize();
}

function onClick(evt) {
  var tag = this.textContent;
  imported.selectTag(tag);
}

exported.clearTags = clearTags;

function showTags(tags) {
  //console.log('show tags', tags);
  clearTags();
  gTagList = tags;

  var el = document.getElementById('tags');
  var selected = null;

  for(var i = 0; i < tags.length; i++) {
    let tag = tags[i];

    let newEl = document.createElement('LI');
    newEl.textContent = tag;
    newEl.addEventListener('click',  onClick);
    el.appendChild(newEl);
    if (!selected) {
      selected = newEl;
      selected.classList.add('selected');
    }
  }
  adjustSize();
}

function adjustSize() {
  imported.adjustSize(document.body.offsetWidth, document.body.offsetHeight);
}

function previousTag() {
  var el = $('.selected');
  var newEl = el;
  if (el) {
    newEl = el.previousSibling;
    if (newEl) {
      el.classList.remove('selected');
      newEl.classList.add('selected');
      imported.autocompleteTag(newEl.textContent);
      newEl.scrollIntoView(true);
    }
  }
}

function nextTag() {
  //console.log("Next tag!");
  var el = $('#tags .selected');
  var newEl = el;
  if (el) {
    newEl = el.nextSibling;
    if (newEl) {
      el.classList.remove('selected');
      newEl.classList.add('selected');
      imported.autocompleteTag(newEl.textContent);
      newEl.scrollIntoView(false);
    }
  }
}

clearTags();

exported.showTags = showTags;
exported.previousTag = previousTag;
exported.nextTag = nextTag;

}catch(e){
  console.error(e)
}
