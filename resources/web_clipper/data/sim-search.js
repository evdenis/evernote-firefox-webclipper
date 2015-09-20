/**
 * Created by mz on 2014-10-06.
 */

var {imported, exported} = channel;

Content.localizeHtml(document.body);


var closeMenu = {
  dom: $('#close_menu'),
  showing: false,
  hide: function() {
    this.dom.style.display = 'none';
    this.showing = false;
  },
  show: function() {
    this.dom.style.display = 'block';
    this.showing = true;
  }
};

function dismiss() {
  imported.hide();
}


function dismissForever() {
  imported.disable();
  imported.hide();
}

function onClickArticle(evt) {
  var guid = this.getAttribute('data-guid');
  var notebookGuid = this.getAttribute('data-notebook-guid');
  var token = this.getAttribute('data-token');

  guid && imported.openNoteWithGuid(guid, notebookGuid, token);
  evt.stopPropagation();
  evt.preventDefault();
}

function addHandlers() {
  $('#close').addEventListener('click', function() {
    if (closeMenu.showing) {
      closeMenu.hide();
      dismiss();
    } else {
      closeMenu.show();
    }
  });

  $('#signedout').addEventListener('click', function(evt) {
    imported.openLogin();
    dismiss();
    evt.preventDefault();
    evt.stopPropagation();
  });

  $('#dismiss').addEventListener('click', dismiss);
  $('#dismissForever').addEventListener('click', dismissForever);
}

var notes = {
  personal: [],
  business: []
};


function clearArticles() {
  var articles = [].slice.call(document.querySelectorAll('article'));
  articles.forEach(function(article){
    article.removeEventListener('click', onClickArticle);
    article.parentElement.removeChild(article);
  });
}

/**
 * Creates a <time> element and fills it from a time stamp
 * @param t
 * @returns {HTMLElement}
 */
function createTimeElement(t) {
  var timeEl = document.createElement('time');
  var date = new Date(t);
  //console.log(date, date.toLocaleDateString(), date.toISOString())
  timeEl.textContent = date.toLocaleDateString();
  timeEl.setAttribute('datetime', date.toISOString());
  return timeEl;
}

function createArticleTitle(note) {
  var h1 = document.createElement('H1');
  h1.textContent = note.title;
  return h1;
}

function createArticleSnippet(note) {
  var p = document.createElement('P');
  p.textContent = note.snippet;
  return p;
}

function createFooter(note) {
  let footer = document.createElement('FOOTER');
  if (note.business) {
    footer.classList.add('business');
  }
  if (note.joined) {
    footer.classList.add('linked');
  }
  footer.textContent = note.notebookName;
  return footer;
}

function createThumbnail(note) {
  var div = document.createElement('DIV');
  div.setAttribute('class', 'imgcontainer loading');
  var img = document.createElement('IMG');
  img.setAttribute('class', 'hidden');
  div.appendChild(img);
  return div;
}

function setSectionHeader(header, numArticles) {
  var msg = header.getAttribute('data-l10n-id');
  header.textContent = Content.localize(msg, {num: numArticles});
}

function createArticle(note) {
  var article = document.createElement('ARTICLE');
  article.setAttribute('data-guid', note.guid);
  article.setAttribute('data-token', note.openerToken);
  article.setAttribute('data-notebook-guid', note.notebookGuid);
  article.setAttribute('data-thumbsquare', note.thumbsquare);

  var inner = document.createElement('DIV');
  inner.setAttribute('class', 'inner');
  article.appendChild(inner);

  var h1 = createArticleTitle(note);
  inner.appendChild(h1);

  var time = createTimeElement(note.timestamp);
  inner.appendChild(time);

  var p = createArticleSnippet(note);
  inner.appendChild(p);

  var th = createThumbnail(note);
  inner.appendChild(th);

  if (note.notebookName) {
    let footer = createFooter(note);
    article.appendChild(footer);
  }
  return article;
}

function addArticles(root, notes) {
  if (!notes.length) {
    root.classList.add('empty');
    return;
  }
  var header = root.querySelector('header');
  setSectionHeader(header, notes.length);

  var container = root.querySelector('.articles');
  var articles = notes.map(function(note){
    var el = createArticle(note);
    container.appendChild(el);
    el.addEventListener('click', onClickArticle);
    return el;
  })
}

function loadImage(imgElement, url, token) {
  //console.log('data/sim-search loadImage', imgElement, url, token);
  if (!imgElement) {
    return Promise.resolve('Empty element');
  }
  if (!url) {
    imgElement.classList.add('hidden');
    return Promise.resolve('No url');
  }

  imgElement.removeAttribute('src');
  return imported.loadImage(url, token).then(
    null, function(e) { return 'images/error-clip.png'}
  ).then(function(url) {
    //console.log("URL=", dataUrl);
    imgElement.parentElement.classList.remove('loading');
    imgElement.setAttribute('src', url);
    imgElement.classList.remove('hidden');
  });
}

function loadImages() {
  var articles = [].slice.call(document.querySelectorAll('article'));
  function loadOne() {
    if (!articles.length) return;
    var article = articles.shift();
    var thumbsquare = article.getAttribute('data-thumbsquare');
    var token = article.getAttribute('data-token');
    var img = article.querySelector('img');

    var p = loadImage(img, thumbsquare, token);
    return p.then(loadOne);
  }

  return loadOne();
}

function start(recs) {
  //console.log("SIMSEARCH.start", recs);
  closeMenu.hide();
  clearArticles();

  if (!recs.personal.length && !recs.business.length) {
    //imported.hide();
    //return;
  }
  notes.personal = recs.personal;
  notes.business = recs.business;

  addArticles($('#personal'), recs.personal);
  addArticles($('#business'), recs.business);
  imported.adjustSize();
  loadImages();
}

exported.start = start;

try {
  (function init(options) {
     // set china logo, if needed.
    if (options.region === 'zh') {
      document.documentElement.setAttribute('class', 'china');
    } else {
      document.documentElement.setAttribute('class', 'us');
    }
    addHandlers();
    if (!options.loggedIn) {
      document.body.classList.add('logged-off');
      $('#signedout').innerHTML = Content.localize('searchHelperLoginMessage', {loginUrl: '#'});
      imported.adjustSize();
      return;
    }
  })(self.options);

} catch(e) {
  console.error(e);
  console.error(e.stack);
}
