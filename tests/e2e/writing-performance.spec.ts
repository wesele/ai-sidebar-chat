import { expect, test, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Performance regression: message-loop + tab-switch freeze
// Root cause (fixed): content edge-guard on PANEL_CONNECTION_CHANGED so
// WRITING_MODEL_STATUS_REQUEST no longer ping-pongs with background replies.
// ---------------------------------------------------------------------------

const REAL_LLM_BASE_URL = process.env.REAL_LLM_BASE_URL ?? 'http://192.168.31.233:8080/v1';
const REAL_LLM_API_KEY = process.env.REAL_LLM_API_KEY ?? 'sk-0e97d413d8553c6108ca476d34b911b283c6eea6';
const REAL_LLM_MODEL = process.env.REAL_LLM_MODEL ?? 'CLI.gemini-3.1-pro-low';

const USER_PROVIDER = {
  id: 'user-custom-provider',
  name: 'User Provider',
  baseUrl: REAL_LLM_BASE_URL,
  apiKey: REAL_LLM_API_KEY,
  apiType: 'openai' as const,
  models: [REAL_LLM_MODEL],
  googleSearch: false,
};

const WRITING_SETTINGS = {
  providerId: USER_PROVIDER.id,
  modelId: REAL_LLM_MODEL,
  invocationStrategy: 'batch' as const,
  maxConcurrency: 3,
  activationMode: 'always' as const,
  fullDocumentCharacterLimit: 20_000,
  targetLanguage: 'EN' as const,
  constrainedDecoding: false,
};

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
  const loaded = (await browserCdp.send('Extensions.loadUnpacked', {
    path: resolve('dist'),
  })) as { id: string };
  console.log('[writing-perf] Extension loaded:', loaded.id);

  return {
    context,
    extensionId: loaded.id,
    closeAll: async () => {
      await browserCdp.detach().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

async function injectWritingSettings(sidepanelPage: Page): Promise<void> {
  await sidepanelPage.locator('#model-select option').first().waitFor({ state: 'attached', timeout: 10_000 });
  await sidepanelPage.evaluate(
    async ({ p, s }) => {
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
    { p: USER_PROVIDER, s: WRITING_SETTINGS },
  );
}

async function waitForServiceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
}

type MsgCounts = { statusRequest: number; panelOpen: number; panelClose: number };

async function installMessageCounters(worker: Worker): Promise<void> {
  await worker.evaluate(() => {
    const g = globalThis as typeof globalThis & { __perfCounts?: Record<string, number> };
    if (g.__perfCounts) return;
    g.__perfCounts = { statusRequest: 0, panelOpen: 0, panelClose: 0 };
    chrome.runtime.onMessage.addListener((message: { type?: string; payload?: { open?: boolean } }) => {
      const c = (globalThis as typeof globalThis & { __perfCounts: Record<string, number> }).__perfCounts;
      if (message?.type === 'WRITING_MODEL_STATUS_REQUEST') c.statusRequest += 1;
      else if (message?.type === 'PANEL_CONNECTION_CHANGED' && message.payload?.open === true) c.panelOpen += 1;
      else if (message?.type === 'PANEL_CONNECTION_CHANGED' && message.payload?.open === false) c.panelClose += 1;
      return undefined;
    });
  });
}

async function readMessageCounters(worker: Worker): Promise<MsgCounts> {
  return worker.evaluate(() => {
    const g = globalThis as typeof globalThis & { __perfCounts?: Record<string, number> };
    const c = g.__perfCounts ?? { statusRequest: 0, panelOpen: 0, panelClose: 0 };
    return {
      statusRequest: c.statusRequest ?? 0,
      panelOpen: c.panelOpen ?? 0,
      panelClose: c.panelClose ?? 0,
    } as MsgCounts;
  });
}

async function resetMessageCounters(worker: Worker): Promise<void> {
  await worker.evaluate(() => {
    const g = globalThis as typeof globalThis & { __perfCounts?: Record<string, number> };
    if (g.__perfCounts) {
      g.__perfCounts.statusRequest = 0;
      g.__perfCounts.panelOpen = 0;
      g.__perfCounts.panelClose = 0;
    }
  });
}

// ---------------------------------------------------------------------------
// Test A: message loop must stay bounded while panel + editor are open
// ---------------------------------------------------------------------------

test('perf-A: WRITING_MODEL_STATUS_REQUEST stays bounded (no content↔background ping-pong)', async ({}, testInfo) => {
  test.setTimeout(90_000);
  const executablePath =
    testInfo.project.name === 'edge'
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

  const { context, extensionId, closeAll } = await launchWithExtension(executablePath);
  try {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await injectWritingSettings(sidepanelPage);

    const worker = await waitForServiceWorker(context);
    await installMessageCounters(worker);

    const editorPage = await context.newPage();
    await editorPage.goto(new URL('./fixtures/editor.html', import.meta.url).href);
    const editor = editorPage.locator('#editor');
    await editor.focus();
    await editor.fill('I recieved your email.');
    await editor.blur();

    const overlay = editorPage.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1, { timeout: 15_000 });

    // Allow initial edge + status handshake to settle, then measure idle window.
    await editorPage.waitForTimeout(2_000);
    await resetMessageCounters(worker);

    // Idle observation window with panel open + editor attached.
    // Before the fix this window saw unbounded WRITING_MODEL_STATUS_REQUEST growth.
    await editorPage.waitForTimeout(5_000);
    const idleCounts = await readMessageCounters(worker);
    console.log('[perf-A] idle 5s counts:', JSON.stringify(idleCounts));

    // Bounded: edge trigger allows a handful of requests (visibility/focus), never a flood.
    expect(idleCounts.statusRequest).toBeLessThanOrEqual(5);

    // Hammer panel connection announcements from the sidepanel page —
    // these must not re-arm an unbounded status-request loop.
    await resetMessageCounters(worker);
    for (let i = 0; i < 10; i++) {
      await sidepanelPage.evaluate(async () => {
        await chrome.runtime.sendMessage({
          v: 1,
          type: 'PANEL_CONNECTION_CHANGED',
          correlationId: crypto.randomUUID(),
          payload: { tabId: 0, open: true },
        });
      });
      await sidepanelPage.waitForTimeout(50);
    }
    await editorPage.waitForTimeout(3_000);
    const hammerCounts = await readMessageCounters(worker);
    console.log('[perf-A] after 10 panel-open floods:', JSON.stringify(hammerCounts));
    // 10 floods → at most a small multiple of status requests, not 10×∞.
    expect(hammerCounts.statusRequest).toBeLessThanOrEqual(20);

    // Overlay must still be healthy (single host, not duplicated by loop).
    await expect(overlay).toHaveCount(1);
    console.log('[perf-A] PASSED — status requests bounded');
  } finally {
    await closeAll();
  }
});

// ---------------------------------------------------------------------------
// Test B: rapid tab switching during real LLM analysis must not freeze
// ---------------------------------------------------------------------------

test('perf-B: rapid tab switches during real LLM analysis stay responsive', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const executablePath =
    testInfo.project.name === 'edge'
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

  const { context, extensionId, closeAll } = await launchWithExtension(executablePath);
  try {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await injectWritingSettings(sidepanelPage);

    const worker = await waitForServiceWorker(context);
    await installMessageCounters(worker);

    const editorPage = await context.newPage();
    editorPage.on('pageerror', (e) => console.error('[perf-B editor-error]', e));
    await editorPage.goto(new URL('./fixtures/editor.html', import.meta.url).href);

    // Second tab to switch into (background tab during analysis).
    const otherPage = await context.newPage();
    await otherPage.goto('about:blank');

    const editor = editorPage.locator('#editor');
    await editor.focus();
    await editor.fill(
      'I recieved your email on monday. He go to school yesterday. ' +
        'Please review the attachement and responde when posssible.',
    );
    await editor.blur();

    const overlay = editorPage.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1, { timeout: 15_000 });
    await expect(overlay).toHaveAttribute('data-dot-state', /analyzing|ready|problem|improvement/, {
      timeout: 15_000,
    });

    // Measure main-thread responsiveness on the editor page while switching tabs.
    // Each evaluate must return quickly; a frozen content/background loop blows the budget.
    const latencies: number[] = [];
    const SWITCH_ROUNDS = 12;
    for (let i = 0; i < SWITCH_ROUNDS; i++) {
      const target = i % 2 === 0 ? otherPage : editorPage;
      const probe = i % 2 === 0 ? editorPage : otherPage;
      await target.bringToFront();
      const t0 = Date.now();
      // Probe must not hang: if the page/main thread is frozen, Playwright times out.
      await probe.evaluate(() => document.title || 'ok');
      latencies.push(Date.now() - t0);
      await probe.waitForTimeout(50);
    }
    const maxLatency = Math.max(...latencies);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    console.log(`[perf-B] switch latencies ms: max=${maxLatency} avg=${avgLatency.toFixed(1)} all=[${latencies.join(', ')}]`);

    // No single probe may stall (freeze threshold). Generous for CI/headless.
    expect(maxLatency).toBeLessThan(2_000);

    // Bring editor back and wait for real LLM analysis to finish (no mock).
    await editorPage.bringToFront();
    console.log('[perf-B] waiting for real LLM analysis (up to 90s)…');
    await expect(overlay).toHaveAttribute('data-dot-state', /^(?!analyzing)/, {
      timeout: 90_000,
    });
    const dotState = await overlay.getAttribute('data-dot-state');
    const issueCount = await overlay.getAttribute('data-issue-count');
    console.log('[perf-B] final dot:', dotState, 'issues:', issueCount);
    expect(dotState).not.toBe('analyzing');
    // Real API must surface at least one issue for the seeded errors.
    expect(Number(issueCount)).toBeGreaterThan(0);

    // After analysis + switching, status requests must still be bounded.
    const counts = await readMessageCounters(worker);
    console.log('[perf-B] cumulative counts:', JSON.stringify(counts));
    expect(counts.statusRequest).toBeLessThanOrEqual(20);

    // Overlay still a single host.
    await expect(overlay).toHaveCount(1);
    console.log('[perf-B] PASSED — tab switches responsive during real analysis');
  } finally {
    await closeAll();
  }
});

// ---------------------------------------------------------------------------
// Test C: CDP TaskDuration during idle panel+editor stays low (CPU regression)
// ---------------------------------------------------------------------------

test('perf-C: idle TaskDuration stays low with panel open (no busy-loop CPU)', async ({}, testInfo) => {
  test.setTimeout(90_000);
  const executablePath =
    testInfo.project.name === 'edge'
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : 'C:/Program Files/Google/Chrome/Application/chrome.exe';

  const { context, extensionId, closeAll } = await launchWithExtension(executablePath);
  try {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await injectWritingSettings(sidepanelPage);

    const worker = await waitForServiceWorker(context);
    await installMessageCounters(worker);

    const editorPage = await context.newPage();
    await editorPage.goto(new URL('./fixtures/editor.html', import.meta.url).href);
    const editor = editorPage.locator('#editor');
    await editor.focus();
    await editor.fill('I recieved your email.');
    await editor.blur();

    const overlay = editorPage.locator('[data-writing-assistant="overlay"]');
    await expect(overlay).toHaveCount(1, { timeout: 15_000 });
    // Let initial analysis settle so LLM work is not counted as busy-loop.
    await expect(overlay).toHaveAttribute('data-dot-state', /^(?!analyzing)/, {
      timeout: 90_000,
    });
    await editorPage.waitForTimeout(1_000);

    const cdp = await context.newCDPSession(editorPage);
    await cdp.send('Performance.enable');
    const before = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
    const beforeTask = before.metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;

    await resetMessageCounters(worker);
    // Idle 6s with panel still open — pre-fix this burned CPU on message ping-pong.
    await editorPage.waitForTimeout(6_000);

    const after = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
    const afterTask = after.metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;
    const taskDelta = afterTask - beforeTask;
    const counts = await readMessageCounters(worker);
    console.log(`[perf-C] TaskDuration delta over 6s idle: ${taskDelta.toFixed(3)}s; counts:`, JSON.stringify(counts));

    expect(counts.statusRequest).toBeLessThanOrEqual(5);
    // 6s wall clock → allow up to 1.5s main-thread task time (headless noise),
    // but a busy loop typically consumes most/all of the window.
    expect(taskDelta).toBeLessThan(1.5);

    console.log('[perf-C] PASSED — idle CPU bounded');
  } finally {
    await closeAll();
  }
});
