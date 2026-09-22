import { countIssues, createOrUpdateCache, type DocumentCache } from '../domain/analysis/cache';
import { canAnalyze, canAnalyzeParagraph } from '../domain/analysis/eligibility';
import type { DetectionStatus, Issue } from '../domain/analysis/issues';
import { validateFullDocumentResponse, validateResponse } from '../domain/analysis/response-validator';
import type { AnalysisRequest, AnalysisResponse, FullDocumentResponse } from '../shared/schemas';
import { generateUUID } from '../shared/uuid';
import type { EditorAdapter } from './adapters/editor-adapter';

import type { TargetLanguage, WritingStyle } from '../shared/messages';

export interface WritingSettings {
  hasModel: boolean;
  fullDocumentCharacterLimit: number;
  targetLanguage: TargetLanguage;
  writingStyle?: WritingStyle;
  invocationStrategy?: 'batch' | 'parallel';
  maxConcurrency?: number;
}

type PendingRequest =
  | { kind: 'units'; revision: number; remaining: Set<string>; totalApiCalls?: number; apiCallsDone?: number }
  | { kind: 'full'; revision: number };

const CONTEXT_CHARACTER_LIMIT = 800;
/**
 * Cap per-scope batch previews in EDITOR_STATE_CHANGED. Every publish
 * structured-clones this payload to the side panel while issues accumulate
 * during analysis; the preview modal only needs a bounded list (counts stay
 * authoritative for totals / APPLY_ALL expectedCount).
 */
const BATCH_PREVIEW_LIMIT = 200;

const projectPreview = (issue: Issue) => ({
  issueId: issue.issueId,
  severity: issue.severity,
  original: issue.original,
  replacement: issue.replacement,
  reason: issue.reason,
});

export class WritingSession {
  private cache?: DocumentCache;
  private timer?: number;
  private selectionFrame?: number;
  private composing = false;
  private paused = false;
  private reanalysisPending = false;
  private resumeTimer?: number;
  private unsubscribe?: () => void;
  private lastSentenceId?: string;
  private lastParagraphId?: string;
  private lastInputAt = 0;
  private lastAppliedReplacements?: import('../domain/analysis/apply-plan').Replacement[];
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly adapter: EditorAdapter,
    private readonly request: (request: AnalysisRequest) => void,
    private readonly requestFull: (requestId: string, revision: number, text: string) => void,
    private readonly cancel: (requestId: string) => void,
    private readonly publish: (cache: DocumentCache) => void,
    private readonly settings: () => WritingSettings,
    /**
     * Lightweight caret refresh: invoked when the selection changed but the
     * caret stayed inside the same sentence/paragraph and no analysis work was
     * triggered. Listeners should only reposition the status dot (cheap) and
     * must NOT rebuild annotations or re-render panel state.
     */
    private readonly notifyCaret?: () => void,
  ) {}
  /** Snapshot reuse for the currently handled selection event (see onSelectionChange). */
  private snapshotHint?: Readonly<import('../domain/text/snapshot').EditorSnapshot>;

  start(): void {
    this.unsubscribe = this.adapter.observe(this.onInput);
    this.adapter.element.addEventListener('compositionstart', this.onCompositionStart);
    this.adapter.element.addEventListener('compositionend', this.onCompositionEnd);
    this.adapter.element.addEventListener('focusout', this.onFocusOut);
    this.adapter.element.addEventListener('click', this.onSelectionChange);
    this.adapter.element.addEventListener('pointerup', this.onSelectionChange);
    this.adapter.element.addEventListener('keyup', this.onSelectionChange);
    document.addEventListener('selectionchange', this.onSelectionChange);
    this.onInput();
  }

  initializeBaseline(): void {
    if (!this.cache) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.cancelPending();
    this.cache.status = 'analyzed';
    this.cache.analysisRevision = this.cache.revision;
    for (const paragraph of this.cache.paragraphs) {
      paragraph.status = 'analyzed';
      paragraph.analysisRevision = this.cache.revision;
      paragraph.issue = undefined;
      for (const sentence of paragraph.sentences) {
        sentence.status = 'analyzed';
        sentence.analysisRevision = this.cache.revision;
        sentence.localIssues = [];
        sentence.sentenceIssue = undefined;
      }
    }
    this.publish(this.cache);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.selectionFrame) cancelAnimationFrame(this.selectionFrame);
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.selectionFrame = undefined;
    this.resumeTimer = undefined;
    this.unsubscribe?.();
    this.adapter.element.removeEventListener('compositionstart', this.onCompositionStart);
    this.adapter.element.removeEventListener('compositionend', this.onCompositionEnd);
    this.adapter.element.removeEventListener('focusout', this.onFocusOut);
    this.adapter.element.removeEventListener('click', this.onSelectionChange);
    this.adapter.element.removeEventListener('pointerup', this.onSelectionChange);
    this.adapter.element.removeEventListener('keyup', this.onSelectionChange);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    this.cancelPending();
  }

  /** Pause all work while the page is hidden without discarding existing results. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.timer = undefined;
    this.resumeTimer = undefined;
    if (this.selectionFrame) cancelAnimationFrame(this.selectionFrame);
    this.selectionFrame = undefined;
    this.cancelPending();
  }

  /**
   * Reconcile the editor once when the page becomes visible again.
   * Deferred off the visibilitychange handler itself: a full readSnapshot +
   * cache rebuild there blocks the browser's tab-switch animation on long
   * documents (perceived freeze when switching tabs).
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.reanalysisPending) {
      this.reanalysisPending = false;
      this.reanalyzeAll();
      return;
    }
    if (this.resumeTimer !== undefined) return;
    this.resumeTimer = window.setTimeout(() => {
      this.resumeTimer = undefined;
      if (this.paused || this.composing) return;
      this.onInput();
    }, 0);
  }

  current(): DocumentCache | undefined {
    return this.cache;
  }

  retry(): void {
    if (!this.paused && this.cache) {
      if (this.cache.status === 'error') {
        this.cache.status = 'dirty';
      }
      delete this.cache.errorReason;
      for (const paragraph of this.cache.paragraphs) {
        if (paragraph.status === 'error') paragraph.status = 'dirty';
        for (const sentence of paragraph.sentences) {
          if (sentence.status === 'error') sentence.status = 'dirty';
        }
      }
      this.publish(this.cache);
      this.dispatch(false);
      this.leaveParagraph();
    }
  }

  /** Reset every unit and re-run the full detection immediately (e.g. when the target language changes). */
  reanalyzeAll(): void {
    if (!this.cache) return;
    if (this.paused) {
      this.reanalysisPending = true;
      return;
    }
    this.cancelPending();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.cache.fullResult = undefined;
    for (const paragraph of this.cache.paragraphs) {
      paragraph.issue = undefined;
      paragraph.status = 'never';
      paragraph.analysisRevision = undefined;
      for (const sentence of paragraph.sentences) {
        sentence.localIssues = [];
        sentence.sentenceIssue = undefined;
        sentence.status = 'never';
        sentence.analysisRevision = undefined;
      }
    }
    this.cache.status = 'never';
    this.cache.errorReason = undefined;
    this.publish(this.cache);
    this.dispatch(true);
    this.requestFullDoc();
  }

  recheckAll(): void {
    this.reanalyzeAll();
  }

  private readonly onCompositionStart = (): void => {
    this.composing = true;
    if (this.timer) clearTimeout(this.timer);
    this.cancelPending();
  };

  private readonly onCompositionEnd = (): void => {
    this.composing = false;
    this.onInput();
  };

  private readonly onFocusOut = (): void => {
    if (!this.composing && this.cache) this.leaveParagraph(this.lastParagraphId);
  };

  private readonly onSelectionChange = (): void => {
    if (this.paused || this.composing || !this.cache || this.selectionFrame) return;
    this.selectionFrame = requestAnimationFrame(() => {
      this.selectionFrame = undefined;
      this.processSelectionChange();
    });
  };

  private processSelectionChange(): void {
    if (this.composing || !this.cache) return;
    if (!this.selectionBelongsToEditor()) return;
    const previousSentenceId = this.lastSentenceId;
    const previousParagraphId = this.lastParagraphId;
    const snapshot = this.adapter.readSnapshot();
    const current = this.unitsAt(snapshot.selection?.start ?? -1);
    this.lastSentenceId = current.sentenceId;
    this.lastParagraphId = current.paragraphId;

    // The snapshot was just read synchronously: let viewState() calls issued
    // by leaveParagraph/dispatch/publish below reuse it instead of rebuilding
    // the whole editor text model a second time for the same event.
    this.snapshotHint = snapshot;
    try {
      let didWork = false;
      if (previousParagraphId && previousParagraphId !== current.paragraphId) {
        const prevParagraph = this.cache.paragraphs.find((p) => p.id === previousParagraphId);
        // Only re-trigger if at least one sentence still needs analysis.
        // paragraph.status being 'dirty' alone does NOT mean work is pending —
        // it simply means no paragraph-scope issue unit was returned by the LLM,
        // which is expected when the model only emits sentence/local results.
        const isDirty = prevParagraph?.sentences.some(
          (s) => s.status === 'dirty' || s.status === 'never',
        );
        if (isDirty) {
          this.leaveParagraph(previousParagraphId);
          didWork = true;
        }
      } else if (previousSentenceId && previousSentenceId !== current.sentenceId) {
        const prevParagraph = this.cache.paragraphs.find((p) => p.id === this.lastParagraphId);
        const prevSentence = prevParagraph?.sentences.find((s) => s.id === previousSentenceId);
        if (prevSentence?.status === 'dirty') {
          this.dispatch(false);
          didWork = true;
        }
      }
      const movedUnit =
        previousSentenceId !== current.sentenceId || previousParagraphId !== current.paragraphId;
      if (movedUnit || didWork) {
        // Caret entered another unit (panel shows per-unit issues) or fresh
        // analysis work was queued: full publish.
        this.publish(this.cache);
      } else {
        // Same sentence/paragraph, nothing queued: only the caret geometry
        // (status dot position) may have changed. Skip the expensive full
        // publish (snapshot rebuild + per-issue geometry + panel re-render);
        // selectionchange fires continuously while dragging/selecting, and a
        // full publish per event keeps the CPU busy indefinitely.
        this.notifyCaret?.();
      }
    } finally {
      this.snapshotHint = undefined;
    }
  }

  private selectionBelongsToEditor(): boolean {
    if (this.adapter.element instanceof HTMLInputElement || this.adapter.element instanceof HTMLTextAreaElement) {
      return document.activeElement === this.adapter.element;
    }
    const selection = window.getSelection();
    return Boolean(
      selection?.rangeCount &&
      selection.anchorNode &&
      selection.focusNode &&
      this.adapter.element.contains(selection.anchorNode) &&
      this.adapter.element.contains(selection.focusNode),
    );
  }

  private cancelPending(): void {
    for (const [requestId, pending] of this.pending) {
      this.restorePendingUnits(pending, 'dirty');
      this.cancel(requestId);
    }
    this.pending.clear();
  }

  private restorePendingUnits(pending: PendingRequest, status: 'dirty' | 'error'): void {
    if (!this.cache || pending.kind !== 'units') return;
    for (const paragraph of this.cache.paragraphs) {
      if (pending.remaining.has(paragraph.id) && paragraph.status === 'queued') paragraph.status = status;
      for (const sentence of paragraph.sentences) {
        if (pending.remaining.has(sentence.id) && sentence.status === 'queued') sentence.status = status;
      }
    }
  }

  fail(requestId: string, code?: string): void {
    const pending = this.pending.get(requestId);
    if (!pending || !this.cache) return;
    this.restorePendingUnits(pending, 'error');
    this.pending.delete(requestId);
    this.cache.status = 'error';
    if (code) {
      this.cache.errorReason = code;
    }
    this.publish(this.cache);
  }

  private readonly onInput = (): void => {
    if (this.paused || this.composing) return;
    this.cancelPending();
    const previousParagraph = this.lastParagraphId;
    const snapshot = this.adapter.readSnapshot();
    this.lastInputAt = Date.now();
    const isApplying = Boolean(this.lastAppliedReplacements?.length);
    this.cache = createOrUpdateCache(this.cache, snapshot.editorId, snapshot.text, this.lastAppliedReplacements);
    const current = this.unitsAt(snapshot.selection?.start ?? -1);
    this.lastSentenceId = current.sentenceId;
    this.lastParagraphId = current.paragraphId;
    this.snapshotHint = snapshot;
    try {
      this.publish(this.cache);

      if (previousParagraph && previousParagraph !== current.paragraphId) {
        this.leaveParagraph(previousParagraph);
      }
      if (this.timer) clearTimeout(this.timer);
      if (!isApplying) {
        // An edit in a long document should analyze the edited paragraph first;
        // otherwise old quoted/history paragraphs can consume the whole batch.
        this.timer = window.setTimeout(() => this.dispatch(false), 1500);
      }
    } finally {
      this.snapshotHint = undefined;
    }
  };

  private unitsAt(offset: number): { paragraphId?: string; sentenceId?: string } {
    if (!this.cache || offset < 0) return {};
    const paragraphs = this.cache.paragraphs;
    let paragraph = binarySearchInterval(paragraphs, offset);
    if (!paragraph) {
      // Check if caret falls in interstitial space between paragraphs
      for (let i = 0; i < paragraphs.length; i++) {
        const next = paragraphs[i + 1];
        if (offset >= paragraphs[i].end && (!next || offset < next.start)) {
          paragraph = paragraphs[i];
          break;
        }
      }
    }
    const sentences = paragraph?.sentences ?? [];
    let sentence = binarySearchInterval(sentences, offset);
    if (!sentence && paragraph) {
      for (let i = 0; i < sentences.length; i++) {
        const next = sentences[i + 1];
        if (offset >= sentences[i].end && (!next || offset < next.start)) {
          sentence = sentences[i];
          break;
        }
      }
    }
    return { paragraphId: paragraph?.id, sentenceId: sentence?.id };
  }

  requestFullDoc(): void {
    if (this.paused) return;
    const snapshot = this.snapshotHint ?? this.adapter.readSnapshot();
    if (
      this.cache &&
      this.settings().hasModel &&
      Boolean(snapshot.text.trim()) &&
      snapshot.text.length <= this.settings().fullDocumentCharacterLimit
    ) {
      for (const [requestId, pending] of this.pending) {
        if (pending.kind === 'full') {
          this.cancel(requestId);
          this.pending.delete(requestId);
        }
      }
      const requestId = generateUUID();
      this.pending.set(requestId, { kind: 'full', revision: this.cache.revision });
      this.publish(this.cache);
      this.requestFull(requestId, this.cache.revision, snapshot.text);
    }
  }

  leaveParagraph(completedParagraphId = this.lastParagraphId): void {
    if (this.paused) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const snapshot = this.snapshotHint ?? this.adapter.readSnapshot();
    if (this.cache && snapshot.text.length > this.settings().fullDocumentCharacterLimit) {
      this.cache.status = 'error';
      this.publish(this.cache);
    }
    this.dispatch(true, completedParagraphId);
  }

  private dispatch(paragraphComplete: boolean, completedParagraphId?: string): void {
    if (this.paused) return;
    // Reuse the snapshot already read for the current event when available.
    const snapshot = this.snapshotHint ?? this.adapter.readSnapshot();
    if (!this.cache || !this.settings().hasModel) return;
    const units: AnalysisRequest['units'] = [];

    for (const paragraph of this.cache.paragraphs) {
      const isCompletedTarget = paragraphComplete &&
        (completedParagraphId === undefined || paragraph.id === completedParagraphId);
      for (const sentence of paragraph.sentences) {
        const inside =
          snapshot.selection !== null &&
          snapshot.selection.start >= sentence.start &&
          snapshot.selection.start <= sentence.end;
        const sentenceText = snapshot.text.slice(sentence.start, sentence.end);
        if (canAnalyze(sentence.status, sentenceText, this.composing, isCompletedTarget ? false : inside, Date.now() - this.lastInputAt)) {
          sentence.status = 'queued';
          const sentenceIndex = paragraph.sentences.indexOf(sentence);
          const before = trimContextBefore(snapshot.text.slice(paragraph.start, sentence.start).trim()) || this.previousSentenceText(paragraph, sentenceIndex, snapshot.text);
          const after = trimContextAfter(snapshot.text.slice(sentence.end, paragraph.end).trim()) || this.nextSentenceText(paragraph, sentenceIndex, snapshot.text);
          units.push({
            unitId: sentence.id,
            unitRevision: sentence.revision,
            unitType: 'sentence',
            text: sentenceText,
            absoluteStart: sentence.start,
            ...(before ? { contextBefore: before } : {}),
            ...(after ? { contextAfter: after } : {}),
          });
        }
      }

      const paragraphText = snapshot.text.slice(paragraph.start, paragraph.end);
      if (canAnalyzeParagraph(paragraph.status, paragraphText, this.composing, isCompletedTarget)) {
        paragraph.status = 'queued';
        const paragraphIndex = this.cache.paragraphs.indexOf(paragraph);
        const before = this.cache.paragraphs[paragraphIndex - 1];
        const after = this.cache.paragraphs[paragraphIndex + 1];
        units.push({
          unitId: paragraph.id,
          unitRevision: paragraph.revision,
          unitType: 'paragraph',
          text: paragraphText,
          absoluteStart: paragraph.start,
          ...(before ? { contextBefore: trimContextBefore(snapshot.text.slice(before.start, before.end)) } : {}),
          ...(after ? { contextAfter: trimContextAfter(snapshot.text.slice(after.start, after.end)) } : {}),
        });
      }
    }

    if (!units.length) return;
    const requestId = generateUUID();
    const strategy = this.settings().invocationStrategy ?? 'batch';
    this.pending.set(requestId, {
      kind: 'units',
      revision: this.cache.revision,
      remaining: new Set(units.map((unit) => unit.unitId)),
      // Parallel mode sends exactly one API call per unit. Batch count depends
      // on context-aware sizing in the background, so do not show misleading
      // request progress for that mode.
      ...(strategy === 'parallel' ? { totalApiCalls: units.length, apiCallsDone: 0 } : {}),
    });
    this.publish(this.cache);
    this.request({
      schemaVersion: '1',
      requestId,
      documentRevision: this.cache.revision,
      targetLanguage: this.settings().targetLanguage ?? 'EN',
      writingStyle: this.settings().writingStyle,
      units,
    });
  }

  private previousSentenceText(paragraph: DocumentCache['paragraphs'][number], index: number, text: string): string | undefined {
    const local = paragraph.sentences[index - 1];
    if (local) return trimContextBefore(text.slice(local.start, local.end));
    const previous = this.cache?.paragraphs[this.cache.paragraphs.indexOf(paragraph) - 1];
    const sentence = previous?.sentences.at(-1);
    return sentence ? trimContextBefore(text.slice(sentence.start, sentence.end)) : undefined;
  }

  private nextSentenceText(paragraph: DocumentCache['paragraphs'][number], index: number, text: string): string | undefined {
    const local = paragraph.sentences[index + 1];
    if (local) return trimContextAfter(text.slice(local.start, local.end));
    const next = this.cache?.paragraphs[this.cache.paragraphs.indexOf(paragraph) + 1];
    const sentence = next?.sentences[0];
    return sentence ? trimContextAfter(text.slice(sentence.start, sentence.end)) : undefined;
  }

  accept(response: AnalysisResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!this.cache || !pending || pending.kind !== 'units') return;
    if (pending.revision !== this.cache.revision || response.documentRevision !== this.cache.revision) {
      // The cache has moved on (a newer analysis round owns these units); the
      // stale request can never match again, so drop it to avoid an orphaned
      // pending that would keep the dot "analyzing" forever.
      this.pending.delete(response.requestId);
      return;
    }

    const snapshot = this.adapter.readSnapshot();
    const expected = this.cache.paragraphs.flatMap((paragraph) => [
      ...paragraph.sentences.map((sentence) => ({
        id: sentence.id,
        revision: sentence.revision,
        type: 'sentence' as const,
        text: snapshot.text.slice(sentence.start, sentence.end),
      })),
      {
        id: paragraph.id,
        revision: paragraph.revision,
        type: 'paragraph' as const,
        text: snapshot.text.slice(paragraph.start, paragraph.end),
      },
    ]);
    const validated = validateResponse(response, {
      requestId: response.requestId,
      documentRevision: this.cache.revision,
      units: expected,
    });

    // Index units once so accept is O(paragraphs + responseUnits) instead of
    // O(responseUnits × paragraphs): every batch response used to scan the
    // whole document per rejected/valid unit, which dominated CPU while a
    // long document was being analyzed.
    const unitById = new Map<string, { paragraph: DocumentCache['paragraphs'][number]; sentence?: DocumentCache['paragraphs'][number]['sentences'][number] }>();
    for (const paragraph of this.cache.paragraphs) {
      unitById.set(paragraph.id, { paragraph });
      for (const sentence of paragraph.sentences) {
        unitById.set(sentence.id, { paragraph, sentence });
      }
    }

    for (const rejectedId of validated.rejected) {
      if (rejectedId === 'response' || rejectedId === 'unit') continue;
      const hit = unitById.get(rejectedId);
      if (!hit) continue;
      if (hit.sentence) {
        if (hit.sentence.status === 'queued') hit.sentence.status = 'error';
      } else if (hit.paragraph.status === 'queued') {
        hit.paragraph.status = 'error';
      }
    }

    for (const unit of validated.valid) {
      const hit = unitById.get(unit.unitId);
      if (!hit) continue;
      const { paragraph, sentence } = hit;
      const base = sentence?.start ?? paragraph.start;
      const issues = unit.issues.map((issue) => ({
        ...issue,
        start: issue.start + base,
        end: issue.end + base,
      }));
      if (sentence) {
        sentence.localIssues = issues.filter((issue) => issue.scope === 'local');
        sentence.sentenceIssue = issues.find((issue) => issue.scope === 'sentence');
        sentence.status = 'analyzed';
        sentence.analysisRevision = this.cache.revision;
      } else {
        paragraph.issue = issues[0];
        paragraph.status = 'analyzed';
        paragraph.analysisRevision = this.cache.revision;
      }
    }

    for (const paragraph of this.cache.paragraphs) {
      if (paragraph.sentences.length > 0 && paragraph.sentences.every((s) => s.status === 'analyzed')) {
        paragraph.status = 'analyzed';
        paragraph.analysisRevision = this.cache.revision;
      }
    }

    const isAnyDirty = this.cache.paragraphs.some(
      (p) => p.status === 'dirty' || p.status === 'queued' || p.sentences.some((s) => s.status === 'dirty' || s.status === 'queued'),
    );
    if (!isAnyDirty) {
      this.cache.status = 'analyzed';
      this.cache.analysisRevision = this.cache.revision;
    }

    pending.apiCallsDone = pending.totalApiCalls === undefined
      ? undefined
      : Math.min((pending.apiCallsDone ?? 0) + 1, pending.totalApiCalls);
    for (const unit of response.units) pending.remaining.delete(unit.unitId);
    if (pending.remaining.size === 0) {
      this.pending.delete(response.requestId);
    }
    this.publish(this.cache);
  }

  acceptFull(result: FullDocumentResponse): void {
    const pending = this.pending.get(result.requestId);
    if (!this.cache || !pending || pending.kind !== 'full') return;
    if (pending.revision !== this.cache.revision || result.documentRevision !== this.cache.revision) {
      // The document has been modified since this full-analysis request was
      // issued, so the result is stale and can never match. Drop the pending
      // entry to avoid an orphaned record that would keep fullAnalysisPending
      // true forever (mirroring the same guard in accept() for unit requests).
      this.pending.delete(result.requestId);
      return;
    }
    const valid = validateFullDocumentResponse(result, {
      requestId: result.requestId,
      documentRevision: this.cache.revision,
    });
    if (!valid) {
      this.pending.delete(result.requestId);
      this.cache.status = 'error';
      this.cache.errorReason = 'INVALID_RESPONSE';
      this.publish(this.cache);
      return;
    }
    this.pending.delete(result.requestId);
    this.cache.fullResult = valid;
    this.cache.status = 'analyzed';
    this.cache.analysisRevision = this.cache.revision;
    this.publish(this.cache);
  }

  issues(): Issue[] {
    return this.cache?.paragraphs.flatMap((paragraph) => [
      ...(paragraph.issue ? [paragraph.issue] : []),
      ...paragraph.sentences.flatMap((sentence) => [
        ...sentence.localIssues,
        ...(sentence.sentenceIssue ? [sentence.sentenceIssue] : []),
      ]),
    ]) ?? [];
  }

  applyIssue(issueId: string): boolean {
    const issue = this.issues().find((item) => item.issueId === issueId);
    if (!issue) return false;
    this.lastAppliedReplacements = [{
      start: issue.start,
      end: issue.end,
      original: issue.original,
      replacement: issue.replacement,
    }];
    try {
      const result = this.adapter.replaceRanges(this.lastAppliedReplacements);
      return result.applied === 1;
    } finally {
      this.lastAppliedReplacements = undefined;
    }
  }

  applyAll(scope: 'local' | 'sentence' | 'paragraph') {
    const replacements = this.issues()
      .filter((issue) => issue.scope === scope)
      .map((issue) => ({
        start: issue.start,
        end: issue.end,
        original: issue.original,
        replacement: issue.replacement,
      }));
    this.lastAppliedReplacements = replacements;
    try {
      return this.adapter.replaceRanges(replacements);
    } finally {
      this.lastAppliedReplacements = undefined;
    }
  }

  viewState() {
    if (!this.cache) return undefined;
    // Prefer the snapshot already read for the current input/selection event
    // (see onSelectionChange) over rebuilding the editor text model again.
    const caret = (this.snapshotHint ?? this.adapter.readSnapshot()).selection?.start ?? -1;
    const issues = this.issues();
    const item = (scope: 'sentence' | 'paragraph') =>
      issues.find((issue) => issue.scope === scope && issue.start <= caret && caret <= issue.end);
    const currentParagraph = this.cache.paragraphs.find((paragraph) =>
      paragraph.start <= caret && caret <= paragraph.end,
    ) ?? (caret >= 0 ? this.cache.paragraphs.find((paragraph, idx, arr) => {
      const next = arr[idx + 1];
      return Boolean(next && caret >= paragraph.end && caret < next.start);
    }) : undefined);
    const currentParagraphIssues = currentParagraph
      ? issues.filter((issue) => issue.start >= currentParagraph.start && issue.end <= currentParagraph.end)
      : [];
    const project = (issue?: Issue) => issue && ({
      issueId: issue.issueId,
      original: issue.original,
      replacement: issue.replacement,
      reason: issue.reason,
    });
    return {
      editorId: this.cache.editorId,
      revision: this.cache.revision,
      status: this.projectedStatus(),
      counts: countIssues(this.cache),
      ...this.progressState(),
      batchPreviews: {
        local: issues.filter((issue) => issue.scope === 'local').slice(0, BATCH_PREVIEW_LIMIT).map(projectPreview),
        sentence: issues.filter((issue) => issue.scope === 'sentence').slice(0, BATCH_PREVIEW_LIMIT).map(projectPreview),
        paragraph: issues.filter((issue) => issue.scope === 'paragraph').slice(0, BATCH_PREVIEW_LIMIT).map(projectPreview),
      },
      currentSentence: project(item('sentence')),
      currentParagraph: project(currentParagraph?.issue),
      currentParagraphIssues: currentParagraphIssues.length
        ? currentParagraphIssues.map((issue) => ({
          issueId: issue.issueId,
          original: issue.original,
          replacement: issue.replacement,
          reason: issue.reason,
        }))
        : undefined,
      fullResult: this.cache.fullResult && {
        severity: this.cache.fullResult.severity,
        summary: this.cache.fullResult.summary,
        suggestions: this.cache.fullResult.suggestions,
      },
      fullAnalysisPending: Array.from(this.pending.values()).some((pending) => pending.kind === 'full'),
      longText: this.cache.textLength > this.settings().fullDocumentCharacterLimit,
      noModel: !this.settings().hasModel,
      errorReason: this.cache.errorReason,
    };
  }

  private progressState(): { analysisDone?: number; analysisTotal?: number } {
    for (const pending of this.pending.values()) {
      if (pending.kind === 'units' && (pending.totalApiCalls ?? 0) > 1) {
        return { analysisDone: pending.apiCallsDone, analysisTotal: pending.totalApiCalls };
      }
    }
    return {};
  }

  /** Cache-only projected status (no snapshot read): for cheap dot updates. */
  status(): DetectionStatus {
    if (!this.cache) return 'never';
    return this.projectedStatus();
  }

  private projectedStatus(): DetectionStatus {
    if (!this.cache) return 'never';
    const childStatuses = this.cache.paragraphs.flatMap((paragraph) => [
      paragraph.status,
      ...paragraph.sentences.map((sentence) => sentence.status),
    ]);
    if (this.pending.size > 0 || childStatuses.some((status) => status === 'queued' || status === 'analyzing')) {
      return 'queued';
    }
    if (this.cache.status === 'error' || childStatuses.some((status) => status === 'error')) return 'error';
    return this.cache.status;
  }
}

function trimContextBefore(text: string): string {
  return text.length <= CONTEXT_CHARACTER_LIMIT ? text : text.slice(-CONTEXT_CHARACTER_LIMIT);
}

function trimContextAfter(text: string): string {
  return text.length <= CONTEXT_CHARACTER_LIMIT ? text : text.slice(0, CONTEXT_CHARACTER_LIMIT);
}

function binarySearchInterval<T extends { start: number; end: number }>(items: readonly T[], offset: number): T | undefined {
  let low = 0;
  let high = items.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = items[mid];
    if (offset < item.start) {
      high = mid - 1;
    } else if (offset > item.end) {
      low = mid + 1;
    } else {
      return item;
    }
  }
  return undefined;
}
