import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = 'C:/Users/wh101/.gemini/antigravity-cli/brain/d1700260-6c6c-4da8-a069-3c56bf40b35f';

async function main() {
  const distPath = path.resolve(__dirname, '../dist');
  const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

  console.log('[browser-test] Launching persistent Chrome context...');
  const context = await chromium.launchPersistentContext('', {
    executablePath,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });

  const browser = context.browser();
  if (!browser) throw new Error('Failed to get browser CDP session');
  const browserCdp = await browser.newBrowserCDPSession();

  const rootPath = path.resolve(__dirname, '..');
  console.log(`[browser-test] Testing loading unpacked extension from root directory: ${rootPath}`);
  try {
    const loadedRoot = await browserCdp.send('Extensions.loadUnpacked', { path: rootPath });
    console.log(`[browser-test] Loaded root extension ID: ${loadedRoot.id}`);
    const rootPage = await context.newPage();
    const rootLogs = [];
    rootPage.on('console', (msg) => rootLogs.push(`[ROOT CONSOLE ${msg.type()}] ${msg.text()}`));
    rootPage.on('pageerror', (err) => rootLogs.push(`[ROOT EXCEPT] ${err.message}`));
    await rootPage.goto(`chrome-extension://${loadedRoot.id}/sidepanel.html`);
    await rootPage.waitForTimeout(1000);
    console.log('[browser-test] Root extension logs:', rootLogs);
    await rootPage.close();
  } catch (err) {
    console.log('[browser-test] Root loading note:', err.message);
  }

  // Test loading dist extension
  console.log(`[browser-test] Loading unpacked extension from dist directory: ${distPath}`);
  const loaded = await browserCdp.send('Extensions.loadUnpacked', { path: distPath });
  console.log(`[browser-test] Successfully loaded dist extension with ID: ${loaded.id}`);

  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleLogs.push(`[EXCEPT] ${err.stack || err.message}`));

  const targetUrl = `chrome-extension://${loaded.id}/sidepanel.html`;
  console.log(`[browser-test] Navigating to ${targetUrl}`);
  await page.goto(targetUrl);
  await page.waitForTimeout(1000);

  // Check current visibility state before click
  const getTabStates = async () => {
    return page.evaluate(() => {
      const writing = document.getElementById('writing-assistant-panel');
      const tools = document.getElementById('app-container');
      const writingBtn = document.querySelector('[data-primary-tab="writing"]');
      const toolsBtn = document.querySelector('[data-primary-tab="tools"]');
      return {
        writingHidden: writing?.hidden,
        writingDisplay: writing ? getComputedStyle(writing).display : 'null',
        toolsHidden: tools?.hidden,
        toolsDisplay: tools ? getComputedStyle(tools).display : 'null',
        writingSelected: writingBtn?.getAttribute('aria-selected'),
        toolsSelected: toolsBtn?.getAttribute('aria-selected'),
      };
    });
  };

  console.log('[browser-test] Initial state:', await getTabStates());
  const modelOptions = await page.evaluate(() => {
    const select = document.querySelector('.wa-model-select');
    if (!select) return [];
    return Array.from(select.options).map((opt) => opt.value);
  });
  console.log('[browser-test] Model options in .wa-model-select:', modelOptions);
  await page.screenshot({ path: path.join(artifactDir, 'real_browser_initial.png') });

  // Click on "写作助手" button
  console.log('[browser-test] Clicking [data-primary-tab="writing"]...');
  const writingBtn = page.locator('[data-primary-tab="writing"]');
  await writingBtn.click();
  await page.waitForTimeout(500);

  const stateAfterWritingClick = await getTabStates();
  console.log('[browser-test] State after clicking [写作助手]:', stateAfterWritingClick);
  await page.screenshot({ path: path.join(artifactDir, 'real_browser_after_writing_click.png') });

  // Click on "AI 工具" button
  console.log('[browser-test] Clicking [data-primary-tab="tools"]...');
  const toolsBtn = page.locator('[data-primary-tab="tools"]');
  await toolsBtn.click();
  await page.waitForTimeout(500);

  const stateAfterToolsClick = await getTabStates();
  console.log('[browser-test] State after clicking [AI 工具]:', stateAfterToolsClick);
  await page.screenshot({ path: path.join(artifactDir, 'real_browser_after_tools_click.png') });

  console.log('[browser-test] Console Logs during test:\n', consoleLogs.join('\n'));

  await browserCdp.detach();
  await browser.close();
}

main().catch(err => {
  console.error('[browser-test] Error:', err);
  process.exit(1);
});
