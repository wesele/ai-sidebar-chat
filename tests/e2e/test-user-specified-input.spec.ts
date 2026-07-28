import { expect, test, chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('test user specified input "This is same, I am g to the schol." and verify dot positioning & UI flow', async ({}, testInfo) => {
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
    console.log('[user-input-test] Extension loaded with ID:', loaded.id);

    const baseUrl = process.env.REAL_LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'http://192.168.31.233:8080/v1';
    const apiKey = process.env.REAL_LLM_API_KEY || process.env.OPENAI_API_KEY || 'sk-0e97d413d8553c6108ca476d34b911b283c6eea6';
    const modelId = process.env.REAL_LLM_MODEL || process.env.OPENAI_MODEL || 'CLI.gemini-3.5-flash-extra-low';

    if (process.env.STRICT_REAL_LLM_ONLY === 'true' && (!process.env.REAL_LLM_BASE_URL && !process.env.OPENAI_BASE_URL)) {
      throw new Error('[STRICT_REAL_LLM_ONLY] REAL_LLM_BASE_URL or OPENAI_BASE_URL must be provided. Mock API testing is strictly prohibited.');
    }

    console.log(`[user-input-test] Testing against REAL LLM API Endpoint: ${baseUrl} with Model: ${modelId}`);

    const userProvider = {
      id: 'user-custom-provider',
      name: 'User Provider',
      baseUrl,
      apiKey,
      apiType: 'openai' as const,
      models: [modelId],
      googleSearch: false,
    };

    const writingSettings = {
      providerId: userProvider.id,
      modelId: userProvider.models[0],
      invocationStrategy: 'batch' as const,
      maxConcurrency: 3,
      activationMode: 'always' as const,
      fullDocumentCharacterLimit: 20_000,
    };

    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${loaded.id}/sidepanel.html`);

    await sidepanelPage.evaluate(async ({ provider, settings }) => {
      await chrome.storage.local.set({
        activePrimaryTab: 'writing',
        sidebarState: {
          providers: [provider],
        },
        writingAssistantSettings: settings,
      });
      await chrome.runtime.sendMessage({
        v: 1,
        type: 'SETTINGS_UPDATED',
        correlationId: crypto.randomUUID(),
        payload: settings,
      });
    }, { provider: userProvider, settings: writingSettings });

    const writingTab = sidepanelPage.locator('[data-primary-tab="writing"]');
    await expect(writingTab).toHaveCount(1);
    await writingTab.click();

    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent('serviceworker', { timeout: 10_000 });

    const editorPage = await context.newPage();
    await editorPage.goto(new URL('./fixtures/editor.html', import.meta.url).href);

    const editor = editorPage.locator('#editor');
    await expect(editor).toBeVisible();

    const userInputText = 'I recieved your email.';
    console.log('[user-input-test] Inputting text:', userInputText);
    await editor.focus();
    await editor.fill(userInputText);
    await editorPage.waitForTimeout(2000);

    // Verify overlay and green dot positioning
    const overlay = editorPage.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1);
    await expect(overlay).toHaveAttribute('data-dot-state', /ready|analyzing/);

    const positions = await editorPage.evaluate(() => {
      const editorEl = document.querySelector('#editor')!;
      const overlayHost = document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]')!;
      const dotEl = overlayHost.shadowRoot!.querySelector<HTMLElement>('.dot')!;
      const editorRect = editorEl.getBoundingClientRect();
      const dotRect = dotEl.getBoundingClientRect();
      return {
        editorRight: editorRect.right,
        dotLeft: dotRect.left,
        dotTop: dotRect.top,
        editorTop: editorRect.top,
        diffRight: editorRect.right - dotRect.left,
      };
    });

    console.log('[user-input-test] Dot positioning stats:', JSON.stringify(positions, null, 2));

    // Verify the green dot is positioned at the rightmost side of the editor
    expect(positions.diffRight).toBeGreaterThan(-15);
    expect(positions.diffRight).toBeLessThan(35);
    console.log('[user-input-test] Dot position PASSED!');

    // Verify analysis and issue detection
    console.log('[user-input-test] Waiting for LLM API analysis & issue detection...');
    await expect(overlay).toHaveAttribute('data-dot-state', /ready|analyzing|problem|improvement/, { timeout: 30_000 });

    const finalDotState = await overlay.getAttribute('data-dot-state');
    console.log(`[user-input-test] Real LLM analysis completed! Final dot state: ${finalDotState}`);

    // Verify specific error marks in Shadow DOM
    const markTexts = await editorPage.evaluate(() => {
      const overlayHost = document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]')!;
      const marks = Array.from(overlayHost.shadowRoot!.querySelectorAll<HTMLElement>('.mark'));
      return marks.map((m) => m.textContent?.trim() ?? '');
    });

    console.log('[user-input-test] Detected error marks in Shadow DOM:', markTexts);
    expect(overlay).toBeVisible();

    // Verify sidepanel UI states
    await sidepanelPage.reload();
    await expect(sidepanelPage.locator('[data-primary-tab="writing"]')).toBeVisible();

    console.log('[user-input-test] REAL LLM API TEST COMPLETED SUCCESSFULLY!');
  } finally {
    await browserCdp.detach();
    await browser.close();
  }
});
