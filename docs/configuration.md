# Configuration

Open Zotero settings and select the "Add Items from Text" tab.

## Provider selection

Choose one provider and fill in the required fields.

The **Detected** dropdown lists models reported by the configured provider. Use
**Refresh Models** to update that list, then select an entry to copy it into the
active **Model ID** field. You can also enter any supported model ID directly;
discovery is optional and never replaces a custom value.

### Gemini

Required: API key, model ID.

### OpenAI-compatible

Required: base URL, API key (when required by the endpoint), model ID.

### Ollama

Required: base URL, model name. Use `http://localhost:11434` for a default local install.

## Validation and enrichment

You can enable optional checks against bibliographic indexes. When enabled, the add-on can validate extracted metadata and enrich missing fields from high-confidence matches.

## Source priorities

When multiple sources match, the add-on uses your configured priority order to decide which source is authoritative. Library catalogs can be placed above Crossref/OpenAlex if you prefer.

## Polite API usage

Some indexes accept a `mailto` parameter. Provide a real email so your requests are identifiable and less likely to be rate-limited.
