/**
 * Preferences management for the Add Items from Text plugin
 */

import { config } from "./config";

export interface PluginPreferences {
  geminiApiKey: string;
  autoValidate: boolean;
  showPreview: boolean;
  defaultModel: string;
  indexValidate: boolean;
  indexEnrich: boolean;
  indexCrossref: boolean;
  crossrefMailto: string;
  indexOpenAlex: boolean;
  openAlexMailto: string;
  indexLobid: boolean;
}

const defaultPrefs: PluginPreferences = {
  geminiApiKey: "",
  autoValidate: true,
  showPreview: true,
  defaultModel: "gemini-2.0-flash",
  indexValidate: true,
  indexEnrich: true,
  indexCrossref: true,
  crossrefMailto: "",
  indexOpenAlex: true,
  openAlexMailto: "",
  indexLobid: true,
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
    return this.get("geminiApiKey");
  }

  static setApiKey(apiKey: string): void {
    this.set("geminiApiKey", apiKey);
  }

  static hasApiKey(): boolean {
    const key = this.getApiKey();
    return key !== undefined && key !== null && key.trim().length > 0;
  }

  static getAll(): PluginPreferences {
    return {
      geminiApiKey: this.get("geminiApiKey"),
      autoValidate: this.get("autoValidate"),
      showPreview: this.get("showPreview"),
      defaultModel: this.get("defaultModel"),
      indexValidate: this.get("indexValidate"),
      indexEnrich: this.get("indexEnrich"),
      indexCrossref: this.get("indexCrossref"),
      crossrefMailto: this.get("crossrefMailto"),
      indexOpenAlex: this.get("indexOpenAlex"),
      openAlexMailto: this.get("openAlexMailto"),
      indexLobid: this.get("indexLobid"),
    };
  }

  static reset(): void {
    for (const key of Object.keys(defaultPrefs) as Array<keyof PluginPreferences>) {
      this.set(key, defaultPrefs[key]);
    }
  }
}
