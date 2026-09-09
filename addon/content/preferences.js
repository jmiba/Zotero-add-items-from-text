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

  _formatCacheAge(updatedAt) {
    const ms = Number(updatedAt);
    if (!ms || Number.isNaN(ms) || ms <= 0) return '';
    const age = Date.now() - ms;
    if (age < 90 * 1000) return 'just now';
    const minutes = Math.floor(age / 60000);
    if (minutes < 60) return minutes + ' min ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' h ago';
    return Math.floor(hours / 24) + ' d ago';
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
      const geminiModelInput = document.getElementById('add-items-from-text-model');
      const geminiModelPicker = document.getElementById('add-items-from-text-model-picker');
      const geminiStatus = document.getElementById('add-items-from-text-model-status');
      if (geminiModelPicker && geminiModels.length) {
        const current = Zotero.Prefs.get('extensions.zotero.additemsfromtext.defaultModel', true) || 'gemini-2.0-flash';
        this._setDetectedModelOptions(geminiModelPicker, geminiModels, current);
        if (geminiModelInput && !String(geminiModelInput.value || '').trim()) {
          geminiModelInput.value = current;
        }
        if (geminiStatus) {
          const age = this._formatCacheAge(geminiCache && geminiCache.updatedAt);
          geminiStatus.value = 'Loaded ' + geminiModels.length + ' cached models' + (age ? ' (' + age + ')' : '');
          geminiStatus.style.color = '#666';
        }
      } else if (geminiModelPicker && geminiStatus) {
        geminiStatus.value = 'No cached models yet — press Refresh Models to detect them';
        geminiStatus.style.color = '#666';
      }

      // OpenAI-compatible (keyed by baseUrl)
      const openaiBaseUrlInput = document.getElementById('add-items-from-text-openai-base-url');
      const openaiBaseUrl = this._normalizeBaseUrl(
        openaiBaseUrlInput?.value || Zotero.Prefs.get('extensions.zotero.additemsfromtext.openaiBaseUrl', true) || ''
      );
      const openaiCache = this._readJsonPref(this._cachePrefOpenAI, {});
      const openaiModels = this._coerceStringArray(openaiCache?.[openaiBaseUrl]?.models);
      const openaiModelInput = document.getElementById('add-items-from-text-openai-model');
      const openaiModelPicker = document.getElementById('add-items-from-text-openai-model-picker');
      const openaiStatus = document.getElementById('add-items-from-text-openai-model-status');
      if (openaiModelPicker && openaiModels.length) {
        const current = Zotero.Prefs.get('extensions.zotero.additemsfromtext.openaiModel', true) || '';
        this._setDetectedModelOptions(openaiModelPicker, openaiModels, current);
        if (openaiModelInput && !String(openaiModelInput.value || '').trim()) {
          openaiModelInput.value = current;
        }
        if (openaiStatus) {
          const age = this._formatCacheAge(openaiCache && openaiBaseUrl && openaiCache[openaiBaseUrl] && openaiCache[openaiBaseUrl].updatedAt);
          openaiStatus.value = 'Loaded ' + openaiModels.length + ' cached models' + (age ? ' (' + age + ')' : '');
          openaiStatus.style.color = '#666';
        }
      } else if (openaiModelPicker && openaiStatus) {
        openaiStatus.value = 'No cached models yet — press Refresh Models to detect them';
        openaiStatus.style.color = '#666';
      }

      // Ollama (keyed by baseUrl)
      const ollamaBaseUrlInput = document.getElementById('add-items-from-text-ollama-base-url');
      const ollamaBaseUrl = this._normalizeBaseUrl(
        ollamaBaseUrlInput?.value || Zotero.Prefs.get('extensions.zotero.additemsfromtext.ollamaBaseUrl', true) || ''
      );
      const ollamaCache = this._readJsonPref(this._cachePrefOllama, {});
      const ollamaModels = this._coerceStringArray(ollamaCache?.[ollamaBaseUrl]?.models);
      const ollamaModelInput = document.getElementById('add-items-from-text-ollama-model');
      const ollamaModelPicker = document.getElementById('add-items-from-text-ollama-model-picker');
      const ollamaStatus = document.getElementById('add-items-from-text-ollama-model-status');
      if (ollamaModelPicker && ollamaModels.length) {
        const current = Zotero.Prefs.get('extensions.zotero.additemsfromtext.ollamaModel', true) || '';
        this._setDetectedModelOptions(ollamaModelPicker, ollamaModels, current);
        if (ollamaModelInput && !String(ollamaModelInput.value || '').trim()) {
          ollamaModelInput.value = current;
        }
        if (ollamaStatus) {
          const age = this._formatCacheAge(ollamaCache && ollamaBaseUrl && ollamaCache[ollamaBaseUrl] && ollamaCache[ollamaBaseUrl].updatedAt);
          ollamaStatus.value = 'Loaded ' + ollamaModels.length + ' cached models' + (age ? ' (' + age + ')' : '');
          ollamaStatus.style.color = '#666';
        }
      } else if (ollamaModelPicker && ollamaStatus) {
        ollamaStatus.value = 'No cached models yet — press Refresh Models to detect them';
        ollamaStatus.style.color = '#666';
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
      'extensions.zotero.additemsfromtext.indexPriorityGbv': 1,
      'extensions.zotero.additemsfromtext.indexPriorityLobid': 2,
      'extensions.zotero.additemsfromtext.indexPriorityLoc': 3,
      'extensions.zotero.additemsfromtext.indexPriorityCrossref': 4,
      'extensions.zotero.additemsfromtext.indexPriorityOpenAlex': 5,
      'extensions.zotero.additemsfromtext.indexPriorityWikidata': 6,
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

  _setDetectedModelOptions(picker, values, currentValue) {
    if (!picker) return;
    const menupopup = picker.querySelector && picker.querySelector('menupopup');
    if (!menupopup) return;

    while (menupopup.firstChild) {
      menupopup.removeChild(menupopup.firstChild);
    }

    const createMenuItem = (label, value, disabled) => {
      const item = document.createXULElement
        ? document.createXULElement('menuitem')
        : document.createElement('menuitem');
      item.setAttribute('label', label);
      item.setAttribute('value', value);
      if (disabled) item.setAttribute('disabled', 'true');
      return item;
    };

    menupopup.appendChild(createMenuItem('Select a detected model…', '', true));
    const unique = this._coerceStringArray(values);
    for (const value of unique) {
      menupopup.appendChild(createMenuItem(value, value, false));
    }
    this._bindDetectedModelItems(picker);

    // Reflect the active model only if it was actually detected. Otherwise leave
    // the picker on its placeholder and preserve the custom Model ID field.
    const current = String(currentValue || '').trim();
    const detectedIndex = current ? unique.indexOf(current) : -1;
    try {
      picker.selectedIndex = detectedIndex >= 0 ? detectedIndex + 1 : 0;
      picker.value = detectedIndex >= 0 ? current : '';
    } catch (e) {
      // ignore
    }
  },

  _selectDetectedModelValue(picker, value) {
    if (!picker) return;
    const v = String(value || '').trim();
    const menupopup = picker.querySelector && picker.querySelector('menupopup');
    if (!menupopup) return;
    let selectedIndex = 0;
    try {
      const children = Array.from(menupopup.children || []);
      const matchIndex = children.findIndex((child) =>
        child && child.getAttribute && child.getAttribute('value') === v
      );
      if (matchIndex >= 1) selectedIndex = matchIndex;
      picker.selectedIndex = selectedIndex;
      picker.value = selectedIndex >= 1 ? v : '';
    } catch (e) {
      // ignore
    }
  },

  _applyDetectedModelValue(picker, value) {
    const v = String(value || '').trim();
    const inputId = picker && picker.__addItemsFromTextModelInputId;
    const prefName = picker && picker.__addItemsFromTextModelPrefName;
    const input = inputId && document.getElementById(inputId);
    if (!v || !input || !prefName) return;
    if (String(input.value || '').trim() === v) return;
    input.value = v;
    try {
      Zotero.Prefs.set(prefName, v, true);
    } catch (e) {
      // ignore
    }
  },

  _bindDetectedModelItems(picker) {
    if (!picker || !picker.__addItemsFromTextModelInputId) return;
    const popup = picker.querySelector && picker.querySelector('menupopup');
    if (!popup) return;
    try {
      // Gecko exposes element.children as a non-iterable HTMLCollection, so
      // Array.from is required (for...of throws TypeError there).
      const items = Array.from(popup.children || []);
      for (const item of items) {
        const value = item && item.getAttribute && item.getAttribute('value');
        if (!value || !item.addEventListener || item.__addItemsFromTextModelItemBound) continue;
        item.__addItemsFromTextModelItemBound = true;
        item.addEventListener('command', () => {
          this._applyDetectedModelValue(picker, item.getAttribute('value'));
        });
      }
    } catch (e) {
      // ignore
    }
  },

  _observeDetectedModelValue(picker) {
    if (!picker || !picker.__addItemsFromTextModelInputId) return;
    try {
      if (picker.__addItemsFromTextValueObserverBound) return;
      if (typeof MutationObserver === 'undefined') return;
      picker.__addItemsFromTextValueObserverBound = true;
      // Gecko updates the menulist `value` attribute on user selection (the
      // same mechanism that drives `preference=`-bound menulists), so a
      // mutation observer is the most reliable cross-platform selection
      // signal, independent of command event bubbling or dispatch order.
      const observer = new MutationObserver(() => {
        this._applyDetectedModelValue(picker, this._getMenulistValue(picker));
      });
      observer.observe(picker, { attributes: true, attributeFilter: ['value'] });
      picker.__addItemsFromTextValueObserver = observer;
      if (!this._modelValueObservers) this._modelValueObservers = [];
      this._modelValueObservers.push(observer);
    } catch (e) {
      // ignore
    }
  },

  _bindRefreshButton(buttonId, methodName) {
    const button = document.getElementById(buttonId);
    if (!button || !button.addEventListener) return;
    try {
      if (button.__addItemsFromTextRefreshBound) return;
      button.__addItemsFromTextRefreshBound = true;
    } catch (e) {
      // ignore
    }
    // Bind programmatically: Zotero 7+ loads pane scripts into a sandboxed
    // scope, so inline oncommand handlers in the pane markup (which run in
    // the preferences window's scope) cannot see AddItemsFromTextPrefs.
    button.addEventListener('command', () => {
      try {
        this[methodName]();
      } catch (e) {
        Zotero.debug('Add Items from Text: Error running ' + methodName + ': ' + e);
      }
    });
  },

  _cleanup() {
    try {
      if (this._initPollTimer) clearInterval(this._initPollTimer);
    } catch (e) {
      // ignore
    }
    this._initPollTimer = null;
    try {
      if (this._providerWatchTimer) clearInterval(this._providerWatchTimer);
    } catch (e) {
      // ignore
    }
    this._providerWatchTimer = null;
    try {
      for (const observer of this._modelValueObservers || []) {
        try { observer.disconnect(); } catch (err) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
    this._modelValueObservers = null;
  },

  _bindModelInputPreference(inputId, prefName, pickerId) {
    const input = document.getElementById(inputId);
    const picker = document.getElementById(pickerId);
    if (!input) return;

    // Avoid binding multiple times if init() is called repeatedly.
    try {
      if (input.__addItemsFromTextPrefBound === prefName) return;
      input.__addItemsFromTextPrefBound = prefName;
    } catch (e) {
      // ignore
    }

    const loadFromPref = () => {
      try {
        const v = Zotero.Prefs.get(prefName, true);
        if (v !== undefined && v !== null && v !== "undefined" && String(v).trim()) {
          input.value = String(v);
        }
      } catch (e) {
        // ignore
      }
    };

    const saveToPref = () => {
      const v = String(input.value || '').trim();
      if (!v) return;
      try {
        Zotero.Prefs.set(prefName, v, true);
        this._selectDetectedModelValue(picker, v);
      } catch (e) {
        // ignore
      }
    };

    loadFromPref();
    // Persist typed values and keep the detected-model picker in sync.
    input.addEventListener('input', saveToPref);
    input.addEventListener('change', saveToPref);
    saveToPref();
  },

  _bindDetectedModelPicker(pickerId, inputId, prefName) {
    const picker = document.getElementById(pickerId);
    const input = document.getElementById(inputId);
    if (!picker || !input) return;

    try {
      if (picker.__addItemsFromTextModelPickerBound === prefName) return;
      picker.__addItemsFromTextModelPickerBound = prefName;
      picker.__addItemsFromTextModelInputId = inputId;
      picker.__addItemsFromTextModelPrefName = prefName;
    } catch (e) {
      // ignore
    }

    const applySelection = () => {
      const value = this._getMenulistValue(picker);
      this._applyDetectedModelValue(picker, value);
    };

    // Watch the menulist `value` attribute as the primary selection path
    // (works on macOS even when command events do not bubble).
    this._observeDetectedModelValue(picker);
    // Bind the actual items as well: on some Zotero/Gecko builds the
    // menuitem command event is the only signal that reaches the handler.
    this._bindDetectedModelItems(picker);
    // Keep parent listeners as additional fallbacks.
    picker.addEventListener('command', applySelection);
    picker.addEventListener('change', applySelection);
    try {
      const popup = picker.querySelector('menupopup');
      if (popup) popup.addEventListener('command', applySelection);
    } catch (e) {
      // ignore
    }
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
    const modelPicker = document.getElementById('add-items-from-text-model-picker');
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
      
      // The API capability is authoritative. Do not hide compatible model IDs by name.
      const textModels = data.models.filter(m => {
        const methods = m.supportedGenerationMethods || [];
        return methods.includes('generateContent');
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
      this._setDetectedModelOptions(modelPicker, values, currentModel);
      this._saveGeminiModelCache(values);
      
      if (values.length) {
        statusLabel.value = 'Refreshed ' + values.length + ' detected models';
        statusLabel.style.color = '#008800';
      } else {
        statusLabel.value = 'Server reported no models';
        statusLabel.style.color = '#666';
      }
      
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
  const modelPicker = document.getElementById('add-items-from-text-openai-model-picker');
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
    const ids = this._coerceStringArray(allIds);
    const currentModel = Zotero.Prefs.get('extensions.zotero.additemsfromtext.openaiModel', true) || '';
    this._setDetectedModelOptions(modelPicker, ids, currentModel);
    this._saveOpenAIModelCache(baseUrl, ids);

    if (ids.length) {
      statusLabel.value = 'Refreshed ' + ids.length + ' detected models';
      statusLabel.style.color = '#008800';
    } else {
      statusLabel.value = 'Server reported no models';
      statusLabel.style.color = '#666';
    }
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
  const modelPicker = document.getElementById('add-items-from-text-ollama-model-picker');
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
    const names = this._coerceStringArray(allNames);
    const currentModel = Zotero.Prefs.get('extensions.zotero.additemsfromtext.ollamaModel', true) || '';
    this._setDetectedModelOptions(modelPicker, names, currentModel);
    this._saveOllamaModelCache(baseUrl, names);

    if (names.length) {
      statusLabel.value = 'Refreshed ' + names.length + ' detected models';
      statusLabel.style.color = '#008800';
    } else {
      statusLabel.value = 'Server reported no models';
      statusLabel.style.color = '#666';
    }
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
  } catch (e) {
    Zotero.debug('Add Items from Text: Error initializing defaults: ' + e);
  }

  // Zotero 7+ executes this script before the pane markup is imported into
  // the preferences window, so the pane's elements usually do not exist yet.
  // Defer all DOM bindings until the pane root element appears.
  if (this._initStarted) return;
  this._initStarted = true;

  const bindWhenReady = () => {
    const root = document.getElementById('add-items-from-text-prefs-container');
    if (!root) return false;
    try {
      this.bind();
    } catch (e) {
      Zotero.debug('Add Items from Text: Error binding preferences pane: ' + e);
    }
    return true;
  };

  if (!bindWhenReady()) {
    const startedAt = Date.now();
    this._initPollTimer = setInterval(() => {
      if (bindWhenReady() || Date.now() - startedAt > 10000) {
        clearInterval(this._initPollTimer);
        this._initPollTimer = null;
      }
    }, 100);
  }
};

AddItemsFromTextPrefs.bind = function bind() {
  const root = document.getElementById('add-items-from-text-prefs-container');
  if (!root) return;

  // If a preference binding ended up writing the string "undefined" into an
  // input, repair it now that the pane markup exists.
  const gbvInput = document.getElementById('add-items-from-text-gbv-sru-url');
  if (gbvInput && (gbvInput.value === "undefined" || gbvInput.value === "")) {
    gbvInput.value = Zotero.Prefs.get('extensions.zotero.additemsfromtext.gbvSruUrl', true) || 'https://sru.k10plus.de/gvk';
  }

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

  this._bindModelInputPreference('add-items-from-text-model', 'extensions.zotero.additemsfromtext.defaultModel', 'add-items-from-text-model-picker');
  this._bindModelInputPreference('add-items-from-text-openai-model', 'extensions.zotero.additemsfromtext.openaiModel', 'add-items-from-text-openai-model-picker');
  this._bindModelInputPreference('add-items-from-text-ollama-model', 'extensions.zotero.additemsfromtext.ollamaModel', 'add-items-from-text-ollama-model-picker');
  this._bindDetectedModelPicker('add-items-from-text-model-picker', 'add-items-from-text-model', 'extensions.zotero.additemsfromtext.defaultModel');
  this._bindDetectedModelPicker('add-items-from-text-openai-model-picker', 'add-items-from-text-openai-model', 'extensions.zotero.additemsfromtext.openaiModel');
  this._bindDetectedModelPicker('add-items-from-text-ollama-model-picker', 'add-items-from-text-ollama-model', 'extensions.zotero.additemsfromtext.ollamaModel');

  // Refresh buttons: bind programmatically (inline oncommand handlers
  // cannot resolve sandbox-loaded globals in Zotero 7+ prefs windows).
  this._bindRefreshButton('add-items-from-text-refresh-models', 'refreshModels');
  this._bindRefreshButton('add-items-from-text-refresh-openai-models', 'refreshOpenAIModels');
  this._bindRefreshButton('add-items-from-text-refresh-ollama-models', 'refreshOllamaModels');

  // Zotero dispatches a synthetic `load` event on the pane fragment root
  // after the preference-attribute sync has run, and a synthetic `unload`
  // when the pane is closed.
  try {
    if (!root.__addItemsFromTextLifecycleBound) {
      root.__addItemsFromTextLifecycleBound = true;
      root.addEventListener('load', () => {
        try { this.bind(); } catch (e) {
          // ignore
        }
      });
      root.addEventListener('unload', () => this._cleanup());
    }
  } catch (e) {
    // ignore
  }

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

  if (!this._windowUnloadBound) {
    this._windowUnloadBound = true;
    window.addEventListener('unload', () => this._cleanup(), { once: true });
  }
};

// Zotero 7+ loads pane scripts into a sandboxed scope whose prototype is
// the preferences window. Expose the controller on the window so it is
// reachable from the window scope (e.g., the window's web console) as well.
try {
  window.AddItemsFromTextPrefs = AddItemsFromTextPrefs;
} catch (e) {
  // ignore
}

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
