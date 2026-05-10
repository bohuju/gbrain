import { describe, it, expect } from 'bun:test';
import { computeEfficiencyScores, successRate } from './metrics';
import type { AgentRunResult } from './types';

function makeResult(overrides: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    taskId: '01',
    group: 'A',
    success: 1.0,
    toolCallCount: 10,
    wallClockMs: 5000,
    tokensIn: 2000,
    tokensOut: 500,
    outputDiff: '',
    outputFiles: {},
    logs: '',
    ...overrides,
  };
}

describe('successRate', () => {
  it('computes rate from results', () => {
    const results = [
      makeResult({ success: 1.0 }),
      makeResult({ success: 0.5 }),
      makeResult({ success: 0.0 }),
      makeResult({ success: 1.0 }),
    ];
    expect(successRate(results)).toBeCloseTo(0.625);
  });

  it('returns 0 for empty', () => {
    expect(successRate([])).toBe(0);
  });

  it('returns 1 for all pass', () => {
    expect(successRate([makeResult(), makeResult()])).toBe(1);
  });
});

describe('computeEfficiencyScores', () => {
  it('normalizes within task', () => {
    const a = makeResult({ taskId: '01', group: 'A', toolCallCount: 20, wallClockMs: 10000, tokensIn: 3000, tokensOut: 1000 });
    const b = makeResult({ taskId: '01', group: 'B', toolCallCount: 10, wallClockMs: 5000,  tokensIn: 2000, tokensOut: 500 });

    const scores = computeEfficiencyScores([a], [b]);

    // B is better (fewer all) so B should have higher score
    const aScore = scores.get('A:01')!;
    const bScore = scores.get('B:01')!;
    expect(bScore.score).toBeGreaterThan(aScore.score);
  });

  it('gives equal scores for equal metrics', () => {
    const a = makeResult({ taskId: '01', group: 'A' });
    const b = makeResult({ taskId: '01', group: 'B' });

    const scores = computeEfficiencyScores([a], [b]);
    expect(scores.get('A:01')!.score).toBeCloseTo(scores.get('B:01')!.score);
  });
});
