import { expect, test, chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('root loader runs the direct sidepanel page', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const executablePath = testInfo.project.name === 'edge'
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    : 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const context = await chromium.launchPersistentContext('', {
    executablePath,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const browser = context.browser();
  if (!browser) throw new Error('Persistent browser context did not expose a browser CDP session');
  const browserCdp = await browser.newBrowserCDPSession();
  try {
    const loaded = await browserCdp.send('Extensions.loadUnpacked', { path: resolve('dist') }) as { id: string };
    const page = await context.newPage();
    await page.goto(`chrome-extension://${loaded.id}/sidepanel.html`);
    await expect(page.locator('#context-bar button')).toHaveCount(1);
    const writingTab = page.locator('[data-primary-tab="writing"]');
    await expect(writingTab).toHaveCount(1);
    await writingTab.click();
    await expect(page.locator('#writing-assistant-panel')).toBeVisible();
    await expect(page.locator('.wa-model-select')).toHaveCount(1);
  } finally {
    await browserCdp.detach();
    await browser.close();
  }
});

test('loads the packaged extension and completes a real analysis request using real LLM API', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const extensionPath = resolve('dist');
  const executablePath = testInfo.project.name === 'edge'
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    : 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const context = await chromium.launchPersistentContext('', {
    executablePath,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const browser = context.browser();
  if (!browser) throw new Error('Persistent browser context did not expose a browser CDP session');
  const browserCdp = await browser.newBrowserCDPSession();
  try {
    const loaded = await browserCdp.send('Extensions.loadUnpacked', { path: extensionPath }) as { id: string };
    expect(loaded.id).toMatch(/^[a-p]{32}$/);
    console.log('[extension-e2e] loaded with ID:', loaded.id);

    const realProvider = {
      id: 'user-custom-provider',
      name: 'User Provider',
      baseUrl: 'http://192.168.31.233:8080/v1',
      apiKey: 'sk-0e97d413d8553c6108ca476d34b911b283c6eea6',
      apiType: 'openai' as const,
      models: ['CLI.gemini-3.5-flash-extra-low'],
      googleSearch: false,
    };

    const writingSettings = {
      providerId: realProvider.id,
      modelId: realProvider.models[0],
      invocationStrategy: 'batch' as const,
      maxConcurrency: 3,
      activationMode: 'always' as const,
      fullDocumentCharacterLimit: 20_000,
    };

    const bootstrap = await context.newPage();
    await bootstrap.goto(`chrome-extension://${loaded.id}/sidepanel.html`);
    await expect(bootstrap.locator('#context-bar button')).toHaveCount(1);

    await bootstrap.evaluate(async ({ provider, nextSettings }) => {
      await chrome.storage.local.set({
        activePrimaryTab: 'writing',
        sidebarState: {
          providers: [provider],
        },
        writingAssistantSettings: nextSettings,
      });
      await chrome.runtime.sendMessage({
        v: 1,
        type: 'SETTINGS_UPDATED',
        correlationId: crypto.randomUUID(),
        payload: nextSettings,
      });
    }, { provider: realProvider, nextSettings: writingSettings });

    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent('serviceworker', { timeout: 10_000 });
    const storedSettings = await worker.evaluate(async () => {
      return chrome.storage.local.get(['sidebarState', 'writingAssistantSettings']);
    });
    expect(storedSettings.writingAssistantSettings).toMatchObject(writingSettings);
    expect(storedSettings.sidebarState.providers[0].apiKey).toBe(realProvider.apiKey);
    console.log('[extension-e2e] configured real provider & storage');

    const writingTab = bootstrap.locator('[data-primary-tab="writing"]');
    await expect(writingTab).toHaveCount(1);
    await writingTab.click();
    const writingModel = bootstrap.locator('.wa-model-select');
    await expect(writingModel).toHaveValue(`${realProvider.id}|${realProvider.models[0]}`);

    const page = await context.newPage();
    page.on('console', (msg) => console.log('[editor-console]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('[editor-pageerror]', err));

    await page.goto(new URL('./fixtures/editor.html', import.meta.url).href);
    const editor = page.locator('#editor');
    await editor.focus();
    await editor.fill('I recieved your email.');
    await editor.blur();
    await page.waitForTimeout(2000);

    const overlay = page.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1);
    await expect(overlay).toHaveAttribute('data-dot-state', /ready|analyzing/);
    console.log('[extension-e2e] overlay attached');

    await expect(overlay).toHaveAttribute('data-dot-state', /ready|analyzing|problem|improvement/, { timeout: 30_000 });
    console.log('[extension-e2e] real LLM analysis active & completing');

    const mark = page.locator('[data-writing-assistant="overlay"] .mark');
    if (await mark.count() > 0 && await mark.isVisible()) {
      await mark.click();
      const editorValue = await page.locator('#editor').inputValue();
      console.log('[extension-e2e] editor value after applying fix:', editorValue);

      await page.locator('#editor').press('Control+z');
      const undoneValue = await page.locator('#editor').inputValue();
      expect(undoneValue).toBe('I recieved your email.');
      console.log('[extension-e2e] undo completed successfully');
    }
  } finally {
    await browserCdp.detach();
    await browser.close();
  }
});
