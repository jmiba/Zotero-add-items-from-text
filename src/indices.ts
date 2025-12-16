import { ExtractedReference, ValidationResult } from "./gemini";

export type IndexSource = "crossref" | "openalex" | "lobid" | "loc" | "gbv" | "wikidata";
export type IndexStatus = "validated" | "invalid" | "not_found" | "error";

export interface IndexPreferences {
  enabled: boolean;
  enrichFromIndexes: boolean;
  crossref: boolean;
  crossrefMailto?: string;
  openalex: boolean;
  openalexMailto?: string;
  lobid: boolean;
  loc: boolean;
  gbv: boolean;
  gbvSruUrl?: string;
  wikidata: boolean;
}

interface IndexMatch {
  source: IndexSource;
  status: IndexStatus;
  score: number;
  explanation: string;
  url?: string;
  patch?: Partial<ExtractedReference>;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(and|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || trimmed.toLowerCase() === "null";
  }
  return false;
}

function diceCoefficient(a: string, b: string): number {
  const s1 = normalizeText(a).replace(/\s/g, "");
  const s2 = normalizeText(b).replace(/\s/g, "");
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams.get(bg) || 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / ((s1.length - 1) + (s2.length - 1));
}

function normalizeDOI(raw?: string): string {
  if (!raw) return "";
  let doi = raw.trim();
  const lowered = doi.toLowerCase();
  for (const prefix of ["https://doi.org/", "http://doi.org/"]) {
    if (lowered.startsWith(prefix)) {
      doi = doi.slice(prefix.length);
      break;
    }
  }
  if (doi.toLowerCase().startsWith("doi:")) {
    doi = doi.slice(4);
  }
  // Prefer Zotero's canonicalizer if available
  try {
    const cleaned = Zotero?.Utilities?.cleanDOI?.(doi);
    if (typeof cleaned === "string") return cleaned;
  } catch {
    // ignore
  }
  return doi.trim();
}

function firstAuthorLastName(ref: ExtractedReference): string {
  const last = ref.authors?.[0]?.lastName || "";
  return normalizeText(last);
}

function extractYear(ref: ExtractedReference): string {
  const year = (ref.year || "").toString().trim();
  if (year && /^\d{4}$/.test(year)) return year;
  const date = (ref.date || "").toString();
  const match = date.match(/\b(\d{4})\b/);
  return match ? match[1] : "";
}

function buildValidationFromMatch(match: IndexMatch): ValidationResult {
  const prefix =
    match.source === "openalex"
      ? "OpenAlex"
      : match.source === "crossref"
        ? "Crossref"
        : match.source === "lobid"
          ? "lobid"
          : match.source === "loc"
            ? "Library of Congress"
            : match.source === "gbv"
              ? "GBV/K10Plus"
              : "Wikidata";
  const message = `${prefix}: ${match.explanation}${match.url ? ` (${match.url})` : ""}`;
  if (match.status === "invalid") {
    return { isValid: false, errors: [message], warnings: [], suggestions: [] };
  }
  if (match.status === "validated") {
    // Keep as a warning so it is visible in the preview (UI shows errors+warnings only)
    return { isValid: true, errors: [], warnings: [message], suggestions: [] };
  }
  return { isValid: true, errors: [], warnings: [message], suggestions: [] };
}

function mergeValidation(base: ValidationResult | undefined, extra: ValidationResult): ValidationResult {
  if (!base) return extra;
  return {
    isValid: base.isValid && extra.isValid,
    errors: [...(base.errors || []), ...(extra.errors || [])],
    warnings: [...(base.warnings || []), ...(extra.warnings || [])],
    suggestions: [...(base.suggestions || []), ...(extra.suggestions || [])],
  };
}

async function sleep(ms: number): Promise<void> {
  if (Zotero?.Promise?.delay) {
    await Zotero.Promise.delay(ms);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJsonWithRetry(
  url: string,
  options: {
    headers?: Record<string, string>;
    timeout?: number;
    successCodes?: number[];
  } = {},
  maxAttempts = 3
): Promise<{ status: number; data: unknown }> {
  const successCodes = options.successCodes || [200, 404, 429, 500, 502, 503, 504];
  const timeout = options.timeout ?? 30000;

  let attempt = 0;
  while (true) {
    attempt++;
    const response = await Zotero.HTTP.request("GET", url, {
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
      responseType: "json",
      timeout,
      successCodes,
    });

    const status = response.status;
    const data = (() => {
      // Zotero can return parsed JSON or a JSON string depending on internal plumbing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseAny: any = response as any;
      const body: any =
        responseAny.response !== undefined && responseAny.response !== null && responseAny.response !== ""
          ? responseAny.response
          : responseAny.responseText;
      if (typeof body === "string") {
        try {
          return JSON.parse(body);
        } catch {
          return body;
        }
      }
      return body;
    })();

    if (![429, 500, 502, 503, 504].includes(status) || attempt >= maxAttempts) {
      return { status, data };
    }

    const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
    await sleep(backoffMs);
  }
}

function scoreCandidate(
  ref: ExtractedReference,
  candidate: {
    title?: string;
    doi?: string;
    year?: string;
    firstAuthorLastName?: string;
  }
): { score: number; doiMismatch: boolean } {
  const refDoi = normalizeDOI(ref.DOI);
  const candDoi = normalizeDOI(candidate.doi);

  if (refDoi && candDoi) {
    if (refDoi === candDoi) return { score: 1, doiMismatch: false };
    return { score: 0, doiMismatch: true };
  }

  const titleScore = candidate.title ? diceCoefficient(ref.title || "", candidate.title) : 0;
  const authorScore =
    firstAuthorLastName(ref) && candidate.firstAuthorLastName
      ? firstAuthorLastName(ref) === normalizeText(candidate.firstAuthorLastName)
        ? 1
        : 0
      : 0;

  const yearScore = extractYear(ref) && candidate.year ? (extractYear(ref) === candidate.year ? 1 : 0) : 0;

  const score = 0.75 * titleScore + 0.2 * authorScore + 0.05 * yearScore;
  return { score, doiMismatch: false };
}

async function matchCrossref(ref: ExtractedReference, mailto?: string): Promise<IndexMatch> {
  const doi = normalizeDOI(ref.DOI);
  const ua = `AddItemsFromText/1.0 (${mailto ? `mailto:${mailto}` : "no-mailto"})`;

  try {
    if (doi) {
      const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
      const { status, data } = await requestJsonWithRetry(url, { headers: { "User-Agent": ua } });
      if (status === 404) {
        return { source: "crossref", status: "not_found", score: 0, explanation: "DOI not found" };
      }
      if (status !== 200) {
        return { source: "crossref", status: "error", score: 0, explanation: `request failed (HTTP ${status})` };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item: any = (data as any)?.message || {};
      const title = Array.isArray(item.title) ? item.title[0] : item.title;
      const candDoi = item.DOI;
      const candidateFirstAuthor = item.author?.[0]?.family || item.author?.[0]?.literal || "";
      const candidateYear = item.published?.["date-parts"]?.[0]?.[0]?.toString() || item.created?.["date-parts"]?.[0]?.[0]?.toString() || "";

      const { score, doiMismatch } = scoreCandidate(ref, {
        title,
        doi: candDoi,
        year: candidateYear,
        firstAuthorLastName: candidateFirstAuthor,
      });

      if (doiMismatch) {
        return {
          source: "crossref",
          status: "invalid",
          score: 0,
          explanation: `DOI resolves, but DOI mismatch (got ${candDoi})`,
          url: item.URL,
        };
      }

      if (score >= 0.8) {
        const authors: ExtractedReference["authors"] = Array.isArray(item.author)
          ? item.author
              .map((a: { given?: string; family?: string }) => ({
                firstName: a?.given || "",
                lastName: a?.family || "",
              }))
              .filter((a: { firstName: string; lastName: string }) => a.firstName || a.lastName)
          : undefined;

        const patch: Partial<ExtractedReference> = {
          title: title || ref.title,
          DOI: normalizeDOI(item.DOI) || ref.DOI,
          url: item.URL || ref.url,
          authors: authors && authors.length ? authors : ref.authors,
          publicationTitle: Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"],
          journalAbbreviation: Array.isArray(item["short-container-title"])
            ? item["short-container-title"][0]
            : item["short-container-title"],
          volume: item.volume,
          issue: item.issue,
          pages: item.page,
          ISSN: Array.isArray(item.ISSN) ? item.ISSN[0] : item.ISSN,
          ISBN: Array.isArray(item.ISBN) ? item.ISBN[0] : item.ISBN,
          publisher: item.publisher,
          year: candidateYear || ref.year,
          date: candidateYear || ref.date,
        };
        return {
          source: "crossref",
          status: "validated",
          score,
          explanation: `matched (score ${score.toFixed(2)})`,
          url: item.URL,
          patch,
        };
      }

      return {
        source: "crossref",
        status: "invalid",
        score,
        explanation: `DOI resolves, but title/author mismatch (score ${score.toFixed(2)})`,
        url: item.URL,
      };
    }

    const query = encodeURIComponent(ref.title || "");
    const url = `https://api.crossref.org/works?query.bibliographic=${query}&rows=5`;
    const { status, data } = await requestJsonWithRetry(url, { headers: { "User-Agent": ua } });
    if (status !== 200) {
      return { source: "crossref", status: "error", score: 0, explanation: `search failed (HTTP ${status})` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = (data as any)?.message?.items || [];
    if (!items.length) {
      return { source: "crossref", status: "not_found", score: 0, explanation: "no results" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let best: { item: any; score: number } | null = null;
    for (const item of items) {
      const title = Array.isArray(item.title) ? item.title[0] : item.title;
      const candidateFirstAuthor = item.author?.[0]?.family || item.author?.[0]?.literal || "";
      const candidateYear = item.published?.["date-parts"]?.[0]?.[0]?.toString() || item.created?.["date-parts"]?.[0]?.[0]?.toString() || "";
      const { score } = scoreCandidate(ref, {
        title,
        doi: item.DOI,
        year: candidateYear,
        firstAuthorLastName: candidateFirstAuthor,
      });
      if (!best || score > best.score) {
        best = { item, score };
      }
    }

    if (!best) {
      return { source: "crossref", status: "not_found", score: 0, explanation: "no usable results" };
    }

    if (best.score >= 0.8) {
      const item = best.item;
      const title = Array.isArray(item.title) ? item.title[0] : item.title;
      const candidateYear = item.published?.["date-parts"]?.[0]?.[0]?.toString() || item.created?.["date-parts"]?.[0]?.[0]?.toString() || "";

      const authors: ExtractedReference["authors"] = Array.isArray(item.author)
        ? item.author
            .map((a: { given?: string; family?: string }) => ({
              firstName: a?.given || "",
              lastName: a?.family || "",
            }))
            .filter((a: { firstName: string; lastName: string }) => a.firstName || a.lastName)
        : undefined;

      const patch: Partial<ExtractedReference> = {
        title: title || ref.title,
        DOI: normalizeDOI(item.DOI) || ref.DOI,
        url: item.URL || ref.url,
        authors: authors && authors.length ? authors : ref.authors,
        publicationTitle: Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"],
        journalAbbreviation: Array.isArray(item["short-container-title"])
          ? item["short-container-title"][0]
          : item["short-container-title"],
        volume: item.volume,
        issue: item.issue,
        pages: item.page,
        ISSN: Array.isArray(item.ISSN) ? item.ISSN[0] : item.ISSN,
        ISBN: Array.isArray(item.ISBN) ? item.ISBN[0] : item.ISBN,
        publisher: item.publisher,
        year: candidateYear || ref.year,
        date: candidateYear || ref.date,
      };
      return {
        source: "crossref",
        status: "validated",
        score: best.score,
        explanation: `matched (score ${best.score.toFixed(2)})`,
        url: item.URL,
        patch,
      };
    }

    return {
      source: "crossref",
      status: "not_found",
      score: best.score,
      explanation: `best score too low (${best.score.toFixed(2)})`,
    };
  } catch (e) {
    return { source: "crossref", status: "error", score: 0, explanation: `error: ${String(e)}` };
  }
}

async function matchOpenAlex(ref: ExtractedReference, mailto?: string): Promise<IndexMatch> {
  const doi = normalizeDOI(ref.DOI);
  const headers = { "User-Agent": "AddItemsFromText/1.0" };

  try {
    if (doi) {
      const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ""}`;
      const { status, data } = await requestJsonWithRetry(url, { headers });
      if (status === 404) {
        return { source: "openalex", status: "not_found", score: 0, explanation: "DOI not found" };
      }
      if (status !== 200) {
        return { source: "openalex", status: "error", score: 0, explanation: `request failed (HTTP ${status})` };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const work: any = data || {};
      const title = work.display_name || "";
      const candDoi = typeof work.doi === "string" ? work.doi.replace(/^https?:\/\/doi\.org\//i, "") : "";
      const candidateFirstAuthor = work.authorships?.[0]?.author?.display_name || "";
      const candidateYear = work.publication_year?.toString() || "";

      const { score, doiMismatch } = scoreCandidate(ref, {
        title,
        doi: candDoi,
        year: candidateYear,
        firstAuthorLastName: candidateFirstAuthor.split(" ").slice(-1)[0],
      });

      if (doiMismatch) {
        return {
          source: "openalex",
          status: "invalid",
          score: 0,
          explanation: `DOI resolves, but DOI mismatch (got ${candDoi})`,
          url: work.id,
        };
      }

      if (score >= 0.8) {
        const authors: ExtractedReference["authors"] = Array.isArray(work.authorships)
          ? work.authorships
              .map((a: { author?: { display_name?: string } }) => {
                const name = a?.author?.display_name || "";
                const parts = name.split(" ").filter(Boolean);
                if (!parts.length) return null;
                const lastName = parts.slice(-1)[0];
                const firstName = parts.slice(0, -1).join(" ");
                return { firstName, lastName };
              })
              .filter(Boolean)
          : undefined;

        const patch: Partial<ExtractedReference> = {
          title: title || ref.title,
          DOI: candDoi || ref.DOI,
          url: work.primary_location?.landing_page_url || ref.url,
          authors: authors && authors.length ? authors : ref.authors,
          publicationTitle: work.host_venue?.display_name || ref.publicationTitle,
          volume: work.biblio?.volume || ref.volume,
          issue: work.biblio?.issue || ref.issue,
          pages: [work.biblio?.first_page, work.biblio?.last_page].filter(Boolean).join("-") || ref.pages,
          year: candidateYear || ref.year,
          date: candidateYear || ref.date,
        };
        return {
          source: "openalex",
          status: "validated",
          score,
          explanation: `matched (score ${score.toFixed(2)})`,
          url: work.id,
          patch,
        };
      }

      return {
        source: "openalex",
        status: "invalid",
        score,
        explanation: `DOI resolves, but title/author mismatch (score ${score.toFixed(2)})`,
        url: work.id,
      };
    }

    const params = new URLSearchParams();
    params.set("search", ref.title || "");
    params.set("per-page", "5");
    const year = extractYear(ref);
    if (year) {
      params.set("filter", `from_publication_date:${year}-01-01,to_publication_date:${year}-12-31`);
    }
    if (mailto) params.set("mailto", mailto);

    const url = `https://api.openalex.org/works?${params.toString()}`;
    const { status, data } = await requestJsonWithRetry(url, { headers });
    if (status !== 200) {
      return { source: "openalex", status: "error", score: 0, explanation: `search failed (HTTP ${status})` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = (data as any)?.results || [];
    if (!results.length) {
      return { source: "openalex", status: "not_found", score: 0, explanation: "no results" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let best: { work: any; score: number } | null = null;
    for (const work of results) {
      const title = work.display_name || "";
      const candidateFirstAuthor = work.authorships?.[0]?.author?.display_name || "";
      const candidateYear = work.publication_year?.toString() || "";
      const candDoi = typeof work.doi === "string" ? work.doi.replace(/^https?:\/\/doi\.org\//i, "") : "";
      const { score } = scoreCandidate(ref, {
        title,
        doi: candDoi,
        year: candidateYear,
        firstAuthorLastName: candidateFirstAuthor.split(" ").slice(-1)[0],
      });
      if (!best || score > best.score) best = { work, score };
    }

    if (!best) return { source: "openalex", status: "not_found", score: 0, explanation: "no usable results" };

    if (best.score >= 0.8) {
      const work = best.work;
      const candidateYear = work.publication_year?.toString() || "";
      const candDoi = typeof work.doi === "string" ? work.doi.replace(/^https?:\/\/doi\.org\//i, "") : "";

      const authors: ExtractedReference["authors"] = Array.isArray(work.authorships)
        ? work.authorships
            .map((a: { author?: { display_name?: string } }) => {
              const name = a?.author?.display_name || "";
              const parts = name.split(" ").filter(Boolean);
              if (!parts.length) return null;
              const lastName = parts.slice(-1)[0];
              const firstName = parts.slice(0, -1).join(" ");
              return { firstName, lastName };
            })
            .filter(Boolean)
        : undefined;

      const patch: Partial<ExtractedReference> = {
        title: work.display_name || ref.title,
        DOI: candDoi || ref.DOI,
        url: work.primary_location?.landing_page_url || ref.url,
        authors: authors && authors.length ? authors : ref.authors,
        publicationTitle: work.host_venue?.display_name || ref.publicationTitle,
        volume: work.biblio?.volume || ref.volume,
        issue: work.biblio?.issue || ref.issue,
        pages: [work.biblio?.first_page, work.biblio?.last_page].filter(Boolean).join("-") || ref.pages,
        year: candidateYear || ref.year,
        date: candidateYear || ref.date,
      };
      return {
        source: "openalex",
        status: "validated",
        score: best.score,
        explanation: `matched (score ${best.score.toFixed(2)})`,
        url: work.id,
        patch,
      };
    }

    return { source: "openalex", status: "not_found", score: best.score, explanation: `best score too low (${best.score.toFixed(2)})` };
  } catch (e) {
    return { source: "openalex", status: "error", score: 0, explanation: `error: ${String(e)}` };
  }
}

function buildLobidQuery(title: string, authorLastName?: string): string {
  const tokens = normalizeText(title).split(" ").filter(Boolean);
  const titleParts = tokens.slice(0, 4).map((t) => `title:${t}`);
  const clauses = titleParts.length ? [`(${titleParts.join(" AND ")})`] : [];
  if (authorLastName) {
    clauses.push(`contribution.agent.label:${authorLastName}`);
  }
  return clauses.join(" AND ");
}

async function matchLobid(ref: ExtractedReference): Promise<IndexMatch> {
  try {
    const query = buildLobidQuery(ref.title || "", firstAuthorLastName(ref));
    if (!query) {
      return { source: "lobid", status: "not_found", score: 0, explanation: "missing title" };
    }
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("size", "5");
    params.set("format", "json");
    const url = `https://lobid.org/resources/search?${params.toString()}`;

    const { status, data } = await requestJsonWithRetry(url, {
      headers: { "User-Agent": "AddItemsFromText/1.0", Accept: "application/json" },
    });

    if (status !== 200) {
      return { source: "lobid", status: "error", score: 0, explanation: `search failed (HTTP ${status})` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const member: any[] = (data as any)?.member || [];
    if (!member.length) {
      return { source: "lobid", status: "not_found", score: 0, explanation: "no results" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let best: { item: any; score: number } | null = null;
    for (const item of member) {
      const title = Array.isArray(item.title) ? item.title[0] : item.title;
      const candidateYear = (() => {
        const pub = item.publication;
        const nodes = Array.isArray(pub) ? pub : pub ? [pub] : [];
        for (const p of nodes) {
          const v = p?.startDate || p?.dateStatement;
          const m = typeof v === "string" ? v.match(/\b(\d{4})\b/) : null;
          if (m) return m[1];
        }
        return "";
      })();
      const score = title ? diceCoefficient(ref.title || "", title) : 0;
      const yearScore = extractYear(ref) && candidateYear ? (extractYear(ref) === candidateYear ? 1 : 0) : 0;
      const combined = 0.9 * score + 0.1 * yearScore;
      if (!best || combined > best.score) best = { item, score: combined };
    }

    if (!best) return { source: "lobid", status: "not_found", score: 0, explanation: "no usable results" };
    if (best.score >= 0.8) {
      const item = best.item;
      const title = Array.isArray(item.title) ? item.title[0] : item.title;
      const candidateYear = (() => {
        const pub = item.publication;
        const nodes = Array.isArray(pub) ? pub : pub ? [pub] : [];
        for (const p of nodes) {
          const v = p?.startDate || p?.dateStatement;
          const m = typeof v === "string" ? v.match(/\b(\d{4})\b/) : null;
          if (m) return m[1];
        }
        return "";
      })();

      const patch: Partial<ExtractedReference> = {
        title: title || ref.title,
        year: candidateYear || ref.year,
        date: candidateYear || ref.date,
      };
      return {
        source: "lobid",
        status: "validated",
        score: best.score,
        explanation: `matched (score ${best.score.toFixed(2)})`,
        url: item.id,
        patch,
      };
    }
    return { source: "lobid", status: "not_found", score: best.score, explanation: `best score too low (${best.score.toFixed(2)})` };
  } catch (e) {
    return { source: "lobid", status: "error", score: 0, explanation: `error: ${String(e)}` };
  }
}

async function matchLoC(ref: ExtractedReference): Promise<IndexMatch> {
  try {
    // Use the general search with book filter for better coverage
    // Note: the loc.gov JSON API primarily indexes digitized/online content and may miss print-only books;
    // comprehensive LoC catalog access would require Z39.50/SRU (not implemented).
    const titleTokens = normalizeText(ref.title || "")
      .split(" ")
      .filter((t) => t.length >= 3)
      .slice(0, 6);
    
    if (!titleTokens.length) {
      return { source: "loc", status: "not_found", score: 0, explanation: "missing title" };
    }

    const surname = firstAuthorLastName(ref);
    const queryParts = [...titleTokens];
    if (surname) queryParts.push(surname);
    
    const params = new URLSearchParams();
    params.set("fo", "json");
    params.set("c", "10");
    params.set("q", queryParts.join(" "));
    // Filter to books only to avoid newspapers, videos, etc.
    params.set("fa", "original-format:book");
    
    const url = `https://www.loc.gov/search/?${params.toString()}`;

    const { status, data } = await requestJsonWithRetry(url, {
      headers: { "User-Agent": "AddItemsFromText/1.0" },
    });
    if (status !== 200) {
      return { source: "loc", status: "error", score: 0, explanation: `search failed (HTTP ${status})` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = (data as any)?.results || [];
    if (!results.length) {
      return { source: "loc", status: "not_found", score: 0, explanation: "no results" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let best: { item: any; score: number } | null = null;
    for (const item of results) {
      const title = item?.title || "";
      const contributors: string[] = Array.isArray(item?.contributor)
        ? item.contributor
        : typeof item?.contributor === "string"
          ? [item.contributor]
          : [];
      const candidateSurname = contributors.length ? contributors[0].split(",")[0] : "";
      const candidateYear = typeof item?.date === "string" ? (item.date.match(/\b(\d{4})\b/)?.[1] || "") : "";

      const { score } = scoreCandidate(ref, {
        title,
        doi: item?.doi,
        year: candidateYear,
        firstAuthorLastName: candidateSurname,
      });

      if (!best || score > best.score) best = { item, score };
    }

    if (!best) {
      return { source: "loc", status: "not_found", score: 0, explanation: "no usable results" };
    }

    if (best.score >= 0.8) {
      const item = best.item;
      const title = item?.title || ref.title;
      const candidateYear = typeof item?.date === "string" ? (item.date.match(/\b(\d{4})\b/)?.[1] || "") : "";
      const patch: Partial<ExtractedReference> = {
        title,
        year: candidateYear || ref.year,
        date: candidateYear || ref.date,
      };
      return {
        source: "loc",
        status: "validated",
        score: best.score,
        explanation: `matched (score ${best.score.toFixed(2)})`,
        url: item?.url,
        patch,
      };
    }

    return { source: "loc", status: "not_found", score: best.score, explanation: `best score too low (${best.score.toFixed(2)})` };
  } catch (e) {
    return { source: "loc", status: "error", score: 0, explanation: `error: ${String(e)}` };
  }
}

function parseSruDcRecord(xmlDoc: Document): Array<{
  title: string;
  creator: string;
  date: string;
  identifiers: string[];
  recordId?: string;
}> {
  const nsDc = "http://purl.org/dc/elements/1.1/";
  const records = Array.from(xmlDoc.getElementsByTagNameNS("*", "record"));

  const parsed: Array<{
    title: string;
    creator: string;
    date: string;
    identifiers: string[];
    recordId?: string;
  }> = [];

  for (const record of records) {
    const title = record.getElementsByTagNameNS(nsDc, "title")?.[0]?.textContent?.trim() || "";
    const creator = record.getElementsByTagNameNS(nsDc, "creator")?.[0]?.textContent?.trim() || "";
    const date = record.getElementsByTagNameNS(nsDc, "date")?.[0]?.textContent?.trim() || "";
    const identifiers = Array.from(record.getElementsByTagNameNS(nsDc, "identifier")).map((n) => (n.textContent || "").trim()).filter(Boolean);
    const recordId =
      record.getElementsByTagNameNS("http://www.loc.gov/zing/srw/", "recordIdentifier")?.[0]?.textContent?.trim() ||
      record.getElementsByTagNameNS("*", "recordIdentifier")?.[0]?.textContent?.trim() ||
      undefined;

    if (!title && !creator && !date && identifiers.length === 0) continue;
    parsed.push({ title, creator, date, identifiers, recordId });
  }

  return parsed;
}

function extractIsbnFromIdentifiers(identifiers: string[]): string {
  for (const id of identifiers) {
    const cleaned = id
      .replace(/^urn:isbn:/i, "")
      .replace(/^isbn:/i, "")
      .replace(/[^0-9Xx]/g, "");
    if (!cleaned) continue;
    try {
      const normalized = Zotero.Utilities.cleanISBN(cleaned);
      if (normalized) return normalized;
    } catch {
      // ignore
    }
  }
  return "";
}

async function matchGbvK10plus(ref: ExtractedReference, sruUrl?: string): Promise<IndexMatch> {
  const baseUrl = (sruUrl || "https://sru.k10plus.de/gvk").trim();
  try {
    // Get significant title words (filter short words, take up to 5 for AND query)
    const titleTokens = normalizeText(ref.title || "")
      .split(" ")
      .filter((t) => t.length >= 3) // Skip very short words (a, in, of, etc.)
      .slice(0, 5);
    
    if (!titleTokens.length) {
      return { source: "gbv", status: "not_found", score: 0, explanation: "missing title" };
    }

    // Build CQL query: K10plus SRU requires explicit "pica.tit=word" joined with "and"
    // Use first few significant words connected with AND for precision
    const titleClauses = titleTokens.map((t) => `pica.tit=${t}`);
    const titleQuery = titleClauses.join(" and ");
    
    const author = firstAuthorLastName(ref);
    const authorQuery = author ? ` and pica.per=${author}` : "";
    const query = `${titleQuery}${authorQuery}`;
    if (!query) {
      return { source: "gbv", status: "not_found", score: 0, explanation: "missing title" };
    }

    const params = new URLSearchParams();
    params.set("version", "1.1");
    params.set("operation", "searchRetrieve");
    params.set("query", query);
    params.set("maximumRecords", "5");
    params.set("recordSchema", "dc");

    const url = `${baseUrl}?${params.toString()}`;
    const response = await Zotero.HTTP.request("GET", url, {
      headers: { Accept: "application/xml", "User-Agent": "AddItemsFromText/1.0" },
      responseType: "text",
      timeout: 30000,
      successCodes: [200, 400, 404, 429, 500, 502, 503, 504],
    });

    if (response.status !== 200) {
      return { source: "gbv", status: "error", score: 0, explanation: `search failed (HTTP ${response.status})`, url };
    }

    const xmlText = response.responseText || response.response || "";
    if (!xmlText) {
      return { source: "gbv", status: "error", score: 0, explanation: "empty SRU response" };
    }

    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const parsed = parseSruDcRecord(doc);
    if (!parsed.length) {
      return { source: "gbv", status: "not_found", score: 0, explanation: "no results" };
    }

    let best: { item: (typeof parsed)[number]; score: number } | null = null;
    for (const item of parsed) {
      const candidateYear = item.date.match(/\b(\d{4})\b/)?.[1] || "";
      const candidateSurname = item.creator.split(",")[0] || item.creator.split(" ").slice(-1)[0] || "";
      const titleScore = diceCoefficient(ref.title || "", item.title);
      const authorScore =
        firstAuthorLastName(ref) && candidateSurname
          ? firstAuthorLastName(ref) === normalizeText(candidateSurname)
            ? 1
            : 0
          : 0;

      // The SRU Dublin Core schema is often sparse (missing reliable author/year), so
      // avoid capping strong title matches at 0.75 as in the generic scorer.
      const score = 0.9 * titleScore + 0.1 * authorScore;
      if (!best || score > best.score) best = { item, score };
    }

    if (!best) return { source: "gbv", status: "not_found", score: 0, explanation: "no usable results" };

    if (best.score >= 0.8) {
      const candidateYear = best.item.date.match(/\b(\d{4})\b/)?.[1] || "";
      const isbn = extractIsbnFromIdentifiers(best.item.identifiers);
      const patch: Partial<ExtractedReference> = {
        title: best.item.title || ref.title,
        year: candidateYear || ref.year,
        date: candidateYear || ref.date,
        ISBN: isbn || ref.ISBN,
      };
      const recordUrl = best.item.recordId ? `https://kxp.k10plus.de/DB=2.299/PPNSET?PPN=${encodeURIComponent(best.item.recordId)}` : undefined;
      return {
        source: "gbv",
        status: "validated",
        score: best.score,
        explanation: `matched (score ${best.score.toFixed(2)})`,
        url: recordUrl,
        patch,
      };
    }

    return { source: "gbv", status: "not_found", score: best.score, explanation: `best score too low (${best.score.toFixed(2)})`, url };
  } catch (e) {
    return { source: "gbv", status: "error", score: 0, explanation: `error: ${String(e)}` };
  }
}

async function matchWikidata(ref: ExtractedReference): Promise<IndexMatch> {
  const doi = normalizeDOI(ref.DOI);
  try {
    if (doi) {
      const doiLc = doi.toLowerCase();
      const sparql = `
SELECT ?work ?title ?date ?doi WHERE {
  ?work wdt:P356 ?doi .
  FILTER(LCASE(STR(?doi)) = "${doiLc}") .
  OPTIONAL { ?work wdt:P1476 ?title . }
  OPTIONAL { ?work wdt:P577 ?date . }
}
LIMIT 1
`.trim();

      const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
      const { status, data } = await requestJsonWithRetry(url, {
        headers: { "User-Agent": "AddItemsFromText/1.0", Accept: "application/sparql-results+json" },
      });
      if (status !== 200) {
        return { source: "wikidata", status: "error", score: 0, explanation: `SPARQL failed (HTTP ${status})` };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const binding = (data as any)?.results?.bindings?.[0];
      if (!binding) return { source: "wikidata", status: "not_found", score: 0, explanation: "no DOI match" };

      const title = binding.title?.value || ref.title;
      const dateVal = binding.date?.value || "";
      const candidateYear = typeof dateVal === "string" ? (dateVal.match(/\b(\d{4})\b/)?.[1] || "") : "";
      const workUrl = binding.work?.value;

      const { score } = scoreCandidate(ref, { title, doi, year: candidateYear });
      if (score >= 0.8) {
        const patch: Partial<ExtractedReference> = {
          title,
          DOI: doi,
          year: candidateYear || ref.year,
          date: candidateYear || ref.date,
        };
        return { source: "wikidata", status: "validated", score: 1, explanation: "DOI match", url: workUrl, patch };
      }
      return { source: "wikidata", status: "invalid", score, explanation: `DOI match but title mismatch (score ${score.toFixed(2)})`, url: workUrl };
    }

    // Fallback: entity search by title
    if (isBlank(ref.title)) return { source: "wikidata", status: "not_found", score: 0, explanation: "no title to search" };
    const params = new URLSearchParams();
    params.set("action", "wbsearchentities");
    params.set("format", "json");
    params.set("language", "en");
    params.set("origin", "*");
    params.set("type", "item");
    params.set("limit", "5");
    params.set("search", ref.title || "");

    const url = `https://www.wikidata.org/w/api.php?${params.toString()}`;
    const { status, data } = await requestJsonWithRetry(url, {
      headers: { "User-Agent": "AddItemsFromText/1.0" },
    });
    if (status !== 200) {
      return { source: "wikidata", status: "error", score: 0, explanation: `search failed (HTTP ${status})` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const search: any[] = (data as any)?.search || [];
    if (!search.length) return { source: "wikidata", status: "not_found", score: 0, explanation: "no results" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let best: { item: any; score: number } | null = null;
    for (const item of search) {
      const candidateTitle = item?.label || item?.display?.label?.value || "";
      const desc = item?.description || item?.display?.description?.value || "";
      const titleScore = diceCoefficient(ref.title || "", candidateTitle);
      // boost if description suggests a scholarly work
      const boost = /article|book|paper|publication|journal/i.test(desc) ? 0.05 : 0;
      const score = Math.min(1, titleScore + boost);
      if (!best || score > best.score) best = { item, score };
    }

    if (!best) return { source: "wikidata", status: "not_found", score: 0, explanation: "no usable results" };
    if (best.score >= 0.85) {
      const patch: Partial<ExtractedReference> = { title: best.item?.label || best.item?.display?.label?.value || ref.title };
      return {
        source: "wikidata",
        status: "validated",
        score: best.score,
        explanation: `matched by label (score ${best.score.toFixed(2)})`,
        url: best.item.concepturi,
        patch,
      };
    }
    return { source: "wikidata", status: "not_found", score: best.score, explanation: `best score too low (${best.score.toFixed(2)})` };
  } catch (e) {
    return { source: "wikidata", status: "error", score: 0, explanation: `error: ${String(e)}` };
  }
}

function applyPatch(
  ref: ExtractedReference,
  patch: Partial<ExtractedReference>,
  enrichFromIndexes: boolean,
  forceOverwrite: boolean
): ExtractedReference {
  if (!enrichFromIndexes) return ref;
  const merged: ExtractedReference = { ...(ref as ExtractedReference) };

  const overwriteKeys = new Set<string>([
    "title",
    "authors",
    "date",
    "year",
    "DOI",
    "url",
    "publicationTitle",
    "journalAbbreviation",
    "volume",
    "issue",
    "pages",
    "ISSN",
    "ISBN",
    "publisher",
    "place",
    "edition",
    "bookTitle",
    "conferenceName",
    "proceedingsTitle",
    "university",
    "thesisType",
    "series",
    "seriesNumber",
    "numPages",
  ]);

  for (const [key, value] of Object.entries(patch)) {
    if (isBlank(value)) continue;
    const existing = (merged as unknown as Record<string, unknown>)[key];
    if (forceOverwrite && overwriteKeys.has(key)) {
      (merged as unknown as Record<string, unknown>)[key] = value;
      continue;
    }
    if (isBlank(existing)) {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export class IndexValidationService {
  static async validateAndEnrich(
    refs: ExtractedReference[],
    prefs: IndexPreferences,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<{ references: ExtractedReference[]; validationResults: ValidationResult[] }> {
    if (!prefs.enabled) {
      return { references: refs, validationResults: refs.map(() => ({ isValid: true, errors: [], warnings: [], suggestions: [] })) };
    }

    const total = refs.length;
    const mergedRefs: ExtractedReference[] = [];
    const validations: ValidationResult[] = [];

    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      onProgress?.(i + 1, total, ref.title || `Reference ${i + 1}`);

      const matches: IndexMatch[] = [];
      if (prefs.crossref) matches.push(await matchCrossref(ref, prefs.crossrefMailto));
      if (prefs.openalex) matches.push(await matchOpenAlex(ref, prefs.openalexMailto));
      if (prefs.lobid) matches.push(await matchLobid(ref));
      if (prefs.loc) matches.push(await matchLoC(ref));
      if (prefs.gbv) matches.push(await matchGbvK10plus(ref, prefs.gbvSruUrl));
      if (prefs.wikidata) matches.push(await matchWikidata(ref));

      const best = matches
        .slice()
        .sort((a, b) => {
          const rank = (m: IndexMatch) =>
            m.status === "validated" ? 0 : m.status === "invalid" ? 1 : m.status === "not_found" ? 2 : 3;
          const ra = rank(a);
          const rb = rank(b);
          if (ra !== rb) return ra - rb;
          return b.score - a.score;
        })[0];

      let updated = ref;
      let validation: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

      for (const m of matches) {
        validation = mergeValidation(validation, buildValidationFromMatch(m));
      }

      if (best?.patch) {
        const forceOverwrite =
          prefs.enrichFromIndexes && best.status === "validated" && best.score >= 0.95;
        updated = applyPatch(updated, best.patch, prefs.enrichFromIndexes, forceOverwrite);
      }

      mergedRefs.push(updated);
      validations.push(validation);
    }

    return { references: mergedRefs, validationResults: validations };
  }
}
