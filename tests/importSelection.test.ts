import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { ZoteroImportService } from "../src/import";

const globals = globalThis as unknown as Record<string, unknown>;
const originalZotero = globals.Zotero;

afterEach(() => {
  globals.Zotero = originalZotero;
});

function setPane(pane: Partial<ZoteroPane>): void {
  globals.Zotero = {
    getActiveZoteroPane: () => pane,
  };
}

test("getCurrentCollectionID uses Zotero 10's plural selection API", () => {
  setPane({
    getSelectedCollections: () => [{ id: 42 } as ZoteroCollection],
  });

  assert.equal(ZoteroImportService.getCurrentCollectionID(), 42);
});

test("getCurrentCollectionID avoids choosing an arbitrary collection", () => {
  setPane({
    getSelectedCollections: () => [
      { id: 42 } as ZoteroCollection,
      { id: 43 } as ZoteroCollection,
    ],
  });

  assert.equal(ZoteroImportService.getCurrentCollectionID(), undefined);
});

test("getCurrentCollectionID retains the Zotero 7-9 fallback", () => {
  setPane({
    getSelectedCollection: () => ({ id: 44 } as ZoteroCollection),
  });

  assert.equal(ZoteroImportService.getCurrentCollectionID(), 44);
});

test("getCurrentLibraryID uses a single Zotero 10 library selection", () => {
  setPane({
    getSelectedLibraryIDs: () => [7],
  });

  assert.equal(ZoteroImportService.getCurrentLibraryID(), 7);
});

test("getCurrentLibraryID falls back for ambiguous selections", () => {
  setPane({
    getSelectedLibraryIDs: () => [7, 8],
  });

  assert.equal(ZoteroImportService.getCurrentLibraryID(), 1);
});
