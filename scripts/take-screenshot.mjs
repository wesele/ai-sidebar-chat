import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = 'C:/Users/wh101/.gemini/antigravity-cli/brain/4d1f84af-90fb-4a6c-bfd3-b3a1ebd13e5f';

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
      <h2 class="wa-title">写作助手</h2>
      <p class="wa-status" role="status"><span class="wa-status-dot dot-green"></span>全部检测完毕</p>
      <div class="wa-model-bar">
        <label>模型</label>
        <select class="wa-model-select">
          <option value="gpt-4o">gpt-4o (OpenAI)</option>
          <option value="claude-3-5-sonnet">claude-3-5-sonnet (Anthropic)</option>
        </select>
      </div>
      <div class="wa-counts" aria-label="问题计数">
        <button type="button" class="wa-count-btn" data-scope="local">局部 3</button>
        <button type="button" class="wa-count-btn" data-scope="sentence">句子 2</button>
        <button type="button" class="wa-count-btn" data-scope="paragraph">段落 1</button>
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
      <details class="wa-full-card" data-severity="problem">
        <summary>全文</summary>
        <p>检测到 6 处语法和拼写建议，整体语调偏口语化。</p>
        <ul>
          <li data-severity="problem">拼写：检查多处 i/e 倒置错误。</li>
          <li data-severity="improvement">文风：建议提升学术/专业语调。</li>
        </ul>
      </details>
      <form class="wa-settings-form">
        <h3>设置</h3>
        <label><span>供应商</span><select name="providerId" data-field="providerId"><option value="openai">OpenAI API</option></select></label>
        <label><span>模型</span><select name="modelId" data-field="modelId"><option value="gpt-4o">gpt-4o</option></select></label>
        <label><span>调用策略</span><select name="invocationStrategy" data-field="invocationStrategy"><option value="batch">批量合并</option></select></label>
        <button type="submit">保存写作设置</button>
      </form>
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
