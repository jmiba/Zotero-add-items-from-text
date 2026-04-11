# Configuration

Open Zotero settings and select the "Add Items from Text" tab.

## Provider selection

Choose one provider and fill in the required fields.

### Gemini

Required: API key, model.

### OpenAI-compatible

Required: base URL, API key, model.

### Ollama

Required: base URL, model name. Use `http://localhost:11434` for a default local install.

## Validation and enrichment

You can enable optional checks against bibliographic indexes. When enabled, the add-on can validate extracted metadata and enrich missing fields from high-confidence matches.

## Source priorities

When multiple sources match, the add-on uses your configured priority order to decide which source is authoritative. Library catalogs can be placed above Crossref/OpenAlex if you prefer.

## Polite API usage

Some indexes accept a `mailto` parameter. Provide a real email so your requests are identifiable and less likely to be rate-limited.
