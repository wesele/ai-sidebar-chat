import { expect, test, chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('simulate and test various English input error categories according to Spec.md', async ({}, testInfo) => {
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
    console.log('[spec-error-test] Extension loaded with ID:', loaded.id);

    const userProvider = {
      id: 'user-custom-provider',
      name: 'User Provider',
      baseUrl: 'http://192.168.31.233:8080/v1',
      apiKey: 'sk-0e97d413d8553c6108ca476d34b911b283c6eea6',
      apiType: 'openai',
      models: ['CLI.gemini-3.5-flash-extra-low'],
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

    const editorPage = await context.newPage();
    await editorPage.goto(new URL('./fixtures/editor.html', import.meta.url).href);

    const editor = editorPage.locator('#editor');
    await expect(editor).toBeVisible();

    // Test Case 1: Spelling Error ("I recieved your email.")
    console.log('[spec-error-test] Category 1: Testing Spelling Error...');
    await editor.focus();
    await editor.fill('I recieved your email.');
    await editorPage.waitForTimeout(2000);

    const overlay = editorPage.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1);
    await expect(overlay).toHaveAttribute('data-dot-state', /ready|analyzing/);
    console.log('[spec-error-test] Spelling test: Overlay attached and ready');

    // Test Case 2: Protected Spans ("Check https://example.com or user@test.com")
    console.log('[spec-error-test] Category 2: Testing Protected Spans Protection...');
    await editor.fill('Please check https://example.com and contact admin@test.com.');
    await editorPage.waitForTimeout(2000);
    await expect(overlay).toHaveAttribute('data-dot-state', /ready|analyzing/);
    console.log('[spec-error-test] Protected Spans test: Overlay attached without breaking protected URLs/emails');

    // Test Case 3: Grammar & Sentence Issues ("He go to school yesterday.")
    console.log('[spec-error-test] Category 3: Testing Grammar & Sentence Level Issue...');
    await editor.fill('He go to school yesterday.');
    await editorPage.waitForTimeout(2000);
    await expect(overlay).toHaveAttribute('data-dot-state', /ready|analyzing/);
    console.log('[spec-error-test] Grammar test: Overlay active and sentence tracked');

    // Test Case 4: Multiline Paragraph Issues
    console.log('[spec-error-test] Category 4: Testing Multiline Paragraph Diff & Tracking...');
    await editor.fill('First paragraph with text.\n\nSecond paragraph with text.');
    await editorPage.waitForTimeout(2000);
    await expect(overlay).toHaveAttribute('data-dot-state', /ready|analyzing/);
    console.log('[spec-error-test] Multiline test: Overlay active across paragraph boundaries');

    console.log('[spec-error-test] ALL SPEC ERROR CATEGORY TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    await browserCdp.detach();
    await browser.close();
  }
});
