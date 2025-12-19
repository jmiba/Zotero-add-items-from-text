/**
 * Zotero item import service - converts extracted references to Zotero items
 */

import { ExtractedReference } from "./llm";

function cleanDOI(raw: string): string {
  const trimmed = raw.trim();
  try {
    const cleaned = Zotero.Utilities.cleanDOI(trimmed);
    if (cleaned) return cleaned;
  } catch {
    // ignore
  }
  return trimmed
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

function appendExtra(item: ZoteroItem, line: string): void {
  const current = (item.getField("extra") || "").toString();
  const normalizedLine = line.trim();
  if (!normalizedLine) return;
  if (current.split(/\r?\n/).map((l) => l.trim()).includes(normalizedLine)) return;

  const next = current.trim() ? `${current.trim()}\n${normalizedLine}` : normalizedLine;
  item.setField("extra", next);
}

export class ZoteroImportService {
  /**
   * Convert extracted reference to Zotero item and save it
   */
  static async importReference(
    ref: ExtractedReference,
    collectionID?: number
  ): Promise<ZoteroItem> {
    const item = new Zotero.Item(ref.itemType);

    // Set basic fields
    if (ref.title) item.setField("title", ref.title);
    if (ref.date) item.setField("date", ref.date);
    else if (ref.year) item.setField("date", ref.year);

    // Set publication info based on item type
    switch (ref.itemType) {
      case "journalArticle":
        if (ref.publicationTitle) item.setField("publicationTitle", ref.publicationTitle);
        if (ref.journalAbbreviation) item.setField("journalAbbreviation", ref.journalAbbreviation);
        if (ref.volume) item.setField("volume", ref.volume);
        if (ref.issue) item.setField("issue", ref.issue);
        if (ref.pages) item.setField("pages", ref.pages);
        if (ref.ISSN) item.setField("ISSN", ref.ISSN);
        break;

      case "book":
        if (ref.publisher) item.setField("publisher", ref.publisher);
        if (ref.place) item.setField("place", ref.place);
        if (ref.edition) item.setField("edition", ref.edition);
        if (ref.ISBN) item.setField("ISBN", ref.ISBN);
        if (ref.numPages) item.setField("numPages", ref.numPages);
        if (ref.series) item.setField("series", ref.series);
        if (ref.seriesNumber) item.setField("seriesNumber", ref.seriesNumber);
        break;

      case "bookSection":
        if (ref.bookTitle) item.setField("bookTitle", ref.bookTitle);
        if (ref.publisher) item.setField("publisher", ref.publisher);
        if (ref.place) item.setField("place", ref.place);
        if (ref.pages) item.setField("pages", ref.pages);
        if (ref.ISBN) item.setField("ISBN", ref.ISBN);
        break;

      case "conferencePaper":
        if (ref.proceedingsTitle) item.setField("proceedingsTitle", ref.proceedingsTitle);
        if (ref.conferenceName) item.setField("conferenceName", ref.conferenceName);
        if (ref.place) item.setField("place", ref.place);
        if (ref.pages) item.setField("pages", ref.pages);
        if (ref.publisher) item.setField("publisher", ref.publisher);
        break;

      case "thesis":
        if (ref.university) item.setField("university", ref.university);
        if (ref.thesisType) item.setField("thesisType", ref.thesisType);
        if (ref.place) item.setField("place", ref.place);
        if (ref.numPages) item.setField("numPages", ref.numPages);
        break;

      case "webpage":
        if (ref.url) item.setField("url", ref.url);
        break;
    }

    // Common fields across all types
    if (ref.DOI) {
      const doi = cleanDOI(ref.DOI);
      try {
        item.setField("DOI", doi);
      } catch {
        // Books (and some other types) don't have a DOI field in Zotero.
        // Store it in Extra so the information isn't lost.
        appendExtra(item, `DOI:${doi}`);
      }
    }
    if (ref.url && ref.itemType !== "webpage") item.setField("url", ref.url);
    if (ref.abstractNote) item.setField("abstractNote", ref.abstractNote);
    if (ref.language) item.setField("language", ref.language);

    // Set creators/authors
    if (ref.authors && ref.authors.length > 0) {
      const creators = ref.authors.map((author) => ({
        firstName: author.firstName || "",
        lastName: author.lastName || "",
        creatorType: "author",
      }));
      item.setCreators(creators);
    }

    // Save the item
    await item.saveTx();

    // Add to collection if specified
    if (collectionID) {
      item.addToCollection(collectionID);
      await item.saveTx();
    }

    return item;
  }

  /**
   * Import multiple references
   */
  static async importReferences(
    refs: ExtractedReference[],
    collectionID?: number,
    onProgress?: (current: number, total: number, title: string) => void
  ): Promise<{ imported: ZoteroItem[]; errors: Array<{ ref: ExtractedReference; error: Error }> }> {
    const imported: ZoteroItem[] = [];
    const errors: Array<{ ref: ExtractedReference; error: Error }> = [];

    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      try {
        if (onProgress) {
          onProgress(i + 1, refs.length, ref.title || "Unknown");
        }
        const item = await this.importReference(ref, collectionID);
        imported.push(item);
      } catch (error) {
        Zotero.logError(error as Error);
        errors.push({ ref, error: error as Error });
      }
    }

    return { imported, errors };
  }

  /**
   * Get the current collection ID from Zotero pane
   */
  static getCurrentCollectionID(): number | undefined {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      const collection = zoteroPane?.getSelectedCollection();
      return collection?.id;
    } catch {
      return undefined;
    }
  }

  /**
   * Get the current library ID
   */
  static getCurrentLibraryID(): number {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      return zoteroPane?.getSelectedLibraryID() || 1;
    } catch {
      return 1;
    }
  }
}
