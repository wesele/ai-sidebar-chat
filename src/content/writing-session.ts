import { countIssues, createOrUpdateCache, type DocumentCache } from '../domain/analysis/cache';
import { canAnalyze, canAnalyzeParagraph } from '../domain/analysis/eligibility';
import type { DetectionStatus, Issue } from '../domain/analysis/issues';
import { validateFullDocumentResponse, validateResponse } from '../domain/analysis/response-validator';
import type { AnalysisRequest, AnalysisResponse, FullDocumentResponse } from '../shared/schemas';
import { generateUUID } from '../shared/uuid';
import type { EditorAdapter } from './adapters/editor-adapter';

export interface WritingSettings {
  hasModel: boolean;
  fullDocumentCharacterLimit: number;
}

type PendingRequest =
  | { kind: 'units'; revision: number; remaining: Set<string> }
  | { kind: 'full'; revision: number };

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
  private composing = false;
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
  ) {}

  start(): void {
    this.onInput();
    this.unsubscribe = this.adapter.observe(this.onInput);
    this.adapter.element.addEventListener('compositionstart', this.onCompositionStart);
    this.adapter.element.addEventListener('compositionend', this.onCompositionEnd);
    this.adapter.element.addEventListener('focusout', this.onFocusOut);
    document.addEventListener('selectionchange', this.onSelectionChange);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.unsubscribe?.();
    this.adapter.element.removeEventListener('compositionstart', this.onCompositionStart);
    this.adapter.element.removeEventListener('compositionend', this.onCompositionEnd);
    this.adapter.element.removeEventListener('focusout', this.onFocusOut);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    this.cancelPending();
  }

  current(): DocumentCache | undefined {
    return this.cache;
  }

  retry(): void {
    if (this.cache) {
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
    if (this.composing || !this.cache) return;
    const previousSentenceId = this.lastSentenceId;
    const previousParagraphId = this.lastParagraphId;
    const snapshot = this.adapter.readSnapshot();
    const current = this.unitsAt(snapshot.selection?.start ?? -1);
    this.lastSentenceId = current.sentenceId;
    this.lastParagraphId = current.paragraphId;

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
      }
    } else if (previousSentenceId && previousSentenceId !== current.sentenceId) {
      const prevParagraph = this.cache.paragraphs.find((p) => p.id === this.lastParagraphId);
      const prevSentence = prevParagraph?.sentences.find((s) => s.id === previousSentenceId);
      if (prevSentence?.status === 'dirty') {
        this.dispatch(false);
      }
    }
    this.publish(this.cache);
  };

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
    if (this.composing) return;
    this.cancelPending();
    const previousParagraph = this.lastParagraphId;
    const snapshot = this.adapter.readSnapshot();
    this.lastInputAt = Date.now();
    const isApplying = Boolean(this.lastAppliedReplacements?.length);
    this.cache = createOrUpdateCache(this.cache, snapshot.editorId, snapshot.text, this.lastAppliedReplacements);
    const current = this.unitsAt(snapshot.selection?.start ?? -1);
    this.lastSentenceId = current.sentenceId;
    this.lastParagraphId = current.paragraphId;
    this.publish(this.cache);

    if (previousParagraph && previousParagraph !== current.paragraphId) {
      this.leaveParagraph(previousParagraph);
    }
    if (this.timer) clearTimeout(this.timer);
    if (!isApplying) {
      this.timer = window.setTimeout(() => this.dispatch(false), 1500);
    }
  };

  private unitsAt(offset: number): { paragraphId?: string; sentenceId?: string } {
    const paragraph = this.cache?.paragraphs.find((item) => item.start <= offset && offset <= item.end);
    const sentence = paragraph?.sentences.find((item) => item.start <= offset && offset <= item.end);
    return { paragraphId: paragraph?.id, sentenceId: sentence?.id };
  }

  leaveParagraph(completedParagraphId = this.lastParagraphId): void {
    const snapshot = this.adapter.readSnapshot();
    const hasPendingFull = Array.from(this.pending.values()).some(
      (p) => p.kind === 'full' && p.revision === this.cache?.revision,
    );
    const isFullAnalyzed =
      this.cache?.analysisRevision === this.cache?.revision && this.cache?.fullResult !== undefined;

    if (
      this.cache &&
      this.cache.status === 'dirty' &&
      !isFullAnalyzed &&
      !hasPendingFull &&
      this.settings().hasModel &&
      Boolean(snapshot.text.trim()) &&
      snapshot.text.length <= this.settings().fullDocumentCharacterLimit
    ) {
      const requestId = generateUUID();
      this.pending.set(requestId, { kind: 'full', revision: this.cache.revision });
      this.publish(this.cache);
      this.requestFull(requestId, this.cache.revision, snapshot.text);
    } else if (this.cache && snapshot.text.length > this.settings().fullDocumentCharacterLimit) {
      this.cache.status = 'error';
      this.publish(this.cache);
    }
    this.dispatch(true, completedParagraphId);
  }

  private dispatch(paragraphComplete: boolean, completedParagraphId?: string): void {
    const snapshot = this.adapter.readSnapshot();
    if (!this.cache || !this.settings().hasModel) return;
    const units: AnalysisRequest['units'] = [];

    for (const paragraph of this.cache.paragraphs) {
      for (const sentence of paragraph.sentences) {
        const inside =
          snapshot.selection !== null &&
          snapshot.selection.start >= sentence.start &&
          snapshot.selection.start <= sentence.end;
        const sentenceText = snapshot.text.slice(sentence.start, sentence.end);
        if (canAnalyze(sentence.status, sentenceText, this.composing, inside, Date.now() - this.lastInputAt)) {
          sentence.status = 'queued';
          const sentenceIndex = paragraph.sentences.indexOf(sentence);
          const before = snapshot.text.slice(paragraph.start, sentence.start).trim() || this.previousSentenceText(paragraph, sentenceIndex, snapshot.text);
          const after = snapshot.text.slice(sentence.end, paragraph.end).trim() || this.nextSentenceText(paragraph, sentenceIndex, snapshot.text);
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

      const isCompletedTarget = paragraphComplete &&
        (completedParagraphId === undefined || paragraph.id === completedParagraphId);
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
          ...(before ? { contextBefore: snapshot.text.slice(before.start, before.end) } : {}),
          ...(after ? { contextAfter: snapshot.text.slice(after.start, after.end) } : {}),
        });
      }
    }

    if (!units.length) return;
    const requestId = generateUUID();
    this.pending.set(requestId, {
      kind: 'units',
      revision: this.cache.revision,
      remaining: new Set(units.map((unit) => unit.unitId)),
    });
    this.publish(this.cache);
    this.request({
      schemaVersion: '1',
      requestId,
      documentRevision: this.cache.revision,
      targetLanguage: 'en',
      units,
    });
  }

  private previousSentenceText(paragraph: DocumentCache['paragraphs'][number], index: number, text: string): string | undefined {
    const local = paragraph.sentences[index - 1];
    if (local) return text.slice(local.start, local.end);
    const previous = this.cache?.paragraphs[this.cache.paragraphs.indexOf(paragraph) - 1];
    const sentence = previous?.sentences.at(-1);
    return sentence ? text.slice(sentence.start, sentence.end) : undefined;
  }

  private nextSentenceText(paragraph: DocumentCache['paragraphs'][number], index: number, text: string): string | undefined {
    const local = paragraph.sentences[index + 1];
    if (local) return text.slice(local.start, local.end);
    const next = this.cache?.paragraphs[this.cache.paragraphs.indexOf(paragraph) + 1];
    const sentence = next?.sentences[0];
    return sentence ? text.slice(sentence.start, sentence.end) : undefined;
  }

  accept(response: AnalysisResponse): void {
    const pending = this.pending.get(response.requestId);
    if (
      !this.cache ||
      !pending ||
      pending.kind !== 'units' ||
      pending.revision !== this.cache.revision ||
      response.documentRevision !== this.cache.revision
    ) return;

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

    for (const rejectedId of validated.rejected) {
      if (rejectedId === 'response' || rejectedId === 'unit') continue;
      for (const paragraph of this.cache.paragraphs) {
        if (paragraph.id === rejectedId && paragraph.status === 'queued') paragraph.status = 'error';
        const sentence = paragraph.sentences.find((item) => item.id === rejectedId);
        if (sentence?.status === 'queued') sentence.status = 'error';
      }
    }

    for (const unit of validated.valid) {
      for (const paragraph of this.cache.paragraphs) {
        const sentence = paragraph.sentences.find((item) => item.id === unit.unitId);
        const base = sentence?.start ?? (paragraph.id === unit.unitId ? paragraph.start : 0);
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
        }
        if (paragraph.id === unit.unitId) {
          paragraph.issue = issues[0];
          paragraph.status = 'analyzed';
          paragraph.analysisRevision = this.cache.revision;
        }
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

    for (const unit of response.units) pending.remaining.delete(unit.unitId);
    if (pending.remaining.size === 0) this.pending.delete(response.requestId);
    this.publish(this.cache);
  }

  acceptFull(result: FullDocumentResponse): void {
    const pending = this.pending.get(result.requestId);
    if (
      !this.cache ||
      !pending ||
      pending.kind !== 'full' ||
      pending.revision !== this.cache.revision ||
      result.documentRevision !== this.cache.revision
    ) return;
    const valid = validateFullDocumentResponse(result, {
      requestId: result.requestId,
      documentRevision: this.cache.revision,
    });
    if (!valid) return;
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
    const caret = this.adapter.readSnapshot().selection?.start ?? -1;
    const issues = this.issues();
    const item = (scope: 'sentence' | 'paragraph') =>
      issues.find((issue) => issue.scope === scope && issue.start <= caret && caret <= issue.end);
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
      batchPreviews: {
        local: issues.filter((issue) => issue.scope === 'local').map(projectPreview),
        sentence: issues.filter((issue) => issue.scope === 'sentence').map(projectPreview),
        paragraph: issues.filter((issue) => issue.scope === 'paragraph').map(projectPreview),
      },
      currentSentence: project(item('sentence')),
      currentParagraph: project(item('paragraph')),
      fullResult: this.cache.fullResult && {
        severity: this.cache.fullResult.severity,
        summary: this.cache.fullResult.summary,
        suggestions: this.cache.fullResult.suggestions,
      },
      longText: this.cache.textLength > this.settings().fullDocumentCharacterLimit,
      noModel: !this.settings().hasModel,
      errorReason: this.cache.errorReason,
    };
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
