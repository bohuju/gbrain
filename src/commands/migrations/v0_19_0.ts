/**
 * v0.19.0 migration — GitNexus code import integration.
 *
 * Schema changes:
 *   - code_imports table: tracks GitNexus code graph import runs
 *   - 'code' source row: federated code source for imported pages
 *   - Updated search vector trigger: handles all code_* page types
 *
 * Idempotent: safe to re-run on partial state.
 */

import { execSync } from 'child_process';
import type { Migration, OrchestratorOpts, OrchestratorResult, OrchestratorPhaseResult } from './types.ts';

function runSchemaMigration(): OrchestratorPhaseResult {
  try {
    execSync('gbrain init --migrate-only', { stdio: 'inherit', timeout: 600_000, env: process.env });
    return { name: 'schema', status: 'complete' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: 'schema', status: 'failed', detail: msg };
  }
}

async function orchestrator(opts: OrchestratorOpts): Promise<OrchestratorResult> {
  console.log('');
  console.log('=== v0.19.0 — GitNexus code import integration ===');
  if (opts.dryRun) console.log('  (dry-run; no side effects)');
  console.log('');

  const phases: OrchestratorPhaseResult[] = [];

  if (opts.dryRun) {
    phases.push({ name: 'schema', status: 'skipped', detail: 'dry-run' });
    return { version: '0.19.0', status: 'complete', phases };
  }

  const schema = runSchemaMigration();
  phases.push(schema);

  const status: 'complete' | 'failed' = schema.status === 'failed' ? 'failed' : 'complete';

  return { version: '0.19.0', status, phases };
}

export const v0_19_0: Migration = {
  version: '0.19.0',
  featurePitch: {
    headline: 'GitNexus integration: import code knowledge graphs into GBrain. Query code structure alongside your knowledge pages.',
    description:
      'v0.19.0 adds the code_imports table and "code" source, enabling the GitNexus ' +
      'code import pipeline (gbrain code import). New MCP tools — code_query, ' +
      'code_context, code_impact, code_list_repos — provide code intelligence ' +
      'alongside existing GBrain operations.',
  },
  orchestrator,
};
