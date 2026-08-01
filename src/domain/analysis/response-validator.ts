import { overlapsProtected, protectedSpans } from '../text/protected-spans';
import type { Issue } from './issues';

export interface ExpectedUnit {
  id: string;
  revision: number;
  type: 'sentence' | 'paragraph';
  text: string;
}

export interface ValidationResult {
  valid: Array<{ unitId: string; issues: Issue[] }>;
  rejected: string[];
}

const categories = new Set([
  'spelling', 'grammar', 'word_choice', 'non_english', 'clarity', 'style',
  'coherence', 'tone', 'other',
]);
const scopes = new Set(['local', 'sentence', 'paragraph']);
const severities = new Set(['improvement', 'problem']);

const plainText = (value: unknown, max = 600): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[<>]/.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Reasoning models often miscount UTF-16 offsets for CJK/full-width spans, so
 * a reported range frequently does not slice to `original` even though the
 * span itself is correct. Locate `original` in the unit text instead, picking
 * the occurrence closest to the reported start. Returns undefined when the
 * original is hallucinated (not present in the text), which stays a rejection.
 */
function findSpan(text: string, original: string, preferredStart: number): { start: number; end: number } | undefined {
  let best: { start: number; end: number } | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = text.indexOf(original);
  while (index !== -1) {
    const distance = Math.abs(index - preferredStart);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { start: index, end: index + original.length };
    }
    index = text.indexOf(original, index + 1);
  }
  return best;
}

export function validateResponse(
  response: unknown,
  expected: { requestId: string; documentRevision: number; units: ExpectedUnit[] },
): ValidationResult {
  const valid: ValidationResult['valid'] = [];
  const rejected: string[] = [];
  if (!isRecord(response)) return { valid, rejected: ['response'] };
  if (
    response.schemaVersion !== '1' ||
    response.requestId !== expected.requestId ||
    response.documentRevision !== expected.documentRevision ||
    !Array.isArray(response.units)
  ) return { valid, rejected: ['response'] };

  for (const rawUnit of response.units) {
    if (!isRecord(rawUnit)) {
      rejected.push('unit');
      continue;
    }
    const unit = expected.units.find((candidate) => candidate.id === rawUnit.unitId);
    // Units are matched by id only: reasoning models routinely echo the
    // schema-example revision (1) instead of the requested unitRevision, and
    // staleness is already enforced at the request level (requestId +
    // pending/cache revision) in the session.
    if (!unit || !Array.isArray(rawUnit.issues)) {
      rejected.push(typeof rawUnit.unitId === 'string' ? rawUnit.unitId : 'unit');
      continue;
    }

    const issues: Issue[] = [];
    const localRanges: Array<{ start: number; end: number }> = [];
    for (const rawIssue of rawUnit.issues) {
      if (!isRecord(rawIssue)) continue;
      const { scope } = rawIssue;
      const rawStart = rawIssue.start;
      const rawEnd = rawIssue.end;
      const category = typeof rawIssue.category === 'string' && categories.has(rawIssue.category)
        ? rawIssue.category
        : 'other';
      if (
        !scopes.has(scope as string) ||
        !severities.has(rawIssue.severity as string) ||
        !plainText(rawIssue.original) ||
        !plainText(rawIssue.replacement) ||
        !plainText(rawIssue.reason) ||
        rawIssue.original === rawIssue.replacement ||
        (unit.type === 'paragraph' ? scope !== 'paragraph' : scope === 'paragraph')
      ) continue;

      // Repair model-miscounted UTF-16 offsets before validating. Sentence/
      // paragraph scope must span the whole unit; local scope is re-located in
      // the unit text. A sentence-scope finding that only covers an embedded
      // non-English clause is downgraded to a local issue. Unrepairable
      // (hallucinated) originals are isolated and dropped.
      let start: number;
      let end: number;
      let effectiveScope = scope as string;
      const exact =
        Number.isInteger(rawStart) &&
        Number.isInteger(rawEnd) &&
        (rawStart as number) >= 0 &&
        (rawEnd as number) <= unit.text.length &&
        rawIssue.original === unit.text.slice(rawStart as number, rawEnd as number);
      if (exact) {
        start = rawStart as number;
        end = rawEnd as number;
      } else if (scope === unit.type) {
        if (rawIssue.original === unit.text) {
          start = 0;
          end = unit.text.length;
        } else if (unit.type === 'sentence') {
          const found = findSpan(unit.text, rawIssue.original, Number.isInteger(rawStart) ? (rawStart as number) : -1);
          if (!found) continue;
          start = found.start;
          end = found.end;
          effectiveScope = 'local';
        } else {
          continue;
        }
      } else {
        const found = findSpan(unit.text, rawIssue.original, Number.isInteger(rawStart) ? (rawStart as number) : -1);
        if (!found) continue;
        start = found.start;
        end = found.end;
      }

      if (start < 0 || end <= start || end > unit.text.length) continue;

      if (effectiveScope === 'local') {
        const wordCount = (rawIssue.original as string).trim().split(/\s+/).length;
        const range = { start, end };
        if (
          wordCount > 4 ||
          overlapsProtected(range, protectedSpans(unit.text)) ||
          localRanges.some((other) => range.start < other.end && other.start < range.end)
        ) continue;
        localRanges.push(range);
      }

      issues.push({
        issueId: `${unit.id}:${unit.revision}:${issues.length}`,
        scope: effectiveScope as Issue['scope'],
        severity: rawIssue.severity as Issue['severity'],
        start,
        end,
        original: rawIssue.original,
        replacement: rawIssue.replacement,
        reason: rawIssue.reason,
        category: category as Issue['category'],
      });
    }

    // Per Spec 7.5, invalid single items are isolated and dropped. A unit that
    // yields no valid issues is accepted as "analyzed, no findings" rather
    // than rejected: paragraph units routinely echo sentence-level findings
    // with "local" scope (which belong to the sentence analysis), and clean
    // sentences can yield no-op issues, so rejecting those units would surface
    // a spurious document-level failure. Only the first full-range
    // sentence/paragraph rewrite is kept per unit.
    const firstSentence = issues.find((issue) => issue.scope === 'sentence');
    const firstParagraph = issues.find((issue) => issue.scope === 'paragraph');
    const kept = issues.filter(
      (issue) =>
        issue.scope !== 'sentence' || issue === firstSentence,
    ).filter(
      (issue) =>
        issue.scope !== 'paragraph' || issue === firstParagraph,
    );
    valid.push({ unitId: unit.id, issues: kept });
  }
  return { valid, rejected };
}

export function validateFullDocumentResponse(
  value: unknown,
  expected: { requestId: string; documentRevision: number },
): {
  severity: 'none' | 'improvement' | 'problem';
  summary: string;
  suggestions: Array<{
    severity: 'improvement' | 'problem';
    title: string;
    reason: string;
  }>;
} | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.schemaVersion !== '1' ||
    value.requestId !== expected.requestId ||
    value.documentRevision !== expected.documentRevision ||
    !['none', 'improvement', 'problem'].includes(value.severity as string) ||
    !plainText(value.summary, 2_000) ||
    !Array.isArray(value.suggestions) ||
    value.suggestions.length > 20 ||
    'replacement' in value
  ) return undefined;

  const suggestions: Array<{
    severity: 'improvement' | 'problem';
    title: string;
    reason: string;
  }> = [];
  for (const rawSuggestion of value.suggestions) {
    if (!isRecord(rawSuggestion)) return undefined;
    if (
      !['improvement', 'problem'].includes(rawSuggestion.severity as string) ||
      !plainText(rawSuggestion.title) ||
      !plainText(rawSuggestion.reason)
    ) return undefined;
    suggestions.push({
      severity: rawSuggestion.severity as 'improvement' | 'problem',
      title: rawSuggestion.title,
      reason: rawSuggestion.reason,
    });
  }
  return {
    severity: value.severity as 'none' | 'improvement' | 'problem',
    summary: value.summary,
    suggestions,
  };
}
