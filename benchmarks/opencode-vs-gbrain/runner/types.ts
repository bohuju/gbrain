// === Task definitions ===

export type TaskType = 'fix_bug' | 'add_feature' | 'understand' | 'refactor' | 'write_test';

export interface TaskDef {
  id: string;
  name: string;
  type: TaskType;
  /** Absolute path to the task directory */
  dir: string;
  /** List of file/directory paths within the project that the task touches */
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
  /** Min-max normalized tool-call rounds [0,1], higher is better. Normalized by pooling A+B results for the same task. */
  roundsNorm: number;
  /** Min-max normalized wall-clock time [0,1], higher is better. Normalized by pooling A+B results for the same task. */
  timeNorm: number;
  /** Min-max normalized token usage [0,1], higher is better. Normalized by pooling A+B results for the same task. */
  tokensNorm: number;
  /** Weighted composite: 0.4*roundsNorm + 0.3*timeNorm + 0.3*tokensNorm */
  score: number;
}

// === Quality scoring ===

export interface QualityDimensionScores {
  /** Correctness rating on a 1-5 scale */
  correctness: number;
  /** Code style rating on a 1-5 scale */
  style: number;
  /** Edge-case handling rating on a 1-5 scale */
  edgeHandling: number;
  /** Simplicity rating on a 1-5 scale */
  simplicity: number;
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
  /** Number of distinct tasks that used this tool at least once */
  tasksCovered: number;
}

export interface BenchmarkReport {
  meta: {
    /** GitHub repo path, e.g. "encode/starlette" */
    project: string;
    /** Full commit SHA of the project at benchmark time */
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
