import { expect, test, chromium, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';

async function launchWithExtension(executablePath: string): Promise<{
  context: BrowserContext;
  extensionId: string;
  closeAll: () => Promise<void>;
}> {
  const extensionPath = resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    executablePath,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });

  const browser = context.browser();
  if (!browser) throw new Error('Persistent browser context did not expose a browser CDP session');

  const browserCdp = await browser.newBrowserCDPSession();
  const loaded = (await browserCdp.send('Extensions.loadUnpacked', { path: extensionPath })) as { id: string };
  console.log('[repro] Extension loaded:', loaded.id);

  return {
    context,
    extensionId: loaded.id,
    closeAll: async () => {
      await browserCdp.detach().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

async function injectWritingSettings(
  sidepanelPage: Awaited<ReturnType<BrowserContext['newPage']>>,
  provider: Record<string, unknown>,
  settings: Record<string, unknown>,
): Promise<void> {
  await sidepanelPage.locator('#model-select option').first().waitFor({ state: 'attached', timeout: 10_000 });
  await sidepanelPage.evaluate(
    async ({ p, s }: { p: Record<string, unknown>; s: Record<string, unknown> }) => {
      await chrome.storage.local.set({
        activePrimaryTab: 'writing',
        sidebarState: { providers: [p] },
        writingAssistantSettings: s,
      });
      await chrome.runtime.sendMessage({
        v: 1,
        type: 'SETTINGS_UPDATED',
        correlationId: crypto.randomUUID(),
        payload: s,
      });
    },
    { p: provider, s: settings },
  );
}

const USER_PROVIDER = {
  id: 'user-custom-provider',
  name: 'User Provider',
  baseUrl: process.env.REAL_LLM_BASE_URL ?? 'http://192.168.31.233:8080/v1',
  apiKey: process.env.REAL_LLM_API_KEY ?? 'sk-0e97d413d8553c6108ca476d34b911b283c6eea6',
  apiType: 'openai' as const,
  models: [process.env.REAL_LLM_MODEL ?? 'V.ds4flash'],
  googleSearch: false,
};

const WRITING_SETTINGS = {
  providerId: USER_PROVIDER.id,
  modelId: USER_PROVIDER.models[0],
  invocationStrategy: 'batch' as const,
  maxConcurrency: 3,
  activationMode: 'always' as const,
  fullDocumentCharacterLimit: 20_000,
  targetLanguage: 'EN' as const,
  disableThinking: true,
  constrainedDecoding: process.env.REAL_LLM_CONSTRAINED_DECODING === 'true',
};

test('CJK sentence with spelling errors must not fail detection on V.ds4flash', async ({}, testInfo) => {
  test.setTimeout(150_000);
  const t0 = Date.now();
  const mark = (label: string) => console.log(`[repro] ${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`);
  const executablePath =
    testInfo.project.name === 'edge'
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

  const { context, extensionId, closeAll } = await launchWithExtension(executablePath);
  try {
    mark('launched');
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await injectWritingSettings(sidepanelPage, USER_PROVIDER, WRITING_SETTINGS);
    mark('settings injected');

    const writingTab = sidepanelPage.locator('[data-primary-tab="writing"]');
    await expect(writingTab).toHaveCount(1);
    await writingTab.click();

    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
    mark('service worker up');

    const editorPage = await context.newPage();
    editorPage.on('console', (m) => console.log('[editor]', m.type(), m.text()));
    editorPage.on('pageerror', (e) => console.error('[editor-error]', e));

    await editorPage.goto(new URL('./fixtures/editor.html', import.meta.url).href);
    mark('editor page loaded');

    const editor = editorPage.locator('#editor');
    await expect(editor).toBeVisible();
    await editor.focus();
    await editor.fill('What is this? Hiw can I tell you it is the frist \u730b\u730b\u3002');
    await editor.blur();
    await editorPage.waitForTimeout(2_000);
    mark('text filled + blurred');

    const overlay = editorPage.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1, { timeout: 15_000 });
    mark('overlay attached');

    await expect(overlay).toHaveAttribute('data-dot-state', /^(?!analyzing)/, { timeout: 100_000 });
    const dotState = await overlay.getAttribute('data-dot-state');
    mark(`dot state settled: ${dotState}`);

    const issueCount = await overlay.getAttribute('data-issue-count');
    console.log('[repro] Detected issue count:', issueCount);

    const marks = await editorPage.evaluate(() => {
      const host = document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]');
      return host?.shadowRoot ? Array.from(host.shadowRoot.querySelectorAll('.mark')).map((m) => m.textContent) : [];
    });
    console.log('[repro] Marks:', JSON.stringify(marks));

    const errorText = sidepanelPage.locator('[data-writing-error-text]');
    const errorTextCount = await errorText.count();
    console.log('[repro] Sidebar error text present:', errorTextCount);

    const statusTexts = await sidepanelPage.locator('.wa-status-text').allTextContents().catch(() => []);
    const statusText = statusTexts[0] ?? '(none)';
    console.log('[repro] Sidebar status text:', statusText);

    expect(dotState).not.toBe('error');
    expect(Number(issueCount)).toBeGreaterThan(0);
    expect(errorTextCount).toBe(0);
    mark('PASSED');
  } finally {
    mark('closing');
    await closeAll();
    mark('closed');
  }
});


