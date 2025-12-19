import type { GeminiModel } from "../types";
import { debugResponseBody } from "../utils";

export async function fetchGeminiModels(apiKey: string): Promise<GeminiModel[]> {
  if (!apiKey) {
    throw new Error("API key required to fetch models");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

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
    if (typeof data === "string") {
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

export async function makeGeminiRequest(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  const { apiKey, baseUrl, model, prompt, maxTokens } = options;

  if (!apiKey) {
    throw new Error("Gemini API key not configured. Please set it in Preferences → Add Items from Text.");
  }

  const url = `${baseUrl}/${model}:generateContent?key=${apiKey}`;

  Zotero.debug(`Add Items from Text: Making request to Gemini model ${model}`);

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: maxTokens,
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
      `Add Items from Text: API error ${status}: ${debugResponseBody(response)}`
    );

    // Create error message with status code included
    let errorMessage = `HTTP ${status}`;

    // Try to parse error details from response
    try {
      const errorData = typeof response.response === "string"
        ? JSON.parse(response.response)
        : response.response;
      if (errorData?.error?.message) {
        errorMessage = `${status}: ${errorData.error.message}`;
      }
    } catch {
      // Keep generic message with status
    }

    throw new Error(errorMessage);
  }

  // Handle successful response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = response.response;
  if (typeof data === "string") {
    data = JSON.parse(data);
  }

  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    Zotero.debug(`Add Items from Text: Invalid response format: ${JSON.stringify(data)}`);
    throw new Error("Invalid response format from Gemini API");
  }

  return data.candidates[0].content.parts[0].text;
}
