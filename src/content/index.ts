import { chromeRuntime } from '../shared/browser-runtime';
import type { RuntimeMessage, WritingStyle } from '../shared/messages';
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
import { isEligibleEditor } from './sensitive-field-policy';
import { WritingSession } from './writing-session';

const runtime = chromeRuntime();
const activation = new ActivationController();
let initialized = false;
let session: WritingSession | undefined;
let renderer: AnnotationRenderer | undefined;
let disposeGeometry: (() => void) | undefined;
let lastEligible: HTMLElement | undefined;
let currentPublish: ((cache: NonNullable<ReturnType<WritingSession['current']>>) => void) | undefined;
let visibilityEpoch = 0;
// Edge-trigger guard for model-status requests: PANEL_CONNECTION_CHANGED(open)
// is replayed by the background on every WRITING_MODEL_STATUS_REQUEST reply,
// so treating it as level-triggered creates an infinite content↔background
// message ping-pong (high CPU / tab-switch freezes).
let panelOpenAnnounced = false;
import type { TargetLanguage } from '../shared/messages';

let settings = {
  activationMode: 'always' as 'always' | 'panel_open' | 'off',
  fullDocumentCharacterLimit: 20_000,
  hasModel: false,
  invocationStrategy: 'batch' as 'batch' | 'parallel',
  maxConcurrency: 3,
  targetLanguage: 'EN' as TargetLanguage,
  writingStyle: 'practical' as WritingStyle,
  replacementFontScale: 0.8,
  replacementTextColor: '#b85000',
  replacementBackgroundColor: '#fff3e680',
};

const send = (message: RuntimeMessage): void => {
  void runtime.messaging.send(message).catch(() => undefined);
};

const stop = (): void => {
  currentPublish = undefined;
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
  if (!initialized || document.hidden || !lastEligible || session || !activation.active() || !lastEligible.isConnected) return;
  const adapter = makeAdapter(lastEligible);
  let publishTimer: number | undefined;
  let publishFrame = 0;
  let queuedCache: NonNullable<ReturnType<WritingSession['current']>> | undefined;
  let activeSession: WritingSession | undefined;
  renderer = new AnnotationRenderer(
    () => send({
      v: 1,
      type: 'OPEN_SIDE_PANEL',
      correlationId: generateUUID(),
      payload: { tabId: -1 },
    }),
    (issueId) => session?.applyIssue(issueId),
  );
  const editorStyle = getComputedStyle(adapter.element);
  renderer.setEditorFontSize(editorStyle.fontSize);
  renderer.setEditorFontFamily(editorStyle.fontFamily);
  renderer.setReplacementAppearance(
    settings.replacementFontScale,
    settings.replacementTextColor,
    settings.replacementBackgroundColor,
  );
  // Cached range geometry keyed by revision+issue set. Range rects are
  // viewport-relative, so scroll/resize must invalidate (see refreshGeometry).
  let lastGeometryKey: string | undefined;
  let lastRects: DOMRect[][] | undefined;

  const publish = (cache: NonNullable<ReturnType<WritingSession['current']>>): void => {
    const currentSession = activeSession;
    if (document.hidden || !renderer || !currentSession || session !== currentSession) return;
    const view = currentSession.viewState();
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
    const issues = currentSession.issues();
    // Geometry (text-model rebuild + per-issue getClientRects) is the most
    // expensive part of publish and is only needed when the visible issue
    // set or the caret-independent document revision changed. Scroll/resize
    // still must re-measure (rects are viewport-relative after filtering),
    // so key on issues + revision and let scroll go through refreshGeometry
    // which bumps a geometry epoch.
    const issuesKey = issues.length === 0
      ? '0'
      : issues.map((issue) => `${issue.issueId}:${issue.start}:${issue.end}`).join('|');
    const geometryKey = `${cache.revision}:${issuesKey}`;
    let rects: DOMRect[][];
    if (geometryKey === lastGeometryKey && lastRects) {
      rects = lastRects;
    } else {
      if (typeof adapter.getRangesGeometry === 'function') {
        try {
          rects = adapter.getRangesGeometry(issues);
        } catch {
          rects = issues.map((issue) => adapter.getRangeGeometry(issue));
        }
      } else {
        rects = issues.map((issue) => adapter.getRangeGeometry(issue));
      }
      lastGeometryKey = geometryKey;
      lastRects = rects;
    }
    const rectById = new Map(issues.map((issue, index) => [issue.issueId, rects[index] ?? []] as const));
    renderer.render(issues, (issue) => rectById.get(issue.issueId) ?? []);
    if (view) send({
      v: 1,
      type: 'EDITOR_STATE_CHANGED',
      correlationId: generateUUID(),
      payload: view,
    });
  };
  const queuePublish = (cache: NonNullable<ReturnType<WritingSession['current']>>): void => {
    queuedCache = cache;
    if (document.hidden) return;
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = window.setTimeout(() => {
      publishTimer = undefined;
      if (publishFrame) return;
      publishFrame = requestAnimationFrame(() => {
        publishFrame = 0;
        const next = queuedCache;
        queuedCache = undefined;
        if (next) publish(next);
      });
    }, 100);
  };
  currentPublish = queuePublish;

  // Cheap caret-only refresh for selection changes that stayed inside the
  // same sentence/paragraph (no analysis impact): reposition the status dot
  // without rebuilding annotations or re-rendering the side panel.
  const refreshDotOnly = (): void => {
    if (document.hidden || !renderer || !session) return;
    const cache = session.current();
    if (!cache) return;
    const status = session.status();
    renderer.updateDot(
      adapter.getCaretGeometry(),
      dotState(
        true,
        settings.hasModel,
        status === 'queued' || status === 'analyzing',
        cache.fullResult?.severity === 'none' ? undefined : cache.fullResult?.severity,
      ),
      adapter.element.getBoundingClientRect(),
    );
  };

  activeSession = new WritingSession(
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
       payload: { schemaVersion: '1', requestId, documentRevision: revision, text, targetLanguage: settings.targetLanguage ?? 'EN', writingStyle: settings.writingStyle },
    }),
    (requestId) => send({
      v: 1,
      type: 'CANCEL_ANALYSIS',
      correlationId: requestId,
      payload: { requestId },
    }),
    queuePublish,
    () => ({
      hasModel: settings.hasModel,
      fullDocumentCharacterLimit: settings.fullDocumentCharacterLimit,
      targetLanguage: settings.targetLanguage ?? 'EN',
      writingStyle: settings.writingStyle,
      invocationStrategy: settings.invocationStrategy,
      maxConcurrency: settings.maxConcurrency,
    }),
    refreshDotOnly,
  );
  session = activeSession;
  activeSession.start();
  activeSession.initializeBaseline();

  let frame = 0;
  const onScroll = (event: Event): void => {
    // Only refresh geometry if scroll occurs on window/document or an ancestor/descendant of the editor
    const target = event.target;
    if (
      target === window ||
      target === document ||
      target === document.documentElement ||
      target === document.body ||
      (target instanceof Node && (adapter.element.contains(target) || target.contains(adapter.element)))
    ) {
      refreshGeometry();
    }
  };
  const refreshGeometry = (): void => {
    if (document.hidden || frame) return;
    // Range rects are viewport-relative: scroll/resize must force re-measure
    // on the next publish even when revision+issues are unchanged.
    lastGeometryKey = undefined;
    lastRects = undefined;
    const epoch = visibilityEpoch;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (document.hidden || epoch !== visibilityEpoch) return;
      const cache = session?.current();
      if (cache) queuePublish(cache);
    });
  };
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(refreshGeometry);
  resizeObserver?.observe(adapter.element);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', refreshGeometry);
  disposeGeometry = () => {
    if (frame) cancelAnimationFrame(frame);
    if (publishTimer) clearTimeout(publishTimer);
    if (publishFrame) cancelAnimationFrame(publishFrame);
    publishTimer = undefined;
    publishFrame = 0;
    queuedCache = undefined;
    lastGeometryKey = undefined;
    lastRects = undefined;
    resizeObserver?.disconnect();
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', refreshGeometry);
  };
};

installEditorDiscovery((element) => {
  if (element === lastEligible && session) {
    const cache = session.current();
    if (cache) currentPublish?.(cache);
    return;
  }
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
      writingStyle?: WritingStyle;
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
      writingStyle: saved?.writingStyle ?? 'practical',
      replacementFontScale: saved?.replacementFontScale ?? 0.8,
      replacementTextColor: saved?.replacementTextColor ?? '#b85000',
      replacementBackgroundColor: saved?.replacementBackgroundColor ?? '#fff3e680',
    };
    initialized = true;
    activation.update(settings.activationMode);
    start();
  })
  .catch(() => {
    initialized = true;
    start();
  });

const requestModelStatus = (): void => {
  send({
    v: 1,
    type: 'WRITING_MODEL_STATUS_REQUEST',
    correlationId: generateUUID(),
    payload: {},
  });
};

requestModelStatus();

document.addEventListener('visibilitychange', () => {
  visibilityEpoch += 1;
  if (document.hidden) {
    session?.pause();
    return;
  }
  session?.resume();
  start();
});

window.addEventListener('pagehide', () => {
  visibilityEpoch += 1;
  session?.pause();
});

window.addEventListener('pageshow', () => {
  if (document.hidden) return;
  session?.resume();
  start();
});

runtime.messaging.onMessage((message) => {
  if (message.type === 'SETTINGS_UPDATED') {
    const previousTargetLanguage = settings.targetLanguage;
    const previousWritingStyle = settings.writingStyle;
    settings = { ...settings, ...message.payload };
    requestModelStatus();
    const action = activation.update(settings.activationMode);
    if (action === 'stop') stop();
    else {
      renderer?.setReplacementAppearance(
        settings.replacementFontScale,
        settings.replacementTextColor,
        settings.replacementBackgroundColor,
      );
        if (
          (message.payload.targetLanguage !== undefined && message.payload.targetLanguage !== previousTargetLanguage) ||
          (message.payload.writingStyle !== undefined && message.payload.writingStyle !== previousWritingStyle)
        ) {
        session?.reanalyzeAll();
      }
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
    if (session?.viewState()?.status === 'error') session.retry();
    else session?.recheckAll();
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
    const open = message.payload.open;
    const action = activation.panel(open);
    if (action === 'stop') stop();
    else if (action === 'start') start();
    if (open) {
      // Only request model status on the false→true edge. The background
      // echoes PANEL_CONNECTION_CHANGED in its WRITING_MODEL_STATUS_REQUEST
      // reply, so requesting on every open=true message would loop forever.
      const edge = !panelOpenAnnounced;
      panelOpenAnnounced = true;
      if (edge) requestModelStatus();
      if (session) {
        const cache = session.current();
        if (cache) currentPublish?.(cache);
      } else {
        const candidate = (lastEligible && lastEligible.isConnected)
          ? lastEligible
          : (document.activeElement instanceof HTMLElement && isEligibleEditor(document.activeElement))
            ? document.activeElement
            : undefined;
        if (candidate) {
          lastEligible = candidate;
          start();
        }
      }
    } else {
      panelOpenAnnounced = false;
    }
  }
});
