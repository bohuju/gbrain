import { describe, expect, test } from 'bun:test';
import { chunkCode } from '../../src/core/chunkers/code.ts';

describe('chunkCode', () => {
  test('returns no chunks for empty source', () => {
    expect(chunkCode('')).toEqual([]);
    expect(chunkCode('  \n\n')).toEqual([]);
  });

  test('preserves line ranges', () => {
    const chunks = chunkCode('export const a = 1;\n\nexport const b = 2;');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ index: 0, startLine: 1, endLine: 1 });
    expect(chunks[1]).toMatchObject({ index: 1, startLine: 3, endLine: 3 });
  });

  test('keeps indented bodies with their block', () => {
    const source = [
      'function outer() {',
      '  if (true) {',
      '    return 1;',
      '  }',
      '}',
      '',
      'function next() {',
      '  return 2;',
      '}',
    ].join('\n');

    const chunks = chunkCode(source);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toContain('return 1');
    expect(chunks[0].endLine).toBe(5);
    expect(chunks[1].startLine).toBe(7);
  });

  test('splits large files with overlap', () => {
    const source = Array.from({ length: 10 }, (_, i) => `const value${i} = ${i};`).join('\n');
    const chunks = chunkCode(source, { maxLines: 6, overlapLines: 2 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].startLine).toBeLessThanOrEqual(chunks[0].endLine);
  });
});
