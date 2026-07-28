import { isEligibleEditor } from './sensitive-field-policy';

export type EditorListener = (editor: HTMLElement | undefined) => void;

export function installEditorDiscovery(listener: EditorListener): () => void {
  let current: HTMLElement | undefined;

  const select = (editor: HTMLElement | undefined): void => {
    if (editor === current) return;
    current = editor;
    listener(editor);
  };

  const onFocus = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (isEligibleEditor(target)) select(target);
    else if (target.matches('input,textarea,[contenteditable]')) select(undefined);
  };

  const onInput = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLElement && isEligibleEditor(target)) select(target);
  };

  const observer = new MutationObserver(() => {
    if (current && !current.isConnected) select(undefined);
  });

  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('input', onInput, true);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const active = document.activeElement;
  if (active instanceof HTMLElement && isEligibleEditor(active)) select(active);

  return () => {
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('input', onInput, true);
    observer.disconnect();
  };
}
