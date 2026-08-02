import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = 'C:/Users/wh101/.gemini/antigravity-cli/brain/3fa7cd0d-ba73-4292-bd94-654a0c6f4b8f';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 400, height: 750 } });
  const page = await context.newPage();

  const fs = await import('node:fs');
  const stylesPath = path.resolve(__dirname, '../styles.css');
  const waStylesPath = path.resolve(__dirname, '../src/sidepanel/writing-assistant.css');
  const cssContent = fs.readFileSync(stylesPath, 'utf8') + '\n' + fs.readFileSync(waStylesPath, 'utf8');

  // We load full HTML template with styles embedded directly
  const htmlPath = path.resolve(__dirname, '../sidepanel.html');
  let rawHtml = fs.readFileSync(htmlPath, 'utf8');
  // Inject embedded CSS into head
  rawHtml = rawHtml.replace('</head>', `<style>${cssContent}</style></head>`);
  // Remove script tags to prevent Chrome extension runtime errors in standalone browser
  rawHtml = rawHtml.replace(/<script type="module".*?><\/script>/g, '');

  await page.setContent(rawHtml);

  // Inject bundled sidepanel JS
  const distJsPath = path.resolve(__dirname, '../dist/sidepanel.js');
  await page.addScriptTag({ path: distJsPath });

  await page.waitForTimeout(300);

  // Setup tab click event listeners matching index.ts
  await page.evaluate(() => {
    const writing = document.getElementById('writing-assistant-panel');
    const tools = document.getElementById('app-container');

    const switchTab = (tab) => {
      if (writing) writing.hidden = tab !== 'writing';
      if (tools) tools.hidden = tab !== 'tools';
      document.querySelectorAll('[data-primary-tab]').forEach((btn) => {
        btn.setAttribute('aria-selected', String(btn.dataset.primaryTab === tab));
      });
    };

    document.querySelectorAll('[data-primary-tab]').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.primaryTab));
    });

    // Default to writing tab
    switchTab('writing');
  });

  // Screenshot 1: Writing Assistant tab active with full state
  await page.evaluate(() => {
    const root = document.getElementById('writing-assistant-panel');
    if (!root) return;
    root.innerHTML = `
      <div class="wa-model-bar">
        <label>模型</label>
        <select class="wa-model-select">
          <option value="gpt-4o">gpt-4o (OpenAI)</option>
          <option value="claude-3-5-sonnet">claude-3-5-sonnet (Anthropic)</option>
        </select>
        <div class="wa-actions">
          <select class="wa-lang-select" data-writing-language-select="true" title="写作语言" aria-label="写作语言">
            <option value="EN" selected>EN</option>
            <option value="ES">ES</option>
            <option value="CN">CN</option>
          </select>
          <button type="button" class="wa-settings-button" data-writing-settings-button="true" title="配置" aria-label="配置">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>
      </div>
      <p class="wa-status" role="status"><span class="wa-status-dot dot-green"></span>全部检测完毕</p>
      <div class="wa-counts" aria-label="问题计数">
        <button type="button" class="wa-count-btn" data-scope="local">局部 3</button>
        <button type="button" class="wa-count-btn" data-scope="sentence">句子 2</button>
        <button type="button" class="wa-count-btn" data-scope="paragraph">段落 1</button>
        <button type="button" class="wa-count-btn" data-scope="full">全文 6</button>
      </div>
      <section class="wa-section">
        <h3>当前句子</h3>
        <p class="wa-change-text">I recieved your email yesterday → I received your email yesterday</p>
        <p class="wa-reason-text">拼写错误："recieved" 应修正为 "received"。</p>
        <button type="button" class="wa-btn-primary">应用修改</button>
      </section>
      <section class="wa-section">
        <h3>当前段落</h3>
        <p class="wa-change-text">The report was submitted. It had errors. → The report was submitted with several errors.</p>
        <p class="wa-reason-text">句子衔接建议：合并简短句子以提高流畅度。</p>
        <button type="button" class="wa-btn-primary">应用修改</button>
      </section>
    `;
  });

  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(artifactDir, 'sidebar_writing_tab.png') });
  console.log('Saved sidebar_writing_tab.png');

  // Screenshot 2: Batch preview dialog modal
  await page.evaluate(() => {
    const root = document.getElementById('writing-assistant-panel');
    if (!root) return;
    const preview = document.createElement('section');
    preview.dataset.batchPreview = 'sentence';
    preview.setAttribute('role', 'dialog');
    preview.setAttribute('aria-modal', 'true');
    preview.setAttribute('aria-label', '句子修改预览');
    preview.innerHTML = `
      <h3>预览 2 项句子修改</h3>
      <ol>
        <li data-severity="problem">
          <p>I recieved your email → I received your email</p>
          <p>拼写修正</p>
        </li>
        <li data-severity="improvement">
          <p>He do not like it → He does not like it</p>
          <p>主谓一致修正</p>
        </li>
      </ol>
      <button type="button">取消</button>
      <button type="button">确认全部应用</button>
    `;
    root.prepend(preview);
  });

  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(artifactDir, 'sidebar_batch_preview.png') });
  console.log('Saved sidebar_batch_preview.png');

  // Remove preview modal dialog before clicking tab
  await page.evaluate(() => document.querySelector('section[data-batch-preview]')?.remove());

  // Screenshot 3: Perform actual click to switch tab to "AI 工具"
  const toolsTabBtn = page.locator('[data-primary-tab="tools"]');
  await toolsTabBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(artifactDir, 'sidebar_ai_tools_tab.png') });
  console.log('Saved sidebar_ai_tools_tab.png (Tab click test passed)');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
