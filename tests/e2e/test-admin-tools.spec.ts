import { expect, test, chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('test writing assistant on http://192.168.31.233:8080/admin/tools Edit module', async ({}, testInfo) => {
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
    console.log('[admin-tools-test] Extension loaded with ID:', loaded.id);

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
    sidepanelPage.on('console', (msg) => console.log('[sidepanel-console]', msg.type(), msg.text()));
    sidepanelPage.on('pageerror', (err) => console.error('[sidepanel-error]', err));
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

    console.log('[admin-tools-test] Storage configured with provider & writing settings');

    const page = await context.newPage();
    page.on('console', (msg) => console.log('[page-console]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('[page-error]', err));

    console.log('[admin-tools-test] Navigating to http://192.168.31.233:8080/admin/tools ...');
    await page.goto('http://192.168.31.233:8080/admin/tools');

    await page.waitForTimeout(2000);

    // Check login
    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.count() > 0 && await passwordInput.isVisible()) {
      console.log('[admin-tools-test] Logging in with password...');
      await passwordInput.fill('Cogent~2020');
      const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("登录"), button:has-text("Login")');
      if (await submitBtn.count() > 0) {
        await submitBtn.first().click();
      } else {
        await passwordInput.press('Enter');
      }
      await page.waitForTimeout(3000);
    }

    // Always navigate to /admin/tools after login
    await page.goto('http://192.168.31.233:8080/admin/tools');
    await page.waitForTimeout(2000);
    console.log('[admin-tools-test] Now on page:', page.url());

    // Print all buttons and tab elements on the page to find the Edit module trigger
    const pageStructure = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, .tab, [role="tab"]')).map(el => ({
        text: (el as HTMLElement).innerText.trim(),
        id: el.id,
        className: el.className,
      }));
      const textareaEl = document.querySelector('#edit-textarea');
      let parentInfo = null;
      if (textareaEl) {
        let parent: HTMLElement | null = textareaEl.parentElement;
        parentInfo = [];
        while (parent && parent !== document.body) {
          parentInfo.push({
            tagName: parent.tagName,
            id: parent.id,
            className: parent.className,
            style: parent.getAttribute('style'),
            hidden: parent.hidden,
            display: getComputedStyle(parent).display,
          });
          parent = parent.parentElement;
        }
      }
      return { buttons, parentInfo };
    });

    console.log('[admin-tools-test] Page interactive elements:', JSON.stringify(pageStructure, null, 2));

    // Try to click any button/tab that opens the Edit module
    const editModuleTrigger = page.locator('button:has-text("Edit"), button:has-text("编辑"), [data-module="edit"], .edit-btn, [href*="edit"]').first();
    if (await editModuleTrigger.count() > 0) {
      console.log('[admin-tools-test] Clicking edit module trigger...');
      await editModuleTrigger.click();
      await page.waitForTimeout(1000);
    } else {
      // If parent is display:none, remove display:none or display it
      await page.evaluate(() => {
        const textareaEl = document.querySelector('#edit-textarea');
        if (textareaEl) {
          let parent: HTMLElement | null = textareaEl as HTMLElement;
          while (parent && parent !== document.body) {
            parent.style.display = 'block';
            parent.hidden = false;
            parent = parent.parentElement;
          }
        }
      });
      await page.waitForTimeout(500);
    }

    // Find textarea
    const textarea = page.locator('#edit-textarea, textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    console.log('[admin-tools-test] Textarea is now visible! Focusing...');

    await textarea.click();
    await textarea.pressSequentially('This is the best one00', { delay: 50 });
    console.log('[admin-tools-test] Text typed sequentially into Edit input box');

    // Wait for content script to attach overlay
    const overlay = page.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1, { timeout: 15_000 });
    console.log('[admin-tools-test] SUCCESS: Writing assistant overlay attached to Edit module input box!');

    const dotState = await overlay.getAttribute('data-dot-state');
    console.log('[admin-tools-test] Overlay dot state:', dotState);

    // Give sidepanel time to sync state
    await page.waitForTimeout(2000);

    const sidepanelStatus = await sidepanelPage.locator('.wa-status').innerText();
    console.log('[admin-tools-test] Sidepanel status immediately after typing:', JSON.stringify(sidepanelStatus));

    const selectedModel = await sidepanelPage.locator('.model-select-label').innerText().catch(() => 'unknown');
    console.log('[admin-tools-test] Selected model in sidepanel:', selectedModel);

    // Save screenshots
    await page.screenshot({ path: 'C:/Users/wh101/.gemini/antigravity/brain/e1136172-0846-4d20-b709-5a4a1d938bfa/scratch/page_test.png' });
    await sidepanelPage.screenshot({ path: 'C:/Users/wh101/.gemini/antigravity/brain/e1136172-0846-4d20-b709-5a4a1d938bfa/scratch/sidepanel_test.png' });
    console.log('[admin-tools-test] Screenshots saved to scratch directory.');

    expect(overlay).toBeVisible();
    expect(sidepanelStatus).not.toContain('聚焦一个编辑器以开始');
  } finally {
    await browserCdp.detach();
    await browser.close();
  }
});
