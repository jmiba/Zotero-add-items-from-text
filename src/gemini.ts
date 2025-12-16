/**
 * Google Gemini API integration for reference extraction
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

export interface GeminiResponse {
  references: ExtractedReference[];
  rawBibtex?: string;
}

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

export class GeminiService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

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
    const cleaned = GeminiService.stripCodeFences(text);
    try {
      return JSON.parse(cleaned);
    } catch {
      // continue
    }

    const extracted = GeminiService.extractFirstJsonObject(cleaned) || cleaned;
    try {
      return JSON.parse(extracted);
    } catch {
      // continue
    }

    const repaired = GeminiService.repairCommonJsonIssues(extracted);
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
    this.apiKey = PreferencesManager.getApiKey();
    this.baseUrl = config.gemini.baseUrl;
    this.model = PreferencesManager.get("defaultModel");
  }

  /**
   * Fetch available models from Gemini API
   */
  static async fetchAvailableModels(apiKey?: string): Promise<GeminiModel[]> {
    const key = apiKey || PreferencesManager.getApiKey();
    
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

  private async makeRequest(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Gemini API key not configured. Please set it in preferences.");
    }

    // Refresh model setting in case it changed
    this.model = PreferencesManager.get("defaultModel");
    
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    
    Zotero.debug(`Add Items from Text: Making request to ${this.baseUrl}/${this.model}`);

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
        `Add Items from Text: API error ${status}: ${GeminiService.debugResponseBody(
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

  async extractReferences(text: string): Promise<GeminiResponse> {
    const prompt = EXTRACTION_PROMPT + text;
    const responseText = await this.makeRequest(prompt);

    try {
      const parsed = GeminiService.parseJsonLenient(responseText) as {
        references?: ExtractedReference[];
        bibtex?: string;
      };
      return {
        references: (parsed.references || []).map((r) =>
          GeminiService.normalizeReference(r)
        ),
        rawBibtex: parsed.bibtex,
      };
    } catch (error) {
      Zotero.logError(error as Error);
      try {
        const preview = GeminiService.stripCodeFences(responseText).slice(0, 800);
        Zotero.debug(`Add Items from Text: JSON parse failed; response starts with: ${preview}`);
      } catch {
        // ignore
      }
      throw new Error("Failed to parse Gemini response as JSON");
    }
  }

  async validateReferences(
    references: ExtractedReference[]
  ): Promise<ValidationResult[]> {
    const prompt = VALIDATION_PROMPT + JSON.stringify(references, null, 2);
    const responseText = await this.makeRequest(prompt);

    try {
      return JSON.parse(responseText);
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
    this.apiKey = PreferencesManager.getApiKey();
  }
}
