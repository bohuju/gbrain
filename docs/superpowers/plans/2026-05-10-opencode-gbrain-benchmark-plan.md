# OpenCode + GBrain Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible benchmark harness that compares OpenCode task completion with vs without GBrain MCP on Starlette.

**Architecture:** TypeScript/bun CLI runner orchestrates two experiment groups (A: bare OpenCode, B: OpenCode+GBrain) across 8 software engineering tasks. Each task has a seed patch, prompt, verification script, and ground truth. Three-dimensional scoring (success/efficiency/quality) feeds into A/B comparison report. Agent invocation is abstracted behind an adapter interface so opencode can be swapped with other agent CLIs.

**Tech Stack:** TypeScript (bun runtime), Anthropic SDK (LLM-as-judge), Git (seed state management), Bash (verify scripts), Starlette (benchmark target, Python)

---

## File Map

| File | Responsibility |
|------|---------------|
| `benchmarks/opencode-vs-gbrain/runner/types.ts` | All shared type definitions |
| `benchmarks/opencode-vs-gbrain/runner/metrics.ts` | Efficiency score normalization |
| `benchmarks/opencode-vs-gbrain/runner/judge.ts` | LLM-as-judge quality scoring (Anthropic) |
| `benchmarks/opencode-vs-gbrain/runner/agent-runner.ts` | Agent adapter abstraction + opencode adapter |
| `benchmarks/opencode-vs-gbrain/runner/report.ts` | Markdown report generator |
| `benchmarks/opencode-vs-gbrain/runner/run.ts` | Main scheduler entry point |
| `benchmarks/opencode-vs-gbrain/config/opencode-no-gbrain.json` | OpenCode MCP config for Group A (empty) |
| `benchmarks/opencode-vs-gbrain/config/opencode-with-gbrain.json` | OpenCode MCP config for Group B |
| `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/prompt.md` | Task 1 prompt |
| `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/seed.patch` | Task 1 seed state patch |
| `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/verify.sh` | Task 1 auto-verification |
| `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/ground_truth.md` | Task 1 reference answer |
| ... (tasks 02-08 follow same pattern) | |
| `benchmarks/opencode-vs-gbrain/runner/run.test.ts` | Tests for metrics, judge, report modules |

---

### Task 1: Scaffold Directory Structure and Shared Types

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/runner/types.ts`
- Create: `benchmarks/opencode-vs-gbrain/results/.gitkeep`
- Create: `benchmarks/opencode-vs-gbrain/config/opencode-no-gbrain.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p benchmarks/opencode-vs-gbrain/{runner,tasks,config,results}
for i in $(seq -w 1 8); do
  mkdir -p "benchmarks/opencode-vs-gbrain/tasks/${i}_"*
done
# Create proper task dirs:
mkdir -p benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order
mkdir -p benchmarks/opencode-vs-gbrain/tasks/02_fix_route_param_type
mkdir -p benchmarks/opencode-vs-gbrain/tasks/03_add_streaming_middleware
mkdir -p benchmarks/opencode-vs-gbrain/tasks/04_add_custom_router_match
mkdir -p benchmarks/opencode-vs-gbrain/tasks/05_understand_request_lifecycle
mkdir -p benchmarks/opencode-vs-gbrain/tasks/06_understand_middleware_routing
mkdir -p benchmarks/opencode-vs-gbrain/tasks/07_refactor_route_match
mkdir -p benchmarks/opencode-vs-gbrain/tasks/08_write_test_middleware_stack
touch benchmarks/opencode-vs-gbrain/results/.gitkeep
```

- [ ] **Step 2: Write shared types**

Write `benchmarks/opencode-vs-gbrain/runner/types.ts`:

```typescript
// === Task definitions ===

export type TaskType = 'fix_bug' | 'add_feature' | 'understand' | 'refactor' | 'write_test';

export interface TaskDef {
  id: string;
  name: string;
  type: TaskType;
  dir: string;
  modules: string[];
}

// === Agent runner abstraction ===

export type GroupLabel = 'A' | 'B';

export interface GroupConfig {
  label: GroupLabel;
  description: string;
  /** Path to opencode MCP config JSON for this group */
  mcpConfigPath: string;
  /** Whether GBrain pre-indexing is needed before this group */
  needsGbrainIndex: boolean;
}

export interface AgentRunResult {
  taskId: string;
  group: GroupLabel;
  /** 0.0 = failed, 0.5 = partial, 1.0 = full pass; understand tasks get continuous 0-1 */
  success: number;
  /** Total tool call count from agent session */
  toolCallCount: number;
  /** Wall-clock duration in milliseconds */
  wallClockMs: number;
  /** Input tokens consumed */
  tokensIn: number;
  /** Output tokens generated */
  tokensOut: number;
  /** Git diff of all changes the agent made */
  outputDiff: string;
  /** Path -> content for any new files created */
  outputFiles: Record<string, string>;
  /** Raw agent logs (stdout+stderr) */
  logs: string;
  /** Per-MCP-tool call counts (Group B only) */
  gbrainToolCalls?: Record<string, number>;
}

export interface AgentAdapter {
  /** Set up agent environment for a group */
  setup(config: GroupConfig): Promise<void>;
  /** Run one task: reset to seed state, invoke agent, collect results */
  runTask(task: TaskDef, workDir: string): Promise<AgentRunResult>;
  /** Clean up after a group */
  teardown(): Promise<void>;
}

// === Metrics ===

export interface EfficiencyMetrics {
  roundsNorm: number;
  timeNorm: number;
  tokensNorm: number;
  score: number;
}

// === Quality scoring ===

export interface QualityDimensionScores {
  correctness: number;  // 1-5
  style: number;        // 1-5
  edgeHandling: number; // 1-5
  simplicity: number;   // 1-5
}

export interface QualityResult {
  judgeA: QualityDimensionScores;
  judgeB: QualityDimensionScores;
  judgeC?: QualityDimensionScores;  // tiebreaker if |A-B| > 2
  score: number;  // normalized [0, 1]
}

// === Task-level scores ===

export interface TaskScores {
  taskId: string;
  taskName: string;
  group: GroupLabel;
  success: number;
  efficiency: EfficiencyMetrics;
  quality: QualityResult;
  composite: number;
}

// === Report ===

export interface GroupSummary {
  successRate: number;
  efficiencyScore: number;
  qualityScore: number;
  compositeScore: number;
}

export interface TaskRow {
  taskId: string;
  taskName: string;
  type: TaskType;
  aSuccess: number;
  bSuccess: number;
  aRounds: number;
  bRounds: number;
  deltaRoundsPct: number;
  aQuality: number;
  bQuality: number;
}

export interface ToolHeatmapEntry {
  tool: string;
  calls: number;
  tasksCovered: number;
}

export interface BenchmarkReport {
  meta: {
    project: string;
    projectCommit: string;
    date: string;
    opencodeVersion: string;
    gbrainVersion: string;
  };
  summary: {
    groupA: GroupSummary;
    groupB: GroupSummary;
    deltas: { success: number; efficiency: number; quality: number; composite: number };
  };
  tasks: TaskRow[];
  toolHeatmap: ToolHeatmapEntry[];
}
```

- [ ] **Step 3: Write Group A MCP config (no GBrain)**

Write `benchmarks/opencode-vs-gbrain/config/opencode-no-gbrain.json`:

```json
{
  "mcp": {}
}
```

- [ ] **Step 4: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/
git commit -m "scaffold: benchmark directory structure and shared types"
```

---

### Task 2: Write Metrics Module

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/runner/metrics.ts`

- [ ] **Step 1: Write metrics.ts with normalization logic**

Write `benchmarks/opencode-vs-gbrain/runner/metrics.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/runner/metrics.ts
git commit -m "feat: metrics module — efficiency normalization and success rate"
```

---

### Task 3: Write Judge Module

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/runner/judge.ts`

- [ ] **Step 1: Write judge.ts with LLM-as-judge evaluation**

Write `benchmarks/opencode-vs-gbrain/runner/judge.ts`:

```typescript
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
 * If scores diverge by >2 on the normalized scale, a third judge is called as tiebreaker.
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
```

- [ ] **Step 2: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/runner/judge.ts
git commit -m "feat: judge module — dual LLM-as-judge with tiebreaker"
```

---

### Task 4: Write Agent Runner (OpenCode Adapter)

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/runner/agent-runner.ts`
- Create: `benchmarks/opencode-vs-gbrain/config/opencode-with-gbrain.json`

- [ ] **Step 1: Write Group B MCP config (with GBrain)**

Write `benchmarks/opencode-vs-gbrain/config/opencode-with-gbrain.json`:

```json
{
  "mcp": {
    "gbrain": {
      "type": "local",
      "command": [
        "gbrain",
        "serve"
      ],
      "enabled": true,
      "timeout": 30000
    }
  }
}
```

- [ ] **Step 2: Write agent-runner.ts**

Write `benchmarks/opencode-vs-gbrain/runner/agent-runner.ts`:

```typescript
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentAdapter, AgentRunResult, GroupConfig, GroupLabel, TaskDef } from './types';

const OPENCODE_CONFIG_PATH = join(require('os').homedir(), '.config', 'opencode', 'opencode.json');

interface OpencodeAdapterOptions {
  /** Starlette working directory */
  workDir: string;
  /** How to invoke opencode. Falls back to interactive mode if not set. */
  opencodeCommand?: string;
  /** Directory to store per-task logs */
  resultsDir: string;
}

/**
 * OpenCode adapter that manages MCP config and invokes the agent.
 *
 * If opencode supports headless invocation (e.g. `opencode run --prompt <file>`),
 * set `opencodeCommand` to the command template. Otherwise, the adapter prepares
 * the environment and pauses for a manual session.
 */
export function createOpencodeAdapter(opts: OpencodeAdapterOptions): AgentAdapter {
  let groupLabel: GroupLabel = 'A';
  let originalConfigBackup: string | null = null;

  return {
    async setup(config: GroupConfig): Promise<void> {
      groupLabel = config.label;

      // Back up existing opencode config
      if (existsSync(OPENCODE_CONFIG_PATH)) {
        originalConfigBackup = readFileSync(OPENCODE_CONFIG_PATH, 'utf-8');
      }

      // Write group-specific config
      const configDir = join(require('os').homedir(), '.config', 'opencode');
      mkdirSync(configDir, { recursive: true });
      const mcpConfig = readFileSync(config.mcpConfigPath, 'utf-8');
      writeFileSync(OPENCODE_CONFIG_PATH, mcpConfig);

      // If Group B, run GBrain index
      if (config.needsGbrainIndex) {
        execSync('gbrain init', { cwd: opts.workDir, stdio: 'inherit' });
        execSync('gbrain config set sync.repo_path ' + opts.workDir, { stdio: 'inherit' });
        execSync('gbrain sync --force', { cwd: opts.workDir, stdio: 'inherit' });
        execSync('gbrain extract links', { cwd: opts.workDir, stdio: 'inherit' });
      }
    },

    async runTask(task: TaskDef): Promise<AgentRunResult> {
      const taskDir = join(opts.resultsDir, `group_${groupLabel.toLowerCase()}`, task.id);
      mkdirSync(taskDir, { recursive: true });

      // Apply seed patch
      execSync(`git checkout -- . && git clean -fd && git apply ${join(task.dir, 'seed.patch')}`, {
        cwd: opts.workDir,
        stdio: 'pipe',
      });

      const startTime = Date.now();
      const prompt = readFileSync(join(task.dir, 'prompt.md'), 'utf-8');
      writeFileSync(join(taskDir, 'prompt_used.md'), prompt);

      if (opts.opencodeCommand) {
        // Headless mode: invoke opencode programmatically
        const cmd = opts.opencodeCommand
          .replace('{prompt}', prompt.replace(/'/g, "'\\''"))
          .replace('{workDir}', opts.workDir)
          .replace('{logDir}', taskDir);

        const result = spawn('/bin/sh', ['-c', cmd], {
          cwd: opts.workDir,
          stdio: 'pipe',
        });

        let stdout = '';
        let stderr = '';
        result.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        result.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        await new Promise<void>((resolve, reject) => {
          result.on('close', (code: number) => {
            code === 0 ? resolve() : reject(new Error(`Agent exited with code ${code}`));
          });
        });

        const wallClockMs = Date.now() - startTime;
        const logs = stdout + '\n' + stderr;
        writeFileSync(join(taskDir, 'session.log'), logs);

        // Parse metrics from agent output
        const toolCallCount = (logs.match(/tool_call|Tool call|invoking tool/gi) ?? []).length;
        const tokensIn = extractNumber(logs, /input tokens?[:\s]+(\d+)/i);
        const tokensOut = extractNumber(logs, /output tokens?[:\s]+(\d+)/i);

        // Capture git diff
        const outputDiff = execSync('git diff', { cwd: opts.workDir, encoding: 'utf-8' });
        writeFileSync(join(taskDir, 'output.diff'), outputDiff);

        // List new files
        const newFiles = execSync('git ls-files --others --exclude-standard', {
          cwd: opts.workDir,
          encoding: 'utf-8',
        });
        const outputFiles: Record<string, string> = {};
        for (const f of newFiles.trim().split('\n').filter(Boolean)) {
          try {
            outputFiles[f] = readFileSync(join(opts.workDir, f), 'utf-8');
          } catch { /* binary or deleted */ }
        }

        // Run verify.sh, extract success score
        const success = runVerify(join(task.dir, 'verify.sh'), opts.workDir, taskDir);

        // Parse GBrain tool usage (Group B only)
        const gbrainToolCalls = groupLabel === 'B' ? parseGbrainTools(logs) : undefined;

        return {
          taskId: task.id,
          group: groupLabel,
          success,
          toolCallCount,
          wallClockMs,
          tokensIn,
          tokensOut,
          outputDiff,
          outputFiles,
          logs,
          gbrainToolCalls,
        };
      } else {
        // Interactive mode: prepare environment, pause for manual run
        writeFileSync(join(taskDir, 'INSTRUCTIONS.md'),
          `# Task: ${task.id} — Group ${groupLabel}\n\n` +
          `Working directory: ${opts.workDir}\n\n` +
          `## Prompt\n\n${prompt}\n\n` +
          `## Steps\n` +
          `1. Start opencode in directory ${opts.workDir}\n` +
          `2. Paste the prompt above\n` +
          `3. Let the agent work until it declares completion\n` +
          `4. Save the session transcript to: ${join(taskDir, 'session.log')}\n` +
          `5. Run: touch ${join(taskDir, 'DONE')}\n`);

        console.log(`\n[${groupLabel}] Task ${task.id} ready.`);
        console.log(`  Work dir: ${opts.workDir}`);
        console.log(`  Instructions: ${join(taskDir, 'INSTRUCTIONS.md')}`);
        console.log(`  Waiting for: ${join(taskDir, 'DONE')}`);

        // Poll for DONE file
        const doneFile = join(taskDir, 'DONE');
        while (!existsSync(doneFile)) {
          await new Promise(r => setTimeout(r, 5000));
        }

        const wallClockMs = Date.now() - startTime;
        // In interactive mode, metrics come from the saved session log
        const logs = existsSync(join(taskDir, 'session.log'))
          ? readFileSync(join(taskDir, 'session.log'), 'utf-8')
          : '';
        const toolCallCount = (logs.match(/tool_call|Tool call|invoking tool/gi) ?? []).length;
        const tokensIn = extractNumber(logs, /input tokens?[:\s]+(\d+)/i);
        const tokensOut = extractNumber(logs, /output tokens?[:\s]+(\d+)/i);
        const outputDiff = execSync('git diff', { cwd: opts.workDir, encoding: 'utf-8' });
        const success = runVerify(join(task.dir, 'verify.sh'), opts.workDir, taskDir);
        const gbrainToolCalls = groupLabel === 'B' ? parseGbrainTools(logs) : undefined;

        return {
          taskId: task.id,
          group: groupLabel,
          success,
          toolCallCount,
          wallClockMs,
          tokensIn,
          tokensOut,
          outputDiff,
          outputFiles: {},
          logs,
          gbrainToolCalls,
        };
      }
    },

    async teardown(): Promise<void> {
      // Restore original opencode config
      if (originalConfigBackup !== null) {
        writeFileSync(OPENCODE_CONFIG_PATH, originalConfigBackup);
      }
      // Reset working directory
      execSync('git checkout -- . && git clean -fd', { cwd: opts.workDir, stdio: 'pipe' });
    },
  };
}

function extractNumber(text: string, pattern: RegExp): number {
  const m = text.match(pattern);
  return m ? parseInt(m[1], 10) : 0;
}

function runVerify(verifyScript: string, workDir: string, logDir: string): number {
  try {
    const out = execSync(`bash ${verifyScript}`, {
      cwd: workDir,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120_000,
    });
    writeFileSync(join(logDir, 'verify_stdout.txt'), out);
    return 1.0;
  } catch (e: unknown) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    writeFileSync(join(logDir, 'verify_stdout.txt'), (err.stdout ?? '') + '\n' + (err.stderr ?? ''));
    if (err.code === 2) return 0.5;  // partial pass per verify.sh contract
    return 0.0;
  }
}

function parseGbrainTools(logs: string): Record<string, number> {
  const tools = ['search', 'query', 'get_page', 'put_page', 'list_pages', 'get_backlinks',
    'traverse_graph', 'resolve_slugs', 'file_list', 'get_ingest_log', 'get_stats', 'get_health'];
  const counts: Record<string, number> = {};
  for (const tool of tools) {
    const re = new RegExp(`"method":"tools/call"[^}]*"name":"${tool}"`, 'gi');
    const matches = logs.match(re);
    if (matches) counts[tool] = matches.length;
  }
  return counts;
}
```

- [ ] **Step 3: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/runner/agent-runner.ts benchmarks/opencode-vs-gbrain/config/
git commit -m "feat: agent runner — opencode adapter with headless and interactive modes"
```

---

### Task 5: Write Report Generator

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/runner/report.ts`

- [ ] **Step 1: Write report.ts**

Write `benchmarks/opencode-vs-gbrain/runner/report.ts`:

```typescript
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchmarkReport, TaskScores, ToolHeatmapEntry } from './types';

function mdTable(headers: string[], rows: string[][]): string {
  const h = '| ' + headers.join(' | ') + ' |';
  const sep = '|' + headers.map(() => '---').join('|') + '|';
  const body = rows.map(r => '| ' + r.join(' | ') + ' |').join('\n');
  return [h, sep, body].join('\n');
}

function pct(v: number): string {
  return (v * 100).toFixed(0) + '%';
}

function f2(v: number): string {
  return v.toFixed(2);
}

export function generateReport(report: BenchmarkReport): string {
  const { meta, summary, tasks, toolHeatmap } = report;

  const lines: string[] = [];

  lines.push('══════════════════════════════════════════════════════');
  lines.push('  OpenCode + GBrain Benchmark Report');
  lines.push(`  Project: ${meta.project} (${meta.projectCommit.slice(0, 7)})`);
  lines.push(`  Date: ${meta.date}`);
  lines.push(`  OpenCode: ${meta.opencodeVersion}`);
  lines.push(`  GBrain: ${meta.gbrainVersion}`);
  lines.push('══════════════════════════════════════════════════════');
  lines.push('');
  lines.push('                Group A            Group B          Delta');
  lines.push('                (bare opencode)    (opencode+GBrain)');
  lines.push('─────────────────────────────────────────────────────');
  lines.push(`Success rate     ${pct(summary.groupA.successRate)}              ${pct(summary.groupB.successRate)}              ${delta(summary.deltas.success)}`);
  lines.push(`Efficiency       ${f2(summary.groupA.efficiencyScore)}                ${f2(summary.groupB.efficiencyScore)}                ${delta(summary.deltas.efficiency)}`);
  lines.push(`Quality (norm)   ${f2(summary.groupA.qualityScore)}                ${f2(summary.groupB.qualityScore)}                ${delta(summary.deltas.quality)}`);
  lines.push('─────────────────────────────────────────────────────');
  lines.push(`Composite        ${f2(summary.groupA.compositeScore)}                ${f2(summary.groupB.compositeScore)}                ${delta(summary.deltas.composite)}`);
  lines.push('');

  // Per-task table
  const taskHeaders = ['#', 'Task', 'Type', 'A OK', 'B OK', 'A rounds', 'B rounds', 'Δ rounds', 'A qual', 'B qual'];
  const taskRows = tasks.map(t => [
    t.taskId,
    t.taskName,
    t.type,
    pct(t.aSuccess),
    pct(t.bSuccess),
    String(t.aRounds),
    String(t.bRounds),
    (t.deltaRoundsPct >= 0 ? '+' : '') + t.deltaRoundsPct.toFixed(0) + '%',
    f2(t.aQuality),
    f2(t.bQuality),
  ]);
  lines.push('## Per-Task Results');
  lines.push('');
  lines.push(mdTable(taskHeaders, taskRows));
  lines.push('');

  // Tool heatmap
  if (toolHeatmap.length > 0) {
    lines.push('## GBrain Tool Usage (Group B)');
    lines.push('');
    const toolHeaders = ['Tool', 'Calls', 'Tasks'];
    const toolRows = toolHeatmap.map(t => [t.tool, String(t.calls), String(t.tasksCovered)]);
    lines.push(mdTable(toolHeaders, toolRows));
    lines.push('');
  }

  return lines.join('\n');
}

function delta(d: number): string {
  const prefix = d >= 0 ? '+' : '';
  return prefix + (d * 100).toFixed(0) + '%';
}

export function saveReport(report: BenchmarkReport, resultsDir: string): string {
  const md = generateReport(report);
  const path = join(resultsDir, 'report.md');
  writeFileSync(path, md);
  return path;
}
```

- [ ] **Step 2: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/runner/report.ts
git commit -m "feat: report generator — markdown A/B comparison output"
```

---

### Task 6: Write Main Scheduler (run.ts)

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/runner/run.ts`

- [ ] **Step 1: Write run.ts**

Write `benchmarks/opencode-vs-gbrain/runner/run.ts`:

```typescript
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
const OPENCODE_CMD = process.env.OPENCODE_CMD; // e.g. "opencode run --prompt '{prompt}'"
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
```

- [ ] **Step 2: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/runner/run.ts
git commit -m "feat: main scheduler — group orchestration, scoring, and report generation"
```

---

### Task 7: Create Task Definitions (Tasks 1-2: fix_bug)

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/prompt.md`
- Create: `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/seed.patch`
- Create: `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/verify.sh`
- Create: `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/ground_truth.md`
- Create: `benchmarks/opencode-vs-gbrain/tasks/02_fix_route_param_type/` (same 4 files)

This task requires the Starlette repo cloned at the locked commit to generate accurate patches. The plan documents the content and generation method; the implementer runs the `git diff` commands to produce the actual patches.

- [ ] **Step 1: Clone Starlette and lock commit**

```bash
STARLETTE_COMMIT=$(curl -s https://api.github.com/repos/encode/starlette/git/refs/heads/master | jq -r .object.sha)
git clone https://github.com/encode/starlette /tmp/starlette-bench
cd /tmp/starlette-bench
git checkout "$STARLETTE_COMMIT"
echo "$STARLETTE_COMMIT" > /tmp/starlette-bench-commit.txt
```

Record the commit SHA for reproducibility.

- [ ] **Step 2: Create Task 1 — fix_middleware_order seed.patch**

The seed patch introduces a bug: middleware added via `add_middleware()` is inserted at position 0 (before existing middleware) instead of being appended to the end. This causes custom headers set by user middleware to be overwritten by later middleware, or the custom middleware's headers to not appear because Starlette's built-in middleware runs after and doesn't propagate them.

In `starlette/applications.py`, modify the middleware building logic to reverse the order. The exact change will be:

```python
# In Starlette.__init__, find where self.middleware_stack is built
# and reverse the middleware list before building the stack
```

Create the seed.patch by making the change and running:
```bash
cd /tmp/starlette-bench
# Make the bug-introducing change
git diff > benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/seed.patch
git checkout -- .
```

Write `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/prompt.md`:

```markdown
# Task: Fix Middleware Execution Order

In this Starlette application, a custom middleware that adds security headers (`X-Frame-Options: DENY`) has been registered, but the header is missing from HTTP responses.

## Your Task

1. Investigate why `X-Frame-Options` is not appearing in responses
2. Fix the middleware execution order so custom middleware headers are properly included
3. Verify the fix by ensuring the existing test suite passes

## Constraints

- Do not modify the middleware itself — the bug is in how Starlette builds the middleware stack
- All existing tests in `tests/test_middleware.py` must pass
- The fix should be minimal — a few lines at most

## Expected Outcome

After the fix, any middleware added via `app.add_middleware()` should have its response headers propagated correctly in the final HTTP response.
```

Write `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/verify.sh`:

```bash
#!/bin/bash
set -euo pipefail

PARTIAL=0

# Test 1: Basic middleware header propagation
echo "=== Test 1: Middleware header propagation ==="
cat > /tmp/test_mw_app.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

class SecurityHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        return response

app = Starlette()
app.add_middleware(SecurityHeaderMiddleware)

@app.route("/")
def home(request):
    return PlainTextResponse("ok")

client = TestClient(app)
resp = client.get("/")
assert resp.headers.get("x-frame-options") == "DENY", f"Expected x-frame-options=DENY, got {resp.headers.get('x-frame-options')}"
print("PASS: Security header present")
PYEOF
python /tmp/test_mw_app.py || { echo "FAIL: Header test"; PARTIAL=2; }

# Test 2: Multiple middleware order
echo "=== Test 2: Multiple middleware order ==="
cat > /tmp/test_mw_order.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

order = []

class FirstMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        order.append("first_in")
        resp = await call_next(request)
        order.append("first_out")
        return resp

class SecondMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        order.append("second_in")
        resp = await call_next(request)
        order.append("second_out")
        return resp

app = Starlette()
app.add_middleware(FirstMiddleware)
app.add_middleware(SecondMiddleware)

@app.route("/")
def home(request):
    order.append("handler")
    return PlainTextResponse("ok")

client = TestClient(app)
client.get("/")
expected = ["second_in", "first_in", "handler", "first_out", "second_out"]
assert order == expected, f"Expected {expected}, got {order}"
print("PASS: Middleware order correct")
PYEOF
python /tmp/test_mw_order.py || { echo "FAIL: Order test"; PARTIAL=2; }

# Test 3: Existing test suite
echo "=== Test 3: Existing middleware tests ==="
cd /tmp/starlette-bench
python -m pytest tests/test_middleware.py -x -q || { echo "FAIL: Existing tests"; PARTIAL=2; }

exit $PARTIAL
```

Write `benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/ground_truth.md`:

```markdown
# Ground Truth: fix_middleware_order

## Root Cause

The bug is in `starlette/applications.py` where the middleware stack is built. The user's middleware is being added at the wrong position or the stack is being built in reverse order.

Specifically, in the `Starlette.__init__` method, `self.middleware_stack` is built from `self.user_middleware` but the order is incorrect — either the list is iterated in reverse or the first middleware is treated as the outermost.

## Correct Fix

In `starlette/applications.py`, ensure that `user_middleware` is iterated in the order they were added (first added = outermost, last added = innermost, closest to the endpoint). The Starlette app itself should be the innermost ASGI app.

The fix should be:
1. Locate where `self.middleware_stack` is built (typically using `ServerErrorMiddleware` and `ExceptionMiddleware` wrapping)
2. Ensure user middleware are applied in FIFO order (first-registered is outermost)
3. The stack should be: `ServerErrorMiddleware -> user_mw[0] -> user_mw[1] -> ... -> ExceptionMiddleware -> app_router`

## Key Files
- `starlette/applications.py`: Starlette class init, middleware stack construction

## Verification
- Security header middleware must have its headers in the final response
- Multiple middleware must execute in correct onion order
- All existing tests must pass
```

- [ ] **Step 3: Create Task 2 — fix_route_param_type**

Write `benchmarks/opencode-vs-gbrain/tasks/02_fix_route_param_type/prompt.md`:

```markdown
# Task: Fix Route Parameter Type Conversion

A Starlette route defined with `{item_id:int}` is passing the parameter as a string to the view function instead of an integer.

## Your Task

1. Investigate the route parameter type conversion pipeline
2. Find where the int convertor is not being applied
3. Fix the bug so `{param:int}` correctly passes an integer to the view function
4. Verify the fix with the existing convertor tests

## Constraints

- Do not change the route definition syntax
- All existing tests in `tests/test_routing.py` must pass, especially convertor-related tests
- The fix should preserve all existing convertor types (int, float, uuid, path)

## Expected Outcome

After the fix, `{item_id:int}` in a route path should result in `item_id` being an `int` in the view function's keyword arguments.
```

Write `benchmarks/opencode-vs-gbrain/tasks/02_fix_route_param_type/verify.sh`:

```bash
#!/bin/bash
set -euo pipefail

echo "=== Test: Int convertor ==="
cat > /tmp/test_convertor.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.testclient import TestClient
from starlette.responses import JSONResponse

async def get_item(request):
    item_id = request.path_params["item_id"]
    return JSONResponse({"id": item_id, "type": type(item_id).__name__})

app = Starlette(routes=[
    Route("/items/{item_id:int}", get_item),
])

client = TestClient(app)
resp = client.get("/items/42")
data = resp.json()
assert data["id"] == 42, f"Expected id=42, got {data['id']}"
assert data["type"] == "int", f"Expected type=int, got {data['type']}"
print("PASS: int convertor works")
PYEOF
python /tmp/test_convertor.py || { echo "FAIL"; exit 1; }

echo "=== Test: Existing routing tests ==="
cd /tmp/starlette-bench
python -m pytest tests/test_routing.py -k "convertor" -x -q || { echo "FAIL: Existing convertor tests"; exit 1; }

exit 0
```

Write `benchmarks/opencode-vs-gbrain/tasks/02_fix_route_param_type/ground_truth.md`:

```markdown
# Ground Truth: fix_route_param_type

## Root Cause

In `starlette/routing.py`, when path parameters are extracted from a matched URL, the convertor's `to_python()` result may be discarded or the raw string from the regex match is used instead of the converted value.

## Correct Fix

In `starlette/routing.py`, locate the `Match` or parameter extraction logic in `BaseRoute` or `Route`. Ensure that after regex matching extracts parameter values as strings, each value is passed through the corresponding convertor's `to_python()` method before being stored in `path_params`.

The fix location is typically in the `matches()` method or wherever `path_params` is populated from regex match groups.

## Key Files
- `starlette/routing.py`: Route.matches(), parameter extraction
- `starlette/convertors.py`: Convertor definitions (int, float, uuid, path)

## Verification
- `{param:int}` must produce an int in path_params
- All other convertor types must continue to work
- Existing convertor tests must pass
```

The `seed.patch` for Task 2 will be generated by introducing a deliberate bug in the parameter extraction logic, then running `git diff`.

- [ ] **Step 4: Generate and validate seed patches**

```bash
cd /tmp/starlette-bench

# Task 1: Introduce middleware order bug
# (specific implementation determined by reading starlette/applications.py)
# Save the patch
git diff > /path/to/gbrain/benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/seed.patch

# Task 2: Introduce convertor bypass bug
# (specific implementation determined by reading starlette/routing.py)
git diff > /path/to/gbrain/benchmarks/opencode-vs-gbrain/tasks/02_fix_route_param_type/seed.patch
```

- [ ] **Step 5: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/tasks/01_fix_middleware_order/ \
        benchmarks/opencode-vs-gbrain/tasks/02_fix_route_param_type/
git commit -m "feat: task definitions 1-2 — fix_bug tasks for middleware order and route params"
```

---

### Task 8: Create Task Definitions (Tasks 3-4: add_feature)

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/tasks/03_add_streaming_middleware/` (4 files)
- Create: `benchmarks/opencode-vs-gbrain/tasks/04_add_custom_router_match/` (4 files)

- [ ] **Step 1: Create Task 3 — add_streaming_middleware**

Write `benchmarks/opencode-vs-gbrain/tasks/03_add_streaming_middleware/prompt.md`:

```markdown
# Task: Add Streaming Response Chunk Counter Middleware

Starlette needs a new middleware that counts chunks in streaming responses.

## Your Task

1. Create a new middleware class `ChunkCounterMiddleware` in the appropriate location
2. The middleware should count the number of chunks in `StreamingResponse` bodies
3. Log the chunk count using Python's `logging` module at INFO level after the response completes
4. Write tests covering: zero chunks, single chunk, and large number of chunks (>10)

## Constraints

- Follow existing middleware patterns in `starlette/middleware/`
- The middleware should not buffer the entire response — count on the fly
- All existing tests must continue to pass
- The new middleware must work with both sync and async streaming iterators

## Expected Outcome

A working `ChunkCounterMiddleware` that:
- Wraps the response's streaming body iterator
- Counts each yielded chunk
- Logs the total at INFO level after the stream completes
- Has passing tests
```

Write `benchmarks/opencode-vs-gbrain/tasks/03_add_streaming_middleware/verify.sh`:

```bash
#!/bin/bash
set -euo pipefail

echo "=== Test 1: Zero chunks ==="
cat > /tmp/test_chunk_0.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.testclient import TestClient
import logging, io

# Capture log
log_stream = io.StringIO()
handler = logging.StreamHandler(log_stream)
handler.setLevel(logging.INFO)
logging.getLogger("starlette").addHandler(handler)

async def empty_stream():
    # yields nothing
    pass

app = Starlette()
# Will import ChunkCounterMiddleware once created
# app.add_middleware(ChunkCounterMiddleware)

@app.route("/empty")
def home(request):
    return StreamingResponse(empty_stream())

client = TestClient(app)
resp = client.get("/empty")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count in logs: {log_output}"
print("PASS: Zero chunk test")
PYEOF
python /tmp/test_chunk_0.py || { echo "FAIL: zero chunks"; exit 1; }

echo "=== Test 2: Single chunk ==="
cat > /tmp/test_chunk_1.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.testclient import TestClient
import logging, io

log_stream = io.StringIO()
handler = logging.StreamHandler(log_stream)
handler.setLevel(logging.INFO)
logging.getLogger("starlette").addHandler(handler)

async def single_chunk():
    yield b"hello"

app = Starlette()
# app.add_middleware(ChunkCounterMiddleware)
@app.route("/single")
def home(request):
    return StreamingResponse(single_chunk())

client = TestClient(app)
resp = client.get("/single")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count: {log_output}"
print("PASS: Single chunk test")
PYEOF
python /tmp/test_chunk_1.py || { echo "FAIL: single chunk"; exit 1; }

echo "=== Test 3: Multiple chunks (>10) ==="
cat > /tmp/test_chunk_many.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.testclient import TestClient
import logging, io

log_stream = io.StringIO()
handler = logging.StreamHandler(log_stream)
handler.setLevel(logging.INFO)
logging.getLogger("starlette").addHandler(handler)

async def many_chunks():
    for i in range(20):
        yield f"chunk{i:02d}".encode()

app = Starlette()
# app.add_middleware(ChunkCounterMiddleware)
@app.route("/many")
def home(request):
    return StreamingResponse(many_chunks())

client = TestClient(app)
resp = client.get("/many")
log_output = log_stream.getvalue()
assert "chunk" in log_output.lower(), f"No chunk count: {log_output}"
print("PASS: Multiple chunks test")
PYEOF
python /tmp/test_chunk_many.py || { echo "FAIL: multiple chunks"; exit 1; }

echo "=== Test 4: Existing tests ==="
cd /tmp/starlette-bench
python -m pytest tests/test_middleware.py -x -q || { echo "FAIL"; exit 1; }
exit 0
```

Write `benchmarks/opencode-vs-gbrain/tasks/03_add_streaming_middleware/ground_truth.md`:

```markdown
# Ground Truth: add_streaming_middleware

## Correct Implementation

Create `starlette/middleware/chunk_counter.py`:

```python
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse

logger = logging.getLogger("starlette.middleware.chunk_counter")

class ChunkCounterMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if isinstance(response, StreamingResponse):
            original_iterator = response.body_iterator
            count = 0

            async def counting_iterator():
                nonlocal count
                async for chunk in original_iterator:
                    count += 1
                    yield chunk
                logger.info(f"Streaming response chunk count: {count}")

            response.body_iterator = counting_iterator()
        return response
```

## Key Points
- Must use isinstance check on response, not on body_iterator
- Must re-assign body_iterator so the counting wrapper is used
- Log after stream completes (after the loop), not before
- Follow existing middleware conventions in the codebase
```

The `seed.patch` for Task 3 is an empty patch (no bug to introduce — this is a greenfield feature addition), or a minimal scaffold:
```diff
# Empty or just a TODO comment in middleware __init__.py
```

- [ ] **Step 2: Create Task 4 — add_custom_router_match**

Write `benchmarks/opencode-vs-gbrain/tasks/04_add_custom_router_match/prompt.md`:

```markdown
# Task: Add Header-Based Route Matching

Starlette currently only matches routes by URL path. You need to extend it to support header-based matching, specifically matching on the `Accept-Version` header.

## Your Task

1. Extend the routing system to support an optional `headers` parameter on Route
2. When a Route has a `headers` constraint, it should only match if all specified headers match the request
3. If no Route matches with header constraints, fall back to the first path-only matching route
4. Maintain full backward compatibility — existing routes without headers must work unchanged

## API Design

```python
from starlette.routing import Route

# New: header-constrained route
Route("/api/data", endpoint_v2, methods=["GET"], headers={"Accept-Version": "v2"})

# Existing: no headers, matches any request to /api/data
Route("/api/data", endpoint_v1, methods=["GET"])
```

## Constraints

- Do not change the `Route` constructor signature in a breaking way
- All existing routing tests must pass
- Write at least one test demonstrating header-based routing

## Expected Outcome

Requests with `Accept-Version: v2` header go to the header-constrained route, while requests without that header go to the default route.
```

Write `benchmarks/opencode-vs-gbrain/tasks/04_add_custom_router_match/verify.sh`:

```bash
#!/bin/bash
set -euo pipefail

echo "=== Test 1: Header-based routing ==="
cat > /tmp/test_header_route.py << 'PYEOF'
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

async def v1(request):
    return PlainTextResponse("v1")

async def v2(request):
    return PlainTextResponse("v2")

app = Starlette(routes=[
    Route("/api/data", v2, methods=["GET"], headers={"Accept-Version": "v2"}),
    Route("/api/data", v1, methods=["GET"]),
])

client = TestClient(app)

# Header match
resp = client.get("/api/data", headers={"Accept-Version": "v2"})
assert resp.text == "v2", f"Expected v2, got {resp.text}"

# No header -> fallback
resp = client.get("/api/data")
assert resp.text == "v1", f"Expected v1, got {resp.text}"

print("PASS: Header routing works")
PYEOF
python /tmp/test_header_route.py || { echo "FAIL"; exit 1; }

echo "=== Test 2: Backward compatibility ==="
cd /tmp/starlette-bench
python -m pytest tests/test_routing.py -x -q || { echo "FAIL: Existing routing tests"; exit 1; }

exit 0
```

Write `benchmarks/opencode-vs-gbrain/tasks/04_add_custom_router_match/ground_truth.md`:

```markdown
# Ground Truth: add_custom_router_match

## Correct Implementation

### 1. Extend Route.__init__ in `starlette/routing.py`

Add optional `headers` parameter:
```python
class Route(BaseRoute):
    def __init__(self, path, endpoint, *, methods=None, name=None,
                 include_in_schema=True, headers=None, ...):
        self.headers = headers  # dict or None
```

### 2. Extend Route.matches()

After path matching succeeds, check headers:
```python
def matches(self, scope):
    if not self.path_matches(scope):
        return Match.NONE
    if self.headers:
        for key, value in self.headers.items():
            # HTTP headers in scope are lowercase bytes
            header_key = key.lower().encode()
            request_value = scope.get("headers", {}).get(header_key, b"").decode()
            if request_value != value:
                return Match.NONE
    return Match.FULL  # path_params from regex
```

### Key Points
- Headers in ASGI scope are lowercase bytes; compare accordingly
- Header mismatches should return Match.NONE, allowing fallback to next route
- Route ordering matters: more specific routes (with headers) should be listed first
```

The `seed.patch` for Task 4 is empty (greenfield feature).

- [ ] **Step 3: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/tasks/03_add_streaming_middleware/ \
        benchmarks/opencode-vs-gbrain/tasks/04_add_custom_router_match/
git commit -m "feat: task definitions 3-4 — add_feature tasks for streaming middleware and header routing"
```

---

### Task 9: Create Task Definitions (Tasks 5-6: understand)

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/tasks/05_understand_request_lifecycle/` (4 files)
- Create: `benchmarks/opencode-vs-gbrain/tasks/06_understand_middleware_routing/` (4 files)

- [ ] **Step 1: Create Task 5 — understand_request_lifecycle**

Write `benchmarks/opencode-vs-gbrain/tasks/05_understand_request_lifecycle/prompt.md`:

```markdown
# Task: Document the Starlette Request Lifecycle

Trace and document the complete lifecycle of an HTTP request in Starlette.

## Your Task

Trace a `GET /api/users` request from the moment it arrives at the ASGI server to the moment the HTTP response is sent back. Specifically:

1. List every module, class, and method involved, in order
2. Draw the call sequence (text-based diagram is fine)
3. Note where middleware hooks execute (before_request, after_request)
4. Note where exception handling intercepts errors
5. Check if this flow is documented in `docs/`. If not, add a new `docs/request-lifecycle.md`

## Expected Output Format

A markdown document (added to `docs/request-lifecycle.md` if missing) containing:

- **Sequence Diagram**: Text-based call flow
- **Key Classes**: Table of class → role
- **Extension Points**: Where middleware, exception handlers, and lifespan hooks plug in
```

Write `benchmarks/opencode-vs-gbrain/tasks/05_understand_request_lifecycle/verify.sh`:

```bash
#!/bin/bash
# This is an understand task; verification is done by LLM-as-judge.
# This script checks that the output document exists and is non-empty.
set -euo pipefail
DOC="/tmp/starlette-bench/docs/request-lifecycle.md"

if [ -f "$DOC" ]; then
  LINES=$(wc -l < "$DOC")
  if [ "$LINES" -gt 20 ]; then
    echo "PASS: request-lifecycle.md created with $LINES lines"
    exit 0
  else
    echo "PARTIAL: document too short ($LINES lines)"
    exit 2
  fi
else
  echo "PARTIAL: no docs/request-lifecycle.md found — analysis may be in agent session output"
  exit 2
fi
```

Write `benchmarks/opencode-vs-gbrain/tasks/05_understand_request_lifecycle/ground_truth.md`:

```markdown
# Ground Truth: understand_request_lifecycle

## Key Nodes (must cover >=80% of these for pass)

1. **ASGI server** (uvicorn) receives TCP connection, parses HTTP, builds ASGI scope
2. **Starlette.__call__** (applications.py) — ASGI entry point, wraps everything
3. **ServerErrorMiddleware** — outermost, catches unhandled exceptions, returns 500
4. **User middleware stack** — in registration order (first=outermost)
5. **ExceptionMiddleware** — catches HTTPException, returns error responses
6. **Router.__call__** (routing.py) — matches URL to Route
7. **Route.matches()** — regex match, extract path_params
8. **Route.__call__** — build Request, call endpoint, await Response
9. **Request** (requests.py) — wraps ASGI scope, lazy body read
10. **Endpoint function** — user's view function
11. **Response.render()** — serialize body, set headers
12. **Middleware after_request** — in reverse order (last=outermost), wrap response
13. **Response.__call__** — ASGI send protocol (headers, body chunks)
14. **StreamingResponse.body_iterator** — for streaming, yields chunks

## Expected Coverage Categories

- Request ingestion (ASGI → Starlette)
- Middleware onion (outer → inner → outer)
- Route matching lifecycle
- Request object construction
- Response rendering pipeline
- Exception handling path
- Streaming vs non-streaming divergence
```

The `seed.patch` for Task 5 is empty (analysis task, no code modification needed).

- [ ] **Step 2: Create Task 6 — understand_middleware_routing_interaction**

Write `benchmarks/opencode-vs-gbrain/tasks/06_understand_middleware_routing/prompt.md`:

```markdown
# Task: Analyze Middleware Behavior on 404 Routes

## Your Task

Analyze how Starlette's middleware stack behaves when a route is not found (404):

1. Does `after_request` in custom middleware still execute when routing returns 404?
2. What is the execution order of `ExceptionMiddleware` vs custom middleware in this case?
3. How would you modify a custom middleware so it can observe and log 404 responses?

## Expected Output

A markdown analysis document covering:

- The call flow when routing fails (HTTP 404)
- Which middleware run and which are skipped
- Whether ExceptionMiddleware handles the 404 or the Router handles it directly
- A concrete code example showing how to make a custom middleware see 404s
```

Write `benchmarks/opencode-vs-gbrain/tasks/06_understand_middleware_routing/ground_truth.md`:

```markdown
# Ground Truth: understand_middleware_routing_interaction

## Correct Analysis

### 404 Flow

1. Router.matches() returns Match.NONE or Match.PARTIAL for all routes
2. In newer Starlette, Router.__call__ returns 404 response directly (not an exception)
3. This means custom middleware's `await call_next(request)` returns a 404 response (NOT a raised exception)
4. Custom middleware's after_request code DOES execute on 404
5. ExceptionMiddleware is NOT triggered because no exception is raised

### Why This Matters

If a custom middleware wraps `call_next()` in try/except to catch HTTPException, it will NOT catch 404 — because 404 is returned as a normal Response, not raised as an exception.

### Making Middleware See 404s

Since 404 is a normal response with status_code=404, middleware can check:
```python
response = await call_next(request)
if response.status_code == 404:
    logger.info(f"404: {request.url.path}")
return response
```

## Key Files
- `starlette/routing.py`: Router.__call__, how 404 is handled
- `starlette/middleware/errors.py`: ExceptionMiddleware, what it catches
- `starlette/exceptions.py`: HTTPException definition
```

The `seed.patch` for Task 6 is empty.

Write `benchmarks/opencode-vs-gbrain/tasks/06_understand_middleware_routing/verify.sh`:

```bash
#!/bin/bash
# This is an understand task; presence of analysis output is verified by LLM-as-judge.
# This script does a minimal existence check.
set -euo pipefail
# The runner captures session output; the judge does the real evaluation.
# Mark as partial to defer to judge scoring.
echo "INFO: understand task — verification deferred to LLM-as-judge"
exit 2
```

- [ ] **Step 3: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/tasks/05_understand_request_lifecycle/ \
        benchmarks/opencode-vs-gbrain/tasks/06_understand_middleware_routing/
git commit -m "feat: task definitions 5-6 — understand tasks for request lifecycle and middleware/404"
```

---

### Task 10: Create Task Definitions (Tasks 7-8: refactor + write_test)

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/tasks/07_refactor_route_match/` (4 files)
- Create: `benchmarks/opencode-vs-gbrain/tasks/08_write_test_middleware_stack/` (4 files)

- [ ] **Step 1: Create Task 7 — refactor_route_match**

Write `benchmarks/opencode-vs-gbrain/tasks/07_refactor_route_match/prompt.md`:

```markdown
# Task: Refactor Route Matching Logic

The `BaseRoute.matches()` and related methods in `starlette/routing.py` have grown complex. You need to refactor the matching logic into clearer, separate responsibilities without changing behavior.

## Your Task

1. Study the current route matching code in `starlette/routing.py`
2. Extract three clear responsibilities into separate methods:
   - `_match_path(scope)` — URL pattern matching, returns params or None
   - `_extract_params(match)` — convert matched groups to typed path_params via convertors
   - `_build_match(scope, path_params)` — assemble the final Match result
3. Add docstrings to each new method
4. Ensure all existing tests in `tests/test_routing.py` pass

## Constraints

- No public API changes — existing code that uses `Route` and `Router` must work unchanged
- All existing routing tests must pass
- The refactoring must be a pure structural change with zero behavioral differences
```

Write `benchmarks/opencode-vs-gbrain/tasks/07_refactor_route_match/verify.sh`:

```bash
#!/bin/bash
set -euo pipefail

echo "=== Test: Full routing test suite ==="
cd /tmp/starlette-bench
python -m pytest tests/test_routing.py -x -q || { echo "FAIL: Routing tests"; exit 1; }

echo "=== Test: Import check (API unchanged) ==="
python -c "
from starlette.routing import Route, Router, Mount, Host
from starlette.applications import Starlette
print('All imports OK')
" || { echo "FAIL: Import check"; exit 1; }

exit 0
```

Write `benchmarks/opencode-vs-gbrain/tasks/07_refactor_route_match/ground_truth.md`:

```markdown
# Ground Truth: refactor_route_match

## Expected Refactoring

The `matches()` method in `Route` currently does URL matching AND param extraction AND type conversion in one method. A clean refactoring separates:

1. `_match_path(scope)` — pure regex match against scope["path"], returns regex match object or None
2. `_extract_params(match)` — iterates path_params, applies convertor.to_python() to each, returns dict
3. `matches(scope)` — orchestrates: calls _match_path → _extract_params → returns Match.FULL/NONE

## Quality Indicators

- Each new method has a clear docstring
- Method names are descriptive and consistent with existing Starlette naming
- No logic duplication between old and new code paths
- The refactoring is a structural change, not a rewrite

## Key File
- `starlette/routing.py`: BaseRoute and Route classes
```

The `seed.patch` for Task 7 is empty (refactoring task, code is in its current state).

- [ ] **Step 2: Create Task 8 — write_test_middleware_stack**

Write `benchmarks/opencode-vs-gbrain/tasks/08_write_test_middleware_stack/prompt.md`:

```markdown
# Task: Write Tests for Middleware Stack Behavior

Starlette's middleware tests are missing coverage for several important scenarios.

## Your Task

Add tests to `tests/test_middleware.py` covering these three scenarios:

### 1. Precise Execution Order
Test that when multiple middleware are added, they execute in the correct onion order:
- Outer middleware `before_request` fires first
- Inner middleware `before_request` fires second
- Endpoint handler runs
- Inner middleware `after_request` fires first
- Outer middleware `after_request` fires last

### 2. Exception in Middleware
Test that when a middleware raises an exception, subsequent middleware are skipped and the exception propagates properly:
- Middleware A raises ValueError
- Middleware B is never called
- The exception is caught by ServerErrorMiddleware → 500 response

### 3. Async/Sync Middleware Mixing
Test that async and sync middleware can coexist in the same stack:
- Mix of async dispatch() and sync dispatch() middleware
- All middleware execute in correct order
- No coroutine warnings or runtime errors

## Constraints

- Follow existing test patterns in `tests/test_middleware.py`
- Use `starlette.testclient.TestClient` for HTTP-level assertions
- Tests must pass with `pytest tests/test_middleware.py`
```

Write `benchmarks/opencode-vs-gbrain/tasks/08_write_test_middleware_stack/verify.sh`:

```bash
#!/bin/bash
set -euo pipefail

echo "=== Test: Middleware tests must pass ==="
cd /tmp/starlette-bench
python -m pytest tests/test_middleware.py -x -q || { echo "FAIL"; exit 1; }

echo "=== Test: Three new test functions must exist ==="
python -c "
import ast, sys
with open('tests/test_middleware.py') as f:
    tree = ast.parse(f.read())
test_funcs = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name.startswith('test_')]
# Check for three test functions covering our scenarios
order_test = any('order' in t.lower() for t in test_funcs)
exception_test = any('exception' in t.lower() or 'error' in t.lower() for t in test_funcs)
async_test = any('async' in t.lower() or 'sync' in t.lower() or 'mixed' in t.lower() for t in test_funcs)

if order_test and exception_test and async_test:
    print('PASS: Three test scenarios covered')
    sys.exit(0)
else:
    missing = []
    if not order_test: missing.append('order')
    if not exception_test: missing.append('exception')
    if not async_test: missing.append('async/sync')
    print(f'MISSING tests for: {missing}')
    sys.exit(2)
" || { echo "PARTIAL: Some scenarios not covered"; exit 2; }

exit 0
```

Write `benchmarks/opencode-vs-gbrain/tasks/08_write_test_middleware_stack/ground_truth.md`:

```markdown
# Ground Truth: write_test_middleware_stack

## Expected Tests

### Test 1: test_middleware_execution_order
- Add 3 middleware classes that record order in a list
- Assert the recorded order matches: [outer_before, middle_before, inner_before, handler, inner_after, middle_after, outer_after]
- Use TestClient to make a request

### Test 2: test_middleware_exception_skips_remaining
- Middleware A raises ValueError in dispatch
- Middleware B records that it was called (or not)
- Assert Middleware B was NOT called
- Assert response status is 500

### Test 3: test_async_and_sync_middleware_mixed
- One async middleware (async def dispatch)
- One sync middleware (def dispatch, wrapped by @sync_to_async internally or uses BaseHTTPMiddleware correctly)
- Assert both execute in correct stack order
- Assert no asyncio warnings

## Key File
- `tests/test_middleware.py`: where new tests go
```

The `seed.patch` for Task 8 is empty (tests don't exist yet).

- [ ] **Step 3: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/tasks/07_refactor_route_match/ \
        benchmarks/opencode-vs-gbrain/tasks/08_write_test_middleware_stack/
git commit -m "feat: task definitions 7-8 — refactor route matching and write middleware tests"
```

---

### Task 11: Write Runner Unit Tests

**Files:**
- Create: `benchmarks/opencode-vs-gbrain/runner/run.test.ts`

- [ ] **Step 1: Write tests for metrics and judge modules**

Write `benchmarks/opencode-vs-gbrain/runner/run.test.ts`:

```typescript
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
    // (1 + 0.5 + 0 + 1) / 4 = 0.625
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
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /home/bohuju/self_project/gbrain
bun test benchmarks/opencode-vs-gbrain/runner/run.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add benchmarks/opencode-vs-gbrain/runner/run.test.ts
git commit -m "test: unit tests for metrics normalization and success rate"
```

---

### Task 12: Integration Verification

- [ ] **Step 1: Verify Starlette seed patches apply cleanly**

```bash
cd /tmp/starlette-bench
git checkout -- . && git clean -fd

for task in 01 02; do
  echo "Testing task $task..."
  git apply "/home/bohuju/self_project/gbrain/benchmarks/opencode-vs-gbrain/tasks/${task}_"*/seed.patch
  # Verify the bug is introduced
  bash "/home/bohuju/self_project/gbrain/benchmarks/opencode-vs-gbrain/tasks/${task}_"*/verify.sh
  echo "Task $task seed state verified"
  git checkout -- . && git clean -fd
done
```

Expected: Each seed.patch applies cleanly and verify.sh returns non-zero (bug is present).

- [ ] **Step 2: Dry-run the runner (type checking)**

```bash
cd /home/bohuju/self_project/gbrain
bun build --target bun benchmarks/opencode-vs-gbrain/runner/run.ts --outdir /tmp/bench-build --dry-run 2>&1 || \
  bun run --check benchmarks/opencode-vs-gbrain/runner/run.ts
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: integration verification — seed patch validation and type check"
```

---

## Implementation Notes

### Seed Patch Generation

The seed patches for bug tasks (1, 2) must be generated against the locked Starlette commit. The implementer reads Starlette's actual source code, introduces the specific bug described in each task, and captures `git diff`. Patches for feature/refactor/test tasks (3, 4, 7, 8) are empty — the task itself creates the change. Understand tasks (5, 6) are empty — they produce analysis, not code.

### OpenCode Invocation

If OpenCode does not have a headless CLI mode, set `OPENCODE_CMD` to empty and use the interactive mode: the runner prepares the environment, prints instructions, and waits for a `DONE` file. The human operator runs each task in OpenCode manually, saves the session transcript, and touches `DONE`.

### Locked Commit

The Starlette commit SHA is recorded in the benchmark report and in the implementation notes. Update this when Starlette releases a new version and the seed patches need regenerating. Pin the commit by setting `STARLETTE_COMMIT` env var.

### Judge Model

Default judge model is `claude-sonnet-4-6`. Override with `JUDGE_MODEL` env var. The judge uses `ANTHROPIC_API_KEY` from the environment.
