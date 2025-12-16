# Zotero Add Items from Text - Plugin

This is a Zotero 7 plugin that allows users to paste unstructured text containing literature references, analyze them with Google Gemini API, convert to BibTeX format, and import into the current collection.

## Project Structure

- `src/` - TypeScript source files
- `addon/` - Plugin assets (locales, icons, preferences)
- `build/` - Build output (generated)
- `manifest.json` - Plugin manifest for Zotero 7
- `bootstrap.js` - Plugin bootstrap entry point

## Development

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. The built plugin will be in `build/` directory

## Configuration

The plugin requires a Google Gemini API key which can be configured in:
Zotero Preferences → Add Items from Text

## Key Features

- Toolbar button next to identifier wand
- Text input dialog for pasting references
- Gemini API integration for reference extraction
- BibTeX conversion and validation
- Automatic import to current collection
