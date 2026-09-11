import { describe, expect, it } from 'vitest';
import {
  applyThinkingRequestPatch,
  getThinkingRequestPatch,
  normalizeThinkingMode,
} from '../../src/shared/thinking';

describe('thinking utilities and parameter types', () => {
  describe('normalizeThinkingMode', () => {
    it('normalizes legacy and modern thinking mode values', () => {
      expect(normalizeThinkingMode('auto-off')).toBe('auto-off');
      expect(normalizeThinkingMode('openai-off')).toBe('auto-off');
      expect(normalizeThinkingMode('deepseek-off')).toBe('auto-off');
      expect(normalizeThinkingMode('default')).toBe('default');
      expect(normalizeThinkingMode(undefined, true)).toBe('auto-off');
      expect(normalizeThinkingMode(undefined, false)).toBe('default');
    });
  });

  describe('getThinkingRequestPatch with thinkingType', () => {
    it('returns empty patch when mode is default regardless of thinkingType', () => {
      expect(getThinkingRequestPatch('openai', 'deepseek-chat', 'default', 'deepseek')).toEqual({});
      expect(getThinkingRequestPatch('openai', 'qwen-turbo', 'default', 'qwen')).toEqual({});
      expect(getThinkingRequestPatch('openai', 'gpt-5', 'default', 'openai')).toEqual({});
      expect(getThinkingRequestPatch('gemini', 'gemini-2.5-flash', 'default', 'gemini')).toEqual({});
    });

    it('returns empty patch when thinkingType is none', () => {
      expect(getThinkingRequestPatch('openai', 'deepseek-r1', 'auto-off', 'none')).toEqual({});
      expect(getThinkingRequestPatch('openai', 'qwen-max', 'auto-off', 'none')).toEqual({});
      expect(getThinkingRequestPatch('gemini', 'gemini-2.5-flash', 'auto-off', 'none')).toEqual({});
    });

    it('returns deepseek patch when thinkingType is deepseek even if model name does not match regex', () => {
      expect(getThinkingRequestPatch('openai', 'custom-model', 'auto-off', 'deepseek')).toEqual({
        thinking: { type: 'disabled' },
      });
    });

    it('returns qwen patch when thinkingType is qwen even if model name does not match regex', () => {
      expect(getThinkingRequestPatch('openai', 'my-proxy-model', 'auto-off', 'qwen')).toEqual({
        chat_template_kwargs: { enable_thinking: false },
      });
    });

    it('returns gemini patch when thinkingType is gemini', () => {
      const patch = getThinkingRequestPatch('gemini', 'gemini-2.5-flash', 'auto-off', 'gemini');
      expect(patch.generationConfig?.thinkingConfig).toBeDefined();
    });

    it('returns openai reasoning patch when thinkingType is openai', () => {
      const patchKnown = getThinkingRequestPatch('openai', 'o3-mini', 'auto-off', 'openai');
      expect(patchKnown.reasoning_effort).toBe('low');

      const patchUnknown = getThinkingRequestPatch('openai', 'custom-llm', 'auto-off', 'openai');
      expect(patchUnknown.reasoning).toEqual({ effort: 'none' });
    });

    it('defaults to auto detection when thinkingType is auto or omitted', () => {
      expect(getThinkingRequestPatch('openai', 'deepseek-r1', 'auto-off', 'auto')).toEqual({
        thinking: { type: 'disabled' },
      });
      expect(getThinkingRequestPatch('openai', 'deepseek-r1', 'auto-off')).toEqual({
        thinking: { type: 'disabled' },
      });
      expect(getThinkingRequestPatch('openai', 'qwen-72b', 'auto-off', 'auto')).toEqual({
        chat_template_kwargs: { enable_thinking: false },
      });
      expect(getThinkingRequestPatch('openai', 'gpt-5.2', 'auto-off', 'auto')).toEqual({
        reasoning: { effort: 'none' },
      });
      expect(getThinkingRequestPatch('openai', 'generic-llama', 'auto-off', 'auto')).toEqual({});
    });
  });

  describe('applyThinkingRequestPatch', () => {
    it('applies patches correctly to a target request body', () => {
      const target: Record<string, unknown> = { model: 'test' };
      applyThinkingRequestPatch(target, { thinking: { type: 'disabled' } });
      expect(target.thinking).toEqual({ type: 'disabled' });

      applyThinkingRequestPatch(target, { chat_template_kwargs: { enable_thinking: false } });
      expect(target.chat_template_kwargs).toEqual({ enable_thinking: false });

      applyThinkingRequestPatch(target, {
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
      });
      expect(target.generationConfig).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
    });
  });
});
