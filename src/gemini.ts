/**
 * LLM integration (Gemini/OpenAI-compatible/Ollama) for reference extraction
 */

import { config } from "./config";
import { PreferencesManager } from "./preferences";

export interface ExtractedReference {
  itemType: string;
  title: string;
  authors?: Array<{ firstName: string; lastName: string }>;
  date?: string;
  year?: string;
  publicationTitle?: string;
  journalAbbreviation?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  DOI?: string;
  ISBN?: string;
  ISSN?: string;
  url?: string;
  publisher?: string;
  place?: string;
  edition?: string;
  abstractNote?: string;
  language?: string;
  bookTitle?: string;
  conferenceName?: string;
  proceedingsTitle?: string;
  university?: string;
  thesisType?: string;
  series?: string;
  seriesNumber?: string;
  numberOfVolumes?: string;
  numPages?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface ExtractionResponse {
  references: ExtractedReference[];
  rawBibtex?: string;
}

// Backwards-compatible alias (the file originally only supported Gemini).
export type GeminiResponse = ExtractionResponse;

const EXTRACTION_PROMPT = `You are a bibliographic reference extraction expert. Analyze the following text and extract ALL literature references found within it.

For each reference, provide a structured JSON object with the following fields (use null for missing data):
- itemType: One of "journalArticle", "book", "bookSection", "conferencePaper", "thesis", "webpage", "report", "patent", "preprint"
- title: The title of the work
- authors: Array of objects with firstName and lastName
- date: Full publication date if available (YYYY-MM-DD format preferred)
- year: Publication year
- publicationTitle: Journal name for articles, or publisher for books
- journalAbbreviation: Abbreviated journal name if known
- volume: Volume number
- issue: Issue number
- pages: Page range (e.g., "123-145")
- DOI: Digital Object Identifier (without https://doi.org/ prefix)
- ISBN: International Standard Book Number
- ISSN: International Standard Serial Number
- url: Web URL if available
- publisher: Publisher name
- place: Place of publication
- edition: Edition number/description
- abstractNote: Abstract if provided
- language: Language of the work
- bookTitle: For book chapters, the title of the book
- conferenceName: For conference papers
- proceedingsTitle: Title of conference proceedings
- university: For theses
- thesisType: "PhD thesis", "Master's thesis", etc.

Respond with a JSON object containing:
1. "references": An array of reference objects
2. "bibtex": The same references formatted as valid BibTeX entries

Be thorough - extract every reference you can identify, even if some fields are missing. Use your knowledge to fill in standard abbreviations and correct obvious typos.

Text to analyze:
`;

const VALIDATION_PROMPT = `You are a bibliographic data validator. Review the following extracted reference data and check for:

1. COMPLETENESS: Required fields for the item type
2. ACCURACY: Common errors in author names, dates, DOIs, ISBNs
3. CONSISTENCY: Format consistency across fields
4. SUGGESTIONS: Ways to improve the data quality

For each reference, provide:
- isValid: boolean
- errors: Array of critical issues that must be fixed
- warnings: Array of potential issues that should be reviewed
- suggestions: Array of improvements that could be made

Reference data to validate:
`;

export interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

export type LLMProvider = "gemini" | "openai_compatible" | "ollama";

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

  private static stripCodeFences(text: string): string {
    // Some models wrap JSON in ```json ... ``` despite responseMimeType.
    const trimmed = text.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenceMatch ? fenceMatch[1].trim() : trimmed;
  }

  private static extractFirstJsonObject(text: string): string | null {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    return text.slice(firstBrace, lastBrace + 1);
  }

  private static repairCommonJsonIssues(text: string): string {
    // Best-effort repairs for common LLM JSON mistakes:
    // - trailing commas before ] or }
    // - missing commas between adjacent objects in arrays: }{ -> },{
    // - stray null strings: "null" (handled elsewhere, but keep JSON valid)
    let repaired = text;
    repaired = repaired.replace(/,\s*([\]}])/g, "$1");
    repaired = repaired.replace(/}\s*{/g, "},{");
    return repaired;
  }

  private static parseJsonLenient(text: string): unknown {
    const cleaned = LLMService.stripCodeFences(text);
    try {
      return JSON.parse(cleaned);
    } catch {
      // continue
    }

    const extracted = LLMService.extractFirstJsonObject(cleaned) || cleaned;
    try {
      return JSON.parse(extracted);
    } catch {
      // continue
    }

    const repaired = LLMService.repairCommonJsonIssues(extracted);
    return JSON.parse(repaired);
  }

  private static normalizeReference(ref: ExtractedReference): ExtractedReference {
    // Gemini is instructed to use `null` for missing fields, but the rest of the
    // add-on expects optional/strings. Also, Zotero uses a single `date` field
    // for display/import; if we only got a `year`, treat it as the date.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = { ...(ref as any) };

    const date = typeof r.date === "string" ? r.date.trim() : r.date;
    const year = typeof r.year === "string" ? r.year.trim() : r.year;

    if ((!date || date === "null") && year && year !== "null") {
      r.date = String(year);
    }

    if ((!year || year === "null") && date && date !== "null") {
      const match = String(date).match(/\b(\d{4})\b/);
      if (match) {
        r.year = match[1];
      }
    }

    return r as ExtractedReference;
  }

  private static debugResponseBody(response: unknown): string {
    // Zotero.HTTP.request may use XHR with responseType="json", where accessing
    // responseText can throw. Prefer the already-parsed `response` field.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyResp = response as any;
    const body = anyResp?.response;
    if (typeof body === "string") return body;
    if (body === null || body === undefined) return "";
    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  }

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

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    
    Zotero.debug("Add Items from Text: Fetching available models...");

    try {
      const response = await Zotero.HTTP.request("GET", url, {
        headers: {
          "Content-Type": "application/json",
        },
        responseType: "json",
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = response.response;
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      if (!data.models || !Array.isArray(data.models)) {
        throw new Error("Invalid response format");
      }

      // Filter to only text generation models
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textModels = data.models.filter((model: any) => {
        const methods = model.supportedGenerationMethods || [];
        return methods.includes("generateContent");
      });

      // Map to our format and sort by name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const models: GeminiModel[] = textModels.map((model: any) => ({
        name: model.name.replace("models/", ""),
        displayName: model.displayName || model.name.replace("models/", ""),
        description: model.description,
        supportedGenerationMethods: model.supportedGenerationMethods,
      }));

      // Sort: gemini models first, then by name
      models.sort((a, b) => {
        const aIsGemini = a.name.startsWith("gemini");
        const bIsGemini = b.name.startsWith("gemini");
        if (aIsGemini && !bIsGemini) return -1;
        if (!aIsGemini && bIsGemini) return 1;
        return a.name.localeCompare(b.name);
      });

      Zotero.debug(`Add Items from Text: Found ${models.length} compatible models`);
      
      return models;
    } catch (error) {
      Zotero.debug(`Add Items from Text: Error fetching models: ${error}`);
      throw error;
    }
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

  private static normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, "");
  }

  private async requestJson(
    method: "GET" | "POST",
    url: string,
    options: { headers?: Record<string, string>; body?: unknown; timeout?: number } = {}
  ): Promise<{ status: number; data: unknown; raw: unknown }> {
    const response = await Zotero.HTTP.request(method, url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      responseType: "json",
      timeout: options.timeout ?? 60000,
      successCodes: [200, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = (response as any).response;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // keep string
      }
    }
    return { status: response.status, data, raw: response };
  }

  private async makeGeminiRequest(prompt: string): Promise<string> {
    if (!this.geminiApiKey) {
      throw new Error("Gemini API key not configured. Please set it in Preferences → Add Items from Text.");
    }

    // Refresh model setting in case it changed
    this.geminiModel = PreferencesManager.get("defaultModel");
    
    const url = `${this.geminiBaseUrl}/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;
    
    Zotero.debug(`Add Items from Text: Making request to Gemini model ${this.geminiModel}`);

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: config.gemini.maxTokens,
        responseMimeType: "application/json",
      },
    };

    let response;
    try {
      response = await Zotero.HTTP.request("POST", url, {
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        responseType: "json",
        // Accept all status codes so we can handle errors ourselves
        successCodes: [200, 400, 401, 403, 404, 429, 500, 502, 503, 504],
      });
    } catch (networkError) {
      // This catches actual network failures (no internet, DNS issues, etc.)
      Zotero.debug(`Add Items from Text: Network error: ${networkError}`);
      throw new Error("Network error - please check your internet connection and try again");
    }

    // Now handle HTTP status codes
    const status = response.status;
    
    if (status !== 200) {
      Zotero.debug(
        `Add Items from Text: API error ${status}: ${LLMService.debugResponseBody(
          response
        )}`
      );
      
      // Create error message with status code included
      let errorMessage = `HTTP ${status}`;
      
      // Try to parse error details from response
      try {
        const errorData = typeof response.response === 'string' 
          ? JSON.parse(response.response) 
          : response.response;
        if (errorData?.error?.message) {
          errorMessage = `${status}: ${errorData.error.message}`;
        }
      } catch (e) {
        // Keep generic message with status
      }
      
      throw new Error(errorMessage);
    }

    // Handle successful response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = response.response;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      Zotero.debug(`Add Items from Text: Invalid response format: ${JSON.stringify(data)}`);
      throw new Error("Invalid response format from Gemini API");
    }

    return data.candidates[0].content.parts[0].text;
  }

  private async makeOpenAICompatibleRequest(prompt: string): Promise<string> {
    const baseUrl = LLMService.normalizeBaseUrl(this.openaiBaseUrl);
    if (!baseUrl) {
      throw new Error("OpenAI-compatible base URL not configured. Please set it in Preferences → Add Items from Text.");
    }
    if (!this.openaiModel) {
      throw new Error("OpenAI-compatible model not configured. Please set it in Preferences → Add Items from Text.");
    }

    const isOpenAIHosted = (() => {
      try {
        const host = new URL(baseUrl).hostname.toLowerCase();
        return host === "api.openai.com";
      } catch {
        return false;
      }
    })();

    const headers: Record<string, string> = {};
    if (this.openaiApiKey && this.openaiApiKey.trim()) {
      headers.Authorization = `Bearer ${this.openaiApiKey.trim()}`;
    }

    if (isOpenAIHosted) {
      return this.makeOpenAIResponsesRequest(baseUrl, headers, prompt);
    }

    return this.makeOpenAIChatCompletionsRequest(baseUrl, headers, prompt);
  }

  private async makeOpenAIChatCompletionsRequest(baseUrl: string, headers: Record<string, string>, prompt: string): Promise<string> {
    const url = `${baseUrl}/chat/completions`;
    const requestBody = {
      model: this.openaiModel,
      // Note: some models/endpoints reject non-default temperature values; omit unless user-configured.
      messages: [
        {
          role: "system",
          content: "Return only valid JSON. Do not wrap the response in markdown or code fences.",
        },
        { role: "user", content: prompt },
      ],
    };

    const { status, data, raw } = await this.requestJson("POST", url, { headers, body: requestBody });
    if (status !== 200) {
      Zotero.debug(`Add Items from Text: OpenAI-compatible API error ${status}: ${LLMService.debugResponseBody(raw)}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errMsg = (data as any)?.error?.message;
      throw new Error(errMsg ? `${status}: ${errMsg}` : `HTTP ${status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyData: any = data;
    const content = anyData?.choices?.[0]?.message?.content ?? anyData?.choices?.[0]?.text;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Invalid response format from OpenAI-compatible endpoint");
    }
    return content;
  }

  private async makeOpenAIResponsesRequest(baseUrl: string, headers: Record<string, string>, prompt: string): Promise<string> {
    const url = `${baseUrl}/responses`;
    const requestBody = {
      model: this.openaiModel,
      input: [
        {
          role: "system",
          content: "Return only valid JSON. Do not wrap the response in markdown or code fences.",
        },
        { role: "user", content: prompt },
      ],
      text: { format: { type: "json_object" } },
    };

    const { status, data, raw } = await this.requestJson("POST", url, { headers, body: requestBody });
    if (status !== 200) {
      Zotero.debug(`Add Items from Text: OpenAI responses API error ${status}: ${LLMService.debugResponseBody(raw)}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errMsg = (data as any)?.error?.message;
      throw new Error(errMsg ? `${status}: ${errMsg}` : `HTTP ${status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyData: any = data;
    const text = anyData?.output_text;
    if (typeof text === "string" && text.trim()) return text;

    const contentItems = anyData?.output?.[0]?.content;
    if (Array.isArray(contentItems)) {
      const isOutputTextItem = (value: unknown): value is { type: "output_text"; text: string } => {
        if (!value || typeof value !== "object") return false;
        const record = value as Record<string, unknown>;
        return record.type === "output_text" && typeof record.text === "string";
      };

      const outputText = contentItems.find(isOutputTextItem)?.text;
      if (typeof outputText === "string" && outputText.trim()) return outputText;
    }

    throw new Error("Invalid response format from OpenAI responses endpoint");
  }

  private async makeOllamaRequest(prompt: string): Promise<string> {
    const baseUrl = LLMService.normalizeBaseUrl(this.ollamaBaseUrl);
    if (!baseUrl) {
      throw new Error("Ollama base URL not configured. Please set it in Preferences → Add Items from Text.");
    }
    if (!this.ollamaModel) {
      throw new Error("Ollama model not configured. Please set it in Preferences → Add Items from Text.");
    }

    const url = `${baseUrl}/api/chat`;
    const requestBody = {
      model: this.ollamaModel,
      stream: false,
      format: "json",
      options: { temperature: 0.2 },
      messages: [
        {
          role: "system",
          content: "Return only valid JSON. Do not wrap the response in markdown or code fences.",
        },
        { role: "user", content: prompt },
      ],
    };

    const { status, data, raw } = await this.requestJson("POST", url, { body: requestBody });
    if (status !== 200) {
      Zotero.debug(`Add Items from Text: Ollama API error ${status}: ${LLMService.debugResponseBody(raw)}`);
      throw new Error(`HTTP ${status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyData: any = data;
    const content = anyData?.message?.content ?? anyData?.response;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Invalid response format from Ollama");
    }
    return content;
  }

  private async makeRequest(prompt: string): Promise<string> {
    this.updateFromPreferences();
    if (this.provider === "openai_compatible") return this.makeOpenAICompatibleRequest(prompt);
    if (this.provider === "ollama") return this.makeOllamaRequest(prompt);
    return this.makeGeminiRequest(prompt);
  }

  async extractReferences(text: string): Promise<GeminiResponse> {
    const prompt = EXTRACTION_PROMPT + text;
    const responseText = await this.makeRequest(prompt);

    try {
      const parsed = LLMService.parseJsonLenient(responseText) as {
        references?: ExtractedReference[];
        bibtex?: string;
      };
      return {
        references: (parsed.references || []).map((r) =>
          LLMService.normalizeReference(r)
        ),
        rawBibtex: parsed.bibtex,
      };
    } catch (error) {
      Zotero.logError(error as Error);
      try {
        const preview = LLMService.stripCodeFences(responseText).slice(0, 800);
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
      const parsed = LLMService.parseJsonLenient(responseText);
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
