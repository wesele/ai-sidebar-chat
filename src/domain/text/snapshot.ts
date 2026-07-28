export type SourceKind = 'input' | 'textarea' | 'contenteditable';
export interface OffsetMap { normalizedToSource(offset: number): number; sourceToNormalized(offset: number): number; }
class NewlineOffsetMap implements OffsetMap {
  constructor(private readonly source: string, private readonly normalized: string, private readonly sourceAtNormalized: number[], private readonly normalizedAtSource: number[]) {}
  normalizedToSource(offset: number): number { return this.sourceAtNormalized[Math.max(0, Math.min(offset, this.normalized.length))] ?? this.source.length; }
  sourceToNormalized(offset: number): number { return this.normalizedAtSource[Math.max(0, Math.min(offset, this.source.length))] ?? this.normalized.length; }
}
export interface NormalizedText { text: string; offsetMap: OffsetMap; sourceLength: number; }
export function normalizeSnapshot(source: string): NormalizedText {
  let text = ''; const forward: number[] = [0]; const reverse: number[] = Array(source.length + 1); let normalized = 0;
  for (let i = 0; i < source.length; i += 1) { reverse[i] = normalized; if (source[i] === '\r' && source[i + 1] === '\n') { text += '\n'; forward[++normalized] = i + 2; reverse[i + 1] = normalized; i += 1; } else { text += source[i]; forward[++normalized] = i + 1; } }
  reverse[source.length] = normalized; return { text, offsetMap: new NewlineOffsetMap(source, text, forward, reverse), sourceLength: source.length };
}
export interface EditorSnapshot extends NormalizedText { editorId: string; documentRevision: number; sourceKind: SourceKind; selection: { start: number; end: number } | null; composing: boolean; createdAt: number; }
export function createSnapshot(args: Omit<EditorSnapshot, 'text' | 'offsetMap' | 'sourceLength'> & { source: string }): Readonly<EditorSnapshot> { const n = normalizeSnapshot(args.source); return Object.freeze({ ...args, ...n }); }
