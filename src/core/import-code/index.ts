import type { BrainEngine } from '../engine';
import { readGitNexusGraph } from './reader';
import { transformGraphData } from './transformer';
import { embedCodeChunks } from './embedder';
import { importFromContent } from '../import-file';
import type { CodeImportOptions, CodeImportResult } from './types';

/**
 * Full import pipeline:
 * 1. (Optional) Re-index with gitnexus analyze
 * 2. Read GitNexus graph
 * 3. Transform nodes/edges → pages/links/chunks
 * 4. Write pages via importFromContent (which handles chunks too)
 * 5. Bulk insert links
 * 6. Generate embeddings
 */
export async function runCodeImport(
  engine: BrainEngine,
  options: CodeImportOptions,
): Promise<CodeImportResult> {
  const start = Date.now();
  const repoPath = options.repoPath;
  const repoName = repoPath.split('/').pop() ?? repoPath;

  // Step 1: Re-index
  if (options.reindex) {
    const { execSync } = await import('child_process');
    execSync('npx gitnexus analyze', { cwd: repoPath, stdio: 'inherit' });
  }

  // Step 2: Read graph
  console.log(`[gbrain] Reading GitNexus graph from ${repoPath}...`);
  const graph = await readGitNexusGraph(repoPath);
  console.log(`[gbrain] Graph loaded: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  // Check staleness
  if (!options.force) {
    const lastImport = await engine.executeRaw<{ repo_commit: string }>(
      `SELECT repo_commit FROM code_imports WHERE repo_path = $1 ORDER BY id DESC LIMIT 1`,
      [repoPath],
    );
    if (lastImport.length > 0 && lastImport[0].repo_commit === graph.meta.repoCommit) {
      return {
        status: 'up_to_date',
        repoName,
        repoCommit: graph.meta.repoCommit,
        nodesTotal: 0, edgesTotal: 0, chunksTotal: 0,
        embedded: 0, durationMs: Date.now() - start,
      };
    }
  }

  // Record import start
  const importId = (await engine.executeRaw<{ id: number }>(
    `INSERT INTO code_imports (repo_path, repo_commit, status) VALUES ($1, $2, 'importing') RETURNING id`,
    [repoPath, graph.meta.repoCommit],
  ))[0].id;

  try {
    // Step 3: Transform
    console.log(`[gbrain] Transforming graph...`);
    const { pages, links, chunks } = transformGraphData(graph.nodes, graph.edges, repoName);
    console.log(`[gbrain] Transformed: ${pages.length} pages, ${links.length} links, ${chunks.length} chunks`);

    // Step 4: Write pages
    console.log(`[gbrain] Writing ${pages.length} pages...`);
    for (const { slug, page } of pages) {
      // Convert page to markdown for importFromContent
      const markdown = pageToMarkdown(page);
      try {
        await importFromContent(engine, slug, markdown, {
          noEmbed: true,  // We embed separately via embedCodeChunks
        });
        // Set source_id to 'code' for code-imported pages
        await engine.executeRaw(
          `UPDATE pages SET source_id = 'code' WHERE slug = $1 AND source_id = 'default'`,
          [slug],
        );
      } catch (e) {
        console.error(`[gbrain] Failed to import page for ${slug}:`, e instanceof Error ? e.message : String(e));
      }
    }

    // Step 4b: Insert chunks for embeddable symbols
    for (const { slug, chunks: nodeChunks } of chunks) {
      if (nodeChunks.length > 0) {
        try {
          await engine.upsertChunks(slug, nodeChunks);
        } catch (e) {
          console.error(`[gbrain] Failed to upsert chunks for ${slug}:`, e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Step 5: Bulk insert links
    let edgesInserted = 0;
    if (links.length > 0) {
      // Insert in batches of 1000 to avoid huge SQL statements
      for (let i = 0; i < links.length; i += 1000) {
        const batch = links.slice(i, i + 1000);
        edgesInserted += await engine.addLinksBatch(batch);
      }
    }

    // Step 6: Generate embeddings
    let embedded = 0;
    if (options.embed !== false) {
      console.log(`[gbrain] Generating embeddings...`);
      const embResult = await embedCodeChunks(engine, {
        onProgress: (done, total) => {
          if (done % 10 === 0 || done === total) {
            console.log(`[gbrain] Embedding progress: ${done}/${total}`);
          }
        },
      });
      embedded = embResult.embedded;
      if (embResult.failed > 0) {
        console.error(`[gbrain] Embedding warnings: ${embResult.failed}/${embResult.total} chunks failed to embed`);
      }
    }

    // Mark import complete
    await engine.executeRaw(
      `UPDATE code_imports SET status = 'done', nodes_total = $1, edges_total = $2, chunks_total = $3, embedded = $4, finished_at = now() WHERE id = $5`,
      [graph.nodes.length, edgesInserted, chunks.reduce((s, c) => s + c.chunks.length, 0), embedded, importId],
    );

    return {
      status: 'imported',
      repoName,
      repoCommit: graph.meta.repoCommit,
      nodesTotal: graph.nodes.length,
      edgesTotal: edgesInserted,
      chunksTotal: chunks.reduce((s, c) => s + c.chunks.length, 0),
      embedded,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await engine.executeRaw(
      `UPDATE code_imports SET status = 'failed', error_text = $1, finished_at = now() WHERE id = $2`,
      [msg, importId],
    );
    return {
      status: 'failed',
      repoName,
      repoCommit: graph.meta.repoCommit,
      nodesTotal: 0, edgesTotal: 0, chunksTotal: 0,
      embedded: 0, durationMs: Date.now() - start,
    };
  }
}

function pageToMarkdown(page: { type: string; title: string; compiled_truth: string; frontmatter?: Record<string, unknown> }): string {
  const fm = { ...(page.frontmatter ?? {}), type: page.type, title: page.title };
  const yaml = Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n\n${page.compiled_truth}`;
}
