import test from "node:test";
import assert from "node:assert/strict";
import { LLMService } from "../src/llm/service";
import type { ExtractedReference, ValidationResult } from "../src/llm/types";

const refs: ExtractedReference[] = [
  { itemType: "journalArticle", title: "A" },
  { itemType: "book", title: "B" },
  { itemType: "report", title: "C" },
];

test("alignValidationResults reorders by _index when provided", () => {
  const results: Array<ValidationResult & { _index?: number }> = [
    { _index: 2, isValid: false, errors: ["e2"], warnings: [], suggestions: [] },
    { _index: 0, isValid: true, errors: [], warnings: ["w0"], suggestions: [] },
  ];

  const aligned = LLMService.alignValidationResults(refs, results);
  assert.equal(aligned.length, 3);
  assert.deepEqual(aligned[0].warnings, ["w0"]);
  assert.equal(aligned[1].isValid, true);
  assert.deepEqual(aligned[1].errors, []);
  assert.equal(aligned[2].isValid, false);
  assert.deepEqual(aligned[2].errors, ["e2"]);
});

test("alignValidationResults falls back to positional alignment", () => {
  const results: ValidationResult[] = [
    { isValid: false, errors: ["e0"], warnings: [], suggestions: [] },
  ];

  const aligned = LLMService.alignValidationResults(refs, results as Array<ValidationResult & { _index?: number }>);
  assert.equal(aligned.length, 3);
  assert.equal(aligned[0].isValid, false);
  assert.deepEqual(aligned[0].errors, ["e0"]);
  assert.equal(aligned[1].isValid, true);
  assert.deepEqual(aligned[1].errors, []);
});
