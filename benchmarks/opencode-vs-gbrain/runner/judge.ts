import type { QualityDimensionScores, QualityResult } from './types';

interface JudgeConfig {
  apiKey: string;
  /** Anthropic model for judging, e.g. claude-sonnet-4-6 */
  model: string;
}

const QUALITY_PROMPT = `You are a code review judge evaluating an AI agent's work on a software engineering task.

Rate the agent's output on four dimensions, each 1-5:
- correctness: 1=contains logic errors, 3=mostly correct with minor issues, 5=flawless
- style: 1=clashes with project conventions, 3=mostly consistent, 5=blends in naturally
- edgeHandling: 1=only happy path, 3=covers main edge cases, 5=comprehensive
- simplicity: 1=over-engineered, 3=reasonable scope, 5=minimal change to achieve the goal

Ground truth (reference answer):
---
{groundTruth}
---

Agent's output (git diff of changes):
---
{outputDiff}
---

Agent-created files:
---
{outputFiles}
---

Reply with ONLY a JSON object, no other text:
{"correctness":<1-5>,"style":<1-5>,"edgeHandling":<1-5>,"simplicity":<1-5>}`;

async function callJudge(
  groundTruth: string,
  outputDiff: string,
  outputFiles: string,
  config: JudgeConfig,
): Promise<QualityDimensionScores> {
  const prompt = QUALITY_PROMPT
    .replace('{groundTruth}', groundTruth)
    .replace('{outputDiff}', outputDiff.slice(0, 15000))
    .replace('{outputFiles}', outputFiles.slice(0, 5000));

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 256,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Judge API error: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json() as { content: Array<{ text: string }> };
  const text = data.content[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Judge returned unparseable output: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);

  return {
    correctness: clamp1to5(parsed.correctness),
    style: clamp1to5(parsed.style),
    edgeHandling: clamp1to5(parsed.edgeHandling),
    simplicity: clamp1to5(parsed.simplicity),
  };
}

function clamp1to5(v: number): number {
  return Math.max(1, Math.min(5, Math.round(v)));
}

function dimensionScore(d: QualityDimensionScores): number {
  return (d.correctness * 0.4 + d.style * 0.2 + d.edgeHandling * 0.2 + d.simplicity * 0.2) / 5;
}

/**
 * Run dual-judge quality evaluation.
 * If scores diverge by >0.4 on the normalized scale (equivalent to >2 raw on 1-5),
 * a third judge is called as tiebreaker.
 */
export async function evaluateQuality(
  groundTruth: string,
  outputDiff: string,
  outputFiles: string,
  config: JudgeConfig,
): Promise<QualityResult> {
  const [judgeA, judgeB] = await Promise.all([
    callJudge(groundTruth, outputDiff, outputFiles, config),
    callJudge(groundTruth, outputDiff, outputFiles, config),
  ]);

  const scoreA = dimensionScore(judgeA);
  const scoreB = dimensionScore(judgeB);

  // If judges disagree by >0.4 on normalized scale (equivalent to >2 raw on 1-5),
  // invoke third judge and take median
  if (Math.abs(scoreA - scoreB) > 0.4) {
    const judgeC = await callJudge(groundTruth, outputDiff, outputFiles, config);
    const scoreC = dimensionScore(judgeC);
    // Median of three scores
    const medianScore = [scoreA, scoreB, scoreC].sort((a, b) => a - b)[1];
    return { judgeA, judgeB, judgeC, score: medianScore };
  }

  return { judgeA, judgeB, score: (scoreA + scoreB) / 2 };
}

export function meanQualityScore(results: QualityResult[]): number {
  if (results.length === 0) return 0;
  return results.reduce((s, r) => s + r.score, 0) / results.length;
}
