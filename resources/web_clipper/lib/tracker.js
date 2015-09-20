
var { emit, on, once, off } = require("sdk/event/core");
const WindowUtils = require('sdk/window/utils');
const WindowTracker = require('sdk/deprecated/window-utils').WindowTracker;
const { getMostRecentBrowserWindow } = require('sdk/window/utils');

var Auth = require('./auth');
var Log = require('./log');
var Util = require('./util');

var Tracker = {};

viewClasses = {};

windows = {};

views = {};

uniqueId = 1;

/** system window tracker interface */
var tracker;

/** starts tracking windows. note that might immediately after the call */
Tracker.init = function() {
  tracker = new WindowTracker(Delegate);
};

/**
 * Adds a new view class to the suite, the class will automatically be
 * instantiated whenever a new page is opened.
 * the structure of the view class is:
 * {
 *    classId: {number} system-wide unique id for the view class
 *    createInstance: {function(Window):ViewInstance} - factory method
 *    optional disposeInstance:  {function(ViewInstance)}
 * }
 */
Tracker.addViewClass = function addViewClass(viewClass) {
  var classId = viewClass.id;
  Log.log("Adding new view class " + classId);
  if (classId in viewClasses) {
    throw new Error("Class " + classId + " already registered");
  }

  // Store view class
  viewClasses[classId] = viewClass;

  // for existing windows, try adding instances.
  for (var windowId in windows) {
    let window = windows[windowId];
    createViewInstance(viewClass, window, windowId);
  }
  Log.log("View class " + classId + " added");

  emit(Tracker, "viewclassadded", viewClass);
};

/**
 * creates an instance of a view class in a given window by calling the class factory.
 */
function createViewInstance(viewClass, window, windowId) {
  Log.log("Creating new instance of " + viewClass.id + " in window #" + windowId );

  var view = viewClass.createInstance(window);
  if (!view) {
    Log.log("Skipped");
    return false;
  }

  var id = uniqueId++;
  var viewInfo = {
    view: view,
    id: id,
    classId: viewClass.id,
    ownerWindow: window,
    windowId: windowId
  };
  views[id] = viewInfo;
  Log.log("Ok");

  emit(Tracker, "viewcreated", viewInfo);
}

/**
 * @param view view instance that should be disposed of.
 */
function disposeViewInstance(view) {
  if (!view) return;

  Log.log("Disposing of view instance");
  Log.log("View:" + view.id + " Class:" + view.classId + " window:" + view.windowId);

  // first try its own dispose() function.
  var instance = view.view;
  if (typeof(instance.dispose) == 'function') {
    instance.dispose();
  }

  var viewClass = viewClasses[view.classId];
  if (typeof(viewClass.disposeInstance) == 'function') {
    viewClass.disposeInstance(instance);
  }

  var evt = {
    id: view.id,
    classId: view.classId,
    ownerWindow: view.ownerWindow,
    windowId: view.windowId
  };
  delete views[view.id];
  Log.log("Deleted");

  emit(Tracker, "viewdisposed", evt);
}

Tracker.findClassInstance = function findClassInstance(classId, window) {
  window = window || getMostRecentBrowserWindow();
  for (var id in views) {
    let view = views[id];
    if (view.classId == classId && view.ownerWindow == window) {
      return view.view;
    }
  }
  throw new Error("Cannot find an instance of " + classId + " in current window ");
}

var Delegate = {
  onTrack: function onTrack(window) {
    if (!WindowUtils.isBrowser(window)) return;
    var windowId = WindowUtils.getOuterId(window);
    Log.info("Tracking window #" + windowId + " at " + window.location);

    if (windowId in windows) {
      Log.warn("win id#" + windowId + " already present");
      return;
    }

    windows[windowId] = window;

    emit(Tracker, "open", window, windowId);

    // for existing view classes, add new instances.
    for (var classId in viewClasses) {
      let viewClass = viewClasses[classId];
      createViewInstance(viewClass, window, windowId);
    }
  },

  onUntrack: function onUntrack(window) {
    if (!WindowUtils.isBrowser(window)) return;
    var windowId = WindowUtils.getOuterId(window);

    Log.info("Untracking window #" + windowId + " at " + window.location);

    // Dispose all views attached to the window.
    for (var instanceId in views) {
       var view = views[instanceId];
       if (view.ownerWindow === window) {
          disposeViewInstance(view);
       }
    }

    if (!(windowId in windows)) {
      Log.warn("window " + windowId + " was not tracked");
    } else {
      delete windows[windowId];
    }

    emit(Tracker, "close", window, windowId);
  }
};

var Tabs = require("sdk/tabs");
var TabsUtils = require("sdk/tabs/utils");
var SysEvents = require('sdk/system/events');

var TabTracker = {
  classes: {},
  tabs: {}
};

TabTracker.addClass = function(cls, clsId) {
  if (TabTracker.classes[clsId]) throw new Error("Class " + clsId + " already tracked");
  TabTracker.classes[clsId] = cls;
}

TabTracker.onActivate = function(tab, tabInfo) {
  Log.log('onActivate:' + tab.id + "/" + tabInfo.id);
  if (!tabInfo) throw new Error("Tab " + tab.id + " not found");
  for(var clsId in tabInfo.instances) {
    var inst = tabInfo.instances[clsId];
    if (inst && inst.onActivate) {
      inst.onActivate(tab);
    }
  }
}
TabTracker.onDeactivate = function(tab, tabInfo) {
  Log.log('onDeactivate:' + tab.id + "/" + tabInfo.id);
  if (!tabInfo) throw new Error("Tab " + tab.id + " not found");
  for(var clsId in tabInfo.instances) {
    var inst = tabInfo.instances[clsId];
    if (inst && inst.onDeactivate) {
      inst.onDeactivate(tab);
    }
  }
}

TabTracker.onLeavePage = function(tab, tabInfo) {
  Log.log('TabTracker.onLeavePage:' + tab.id + "/" + tabInfo.id);
  if (!tabInfo) throw new Error("Tab " + tab.id + " not found");
  tabInfo.contentWindow = null;
  tabInfo.contentDocument = null;

  if (tabInfo.calledOnLeavePage) return;
  for(var clsId in tabInfo.instances) {
    var inst = tabInfo.instances[clsId];
    if (inst && inst.onLeavePage) {
      inst.onLeavePage(tab);
    }
  }
  tabInfo.calledOnLeavePage = true;
}

TabTracker.onEnterPage = function onEnterPage(tab, tabInfo) {

  Log.log('TabTracker.onEnterPage:' + tab.id + "/" + tabInfo.id);
  if (!tabInfo) throw new Error("Tab " + tab.id + " not found");

  var window = Util.getTabWindow(tab);
  if (!window) { Log.log("window for tab " + tab.id + " not found"); return; }
  tabInfo.calledOnLeavePage = false;
  tabInfo.data.contentWindow = window;
  tabInfo.data.contentDocument = window.document;
  //Log.log(tabInfo.data.contentWindow, tabInfo.data.contentDocument);

  for(var clsId in tabInfo.instances) {
    var inst = tabInfo.instances[clsId];
    if (inst && inst.onEnterPage) {
      inst.document = window.document;
      inst.onEnterPage(tab, window, window.document);
    }
  }
  window.addEventListener('unload', function onUnload() {
    window.removeEventListener('unload', onUnload);
  });
  window.addEventListener('pagehide', function onPageHide() {
    window.removeEventListener('pagehide', onPageHide);
    TabTracker.onLeavePage(tab, tabInfo);
  });
}

TabTracker.createTab = function(tab) {
  var id = tab.id;
  var tabInfo = TabTracker.tabs[id];
  if (!tabInfo) {
    var browserTab = Util.getNativeTab(tab);
    if (!browserTab) return;
    var data = {
      id: id,
      tab: tab,
      browserTab: browserTab,
      ownerWindow: TabsUtils.getOwnerWindow(browserTab),
      browser: TabsUtils.getBrowserForTab(browserTab),
      injectRoot: Util.getTabInjection(tab),
      get isActive() {
        let window = TabsUtils.getOwnerWindow(browserTab);
        let activeTab = Util.getActiveTab(window);
        return activeTab && activeTab.id === id;
      },
      getContentDocument: function() {
        var wnd = Util.getTabWindow(tab);
        if (!wnd) {
          Log.warn("No tab window");
          return null;
        }
        var document = wnd.document;
        if (!document) {
          Log.error("No tab document");
          return null;
        }
        return document;
      },
      getContentWindow: function() {
        return Util.getTabWindow(tab);
      }
    };
    data.ownerDocument = data.browser.ownerDocument;
    Log.log("createTab:",id);
    tabInfo = {
      data: data,
      instances: {},
      id: id,
    };
    data.getInstance = function(clsId) {
      return TabTracker._getInstance(tabInfo, clsId);
    };
    data.on = on.bind(null,data);
    data.once = once.bind(null,data);
    data.off = off.bind(null,data);
    data.emit = emit.bind(null,data);
    data.on('ui-action', function(msg) {
      Log.log("TabInfo" + id, "ui-action", msg);
    });
  }

  TabTracker.tabs[id] = tabInfo;
  // fill instances
  for(var clsId in TabTracker.classes) {
    if (!tabInfo.instances[clsId]) {
      var cls = TabTracker.classes[clsId];
      var inst = new cls(tabInfo.data);
      tabInfo.instances[clsId] = inst;

    }
  }
  tabInfo.calledOnLeavePage = false;
  tabInfo.calledOnTabClosed = false;
  tab.on("activate", function() { TabTracker.onActivate(tab, tabInfo); });
  tab.on("deactivate", function() { TabTracker.onDeactivate(tab, tabInfo); });
  tab.on("ready", function() { TabTracker.onEnterPage(tab, tabInfo); });


  tab.once("close", function(tab) {
    var id = tabInfo.id;
    Log.log("Tab " + tab.id + "/" + id + " closed");
    TabTracker.onLeavePage(tab, tabInfo);

    if (tabInfo.calledOnTabClosed) return;
    for(var clsId in tabInfo.instances) {
      var inst = tabInfo.instances[clsId];
      if (inst && inst.onTabClosed) inst.onTabClosed(tab);
    }
    tabInfo.calledOnTabClosed = true;
    Log.log("Tab " + id + " deleted");
    TabTracker.tabs[id] = null;
  });
}

TabTracker.init = function() {
  Tabs.on('open', TabTracker.createTab);
  for (var i = 0; i < Tabs.length; i++) {
    TabTracker.createTab(Tabs[i]);
  }

  // forward auth events to tabs, so they can update themselves.
  Auth.on("logged-in", function(msg) {
    TabTracker.emit("logged-in", {tab: "*", msg: msg});
  });
  Auth.on("logged-out", function(msg) {
    TabTracker.emit("logged-out", {tab: "*", msg: msg});
  });
}


TabTracker._getInstance = function(tabInfo, clsId) {
  var inst = tabInfo.instances[clsId];
  if (inst) return inst;
  var cls = TabTracker.classes[clsId];
  if (!cls) {
    throw new Error('Unknown tracker class ' + clsId);
  }
  var inst = new cls(tabInfo.data);
  tabInfo.instances[clsId] = inst;
  return inst;
}

TabTracker.getInstance = function(clsId, tab) {
  tab = tab || Util.getActiveTab();
  var tabInfo = TabTracker.tabs[tab.id];
  if (!tabInfo) {
    throw new Error('Unknown tracker tab ' + tab.id);
  }
  return TabTracker._getInstance(tabInfo, clsId);
}

TabTracker.emit = function(event, msg) {
  var tab;
  if (!msg.tab) {
    let t = Util.getActiveTab();
    if (!t) return;
    tab = msg.tab = t.id;
  } else {
    tab = msg.tab
  }

  if (msg.tab === '*') {
    // all
    for (var i = 0; i < Tabs.length; i++) {
      msg.tab = Tabs[i].id;
      TabTracker.emit(event, msg);
    }
    return;
  }

  var tabInfo = TabTracker.tabs[tab];
  if (!tabInfo) {
    throw new Error('Unknown tracker tab ' + tab);
  }

  for(var clsId in tabInfo.instances) {
    var inst = tabInfo.instances[clsId];
    if (inst) {
      emit(inst, event, msg);
    }
  }
}

Tracker.on = on.bind(null, Tracker);
Tracker.once = once.bind(null, Tracker);
Tracker.removeListener = function removeListener(type, listener) {
  off(Tracker, type, listener);
};
exports.Tracker = Tracker;
exports.TabTracker = TabTracker;
