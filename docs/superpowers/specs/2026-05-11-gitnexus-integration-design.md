# GitNexus Integration into GBrain — Design

## 目标

将 GitNexus 的代码智能（知识图谱、impact analysis、context tracing）集成到 GBrain 中，使 agent 通过 GBrain MCP 即可同时查询知识页面和代码结构，实现统一的语义搜索和图谱遍历。

## 集成目标

1. **统一搜索入口**: agent 通过 `gbrain query` 同时搜索知识页面和代码符号，无需切换工具
2. **代码图谱遍历**: agent 从代码符号出发沿 CALLS/IMPORTS/EXTENDS 边追踪调用链
3. **影响分析**: agent 在修改代码前通过 GBrain 评估 blast radius
4. **统一存储**: 代码符号、关系、embedding 存入 GBrain 的 Postgres + pgvector，与知识页面共存

## 架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                        AI Agent (Claude Code / OpenCode)          │
│                              │ MCP (stdio)                        │
│                              ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    GBrain MCP Server                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │  │
│  │  │  search   │  │  query   │  │ traverse │  │  get_page  │ │  │
│  │  │  (FTS)    │  │ (hybrid) │  │  _graph  │  │            │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │  NEW: code_query | code_context | code_impact          │   │  │
│  │  │  NEW: code_import                                       │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│              ┌───────────────┼───────────────┐                     │
│              ▼               ▼               ▼                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│  │ PostgresEngine│ │ BrainEngine  │ │  GitNexus     │              │
│  │  + pgvector  │ │  operations  │ │  Index Dir    │              │
│  │  (pages,     │ │  (MCP tools) │ │  (.gitnexus/) │              │
│  │   chunks,    │ │              │ │  LadybugDB    │              │
│  │   links,     │ │              │ │  (read-only)  │              │
│  │   embeddings)│ │              │ │               │              │
│  └──────────────┘ └──────────────┘ └──────────────┘               │
│         │                                               │           │
│         │  import                                       │           │
│         └───────────────────────────────────────────────┘           │
│                  gbrain code import                                  │
│         (reads GitNexus LadybugDB, writes GBrain pages/links)       │
└──────────────────────────────────────────────────────────────────────┘
```

### 架构决策

**方案对比**:

| 维度 | A: Deep Integration (GitNexus as Source) | B: MCP Proxy (forward) | C: Data Import (selected) |
|------|------------------------------------------|------------------------|---------------------------|
| 统一搜索 | 完全统一 | 需要两次调用 | 完全统一 |
| 代码改动量 | 大 (schema + engine 大改) | 小 | 中 (新增 tools + import cmd) |
| 维护负担 | 高 (耦合 GitNexus schema) | 低 | 中 (import 需适配 GitNexus 版本) |
| 数据新鲜度 | 实时 | 实时 | 需要 sync 保持同步 |
| agent 体验 | 透明 | 需要了解两个工具 | 透明 (都通过 GBrain MCP) |
| 独立演进 | GitNexus 升级可能破坏 GBrain | 互不影响 | GitNexus 升级影响 import |

**选择方案 C**: Data Import + GBrain-Native Code Tools。

理由：
- GitNexus 的 LadybugDB 是有 schema 的结构化数据，可以可靠导入 GBrain 的 pages/links/chunks
- 统一搜索（知识+代码）是最核心的用户价值，只有 deep import 能做到
- MCP Proxy 虽然简单但 agent 需要在两个工具间切换，失去统一搜索价值
- GitNexus 作为 read-only upstream，GBrain 不修改其数据，互不破坏

## 数据流

```
┌──────────┐    npx gitnexus     ┌──────────────┐    gbrain code     ┌──────────┐
│  Git     │ ──────────────────► │  GitNexus     │ ────────────────► │  GBrain   │
│  Repo    │    analyze           │  LadybugDB    │    import          │  Postgres │
│          │                      │  (.gitnexus/) │                   │  +pgvector│
└──────────┘                      └──────────────┘                   └──────────┘
                                                                           │
                                                                           │ MCP
                                                                           ▼
                                                                    ┌──────────┐
                                                                    │  Agent   │
                                                                    │  (Claude)│
                                                                    └──────────┘
```

### Import Pipeline

```
GitNexus LadybugDB  ──►  read graph nodes + edges  ──►  transform  ──►  GBrain
                             │                              │
                    ┌────────┴────────┐          ┌──────────┴──────────┐
                    │ File, Function,  │          │ pages (type:         │
                    │ Class, Method,   │          │  code_file,         │
                    │ Interface ...    │          │  code_class,        │
                    │                  │          │  code_function,     │
                    │ CALLS, IMPORTS,  │          │  code_method ...)   │
                    │ EXTENDS,         │          │                     │
                    │ IMPLEMENTS ...   │          │ links (type:        │
                    └──────────────────┘          │  code_call,         │
                                                  │  code_import,       │
                                                  │  code_extends ...)  │
                                                  │                     │
                                                  │ chunks (symbol body)│
                                                  │ embeddings          │
                                                  └─────────────────────┘
```

## Schema 变更

### 新增 link_type 值

现有 `links.link_type` 是自由文本字段。为代码关系新增规范值：

| link_type | 含义 | 来源关系 |
|-----------|------|----------|
| `code_call` | 函数/方法调用 | CALLS |
| `code_import` | 模块导入 | IMPORTS |
| `code_extends` | 类继承 | EXTENDS |
| `code_implements` | 接口实现 | IMPLEMENTS |
| `code_has_method` | 类拥有方法 | HAS_METHOD |
| `code_overrides` | 方法重写 | METHOD_OVERRIDES |
| `code_accesses` | 属性访问 | ACCESSES |
| `code_contains` | 文件包含符号 | CONTAINS |

### 新增 page type 值

现有 `pages.type` 新增：

| type | 含义 |
|------|------|
| `code_file` | 源代码文件 |
| `code_class` | 类定义 |
| `code_function` | 函数定义 |
| `code_method` | 方法定义 |
| `code_interface` | 接口定义 |
| `code_module` | 模块/包 |

### 新增 source

现有 `sources` 表新增一行代表代码源：

```sql
INSERT INTO sources (id, name, local_path, config)
VALUES ('code', 'code', NULL, '{"federated": true, "type": "code"}'::jsonb);
```

代码页面统一放在 `code/` slug 前缀下:
- `code/<repo>/file/<path>` — 文件
- `code/<repo>/class/<ClassName>`
- `code/<repo>/function/<FunctionName>`
- `code/<repo>/method/<Class.method>`

### 新增 config keys

```sql
INSERT INTO config (key, value)
VALUES ('code_import.last_sync', ''),
       ('code_import.repo_path', ''),
       ('code_import.embed_model', 'minimax-embo-01')
ON CONFLICT (key) DO NOTHING;
```

### 新增 imports_log 表 (可选)

记录每次 code import 的统计信息：

```sql
CREATE TABLE IF NOT EXISTS code_imports (
  id            SERIAL PRIMARY KEY,
  repo_path     TEXT NOT NULL,
  repo_commit   TEXT NOT NULL,
  nodes_total   INTEGER NOT NULL,
  edges_total   INTEGER NOT NULL,
  chunks_total  INTEGER NOT NULL,
  embedded      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'done',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
```

## MCP Tools 设计

### Tool 1: `code_import`

```
code_import({repo_path: "/path/to/repo", embed: true, force: false})
→ {status: "imported", repo: "my-project", nodes: 4325, edges: 10556,
   chunks: 3812, embedded: 3812}
```

从 GitNexus LadybugDB 读取图数据，写入 GBrain pages/links/chunks。
- 默认增量: 比对 `last_commit` (存在 `code_imports` 表)
- `force: true` 删除已有 code 页面重新导入
- `embed: true` 对代码 chunk 生成 MiniMax embedding

### Tool 2: `code_query`

```
code_query({query: "auth middleware", repo: "my-project", limit: 20})
→ [{symbol: "AuthMiddleware.dispatch", kind: "method", file: "auth.py:42",
    score: 0.92, process: "request-auth-flow", ...}, ...]
```

复用 GBrain 的 `hybridSearch`，过滤 `source_id = 'code'` 的页面。
返回代码符号 + 所属 process flow + 相关度分数。

### Tool 3: `code_context`

```
code_context({symbol: "AuthMiddleware", repo: "my-project"})
→ {symbol: {name, kind, file, line}, callers: [...], callees: [...],
   implements: [...], processes: [...]}
```

遍历 `links` 表，收集以该符号为起点/终点的 code_* 类型的 link。

### Tool 4: `code_impact`

```
code_impact({symbol: "validate_token", direction: "upstream", repo: "my-project", depth: 3})
→ {target: {...}, impact: [{symbol: "login_handler", depth: 1, risk: "HIGH"}, ...],
   risk_summary: {direct_callers: 5, transitive: 23, high_risk: 3}}
```

BFS/DFS 沿 `code_call` + `code_extends` link 遍历，深度可配 (默认 3)。
风险判定:
- depth=1 → HIGH (直接调用者，WILL BREAK)
- depth=2 → MEDIUM (间接依赖)
- depth=3 → LOW (传递依赖)

### Tool 5: `code_list_repos`

```
code_list_repos({})
→ [{name: "my-project", path: "/home/...", last_indexed: "2026-05-10",
    stats: {nodes: 4325, edges: 10556}}]
```

查询 `code_imports` 表，返回已导入的代码仓库列表。

## 关键代码路径

```
src/
├── commands/code-import.ts          # CLI: gbrain code import
├── core/import-code/                # 新增模块
│   ├── index.ts                     # 公共导出
│   ├── reader.ts                    # GitNexus LadybugDB reader (只读)
│   ├── transformer.ts              # GitNexus node/edge → GBrain page/link
│   ├── slug-builder.ts             # 代码 symbol → GBrain slug 映射
│   └── embedder.ts                 # 代码 chunking + MiniMax embedding
├── core/operations.ts               # 新增 code_* operations
└── mcp/
    ├── server.ts                    # 无需改动 (自动发现 operations)
    └── tool-defs.ts                # 无需改动 (自动从 operations 生成)
```

### reader.ts — GitNexus LadybugDB Reader

```typescript
// 通过 GitNexus LadybugDB 的 Node.js API 读取
// 或者直接读取 ~/.gitnexus/registry.json 找到 repo 对应的 ladybug 路径
// 使用 GitNexus 的 lbug-adapter.ts 中的查询方法
interface CodeNode {
  id: string;         // e.g., "Method:auth.py:AuthMiddleware.dispatch#1"
  label: string;      // e.g., "Method"
  properties: Record<string, unknown>;  // name, file, line, signature...
}

interface CodeEdge {
  from: string;       // source node id
  to: string;         // target node id
  type: string;       // CALLS, IMPORTS, EXTENDS, ...
  properties: Record<string, unknown>;
}

// 读取所有节点和边
function readGraph(repoPath: string): { nodes: CodeNode[]; edges: CodeEdge[] }
```

### transformer.ts — Node/Edge → Page/Link

```typescript
// node label → page type 映射
const NODE_TO_PAGE_TYPE: Record<string, string> = {
  'File': 'code_file',
  'Class': 'code_class',
  'Function': 'code_function',
  'Method': 'code_method',
  'Interface': 'code_interface',
  // ...
};

// node → page
function nodeToPage(node: CodeNode, repo: string): PageInput {
  return {
    source_id: 'code',
    slug: buildCodeSlug(repo, node),
    type: NODE_TO_PAGE_TYPE[node.label] || 'code_file',
    title: node.properties.name,
    compiled_truth: formatCodeContent(node),
    frontmatter: {
      repo,
      file: node.properties.file,
      line: node.properties.line,
      kind: node.label,
      signature: node.properties.signature,
    },
  };
}

// edge → link
function edgeToLink(edge: CodeEdge, slugMap: Map<string, string>): LinkBatchInput {
  return {
    from_slug: slugMap.get(edge.from),
    to_slug: slugMap.get(edge.to),
    link_type: edgeTypeToLinkType(edge.type),
    link_source: 'code_import',
    from_source_id: 'code',
    to_source_id: 'code',
  };
}
```

### slug-builder.ts — Symbol → Slug 映射

```typescript
// Symbol ID: "Method:auth.py:AuthMiddleware.dispatch#1"
// → slug: "code/my-project/method/auth-middleware-dispatch"
function buildCodeSlug(repo: string, node: CodeNode): string {
  const kind = node.label.toLowerCase();
  const safeName = node.properties.name
    .replace(/[.@#]/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
  return `code/${repo}/${kind}/${safeName}`;
}
```

## 测试方案

### 单元测试

| 测试对象 | 测试内容 |
|----------|----------|
| `transformer.ts` | node→page 映射正确性 (15种 node label) |
| `transformer.ts` | edge→link 映射正确性 (10种 edge type) |
| `slug-builder.ts` | slug 生成唯一性、可读性、特殊字符处理 |
| `reader.ts` | LadybugDB 读取 mock 测试 |

### 集成测试

| 场景 | 验证方式 |
|------|----------|
| `code import` 端到端 | 对小型 fixture repo (10 个文件) 运行 import，验证 pages/links/chunks 数量 |
| `code_query` 搜索 | 搜索已知符号，验证召回率和排序 |
| `code_context` 遍历 | 查询已知调用关系，验证 caller/callee 完整性 |
| `code_impact` blast radius | 修改 fixture 中的核心函数，验证上游影响分析准确性 |
| 增量 import | 修改 repo 一个文件，re-index + re-import，验证只更新变化部分 |
| embedding 生成 | 验证 code chunk 的 MiniMax embedding 生成和向量搜索可用 |

### E2E 测试

用已知的 GitNexus fixture repo (GitNexus 自带的 test fixtures)，完整走通 `gitnexus analyze → gbrain code import → code_query → code_context → code_impact` 链路。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| GitNexus LadybugDB schema 变化导致 import 失败 | 版本 pin: 记录 GitNexus 版本号在 import metadata 中；import 前做 schema version check |
| 大仓库导入性能 (Starlette ~12K LOC, React ~300K) | 分批次导入 (batch insert pages/links); 对大仓库限制只导入特定符号类型 |
| slug 冲突 (不同 repo 的同名符号) | slug 前缀包含 repo 名: `code/<repo>/class/User` |
| 嵌入维度不一致 (GitNexus 384D vs GBrain 1536D) | 不导入 GitNexus embedding; 在 GBrain 侧用 MiniMax 重新生成 |
| 数据新鲜度: GitNexus index 过期 | 提供 `--reindex` 选项自动运行 `gitnexus analyze` 后再 import; cron job 定期 sync |
| code_impact 大图遍历性能 | 深度上限 (默认 3, 最大 5); CTE 查询使用 pg 递归; 大图预计算可达性缓存 |
