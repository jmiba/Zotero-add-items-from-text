import { debugResponseBody, normalizeBaseUrl, requestJson } from "../utils";

export async function makeOllamaRequest(options: {
  baseUrl: string;
  model: string;
  prompt: string;
}): Promise<string> {
  const { baseUrl, model, prompt } = options;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("Ollama base URL not configured. Please set it in Preferences → Add Items from Text.");
  }
  if (!model) {
    throw new Error("Ollama model not configured. Please set it in Preferences → Add Items from Text.");
  }

  const url = `${normalizedBaseUrl}/api/chat`;
  const requestBody = {
    model,
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

  const { status, data, raw } = await requestJson("POST", url, { body: requestBody });
  if (status !== 200) {
    Zotero.debug(`Add Items from Text: Ollama API error ${status}: ${debugResponseBody(raw)}`);
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
