# Plan: Extend GBrain to Support Code Content Storage and Query

> Based on Section 12 of GBRAIN_PROJECT_INTRODUCTION.md
> Date: 2026-04-27

## Core Idea

Code files become pages, code symbols become chunk metadata, code import/call
relationships become links. Reuse every existing table and pipeline, don't build
a parallel system.

```
Markdown page ──→ pages (type='concept') ──→ chunks (source='compiled_truth')
                                             ──→ links (source='markdown')

Code file ────→ pages (type='code_file') ──→ chunks (source='source_code')
                                             ──→ links (source='code_import')
```

## What Already Exists (and Why It Almost Works)

| Existing | Current Limitation | What to Change |
|---|---|---|
| `pages` table | `PageType` has 16 markdown-oriented values, no code | Add `'code_file'` |
| `content_chunks` | `chunk_source` is `'compiled_truth' \| 'timeline'` | Add `'source_code'` |
| `links` table | `link_source` is markdown/frontmatter/manual | Add `'code_import'` for import/call edges |
| `tags` | Used for topic tags | Reuse for language tags (`typescript`, `python`) |
| `sources` (v0.18) | Multi-brain tenancy | Code repo = a source; natural isolation |
| `page_versions` | Tracks compiled_truth snapshots | Works for code file history too |
| `isSyncable()` | Only accepts `.md`/`.mdx` | Widen to accept code extensions |
| `importFromContent()` | Calls `parseMarkdown()` only | Add `importCodeFile()` path |
| `hybridSearch()` | RRF pipeline is content-agnostic | Works as-is; ranking tweaks for code |
| `intent.ts` | No code query patterns | Add `code_definition` / `code_relationship` intents |
| `link-extraction.ts` | Matches wikilink and `[Name](path)` | Add `[[code:path#symbol]]` support |
| `search_vector` | English tsvector, bad for identifiers | Add `simple`-config tsvector for code pages |
| `chunkers/` | All split on natural language boundaries | Add code chunker |

## Phase 1: Code Files as Pages (MVP)

**Goal:** `gbrain import src/ --include-code` indexes code files. `gbrain query`
finds them alongside markdown pages.

### 1.1 Widen types

**File: `src/core/types.ts`**

```ts
// Before
type PageType = 'person' | 'company' | ... | 'meeting' | 'note';
type ChunkSource = 'compiled_truth' | 'timeline';

// After
type PageType = 'person' | 'company' | ... | 'meeting' | 'note' | 'code_file';
type ChunkSource = 'compiled_truth' | 'timeline' | 'source_code';
```

This one change makes `pages`, `content_chunks`, `SearchResult`, `Chunk`,
`ChunkInput` all accept code content. No schema DDL change needed for these
columns — they're already `TEXT`.

### 1.2 Widen sync filter

**File: `src/core/sync.ts`**

Change `isSyncable()` return type from `boolean` to `'markdown' | 'code' | false`:

```ts
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.rb', '.swift', '.kt', '.sh', '.sql',
]);

export function isSyncable(path: string): 'markdown' | 'code' | false {
  if (path.endsWith('.md') || path.endsWith('.mdx')) {
    // existing markdown logic (hidden dirs, skipFiles, ops/) ...
    return 'markdown';
  }
  const ext = path.substring(path.lastIndexOf('.'));
  if (CODE_EXTENSIONS.has(ext) && !path.split('/').some(p => p.startsWith('.'))) {
    return 'code';
  }
  return false;
}
```

`SyncManifest` gets a `kind` field so callers know which import path to use:

```ts
export interface SyncManifestEntry {
  path: string;
  kind: 'markdown' | 'code';
}
```

### 1.3 Add code import path

**File: `src/core/import-file.ts`**

Add `importCodeFile()` alongside `importFromFile()`:

```ts
export interface CodeImportResult {
  slug: string;
  status: 'imported' | 'skipped' | 'error';
  chunks: number;
  language: string;
}

export async function importCodeFile(
  engine: BrainEngine,
  filePath: string,
  content: string,
  opts: { noEmbed?: boolean } = {},
): Promise<CodeImportResult>
```

Inside `importCodeFile()`:

| Field | Value | Notes |
|---|---|---|
| `slug` | `code/<path-without-ext>` | e.g. `code/src/core/operations` |
| `type` | `'code_file'` | New PageType value |
| `title` | original file path | `src/core/operations.ts` |
| `compiled_truth` | raw source code | Stored as-is; search_vector indexes it |
| `timeline` | `''` | Code files have no timeline section |
| `frontmatter.language` | detected from extension | `ts` → `typescript`, etc. |
| `frontmatter.file_path` | original relative path | Preserved for search/display |
| `frontmatter.size_bytes` | byte length | |
| `tags` | `[language]` | `['typescript']` — uses existing tags table |
| `content_hash` | SHA-256 of source | Existing idempotency mechanism works |

Chunking: call new `chunkCode()` instead of `chunkText()`. Embed with existing
`embedBatch()`. Upsert chunks with `chunk_source = 'source_code'`.

All of this uses existing `engine.putPage()`, `engine.upsertChunks()`,
`engine.addTag()` — no new engine methods needed.

### 1.4 Code-aware chunker

**New file: `src/core/chunkers/code.ts`**

```ts
export interface CodeChunk {
  text: string;
  index: number;
  startLine: number;
  endLine: number;
}

export function chunkCode(
  source: string,
  opts?: { maxLines?: number; overlapLines?: number }
): CodeChunk[];
```

Strategy (no tree-sitter dependency yet):
- Split on blank-line boundaries (code "paragraphs")
- Respect indentation: a line with higher indent than the previous block-start
  is part of that block, not a new chunk boundary
- Target: 40-80 lines per chunk (code is token-dense; 300 words is too large)
- Overlap: 5 lines
- Returns `{ text, index, startLine, endLine }` per chunk

The `startLine`/`endLine` metadata is stored in the existing `frontmatter` JSONB
on `content_chunks` (or a new lightweight metadata column if preferred — see
Section 1.6 below).

### 1.5 Code-friendly full-text search

**Problem:** English tsvector stems identifiers (`putPage` → `putpag`), strips
underscores and dots, loses path separators. Code search needs `simple` config
that preserves identifiers.

**Schema migration v16:**

```sql
-- For code pages, store a separate tsvector with 'simple' config (no stemming)
ALTER TABLE pages ADD COLUMN code_search_vector tsvector;
CREATE INDEX idx_pages_code_search ON pages USING gin(code_search_vector);
```

**Trigger update** (in `src/core/pglite-schema.ts` and `src/schema.sql`):
- For pages with `type = 'code_file'`: populate `code_search_vector` from
  `compiled_truth` using `simple` config. Leave `search_vector` null.
- For markdown pages: populate `search_vector` using `english` config as today.
  Leave `code_search_vector` null.

**File: `src/core/search/keyword.ts`**
- Detect code queries (path-like patterns, camelCase, snake_case, file extensions)
  and search against `code_search_vector` with `simple` config when appropriate.
- Heuristic: query matches `/[\w.]+\.[a-z]{1,4}$/` or `[a-z][A-Z]` or
  `function\s+\w+` → use code path.

**No new operation needed.** The existing `search` and `query` operations call
`searchKeyword()` internally; the routing happens inside `searchKeyword()`.

### 1.6 Chunk metadata for line ranges (optional schema addition)

Code chunks need `start_line`/`end_line` for precise display. Options:

**Option A: JSONB in existing frontmatter (zero schema change)**
- Store `chunk.frontmatter = { startLine: 10, endLine: 45 }`
- Existing `content_chunks` table doesn't have a frontmatter column, so this
  would need adding `metadata JSONB` to `content_chunks`.

**Option B: New columns on `content_chunks` (one migration)**
```sql
ALTER TABLE content_chunks ADD COLUMN start_line INTEGER;
ALTER TABLE content_chunks ADD COLUMN end_line INTEGER;
ALTER TABLE content_chunks ADD COLUMN symbol_name TEXT;
ALTER TABLE content_chunks ADD COLUMN symbol_kind TEXT;
```
These are nullable; only populated for `chunk_source = 'source_code'`.
`symbol_name` and `symbol_kind` are empty in Phase 1 but ready for Phase 2.

**Recommend: Option B.** Four nullable columns on an existing table is cheap and
makes Phase 2 symbol indexing a data population step, not a schema change.

### 1.7 Wire into CLI

**File: `src/commands/import.ts`**
- `gbrain import <dir> --include-code` detects code files and routes to
  `importCodeFile()`

**File: `src/commands/sync.ts`**
- `gbrain sync --include-code` processes code file changes from the manifest

**File: `src/core/operations.ts`**
- `put_page` already works — if `type` in frontmatter is `code_file`, the
  code import path is used
- No new operations needed for Phase 1

### 1.8 Tests

| Test file | What it tests |
|---|---|
| `test/chunkers/code.test.ts` | blank-line splitting, indent respect, line ranges, overlap, empty file |
| `test/import-code.test.ts` | language detection, slug (`code/...`), page creation, chunk_source, embedding, idempotency via content_hash |
| `test/sync-code.test.ts` | `isSyncable()` returns `'code'` for supported extensions, manifest routing |
| `test/search-code.test.ts` | `simple` tsvector preserves identifiers; keyword search finds code pages |
| `test/e2e/code-ingest.test.ts` | import a real `.ts` file, verify round-trip, re-import is idempotent |

---

## Phase 2: Symbol-Level Indexing

**Goal:** Parse code into named symbols (functions, classes, interfaces). Enable
"where is `putPage` defined" queries. Symbols are stored as enriched chunk
metadata — no new table.

### 2.1 Add tree-sitter

```bash
bun add tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-go
```

WASM builds, works in Bun, no native compilation.

### 2.2 Symbol extraction

**New file: `src/core/code/symbol-extractor.ts`**

```ts
export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'type' | 'const' | 'variable';
  qualifiedName?: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
  visibility: 'public' | 'private' | 'protected';
  isExported: boolean;
}

export async function extractSymbols(source: string, language: string): Promise<CodeSymbol[]>;
```

### 2.3 Reuse `content_chunks` for symbol data

Instead of a new `code_symbols` table, populate the Phase 1 columns:

| Column | Value |
|---|---|
| `chunk_text` | symbol body (the actual source code of the function/class) |
| `chunk_source` | `'source_code'` |
| `start_line` / `end_line` | symbol range |
| `symbol_name` | `putPage` |
| `symbol_kind` | `'function'` |

`frontmatter` (if we add a metadata JSONB column) or new columns:

| Extra metadata | Value |
|---|---|
| `signature` | `export async function importFromContent(...)` |
| `doc_comment` | extracted JSDoc / docstring |
| `visibility` | `'public'` |
| `is_exported` | `true` |
| `qualified_name` | `BrainEngine.putPage` (if class method) |

**One symbol = one chunk.** This lets the existing `searchVector` /
`searchKeyword` / `hybridSearch` pipeline find symbols without any new search
methods.

If a symbol is larger than the chunker's line target, it spans multiple chunks
with the same `symbol_name` (header chunk + body chunks). The header chunk gets
the signature + doc_comment metadata.

### 2.4 Symbol search via existing operations

**No new operation needed.** The existing `search` and `query` operations work:

- `gbrain search putPage` → keyword search hits `symbol_name` (pg_trgm) and
  `chunk_text`
- `gbrain query "where is the put page operation defined"` → hybrid search
  returns the chunk with `symbol_name='putPage'`

**File: `src/core/search/intent.ts`**

Add code intents:

```ts
export type QueryIntent = 'entity' | 'temporal' | 'event' | 'general'
  | 'code_definition' | 'code_relationship';

const CODE_DEFINITION_PATTERNS = [
  /where is .+ defined/i,
  /definition of .+/i,
  /find (?:the )?(?:function|class|method|interface|type) .+/i,
  /what is .+ (?:function|class|method)/i,
];

const CODE_RELATIONSHIP_PATTERNS = [
  /who (?:calls|uses|imports) .+/i,
  /what (?:calls|depends on|references) .+/i,
  /callers? of .+/i,
];
```

For `code_definition` intent, `detail='low'` (just the signature chunk, not
the whole body). For `code_relationship`, route to the links table (Phase 3).

**File: `src/core/search/keyword.ts`**

Add symbol name matching via pg_trgm:

```sql
-- Already have trgm index on pages.title
-- Add trgm index on content_chunks symbol columns:
CREATE INDEX idx_chunks_symbol_name ON content_chunks USING gin(symbol_name gin_trgm_ops);
```

When the query looks like an identifier (camelCase, snake_case, no spaces),
boost results where `symbol_name` matches.

### 2.5 New CLI commands (thin wrappers)

```bash
gbrain list --type code_file                  # list all code files
gbrain list --type code_file --tag typescript  # filter by language
gbrain search putPage                         # finds symbol across code files
gbrain query "where is putPage defined"       # hybrid search returns symbol
```

No new CLI commands strictly needed — existing ones work with the widened types.
But a convenience wrapper is nice:

```bash
gbrain code search <symbol-name>              # shorthand for --type code_file search
gbrain code list                              # shorthand for list --type code_file
```

### 2.6 Tests

| Test file | What it tests |
|---|---|
| `test/code/symbol-extractor.test.ts` | tree-sitter parsing for TS/Python/Go: function, class, interface, export detection, doc comment extraction |
| `test/import-code-symbols.test.ts` | import code file → chunks carry symbol_name, symbol_kind, signature |
| `test/search-code-symbols.test.ts` | search "putPage" returns the correct chunk with symbol metadata |
| `test/intent-code.test.ts` | code_definition and code_relationship intent classification |

---

## Phase 3: Code References as Links

**Goal:** Import/call relationships become `links` rows. Enable "who calls
`putPage`" and "what does changing this function affect" via existing
`traverse_graph` and `get_backlinks`.

### 3.1 Reuse the `links` table

| Column | Value for code reference | Notes |
|---|---|---|
| `from_page_id` | caller/importer page | |
| `to_page_id` | callee/imported page | |
| `link_type` | `'imports'` / `'calls'` / `'extends'` / `'implements'` / `'tests'` | Existing TEXT column, no DDL change |
| `link_source` | `'code_import'` | New value — existing CHECK constraint needs widening |
| `origin_slug` | file that contains the reference | For reconciliation (same as frontmatter origin) |

The `links` table's `link_source` CHECK constraint currently allows
`'markdown'`, `'frontmatter'`, `'manual'`. Add `'code_import'`.

Reconciliation works exactly like markdown links: when a code file is
re-imported, delete all `link_source='code_import'` edges from that page, then
re-extract. Manual and markdown edges are untouched.

### 3.2 Reference extraction

**New file: `src/core/code/reference-extractor.ts`**

```ts
export interface CodeReference {
  fromPath: string;
  toPath: string;
  refType: 'imports' | 'calls' | 'extends' | 'implements' | 'tests';
  lineNumber: number;
}

export async function extractReferences(
  source: string,
  language: string,
  filePath: string,
  localSymbols: Set<string>,          // symbols defined in this file
): Promise<CodeReference[]>;
```

Extraction strategies (deterministic, no LLM):

| Ref type | How to detect |
|---|---|
| `imports` | `import ... from './path'` (TS/JS), `from X import` (Python), `import "X"` (Go) |
| `calls` | Function calls within a file, resolved to local symbols |
| `extends` | `class X extends Y` (TS/Java/Python) |
| `implements` | `class X implements Y` (TS/Java) |
| `tests` | Heuristic: test file naming (`*.test.ts`), import of source file, `describe`/`it`/`test` blocks |

Import paths (`'./path'`) are resolved to `code/<path>` slugs to match the
page slug convention.

### 3.3 Graph traversal works as-is

The existing `traverse_graph` operation and `graph-query` CLI use recursive CTEs
over the `links` table. Since code references are `links` rows, they're
automatically traversable:

```bash
# Who calls putPage?
gbrain graph-query code/src/core/operations --direction in --depth 2

# What does putPage call?
gbrain graph-query code/src/core/operations --direction out --depth 2

# Filter by link type
gbrain graph-query code/src/core/operations --type calls
```

The existing `get_backlinks` operation also works — returns both markdown
references and code import references to a code page.

### 3.4 Test associations

The `tests` ref type connects test files to source files:

```text
code/test/import-file.test --tests--> code/src/core/import-file
```

"Does this function have tests?" becomes a graph query:

```bash
gbrain graph-query code/src/core/import-file --type tests --direction in
```

### 3.5 Cross-type linking (code ↔ markdown)

**File: `src/core/link-extraction.ts`**

Extend `DIR_PATTERN` and `extractEntityRefs()` to recognize code references in
markdown pages:

```markdown
The entry point is [[code:src/core/import-file.ts#importFromContent]].
```

- New `code` directory prefix in `DIR_PATTERN`
- Slug: `code/src/core/import-file` (page that exists from Phase 1)
- `#importFromContent` suffix → stored in `link_type` context for symbol-level
  precision

This creates bidirectional links:

```bash
# From markdown page about architecture → code page
gbrain graph-query architecture/gbrain-ingestion-layer --direction out

# From code page → back to markdown documentation
gbrain graph-query code/src/core/import-file --direction in
```

### 3.6 Tests

| Test file | What it tests |
|---|---|
| `test/code/reference-extractor.test.ts` | import extraction for TS/Python/Go, call detection, extends/implements, test file heuristics |
| `test/code-graph.test.ts` | import references become links, traverse_graph traverses code links, reconciliation cleans stale code_import edges |
| `test/link-extraction-code.test.ts` | `[[code:path#symbol]]` extraction from markdown, bidirectional link creation |

---

## Phase 4: Code Summaries via compiled_truth

**Goal:** Generate LLM-derived summaries for code symbols. Use the existing
`compiled_truth` field to store summaries alongside raw code.

### 4.1 compiled_truth for code = source + summary

For code pages, `compiled_truth` currently holds raw source code. Change it to
hold a combined document:

```markdown
## putPage

Exported async function. Writes a page and its metadata to the database.

**Inputs:** engine, slug, content, opts
**Outputs:** ImportResult with slug, status, chunks count
**Side effects:** DB write (upsert pages, chunks, tags), OpenAI API call (embedding)

---
> Auto-generated summary. Source: src/core/operations.ts lines 52-180
```

Raw source code moves to `page.timeline` (repurposed for code) or stored via
`put_raw_data` (already exists for JSON sidecar storage).

**Better alternative:** Keep raw source in `compiled_truth`. Add a separate
`code_summary` column or store summaries as `chunk_source='code_summary'` chunks.
This avoids overwriting the searchable source code.

**Recommended approach:** Store summaries as additional chunks:

| Chunk | chunk_source | Content |
|---|---|---|
| chunk 0 | `'source_code'` | raw function body |
| chunk 1 | `'source_code'` | raw function body (next part) |
| chunk N | `'code_summary'` | LLM-generated summary (new chunk_source value) |

`'code_summary'` gets the same `compiled_truth` boost in hybrid search, making
natural-language code queries ("how does authentication work") prefer summaries
over raw code.

### 4.2 Summary generation pipeline

**New file: `src/core/code/summary-generator.ts`**

- Input: symbol signature + doc_comment + body (truncated)
- Output: structured summary (inputs, outputs, side_effects, security_notes)
- Run via Minions queue (long-running, retryable, uses existing infrastructure)
- Re-generate on symbol change (detected via start_line/end_line shift)

### 4.3 Tests

| Test file | What it tests |
|---|---|
| `test/code/summary-generator.test.ts` | summary format, truncation, re-generation trigger |

---

## Phase 5: Deep Integration

**Goal:** Unified query across markdown + code. Brain pages reference code;
code pages reference design docs, PRs, meetings.

### 5.1 Cross-modal search (already works)

`gbrain query "put_page security validation"` already returns:
- Markdown pages explaining the design (chunk_source='compiled_truth')
- Code symbol chunks implementing the logic (chunk_source='source_code')
- Code summary chunks describing the function (chunk_source='code_summary')

The hybrid search pipeline doesn't care about content type. RRF fusion and
dedup work across all chunk sources.

### 5.2 Ranking tweaks for code

**File: `src/core/search/hybrid.ts`**

- Code summary chunks get `compiled_truth` boost (2.0x) since they serve the
  same role as compiled_truth for markdown pages — the "current best understanding"
- Symbol name exact match gets an additional boost (similar to backlink boost)
- Code pages with test links (`link_type='tests'`) get a small trust boost

### 5.3 Final state: one query surface for everything

```bash
# Natural language about code
gbrain query "how does put_page handle auto-linking"

# Exact symbol lookup
gbrain search importFromContent

# Graph traversal across markdown and code
gbrain graph-query code/src/core/operations --depth 2

# Find orphan code files (existing find_orphans works!)
gbrain orphans --type code_file

# Doctor checks code embed coverage (existing doctor, type='code_file' pages)
gbrain doctor
```

---

## Modified Files Summary

### Phase 1
| File | Change |
|---|---|
| `src/core/types.ts` | Add `'code_file'` to PageType, `'source_code'` to chunk_source |
| `src/core/sync.ts` | `isSyncable()` returns `'markdown' \| 'code' \| false` |
| `src/core/import-file.ts` | Add `importCodeFile()` |
| `src/core/chunkers/code.ts` | **New.** Blank-line code chunker with line metadata |
| `src/core/pglite-schema.ts` | `code_search_vector` column, metadata columns on chunks |
| `src/schema.sql` | Same DDL changes |
| `src/core/migrate.ts` | Migration v16 |
| `src/core/search/keyword.ts` | Dual tsvector routing (english vs simple) |
| `src/commands/import.ts` | `--include-code` flag |
| `src/commands/sync.ts` | Route code files to `importCodeFile()` |

### Phase 2
| File | Change |
|---|---|
| `package.json` | `tree-sitter` + language grammars |
| `src/core/code/symbol-extractor.ts` | **New.** tree-sitter symbol extraction |
| `src/core/import-file.ts` | Symbol-aware chunking in `importCodeFile()` |
| `src/core/search/intent.ts` | `code_definition`, `code_relationship` intents |
| `src/core/search/keyword.ts` | pg_trgm on `symbol_name`, identifier boost |
| `src/commands/code.ts` | **New.** `gbrain code search/list` (thin wrapper) |

### Phase 3
| File | Change |
|---|---|
| `src/core/code/reference-extractor.ts` | **New.** import/call/test extraction |
| `src/core/link-extraction.ts` | `[[code:path#symbol]]` support |
| `src/core/pglite-schema.ts` | Widen `link_source` CHECK to include `'code_import'` |
| `src/schema.sql` | Same constraint change |

### Phase 4
| File | Change |
|---|---|
| `src/core/types.ts` | Add `'code_summary'` to chunk_source |
| `src/core/code/summary-generator.ts` | **New.** LLM summary generation |
| `src/core/search/hybrid.ts` | `code_summary` gets compiled_truth boost |

### Phase 5
| File | Change |
|---|---|
| `src/core/search/hybrid.ts` | Symbol exact match boost, test-link trust boost |

---

## What We Avoid Building

| Parallel approach (Section 12 original) | Why we don't need it |
|---|---|
| `code_repositories` table | `sources` table (v0.18) already handles multi-repo |
| `code_files` table | `pages` with `type='code_file'` + frontmatter metadata |
| `code_symbols` table | `content_chunks` with `symbol_name`/`symbol_kind` columns |
| `code_references` table | `links` with `link_source='code_import'` |
| `code_changes` table | `page_versions` already tracks history |
| `code_dependencies` table | `frontmatter` JSONB can hold package dependencies |
| Separate code search pipeline | `hybridSearch()` is content-agnostic; just needs intent routing |
| New graph traversal for code | `traverse_graph` recursive CTE works on any link type |
