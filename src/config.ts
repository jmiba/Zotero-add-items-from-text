/**
 * Configuration and constants for the Add Items from Text plugin
 */

export const config = {
  addonID: "add-items-from-text@zotero.org",
  addonName: "Add Items from Text",
  addonRef: "additemsfromtext",
  prefsPrefix: "extensions.zotero.additemsfromtext",
  
  // Gemini API configuration
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    model: "gemini-2.0-flash",
    maxTokens: 8192,
  },
  
  // UI element IDs
  ui: {
    toolbarButtonId: "zotero-tb-add-items-from-text",
    menuItemId: "zotero-menu-add-items-from-text",
  },
} as const;

export type Config = typeof config;
