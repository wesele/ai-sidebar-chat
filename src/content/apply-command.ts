import type { ApplyResultPayload, ExtensionMessage } from '../shared/messages';
import type { WritingSession } from './writing-session';

type ApplyAllCommand = Extract<ExtensionMessage, { type: 'APPLY_ALL' }>['payload'];
type ApplicableSession = Pick<WritingSession, 'current' | 'applyAll'>;

export function applyAllForSession(
  session: ApplicableSession | undefined,
  command: ApplyAllCommand,
): ApplyResultPayload {
  const current = session?.current();
  if (!session || !current || current.editorId !== command.editorId || current.revision !== command.revision) {
    return {
      tabId: command.tabId,
      editorId: command.editorId,
      revision: command.revision,
      scope: command.scope,
      applied: 0,
      skipped: command.expectedCount,
      stale: true,
    };
  }
  return {
    tabId: command.tabId,
    editorId: command.editorId,
    revision: command.revision,
    scope: command.scope,
    ...session.applyAll(command.scope),
    stale: false,
  };
}
