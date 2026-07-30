/**
 * E2E tests for ProseMirrorAdapter on a mock Confluence-style editor.
 *
 * These tests load the adapter IIFE bundle into the page and exercise:
 *  1. isConfluenceEditorElement — DOM signal detection
 *  2. resolveProseMirrorRoot   — root resolution from a child element
 *  3. replaceRanges            — single fix + batch fix + undo
 *  4. Negative case            — plain contenteditable is NOT matched
 *
 * Note: The ProseMirrorAdapter.replaceRanges() first tries the
 * ContentEditableAdapter execCommand path (which works in Chromium).
 * The ProseMirror API fallback path (pmViewDesc.view) is exercised only
 * when beforeinput is cancelled; that path is unit-tested in
 * tests/unit/prosemirror-adapter.test.ts.
 */

import path from 'node:path';
import { test, expect } from '@playwright/test';

const FIXTURE = new URL('./fixtures/confluence-mock.html', import.meta.url).href;
const HARNESS = path.resolve('test-results/adapter-harness/prosemirror-adapter.js');

test.describe('ProseMirrorAdapter E2E (Confluence mock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.addScriptTag({ path: HARNESS });
  });

  // ---------------------------------------------------------------------------
  // 1. DOM signal detection
  // ---------------------------------------------------------------------------

  test('isConfluenceEditorElement: .ProseMirror[contenteditable] is detected', async ({ page }) => {
    const result = await page.locator('#confluence-editor').evaluate((el) => {
      const g = globalThis as typeof globalThis & {
        isConfluenceEditorElement: (e: HTMLElement) => boolean;
      };
      return g.isConfluenceEditorElement(el as HTMLElement);
    });
    expect(result).toBe(true);
  });

  test('isConfluenceEditorElement: plain contenteditable is NOT detected', async ({ page }) => {
    const result = await page.locator('#plain-ce').evaluate((el) => {
      const g = globalThis as typeof globalThis & {
        isConfluenceEditorElement: (e: HTMLElement) => boolean;
      };
      return g.isConfluenceEditorElement(el as HTMLElement);
    });
    expect(result).toBe(false);
  });

  test('isConfluenceEditorElement: child inside ak-editor-fp-content-area is detected', async ({ page }) => {
    const result = await page.evaluate(() => {
      const g = globalThis as typeof globalThis & {
        isConfluenceEditorElement: (e: HTMLElement) => boolean;
      };
      // An arbitrary contenteditable inside the container
      const container = document.querySelector('[data-testid="ak-editor-fp-content-area"]')!;
      const inner = document.createElement('div');
      inner.contentEditable = 'true';
      container.append(inner);
      const detected = g.isConfluenceEditorElement(inner);
      inner.remove();
      return detected;
    });
    expect(result).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 2. Root resolution
  // ---------------------------------------------------------------------------

  test('resolveProseMirrorRoot: returns the .ProseMirror element itself', async ({ page }) => {
    const result = await page.locator('#confluence-editor').evaluate((el) => {
      const g = globalThis as typeof globalThis & {
        resolveProseMirrorRoot: (e: HTMLElement) => HTMLElement;
      };
      const root = g.resolveProseMirrorRoot(el as HTMLElement);
      return root.id;
    });
    expect(result).toBe('confluence-editor');
  });

  test('resolveProseMirrorRoot: walks up from a child <p> to the .ProseMirror root', async ({ page }) => {
    const result = await page.locator('#confluence-editor p').first().evaluate((el) => {
      const g = globalThis as typeof globalThis & {
        resolveProseMirrorRoot: (e: HTMLElement) => HTMLElement;
      };
      const root = g.resolveProseMirrorRoot(el as HTMLElement);
      return root.id;
    });
    expect(result).toBe('confluence-editor');
  });

  // ---------------------------------------------------------------------------
  // 3. replaceRanges — apply a single fix
  // ---------------------------------------------------------------------------

  test('replaceRanges: applies a single spelling fix to the ProseMirror editor', async ({ page }) => {
    const editor = page.locator('#confluence-editor');
    await editor.focus();

    const result = await editor.evaluate((el) => {
      const g = globalThis as typeof globalThis & {
        ProseMirrorAdapter: new (element: HTMLElement, editorId: string) => {
          replaceRanges(r: Array<{ start: number; end: number; original: string; replacement: string }>): { applied: number; skipped: number };
          readSnapshot(): { text: string };
        };
      };
      const adapter = new g.ProseMirrorAdapter(el as HTMLElement, 'e2e-single');
      const snap = adapter.readSnapshot();
      // Find "recieved" in the text
      const idx = snap.text.indexOf('recieved');
      if (idx < 0) return { applied: -1, skipped: -1, text: snap.text };
      return adapter.replaceRanges([{ start: idx, end: idx + 8, original: 'recieved', replacement: 'received' }]);
    });

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    await expect(editor).toContainText('received');
    // Original misspelling should be gone
    await expect(editor).not.toContainText('recieved');
  });

  // ---------------------------------------------------------------------------
  // 4. replaceRanges — batch fix + single Ctrl+Z undoes all
  // ---------------------------------------------------------------------------

  test('replaceRanges: batch fix is undoable in one Ctrl+Z', async ({ page }) => {
    const editor = page.locator('#confluence-editor');
    await editor.focus();

    const beforeHTML = await editor.innerHTML();

    const result = await editor.evaluate((el) => {
      const g = globalThis as typeof globalThis & {
        ProseMirrorAdapter: new (element: HTMLElement, editorId: string) => {
          replaceRanges(r: Array<{ start: number; end: number; original: string; replacement: string }>): { applied: number; skipped: number };
          readSnapshot(): { text: string };
        };
      };
      const adapter = new g.ProseMirrorAdapter(el as HTMLElement, 'e2e-batch');
      const snap = adapter.readSnapshot();
      const text = snap.text;

      const replacements: Array<{ start: number; end: number; original: string; replacement: string }> = [];

      const pairs: [string, string][] = [
        ['recieved', 'received'],
        ['reveiw', 'review'],
        ['carefuly', 'carefully'],
      ];
      for (const [orig, rep] of pairs) {
        const idx = text.indexOf(orig);
        if (idx >= 0) replacements.push({ start: idx, end: idx + orig.length, original: orig, replacement: rep });
      }
      return { ...adapter.replaceRanges(replacements), count: replacements.length };
    });

    expect(result.applied).toBeGreaterThan(0);

    // Undo should restore original HTML
    await editor.press('Control+z');
    await expect.poll(() => editor.innerHTML()).toBe(beforeHTML);
  });

  // ---------------------------------------------------------------------------
  // 5. replaceRanges — stale replacement is skipped
  // ---------------------------------------------------------------------------

  test('replaceRanges: skips a replacement whose original text does not match', async ({ page }) => {
    const editor = page.locator('#confluence-editor');
    await editor.focus();

    const result = await editor.evaluate((el) => {
      const g = globalThis as typeof globalThis & {
        ProseMirrorAdapter: new (element: HTMLElement, editorId: string) => {
          replaceRanges(r: Array<{ start: number; end: number; original: string; replacement: string }>): { applied: number; skipped: number };
          readSnapshot(): { text: string };
        };
      };
      const adapter = new g.ProseMirrorAdapter(el as HTMLElement, 'e2e-stale');
      return adapter.replaceRanges([
        { start: 0, end: 5, original: 'WRONG', replacement: 'Oops' },
      ]);
    });

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
