import { debugResponseBody, normalizeBaseUrl, requestJson } from "../utils";

export async function makeOpenAICompatibleRequest(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<string> {
  const { baseUrl, apiKey, model, prompt } = options;

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("OpenAI-compatible base URL not configured. Please set it in Preferences → Add Items from Text.");
  }
  if (!model) {
    throw new Error("OpenAI-compatible model not configured. Please set it in Preferences → Add Items from Text.");
  }

  const isOpenAIHosted = (() => {
    try {
      const host = new URL(normalizedBaseUrl).hostname.toLowerCase();
      return host === "api.openai.com";
    } catch {
      return false;
    }
  })();

  const headers: Record<string, string> = {};
  if (apiKey && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  if (isOpenAIHosted) {
    return makeOpenAIResponsesRequest(normalizedBaseUrl, headers, model, prompt);
  }

  return makeOpenAIChatCompletionsRequest(normalizedBaseUrl, headers, model, prompt);
}

async function makeOpenAIChatCompletionsRequest(
  baseUrl: string,
  headers: Record<string, string>,
  model: string,
  prompt: string
): Promise<string> {
  const url = `${baseUrl}/chat/completions`;
  const requestBody = {
    model,
    // Note: some models/endpoints reject non-default temperature values; omit unless user-configured.
    messages: [
      {
        role: "system",
        content: "Return only valid JSON. Do not wrap the response in markdown or code fences.",
      },
      { role: "user", content: prompt },
    ],
  };

  const { status, data, raw } = await requestJson("POST", url, { headers, body: requestBody });
  if (status !== 200) {
    Zotero.debug(`Add Items from Text: OpenAI-compatible API error ${status}: ${debugResponseBody(raw)}`);

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

async function makeOpenAIResponsesRequest(
  baseUrl: string,
  headers: Record<string, string>,
  model: string,
  prompt: string
): Promise<string> {
  const url = `${baseUrl}/responses`;
  const requestBody = {
    model,
    input: [
      {
        role: "system",
        content: "Return only valid JSON. Do not wrap the response in markdown or code fences.",
      },
      { role: "user", content: prompt },
    ],
    text: { format: { type: "json_object" } },
  };

  const { status, data, raw } = await requestJson("POST", url, { headers, body: requestBody });
  if (status !== 200) {
    Zotero.debug(`Add Items from Text: OpenAI responses API error ${status}: ${debugResponseBody(raw)}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errMsg = (data as any)?.error?.message;
    throw new Error(errMsg ? `${status}: ${errMsg}` : `HTTP ${status}`);
  }

  const extracted = extractTextFromOpenAIResponses(data);
  if (extracted) return extracted;

  Zotero.debug(`Add Items from Text: Unexpected OpenAI responses payload: ${debugResponseBody(raw)}`);
  throw new Error("Invalid response format from OpenAI responses endpoint");
}

function extractTextFromOpenAIResponses(data: unknown): string | null {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed ? trimmed : null;
  }
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const top = record.output_text;
  if (typeof top === "string" && top.trim()) return top;

  const output = record.output;
  if (!Array.isArray(output)) return null;

  const extractFromContentArray = (content: unknown[]): string | null => {
    for (const item of content) {
      if (typeof item === "string" && item.trim()) return item;
      if (!item || typeof item !== "object") continue;
      const itemRec = item as Record<string, unknown>;
      const text = itemRec.text;
      if (typeof text === "string" && text.trim()) return text;
    }
    return null;
  };

  for (const outItem of output) {
    if (!outItem || typeof outItem !== "object") continue;
    const outRec = outItem as Record<string, unknown>;

    const itemText = outRec.output_text;
    if (typeof itemText === "string" && itemText.trim()) return itemText;

    const content = outRec.content;
    if (Array.isArray(content)) {
      const fromContent = extractFromContentArray(content);
      if (fromContent) return fromContent;
    }
  }

  return null;
}
