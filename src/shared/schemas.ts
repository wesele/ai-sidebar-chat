import type { IssueScope, Severity } from '../domain/analysis/issues';
export interface AnalysisUnit { unitId: string; unitRevision: number; unitType: 'sentence' | 'paragraph'; text: string; absoluteStart: number; contextBefore?: string; contextAfter?: string; }
export interface AnalysisRequest { schemaVersion: '1'; requestId: string; documentRevision: number; targetLanguage: 'EN' | 'ES' | 'CN' | string; units: AnalysisUnit[]; }
export interface RawIssue { scope: IssueScope; severity: Severity; start: number; end: number; original: string; replacement: string; reason: string; category: 'spelling' | 'grammar' | 'word_choice' | 'non_english' | 'clarity' | 'style' | 'coherence' | 'tone' | 'other'; }
export interface AnalysisResponse { schemaVersion: '1'; requestId: string; documentRevision: number; units: Array<{ unitId: string; unitRevision: number; issues: RawIssue[] }>; }
export interface FullDocumentRequest { schemaVersion: '1'; requestId: string; documentRevision: number; text: string; targetLanguage?: 'EN' | 'ES' | 'CN' | string; }
export interface FullDocumentResponse { schemaVersion: '1'; requestId: string; documentRevision: number; severity: 'none' | Severity; summary: string; suggestions: Array<{ severity: Severity; title: string; reason: string }>; }
