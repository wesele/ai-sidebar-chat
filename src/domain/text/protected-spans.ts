import type { TextRange } from './paragraph-segmenter';
const matcher = /https?:\/\/[^\s,]+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|`[^`]+`/g;
export function protectedSpans(text: string): TextRange[] { return Array.from(text.matchAll(matcher), m => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length })); }
export function overlapsProtected(range: TextRange, spans: TextRange[]): boolean { return spans.some(s => range.start < s.end && s.start < range.end); }
