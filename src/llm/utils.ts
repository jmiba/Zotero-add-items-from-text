import type { ExtractedReference } from "./types";

export function stripCodeFences(text: string): string {
  // Some models wrap JSON in ```json ... ``` despite responseMimeType.
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export function extractFirstJsonObject(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

export function repairCommonJsonIssues(text: string): string {
  // Best-effort repairs for common LLM JSON mistakes:
  // - trailing commas before ] or }
  // - missing commas between adjacent objects in arrays: }{ -> },{
  // - stray null strings: "null" (handled elsewhere, but keep JSON valid)
  let repaired = text;
  repaired = repaired.replace(/,\s*([\]}])/g, "$1");
  repaired = repaired.replace(/}\s*{/g, "},{");
  return repaired;
}

export function parseJsonLenient(text: string): unknown {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  const extracted = extractFirstJsonObject(cleaned) || cleaned;
  try {
    return JSON.parse(extracted);
  } catch {
    // continue
  }

  const repaired = repairCommonJsonIssues(extracted);
  return JSON.parse(repaired);
}

export function normalizeReference(ref: ExtractedReference): ExtractedReference {
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

export function debugResponseBody(response: unknown): string {
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

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function requestJson(
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
