add-items-from-text-menuitem =
    .label = Einträge aus Text hinzufügen...

add-items-from-text-toolbar-button =
    .label = Aus Text
    .tooltiptext = Referenzen aus Text mit KI extrahieren

pref-title = Einträge aus Text - Einstellungen

pref-api-key =
    .label = Gemini API-Schlüssel
    
pref-api-key-description = Holen Sie sich Ihren API-Schlüssel von aistudio.google.com/apikey

pref-model =
    .label = KI-Modell

pref-auto-validate =
    .label = Extrahierte Referenzen automatisch validieren

pref-show-preview =
    .label = Vorschau vor dem Import anzeigen

dialog-input-title = Einträge aus Text hinzufügen
dialog-input-description = Fügen Sie unten Text mit Literaturverweisen ein. Die KI extrahiert und konvertiert sie in Zotero-Einträge.
dialog-input-placeholder = Fügen Sie hier Ihren Text mit Referenzen ein...

dialog-preview-title = Referenzen-Vorschau
dialog-preview-description = { $count } Referenz(en) gefunden. Wählen Sie aus, welche importiert werden sollen:

dialog-progress-analyzing = Text wird mit KI analysiert...
dialog-progress-extracting = Referenzen werden aus Text extrahiert...
dialog-progress-validating = { $count } Referenzen werden validiert...
dialog-progress-importing = Importiere { $current }/{ $total }: { $title }

dialog-results-success = { $count } Referenz(en) erfolgreich importiert.
dialog-results-errors = { $count } Referenz(en) konnten nicht importiert werden.

error-no-api-key = Ein Google Gemini API-Schlüssel ist erforderlich, um diese Funktion zu nutzen.
error-no-references = Es konnten keine Literaturverweise im bereitgestellten Text identifiziert werden.
error-api-failed = API-Anfrage fehlgeschlagen: { $message }
