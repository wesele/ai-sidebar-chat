# AI Sidebar Chat - UI & E2E 测试规范与方法指南

本文档记录并规范了 **AI Sidebar Chat** 扩展程序的完整 UI、端到端 (E2E) 自动化测试及视觉排版审查方法。

---

## 1. 测试架构与原理

本插件基于 **Chrome Manifest V3** 架构，包含 Side Panel (侧边栏)、Background Service Worker (后台服务) 和 Content Script (内容脚本)。测试体系由三层构成：

### 1.1 真实 Chromium 浏览器端到端加载 (Playwright CDP)
使用 Playwright 通过 Chrome DevTools Protocol (`Extensions.loadUnpacked`) 将构建好的 `dist/` 插件真实解压加载至持久化 Chromium 实例中。

### 1.2 强制真实 API 测试规范 (Mandatory Real LLM API Requirement)
- **真实 API 模式（强制要求）**：所有端到端 (E2E) 自动化测试必须通过注入 `chrome.storage.local` 或环境变量 (`REAL_LLM_BASE_URL`, `REAL_LLM_API_KEY`) 配置真实的 LLM 供应商 API（如 OpenAI 官方或兼容的真实在线 LLM 服务）。
- **严禁使用 Mock 模拟测试**：写作助手及 AI 工具的功能验收测试**严禁使用任何 Mock 模拟数据或假通过逻辑**。若 API 接口不可用、未提供 Key 或未能返回有效 LLM 数据，测试必须直接抛错报错，不得静默通过或降级为 Mock 测试。

### 1.3 视觉 UI 截屏审查 (`scripts/take-screenshot.mjs`)
利用 Headless Browser 加载 sidepanel 页面并直接注入样式与组件，自动捕获各 Tab 状态、批量操作 Modal 遮罩层及元素像素级排列，输出 PNG 图像至 Artifact 目录进行直观分析。

---

## 2. 测试分类与用例目录

### 2.1 AI 工具侧边栏聊天测试
- **测试文件**：`tests/e2e/user-api.spec.ts`
- **主要内容**：
  - 自动切换到 `AI 工具` 选项卡 (`activePrimaryTab: 'tools'`)。
  - 在 `#chat-input` 框输入提问，点击 `#send-btn` 发送。
  - 轮询等待 `.message.assistant` 出现的流式回答，校验 TTFT、Total Time 和 Token 生成速度统计。

### 2.2 写作助手核心功能测试
- **测试文件**：`tests/e2e/user-writing-assistant.spec.ts`
- **主要内容**：
  - 在编辑页面 (`editor.html`) 中聚焦输入框 `#editor`。
  - 验证 Content Script 自动挂载 `[data-writing-assistant="overlay"]` Shadow DOM 覆盖层。
  - 检查小圆点状态 (`data-dot-state`) 与问题高亮标记 (`.mark`)。
  - 点击高亮 Mark 自动应用修正，并按 `Ctrl+Z` 验证恢复为原始拼写。

### 2.3 目标页面与局域网 HTTP 站点测试
- **测试文件**：`tests/e2e/test-admin-tools.spec.ts`
- **主要内容**：
  - 自动填充密码并完成 HTTP 站点登录（如 `http://192.168.31.233:8080/admin/tools`）。
  - 定位并展开页面隐藏的 Edit 模块容器，聚焦编辑框并验证悬浮层挂载。

### 2.4 Spec.md 英文错误全量模拟测试
- **测试文件**：`tests/unit/error-simulation-spec.test.ts` & `tests/e2e/test-all-english-errors.spec.ts`
- **主要内容**：
  - **拼写错误 (`spelling`)**：如 `recieved` -> `received`。
  - **语法/时态错误 (`grammar`)**：如 `He go to school yesterday` -> `He went to school yesterday`。
  - **用词搭配 (`word_choice`)**：如 `make a decision` -> `decide`。
  - **非英文内容 (`non_english`)**：区分短词/短语局部建议与完整句子翻译建议。
  - **受保护区间 (`protectedSpans`)**：验证 URL (`https://...`)、邮箱 (`user@...`)、代码 (`` `const x = 1` ``) 等受保护文本绝不被误标记或篡改。

### 2.5 视觉排版与截屏审查
- **执行脚本**：`scripts/take-screenshot.mjs`
- **生成图像**：
  - `sidebar_writing_tab.png`：写作助手 Tab 完整状态。
  - `sidebar_batch_preview.png`：批量修改对话框与毛玻璃遮罩。
  - `sidebar_ai_tools_tab.png`：AI 工具聊天 Tab 布局。

---

## 3. 测试运行指令

```bash
# 1. 编译构建扩展
npm run build

# 2. 运行单元测试套件
npm run test:unit

# 3. 运行集成测试套件
npm run test:integration

# 4. 运行 AI 工具聊天端到端测试
npx playwright test tests/e2e/user-api.spec.ts --project=chromium

# 5. 运行写作助手端到端测试
npx playwright test tests/e2e/user-writing-assistant.spec.ts --project=chromium

# 6. 运行 Spec 错误全量模拟测试
npx playwright test tests/e2e/test-all-english-errors.spec.ts --project=chromium

# 7. 生成 UI 视觉审查截图
node scripts/take-screenshot.mjs
```

---

## 4. 踩坑记录与最佳实践

1. **非 Localhost HTTP 站点的 `crypto.randomUUID` 报错**：
   - *现象*：在 HTTP IP 网页上运行 Content Script 时抛出 `TypeError: crypto.randomUUID is not a function`。
   - *原因*：Web Crypto API 的 `randomUUID` 仅在安全上下文 (HTTPS 或 localhost) 可用。
   - *解法*：必须通过 `src/shared/uuid.ts` 的 `generateUUID()` 导出安全回退方法。

2. **Tab 隐藏导致 DOM 元素 `hidden` 报错**：
   - *现象*：Playwright 提示 `textarea#chat-input` 或 `#writing-assistant-panel` 为 hidden。
   - *解法*：在注入 `chrome.storage.local` 时显式设定 `activePrimaryTab: 'tools'` 或 `'writing'`，并主动点击 `[data-primary-tab="..."]`。

3. **问题计数图标矢量化与对齐**：
   - *现象*：文本符号 `"●"`、`"○"`、`"□"` 在不同操作系统字体下存在垂直不对齐与盒子变形。
   - *解法*：使用纯 CSS 矢量图形 (`border-radius: 50%` / `border-radius: 2px` / `border: 1.5px solid`) 替代 Unicode 符号。

4. **模态框背板遮罩拦截指针事件**：
   - *现象*：自动化测试中截取 Preview Modal 后继续点击 Tab 时超时。
   - *解法*：完成 modal 截图后需主动从 DOM 中移除 Modal 节点。
