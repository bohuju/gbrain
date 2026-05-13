import { describe, it, expect } from 'bun:test';
import { parseCypherResponse } from '../../src/core/import-code/reader';

describe('parseCypherResponse', () => {
  it('parses a markdown-table cypher response', () => {
    const response = JSON.stringify({
      markdown: '| n |\n| --- |\n| {"name":"foo","_label":"Function"} |\n| {"name":"bar","_label":"Class"} |',
      row_count: 2,
    });
    const rows = parseCypherResponse(response);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('foo');
    expect(rows[0]._label).toBe('Function');
    expect(rows[1].name).toBe('bar');
    expect(rows[1]._label).toBe('Class');
  });

  it('returns empty array for JSON array []', () => {
    expect(parseCypherResponse('[]')).toEqual([]);
  });

  it('returns empty array for zero row_count', () => {
    const response = JSON.stringify({ markdown: '| n |\n| --- |', row_count: 0 });
    expect(parseCypherResponse(response)).toEqual([]);
  });

  it('returns empty array for missing markdown', () => {
    const response = JSON.stringify({ row_count: 5 });
    expect(parseCypherResponse(response)).toEqual([]);
  });

  it('returns empty array for non-JSON input', () => {
    expect(parseCypherResponse('not json')).toEqual([]);
  });

  it('skips unparseable rows', () => {
    const response = JSON.stringify({
      markdown: '| n |\n| --- |\n| {"valid":1} |\n| not-json |\n| {"valid":2} |',
      row_count: 3,
    });
    const rows = parseCypherResponse(response);
    expect(rows).toHaveLength(2);
    expect(rows[0].valid).toBe(1);
    expect(rows[1].valid).toBe(2);
  });
});
