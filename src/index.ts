/**
 * Main entry point for Add Items from Text plugin
 */

import { config } from "./config";
import { PreferencesManager } from "./preferences";
import { GeminiService } from "./gemini";
import { ZoteroImportService } from "./import";
import { UIService } from "./ui";
import { IndexValidationService } from "./indices";
import type { ValidationResult } from "./gemini";

function formatErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return "An unknown error occurred";
  if (typeof error === "string") return error;

  if (error instanceof Error) {
    return error.message || String(error);
  }

  // Zotero/Firefox code sometimes throws objects that aren't instanceof Error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyErr = error as any;
  if (typeof anyErr.message === "string" && anyErr.message.trim()) {
    return anyErr.message;
  }
  if (typeof anyErr.status === "number") {
    return `HTTP ${anyErr.status}`;
  }

  try {
    const json = JSON.stringify(error);
    return json === "{}" ? String(error) : json;
  } catch {
    return String(error);
  }
}

function mergeValidationArrays(
  base: ValidationResult[] | undefined,
  extra: ValidationResult[]
): ValidationResult[] {
  if (!base) return extra;
  const max = Math.max(base.length, extra.length);
  const merged: ValidationResult[] = [];
  for (let i = 0; i < max; i++) {
    const a = base[i];
    const b = extra[i];
    if (!a) {
      merged.push(b);
      continue;
    }
    if (!b) {
      merged.push(a);
      continue;
    }
    merged.push({
      isValid: a.isValid && b.isValid,
      errors: [...(a.errors || []), ...(b.errors || [])],
      warnings: [...(a.warnings || []), ...(b.warnings || [])],
      suggestions: [...(a.suggestions || []), ...(b.suggestions || [])],
    });
  }
  return merged;
}

// Extend global Zotero type for PreferencePanes
declare global {
  interface ZoteroGlobal {
    PreferencePanes?: {
      register: (options: {
        pluginID: string;
        src: string;
        label: string;
        image?: string;
      }) => void;
    };
  }
}

class AddItemsFromTextPlugin {
  private _id: string = "";
  private version: string = "";
  private rootURI: string = "";
  private initialized: boolean = false;
  private windowListeners: Map<Window, UIService> = new Map();
  private geminiService: GeminiService | null = null;

  /**
   * Initialize the plugin
   */
  init(options: { id: string; version: string; rootURI: string }): void {
    if (this.initialized) return;

    this._id = options.id;
    this.version = options.version;
    this.rootURI = options.rootURI;

    Zotero.debug(`${config.addonName}: Initializing v${this.version}`);

    this.geminiService = new GeminiService();
    
    // Register preference pane
    this.registerPreferencePane();
    
    this.initialized = true;

    Zotero.debug(`${config.addonName}: Initialization complete`);
  }

  /**
   * Register the preferences pane in Zotero settings
   */
  private registerPreferencePane(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ZoteroAny = Zotero as any;
      if (ZoteroAny.PreferencePanes) {
        ZoteroAny.PreferencePanes.register({
          pluginID: config.addonID,
          src: this.rootURI + "content/preferences.xhtml",
          scripts: [this.rootURI + "content/preferences.js"],
          label: "Add Items from Text",
          image: this.rootURI + "content/icons/add-items-from-text.svg",
        });
        Zotero.debug(`${config.addonName}: Preference pane registered`);
      } else {
        Zotero.debug(`${config.addonName}: PreferencePanes API not available`);
      }
    } catch (e) {
      Zotero.debug(`${config.addonName}: Failed to register preference pane: ${e}`);
    }
  }

  /**
   * Add plugin UI to a specific window
   */
  addToWindow(window: Window): void {
    if (!window || this.windowListeners.has(window)) return;
    
    Zotero.debug(`${config.addonName}: Adding to window...`);

    const ui = new UIService(window);
    this.windowListeners.set(window, ui);

    // Add toolbar button
    ui.addToolbarButton(() => this.handleAddFromText(window));

    // Add menu item
    ui.addMenuItem(() => this.handleAddFromText(window));

    Zotero.debug(`${config.addonName}: Added to window`);
  }

  /**
   * Remove plugin UI from a specific window
   */
  removeFromWindow(window: Window): void {
    const ui = this.windowListeners.get(window);
    if (ui) {
      ui.removeToolbarButton();
      ui.removeMenuItem();
      this.windowListeners.delete(window);
    }
  }

  /**
   * Add plugin to all open Zotero windows
   */
  addToAllWindows(): void {
    const windows = Zotero.getMainWindows();
    for (const win of windows) {
      // Check for ZoteroPane as in Make It Red sample
      if (!win.ZoteroPane) continue;
      this.addToWindow(win);
    }
  }

  /**
   * Remove plugin from all windows
   */
  removeFromAllWindows(): void {
    for (const [window] of this.windowListeners) {
      this.removeFromWindow(window);
    }
  }

  /**
   * Main handler for Add from Text action
   */
  async handleAddFromText(window: Window): Promise<void> {
    const ui = this.windowListeners.get(window);
    if (!ui) return;

    // Check for API key
    if (!PreferencesManager.hasApiKey()) {
      const apiKey = await ui.showApiKeyDialog();
      if (!apiKey) {
        ui.showError(
          "API Key Required",
          "A Google Gemini API key is required to use this feature.\n\nYou can get one at: https://aistudio.google.com/apikey"
        );
        return;
      }
      PreferencesManager.setApiKey(apiKey);
      this.geminiService?.updateApiKey();
    }

    // Show text input dialog
    const inputText = await ui.showTextInputDialog();
    if (!inputText) return;
    // Some Zotero platforms ignore dialog close for XHTML modal windows; ensure it's gone before processing.
    ui.closeTextInputDialogs();

    // Process the text
    const progress = ui.showProgressDialog(
      "Processing References",
      "Analyzing text with AI..."
    );

    try {
      // Extract references using Gemini
      progress.update("Extracting references from text...", 20);
      const response = await this.geminiService!.extractReferences(inputText);

      if (!response.references || response.references.length === 0) {
        progress.close();
        ui.showError(
          "No References Found",
          "Could not identify any literature references in the provided text.\n\nPlease try again with text containing clear bibliographic references."
        );
        return;
      }

      let references = response.references;

      // Validate references if enabled
      let validationResults: ValidationResult[] | undefined = undefined;
      if (PreferencesManager.get("autoValidate")) {
        progress.update(
          `Validating ${response.references.length} references...`,
          50
        );
        validationResults = await this.geminiService!.validateReferences(references);
      }

      // Validate/enrich via bibliographic indexes (Crossref/OpenAlex/lobid)
      if (PreferencesManager.get("indexValidate")) {
        progress.update(`Checking ${references.length} reference(s) in bibliographic indexes...`, 65);

        const { references: enriched, validationResults: indexResults } =
          await IndexValidationService.validateAndEnrich(
            references,
            {
              enabled: true,
              enrichFromIndexes: PreferencesManager.get("indexEnrich"),
              crossref: PreferencesManager.get("indexCrossref"),
              crossrefMailto: PreferencesManager.get("crossrefMailto"),
              openalex: PreferencesManager.get("indexOpenAlex"),
              openalexMailto: PreferencesManager.get("openAlexMailto"),
              lobid: PreferencesManager.get("indexLobid"),
            },
            (current, total, title) => {
              const pct = 65 + Math.round((current / Math.max(total, 1)) * 25);
              progress.update(`Index lookup ${current}/${total}: ${title.substring(0, 50)}...`, pct);
            }
          );

        references = enriched;
        validationResults = mergeValidationArrays(validationResults, indexResults);
      }

      progress.close();

      // Show preview dialog (optional)
      const previewResult = PreferencesManager.get("showPreview")
        ? await ui.showPreviewDialog(references, validationResults)
        : {
            confirmed: true,
            selectedIndices: references.map((_, i) => i),
          };

      if (!previewResult.confirmed || previewResult.selectedIndices.length === 0) {
        return;
      }

      // Filter to selected references
      const selectedRefs = previewResult.selectedIndices.map(
        (i) => references[i]
      );

      // Import selected references
      const importProgress = ui.showProgressDialog(
        "Importing References",
        "Starting import..."
      );

      const collectionID = ZoteroImportService.getCurrentCollectionID();

      const result = await ZoteroImportService.importReferences(
        selectedRefs,
        collectionID,
        (current, total, title) => {
          const percent = Math.round((current / total) * 100);
          importProgress.update(
            `Importing ${current}/${total}: ${title.substring(0, 50)}...`,
            percent
          );
        }
      );

      importProgress.close();

      // Show results
      const errorDetails = result.errors.map(
        (e) => `${e.ref.title || "Unknown"}: ${formatErrorMessage(e.error)}`
      );

      ui.showResultsDialog(
        result.imported.length,
        result.errors.length,
        errorDetails
      );
      ui.closeTextInputDialogs();
    } catch (error) {
      Zotero.logError(error as Error);

      const errorMessage = formatErrorMessage(error);

      // Provide helpful messages for common HTTP errors
      let userMessage = errorMessage;
      let title = "Error Processing References";
      
      if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable")) {
        title = "Service Temporarily Unavailable";
        userMessage = "Google's Gemini API is temporarily overloaded (Error 503).\n\nPlease wait a moment and try again.";
      } else if (errorMessage.includes("429") || errorMessage.includes("rate limit") || errorMessage.includes("quota")) {
        title = "Rate Limit Reached";
        userMessage = "You've hit the API rate limit (Error 429).\n\nPlease wait a minute before trying again, or check your quota at aistudio.google.com";
      } else if (errorMessage.includes("401") || errorMessage.includes("403")) {
        title = "Authentication Error";
        userMessage = "Your API key appears to be invalid or expired.\n\nPlease check your API key in Preferences → Add Items from Text.";
      } else if (errorMessage.includes("404")) {
        title = "Model Not Found";
        userMessage = "The selected model is not available.\n\nPlease go to Preferences → Add Items from Text and click 'Refresh Models' to update the model list.";
      } else if (errorMessage.includes("API key")) {
        progress.close();
        const newKey = await ui.showApiKeyDialog(
          PreferencesManager.getApiKey()
        );
        if (newKey) {
          PreferencesManager.setApiKey(newKey);
          this.geminiService?.updateApiKey();
          ui.showError(
            "API Key Updated",
            "Your API key has been updated. Please try again."
          );
        }
        return;
      }
      
      // Show error in the progress dialog (which is still open), then close it
      progress.showError(title, userMessage);
      progress.close();
      ui.closeTextInputDialogs();
    }
  }

  /**
   * Shutdown the plugin
   */
  shutdown(): void {
    this.removeFromAllWindows();
    this.geminiService = null;
    this.initialized = false;
    Zotero.debug(`${config.addonName}: Shutdown complete`);
  }
}

// Export the plugin instance - this will be exposed via the build script
export var AddItemsFromText = new AddItemsFromTextPlugin();
