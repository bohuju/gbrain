import { describe, it, expect } from 'bun:test';
import { buildCodeSlug, buildCodeFrontmatter } from '../../src/core/import-code/slug-builder';
import type { CodeNode } from '../../src/core/import-code/types';

function makeNode(label: string, name: string, extras: Partial<CodeNode['properties']> = {}): CodeNode {
  return {
    id: `${label}:example.py:${name}`,
    label,
    properties: { name, file: 'example.py', line: 1, ...extras },
  };
}

describe('buildCodeSlug', () => {
  it('builds slug for a Class node', () => {
    const slug = buildCodeSlug('/home/user/my-repo', makeNode('Class', 'AuthMiddleware'));
    expect(slug).toBe('code/my-repo/class/authmiddleware');
  });

  it('builds slug for a Method node', () => {
    const slug = buildCodeSlug('/home/user/my-repo', makeNode('Method', 'AuthMiddleware.authenticate#2'));
    expect(slug).toBe('code/my-repo/method/authmiddleware-authenticate-2');
  });

  it('builds slug for a Function node', () => {
    const slug = buildCodeSlug('my-repo', makeNode('Function', 'validate_token'));
    expect(slug).toBe('code/my-repo/function/validatetoken');
  });

  it('builds slug for an Interface node', () => {
    const slug = buildCodeSlug('my-repo', makeNode('Interface', 'IRepository'));
    expect(slug).toBe('code/my-repo/interface/irepository');
  });

  it('builds slug for a File node', () => {
    const slug = buildCodeSlug('my-repo', makeNode('File', 'src/auth.py'));
    expect(slug).toBe('code/my-repo/file/srcauth-py');
  });

  it('strips leading/trailing hyphens from name', () => {
    const slug = buildCodeSlug('repo', makeNode('Function', '-fun-'));
    expect(slug).toBe('code/repo/function/fun');
  });

  it('collapses multiple hyphens', () => {
    const slug = buildCodeSlug('repo', makeNode('Function', 'foo..bar'));
    expect(slug).toBe('code/repo/function/foo-bar');
  });

  it('handles unknown node label with "symbol" kind', () => {
    const slug = buildCodeSlug('repo', makeNode('Unknown', 'something'));
    expect(slug).toBe('code/repo/symbol/something');
  });

  it('handles Constructor → method kind', () => {
    const slug = buildCodeSlug('repo', makeNode('Constructor', '__init__'));
    expect(slug).toBe('code/repo/method/init');
  });

  it('uses "unknown" when name is missing', () => {
    const node = makeNode('Function', '');
    node.properties.name = '';
    const slug = buildCodeSlug('repo', node);
    expect(slug).toBe('code/repo/function/unknown');
  });
});

describe('buildCodeFrontmatter', () => {
  it('includes repo, kind, file, line', () => {
    const node = makeNode('Class', 'MyClass', { file: 'src/app.ts', line: 42, language: 'typescript' });
    const fm = buildCodeFrontmatter('/home/user/my-repo', node);
    expect(fm.repo).toBe('/home/user/my-repo');
    expect(fm.kind).toBe('Class');
    expect(fm.file).toBe('src/app.ts');
    expect(fm.line).toBe(42);
    expect(fm.language).toBe('typescript');
  });

  it('defaults line to 1', () => {
    const node = makeNode('Function', 'foo');
    const fm = buildCodeFrontmatter('repo', node);
    expect(fm.line).toBe(1);
  });

  it('stores original_id from node id', () => {
    const node = makeNode('File', 'index.ts');
    const fm = buildCodeFrontmatter('repo', node);
    expect(fm.original_id).toBe(node.id);
  });
});
