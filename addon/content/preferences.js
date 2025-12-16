// Preferences script for Add Items from Text plugin

var AddItemsFromTextPrefs = {
  async refreshModels() {
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
      const menupopup = modelList.querySelector('menupopup');
      while (menupopup.firstChild) {
        menupopup.removeChild(menupopup.firstChild);
      }
      
      const currentModel = Zotero.Prefs.get('extensions.zotero.additemsfromtext.defaultModel', true) || 'gemini-2.0-flash';
      let foundCurrent = false;
      
      for (const model of textModels) {
        const modelName = model.name.replace('models/', '');
        const menuitem = document.createXULElement('menuitem');
        menuitem.setAttribute('label', model.displayName || modelName);
        menuitem.setAttribute('value', modelName);
        menupopup.appendChild(menuitem);
        
        if (modelName === currentModel) {
          foundCurrent = true;
        }
      }
      
      // Set current value
      if (foundCurrent) {
        modelList.value = currentModel;
      } else if (textModels.length > 0) {
        const firstModel = textModels[0].name.replace('models/', '');
        modelList.value = firstModel;
        Zotero.Prefs.set('extensions.zotero.additemsfromtext.defaultModel', firstModel, true);
      }
      
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
