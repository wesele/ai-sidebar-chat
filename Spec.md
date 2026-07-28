# AI Sidebar 写作助手产品与技术规格

> 状态：需求已确认，可进入测试驱动开发  
> 目标版本：一期  
> 支持平台：Chrome Manifest V3、Chromium Edge  
> 文档语言：中文  
> 最后更新：2026-07-26

## 1. 文档目的

本文档定义 AI Sidebar 中“写作助手”的完整一期功能、交互、状态、数据结构、模型协议、扩展架构、实现技术、测试策略与验收标准。后续实现不得依赖未写明的隐式行为；遇到实现差异时，以本文档中的可观察行为、状态机和验收用例为准。

项目当前是一个 Chrome Manifest V3 Side Panel 扩展，聊天、模型配置和界面逻辑主要集中在根目录 `script.js`。一期允许全面工程化改造，引入 TypeScript、模块化源码、构建系统和自动化测试，同时必须保留现有 AI 工具能力。

## 2. 产品目标

写作助手在用户写英文时提供低打扰、持续性的帮助，并在修正过程中解释原因，逐步提高用户的英语水平。

帮助分为四种可观察层级：

1. **局部问题**：单词、拼写、短语、短非英文片段等局部范围。
2. **句子问题**：语法、表达、语序、完整非英文句子或较长非英文分句等。
3. **段落问题**：连贯性、组织、段内逻辑、语气一致性等。
4. **全文建议**：一期仅覆盖语言与表达层面的整体一致性；更深层意图、论证策略和内容策划属于二期。

核心原则：

- 自动感知当前正在编辑的文本，不要求复制粘贴。
- 正在输入的位置尽量不打扰，结果不得覆盖新输入。
- 所有局部、句子、段落结果都提供可直接应用的替换文本。
- 模型结果必须结构化、可验证、可定位、可丢弃。
- 网页正文和分析缓存一期只存在于当前标签页内存中，不持久化。
- 所有核心行为必须可在无真实模型的测试环境中确定性验证。

## 3. 已确认的产品决策

### 3.1 一期决策

- 保留现有 AI Chat 能力，侧边栏使用两个一级 Tab：`写作助手` 与 `AI 工具`。
- 首期支持原生 `textarea`、符合条件的文本 `input` 和标准 `contenteditable`。
- 目标文本为英文。拼写错误和非英文内容都可以成为问题：
  - 可在英文句子中直接替换的短非英文词或短语归为局部问题。
  - 构成完整句子、分句，或占所在句主要内容的非英文片段归为句子问题。
  - 分类由模型提出，程序依据结构和范围规则校验。
- 写作助手复用 AI 工具已有供应商和 API 配置，但保存独立的模型选择。
- 模型调用策略可配置为“批量合并”或“单项并发”；默认批量合并。
- 单项并发最大并发数可配置为 1–6，默认 3。
- 全文检测始终使用独立请求。
- 默认输入变化后更新本地结构；停止输入 1.5 秒或光标离开当前句后，当前句可进入检测。
- 完成并离开一个段落后检测段落，并触发独立全文检测。
- 写作缓存不使用 `chrome.storage`、IndexedDB、localStorage 或其他持久化存储。
- 激活模式可配置为“始终激活”或“仅侧边栏打开时激活”，默认“始终激活”。
- 无可用模型时保留本地检测能力，小圆点显示灰色，模型分析暂停并可从侧边栏配置或重试。
- 局部、句子和段落建议无论蓝色建议还是橘色错误，均包含可应用修正。
- 全文建议只展示，不支持一键重写全文。
- 扩展不维护独立撤销栈，修改必须进入编辑器原生撤销历史。
- 默认全文检测上限为 20,000 个 UTF-16 字符，可配置；超过上限暂停全文检测，但继续检测变化的句子和段落。
- Chrome 与 Chromium Edge 都是实现和测试目标；架构不得阻断未来 Firefox 和 Safari 适配。

### 3.2 二期范围

- 首次使用授权提示。
- 域名白名单、黑名单和全局隐私控制。
- Gmail、Confluence、Google Docs、Notion 等产品级编辑器适配器。
- CodeMirror、Monaco、Canvas 编辑器和跨域 iframe 支持。
- 超越语言本身的全文意图、论证策略和内容策划。

### 3.3 明确不在一期范围

- Firefox、Safari 的正式发布与 E2E 认证。
- 一键改写全文。
- 扩展自有的撤销/重做历史。
- 将正文、问题列表或分析结果持久化到磁盘或同步存储。
- 在密码、验证码、银行卡号等敏感输入框上运行。
- 对浏览器内部页面或扩展无权注入的页面提供检测。

## 4. 用户体验规格

## 4.1 侧边栏一级导航

侧边栏顶部固定显示两个一级 Tab：

- `写作助手`
- `AI 工具`

要求：

- `AI 工具` 完整保留现有聊天、上下文、模型供应商、图片、语音和模型参数能力。
- 切换 Tab 不清空任一 Tab 的临时 UI 状态。
- 写作助手所选模型与 AI 工具当前会话模型互不影响。
- 当前 Tab 状态可持久化；正文和分析缓存不可持久化。

## 4.2 编辑器发现与激活

内容脚本在网页中监听焦点变化并识别候选编辑器。一次只有一个“当前编辑器”，即当前获得输入焦点的合格编辑器。

一期合格编辑器：

- `textarea`，且可见、可编辑、非只读、非禁用。
- `contenteditable="true"` 或实际 `isContentEditable === true` 的标准编辑区域。
- `input` 仅在以下条件全部成立时启用：
  - 类型是 `text` 或未指定类型。
  - 内容呈现为自然语言，默认至少 3 个单词。
  - 不属于搜索、URL、邮箱地址、电话、用户名、代码、标签、ID 等用途。

必须排除：

- `password`、`hidden`、`search`、`url`、`email`、`tel`、一次性验证码和银行卡相关字段。
- `disabled`、`readonly`、不可见或尺寸为零的字段。
- 元素或祖先带有 `data-writing-assistant="off"`、`data-private` 等明确禁用标记。
- 通过 `autocomplete`、`name`、`id`、`aria-label` 等被敏感字段规则识别的元素。
- 浏览器内部页面、扩展商店、其他扩展页和 CSP/权限不允许注入的页面。

敏感字段排除优先级高于任何用户设置，内容不得被读取、缓存、记录或发送。

## 4.3 激活模式

设置项 `activationMode`：

- `always`：默认值。侧边栏关闭时仍发现编辑器、维护缓存、调用模型并显示网页标注。
- `panel_open`：仅当侧边栏存在活动连接时运行；侧边栏关闭后取消未开始任务、终止可取消的在途任务、移除标注并清空当前页正文缓存。

在 `always` 模式下，点击网页内小圆点应通过后台服务打开当前标签页的 Side Panel，并展示当前句子和段落对应的问题。

## 4.4 小圆点

小圆点属于网页覆盖层，不修改编辑器正文。它显示在光标所在视觉行的最右侧，并随光标行、滚动、缩放、换行和编辑器尺寸变化更新位置。

状态及优先级：

| 状态 | 表现 | 含义 |
| --- | --- | --- |
| 不适用/未激活 | 不显示 | 当前无合格编辑器或激活模式关闭 |
| 无可用模型 | 灰色实心 | 本地结构检测可用，模型分析暂停 |
| 正在检测 | 绿色闪烁 | 存在正在执行的检测请求 |
| 全文明显问题 | 橘色实心 | 最新有效全文结果含 `problem` |
| 全文可改进 | 蓝色实心 | 最新有效全文结果最高为 `improvement` |
| 已激活 | 绿色实心 | 助手可用且无全文建议 |

规则：

- 检测中统一显示闪烁绿色，完成后恢复为最新有效全文状态。
- 任意正文编辑会令旧全文结果失效，小圆点恢复绿色，直到新全文结果产生。
- 灰色优先于检测状态；无模型时不得表现为正在检测。
- 点击小圆点只打开侧边栏，不强制滚动或定位到全文卡片。
- 小圆点必须有 `aria-label` 和可通过键盘触发的等价入口；颜色不得是唯一状态信息。

## 4.5 网页内标注

### 4.5.1 局部问题

- 在原文本正上方显示替换文本，字号为编辑器正文计算字号的 80%。
- 使用橘色，不因严重级别变蓝。
- 鼠标或键盘焦点移到替换文本上时显示简短原因 Hint。
- 点击替换文本立即应用该项修正。
- 标注不得改变原页面行高、文本流或编辑器值。
- 多个标签发生碰撞时，按文本顺序错层排列；空间仍不足时折叠为一个带数量的标记，悬停展开。

### 4.5.2 句子问题

- `improvement` 使用蓝色下划线。
- `problem` 使用橘色下划线。
- 光标处于问题句子内时，侧边栏显示原句、建议句、应用按钮和原因。
- 同一句最多保留一个句子级问题；局部问题可与句子问题并存。

### 4.5.3 段落问题

- 在段落左侧显示竖线。
- `improvement` 使用蓝色竖线。
- `problem` 使用橘色竖线。
- 光标处于问题段落内时，侧边栏在句子建议之后显示段落原文、建议段落、应用按钮和原因。
- 同一段最多保留一个段落级问题。

### 4.5.4 标注失效

- 编辑与局部问题原范围或其前后一个词相交时，该局部问题立即移除。
- 句子内发生任何编辑时，该句子的所有局部问题和句子问题立即移除。
- 段落内发生任何编辑时，该段落问题立即移除。
- 任意正文编辑均使全文结果立即失效。
- 失效项不计入问题数量，不允许再应用，后续由新版本重新检测。

## 4.6 写作助手侧边栏

写作助手 Tab 从上到下包含：

1. 标题和设置入口。
2. 独立模型选择框。
3. 状态文字，例如“正在检测…”、“全部检测完毕”、“等待配置模型”、“文本过长，全文检测暂停”。
4. 问题计数区。
5. 当前句子建议区。
6. 当前段落建议区。
7. 全文卡片。

### 问题计数

- 局部问题：橘色实心圆和数字。
- 句子问题：空心圆和数字。
- 段落问题：空心方形和数字。
- 数字只统计当前编辑器中已经检测出来且仍有效的问题；排队中、检测中、失效和失败项不计数。
- 句子或段落图标颜色取该类型有效问题的最高严重级别：橘色高于蓝色。
- 数量为 0 时不显示该类型图标。
- 点击图标打开确认菜单，显示“全部应用此类型的 N 项修改”和变更预览。
- 只有再次确认后才执行批量修改。

### 当前上下文建议

- 光标进入有句子问题的句子时，立即显示句子建议。
- 光标所在段落同时有段落问题时，段落建议排在句子建议之后。
- 光标移动到其他句子或段落时，侧边栏同步切换，不滚动网页。
- 当前上下文无问题时显示轻量空状态，不隐藏全局计数。

### 全文卡片

- 默认折叠，标题为 `全文`。
- 无有效建议时使用普通样式。
- 最高严重级别为 `improvement` 时边框和标题变蓝。
- 最高严重级别为 `problem` 时边框和标题变橘。
- 点击展开摘要、问题说明和改进方向。
- 不提供一键改写或应用全文。

## 4.7 设置

写作助手设置至少包含：

| 设置 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `providerId` | 供应商选择 | 首个有效供应商 | 复用 AI 工具供应商配置 |
| `modelId` | 模型选择 | 供应商首个有效模型 | 与 AI 工具会话模型独立 |
| `invocationStrategy` | `batch` / `parallel` | `batch` | 句子和段落调用策略 |
| `maxConcurrency` | 整数 1–6 | 3 | 仅 `parallel` 生效 |
| `activationMode` | `always` / `panel_open` | `always` | 后台激活方式 |
| `fullDocumentCharacterLimit` | 正整数 | 20,000 | 全文检测上限，可配置 |

正文、分段、句子、问题和模型响应不得出现在持久化设置对象中。

## 5. 文本模型与缓存

## 5.1 文本快照

每次处理编辑器内容时创建不可变 `EditorSnapshot`：

```ts
interface EditorSnapshot {
  editorId: string;
  documentRevision: number;
  sourceKind: 'input' | 'textarea' | 'contenteditable';
  text: string;                 // 统一为 \n 的规范化文本
  sourceLength: number;         // 原始 UTF-16 长度
  selection: { start: number; end: number } | null;
  composing: boolean;
  offsetMap: OffsetMap;         // 规范化文本到真实输入/DOM Range 的双向映射
  createdAt: number;
}
```

所有 offset 使用 JavaScript/DOM 一致的 UTF-16 code unit 下标，范围采用左闭右开 `[start, end)`。换行规范化、`contenteditable` 块边界和 `<br>` 必须通过 `OffsetMap` 映射，禁止直接假设 DOM 文本与 `innerText` 下标一致。

## 5.2 三层缓存

缓存以编辑器为单位，只存在于对应内容脚本内存：

```ts
type DetectionStatus =
  | 'never'
  | 'dirty'
  | 'queued'
  | 'analyzing'
  | 'analyzed'
  | 'stale'
  | 'error';

interface DocumentCache {
  editorId: string;
  revision: number;
  textHash: string;
  textLength: number;
  status: DetectionStatus;       // 全文检测状态
  analysisRevision?: number;
  fullResult?: FullDocumentResult;
  paragraphs: ParagraphCache[];
}

interface ParagraphCache {
  id: string;
  revision: number;
  start: number;
  end: number;
  textHash: string;
  status: DetectionStatus;
  analysisRevision?: number;
  issue?: ParagraphIssue;
  sentences: SentenceCache[];
}

interface SentenceCache {
  id: string;
  revision: number;
  start: number;
  end: number;
  textHash: string;
  status: DetectionStatus;
  analysisRevision?: number;
  localIssues: LocalIssue[];
  sentenceIssue?: SentenceIssue;
}
```

`revision` 单调递增。模型请求必须携带目标 ID、目标 revision 和 document revision；三者任一不匹配时响应无条件丢弃。

## 5.3 分段

分段是同步、确定性的纯函数，输入为规范化文本，输出非重叠、有序范围。

规则：

- `textarea/input`：一个或多个空白行形成段落边界；单换行默认保留在同段，除非编辑器语义明确表示块边界。
- `contenteditable`：块级元素边界优先形成段落；连续 `<br>` 形成段落边界。
- 空段不进入模型检测，但参与光标位置与“完成段落”判断。
- 列表项、引用块、标题按独立段落处理。
- 代码块、URL、邮件地址和不可编辑嵌入对象标为 protected span，不作为英语问题范围。

性能要求：20,000 字符文本分段与 diff 在目标 CI 机器上 P95 小于 50ms。

## 5.4 分句

优先使用注入式 `SentenceSegmenter` 接口的英文实现；生产默认可使用 `Intl.Segmenter` 并配合确定性后处理，测试中使用固定实现。

必须覆盖：

- `.?!`、中英文标点和换行。
- 常见英文缩写、小数、引号、括号和省略号。
- emoji 和 UTF-16 surrogate pair。
- 中英混排与完整非英文句子。
- 句尾缺少标点的最后一句。

分句结果不得越过段落边界。

## 5.5 增量 diff 与 ID 保留

每次 `input` 后：

1. 生成新快照并增加 document revision。
2. 快速分段。
3. 对旧、新段落序列执行基于范围邻近、规范化文本 hash 和序列匹配的 diff。
4. 未变化段落保留 ID、revision、状态和有效结果。
5. 变化段落保留段落 ID 但增加 revision，并重新分句。
6. 对段内句子执行相同的序列 diff；完全未变化且仍可定位的句子保留 ID 与结果。
7. 新增或变化项进入 `dirty`；被删除项及其在途结果被废弃。
8. 对重复段落、重复句子不得只按 hash 匹配，必须结合顺序与邻近位置，避免结果跳到错误副本。

## 6. 检测状态机与调度

## 6.1 输入事件

必须监听并正确处理：

- `beforeinput`
- `input`
- `compositionstart` / `compositionupdate` / `compositionend`
- `selectionchange`
- `focusin` / `focusout`
- 编辑器与页面 `scroll`
- `ResizeObserver`
- 影响编辑器内容或布局的 `MutationObserver`

IME composition 期间只更新视觉位置，不分段、不调模型。`compositionend` 后按一次普通输入处理。

## 6.2 检测资格

输入变化后立即更新缓存和移除受影响的旧问题，但不在同步输入事件中调用模型。

句子可检测条件：

- 状态为 `never`、`dirty` 或可重试的 `error`。
- 文本非空且不是纯 protected span。
- 光标不在该句；或者用户已停止输入 1.5 秒，即使光标仍停留在该句也可检测。
- 不处于 IME composition。

段落可检测条件：

- 状态为 `never`、`dirty` 或可重试的 `error`。
- 用户已离开该段落，或该段落完成事件成立。
- 不处于 IME composition。

“段落完成”满足任一条件：

- 用户插入段落边界并将光标移动到下一段。
- 光标从有修改的段落移动到另一段。
- 编辑器失焦，且该段自上次有效结果后发生过修改。

初次聚焦已有文本时，所有从未检测的非当前句子可进入队列；当前句子等待光标离开或 1.5 秒静默。

## 6.3 调用策略

### 批量合并 `batch`

- 默认策略。
- 同一调度轮次的待检测句子和段落合并为一个请求。
- 每个目标作为独立 unit，携带 ID、类型、revision 和上下文。
- 单批默认最多 16 个 unit 或 12,000 字符，以先到者为准；超出部分进入下一批。
- 句子和段落可以位于同一请求，但模型只能为每个 unit 返回其允许的问题层级。

### 单项并发 `parallel`

- 每个句子或段落一个请求。
- 并发限制由 `maxConcurrency` 控制，范围 1–6，默认 3。
- 队列按当前光标邻近程度、句子优先于段落、进入时间排序。
- 全文请求不占用单项并发槽，但后台仍应设置总请求保护上限，防止供应商过载。

### 全文请求

- 始终独立，不与句子/段落 unit 混合。
- 段落完成后触发，使用触发时的完整 document revision。
- 正文超过配置上限时不发出请求，全文状态设为 `error` 的可解释子状态 `too_long`，UI 显示“文本过长”。
- 新编辑使在途全文响应失效；可取消时使用 `AbortController` 取消。

## 6.4 状态转换

允许的主要转换：

```text
never -> queued -> analyzing -> analyzed
dirty -> queued -> analyzing -> analyzed
analyzing -> stale        （正文 revision 改变）
queued -> dirty/stale     （再次编辑或目标删除）
analyzing -> error        （有效版本上的终态错误）
error -> queued           （自动或用户重试）
analyzed -> dirty/stale   （相关范围被编辑）
```

禁止：

- 过期响应把 `dirty` 或新 revision 改回 `analyzed`。
- 失败响应清除上一份仍匹配当前 revision 的有效结果。
- 同一 revision 的同类目标重复入队。

## 7. 模型输入与结构化输出

## 7.1 传输边界

- API Key 只存在于扩展受信任页面和后台，不发送到网页 content script。
- content script 向后台发送已筛选的检测 unit 和必要上下文。
- 后台通过统一 `AnalysisTransport` 调用 OpenAI-compatible 或 Gemini-compatible 供应商。
- 写作分析默认使用非流式结构化响应；AI 工具现有聊天可继续流式响应。
- 若供应商支持原生 JSON Schema/JSON MIME 类型则使用；不支持时用严格 JSON Prompt，并执行相同的本地 Schema 校验。

## 7.2 上下文最小化

- 句子 unit：发送目标句、所在段落，以及必要时相邻一句；只允许返回局部和句子问题。
- 段落 unit：发送目标段落及前后各一个段落的只读上下文；只允许返回段落问题。
- 全文：在上限内发送完整规范化文本；只返回全文结果。
- 上下文只用于判断，不允许模型给非目标范围创建问题。

## 7.3 Unit 请求

概念 Schema：

```ts
interface AnalysisRequest {
  schemaVersion: '1';
  requestId: string;
  documentRevision: number;
  targetLanguage: 'en';
  units: Array<{
    unitId: string;
    unitRevision: number;
    unitType: 'sentence' | 'paragraph';
    text: string;
    absoluteStart: number;
    contextBefore?: string;
    contextAfter?: string;
  }>;
}
```

模型返回：

```ts
interface AnalysisResponse {
  schemaVersion: '1';
  requestId: string;
  documentRevision: number;
  units: Array<{
    unitId: string;
    unitRevision: number;
    issues: Array<{
      scope: 'local' | 'sentence' | 'paragraph';
      severity: 'improvement' | 'problem';
      start: number;          // unit 内相对 UTF-16 offset
      end: number;
      original: string;
      replacement: string;
      reason: string;         // 简短、面向学习者
      category:
        | 'spelling'
        | 'grammar'
        | 'word_choice'
        | 'non_english'
        | 'clarity'
        | 'style'
        | 'coherence'
        | 'tone'
        | 'other';
    }>;
  }>;
}
```

约束：

- 句子 unit 可返回 `local` 和最多一个 `sentence` 问题，不得返回 `paragraph`。
- 段落 unit 最多返回一个 `paragraph` 问题，不得返回 `local` 或 `sentence`。
- 每个问题必须有非空、与原文不同的 `replacement`。
- `original` 必须与当前 unit 的 `[start, end)` 完全一致。
- `reason` 必须简短解释为什么，不得包含 HTML。
- 句子问题范围必须覆盖完整目标句；段落问题范围必须覆盖完整目标段落。
- 局部问题不得无依据扩展为整句。短非英文片段可为 `local`；完整句、分句或主要内容为非英文时应为 `sentence`。
- URL、邮箱地址、代码、变量名、明确专有名词和 protected span 不得作为问题。
- 修改应尽量保持原意、事实、语气和格式，不得擅自添加新事实。

客户端在验证后生成 `issueId`，模型不得决定可信主键。

## 7.4 全文请求与响应

```ts
interface FullDocumentResponse {
  schemaVersion: '1';
  requestId: string;
  documentRevision: number;
  severity: 'none' | 'improvement' | 'problem';
  summary: string;
  suggestions: Array<{
    severity: 'improvement' | 'problem';
    title: string;
    reason: string;
  }>;
}
```

一期全文检测范围：语气一致性、整体连贯性、明显重复、前后矛盾和写作目的是否清楚。禁止返回全文替换文本。

## 7.5 响应校验

响应进入缓存前必须依次通过：

1. JSON 语法校验。
2. JSON Schema 校验。
3. request、document、unit ID 与 revision 校验。
4. offset 边界、顺序、重叠和 `original` 精确匹配校验。
5. scope 与 unit 类型校验。
6. replacement 非空、不同于 original、纯文本校验。
7. protected span 校验。

无效单项可被隔离丢弃，不必丢弃同批其他有效 unit。整体无法解析时允许一次结构修复重试；仍失败则记为可重试错误。日志中只记录 request ID、错误类型和计数，不记录正文、replacement 或 API Key。

## 7.6 失败与重试

- 网络中断、429 和 5xx：最多自动重试 2 次，指数退避并加入 jitter。
- 401、403、无效模型和其他配置错误：不自动重试，进入灰色无可用模型/需配置状态。
- Schema 失败：最多一次结构修复请求，不计入网络重试。
- 用户继续编辑后，旧 revision 的重试不得执行。
- 用户在侧边栏点击重试时，只重新排队当前 revision 的失败目标。

## 8. 应用修正

## 8.1 单项应用

应用前再次验证：

- 编辑器仍存在且是同一个 `editorId`。
- issue 对应 document、paragraph、sentence revision 仍有效。
- 当前原文范围仍与 issue.original 完全一致。
- 范围没有与其他正在应用的修改冲突。

任何验证失败都不得写入正文；UI 移除失效项并提示“内容已变化，建议已刷新”。

## 8.2 批量应用

- 作用域为当前编辑器中当前问题类型的全部有效问题。
- 蓝色建议和橘色错误均包括在内。
- 先展示数量和替换预览，再由用户确认。
- 按绝对 offset 从后向前应用，避免前面的修改改变后续 offset。
- 重叠修改只保留用户所选类型；同类型内部若仍重叠，跳过冲突项并在结果中说明数量。
- 批量应用必须作为尽可能少的原生编辑事务执行，使编辑器自身的 Ctrl/Cmd+Z 可以撤销本轮修改。
- 应用句子修正会使该句局部问题失效；应用段落修正会使该段所有局部、句子和段落问题失效。
- 应用后立即生成新快照，走正常 diff 和重新检测流程，不得直接把旧 offset 平移后继续使用。

## 8.3 编辑器写入适配器

统一接口：

```ts
interface EditorAdapter {
  readonly kind: 'input' | 'textarea' | 'contenteditable';
  canHandle(element: Element): boolean;
  readSnapshot(): EditorSnapshot;
  getCaretGeometry(snapshot: EditorSnapshot): DOMRect | null;
  getRangeGeometry(range: TextRange): DOMRect[];
  replaceRanges(replacements: Replacement[]): ApplyResult;
  observe(callback: EditorEventCallback): () => void;
}
```

实现要求：

- `input/textarea`：使用浏览器原生 selection 与文本替换能力，并派发真实 `beforeinput`/`input` 语义事件；必须在 Chrome/Edge 验证原生撤销。
- `contenteditable`：优先使用可进入原生 undo manager 的编辑命令/事件路径，保留 selection 和编辑器 DOM 结构；禁止简单覆写 `innerHTML`。
- 若某编辑器无法保证安全定位、事件兼容和原生撤销，则适配器必须判定为 unsupported，而不是静默破坏内容。
- 后续 Gmail、Confluence 等适配器复用此接口，不得把站点特例写入领域层。

## 9. 网页标注实现

## 9.1 隔离

- content script 注入一个顶层 overlay host，并使用 Shadow DOM 隔离样式。
- 标注层使用 `pointer-events: none`；只有可点击标签、Hint 和小圆点恢复 `pointer-events: auto`。
- 不向原编辑器正文插入 span，不修改网页数据模型，不污染复制内容。
- 所有用户可见字符串通过文本节点写入，不使用未经转义的 `innerHTML`。

## 9.2 渲染器

统一 `AnnotationRenderer`，下设：

- `TextControlRenderer`：为 `input/textarea` 建立只读镜像布局层，复制影响排版的计算样式、padding、border、scroll、wrap、字号和行高，用于计算范围几何。
- `ContentEditableRenderer`：通过 `OffsetMap` 建立 DOM Range，获取 `getClientRects()`；下划线、左竖线和局部替换标签绘制在独立覆盖层。
- `DotRenderer`：根据 selection/caret rect 和编辑器右边界定位小圆点。

渲染更新必须合并到 `requestAnimationFrame`，滚动和 selection 变化不得触发同步全量重排。标注不得造成可测量的页面布局偏移。

## 9.3 几何与滚动

- 标注只渲染当前可视区域及小幅 overscan 内的问题。
- 编辑器内部滚动、页面滚动、窗口缩放、字体加载和 ResizeObserver 回调后重算可见几何。
- 下划线支持跨视觉行拆分为多个 rect。
- 段落左竖线覆盖段落所有可见行的联合高度。
- 小圆点定位到光标视觉行与编辑器内容区右边缘，超出 viewport 时隐藏。

## 10. 扩展架构

## 10.1 进程职责

```text
网页 Content Script
  ├─ 编辑器发现与敏感字段过滤
  ├─ 文本快照、分段分句、三层缓存与失效
  ├─ 网页标注与修正应用
  └─ 当前编辑器状态（权威内存）
            │ typed messages
            ▼
Background Service Worker
  ├─ 模型配置读取（不暴露 API Key 给网页）
  ├─ 请求队列、批量/并发调度、重试与取消
  ├─ OpenAI/Gemini transport
  ├─ Side Panel 打开与连接状态
  └─ Content Script ↔ Side Panel 路由
            │ typed messages / ports
            ▼
Side Panel
  ├─ 写作助手 UI
  ├─ AI 工具 UI
  ├─ 设置与模型选择
  └─ 当前标签页/编辑器的只读投影
```

缓存权威在 content script，避免后台 service worker 休眠导致正文状态丢失。后台只保留完成请求所需的短生命周期任务状态。Side Panel 关闭不影响 `always` 模式。

## 10.2 浏览器抽象

业务代码不得直接散布 `chrome.*` 调用。建立：

```ts
interface BrowserRuntime {
  storage: SettingsStorage;
  messaging: TypedMessaging;
  sidePanel: SidePanelCapability;
  tabs: TabCapability;
}
```

Chrome/Edge 一期实现使用 Manifest V3 `chrome.*` API。Firefox/Safari 将来只需替换 capability 和 manifest 构建，不改文本领域层、模型协议、缓存状态机和 UI 组件。

Side Panel 不可用的平台允许未来映射到 browser sidebar、popup 或独立扩展页。

## 10.3 消息协议

所有跨上下文消息必须是带版本的判别联合类型，例如：

```ts
type ExtensionMessage =
  | { v: 1; type: 'EDITOR_STATE_CHANGED'; payload: EditorViewState }
  | { v: 1; type: 'ANALYSIS_REQUESTED'; payload: AnalysisRequest }
  | { v: 1; type: 'ANALYSIS_COMPLETED'; payload: AnalysisResponse }
  | { v: 1; type: 'ANALYSIS_FAILED'; payload: AnalysisFailure }
  | { v: 1; type: 'APPLY_ISSUE'; payload: ApplyIssueCommand }
  | { v: 1; type: 'APPLY_ALL'; payload: ApplyAllCommand }
  | { v: 1; type: 'OPEN_SIDE_PANEL'; payload: { tabId: number } }
  | { v: 1; type: 'PANEL_CONNECTION_CHANGED'; payload: { open: boolean } };
```

每个命令必须有 correlation ID；Side Panel 不得直接持有或修改 content script 缓存对象。

## 11. 建议源码结构

```text
src/
  background/
    index.ts
    analysis-scheduler.ts
    provider-registry.ts
    side-panel-controller.ts
    transports/
      openai-transport.ts
      gemini-transport.ts
  content/
    index.ts
    editor-discovery.ts
    sensitive-field-policy.ts
    writing-session.ts
    adapters/
      editor-adapter.ts
      input-adapter.ts
      textarea-adapter.ts
      contenteditable-adapter.ts
    annotations/
      annotation-renderer.ts
      text-control-renderer.ts
      contenteditable-renderer.ts
      dot-renderer.ts
  domain/
    text/
      snapshot.ts
      paragraph-segmenter.ts
      sentence-segmenter.ts
      incremental-diff.ts
      protected-spans.ts
    analysis/
      cache.ts
      state-machine.ts
      eligibility.ts
      issues.ts
      response-validator.ts
      apply-plan.ts
  sidepanel/
    index.ts
    app.ts
    writing-assistant/
    ai-tools/
    settings/
  shared/
    browser-runtime.ts
    messages.ts
    schemas.ts
    result.ts
manifest/
  chrome.json
  edge.json
tests/
  unit/
  integration/
  e2e/
    fixtures/
```

技术基线：

- TypeScript 严格模式。
- ES Modules。
- Vite 多入口构建扩展页面、service worker 和 content script。
- Vitest + jsdom 负责纯逻辑、DOM 组件和集成测试。
- Playwright 以持久化浏览器上下文加载未打包扩展，分别运行 Chrome 与 Chromium Edge 关键 E2E。
- JSON Schema + Ajv 或等价验证器验证跨进程消息和模型响应。
- ESLint、Prettier、TypeScript typecheck 作为 CI 门禁。
- 不从扩展页面远程加载可执行脚本；字体优先使用系统字体或随扩展打包。

框架选择必须保持领域层无 DOM、无 Chrome API、无网络依赖。即使未来更换 UI 框架，也不得改动分段、缓存、状态机和模型协议测试。

## 12. 持久化与生命周期

允许持久化：

- 写作助手模型选择。
- 调用策略与最大并发数。
- 激活模式。
- 全文字符上限。
- 现有 AI 工具供应商、API Key、聊天设置和用户界面设置。

禁止持久化：

- 编辑器正文或片段。
- paragraph/sentence hash 与 ID。
- 问题、替换文本、解释和全文结果。
- 请求或响应正文。

生命周期：

- 每个页面 frame 的 content script 为每个已接触编辑器维护独立内存会话。
- 编辑器从 DOM 永久移除时销毁对应会话。
- 页面刷新、导航、标签页关闭或 content script 卸载时缓存自然销毁。
- `panel_open` 模式下侧边栏关闭时主动销毁会话。
- 多个编辑器之间切换时可保留页面内存缓存，但 Side Panel 只显示当前编辑器。

## 13. 安全、隐私和内容完整性

- 一期虽然不实现按网站授权，但敏感字段排除必须在首次读取前执行。
- API Key 永远不得进入 content script、DOM、日志或错误提示。
- 正文不得写入 console、遥测、崩溃报告或测试快照。
- 模型返回一律视为不可信输入，进行 Schema 校验、纯文本处理和长度限制。
- 应用修正前必须进行原文精确匹配，防止 TOCTOU 覆盖新输入。
- Shadow DOM 标注层不得拦截除自身交互元素外的页面事件。
- MutationObserver 必须限定观察范围并防止扩展自身 DOM 触发递归。
- 二期再增加域名授权、黑白名单和更细粒度隐私提示。

## 14. 性能与可靠性要求

- 输入事件同步处理目标 P95 小于 8ms；较重工作进入 microtask、idle task 或 worker-friendly 纯函数路径。
- 20,000 字符的快照、分段、分句与增量 diff 总计 P95 小于 50ms。
- 标注滚动与光标跟随保持目标 60fps，不在每个 scroll event 中同步测量全部问题。
- 同一 revision、同一 unit 不得重复发起等价请求。
- 关闭/刷新页面后不得遗留后台重试任务。
- service worker 被回收后，新消息可重新初始化配置和 transport；content script 的权威缓存不受影响。
- 模型超时可配置实现常量，一期默认 30 秒；超时进入可重试错误。
- 所有 Abort、超时和导航竞态必须是可预期状态，不产生未处理 Promise rejection。

## 15. 可访问性

- 侧边栏所有按钮、计数图标、菜单、建议卡和全文卡片可用键盘操作。
- Hint 同时支持 hover 与 focus。
- 蓝/橘状态同时使用图形、文字或 `aria-label` 表达，不能只靠颜色。
- 焦点顺序稳定；打开确认菜单后焦点进入菜单，关闭后回到触发图标。
- 批量应用前预览可被屏幕阅读器读取。
- 动画遵守 `prefers-reduced-motion`；启用时以静态检测状态替代闪烁。

## 16. 测试驱动开发要求

## 16.1 TDD 工作流

每个功能切片严格执行：

1. 先提交描述预期行为的失败测试。
2. 实现使测试通过的最小代码。
3. 重构并保持测试通过。
4. 增加竞态、错误和边界用例。
5. 执行 typecheck、lint、unit、integration 和相关 E2E。

不得先完成大块实现再补覆盖率测试。模型调用在自动化测试中一律使用可编程 fake transport；真实 API 只允许人工可选 smoke test。

## 16.2 覆盖率门槛

- 分段、分句、增量 diff、缓存、状态机、结果校验、替换计划等核心纯逻辑模块：分支覆盖率不低于 90%。
- 项目整体：行覆盖率不低于 80%。
- Chrome 和 Chromium Edge 各运行关键 E2E；任一失败不得发布。
- 仅提高数字而不验证行为的空断言、全量 snapshot 和排除核心文件不被接受。

## 16.3 单元测试清单

### 文本与 offset

- CRLF/LF 规范化及双向 offset 映射。
- emoji、组合字符和 surrogate pair。
- 空段、多空行、列表、引用、标题、`<br>` 和嵌套块。
- 英文缩写、小数、引号、省略号、中英文标点、中英混排。
- protected span：URL、邮箱、代码和专有名词标记。

### 增量缓存

- 只修改一个句子时保留其他句子和段落结果。
- 插入、删除、拆分、合并和移动段落。
- 重复段落/句子不会交换 ID。
- 光标附近编辑立即移除局部问题。
- 句内编辑移除句子与局部问题；段内编辑移除段落和全文结果。
- 过期响应无法覆盖新 revision。

### 调度

- 当前句在 1.5 秒内不入队，超时后入队。
- 光标移出句子立即使其具备资格。
- 段落完成触发段落和独立全文任务。
- batch 分批上限、去重和 unit 映射。
- parallel 并发 1–6、默认 3、队列优先级。
- 编辑后取消/丢弃旧任务。
- 全文超过字符限制不发请求。

### Schema 与模型结果

- 合法响应进入缓存。
- 无效 JSON、未知 scope、错误 ID/revision、越界 offset、original 不匹配、空 replacement 被拒绝。
- 同一批中一个 unit 无效不影响其他有效 unit。
- 一次结构修复重试。
- 429/5xx 退避重试，401/403 不自动重试。
- 模型文本不能注入 HTML。

### 修正应用

- 单项应用前原文精确校验。
- 批量修改按 offset 降序。
- 冲突项跳过并正确计数。
- 应用句子使局部问题失效；应用段落使子问题失效。
- 修改触发宿主 `beforeinput/input`，selection 合理保留。
- Chrome/Edge 原生 Ctrl/Cmd+Z 能撤销修改。

### UI 状态

- 小圆点隐藏、灰、绿、闪烁、蓝、橘的优先级。
- 问题计数只统计已检测且有效的问题。
- 当前句子建议在上、段落建议在下。
- 全文卡片颜色取最高级别。
- `prefers-reduced-motion` 下不闪烁。

## 16.4 集成测试清单

- content script → background → fake transport → content script 完整请求闭环。
- Side Panel 连接/断开驱动 `panel_open` 模式。
- Side Panel 只显示当前 tab、当前编辑器状态。
- API Key 不出现在 content script 消息和日志中。
- service worker 重新初始化后仍能处理 content script 新请求。
- 多编辑器切换、多个标签页隔离、frame 标识不串线。
- AI 工具与写作助手模型选择互不覆盖。
- 旧版存储状态迁移后 AI 工具功能不丢失。

## 16.5 E2E 测试矩阵

使用本地 fixture 页面，不依赖公网：

| 场景 | Chrome | Edge |
| --- | --- | --- |
| `textarea` 自动发现、换行、滚动与局部标签 | 必测 | 必测 |
| 单行自然语言 `input` 启用，搜索/敏感字段排除 | 必测 | 必测 |
| 嵌套标准 `contenteditable` 分段、下划线、竖线 | 必测 | 必测 |
| 小圆点跟随视觉行并打开 Side Panel | 必测 | 必测 |
| 停止输入、移出句子、完成段落的调度时机 | 必测 | 必测 |
| 单项应用、批量应用和原生撤销 | 必测 | 必测 |
| batch 与 parallel 配置 | 必测 | 关键 smoke |
| 侧边栏关闭时 `always` 继续工作 | 必测 | 必测 |
| `panel_open` 关闭后停用并清缓存 | 必测 | 必测 |
| 无模型灰色状态与恢复重试 | 必测 | 关键 smoke |
| 20,000 字符边界与长文提示 | 必测 | 关键 smoke |
| 现有 AI 工具聊天回归 | 必测 | 必测 |

E2E fake server 必须能模拟延迟、乱序、429、500、无效 JSON、部分无效 unit 和取消，以验证竞态而不是只验证理想路径。

## 17. 分阶段实现顺序

### 阶段 A：工程基线

- 建立 TypeScript、Vite、Vitest、Playwright、lint、typecheck 和双浏览器构建。
- 为现有 AI 工具补最小回归测试。
- 把现有单文件逻辑逐步迁移到模块，不在同一步改变全部行为。

完成条件：现有核心聊天、模型配置和存储迁移测试通过。

### 阶段 B：纯领域层

- 文本快照、offset map 抽象。
- 分段、分句、protected spans。
- 三层缓存、incremental diff、状态机和检测资格。
- Schema 与响应验证。

完成条件：核心模块分支覆盖率达到 90%，不依赖 DOM、Chrome API 和网络。

### 阶段 C：编辑器与标注

- 编辑器发现和敏感字段策略。
- input、textarea、contenteditable adapter。
- Shadow DOM overlay、小圆点、局部标签、句子下划线、段落竖线。
- 单项/批量应用及原生撤销验证。

完成条件：三类 fixture 的 Chrome/Edge E2E 通过。

### 阶段 D：后台分析链路

- typed messaging。
- background scheduler、batch/parallel、retry/cancel。
- OpenAI-compatible 与 Gemini-compatible transport。
- 全文独立请求。

完成条件：乱序、取消、service worker 重启和错误恢复集成测试通过。

### 阶段 E：写作助手侧边栏

- 两个一级 Tab。
- 模型、状态、计数、当前句/段建议、全文卡片和设置。
- 小圆点打开 Side Panel。
- `always` / `panel_open` 生命周期。

完成条件：所有一期用户旅程 E2E 通过。

### 阶段 F：发布硬化

- 性能、可访问性、安全检查。
- Chrome/Edge 全矩阵。
- 打包、升级迁移和回滚验证。

完成条件：所有质量门禁通过，无 P0/P1 缺陷。

## 18. 验收场景

### 场景 1：无感发现与局部修正

**Given** 默认 `always` 模式、模型已配置，网页有普通 textarea  
**When** 用户输入 `I recieved your email` 并停止 1.5 秒  
**Then** 页面在 `recieved` 上方以 80% 橘色字号显示 `received`，悬停显示原因，点击后只替换该词，编辑器原生撤销可以恢复原文。

### 场景 2：非英文内容

**Given** 目标文本为英文  
**When** 英文句中出现可直接替换的短中文词语  
**Then** 返回上下文相关的英文局部替换。  
**When** 一个完整句子或主要分句为中文  
**Then** 它作为句子问题显示英文建议句，而不是拆成多个无上下文单词。

### 场景 3：输入期间不覆盖新内容

**Given** 一个句子正在检测  
**When** 用户在响应返回前继续修改该句  
**Then** 原问题立即移除，请求被取消或响应因 revision 不匹配被丢弃，新文本不被修改。

### 场景 4：句子与段落建议排序

**Given** 当前光标句子有句子问题，所在段落有段落问题  
**When** 用户打开写作助手  
**Then** 先显示句子建议及原因，再显示段落建议及原因，顶部计数仍统计当前编辑器全部有效问题。

### 场景 5：完成段落和全文检测

**Given** 用户修改一个段落  
**When** 用户创建下一段或离开该段落  
**Then** 段落检测被调度，并产生一个独立全文检测请求；全文结果按最高级别把小圆点和全文卡片变蓝或橘。

### 场景 6：调用策略

**Given** 同时有多个未检测句子和段落  
**When** 策略为 batch  
**Then** 它们按批次上限合并请求。  
**When** 策略为 parallel、并发数为 3  
**Then** 每个 unit 单独请求，任意时刻最多 3 个单项请求在途，全文请求仍独立。

### 场景 7：批量应用

**Given** 当前输入框有 3 个有效句子问题  
**When** 用户点击空心圆计数并确认“全部应用”  
**Then** 展示预览后应用全部不冲突修正，跳过失效或冲突项，正文只进入编辑器原生撤销历史，缓存按新文本重新构建。

### 场景 8：无模型

**Given** 没有可用写作模型  
**When** 用户聚焦合格编辑器  
**Then** 小圆点为灰色，不发送正文，点击后打开写作助手配置/重试界面；配置恢复后当前有效待检测项继续处理。

### 场景 9：激活模式

**Given** `always` 模式  
**When** Side Panel 关闭  
**Then** 写作助手仍检测、标注，小圆点可重新打开 Side Panel。  
**Given** `panel_open` 模式  
**When** Side Panel 关闭  
**Then** 检测停止、标注移除、正文缓存清空。

### 场景 10：敏感字段

**Given** 页面存在密码、验证码或银行卡输入框  
**When** 用户在其中输入  
**Then** 扩展不读取、不缓存、不发送、不显示小圆点或标注。

### 场景 11：长文本

**Given** 全文字符上限为 20,000  
**When** 当前编辑器超过该上限  
**Then** 句子和段落增量检测继续，全文请求不发送，侧边栏显示“文本过长，全文检测暂停”。

### 场景 12：平台和回归

**Given** 同一发布构建  
**When** 在 Chrome 和 Chromium Edge 执行关键 E2E  
**Then** 写作助手旅程和现有 AI 工具回归全部通过；浏览器特有代码仅位于 capability/manifest 层。

## 19. 完成定义

一期只有在以下条件全部满足时才算完成：

- 本文档所有一期验收场景有自动化测试并通过。
- Chrome 与 Chromium Edge 关键 E2E 全部通过。
- 核心分支覆盖率和整体行覆盖率达到约定门槛。
- 未检测到正文、模型返回或 API Key 的持久化与日志泄漏。
- input、textarea、contenteditable 的单项和批量修改均可由编辑器原生撤销。
- 乱序响应、继续输入、导航、Side Panel 关闭和 service worker 生命周期竞态有测试覆盖。
- 现有 AI 工具功能回归通过。
- 架构评审确认站点适配器、浏览器 capability 和模型 transport 均可独立扩展。

## 20. 已确认问题与验收追踪

本节记录 2026-07-26 功能审计中已经确认的 20 个问题，并把修复后的行为固化为一期规范。它是第 4、6、8、10、12、13、16、18、19 节的补充约束，不新增产品范围。状态中的“已修复”表示已有对应实现和定向自动化测试；“待独立 QA 复验”表示实现与定向测试已存在，但独立 QA 的最终复验尚未完成。

覆盖率门槛和完整 Chrome/Edge 验收矩阵仍分别由第 16 节和第 19 节约束，不计入以下 20 项功能问题。

| 编号 | 已确认问题 | 固化后的规范要求 | 当前状态 |
| --- | --- | --- | --- |
| 1 | 文档检测状态未聚合全文任务与单元任务的 pending 状态 | 只要全文任务或任一单元处于 `queued` / `analyzing`，编辑器投影状态就必须保持检测中，不得提前显示完成。 | 已修复 |
| 2 | 离开段落时，全文 pending 与状态发布之间存在空窗 | `leaveParagraph` 必须先登记段落和全文 pending，再发布编辑器状态；观察者不得看到“任务已触发但状态已完成”的中间态。 | 已修复 |
| 3 | 网页小圆点未使用与侧边栏一致的聚合状态 | 小圆点与 Side Panel 必须读取同一份 `EditorViewState.status`，不得分别推导检测状态。 | 已修复 |
| 4 | 单元失败时可能误报文档检测完成 | 任一有效单元失败时，聚合状态必须为 `error`；其他单元或全文任务的成功结果不得覆盖该错误。 | 已修复 |
| 5 | 批量应用预览缺少逐项原文、替换文本和原因 | 点击问题计数后必须展示可访问的逐项预览，每项至少包含 `original → replacement`、原因、严重级别和 scope；用户确认前不得写入正文。 | 已修复 |
| 6 | 批量操作可能在确认前发送，或取消后仍发送 | 只有显式点击“确认应用”才能发送 `APPLY_ALL`；关闭、取消、按 Escape 或失去预览上下文均不得发送应用命令。 | 已修复 |
| 7 | 批量应用未向 Side Panel 返回真实应用与跳过数量 | Content Script 必须以 adapter 的真实返回值生成 `APPLY_RESULT.applied/skipped/stale`；Side Panel 不得根据预览数量猜测结果。 | 已修复 |
| 8 | `APPLY_RESULT` 计数校验和预览 XSS 防护不足 | `applied`、`skipped` 必须为非负整数；模型文本、原因、原文和替换文本一律按纯文本渲染，不得通过 `innerHTML` 注入。 | 已修复 |
| 9 | `APPLY_ALL` 未绑定确认时的 `editorId` 与 `revision` | 批量命令必须携带预览创建时的 `editorId`、`revision`、scope 和 `expectedCount`，并在写入前全部校验。 | 已修复 |
| 10 | Content Script 在编辑器或 revision 失配时仍可能写入 | 当前会话与命令身份不一致时必须零写入，返回 `stale=true`，并把预览项计入 `skipped`。 | 已修复 |
| 11 | `APPLY_RESULT` 缺少编辑器与 revision 身份 | 回执必须携带目标 `tabId`、`editorId`、`revision`、scope 和真实结果计数，使接收方能验证其来源和上下文。 | 已修复 |
| 12 | Side Panel 未按 `correlationId` 匹配批量回执 | Side Panel 只能消费已登记 pending 命令的回执；未知、重复、过期或 correlation 不匹配的回执必须忽略。 | 已修复 |
| 13 | 不同标签页的本地 `editorId` 可能碰撞 | 编辑器身份必须使用跨标签页不可碰撞的值；即使两个标签页的 revision 相同，也不得因此互相通过写入门卫。 | 已修复 |
| 14 | 后台按“处理消息时的活动标签页”动态转发命令 | 用户确认时必须冻结目标 `tabId`；后台只能向 payload 指定的标签页转发，不得重新选择当前活动标签页。 | 已修复 |
| 15 | `APPLY_ISSUE` / `APPLY_ALL` 未绑定目标 `tabId` | 单项和批量应用命令都必须显式携带 `tabId`、`editorId` 和 `revision`，并经过后台路由与 Content Script 双重校验。 | 已修复 |
| 16 | 非活动标签页的编辑器状态可能覆盖当前面板 | Side Panel 接收 `EDITOR_STATE_CHANGED` 时必须以实际 `sender.tab.id` 为准，并确认该标签页仍为当前活动标签页后才更新 UI。 | 已修复 |
| 17 | 错误 sender 会在身份校验前删除合法 pending | pending 只能在 correlation、payload 身份和实际 sender 全部验证通过后消费；无效回执不得影响随后到达的合法回执。 | 已修复 |
| 18 | 仅切换活动标签页时不会立即清除旧 UI | Side Panel 必须监听标签页激活事件；即使新标签页尚未发送编辑器状态，也要立即清除旧标签页的正文投影、预览和结果提示。 | 已修复 |
| 19 | 非活动标签页完成的合法回执可能串显示或丢失 | 显示回执前必须再次确认活动标签页；非活动标签页的合法结果可以暂存，但不得显示到当前标签页，也不得因切换而丢失。 | 已修复 |
| 20 | 暂存的 `completedBatch` 在恢复时可能串到其他编辑器 | 暂存结果恢复时必须同时匹配 `tabId` 和 `editorId`；只有对应标签页重新激活且收到匹配编辑器状态后才允许展示，其他编辑器不得继承该结果。 | 已实现，待独立 QA 复验 |

### 20.1 回归要求

- 第 1–4 项必须由检测状态集成测试覆盖全文与单元任务乱序完成、单元失败和段落离开状态发布顺序。
- 第 5–12 项必须覆盖确认、取消、过期 revision、真实 `applied/skipped/stale` 回执、重复/未知 correlation 和不可信预览文本。
- 第 13–20 项必须至少覆盖两个标签页，即使人为构造相同的 `editorId/revision`，也不得跨标签页写入、消费回执或串显示。
- 必须覆盖以下竞态顺序：错误 sender 先到后合法回执到达；用户确认后立即切换标签页；非活动标签页完成后用户切回；纯切换标签页但新页面尚未发布编辑器状态。
