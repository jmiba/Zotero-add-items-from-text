/* eslint-disable no-undef */
var AddItemsFromText;
var chromeHandle;

function log(msg) {
  Zotero.debug("Add Items from Text: " + msg);
}

// Zotero 7 bootstrap entry points
function install(data, reason) {
  log("Installed");
}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  log("Starting up...");
  
  // Handle both Zotero 6 (resourceURI) and Zotero 7 (rootURI)
  rootURI = rootURI || resourceURI.spec;
  
  try {
    await Zotero.initializationPromise;
    
    // Register chrome content for dialogs
    var aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
      .getService(Ci.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "additemsfromtext", "content/"]
    ]);
    log("Chrome content registered");
    
    log("Loading script from: " + rootURI + "content/zotero-add-items-from-text.js");
    
    // Import main module
    Services.scriptloader.loadSubScript(rootURI + "content/zotero-add-items-from-text.js");
    
    log("Script loaded, AddItemsFromText = " + (typeof AddItemsFromText));
    
    // Initialize plugin
    AddItemsFromText.init({ id, version, rootURI });
    
    // Add to all existing windows
    AddItemsFromText.addToAllWindows();
    
    log("Startup complete");
  } catch (e) {
    log("Startup error: " + e);
    Zotero.logError(e);
  }
}

function onMainWindowLoad({ window }) {
  log("Main window loaded");
  if (AddItemsFromText) {
    AddItemsFromText.addToWindow(window);
  }
}

function onMainWindowUnload({ window }) {
  log("Main window unloading");
  if (AddItemsFromText) {
    AddItemsFromText.removeFromWindow(window);
  }
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  log("Shutting down...");
  
  if (reason === APP_SHUTDOWN) {
    return;
  }
  
  if (AddItemsFromText) {
    AddItemsFromText.removeFromAllWindows();
    AddItemsFromText.shutdown();
  }
  
  // Deregister chrome
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
  
  AddItemsFromText = undefined;
  
  log("Shutdown complete");
}

function uninstall(data, reason) {
  log("Uninstalled");
}
