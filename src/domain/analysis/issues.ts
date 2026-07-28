export type DetectionStatus = 'never' | 'dirty' | 'queued' | 'analyzing' | 'analyzed' | 'stale' | 'error';
export type Severity = 'improvement' | 'problem';
export type IssueScope = 'local' | 'sentence' | 'paragraph';
export interface Issue { issueId: string; scope: IssueScope; severity: Severity; start: number; end: number; original: string; replacement: string; reason: string; category: 'spelling' | 'grammar' | 'word_choice' | 'non_english' | 'clarity' | 'style' | 'coherence' | 'tone' | 'other'; }
export interface FullDocumentResult { severity: 'none' | Severity; summary: string; suggestions: Array<{ severity: Severity; title: string; reason: string }>; }
