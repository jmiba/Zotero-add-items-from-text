/**
 * BibTeX generation and parsing utilities
 */

import { ExtractedReference } from "./llm";

const ITEM_TYPE_BIBTEX_MAP: Record<string, string> = {
  journalArticle: "article",
  book: "book",
  bookSection: "incollection",
  conferencePaper: "inproceedings",
  thesis: "phdthesis",
  webpage: "misc",
  report: "techreport",
  patent: "misc",
  preprint: "unpublished",
};

const BIBTEX_ITEM_TYPE_MAP: Record<string, string> = {
  article: "journalArticle",
  book: "book",
  incollection: "bookSection",
  inbook: "bookSection",
  inproceedings: "conferencePaper",
  conference: "conferencePaper",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  techreport: "report",
  misc: "document",
  unpublished: "manuscript",
  proceedings: "book",
  manual: "document",
  booklet: "document",
};

export class BibtexService {
  /**
   * Generate a BibTeX citation key from reference data
   */
  static generateCiteKey(ref: ExtractedReference): string {
    const authorPart =
      ref.authors?.[0]?.lastName?.toLowerCase().replace(/[^a-z]/g, "") || "unknown";
    const yearPart = ref.year || ref.date?.substring(0, 4) || "nodate";
    const titleWord =
      ref.title
        ?.split(/\s+/)[0]
        ?.toLowerCase()
        .replace(/[^a-z]/g, "") || "";

    return `${authorPart}${yearPart}${titleWord}`;
  }

  /**
   * Escape special characters for BibTeX
   */
  static escapeForBibtex(str: string | undefined | null): string {
    if (!str) return "";
    return str
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/[&]/g, "\\&")
      .replace(/[%]/g, "\\%")
      .replace(/[$]/g, "\\$")
      .replace(/[#]/g, "\\#")
      .replace(/[_]/g, "\\_")
      .replace(/[{]/g, "\\{")
      .replace(/[}]/g, "\\}")
      .replace(/[~]/g, "\\textasciitilde{}")
      .replace(/[\^]/g, "\\textasciicircum{}");
  }

  /**
   * Format authors for BibTeX
   */
  static formatAuthors(
    authors: Array<{ firstName: string; lastName: string }> | undefined
  ): string {
    if (!authors || authors.length === 0) return "";
    return authors
      .map((a) => {
        const lastName = this.escapeForBibtex(a.lastName);
        const firstName = this.escapeForBibtex(a.firstName);
        if (firstName && lastName) {
          return `${lastName}, ${firstName}`;
        }
        return lastName || firstName;
      })
      .join(" and ");
  }

  /**
   * Convert extracted reference to BibTeX format
   */
  static toBibtex(ref: ExtractedReference): string {
    const bibtexType = ITEM_TYPE_BIBTEX_MAP[ref.itemType] || "misc";
    const citeKey = this.generateCiteKey(ref);
    const fields: string[] = [];

    // Add standard fields
    if (ref.authors && ref.authors.length > 0) {
      fields.push(`  author = {${this.formatAuthors(ref.authors)}}`);
    }
    if (ref.title) {
      fields.push(`  title = {${this.escapeForBibtex(ref.title)}}`);
    }
    if (ref.year) {
      fields.push(`  year = {${ref.year}}`);
    } else if (ref.date) {
      fields.push(`  year = {${ref.date.substring(0, 4)}}`);
    }

    // Item-type specific fields
    switch (ref.itemType) {
      case "journalArticle":
        if (ref.publicationTitle) {
          fields.push(`  journal = {${this.escapeForBibtex(ref.publicationTitle)}}`);
        }
        if (ref.volume) fields.push(`  volume = {${ref.volume}}`);
        if (ref.issue) fields.push(`  number = {${ref.issue}}`);
        if (ref.pages) fields.push(`  pages = {${ref.pages.replace("-", "--")}}`);
        break;

      case "book":
        if (ref.publisher) {
          fields.push(`  publisher = {${this.escapeForBibtex(ref.publisher)}}`);
        }
        if (ref.place) {
          fields.push(`  address = {${this.escapeForBibtex(ref.place)}}`);
        }
        if (ref.edition) {
          fields.push(`  edition = {${this.escapeForBibtex(ref.edition)}}`);
        }
        break;

      case "bookSection":
        if (ref.bookTitle) {
          fields.push(`  booktitle = {${this.escapeForBibtex(ref.bookTitle)}}`);
        }
        if (ref.publisher) {
          fields.push(`  publisher = {${this.escapeForBibtex(ref.publisher)}}`);
        }
        if (ref.pages) fields.push(`  pages = {${ref.pages.replace("-", "--")}}`);
        break;

      case "conferencePaper":
        if (ref.proceedingsTitle) {
          fields.push(`  booktitle = {${this.escapeForBibtex(ref.proceedingsTitle)}}`);
        } else if (ref.conferenceName) {
          fields.push(`  booktitle = {${this.escapeForBibtex(ref.conferenceName)}}`);
        }
        if (ref.pages) fields.push(`  pages = {${ref.pages.replace("-", "--")}}`);
        break;

      case "thesis":
        if (ref.university) {
          fields.push(`  school = {${this.escapeForBibtex(ref.university)}}`);
        }
        if (ref.thesisType) {
          fields.push(`  type = {${this.escapeForBibtex(ref.thesisType)}}`);
        }
        break;
    }

    // Common optional fields
    if (ref.DOI) fields.push(`  doi = {${ref.DOI}}`);
    if (ref.ISBN) fields.push(`  isbn = {${ref.ISBN}}`);
    if (ref.ISSN) fields.push(`  issn = {${ref.ISSN}}`);
    if (ref.url) fields.push(`  url = {${ref.url}}`);
    if (ref.abstractNote) {
      fields.push(`  abstract = {${this.escapeForBibtex(ref.abstractNote)}}`);
    }
    if (ref.language) {
      fields.push(`  language = {${this.escapeForBibtex(ref.language)}}`);
    }

    return `@${bibtexType}{${citeKey},\n${fields.join(",\n")}\n}`;
  }

  /**
   * Convert array of references to BibTeX
   */
  static referencesToBibtex(refs: ExtractedReference[]): string {
    return refs.map((ref) => this.toBibtex(ref)).join("\n\n");
  }

  /**
   * Parse BibTeX string to extract entries (basic parser)
   */
  static parseBibtex(bibtex: string): ExtractedReference[] {
    const entries: ExtractedReference[] = [];
    const entryRegex = /@(\w+)\s*\{([^,]+),\s*([\s\S]*?)\n\}/g;
    let match;

    while ((match = entryRegex.exec(bibtex)) !== null) {
      const [, type, , body] = match;
      const zoteroType = BIBTEX_ITEM_TYPE_MAP[type.toLowerCase()] || "document";
      const fields = this.parseFields(body);

      const ref: ExtractedReference = {
        itemType: zoteroType,
        title: fields.title || "",
      };

      // Parse authors
      if (fields.author) {
        ref.authors = this.parseAuthors(fields.author);
      }

      // Map fields
      if (fields.year) ref.year = fields.year;
      if (fields.journal) ref.publicationTitle = fields.journal;
      if (fields.booktitle) ref.bookTitle = fields.booktitle;
      if (fields.volume) ref.volume = fields.volume;
      if (fields.number) ref.issue = fields.number;
      if (fields.pages) ref.pages = fields.pages.replace("--", "-");
      if (fields.doi) ref.DOI = fields.doi;
      if (fields.isbn) ref.ISBN = fields.isbn;
      if (fields.issn) ref.ISSN = fields.issn;
      if (fields.url) ref.url = fields.url;
      if (fields.publisher) ref.publisher = fields.publisher;
      if (fields.address) ref.place = fields.address;
      if (fields.edition) ref.edition = fields.edition;
      if (fields.abstract) ref.abstractNote = fields.abstract;
      if (fields.school) ref.university = fields.school;

      entries.push(ref);
    }

    return entries;
  }

  /**
   * Parse BibTeX field values
   */
  private static parseFields(body: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const fieldRegex = /(\w+)\s*=\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let fieldMatch;

    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const [, key, value] = fieldMatch;
      fields[key.toLowerCase()] = this.unescapeBibtex(value.trim());
    }

    return fields;
  }

  /**
   * Parse BibTeX author string
   */
  private static parseAuthors(
    authorStr: string
  ): Array<{ firstName: string; lastName: string }> {
    return authorStr.split(" and ").map((author) => {
      const parts = author.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        return { lastName: parts[0], firstName: parts[1] };
      }
      // Handle "First Last" format
      const nameParts = author.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        return {
          firstName: nameParts.slice(0, -1).join(" "),
          lastName: nameParts[nameParts.length - 1],
        };
      }
      return { firstName: "", lastName: author.trim() };
    });
  }

  /**
   * Unescape BibTeX special characters
   */
  private static unescapeBibtex(str: string): string {
    return str
      .replace(/\\textbackslash\{\}/g, "\\")
      .replace(/\\&/g, "&")
      .replace(/\\%/g, "%")
      .replace(/\\\$/g, "$")
      .replace(/\\#/g, "#")
      .replace(/\\_/g, "_")
      .replace(/\\\{/g, "{")
      .replace(/\\\}/g, "}")
      .replace(/\\textasciitilde\{\}/g, "~")
      .replace(/\\textasciicircum\{\}/g, "^");
  }
}
