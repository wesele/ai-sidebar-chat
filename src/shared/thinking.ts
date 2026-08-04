export type ThinkingMode = 'default' | 'auto-off';
export type ThinkingApiType = 'openai' | 'gemini';

export type ThinkingRequestPatch = {
  reasoning?: { effort: string };
  reasoning_effort?: string;
  thinking?: { type: 'disabled' };
  chat_template_kwargs?: { enable_thinking: boolean };
  generationConfig?: { thinkingConfig: { thinkingBudget?: number; thinkingLevel?: string } };
};

export function applyThinkingRequestPatch(target: Record<string, unknown>, patch: ThinkingRequestPatch): void {
  if (patch.reasoning !== undefined) target.reasoning = patch.reasoning;
  if (patch.reasoning_effort !== undefined) target.reasoning_effort = patch.reasoning_effort;
  if (patch.thinking !== undefined) target.thinking = patch.thinking;
  if (patch.chat_template_kwargs !== undefined) target.chat_template_kwargs = patch.chat_template_kwargs;
  if (patch.generationConfig !== undefined) {
    const current = target.generationConfig;
    target.generationConfig = {
      ...(current && typeof current === 'object' ? current as Record<string, unknown> : {}),
      ...patch.generationConfig,
    };
  }
}

export function normalizeThinkingMode(mode: unknown, legacyDisableThinking?: boolean): ThinkingMode {
  if (mode === 'auto-off' || mode === 'openai-off' || mode === 'deepseek-off' || mode === 'gemini-off' || mode === 'nvidia-off') {
    return 'auto-off';
  }
  if (mode === 'default') return 'default';
  return legacyDisableThinking === false ? 'default' : 'auto-off';
}

export function getOpenAIThinkingPatch(modelId: string): ThinkingRequestPatch {
  const id = String(modelId || '').toLowerCase();
  if (/qwen/.test(id) || /nemotron|nvidia/.test(id)) {
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  if (/deepseek/.test(id)) return { thinking: { type: 'disabled' } };
  if (/^gpt-5\.[1-9]\d*(?:[-.]|$)/.test(id)) return { reasoning: { effort: 'none' } };
  if (/^gpt-5-pro(?:[-.]|$)/.test(id)) return { reasoning_effort: 'high' };
  if (/^gpt-5(?:[-.]|$)/.test(id)) return { reasoning_effort: 'minimal' };
  if (/^o[134](?:[-.]|$)/.test(id)) return { reasoning_effort: 'low' };
  return {};
}

export function getGeminiThinkingPatch(modelId: string): ThinkingRequestPatch {
  const id = String(modelId || '').toLowerCase();
  if (/^gemini-3(?:\.|-|$)/.test(id)) {
    return { generationConfig: { thinkingConfig: { thinkingLevel: id.includes('pro') ? 'low' : 'minimal' } } };
  }
  if (/^gemini-2\.5(?:\.|-|$)/.test(id)) {
    return { generationConfig: { thinkingConfig: { thinkingBudget: id.includes('pro') ? 128 : 0 } } };
  }
  return { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } };
}

export function getThinkingRequestPatch(apiType: ThinkingApiType, modelId: string, mode: ThinkingMode): ThinkingRequestPatch {
  if (mode !== 'auto-off') return {};
  return apiType === 'gemini' ? getGeminiThinkingPatch(modelId) : getOpenAIThinkingPatch(modelId);
}
