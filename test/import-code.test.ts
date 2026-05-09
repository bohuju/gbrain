import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { codePathToSlug, importCodeFile } from '../src/core/import-file.ts';
import type { BrainEngine } from '../src/core/engine.ts';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';

function mockEngine(overrides: Partial<Record<string, any>> = {}): BrainEngine {
  const calls: { method: string; args: any[] }[] = [];
  const track = (method: string) => (...args: any[]) => {
    calls.push({ method, args });
    if (overrides[method]) return overrides[method](...args);
    return Promise.resolve(null);
  };

  const engine = new Proxy({} as any, {
    get(_, prop: string) {
      if (prop === '_calls') return calls;
      if (prop === 'getTags') return overrides.getTags || (() => Promise.resolve([]));
      if (prop === 'getPage') return overrides.getPage || (() => Promise.resolve(null));
      if (prop === 'transaction') return async (fn: (tx: BrainEngine) => Promise<any>) => fn(engine);
      return track(prop);
    },
  });
  return engine;
}

describe('importCodeFile', () => {
  test('imports code as a code_file page with source_code chunks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-import-code-'));
    try {
      const file = join(dir, 'operations.ts');
      writeFileSync(file, [
        'export function putPage() {',
        '  return true;',
        '}',
      ].join('\n'));

      const engine = mockEngine();
      const result = await importCodeFile(engine, file, 'src/core/operations.ts', { noEmbed: true });

      expect(result.status).toBe('imported');
      expect(result.slug).toBe('code/src/core/operations');
      expect(result.language).toBe('typescript');

      const calls = (engine as any)._calls;
      const putCall = calls.find((c: any) => c.method === 'putPage');
      expect(putCall.args[0]).toBe('code/src/core/operations');
      expect(putCall.args[1].type).toBe('code_file');
      expect(putCall.args[1].frontmatter).toMatchObject({
        language: 'typescript',
        file_path: 'src/core/operations.ts',
      });

      const tagCalls = calls.filter((c: any) => c.method === 'addTag');
      expect(tagCalls[0].args[1]).toBe('typescript');

      const chunkCall = calls.find((c: any) => c.method === 'upsertChunks');
      expect(chunkCall.args[1][0]).toMatchObject({
        chunk_source: 'source_code',
        start_line: 1,
        end_line: 3,
        symbol_name: 'putPage',
        symbol_kind: 'function',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('keeps non-symbol top-level code searchable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-import-code-coverage-'));
    try {
      const file = join(dir, 'importer.ts');
      writeFileSync(file, [
        "import { helper } from './helper';",
        '',
        'export function run() {',
        '  return helper();',
        '}',
      ].join('\n'));

      const engine = mockEngine();
      await importCodeFile(engine, file, 'src/importer.ts', { noEmbed: true });

      const calls = (engine as any)._calls;
      const chunkCall = calls.find((c: any) => c.method === 'upsertChunks');
      expect(chunkCall.args[1].some((chunk: any) =>
        chunk.chunk_text.includes("import { helper } from './helper';")
        && chunk.symbol_name == null)).toBe(true);
      expect(chunkCall.args[1].some((chunk: any) =>
        chunk.symbol_name === 'run'
        && chunk.chunk_text.includes('return helper();'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('codePathToSlug strips code extensions', () => {
    expect(codePathToSlug('src/core/operations.ts')).toBe('code/src/core/operations');
    expect(codePathToSlug('scripts/load_data.py')).toBe('code/scripts/load_data');
  });

  test('creates code_import links for imported code files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-import-code-links-'));
    const engine = new PGLiteEngine();
    try {
      await engine.connect({});
      await engine.initSchema();

      const helper = join(dir, 'helper.ts');
      const importer = join(dir, 'importer.ts');
      writeFileSync(helper, 'export function helper() { return true; }\n');
      writeFileSync(importer, "import { helper } from './helper';\nexport function run() { return helper(); }\n");

      await importCodeFile(engine, helper, 'src/helper.ts', { noEmbed: true });
      await importCodeFile(engine, importer, 'src/importer.ts', { noEmbed: true });

      const links = await engine.getLinks('code/src/importer');
      expect(links).toContainEqual(expect.objectContaining({
        from_slug: 'code/src/importer',
        to_slug: 'code/src/helper',
        link_type: 'imports',
        link_source: 'code_import',
      }));
      expect(links).toContainEqual(expect.objectContaining({
        from_slug: 'code/src/importer',
        to_slug: 'code/src/helper',
        link_type: 'calls',
        link_source: 'code_import',
      }));

      writeFileSync(importer, 'export function run() { return true; }\n');
      await importCodeFile(engine, importer, 'src/importer.ts', { noEmbed: true });
      expect(await engine.getLinks('code/src/importer')).toEqual([]);
    } finally {
      await engine.disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
