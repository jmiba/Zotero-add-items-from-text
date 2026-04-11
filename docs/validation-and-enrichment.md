# Validation and enrichment

The plugin can run two kinds of checks after extraction: AI validation and index validation.

## AI validation

If enabled, the configured AI provider reviews the extracted references and may return validation notes or corrections. This is useful when the input text is noisy or incomplete.

## Index validation

If enabled, the add-on checks extracted metadata against bibliographic indexes. Supported sources include Crossref, OpenAlex, lobid (hbz catalog), Library of Congress, GBV/K10Plus (SRU), and Wikidata.

## Enrichment behavior

When a match has very high confidence, the add-on can fill or overwrite missing fields to align with the authoritative record. This includes author lists.

## Source priorities

If multiple sources validate a match, your priority order determines which source wins. This lets you prefer library catalogs over Crossref or OpenAlex when both match.
