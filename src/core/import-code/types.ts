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
