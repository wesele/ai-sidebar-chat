import type { AnalysisRequest, FullDocumentRequest } from '../shared/schemas';

export function unitAnalysisPrompt(request: AnalysisRequest): string {
  return `Analyze only the target units as an English writing tutor. Context is read-only.
Return JSON only with schemaVersion "1", the same requestId/documentRevision, and one result per unit:
{"schemaVersion":"1","requestId":"...","documentRevision":1,"units":[{"unitId":"...","unitRevision":1,"issues":[{"scope":"local|sentence|paragraph","severity":"improvement|problem","start":0,"end":1,"original":"...","replacement":"...","reason":"...","category":"spelling|grammar|word_choice|non_english|clarity|style|coherence|tone|other"}]}]}.
Offsets are UTF-16 and relative to the unit. Sentence units may return local issues and at most one full-range sentence issue. Paragraph units may return at most one full-range paragraph issue only if there is a genuine paragraph-level structural flaw across sentences (do not flag paragraph issues on single-sentence or problem-free paragraphs).
Use "local" scope for localized errors on short text spans (1-4 words), including typos, spelling, redundant or missing prepositions/articles, local grammar, and word choice fixes (e.g., "dont" -> "don't", "in next" -> "next"). Reserve "sentence" scope strictly for major clause restructures or full-sentence rewrites that affect the sentence structure as a whole.
Never flag or alter URLs, email, code, variables, or proper-name protected spans. Preserve meaning, facts, tone, and formatting. A short non-English phrase can be local; a complete non-English sentence is a sentence issue. Every replacement must be non-empty, plain text, and differ from original. Reasons must be brief and educational.
REQUEST:\n${JSON.stringify(request)}`;
}

export function fullAnalysisPrompt(request: FullDocumentRequest): string {
  return `Review this English document only for tone consistency, overall coherence, obvious repetition, contradiction, and clarity of purpose. Do not return rewritten document text.
Return JSON only: {"schemaVersion":"1","requestId":"...","documentRevision":1,"severity":"none|improvement|problem","summary":"...","suggestions":[{"severity":"improvement|problem","title":"...","reason":"..."}]} using the same requestId and documentRevision. All fields must be concise plain text.
REQUEST:\n${JSON.stringify(request)}`;
}
