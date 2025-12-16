add-items-from-text-menuitem =
    .label = Add Items from Text...

add-items-from-text-toolbar-button =
    .label = Add from Text
    .tooltiptext = Extract references from text using AI

pref-title = Add Items from Text Settings

pref-api-key =
    .label = Gemini API Key
    
pref-api-key-description = Get your API key from aistudio.google.com/apikey

pref-model =
    .label = AI Model

pref-auto-validate =
    .label = Automatically validate extracted references

pref-show-preview =
    .label = Show preview before importing

dialog-input-title = Add Items from Text
dialog-input-description = Paste text containing literature references below. The AI will extract and convert them to Zotero items.
dialog-input-placeholder = Paste your text with references here...

dialog-preview-title = Preview References
dialog-preview-description = Found { $count } reference(s). Select which ones to import:

dialog-progress-analyzing = Analyzing text with AI...
dialog-progress-extracting = Extracting references from text...
dialog-progress-validating = Validating { $count } references...
dialog-progress-importing = Importing { $current }/{ $total }: { $title }

dialog-results-success = Successfully imported { $count } reference(s).
dialog-results-errors = { $count } reference(s) could not be imported.

error-no-api-key = A Google Gemini API key is required to use this feature.
error-no-references = Could not identify any literature references in the provided text.
error-api-failed = API request failed: { $message }
