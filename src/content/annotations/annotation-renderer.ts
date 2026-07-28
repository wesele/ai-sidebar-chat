import type { Issue } from '../../domain/analysis/issues';

export type DotState = 'hidden' | 'unavailable' | 'analyzing' | 'problem' | 'improvement' | 'ready';

export function dotState(
  active: boolean,
  hasModel: boolean,
  analyzing: boolean,
  severity?: 'problem' | 'improvement',
): DotState {
  if (!active) return 'hidden';
  if (!hasModel) return 'unavailable';
  if (analyzing) return 'analyzing';
  return severity ?? 'ready';
}

export class AnnotationRenderer {
  private host?: HTMLElement;
  private root?: ShadowRoot;
  private dot?: HTMLButtonElement;
  private pending = false;

  constructor(
    private readonly onDot: () => void,
    private readonly onIssue?: (issueId: string) => void,
  ) {}

  mount(): void {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.dataset.writingAssistant = 'overlay';
    this.host.dataset.issueCount = '0';
    this.host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    document.documentElement.append(this.host);
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .dot,.mark{position:fixed;pointer-events:auto}
      .dot{border:0;border-radius:50%;width:16px;height:16px}
      .ready,.analyzing{background:#159947}.unavailable{background:#777}
      .problem{background:#e57917}.improvement{background:#2878d4}
      .under{position:fixed;height:2px}.paragraph{position:fixed;width:3px}
      .mark{font-family:sans-serif;font-size:var(--writing-label-font-size,80%);line-height:1.2;
        color:#b85000;background:#fff3e6;border:0;border-radius:2px;padding:0 2px;white-space:nowrap}
      .analyzing{animation:pulse 1s infinite}@keyframes pulse{50%{opacity:.45}}
      @media(prefers-reduced-motion:reduce){.analyzing{animation:none}}
    `;
    this.root.append(style);
    this.dot = document.createElement('button');
    this.dot.className = 'dot ready';
    this.dot.type = 'button';
    this.dot.setAttribute('aria-label', '打开写作助手：可用');
    this.dot.addEventListener('click', this.onDot);
    this.root.append(this.dot);
  }

  setEditorFontSize(fontSize: string): void {
    this.mount();
    const pixels = Number.parseFloat(fontSize);
    if (this.host && Number.isFinite(pixels) && pixels > 0) {
      this.host.style.setProperty('--writing-label-font-size', `${pixels * 0.8}px`);
    }
  }

  updateDot(rect: DOMRect | null, state: DotState, editorRect?: DOMRect | null): void {
    this.mount();
    if (!this.dot || !this.host) return;
    this.host.dataset.dotState = state;
    this.dot.hidden = !rect || state === 'hidden';
    this.dot.className = `dot ${state}`;
    const labels: Record<DotState, string> = {
      hidden: '未激活',
      unavailable: '等待配置模型',
      analyzing: '正在检测',
      problem: '发现明显问题',
      improvement: '发现可改进建议',
      ready: '可用',
    };
    this.dot.setAttribute('aria-label', `打开写作助手：${labels[state]}`);
    if (rect) {
      const rightEdge = editorRect ? editorRect.right - 22 : rect.right - 18;
      const leftPos = Math.max(rect.left + 10, Math.min(innerWidth - 22, rightEdge));
      const topPos = rect.top + Math.max(0, (rect.height - 16) / 2);
      this.dot.style.left = `${leftPos}px`;
      this.dot.style.top = `${topPos}px`;
    }
  }

  render(issues: Issue[], rectFor: (issue: Issue) => DOMRect[]): void {
    this.mount();
    if (this.host) this.host.dataset.issueCount = String(issues.length);
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      if (!this.root) return;
      this.root.querySelectorAll('.mark,.under,.paragraph').forEach((element) => element.remove());
      for (const issue of issues) {
        for (const rect of rectFor(issue)) {
          if (rect.bottom < -100 || rect.top > innerHeight + 100) continue;
          const node = document.createElement(issue.scope === 'local' ? 'button' : 'i');
          node.dataset.issueId = issue.issueId;
          node.dataset.issueScope = issue.scope;
          node.className = issue.scope === 'local'
            ? 'mark'
            : issue.scope === 'paragraph'
              ? `paragraph ${issue.severity}`
              : `under ${issue.severity}`;
          node.style.left = `${issue.scope === 'paragraph' ? rect.left - 8 : rect.left}px`;
          node.style.top = `${issue.scope === 'local'
            ? rect.top - 16
            : issue.scope === 'paragraph'
              ? rect.top
              : rect.bottom - 2}px`;
          node.style.width = issue.scope === 'local'
            ? 'auto'
            : `${issue.scope === 'paragraph' ? 3 : rect.width}px`;
          node.style.height = issue.scope === 'local'
            ? 'auto'
            : `${issue.scope === 'paragraph' ? rect.height : 2}px`;
          if (issue.scope === 'local') {
            node.textContent = issue.replacement;
            node.title = issue.reason;
            node.setAttribute('aria-label', `${issue.replacement}：${issue.reason}`);
            node.addEventListener('click', () => this.onIssue?.(issue.issueId));
          }
          this.root.append(node);
        }
      }
    });
  }

  clear(): void {
    this.host?.remove();
    this.host = undefined;
    this.root = undefined;
    this.dot = undefined;
  }
}
