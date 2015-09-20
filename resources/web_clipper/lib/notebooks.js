/**
 * Created by mz on 15-01-15.
 */
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');

const Prefs = require('sdk/simple-prefs');

const Evernote = require('./evernote');
const Log = require('./log');

var gNotebooks = [];
var gLastNotebookGuid = null;
var gSelectedNotebookGuid = null;

exports.update = function update(opts) {

}