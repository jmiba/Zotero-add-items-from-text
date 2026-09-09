import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const preferencesScript = readFileSync(
  new URL("../addon/content/preferences.js", import.meta.url),
  "utf8",
);
const preferencesMarkup = readFileSync(
  new URL("../addon/content/preferences.xhtml", import.meta.url),
  "utf8",
);

// Gecko exposes element.children as an HTMLCollection: array-like but NOT
// iterable. Mock the same shape so tests catch for...of regressions.
function legacyCollection(items: any[]) {
  const col: any = { length: items.length };
  for (let i = 0; i < items.length; i++) col[i] = items[i];
  return col;
}

function loadController() {
  const stored = new Map<string, unknown>();
  const elements = new Map<string, any>();
  const mutationObservers: any[] = [];
  const intervalCallbacks: Array<() => void> = [];
  const context: Record<string, any> = {
    Zotero: {
      Prefs: {
        get: (name: string) => stored.get(name),
        set: (name: string, value: unknown) => stored.set(name, value),
      },
      debug: () => undefined,
    },
    document: {
      getElementById: (id: string) => elements.get(id) || null,
      createXULElement: (name: string) => {
        const attributes = new Map<string, string>();
        const listeners = new Map<string, () => void>();
        return {
          name,
          listeners,
          setAttribute(key: string, value: string) {
            attributes.set(key, value);
            (this as any)[key] = value;
          },
          getAttribute(key: string) {
            return attributes.get(key) || "";
          },
          addEventListener(event: string, listener: () => void) {
            listeners.set(event, listener);
          },
        };
      },
      createElement: (name: string) => ({ name }),
    },
    window: { addEventListener: () => undefined },
    setTimeout: () => 0,
    setInterval: (callback: () => void) => {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    },
    clearInterval: () => undefined,
    MutationObserver: class {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
        mutationObservers.push(this);
      }
      observe() {}
      disconnect() {}
    },
  };

  runInNewContext(preferencesScript, context);
  return {
    controller: context.AddItemsFromTextPrefs,
    elements,
    stored,
    mutationObservers,
    intervalCallbacks,
  };
}

test("all providers expose a detected-model dropdown and a custom model ID field", () => {
  for (const [inputId, pickerId] of [
    ["add-items-from-text-model", "add-items-from-text-model-picker"],
    ["add-items-from-text-openai-model", "add-items-from-text-openai-model-picker"],
    ["add-items-from-text-ollama-model", "add-items-from-text-ollama-model-picker"],
  ]) {
    assert.match(
      preferencesMarkup,
      new RegExp(`<html:input id="${inputId}"`),
    );
    assert.match(
      preferencesMarkup,
      new RegExp(`<menulist id="${pickerId}"`),
    );
  }
  assert.doesNotMatch(preferencesMarkup, /<html:datalist/);
  // Pane scripts load into a sandbox in Zotero 7+, so inline handlers
  // cannot reference the sandboxed controller.
  assert.doesNotMatch(preferencesMarkup, /oncommand="AddItemsFromTextPrefs\./);
});

test("refreshing detected models builds an explicit dropdown without selecting over a custom ID", () => {
  const { controller, elements } = loadController();
  const children: any[] = [];
  const menupopup = {
    get firstChild() {
      return children[0] || null;
    },
    removeChild(child: any) {
      children.splice(children.indexOf(child), 1);
    },
    appendChild(child: any) {
      children.push(child);
    },
  };
  const picker = {
    value: "previous-model",
    selectedIndex: -1,
    querySelector: (selector: string) =>
      selector === "menupopup" ? menupopup : null,
  };

  controller._setDetectedModelOptions(
    picker,
    ["model-a", "model-a", "model-b"],
    "vendor/custom-model",
  );

  assert.equal(picker.value, "");
  assert.equal(picker.selectedIndex, 0);
  assert.deepEqual(
    children.map((child) => child.value),
    ["", "model-a", "model-b"],
  );
});

test("typed model IDs are persisted without a JSON configuration file", () => {
  const { controller, elements, stored } = loadController();
  const prefName = "extensions.zotero.additemsfromtext.openaiModel";
  const listeners = new Map<string, () => void>();
  const menuChildren = [
    { getAttribute: () => "" },
    { getAttribute: () => "existing-model" },
  ];
  const picker: any = {
    value: "",
    selectedIndex: 0,
    querySelector: () => ({ children: menuChildren }),
  };
  const input: any = {
    value: "",
    addEventListener: (event: string, listener: () => void) =>
      listeners.set(event, listener),
  };
  elements.set("model-input", input);
  elements.set("model-picker", picker);
  stored.set(prefName, "existing-model");

  controller._bindModelInputPreference("model-input", prefName, "model-picker");
  assert.equal(input.value, "existing-model");
  assert.equal(picker.value, "existing-model");

  input.value = "  vendor/new-model  ";
  listeners.get("input")?.();
  assert.equal(stored.get(prefName), "vendor/new-model");
  assert.equal(picker.value, "");
  assert.equal(picker.selectedIndex, 0);
});

test("selecting a detected model copies it into the active model ID", () => {
  const { controller, elements, stored } = loadController();
  const prefName = "extensions.zotero.additemsfromtext.ollamaModel";
  const pickerListeners = new Map<string, () => void>();
  const popupListeners = new Map<string, () => void>();
  const popup = {
    addEventListener: (event: string, listener: () => void) =>
      popupListeners.set(event, listener),
  };
  const picker: any = {
    value: "detected-model:latest",
    addEventListener: (event: string, listener: () => void) =>
      pickerListeners.set(event, listener),
    querySelector: () => popup,
  };
  const input: any = { value: "custom-model" };
  elements.set("model-picker", picker);
  elements.set("model-input", input);

  controller._bindDetectedModelPicker("model-picker", "model-input", prefName);
  pickerListeners.get("command")?.();

  assert.equal(input.value, "detected-model:latest");
  assert.equal(stored.get(prefName), "detected-model:latest");
  assert.ok(popupListeners.has("command"));
});

test("a non-bubbling macOS menuitem command still applies the detected model", () => {
  const { controller, elements, stored } = loadController();
  const prefName = "extensions.zotero.additemsfromtext.openaiModel";
  const children: any[] = [];
  const popup = {
    get children() {
      return legacyCollection(children);
    },
    get firstChild() {
      return children[0] || null;
    },
    removeChild(child: any) {
      children.splice(children.indexOf(child), 1);
    },
    appendChild(child: any) {
      children.push(child);
    },
    addEventListener: () => undefined,
  };
  const picker: any = {
    value: "",
    selectedIndex: 0,
    querySelector: () => popup,
    addEventListener: () => undefined,
  };
  const input: any = { value: "custom-model" };
  elements.set("model-picker", picker);
  elements.set("model-input", input);

  controller._bindDetectedModelPicker("model-picker", "model-input", prefName);
  controller._setDetectedModelOptions(
    picker,
    ["detected-a", "detected-b"],
    "custom-model",
  );
  children[2].listeners.get("command")?.();

  assert.equal(input.value, "detected-b");
  assert.equal(stored.get(prefName), "detected-b");
});

test("menulist value attribute mutation applies the detected model", () => {
  const { controller, elements, stored, mutationObservers } = loadController();
  const prefName = "extensions.zotero.additemsfromtext.defaultModel";
  const popup = {
    children: legacyCollection([]),
    addEventListener: () => undefined,
  };
  const picker: any = {
    value: "",
    selectedIndex: 0,
    querySelector: () => popup,
    addEventListener: () => undefined,
  };
  const input: any = { value: "custom-model" };
  elements.set("model-picker", picker);
  elements.set("model-input", input);

  controller._bindDetectedModelPicker("model-picker", "model-input", prefName);
  assert.equal(mutationObservers.length, 1);

  // Gecko updates the menulist `value` attribute when the user picks an
  // item; the observer must mirror that into the Model ID field and pref.
  picker.value = "detected-x";
  mutationObservers[0].cb();

  assert.equal(input.value, "detected-x");
  assert.equal(stored.get(prefName), "detected-x");

  // An empty value (placeholder) must not clobber a custom model ID.
  picker.value = "";
  mutationObservers[0].cb();
  assert.equal(input.value, "detected-x");
});

test("cache age formatting for stale cached model lists", () => {
  const { controller } = loadController();
  assert.equal(controller._formatCacheAge(0), "");
  assert.equal(controller._formatCacheAge(Date.now() - 30 * 1000), "just now");
  assert.equal(
    controller._formatCacheAge(Date.now() - 5 * 60 * 1000),
    "5 min ago",
  );
  assert.equal(
    controller._formatCacheAge(Date.now() - 3 * 60 * 60 * 1000),
    "3 h ago",
  );
});

test("refresh buttons are bound programmatically from the pane script", () => {
  const { controller, elements } = loadController();
  let calls = 0;
  (controller as any).stubRefresh = () => {
    calls += 1;
  };
  let registrations = 0;
  const listeners: Record<string, () => void> = {};
  const button: any = {
    addEventListener: (event: string, listener: () => void) => {
      registrations += 1;
      listeners[event] = listener;
    },
  };
  elements.set("add-items-from-text-refresh-models", button);

  controller._bindRefreshButton("add-items-from-text-refresh-models", "stubRefresh");
  // A second binding must not double-bind.
  controller._bindRefreshButton("add-items-from-text-refresh-models", "stubRefresh");
  assert.equal(registrations, 1);

  listeners.command();
  assert.equal(calls, 1);
});

test("pane bindings are deferred until the pane markup exists in the DOM", () => {
  const { controller, elements, intervalCallbacks } = loadController();
  const input: any = {
    value: "",
    listeners: new Map<string, () => void>(),
    addEventListener(event: string, listener: () => void) {
      this.listeners.set(event, listener);
    },
  };
  const picker: any = {
    value: "",
    selectedIndex: 0,
    querySelector: () => ({ children: [] }),
    addEventListener: () => undefined,
  };
  elements.set("add-items-from-text-model", input);
  elements.set("add-items-from-text-model-picker", picker);

  // The script runs before Zotero imports the pane fragment, so at script
  // load time the pane root does not exist and init registers a poll.
  const initPoll = intervalCallbacks[0];
  assert.ok(initPoll, "init must poll for the pane root element");

  // Simulate Zotero importing the pane fragment, then the next poll tick.
  const root: any = { addEventListener: () => undefined };
  elements.set("add-items-from-text-prefs-container", root);
  initPoll();

  assert.ok(
    input.listeners.has("input"),
    "model input bound after pane import",
  );
  assert.equal(
    picker.__addItemsFromTextModelInputId,
    "add-items-from-text-model",
  );
});
