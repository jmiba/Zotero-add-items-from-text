// Default preferences for Add Items from Text plugin
pref("extensions.zotero.additemsfromtext.llmProvider", "gemini");
pref("extensions.zotero.additemsfromtext.geminiApiKey", "");
pref("extensions.zotero.additemsfromtext.defaultModel", "gemini-2.0-flash");
pref("extensions.zotero.additemsfromtext.openaiBaseUrl", "https://api.openai.com/v1");
pref("extensions.zotero.additemsfromtext.openaiApiKey", "");
pref("extensions.zotero.additemsfromtext.openaiModel", "gpt-4o-mini");
pref("extensions.zotero.additemsfromtext.ollamaBaseUrl", "http://localhost:11434");
pref("extensions.zotero.additemsfromtext.ollamaModel", "llama3.2");
pref("extensions.zotero.additemsfromtext.autoValidate", true);
pref("extensions.zotero.additemsfromtext.showPreview", true);
pref("extensions.zotero.additemsfromtext.indexValidate", true);
pref("extensions.zotero.additemsfromtext.indexEnrich", true);
pref("extensions.zotero.additemsfromtext.indexCrossref", true);
pref("extensions.zotero.additemsfromtext.crossrefMailto", "");
pref("extensions.zotero.additemsfromtext.indexOpenAlex", true);
pref("extensions.zotero.additemsfromtext.openAlexMailto", "");
pref("extensions.zotero.additemsfromtext.indexLobid", true);
pref("extensions.zotero.additemsfromtext.indexLoc", true);
pref("extensions.zotero.additemsfromtext.indexGbv", true);
pref("extensions.zotero.additemsfromtext.gbvSruUrl", "https://sru.k10plus.de/gvk");
pref("extensions.zotero.additemsfromtext.indexWikidata", true);
// When multiple sources validate a match, lower numbers are preferred.
pref("extensions.zotero.additemsfromtext.indexPriorityGbv", 1);
pref("extensions.zotero.additemsfromtext.indexPriorityLobid", 2);
pref("extensions.zotero.additemsfromtext.indexPriorityLoc", 3);
pref("extensions.zotero.additemsfromtext.indexPriorityCrossref", 4);
pref("extensions.zotero.additemsfromtext.indexPriorityOpenAlex", 5);
pref("extensions.zotero.additemsfromtext.indexPriorityWikidata", 6);
// Hidden model caches for provider settings UI (stored as JSON strings)
pref("extensions.zotero.additemsfromtext._modelCacheGemini", "{\"updatedAt\":0,\"models\":[]}");
pref("extensions.zotero.additemsfromtext._modelCacheOpenAICompatible", "{}");
pref("extensions.zotero.additemsfromtext._modelCacheOllama", "{}");
