import { describe, expect, it, vi } from 'vitest';
import { WritingSession } from '../../src/content/writing-session';
import { ContentEditableAdapter } from '../../src/content/adapters/contenteditable-adapter';
import { buildContenteditableTextModel } from '../../src/content/adapters/contenteditable-text';

describe('Table cell switching in WritingSession', () => {
  it('updates viewState when caret moves between table cells', async () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td id="c1">First cell with spelling misstake.</td>
            <td id="c2">Second cell with bad grammer.</td>
          </tr>
        </tbody>
      </table>
    `;
    document.body.append(editor);

    const adapter = new ContentEditableAdapter(editor, 'test-editor');
    const model = buildContenteditableTextModel(editor);
    console.log('Model text:', JSON.stringify(model.text));

    let dispatchedRequest: any = null;
    let publishedCache: any = null;
    const session = new WritingSession(
      adapter,
      (req) => { dispatchedRequest = req; },
      () => {},
      () => {},
      (cache) => { publishedCache = cache; },
      () => ({
        activationMode: 'always',
        fullDocumentCharacterLimit: 20_000,
        hasModel: true,
        invocationStrategy: 'batch',
        maxConcurrency: 3,
        targetLanguage: 'EN',
      }),
    );
    session.start();

    // Recheck all to queue analysis
    session.recheckAll();
    expect(dispatchedRequest).not.toBeNull();

    const units = dispatchedRequest.units;
    console.log('Dispatched units count:', units.length);
    units.forEach((u: any, idx: number) => {
      console.log(`Unit ${idx} [${u.unitType}]: "${u.text}"`);
    });

    // Simulate LLM response with issues for both cells
    const c1Text = 'First cell with spelling misstake.';
    const c2Text = 'Second cell with bad grammer.';
    const misstakeStart = c1Text.indexOf('misstake');
    const grammerStart = c2Text.indexOf('grammer');

    const sentence1Unit = units.find((u: any) => u.text === c1Text);
    const sentence2Unit = units.find((u: any) => u.text === c2Text);

    session.accept({
      schemaVersion: '1',
      requestId: dispatchedRequest.requestId,
      documentRevision: dispatchedRequest.documentRevision,
      units: [
        {
          unitId: sentence1Unit.unitId,
          unitRevision: sentence1Unit.unitRevision,
          issues: [
            {
              original: 'misstake',
              replacement: 'mistake',
              reason: 'Spelling error',
              category: 'spelling',
              scope: 'local',
              severity: 'problem',
              start: misstakeStart,
              end: misstakeStart + 'misstake'.length,
            },
          ],
        },
        {
          unitId: sentence2Unit.unitId,
          unitRevision: sentence2Unit.unitRevision,
          issues: [
            {
              original: 'grammer',
              replacement: 'grammar',
              reason: 'Spelling error',
              category: 'spelling',
              scope: 'local',
              severity: 'problem',
              start: grammerStart,
              end: grammerStart + 'grammer'.length,
            },
          ],
        },
      ],
    });

    // Place selection in Cell 1
    const td1 = editor.querySelector('#c1')!;
    const text1 = td1.firstChild as Text;
    const range1 = document.createRange();
    range1.setStart(text1, 5);
    range1.setEnd(text1, 5);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range1);

    document.dispatchEvent(new Event('selectionchange'));

    const state1 = session.viewState();
    console.log('State 1 (in Cell 1):', {
      currentParagraphIssues: state1?.currentParagraphIssues,
    });
    expect(state1?.currentParagraphIssues).toHaveLength(1);
    expect(state1?.currentParagraphIssues?.[0].original).toBe('misstake');

    // Now place selection in Cell 2
    const td2 = editor.querySelector('#c2')!;
    const text2 = td2.firstChild as Text;
    const range2 = document.createRange();
    range2.setStart(text2, 5);
    range2.setEnd(text2, 5);
    sel.removeAllRanges();
    sel.addRange(range2);

    document.dispatchEvent(new Event('selectionchange'));

    const state2 = session.viewState();
    console.log('State 2 (in Cell 2):', {
      currentParagraphIssues: state2?.currentParagraphIssues,
    });
    expect(state2?.currentParagraphIssues).toHaveLength(1);
    expect(state2?.currentParagraphIssues?.[0].original).toBe('grammer');

    editor.remove();
  });
});
