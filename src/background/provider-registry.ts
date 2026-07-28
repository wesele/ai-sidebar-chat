import type { ProviderConfig } from './transports/openai-transport';
export interface SidebarProvider { id: string; name?: string; baseUrl?: string; apiKey?: string; models?: string[]; apiType?: 'openai' | 'gemini'; }
export interface WritingSelection { providerId?: string; modelId?: string; }

export const DEFAULT_PROVIDERS: SidebarProvider[] = [
  {
    id: 'default-local',
    name: 'Default (Local)',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'sk-ant-api03-xxx',
    models: ['llama3', 'mistral', 'qwen2'],
    apiType: 'openai',
  },
];

export function resolveWritingProvider(state: unknown, selection: WritingSelection): ProviderConfig | undefined {
  const stateObj = state as { providers?: SidebarProvider[] } | undefined;
  if (!stateObj || stateObj.providers === undefined) {
    const provider = DEFAULT_PROVIDERS[0];
    const modelId = provider.models?.includes(selection.modelId ?? '') ? selection.modelId! : provider.models![0]!;
    return { id: provider.id, baseUrl: provider.baseUrl!, apiKey: provider.apiKey!, modelId, kind: provider.apiType === 'gemini' ? 'gemini' : 'openai' };
  }
  const providers = stateObj.providers.filter(p => Boolean(p.id && p.baseUrl && p.apiKey && p.models?.length));
  const provider = providers.find(p => p.id === selection.providerId) ?? providers[0];
  if (!provider) return undefined;
  const modelId = provider.models?.includes(selection.modelId ?? '') ? selection.modelId! : provider.models![0]!;
  return { id: provider.id, baseUrl: provider.baseUrl!, apiKey: provider.apiKey!, modelId, kind: provider.apiType === 'gemini' ? 'gemini' : 'openai' };
}

export function publicProviders(state: unknown): Array<{ id: string; name: string; models: string[] }> {
  const stateObj = state as { providers?: SidebarProvider[] } | undefined;
  if (!stateObj || stateObj.providers === undefined) {
    return DEFAULT_PROVIDERS.map(p => ({ id: p.id, name: p.name ?? p.id, models: p.models ?? [] }));
  }
  return stateObj.providers.filter(p => Boolean(p.id)).map(p => ({ id: p.id, name: p.name ?? p.id, models: p.models ?? [] }));
}
