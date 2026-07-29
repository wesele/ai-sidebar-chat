import { describe, expect, it, vi } from 'vitest';
import { WritingAssistantPanel } from '../../src/sidepanel/app';

const state = {
  editorId: 'e',
  revision: 1,
  status: 'analyzed',
  counts: { sentence: 2, paragraph: 1 },
  currentSentence: {
    issueId: 's', original: 'bad sentence', replacement: 'good sentence', reason: 'grammar',
  },
  currentParagraph: {
    issueId: 'p', original: 'bad paragraph', replacement: 'good paragraph', reason: 'coherence',
  },
  batchPreviews: {
    local: [],
    sentence: [
      { issueId: 's1', severity: 'problem' as const, original: 'bad one', replacement: 'good one', reason: 'grammar one' },
      { issueId: 's2', severity: 'improvement' as const, original: '<img src=x>', replacement: 'good two', reason: 'grammar two' },
    ],
    paragraph: [
      { issueId: 'p', severity: 'problem' as const, original: 'bad paragraph', replacement: 'good paragraph', reason: 'coherence' },
    ],
  },
  fullResult: { severity: 'problem', summary: 'Global issue' },
};

describe('writing side panel', () => {
  it('orders sentence before paragraph and sends individual apply', () => {
    const root = document.createElement('div');
    const command = vi.fn();
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), command);
    panel.setState(state, 7);
    expect(root.textContent?.indexOf('当前句子')).toBeLessThan(root.textContent!.indexOf('当前段落'));
    const apply = Array.from(root.querySelectorAll('button')).find((button) => button.textContent === '应用修改')!;
    apply.click();
    expect(command).toHaveBeenCalledWith('APPLY_ISSUE', {
      tabId: 7, editorId: 'e', revision: 1, issueId: 's',
    });
    const fullBtn = Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.includes('全文'))!;
    expect(fullBtn).not.toBeUndefined();
    fullBtn.click();
    expect(root.querySelector('.wa-full-card')?.textContent).toContain('Global issue');
  });

  it('hides section box when paragraph or sentence has no issue', () => {
    const root = document.createElement('div');
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), vi.fn());
    panel.setState({
      editorId: 'e',
      revision: 1,
      status: 'analyzed',
      counts: {},
      // currentSentence and currentParagraph are undefined
    }, 7);
    expect(root.querySelectorAll('.wa-section').length).toBe(0);
  });

  it('shows every replacement before an explicit batch confirmation', () => {
    const root = document.createElement('div');
    const command = vi.fn();
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), command);
    panel.setState(state, 7);
    Array.from(root.querySelectorAll('button')).find((button) => button.textContent === '句子 2')!.click();
    expect(command).not.toHaveBeenCalled();
    const preview = root.querySelector<HTMLElement>('[data-batch-preview="sentence"]')!;
    expect(preview.getAttribute('role')).toBe('dialog');
    expect(preview.textContent).toContain('bad one → good one');
    expect(preview.textContent).toContain('<img src=x> → good two');
    expect(preview.textContent).toContain('grammar two');
    expect(preview.querySelector('img')).toBeNull();
    Array.from(preview.querySelectorAll('button'))
      .find((button) => button.textContent === '确认全部应用')!.click();
    expect(command).toHaveBeenCalledWith('APPLY_ALL', {
      tabId: 7, editorId: 'e', revision: 1, scope: 'sentence', expectedCount: 2,
    });
    expect(root.querySelector('[data-batch-preview]')).toBeNull();
  });

  it('reports applied and skipped batch items', () => {
    const root = document.createElement('div');
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), vi.fn());
    panel.setState(state, 7);
    panel.setApplyResult({
      tabId: 7, editorId: 'e', revision: 1, scope: 'sentence', applied: 1, skipped: 1, stale: false,
    });
    const result = root.querySelector<HTMLElement>('[data-apply-result="sentence"]')!;
    expect(result.getAttribute('role')).toBe('status');
    expect(result.textContent).toBe('已应用 1 项句子修改，跳过 1 项。');
  });

  it('ignores another editor result and explains a stale matching result', () => {
    const root = document.createElement('div');
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), vi.fn());
    panel.setState(state, 7);
    panel.setApplyResult({
      tabId: 7, editorId: 'other', revision: 1, scope: 'sentence', applied: 2, skipped: 0, stale: false,
    });
    expect(root.querySelector('[data-apply-result]')).toBeNull();
    panel.setApplyResult({
      tabId: 7, editorId: 'e', revision: 1, scope: 'sentence', applied: 0, skipped: 2, stale: true,
    });
    expect(root.querySelector('[data-apply-result]')?.textContent).toBe('内容已变化，建议已刷新。');
  });

  it('keeps model selection on the page and persists non-model settings from the dialog', () => {
    const root = document.createElement('div');
    const persist = vi.fn(async () => undefined);
    const panel = new WritingAssistantPanel(root, persist, vi.fn());
    panel.setProviders([{ id: 'p', name: 'Provider', models: ['m'] }]);
    panel.setSettings({
      providerId: 'p', modelId: 'm', invocationStrategy: 'parallel', maxConcurrency: 5,
      activationMode: 'panel_open', fullDocumentCharacterLimit: 1234,
    });
    expect(root.querySelector('h2')).toBeNull();
    expect(root.querySelector('.wa-model-select')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-writing-settings-button]')!.click();
    expect(root.querySelector('[data-writing-settings] select[data-field="modelId"]')).toBeNull();
    root.querySelector('[data-writing-settings] form')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    expect(persist).toHaveBeenCalledWith({
      providerId: 'p', modelId: 'm', invocationStrategy: 'parallel', maxConcurrency: 5,
      activationMode: 'panel_open', fullDocumentCharacterLimit: 1234, targetLanguage: 'EN',
    });
  });

  it('shows clickable failure status, opens error reason modal, and triggers retry command', () => {
    const root = document.createElement('div');
    const command = vi.fn();
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), command);
    panel.setState({
      editorId: 'e',
      revision: 1,
      status: 'error',
      counts: {},
      errorReason: 'HTTP_401',
    }, 7);

    const errorText = root.querySelector<HTMLElement>('[data-writing-error-text="true"]');
    expect(errorText).not.toBeNull();
    expect(errorText?.textContent).toBe('检测失败（点击查看原因）');

    const retryBtn = root.querySelector<HTMLButtonElement>('[data-writing-retry-button="true"]');
    expect(retryBtn).not.toBeNull();
    expect(retryBtn?.textContent).toBe('重试');

    // Click retry button on bar
    retryBtn?.click();
    expect(command).toHaveBeenCalledWith('RETRY_DETECTION', { tabId: 7 });

    // Click error text to open modal
    errorText?.click();
    const modal = root.querySelector<HTMLElement>('[data-writing-error-modal="true"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('检测失败原因');
    expect(modal?.textContent).toContain('API Key 无效或未授权 (HTTP 401)');

    // Click retry in modal
    const modalRetryBtn = Array.from(modal?.querySelectorAll('button') ?? [])
      .find((btn) => btn.textContent === '重试检测');
    expect(modalRetryBtn).not.toBeUndefined();
    modalRetryBtn?.click();
    expect(command).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-writing-error-modal="true"]')).toBeNull();
  });

  it('renders grey 全文 button when untriggered and sends REQUEST_FULL_ANALYSIS command on click', () => {
    const root = document.createElement('div');
    const command = vi.fn();
    const panel = new WritingAssistantPanel(root, vi.fn(async () => undefined), command);
    panel.setState({
      editorId: 'e',
      revision: 1,
      status: 'analyzed',
      counts: { sentence: 1 },
    }, 7);

    const fullBtn = Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.includes('全文'))!;
    expect(fullBtn).not.toBeUndefined();
    expect(fullBtn.classList.contains('wa-count-btn-gray')).toBe(true);

    fullBtn.click();
    expect(command).toHaveBeenCalledWith('REQUEST_FULL_ANALYSIS', { tabId: 7 });
  });

  it('renders writing language selector with EN, ES, CN options and config icon button', () => {
    const root = document.createElement('div');
    const persist = vi.fn(async () => undefined);
    const panel = new WritingAssistantPanel(root, persist, vi.fn());
    panel.setSettings({ targetLanguage: 'ES' });

    const langSelect = root.querySelector<HTMLSelectElement>('[data-writing-language-select="true"]');
    expect(langSelect).not.toBeNull();
    expect(langSelect?.value).toBe('ES');
    const options = Array.from(langSelect?.options ?? []).map((o) => o.value);
    expect(options).toEqual(['EN', 'ES', 'CN']);

    // Config button should be an icon button without text
    const configBtn = root.querySelector<HTMLButtonElement>('[data-writing-settings-button="true"]');
    expect(configBtn).not.toBeNull();
    expect(configBtn?.textContent?.trim()).toBe('');
    expect(configBtn?.querySelector('svg')).not.toBeNull();

    // Changing language triggers persist
    langSelect!.value = 'CN';
    langSelect!.dispatchEvent(new Event('change'));
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: 'CN' }));
  });
});
