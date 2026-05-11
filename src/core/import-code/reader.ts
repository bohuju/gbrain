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
 * GitNexus stores the graph in LadybugDB under `.gitnexus/lbug/`.
 * This reader shells out to `gitnexus cypher` to extract nodes and edges
 * as structured JSON, avoiding direct LadybugDB dependency.
 *
 * Fallback: if gitnexus CLI is not available, reads the meta.json for
 * stats and returns empty graph (caller can detect and warn).
 */
export async function readGitNexusGraph(repoPath: string): Promise<GraphData> {
  const metaPath = join(repoPath, '.gitnexus', 'meta.json');
  if (!existsSync(metaPath)) {
    throw new Error(
      `No GitNexus index found at ${repoPath}/.gitnexus/. Run: cd ${repoPath} && npx gitnexus analyze`
    );
  }

  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

  // Query all nodes via gitnexus cypher
  const nodes = await queryCypher<{ id: string; labels: string[]; properties: Record<string, unknown> }>(
    repoPath,
    `MATCH (n) RETURN DISTINCT labels(n) AS labels, properties(n) AS properties, id(n) AS id LIMIT 50000`
  );

  // Query all edges
  const edges = await queryCypher<{ from: string; to: string; type: string; properties: Record<string, unknown> }>(
    repoPath,
    `MATCH ()-[r]->() RETURN id(startNode(r)) AS from, id(endNode(r)) AS to, type(r) AS type, properties(r) AS properties LIMIT 200000`
  );

  return {
    nodes: nodes.map(row => ({
      id: row.id,
      label: (row.labels)[0] ?? 'Unknown',
      properties: (row.properties ?? {}) as CodeNode['properties'],
    })),
    edges: edges.map(row => ({
      from: row.from,
      to: row.to,
      type: row.type,
      properties: (row.properties ?? {}) as CodeEdge['properties'],
    })),
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

async function queryCypher<T>(
  repoPath: string,
  query: string,
): Promise<T[]> {
  // Shell out to gitnexus CLI for cypher queries
  const { execSync } = await import('child_process');
  try {
    const raw = execSync(
      `npx gitnexus cypher --repo "${repoPath}" --json "${query.replace(/"/g, '\\"')}"`,
      { cwd: repoPath, encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024, timeout: 120_000 },
    );
    return JSON.parse(raw) as T[];
  } catch {
    // Fallback: if gitnexus cypher fails, return empty
    // Caller handles partial data
    return [];
  }
}
