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
    const unit = expected.units.find((candidate) =>
      candidate.id === rawUnit.unitId && candidate.revision === rawUnit.unitRevision);
    if (!unit || !Array.isArray(rawUnit.issues)) {
      rejected.push(typeof rawUnit.unitId === 'string' ? rawUnit.unitId : 'unit');
      continue;
    }

    const issues: Issue[] = [];
    const localRanges: Array<{ start: number; end: number }> = [];
    let invalid = false;
    for (const rawIssue of rawUnit.issues) {
      if (!isRecord(rawIssue)) {
        invalid = true;
        break;
      }
      const { start, end, scope } = rawIssue;
      if (
        !scopes.has(scope as string) ||
        !severities.has(rawIssue.severity as string) ||
        !categories.has(rawIssue.category as string) ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        (start as number) < 0 ||
        (end as number) <= (start as number) ||
        (end as number) > unit.text.length ||
        !plainText(rawIssue.original) ||
        !plainText(rawIssue.replacement) ||
        !plainText(rawIssue.reason) ||
        rawIssue.original !== unit.text.slice(start as number, end as number) ||
        rawIssue.original === rawIssue.replacement ||
        (unit.type === 'paragraph' ? scope !== 'paragraph' : scope === 'paragraph') ||
        (scope === unit.type && ((start as number) !== 0 || (end as number) !== unit.text.length))
      ) {
        invalid = true;
        break;
      }

      if (scope === 'local') {
        const wordCount = (rawIssue.original as string).trim().split(/\s+/).length;
        const range = { start: start as number, end: end as number };
        if (
          wordCount > 4 ||
          overlapsProtected(range, protectedSpans(unit.text)) ||
          localRanges.some((other) => range.start < other.end && other.start < range.end)
        ) {
          invalid = true;
          break;
        }
        localRanges.push(range);
      }

      issues.push({
        issueId: `${unit.id}:${unit.revision}:${issues.length}`,
        scope: scope as Issue['scope'],
        severity: rawIssue.severity as Issue['severity'],
        start: start as number,
        end: end as number,
        original: rawIssue.original,
        replacement: rawIssue.replacement,
        reason: rawIssue.reason,
        category: rawIssue.category as Issue['category'],
      });
    }

    if (
      invalid ||
      issues.filter((issue) => issue.scope === 'sentence').length > 1 ||
      issues.filter((issue) => issue.scope === 'paragraph').length > 1
    ) rejected.push(unit.id);
    else valid.push({ unitId: unit.id, issues });
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
