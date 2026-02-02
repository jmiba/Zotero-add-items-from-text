import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReference } from "../src/llm/utils";
import type { ExtractedReference } from "../src/llm/types";

test("normalizeReference maps book publishers from publicationTitle", () => {
  const input: ExtractedReference = {
    itemType: "book",
    title: "Example Book",
    publicationTitle: "Acme Press",
  };

  const output = normalizeReference(input);
  assert.equal(output.publisher, "Acme Press");
});

test("normalizeReference normalizes common itemType aliases", () => {
  const input: ExtractedReference = {
    itemType: "Book Chapter",
    title: "Chapter 1",
  };

  const output = normalizeReference(input);
  assert.equal(output.itemType, "bookSection");
});

test("normalizeReference fills missing date or year", () => {
  const withYear: ExtractedReference = {
    itemType: "journalArticle",
    title: "Paper A",
    year: "2021",
  };
  const withDate: ExtractedReference = {
    itemType: "journalArticle",
    title: "Paper B",
    date: "2020-05-01",
  };

  const outYear = normalizeReference(withYear);
  const outDate = normalizeReference(withDate);

  assert.equal(outYear.date, "2021");
  assert.equal(outDate.year, "2020");
});
