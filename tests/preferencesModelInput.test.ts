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

function loadController() {
  const stored = new Map<string, unknown>();
  const elements = new Map<string, any>();
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
      createXULElement: (name: string) => ({
        name,
        setAttribute(key: string, value: string) {
          this[key] = value;
        },
      }),
      createElement: (name: string) => ({ name }),
    },
    window: { addEventListener: () => undefined },
    setTimeout: () => 0,
    setInterval: () => 0,
    clearInterval: () => undefined,
  };

  runInNewContext(preferencesScript, context);
  return {
    controller: context.AddItemsFromTextPrefs,
    elements,
    stored,
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
