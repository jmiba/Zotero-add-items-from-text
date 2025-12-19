import { config } from "../config";
import { PreferencesManager } from "../preferences";
import { EXTRACTION_PROMPT, VALIDATION_PROMPT } from "./prompts";
import { fetchGeminiModels, makeGeminiRequest } from "./providers/gemini";
import { makeOllamaRequest } from "./providers/ollama";
import { makeOpenAICompatibleRequest } from "./providers/openai-compatible";
import {
  normalizeReference,
  parseJsonLenient,
  stripCodeFences,
} from "./utils";
import type {
  ExtractedReference,
  GeminiModel,
  GeminiResponse,
  LLMProvider,
  ValidationResult,
} from "./types";

export class LLMService {
  private provider: LLMProvider;

  private geminiApiKey: string;
  private geminiBaseUrl: string;
  private geminiModel: string;

  private openaiBaseUrl: string;
  private openaiApiKey: string;
  private openaiModel: string;

  private ollamaBaseUrl: string;
  private ollamaModel: string;

  constructor() {
    this.provider = "gemini";
    this.geminiApiKey = "";
    this.geminiBaseUrl = config.gemini.baseUrl;
    this.geminiModel = config.gemini.model;

    this.openaiBaseUrl = "";
    this.openaiApiKey = "";
    this.openaiModel = "";

    this.ollamaBaseUrl = "";
    this.ollamaModel = "";

    this.updateFromPreferences();
  }

  /**
   * Fetch available models from Gemini API
   */
  static async fetchAvailableModels(apiKey?: string): Promise<GeminiModel[]> {
    const key = apiKey || PreferencesManager.get("geminiApiKey");

    if (!key) {
      throw new Error("API key required to fetch models");
    }

    return fetchGeminiModels(key);
  }

  private updateFromPreferences(): void {
    this.provider = PreferencesManager.get("llmProvider");

    this.geminiApiKey = PreferencesManager.get("geminiApiKey");
    this.geminiBaseUrl = config.gemini.baseUrl;
    this.geminiModel = PreferencesManager.get("defaultModel");

    this.openaiBaseUrl = (PreferencesManager.get("openaiBaseUrl") || "").trim();
    this.openaiApiKey = PreferencesManager.get("openaiApiKey");
    this.openaiModel = (PreferencesManager.get("openaiModel") || "").trim();

    this.ollamaBaseUrl = (PreferencesManager.get("ollamaBaseUrl") || "").trim();
    this.ollamaModel = (PreferencesManager.get("ollamaModel") || "").trim();
  }

  private async makeRequest(prompt: string): Promise<string> {
    this.updateFromPreferences();
    if (this.provider === "openai_compatible") {
      return makeOpenAICompatibleRequest({
        baseUrl: this.openaiBaseUrl,
        apiKey: this.openaiApiKey,
        model: this.openaiModel,
        prompt,
      });
    }
    if (this.provider === "ollama") {
      return makeOllamaRequest({
        baseUrl: this.ollamaBaseUrl,
        model: this.ollamaModel,
        prompt,
      });
    }
    return makeGeminiRequest({
      apiKey: this.geminiApiKey,
      baseUrl: this.geminiBaseUrl,
      model: this.geminiModel,
      prompt,
      maxTokens: config.gemini.maxTokens,
    });
  }

  async extractReferences(text: string): Promise<GeminiResponse> {
    const prompt = EXTRACTION_PROMPT + text;
    const responseText = await this.makeRequest(prompt);

    try {
      const parsed = parseJsonLenient(responseText) as {
        references?: ExtractedReference[];
        bibtex?: string;
      };
      return {
        references: (parsed.references || []).map((r) => normalizeReference(r)),
        rawBibtex: parsed.bibtex,
      };
    } catch (error) {
      Zotero.logError(error as Error);
      try {
        const preview = stripCodeFences(responseText).slice(0, 800);
        Zotero.debug(`Add Items from Text: JSON parse failed; response starts with: ${preview}`);
      } catch {
        // ignore
      }
      throw new Error("Failed to parse AI response as JSON");
    }
  }

  private static coerceValidationResults(parsed: unknown): ValidationResult[] | null {
    const normalize = (value: unknown): ValidationResult => {
      if (!value || typeof value !== "object") {
        return { isValid: true, errors: [], warnings: ["Invalid validation result format"], suggestions: [] };
      }
      const record = value as Record<string, unknown>;
      const isValid = typeof record.isValid === "boolean" ? record.isValid : true;
      const asStringArray = (v: unknown): string[] =>
        Array.isArray(v) ? v.map((x) => String(x)).filter((s) => s.trim()) : [];

      return {
        isValid,
        errors: asStringArray(record.errors),
        warnings: asStringArray(record.warnings),
        suggestions: asStringArray(record.suggestions),
      };
    };

    if (Array.isArray(parsed)) {
      return parsed.map(normalize);
    }

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const candidates = [
        record.validationResults,
        record.validations,
        record.results,
        record.items,
      ];
      for (const c of candidates) {
        if (Array.isArray(c)) return c.map(normalize);
      }
    }

    return null;
  }

  async validateReferences(
    references: ExtractedReference[]
  ): Promise<ValidationResult[]> {
    const prompt = VALIDATION_PROMPT + JSON.stringify(references, null, 2);
    const responseText = await this.makeRequest(prompt);

    try {
      const parsed = parseJsonLenient(responseText);
      const results = LLMService.coerceValidationResults(parsed);
      if (results) return results;
      throw new Error("Unexpected validation response shape");
    } catch (error) {
      Zotero.logError(error as Error);
      // Return default validation if parsing fails
      return references.map(() => ({
        isValid: true,
        errors: [],
        warnings: ["Could not perform automated validation"],
        suggestions: [],
      }));
    }
  }

  updateApiKey(): void {
    this.updateFromPreferences();
  }
}
