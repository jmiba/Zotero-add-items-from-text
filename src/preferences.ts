/**
 * Preferences management for the Add Items from Text plugin
 */

import { config } from "./config";

export interface PluginPreferences {
  llmProvider: "gemini" | "openai_compatible" | "ollama";
  geminiApiKey: string;
  autoValidate: boolean;
  showPreview: boolean;
  defaultModel: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  indexValidate: boolean;
  indexEnrich: boolean;
  indexCrossref: boolean;
  crossrefMailto: string;
  indexOpenAlex: boolean;
  openAlexMailto: string;
  indexLobid: boolean;
  indexLoc: boolean;
  indexGbv: boolean;
  gbvSruUrl: string;
  indexWikidata: boolean;
}

const defaultPrefs: PluginPreferences = {
  llmProvider: "gemini",
  geminiApiKey: "",
  autoValidate: true,
  showPreview: true,
  defaultModel: "gemini-2.0-flash",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.2",
  indexValidate: true,
  indexEnrich: true,
  indexCrossref: true,
  crossrefMailto: "",
  indexOpenAlex: true,
  openAlexMailto: "",
  indexLobid: true,
  indexLoc: true,
  indexGbv: true,
  gbvSruUrl: "https://sru.k10plus.de/gvk",
  indexWikidata: true,
};

export class PreferencesManager {
  private static getPrefName(key: keyof PluginPreferences): string {
    return `${config.prefsPrefix}.${key}`;
  }

  static get<K extends keyof PluginPreferences>(key: K): PluginPreferences[K] {
    const prefName = this.getPrefName(key);
    try {
      const value = Zotero.Prefs.get(prefName, true);
      if (value === undefined || value === null) {
        return defaultPrefs[key];
      }
      return value as PluginPreferences[K];
    } catch {
      return defaultPrefs[key];
    }
  }

  static set<K extends keyof PluginPreferences>(
    key: K,
    value: PluginPreferences[K]
  ): void {
    const prefName = this.getPrefName(key);
    Zotero.Prefs.set(prefName, value, true);
  }

  static getApiKey(): string {
    const provider = this.get("llmProvider");
    if (provider === "openai_compatible") return this.get("openaiApiKey");
    if (provider === "ollama") return "";
    return this.get("geminiApiKey");
  }

  static setApiKey(apiKey: string): void {
    const provider = this.get("llmProvider");
    if (provider === "openai_compatible") {
      this.set("openaiApiKey", apiKey);
      return;
    }
    if (provider === "ollama") return;
    this.set("geminiApiKey", apiKey);
  }

  static hasApiKey(): boolean {
    const provider = this.get("llmProvider");
    if (provider === "ollama") return true;
    const key = this.getApiKey();
    return key !== undefined && key !== null && key.trim().length > 0;
  }

  static getAll(): PluginPreferences {
    return {
      llmProvider: this.get("llmProvider"),
      geminiApiKey: this.get("geminiApiKey"),
      autoValidate: this.get("autoValidate"),
      showPreview: this.get("showPreview"),
      defaultModel: this.get("defaultModel"),
      openaiBaseUrl: this.get("openaiBaseUrl"),
      openaiApiKey: this.get("openaiApiKey"),
      openaiModel: this.get("openaiModel"),
      ollamaBaseUrl: this.get("ollamaBaseUrl"),
      ollamaModel: this.get("ollamaModel"),
      indexValidate: this.get("indexValidate"),
      indexEnrich: this.get("indexEnrich"),
      indexCrossref: this.get("indexCrossref"),
      crossrefMailto: this.get("crossrefMailto"),
      indexOpenAlex: this.get("indexOpenAlex"),
      openAlexMailto: this.get("openAlexMailto"),
      indexLobid: this.get("indexLobid"),
      indexLoc: this.get("indexLoc"),
      indexGbv: this.get("indexGbv"),
      gbvSruUrl: this.get("gbvSruUrl"),
      indexWikidata: this.get("indexWikidata"),
    };
  }

  static reset(): void {
    for (const key of Object.keys(defaultPrefs) as Array<keyof PluginPreferences>) {
      this.set(key, defaultPrefs[key]);
    }
  }
}
