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
      createElementNS: (_namespace: string, name: string) => ({
        name,
        setAttribute(key: string, value: string) {
          this[key] = value;
        },
      }),
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

test("all provider model controls accept typed model IDs", () => {
  for (const id of [
    "add-items-from-text-model",
    "add-items-from-text-openai-model",
    "add-items-from-text-ollama-model",
  ]) {
    assert.match(
      preferencesMarkup,
      new RegExp(`<html:input id="${id}"[\\s\\S]*?list="[^"]+"`),
    );
    assert.doesNotMatch(
      preferencesMarkup,
      new RegExp(`<menulist id="${id}"`),
    );
  }
});

test("refreshing suggestions preserves a custom model ID", () => {
  const { controller, elements } = loadController();
  const children: any[] = [];
  const datalist = {
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
  const input = {
    value: "vendor/custom-model",
    getAttribute: (name: string) =>
      name === "list" ? "model-suggestions" : null,
  };
  elements.set("model-suggestions", datalist);

  controller._setModelSuggestions(
    input,
    ["model-a", "model-a", "model-b"],
    "vendor/custom-model",
  );

  assert.equal(input.value, "vendor/custom-model");
  assert.deepEqual(
    children.map((child) => child.value),
    ["model-a", "model-b"],
  );
});

test("typed model IDs are persisted without a JSON configuration file", () => {
  const { controller, elements, stored } = loadController();
  const prefName = "extensions.zotero.additemsfromtext.openaiModel";
  const listeners = new Map<string, () => void>();
  const input: any = {
    value: "",
    addEventListener: (event: string, listener: () => void) =>
      listeners.set(event, listener),
  };
  elements.set("model-input", input);
  stored.set(prefName, "existing-model");

  controller._bindModelInputPreference("model-input", prefName);
  assert.equal(input.value, "existing-model");

  input.value = "  vendor/new-model  ";
  listeners.get("input")?.();
  assert.equal(stored.get(prefName), "vendor/new-model");
});
