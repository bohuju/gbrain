import { describe, expect, test } from 'bun:test';
import { extractSymbols } from '../../src/core/code/symbol-extractor.ts';

describe('extractSymbols', () => {
  test('extracts exported TypeScript functions, classes, interfaces, and consts', async () => {
    const source = [
      '/** Import a page. */',
      'export async function importFromContent(engine: BrainEngine) {',
      '  return engine;',
      '}',
      '',
      'export interface BrainEngine {',
      '  putPage(slug: string): Promise<void>;',
      '}',
      '',
      'export class PostgresEngine {',
      '  async putPage(slug: string) {',
      '    return slug;',
      '  }',
      '}',
      '',
      'export const makeEngine = () => new PostgresEngine();',
    ].join('\n');

    const symbols = await extractSymbols(source, 'typescript');
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['function', 'importFromContent']);
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['interface', 'BrainEngine']);
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['class', 'PostgresEngine']);
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['method', 'putPage']);
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['const', 'makeEngine']);
    expect(symbols.find(s => s.name === 'importFromContent')?.docComment).toContain('Import a page');
  });

  test('extracts Python functions and classes with indentation ranges', async () => {
    const source = [
      'class Importer:',
      '    def put_page(self):',
      '        return True',
      '',
      'def load_file(path):',
      '    return path',
    ].join('\n');

    const symbols = await extractSymbols(source, 'python');
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['class', 'Importer']);
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['function', 'put_page']);
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['function', 'load_file']);
    expect(symbols.find(s => s.name === 'load_file')?.startLine).toBe(5);
  });

  test('extracts Go functions and types', async () => {
    const source = [
      'type BrainEngine interface {',
      '  PutPage(slug string) error',
      '}',
      '',
      'func ImportFile(path string) error {',
      '  return nil',
      '}',
    ].join('\n');

    const symbols = await extractSymbols(source, 'go');
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['type', 'BrainEngine']);
    expect(symbols.map(s => [s.kind, s.name])).toContainEqual(['function', 'ImportFile']);
  });
});
