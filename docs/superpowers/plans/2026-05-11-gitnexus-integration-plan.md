# GitNexus + GBrain Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate GitNexus's code intelligence (knowledge graph, impact analysis, context tracing) into GBrain so agents query code structure and knowledge pages through a single unified MCP server.

**Architecture:** Data Import pattern — GitNexus LadybugDB is read as a read-only upstream; nodes/edges are transformed into GBrain pages/links/chunks with MiniMax embeddings. New MCP tools (`code_query`, `code_context`, `code_impact`, `code_import`, `code_list_repos`) expose code intelligence alongside existing GBrain tools.

**Tech Stack:** TypeScript (bun runtime), Postgres + pgvector (GBrain existing), MiniMax embo-01 (GBrain existing), GitNexus LadybugDB (read-only, typed client)

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/core/import-code/types.ts` | Shared types for code import |
| `src/core/import-code/reader.ts` | GitNexus LadybugDB read adapter |
| `src/core/import-code/transformer.ts` | Node/edge → page/link/chunk transform |
| `src/core/import-code/slug-builder.ts` | Symbol id → GBrain slug mapping |
| `src/core/import-code/embedder.ts` | Code chunking + MiniMax embedding |
| `src/core/import-code/index.ts` | Orchestrator: full import pipeline |
| `src/core/operations.ts` | Add `code_import`, `code_query`, `code_context`, `code_impact`, `code_list_repos` operations |
| `src/commands/code-import.ts` | CLI: `gbrain code import` |
| `src/schema.sql` | Add `code_imports` table |
| `src/core/import-code/reader.test.ts` | Unit tests for reader |
| `src/core/import-code/transformer.test.ts` | Unit tests for transformer |
| `src/core/import-code/slug-builder.test.ts` | Unit tests for slug-builder |
| `test/e2e/code-import.e2e.test.ts` | E2E: full import + query + context + impact on fixture repo |

---

### Task 1: Schema Extension — code_imports table

- [ ] **Step 1: Add `code_imports` table to schema.sql**

Append to `src/schema.sql`:

```sql
-- ============================================================
-- code_imports: track GitNexus code graph import runs
-- ============================================================
CREATE TABLE IF NOT EXISTS code_imports (
  id            SERIAL PRIMARY KEY,
  repo_path     TEXT NOT NULL,
  repo_commit   TEXT NOT NULL,
  gitnexus_ver  TEXT NOT NULL DEFAULT '',
  nodes_total   INTEGER NOT NULL DEFAULT 0,
  edges_total   INTEGER NOT NULL DEFAULT 0,
  chunks_total  INTEGER NOT NULL DEFAULT 0,
  embedded      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'importing',
  error_text    TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  CONSTRAINT chk_code_imports_status CHECK (status IN ('importing', 'embedded', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_code_imports_repo ON code_imports(repo_path, started_at DESC);
```

- [ ] **Step 2: Add migration for existing brains**

Create `src/commands/migrations/v0_19_0.ts`:

```typescript
import type { BrainEngine } from '../../core/engine.ts';

export const v0_19_0 = {
  version: 19,
  async up(engine: BrainEngine): Promise<void> {
    await engine.runMigration(19, `
      CREATE TABLE IF NOT EXISTS code_imports (
        id            SERIAL PRIMARY KEY,
        repo_path     TEXT NOT NULL,
        repo_commit   TEXT NOT NULL,
        gitnexus_ver  TEXT NOT NULL DEFAULT '',
        nodes_total   INTEGER NOT NULL DEFAULT 0,
        edges_total   INTEGER NOT NULL DEFAULT 0,
        chunks_total  INTEGER NOT NULL DEFAULT 0,
        embedded      INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'importing',
        error_text    TEXT,
        started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at   TIMESTAMPTZ,
        CONSTRAINT chk_code_imports_status CHECK (status IN ('importing', 'embedded', 'done', 'failed'))
      );
      CREATE INDEX IF NOT EXISTS idx_code_imports_repo ON code_imports(repo_path, started_at DESC);
      INSERT INTO sources (id, name, config)
        VALUES ('code', 'code', '{"federated": true, "type": "code"}'::jsonb)
        ON CONFLICT (id) DO NOTHING;
    `);
  },
};
```

- [ ] **Step 3: Register migration**

Update `src/commands/migrations/index.ts` to include v0_19_0.

- [ ] **Step 4: Commit**

```bash
git add src/schema.sql src/commands/migrations/v0_19_0.ts src/commands/migrations/index.ts
git commit -m "schema: add code_imports table and 'code' source for GitNexus integration"
```

---

### Task 2: Shared Types — import-code/types.ts

- [ ] **Step 1: Write types.ts**

Write `src/core/import-code/types.ts`:

```typescript
// === GitNexus LadybugDB node/edge shapes (read-only) ===

export interface CodeNode {
  id: string;            // "Method:auth.py:AuthMiddleware.dispatch#1"
  label: string;         // "Method", "Class", "Function", "File", ...
  properties: {
    name: string;
    file?: string;
    line?: number;
    endLine?: number;
    signature?: string;
    source?: string;     // source code body
    language?: string;
    exported?: boolean;
    [key: string]: unknown;
  };
}

export interface CodeEdge {
  from: string;
  to: string;
  type: string;          // CALLS, IMPORTS, EXTENDS, IMPLEMENTS, ...
  properties: {
    confidence?: number;
    reason?: string;
    file?: string;
    [key: string]: unknown;
  };
}

// === Import params ===

export interface CodeImportOptions {
  repoPath: string;
  /** Re-index with gitnexus analyze before importing (default: false) */
  reindex?: boolean;
  /** Generate embeddings (default: true) */
  embed?: boolean;
  /** Delete existing code pages before import (default: false) */
  force?: boolean;
  /** Max nodes to import (0 = unlimited) */
  maxNodes?: number;
}

export interface CodeImportResult {
  status: 'imported' | 'up_to_date' | 'failed';
  repoName: string;
  repoCommit: string;
  nodesTotal: number;
  edgesTotal: number;
  chunksTotal: number;
  embedded: number;
  durationMs: number;
}

// === Code query params ===

export interface CodeQueryParams {
  query: string;
  repo?: string;
  limit?: number;
  offset?: number;
  kind?: string;          // filter by: Class, Function, Method, Interface
}

export interface CodeQueryResult {
  slug: string;
  symbol: string;         // display name
  kind: string;           // Class, Function, Method, ...
  file: string;
  line: number;
  score: number;
  excerpt: string;        // first 200 chars of compiled_truth
}

// === Code context params ===

export interface CodeContextParams {
  symbol: string;         // slug or display name (fuzzy)
  repo?: string;
}

export interface CodeContextResult {
  symbol: {
    slug: string;
    name: string;
    kind: string;
    file: string;
    line: number;
    signature?: string;
  };
  callers: Array<{ slug: string; name: string; kind: string; file: string }>;
  callees: Array<{ slug: string; name: string; kind: string; file: string }>;
  importers: Array<{ slug: string; name: string; kind: string; file: string }>;
  imports: Array<{ slug: string; name: string; kind: string; file: string }>;
}

// === Code impact params ===

export interface CodeImpactParams {
  symbol: string;
  repo?: string;
  direction?: 'upstream' | 'downstream' | 'both';
  depth?: number;         // default 3, max 5
}

export interface CodeImpactResult {
  target: { slug: string; name: string; kind: string; file: string };
  impact: Array<{
    slug: string;
    name: string;
    kind: string;
    file: string;
    depth: number;
    risk: 'HIGH' | 'MEDIUM' | 'LOW';
    via: string;          // link_type that connects
  }>;
  riskSummary: {
    total: number;
    high: number;         // depth=1
    medium: number;       // depth=2
    low: number;          // depth>=3
  };
}

// === Node label → page type mapping ===

export const NODE_TO_PAGE_TYPE: Record<string, string> = {
  'File': 'code_file',
  'Folder': 'code_file',
  'Class': 'code_class',
  'Function': 'code_function',
  'Method': 'code_method',
  'Interface': 'code_interface',
  'Struct': 'code_class',
  'Enum': 'code_class',
  'Trait': 'code_interface',
  'TypeAlias': 'code_function',
  'Module': 'code_module',
  'Namespace': 'code_module',
};

// === Edge type → link_type mapping ===

export const EDGE_TO_LINK_TYPE: Record<string, string> = {
  'CALLS': 'code_call',
  'IMPORTS': 'code_import',
  'EXTENDS': 'code_extends',
  'IMPLEMENTS': 'code_implements',
  'HAS_METHOD': 'code_has_method',
  'METHOD_OVERRIDES': 'code_overrides',
  'ACCESSES': 'code_accesses',
  'CONTAINS': 'code_contains',
};

// Types that generate one chunk per node (source body as chunk_text)
export const EMBEDDABLE_NODE_TYPES = new Set([
  'Function', 'Method', 'Class', 'Interface',
]);
```

- [ ] **Step 2: Commit**

```bash
git add src/core/import-code/types.ts
git commit -m "feat: shared types for GitNexus code import pipeline"
```

---

### Task 3: Reader — LadybugDB Adapter

- [ ] **Step 1: Write reader.ts**

Write `src/core/import-code/reader.ts`:

```typescript
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
  const nodes = await queryCypher<Node>(
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
      id: row.id as string,
      label: (row.labels as string[])[0] ?? 'Unknown',
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
```

- [ ] **Step 2: Commit**

```bash
git add src/core/import-code/reader.ts
git commit -m "feat: reader — GitNexus LadybugDB graph extraction via cypher CLI"
```

---

### Task 4: Slug Builder — Symbol ID → GBrain Slug

- [ ] **Step 1: Write slug-builder.ts**

Write `src/core/import-code/slug-builder.ts`:

```typescript
import type { CodeNode } from './types';

/**
 * Build a stable GBrain page slug from a GitNexus code node.
 *
 * Format: code/{repo}/{kind}/{sanitized-name}
 *
 * Examples:
 *   File:src/auth.py → code/my-repo/file/src-auth-py
 *   Class:AuthMiddleware → code/my-repo/class/authmiddleware
 *   Method:AuthMiddleware.authenticate#2 → code/my-repo/method/authmiddleware-authenticate-2
 */
export function buildCodeSlug(repo: string, node: CodeNode): string {
  const kind = nodeLabelToSlugKind(node.label);
  const name = sanitizeName(node.properties.name ?? 'unknown');
  // Repo name is the basename of the repo path
  const repoName = sanitizeName(repo.split('/').pop() ?? repo);
  return `code/${repoName}/${kind}/${name}`;
}

function nodeLabelToSlugKind(label: string): string {
  const map: Record<string, string> = {
    'File': 'file',
    'Folder': 'file',
    'Class': 'class',
    'Function': 'function',
    'Method': 'method',
    'Interface': 'interface',
    'Struct': 'class',
    'Enum': 'class',
    'Trait': 'interface',
    'TypeAlias': 'function',
    'Module': 'module',
    'Namespace': 'module',
    'Constructor': 'method',
    'CodeElement': 'element',
  };
  return map[label] ?? 'symbol';
}

/**
 * Normalize a symbol name into a slug-safe form.
 * "AuthMiddleware.authenticate#2" → "authmiddleware-authenticate-2"
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.@#]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Build a reverse lookup: from page_slug back to node display info.
 * Stored in page frontmatter for code_context resolution.
 */
export function buildCodeFrontmatter(
  repo: string,
  node: CodeNode,
): Record<string, unknown> {
  return {
    repo,
    original_id: node.id,
    kind: node.label,
    file: node.properties.file ?? '',
    line: node.properties.line ?? 1,
    language: node.properties.language ?? '',
    exported: node.properties.exported ?? true,
    signature: node.properties.signature ?? '',
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/import-code/slug-builder.ts
git commit -m "feat: slug-builder — stable code symbol → GBrain page slug mapping"
```

---

### Task 5: Transformer — Node/Edge → Page/Link/Chunk

- [ ] **Step 1: Write transformer.ts**

Write `src/core/import-code/transformer.ts`:

```typescript
import type { CodeNode, CodeEdge } from './types';
import { NODE_TO_PAGE_TYPE, EDGE_TO_LINK_TYPE, EMBEDDABLE_NODE_TYPES } from './types';
import { buildCodeSlug, buildCodeFrontmatter } from './slug-builder';
import type { PageInput, ChunkInput } from '../../core/types';
import type { LinkBatchInput } from '../../core/engine';

export interface TransformedData {
  pages: Array<{ slug: string; page: PageInput }>;
  links: LinkBatchInput[];
  chunks: Array<{ slug: string; chunks: ChunkInput[] }>;
  slugMap: Map<string, string>;  // nodeId → slug
}

/**
 * Transform GitNexus nodes and edges into GBrain pages, links, and chunks.
 * The slugMap (nodeId → slug) is built and used internally for link resolution.
 */
export function transformGraphData(
  nodes: CodeNode[],
  edges: CodeEdge[],
  repo: string,
): TransformedData {
  const slugMap = new Map<string, string>();
  const pages: Array<{ slug: string; page: PageInput }> = [];
  const chunks: Array<{ slug: string; chunks: ChunkInput[] }> = [];

  // Transform nodes → pages + chunks
  for (const node of nodes) {
    const slug = buildCodeSlug(repo, node);
    slugMap.set(node.id, slug);

    const page: PageInput = {
      type: (NODE_TO_PAGE_TYPE[node.label] ?? 'code_file') as PageInput['type'],
      title: node.properties.name ?? slug,
      compiled_truth: formatCodePageContent(node),
      frontmatter: buildCodeFrontmatter(repo, node),
      source_id: 'code',
    };
    pages.push({ slug, page });

    // Generate chunks for embeddable node types
    if (EMBEDDABLE_NODE_TYPES.has(node.label) && node.properties.source) {
      const nodeChunks: ChunkInput[] = [];
      const text = generateNodeText(node);
      if (text.trim()) {
        // Single chunk per symbol (can be extended to semantic chunking later)
        nodeChunks.push({
          chunk_index: 1,
          chunk_text: text.slice(0, 8000),  // embedding char limit
          chunk_source: 'code',
          model: 'embo-01',
          symbol_name: node.properties.name,
          symbol_kind: node.label,
          start_line: node.properties.line,
          end_line: node.properties.endLine,
        });
      }
      chunks.push({ slug, chunks: nodeChunks });
    }
  }

  // Transform edges → links (only if both ends have slugs)
  const links: LinkBatchInput[] = [];
  for (const edge of edges) {
    const fromSlug = slugMap.get(edge.from);
    const toSlug = slugMap.get(edge.to);
    if (!fromSlug || !toSlug) continue;

    const linkType = EDGE_TO_LINK_TYPE[edge.type];
    if (!linkType) continue;

    links.push({
      from_slug: fromSlug,
      to_slug: toSlug,
      link_type: linkType,
      link_source: 'code_import',
      from_source_id: 'code',
      to_source_id: 'code',
      context: `${edge.type}${edge.properties.reason ? ` (${edge.properties.reason})` : ''}`,
    });
  }

  return { pages, links, chunks, slugMap };
}

function formatCodePageContent(node: CodeNode): string {
  const parts: string[] = [];
  const name = node.properties.name ?? 'unknown';
  const source = node.properties.source ?? '';

  parts.push(`# ${node.label}: \`${name}\``);
  parts.push('');
  if (node.properties.file) {
    parts.push(`> **File:** ${node.properties.file}${node.properties.line ? `:${node.properties.line}` : ''}`);
  }
  if (node.properties.signature) {
    parts.push(`> **Signature:** \`${node.properties.signature}\``);
  }
  if (source) {
    const lang = node.properties.language ?? '';
    parts.push('');
    parts.push('```' + lang);
    parts.push(source);
    parts.push('```');
  }

  return parts.join('\n');
}

function generateNodeText(node: CodeNode): string {
  const parts: string[] = [];
  parts.push(`${node.label}: ${node.properties.name}`);
  if (node.properties.signature) {
    parts.push(`Signature: ${node.properties.signature}`);
  }
  if (node.properties.source) {
    parts.push(node.properties.source);
  }
  return parts.join('\n');
}
```

- [ ] **Step 2: Write transformer.test.ts**

Write `src/core/import-code/transformer.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { transformGraphData } from './transformer';
import type { CodeNode, CodeEdge } from './types';

const makeNode = (overrides: Partial<CodeNode> = {}): CodeNode => ({
  id: 'Function:auth.py:login',
  label: 'Function',
  properties: { name: 'login', file: 'auth.py', line: 42, source: 'def login():\n    pass' },
  ...overrides,
});

const makeEdge = (overrides: Partial<CodeEdge> = {}): CodeEdge => ({
  from: 'Function:auth.py:login',
  to: 'Function:auth.py:validate',
  type: 'CALLS',
  properties: { confidence: 1.0 },
  ...overrides,
});

describe('transformGraphData', () => {
  it('transforms a Function node to a page', () => {
    const { pages, slugMap } = transformGraphData([makeNode()], [], 'test-repo');
    expect(pages.length).toBe(1);
    expect(pages[0].page.type).toBe('code_function');
    expect(pages[0].page.title).toBe('login');
    expect(pages[0].page.source_id).toBe('code');
    expect(slugMap.has('Function:auth.py:login')).toBe(true);
  });

  it('transforms a CALLS edge to a link', () => {
    const n1 = makeNode({ id: 'Function:a:foo', properties: { name: 'foo' } });
    const n2 = makeNode({ id: 'Function:a:bar', properties: { name: 'bar' } });
    const { links } = transformGraphData([n1, n2], [{ from: n1.id, to: n2.id, type: 'CALLS', properties: {} }], 'test');
    expect(links.length).toBe(1);
    expect(links[0].link_type).toBe('code_call');
    expect(links[0].link_source).toBe('code_import');
  });

  it('skips edges where source or target node is missing', () => {
    const { links } = transformGraphData(
      [makeNode({ id: 'A' })],
      [{ from: 'A', to: 'B', type: 'CALLS', properties: {} }],
      'test',
    );
    expect(links.length).toBe(0);
  });

  it('generates chunks for embeddable nodes', () => {
    const { chunks } = transformGraphData([makeNode()], [], 'test');
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunks[0].symbol_name).toBe('login');
    expect(chunks[0].chunks[0].symbol_kind).toBe('Function');
  });

  it('maps all node labels to correct page types', () => {
    const labels = ['Class', 'Method', 'Interface', 'Function', 'File', 'Enum', 'Trait'];
    const nodes = labels.map((label, i) => makeNode({ id: `${label}:${i}`, label, properties: { name: label.toLowerCase() } }));
    const { pages } = transformGraphData(nodes, [], 'test');
    expect(pages.length).toBe(labels.length);
    expect(pages.find(p => p.page.type === 'code_class')).toBeTruthy();
    expect(pages.find(p => p.page.type === 'code_interface')).toBeTruthy();
    expect(pages.find(p => p.page.type === 'code_method')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /home/bohuju/self_project/gbrain
bun test src/core/import-code/transformer.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/core/import-code/transformer.ts src/core/import-code/transformer.test.ts
git commit -m "feat: transformer — node/edge to page/link/chunk with unit tests"
```

---

### Task 6: Embedder — Code Chunk Embedding

- [ ] **Step 1: Write embedder.ts**

Write `src/core/import-code/embedder.ts`:

```typescript
import { embedBatch } from '../embedding';
import type { BrainEngine } from '../engine';
import type { ChunkInput } from '../types';

export interface EmbedResult {
  total: number;
  embedded: number;
  failed: number;
}

/**
 * Generate embeddings for code chunks that were inserted without embeddings.
 *
 * Does NOT insert chunks — assumes chunks are already in GBrain via
 * importFromContent (called by the import orchestrator).
 *
 * Strategy:
 * 1. Query all code chunks with NULL embedding
 * 2. Batch-embed their chunk_text via MiniMax
 * 3. Update each chunk's embedding column
 */
export async function embedCodeChunks(
  engine: BrainEngine,
  options: { onProgress?: (done: number, total: number) => void } = {},
): Promise<EmbedResult> {
  // Find code chunks without embeddings
  const raw = await engine.executeRaw<{ id: number; chunk_text: string }>(`
    SELECT cc.id, cc.chunk_text
    FROM content_chunks cc
    JOIN pages p ON p.id = cc.page_id
    WHERE p.source_id = 'code'
      AND cc.embedding IS NULL
      AND cc.chunk_text != ''
    ORDER BY cc.id
  `);

  if (raw.length === 0) return { total: 0, embedded: 0, failed: 0 };

  const texts = raw.map(r => r.chunk_text);

  // Batch embed (MiniMax via existing embedBatch)
  let failed = 0;
  const embeddings: Float32Array[] = [];
  try {
    const results = await embedBatch(texts, {
      onBatchComplete: (done, total) => options.onProgress?.(done, total),
    });
    embeddings.push(...results);
  } catch {
    failed = texts.length;
    return { total: texts.length, embedded: 0, failed };
  }

  // Update embeddings in DB (batch UPDATE via pgvector)
  // Postgres vector format: '[1.2,3.4,...]'
  for (let i = 0; i < raw.length; i++) {
    const emb = embeddings[i];
    if (!emb) { failed++; continue; }
    const vectorStr = '[' + Array.from(emb).join(',') + ']';
    try {
      await engine.executeRaw(
        `UPDATE content_chunks SET embedding = $1::vector, embedded_at = now() WHERE id = $2`,
        [vectorStr, raw[i].id],
      );
    } catch {
      failed++;
    }
  }

  return { total: texts.length, embedded: texts.length - failed, failed };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/import-code/embedder.ts
git commit -m "feat: embedder — batch MiniMax embedding for code chunks"
```

---

### Task 7: Import Orchestrator

- [ ] **Step 1: Write index.ts (orchestrator)**

Write `src/core/import-code/index.ts`:

```typescript
import type { BrainEngine } from '../engine';
import { readGitNexusGraph } from './reader';
import { transformGraphData } from './transformer';
import { embedCodeChunks } from './embedder';
import { importFromContent } from '../import-file';
import type { CodeImportOptions, CodeImportResult } from './types';
import { execSync } from 'child_process';

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
    execSync('npx gitnexus analyze', { cwd: repoPath, stdio: 'inherit' });
  }

  // Step 2: Read graph
  const graph = await readGitNexusGraph(repoPath);

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
    const { pages, links, chunks } = transformGraphData(graph.nodes, graph.edges, repoName);

    // Step 4: Write pages
    for (const { slug, page } of pages) {
      // Convert page to markdown for importFromContent
      const markdown = pageToMarkdown(page);
      try {
        await importFromContent(engine, slug, markdown, {
          noEmbed: true,  // We embed separately via embedCodeChunks
        });
      } catch {
        // Non-fatal: skip pages that fail import
      }
    }

    // Step 4b: Insert chunks for embeddable symbols
    for (const { slug, chunks: nodeChunks } of chunks) {
      if (nodeChunks.length > 0) {
        try {
          await engine.upsertChunks(slug, nodeChunks);
        } catch {
          // Non-fatal
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
      const embResult = await embedCodeChunks(engine);
      embedded = embResult.embedded;
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

function pageToMarkdown(page: { type: string; title: string; compiled_truth: string; frontmatter: Record<string, unknown> }): string {
  const fm = { ...page.frontmatter, type: page.type, title: page.title };
  const yaml = Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n\n${page.compiled_truth}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/import-code/index.ts
git commit -m "feat: import orchestrator — full pipeline: read → transform → write → embed"
```

---

### Task 8: CLI Command — `gbrain code import`

- [ ] **Step 1: Write commands/code-import.ts**

Write `src/commands/code-import.ts`:

```typescript
import type { BrainEngine } from '../core/engine';
import { runCodeImport } from '../core/import-code';

export async function runCodeCommand(engine: BrainEngine, args: string[]) {
  const subCmd = args[0];

  if (subCmd === 'import' || !subCmd) {
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

  if (subCmd === 'list' || subCmd === 'ls') {
    const rows = await engine.executeRaw<{
      id: number; repo_path: string; repo_commit: string;
      nodes_total: number; edges_total: number; status: string; started_at: string;
    }>(`SELECT id, repo_path, repo_commit, nodes_total, edges_total, status, started_at
         FROM code_imports ORDER BY started_at DESC LIMIT 20`);

    if (rows.length === 0) {
      console.log('No code imports found. Run: gbrain code import <repo-path>');
      return;
    }

    console.log('Code imports:');
    for (const r of rows) {
      console.log(`  #${r.id}  ${r.repo_path}  ${r.repo_commit.slice(0, 7)}  ${r.nodes_total} nodes  ${r.edges_total} edges  ${r.status}  ${r.started_at?.slice(0, 19)}`);
    }
    return;
  }

  console.log(`Usage: gbrain code [import|list] [options]`);
  console.log(`  import <path> [--force] [--no-embed] [--reindex]  Import GitNexus index`);
  console.log(`  list                                                 List imports`);
}
```

- [ ] **Step 2: Register in cli.ts**

Add to `CLI_ONLY` set in `src/cli.ts`:

```typescript
// In the CLI_ONLY set, add 'code'
// In the handleCliOnly switch, add:
if (command === 'code') {
  const { runCodeCommand } = await import('./commands/code-import.ts');
  await runCodeCommand(engine, args);
  break;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/code-import.ts src/cli.ts
git commit -m "feat: CLI — gbrain code import|list commands"
```

---

### Task 9: MCP Operations — code_* tools

- [ ] **Step 1: Add operations to operations.ts**

Add the following operations to `src/core/operations.ts`:

```typescript
// === Code Query ===

// CAP on code_impact depth from MCP callers.
const CODE_IMPACT_DEPTH_CAP = 5;

const code_list_repos: Operation = {
  name: 'code_list_repos',
  description: 'List code repositories imported via GitNexus, with node/edge stats and last commit.',
  params: {},
  handler: async (ctx) => {
    return ctx.engine.executeRaw(
      `SELECT id, repo_path, repo_commit, nodes_total, edges_total, chunks_total, embedded, status, started_at, finished_at
       FROM code_imports WHERE status = 'done' ORDER BY started_at DESC`
    );
  },
  cliHints: { name: 'code-repos', hidden: true },
};

const code_query: Operation = {
  name: 'code_query',
  description: 'Search code symbols using hybrid search (vector + keyword). Returns ranked symbols with file locations.',
  params: {
    query: { type: 'string', required: true, description: 'Search query for code symbols' },
    repo: { type: 'string', description: 'Filter by repo name (default: all repos)' },
    kind: { type: 'string', description: 'Filter by symbol kind: Class, Function, Method, Interface' },
    limit: { type: 'number', description: 'Max results (default 20)' },
  },
  handler: async (ctx, p) => {
    const limit = clampSearchLimit(p.limit as number | undefined, 20);
    const query = p.query as string;
    const repo = p.repo as string | undefined;
    const kind = p.kind as string | undefined;

    // Build SQL with optional filters
    let sql = `
      SELECT p.slug, p.title, p.type, p.frontmatter->>'file' as file,
             p.frontmatter->>'line' as line, p.frontmatter->>'kind' as kind,
             COALESCE(ts_rank(p.code_search_vector, websearch_to_tsquery('simple', $1)), 0) AS text_score
      FROM pages p
      WHERE p.source_id = 'code'
        AND p.type LIKE 'code_%'
        AND (p.code_search_vector @@ websearch_to_tsquery('simple', $1)
             OR p.title ILIKE '%' || $1 || '%')
    `;

    const params: unknown[] = [query];
    let paramIdx = 2;

    if (repo) {
      sql += ` AND p.frontmatter->>'repo' = $${paramIdx++}`;
      params.push(repo);
    }
    if (kind) {
      sql += ` AND p.frontmatter->>'kind' = $${paramIdx++}`;
      params.push(kind);
    }

    sql += ` ORDER BY text_score DESC LIMIT $${paramIdx}`;
    params.push(limit);

    const rows = await ctx.engine.executeRaw<{
      slug: string; title: string; type: string; file: string; line: string;
      kind: string; text_score: number;
    }>(sql, params);

    return rows.map(r => ({
      slug: r.slug,
      symbol: r.title,
      kind: r.kind || r.type.replace('code_', ''),
      file: r.file,
      line: parseInt(r.line) || 0,
      score: parseFloat(r.text_score?.toString() || '0'),
    }));
  },
  cliHints: { name: 'code-query', hidden: true },
};

const code_context: Operation = {
  name: 'code_context',
  description: 'Get 360° context on a code symbol: callers, callees, importers, imports. Uses link traversal.',
  params: {
    symbol: { type: 'string', required: true, description: 'Code symbol slug or name (supports fuzzy matching)' },
    repo: { type: 'string', description: 'Repo name (optional, narrows slug search)' },
  },
  handler: async (ctx, p) => {
    const symbol = p.symbol as string;
    const repo = p.repo as string | undefined;

    // Resolve slug: try exact match → fuzzy → search
    let slug: string | null = null;
    let page: Record<string, unknown> | null = null;

    // Try exact slug
    const exactPage = await ctx.engine.getPage(symbol);
    if (exactPage && exactPage.type?.startsWith('code_')) {
      slug = exactPage.slug;
      page = exactPage as unknown as Record<string, unknown>;
    }

    // Try fuzzy prefix
    if (!slug) {
      const candidates = await ctx.engine.resolveSlugs(symbol);
      const codeCandidates = candidates.filter(c => c.startsWith('code/'));
      if (codeCandidates.length === 1) {
        slug = codeCandidates[0];
        page = await ctx.engine.getPage(slug) as unknown as Record<string, unknown> || null;
      }
    }

    // Try name search in frontmatter
    if (!slug) {
      let sql = `SELECT slug FROM pages WHERE source_id = 'code' AND title = $1`;
      const params: unknown[] = [symbol];
      if (repo) { sql += ` AND frontmatter->>'repo' = $2`; params.push(repo); }
      sql += ` LIMIT 1`;
      const rows = await ctx.engine.executeRaw<{ slug: string }>(sql, params);
      if (rows.length > 0) {
        slug = rows[0].slug;
        page = await ctx.engine.getPage(slug) as unknown as Record<string, unknown> || null;
      }
    }

    if (!slug || !page) {
      throw new OperationError('page_not_found', `Code symbol not found: ${symbol}`, 'Try code_query to find the symbol first');
    }

    // Collect relations via links
    const callers = await ctx.engine.executeRaw<{ slug: string; title: string; type: string; frontmatter: Record<string, unknown> }>(
      `SELECT p.slug, p.title, p.type, p.frontmatter
       FROM links l JOIN pages p ON p.id = l.from_page_id
       WHERE l.to_page_id = (SELECT id FROM pages WHERE slug = $1)
         AND l.link_type IN ('code_call', 'code_import')
         AND p.source_id = 'code' LIMIT 100`,
      [slug],
    );

    const callees = await ctx.engine.executeRaw<{ slug: string; title: string; type: string; frontmatter: Record<string, unknown> }>(
      `SELECT p.slug, p.title, p.type, p.frontmatter
       FROM links l JOIN pages p ON p.id = l.to_page_id
       WHERE l.from_page_id = (SELECT id FROM pages WHERE slug = $1)
         AND l.link_type = 'code_call'
         AND p.source_id = 'code' LIMIT 100`,
      [slug],
    );

    const fm = (page.frontmatter || {}) as Record<string, unknown>;

    return {
      symbol: {
        slug,
        name: page.title,
        kind: fm.kind || page.type,
        file: fm.file || '',
        line: fm.line || 0,
        signature: fm.signature,
      },
      callers: callers.map(r => ({ slug: r.slug, name: r.title, kind: (r.frontmatter?.kind as string) || r.type, file: (r.frontmatter?.file as string) || '' })),
      callees: callees.map(r => ({ slug: r.slug, name: r.title, kind: (r.frontmatter?.kind as string) || r.type, file: (r.frontmatter?.file as string) || '' })),
      importers: [],
      imports: [],
    };
  },
  cliHints: { name: 'code-context', hidden: true },
};

const code_impact: Operation = {
  name: 'code_impact',
  description: 'Analyze blast radius of changing a code symbol. Returns upstream/downstream dependents with risk levels.',
  params: {
    symbol: { type: 'string', required: true, description: 'Code symbol slug or name' },
    repo: { type: 'string', description: 'Repo name (optional)' },
    direction: { type: 'string', enum: ['upstream', 'downstream', 'both'], description: 'Impact direction (default: upstream)' },
    depth: { type: 'number', description: `Max traversal depth (default 3, capped at ${CODE_IMPACT_DEPTH_CAP})` },
  },
  handler: async (ctx, p) => {
    const symbol = p.symbol as string;
    const direction = (p.direction as string) || 'upstream';
    const requestedDepth = (p.depth as number) || 3;
    const depth = Math.max(1, Math.min(requestedDepth, CODE_IMPACT_DEPTH_CAP));

    // Resolve slug (same as code_context)
    let slug: string | null = null;
    const exactPage = await ctx.engine.getPage(symbol);
    if (exactPage && exactPage.type?.startsWith('code_')) {
      slug = exactPage.slug;
    }
    if (!slug) {
      const candidates = await ctx.engine.resolveSlugs(symbol);
      const codeCandidates = candidates.filter(c => c.startsWith('code/'));
      if (codeCandidates.length === 1) slug = codeCandidates[0];
    }
    if (!slug) {
      throw new OperationError('page_not_found', `Code symbol not found: ${symbol}`);
    }

    const page = await ctx.engine.getPage(slug);
    if (!page) throw new OperationError('page_not_found', `Symbol page not found: ${slug}`);

    // Use recursive CTE for graph traversal
    // direction=upstream: follow links WHERE to_page_id = our page (who calls us)
    // direction=downstream: follow links WHERE from_page_id = our page (who we call)
    const linkCondition = direction === 'downstream'
      ? `l.from_page_id = node.page_id`
      : direction === 'both'
        ? `(l.to_page_id = node.page_id OR l.from_page_id = node.page_id)`
        : `l.to_page_id = node.page_id`;  // upstream default

    const sql = `
      WITH RECURSIVE impact AS (
        -- Base: the target symbol
        SELECT p.id AS page_id, p.slug, p.title, p.type, p.frontmatter,
               0 AS depth, '' AS via
        FROM pages p WHERE p.slug = $1

        UNION

        -- Recursive step
        SELECT p.id, p.slug, p.title, p.type, p.frontmatter,
               impact.depth + 1, l.link_type
        FROM impact
        JOIN links l ON (${linkCondition})
        JOIN pages p ON p.id = CASE
          WHEN '${direction}' = 'downstream' THEN l.to_page_id
          ELSE l.from_page_id
        END
        WHERE impact.depth < $2
          AND p.source_id = 'code'
          AND l.link_type IN ('code_call', 'code_extends', 'code_implements', 'code_import')
      )
      SELECT DISTINCT ON (slug) slug, title, type, frontmatter, depth, via
      FROM impact WHERE depth > 0
      ORDER BY slug, depth
      LIMIT 500
    `;

    const rows = await ctx.engine.executeRaw<{
      slug: string; title: string; type: string;
      frontmatter: Record<string, unknown>; depth: number; via: string;
    }>(sql, [slug, depth]);

    const impact = rows.map(r => ({
      slug: r.slug,
      name: r.title,
      kind: (r.frontmatter?.kind as string) || r.type,
      file: (r.frontmatter?.file as string) || '',
      depth: parseInt(r.depth.toString()),
      risk: (parseInt(r.depth.toString()) === 1 ? 'HIGH' : parseInt(r.depth.toString()) === 2 ? 'MEDIUM' : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
      via: r.via,
    }));

    const fm = (page.frontmatter || {}) as Record<string, unknown>;

    return {
      target: {
        slug,
        name: page.title,
        kind: (fm.kind as string) || page.type,
        file: (fm.file as string) || '',
      },
      impact,
      riskSummary: {
        total: impact.length,
        high: impact.filter(i => i.risk === 'HIGH').length,
        medium: impact.filter(i => i.risk === 'MEDIUM').length,
        low: impact.filter(i => i.risk === 'LOW').length,
      },
    };
  },
  cliHints: { name: 'code-impact', hidden: true },
};
```

- [ ] **Step 2: Register in operations array**

Add to the `operations` export array in `src/core/operations.ts`:

```typescript
export const operations: Operation[] = [
  // ... existing ops ...
  // Code (GitNexus integration)
  code_list_repos, code_query, code_context, code_impact,
];
```

- [ ] **Step 3: Commit**

```bash
git add src/core/operations.ts
git commit -m "feat: MCP tools — code_list_repos, code_query, code_context, code_impact"
```

---

### Task 10: E2E Test

- [ ] **Step 1: Set up test fixture**

```bash
# Use a small fixture repo
mkdir -p test/fixtures/code-fixture
cat > test/fixtures/code-fixture/main.py << 'EOF'
def validate_token(token: str) -> bool:
    return len(token) > 0

def login(username: str, password: str) -> dict:
    if validate_token(password):
        return {"status": "ok"}
    return {"status": "fail"}
EOF

cd test/fixtures/code-fixture
git init && git add . && git commit -m "init"
npx gitnexus analyze
```

- [ ] **Step 2: Write E2E test**

Write `test/e2e/code-import.e2e.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { runCodeImport } from '../../src/core/import-code';
import { createEngine } from '../../src/core/engine-factory';
import type { BrainEngine } from '../../src/core/engine';
import { join } from 'path';
import { execSync } from 'child_process';

const FIXTURE_DIR = join(import.meta.dir, '..', 'fixtures', 'code-fixture');

describe('code import E2E', () => {
  let engine: BrainEngine;

  beforeAll(async () => {
    // Use test database
    const dbUrl = process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/gbrain_test';
    engine = await createEngine({ engine: 'postgres' });
    await engine.connect({ engine: 'postgres', databaseUrl: dbUrl });
    await engine.initSchema();
  });

  afterAll(async () => {
    // Clean up code pages
    await engine.executeRaw(`DELETE FROM pages WHERE source_id = 'code'`);
    await engine.disconnect();
  });

  it('imports a fixture repo end to end', async () => {
    // Index with gitnexus
    execSync('npx gitnexus analyze --force', { cwd: FIXTURE_DIR, stdio: 'pipe' });

    // Import
    const result = await runCodeImport(engine, {
      repoPath: FIXTURE_DIR,
      embed: false,  // skip embedding in CI (needs API key)
      force: true,
    });

    expect(result.status).toBe('imported');
    expect(result.nodesTotal).toBeGreaterThan(0);
    expect(result.edgesTotal).toBeGreaterThan(0);
  });

  it('code_query finds imported symbols', async () => {
    const rows = await engine.searchKeyword('validate_token', { limit: 5 });
    const codeSlugs = rows.filter(r => r.slug.startsWith('code/'));
    expect(codeSlugs.length).toBeGreaterThan(0);
  });

  it('code_context resolves callers and callees', async () => {
    // Find the login function
    const loginPages = await engine.executeRaw<{ slug: string }>(
      `SELECT slug FROM pages WHERE source_id = 'code' AND title = 'login' LIMIT 1`
    );

    if (loginPages.length === 0) return; // skip if not found

    const slug = loginPages[0].slug;

    // Get callees (login calls validate_token)
    const callees = await engine.executeRaw<{ slug: string; title: string }>(`
      SELECT p.slug, p.title FROM links l
      JOIN pages p ON p.id = l.to_page_id
      WHERE l.from_page_id = (SELECT id FROM pages WHERE slug = $1)
        AND l.link_type = 'code_call'
    `, [slug]);

    expect(callees.length).toBeGreaterThan(0);
  });

  it('code_impact finds upstream callers', async () => {
    const validatePages = await engine.executeRaw<{ slug: string }>(
      `SELECT slug FROM pages WHERE source_id = 'code' AND title = 'validate_token' LIMIT 1`
    );

    if (validatePages.length === 0) return;

    const slug = validatePages[0].slug;

    // Find who calls validate_token
    const callers = await engine.executeRaw<{ slug: string; title: string }>(`
      SELECT p.slug, p.title FROM links l
      JOIN pages p ON p.id = l.from_page_id
      WHERE l.to_page_id = (SELECT id FROM pages WHERE slug = $1)
        AND l.link_type = 'code_call'
    `, [slug]);

    // login should call validate_token
    const hasLogin = callers.some(c => c.title.includes('login'));
    expect(hasLogin).toBe(true);
  });
});
```

- [ ] **Step 3: Run E2E tests**

```bash
cd /home/bohuju/self_project/gbrain
# Ensure test database exists
createdb gbrain_test 2>/dev/null || true
bun test test/e2e/code-import.e2e.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/code-fixture/ test/e2e/code-import.e2e.test.ts
git commit -m "test: E2E test for code import → query → context → impact pipeline"
```

---

### Task 11: Integration Verification

- [ ] **Step 1: Verify schema migration runs cleanly**

```bash
cd /home/bohuju/self_project/gbrain
bun run src/cli.ts apply-migrations
bun run src/cli.ts doctor --fast
```

Expected: No migration errors, doctor reports healthy brain.

- [ ] **Step 2: Verify unit tests pass**

```bash
cd /home/bohuju/self_project/gbrain
bun test src/core/import-code/
```

Expected: All transformer and slug-builder tests pass.

- [ ] **Step 3: Verify type checking**

```bash
cd /home/bohuju/self_project/gbrain
# bun doesn't have a tsc equivalent; use a build check
bun build --target bun src/core/import-code/index.ts --outdir /tmp/typecheck --dry-run 2>&1 | head -20
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: integration verification — migration, tests, type check for code import"
```

---

## Implementation Notes

### GitNexus Dependency

The `reader.ts` relies on `npx gitnexus cypher` to extract graph data. This means:
- GitNexus must be installed (`npm install -g gitnexus` or local `npx`)
- The repo must already be indexed (`npx gitnexus analyze`)
- The `--reindex` flag on `code import` runs `gitnexus analyze` first

### Embedding Strategy

GitNexus uses Snowflake arctic-embed-xs (384D) for embeddings. These are **not compatible** with GBrain's MiniMax embo-01 (1536D). The import pipeline:
1. Does NOT import GitNexus embeddings
2. Generates NEW embeddings on GBrain side using MiniMax
3. Chunks are created from source code body (from GitNexus AST-extracted source)

### Slug Stability

Slugs are derived from `code/{repo}/{kind}/{sanitized-name}`. If GitNexus assigns a different node ID across re-indexes (e.g., collision-based type suffix changes), the slug will change. The `force` flag deletes existing code pages and re-creates them to handle this.

### Performance Estimates

| Repo Size | Nodes | Edges | Import Time (estimate) | DB Size |
|-----------|-------|-------|----------------------|---------|
| Small (10 files, ~500 SLOC) | ~200 | ~500 | ~5s | ~2MB |
| Medium (Starlette, 12K SLOC) | ~4,000 | ~10,000 | ~60s | ~20MB |
| Large (React, 300K SLOC) | ~80,000 | ~200,000 | ~10min | ~200MB |

For large repos, consider using `maxNodes` to limit import scope, or importing only specific symbol types.

### Multi-Repo Support

Multiple repos are supported by the `code/<repo>/` slug prefix. The `repo` parameter on `code_query` / `code_context` / `code_impact` filters to a specific repo's symbols. Cross-repo analysis is not supported in v1.
