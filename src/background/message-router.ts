import type { ExtensionMessage } from '../shared/messages';
export const contentCommands = new Set<ExtensionMessage['type']>(['APPLY_ISSUE', 'APPLY_ALL', 'PANEL_CONNECTION_CHANGED', 'SETTINGS_UPDATED', 'RETRY_DETECTION']);
export function shouldRouteToContent(message: ExtensionMessage, senderTabId: number | undefined): boolean { return senderTabId === undefined && contentCommands.has(message.type); }
