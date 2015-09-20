const Data = require('sdk/self').data;
const Sandbox = require("sdk/loader/sandbox");
const Async = require('./async');
const Log = require('./log');

var XMLHttpRequest = require("sdk/net/xhr").XMLHttpRequest;
const { defer, resolve, reject, promised, all } = require('sdk/core/promise');

try {
var Inner = Sandbox.sandbox(null, {
  sandboxName: 'Thrift',
  wantXHRConstructor: true,
  metadata: {
    SDKContentScript: false
  },
  // sandboxPrototype:
});
Inner.console = console;
Inner.XMLHttpRequest = XMLHttpRequest;


Sandbox.load(Inner, Data.url('thrift/thrift.js'));
Sandbox.load(Inner, Data.url('thrift/thrift-binary.js'));
Sandbox.load(Inner, Data.url('thrift/gen/Errors_types.js'));
Sandbox.load(Inner, Data.url('thrift/gen/NoteStore_types.js'));
Sandbox.load(Inner, Data.url('thrift/gen/NoteStore.js'));
Sandbox.load(Inner, Data.url('thrift/gen/Types_types.js'));
Sandbox.load(Inner, Data.url('thrift/gen/Limits_types.js'));
Sandbox.load(Inner, Data.url('thrift/gen/Utility_types.js'));
Sandbox.load(Inner, Data.url('thrift/gen/Utility.js'));
Sandbox.load(Inner, Data.url('thrift/gen/UserStore_types.js'));
Sandbox.load(Inner, Data.url('thrift/gen/UserStore.js'));

const exportSymbols = [
  "Thrift",
  "EDAMErrorCode",
  "EDAMUserException",
  "EDAMSystemException",
  "EDAMNotFoundException",
  "SyncState",
  "SyncChunk",
  "SyncChunkFilter",
  "NoteFilter","NoteList",
  "NoteMetadata",
  "NotesMetadataList",
  "NotesMetadataResultSpec",
  "NoteCollectionCounts",
  "NoteEmailParameters",
  "NoteVersionId", "ClientUsageMetrics",
  "RelatedQuery", "RelatedResult",
  "RelatedResultSpec",
  "NoteStoreClient", "PrivilegeLevel",
  "QueryFormat", "NoteSortOrder",
  "PremiumOrderStatus",
  "SharedNotebookPrivilegeLevel",
  "SponsoredGroupRole",
  "BusinessUserRole",
  "SharedNotebookInstanceRestrictions",
  "ReminderEmailConfig",
  "CLASSIFICATION_RECIPE_USER_NON_RECIPE",
  "CLASSIFICATION_RECIPE_USER_RECIPE",
  "CLASSIFICATION_RECIPE_SERVICE_RECIPE",
  "EDAM_NOTE_SOURCE_WEB_CLIP",
  "EDAM_NOTE_SOURCE_MAIL_CLIP",
  "EDAM_NOTE_SOURCE_MAIL_SMTP_GATEWAY",
  "Data", "UserAttributes",
  "Accounting", "BusinessUserInfo",
  "PremiumInfo", "User", "Tag",
  "LazyMap", "ResourceAttributes",
  "Resource", "NoteAttributes", "Note",
  "Publishing", "BusinessNotebook",
  "SavedSearchScope", "SavedSearch",
  "SharedNotebookRecipientSettings",
  "SharedNotebook",
  "NotebookRestrictions", "Notebook",
  "LinkedNotebook",
  "NotebookDescriptor",
  "EDAM_ATTRIBUTE_LEN_MIN",
  "EDAM_ATTRIBUTE_LEN_MAX",
  "EDAM_ATTRIBUTE_REGEX",
  "EDAM_ATTRIBUTE_LIST_MAX",
  "EDAM_ATTRIBUTE_MAP_MAX",
  "EDAM_GUID_LEN_MIN",
  "EDAM_GUID_LEN_MAX",
  "EDAM_GUID_REGEX",
  "EDAM_EMAIL_LEN_MIN",
  "EDAM_EMAIL_LEN_MAX",
  "EDAM_EMAIL_LOCAL_REGEX",
  "EDAM_EMAIL_DOMAIN_REGEX",
  "EDAM_EMAIL_REGEX", "EDAM_VAT_REGEX",
  "EDAM_TIMEZONE_LEN_MIN",
  "EDAM_TIMEZONE_LEN_MAX",
  "EDAM_TIMEZONE_REGEX",
  "EDAM_MIME_LEN_MIN",
  "EDAM_MIME_LEN_MAX",
  "EDAM_MIME_REGEX",
  "EDAM_MIME_TYPE_GIF",
  "EDAM_MIME_TYPE_JPEG",
  "EDAM_MIME_TYPE_PNG",
  "EDAM_MIME_TYPE_WAV",
  "EDAM_MIME_TYPE_MP3",
  "EDAM_MIME_TYPE_AMR",
  "EDAM_MIME_TYPE_AAC",
  "EDAM_MIME_TYPE_M4A",
  "EDAM_MIME_TYPE_MP4_VIDEO",
  "EDAM_MIME_TYPE_INK",
  "EDAM_MIME_TYPE_PDF",
  "EDAM_MIME_TYPE_DEFAULT", "Array",
  "EDAM_MIME_TYPES",
  "EDAM_INDEXABLE_RESOURCE_MIME_TYPES",
  "EDAM_SEARCH_QUERY_LEN_MIN",
  "EDAM_SEARCH_QUERY_LEN_MAX",
  "EDAM_SEARCH_QUERY_REGEX",
  "EDAM_HASH_LEN",
  "EDAM_USER_USERNAME_LEN_MIN",
  "EDAM_USER_USERNAME_LEN_MAX",
  "EDAM_USER_USERNAME_REGEX",
  "EDAM_USER_NAME_LEN_MIN",
  "EDAM_USER_NAME_LEN_MAX",
  "EDAM_USER_NAME_REGEX",
  "EDAM_TAG_NAME_LEN_MIN",
  "EDAM_TAG_NAME_LEN_MAX",
  "EDAM_TAG_NAME_REGEX",
  "EDAM_NOTE_TITLE_LEN_MIN",
  "EDAM_NOTE_TITLE_LEN_MAX",
  "EDAM_NOTE_TITLE_REGEX",
  "EDAM_NOTE_CONTENT_LEN_MIN",
  "EDAM_NOTE_CONTENT_LEN_MAX",
  "EDAM_APPLICATIONDATA_NAME_LEN_MIN",
  "EDAM_APPLICATIONDATA_NAME_LEN_MAX",
  "EDAM_APPLICATIONDATA_VALUE_LEN_MIN",
  "EDAM_APPLICATIONDATA_VALUE_LEN_MAX",
  "EDAM_APPLICATIONDATA_ENTRY_LEN_MAX",
  "EDAM_APPLICATIONDATA_NAME_REGEX",
  "EDAM_APPLICATIONDATA_VALUE_REGEX",
  "EDAM_NOTEBOOK_NAME_LEN_MIN",
  "EDAM_NOTEBOOK_NAME_LEN_MAX",
  "EDAM_NOTEBOOK_NAME_REGEX",
  "EDAM_NOTEBOOK_STACK_LEN_MIN",
  "EDAM_NOTEBOOK_STACK_LEN_MAX",
  "EDAM_NOTEBOOK_STACK_REGEX",
  "EDAM_PUBLISHING_URI_LEN_MIN",
  "EDAM_PUBLISHING_URI_LEN_MAX",
  "EDAM_PUBLISHING_URI_REGEX",
  "EDAM_PUBLISHING_URI_PROHIBITED",
  "EDAM_PUBLISHING_DESCRIPTION_LEN_MIN",
  "EDAM_PUBLISHING_DESCRIPTION_LEN_MAX",
  "EDAM_PUBLISHING_DESCRIPTION_REGEX",
  "EDAM_SAVED_SEARCH_NAME_LEN_MIN",
  "EDAM_SAVED_SEARCH_NAME_LEN_MAX",
  "EDAM_SAVED_SEARCH_NAME_REGEX",
  "EDAM_USER_PASSWORD_LEN_MIN",
  "EDAM_USER_PASSWORD_LEN_MAX",
  "EDAM_USER_PASSWORD_REGEX",
  "EDAM_BUSINESS_URI_LEN_MAX",
  "EDAM_NOTE_TAGS_MAX",
  "EDAM_NOTE_RESOURCES_MAX",
  "EDAM_USER_TAGS_MAX",
  "EDAM_BUSINESS_TAGS_MAX",
  "EDAM_USER_SAVED_SEARCHES_MAX",
  "EDAM_USER_NOTES_MAX",
  "EDAM_BUSINESS_NOTES_MAX",
  "EDAM_USER_NOTEBOOKS_MAX",
  "EDAM_BUSINESS_NOTEBOOKS_MAX",
  "EDAM_USER_RECENT_MAILED_ADDRESSES_MAX",
  "EDAM_USER_MAIL_LIMIT_DAILY_FREE",
  "EDAM_USER_MAIL_LIMIT_DAILY_PREMIUM",
  "EDAM_USER_UPLOAD_LIMIT_FREE",
  "EDAM_USER_UPLOAD_LIMIT_PREMIUM",
  "EDAM_USER_UPLOAD_LIMIT_BUSINESS",
  "EDAM_NOTE_SIZE_MAX_FREE",
  "EDAM_NOTE_SIZE_MAX_PREMIUM",
  "EDAM_RESOURCE_SIZE_MAX_FREE",
  "EDAM_RESOURCE_SIZE_MAX_PREMIUM",
  "EDAM_USER_LINKED_NOTEBOOK_MAX",
  "EDAM_USER_LINKED_NOTEBOOK_MAX_PREMIUM",
  "EDAM_NOTEBOOK_SHARED_NOTEBOOK_MAX",
  "EDAM_NOTE_CONTENT_CLASS_LEN_MIN",
  "EDAM_NOTE_CONTENT_CLASS_LEN_MAX",
  "EDAM_NOTE_CONTENT_CLASS_REGEX",
  "EDAM_HELLO_APP_CONTENT_CLASS_PREFIX",
  "EDAM_FOOD_APP_CONTENT_CLASS_PREFIX",
  "EDAM_CONTENT_CLASS_HELLO_ENCOUNTER",
  "EDAM_CONTENT_CLASS_HELLO_PROFILE",
  "EDAM_CONTENT_CLASS_FOOD_MEAL",
  "EDAM_CONTENT_CLASS_SKITCH_PREFIX",
  "EDAM_CONTENT_CLASS_SKITCH",
  "EDAM_CONTENT_CLASS_SKITCH_PDF",
  "EDAM_CONTENT_CLASS_PENULTIMATE_PREFIX",
  "EDAM_CONTENT_CLASS_PENULTIMATE_NOTEBOOK",
  "EDAM_RELATED_PLAINTEXT_LEN_MIN",
  "EDAM_RELATED_PLAINTEXT_LEN_MAX",
  "EDAM_RELATED_MAX_NOTES",
  "EDAM_RELATED_MAX_NOTEBOOKS",
  "EDAM_RELATED_MAX_TAGS",
  "EDAM_BUSINESS_NOTEBOOK_DESCRIPTION_LEN_MIN",
  "EDAM_BUSINESS_NOTEBOOK_DESCRIPTION_LEN_MAX",
  "EDAM_BUSINESS_NOTEBOOK_DESCRIPTION_REGEX",
  "EDAM_BUSINESS_PHONE_NUMBER_LEN_MAX",
  "EDAM_PREFERENCE_NAME_LEN_MIN",
  "EDAM_PREFERENCE_NAME_LEN_MAX",
  "EDAM_PREFERENCE_VALUE_LEN_MIN",
  "EDAM_PREFERENCE_VALUE_LEN_MAX",
  "EDAM_MAX_PREFERENCES",
  "EDAM_MAX_VALUES_PER_PREFERENCE",
  "EDAM_PREFERENCE_NAME_REGEX",
  "EDAM_PREFERENCE_VALUE_REGEX",
  "EDAM_PREFERENCE_SHORTCUTS",
  "EDAM_PREFERENCE_SHORTCUTS_MAX_VALUES",
  "EDAM_DEVICE_ID_LEN_MAX",
  "EDAM_DEVICE_ID_REGEX",
  "EDAM_DEVICE_DESCRIPTION_LEN_MAX",
  "EDAM_DEVICE_DESCRIPTION_REGEX",
  "EDAM_SEARCH_SUGGESTIONS_MAX",
  "EDAM_SEARCH_SUGGESTIONS_PREFIX_LEN_MAX",
  "EDAM_SEARCH_SUGGESTIONS_PREFIX_LEN_MIN",
  "MarketingEmailType", "SupportTicket",
  "AppFeedback",
  "MarketingEmailParameters",
  "CrossPromotionInfo",
  "EDAM_VERSION_MAJOR",
  "EDAM_VERSION_MINOR",
  "PublicUserInfo",
  "AuthenticationResult",
  "BootstrapSettings",
  "BootstrapProfile",
  "BootstrapInfo",
  "PushNotificationCredentials",
];

// Code that converts callback-based code to a promise-based one
function wrapCallbacks(obj, f) {
  function wrapper() {
    var args = Array.prototype.slice.call(arguments, 0);
    return addCallbacks(args);
  }
  function addCallbacks(args) {
    var deferred = defer();
    // check that nobody tries async on their own.
    args.push(function(x){ deferred.resolve(x); });
    args.push(function(x){ deferred.reject(x); });

    f.apply(obj, args);
    return deferred.promise;
  }
  return promised(wrapper);
}


function wrapClient(base, child) {
  function wrapper(f) {
    var result = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      var deferred = defer();
      // check that nobody tries async on their own.
      args.push(function(x){ deferred.resolve(x); });
      args.push(function(x){ deferred.reject(x); });
      f.apply(this.client, args);
      return deferred.promise;
    }
    return promised(result);
  }

  var bp = base.prototype;
  var cp = child.prototype;
  for (var k in bp) {
    let f = bp[k];
    if (typeof(f) == 'function') {
      if (k.startsWith('send_') || k.startsWith('recv_')) continue;
      cp[k] = wrapper(f);
    }
  }
}

function NoteStorePromised(url) {
  this.url = url;
  this.transport = new Inner.Thrift.BinaryHttpTransport(this.url);
  this.protocol = new Inner.Thrift.BinaryProtocol(this.transport)
  this.client = new Inner.NoteStoreClient(this.protocol);
}
wrapClient(Inner.NoteStoreClient, NoteStorePromised);

function UserStorePromised(url) {
  this.url = url;
  this.transport = new Inner.Thrift.BinaryHttpTransport(this.url);
  this.protocol = new Inner.Thrift.BinaryProtocol(this.transport)
  this.client = new Inner.UserStoreClient(this.protocol);
}
wrapClient(Inner.UserStoreClient, UserStorePromised);

exports.Thrift = Inner.Thrift;
exports.NoteStoreClient = NoteStorePromised;
exports.UserStoreClient = UserStorePromised;
for (var i = 0; i < exportSymbols.length; i++) {
  let k = exportSymbols[i];
  let v = Inner[k];
  if (v && !exports[k]) {
    exports[k] = v;
  }
}

} catch(e) {
Log.exception(e);
}
