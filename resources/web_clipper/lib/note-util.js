var AddonWindow = require("sdk/addon/window");
const { resolve, reject, defer, promised, all } = require('sdk/core/promise');

const Log = require('./log');
var Md5 = require('./md5');
var Thrift = require('./thrift-box');
var Util = require('./util');

function createNote() {
  var note = new Thrift.Note();
  note.attributes = new Thrift.NoteAttributes();
  note.resources = [];
  return note;
}

function parseDataUrl(url) {
  if (!url.startsWith('data:')) {
    // Shouldn't happen
    Log.error('URL is not data');
    throw new Error('URL is not data:' + url);
  }
  let comma = url.indexOf(',');
  if (comma < 0) {
    Log.error('URL has no header');
    throw new Error('URL has no header:' + url);
  }
  var Window = require("sdk/addon/window").window;

  // remove data: and ,
  var header = url.substring(5, comma);
  var data = url.substr(comma+1);
  if (header.endsWith(';base64')) {
    data = Window.atob(data);
    header = header.split(';')[0];
  }
  return {type: header, data: data};
}

function stringToArrayBuffer(str) {
  var len = str.length;
  var ab = new ArrayBuffer(len);
  if (len === 0) return ab;
  var view = new Uint8Array(ab, 0);
  for (var i = 0; i < len; i++) {
    view[i] = str.charCodeAt(i) & 255;
  }
  return ab;
}

function dataUrlToResource(url) {
  var {type, data} = parseDataUrl(url);
  var ab = stringToArrayBuffer(data);
  var hash = Md5.ArrayBuffer.hash(ab);

  var resource = new Thrift.Resource();
  resource.data = new Thrift.Data();
  resource.data.body = ab;
  resource.data.size = data.length;
  resource.mime = type;
  resource.hash = hash;
  resource.attributes = new Thrift.ResourceAttributes();
  return {resource: resource, hash: hash}
}

function bytesToResource(bytes, mime) {
  var len = bytes.length;
  var ab = new ArrayBuffer(len);
  if (len >  0) {
    var view = new Uint8Array(ab, 0);
    for (var i = 0; i < len; i++) {
      view[i] = bytes[i];
    }
  }
  var hash = Md5.ArrayBuffer.hash(ab);
  var resource = new Thrift.Resource();
  resource.data = new Thrift.Data();
  resource.data.body = ab;
  resource.data.size = len;
  resource.mime = mime;
  resource.attributes = new Thrift.ResourceAttributes();
  return {
    resource: resource,
    hash: hash
  };
}

exports.bytesToResource = bytesToResource;

function arrayBufferToResource(ab, url, mime) {
  var view = new Uint8Array(ab, 0);
  var length = view.length;
  var hash = Md5.ArrayBuffer.hash(ab);
  mime = mime || deduceDataType(ab);
  var resource = new Thrift.Resource();
  resource.data = new Thrift.Data();
  resource.data.body = ab;
  resource.data.size = length;
  resource.mime = mime;
  resource.hash = hash;
  resource.attributes = new Thrift.ResourceAttributes();
  if (url) {
    let u = url.toLowerCase();
    // SourceURL protocol is only allowed to be http or https
    if (u.startsWith('http:') || u.startsWith('https:')) {
      resource.attributes.sourceURL = url;
    }
  }
  Log.log('arrayBufferToResource', resource.mime, resource.hash);
  return {resource: resource, hash: hash};
}

function deduceDataType(data) {
  if (data instanceof ArrayBuffer) {
    data = String.fromCharCode.apply(null, new Uint8Array(data, 0, 16))
  }
  if (typeof(data) === 'string') {
    if (data.substr(1,3) === 'PNG') {
        return 'image/png'
    } else if (data.substr(6,4) === 'JFIF' || data.substr(6,4) == 'Exif') {
      return 'image/jpeg';
    } else if (data.substr(0,5) === 'GIF89') {
      return 'image/gif';
    }
  }
  return 'image/png';
}


function loadImageData(url, width, height, mime) {
  mime = mime || 'image/png';

  var deferred = defer();
  var img = new AddonWindow.window.Image;
  var canvas = AddonWindow.window.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
  canvas.width = width;
  canvas.height = height;
  for(var k in deferred) {
    Log.log(k);
  }
  img.onload = function() {
    try {
      Log.log("loadImageData:image loaded");
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      var dataUrl = canvas.toDataURL(mime);
      var r = dataUrlToResource(dataUrl);
      deferred.resolve(r);
    } catch(e) {
      Log.error('loadImageData: image conversion failed');
      Log.exception(e);
      deferred.reject(e);
    }
  }
  img.onerror = function(e) {
    Log.log("loadImageData: image load failed");
    deferred.reject(e);
  }
  img.src = url;
  return deferred.promise;
}

exports.loadImageData = loadImageData;
exports.createNote = createNote;
exports.dataUrlToResource = dataUrlToResource;
exports.arrayBufferToResource = arrayBufferToResource;
exports.deduceDataType = deduceDataType;
