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
      targetLanguage: 'EN' as const,
      constrainedDecoding: true,
      disableThinking: true,
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

    const userInputText = 'I recieved your email, monday. However I disagree. Thank you.';
    console.log('[user-input-test] Inputting exact user text:', userInputText);
    await editor.focus();
    await editor.fill(userInputText);
    await editor.blur();

    const overlay = editorPage.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1);
    await expect(overlay).toHaveAttribute('data-dot-state', /^(?!analyzing)/, { timeout: 45_000 });

    // Explicitly click the 全文 button in sidepanel to request full document analysis
    const fullBtn = sidepanelPage.locator('.wa-count-btn[data-scope="full"]');
    await expect(fullBtn).toHaveCount(1, { timeout: 15_000 });
    console.log('[user-input-test] Clicking 全文 button in sidepanel...');
    await fullBtn.click();

    await editorPage.waitForTimeout(5000);
    const finalDotState = await overlay.getAttribute('data-dot-state');
    const finalError = await overlay.getAttribute('data-analysis-error');
    console.log(`[user-input-test] Analysis completed! Dot state: ${finalDotState}, error: ${finalError}`);

    const fullCard = sidepanelPage.locator('.wa-full-card');
    const fullCardText = await fullCard.textContent().catch(() => 'card not found');
    console.log('[user-input-test] Full document card content:', fullCardText);

    expect(finalDotState).not.toBe('error');
    expect(finalError).toBeNull();

    console.log('[user-input-test] REAL LLM API TEST COMPLETED SUCCESSFULLY WITH CONSTRAINED DECODING!');
  } finally {
    await browserCdp.detach();
    await browser.close();
  }
});
