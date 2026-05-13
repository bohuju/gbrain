import type { BrainEngine } from '../core/engine';
import { runCodeImport } from '../core/import-code';

export async function runCodeCommand(engine: BrainEngine, args: string[]) {
  const subCmd = args[0];

  if (subCmd === 'import') {
    const repoPath = args[1] || process.cwd();
    const force = args.includes('--force') || args.includes('-f');
    const noEmbed = args.includes('--no-embed');
    const reindex = args.includes('--reindex');

    console.log(`Importing GitNexus index from: ${repoPath}`);
    if (reindex) console.log('  (--reindex: running gitnexus analyze first)');

    const result = await runCodeImport(engine, {
      repoPath,
      force,
      embed: !noEmbed,
      reindex,
    });

    if (result.status === 'up_to_date') {
      console.log(`\nUp to date (commit ${result.repoCommit.slice(0, 7)}). Use --force to re-import.`);
      return;
    }
    if (result.status === 'failed') {
      console.error('\nImport failed. Check logs.');
      process.exit(1);
    }

    console.log(`\nImport complete:`);
    console.log(`  Repo:     ${result.repoName} (${result.repoCommit.slice(0, 7)})`);
    console.log(`  Nodes:    ${result.nodesTotal}`);
    console.log(`  Edges:    ${result.edgesTotal}`);
    console.log(`  Chunks:   ${result.chunksTotal}`);
    console.log(`  Embedded: ${result.embedded}`);
    console.log(`  Time:     ${(result.durationMs / 1000).toFixed(1)}s`);
    return;
  }

  if (!subCmd) {
    console.log(`Usage: gbrain code [import|import-list] [options]`);
    console.log(`  import <path> [--force] [--no-embed] [--reindex]  Import GitNexus index`);
    console.log(`  import-list                                          List imports`);
    return;
  }

  if (subCmd === 'import-list' || subCmd === 'imports') {
    const rows = await engine.executeRaw<{
      id: number; repo_path: string; repo_commit: string;
      nodes_total: number; edges_total: number; status: string; started_at: string | Date;
    }>(`SELECT id, repo_path, repo_commit, nodes_total, edges_total, status, started_at
         FROM code_imports ORDER BY started_at DESC LIMIT 20`);

    if (rows.length === 0) {
      console.log('No code imports found. Run: gbrain code import <repo-path>');
      return;
    }

    console.log('Code imports:');
    for (const r of rows) {
            const ts = r.started_at instanceof Date ? r.started_at.toISOString().slice(0, 19) : String(r.started_at ?? '?').slice(0, 19);
      console.log(`  #${r.id}  ${r.repo_path}  ${r.repo_commit.slice(0, 7)}  ${r.nodes_total} nodes  ${r.edges_total} edges  ${r.status}  ${ts}`);
    }
    return;
  }

  console.log(`Usage: gbrain code [import|import-list] [options]`);
  console.log(`  import <path> [--force] [--no-embed] [--reindex]  Import GitNexus index`);
  console.log(`  import-list                                          List imports`);
}
