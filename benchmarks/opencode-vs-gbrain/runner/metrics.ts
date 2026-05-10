import type { AgentRunResult, EfficiencyMetrics } from './types';

interface RawMetrics {
  rounds: number;
  wallClockMs: number;
  tokensTotal: number;
}

function extractRawMetrics(r: AgentRunResult): RawMetrics {
  return {
    rounds: r.toolCallCount,
    wallClockMs: r.wallClockMs,
    tokensTotal: r.tokensIn + r.tokensOut,
  };
}

/** Min-max normalize an array of values to [0,1], lower is better */
function normalizeLowerBetter(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 1.0);
  return values.map(v => 1 - (v - min) / (max - min));
}

/**
 * Compute per-task efficiency scores.
 * All A+B results for the same task are pooled for normalization,
 * so the comparison is fair per-task.
 */
export function computeEfficiencyScores(
  resultsA: AgentRunResult[],
  resultsB: AgentRunResult[],
): Map<string, EfficiencyMetrics> {
  const byTask = new Map<string, AgentRunResult[]>();
  for (const r of [...resultsA, ...resultsB]) {
    const existing = byTask.get(r.taskId) ?? [];
    existing.push(r);
    byTask.set(r.taskId, existing);
  }

  const scores = new Map<string, EfficiencyMetrics>();

  for (const [taskId, results] of byTask) {
    const raw = results.map(extractRawMetrics);
    const roundsNorm = normalizeLowerBetter(raw.map(m => m.rounds));
    const timeNorm = normalizeLowerBetter(raw.map(m => m.wallClockMs));
    const tokensNorm = normalizeLowerBetter(raw.map(m => m.tokensTotal));

    for (let i = 0; i < results.length; i++) {
      const key = `${results[i].group}:${taskId}`;
      const score = 0.4 * roundsNorm[i] + 0.3 * timeNorm[i] + 0.3 * tokensNorm[i];
      scores.set(key, {
        roundsNorm: roundsNorm[i],
        timeNorm: timeNorm[i],
        tokensNorm: tokensNorm[i],
        score,
      });
    }
  }

  return scores;
}

/** Compute mean efficiency score for a group across all tasks */
export function meanEfficiencyScore(
  group: 'A' | 'B',
  scores: Map<string, EfficiencyMetrics>,
): number {
  let sum = 0;
  let count = 0;
  for (const [key, m] of scores) {
    if (key.startsWith(group + ':')) {
      sum += m.score;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Compute success rate for a group */
export function successRate(results: AgentRunResult[]): number {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.success, 0) / results.length;
}
