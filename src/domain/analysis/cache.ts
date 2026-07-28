import type { Replacement } from './apply-plan';
import { segmentParagraphs } from '../text/paragraph-segmenter';
import { segmentSentences } from '../text/sentence-segmenter';
import type { DetectionStatus, FullDocumentResult, Issue } from './issues';

export interface SentenceCache {
  id: string;
  revision: number;
  start: number;
  end: number;
  textHash: string;
  status: DetectionStatus;
  analysisRevision?: number;
  localIssues: Issue[];
  sentenceIssue?: Issue;
}

export interface ParagraphCache {
  id: string;
  revision: number;
  start: number;
  end: number;
  textHash: string;
  status: DetectionStatus;
  analysisRevision?: number;
  issue?: Issue;
  sentences: SentenceCache[];
}

export interface DocumentCache {
  editorId: string;
  revision: number;
  textHash: string;
  textLength: number;
  status: DetectionStatus;
  analysisRevision?: number;
  errorReason?: string;
  fullResult?: FullDocumentResult;
  paragraphs: ParagraphCache[];
}

interface DraftRange {
  start: number;
  end: number;
  textHash: string;
}

const hash = (text: string): string => {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }
  return (value >>> 0).toString(36);
};

let nextId = 0;
const id = (prefix: string): string => `${prefix}-${++nextId}`;

function overlap(a: DraftRange, b: DraftRange): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/**
 * Matches each new unit to at most one old unit. Exact content matches are
 * resolved first so insertions cannot steal the identity of unchanged units.
 * Remaining changed units inherit the best overlapping (or same-position)
 * identity, which lets their unchanged children retain their own identities.
 */
function matchOneToOne<T extends DraftRange>(oldUnits: T[], drafts: DraftRange[]): Array<T | undefined> {
  const matches: Array<T | undefined> = Array.from({ length: drafts.length });
  const used = new Set<number>();

  for (let newIndex = 0; newIndex < drafts.length; newIndex += 1) {
    const draft = drafts[newIndex];
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let oldIndex = 0; oldIndex < oldUnits.length; oldIndex += 1) {
      const old = oldUnits[oldIndex];
      if (used.has(oldIndex) || old.textHash !== draft.textHash) continue;
      const distance = Math.abs(old.start - draft.start);
      if (distance < bestDistance) {
        bestIndex = oldIndex;
        bestDistance = distance;
      }
    }
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matches[newIndex] = oldUnits[bestIndex];
    }
  }

  for (let newIndex = 0; newIndex < drafts.length; newIndex += 1) {
    if (matches[newIndex]) continue;
    const draft = drafts[newIndex];
    let bestIndex = -1;
    let bestOverlap = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let oldIndex = 0; oldIndex < oldUnits.length; oldIndex += 1) {
      if (used.has(oldIndex)) continue;
      const old = oldUnits[oldIndex];
      const shared = overlap(old, draft);
      const distance = Math.abs(old.start - draft.start);
      if (shared > bestOverlap || (shared === bestOverlap && shared > 0 && distance < bestDistance)) {
        bestIndex = oldIndex;
        bestOverlap = shared;
        bestDistance = distance;
      }
    }

    // A positional fallback represents an in-place replacement. Exact matches
    // were already consumed, so an insertion before unchanged content cannot
    // take the following unit's identity here.
    if (bestIndex < 0 && newIndex < oldUnits.length && !used.has(newIndex)) {
      bestIndex = newIndex;
    }
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matches[newIndex] = oldUnits[bestIndex];
    }
  }

  return matches;
}

function updateIssueOffset(issue: Issue, delta: number): Issue {
  if (delta === 0) return issue;
  return {
    ...issue,
    start: issue.start + delta,
    end: issue.end + delta,
  };
}

function updateSentences(
  oldSentences: SentenceCache[],
  paragraph: DraftRange,
  paragraphText: string,
  appliedReplacements?: Replacement[],
): SentenceCache[] {
  const drafts = segmentSentences(paragraphText).map((local) => {
    const start = paragraph.start + local.start;
    const end = paragraph.start + local.end;
    return { start, end, textHash: hash(paragraphText.slice(local.start, local.end)) };
  });
  const matches = matchOneToOne(oldSentences, drafts);

  return drafts.map((draft, index) => {
    const previous = matches[index];
    if (!previous) {
      return {
        id: id('s'),
        revision: 1,
        ...draft,
        status: 'dirty' as const,
        localIssues: [],
      };
    }
    if (previous.textHash === draft.textHash) {
      const delta = draft.start - previous.start;
      return {
        ...previous,
        start: draft.start,
        end: draft.end,
        localIssues: previous.localIssues.map((issue) => updateIssueOffset(issue, delta)),
        sentenceIssue: previous.sentenceIssue ? updateIssueOffset(previous.sentenceIssue, delta) : undefined,
      };
    }

    if (appliedReplacements && appliedReplacements.length > 0) {
      const relevant = appliedReplacements.filter(
        (r) => r.start >= previous.start && r.end <= previous.end,
      );
      if (relevant.length > 0) {
        const appliedIssueIds = new Set<string>();
        for (const issue of previous.localIssues) {
          if (relevant.some((r) => r.start === issue.start && r.end === issue.end && r.original === issue.original)) {
            appliedIssueIds.add(issue.issueId);
          }
        }
        if (previous.sentenceIssue && relevant.some((r) => r.start === previous.sentenceIssue!.start && r.end === previous.sentenceIssue!.end && r.original === previous.sentenceIssue!.original)) {
          appliedIssueIds.add(previous.sentenceIssue.issueId);
        }

        if (appliedIssueIds.size > 0) {
          const remainingLocal = previous.localIssues
            .filter((issue) => !appliedIssueIds.has(issue.issueId))
            .map((issue) => {
              const shift = relevant
                .filter((r) => r.end <= issue.start)
                .reduce((acc, r) => acc + (r.replacement.length - (r.end - r.start)), 0);
              const totalDelta = (draft.start - previous.start) + shift;
              return updateIssueOffset(issue, totalDelta);
            });

          const remainingSentence = previous.sentenceIssue && appliedIssueIds.has(previous.sentenceIssue.issueId)
            ? undefined
            : previous.sentenceIssue
              ? updateIssueOffset(previous.sentenceIssue, draft.start - previous.start)
              : undefined;

          return {
            ...previous,
            start: draft.start,
            end: draft.end,
            textHash: draft.textHash,
            revision: previous.revision + 1,
            status: 'analyzed' as const,
            analysisRevision: previous.analysisRevision,
            localIssues: remainingLocal,
            sentenceIssue: remainingSentence,
          };
        }
      }
    }

    return {
      ...previous,
      ...draft,
      revision: previous.revision + 1,
      status: 'dirty' as const,
      analysisRevision: undefined,
      localIssues: [],
      sentenceIssue: undefined,
    };
  });
}

export function createOrUpdateCache(
  previous: DocumentCache | undefined,
  editorId: string,
  text: string,
  appliedReplacements?: Replacement[],
): DocumentCache {
  const paragraphDrafts = segmentParagraphs(text).map((range) => ({
    ...range,
    textHash: hash(text.slice(range.start, range.end)),
  }));
  const oldParagraphs = previous?.paragraphs ?? [];
  const matches = matchOneToOne(oldParagraphs, paragraphDrafts);

  const paragraphs = paragraphDrafts.map((draft, index): ParagraphCache => {
    const previousParagraph = matches[index];
    const paragraphText = text.slice(draft.start, draft.end);
    const sentences = updateSentences(previousParagraph?.sentences ?? [], draft, paragraphText, appliedReplacements);
    if (!previousParagraph) {
      return {
        id: id('p'),
        revision: 1,
        ...draft,
        status: 'dirty',
        sentences,
      };
    }
    if (previousParagraph.textHash === draft.textHash) {
      const delta = draft.start - previousParagraph.start;
      const issue = previousParagraph.issue ? updateIssueOffset(previousParagraph.issue, delta) : undefined;
      return { ...previousParagraph, start: draft.start, end: draft.end, issue, sentences };
    }

    let paragraphIssue = previousParagraph.issue;
    let paragraphStatus = previousParagraph.status;
    if (appliedReplacements && appliedReplacements.length > 0 && previousParagraph.issue) {
      const isApplied = appliedReplacements.some(
        (r) => r.start === previousParagraph.issue!.start && r.end === previousParagraph.issue!.end && r.original === previousParagraph.issue!.original,
      );
      if (isApplied) {
        paragraphIssue = undefined;
        paragraphStatus = 'analyzed';
      }
    }

    const isAllSentencesAnalyzed = sentences.length > 0 && sentences.every((s) => s.status === 'analyzed');
    if (paragraphStatus === 'analyzed' || isAllSentencesAnalyzed) {
      return {
        ...previousParagraph,
        start: draft.start,
        end: draft.end,
        textHash: draft.textHash,
        revision: previousParagraph.revision + 1,
        status: 'analyzed',
        analysisRevision: previousParagraph.analysisRevision,
        issue: paragraphIssue,
        sentences,
      };
    }

    return {
      ...previousParagraph,
      ...draft,
      revision: previousParagraph.revision + 1,
      status: 'dirty',
      analysisRevision: undefined,
      issue: undefined,
      sentences,
    };
  });

  const documentHash = hash(text);
  if (!previous) {
    return {
      editorId,
      revision: 1,
      textHash: documentHash,
      textLength: text.length,
      status: 'dirty',
      paragraphs,
    };
  }
  if (previous.textHash === documentHash) {
    return { ...previous, textLength: text.length, paragraphs };
  }

  const isAnyDirty = paragraphs.some((p) => p.status === 'dirty' || p.sentences.some((s) => s.status === 'dirty'));
  return {
    ...previous,
    revision: previous.revision + 1,
    textHash: documentHash,
    textLength: text.length,
    status: isAnyDirty ? 'dirty' : 'analyzed',
    analysisRevision: isAnyDirty ? undefined : previous.analysisRevision,
    fullResult: isAnyDirty ? undefined : previous.fullResult,
    paragraphs,
  };
}

export function invalidateIntersecting(
  cache: DocumentCache,
  start: number,
  end: number,
): DocumentCache {
  const paragraphs = cache.paragraphs.map((paragraph) => {
    if (end <= paragraph.start || start >= paragraph.end) return paragraph;
    return {
      ...paragraph,
      revision: paragraph.revision + 1,
      status: 'dirty' as const,
      analysisRevision: undefined,
      issue: undefined,
      sentences: paragraph.sentences.map((sentence) => {
        if (end <= sentence.start || start >= sentence.end) return sentence;
        return {
          ...sentence,
          revision: sentence.revision + 1,
          status: 'dirty' as const,
          analysisRevision: undefined,
          localIssues: [],
          sentenceIssue: undefined,
        };
      }),
    };
  });
  return {
    ...cache,
    status: 'dirty',
    analysisRevision: undefined,
    fullResult: undefined,
    paragraphs,
  };
}

export function countIssues(
  cache: DocumentCache,
): Record<'local' | 'sentence' | 'paragraph', number> {
  const result = { local: 0, sentence: 0, paragraph: 0 };
  for (const paragraph of cache.paragraphs) {
    if (paragraph.status === 'analyzed' && paragraph.issue) result.paragraph += 1;
    for (const sentence of paragraph.sentences) {
      if (sentence.status !== 'analyzed') continue;
      result.local += sentence.localIssues.length;
      if (sentence.sentenceIssue) result.sentence += 1;
    }
  }
  return result;
}
