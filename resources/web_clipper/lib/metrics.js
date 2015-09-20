/**
 * Module to support asynchronous execution of tasks.
 * @module
 */

var Net = require('./net');
var Url = require('./url');
var Util = require('./util');
var log = require('./log').log;

const APP_VERSION = require('sdk/self').version;
const GOOGLE_ANALYTICS_APP_NAME = 'Firenote';

//const GOOGLE_ANALYTICS_ID = 'UA-48583264-1';
const GOOGLE_ANALYTICS_ID = 'UA-285778-77';
const GOOGLE_ANALYTICS_TEST_ID = 'UA-285778-78';
const GOOGLE_ANALYTICS_URL = 'http://www.google-analytics.com/collect';

var userId;
var eventCounters = {};

function init() {
  userId = Util.getUniqueBrowserId();
  appView('start');
  require('sdk/core/promise')._reportErrors = 1;

}

function event(name) {
  var rest = Array.prototype.slice.call(arguments, 1);
  var tags = name.split('.');
  tags = Array.prototype.concat.apply(tags, rest);

  // Store event and tags.
  var ctr = eventCounters[name];
  if (!ctr) {
    ctr = eventCounters[name] = {
      count: 1,
      tags: tags
    };
  } else {
    ctr.count++;
  }
  log("EVENT " + name + ":" + ctr.count);
}

/**
 * Get interesting events.
 */
function queryEvents(filter) {
  return eventCounters;
}

function analytics(data) {
  data['v'] = '1';
  data['tid'] = GOOGLE_ANALYTICS_ID;
  data['cid'] = userId;

  var postData = Url.encodeObject(data);

  return Net.sendXhr(
    postData,
    GOOGLE_ANALYTICS_URL,
    {method: "POST"});
}

function appView(desc) {
  var data = {
    't': 'appview',
    'an': GOOGLE_ANALYTICS_APP_NAME,
    'av': APP_VERSION,
    'cd': desc
  };
  analytics(data);
}

function appEvent(category, action, label) {
  var data = {
    't': 'event',
    'an': GOOGLE_ANALYTICS_APP_NAME,
    'av': APP_VERSION,
    'ec': category,
    'ea': action
  };
  if (label) {
    data['el'] = label;
  }
  analytics(data);
}

exports.init = init;
exports.event = event;
exports.queryAll = queryEvents;

exports.appView  = appView;
exports.appEvent = appEvent;
