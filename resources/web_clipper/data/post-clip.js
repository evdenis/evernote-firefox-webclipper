/**
 * Created by mz on 2014-09-16.
 */
var {imported, exported} = channel;

Content.localizeHtml(document.body);

var recommend = {
  related: [],
  sameDomain: [],
  loadedSameDomain: false
};

var clipped = {
  noteGuid: null,
  notebook: null,
  tokenId: 'main',
};

$('#close').addEventListener('click', function(evt){
  imported.hide();
});

$('.tabs .related').addEventListener('click', function(evt){
  $('.bottom').setAttribute('selected', 'related');
});

$('.tabs .samedomain').addEventListener('click', function(evt){
  if (!recommend.loadedSameDomain) {
    // start loading same-domain recommendations.
    loadSameDomain();
  }
  $('.bottom').setAttribute('selected', 'samedomain');
});

$('#clip_title').addEventListener('click', function(evt){
  if (clipped.noteGuid) {
    //if (clipped.notebook.business) {
    //  imported.openBusinessNoteWithGuid(clipped.tokenId, clipped.noteGuid);
    //}
    imported.openNoteWithGuid(clipped.noteGuid, clipped.notebook.guid, clipped.notebook.token);
  }
});

$('#clipped_notebook').addEventListener('click', function(evt){
  if (clipped.notebook) {
    imported.openNotebookWithGuid(clipped.tokenId, clipped.notebook.guid);
  }
});

function onClickArticle(evt) {
  var token = this.getAttribute('token');
  var guid = this.getAttribute('guid');
  var notebookGuid = this.getAttribute('nbguid');

  token && guid && imported.openNoteWithGuid(guid, notebookGuid, token);
  evt.stopPropagation();
  evt.preventDefault();
}

$('#article_1').addEventListener('click', onClickArticle);
$('#article_2').addEventListener('click', onClickArticle);
$('#article_3').addEventListener('click', onClickArticle);


window.addEventListener('keydown', function(evt){
  if (evt.keyCode == KeyboardEvent.DOM_VK_ESCAPE) {
    imported.hide();
  }
});

function clearRelated() {
  var els = document.querySelectorAll('#relatednotes article');
  for (var i = 0; i < els.length; i++) {
    let el = els[i];
    el.classList.add('hidden');
  }
  $('#relatednotes .noresult').classList.add('hidden');
  $('#relatednotes').classList.add('loading');
}

function clearSameDomain() {
  var els = document.querySelectorAll('#samedomainnotes article');
  for (var i = 0; i < els.length; i++) {
    let el = els[i];
    el.parentElement.removeChild(el);
    el.removeEventListener('click', onClickArticle);
  }
  $('#samedomainnotes .noresult').classList.add('hidden');
  $('#samedomainnotes').classList.add('loading');
  recommend.loadedSameDomain = false;
}

function start(options) {
try {
  options = options || {};
  var noteGuid = options.noteGuid;
  var title = options.title || '';
  var notebook = options.notebook || {};
  var urlInfo = options.urlInfo;

  notebook = notebook || {};

  clipped.noteGuid = options.noteGuid;
  clipped.notebook = notebook;
  clipped.tokenId = (notebook && notebook.token) || 'main';
  clipped.urlInfo = urlInfo;

  recommend.related = recommend.sameDomain = [];
  recommend.loadedSameDomain = false;

  var nbName = notebook.name || Content.localize('default');
  //nbName = nbName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var message = Content.localize('desktopNotification_clipUploaded', {
    notebookName: nbName
  });

  $('.bottom').setAttribute('selected', 'related');

  $('#clipped_notebook').innerHTML = _('desktopNotification_clipUploaded');
  $('#clip_title').textContent = title;
  $('#clipped_notebook span').textContent = nbName;

  if (urlInfo && urlInfo.domain) {
    let el = $('.tabs .samedomain');
    el.classList.remove('hidden');
    el.innerHTML = Content.localize('clipsFromThisSite', {site: urlInfo.domain});
  } else {
    // domain info not available
    $('.tabs .samedomain').classList.add('hidden'); // hide clips from same domain
  }
  clearRelated();
  clearSameDomain();

  if (options.shrink) {
    document.body.classList.add('shrink');
    adjustSize();
  } else {
    document.body.classList.remove('shrink');
    loadRelated();
  }
} catch(e) {console.error(e);console.error(e.stack);}
}

// If we failed to load related results or got 0 results back, we show a generic message
function noRelated() {
  //console.log("data/post-clip: no related");

  $('#relatednotes .noresult').classList.remove('hidden');
  $('#relatednotes').classList.remove('loading');
  adjustSize();
}

function showArticle(element, note) {
  //console.log("data/post-clip showArticle", element, note);

  element.setAttribute('guid', note.guid);
  element.setAttribute('token', note.openerToken);
  element.setAttribute('nbguid', note.notebookGuid);

  element.querySelector('h1').textContent = note.title;
  element.querySelector('p').textContent = note.snippet;

  var dateEl = element.querySelector('.info time');
  var date = new Date(note.timestamp);
  dateEl.textContent = date.toLocaleDateString();
  dateEl.setAttribute('datetime', date.toISOString());

  var imgEl =  element.querySelector('img');
  if (imgEl) {
    imgEl.classList.add('hidden');
  }

  var linkEl = element.querySelector('.info a');
  if (note.sourceUrl) {
    linkEl.classList.remove('hidden');
    linkEl.href = note.sourceUrl;
    var hostName = linkEl.hostname;
    if (hostName.startsWith('www.')) {
      hostName = hostName.substr(4);
    }
    linkEl.textContent = hostName;
  } else {
    linkEl.classList.add('hidden');
  }
  var userEl = element.querySelector('.user')
  if (note.contact) {
    userEl.style.display = 'block';
    userEl.textContent = note.contact;
    if (note.business) {
      userEl.classList.add('business');
    } else {
      userEl.classList.remove('business');
    }
    if (note.joined) {
      userEl.classList.add('joined');
    } else {
      userEl.classList.remove('joined');
    }
  } else {
    userEl.style.display = 'none';
  }
  element.classList.remove('hidden');
}

function imageLoadFailed(imgElement) {
  imgElement.parentElement.classList.remove('loading');
  imgElement.setAttribute('src', 'images/error-clip.png');
  imgElement.classList.remove('hidden');
}

function loadImage(imgElement, url, token) {
  if (!imgElement) {
    return Promise.resolve('Empty element');
  }
  imgElement.classList.add('hidden');
  imgElement.parentElement.classList.add('loading');

  if (!url) {
    return Promise.resolve('No url');
  }

  imgElement.removeAttribute('src');
  return imported.loadImage(url, token).then(function(dataUrl){
    imgElement.parentElement.classList.remove('loading');
    imgElement.setAttribute('src', dataUrl);
    imgElement.classList.remove('hidden');
  }, function(e){
    imageLoadFailed(imgElement);
  });
}

function loadRelated() {

  imported.getFilingInfo().then(function(recs){
     // store recommendations
    recommend.related = recs;
    if (recs.notes.length < 1) {
      noRelated();
      return;
    }
    // remove the spinner
    $('#relatednotes').classList.remove('loading');
    // Hide the "NO result" message
    $('#relatednotes .noresult').classList.add('hidden');

    showArticle($('#article_1'), recs.notes[0]);

    if (recs.notes.length > 1) {
      showArticle($('#article_2'), recs.notes[1]);
    }

    if (recs.notes.length > 2) {
      showArticle($('#article_3'), recs.notes[2]);
    }

    loadImage($('#article_1 img'), recs.notes[0].thumbsquare, recs.notes[0].token)

    adjustSize();
  }, noRelated);
}

function adjustSize() {
  var mainDiv = document.getElementById('main');
  imported.adjustSize(mainDiv.clientWidth, mainDiv.clientHeight);
}

function noSameDomain() {
  $('#relatednotes').classList.remove('loading');
  $('#samedomainnotes .noresult').classList.remove('hidden');
  adjustSize();
}

function addSameDomainArticle(note) {

  var article = document.createElement('article');
  article.setAttribute('guid', note.guid);
  article.setAttribute('nbguid', note.notebookGuid);
  article.setAttribute('token', note.openerToken);

  /*
   the HTML that should be generated:

     <article>
     <div class="imgcontainer loading"><img src="" class="hidden"></div>

     <h1>Test1</h1>
     <div class="info">
     <time datetime="2014-03-04">2014-03-04</time>
     <a class="website" target="_blank">obama.com</a>
     </div>

     <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum scelerisque eros dui, eu euismod mi semper sit amet. Phasellus euismod, sem vel hendrerit hendrerit, velit mi sollicitudin lectus, id vestibulum metus turpis nec felis. Aenean ac efficitur magna. Praesent hendrerit, ex mattis tincidunt ultricies, nibh ipsum accumsan erat, ac commodo libero velit a orci. Aenean semper massa odio, et vestibulum nisi venenatis eget. Curabitur ut arcu diam. Pellentesque a tempus metus. Nam posuere velit vel velit tincidunt, ornare gravida metus lobortis.</p>

     </article>
   */
  var div1 = document.createElement('div');
  div1.setAttribute('class', 'imgcontainer loading');
  var img = document.createElement('img');
  img.setAttribute('class', 'hidden');
  div1.appendChild(img);
  article.appendChild(div1);

  var h1 = document.createElement('h1');
  h1.textContent = note.title;
  article.appendChild(h1);
  var div2 = document.createElement('div');
  div2.setAttribute('class', 'info');

  var time1 = document.createElement('time');
  var date = new Date(note.timestamp);
  time1.textContent = date.toLocaleDateString();
  time1.setAttribute('datetime', date.toISOString());
  div2.appendChild(time1);
  article.appendChild(div2);

  var p = document.createElement('p');
  p.textContent = note.snippet;
  article.appendChild(p);

  $('#samedomainnotes').appendChild(article);
  article.addEventListener('click', onClickArticle);

  return {
    element: article,
    image: img,
    note: note
  };
}

function loadSameDomainThumbs(articles) {
  function loadOne() {
    if (!articles.length) return;
    var article = articles.shift();
    var p = loadImage(article.image, article.note.thumbsquare, article.note.token);
    return p.then(loadOne);
  }

  return loadOne();
}

function loadSameDomain() {
  recommend.loadedSameDomain = true;
  if (!clipped.urlInfo) {
    noSameDomain();
    return;
  }

  imported.getSiteRecommendations(clipped.urlInfo.domain).then(function(recs) {
    recommend.sameDomain = recs;
    $('#samedomainnotes').classList.remove('loading');

    if (recs.length < 1) {
      noSameDomain();
      return;
    }
    try {
      var articles = recs.map(addSameDomainArticle);
      loadSameDomainThumbs(articles);
    } catch(e) {
      console.error(e.message, e.stack);
      console.error(e);
    }
  }, noSameDomain);
}

exported.start = start;
