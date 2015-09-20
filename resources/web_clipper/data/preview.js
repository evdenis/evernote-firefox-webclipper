
const WEBSITES = {
  aol: {
    location: {
      subDomain: "search",
      mainDomain: "aol",
      suffix: ["com", "ca"],
      pathname: '/aol/search'
    },
  },
  archive_org: {
     location: {
      domain: 'archive.org',
      pathname: '/search.php'
    }
  },

  baidu: {
    location: {
      domain: ['baidu.com', 'baidu.cn'],
      pathname: '/s'
    }
  },

  bing: {
    location: {
      domain: 'bing.com',
      pathname: '/search'
    }
  },
  daum: {
    location: {
      hostname: 'search.daum.net',
      pathname: '/search'
    }
  },
  duckduckgo: {
    location: {
      protocol: 'https',
      domain: 'duckduckgo.com',
    }
  },

  google: {
    location: {
      mainDomain: "google",
      suffix: ["com", "ca", "cn"]
    },
    searchEngine: true,
  },
  naver: {
    location: {
      hostname: "search.naver.com",
      pathname: "/search.naver"
    },
  },
  yahoo: {
    location: {
      domain: "yahoo.com",
      pathname: ["/s", "/search"]
    },
  },
  yahoo_cn: {
    location: {
      domain: "yahoo.cn",
      pathname: ["/s", "/search"]
    },
  },
  yahoo_jp: {
    location: {
      domain: "yahoo.co.jp",
      pathname: ["/s", "/search"]
    },
  },
  yandex: {
    location: {
      domain: "yandex.com",
      pathname: "/yandsearch"
    },
  },
  yandex_ru: {
    location: {
      domain: "yandex.ru",
      pathname: "/yandsearch"
    },
  }
};

const EXTENDED_TLD = {"af":1,"ag":1,"ai":1,"ao":1,"ar":1,"au":1,"bd":1,"bh":1,"bn":1,"bo":1,"br":1,"bw":1,"bz":1,"ck":1,"co":1,"cr":1,"cu":1,"cy":1,"do":1,"ec":1,"eg":1,"et":1,"fj":1,"gh":1,"gi":1,"gt":1,"hk":1,"id":1,"il":1,"in":1,"jm":1,"jp":1,"ke":1,"kh":1,"kr":1,"kw":1,"lb":1,"ls":1,"ly":1,"ma":1,"mm":1,"mt":1,"mx":1,"my":1,"mz":1,"na":1,"nf":1,"ng":1,"ni":1,"np":1,"nz":1,"om":1,"pa":1,"pe":1,"pg":1,"ph":1,"pk":1,"pr":1,"py":1,"qa":1,"sa":1,"sb":1,"sg":1,"sl":1,"sv":1,"th":1,"tj":1,"tr":1,"tw":1,"tz":1,"ua":1,"ug":1,"uk":1,"uy":1,"uz":1,"vc":1,"ve":1,"vi":1,"vn":1,"za":1,"zm":1,"zw":1};

try {

var detectedArticle = null;

channel.exported.detectArticle = function() {
  if (!detectedArticle) {
    detectedArticle = startClearlyDetect().then(function(article){
      var element = article._elements[0];
      if (element) {
        if (element.nodeType == 1) {
          element.setAttribute('evernote-article', '1');
          //console.log("found " + element.outerHTML);
        } else if (element.nodeType == 3) {
          element.parentElement.setAttribute('evernote-article', '1');
        }
      }
      return element;
    });
  }
  return detectedArticle;
}

var Promise = window['promise/core'];

function initClearlyDetect(opts) {
  if (window.ClearlyComponent__detect !== undefined) return window.ClearlyComponent__detect;

  opts = opts || {};
  window.ClearlyComponent__detect = window.initClearlyComponent__detect({
    'callbacks': {
      'finished': function(data) {},
     },
     'window': opts.window || window,
     'document': opts.document || document,
     'jQuery': opts.jQuery || window.jQuery,
     'debug': opts.debug || false,
  });

  return window.ClearlyComponent__detect;
}

function startClearlyDetect() {
  var deferred = Promise.defer();
  if (!window.ClearlyComponent__detect) {
    return deferred.reject(new Error('failed to initiate clearly detect component'));
  }
  window.ClearlyComponent__detect.callbacks.finished = function(data) {
    deferred.resolve(data);
  }
  window.ClearlyComponent__detect.start();
  return deferred.promise;
}

const GOOGLE_SUFFIXES = ["com","ad","ae","af","ag","ai","al","am","ao","ar","as","at","au","az","ba","bd","be","bf","bg","bh","bi","bj","bn","bo","br","bs","bt","bw","by","bz","ca","cd","cf","cg","ch","ci","ck","cl","cm","cn","co","cr","cu","cv","cy","cz","de","dj","dk","dm","do","dz","ec","ee","eg","es","et","fi","fj","fm","fr","ga","ge","gg","gh","gi","gl","gm","gp","gr","gt","gy","hk","hn","hr","ht","hu","id","ie","il","im","in","iq","is","it","je","jm","jo","jp","ke","kh","ki","kg","kr","kw","kz","la","lb","li","lk","ls","lt","lu","lv","ly","ma","md","me","mg","mk","ml","mm","mn","ms","mt","mu","mv","mw","mx","my","mz","na","nf","ng","ni","ne","nl","no","np","nr","nu","nz","om","pa","pe","pg","ph","pk","pl","pn","pr","ps","pt","py","qa","ro","ru","rw","sa","sb","sc","se","sg","sh","si","sk","sl","sn","so","sm","st","sv","td","tg","th","tj","tk","tl","tm","tn","to","tr","tt","tw","tz","ua","ug","uk","uy","uz","vc","ve","vg","vi","vn","vu","ws","rs","za","zm","zw","cat",null]


/**
 * Location parsing/handling
 */
function parseLocation(loc) {
  var ports = {
    'http': 80,
    'https': 443,
    'ftp': 21
  };
  var protocol = loc.protocol || 'http';
  if (protocol.endsWith(':')) protocol = protocol.substr(0, protocol.length - 1);

  if (!(protocol in ports)) {
    return {
      protocol: protocol,
      href: loc.href
    }
  }
  var query = loc.search;
  if (query.startsWith('?')) { query = query.substr(1); }
  var queryArgs = {};
  query.split('&').forEach(function(param) {
    if (param === '') return;
    var arr = param.split('=');
    var k = unescape(arr.shift());
    var v = unescape(arr.join('='));
    queryArgs[k] = v;
  });

  var hash = loc.hash;
  if (hash.startsWith('?')) { hash = hash.substr(1); }

  var pageLocation = {
    protocol: protocol || 'http',
    hostname: loc.hostname,
    port: loc.port || ports[loc.protocol ] || 0,
    pathname: loc.pathname || '/',
    query: query,
    queryArgs: queryArgs,
    hash: hash,
    href: loc.href
  }

  var hostParts = pageLocation.hostname.split('.');
  var tld = hostParts.pop();
  var suffix = tld;
  if (tld in EXTENDED_TLD && hostParts.length > 0) {
    suffix = hostParts.pop() + '.' + tld;
  }
  var mainDomain = hostParts.length > 0 ? hostParts.pop() : '';
  var subDomain = hostParts.join('.');
  pageLocation.tld = tld;
  pageLocation.mainDomain = mainDomain;
  pageLocation.domain = mainDomain + '.' + suffix;
  pageLocation.subDomain = subDomain;
  pageLocation.suffix = suffix;
  return pageLocation;
}

function applyTest(test, value) {

  if (typeof(test) == 'function') return test(value);

  if (typeof(test) == 'object') {
    if (typeof(test.indexOf) == 'function'/* should be isArray */) {
      return (test.indexOf(value) >= 0);
    } else {
      return value in test;
    }
  }
  return test === value;
}

function matchLocation(location, testLocation) {
  for (var k in testLocation) {
    var t = testLocation[k];
    var v = location[k];
    if (!v) return false;
    if (!applyTest(t, v)) return false;
  }
  return true;
}

function getWebsite(location) {
  for (var website in WEBSITES) {
    var desc = WEBSITES[website];
    if (matchLocation(location, desc.location)) {
      return website;
    }
  }
  return null;
}

initClearlyDetect({debug:false});


} catch(e) {
  console.exception(e);
  console.error(e+'', e.fileName, e.lineNumber, e.stack);
}
