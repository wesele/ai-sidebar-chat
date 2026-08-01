import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const TARGET_TEXT = 'i am hapy, you are not 幸福';
const MODEL_ID = 'ModelScope.Qwen/Qwen3.5-35B-A3B';
const BASE_URL = process.env.REAL_LLM_BASE_URL ?? 'http://192.168.31.233:8080/v1';
const API_KEY = process.env.REAL_LLM_API_KEY ?? 'sk-0e97d413d8553c6108ca476d34b911b283c6eea6';

type Combination = {
  name: string;
  disableThinking: boolean;
  constrainedDecoding: boolean;
};

const combinations: Combination[] = [
  { name: 'thinking-on constrained-off', disableThinking: false, constrainedDecoding: false },
  { name: 'thinking-off constrained-off', disableThinking: true, constrainedDecoding: false },
  { name: 'thinking-on constrained-on', disableThinking: false, constrainedDecoding: true },
  { name: 'thinking-off constrained-on', disableThinking: true, constrainedDecoding: true },
];

async function launchWithExtension(executablePath: string): Promise<{
  context: BrowserContext;
  extensionId: string;
  closeAll: () => Promise<void>;
}> {
  const context = await chromium.launchPersistentContext('', {
    executablePath,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const browser = context.browser();
  if (!browser) throw new Error('Persistent browser context did not expose a browser CDP session');
  const browserCdp = await browser.newBrowserCDPSession();
  const loaded = (await browserCdp.send('Extensions.loadUnpacked', { path: resolve('dist') })) as { id: string };
  return {
    context,
    extensionId: loaded.id,
    closeAll: async () => {
      await browserCdp.detach().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}

async function injectSettings(sidepanel: Page, combination: Combination): Promise<void> {
  await sidepanel.locator('#model-select option').first().waitFor({ state: 'attached', timeout: 10_000 });
  const provider = {
    id: 'qwen-real-provider',
    name: 'Qwen real provider',
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    apiType: 'openai',
    models: [MODEL_ID],
  };
  const settings = {
    providerId: provider.id,
    modelId: MODEL_ID,
    invocationStrategy: 'batch',
    maxConcurrency: 1,
    activationMode: 'always',
    fullDocumentCharacterLimit: 20_000,
    targetLanguage: 'EN',
    disableThinking: combination.disableThinking,
    constrainedDecoding: combination.constrainedDecoding,
  };
  await sidepanel.evaluate(async ({ provider, settings }) => {
    await chrome.storage.local.set({
      activePrimaryTab: 'writing',
      sidebarState: { providers: [provider] },
      writingAssistantSettings: settings,
    });
    await chrome.runtime.sendMessage({
      v: 1,
      type: 'SETTINGS_UPDATED',
      correlationId: crypto.randomUUID(),
      payload: settings,
    });
  }, { provider, settings });
}

for (const combination of combinations) {
  test(`Qwen matrix: ${combination.name}`, async ({}, testInfo) => {
    test.setTimeout(90_000);
    const startedAt = Date.now();
    const executablePath = testInfo.project.name === 'edge'
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const { context, extensionId, closeAll } = await launchWithExtension(executablePath);
    try {
      const sidepanel = await context.newPage();
      await sidepanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await injectSettings(sidepanel, combination);
      await sidepanel.locator('[data-primary-tab="writing"]').click();
      context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 10_000 });

      const editorPage = await context.newPage();
      await editorPage.goto(new URL('./fixtures/editor.html', import.meta.url).href);
      const editor = editorPage.locator('#editor');
      await editor.focus();
      await editor.fill(TARGET_TEXT);
      await editor.blur();

      const overlay = editorPage.locator('[data-writing-assistant="overlay"]');
      await expect(overlay).toHaveCount(1, { timeout: 15_000 });
      await expect(overlay).toHaveAttribute('data-dot-state', /^(?!analyzing)/, { timeout: 70_000 });

      const elapsedMs = Date.now() - startedAt;
      const result = {
        model: MODEL_ID,
        targetText: TARGET_TEXT,
        thinking: !combination.disableThinking,
        constrainedDecoding: combination.constrainedDecoding,
        elapsedMs,
        dotState: await overlay.getAttribute('data-dot-state'),
        issueCount: Number(await overlay.getAttribute('data-issue-count') ?? 0),
        problem: await overlay.getAttribute('data-analysis-error'),
      };
      console.log(`[qwen-matrix] ${JSON.stringify(result)}`);
      expect(result.problem).toBeNull();
      expect(result.dotState).not.toBe('error');
      expect(result.issueCount).toBeGreaterThan(0);
      expect(result.elapsedMs).toBeLessThan(75_000);
    } finally {
      await closeAll();
    }
  });
}
