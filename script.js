// Polyfill for standard browser environment
if (typeof chrome === 'undefined' || !chrome.storage) {
  window.chrome = {
    storage: {
      local: {
        get: (keys) => {
          return new Promise((resolve) => {
            const result = {};
            const keyList = Array.isArray(keys) ? keys : [keys];
            keyList.forEach(k => {
              const val = localStorage.getItem(k);
              if (val) result[k] = JSON.parse(val);
            });
            resolve(result);
          });
        },
        set: (items) => {
          return new Promise((resolve) => {
            Object.keys(items).forEach(k => {
              localStorage.setItem(k, JSON.stringify(items[k]));
            });
            resolve();
          });
        }
      }
    }
  };
}

// Constants & State
const DEFAULT_PROVIDER = {
  id: 'default-local',
  name: 'Default (Local)',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'sk-ant-api03-xxx', // Dummy key for local
  models: ['llama3', 'mistral', 'qwen2']
};

// Translations
const translations = {
  'en': {
    welcome: 'Select or create a chat context to start.',
    newChat: 'New Chat',
    apiConfig: 'API Config',
    selectModel: 'Select model...',
    thinkingToggle: 'NVIDIA Thinking (OFF=off, ON=auto)',
    clear: 'Clear',
    inputPlaceholder: 'Enter message... (Shift+Enter for new line)',
    send: 'Send',
    modelApiConfig: 'Model API Configuration',
    providersList: 'Providers List',
    addProvider: 'Add Provider',
    saveCurrentChanges: 'Save Current Changes',
    contextConfig: 'Context Configuration',
    name: 'Name',
    systemPrompt: 'System Prompt',
    maxHistory: 'Max messages (0=unlimited)',
    temperature: 'Temperature',
    topP: 'Top P',
    otherParams: 'Other params (JSON)',
    exportAll: 'Export All Config',
    importConfig: 'Import Config',
    save: 'Save',
    selectModelToAdd: 'Select models to add',
    addSelectedModels: 'Add Selected Models',
    edit: 'Edit',
    delete: 'Delete',
    selectLanguage: 'Select Language',
    emptyState: 'Select a provider from the left to edit',
    confirmDeleteContext: 'Delete this chat?',
    confirmClearHistory: 'Clear all chat history?',
    keepOneContext: 'Must keep at least one chat context',
    confirmDeleteProvider: 'Delete this provider?',
    connecting: 'Connecting...',
    connectionSuccessNoModels: 'Connection successful, but no models found.',
    connectionSuccessWrongFormat: 'Connection successful, but response format is unexpected.',
    connectionFailed: 'Connection failed: ',
    stop: 'Stop',
    send: 'Send'
  },
  'zh-CN': {
    welcome: '请选择或新建一个聊天上下文开始。',
    newChat: '新聊天',
    apiConfig: 'API配置',
    selectModel: '选择模型...',
    thinkingToggle: 'NVIDIA 思考参数 (OFF=关闭, ON=自动)',
    clear: '清空',
    inputPlaceholder: '输入消息... (Shift+Enter 换行)',
    send: '发送',
    modelApiConfig: '大模型 API 配置',
    providersList: '供应商列表',
    addProvider: '添加供应商',
    saveCurrentChanges: '保存当前修改',
    contextConfig: '上下文配置',
    name: '名称',
    systemPrompt: '系统提示词',
    maxHistory: '消息数量上限 (0为不限)',
    temperature: 'Temperature',
    topP: 'Top P',
    otherParams: '其他参数 (JSON)',
    exportAll: '导出所有配置',
    importConfig: '导入配置',
    save: '保存',
    selectModelToAdd: '选择要添加的模型',
    addSelectedModels: '添加选中模型',
    edit: '编辑',
    delete: '删除',
    selectLanguage: '选择语言',
    emptyState: '请选择左侧供应商进行编辑',
    confirmDeleteContext: '删除此对话？',
    confirmClearHistory: '确定清空当前对话历史吗？',
    keepOneContext: '至少保留一个聊天上下文',
    confirmDeleteProvider: '删除此供应商？',
    connecting: '连接中...',
    connectionSuccessNoModels: '连接成功，但未找到模型数据。',
    connectionSuccessWrongFormat: '连接成功，但返回格式不符合预期。',
    connectionFailed: '连接失败: ',
    stop: '停止',
    send: '发送'
  },
  'es': {
    welcome: 'Selecciona o crea un chat para comenzar.',
    newChat: 'Nuevo Chat',
    apiConfig: 'Config. API',
    selectModel: 'Seleccionar modelo...',
    thinkingToggle: 'Pensamiento NVIDIA (OFF=apagado, ON=auto)',
    clear: 'Limpiar',
    inputPlaceholder: 'Escribe un mensaje... (Shift+Enter para nueva línea)',
    send: 'Enviar',
    modelApiConfig: 'Configuración de API del Modelo',
    providersList: 'Lista de Proveedores',
    addProvider: 'Agregar Proveedor',
    saveCurrentChanges: 'Guardar Cambios Actuales',
    contextConfig: 'Configuración de Contexto',
    name: 'Nombre',
    systemPrompt: 'Prompt del Sistema',
    maxHistory: 'Máx. mensajes (0=ilimitado)',
    temperature: 'Temperatura',
    topP: 'Top P',
    otherParams: 'Otros parámetros (JSON)',
    exportAll: 'Exportar Todo',
    importConfig: 'Importar Config',
    save: 'Guardar',
    selectModelToAdd: 'Seleccionar modelos para agregar',
    addSelectedModels: 'Agregar Modelos Seleccionados',
    edit: 'Editar',
    delete: 'Eliminar',
    selectLanguage: 'Seleccionar Idioma',
    emptyState: 'Selecciona un proveedor de la izquierda para editar',
    confirmDeleteContext: '¿Eliminar este chat?',
    confirmClearHistory: '¿Borrar todo el historial del chat?',
    keepOneContext: 'Debes mantener al menos un chat',
    confirmDeleteProvider: '¿Eliminar este proveedor?',
    connecting: 'Conectando...',
    connectionSuccessNoModels: 'Conexión exitosa, pero no se encontraron modelos.',
    connectionSuccessWrongFormat: 'Conexión exitosa, pero el formato de respuesta es inesperado.',
    connectionFailed: 'Error de conexión: ',
    stop: 'Detener',
    send: 'Enviar'
  }
};

let currentLang = 'zh-CN'; // Default language

function t(key) {
  return translations[currentLang]?.[key] || translations['en'][key] || key;
}

function applyTranslations() {
  // Welcome message
  var welcomeEl = document.querySelector('.welcome-message');
  if (welcomeEl) welcomeEl.textContent = t('welcome');
  
  // Add context button title
  if (els.addContextBtn) els.addContextBtn.title = t('newChat');
  
  // Config button
  if (els.configBtn) els.configBtn.textContent = t('apiConfig');
  
  // Model select placeholder
  if (els.modelSelect && els.modelSelect.querySelector('option')) {
    els.modelSelect.querySelector('option').textContent = t('selectModel');
  }
  
  // Thinking toggle
  if (els.thinkingToggleBtn) els.thinkingToggleBtn.title = t('thinkingToggle');
  
  // Clear button
  if (els.clearBtn) {
    els.clearBtn.textContent = t('clear');
    els.clearBtn.title = t('confirmClearHistory');
  }
  
  // Chat input placeholder
  if (els.chatInput) els.chatInput.placeholder = t('inputPlaceholder');
  
  // Send button
  if (els.sendBtn) els.sendBtn.textContent = t('send');
  
  // API Config Modal
  var apiModalH3 = document.querySelector('#api-config-modal h3');
  if (apiModalH3) apiModalH3.textContent = t('modelApiConfig');
  var apiSidebarHeader = document.querySelector('#api-config-modal .sidebar-header');
  if (apiSidebarHeader) apiSidebarHeader.textContent = t('providersList');
  if (els.addProviderBtn) els.addProviderBtn.textContent = t('addProvider');
  if (els.saveApiBtn) els.saveApiBtn.textContent = t('saveCurrentChanges');
  var apiEmptyState = document.querySelector('#api-config-modal .empty-state');
  if (apiEmptyState) apiEmptyState.textContent = t('emptyState');
  
  // Context Config Modal
  var ctxModalH3 = document.querySelector('#context-config-modal h3');
  if (ctxModalH3) ctxModalH3.textContent = t('contextConfig');
  var ctxNameLabel = document.querySelector('label[for="ctx-name"]');
  if (ctxNameLabel) ctxNameLabel.textContent = t('name');
  var ctxSystemLabel = document.querySelector('label[for="ctx-system-prompt"]');
  if (ctxSystemLabel) ctxSystemLabel.textContent = t('systemPrompt');
  var ctxMaxHistoryLabel = document.querySelector('label[for="ctx-max-history"]');
  if (ctxMaxHistoryLabel) ctxMaxHistoryLabel.textContent = t('maxHistory');
  var ctxTempLabel = document.querySelector('label[for="ctx-temperature"]');
  if (ctxTempLabel) ctxTempLabel.textContent = t('temperature');
  var ctxTopPLabel = document.querySelector('label[for="ctx-top-p"]');
  if (ctxTopPLabel) ctxTopPLabel.textContent = t('topP');
  var ctxParamsLabel = document.querySelector('label[for="ctx-params"]');
  if (ctxParamsLabel) ctxParamsLabel.textContent = t('otherParams');
  if (els.exportBtn) els.exportBtn.textContent = t('exportAll');
  if (els.importBtn) els.importBtn.textContent = t('importConfig');
  if (els.saveCtxBtn) els.saveCtxBtn.textContent = t('save');
  
  // Model Selection Modal
  var modelModalH3 = document.querySelector('#model-selection-modal h3');
  if (modelModalH3) modelModalH3.textContent = t('selectModelToAdd');
  if (els.confirmModelBtn) els.confirmModelBtn.textContent = t('addSelectedModels');
  
  // Context Menu
  if (els.contextMenu) {
    var editItem = els.contextMenu.querySelector('[data-action="edit"]');
    if (editItem) editItem.textContent = t('edit');
    var deleteItem = els.contextMenu.querySelector('[data-action="delete"]');
    if (deleteItem) deleteItem.textContent = t('delete');
  }
  
  // Language Modal
  var langModalH3 = document.querySelector('#language-modal h3');
  if (langModalH3) langModalH3.textContent = t('selectLanguage');
  
  // Update selected state on language options
  var langOptions = document.querySelectorAll('.language-option');
  langOptions.forEach(function(btn) {
    btn.classList.toggle('selected', btn.getAttribute('data-lang') === currentLang);
  });
}

let state = {
  contexts: [],
  providers: [DEFAULT_PROVIDER],
  currentContextId: null
};

let tempProviders = []; // For editing in modal
let currentEditingProviderId = null;

let abortController = null;
let isGenerating = false;
let thinkingEnabled = false; // Default OFF (explicitly disable thinking)

// DOM Elements
const els = {
  contextBar: document.getElementById('context-bar'),
  chatContainer: document.getElementById('chat-container'),
  chatInput: document.getElementById('chat-input'),
  sendBtn: document.getElementById('send-btn'),
  modelSelect: document.getElementById('model-select'),
  thinkingToggleBtn: document.getElementById('thinking-toggle-btn'),
  configBtn: document.getElementById('config-btn'),
  clearBtn: document.getElementById('clear-btn'),
  addContextBtn: document.getElementById('add-context-btn'),
  languageBtn: document.getElementById('language-btn'),

  // Modals
  apiModal: document.getElementById('api-config-modal'),
  ctxModal: document.getElementById('context-config-modal'),
  modelModal: document.getElementById('model-selection-modal'),
  contextMenu: document.getElementById('context-menu'),
  languageModal: document.getElementById('language-modal'),
  
  // API Config Elements
  providersList: document.getElementById('providers-list'),
  addProviderBtn: document.getElementById('add-provider-btn'),
  saveApiBtn: document.getElementById('save-api-config-btn'),
  providerForm: document.getElementById('provider-form'),
  
  // Model Selection Elements
  modelCheckboxList: document.getElementById('model-checkbox-list'),
  confirmModelBtn: document.getElementById('confirm-model-selection-btn'),

  // Context Config Elements
  ctxName: document.getElementById('ctx-name'),
  ctxSystem: document.getElementById('ctx-system-prompt'),
  ctxMaxHistory: document.getElementById('ctx-max-history'),
  ctxTemp: document.getElementById('ctx-temperature'),
  ctxTopP: document.getElementById('ctx-top-p'),
  ctxParams: document.getElementById('ctx-params'),
  saveCtxBtn: document.getElementById('save-context-config-btn'),
  exportBtn: document.getElementById('export-data-btn'),
  importBtn: document.getElementById('import-data-btn'),
  importFile: document.getElementById('import-file')
};

// --- Initialization ---

async function init() {
  await loadState();
  await loadLanguage();
  applyTranslations();
  renderContextBar();
  updateModelSelect();
  
  if (state.contexts.length > 0) {
    if (!state.contexts.find(c => c.id === state.currentContextId)) {
      switchContext(state.contexts[0].id);
    } else {
      switchContext(state.currentContextId);
    }
  } else {
    await createNewContext();
  }

  setupEventListeners();
}

async function loadLanguage() {
  const result = await chrome.storage.local.get(['sidebarLanguage']);
  if (result.sidebarLanguage) {
    currentLang = result.sidebarLanguage;
  }
}

async function saveLanguage() {
  await chrome.storage.local.set({ sidebarLanguage: currentLang });
}

async function loadState() {
  const result = await chrome.storage.local.get(['sidebarState']);
  if (result.sidebarState) {
    state = result.sidebarState;
    if (!state.providers.some(p => p.id === 'default-local')) {
      state.providers.unshift(DEFAULT_PROVIDER);
    }
  }
}

async function saveState() {
  await chrome.storage.local.set({ sidebarState: state });
}

// --- Context Management ---

async function createNewContext() {
  const id = Date.now().toString();
  const newContext = {
    id,
    name: t('newChat'),
    systemPrompt: 'You are a helpful assistant.',
    maxHistory: 0,
    temperature: 0.7,
    topP: 1.0,
    customParams: '{}',
    messages: [],
    modelProviderId: state.providers[0].id,
    modelId: state.providers[0].models[0] || ''
  };
  
  state.contexts.push(newContext);
  await saveState();
  renderContextBar();
  switchContext(id);
}

function switchContext(id) {
  state.currentContextId = id;
  saveState();
  
  renderContextBar();
  
  const ctx = getCurrentContext();
  if (ctx) {
    renderMessages(ctx.messages);
    updateModelSelect();
    const modelVal = `${ctx.modelProviderId}|${ctx.modelId}`;
    
    if (els.modelSelect.querySelector(`option[value="${modelVal}"]`)) {
        els.modelSelect.value = modelVal;
    } else {
        els.modelSelect.selectedIndex = 0;
        updateCurrentContextModel();
    }
  }
}

function getCurrentContext() {
  return state.contexts.find(c => c.id === state.currentContextId);
}

function updateCurrentContextModel() {
  const ctx = getCurrentContext();
  if (!ctx || !els.modelSelect.value) return;
  
  const [pId, mId] = els.modelSelect.value.split('|');
  ctx.modelProviderId = pId;
  ctx.modelId = mId;
  saveState();
}

async function deleteContext(id) {
  if (state.contexts.length <= 1) {
    alert(t('keepOneContext'));
    return;
  }
  
  state.contexts = state.contexts.filter(c => c.id !== id);
  if (state.currentContextId === id) {
    state.currentContextId = state.contexts[0].id;
  }
  await saveState();
  renderContextBar();
  switchContext(state.currentContextId);
}

function toggleThinking() {
  thinkingEnabled = !thinkingEnabled;
  els.thinkingToggleBtn.textContent = thinkingEnabled ? 'ON' : 'OFF';
  els.thinkingToggleBtn.classList.toggle('on', thinkingEnabled);
}

// --- Rendering ---

function renderContextBar() {
  els.contextBar.innerHTML = '';
  state.contexts.forEach(ctx => {
    const btn = document.createElement('button');
    btn.className = 'context-btn';
    if (ctx.id === state.currentContextId) {
        btn.classList.add('active');
    }
    btn.textContent = ctx.name;
    btn.dataset.id = ctx.id;
    btn.title = ctx.name;
    
    btn.addEventListener('click', () => switchContext(ctx.id));
    btn.addEventListener('contextmenu', (e) => showContextMenu(e, ctx.id));
    
    els.contextBar.appendChild(btn);
  });
}

function renderMessages(messages) {
  els.chatContainer.innerHTML = '';
  if (messages.length === 0) {
    const welcome = document.createElement('div');
    welcome.className = 'welcome-message';
    welcome.textContent = '开始一个新的对话...';
    els.chatContainer.appendChild(welcome);
    return;
  }
  
  messages.forEach((msg, index) => appendMessageToUI(msg, index));
  scrollToBottom();
}

function appendMessageToUI(msg, index) {
  const div = document.createElement('div');
  div.className = `message ${msg.role}`;
  if (index !== undefined) {
      div.dataset.index = index;
  }
  div.innerHTML = renderMessageContent(msg);
  els.chatContainer.appendChild(div);
  return div;
}

function renderMessageContent(msg) {
    if (msg.role === 'user') {
        return parseMarkdown(msg.content);
    }
    
    // Assistant Logic
    let content = msg.content || '';
    let thinkHtml = '';
    let mainContent = content;
    
    // Robust parsing for <think>
    const thinkPattern = /<think>([\s\S]*?)(?:<\/think>|$)/;
    const match = content.match(thinkPattern);
    
    if (match) {
        const thinkText = match[1];
        const isThinking = !content.includes('</think>');
        
        mainContent = content.replace(match[0], '');
        
        if (isThinking) {
            thinkHtml = `
                <div class="think-section">
                    <div class="think-toggle">
                        ▶ 正在思考...
                    </div>
                    <div class="think-content visible" style="color: #888;">${parseMarkdown(thinkText)}</div>
                </div>
            `;
        } else {
            const duration = msg.timings && msg.timings.thinkDuration 
                ? ` (${(msg.timings.thinkDuration / 1000).toFixed(1)}s)` 
                : '';
            
            thinkHtml = `
                <div class="think-section">
                    <div class="think-toggle">
                        ▶ 思考过程${duration}
                    </div>
                    <div class="think-content">${parseMarkdown(thinkText)}</div>
                </div>
            `;
        }
    }

    // Stats Footer
    let statsHtml = '';
    if (msg.finalStats) {
        const s = msg.finalStats;
        statsHtml = `
            <div class="token-stats" title="TTFT: 首字延迟, Total: 总耗时">
                <span>TTFT: ${s.ttft}s | Total: ${s.totalTime}s | Tokens: ${s.tokens} | Speed: ${s.speed} t/s</span>
                <button class="copy-btn" title="复制正文">复制</button>
            </div>
        `;
    }

    return thinkHtml + parseMarkdown(mainContent) + statsHtml;
}

function scrollToBottom() {
  els.chatContainer.scrollTop = els.chatContainer.scrollHeight;
}

// --- Chat Logic ---

async function sendMessage() {
  const content = els.chatInput.value.trim();
  if (!content) return;
  
  const ctx = getCurrentContext();
  if (!ctx) return;

  els.chatInput.value = '';
  adjustInputHeight();
  els.sendBtn.textContent = t('stop');
  isGenerating = true;
  
  const userMsg = { role: 'user', content };
  ctx.messages.push(userMsg);
  appendMessageToUI(userMsg, ctx.messages.length - 1);
  scrollToBottom();
  
  const assistantMsg = { role: 'assistant', content: '', timings: {} };
  const msgDiv = appendMessageToUI(assistantMsg, ctx.messages.length);
  scrollToBottom();
  
  abortController = new AbortController();
  
  // Timing Stats
  const startTime = Date.now();
  assistantMsg.timings.startTime = startTime;
  
  let firstTokenTime = null;
  let thinkEndTime = null;
  let usage = null;
  let estimatedTokens = 0; 
  
  try {
    const provider = state.providers.find(p => p.id === ctx.modelProviderId);
    if (!provider) throw new Error('Provider not found');
    
    let history = ctx.messages.slice(0, -1);
    if (ctx.maxHistory > 0) {
      history = history.slice(-ctx.maxHistory);
    }
    const messages = [
      { role: 'system', content: ctx.systemPrompt },
      ...history,
      userMsg
    ];

    let customParams = {};
    try {
        if(ctx.customParams) {
            customParams = JSON.parse(ctx.customParams);
        }
    } catch(e) {
        console.error('Failed to parse custom params', e);
    }

    await streamCompletion(provider, ctx.modelId, messages, ctx, customParams, 
        (chunk, chunkUsage, isReasoning) => {
            const now = Date.now();
            
            // TTFT
            if (!firstTokenTime && (chunk || chunkUsage || isReasoning)) { 
                firstTokenTime = now;
                assistantMsg.timings.firstTokenTime = firstTokenTime;
            }
            
            if (chunk) {
                if (isReasoning) {
                    if (!assistantMsg.internal_hasStartedThinking) {
                        assistantMsg.content += "<think>";
                        assistantMsg.internal_hasStartedThinking = true;
                    }
                    assistantMsg.content += chunk;
                } else {
                    if (assistantMsg.internal_hasStartedThinking && !assistantMsg.internal_hasEndedThinking) {
                        assistantMsg.content += "</think>";
                        assistantMsg.internal_hasEndedThinking = true;
                        thinkEndTime = now;
                        assistantMsg.timings.thinkEndTime = thinkEndTime;
                        assistantMsg.timings.thinkDuration = thinkEndTime - startTime;
                    }
                    assistantMsg.content += chunk;
                }
                
                estimatedTokens += 1; 
                
                if (!thinkEndTime && assistantMsg.content.includes('</think>')) {
                    thinkEndTime = now;
                    assistantMsg.timings.thinkEndTime = thinkEndTime;
                    assistantMsg.timings.thinkDuration = thinkEndTime - startTime;
                }
            }
            
            if (chunkUsage) {
                usage = chunkUsage;
            }
            
            msgDiv.innerHTML = renderMessageContent(assistantMsg);
            scrollToBottom();
        }, 
        abortController.signal
    );
    
    const endTime = Date.now();
    assistantMsg.timings.endTime = endTime;
    
    const ttft = firstTokenTime ? ((firstTokenTime - startTime) / 1000).toFixed(2) : '0.00';
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);
    
    let finalTokens = estimatedTokens;
    let isExact = false;
    if (usage && usage.completion_tokens) {
        finalTokens = usage.completion_tokens;
        isExact = true;
    }
    
    const speed = parseFloat(totalTime) > 0 ? (finalTokens / parseFloat(totalTime)).toFixed(1) : 0;
    
    assistantMsg.finalStats = {
        ttft,
        totalTime,
        tokens: finalTokens + (isExact ? '' : ' (Est)'),
        speed
    };
    
    msgDiv.innerHTML = renderMessageContent(assistantMsg);
    msgDiv.dataset.index = ctx.messages.length;
    
    ctx.messages.push(assistantMsg);
    await saveState();

  } catch (err) {
    if (err.name === 'AbortError') {
       msgDiv.innerHTML += '<br><i>[已中断]</i>';
       assistantMsg.content += '\n[已中断]';
       ctx.messages.push(assistantMsg);
       await saveState();
    } else {
       msgDiv.innerHTML += `<br><span style="color:red">Error: ${err.message}</span>`;
    }
  } finally {
    isGenerating = false;
    els.sendBtn.textContent = t('send');
    abortController = null;
    els.chatInput.focus();
  }
}

async function streamCompletion(provider, modelId, messages, settings, customParams, onChunk, signal) {
    const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    const body = {
        model: modelId,
        messages: messages,
        temperature: parseFloat(settings.temperature),
        top_p: parseFloat(settings.topP),
        stream: true,
        stream_options: { include_usage: true },
        ...customParams
    };
    
    // Handle thinking parameter: OFF = explicitly disable, ON = auto (no parameter)
    if (!thinkingEnabled) {
        body.chat_template_kwargs = { enable_thinking: false };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error: ${response.status} - ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') return;
                try {
                    const data = JSON.parse(dataStr);
                    const delta = data.choices && data.choices[0]?.delta;
                    const content = delta?.content || '';
                    const reasoning = delta?.reasoning_content || '';
                    const usage = data.usage || null;
                    
                    if (reasoning) {
                        onChunk(reasoning, null, true);
                    } else if (content || usage) {
                        onChunk(content, usage, false);
                    }
                } catch (e) {}
            }
        }
    }
}

// --- Utils ---

function parseMarkdown(text) {
  if (!text) return '';
  let safeText = text.replace(/</g, '<').replace(/>/g, '>');
  safeText = safeText.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  const parts = safeText.split(/(<pre>[\s\S]*?<\/pre>)/g);
  return parts.map(part => {
      if (part.startsWith('<pre>')) return part;
      return part.replace(/\n/g, '<br>');
  }).join('');
}

function adjustInputHeight() {
    els.chatInput.style.height = 'auto';
    els.chatInput.style.height = (els.chatInput.scrollHeight) + 'px';
    if(els.chatInput.value === '') {
        els.chatInput.style.height = '';
    }
    
    // Dynamic overflow to prevent ugly scrollbar on empty/short text
    if (els.chatInput.scrollHeight > 200) {
        els.chatInput.style.overflowY = 'auto';
    } else {
        els.chatInput.style.overflowY = 'hidden';
    }
}

// --- Event Listeners & Config Logic ---

function setupEventListeners() {
    els.addContextBtn.addEventListener('click', createNewContext);
    
    // Language button - open modal
    if (els.languageBtn) {
        els.languageBtn.onclick = function() {
            els.languageModal.classList.remove('hidden');
        };
    }
    
    // Close language modal when clicking outside
    if (els.languageModal) {
        els.languageModal.onclick = function(e) {
            if (e.target === els.languageModal) {
                els.languageModal.classList.add('hidden');
            }
        };
    }
    
    // Language options - click handler
    const langOptionBtns = document.querySelectorAll('.language-option');
    langOptionBtns.forEach(function(btn) {
        btn.onclick = function() {
            // Set selected language
            var selectedLang = this.getAttribute('data-lang');
            currentLang = selectedLang;
            
            // Save language
            chrome.storage.local.set({ sidebarLanguage: currentLang });
            
            // Apply translations
            applyTranslations();
            
            // Close modal
            els.languageModal.classList.add('hidden');
        };
    });
    
    els.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                setTimeout(adjustInputHeight, 0);
            } else {
                e.preventDefault();
                sendMessage();
            }
        }
    });
    
    els.chatInput.addEventListener('input', adjustInputHeight);
    
    els.sendBtn.addEventListener('click', () => {
        if (isGenerating && abortController) {
            abortController.abort();
        } else {
            sendMessage();
        }
    });

    els.clearBtn.addEventListener('click', () => {
        if(confirm(t('confirmClearHistory'))) {
            const ctx = getCurrentContext();
            if(ctx) {
                ctx.messages = [];
                saveState();
                renderMessages([]);
            }
        }
    });
    
    els.modelSelect.addEventListener('change', updateCurrentContextModel);
    els.thinkingToggleBtn.addEventListener('click', toggleThinking);
    els.configBtn.addEventListener('click', openApiModal);
    
    document.addEventListener('click', () => els.contextMenu.classList.add('hidden'));
    
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.add('hidden');
        });
    });

    els.addProviderBtn.addEventListener('click', addProviderUI);
    els.saveApiBtn.addEventListener('click', saveApiConfig);
    els.saveCtxBtn.addEventListener('click', saveContextConfig);

    els.exportBtn.addEventListener('click', exportData);
    els.importBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', importData);
    
    els.contextMenu.querySelector('[data-action="edit"]').addEventListener('click', openContextConfig);
    els.contextMenu.querySelector('[data-action="delete"]').addEventListener('click', () => {
       const id = els.contextMenu.dataset.contextId;
       if(confirm(t('confirmDeleteContext'))) {
           deleteContext(id);
       }
    });

    els.confirmModelBtn.addEventListener('click', confirmModelSelection);

    // Event delegation for Think Toggle and Copy Button
    els.chatContainer.addEventListener('click', (e) => {
        // Think Toggle
        const toggle = e.target.closest('.think-toggle');
        if (toggle) {
            const content = toggle.nextElementSibling;
            if (content && content.classList.contains('think-content')) {
                content.classList.toggle('visible');
            }
            return;
        }

        // Copy Button
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const msgDiv = copyBtn.closest('.message');
            if (msgDiv && msgDiv.dataset.index) {
                const index = parseInt(msgDiv.dataset.index);
                const ctx = getCurrentContext();
                if (ctx && ctx.messages[index]) {
                    const msgContent = ctx.messages[index].content;
                    // Extract main content (remove thinking)
                    let mainContent = msgContent;
                    const thinkMatch = msgContent.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
                    if (thinkMatch) {
                        mainContent = msgContent.replace(thinkMatch[0], '');
                    }
                    
                    navigator.clipboard.writeText(mainContent).then(() => {
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => copyBtn.textContent = originalText, 1500);
                    }).catch(err => console.error('Copy failed', err));
                }
            }
        }
    });
}

// --- API Config UI ---

function openApiModal() {
    tempProviders = JSON.parse(JSON.stringify(state.providers));
    currentEditingProviderId = tempProviders[0]?.id || null;
    renderApiConfigUI();
    els.apiModal.classList.remove('hidden');
}

function renderApiConfigUI() {
    renderProvidersList();
    renderProviderForm();
}

function renderProvidersList() {
    els.providersList.innerHTML = '';
    tempProviders.forEach(p => {
        const div = document.createElement('div');
        div.className = 'provider-list-item';
        if (p.id === currentEditingProviderId) div.classList.add('active');
        div.textContent = p.name || '未命名供应商';
        div.addEventListener('click', () => {
            currentEditingProviderId = p.id;
            renderApiConfigUI();
        });
        els.providersList.appendChild(div);
    });
}

function renderProviderForm() {
    const p = tempProviders.find(tp => tp.id === currentEditingProviderId);
    if (!p) {
        els.providerForm.innerHTML = '<div class="empty-state">请选择左侧供应商进行编辑</div>';
        return;
    }
    
    const isDefault = (p.id === 'default-local');

    els.providerForm.innerHTML = `
        <div class="form-group">
            <label>名称</label>
            <input type="text" id="p-edit-name" value="${p.name}" ${isDefault ? 'readonly' : ''}>
        </div>
        <div class="form-group">
            <label>Base URL</label>
            <input type="text" id="p-edit-url" value="${p.baseUrl}">
        </div>
        <div class="form-group">
            <label>API Key</label>
            <div class="password-input-wrapper">
                <input type="password" id="p-edit-key" value="${p.apiKey}">
                <button id="toggle-key-visibility-btn" class="icon-btn" title="显示/隐藏 API Key">👁️</button>
            </div>
        </div>
        <div class="form-group">
            <label>模型 (逗号分隔)</label>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="p-edit-models" value="${p.models.join(', ')}" style="flex:1">
                <button id="test-fetch-btn" class="secondary-btn" style="white-space:nowrap; padding: 8px;">获取模型</button>
            </div>
        </div>
        ${!isDefault ? '<button class="danger-text" id="delete-provider-btn">删除此供应商</button>' : ''}
    `;

    const nameInput = document.getElementById('p-edit-name');
    const urlInput = document.getElementById('p-edit-url');
    const keyInput = document.getElementById('p-edit-key');
    const toggleKeyBtn = document.getElementById('toggle-key-visibility-btn');
    const modelsInput = document.getElementById('p-edit-models');
    const testBtn = document.getElementById('test-fetch-btn');

    toggleKeyBtn.addEventListener('click', () => {
        if (keyInput.type === 'password') {
            keyInput.type = 'text';
            toggleKeyBtn.textContent = '🔒';
        } else {
            keyInput.type = 'password';
            toggleKeyBtn.textContent = '👁️';
        }
    });

    testBtn.addEventListener('click', () => fetchModelsAndShowModal(urlInput.value, keyInput.value));
    
    const updateHandler = () => {
        p.name = nameInput.value;
        p.baseUrl = urlInput.value;
        p.apiKey = keyInput.value;
        p.models = modelsInput.value.split(',').map(s => s.trim()).filter(s => s);
        renderProvidersList(); 
    };

    nameInput.addEventListener('input', updateHandler);
    urlInput.addEventListener('input', updateHandler);
    keyInput.addEventListener('input', updateHandler);
    modelsInput.addEventListener('input', updateHandler);

    if (!isDefault) {
        document.getElementById('delete-provider-btn').addEventListener('click', () => {
            if(confirm(t('confirmDeleteProvider'))) {
                tempProviders = tempProviders.filter(tp => tp.id !== p.id);
                currentEditingProviderId = tempProviders[0]?.id || null;
                renderApiConfigUI();
            }
        });
    }
}

async function fetchModelsAndShowModal(url, key) {
    const baseUrl = url.replace(/\/$/, '');
    const btn = document.getElementById('test-fetch-btn');
    
    btn.textContent = t('connecting');
    btn.disabled = true;
    
    try {
        const res = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${key}` }
        });
        
        if (!res.ok) throw new Error(`Status ${res.status}`);
        
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
            const modelIds = data.data.map(m => m.id);
            if (modelIds.length > 0) {
                // Show modal
                renderModelCheckboxList(modelIds);
                els.modelModal.classList.remove('hidden');
            } else {
                alert(t('connectionSuccessNoModels'));
            }
        } else {
            alert(t('connectionSuccessWrongFormat'));
        }
    } catch (e) {
        alert(t('connectionFailed') + e.message);
    } finally {
        btn.textContent = '获取模型';
        btn.disabled = false;
    }
}

function renderModelCheckboxList(models) {
    els.modelCheckboxList.innerHTML = '';
    // Sort logic? Alphabetical
    models.sort().forEach(m => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" value="${m}" id="model-cb-${m}">
            <label for="model-cb-${m}">${m}</label>
        `;
        // Allow clicking div to toggle
        div.addEventListener('click', (e) => {
           if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
               const cb = div.querySelector('input');
               cb.checked = !cb.checked;
           }
        });
        els.modelCheckboxList.appendChild(div);
    });
}

function confirmModelSelection() {
    const p = tempProviders.find(tp => tp.id === currentEditingProviderId);
    if (!p) return;
    
    const checkboxes = els.modelCheckboxList.querySelectorAll('input[type="checkbox"]:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);
    
    if (selected.length === 0) {
        els.modelModal.classList.add('hidden');
        return;
    }
    
    // Merge unique
    const currentModels = p.models;
    const newModels = [...new Set([...currentModels, ...selected])];
    p.models = newModels;
    
    // Update input in form if visible
    const modelsInput = document.getElementById('p-edit-models');
    if (modelsInput) {
        modelsInput.value = newModels.join(', ');
    }
    
    els.modelModal.classList.add('hidden');
}

function addProviderUI() {
    const newId = Date.now().toString();
    tempProviders.push({
        id: newId,
        name: 'New Provider',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        models: ['gpt-3.5-turbo']
    });
    currentEditingProviderId = newId;
    renderApiConfigUI();
}

async function saveApiConfig() {
    state.providers = JSON.parse(JSON.stringify(tempProviders));
    await saveState();
    updateModelSelect();
    els.apiModal.classList.add('hidden');
}

function updateModelSelect() {
    const currentVal = els.modelSelect.value;
    els.modelSelect.innerHTML = '<option value="" disabled selected>选择模型...</option>';
    
    state.providers.forEach(p => {
        const group = document.createElement('optgroup');
        group.label = p.name;
        p.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = `${p.id}|${m}`;
            opt.textContent = m;
            group.appendChild(opt);
        });
        els.modelSelect.appendChild(group);
    });
    
    if (currentVal && els.modelSelect.querySelector(`option[value="${currentVal}"]`)) {
        els.modelSelect.value = currentVal;
    }
}

// --- Context Config UI ---

function showContextMenu(e, contextId) {
    e.preventDefault();
    els.contextMenu.style.left = `${e.clientX}px`;
    els.contextMenu.style.top = `${e.clientY}px`;
    els.contextMenu.classList.remove('hidden');
    els.contextMenu.dataset.contextId = contextId;
}

function openContextConfig() {
    const id = els.contextMenu.dataset.contextId;
    const ctx = state.contexts.find(c => c.id === id);
    if (!ctx) return;
    
    els.ctxName.value = ctx.name;
    els.ctxSystem.value = ctx.systemPrompt;
    els.ctxMaxHistory.value = ctx.maxHistory;
    els.ctxTemp.value = ctx.temperature;
    els.ctxTopP.value = ctx.topP;
    els.ctxParams.value = ctx.customParams || '{}';
    
    els.ctxModal.dataset.editingId = id;
    els.ctxModal.classList.remove('hidden');
}

async function saveContextConfig() {
    const id = els.ctxModal.dataset.editingId;
    const ctx = state.contexts.find(c => c.id === id);
    if (ctx) {
        ctx.name = els.ctxName.value;
        ctx.systemPrompt = els.ctxSystem.value;
        ctx.maxHistory = parseInt(els.ctxMaxHistory.value) || 0;
        ctx.temperature = parseFloat(els.ctxTemp.value);
        ctx.topP = parseFloat(els.ctxTopP.value);
        
        try {
            const paramsVal = els.ctxParams.value;
            JSON.parse(paramsVal);
            ctx.customParams = paramsVal;
        } catch(e) {
            alert('其他参数格式无效 (必须是 JSON)');
            return;
        }
        
        await saveState();
        renderContextBar();
    }
    els.ctxModal.classList.add('hidden');
}

// --- Import/Export ---

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "sidebar_chat_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const json = JSON.parse(e.target.result);
            if (json.contexts && json.providers) {
                state = json;
                await saveState();
                location.reload();
            } else {
                alert('无效的配置文件');
            }
        } catch (err) {
            alert('导入失败: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// Start
init();
