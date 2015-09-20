/**
 * Created by mz on 2014-08-19.
 */
self.on('click', function (node, data) {
  if (data == 'pdf') {
    return onClickPDFDocument(node);
  }
  if (node.nodeType == 1 && (node.nodeName == 'IMG' || node.nodeName == 'IMAGE')) {
    return onClickImage(node);

  } else {
    return onClickImageDocument(node);
  }
  // TODO: handle clicks inside an element that has a background-image CSS property
});

function getFileName(pathname) {
  let parts = pathname.split('/');
  return parts.pop(); // split always returns a non-empty array
}

function onClickImage(node) {
  // clicked inside an image.
  var src = node.getAttribute('src');

  // Rebase the src
  var a = document.createElement('A');
  a.href = src;
  src = a.href;

  var fileName = getFileName(a.pathname);

  var title = node.getAttribute('title');
  var alt = node.getAttribute('alt');

  fileName = fileName || src;
  title = title || alt || fileName;

  self.postMessage({src: src, mime: null, fileName: fileName, title: title});
  return true;
}

function onClickImageDocument(node) {
  // clicked inside a synthetic document which is an image
  var mime = document.contentType;
  if (!mime.startsWith('image/')) {
    return false;
  }
  // we are in an image synthetic document.
  var src = document.location.href;
  var title = document.title || src;
  var fileName = getFileName(document.location.pathname);
  fileName = fileName || src;
  self.postMessage({src: src, mime: mime, fileName: fileName, title: title});
  return true;
}

function onClickPDFDocument(node) {
  // clicked inside a synthetic document which is an image
  var mime = document.contentType;
  if (mime !== 'application/pdf') {
    return false;
  }
  // we are in an image synthetic document.
  var src = document.location.href;
  var title = document.title || src;
  var fileName = getFileName(document.location.pathname);
  fileName = fileName || src;
  self.postMessage({src: src, mime: mime, fileName: fileName, title: title});
  return true;
}