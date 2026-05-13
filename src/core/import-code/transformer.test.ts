import { describe, it, expect } from 'bun:test';
import { transformGraphData } from './transformer';
import type { CodeNode, CodeEdge } from './types';

const makeNode = (overrides: Partial<CodeNode> = {}): CodeNode => ({
  id: 'Function:auth.py:login',
  label: 'Function',
  properties: { name: 'login', file: 'auth.py', line: 42, source: 'def login():\n    pass' },
  ...overrides,
});

const makeEdge = (overrides: Partial<CodeEdge> = {}): CodeEdge => ({
  from: 'Function:auth.py:login',
  to: 'Function:auth.py:validate',
  type: 'CALLS',
  properties: { confidence: 1.0 },
  ...overrides,
});

describe('transformGraphData', () => {
  it('transforms a Function node to a page', () => {
    const { pages, slugMap } = transformGraphData([makeNode()], [], 'test-repo');
    expect(pages.length).toBe(1);
    expect(pages[0].page.type).toBe('code_function');
    expect(pages[0].page.title).toBe('login');
    expect(pages[0].page.frontmatter?.repo).toBe('test-repo');
    expect(slugMap.has('Function:auth.py:login')).toBe(true);
  });

  it('transforms a CALLS edge to a link', () => {
    const n1 = makeNode({ id: 'Function:a:foo', properties: { name: 'foo' } });
    const n2 = makeNode({ id: 'Function:a:bar', properties: { name: 'bar' } });
    const { links } = transformGraphData([n1, n2], [{ from: n1.id, to: n2.id, type: 'CALLS', properties: {} }], 'test');
    expect(links.length).toBe(1);
    expect(links[0].link_type).toBe('code_call');
    expect(links[0].link_source).toBe('code_import');
  });

  it('skips edges where source or target node is missing', () => {
    const { links } = transformGraphData(
      [makeNode({ id: 'A' })],
      [{ from: 'A', to: 'B', type: 'CALLS', properties: {} }],
      'test',
    );
    expect(links.length).toBe(0);
  });

  it('generates chunks for embeddable nodes', () => {
    const { chunks } = transformGraphData([makeNode()], [], 'test');
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunks[0].symbol_name).toBe('login');
    expect(chunks[0].chunks[0].symbol_kind).toBe('Function');
  });

  it('deduplicates slugs when multiple nodes produce the same slug', () => {
    const n1 = makeNode({ id: 'A', label: 'Function', properties: { name: 'handler' } });
    const n2 = makeNode({ id: 'B', label: 'Function', properties: { name: 'handler' } });
    const n3 = makeNode({ id: 'C', label: 'Function', properties: { name: 'handler' } });
    const { pages, slugMap } = transformGraphData([n1, n2, n3], [], 'test');
    expect(pages.length).toBe(3);
    const slugs = pages.map(p => p.slug);
    expect(new Set(slugs).size).toBe(3);
    expect(slugs).toContain('code/test/function/handler');
    expect(slugs).toContain('code/test/function/handler-2');
    expect(slugs).toContain('code/test/function/handler-3');
    expect(slugMap.get('A')).toBe('code/test/function/handler');
    expect(slugMap.get('B')).toBe('code/test/function/handler-2');
    expect(slugMap.get('C')).toBe('code/test/function/handler-3');
  });

  it('maps all node labels to correct page types', () => {
    const labels = ['Class', 'Method', 'Interface', 'Function', 'File', 'Enum', 'Trait'];
    const nodes = labels.map((label, i) => makeNode({ id: `${label}:${i}`, label, properties: { name: label.toLowerCase() } }));
    const { pages } = transformGraphData(nodes, [], 'test');
    expect(pages.length).toBe(labels.length);
    expect(pages.find(p => p.page.type === 'code_class')).toBeTruthy();
    expect(pages.find(p => p.page.type === 'code_interface')).toBeTruthy();
    expect(pages.find(p => p.page.type === 'code_method')).toBeTruthy();
  });
});
