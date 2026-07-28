import type { DetectionStatus } from './issues';
export function canAnalyze(status: DetectionStatus, text: string, composing: boolean, caretInside: boolean, idleMs: number): boolean { return (status === 'never' || status === 'dirty' || status === 'error') && Boolean(text.trim()) && !composing && (!caretInside || idleMs >= 1500); }
export function canAnalyzeParagraph(status: DetectionStatus, text: string, composing: boolean, completed: boolean): boolean { return (status === 'never' || status === 'dirty' || status === 'error') && Boolean(text.trim()) && !composing && completed; }
