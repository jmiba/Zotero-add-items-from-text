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

export interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

export type LLMProvider = "gemini" | "openai_compatible" | "ollama";
