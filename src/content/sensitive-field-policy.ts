const sensitive = /pass(?:word)?|otp|one.?time|verification|credit.?card|card.?number|cvv|cvc|bank|token|secret/i;
const nonProse = /user(?:name)?|login|handle|code|tag|label|identifier|\bid\b|slug/i;
const excluded = new Set(['password', 'hidden', 'search', 'url', 'email', 'tel', 'number']);
function visible(element: HTMLElement): boolean { const style = getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden') return false; const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }
export function isEligibleEditor(element: Element): boolean {
  if (!(element instanceof HTMLElement) || element.closest('[data-writing-assistant="off"],[data-private]')) return false;
  if (element instanceof HTMLInputElement) { const descriptor = [element.name, element.id, element.autocomplete, element.getAttribute('aria-label')].join(' '); if (excluded.has(element.type || 'text') || element.disabled || element.readOnly || sensitive.test(descriptor) || nonProse.test(descriptor) || !visible(element)) return false; return (element.type === '' || element.type === 'text') && element.value.trim().split(/\s+/).length >= 3; }
  if (element instanceof HTMLTextAreaElement) { const descriptor = [element.name, element.id, element.autocomplete, element.getAttribute('aria-label')].join(' '); return !element.disabled && !element.readOnly && !sensitive.test(descriptor) && !nonProse.test(descriptor) && visible(element); }
  return element.isContentEditable && !sensitive.test([element.id, element.getAttribute('aria-label')].join(' ')) && !nonProse.test([element.id, element.getAttribute('aria-label')].join(' ')) && visible(element);
}
