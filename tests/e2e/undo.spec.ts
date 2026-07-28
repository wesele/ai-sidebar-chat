import path from 'node:path';
import { test, expect } from '@playwright/test';
test('native range replacement is undoable and preserves contenteditable structure', async ({ page }) => { await page.setContent('<textarea id="t">I recieved it.</textarea><input id="i" value="I recieved it."><div id="e" contenteditable="true"><strong>Keep</strong> <ul><li>I recieved it.</li></ul></div>'); for (const selector of ['#t', '#i', '#e']) { const locator = page.locator(selector); const before = await locator.evaluate(el => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent); await locator.evaluate(el => { if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { el.focus(); el.setSelectionRange(2, 10); } else { const text = el.querySelector('li')!.firstChild!; const range = document.createRange(); range.setStart(text, 2); range.setEnd(text, 10); const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); } document.execCommand('insertText', false, 'X'); }); await locator.press('Control+z'); await expect.poll(() => locator.evaluate(el => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent)).toBe(before); } await expect(page.locator('#e strong')).toHaveText('Keep'); await expect(page.locator('#e li')).toContainText('recieved'); });

test('ContentEditableAdapter applies a rich-text batch in one undo transaction', async ({ page }) => {
  await page.setContent('<div id="e" contenteditable="true"><p><strong>bad</strong> one</p><p><em>bad</em> two</p></div>');
  await page.addScriptTag({
    path: path.resolve('test-results/adapter-harness/contenteditable-adapter.js'),
  });
  const editor = page.locator('#e');
  const before = await editor.innerHTML();
  const result = await editor.evaluate((element) => {
    const Adapter = (globalThis as typeof globalThis & {
      ContentEditableAdapter: new (element: HTMLElement, editorId: string) => {
        replaceRanges(replacements: Array<{ start: number; end: number; original: string; replacement: string }>): {
          applied: number;
          skipped: number;
        };
      };
    }).ContentEditableAdapter;
    const text = element.querySelector('strong')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 1);
    range.collapse(true);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return new Adapter(element as HTMLElement, 'e').replaceRanges([
      { start: 0, end: 3, original: 'bad', replacement: 'good' },
      { start: 9, end: 12, original: 'bad', replacement: 'great' },
    ]);
  });
  expect(result).toEqual({ applied: 2, skipped: 0 });
  await expect(editor.locator('strong')).toHaveText('good');
  await expect(editor.locator('em')).toHaveText('great');
  await editor.press('Control+z');
  await expect.poll(() => editor.innerHTML()).toBe(before);
});
