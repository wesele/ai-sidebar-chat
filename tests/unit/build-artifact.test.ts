import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
describe('MV3 content artifact', () => { it('is an executable self-contained classic content script', () => { expect(existsSync('dist/content.js')).toBe(true); const source = readFileSync('dist/content.js', 'utf8'); expect(source).not.toMatch(/^\s*import\s/m); expect(source).not.toMatch(/^\s*export\s/m); expect(source).toMatch(/^\s*(?:var|\(function)/); }); });
