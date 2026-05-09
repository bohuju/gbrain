import { describe, expect, test } from 'bun:test';
import { runCode } from '../src/commands/code.ts';
import type { BrainEngine } from '../src/core/engine.ts';
import type { Page, SearchResult } from '../src/core/types.ts';

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 1,
    slug: 'code/src/core/import-file',
    type: 'code_file',
    title: 'src/core/import-file.ts',
    compiled_truth: 'export async function importCodeFile() {}',
    timeline: '',
    frontmatter: {
      language: 'typescript',
      file_path: 'src/core/import-file.ts',
    },
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;
  const originalLog = console.log;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  console.log = (...args: unknown[]) => {
    chunks.push(args.join(' ') + '\n');
  };

  return fn().then(
    () => chunks.join(''),
    err => {
      throw err;
    },
  ).finally(() => {
    process.stdout.write = originalWrite;
    console.log = originalLog;
  });
}

describe('code command', () => {
  test('code list lists only code_file pages', async () => {
    const calls: unknown[] = [];
    const engine = {
      listPages: async (filters: unknown) => {
        calls.push(filters);
        return [makePage()];
      },
    } as BrainEngine;

    const output = await captureStdout(() => runCode(engine, ['list']));

    expect(calls).toEqual([{ type: 'code_file', tag: undefined, limit: 50 }]);
    expect(output).toContain('code/src/core/import-file');
    expect(output).toContain('typescript');
    expect(output).toContain('src/core/import-file.ts');
  });

  test('code list supports tag, limit, and json output', async () => {
    const calls: unknown[] = [];
    const engine = {
      listPages: async (filters: unknown) => {
        calls.push(filters);
        return [makePage()];
      },
    } as BrainEngine;

    const output = await captureStdout(() => runCode(engine, ['list', '--tag', 'typescript', '-n', '5', '--json']));
    const parsed = JSON.parse(output);

    expect(calls).toEqual([{ type: 'code_file', tag: 'typescript', limit: 5 }]);
    expect(parsed.files[0].slug).toBe('code/src/core/import-file');
    expect(parsed.files[0].language).toBe('typescript');
  });

  test('code search filters keyword search to code pages', async () => {
    const calls: unknown[] = [];
    const result: SearchResult = {
      slug: 'code/src/core/import-file',
      page_id: 1,
      title: 'src/core/import-file.ts',
      type: 'code_file',
      chunk_text: 'export async function importCodeFile() {}',
      chunk_source: 'source_code',
      chunk_id: 10,
      chunk_index: 0,
      score: 0.75,
      stale: false,
    };
    const engine = {
      searchKeyword: async (query: string, opts: unknown) => {
        calls.push([query, opts]);
        return [result];
      },
    } as BrainEngine;

    const output = await captureStdout(() => runCode(engine, ['search', 'importCodeFile', '--limit', '3']));

    expect(calls).toEqual([['importCodeFile', { type: 'code_file', limit: 3 }]]);
    expect(output).toContain('[0.7500] code/src/core/import-file source_code:0');
    expect(output).toContain('importCodeFile');
  });
});
