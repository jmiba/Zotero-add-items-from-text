/**
 * UI Components for Add Items from Text plugin
 * Handles dialogs, toolbar buttons, and user interaction
 */

import { config } from "./config";
import { ExtractedReference, ValidationResult } from "./gemini";
import { BibtexService } from "./bibtex";

// Helper to create XUL elements (Zotero-specific)
function createXULElement(doc: Document, tagName: string): HTMLElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).createXULElement(tagName);
}

export class UIService {
  private window: Window;
  private lastInputText: string = "";

  constructor(window: Window) {
    this.window = window;
  }

  closeTextInputDialogs(): void {
    try {
      const enumerator = Services.wm.getEnumerator(null);
      while (enumerator.hasMoreElements()) {
        const win = enumerator.getNext();
        try {
          const docEl = (win as unknown as Window).document?.documentElement as unknown as {
            id?: string;
            getAttribute?: (name: string) => string | null;
          };
          const id = docEl?.id || docEl?.getAttribute?.("id") || "";
          if (id === "add-items-text-input-dialog") {
            (win as unknown as Window).close();
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Show the main text input dialog using a proper modal window
   */
  async showTextInputDialog(initialText?: string): Promise<string | null> {
    return new Promise((resolve) => {
      const io = {
        dataIn: {
          description: "Paste text containing literature references below. The AI will extract and convert them to Zotero items.",
          placeholder: "Paste your text with references here...",
          initialText: initialText ?? this.lastInputText,
        },
        dataOut: null as { text: string | null; confirmed: boolean } | null
      };
      
      // Get the rootURI from the plugin to find our dialog file
      // Use the chrome URL registered in bootstrap.js
      const dialogUrl = "chrome://additemsfromtext/content/textInputDialog.xhtml";
      
      // Try to open dialog - use a data URI as fallback
      try {
        const dialogWindow = this.window.openDialog(
          dialogUrl,
          "add-items-text-input",
          "chrome,dialog,modal,centerscreen,resizable=yes,width=700,height=550",
          io
        );

        const finish = () => {
          const rawText = io.dataOut?.confirmed ? io.dataOut.text : null;
          if (typeof rawText === "string") {
            this.lastInputText = rawText;
            const trimmed = rawText.trim();
            resolve(trimmed ? trimmed : null);
          } else {
            resolve(null);
          }
        };

        // If the window is truly modal, execution will resume after it closes.
        // If it isn't (platform quirks), poll until we get dataOut or the window closes.
        if (dialogWindow && !dialogWindow.closed && !io.dataOut) {
          const interval = this.window.setInterval(() => {
            if (io.dataOut || dialogWindow.closed) {
              this.window.clearInterval(interval);
              try {
                if (dialogWindow && !dialogWindow.closed) dialogWindow.close();
              } catch {
                // ignore
              }
              // Extra safety: close by enumerating windows (some platforms ignore close() on modal sheets)
              this.closeTextInputDialogs();
              finish();
            }
          }, 100);
          return;
        }

        // Best-effort: ensure the dialog isn't left open
        try {
          if (dialogWindow && !dialogWindow.closed) dialogWindow.close();
        } catch {
          // ignore
        }
        this.closeTextInputDialogs();

        finish();
      } catch (e) {
        Zotero.debug("Add Items from Text: Dialog error, using fallback prompt: " + e);
        // Fallback to simple prompt
        const result = this.showSimpleTextPrompt();
        resolve(result?.trim() ? result.trim() : null);
      }
    });
  }
  
  /**
   * Fallback simple text prompt using Services.prompt
   */
  private showSimpleTextPrompt(): string | null {
    const textResult = { value: "" };
    const checkResult = { value: false };
    
    const confirmed = Services.prompt.prompt(
      this.window,
      "Add Items from Text",
      "Paste text containing literature references.\n(All text including line breaks will be preserved)",
      textResult,
      null,
      checkResult
    );
    
    if (confirmed) {
      this.lastInputText = textResult.value;
      if (textResult.value.trim()) {
        return textResult.value;
      }
    }
    return null;
  }

  /**
   * Show progress dialog during processing as a modal popup window
   */
  showProgressDialog(title: string, message: string): {
    update: (message: string, progress?: number) => void;
    close: () => void;
    showError: (title: string, message: string) => void;
    dialogWindow: Window | null;
  } {
    const io = {
      dataIn: { title, message },
      dataOut: null
    };
    
    const dialogUrl = "chrome://additemsfromtext/content/progressDialog.xhtml";
    
    // Open as non-modal so we can update it
    const dialogWindow = this.window.openDialog(
      dialogUrl,
      "add-items-progress",
      "chrome,dialog,centerscreen,width=450,height=140",
      io
    ) as Window & { 
      updateProgress?: (msg: string, pct?: number) => void;
      closeDialog?: () => void;
      showError?: (title: string, msg: string) => void;
    };

    return {
      dialogWindow,
      update: (newMessage: string, progress?: number) => {
        try {
          if (dialogWindow && !dialogWindow.closed && dialogWindow.updateProgress) {
            dialogWindow.updateProgress(newMessage, progress);
          }
        } catch (e) {
          // Dialog may have been closed
        }
      },
      close: () => {
        try {
          if (dialogWindow && !dialogWindow.closed) {
            if (dialogWindow.closeDialog) {
              dialogWindow.closeDialog();
            } else {
              dialogWindow.close();
            }
          }
        } catch (e) {
          // Dialog may have been closed
        }
      },
      showError: (errorTitle: string, errorMessage: string) => {
        try {
          if (dialogWindow && !dialogWindow.closed && dialogWindow.showError) {
            dialogWindow.showError(errorTitle, errorMessage);
          } else {
            // Fallback to main window
            Services.prompt.alert(this.window, errorTitle, errorMessage);
          }
        } catch (e) {
          Services.prompt.alert(this.window, errorTitle, errorMessage);
        }
      }
    };
  }

  /**
   * Show preview dialog with extracted references
   */
  async showPreviewDialog(
    references: ExtractedReference[],
    validationResults?: ValidationResult[]
  ): Promise<{ confirmed: boolean; selectedIndices: number[] }> {
    return new Promise((resolve) => {
      const io = {
        dataIn: {
          title: `Preview: ${references.length} Reference(s)`,
          references,
          validationResults,
          bibtex: BibtexService.referencesToBibtex(references),
        },
        dataOut: null as { confirmed: boolean; selectedIndices: number[] } | null,
      };

      const dialogUrl = "chrome://additemsfromtext/content/previewDialog.xhtml";

      try {
        this.window.openDialog(
          dialogUrl,
          "add-items-preview",
          "chrome,dialog,modal,centerscreen,resizable=yes,width=820,height=650",
          io
        );

        resolve(io.dataOut ?? { confirmed: false, selectedIndices: [] });
      } catch (e) {
        Zotero.debug("Add Items from Text: Preview dialog error, importing all: " + e);
        resolve({ confirmed: true, selectedIndices: references.map((_, i) => i) });
      }
    });
  }

  /**
   * Show API key configuration dialog
   */
  async showApiKeyDialog(currentKey?: string): Promise<string | null> {
    const result = { value: currentKey || "" };
    const check = { value: false };

    const confirmed = Services.prompt.prompt(
      this.window,
      "Configure Gemini API Key",
      "Enter your Google Gemini API key.\nGet one at: https://aistudio.google.com/apikey",
      result,
      null,
      check
    );

    if (confirmed && result.value.trim()) {
      return result.value.trim();
    }
    return null;
  }

  /**
   * Show results summary
   */
  showResultsDialog(
    imported: number,
    errors: number,
    errorDetails?: string[]
  ): void {
    let message = `Successfully imported ${imported} reference(s).`;
    if (errors > 0) {
      message += `\n\n${errors} reference(s) could not be imported.`;
      if (errorDetails && errorDetails.length > 0) {
        message += `\n\nErrors:\n${errorDetails.slice(0, 5).join("\n")}`;
        if (errorDetails.length > 5) {
          message += `\n... and ${errorDetails.length - 5} more`;
        }
      }
    }

    Services.prompt.alert(this.window, "Import Complete", message);
  }

  /**
   * Show error message
   */
  showError(title: string, message: string): void {
    // Use the most recent window to ensure the alert is visible
    const parentWindow = Services.wm.getMostRecentWindow("navigator:browser") || this.window;
    Services.prompt.alert(parentWindow, title, message);
  }

  /**
   * Show confirmation dialog
   */
  showConfirm(title: string, message: string): boolean {
    const parentWindow = Services.wm.getMostRecentWindow("navigator:browser") || this.window;
    return Services.prompt.confirm(parentWindow, title, message);
  }

  /**
   * Add toolbar button to Zotero window
   */
  addToolbarButton(onClick: () => void): void {
    const doc = this.window.document;

    Zotero.debug(`${config.addonName}: Attempting to add toolbar button...`);

    // Log all toolbars and toolbar-related elements for debugging
    const allToolbars = doc.querySelectorAll('toolbar, [id*="toolbar"]');
    Zotero.debug(`${config.addonName}: Found ${allToolbars.length} toolbar elements`);
    allToolbars.forEach(t => Zotero.debug(`  - ${t.tagName}#${t.id}`));

    // Zotero 7 specific toolbar IDs
    const toolbarIds = [
      "zotero-items-toolbar",
      "zotero-editpane-item-box",
      "main-window"
    ];
    
    let toolbar: Element | null = null;
    for (const id of toolbarIds) {
      toolbar = doc.getElementById(id);
      if (toolbar) {
        Zotero.debug(`${config.addonName}: Found toolbar: ${id}`);
        break;
      }
    }
    
    if (!toolbar) {
      // Fallback: try to find toolbar by querying for specific patterns
      toolbar = doc.querySelector('#zotero-items-toolbar') || 
                doc.querySelector('hbox#zotero-items-toolbar') ||
                doc.querySelector('[id*="items-toolbar"]');
      Zotero.debug(`${config.addonName}: Using fallback toolbar: ${toolbar?.id || 'unknown'}`);
    }
    
    if (!toolbar) {
      Zotero.debug(`${config.addonName}: Could not find any toolbar, will add menu item only`);
      return;
    }

    // Check if button already exists
    if (doc.getElementById(config.ui.toolbarButtonId)) {
      Zotero.debug(`${config.addonName}: Button already exists`);
      return;
    }

    // Create toolbar button - try XUL first, fallback to HTML
    let button: HTMLElement;
    try {
      button = createXULElement(doc, "toolbarbutton") as HTMLElement;
    } catch (e) {
      Zotero.debug(`${config.addonName}: XUL toolbarbutton failed, using HTML button`);
      button = doc.createElement("button") as HTMLElement;
    }
    
    button.id = config.ui.toolbarButtonId;
    button.setAttribute("class", "zotero-tb-button");
    button.setAttribute("tooltiptext", "Add Items from Text");
    button.setAttribute("title", "Add Items from Text");

    const iconUrl = "chrome://additemsfromtext/content/icons/add-items-from-text.svg";
    button.setAttribute("image", iconUrl);
    // Some XUL/toolbar implementations look at list-style-image instead of `image`
    (button.style as unknown as CSSStyleDeclaration).setProperty(
      "list-style-image",
      `url("${iconUrl}")`
    );
    // Ensure SVG uses theme-dependent icon color (works with fill="context-fill")
    (button.style as unknown as CSSStyleDeclaration).setProperty(
      "-moz-context-properties",
      "fill, fill-opacity"
    );
    (button.style as unknown as CSSStyleDeclaration).setProperty(
      "fill",
      "currentColor"
    );
    (button.style as unknown as CSSStyleDeclaration).setProperty("fill-opacity", "1");
    // Ensure we don't render a label next to the icon
    button.setAttribute("label", "");
    button.textContent = "";
    button.style.cursor = "pointer";

    button.addEventListener("command", onClick);
    button.addEventListener("click", onClick); // Fallback for click events

    // Try to find the identifier lookup button and insert after it
    const lookupButton = doc.getElementById("zotero-tb-lookup") || 
                         doc.getElementById("zotero-tb-add") ||
                         doc.querySelector('[id*="lookup"]');
    if (lookupButton && lookupButton.parentNode) {
      lookupButton.parentNode.insertBefore(button, lookupButton.nextSibling);
      Zotero.debug(`${config.addonName}: Inserted button after lookup button`);
    } else {
      toolbar.appendChild(button);
      Zotero.debug(`${config.addonName}: Appended button to toolbar`);
    }

    Zotero.debug(`${config.addonName}: Toolbar button added successfully to ${toolbar.id}`)
  }

  /**
   * Remove toolbar button
   */
  removeToolbarButton(): void {
    const button = this.window.document.getElementById(config.ui.toolbarButtonId);
    if (button) {
      button.remove();
    }
  }

  /**
   * Add menu item to Tools menu
   */
  addMenuItem(onClick: () => void): void {
    const doc = this.window.document;
    
    Zotero.debug(`${config.addonName}: Attempting to add menu item...`);
    
    // Log all menus for debugging
    const allMenus = doc.querySelectorAll('menu, menupopup, [id*="menu"]');
    Zotero.debug(`${config.addonName}: Found ${allMenus.length} menu elements`);
    allMenus.forEach(m => Zotero.debug(`  - ${m.tagName}#${m.id}`));
    
    // Try multiple possible menu IDs for Zotero 7
    const menuIds = [
      "menu_ToolsPopup",
      "menu_Tools_Popup", 
      "toolsMenuPopup",
      "menu_EditPopup",
      "menu_FilePopup"
    ];
    let menu: Element | null = null;
    
    for (const id of menuIds) {
      menu = doc.getElementById(id);
      if (menu) {
        Zotero.debug(`${config.addonName}: Found menu: ${id}`);
        break;
      }
    }
    
    if (!menu) {
      // Try to find any menupopup
      menu = doc.querySelector('menupopup[id*="Tools"]') ||
             doc.querySelector('menupopup[id*="Edit"]');
      Zotero.debug(`${config.addonName}: Fallback menu: ${menu?.id || 'none'}`);
    }
    
    if (!menu) {
      Zotero.debug(`${config.addonName}: Could not find any suitable menu`);
      return;
    }

    if (doc.getElementById(config.ui.menuItemId)) {
      Zotero.debug(`${config.addonName}: Menu item already exists`);
      return;
    }

    const menuitem = createXULElement(doc, "menuitem") as HTMLElement;
    menuitem.id = config.ui.menuItemId;
    menuitem.setAttribute("label", "Add Items from Text...");
    menuitem.addEventListener("command", onClick);
    menuitem.addEventListener("click", onClick); // Fallback

    menu.appendChild(menuitem);
    Zotero.debug(`${config.addonName}: Menu item added successfully`);
  }

  /**
   * Remove menu item
   */
  removeMenuItem(): void {
    const menuitem = this.window.document.getElementById(config.ui.menuItemId);
    if (menuitem) {
      menuitem.remove();
    }
  }
}
