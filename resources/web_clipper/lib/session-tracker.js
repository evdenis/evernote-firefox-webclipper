/**
 * Created by mz on 2014-08-20.
 */

var Settings = require('sdk/simple-prefs').prefs;

const { setTimeout } = require("sdk/timers");

var Auth = require('./auth');
var Evernote = require('./evernote');
var Log = require('./log');

const SESSION_DURATION = 1000 * 60 * 15; // 15 minute slot

const SERVICE_STAGING = 'https://stage.evernote.com/r';
const SERVICE_PROD = 'https://metrics.evernote.com/r';

function getMetricsServer() {
  var configType = Settings.configType;
  // we can tabulate this, but it's not clear how the logic will
  // develop in the future to make useful generalizations.
  return (configType === 'prod') ? SERVICE_PROD : SERVICE_STAGING;
}

function queueNextSlot() {
  var t = +new Date();
  var slot = Math.floor(t / SESSION_DURATION);
  var nextSlot = (slot + 1)*SESSION_DURATION;
  setTimeout(onSlotEnded, nextSlot - t)
}

function onSlotEnded() {
  Log.log("SessionTracker.onSlotEnded");
  sessionActive = false;
  queueNextSlot();
}

function init() {
  Log.log("SessionTracker.init");
  var t = new Date();
  Log.log("Time: ", t, "Slot", (+t)/SESSION_DURATION);
  sessionActive = false;
  sessions = 0;
  queueNextSlot();
}

var sessionActive = false;
var sessions = 0;

function trackEvent() {
  Log.log("SessionTracker.trackEvent");
  if (!sessionActive) {
    sessionActive = true;
    sessions++;
    Log.info("Session tracked:", sessions);
    upload();
  }
}

function upload() {
  Log.log("SessionTracker.upload", sessions);
  Evernote.uploadSessionMetrics(sessions);
  sessions = 0;
}

exports.init = init;
exports.trackEvent = trackEvent;
exports.upload = upload;
