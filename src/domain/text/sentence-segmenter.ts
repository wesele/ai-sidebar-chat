import type { TextRange } from './paragraph-segmenter';
const abbreviations = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\.$/i;
export interface SentenceSegmenter { segment(text: string): TextRange[]; }
export function segmentSentences(text: string): TextRange[] {
  const ranges: TextRange[] = []; let start = 0;
  for (let i = 0; i < text.length; i += 1) { const c = text[i]; const isEnd = /[.!?。！？]/.test(c) || (c === '…' && text[i + 1] !== '…'); if (!isEnd) continue; const before = text.slice(start, i + 1); if (c === '.' && (abbreviations.test(before) || (/\d$/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')))) continue; let end = i + 1; while (/[")\]”’]/.test(text[end] ?? '')) end += 1; if (end < text.length && !/\s/.test(text[end])) continue; if (text.slice(start, end).trim()) ranges.push({ start, end }); start = end; while (/\s/.test(text[start] ?? '')) start += 1; i = start - 1; }
  if (text.slice(start).trim()) ranges.push({ start, end: text.length }); return ranges;
}
export const defaultSentenceSegmenter: SentenceSegmenter = { segment: segmentSentences };
