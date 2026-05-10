#!/usr/bin/env bun
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import type { AgentAdapter, AgentRunResult, BenchmarkReport, TaskDef, TaskRow, TaskScores, ToolHeatmapEntry } from './types';
import { computeEfficiencyScores, meanEfficiencyScore, successRate } from './metrics';
import { evaluateQuality, meanQualityScore } from './judge';
import { createOpencodeAdapter } from './agent-runner';
import { saveReport } from './report';

// ── Config ──────────────────────────────────────────────

const STARLETTE_REPO = process.env.STARLETTE_REPO ?? '/tmp/starlette-bench';
const STARLETTE_COMMIT = process.env.STARLETTE_COMMIT ?? execSync('git rev-parse HEAD', { cwd: STARLETTE_REPO, encoding: 'utf-8' }).trim();
const RESULTS_ROOT = join(import.meta.dir, '..', 'results', new Date().toISOString().slice(0, 10));
const OPENCODE_CMD = process.env.OPENCODE_CMD; // e.g. "opencode run --prompt-file '{promptFile}'"
const JUDGE_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'claude-sonnet-4-6';

const TASKS_DIR = join(import.meta.dir, '..', 'tasks');

const TASK_DEFS: TaskDef[] = [
  { id: '01', name: 'fix_middleware_order',            type: 'fix_bug',     dir: join(TASKS_DIR, '01_fix_middleware_order'),            modules: ['starlette/middleware/', 'starlette/applications.py'] },
  { id: '02', name: 'fix_route_param_type',             type: 'fix_bug',     dir: join(TASKS_DIR, '02_fix_route_param_type'),             modules: ['starlette/routing.py', 'starlette/convertors.py'] },
  { id: '03', name: 'add_streaming_middleware',          type: 'add_feature', dir: join(TASKS_DIR, '03_add_streaming_middleware'),          modules: ['starlette/middleware/', 'starlette/responses.py'] },
  { id: '04', name: 'add_custom_router_match',           type: 'add_feature', dir: join(TASKS_DIR, '04_add_custom_router_match'),           modules: ['starlette/routing.py'] },
  { id: '05', name: 'understand_request_lifecycle',       type: 'understand',  dir: join(TASKS_DIR, '05_understand_request_lifecycle'),       modules: ['starlette/applications.py', 'starlette/routing.py', 'starlette/middleware/', 'starlette/responses.py'] },
  { id: '06', name: 'understand_middleware_routing',      type: 'understand',  dir: join(TASKS_DIR, '06_understand_middleware_routing'),      modules: ['starlette/middleware/errors.py', 'starlette/applications.py', 'starlette/routing.py'] },
  { id: '07', name: 'refactor_route_match',              type: 'refactor',    dir: join(TASKS_DIR, '07_refactor_route_match'),              modules: ['starlette/routing.py'] },
  { id: '08', name: 'write_test_middleware_stack',        type: 'write_test',  dir: join(TASKS_DIR, '08_write_test_middleware_stack'),        modules: ['starlette/middleware/', 'tests/test_middleware.py'] },
];

// ── Main ─────────────────────────────────────────────────

async function main() {
  if (!existsSync(STARLETTE_REPO)) {
    console.error(`Starlette repo not found at ${STARLETTE_REPO}. Clone it first:`);
    console.error(`  git clone https://github.com/encode/starlette ${STARLETTE_REPO}`);
    console.error(`  cd ${STARLETTE_REPO} && git checkout ${STARLETTE_COMMIT}`);
    process.exit(1);
  }

  const judgeConfig = { apiKey: JUDGE_API_KEY, model: JUDGE_MODEL };
  if (!JUDGE_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY not set. Quality scoring will be skipped.');
  }

  const groupADir = join(RESULTS_ROOT, 'group_a');
  const groupBDir = join(RESULTS_ROOT, 'group_b');
  mkdirSync(groupADir, { recursive: true });
  mkdirSync(groupBDir, { recursive: true });

  const configDir = join(import.meta.dir, '..', 'config');

  // ── Group A: Bare OpenCode ──
  console.log('\n=== Group A: Bare OpenCode ===\n');
  const adapterA = createOpencodeAdapter({
    workDir: STARLETTE_REPO,
    opencodeCommand: OPENCODE_CMD,
    resultsDir: RESULTS_ROOT,
  });

  await adapterA.setup({
    label: 'A',
    description: 'Bare OpenCode, no GBrain MCP',
    mcpConfigPath: join(configDir, 'opencode-no-gbrain.json'),
    needsGbrainIndex: false,
  });

  const resultsA = await runGroup(adapterA, 'A');
  await adapterA.teardown();

  // ── Group B: OpenCode + GBrain ──
  console.log('\n=== Group B: OpenCode + GBrain ===\n');
  const adapterB = createOpencodeAdapter({
    workDir: STARLETTE_REPO,
    opencodeCommand: OPENCODE_CMD,
    resultsDir: RESULTS_ROOT,
  });

  await adapterB.setup({
    label: 'B',
    description: 'OpenCode with GBrain MCP',
    mcpConfigPath: join(configDir, 'opencode-with-gbrain.json'),
    needsGbrainIndex: true,
  });

  const resultsB = await runGroup(adapterB, 'B');
  await adapterB.teardown();

  // ── Scoring ──
  console.log('\n=== Scoring ===\n');

  // 1. Success rate (from verify.sh)
  const aSuccessRate = successRate(resultsA);
  const bSuccessRate = successRate(resultsB);

  // 2. Efficiency (normalized per-task)
  const efficiencyScores = computeEfficiencyScores(resultsA, resultsB);
  const aEfficiency = meanEfficiencyScore('A', efficiencyScores);
  const bEfficiency = meanEfficiencyScore('B', efficiencyScores);

  // 3. Quality (LLM-as-judge, for tasks that produced output)
  const qualityScores: Map<string, { a: number; b: number }> = new Map();

  for (const task of TASK_DEFS) {
    const rA = resultsA.find(r => r.taskId === task.id);
    const rB = resultsB.find(r => r.taskId === task.id);

    let qA = 0, qB = 0;

    if (JUDGE_API_KEY && rA && rA.outputDiff) {
      const gt = readGroundTruth(task.dir);
      const qrA = await evaluateQuality(gt, rA.outputDiff, JSON.stringify(rA.outputFiles), judgeConfig);
      qA = qrA.score;
    }
    if (JUDGE_API_KEY && rB && rB.outputDiff) {
      const gt = readGroundTruth(task.dir);
      const qrB = await evaluateQuality(gt, rB.outputDiff, JSON.stringify(rB.outputFiles), judgeConfig);
      qB = qrB.score;
    }

    qualityScores.set(task.id, { a: qA, b: qB });
  }

  const allQualityA = [...qualityScores.values()].map(v => v.a);
  const allQualityB = [...qualityScores.values()].map(v => v.b);
  const aQuality = allQualityA.reduce((s, v) => s + v, 0) / allQualityA.length;
  const bQuality = allQualityB.reduce((s, v) => s + v, 0) / allQualityB.length;

  // 4. Composite
  const aComposite = 0.4 * aSuccessRate + 0.25 * aEfficiency + 0.35 * aQuality;
  const bComposite = 0.4 * bSuccessRate + 0.25 * bEfficiency + 0.35 * bQuality;

  // ── Build report ──
  const taskRows: TaskRow[] = TASK_DEFS.map(task => {
    const rA = resultsA.find(r => r.taskId === task.id);
    const rB = resultsB.find(r => r.taskId === task.id);
    const q = qualityScores.get(task.id) ?? { a: 0, b: 0 };
    const aRounds = rA?.toolCallCount ?? 0;
    const bRounds = rB?.toolCallCount ?? 0;
    const deltaRounds = aRounds > 0 && bRounds > 0
      ? ((bRounds - aRounds) / aRounds) * 100
      : 0;

    return {
      taskId: task.id,
      taskName: task.name,
      type: task.type,
      aSuccess: rA?.success ?? 0,
      bSuccess: rB?.success ?? 0,
      aRounds,
      bRounds,
      deltaRoundsPct: deltaRounds,
      aQuality: q.a,
      bQuality: q.b,
    };
  });

  // Heatmap: aggregate all Group B gbrainToolCalls
  const heatmap = buildToolHeatmap(resultsB);

  const report: BenchmarkReport = {
    meta: {
      project: 'encode/starlette',
      projectCommit: STARLETTE_COMMIT,
      date: new Date().toISOString().slice(0, 10),
      opencodeVersion: execSync('opencode --version 2>/dev/null || echo "unknown"', { encoding: 'utf-8' }).trim(),
      gbrainVersion: execSync('gbrain --version 2>/dev/null || echo "unknown"', { encoding: 'utf-8' }).trim(),
    },
    summary: {
      groupA: { successRate: aSuccessRate, efficiencyScore: aEfficiency, qualityScore: aQuality, compositeScore: aComposite },
      groupB: { successRate: bSuccessRate, efficiencyScore: bEfficiency, qualityScore: bQuality, compositeScore: bComposite },
      deltas: {
        success: bSuccessRate - aSuccessRate,
        efficiency: bEfficiency - aEfficiency,
        quality: bQuality - aQuality,
        composite: bComposite - aComposite,
      },
    },
    tasks: taskRows,
    toolHeatmap: heatmap,
  };

  // ── Output ──
  const reportPath = saveReport(report, RESULTS_ROOT);
  console.log('\n' + readFileSync(reportPath, 'utf-8'));
  console.log(`\nReport saved to: ${reportPath}`);
}

async function runGroup(adapter: AgentAdapter, label: string): Promise<AgentRunResult[]> {
  const results: AgentRunResult[] = [];
  for (const task of TASK_DEFS) {
    console.log(`[${label}] Running task ${task.id}: ${task.name}...`);
    try {
      const result = await adapter.runTask(task, STARLETTE_REPO);
      results.push(result);
      console.log(`[${label}]   success=${result.success} rounds=${result.toolCallCount} time=${result.wallClockMs}ms`);
    } catch (err) {
      console.error(`[${label}]   FAILED: ${err}`);
      results.push({
        taskId: task.id,
        group: label as 'A' | 'B',
        success: 0,
        toolCallCount: 0,
        wallClockMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        outputDiff: '',
        outputFiles: {},
        logs: String(err),
      });
    }
  }
  return results;
}

function readGroundTruth(taskDir: string): string {
  const path = join(taskDir, 'ground_truth.md');
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '(no ground truth provided)';
  }
}

function buildToolHeatmap(resultsB: AgentRunResult[]): ToolHeatmapEntry[] {
  const agg: Record<string, { calls: number; tasks: Set<string> }> = {};
  for (const r of resultsB) {
    if (!r.gbrainToolCalls) continue;
    for (const [tool, count] of Object.entries(r.gbrainToolCalls)) {
      if (!agg[tool]) agg[tool] = { calls: 0, tasks: new Set() };
      agg[tool].calls += count;
      agg[tool].tasks.add(r.taskId);
    }
  }
  return Object.entries(agg)
    .map(([tool, v]) => ({ tool, calls: v.calls, tasksCovered: v.tasks.size }))
    .sort((a, b) => b.calls - a.calls);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
