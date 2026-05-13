import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { CodeNode, CodeEdge } from './types';

export interface GraphData {
  nodes: CodeNode[];
  edges: CodeEdge[];
  meta: {
    repoPath: string;
    repoCommit: string;
    indexedAt: string;
    nodeCount: number;
    edgeCount: number;
    embeddingCount: number;
  };
}

/**
 * Read GitNexus's knowledge graph from a repo's .gitnexus directory.
 *
 * Shells out to `gitnexus cypher` to extract nodes and edges.
 * Parses the markdown-table-in-JSON output format.
 */
export async function readGitNexusGraph(repoPath: string): Promise<GraphData> {
  const metaPath = join(repoPath, '.gitnexus', 'meta.json');
  if (!existsSync(metaPath)) {
    throw new Error(
      `No GitNexus index found at ${repoPath}/.gitnexus/. Run: cd ${repoPath} && npx gitnexus analyze`
    );
  }

  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

  // Query all nodes: MATCH (n) RETURN n gives full properties as JSON strings
  const nodes = await queryCypherNodes(repoPath);

  // Query all edges: MATCH ()-[r]->() RETURN r
  const edges = await queryCypherEdges(repoPath);

  return {
    nodes,
    edges,
    meta: {
      repoPath,
      repoCommit: meta.lastCommit ?? '',
      indexedAt: meta.indexedAt ?? '',
      nodeCount: meta.stats?.nodes ?? 0,
      edgeCount: meta.stats?.edges ?? 0,
      embeddingCount: meta.stats?.embeddings ?? 0,
    },
  };
}

/**
 * Parse the GitNexus cypher JSON response which has format:
 *   {"markdown": "| col |\n| --- |\n| {...json...} |", "row_count": N}
 * or for empty results:
 *   []
 *
 * Extracts JSON objects from markdown table data cells.
 */
export function parseCypherResponse(raw: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 0) return [];
    if (!parsed.markdown || !parsed.row_count || parsed.row_count === 0) return [];

    const lines = parsed.markdown.split('\n');
    const dataLines = lines.slice(2);

    const results: Record<string, unknown>[] = [];
    for (const line of dataLines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) continue;
      const cell = trimmed.slice(1, -1).trim();
      try {
        results.push(JSON.parse(cell));
      } catch {
        // Skip unparseable rows
      }
    }
    return results;
  } catch (e) {
    console.error('[gbrain] Failed to query GitNexus nodes:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

/** Normalize GitNexus property names to what the transformer expects. */
function normalizeNodeProps(raw: Record<string, unknown>): CodeNode['properties'] {
  return {
    ...raw,
    name: (raw.name as string) ?? '',
    file: (raw.filePath as string) ?? (raw.file as string),
    line: (raw.startLine as number) ?? (raw.line as number),
    endLine: (raw.endLine as number),
    source: (raw.content as string) ?? (raw.source as string),
    exported: (raw.isExported as boolean) ?? (raw.exported as boolean),
    signature: (raw.signature as string),
    language: (raw.language as string),
  } as CodeNode['properties'];
}

async function queryCypherNodes(repoPath: string): Promise<CodeNode[]> {
  const { execSync } = await import('child_process');
  try {
    const raw = execSync(
      `npx gitnexus cypher "MATCH (n) RETURN n LIMIT 50000"`,
      { cwd: repoPath, encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024, timeout: 120_000 },
    );
    const rows = parseCypherResponse(raw);
    return rows.map((row: Record<string, unknown>) => ({
      id: JSON.stringify(row._id ?? row.id ?? ''),
      label: String(row._label ?? 'Unknown'),
      properties: normalizeNodeProps(row),
    }));
  } catch (e) {
    console.error('[gbrain] Failed to query GitNexus nodes:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

async function queryCypherEdges(repoPath: string): Promise<CodeEdge[]> {
  const { execSync } = await import('child_process');
  const allRows: CodeEdge[] = [];
  const batchSize = 1000;
  let offset = 0;
  const maxBatches = 20;

  for (let i = 0; i < maxBatches; i++) {
    try {
      const raw = execSync(
        `npx gitnexus cypher "MATCH ()-[r]->() RETURN r SKIP ${offset} LIMIT ${batchSize}"`,
        { cwd: repoPath, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, timeout: 60_000 },
      );
      const rows = parseCypherResponse(raw);
      if (rows.length === 0) break;
      for (const row of rows) {
        allRows.push({
          from: JSON.stringify(row._src ?? ''),
          to: JSON.stringify(row._dst ?? ''),
          type: String(row.type ?? row._label ?? ''),
          properties: row as CodeEdge['properties'],
        });
      }
      if (rows.length < batchSize) break;
      offset += batchSize;
    } catch (e) {
      console.error(`[gbrain] Failed to query GitNexus edges batch ${i}:`, e instanceof Error ? e.message : String(e));
      break;
    }
  }
  return allRows;
}
