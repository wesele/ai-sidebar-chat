import type { ApplyResultPayload, EditorViewState, TargetLanguage } from '../shared/messages';
import { normalizeThinkingMode, type ThinkingMode } from '../shared/thinking';

export interface WritingSettings {
  providerId: string;
  modelId: string;
  invocationStrategy: 'batch' | 'parallel';
  maxConcurrency: number;
  activationMode: 'always' | 'panel_open' | 'off';
  fullDocumentCharacterLimit: number;
  targetLanguage: TargetLanguage;
  replacementFontScale: number;
  replacementTextColor: string;
  replacementBackgroundColor: string;
  thinkingMode?: ThinkingMode;
  /** Legacy setting retained for persisted configuration migration. */
  disableThinking?: boolean;
  /** When true, uses structured outputs / constrained decoding (json_schema for OpenAI, responseSchema for Gemini) */
  constrainedDecoding?: boolean;
}

export const defaults: WritingSettings = {
  providerId: '',
  modelId: '',
  invocationStrategy: 'batch',
  maxConcurrency: 3,
  activationMode: 'always',
  fullDocumentCharacterLimit: 20_000,
  targetLanguage: 'EN',
  replacementFontScale: 0.8,
  replacementTextColor: '#b85000',
  replacementBackgroundColor: '#fff3e680',
  thinkingMode: 'auto-off',
  constrainedDecoding: false,
};

const TEXT_COLOR_PRESETS: readonly string[] = [
  '#b85000',
  '#c2410c',
  '#b91c1c',
  '#9d174d',
  '#6d28d9',
  '#1d4ed8',
  '#0f766e',
  '#3f6212',
];

const BACKGROUND_COLOR_PRESETS: readonly string[] = [
  '#fff3e680',
  '#fef3c780',
  '#fee2e280',
  '#fce7f380',
  '#ede9fe80',
  '#dbeafe80',
  '#d1fae580',
  'transparent',
];

type PublicProvider = { id: string; name: string; models: string[] };
type IssueScope = 'local' | 'sentence' | 'paragraph';

export type UILanguage = 'zh-CN' | 'en' | 'es';

const waTranslations: Record<UILanguage, Record<string, string>> = {
  'zh-CN': {
    title: '写作助手',
    focusToStart: '聚焦一个编辑器以开始',
    waitingForModel: '等待配置模型',
    textTooLong: '文本过长，全文检测暂停',
    detecting: '正在检测…',
    allCompleted: '全部检测完毕',
    detectionFailed: '检测失败（点击查看原因）',
    clickToViewError: '点击查看具体错误信息',
    retry: '重试',
    targetLang: '写作语言',
    settings: '配置',
    model: '模型',
    issueCounts: '问题计数',
    local: '局部',
    sentence: '句子',
    paragraph: '段落',
    full: '全文',
    contentChanged: '内容已变化，建议已刷新。',
    apply: '应用',
    reviewing: '正在评审…',
    noFullTextSuggestions: '暂无全文建议',
    cancel: '取消',
    confirmApplyAll: '确认全部应用',
    close: '关闭',
    provider: '供应商',
    invocationStrategy: '调用策略',
    batchMerge: '批量合并',
    parallelSingle: '单项并发',
    maxConcurrency: '最大并发',
    characterLimit: '全文字符上限',
    fontScale: '修正文字大小（相对）',
    textColor: '修正文字颜色',
    backgroundColor: '修正文字背景色',
    opacity: '不透明度',
    transparent: '透明',
    activationMode: '激活模式',
    activationAlways: '始终激活',
    activationPanelOpen: '仅侧边栏打开时',
    activationOff: '关闭',
    thinkingMode: '思考模式',
    thinkingDefault: '默认',
    thinkingAutoOff: '关 (Auto)',
    constrainedDecoding: '启用约束性解码',
    saveSettings: '保存配置',
    errorModalTitle: '检测失败原因',
    retryDetection: '重试检测',
  },
  'en': {
    title: 'Writing Assistant',
    focusToStart: 'Focus an editor to start',
    waitingForModel: 'Waiting for model configuration',
    textTooLong: 'Text too long, full analysis paused',
    detecting: 'Analyzing...',
    allCompleted: 'All checks completed',
    detectionFailed: 'Detection failed (click to view reason)',
    clickToViewError: 'Click to view error details',
    retry: 'Retry',
    targetLang: 'Target Language',
    settings: 'Settings',
    model: 'Model',
    issueCounts: 'Issue Counts',
    local: 'Local',
    sentence: 'Sentence',
    paragraph: 'Paragraph',
    full: 'Full Text',
    contentChanged: 'Content changed, suggestions refreshed.',
    apply: 'Apply',
    reviewing: 'Reviewing...',
    noFullTextSuggestions: 'No full text suggestions',
    cancel: 'Cancel',
    confirmApplyAll: 'Confirm Apply All',
    close: 'Close',
    provider: 'Provider',
    invocationStrategy: 'Invocation Strategy',
    batchMerge: 'Batch Merge',
    parallelSingle: 'Parallel Single',
    maxConcurrency: 'Max Concurrency',
    characterLimit: 'Character Limit',
    fontScale: 'Font Scale (Relative)',
    textColor: 'Text Color',
    backgroundColor: 'Background Color',
    opacity: 'Opacity',
    transparent: 'Transparent',
    activationMode: 'Activation Mode',
    activationAlways: 'Always',
    activationPanelOpen: 'Panel Open Only',
    activationOff: 'Off',
    thinkingMode: 'Thinking mode',
    thinkingDefault: 'Default',
    thinkingAutoOff: 'Off (Auto)',
    constrainedDecoding: 'Enable Constrained Decoding',
    saveSettings: 'Save Settings',
    errorModalTitle: 'Detection Failure Reason',
    retryDetection: 'Retry Detection',
  },
  'es': {
    title: 'Asistente de Escritura',
    focusToStart: 'Enfoca un editor para comenzar',
    waitingForModel: 'Esperando configuración del modelo',
    textTooLong: 'Texto demasiado largo, análisis pausado',
    detecting: 'Analizando...',
    allCompleted: 'Todas las comprobaciones completadas',
    detectionFailed: 'Detección fallida (haz clic para ver la razón)',
    clickToViewError: 'Haz clic para ver los detalles del error',
    retry: 'Reintentar',
    targetLang: 'Idioma de escritura',
    settings: 'Configuración',
    model: 'Modelo',
    issueCounts: 'Conteo de problemas',
    local: 'Local',
    sentence: 'Oración',
    paragraph: 'Párrafo',
    full: 'Texto Completo',
    contentChanged: 'El contenido ha cambiado, sugerencias actualizadas.',
    apply: 'Aplicar',
    reviewing: 'Revisando...',
    noFullTextSuggestions: 'Sin sugerencias de texto completo',
    cancel: 'Cancelar',
    confirmApplyAll: 'Confirmar Aplicar Todo',
    close: 'Cerrar',
    provider: 'Proveedor',
    invocationStrategy: 'Estrategia de invocación',
    batchMerge: 'Combinación en lote',
    parallelSingle: 'Concurrencia individual',
    maxConcurrency: 'Concurrencia máxima',
    characterLimit: 'Límite de caracteres',
    fontScale: 'Escala de fuente (relativa)',
    textColor: 'Color de texto',
    backgroundColor: 'Color de fondo',
    opacity: 'Opacidad',
    transparent: 'Transparente',
    activationMode: 'Modo de activación',
    activationAlways: 'Siempre',
    activationPanelOpen: 'Solo panel abierto',
    activationOff: 'Desactivado',
    thinkingMode: 'Modo de pensamiento',
    thinkingDefault: 'Predeterminado',
    thinkingAutoOff: 'Apagado (Auto)',
    constrainedDecoding: 'Habilitar decodificación restringida',
    saveSettings: 'Guardar Configuración',
    errorModalTitle: 'Razón de Falla de Detección',
    retryDetection: 'Reintentar Detección',
  }
};

export class WritingAssistantPanel {
  private state?: EditorViewState;
  private uiLanguage: UILanguage = 'zh-CN';

  setLanguage(lang: string): void {
    const normalized: UILanguage = lang === 'en' ? 'en' : lang === 'es' ? 'es' : 'zh-CN';
    if (this.uiLanguage !== normalized) {
      this.uiLanguage = normalized;
      this.render();
    }
  }

  private t(key: keyof typeof waTranslations['zh-CN']): string {
    return waTranslations[this.uiLanguage]?.[key] ?? waTranslations['zh-CN'][key] ?? key;
  }

  private getScopeLabel(scope: 'local' | 'sentence' | 'paragraph' | 'full'): string {
    return this.t(scope);
  }
  private tabId?: number;
  private providers: PublicProvider[] = [];
  private settings: WritingSettings = { ...defaults };
  private settingsOpen = false;
  private settingsDialog?: HTMLElement;
  private previewScope?: IssueScope;
  private applyResult?: ApplyResultPayload;
  private showFullText = false;
  private showErrorModal = false;
  private errorModalBackdrop?: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly persist: (settings: WritingSettings) => Promise<void>,
    private readonly command: (
      type: 'APPLY_ISSUE' | 'APPLY_ALL' | 'RETRY_DETECTION' | 'REQUEST_FULL_ANALYSIS',
      payload: { tabId: number; editorId: string; revision: number; issueId: string } | {
        tabId: number;
        editorId: string;
        revision: number;
        scope: IssueScope;
        expectedCount: number;
      } | {
        tabId?: number;
      },
    ) => void,
  ) {
    this.render();
  }

  setState(state: EditorViewState, tabId = this.tabId): void {
    if (this.tabId !== undefined && tabId !== this.tabId) {
      this.previewScope = undefined;
      this.applyResult = undefined;
      this.showFullText = false;
      this.showErrorModal = false;
    } else if (this.state?.editorId !== undefined && this.state.editorId !== state.editorId) {
      this.previewScope = undefined;
      this.applyResult = undefined;
      this.showFullText = false;
      this.showErrorModal = false;
    } else if (this.state && this.state.revision !== state.revision) {
      this.previewScope = undefined;
    }
    if (state.status !== 'error') {
      this.showErrorModal = false;
    }
    this.tabId = tabId;
    this.state = state;
    this.render();
  }

  clearState(tabId?: number): void {
    this.tabId = tabId;
    this.state = undefined;
    this.previewScope = undefined;
    this.applyResult = undefined;
    this.showFullText = false;
    this.showErrorModal = false;
    this.render();
  }

  setApplyResult(result: ApplyResultPayload): void {
    if (this.tabId !== result.tabId || this.state?.editorId !== result.editorId) return;
    this.applyResult = result;
    this.render();
  }

  setProviders(providers: PublicProvider[]): void {
    this.providers = providers;
    this.render();
  }

  setSettings(settings: Partial<WritingSettings>): void {
    this.settings = {
      ...defaults,
      ...settings,
      thinkingMode: normalizeThinkingMode(settings.thinkingMode, settings.disableThinking),
    };
    this.render();
  }

  private button(text: string, callback: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', callback);
    return button;
  }

  private field(labelText: string, control: HTMLElement): HTMLLabelElement {
    const label = document.createElement('label');
    const text = document.createElement('span');
    text.textContent = labelText;
    label.append(text, control);
    return label;
  }

  private colorField(
    labelText: string,
    current: string,
    presets: readonly string[],
    withOpacity = false,
  ): { field: HTMLElement; input: HTMLInputElement; read: () => string } {
    const normalize = (raw: string): { hex: string; alpha: number } => {
      const lower = raw.toLowerCase();
      if (lower === 'transparent') return { hex: 'transparent', alpha: 0 };
      if (/^#[0-9a-f]{8}$/i.test(lower)) {
        return { hex: lower.slice(0, 7), alpha: Number.parseInt(lower.slice(7, 9), 16) };
      }
      if (/^#[0-9a-f]{6}$/i.test(lower)) {
        return { hex: lower, alpha: withOpacity ? 128 : 255 };
      }
      return { hex: '', alpha: withOpacity ? 128 : 255 };
    };
    const currentColor = normalize(current);
    let hex = currentColor.hex;
    let alpha = currentColor.alpha;

    const compose = (): string =>
      hex === 'transparent' || !withOpacity ? hex : `${hex}${Math.round(alpha).toString(16).padStart(2, '0')}`;

    const root = document.createElement('div');
    root.className = 'wa-color-field';
    const text = document.createElement('span');
    text.className = 'wa-color-label';
    text.textContent = labelText;
    root.append(text);

    const input = document.createElement('input');
    input.type = 'color';
    input.value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff';

    const swatchRow = document.createElement('div');
    swatchRow.className = 'wa-color-presets';

    let opacityInput: HTMLInputElement | undefined;
    let opacityValue: HTMLSpanElement | undefined;

    const render = (): void => {
      for (const swatch of Array.from(swatchRow.children) as HTMLButtonElement[]) {
        const active = swatch.dataset.color === compose();
        swatch.classList.toggle('active', active);
        swatch.setAttribute('aria-pressed', String(active));
      }
      if (opacityInput) opacityInput.value = String(Math.round((alpha / 255) * 100));
      if (opacityValue) opacityValue.textContent = `${Math.round((alpha / 255) * 100)}%`;
    };

    for (const preset of presets) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'wa-color-swatch';
      const lowerPreset = preset.toLowerCase();
      const transparent = lowerPreset === 'transparent';
      swatch.dataset.color = lowerPreset;
      if (transparent) swatch.classList.add('wa-color-swatch-transparent');
      swatch.style.backgroundColor = transparent ? 'transparent' : lowerPreset;
      swatch.title = transparent ? this.t('transparent') : lowerPreset;
      swatch.setAttribute('aria-label', transparent ? this.t('transparent') : lowerPreset);
      swatch.addEventListener('click', () => {
        if (transparent) {
          hex = 'transparent';
          input.value = '#ffffff';
        } else if (/^#[0-9a-f]{8}$/i.test(lowerPreset)) {
          hex = lowerPreset.slice(0, 7);
          alpha = Number.parseInt(lowerPreset.slice(7, 9), 16);
          input.value = hex;
        } else {
          hex = lowerPreset;
          alpha = withOpacity ? 128 : 255;
          input.value = hex;
        }
        render();
      });
      swatchRow.append(swatch);
    }

    input.addEventListener('input', () => {
      if (!/^#[0-9a-f]{6}$/i.test(input.value)) return;
      hex = input.value.toLowerCase();
      render();
    });

    render();
    swatchRow.append(input);
    root.append(swatchRow);

    if (withOpacity) {
      const opacityRow = document.createElement('div');
      opacityRow.className = 'wa-opacity-row';
      const opacityLabel = document.createElement('span');
      opacityLabel.className = 'wa-color-label';
      opacityLabel.textContent = this.t('opacity');
      opacityInput = document.createElement('input');
      opacityInput.type = 'range';
      opacityInput.min = '0';
      opacityInput.max = '100';
      opacityInput.step = '5';
      opacityInput.dataset.opacity = 'true';
      opacityInput.setAttribute('aria-label', this.t('opacity'));
      opacityInput.value = String(Math.round((alpha / 255) * 100));
      opacityValue = document.createElement('span');
      opacityValue.className = 'wa-opacity-value';
      opacityValue.textContent = `${Math.round((alpha / 255) * 100)}%`;
      opacityInput.addEventListener('input', () => {
        if (hex === 'transparent') return;
        alpha = Math.round((Number(opacityInput?.value ?? '100') / 100) * 255);
        render();
      });
      opacityRow.append(opacityLabel, opacityInput, opacityValue);
      root.append(opacityRow);
    }

    return { field: root, input, read: () => compose() };
  }

  private render(): void {
    // Remove any existing modal backdrop that lives on document.body
    this.errorModalBackdrop?.remove();
    this.errorModalBackdrop = undefined;
    // Keep an open settings dialog untouched: rebuilding it would close the
    // native color picker and drop unsaved edits.
    if (this.settingsOpen && this.settingsDialog?.isConnected) return;
    this.root.replaceChildren();
    const state = this.state;
    const title = document.createElement('h2');
    title.className = 'wa-title';
    title.textContent = this.t('title');
    const status = document.createElement('p');
    status.className = 'wa-status';
    status.setAttribute('role', 'status');

    const statusDot = document.createElement('span');
    const statusDotClass = !state
      ? 'wa-status-dot dot-gray'
      : state.noModel
        ? 'wa-status-dot dot-gray'
        : state.longText
          ? 'wa-status-dot dot-orange'
          : state.status === 'queued' || state.status === 'analyzing'
            ? 'wa-status-dot dot-pulse'
            : state.status === 'error'
              ? 'wa-status-dot dot-orange'
              : 'wa-status-dot dot-green';
    statusDot.className = statusDotClass;

    if (state?.status === 'error') {
      const errorTextBtn = document.createElement('button');
      errorTextBtn.type = 'button';
      errorTextBtn.className = 'wa-status-text wa-status-text-clickable';
      errorTextBtn.dataset.writingErrorText = 'true';
      errorTextBtn.textContent = this.t('detectionFailed');
      errorTextBtn.title = this.t('clickToViewError');
      errorTextBtn.addEventListener('click', () => {
        this.showErrorModal = true;
        this.render();
      });
      status.append(statusDot, errorTextBtn);

      const retryBtn = this.button(this.t('retry'), () => {
        if (this.tabId !== undefined) {
          this.command('RETRY_DETECTION', { tabId: this.tabId });
        }
      });
      retryBtn.className = 'wa-retry-button';
      retryBtn.dataset.writingRetryButton = 'true';
      status.append(retryBtn);
    } else {
      let statusLabel: string;
      if (!state) {
        statusLabel = this.t('focusToStart');
      } else if (state.noModel) {
        statusLabel = this.t('waitingForModel');
      } else if (state.longText) {
        statusLabel = this.t('textTooLong');
      } else if (state.status === 'queued' || state.status === 'analyzing') {
        if (state.analysisTotal !== undefined && state.analysisDone !== undefined && state.analysisTotal > 1) {
          statusLabel = this.uiLanguage === 'en'
            ? `Analyzing... ${state.analysisDone}/${state.analysisTotal}`
            : this.uiLanguage === 'es'
              ? `Analizando... ${state.analysisDone}/${state.analysisTotal}`
              : `正在检测… ${state.analysisDone}/${state.analysisTotal}`;
        } else {
          statusLabel = this.t('detecting');
        }
      } else {
        statusLabel = this.t('allCompleted');
      }
      const statusText = document.createTextNode(statusLabel);
      status.append(statusDot, statusText);
    }
    const actions = document.createElement('div');
    actions.className = 'wa-actions';

    const langSelect = document.createElement('select');
    langSelect.className = 'wa-lang-select';
    langSelect.dataset.writingLanguageSelect = 'true';
    langSelect.title = this.t('targetLang');
    langSelect.setAttribute('aria-label', this.t('targetLang'));
    for (const lang of ['EN', 'ES', 'CN'] as const) {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = lang;
      langSelect.append(option);
    }
    langSelect.value = this.settings.targetLanguage ?? 'EN';
    langSelect.addEventListener('change', () => {
      const nextSettings: WritingSettings = {
        ...this.settings,
        targetLanguage: langSelect.value as TargetLanguage,
      };
      this.settings = nextSettings;
      void this.persist(nextSettings);
    });

    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.className = 'wa-settings-button';
    settingsButton.dataset.writingSettingsButton = 'true';
    settingsButton.title = this.t('settings');
    settingsButton.setAttribute('aria-label', this.t('settings'));
    settingsButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    settingsButton.addEventListener('click', () => {
      this.settingsOpen = true;
      this.render();
    });
    actions.append(langSelect, settingsButton);

    const activeProviders = this.providers.length > 0
      ? this.providers
      : [{ id: 'default-local', name: 'Default (Local)', models: ['llama3', 'mistral', 'qwen2'] }];

    const modelBar = document.createElement('div');
    modelBar.className = 'wa-model-bar';
    const label = document.createElement('label');
    label.textContent = this.t('model');
    const topModelSelect = document.createElement('select');
    topModelSelect.className = 'wa-model-select';

    const currentProvider = activeProviders.find((p) => p.id === this.settings.providerId) ?? activeProviders[0];
    for (const provider of activeProviders) {
      const group = document.createElement('optgroup');
      group.label = provider.name;
      for (const modelId of provider.models) {
        const option = document.createElement('option');
        option.value = `${provider.id}|${modelId}`;
        option.textContent = modelId;
        group.append(option);
      }
      topModelSelect.append(group);
    }
    const currentValue = currentProvider ? `${currentProvider.id}|${this.settings.modelId}` : '';
    if (Array.from(topModelSelect.options).some((option) => option.value === currentValue)) {
      topModelSelect.value = currentValue;
    } else if (topModelSelect.options.length) {
      topModelSelect.value = topModelSelect.options[0].value;
    }
    topModelSelect.addEventListener('change', () => {
      const [providerId, ...modelParts] = topModelSelect.value.split('|');
      const nextSettings: WritingSettings = { ...this.settings, providerId, modelId: modelParts.join('|') };
      this.settings = nextSettings;
      void this.persist(nextSettings);
    });
    modelBar.append(label, topModelSelect, actions);

    // 1. Model selection should be at the very top
    this.root.append(modelBar);
    this.root.append(status);

    const counts = document.createElement('div');
    counts.className = 'wa-counts';
    counts.setAttribute('aria-label', this.t('issueCounts'));
    for (const scope of ['local', 'sentence', 'paragraph'] as const) {
      const count = state?.counts[scope] ?? 0;
      if (!count) continue;
      const countBtn = this.button(`${this.getScopeLabel(scope)} ${count}`, () => {
        this.previewScope = scope;
        this.applyResult = undefined;
        this.render();
      });
      countBtn.dataset.scope = scope;
      countBtn.className = 'wa-count-btn';
      counts.append(countBtn);
    }

    // 3. Move "全文" to behind each error count statistics
    const hasFullResult = Boolean(state?.fullResult);
    const fullCount = state?.fullResult?.suggestions?.length ?? 0;
    const fullTextLabel = fullCount > 0 ? `${this.getScopeLabel('full')} ${fullCount}` : this.getScopeLabel('full');
    const fullBtn = this.button(fullTextLabel, () => {
      if (!state?.fullResult && !state?.fullAnalysisPending && this.tabId !== undefined) {
        this.command('REQUEST_FULL_ANALYSIS', { tabId: this.tabId });
      }
      this.showFullText = !this.showFullText;
      this.render();
    });
    fullBtn.dataset.scope = 'full';
    fullBtn.className = 'wa-count-btn';
    if (!hasFullResult) {
      fullBtn.classList.add('wa-count-btn-gray');
    }
    if (this.showFullText) {
      fullBtn.classList.add('active');
      fullBtn.setAttribute('aria-pressed', 'true');
    }
    counts.append(fullBtn);

    this.root.append(counts);
    this.renderBatchPreview();

    if (this.applyResult) {
      const result = document.createElement('p');
      result.className = 'wa-apply-result';
      result.dataset.applyResult = this.applyResult.scope;
      result.setAttribute('role', 'status');
      const scopeName = this.getScopeLabel(this.applyResult.scope);
      result.textContent = this.applyResult.stale
        ? this.t('contentChanged')
        : this.uiLanguage === 'en'
          ? `Applied ${this.applyResult.applied} ${scopeName} change(s), skipped ${this.applyResult.skipped}.`
          : this.uiLanguage === 'es'
            ? `Se aplicaron ${this.applyResult.applied} cambio(s) de ${scopeName}, se omitieron ${this.applyResult.skipped}.`
            : `已应用 ${this.applyResult.applied} 项${scopeName}修改，跳过 ${this.applyResult.skipped} 项。`;
      this.root.append(result);
    }

    if (this.showFullText) {
      const full = document.createElement('section');
      full.className = 'wa-full-card';
      const pending = Boolean(state?.fullAnalysisPending) && !state?.fullResult;
      full.dataset.severity = pending ? 'pending' : state?.fullResult?.severity ?? 'none';
      const fullTitle = document.createElement('h3');
      fullTitle.textContent = this.getScopeLabel('full');
      const fullSummary = document.createElement('p');
      fullSummary.textContent = pending
        ? this.t('reviewing')
        : state?.fullResult?.summary || this.t('noFullTextSuggestions');
      full.append(fullTitle, fullSummary);
      const suggestions = state?.fullResult?.suggestions ?? [];
      if (suggestions.length) {
        const list = document.createElement('ul');
        for (const suggestion of suggestions) {
          const item = document.createElement('li');
          item.textContent = `${suggestion.title}：${suggestion.reason}`;
          item.dataset.severity = suggestion.severity;
          list.append(item);
        }
        full.append(list);
      }
      this.root.append(full);
    } else {
      const appendIssues = (
        issues: Array<NonNullable<EditorViewState['currentSentence']>>,
      ): void => {
        for (const issue of issues) {
          const section = document.createElement('section');
          section.className = 'wa-section';
          section.dataset.issueId = issue.issueId;
          if ('severity' in issue && typeof issue.severity === 'string') {
            section.dataset.severity = issue.severity;
          }
          const change = document.createElement('p');
          change.className = 'wa-change-text';
          change.textContent = `${issue.original} → ${issue.replacement}`;
          const reason = document.createElement('p');
          reason.className = 'wa-reason-text';
          reason.textContent = issue.reason;
          const applyBtn = this.button(this.t('apply'), () => {
            if (this.tabId === undefined || !state) return;
            this.command('APPLY_ISSUE', {
              tabId: this.tabId,
              editorId: state.editorId,
              revision: state.revision,
              issueId: issue.issueId,
            });
          });
          applyBtn.className = 'wa-btn-primary';
          const footer = document.createElement('div');
          footer.className = 'wa-suggestion-footer';
          footer.append(reason, applyBtn);
          section.append(change, footer);
          this.root.append(section);
        }
      };

      appendIssues(state?.currentSentence ? [state.currentSentence] : []);
      const paragraphIssues = state?.currentParagraphIssues
        ?? (state?.currentParagraph ? [state.currentParagraph] : []);
      const sentenceIssueId = state?.currentSentence?.issueId;
      appendIssues(paragraphIssues.filter((issue) => issue.issueId !== sentenceIssueId));
    }
    this.renderSettingsDialog();
    this.renderErrorModal(state);
  }

  private renderBatchPreview(): void {
    if (!this.previewScope) return;
    const scope = this.previewScope;
    const items = this.state?.batchPreviews?.[scope] ?? [];
    const preview = document.createElement('section');
    preview.dataset.batchPreview = scope;
    preview.setAttribute('role', 'dialog');
    preview.setAttribute('aria-modal', 'true');
    const scopeName = this.getScopeLabel(scope);
    const modalLabel = this.uiLanguage === 'en'
      ? `${scopeName} Change Preview`
      : this.uiLanguage === 'es'
        ? `Vista previa de cambios de ${scopeName}`
        : `${scopeName}修改预览`;
    preview.setAttribute('aria-label', modalLabel);

    const heading = document.createElement('h3');
    heading.textContent = this.uiLanguage === 'en'
      ? `Preview ${items.length} ${scopeName} change(s)`
      : this.uiLanguage === 'es'
        ? `Vista previa de ${items.length} cambio(s) de ${scopeName}`
        : `预览 ${items.length} 项${scopeName}修改`;
    preview.append(heading);

    const list = document.createElement('ol');
    for (const item of items) {
      const row = document.createElement('li');
      row.dataset.severity = item.severity;
      const change = document.createElement('p');
      change.textContent = `${item.original} → ${item.replacement}`;
      const reason = document.createElement('p');
      reason.textContent = item.reason;
      row.append(change, reason);
      list.append(row);
    }
    preview.append(list);

    const cancel = this.button(this.t('cancel'), () => {
      this.previewScope = undefined;
      this.render();
    });
    const confirmApply = this.button(this.t('confirmApplyAll'), () => {
      this.previewScope = undefined;
      const state = this.state;
      if (state && this.tabId !== undefined) this.command('APPLY_ALL', {
        tabId: this.tabId,
        editorId: state.editorId,
        revision: state.revision,
        scope,
        expectedCount: items.length,
      });
      this.render();
    });
    preview.append(cancel, confirmApply);
    this.root.append(preview);
  }

  private renderSettings(): void {
    const activeProviders = this.providers.length > 0
      ? this.providers
      : [{ id: 'default-local', name: 'Default (Local)', models: ['llama3', 'mistral', 'qwen2'] }];

    const form = document.createElement('form');
    const heading = document.createElement('h3');
    heading.textContent = this.t('settings');

    const provider = document.createElement('select');
    provider.name = provider.dataset.field = 'providerId';
    for (const item of activeProviders) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      provider.append(option);
    }
    if (activeProviders.some((item) => item.id === this.settings.providerId)) {
      provider.value = this.settings.providerId;
    }

    const model = document.createElement('select');
    model.name = model.dataset.field = 'modelId';
    const refreshModels = (): void => {
      const selectedProvider = activeProviders.find((item) => item.id === provider.value) ?? activeProviders[0];
      model.replaceChildren();
      for (const modelId of selectedProvider?.models ?? []) {
        const option = document.createElement('option');
        option.value = option.textContent = modelId;
        model.append(option);
      }
      if (selectedProvider?.models.includes(this.settings.modelId)) model.value = this.settings.modelId;
    };
    provider.addEventListener('change', refreshModels);
    refreshModels();

    const strategy = document.createElement('select');
    strategy.name = strategy.dataset.field = 'invocationStrategy';
    strategy.append(new Option(this.t('batchMerge'), 'batch'), new Option(this.t('parallelSingle'), 'parallel'));
    strategy.value = this.settings.invocationStrategy;

    const concurrency = document.createElement('input');
    concurrency.type = 'number';
    concurrency.name = concurrency.dataset.field = 'maxConcurrency';
    concurrency.min = '1';
    concurrency.max = '6';
    concurrency.value = String(this.settings.maxConcurrency);

    const activation = document.createElement('select');
    activation.name = activation.dataset.field = 'activationMode';
    activation.append(
      new Option(this.t('activationAlways'), 'always'),
      new Option(this.t('activationPanelOpen'), 'panel_open'),
      new Option(this.t('activationOff'), 'off'),
    );
    activation.value = this.settings.activationMode;

    const limit = document.createElement('input');
    limit.type = 'number';
    limit.name = limit.dataset.field = 'fullDocumentCharacterLimit';
    limit.min = '1';
    limit.value = String(this.settings.fullDocumentCharacterLimit);

    const targetLang = document.createElement('select');
    targetLang.name = targetLang.dataset.field = 'targetLanguage';
    targetLang.append(
      new Option('EN (English)', 'EN'),
      new Option('ES (Spanish)', 'ES'),
      new Option('CN (Chinese)', 'CN'),
    );
    targetLang.value = this.settings.targetLanguage ?? 'EN';

    const thinkingMode = document.createElement('select');
    thinkingMode.name = thinkingMode.dataset.field = 'thinkingMode';
    thinkingMode.append(
      new Option(this.t('thinkingDefault'), 'default'),
      new Option(this.t('thinkingAutoOff'), 'auto-off'),
    );
    thinkingMode.value = normalizeThinkingMode(this.settings.thinkingMode, this.settings.disableThinking);

    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = this.t('saveSettings');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const next: WritingSettings = {
        providerId: provider.value,
        modelId: model.value,
        invocationStrategy: strategy.value as WritingSettings['invocationStrategy'],
        maxConcurrency: Math.max(1, Math.min(6, Number(concurrency.value) || 3)),
        activationMode: activation.value as WritingSettings['activationMode'],
        fullDocumentCharacterLimit: Math.max(1, Number(limit.value) || 20_000),
        targetLanguage: targetLang.value as TargetLanguage,
        replacementFontScale: this.settings.replacementFontScale,
        replacementTextColor: this.settings.replacementTextColor,
        replacementBackgroundColor: this.settings.replacementBackgroundColor,
        thinkingMode: thinkingMode.value as ThinkingMode,
      };
      this.settings = next;
      void this.persist(next);
    });

    form.append(
      heading,
      this.field(this.t('provider'), provider),
      this.field(this.t('model'), model),
      this.field(this.t('targetLang'), targetLang),
      this.field(this.t('invocationStrategy'), strategy),
      this.field(this.t('maxConcurrency'), concurrency),
      this.field(this.t('characterLimit'), limit),
      this.field(this.t('activationMode'), activation),
      this.field(this.t('thinkingMode'), thinkingMode),
      save,
    );
    this.root.append(form);
  }

  private renderSettingsDialog(): void {
    if (!this.settingsOpen) {
      this.settingsDialog = undefined;
      return;
    }
    if (this.settingsDialog) {
      this.root.append(this.settingsDialog);
      return;
    }
    const dialog = document.createElement('section');
    dialog.dataset.writingSettings = 'true';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', this.t('settings'));

    const header = document.createElement('div');
    header.className = 'wa-settings-header';
    const heading = document.createElement('h3');
    heading.textContent = this.t('settings');
    const close = this.button(this.t('close'), () => {
      this.settingsOpen = false;
      this.settingsDialog = undefined;
      this.render();
    });
    close.className = 'wa-settings-close';
    header.append(heading, close);

    const form = document.createElement('form');

    const dialogTargetLang = document.createElement('select');
    dialogTargetLang.name = dialogTargetLang.dataset.field = 'targetLanguage';
    dialogTargetLang.append(
      new Option('EN (English)', 'EN'),
      new Option('ES (Spanish)', 'ES'),
      new Option('CN (Chinese)', 'CN'),
    );
    dialogTargetLang.value = this.settings.targetLanguage ?? 'EN';

    const strategy = document.createElement('select');
    strategy.name = strategy.dataset.field = 'invocationStrategy';
    strategy.append(new Option(this.t('batchMerge'), 'batch'), new Option(this.t('parallelSingle'), 'parallel'));
    strategy.value = this.settings.invocationStrategy;
    const concurrency = document.createElement('input');
    concurrency.type = 'number';
    concurrency.name = concurrency.dataset.field = 'maxConcurrency';
    concurrency.min = '1';
    concurrency.max = '6';
    concurrency.value = String(this.settings.maxConcurrency);
    const activation = document.createElement('select');
    activation.name = activation.dataset.field = 'activationMode';
    activation.append(
      new Option(this.t('activationAlways'), 'always'),
      new Option(this.t('activationPanelOpen'), 'panel_open'),
      new Option(this.t('activationOff'), 'off'),
    );
    activation.value = this.settings.activationMode;
    const limit = document.createElement('input');
    limit.type = 'number';
    limit.name = limit.dataset.field = 'fullDocumentCharacterLimit';
    limit.min = '1';
    limit.value = String(this.settings.fullDocumentCharacterLimit);
    const dialogThinkingMode = document.createElement('select');
    dialogThinkingMode.name = dialogThinkingMode.dataset.field = 'thinkingMode';
    dialogThinkingMode.append(
      new Option(this.t('thinkingDefault'), 'default'),
      new Option(this.t('thinkingAutoOff'), 'auto-off'),
    );
    dialogThinkingMode.value = normalizeThinkingMode(this.settings.thinkingMode, this.settings.disableThinking);
    const replacementFontScale = document.createElement('input');
    replacementFontScale.type = 'number';
    replacementFontScale.name = replacementFontScale.dataset.field = 'replacementFontScale';
    replacementFontScale.min = '0.25';
    replacementFontScale.max = '2';
    replacementFontScale.step = '0.05';
    replacementFontScale.value = String(this.settings.replacementFontScale);
    const replacementTextColorControl = this.colorField(
      this.t('textColor'),
      this.settings.replacementTextColor,
      TEXT_COLOR_PRESETS,
    );
    replacementTextColorControl.input.name = replacementTextColorControl.input.dataset.field = 'replacementTextColor';
    const replacementBackgroundColorControl = this.colorField(
      this.t('backgroundColor'),
      this.settings.replacementBackgroundColor,
      BACKGROUND_COLOR_PRESETS,
      true,
    );
    replacementBackgroundColorControl.input.name = replacementBackgroundColorControl.input.dataset.field = 'replacementBackgroundColor';
    const dialogConstrainedDecoding = document.createElement('input');
    dialogConstrainedDecoding.type = 'checkbox';
    dialogConstrainedDecoding.name = dialogConstrainedDecoding.dataset.field = 'constrainedDecoding';
    dialogConstrainedDecoding.checked = this.settings.constrainedDecoding ?? false;
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = this.t('saveSettings');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.settings = {
        providerId: this.settings.providerId,
        modelId: this.settings.modelId,
        invocationStrategy: strategy.value as WritingSettings['invocationStrategy'],
        maxConcurrency: Math.max(1, Math.min(6, Number(concurrency.value) || 3)),
        activationMode: activation.value as WritingSettings['activationMode'],
         fullDocumentCharacterLimit: Math.max(1, Number(limit.value) || 20_000),
         targetLanguage: dialogTargetLang.value as TargetLanguage,
         replacementFontScale: Math.min(2, Math.max(0.25, Number(replacementFontScale.value) || 0.8)),
         replacementTextColor: replacementTextColorControl.read(),
         replacementBackgroundColor: replacementBackgroundColorControl.read(),
          thinkingMode: dialogThinkingMode.value as ThinkingMode,
        constrainedDecoding: dialogConstrainedDecoding.checked,
      };
      this.settingsOpen = false;
      this.settingsDialog = undefined;
      void this.persist(this.settings);
      this.render();
    });
    form.append(
      this.field(this.t('targetLang'), dialogTargetLang),
      this.field(this.t('invocationStrategy'), strategy),
      this.field(this.t('maxConcurrency'), concurrency),
      this.field(this.t('characterLimit'), limit),
      this.field(this.t('fontScale'), replacementFontScale),
      replacementTextColorControl.field,
      replacementBackgroundColorControl.field,
      this.field(this.t('activationMode'), activation),
       this.field(this.t('thinkingMode'), dialogThinkingMode),
      this.field(this.t('constrainedDecoding'), dialogConstrainedDecoding),
      save,
    );
    dialog.append(header, form);
    this.settingsDialog = dialog;
    this.root.append(dialog);
  }

  private renderErrorModal(state?: EditorViewState): void {
    if (!this.showErrorModal) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'wa-modal-backdrop';
    backdrop.dataset.writingErrorModal = 'true';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.showErrorModal = false;
        this.render();
      }
    });

    const modal = document.createElement('div');
    modal.className = 'wa-modal wa-error-modal';
    modal.setAttribute('role', 'dialog');

    const header = document.createElement('div');
    header.className = 'wa-modal-header';
    const modalTitle = document.createElement('h3');
    modalTitle.textContent = this.t('errorModalTitle');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'wa-modal-close';
    closeBtn.textContent = '×';
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => {
      this.showErrorModal = false;
      this.render();
    });
    header.append(modalTitle, closeBtn);

    const body = document.createElement('div');
    body.className = 'wa-modal-body';
    const reasonText = document.createElement('p');
    reasonText.className = 'wa-error-reason-text';
    reasonText.textContent = this.formatErrorReason(state?.errorReason);
    body.append(reasonText);

    const footer = document.createElement('div');
    footer.className = 'wa-modal-footer';
    const closeFooterBtn = this.button(this.t('close'), () => {
      this.showErrorModal = false;
      this.render();
    });
    closeFooterBtn.className = 'wa-modal-cancel-btn';

    const retryFooterBtn = this.button(this.t('retryDetection'), () => {
      this.showErrorModal = false;
      if (this.tabId !== undefined) {
        this.command('RETRY_DETECTION', { tabId: this.tabId });
      }
      this.render();
    });
    retryFooterBtn.className = 'wa-modal-retry-btn';
    footer.append(closeFooterBtn, retryFooterBtn);

    modal.append(header, body, footer);
    backdrop.append(modal);
    // Append to document.body so position:fixed works even with overflow-y:auto on the panel
    document.body.append(backdrop);
    this.errorModalBackdrop = backdrop;
  }

  private formatErrorReason(code?: string): string {
    const isEn = this.uiLanguage === 'en';
    const isEs = this.uiLanguage === 'es';
    if (!code) {
      return isEn
        ? 'Detection request failed, please check LLM service configuration and network connection.'
        : isEs
          ? 'La solicitud de detección falló. Por favor comprueba la configuración LLM y la conexión a internet.'
          : '检测请求处理失败，请检查 LLM 服务配置和网络连接。';
    }
    if (code === 'NO_MODEL') {
      return isEn
        ? 'No valid LLM model configured or selected, please configure API Key and model in settings.'
        : isEs
          ? 'No hay ningún modelo LLM válido configurado o seleccionado, configura la clave API y el modelo en la configuración.'
          : '未配置或未选择有效的 LLM 模型，请在设置中配置 API Key 与模型。';
    }
    if (code === 'HTTP_401') {
      return isEn
        ? 'API Key invalid or unauthorized (HTTP 401), please check API Key in configuration.'
        : isEs
          ? 'Clave API no válida o no autorizada (HTTP 401), comprueba la clave API en la configuración.'
          : 'API Key 无效或未授权 (HTTP 401)，请在配置中检查 API Key。';
    }
    if (code === 'HTTP_403') {
      return isEn
        ? 'Access denied or forbidden (HTTP 403), please verify Key permissions.'
        : isEs
          ? 'Acceso denegado o prohibido (HTTP 403), verifica los permisos de la clave API.'
          : '访问被拒绝或无权限 (HTTP 403)，请确认 Key 的使用权限。';
    }
    if (code === 'HTTP_429') {
      return isEn
        ? 'API rate limit exceeded (HTTP 429), please try again later.'
        : isEs
          ? 'Límite de velocidad de API excedido (HTTP 429), inténtalo de nuevo más tarde.'
          : 'API 请求频率超限 (HTTP 429)，请稍后重试。';
    }
    if (code.startsWith('HTTP_')) {
      return isEn
        ? `Model service returned error status code (${code}), please check API config or service availability.`
        : isEs
          ? `El servicio del modelo devolvió un código de error (${code}), comprueba la configuración de API.`
          : `模型服务返回错误状态码 (${code})，请检查 API 配置或服务可用性。`;
    }
    if (code === 'NETWORK') {
      return isEn
        ? 'Network connection failed, unable to reach model API endpoint, check network or proxy settings.'
        : isEs
          ? 'Falló la conexión de red, no se pudo alcanzar el extremo de la API del modelo.'
          : '网络连接失败，无法连接到模型 API 端点，请检查网络或代理设置。';
    }
    if (code === 'TIMEOUT') {
      return isEn
        ? 'Model request timed out after 30 seconds and was terminated automatically.'
        : isEs
          ? 'La solicitud del modelo tardó más de 30 segundos y se canceló automáticamente.'
          : '模型请求超过 30 秒仍未完成，已自动终止，避免检测一直卡住。';
    }
    if (code === 'INVALID_RESPONSE') {
      return isEn
        ? 'Model returned invalid response missing required fields or mismatched correlation ID.'
        : isEs
          ? 'El modelo devolvió una respuesta no válida a la que le faltan campos obligatorios.'
          : '模型返回的数据缺少必要字段或请求标识不匹配，已拒绝该结果，请重试。';
    }
    if (code === 'RESPONSE_DECODE') {
      return isEn
        ? 'Failed to decode API response body as JSON. Server may have returned HTML error page.'
        : isEs
          ? 'No se pudo decodificar la respuesta como JSON, el servidor puede haber devuelto HTML.'
          : '无法将 API 响应体解析为 JSON，服务端可能返回了非 JSON 内容（如 HTML 错误页）。';
    }
    if (code === 'EMPTY_RESPONSE') {
      return isEn
        ? 'Model returned empty response content, context may be too long or model error.'
        : isEs
          ? 'El modelo devolvió una respuesta vacía, el contexto puede ser demasiado largo.'
          : '模型返回了空响应内容，可能因上下文过长被截断或模型异常，请重试。';
    }
    if (code === 'MODEL_TRUNCATED') {
      return isEn
        ? 'Model exhausted token budget in reasoning thinking process without output. Enable constrained decoding or disable thinking.'
        : isEs
          ? 'El modelo agotó el presupuesto de tokens en el pensamiento. Habilita la decodificación restringida o desactiva el pensamiento.'
          : '模型把输出预算耗尽在思考过程，尚未生成检测结果；可开启约束性解码或关闭思考模式。';
    }
    if (code === 'PARSE_ERROR' || code === 'INVALID_RESPONSE') {
      return isEn
        ? 'Invalid JSON output from model. Check if model supports constrained decoding or try another model.'
        : isEs
          ? 'Salida JSON no válida del modelo. Comprueba si el modelo soporta decodificación restringida o prueba otro modelo.'
          : '模型输出的 JSON 格式无效，无法解析。如已启用约束性解码，请确认模型支持该功能；否则可尝试更换模型或重试。';
    }
    return isEn ? `Detection failure reason: ${code}` : isEs ? `Razón de falla de detección: ${code}` : `检测失败原因: ${code}`;
  }
}
