import { chromeRuntime } from '../shared/browser-runtime';
import type { RuntimeMessage } from '../shared/messages';
import { generateUUID } from '../shared/uuid';
import { ActivationController } from './activation-controller';
import { applyAllForSession } from './apply-command';
import { ContentEditableAdapter } from './adapters/contenteditable-adapter';
import type { EditorAdapter } from './adapters/editor-adapter';
import { resolveAdapter } from './adapters/adapter-registry';
// Site-specific adapters — each self-registers on import (side-effect only)
import './adapters/prosemirror-adapter';
import { TextControlAdapter } from './adapters/text-control-adapter';
import { AnnotationRenderer, dotState } from './annotations/annotation-renderer';
import { installEditorDiscovery } from './editor-discovery';
import { WritingSession } from './writing-session';

const runtime = chromeRuntime();
const activation = new ActivationController();
let initialized = false;
let session: WritingSession | undefined;
let renderer: AnnotationRenderer | undefined;
let disposeGeometry: (() => void) | undefined;
let lastEligible: HTMLElement | undefined;
import type { TargetLanguage } from '../shared/messages';

let settings = {
  activationMode: 'always' as 'always' | 'panel_open' | 'off',
  fullDocumentCharacterLimit: 20_000,
  hasModel: false,
  invocationStrategy: 'batch' as 'batch' | 'parallel',
  maxConcurrency: 3,
  targetLanguage: 'EN' as TargetLanguage,
  replacementFontScale: 0.8,
  replacementTextColor: '#b85000',
  replacementBackgroundColor: '#fff3e6',
};

const send = (message: RuntimeMessage): void => {
  void runtime.messaging.send(message).catch(() => undefined);
};

const stop = (): void => {
  disposeGeometry?.();
  disposeGeometry = undefined;
  session?.stop();
  session = undefined;
  renderer?.clear();
  renderer = undefined;
};

const makeAdapter = (element: HTMLElement): EditorAdapter => {
  const editorId = `editor-${generateUUID()}`;
  // Site-specific adapters take priority (Confluence, Gmail, etc.)
  const siteAdapter = resolveAdapter(element, editorId);
  if (siteAdapter) return siteAdapter;
  // Generic fallback: textarea/input → TextControlAdapter, rest → ContentEditableAdapter
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? new TextControlAdapter(element, editorId)
    : new ContentEditableAdapter(element, editorId);
};

const start = (): void => {
  if (!initialized || !lastEligible || session || !activation.active() || !lastEligible.isConnected) return;
  const adapter = makeAdapter(lastEligible);
  renderer = new AnnotationRenderer(
    () => send({
      v: 1,
      type: 'OPEN_SIDE_PANEL',
      correlationId: generateUUID(),
      payload: { tabId: -1 },
    }),
    (issueId) => session?.applyIssue(issueId),
  );
  renderer.setEditorFontSize(getComputedStyle(adapter.element).fontSize);
  renderer.setReplacementAppearance(
    settings.replacementFontScale,
    settings.replacementTextColor,
    settings.replacementBackgroundColor,
  );

  const publish = (cache: NonNullable<ReturnType<WritingSession['current']>>): void => {
    if (!renderer || !session) return;
    const view = session.viewState();
    renderer.updateDot(
      adapter.getCaretGeometry(),
      dotState(
        true,
        settings.hasModel,
        view?.status === 'queued' || view?.status === 'analyzing',
        cache.fullResult?.severity === 'none' ? undefined : cache.fullResult?.severity,
      ),
      adapter.element.getBoundingClientRect(),
    );
    renderer.render(session.issues(), (issue) => adapter.getRangeGeometry(issue));
    if (view) send({
      v: 1,
      type: 'EDITOR_STATE_CHANGED',
      correlationId: generateUUID(),
      payload: view,
    });
  };

  session = new WritingSession(
    adapter,
    (payload) => send({
      v: 1,
      type: 'ANALYSIS_REQUESTED',
      correlationId: payload.requestId,
      payload,
    }),
    (requestId, revision, text) => send({
      v: 1,
      type: 'FULL_ANALYSIS_REQUESTED',
      correlationId: requestId,
      payload: { schemaVersion: '1', requestId, documentRevision: revision, text, targetLanguage: settings.targetLanguage ?? 'EN' },
    }),
    (requestId) => send({
      v: 1,
      type: 'CANCEL_ANALYSIS',
      correlationId: requestId,
      payload: { requestId },
    }),
    publish,
    () => ({
      hasModel: settings.hasModel,
      fullDocumentCharacterLimit: settings.fullDocumentCharacterLimit,
      targetLanguage: settings.targetLanguage ?? 'EN',
      invocationStrategy: settings.invocationStrategy,
      maxConcurrency: settings.maxConcurrency,
    }),
  );
  session.start();

  let frame = 0;
  const refreshGeometry = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const cache = session?.current();
      if (cache) publish(cache);
    });
  };
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(refreshGeometry);
  resizeObserver?.observe(adapter.element);
  window.addEventListener('scroll', refreshGeometry, true);
  window.addEventListener('resize', refreshGeometry);
  disposeGeometry = () => {
    if (frame) cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    window.removeEventListener('scroll', refreshGeometry, true);
    window.removeEventListener('resize', refreshGeometry);
  };
};

installEditorDiscovery((element) => {
  lastEligible = element;
  stop();
  start();
});

void runtime.storage
  .get<{
    activationMode?: 'always' | 'panel_open' | 'off';
    fullDocumentCharacterLimit?: number;
    invocationStrategy?: 'batch' | 'parallel';
     maxConcurrency?: number;
     targetLanguage?: TargetLanguage;
     replacementFontScale?: number;
     replacementTextColor?: string;
     replacementBackgroundColor?: string;
   }>('writingAssistantSettings')
  .then((saved) => {
    settings = {
      ...settings,
      activationMode: saved?.activationMode ?? 'always',
      fullDocumentCharacterLimit: saved?.fullDocumentCharacterLimit ?? 20_000,
      invocationStrategy: saved?.invocationStrategy ?? 'batch',
      maxConcurrency: saved?.maxConcurrency ?? 3,
      targetLanguage: saved?.targetLanguage ?? 'EN',
      replacementFontScale: saved?.replacementFontScale ?? 0.8,
      replacementTextColor: saved?.replacementTextColor ?? '#b85000',
      replacementBackgroundColor: saved?.replacementBackgroundColor ?? '#fff3e6',
    };
    initialized = true;
    activation.update(settings.activationMode);
    start();
  })
  .catch(() => {
    initialized = true;
    start();
  });

send({
  v: 1,
  type: 'WRITING_MODEL_STATUS_REQUEST',
  correlationId: generateUUID(),
  payload: {},
});

runtime.messaging.onMessage((message) => {
  if (message.type === 'SETTINGS_UPDATED') {
    settings = { ...settings, ...message.payload };
    const action = activation.update(settings.activationMode);
    if (action === 'stop') stop();
    else {
      renderer?.setReplacementAppearance(
        settings.replacementFontScale,
        settings.replacementTextColor,
        settings.replacementBackgroundColor,
      );
      start();
    }
  } else if (message.type === 'WRITING_MODEL_STATUS') {
    settings.hasModel = message.payload.available;
    session?.retry();
  } else if (message.type === 'ANALYSIS_COMPLETED') {
    const result = message.payload;
    if ('units' in result) session?.accept(result);
    else session?.acceptFull(result);
  } else if (message.type === 'ANALYSIS_FAILED') {
    session?.fail(message.payload.requestId, message.payload.code);
    document.querySelector<HTMLElement>('[data-writing-assistant="overlay"]')
      ?.setAttribute('data-analysis-error', message.payload.code);
  } else if (message.type === 'RETRY_DETECTION') {
    session?.retry();
  } else if (message.type === 'REQUEST_FULL_ANALYSIS') {
    session?.requestFullDoc();
  } else if (message.type === 'APPLY_ALL') {
    const result = applyAllForSession(session, message.payload);
    send({
      v: 1,
      type: 'APPLY_RESULT',
      correlationId: message.correlationId,
      payload: result,
    });
  } else if (message.type === 'APPLY_ISSUE') {
    const current = session?.current();
    if (current?.editorId === message.payload.editorId && current.revision === message.payload.revision) {
      session?.applyIssue(message.payload.issueId);
    }
  } else if (message.type === 'PANEL_CONNECTION_CHANGED') {
    const action = activation.panel(message.payload.open);
    if (action === 'stop') stop();
    else if (action === 'start') start();
  }
});
