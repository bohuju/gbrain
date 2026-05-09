import { describe, expect, test } from 'bun:test';
import { extractReferences } from '../../src/core/code/reference-extractor.ts';

describe('extractReferences', () => {
  test('extracts TypeScript relative imports as code slugs', async () => {
    const refs = await extractReferences(
      [
        "import { helper } from './helper';",
        "import type { Thing } from '../types.ts';",
        "import { z } from 'zod';",
      ].join('\n'),
      'typescript',
      'src/core/import-file.ts',
      new Set(),
    );

    expect(refs.map(r => [r.refType, r.toPath, r.lineNumber])).toEqual([
      ['imports', 'code/src/core/helper', 1],
      ['imports', 'code/src/types', 2],
    ]);
  });

  test('marks test file imports as tests links', async () => {
    const refs = await extractReferences(
      "import { importCodeFile } from '../src/core/import-file';",
      'typescript',
      'test/import-code.test.ts',
      new Set(),
    );

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      refType: 'tests',
      fromPath: 'code/test/import-code.test',
      toPath: 'code/src/core/import-file',
    });
  });

  test('extracts Python relative imports', async () => {
    const refs = await extractReferences(
      [
        'from .helpers import load',
        'from os import path',
      ].join('\n'),
      'python',
      'pkg/importer.py',
      new Set(),
    );

    expect(refs.map(r => r.toPath)).toEqual(['code/pkg/helpers']);
  });

  test('extracts local function calls as code links', async () => {
    const refs = await extractReferences(
      [
        'export function caller() {',
        '  helper();',
        '  other.helper();',
        '}',
        '',
        'function helper() {',
        '  return true;',
        '}',
      ].join('\n'),
      'typescript',
      'src/core/calls.ts',
      new Set(['caller', 'helper']),
    );

    expect(refs).toContainEqual({
      fromPath: 'code/src/core/calls',
      toPath: 'code/src/core/calls',
      refType: 'calls',
      lineNumber: 2,
    });
    expect(refs.filter(r => r.refType === 'calls')).toHaveLength(1);
  });

  test('extracts direct calls to imported relative bindings', async () => {
    const refs = await extractReferences(
      [
        "import { helper as localHelper } from './helper';",
        '',
        'export function run() {',
        '  return localHelper();',
        '}',
      ].join('\n'),
      'typescript',
      'src/core/importer.ts',
      new Set(['run']),
    );

    expect(refs).toContainEqual({
      fromPath: 'code/src/core/importer',
      toPath: 'code/src/core/helper',
      refType: 'calls',
      lineNumber: 4,
    });
  });
});
