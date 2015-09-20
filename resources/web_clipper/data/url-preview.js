try {
channel.exported.displayBookmark = function(content) {
  try {
  if (content.title) {
    $('#title').textContent = content.title;
  } else {
    $('#title').textContent = _('Untitled');
  }
  if (content.faviconUrl) {
    $('#favicon').style.visibility = 'visible';
    $('#favicon').src = content.faviconUrl;
  } else {
    $('#favicon').style.visibility = 'hidden';
  }
  if (content.thumbnailUrl) {
    $('#thumbnail').style.visibility = 'visible';
    $('#thumbnail').src = content.thumbnailUrl;
  } else {
    $('#thumbnail').style.visibility = 'hidden';
  }
  $('#url').textContent = content.pageUrl;
  $('#url').href = content.pageUrl;
  $('#url').target = '__blank';

  $('#snippet').textContent = content.snippet || '';
  } catch(e) {
  console.exception('ERR:' + e);
  console.error(e+'', e.fileName, e.lineNumber, e.stack);
}

}

channel.exported.clearBookmark = function(content) {
  $('#title').textContent = '';
  $('#favicon').style.visibility = 'hidden';
  $('#favicon').src = '';
  $('#thumbnail').style.visibility = 'hidden';
  $('#thumbnail').src = '';
  $('#snippet').textContent = '';
  $('#url').textContent = '';
}

} catch(e) {
  console.error(e+'', e.fileName, e.lineNumber, e.stack);
}

