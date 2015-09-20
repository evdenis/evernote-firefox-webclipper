const { resolve, reject, defer, promised } = require('sdk/core/promise');
const { emit, on, once, off } = require("sdk/event/core");
const { validateOptions } = require("sdk/deprecated/api-utils");

var Settings = require('sdk/simple-prefs').prefs;
var SimpleStorage = require("sdk/simple-storage").storage;
var Self = require('sdk/self');


const Async = require("./async");
const Auth = require("./auth");
var Log = require('./log');
var Rpc = require("./rpc")
const {Thrift, UserStoreClient} = require('./thrift-box');
const Util = require('./util');
var Evernote = require('./evernote');

const ERROR_INVALID_BOOTSTRAP_INFO = "InvalidBootstrapInfo";
const ERROR_NO_WORKING_SERVER_FOUND = "NoWorkingServerFound";
const ERROR_VERSION_OUTDATED = "VersionOutdated";

const DEFAULT_BOOTSTRAP_INFO = {
    "javaClass": "com.evernote.edam.userstore.BootstrapInfo",
    "profilesSize": 1,
    "profiles": {
        "javaClass": "java.util.ArrayList",
        "list": [{
           "javaClass": "com.evernote.edam.userstore.BootstrapProfile",
           "name": "Evernote",
           "settings": {
                "javaClass": "com.evernote.edam.userstore.BootstrapSettings",
                "serviceHost": "www.evernote.com",
                "marketingUrl": "http://evernote.com",
                "announcementsUrl": "https://announce.evernote.com",
                "accountEmailDomain": "m.evernote.com",
                "enableSupportTickets": true,
                "enableFacebookSharing": true,
                "supportUrl": "https://evernote.com/contact/support/",
                "enableSponsoredAccounts": true,
                "enableGiftSubscriptions": true,
                "enableTwitterSharing": true,
                "enableSharedNotebooks": true,
                "cardscanUrl": "https://cscan.evernote.com/cardagain",
                "enablePublicNotebooks": true,
                "enableLinkedInSharing": true,
                "enableSingleNoteSharing": true
            }
        }]
    }
};

const DEFAULT_PROFILE = DEFAULT_BOOTSTRAP_INFO.profiles.list[0].settings;

const ProdServers = [
  "www.evernote.com",
  "app.yinxiang.com"
];

const StagingServers = [
  "stage.evernote.com",
  "stage-china.evernote.com" ///json
];

const ProfileNames = Util.createMap({
"stage.evernote.com":"intl",
"www.evernote.com":"intl",
"app.yinxiang.com" : "china",
"stage-china.evernote.com": "china"
});

////////////////////////////////////////////////
var gBootProfiles = [ DEFAULT_PROFILE ];

var bootstrapCache = null;

function invalidateBootstapCache() {
  bootstrapCache = null;
}

function getPackageVersion() {
  var version = Self.version;
  Log.info("version=", version);
  return version.split('.').map(function(part){
    var p = parseInt(part);
    return isNaN(p) ? 0 : p;
  });
}

function getBootLocale() {
  Log.log("Boot.getBootLocale");
  var preferredLocation = Settings['preferredLocation'];
  if (preferredLocation && preferredLocation !== 'auto') {
    return preferredLocation;
  }

  return Util.getLocale();
}

const REGION_CHINA = 'zh';
const REGION_WORLD = 'world';

function getBootRegion(locale) {
  locale = locale || getBootLocale();
  Log.log('Boot.getBootRegion', locale);
  if (locale === 'zh'
    || locale === 'zh-CN'
    || locale === 'zh-Hans'
    || locale === 'zh-Hans-CN') return REGION_CHINA;
  return REGION_WORLD;
}

/**
 * Boots from hardcoded data included in the add-on
 * @return Promise<BootstrapInfo> - promise of the boot info
 *    (which is already fulfilled)
 */
function bootHardcoded() {
  Log.log("bootHardcoded");
  Log.warn("Booting from default info");
  var info = DEFAULT_BOOTSTRAP_INFO;
  bootstrapCache = DEFAULT_BOOTSTRAP_INFO.profiles.list[0].settings
  return resolve(info);
}

/**
 * Given region name returns an array of servers from which we should try
 * to load boot data, ordered in order of preference.
 * @param region region name
 * right now only 'zh' (mainland China) and 'world' are supported)
 * @return Array<String>  array of boot server urls.
 */
function getBootSequence(region) {
  Log.log('getBootSequence', region);
  var hosts = ['sandbox.evernote.com'];
  var configType = Settings.configType;
  // we can tabulate this, but it's not clear how the logic will
  // develop in te future to make useful generalizations.
  if (configType === 'staging') {
    if (region === REGION_CHINA) {
      hosts = ['stage-china.evernote.com', 'stage.evernote.com'];
    } else {
      hosts = ['stage.evernote.com', 'stage-china.evernote.com'];
    }
  } else if (configType === 'prod') {
    if (region === REGION_CHINA) {
      hosts = ['app.yinxiang.com', 'www.evernote.com'];
    } else {
      hosts = ['www.evernote.com', 'app.yinxiang.com'];
    }
  } else if (configType === 'sandbox') {
    hosts = ['sandbox.evernote.com'];
  }
  var proto = getCurrentServiceProto();
  var urls = hosts.map(function(host) {
    return proto + host + '/json';
  });
  return urls;
}

const ERROR_NO_SERVER_FOUND = "No working server found";

/**
 * Recursively tries to connect each of the supplied urls in order
 * and perform boot from it.
 * @param urls array of urls to contact (modified by a shift() call)
 * @return promise of the value returned by an individual boot op.
 */
function runBootSequence(urls) {
  if (urls.length <= 0) {
    return reject(new Error(ERROR_NO_SERVER_FOUND));
  }
  var url = urls.shift();
  Log.log("Booting from ", url);
  return runBoot(url).then(null, function(e) {
    Log.warn("Booting from " + url + " failed");
    return runBootSequence(urls);
  });
}

const BOOT_TIMEOUT_MS = 20000; //20sec
const USER_AGENT = 'Firenote';

/**
 * Tries to boot from a provided url.
 * @param url the url of a boot server
 * @return promise of boot info structure
 */
function runBoot(url) {
  Log.log('runBoot', url);
  var rpcClient = new Rpc.Client({
    url: url,
    timeout: BOOT_TIMEOUT_MS,
    method: 'POST'
  });
  // The RPC Functions that we will be caliing.
  var checkVersion = rpcClient.remote('UserStore.checkVersion');
  var getBootstrapInfo = rpcClient.remote('UserStore.getBootstrapInfo');
  //var [versionMajor, versionMinor] = getPackageVersion();
  var versionMajor = 1;
  var versionMinor = 27;
  var locale = getBootLocale();

  var p = checkVersion(USER_AGENT + '/' + Self.version + ';' + 'Firefox', versionMajor, versionMinor)
  .then(function(result) {
    Log.log('checkVersion OK', result);
       //TODO: we might want to proceed anyway
       //if (result == false) throw VersionOutdated;
    return getBootstrapInfo(locale);
  })
  .then(function(bootInfo) {
    //Log.log('getBootstrapInfo OK', bootInfo);
    gBootProfiles = bootInfo && bootInfo.profiles && bootInfo.profiles.list || [ DEFAULT_PROFILE ];
    return bootInfo;
  });
  return p;
}

/**
 * Boots from Evernote servers. Uses preferences to choose which servers
 *    to load data from and in which order.
 * @return Promise<BootstrapInfo> - promise of the boot info
 */
function boot() {
  var locale = getBootLocale();
  var region = getBootRegion(locale);
  invalidateBootstapCache();
  if (!Util.isOnline()) {
    Log.warn("No network connection detected.");
    return bootHardcoded();
  }
  var urls = getBootSequence(region);
  return runBootSequence(urls);
}

function getCurrentBootstrapInfo() {
  if (bootstrapCache) return bootstrapCache;
  var index = SimpleStorage.BootstrapInfoIndex;
  if (typeof(index) !== 'number') index = 0;
  try {
    var info = SimpleStorage.BootstrapInfo;
    var profiles = info.profiles.list;
    index = Math.max(index, 0);
    index = Math.min(index, profiles.length - 1);
    return bootstrapCache = profiles[index].settings;
  } catch(e) {
    Log.error("getCurrentBootstrapInfo", e);
    return DEFAULT_BOOTSTRAP_INFO.profiles.list[0].settings;
  }
}

function getCurrentServiceHost() {
  if (Settings.serviceHost) return Settings.serviceHost;
  switch(Settings.server) {
    case 'us-prod':
      return 'www.evernote.com';
    case 'cn-prod':
      return 'app.yinxiang.com';
    case 'us-stage':
      return 'stage.evernote.com';
    case 'cn-stage':
      return 'stage-china.evernote.com';
    case 'auto':
    default:
      let profile = getCurrentProfile();
      if (!profile || !profile.settings) return 'www.evernote.com';
      return profile.settings.serviceHost;
  }
}

function getCurrentServiceProto() {
  return Settings.useHttps ? 'https://' : 'http://';
}

function getProfileCount() {
  return gBootProfiles.length;
}

function getServiceHostLocation(svcHost) {
  svcHost = svcHost|| getCurrentServiceHost();
  if (svcHost === "stage-china.evernote.com" ||
      svcHost === "app.yinxiang.com") {
    return "zh";
  } else {
    return "intl" // localize
  }
}

function switchToNextProfile() {
  if (gBootProfiles.length < 1) return;

  var profile = gBootProfiles.shift();
  gBootProfiles.push(profile);
  return gBootProfiles[0];
}

function getCurrentProfile() {
  if (gBootProfiles.length < 1) return null;
  return gBootProfiles[0];
}

exports.on = on.bind(null, exports);
exports.once = once.bind(null, exports);
exports.removeListener = function removeListener(type, listener) {
  off(exports, type, listener);
};
exports.invalidateBootstapCache = invalidateBootstapCache;
exports.boot = boot;
exports.getCurrentServiceHost = getCurrentServiceHost;
exports.getCurrentServiceProto = getCurrentServiceProto;
exports.getProfileCount = getProfileCount;
exports.switchToNextProfile = switchToNextProfile;
exports.getCurrentProfile = getCurrentProfile;
exports.getServiceHostLocation = getServiceHostLocation;

exports.getPackageVersion = getPackageVersion;
exports.getBootLocale = getBootLocale;
exports.getBootRegion = getBootRegion;

