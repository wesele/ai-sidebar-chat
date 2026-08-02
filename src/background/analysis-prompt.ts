import type { AnalysisRequest, FullDocumentRequest } from '../shared/schemas';

export function getLanguageName(uiLanguage?: string): string {
  const lang = (uiLanguage || 'zh-CN').toLowerCase();
  if (lang.startsWith('zh')) return 'Chinese';
  if (lang.startsWith('es')) return 'Spanish';
  if (lang.startsWith('en')) return 'English';
  if (lang.startsWith('fr')) return 'French';
  if (lang.startsWith('de')) return 'German';
  if (lang.startsWith('ja')) return 'Japanese';
  if (lang.startsWith('ko')) return 'Korean';
  return uiLanguage || 'Chinese';
}

export function getTargetLanguageName(targetLang?: string): string {
  const lang = (targetLang || 'EN').toUpperCase();
  if (lang === 'ES') return 'Spanish';
  if (lang === 'CN' || lang === 'ZH') return 'Chinese';
  return 'English';
}

export function unitAnalysisPrompt(request: AnalysisRequest, uiLanguage?: string, useTool?: boolean): string {
  const langName = getLanguageName(uiLanguage);
  const targetLangName = getTargetLanguageName(request.targetLanguage);
  const returnInstruction = useTool
    ? `Return one JSON object matching the constrained schema with schemaVersion "1", the same requestId/documentRevision, and one flat "issues" array covering all units.`
    : `Return JSON only: {"schemaVersion":"1","requestId":"...","documentRevision":1,"issues":[{"unitId":"...","original":"...","replacement":"...","reason":"...","category":"spelling|grammar|word_choice|non_english|clarity|style|coherence|tone|other"}]}.`;
  return `Analyze only the target units as a ${targetLangName} writing tutor. Context is read-only.
${returnInstruction}
The response envelope is not an example: copy schemaVersion, requestId, and documentRevision exactly from REQUEST. Never default documentRevision to 1.
For every issue you report:
- "unitId" must be the exact unitId of the unit the error is in, copied from the request.
- "original" must be the exact substring copied character-for-character from the unit text — the precise span that is wrong. It must exist verbatim in the text.
- "replacement" must be non-empty, plain text, and differ from original.
- "reason" must be brief and educational, written in ${langName}.
Do NOT return character offsets, scopes, or severity — the client derives those.
Never flag or alter URLs, email, code, variables, or proper-name protected spans. Preserve meaning, facts, tone, and formatting. A short non-${targetLangName} phrase can be an issue; a complete non-${targetLangName} sentence is also an issue. For every issue with category "non_english", "replacement" must translate the exact "original" span into ${targetLangName}; do not repeat, transliterate, or explain the original instead of translating it. For a complete non-${targetLangName} sentence, copy the entire sentence as "original" and provide its full ${targetLangName} translation as "replacement".
REQUEST:
${JSON.stringify(request)}
This is a short request: do not restate these instructions or write a long analysis. Think briefly, then output the JSON result immediately.`;
}

export function fullAnalysisPrompt(request: FullDocumentRequest, uiLanguage?: string, useTool?: boolean): string {
  const langName = getLanguageName(uiLanguage);
  const targetLangName = getTargetLanguageName(request.targetLanguage);
  const returnInstruction = useTool
    ? `Return one JSON object matching the constrained schema using the same requestId and documentRevision.`
    : `Return JSON only: {"schemaVersion":"1","requestId":"...","documentRevision":1,"severity":"none|improvement|problem","summary":"one short sentence or empty when severity is none","suggestions":[{"severity":"improvement|problem","title":"short actionable recommendation","reason":"brief impact or change needed"}]} using the same requestId and documentRevision. All fields must be concise plain text.`;
  return `Review this ${targetLangName} document at the macro level only. Return only important, actionable suggestions. Focus exclusively on:
1. Writing intent — is the overall purpose of the document clear and consistent?
2. Overall fluency — does the text read naturally as a whole (not sentence-by-sentence grammar)?
3. Logical coherence — do the ideas flow logically? Are there structural contradictions or missing transitions between major sections?

Do NOT flag: grammar errors, spelling, word choice, punctuation, repetition of phrases, or any issue that can be caught at the sentence level. Do not return rewritten document text.
Do not give general praise, a score, or an explanation merely to justify the evaluation. If there is no significant document-level problem, return severity "none" with an empty summary and suggestions array. Return at most 3 suggestions, ranked by importance. Each suggestion must be a concrete recommendation that materially improves the document; omit minor or subjective preferences. Keep each title short and actionable. Keep each reason to one short sentence explaining the impact or the needed change, not repeating the evaluation. Write all summaries, suggestion titles, and reasons in ${langName}.
${returnInstruction}
Copy schemaVersion, requestId, and documentRevision exactly from REQUEST; they are not example values.
REQUEST:
${JSON.stringify(request)}`;
}
