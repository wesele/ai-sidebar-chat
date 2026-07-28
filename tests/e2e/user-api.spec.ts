import { expect, test, chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('load extension and send test message to user LLM API', async ({}, testInfo) => {
  test.setTimeout(180_000);
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
    console.log('[user-api-test] Extension loaded with ID:', loaded.id);

    const userProvider = {
      id: 'user-custom-provider',
      name: 'User Provider',
      baseUrl: 'http://192.168.31.233:8080/v1',
      apiKey: 'sk-0e97d413d8553c6108ca476d34b911b283c6eea6',
      apiType: 'openai',
      models: ['CLI.gemini-3.5-flash-extra-low'],
      googleSearch: false,
    };

    const initialContext = {
      id: 'test-context-1',
      name: 'API 测试',
      systemPrompt: 'You are a helpful assistant.',
      maxHistory: 0,
      temperature: 0.7,
      topP: 1.0,
      customParams: '{}',
      reasoningEffort: '',
      messages: [],
      modelProviderId: userProvider.id,
      modelId: userProvider.models[0],
    };

    const page = await context.newPage();
    await page.goto(`chrome-extension://${loaded.id}/sidepanel.html`);

    // Inject user provider and context into chrome.storage.local
    await page.evaluate(async ({ provider, chatContext }) => {
      await chrome.storage.local.set({
        activePrimaryTab: 'tools',
        sidebarState: {
          providers: [provider],
          contexts: [chatContext],
        },
      });
    }, { provider: userProvider, chatContext: initialContext });

    // Reload sidepanel page to apply settings
    await page.reload();

    // Click AI Tools tab to display chat UI
    await page.click('[data-primary-tab="tools"]');
    await expect(page.locator('#chat-input')).toBeVisible();
    console.log('[user-api-test] Sidepanel UI ready');

    // Type a test prompt in input box
    const testMessage = '你好，请用一句话回答：1+1等于多少？';
    console.log('[user-api-test] Sending message:', testMessage);
    await page.fill('#chat-input', testMessage);
    await page.click('#send-btn');

    page.on('console', (msg) => console.log('[browser-console]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('[browser-pageerror]', err));

    // Wait for response message in chat container
    const assistantMessageLocator = page.locator('.message.assistant');
    console.log('[user-api-test] Waiting for response from LLM API...');
    
    await expect(assistantMessageLocator.first()).toBeVisible({ timeout: 60_000 });
    
    // Wait until response message appears and has non-empty text
    await page.waitForFunction(() => {
      const el = document.querySelector('.message.assistant') as HTMLElement | null;
      return el && el.innerText && el.innerText.trim().length > 0;
    }, { timeout: 60_000 });

    console.log('[user-api-test] Receiving streamed chunks from LLM API...');
    // Wait up to 30 seconds for streaming progress
    await page.waitForTimeout(30_000);

    const responseText = await assistantMessageLocator.first().innerText();
    console.log('[user-api-test] LLM Response received successfully:');
    console.log('--------------------------------------------------');
    console.log(responseText);
    console.log('--------------------------------------------------');

    expect(responseText).toBeTruthy();
  } finally {
    await browserCdp.detach();
    await browser.close();
  }
});
