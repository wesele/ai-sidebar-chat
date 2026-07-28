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
  models: ['llama3', 'mistral', 'qwen2'],
  apiType: 'openai',
  googleSearch: false
};

const REMOVED_WEB_PROVIDER_IDS = new Set(['qwen-web', 'deepseek-web']);

// Image state
let selectedImages = [];

// Speech recognition state
let isRecording = false;
let recognition = null;

// Translations
const translations = {
  'en': {
    welcome: 'Select or create a chat context to start.',
    newChat: 'New Chat',
    apiConfig: 'API Config',
    more: 'More',
    timingMetrics: 'Timing metrics',
    alignment: 'Alignment',
    selectModel: 'Select model...',
    thinkingToggle: 'DeepSeek Thinking (默认/关闭)',
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
    maxHistory: 'Max messages (0=unlimited, 1=current only)',
    temperature: 'Temperature',
    topP: 'Top P',
    otherParams: 'Other params (JSON)',
    reasoningEffort: 'reasoning_effort',
    speechConfigTitle: 'Speech Input Settings',
    speechLangLabel: 'Input Language',
    speechSensitivityLabel: 'Auto-send delay',
    speechStartBtn: 'Start Recording',
    speechFast: 'Short',
    speechSlow: 'Long',
    exportAll: 'Export All Config',
    importConfig: 'Import Config',
    exportModelConfig: 'Export Model Config',
    importModelConfig: 'Import Model Config',
    save: 'Save',
    selectModelToAdd: 'Select models to add',
    addSelectedModels: 'Add Selected Models',
    filterModels: 'Filter models...',
    addModel: 'Add',
    modelsList: 'Model List',
    addModelPlaceholder: 'Add model...',
    noModels: 'No models',
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
    send: 'Send',
    startRecording: 'Voice input',
    stopRecording: 'Stop recording',
    statsToggleOn: 'Hide timing stats',
    statsToggleOff: 'Show timing stats',
    messageAlignLeftRight: 'User right, AI left',
    messageAlignBothLeft: 'Both on left'
  },
  'zh-CN': {
    welcome: '请选择或新建一个聊天上下文开始。',
    newChat: '新聊天',
    apiConfig: 'API配置',
    selectModel: '选择模型...',
    thinkingToggle: 'DeepSeek 思考参数 (默认/关闭)',
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
    maxHistory: '消息数量上限 (0为不限, 1为仅当前)',
    temperature: 'Temperature',
    topP: 'Top P',
    otherParams: '其他参数 (JSON)',
    reasoningEffort: 'reasoning_effort',
    speechConfigTitle: '语音输入设置',
    speechLangLabel: '输入语言',
    speechSensitivityLabel: '自动发送延迟',
    speechStartBtn: '开始录音',
    speechFast: '短',
    speechSlow: '长',
    exportAll: '导出所有配置',
    importConfig: '导入配置',
    exportModelConfig: '导出模型配置',
    importModelConfig: '导入模型配置',
    save: '保存',
    selectModelToAdd: '选择要添加的模型',
    addSelectedModels: '添加选中模型',
    filterModels: '过滤模型...',
    addModel: '添加',
    modelsList: '模型列表',
    addModelPlaceholder: '添加模型...',
    noModels: '暂无模型',
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
    send: '发送',
    startRecording: '语音输入',
    stopRecording: '停止录音',
    statsToggleOn: '隐藏时间指标',
    statsToggleOff: '显示时间指标',
    messageAlignLeftRight: '用户右，AI左',
    messageAlignBothLeft: '都在左侧'
  },
  'es': {
    welcome: 'Selecciona o crea un chat para comenzar.',
    newChat: 'Nuevo Chat',
    apiConfig: 'Config. API',
    more: 'Más',
    timingMetrics: 'Métricas de tiempo',
    alignment: 'Alineación',
    selectModel: 'Seleccionar modelo...',
    thinkingToggle: 'Pensamiento DeepSeek (Default/Apagado)',
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
    maxHistory: 'Máx. mensajes (0=ilimitado, 1=solo actual)',
    temperature: 'Temperatura',
    topP: 'Top P',
    otherParams: 'Otros parámetros (JSON)',
    reasoningEffort: 'reasoning_effort',
    speechConfigTitle: 'Configuración de Voz',
    speechLangLabel: 'Idioma de entrada',
    speechSensitivityLabel: 'Retardo de envío',
    speechStartBtn: 'Iniciar Grabación',
    speechFast: 'Corto',
    speechSlow: 'Largo',
    exportAll: 'Exportar Todo',
    importConfig: 'Importar Config',
    exportModelConfig: 'Exportar Config. Modelos',
    importModelConfig: 'Importar Config. Modelos',
    save: 'Guardar',
    selectModelToAdd: 'Seleccionar modelos para agregar',
    addSelectedModels: 'Agregar Modelos Seleccionados',
    filterModels: 'Filtrar modelos...',
    addModel: 'Agregar',
    modelsList: 'Lista de Modelos',
    addModelPlaceholder: 'Agregar modelo...',
    noModels: 'Sin modelos',
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
    send: 'Enviar',
    startRecording: 'Entrada de voz',
    stopRecording: 'Detener grabación',
    statsToggleOn: 'Ocultar estadísticas',
    statsToggleOff: 'Mostrar estadísticas',
    messageAlignLeftRight: 'Usuario der, AI izq',
    messageAlignBothLeft: 'Ambos a la izq'
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
  
  // More menu
  if (els.moreBtn) {
    els.moreBtn.textContent = currentLang === 'zh-CN' ? '\u66f4\u591a' : t('more');
  }

  // Config button
  if (els.configBtn) els.configBtn.textContent = t('apiConfig');
  
  // Model select placeholder
  if (els.modelSelect && els.modelSelect.querySelector('option')) {
    els.modelSelect.querySelector('option').textContent = t('selectModel');
  }
  
  // Thinking toggle
  if (els.thinkingToggleBtn) {
    els.thinkingToggleBtn.title = t('thinkingToggle');
    updateThinkingButton();
  }
  
  // Stats toggle
  updateStatsButton();
  
  // Align toggle
  updateAlignButton();
  
  // Clear button
  if (els.clearBtn) {
    els.clearBtn.textContent = t('clear');
    els.clearBtn.title = t('confirmClearHistory');
  }
  
  // Chat input placeholder
  if (els.chatInput) els.chatInput.placeholder = t('inputPlaceholder');
  
  // Send button
  if (els.sendBtn) els.sendBtn.textContent = t('send');
  
  // Mic button
  if (els.micBtn) els.micBtn.title = t('startRecording');
  
  // API Config Modal
  var apiModalH3 = document.querySelector('#api-config-modal h3');
  if (apiModalH3) apiModalH3.textContent = t('modelApiConfig');
  var apiSidebarHeader = document.querySelector('#api-config-modal .sidebar-header');
  if (apiSidebarHeader) apiSidebarHeader.textContent = t('providersList');
  if (els.addProviderBtn) els.addProviderBtn.textContent = t('addProvider');
  if (els.saveApiBtn) els.saveApiBtn.textContent = t('saveCurrentChanges');
  if (els.exportModelsBtn) els.exportModelsBtn.textContent = t('exportModelConfig');
  if (els.importModelsBtn) els.importModelsBtn.textContent = t('importModelConfig');
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
  var ctxReasoningEffortLabel = document.querySelector('label[for="ctx-reasoning-effort"]');
  if (ctxReasoningEffortLabel) ctxReasoningEffortLabel.textContent = t('reasoningEffort');
  if (els.exportBtn) els.exportBtn.textContent = t('exportAll');
  if (els.importBtn) els.importBtn.textContent = t('importConfig');
  if (els.saveCtxBtn) els.saveCtxBtn.textContent = t('save');
  
  // Speech Config Modal
  var speechTitle = document.getElementById('speech-config-title');
  if (speechTitle) speechTitle.textContent = t('speechConfigTitle');
  var speechLangLabel = document.getElementById('speech-lang-label');
  if (speechLangLabel) speechLangLabel.textContent = t('speechLangLabel');
  var speechSensitivityLabel = document.getElementById('speech-sensitivity-label');
  if (speechSensitivityLabel) speechSensitivityLabel.textContent = t('speechSensitivityLabel');
  if (els.speechStartBtn) els.speechStartBtn.textContent = t('speechStartBtn');
  
  // Model Selection Modal
  var modelModalH3 = document.querySelector('#model-selection-modal h3');
  if (modelModalH3) modelModalH3.textContent = t('selectModelToAdd');
  if (els.modelFilterInput) els.modelFilterInput.placeholder = t('filterModels');
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
let allAvailableModels = []; // Store all fetched models for filtering

let abortController = null;
let isGenerating = false;
let sendCount = 0;
let thinkingMode = 'default'; // Two modes: 'default', 'off'
let showStats = true;
let messageAlign = 'left-right'; // 'left-right' or 'both-left'

let speechConfig = {
  lang: currentLang === 'zh-CN' ? 'zh-CN' : currentLang === 'es' ? 'es' : 'en',
  silenceTimeout: 600
};

// History navigation state
let messageHistory = [];
let historyIndex = -1;
let historyBeforeNavigation = '';

// DOM Elements
const els = {
  contextBar: document.getElementById('context-bar'),
  chatContainer: document.getElementById('chat-container'),
  chatInput: document.getElementById('chat-input'),
  sendBtn: document.getElementById('send-btn'),
  imageBtn: document.getElementById('image-btn'),
  imageInput: document.getElementById('image-input'),
  imagePreviewContainer: document.getElementById('image-preview-container'),
  micBtn: document.getElementById('mic-btn'),
  modelSelect: document.getElementById('model-select'),
  thinkingToggleBtn: document.getElementById('thinking-toggle-btn'),
  statsToggleBtn: document.getElementById('stats-toggle-btn'),
  alignToggleBtn: document.getElementById('align-toggle-btn'),
  moreBtn: document.getElementById('more-btn'),
  moreMenu: document.getElementById('more-menu'),
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
  exportModelsBtn: document.getElementById('export-models-btn'),
  importModelsBtn: document.getElementById('import-models-btn'),
  importModelsFile: document.getElementById('import-models-file'),
  
  // Model Selection Elements
  modelCheckboxList: document.getElementById('model-checkbox-list'),
  modelFilterInput: document.getElementById('model-filter-input'),
  confirmModelBtn: document.getElementById('confirm-model-selection-btn'),

  // Context Config Elements
  ctxName: document.getElementById('ctx-name'),
  ctxSystem: document.getElementById('ctx-system-prompt'),
  ctxMaxHistory: document.getElementById('ctx-max-history'),
  ctxTemp: document.getElementById('ctx-temperature'),
  ctxTopP: document.getElementById('ctx-top-p'),
  ctxParams: document.getElementById('ctx-params'),
  ctxReasoningEffort: document.getElementById('ctx-reasoning-effort'),
  saveCtxBtn: document.getElementById('save-context-config-btn'),
  exportBtn: document.getElementById('export-data-btn'),
  importBtn: document.getElementById('import-data-btn'),
  importFile: document.getElementById('import-file'),
  speechModal: document.getElementById('speech-config-modal'),
  speechLangOptions: document.getElementById('speech-lang-options'),
  speechSensitivity: document.getElementById('speech-sensitivity'),
  speechSensitivityValue: document.getElementById('speech-sensitivity-value'),
  speechStartBtn: document.getElementById('speech-start-btn')
};

// --- Initialization ---

async function init() {
  await loadState();
  await loadLanguage();
  await loadMessageAlign();
  applyTranslations();
  updateStatsButton();
  updateAlignButton();
  updateMessageAlignment();
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
    state.providers = (state.providers || []).filter(p => !REMOVED_WEB_PROVIDER_IDS.has(p.id));
    
    // Migrate: ensure all providers have apiType and googleSearch fields
    state.providers.forEach(p => {
        if (!p.apiType) p.apiType = 'openai';
        if (p.googleSearch === undefined) p.googleSearch = false;
    });
    
    // Add default local provider if missing, at the end
    if (!state.providers.some(p => p.id === 'default-local')) {
      state.providers.push(DEFAULT_PROVIDER);
    }

    const fallbackProvider = state.providers[0];
    if (fallbackProvider) {
      state.contexts = (state.contexts || []).map(ctx => {
        if (!state.providers.some(p => p.id === ctx.modelProviderId)) {
          return {
            ...ctx,
            modelProviderId: fallbackProvider.id,
            modelId: fallbackProvider.models[0] || '',
            reasoningEffort: ctx.reasoningEffort || ''
          };
        }
        return { ...ctx, reasoningEffort: ctx.reasoningEffort || '' };
      });
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
    reasoningEffort: '',
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
  messageHistory = [];
  historyIndex = -1;
  historyBeforeNavigation = '';

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

async function loadMessageAlign() {
  const result = await chrome.storage.local.get(['sidebarMessageAlign']);
  if (result.sidebarMessageAlign) {
    messageAlign = result.sidebarMessageAlign;
  }
}

async function saveMessageAlign() {
  await chrome.storage.local.set({ sidebarMessageAlign: messageAlign });
}

function toggleMessageAlign() {
  messageAlign = messageAlign === 'left-right' ? 'both-left' : 'left-right';
  updateAlignButton();
  updateMessageAlignment();
  saveMessageAlign();
}

function updateAlignButton() {
  if (!els.alignToggleBtn) return;
  els.alignToggleBtn.textContent = currentLang === 'zh-CN' ? '\u5bf9\u9f50' : t('alignment');
  els.alignToggleBtn.classList.toggle('on', messageAlign === 'both-left');
  els.alignToggleBtn.title = messageAlign === 'left-right' ? t('messageAlignLeftRight') : t('messageAlignBothLeft');
}

function updateMessageAlignment() {
  els.chatContainer.classList.toggle('both-left', messageAlign === 'both-left');
}

function toggleThinking() {
  thinkingMode = thinkingMode === 'default' ? 'off' : 'default';
  updateThinkingButton();
}

function updateThinkingButton() {
  if (!els.thinkingToggleBtn) return;
  const labels = { default: '默认', off: '关' };
  els.thinkingToggleBtn.textContent = labels[thinkingMode] || '默认';
  els.thinkingToggleBtn.className = 'toggle-btn';
  if (thinkingMode !== 'default') {
    els.thinkingToggleBtn.classList.add(thinkingMode);
  }
}

function toggleStats() {
  showStats = !showStats;
  updateStatsButton();
  els.chatContainer.classList.toggle('hide-stats', !showStats);
}

function updateStatsButton() {
  if (!els.statsToggleBtn) return;
  els.statsToggleBtn.textContent = currentLang === 'zh-CN' ? '\u65f6\u95f4\u6307\u6807' : t('timingMetrics');
  els.statsToggleBtn.classList.toggle('on', showStats);
  els.statsToggleBtn.title = showStats ? t('statsToggleOn') : t('statsToggleOff');
}

function setMoreMenuOpen(open) {
  if (!els.moreMenu || !els.moreBtn) return;
  els.moreMenu.classList.toggle('hidden', !open);
  els.moreBtn.setAttribute('aria-expanded', String(open));
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
  updateMessageAlignment();
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
        let html = '';
        
        // Render images if present
        if (msg.images && msg.images.length > 0) {
            html += '<div class="message-images">';
            msg.images.forEach(img => {
                const src = typeof img.data === 'string' && (/^data:image\//i.test(img.data) || /^https:\/\//i.test(img.data)) ? img.data : '';
                html += `<img src="${escapeHtml(src)}" alt="${escapeHtml(img.name || '')}" class="message-image">`;
            });
            html += '</div>';
        }
        
        // Render text content
        if (msg.content && msg.content !== '[图片]') {
            html += parseMarkdown(msg.content);
        }
        
        return html;
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
  
  // Allow sending if there's content or images
  if (!content && selectedImages.length === 0) return;
  
  const ctx = getCurrentContext();
  if (!ctx) return;

  els.chatInput.value = '';
  adjustInputHeight();
  sendCount++;
  els.sendBtn.textContent = t('stop');
  isGenerating = true;
  
  // Create user message with images if present
  const userMsg = { 
    role: 'user', 
    content: content || '[图片]',
    images: selectedImages.length > 0 ? [...selectedImages] : null
  };
  
  // Clear selected images after creating message
  clearSelectedImages();
  
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
    if (ctx.maxHistory === 1) {
      history = [];
    } else if (ctx.maxHistory > 1) {
      history = history.slice(-(ctx.maxHistory - 1));
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
       ctx.messages.pop();
       msgDiv.innerHTML += `<br><span style="color:red">Error: ${escapeHtml(err.message)}</span>`;
    }
  } finally {
    sendCount--;
    if (sendCount <= 0) {
      sendCount = 0;
      isGenerating = false;
      els.sendBtn.textContent = t('send');
      abortController = null;
    }
    els.chatInput.focus();
  }
}

async function streamCompletion(provider, modelId, messages, settings, customParams, onChunk, signal) {
    const apiType = provider.apiType || 'openai';
    
    if (apiType === 'gemini') {
        return streamGeminiCompletion(provider, modelId, messages, settings, customParams, onChunk, signal);
    }
    
    // --- OpenAI-compatible path ---
    const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    // Format messages for API (handle multimodal content)
    const formattedMessages = formatMessagesForAPI(messages);
    
    const body = {
        model: modelId,
        messages: formattedMessages,
        temperature: parseFloat(settings.temperature),
        top_p: parseFloat(settings.topP),
        stream: true,
        stream_options: { include_usage: true },
        ...customParams
    };
    
    if (settings.reasoningEffort) {
        body.reasoning_effort = settings.reasoningEffort;
    }
    
    // Handle thinking parameter: default=no param, off=explicitly disable (DeepSeek)
    if (thinkingMode === 'off') {
        body.thinking = { type: "disabled" };
    }
    // default: no parameter (let API decide)

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`,
            'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(body),
        signal,
        cache: 'no-cache'
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

async function streamGeminiCompletion(provider, modelId, messages, settings, customParams, onChunk, signal) {
    // Normalize baseUrl for Gemini
    let rawUrl = provider.baseUrl;
    if (!rawUrl || rawUrl === 'https://api.openai.com/v1') {
        rawUrl = 'https://generativelanguage.googleapis.com/v1beta';
    }
    const baseUrl = rawUrl.replace(/\/$/, '');
    const url = `${baseUrl}/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`;

    // Build Gemini contents array and extract system instruction
    let systemInstruction = null;
    const contents = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            systemInstruction = msg.content;
            continue;
        }

        const parts = [];
        // Text part
        if (msg.content) {
            parts.push({ text: msg.content });
        }
        // Image parts (for user messages with images)
        if (msg.images && msg.images.length > 0) {
            for (const img of msg.images) {
                // Parse data URL: "data:image/jpeg;base64,/9j..."
                const match = img.data.match(/^data:(.+?);base64,(.+)$/);
                if (match) {
                    parts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2]
                        }
                    });
                }
            }
        }

        const geminiRole = msg.role === 'assistant' ? 'model' : msg.role;
        contents.push({
            role: geminiRole,
            parts: parts
        });
    }

    const body = {
        contents: contents,
        generationConfig: {
            temperature: parseFloat(settings.temperature),
            topP: parseFloat(settings.topP)
        }
    };

    if (settings.reasoningEffort) {
        body.reasoning_effort = settings.reasoningEffort;
    }

    if (systemInstruction) {
        body.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }

    // Google Search Grounding
    if (provider.googleSearch) {
        body.tools = [{ google_search: {} }];
    }

    // Handle thinking parameter based on the toggle
    // Note: includeThoughts works on Gemini 2.5/3 models
    // 'off' and 'default' both omit the param to avoid errors on models that don't support thinkingConfig
    if (thinkingMode === 'on') {
        body.thinkingConfig = { includeThoughts: true };
    }
    // 'off' / 'default' = no param (let API decide)

    // Merge custom params (allow overriding generationConfig etc.)
    Object.assign(body, customParams);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': provider.apiKey,
            'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(body),
        signal,
        cache: 'no-cache'
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Gemini API Error: ${response.status}${text ? ' - ' + text.slice(0, 300) : ''}`);
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
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;
                try {
                    const data = JSON.parse(dataStr);
                    const candidate = data.candidates && data.candidates[0];
                    const parts = candidate?.content?.parts;
                    const usageMeta = data.usageMetadata || null;
                    let usage = null;
                    if (usageMeta) {
                        usage = {
                            completion_tokens: usageMeta.candidatesTokenCount || 0,
                            prompt_tokens: usageMeta.promptTokenCount || 0,
                            total_tokens: usageMeta.totalTokenCount || 0
                        };
                    }
                    // Gemini thinking response: parts[0] = thinking (thought:true), parts[1] = answer
                    // For non-thinking models, parts[0] = answer
                    if (parts && parts.length > 0) {
                        for (const p of parts) {
                            const text = p.text || '';
                            const isThought = p.thought === true;
                            if (text) {
                                onChunk(text, null, isThought);
                            }
                        }
                    }
                    if (usage) {
                        onChunk('', usage, false);
                    }
                } catch (e) {}
            }
        }
    }
}

// --- Utils ---

// Image handling functions
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderImagePreviews() {
    if (selectedImages.length === 0) {
        els.imagePreviewContainer.classList.add('hidden');
        els.imagePreviewContainer.innerHTML = '';
        return;
    }
    
    els.imagePreviewContainer.classList.remove('hidden');
    els.imagePreviewContainer.innerHTML = selectedImages.map((img, index) => `
        <div class="image-preview-item" data-index="${index}">
            <img src="${img.data}" alt="${img.name}">
            <button class="remove-image-btn" data-index="${index}">&times;</button>
        </div>
    `).join('');
    
    // Add remove button handlers
    els.imagePreviewContainer.querySelectorAll('.remove-image-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            selectedImages.splice(index, 1);
            renderImagePreviews();
        });
    });
}

function clearSelectedImages() {
    selectedImages = [];
    renderImagePreviews();
}

// --- Speech Recognition ---

const SPEECH_LANG_MAP = { 'zh-CN': 'zh-CN', 'en': 'en-US', 'es': 'es-ES' };

let speechAccumulator = '';
let speechFlushTimer = null;

function flushAccumulator() {
    if (!speechAccumulator.trim()) return;
    const t = speechAccumulator;
    speechAccumulator = '';
    els.chatInput.value = t;
    sendMessage();
}

function scheduleFlush() {
    clearTimeout(speechFlushTimer);
    speechFlushTimer = setTimeout(flushAccumulator, speechConfig.silenceTimeout);
}

function updatePlaceholder() {
    const acc = speechAccumulator.trim();
    els.chatInput.placeholder = acc ? '🎤 [' + acc + ']' : t('inputPlaceholder');
}

function createSpeechRecognizer() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        els.micBtn.style.display = 'none';
        return null;
    }
    const sr = new SpeechRecognition();
    sr.continuous = false;
    sr.interimResults = true;
    sr.lang = SPEECH_LANG_MAP[speechConfig.lang] || 'en-US';
    return sr;
}

function startRecording() {
    speechAccumulator = '';
    speechFlushTimer = null;
    isRecording = true;
    els.micBtn.classList.add('recording');
    els.micBtn.title = t('stopRecording');
    updatePlaceholder();
    startSpeechSession();
}

function startSpeechSession() {
    if (!isRecording) return;

    const sr = createSpeechRecognizer();
    if (!sr) { stopRecording(); return; }

    let speechBuffer = '';

    sr.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        speechBuffer = result[0].transcript;
        els.chatInput.placeholder = '🎤 [' + speechAccumulator + (speechAccumulator && speechBuffer ? ' ' : '') + speechBuffer + ']';
    };

    sr.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            stopRecording();
        } else if (isRecording) {
            setTimeout(startSpeechSession, 200);
        }
    };

    sr.onend = () => {
        if (speechBuffer.trim()) {
            const punct = speechConfig.lang === 'zh-CN' ? '。' : '. ';
            if (speechAccumulator) speechAccumulator += punct;
            speechAccumulator += speechBuffer.trim();
            scheduleFlush();
            updatePlaceholder();
        }
        if (isRecording) {
            setTimeout(startSpeechSession, 100);
        }
    };

    try {
        sr.start();
        recognition = sr;
    } catch(e) {
        console.error('Speech start failed:', e);
        if (isRecording) {
            setTimeout(startSpeechSession, 500);
        }
    }
}

function stopRecording() {
    isRecording = false;
    if (recognition) {
        try {
            recognition.onend = null;
            recognition.stop();
        } catch(e) {}
    }
    recognition = null;
    clearTimeout(speechFlushTimer);
    flushAccumulator();
    els.micBtn.classList.remove('recording');
    els.micBtn.title = t('startRecording');
    els.chatInput.placeholder = t('inputPlaceholder');
}

// --- Speech Config Modal ---

function openSpeechConfig() {
    if (isRecording) { stopRecording(); return; }
    els.speechModal.classList.remove('hidden');
    renderSpeechConfig();
}

function renderSpeechConfig() {
    const lang = speechConfig.lang;
    els.speechLangOptions.querySelectorAll('.speech-lang-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.lang === lang);
    });
    els.speechSensitivity.value = speechConfig.silenceTimeout;
    els.speechSensitivityValue.textContent = speechConfig.silenceTimeout + 'ms';

    els.speechLangOptions.querySelectorAll('.speech-lang-option').forEach(btn => {
        btn.onclick = () => {
            els.speechLangOptions.querySelectorAll('.speech-lang-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            speechConfig.lang = btn.dataset.lang;
        };
    });

    els.speechSensitivity.oninput = () => {
        const val = parseInt(els.speechSensitivity.value);
        speechConfig.silenceTimeout = val;
        els.speechSensitivityValue.textContent = val + 'ms';
    };

    els.speechStartBtn.onclick = () => {
        els.speechModal.classList.add('hidden');
        startRecording();
    };
}

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        openSpeechConfig();
    }
}

// Convert messages to API format with multimodal content
function formatMessagesForAPI(messages) {
    return messages.map(msg => {
        if (msg.images && msg.images.length > 0) {
            // Convert to multimodal content format
            const content = [];
            
            // Add text content if present
            if (msg.content && msg.content !== '[图片]') {
                content.push({
                    type: 'text',
                    text: msg.content
                });
            }
            
            // Add images
            msg.images.forEach(img => {
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: img.data
                    }
                });
            });
            
            return {
                role: msg.role,
                content: content
            };
        }
        return { role: msg.role, content: msg.content || '' };
    });
}

function parseMarkdown(text) {
  if (!text) return '';
  let safeText = escapeHtml(String(text));
  const codeBlocks = [];
  safeText = safeText.replace(/```([\s\S]*?)```/g, (_, code) => {
    const token = `\u0000CODE${codeBlocks.length}\u0000`;
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return token;
  });
  safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  safeText = safeText.replace(/\n/g, '<br>');
  return safeText.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeBlocks[Number(index)] || '');
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  // History navigation with Up/Down arrows
  if (e.key === 'ArrowUp' && !e.shiftKey) {
    const ctx = getCurrentContext();
    const liveMsgs = ctx ? ctx.messages.filter(m => m.role === 'user' && m.content && m.content !== '[图片]') : [];
    const pool = liveMsgs.length > 0 ? liveMsgs : messageHistory.map(c => ({ content: c }));
    if (pool.length === 0) return;
    e.preventDefault();
    if (historyIndex === -1) {
      historyBeforeNavigation = els.chatInput.value;
    }
    if (historyIndex < pool.length - 1) {
      historyIndex++;
      els.chatInput.value = pool[pool.length - 1 - historyIndex].content;
    }
    adjustInputHeight();
    return;
  }

  if (e.key === 'ArrowDown' && !e.shiftKey) {
    const ctx = getCurrentContext();
    if (historyIndex === -1) return;
    const liveMsgs = ctx ? ctx.messages.filter(m => m.role === 'user' && m.content && m.content !== '[图片]') : [];
    const pool = liveMsgs.length > 0 ? liveMsgs : messageHistory.map(c => ({ content: c }));
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      els.chatInput.value = pool[pool.length - 1 - historyIndex].content;
    } else {
      historyIndex = -1;
      els.chatInput.value = historyBeforeNavigation;
    }
    adjustInputHeight();
    return;
  }

  if (e.key === 'Enter') {
            if (e.shiftKey) {
                setTimeout(adjustInputHeight, 0);
            } else {
                e.preventDefault();
                sendMessage();
            }
        }
  if (e.key === 'Delete' && e.ctrlKey) {
    e.preventDefault();
    const ctx = getCurrentContext();
    if (ctx) {
      messageHistory = ctx.messages.filter(m => m.role === 'user' && m.content && m.content !== '[图片]').map(m => m.content);
      historyIndex = -1;
      historyBeforeNavigation = '';
      ctx.messages = [];
      saveState();
      renderMessages([]);
    }
    return;
  }
    });
    
    els.chatInput.addEventListener('input', () => {
  adjustInputHeight();
  if (historyIndex !== -1) {
    historyIndex = -1;
    historyBeforeNavigation = '';
  }
});
    
    els.sendBtn.addEventListener('click', () => {
        if (isGenerating && abortController) {
            abortController.abort();
        } else {
            sendMessage();
        }
    });

    // Image upload handling
    els.imageBtn.addEventListener('click', () => {
        els.imageInput.click();
    });

    els.imageInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const base64 = await fileToBase64(file);
                selectedImages.push({
                    name: file.name,
                    type: file.type,
                    data: base64
                });
            }
        }
        renderImagePreviews();
        els.imageInput.value = ''; // Reset to allow selecting same file again
    });

    // Speech recognition
    els.micBtn.addEventListener('click', toggleRecording);

    els.clearBtn.addEventListener('click', () => {
        const ctx = getCurrentContext();
        if(ctx) {
            ctx.messages = [];
            saveState();
            renderMessages([]);
        }
    });
    
    els.modelSelect.addEventListener('change', updateCurrentContextModel);
    els.thinkingToggleBtn.addEventListener('click', toggleThinking);
    els.statsToggleBtn.addEventListener('click', toggleStats);
    els.alignToggleBtn.addEventListener('click', toggleMessageAlign);
    els.configBtn.addEventListener('click', openApiModal);

    els.moreBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        setMoreMenuOpen(els.moreMenu.classList.contains('hidden'));
    });
    els.moreMenu.addEventListener('click', (event) => {
        event.stopPropagation();
        setMoreMenuOpen(false);
    });
    
    document.addEventListener('click', () => {
        els.contextMenu.classList.add('hidden');
        setMoreMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setMoreMenuOpen(false);
    });
    
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
    
    els.exportModelsBtn.addEventListener('click', exportModelConfig);
    els.importModelsBtn.addEventListener('click', () => els.importModelsFile.click());
    els.importModelsFile.addEventListener('change', importModelConfig);
    
    els.contextMenu.querySelector('[data-action="edit"]').addEventListener('click', openContextConfig);
    els.contextMenu.querySelector('[data-action="delete"]').addEventListener('click', () => {
       const id = els.contextMenu.dataset.contextId;
       if(confirm(t('confirmDeleteContext'))) {
           deleteContext(id);
       }
    });

    els.confirmModelBtn.addEventListener('click', confirmModelSelection);
    
    // Model filter input
    els.modelFilterInput.addEventListener('input', (e) => {
        renderModelCheckboxList(allAvailableModels, e.target.value);
    });

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

function renderModelsList(provider) {
    const modelsListEl = document.getElementById('p-edit-models-list');
    if (!modelsListEl) return;
    
    modelsListEl.innerHTML = '';
    
    if (provider.models.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-models';
        emptyMsg.textContent = t('noModels');
        modelsListEl.appendChild(emptyMsg);
        return;
    }
    
    const isBuiltin = provider.isBuiltin === true;
    
    provider.models.forEach(model => {
        const modelItem = document.createElement('div');
        modelItem.className = 'model-item';
        
        if (isBuiltin) {
            // Builtin provider models are readonly
            modelItem.innerHTML = `
                <span class="model-name">${escapeHtml(model)}</span>
            `;
        } else {
            // Normal provider models can be deleted
            modelItem.innerHTML = `
                <span class="model-name">${escapeHtml(model)}</span>
                <button class="delete-model-btn" data-model="${escapeHtml(model)}" title="删除模型">×</button>
            `;
            
            // Delete button click handler
            const deleteBtn = modelItem.querySelector('.delete-model-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    provider.models = provider.models.filter(m => m !== model);
                    renderModelsList(provider);
                    renderProvidersList();
                });
            }
        }
        
        modelsListEl.appendChild(modelItem);
    });
}

function renderProviderForm() {
    const p = tempProviders.find(tp => tp.id === currentEditingProviderId);
    if (!p) {
        els.providerForm.innerHTML = '<div class="empty-state">请选择左侧供应商进行编辑</div>';
        return;
    }
    
    const isDefault = (p.id === 'default-local');

    const isBuiltin = p.isBuiltin === true;
    
    const apiType = p.apiType || 'openai';

    // Normalize baseUrl based on apiType
    if (apiType === 'gemini' && p.baseUrl !== 'https://generativelanguage.googleapis.com/v1beta') {
        p.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    }

    let formHtml = `
        <div class="form-group">
            <label>名称</label>
            <input type="text" id="p-edit-name" value="${escapeHtml(p.name)}" ${isDefault || isBuiltin ? 'readonly' : ''}>
        </div>
        <div class="form-group">
            <label>API Type</label>
            <select id="p-edit-api-type" ${isDefault || isBuiltin ? 'disabled' : ''}>
                <option value="openai" ${apiType === 'openai' ? 'selected' : ''}>OpenAI Compatible</option>
                <option value="gemini" ${apiType === 'gemini' ? 'selected' : ''}>Gemini API</option>
            </select>
        </div>`;
        
    formHtml += `
        <div class="form-group" id="p-edit-url-group"${apiType === 'gemini' ? ' style="display:none"' : ''}>
            <label>Base URL</label>
            <input type="text" id="p-edit-url" value="${escapeHtml(p.baseUrl)}">
        </div>`;
    
    formHtml += `
        <div class="form-group">
            <label>API Key</label>
            <div class="password-input-wrapper">
                <input type="password" id="p-edit-key" autocomplete="new-password" value="${escapeHtml(p.apiKey || '')}">
                <button type="button" id="toggle-key-visibility-btn" class="icon-btn" title="显示/隐藏 API Key">👁️</button>
            </div>
        </div>
        <div class="form-group" id="p-edit-google-search-group"${apiType !== 'gemini' ? ' style="display:none"' : ''}>
            <label>
                <input type="checkbox" id="p-edit-google-search" ${p.googleSearch ? 'checked' : ''}>
                Google Search Grounding
            </label>
            <div style="font-size:11px;color:var(--secondary-text-color);margin-top:4px;">
                Enables the model to search Google for real-time information
            </div>
        </div>
        <div class="form-group">
            <label>${t('modelsList')}</label>
            <div id="p-edit-models-list" class="models-list"></div>`;
            
    if (!isBuiltin) {
        formHtml += `
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <input type="text" id="p-add-model-input" placeholder="${t('addModelPlaceholder')}" style="flex:1">
                <button id="add-model-btn" class="secondary-btn" style="white-space:nowrap; padding: 8px;">${t('addModel')}</button>
                <button id="test-fetch-btn" class="secondary-btn" style="white-space:nowrap; padding: 8px;">获取模型</button>
            </div>`;
    }
    
    formHtml += `
        </div>
        ${!isDefault && !isBuiltin ? '<button class="danger-text" id="delete-provider-btn">删除此供应商</button>' : ''}
    `;
    
    els.providerForm.innerHTML = formHtml;

    const nameInput = document.getElementById('p-edit-name');
    const urlInput = document.getElementById('p-edit-url');
    const urlGroup = document.getElementById('p-edit-url-group');
    const apiTypeSelect = document.getElementById('p-edit-api-type');
    const keyInput = document.getElementById('p-edit-key');
    const toggleKeyBtn = document.getElementById('toggle-key-visibility-btn');
    const testBtn = document.getElementById('test-fetch-btn');
    const addModelBtn = document.getElementById('add-model-btn');
    const addModelInput = document.getElementById('p-add-model-input');
    const googleSearchGroup = document.getElementById('p-edit-google-search-group');
    const googleSearchCheckbox = document.getElementById('p-edit-google-search');

    toggleKeyBtn.addEventListener('click', () => {
        if (keyInput.type === 'password') {
            keyInput.type = 'text';
            toggleKeyBtn.textContent = '🔒';
        } else {
            keyInput.type = 'password';
            toggleKeyBtn.textContent = '👁️';
        }
    });

    if (testBtn) {
        testBtn.addEventListener('click', () => {
            const baseUrl = urlInput ? urlInput.value : (p.baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
            fetchModelsAndShowModal(baseUrl, keyInput.value || p.apiKey, apiTypeSelect ? apiTypeSelect.value : 'openai');
        });
    }
    
    // API Type change handler
    if (apiTypeSelect) {
        apiTypeSelect.addEventListener('change', () => {
            const selectedType = apiTypeSelect.value;
            p.apiType = selectedType;
            if (selectedType === 'gemini') {
                if (urlGroup) urlGroup.style.display = 'none';
                if (googleSearchGroup) googleSearchGroup.style.display = '';
                // Default to Gemini endpoint if still OpenAI default
                if (p.baseUrl === 'https://api.openai.com/v1') {
                    p.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
                    if (urlInput) urlInput.value = p.baseUrl;
                }
            } else {
                if (urlGroup) urlGroup.style.display = '';
                if (googleSearchGroup) googleSearchGroup.style.display = 'none';
            }
            renderProvidersList();
        });
    }
    
    // Render the models list
    renderModelsList(p);
    
    // Add model button (only for non-builtin providers)
    if (addModelBtn && addModelInput) {
        addModelBtn.addEventListener('click', () => {
            const modelName = addModelInput.value.trim();
            if (modelName && !p.models.includes(modelName)) {
                p.models.push(modelName);
                renderModelsList(p);
                addModelInput.value = '';
                renderProvidersList();
            }
        });
        
        // Allow Enter key to add model
        addModelInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addModelBtn.click();
            }
        });
    }
    
    const updateHandler = () => {
        p.name = nameInput.value;
        if (urlInput) {
            p.baseUrl = urlInput.value;
        }
        if (apiTypeSelect) {
            p.apiType = apiTypeSelect.value;
        }
        if (googleSearchCheckbox) {
            p.googleSearch = googleSearchCheckbox.checked;
        }
        if (keyInput.value) p.apiKey = keyInput.value;
        renderProvidersList(); 
    };

    nameInput.addEventListener('input', updateHandler);
    if (urlInput) {
        urlInput.addEventListener('input', updateHandler);
    }
    if (apiTypeSelect) {
        apiTypeSelect.addEventListener('change', updateHandler);
    }
    if (googleSearchCheckbox) {
        googleSearchCheckbox.addEventListener('change', updateHandler);
    }
    keyInput.addEventListener('input', updateHandler);

    if (!isDefault && !isBuiltin && document.getElementById('delete-provider-btn')) {
        document.getElementById('delete-provider-btn').addEventListener('click', () => {
            if(confirm(t('confirmDeleteProvider'))) {
                tempProviders = tempProviders.filter(tp => tp.id !== p.id);
                currentEditingProviderId = tempProviders[0]?.id || null;
                renderApiConfigUI();
            }
        });
    }
}

async function fetchModelsAndShowModal(url, key, apiType) {
    const baseUrl = url.replace(/\/$/, '');
    const btn = document.getElementById('test-fetch-btn');
    
    btn.textContent = t('connecting');
    btn.disabled = true;
    
    try {
        if (apiType === 'gemini') {
            // Gemini models list endpoint
            const encodedKey = encodeURIComponent(key);
            const fetchUrl = `${baseUrl}/models?key=${encodedKey}`;
            const debug = `baseUrl="${baseUrl}" keyLen=${key.length} apiType=${apiType}`;
            const res = await fetch(fetchUrl, { method: 'GET' });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(`Status ${res.status}\n${debug}\n${body ? body.slice(0, 200) : ''}`);
            }
            const data = await res.json();
            if (data.models && Array.isArray(data.models)) {
                const modelIds = data.models.map(m => m.name.replace('models/', ''));
                if (modelIds.length > 0) {
                    allAvailableModels = modelIds;
                    els.modelFilterInput.value = '';
                    renderModelCheckboxList(modelIds);
                    els.modelModal.classList.remove('hidden');
                } else {
                    alert(t('connectionSuccessNoModels'));
                }
            } else {
                alert(t('connectionSuccessWrongFormat'));
            }
        } else {
            const res = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${key}` }
            });
            
            if (!res.ok) throw new Error(`Status ${res.status}`);
            
            const data = await res.json();
            if (data.data && Array.isArray(data.data)) {
                const modelIds = data.data.map(m => m.id);
                if (modelIds.length > 0) {
                    // Store all models for filtering
                    allAvailableModels = modelIds;
                    // Clear filter input
                    els.modelFilterInput.value = '';
                    // Show modal
                    renderModelCheckboxList(modelIds);
                    els.modelModal.classList.remove('hidden');
                } else {
                    alert(t('connectionSuccessNoModels'));
                }
            } else {
                alert(t('connectionSuccessWrongFormat'));
            }
        }
    } catch (e) {
        alert(t('connectionFailed') + e.message);
    } finally {
        btn.textContent = '获取模型';
        btn.disabled = false;
    }
}

function renderModelCheckboxList(models, filterText = '') {
    els.modelCheckboxList.innerHTML = '';
    
    // Get current provider's existing models
    const p = tempProviders.find(tp => tp.id === currentEditingProviderId);
    const existingModels = p ? new Set(p.models) : new Set();
    
    // Filter models based on filter text (fuzzy matching)
    let filteredModels = models;
    if (filterText && filterText.trim()) {
        const filter = filterText.toLowerCase().trim();
        filteredModels = models.filter(m => 
            m.toLowerCase().includes(filter)
        );
    }
    
    // Sort alphabetically
    filteredModels.sort().forEach(m => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        const isChecked = existingModels.has(m);
        div.innerHTML = `
            <input type="checkbox" value="${escapeHtml(m)}" id="model-cb-${escapeHtml(m)}" ${isChecked ? 'checked' : ''}>
            <label for="model-cb-${escapeHtml(m)}">${escapeHtml(m)}</label>
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
    
    // Show message if no models match filter
    if (filteredModels.length === 0 && filterText.trim()) {
        const noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.textContent = '没有匹配的模型';
        els.modelCheckboxList.appendChild(noResults);
    }
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
    
    // Refresh the models list display
    renderModelsList(p);
    renderProvidersList();
    
    els.modelModal.classList.add('hidden');
}

function addProviderUI() {
    const newId = Date.now().toString();
    tempProviders.push({
        id: newId,
        name: 'New Provider',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        models: ['gpt-3.5-turbo'],
        apiType: 'openai',
        googleSearch: false
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
    els.ctxReasoningEffort.value = ctx.reasoningEffort || '';
    
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
        ctx.reasoningEffort = els.ctxReasoningEffort.value.trim();
        
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

function exportModelConfig() {
    const modelConfig = {
        providers: state.providers,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(modelConfig, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "model_config.json");
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

function importModelConfig(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const json = JSON.parse(e.target.result);
            if (json.providers && Array.isArray(json.providers)) {
                // Merge imported providers with existing ones
                const existingIds = new Set(state.providers.map(p => p.id));
                let addedCount = 0;
                
                json.providers.forEach(provider => {
                    if (!existingIds.has(provider.id)) {
                        if (!provider.apiType) provider.apiType = 'openai';
                        if (provider.googleSearch === undefined) provider.googleSearch = false;
                        state.providers.push(provider);
                        addedCount++;
                    }
                });
                
                await saveState();
                alert(`成功导入 ${addedCount} 个供应商配置`);
                
                // Refresh the UI if the modal is open
                if (!els.apiModal.classList.contains('hidden')) {
                    tempProviders = JSON.parse(JSON.stringify(state.providers));
                    renderProvidersList();
                }
            } else {
                alert('无效的模型配置文件');
            }
        } catch (err) {
            alert('导入失败: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// Start
init();
