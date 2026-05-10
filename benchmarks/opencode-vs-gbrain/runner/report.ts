import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchmarkReport } from './types';

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
