// Preferences script for Add Items from Text plugin

var AddItemsFromTextPrefs = {
  _cachePrefGemini: 'extensions.zotero.additemsfromtext._modelCacheGemini',
  _cachePrefOpenAI: 'extensions.zotero.additemsfromtext._modelCacheOpenAICompatible',
  _cachePrefOllama: 'extensions.zotero.additemsfromtext._modelCacheOllama',

  _normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  },

  _coerceStringArray(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    const seen = new Set();
    for (const v of value) {
      const s = String(v || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  },

  _readJsonPref(prefName, fallback) {
    try {
      const raw = Zotero.Prefs.get(prefName, true);
      if (raw === undefined || raw === null || raw === "" || raw === "undefined") return fallback;
      if (typeof raw === "string") return JSON.parse(raw);
      if (typeof raw === "object") {
        // Sometimes preference APIs return wrapped strings (e.g., nsISupportsString)
        const maybeData = raw && (raw.data || raw.string || raw.value);
        if (typeof maybeData === "string") return JSON.parse(maybeData);
        if (raw && typeof raw.toString === "function") {
          const asString = raw.toString();
          if (typeof asString === "string" && asString !== "[object Object]") {
            return JSON.parse(asString);
          }
        }
        // Fall back to the object itself if it already looks like parsed JSON
        return raw;
      }
      return JSON.parse(String(raw));
    } catch (e) {
      return fallback;
    }
  },

  _writeJsonPref(prefName, value) {
    try {
      Zotero.Prefs.set(prefName, JSON.stringify(value), true);
    } catch (e) {
      // ignore
    }
  },

  _saveGeminiModelCache(models) {
    const list = this._coerceStringArray(models);
    this._writeJsonPref(this._cachePrefGemini, { updatedAt: Date.now(), models: list });
  },

  _saveOpenAIModelCache(baseUrl, models) {
    const key = this._normalizeBaseUrl(baseUrl);
    if (!key) return;
    const list = this._coerceStringArray(models);
    const cache = this._readJsonPref(this._cachePrefOpenAI, {});
    cache[key] = { updatedAt: Date.now(), models: list };
    this._writeJsonPref(this._cachePrefOpenAI, cache);
  },

  _saveOllamaModelCache(baseUrl, models) {
    const key = this._normalizeBaseUrl(baseUrl);
    if (!key) return;
    const list = this._coerceStringArray(models);
    const cache = this._readJsonPref(this._cachePrefOllama, {});
    cache[key] = { updatedAt: Date.now(), models: list };
    this._writeJsonPref(this._cachePrefOllama, cache);
  },

  loadCachedModelLists() {
    try {
      // Gemini
      const geminiCache = this._readJsonPref(this._cachePrefGemini, null);
      const geminiModels = this._coerceStringArray(geminiCache?.models);
      const geminiModelList = document.getElementById('add-items-from-text-model');
      const geminiStatus = document.getElementById('add-items-from-text-model-status');
      if (geminiModelList && geminiModels.length) {
        const current = Zotero.Prefs.get('extensions.zotero.additemsfromtext.defaultModel', true) || 'gemini-2.0-flash';
        this._setMenulistOptions(geminiModelList, geminiModels, current);
        if (geminiStatus) {
          geminiStatus.value = 'Loaded cached models (' + geminiModels.length + ')';
          geminiStatus.style.color = '#666';
        }
      }

      // OpenAI-compatible (keyed by baseUrl)
      const openaiBaseUrlInput = document.getElementById('add-items-from-text-openai-base-url');
      const openaiBaseUrl = this._normalizeBaseUrl(
        openaiBaseUrlInput?.value || Zotero.Prefs.get('extensions.zotero.additemsfromtext.openaiBaseUrl', true) || ''
      );
      const openaiCache = this._readJsonPref(this._cachePrefOpenAI, {});
      const openaiModels = this._coerceStringArray(openaiCache?.[openaiBaseUrl]?.models);
      const openaiModelList = document.getElementById('add-items-from-text-openai-model');
      const openaiStatus = document.getElementById('add-items-from-text-openai-model-status');
      if (openaiModelList && openaiModels.length) {
        const filtered = this._filterLikelyLlmModelIds(openaiModels);
        const current = Zotero.Prefs.get('extensions.zotero.additemsfromtext.openaiModel', true) || '';
        this._setMenulistOptions(openaiModelList, filtered, current);
        if (openaiStatus) {
          openaiStatus.value = 'Loaded cached models (' + filtered.length + ')';
          openaiStatus.style.color = '#666';
        }
      }

      // Ollama (keyed by baseUrl)
      const ollamaBaseUrlInput = document.getElementById('add-items-from-text-ollama-base-url');
      const ollamaBaseUrl = this._normalizeBaseUrl(
        ollamaBaseUrlInput?.value || Zotero.Prefs.get('extensions.zotero.additemsfromtext.ollamaBaseUrl', true) || ''
      );
      const ollamaCache = this._readJsonPref(this._cachePrefOllama, {});
      const ollamaModels = this._coerceStringArray(ollamaCache?.[ollamaBaseUrl]?.models);
      const ollamaModelList = document.getElementById('add-items-from-text-ollama-model');
      const ollamaStatus = document.getElementById('add-items-from-text-ollama-model-status');
      if (ollamaModelList && ollamaModels.length) {
        const filtered = ollamaModels.filter((n) => !/(embed|embedding)/i.test(String(n)));
        const current = Zotero.Prefs.get('extensions.zotero.additemsfromtext.ollamaModel', true) || '';
        this._setMenulistOptions(ollamaModelList, filtered, current);
        if (ollamaStatus) {
          ollamaStatus.value = 'Loaded cached models (' + filtered.length + ')';
          ollamaStatus.style.color = '#666';
        }
      }
    } catch (e) {
      // ignore
    }
  },

  _getMenulistValue(menulist) {
    if (!menulist) return '';
    try {
      if (menulist.value) return menulist.value;
    } catch (e) {
      // ignore
    }
    try {
      const selected = menulist.selectedItem;
      const v = selected && selected.getAttribute && selected.getAttribute('value');
      if (v) return v;
    } catch (e) {
      // ignore
    }
    try {
      const popup = menulist.querySelector && menulist.querySelector('menupopup');
      if (popup && popup.querySelector) {
        const selected = popup.querySelector('menuitem[selected="true"], menuitem[checked="true"], [selected="true"], [checked="true"]');
        const v = selected && selected.getAttribute && selected.getAttribute('value');
        if (v) return v;
      }
    } catch (e) {
      // ignore
    }
    try {
      const v = menulist.getAttribute && menulist.getAttribute('value');
      if (v) return v;
    } catch (e) {
      // ignore
    }
    return '';
  },

  ensureDefaults() {
    const defaults = {
      'extensions.zotero.additemsfromtext.llmProvider': 'gemini',
      'extensions.zotero.additemsfromtext.openaiBaseUrl': 'https://api.openai.com/v1',
      'extensions.zotero.additemsfromtext.openaiModel': 'gpt-4o-mini',
      'extensions.zotero.additemsfromtext.ollamaBaseUrl': 'http://localhost:11434',
      'extensions.zotero.additemsfromtext.ollamaModel': 'llama3.2',
      'extensions.zotero.additemsfromtext.indexLoc': true,
      'extensions.zotero.additemsfromtext.indexGbv': true,
      'extensions.zotero.additemsfromtext.gbvSruUrl': 'https://sru.k10plus.de/gvk',
      'extensions.zotero.additemsfromtext.indexWikidata': true,
      [this._cachePrefGemini]: '{"updatedAt":0,"models":[]}',
      [this._cachePrefOpenAI]: '{}',
      [this._cachePrefOllama]: '{}',
    };

    for (const [pref, value] of Object.entries(defaults)) {
      const current = Zotero.Prefs.get(pref, true);
      if (current === undefined || current === null || current === "undefined") {
        Zotero.Prefs.set(pref, value, true);
      }
    }

    // If the preference binding ended up writing the string "undefined" into the input, fix it.
    const gbvInput = document.getElementById('add-items-from-text-gbv-sru-url');
    if (gbvInput && (gbvInput.value === "undefined" || gbvInput.value === "")) {
      gbvInput.value = Zotero.Prefs.get('extensions.zotero.additemsfromtext.gbvSruUrl', true) || defaults['extensions.zotero.additemsfromtext.gbvSruUrl'];
    }
  },

  _setHidden(el, hidden) {
    if (!el) return;
    try {
      if (hidden) {
        el.setAttribute('hidden', 'true');
      } else {
        el.removeAttribute('hidden');
      }
    } catch (e) {
      // ignore
    }
  },

  _setMenulistOptions(menulist, values, currentValue) {
    if (!menulist) return;
    const menupopup = menulist.querySelector('menupopup');
    if (!menupopup) return;

    while (menupopup.firstChild) {
      menupopup.removeChild(menupopup.firstChild);
    }

    const createMenuItem = (label, value) => {
      try {
        const item = document.createXULElement('menuitem');
        item.setAttribute('label', label);
        item.setAttribute('value', value);
        return item;
      } catch (e) {
        const item = document.createElement('menuitem');
        item.setAttribute('label', label);
        item.setAttribute('value', value);
        return item;
      }
    };

    const unique = [];
    const seen = new Set();
    for (const v of values || []) {
      if (!v || seen.has(v)) continue;
      seen.add(v);
      unique.push(v);
    }

    const maybeCurrent = (currentValue || '').trim();
    if (maybeCurrent && !seen.has(maybeCurrent)) {
      menupopup.appendChild(createMenuItem(maybeCurrent, maybeCurrent));
      seen.add(maybeCurrent);
    }

    for (const v of unique) {
      menupopup.appendChild(createMenuItem(v, v));
    }

    // Preserve selection if possible; otherwise select first item.
    const selected = maybeCurrent && seen.has(maybeCurrent) ? maybeCurrent : unique[0] || maybeCurrent || '';
    if (selected) {
      try {
        menulist.value = selected;
      } catch (e) {
        // ignore
      }
    }
  },

  _ensureMenulistHasValue(menulist, value) {
    const v = String(value || '').trim();
    if (!menulist || !v) return;
    const menupopup = menulist.querySelector && menulist.querySelector('menupopup');
    if (!menupopup) return;
    try {
      let found = false;
      try {
        for (const child of menupopup.children || []) {
          if (child && child.getAttribute && child.getAttribute('value') === v) {
            found = true;
            break;
          }
        }
      } catch (e) {
        // ignore
      }
      if (!found) {
        const item = document.createXULElement ? document.createXULElement('menuitem') : document.createElement('menuitem');
        item.setAttribute('label', v);
        item.setAttribute('value', v);
        menupopup.appendChild(item);
      }
      try {
        menulist.value = v;
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore
    }
  },

  _bindMenulistPreference(menulistId, prefName) {
    const menulist = document.getElementById(menulistId);
    if (!menulist) return;

    // Avoid binding multiple times if init() is called repeatedly.
    try {
      if (menulist.__addItemsFromTextPrefBound === prefName) return;
      menulist.__addItemsFromTextPrefBound = prefName;
    } catch (e) {
      // ignore
    }

    const loadFromPref = () => {
      try {
        const v = Zotero.Prefs.get(prefName, true);
        if (v !== undefined && v !== null && v !== "undefined" && String(v).trim()) {
          menulist.value = String(v);
        }
      } catch (e) {
        // ignore
      }
    };

    const saveToPref = () => {
      const v = this._getMenulistValue(menulist);
      if (!v) return;
      try {
        Zotero.Prefs.set(prefName, v, true);
      } catch (e) {
        // ignore
      }
    };

    loadFromPref();
    // If the saved value isn't present in the default menu, add it so the selection isn't blank.
    try {
      const v = Zotero.Prefs.get(prefName, true);
      if (v !== undefined && v !== null && v !== "undefined") {
        this._ensureMenulistHasValue(menulist, v);
      }
    } catch (e) {
      // ignore
    }
    // Persist selection changes explicitly (some panes don't auto-bind menulist -> pref).
    menulist.addEventListener('command', saveToPref);
    menulist.addEventListener('change', saveToPref);
    try {
      const popup = menulist.querySelector('menupopup');
      if (popup) popup.addEventListener('command', saveToPref);
    } catch (e) {
      // ignore
    }
    // Ensure pref is set even if the current value comes from default menu items.
    saveToPref();
  },

  _filterLikelyLlmModelIds(ids) {
    const deny = /(embedding|embed|whisper|transcrib|tts|audio|dall[- ]?e|image|vision|moderation|rerank|realtime)/i;
    return (ids || []).map(String).filter((s) => s && !deny.test(s));
  },

  updateProviderVisibility() {
    const providerList = document.getElementById('add-items-from-text-llm-provider');
    const provider = this._getMenulistValue(providerList) || Zotero.Prefs.get('extensions.zotero.additemsfromtext.llmProvider', true) || 'gemini';

    const geminiBox = document.getElementById('add-items-from-text-provider-gemini');
    const openaiBox = document.getElementById('add-items-from-text-provider-openai');
    const ollamaBox = document.getElementById('add-items-from-text-provider-ollama');

    this._setHidden(geminiBox, provider !== 'gemini');
    this._setHidden(openaiBox, provider !== 'openai_compatible');
    this._setHidden(ollamaBox, provider !== 'ollama');
  },

  async refreshModels() {
    const providerList = document.getElementById('add-items-from-text-llm-provider');
    const provider = this._getMenulistValue(providerList) || Zotero.Prefs.get('extensions.zotero.additemsfromtext.llmProvider', true) || 'gemini';
    if (provider !== 'gemini') {
      const statusLabel = document.getElementById('add-items-from-text-model-status');
      if (statusLabel) {
        statusLabel.value = 'Model refresh is only available for Gemini';
        statusLabel.style.color = '#666';
      }
      return;
    }

    const apiKeyInput = document.getElementById('add-items-from-text-api-key');
    const modelList = document.getElementById('add-items-from-text-model');
    const refreshBtn = document.getElementById('add-items-from-text-refresh-models');
    const statusLabel = document.getElementById('add-items-from-text-model-status');
    
    const apiKey = apiKeyInput?.value || Zotero.Prefs.get('extensions.zotero.additemsfromtext.geminiApiKey', true);
    
    if (!apiKey) {
      statusLabel.value = 'Please enter an API key first';
      statusLabel.style.color = '#cc0000';
      return;
    }
    
    refreshBtn.disabled = true;
    statusLabel.value = 'Loading models...';
    statusLabel.style.color = '#666';
    
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
      const response = await Zotero.HTTP.request('GET', url, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'json'
      });
      
      if (response.status !== 200) {
        throw new Error('API request failed: ' + response.status);
      }
      
      let data = response.response;
      if (typeof data === 'string') data = JSON.parse(data);
      
      if (!data.models) throw new Error('No models returned');
      
      // Filter to LLM text generation models only
      // Exclude: embedding models, TTS, vision-only, robotics, etc.
      const textModels = data.models.filter(m => {
        const name = m.name.replace('models/', '');
        const methods = m.supportedGenerationMethods || [];
        
        // Must support generateContent
        if (!methods.includes('generateContent')) return false;
        
        // Exclude non-LLM models by name patterns
        if (name.includes('embedding')) return false;
        if (name.includes('-tts')) return false;
        if (name.includes('imagen')) return false;
        if (name.includes('robotics')) return false;
        if (name.includes('aqa')) return false;  // Attributed QA
        if (name.includes('native-audio')) return false;
        
        // Only include gemini models (the actual LLMs)
        if (!name.startsWith('gemini-') && !name.startsWith('gemma-')) return false;
        
        // Exclude gemma models (smaller, less suitable for reference extraction)
        if (name.startsWith('gemma-')) return false;
        
        return true;
      });
      
      // Sort: gemini-2.0 first, then gemini-2.5, then others
      textModels.sort((a, b) => {
        const aName = a.name.replace('models/', '');
        const bName = b.name.replace('models/', '');
        const aScore = aName.includes('2.0') ? 0 : aName.includes('2.5') ? 1 : aName.includes('gemini') ? 2 : 3;
        const bScore = bName.includes('2.0') ? 0 : bName.includes('2.5') ? 1 : bName.includes('gemini') ? 2 : 3;
        if (aScore !== bScore) return aScore - bScore;
        return aName.localeCompare(bName);
      });
      
      // Clear and rebuild menu
      const currentModel = Zotero.Prefs.get('extensions.zotero.additemsfromtext.defaultModel', true) || 'gemini-2.0-flash';
      const values = textModels.map(m => m.name.replace('models/', '')).filter(Boolean);
      this._setMenulistOptions(modelList, values, currentModel);
      this._saveGeminiModelCache(values);
      
      statusLabel.value = 'Found ' + textModels.length + ' models';
      statusLabel.style.color = '#008800';
      
    } catch (e) {
      Zotero.debug('Add Items from Text: Error refreshing models: ' + e);
      statusLabel.value = 'Error: ' + (e.message || 'Failed to load');
      statusLabel.style.color = '#cc0000';
    } finally {
      refreshBtn.disabled = false;
    }
  }
};

AddItemsFromTextPrefs.refreshOpenAIModels = async function refreshOpenAIModels() {
  const providerList = document.getElementById('add-items-from-text-llm-provider');
  const provider = this._getMenulistValue(providerList) || Zotero.Prefs.get('extensions.zotero.additemsfromtext.llmProvider', true) || 'gemini';
  if (provider !== 'openai_compatible') return;

  const baseUrlInput = document.getElementById('add-items-from-text-openai-base-url');
  const apiKeyInput = document.getElementById('add-items-from-text-openai-api-key');
  const modelList = document.getElementById('add-items-from-text-openai-model');
  const refreshBtn = document.getElementById('add-items-from-text-refresh-openai-models');
  const statusLabel = document.getElementById('add-items-from-text-openai-model-status');

  const baseUrl = (baseUrlInput?.value || Zotero.Prefs.get('extensions.zotero.additemsfromtext.openaiBaseUrl', true) || '').replace(/\/+$/, '');
  const apiKey = (apiKeyInput?.value || Zotero.Prefs.get('extensions.zotero.additemsfromtext.openaiApiKey', true) || '').trim();

  if (!baseUrl) {
    statusLabel.value = 'Please enter a Base URL first';
    statusLabel.style.color = '#cc0000';
    return;
  }

  refreshBtn.disabled = true;
  statusLabel.value = 'Loading models...';
  statusLabel.style.color = '#666';

  try {
    const url = baseUrl + '/models';
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

    const response = await Zotero.HTTP.request('GET', url, {
      headers,
      responseType: 'json',
      successCodes: [200, 400, 401, 403, 404, 429, 500, 502, 503, 504],
    });

    if (response.status !== 200) {
      throw new Error('API request failed: ' + response.status);
    }

    let data = response.response;
    if (typeof data === 'string') data = JSON.parse(data);

    const models = Array.isArray(data?.data) ? data.data : [];
    const allIds = models.map(m => m?.id).filter(Boolean);
    const ids = this._filterLikelyLlmModelIds(allIds);
    const currentModel = Zotero.Prefs.get('extensions.zotero.additemsfromtext.openaiModel', true) || '';
    this._setMenulistOptions(modelList, ids, currentModel);
    this._saveOpenAIModelCache(baseUrl, ids);

    statusLabel.value = 'Found ' + ids.length + ' models';
    statusLabel.style.color = '#008800';
  } catch (e) {
    Zotero.debug('Add Items from Text: Error refreshing OpenAI-compatible models: ' + e);
    statusLabel.value = 'Error: ' + (e.message || 'Failed to load');
    statusLabel.style.color = '#cc0000';
  } finally {
    refreshBtn.disabled = false;
  }
};

AddItemsFromTextPrefs.refreshOllamaModels = async function refreshOllamaModels() {
  const providerList = document.getElementById('add-items-from-text-llm-provider');
  const provider = this._getMenulistValue(providerList) || Zotero.Prefs.get('extensions.zotero.additemsfromtext.llmProvider', true) || 'gemini';
  if (provider !== 'ollama') return;

  const baseUrlInput = document.getElementById('add-items-from-text-ollama-base-url');
  const modelList = document.getElementById('add-items-from-text-ollama-model');
  const refreshBtn = document.getElementById('add-items-from-text-refresh-ollama-models');
  const statusLabel = document.getElementById('add-items-from-text-ollama-model-status');

  const baseUrl = (baseUrlInput?.value || Zotero.Prefs.get('extensions.zotero.additemsfromtext.ollamaBaseUrl', true) || '').replace(/\/+$/, '');

  if (!baseUrl) {
    statusLabel.value = 'Please enter a Base URL first';
    statusLabel.style.color = '#cc0000';
    return;
  }

  refreshBtn.disabled = true;
  statusLabel.value = 'Loading models...';
  statusLabel.style.color = '#666';

  try {
    const url = baseUrl + '/api/tags';
    const response = await Zotero.HTTP.request('GET', url, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'json',
      successCodes: [200, 400, 404, 429, 500, 502, 503, 504],
    });

    if (response.status !== 200) {
      throw new Error('API request failed: ' + response.status);
    }

    let data = response.response;
    if (typeof data === 'string') data = JSON.parse(data);

    const models = Array.isArray(data?.models) ? data.models : [];
    const allNames = models.map(m => m?.name).filter(Boolean);
    // Drop common embedding-only models
    const names = allNames.filter((n) => !/(embed|embedding)/i.test(String(n)));
    const currentModel = Zotero.Prefs.get('extensions.zotero.additemsfromtext.ollamaModel', true) || '';
    this._setMenulistOptions(modelList, names, currentModel);
    this._saveOllamaModelCache(baseUrl, names);

    statusLabel.value = 'Found ' + names.length + ' models';
    statusLabel.style.color = '#008800';
  } catch (e) {
    Zotero.debug('Add Items from Text: Error refreshing Ollama models: ' + e);
    statusLabel.value = 'Error: ' + (e.message || 'Failed to load');
    statusLabel.style.color = '#cc0000';
  } finally {
    refreshBtn.disabled = false;
  }
};

AddItemsFromTextPrefs.init = function init() {
  try {
    this.ensureDefaults();
    this.loadCachedModelLists();
    this.updateProviderVisibility();

    // Preference bindings can apply after script execution; retry a few times.
    setTimeout(() => this.updateProviderVisibility(), 0);
    setTimeout(() => this.updateProviderVisibility(), 50);
    setTimeout(() => this.updateProviderVisibility(), 250);
    // Cached model lists may depend on bound input values; retry after bindings settle.
    setTimeout(() => this.loadCachedModelLists(), 0);
    setTimeout(() => this.loadCachedModelLists(), 250);

    const providerList = document.getElementById('add-items-from-text-llm-provider');
    if (providerList) {
      const onProviderChange = () => {
        // Persist provider choice (some preference panes don't reliably bind menulist -> pref).
        try {
          const v = this._getMenulistValue(providerList);
          if (v) Zotero.Prefs.set('extensions.zotero.additemsfromtext.llmProvider', v, true);
        } catch (e) {
          // ignore
        }
        this.updateProviderVisibility();
        this.loadCachedModelLists();
      };

      try {
        if (!providerList.__addItemsFromTextProviderListenerBound) {
          providerList.__addItemsFromTextProviderListenerBound = true;
          providerList.addEventListener('command', onProviderChange);
          providerList.addEventListener('change', onProviderChange);
          const popup = providerList.querySelector && providerList.querySelector('menupopup');
          if (popup) popup.addEventListener('command', onProviderChange);
        }
      } catch (e) {
        // ignore
      }
    }

    this._bindMenulistPreference('add-items-from-text-model', 'extensions.zotero.additemsfromtext.defaultModel');
    this._bindMenulistPreference('add-items-from-text-openai-model', 'extensions.zotero.additemsfromtext.openaiModel');
    this._bindMenulistPreference('add-items-from-text-ollama-model', 'extensions.zotero.additemsfromtext.ollamaModel');

    // Some preference panes apply the bound preference without firing DOM events.
    // Keep the UI in sync by watching the underlying pref while the pane is open.
    if (this._providerWatchTimer) {
      clearInterval(this._providerWatchTimer);
      this._providerWatchTimer = null;
    }
    this._lastProviderValue = null;
    this._providerWatchTimer = setInterval(() => {
      try {
        const v = Zotero.Prefs.get('extensions.zotero.additemsfromtext.llmProvider', true) || 'gemini';
        if (v !== this._lastProviderValue) {
          this._lastProviderValue = v;
          this.updateProviderVisibility();
          this.loadCachedModelLists();
        }
      } catch (e) {
        // ignore
      }
    }, 200);

    window.addEventListener('unload', () => {
      try {
        if (this._providerWatchTimer) clearInterval(this._providerWatchTimer);
        this._providerWatchTimer = null;
      } catch (e) {
        // ignore
      }
    }, { once: true });
  } catch (e) {
    Zotero.debug('Add Items from Text: Error initializing defaults: ' + e);
  }
};

try {
  // Run immediately in case the document is already loaded when this script is injected.
  AddItemsFromTextPrefs.init();
} catch (e) {
  // ignore
}

window.addEventListener('load', () => {
  try {
    AddItemsFromTextPrefs.init();
  } catch (e) {
    // ignore
  }
});
