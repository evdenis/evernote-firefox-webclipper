/**
 * Created by mz on 2014-07-15.
 */
const {Cc,Ci,Cr,Cu} = require('chrome');
const Data = require('sdk/self').data;
var Self = require('sdk/self');
var System = require('sdk/system');
const { resolve, reject, defer, promised } = require('sdk/core/promise');

Cu.import('resource://gre/modules/ctypes.jsm');
Cu.import('resource://gre/modules/Downloads.jsm');
Cu.import('resource://gre/modules/osfile.jsm');

var Types = ctypes.types;
var gNativeLib = null;
var gNativeApi = {};
var gNativeLibPath;

const Log = require('./log');

const STDCALL = ctypes.default_abi;
const BOOL = ctypes.bool;
const CSTRPTR = ctypes.jschar.ptr;

const ImageInfoType = new ctypes.StructType( "ImageInfo", [
  { url: ctypes.jschar.ptr },
  { urlLength: ctypes.unsigned_int },
  { mime: ctypes.jschar.ptr },
  { mimeLength: ctypes.unsigned_int },
  { data: ctypes.uint8_t.ptr },
  { dataLength: ctypes.unsigned_int }
]);

function init() {
  Log.log('Native.init');

  gNativeLibPath = null;
  gNativeLib = null;
  gNativeApi = {};

  return unpack().then(function(path){
    gNativeLibPath = path;

    Log.log('Loading native lib', gNativeLibPath);
    gNativeLib = ctypes.open(gNativeLibPath);
    gNativeApi.isEvernoteInstalled = declare("IsEvernoteInstalled", STDCALL, BOOL);
    gNativeApi.addToEn = declare("AddToEn",
                              STDCALL,
                              ctypes.void_t,
                              ctypes.jschar.ptr,
                              ctypes.unsigned_int,
                              ctypes.jschar.ptr,
                              ctypes.unsigned_int,
                              ctypes.jschar.ptr,
                              ctypes.unsigned_int,
                              ctypes.jschar.ptr,
                              ctypes.unsigned_int,
                              ctypes.bool);

    gNativeApi.addToEnWin = declare("AddToEnWin",
                              STDCALL,
                              ctypes.int16_t,
                              ctypes.jschar.ptr,
                              ctypes.jschar.ptr,
                              ctypes.jschar.ptr,
                              ctypes.jschar.ptr,
                              ctypes.unsigned_int,
                              ImageInfoType.ptr,
                              ctypes.unsigned_int,
                              ctypes.jschar.ptr,          // Output Buffer
                              ctypes.int32_t.ptr );
    Log.log('Loaded  native lib', gNativeLib);
    return gNativeApi.isEvernoteInstalled();
  }).catch(function(e) {
    Log.error('Cannot load native lib');
    Log.exception(e);
    return false; // just indicate that the native component is not accessible.
  });
}

function cleanUp() {
  Log.log('Native.cleanUp');
  if (gNativeLib) {
    gNativeLib.close();
    gNativeLib = null;
  }
  if (gNativeLibPath) {
    OS.File.remove(gNativeLibPath);
    gNativeLibPath = null;
  }
}

const XMLHttpRequest = require("sdk/net/xhr").XMLHttpRequest;

function unpack() {
  Log.log('Native.unpack');
  var deferred = defer();

  var rsrcPath = getZipPath();
  if (!rsrcPath) {
    return reject('Unsupported OS');
  }
  var outPath = OS.Path.join(OS.Constants.Path.profileDir, 'evernote_native.bin');

  return Downloads.fetch(Data.url(rsrcPath), outPath).then(function(){
    Log.log('Downloaded ' + outPath);
    return outPath;
  });
}

function getZipPath() {
  const Runtime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);

  var path = 'bin/';
  var os = Runtime.OS;;
  var abi;
  try {
    abi = Runtime.XPCOMABI;
  } catch(e) {
    Log.exception(e);
    return null;
  }
  Log.log('OS=', os);
  Log.log('XPCOMABI=', abi);

  if (os === 'Darwin') {
    if (abi.startsWith('x86_64-') || abi.startsWith('ia64-')) {
      Log.log("Macintosh(64bit)");
      return path + 'mac64/libenbar_x64.dylib';
    } else if (abi.startsWith('x86-')) {
      Log.log("Macintosh(32bit)");
      return path + 'mac32/libenbar_x32.dylib';
    } else {
      Log.error("Macintosh(unsupported processor" + abi +")");
      return null;
    }
  } else if (os === 'WINNT') {
    if (abi.startsWith('x86_64-') || abi.startsWith('ia64-')) {
      Log.log("Windows(64bit)");
      return path + 'win64/mozclip.dll'
    } else if (abi.startsWith('x86-')) {
      Log.log("Windows(32bit)");
      return path + 'win32/mozclip.dll';
    } else {
      Log.error("Windows(unsupported processor" + abi +")");
      return null;
    }
  } else {
    Log.error("Unsupported OS", os);
    return null;
  }
}

function declare(funcName /* args*/) {
  if (!gNativeLib) {
    Log.error("Native lib not loaded");
    return null;
  }
  Log.log("Native.declare", funcName);
  try {
    var abi = gNativeLib.declare.apply(gNativeLib, arguments);
    if (!abi) {
      //Log.warn("Failed to load native method ", funcName);
      return null;
    }
  } catch(e) {
    //Log.warn("Failed to load native method ", funcName);
    return null;
  }
  return abi;
}

function isLoaded() {
  Log.log("Native.isLoaded", gNativeLib, gNativeApi);
  if (!gNativeLib || !gNativeApi) return false;
  if (!gNativeApi.isEvernoteInstalled) return false;
  return gNativeApi.isEvernoteInstalled();
}


/**
 * Takes a Note object and sends it over to the native clipper.
 * @param note
 */
function saveNote(note, filePath) {
  Log.log('saveNote', note.title, filePath);
  if (!gNativeLib || !gNativeApi.addToEn) return reject(new Error("Native Clipping not installed"));
  if (!note) return reject(new ReferenceError("Null note passed"));
  if (!filePath) return reject(new ReferenceError("Null filePath passed"));
  let title = note.title;
  let sourceUrl = note.attributes.sourceURL;
  let charSet = "UTF-8";

  gNativeApi.addToEn(filePath,
                 filePath.length,
                 title,
                 title.length,
                 sourceUrl,
                 sourceUrl.length,
                 charSet,
                 charSet.length,
                 true);
  return resolve(filePath);
}

function saveNoteExSupported() {
  if (!gNativeLib || !gNativeApi) return false;
  Log.log('saveNoteExSupported',gNativeApi.addToEnWin);
  return gNativeApi.addToEnWin !== null;
}

const SUCCESS_RETURN_CODE = 0;              // SUCCESS

function saveNoteEx(note) {
  var resources = [ ];
  var len = note.resources.length;
  Log.log('saveNoteEx');
  // copy resource data.
  for ( var i = 0; i < len; ++i ) {
    var rsrc = note.resources[i];
    let url = rsrc.attributes.sourceURL || '';
    let mime = rsrc.mime;
    let data = new Uint8Array(rsrc.data.body);
    let dataSize = data.length + 0;

    var imageInfo = new ImageInfoType(
        ctypes.jschar.array()(url),
        url.length,

        ctypes.jschar.array()(mime),
        mime.length,

        ctypes.uint8_t.array()(data),
        dataSize
    );
    Log.log("url=", url);

    resources.push(imageInfo);
  }

  var ImageInfoArrayType = ImageInfoType.array(resources.length);
  var resourceData = new ImageInfoArrayType(resources);

  var sourceUrl = note.attributes.sourceURL || '';

  var tags = '';

  var noteId = 0;

  var bufferSize = new ctypes.int32_t(10 * 1024);     // 10Kb for result
  var bufferArray = ctypes.ArrayType(ctypes.jschar);
  var buffer = new bufferArray(bufferSize.value);

  var deferred = defer();

  var retCode = gNativeApi.addToEnWin (
      note.title,
      note.content,
      sourceUrl,
      tags,
      noteId,
      resourceData,
      resources.length,
      buffer,
      bufferSize.address());
  if (retCode == SUCCESS_RETURN_CODE) {
    Log.log('saveNoteEx:', buffer.readString());
    //successCallback & successCallback(buffer.readString());
    deferred.resolve(buffer.readString());
  } else {
    Log.error('saveNoteEx:', retCode);
    //errorCallback & errorCallback(new Evernote.Error( "internal error", retCode ));
    deferred.reject(retCode);
  }

  return deferred.promise;
}

exports.init = init;
exports.saveNote = saveNote;
exports.saveNoteEx = saveNoteEx;
exports.saveNoteExSupported = saveNoteExSupported;

exports.isLoaded = isLoaded;
exports.cleanUp = cleanUp;
