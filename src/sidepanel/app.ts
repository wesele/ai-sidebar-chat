import type { ApplyResultPayload, EditorViewState } from '../shared/messages';

export interface WritingSettings {
  providerId: string;
  modelId: string;
  invocationStrategy: 'batch' | 'parallel';
  maxConcurrency: number;
  activationMode: 'always' | 'panel_open';
  fullDocumentCharacterLimit: number;
}

export const defaults: WritingSettings = {
  providerId: '',
  modelId: '',
  invocationStrategy: 'batch',
  maxConcurrency: 3,
  activationMode: 'always',
  fullDocumentCharacterLimit: 20_000,
};

type PublicProvider = { id: string; name: string; models: string[] };
type IssueScope = 'local' | 'sentence' | 'paragraph';
const scopeLabels = { local: '局部', sentence: '句子', paragraph: '段落' } as const;

export class WritingAssistantPanel {
  private state?: EditorViewState;
  private tabId?: number;
  private providers: PublicProvider[] = [];
  private settings: WritingSettings = { ...defaults };
  private settingsOpen = false;
  private previewScope?: IssueScope;
  private applyResult?: ApplyResultPayload;
  private showFullText = false;
  private showErrorModal = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly persist: (settings: WritingSettings) => Promise<void>,
    private readonly command: (
      type: 'APPLY_ISSUE' | 'APPLY_ALL' | 'RETRY_DETECTION',
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
    this.settings = { ...defaults, ...settings };
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

  private render(): void {
    this.root.replaceChildren();
    const state = this.state;
    const title = document.createElement('h2');
    title.className = 'wa-title';
    title.textContent = '写作助手';
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
      const errorTextSpan = document.createElement('span');
      errorTextSpan.className = 'wa-status-text wa-status-text-clickable';
      errorTextSpan.dataset.writingErrorText = 'true';
      errorTextSpan.textContent = '检测失败，可在设置中重试';
      errorTextSpan.title = '点击查看错误原因';
      errorTextSpan.addEventListener('click', () => {
        this.showErrorModal = true;
        this.render();
      });
      status.append(statusDot, errorTextSpan);

      const retryBtn = this.button('重试', () => {
        if (this.tabId !== undefined) {
          this.command('RETRY_DETECTION', { tabId: this.tabId });
        }
      });
      retryBtn.className = 'wa-retry-button';
      retryBtn.dataset.writingRetryButton = 'true';
      status.append(retryBtn);
    } else {
      const statusText = document.createTextNode(!state
        ? '聚焦一个英文编辑器以开始'
        : state.noModel
          ? '等待配置模型'
          : state.longText
            ? '文本过长，全文检测暂停'
            : state.status === 'queued' || state.status === 'analyzing'
              ? '正在检测…'
              : '全部检测完毕');
      status.append(statusDot, statusText);
    }
    const actions = document.createElement('div');
    actions.className = 'wa-actions';
    const settingsButton = this.button('配置', () => {
      this.settingsOpen = true;
      this.render();
    });
    settingsButton.className = 'wa-settings-button';
    settingsButton.dataset.writingSettingsButton = 'true';
    actions.append(settingsButton);

    const activeProviders = this.providers.length > 0
      ? this.providers
      : [{ id: 'default-local', name: 'Default (Local)', models: ['llama3', 'mistral', 'qwen2'] }];

    const modelBar = document.createElement('div');
    modelBar.className = 'wa-model-bar';
    const label = document.createElement('label');
    label.textContent = '模型';
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
    counts.setAttribute('aria-label', '问题计数');
    for (const scope of ['local', 'sentence', 'paragraph'] as const) {
      const count = state?.counts[scope] ?? 0;
      if (!count) continue;
      const countBtn = this.button(`${scopeLabels[scope]} ${count}`, () => {
        this.previewScope = scope;
        this.applyResult = undefined;
        this.render();
      });
      countBtn.dataset.scope = scope;
      countBtn.className = 'wa-count-btn';
      counts.append(countBtn);
    }

    // 3. Move "全文" to behind each error count statistics
    const fullCount = state?.fullResult?.suggestions?.length ?? 0;
    const fullTextLabel = fullCount > 0 ? `全文 ${fullCount}` : '全文';
    const fullBtn = this.button(fullTextLabel, () => {
      this.showFullText = !this.showFullText;
      this.render();
    });
    fullBtn.dataset.scope = 'full';
    fullBtn.className = 'wa-count-btn';
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
      result.textContent = this.applyResult.stale
        ? '内容已变化，建议已刷新。'
        : `已应用 ${this.applyResult.applied} 项${scopeLabels[this.applyResult.scope]}修改，跳过 ${this.applyResult.skipped} 项。`;
      this.root.append(result);
    }

    if (this.showFullText) {
      const full = document.createElement('section');
      full.className = 'wa-full-card';
      full.dataset.severity = state?.fullResult?.severity ?? 'none';
      const fullTitle = document.createElement('h3');
      fullTitle.textContent = '全文';
      const fullSummary = document.createElement('p');
      fullSummary.textContent = state?.fullResult?.summary ?? '暂无全文建议';
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
      for (const [heading, issue] of [
        ['当前句子', state?.currentSentence],
        ['当前段落', state?.currentParagraph],
      ] as const) {
        // 4. If current paragraph (or sentence) has no issue, do not display the whole box
        if (!issue) continue;
        const section = document.createElement('section');
        section.className = 'wa-section';
        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = heading;
        section.append(sectionTitle);
        const change = document.createElement('p');
        change.className = 'wa-change-text';
        change.textContent = `${issue.original} → ${issue.replacement}`;
        const reason = document.createElement('p');
        reason.className = 'wa-reason-text';
        reason.textContent = issue.reason;
        const applyBtn = this.button('应用修改', () => {
          if (this.tabId === undefined || !state) return;
          this.command('APPLY_ISSUE', {
            tabId: this.tabId,
            editorId: state.editorId,
            revision: state.revision,
            issueId: issue.issueId,
          });
        });
        applyBtn.className = 'wa-btn-primary';
        section.append(change, reason, applyBtn);
        this.root.append(section);
      }
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
    preview.setAttribute('aria-label', `${scopeLabels[scope]}修改预览`);
    const heading = document.createElement('h3');
    heading.textContent = `预览 ${items.length} 项${scopeLabels[scope]}修改`;
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

    const cancel = this.button('取消', () => {
      this.previewScope = undefined;
      this.render();
    });
    const confirmApply = this.button('确认全部应用', () => {
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
    heading.textContent = '设置';

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
    strategy.append(new Option('批量合并', 'batch'), new Option('单项并发', 'parallel'));
    strategy.value = this.settings.invocationStrategy;

    const concurrency = document.createElement('input');
    concurrency.type = 'number';
    concurrency.name = concurrency.dataset.field = 'maxConcurrency';
    concurrency.min = '1';
    concurrency.max = '6';
    concurrency.value = String(this.settings.maxConcurrency);

    const activation = document.createElement('select');
    activation.name = activation.dataset.field = 'activationMode';
    activation.append(new Option('始终激活', 'always'), new Option('仅侧边栏打开时', 'panel_open'));
    activation.value = this.settings.activationMode;

    const limit = document.createElement('input');
    limit.type = 'number';
    limit.name = limit.dataset.field = 'fullDocumentCharacterLimit';
    limit.min = '1';
    limit.value = String(this.settings.fullDocumentCharacterLimit);

    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = '保存写作设置';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const next: WritingSettings = {
        providerId: provider.value,
        modelId: model.value,
        invocationStrategy: strategy.value as WritingSettings['invocationStrategy'],
        maxConcurrency: Math.max(1, Math.min(6, Number(concurrency.value) || 3)),
        activationMode: activation.value as WritingSettings['activationMode'],
        fullDocumentCharacterLimit: Math.max(1, Number(limit.value) || 20_000),
      };
      this.settings = next;
      void this.persist(next);
    });

    form.append(
      heading,
      this.field('供应商', provider),
      this.field('模型', model),
      this.field('调用策略', strategy),
      this.field('最大并发', concurrency),
      this.field('全文字符上限', limit),
      this.field('激活模式', activation),
      save,
    );
    this.root.append(form);
  }

  private renderSettingsDialog(): void {
    if (!this.settingsOpen) return;
    const dialog = document.createElement('section');
    dialog.dataset.writingSettings = 'true';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '配置');

    const header = document.createElement('div');
    header.className = 'wa-settings-header';
    const heading = document.createElement('h3');
    heading.textContent = '配置';
    const close = this.button('关闭', () => {
      this.settingsOpen = false;
      this.render();
    });
    close.className = 'wa-settings-close';
    header.append(heading, close);

    const form = document.createElement('form');

    const strategy = document.createElement('select');
    strategy.name = strategy.dataset.field = 'invocationStrategy';
    strategy.append(new Option('批量合并', 'batch'), new Option('单项并发', 'parallel'));
    strategy.value = this.settings.invocationStrategy;
    const concurrency = document.createElement('input');
    concurrency.type = 'number';
    concurrency.name = concurrency.dataset.field = 'maxConcurrency';
    concurrency.min = '1';
    concurrency.max = '6';
    concurrency.value = String(this.settings.maxConcurrency);
    const activation = document.createElement('select');
    activation.name = activation.dataset.field = 'activationMode';
    activation.append(new Option('始终激活', 'always'), new Option('仅侧边栏打开时', 'panel_open'));
    activation.value = this.settings.activationMode;
    const limit = document.createElement('input');
    limit.type = 'number';
    limit.name = limit.dataset.field = 'fullDocumentCharacterLimit';
    limit.min = '1';
    limit.value = String(this.settings.fullDocumentCharacterLimit);
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = '保存配置';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.settings = {
        providerId: this.settings.providerId,
        modelId: this.settings.modelId,
        invocationStrategy: strategy.value as WritingSettings['invocationStrategy'],
        maxConcurrency: Math.max(1, Math.min(6, Number(concurrency.value) || 3)),
        activationMode: activation.value as WritingSettings['activationMode'],
        fullDocumentCharacterLimit: Math.max(1, Number(limit.value) || 20_000),
      };
      this.settingsOpen = false;
      void this.persist(this.settings);
      this.render();
    });
    form.append(
      this.field('调用策略', strategy),
      this.field('最大并发', concurrency),
      this.field('全文字符上限', limit),
      this.field('激活模式', activation),
      save,
    );
    dialog.append(header, form);
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
    modalTitle.textContent = '检测失败原因';
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
    const closeFooterBtn = this.button('关闭', () => {
      this.showErrorModal = false;
      this.render();
    });
    closeFooterBtn.className = 'wa-modal-cancel-btn';

    const retryFooterBtn = this.button('重试检测', () => {
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
    this.root.append(backdrop);
  }

  private formatErrorReason(code?: string): string {
    if (!code) {
      return '检测请求处理失败，请检查 LLM 服务配置和网络连接。';
    }
    if (code === 'NO_MODEL') {
      return '未配置或未选择有效的 LLM 模型，请在设置中配置 API Key 与模型。';
    }
    if (code === 'HTTP_401') {
      return 'API Key 无效或未授权 (HTTP 401)，请在配置中检查 API Key。';
    }
    if (code === 'HTTP_403') {
      return '访问被拒绝或无权限 (HTTP 403)，请确认 Key 的使用权限。';
    }
    if (code === 'HTTP_429') {
      return 'API 请求频率超限 (HTTP 429)，请稍后重试。';
    }
    if (code.startsWith('HTTP_')) {
      return `模型服务返回错误状态码 (${code})，请检查 API 配置或服务可用性。`;
    }
    if (code === 'INVALID_RESPONSE') {
      return '模型返回的响应格式无法解析，请更换模型或重试。';
    }
    if (code === 'NETWORK') {
      return '网络连接失败，无法连接到模型 API 端点。';
    }
    return `检测失败原因: ${code}`;
  }
}
