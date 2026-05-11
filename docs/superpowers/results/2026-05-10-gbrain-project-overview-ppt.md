# GBrain 项目汇报

---

## Slide 1: 项目定位

### GBrain — 个人知识脑

> "Postgres-native personal knowledge brain with hybrid RAG search"

为 AI agent 提供长期记忆和知识检索能力的个人知识管理系统。

**作者**: Garry Tan (Y Combinator President & CEO)
**版本**: v0.16.4
**许可**: MIT
**技术栈**: TypeScript (ESM) + Bun + Postgres/pgvector

### 生产规模

| 指标 | 数据 |
|------|------|
| 页面数 | 17,888 |
| 人物实体 | 4,383 |
| 公司实体 | 723 |
| 自动化 cron 任务 | 21 个 |
| 开发周期 | 12 天 |

---

## Slide 2: 核心价值主张

### 解决的问题

AI agent 执行任务时缺乏**持久化知识**和**上下文记忆**。每次会话从零开始，无法积累经验。

### GBrain 的答案

```mermaid
flowchart TB
    AG["🤖 AI Agent<br/>Claude Code / OpenCode / Cursor"]
    GB["🧠 GBrain"]
    subgraph GBrain
        SE["Search<br/>Hybrid RAG"]
        GR["Graph<br/>Self-Wiring"]
        TL["Timeline<br/>Compiled Truth"]
    end
    DB[("Postgres + pgvector<br/>PGLite WASM / Supabase / 自托管")]

    AG -- "MCP (stdio)" --> GB
    SE --> DB
    GR --> DB
    TL --> DB
```

### 三大差异化能力

1. **自接线知识图谱** — 零 LLM 调用的实体关系提取，写即连线
2. **混合 RAG 搜索** — 向量 + 关键词 + 多查询扩展 + RRF 融合 + 4 层去重
3. **编译真理层** — 两层页面架构（编译真理 above / 时间线 below），信息不会过时

---

## Slide 3: 架构总览

### 四层架构

```mermaid
flowchart TB
    subgraph L1["Agent 交互层"]
        CLI["CLI (55 commands)"]
        MCP["MCP Server (36 tools, stdio)"]
    end

    subgraph L2["核心操作层 (Contract-First)"]
        OPS["operations.ts — 36 个操作定义<br/>CLI 和 MCP 共享的单一事实来源"]
    end

    subgraph L3["引擎抽象层 (BrainEngine Interface)"]
        PGL["PGLiteEngine<br/>WASM, 零配置"]
        PG["PostgresEngine<br/>Supabase / 自托管"]
    end

    subgraph L4["存储层"]
        GIT["Git (markdown 源)"]
        DB[("Database<br/>Postgres + pgvector<br/>+ tsvector + pg_trgm")]
    end

    CLI --> OPS
    MCP --> OPS
    OPS --> PGL
    OPS --> PG
    PGL --> DB
    PG --> DB
    GIT <--> DB
```

### 代码规模

| 指标 | 数值 |
|------|------|
| TypeScript 源文件 | 152 个 |
| 源代码行数 | 40,469 LOC |
| 测试文件 | 132 个 |
| 测试代码行数 | 32,092 LOC |
| 测试/源码比 | 0.79 |
| E2E 测试 | 27 个 (含 15 个 fixture 数据集) |
| 源目录数 | 19 个 |
| CLI 命令 | ~55 个 |
| MCP 工具 | 36 个 |
| Skills | 26 个 |

---

## Slide 4: 核心功能（一）— 混合搜索引擎

### 搜索管线

```
用户查询
    │
    ├──→ 向量搜索 (pgvector HNSW, cosine similarity)
    ├──→ 关键词搜索 (tsvector + ts_rank + websearch_to_tsquery)
    └──→ 多查询扩展 (生成替代表述)
            │
            ▼
      RRF 融合 (Reciprocal Rank Fusion)
            │
            ▼
      4 层去重 (compiled_truth > timeline > 其他)
            │
            ▼
      反向链接加权排序 (入链越多排名越高)
            │
            ▼
         返回结果
```

### 代码专用搜索

- 驼峰/蛇形/路径式查询自动检测
- 按文件/符号/import 分别索引
- 搜索结果附带 chunk metadata（文件路径、行号、符号名）

### BrainBench v1 基准数据

| 指标 | 无 Graph | 有 Graph | 提升 |
|------|---------|---------|------|
| Recall@5 | 83.1% | 94.6% | +11.5 pts |
| Precision@5 | 39.2% | 44.7% | +5.4 pts |
| Graph F1 | 57.8% (grep) | 86.6% | +28.8 pts |

---

## Slide 5: 核心功能（二）— 自接线知识图谱

### 零 LLM 调用的实体关系提取

每次写入页面 (`put_page`) 时自动触发：

```
页面内容 (markdown)
    │
    ▼
正则提取实体引用 (人名、公司名、项目名等)
    │
    ▼
pg_trgm 模糊匹配 → slug registry 解析
    │
    ▼
创建有类型链接
  attended / works_at / invested_in / founded / advises / ...
    │
    ▼
链接对账 (内容变更时移除过期链接)
    │
    ▼
图遍历查询 (graph-query, traverse_graph)
```

### 图操作

| 命令 | 功能 |
|------|------|
| `link <from> <to> --type` | 创建有类型链接 |
| `backlinks <slug>` | 查询反向链接 |
| `graph <slug> --depth N` | 图遍历 |
| `graph-query <slug> --type --direction` | 类型/方向过滤遍历 |
| `extract links` | 批量链接提取 (幂等) |

### 链接类型体系

支持多种关系类型：人员关系 (attended, works_at, founded, advises, invested_in)，知识关系 (references, extends, implements, depends_on)，时序关系 (follows, precedes)

---

## Slide 6: 核心功能（三）— 编译真理 + 时间线

### 两层页面架构

```
┌─────────────────────────────────┐
│  Compiled Truth (编译真理)       │  ← 永远是最新的综合结论
│  AI 维护，有新信息时重写          │
├─────────────────────────────────┤
│  Timeline (时间线)               │  ← 只追加，倒序排列
│  - 2026-05-10  会议纪要          │
│  - 2026-05-08  邮件摘录          │     原始证据日志
│  - 2026-05-05  电话记录          │
└─────────────────────────────────┘
```

### 设计目标

- **信息不会过时**: 编译真理始终是最新综合，时间线保留原始证据
- **可追溯**: 每个结论都能在时间线中找到原始来源
- **AI 友好**: agent 读编译真理获取结论，读时间线获取上下文

灵感来源: Karpathy 的 LLM wiki 模式

---

## Slide 7: 核心功能（四）— Minions 后台任务系统

### Postgres 原生的任务队列

```
┌──────────────────────────────────────────┐
│            Minions Job Queue              │
│                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │ Queue   │  │ Worker  │  │ Handler │  │
│  │ 1,152   │  │ Daemon  │  │ 内置 8  │  │
│  │ LOC     │  │         │  │ 个处理  │  │
│  │         │  │         │  │ 程序    │  │
│  └─────────┘  └─────────┘  └─────────┘  │
│                                          │
│  FOR UPDATE SKIP LOCKED (并发安全)        │
│  优先级队列 + 指数退避 + 速率限制          │
│  静默时段 + 错峰调度 + 进度上报            │
│  暂停/恢复/重放/干运行                    │
└──────────────────────────────────────────┘
```

### 内置 Handler

| Handler | 功能 |
|---------|------|
| sync | Git → DB 增量同步 |
| embed | 批量 embedding 生成 |
| lint | 页面质量检查 |
| import | 批量导入 |
| extract | 链接/时间线提取 |
| backlinks | 反向链接检查 |
| autopilot-cycle | 完整夜间维护周期 |
| subagent | 聚合子代理 (710 LOC) |

### 生产级特性

- SQL 级并发安全 (`FOR UPDATE SKIP LOCKED`)
- 指数退避重试 + 死信队列
- 速率租赁 (rate-leases) 防 API 过载
- 静默时段 (quiet-hours) 避开使用高峰
- MCP 安全边界：受保护的 job 名称 (shell 等) 禁止通过 MCP 提交

---

## Slide 8: 核心功能（五）— MCP 生态集成

### MCP Server (stdio)

```mermaid
flowchart TB
    subgraph Platforms["AI Agent 平台"]
        CC["Claude Code"]
        CD["Claude Desktop"]
        OC["OpenCode"]
        PP["Perplexity"]
        CR["Cursor"]
        AC["AlphaClaw"]
        CW["Claude Cowork"]
    end

    MCPS["GBrain MCP Server<br/>36 tools"]

    subgraph ToolGroups["工具分组"]
        T1["搜索/查询<br/>search / query"]
        T2["页面 CRUD<br/>get / put / delete / list"]
        T3["图操作<br/>graph / links / backlinks"]
        T4["文件管理<br/>upload / signed-url"]
        T5["任务系统<br/>submit / get_job"]
        T6["管理<br/>stats / health"]
    end

    DB[("Postgres<br/>+ pgvector")]

    Platforms -- "stdio (JSON-RPC)" --> MCPS
    MCPS --> ToolGroups
    ToolGroups --> DB
```

### 安全边界 (remote=true)

MCP 调用自动设置 `ctx.remote = true`，触发：
- 文件上传严格路径限制
- 禁止自动链接提取 (防止 prompt injection)
- 禁止自动时间线提取
- 受保护 job 名称拒绝执行
- `traverse_graph` 深度上限 10
- 结果列表 LIMIT 上限

### 支持的 Agent 平台

Claude Code, Claude Desktop, Claude Cowork, OpenCode, Perplexity, OpenClaw (AlphaClaw), Cursor, 及任何 stdio MCP 兼容平台。7 个部署指南文档。

---

## 管线可视化

### 项目架构思维导图

```mermaid
mindmap
  root((GBrain))
    CLI
      55个命令
      init / upgrade / doctor
      import / export / sync
      search / query / ask
      get / put / delete / list
      graph / backlinks / link
      jobs / stats / health
      dream / autopilot
    MCP_Server
      36个工具
      7个Agent平台
      安全边界
      Stdio传输
    核心引擎
      BrainEngine接口
      PGLiteEngine
      PostgresEngine
      37个方法
    混合搜索
      向量搜索
      关键词搜索
      多查询扩展
      RRF融合
      4层去重
    知识图谱
      零LLM提取
      有类型链接
      图遍历
      链接对账
    页面架构
      编译真理层
      时间线层
      版本历史
    后台任务
      Minions队列
      Worker守护
      8个Handler
      并发安全
    部署模式
      PGLite本地
      Postgres自托管
      Supabase云端
```

### 数据摄入管线

```mermaid
flowchart LR
    A1["📝 Markdown 目录"] --> B1["gbrain import\n批量导入"]
    A2["📦 Git 仓库"] --> B2["gbrain sync\n增量同步"]
    A3["📎 文件上传"] --> B3["files upload\nS3 / Supabase"]
    A4["🔌 API / Webhook"] --> B4["put_page\n单页写入"]

    B1 --> C1["文件遍历 + 解析"]
    B2 --> C2["Git Diff\n检测变更文件"]
    B3 --> C3["文件存储\n+ 重定向规则"]
    B4 --> C4["直接写入"]

    C1 --> D["分块器 Chunkers"]
    C2 --> D
    C3 --> D
    C4 --> D

    D --> E1["语义分块\nMarkdown 文档"]
    D --> E2["代码分块\nPython/TS/Go..."]
    D --> E3["递归分块\n长文档"]
    D --> E4["LLM 分块\n非结构化文本"]

    E1 --> F[("Postgres\nPages + Chunks")]
    E2 --> F
    E3 --> F
    E4 --> F
```

### gbrain sync 管线详解

`gbrain sync` 是 Git → Brain 的**增量同步**管线，追踪 Git commit 只处理变更文件。支持 Markdown 文档和代码文件双通道处理。

```mermaid
flowchart TB
    START["gbrain sync --repo /path --include-code"] --> GIT["Git Diff\n检测变更 (新增/修改/删除)"]

    GIT --> CHANGED{"文件类型?"}

    CHANGED -- ".md 文档" --> MD["Markdown 通道"]
    CHANGED -- ".py/.ts/.go 代码" --> CODE["代码通道\n(需要 --include-code)"]

    subgraph MD["Markdown 文档处理"]
        M1["解析 frontmatter\n(title, tags, type)"] --> M2["内容分块\n(语义/递归分块器)"]
        M2 --> M3["生成 Embedding\n(OpenAI API)"]
        M3 --> M4["创建 Concept Page"]
    end

    subgraph CODE["代码文件处理"]
        C1["语言检测\n+ 语法解析"] --> C2["符号提取\n(函数/类/import)"]
        C2 --> C3["代码分块\n(Code Chunker)"]
        C3 --> C4["符号 → chunk metadata"]
        C4 --> C5["imports → graph links"]
        C5 --> C6["创建 Code File Page"]
    end

    M4 --> STORE[("Postgres\n+ pgvector")]
    C6 --> STORE

    GIT -- "删除" --> DEL["标记页面为已删除\n+ 级联清理 chunks/links"]

    STORE --> EXTRACT["gbrain extract links\n批量链接提取(幂等)"]
    EXTRACT --> DONE["✅ 同步完成\n更新 Git bookmark"]
```

### 代码导入 vs 文档导入

| 维度 | Markdown 文档 | 代码文件 |
|------|-------------|---------|
| 页面类型 | concept | code_file |
| 分块器 | semantic / recursive | code (语言感知) |
| 元数据 | frontmatter (title, tags) | file_path, language, symbols |
| 链接提取 | wikilinks + 实体引用 | imports + calls |
| 搜索 | 全文 + 语义 | 关键词 + 符号名 (驼峰/蛇形感知) |
| 图遍历 | 实体关系 (works_at, founded) | 代码关系 (imports, calls) |

### 处理管线

```mermaid
flowchart TB
    subgraph 写入触发
        A["put_page(slug, content)"]
    end

    subgraph 分块与嵌入
        B1["内容分块"] --> B2["生成 Embedding"]
        B2 --> B3["存储到 pgvector"]
    end

    subgraph 知识图谱
        C1["正则提取实体引用"] --> C2["pg_trgm 模糊匹配"]
        C2 --> C3["创建有类型链接"]
        C3 --> C4["链接对账 (移除过期)"]
    end

    subgraph 时间线
        D1["正则提取日期/摘要"] --> D2["追加到 Timeline"]
    end

    subgraph 充实度
        E1["实体类型识别"] --> E2["加权评分"]
        E2 --> E3["充实度报告"]
    end

    A --> B1
    A --> C1
    A --> D1
    B3 --> E1
    C4 --> E1
    D2 --> E1
```

### 查询管线

```mermaid
flowchart LR
    Q["🔍 用户查询"] --> S1["向量搜索\npgvector HNSW"]
    Q --> S2["关键词搜索\ntsvector + ts_rank"]
    Q --> S3["多查询扩展\n替代表述生成"]

    S1 --> F["RRF 融合\nReciprocal Rank Fusion"]
    S2 --> F
    S3 --> F

    F --> D1["去重层 1\ncompiled_truth 优先"]
    D1 --> D2["去重层 2\ntimeline 优先"]
    D2 --> D3["去重层 3\n来源优先级"]
    D3 --> D4["去重层 4\ncosine 去重"]

    D4 --> B["反向链接加权\n入链越多排名越高"]
    B --> R["返回排序结果"]
```

### 夜间维护管线 (dream / autopilot)

```mermaid
flowchart TB
    START["🌙 触发"] --> P1["1. Git Pull\n同步脑仓库"]
    P1 --> P2["2. Sync\nMarkdown → DB"]
    P2 --> P3["3. Lint\n检查 LLM 痕迹、占位日期、错误 frontmatter"]
    P3 --> P4["4. Extract Links\n链接对账"]
    P4 --> P5["5. Check Backlinks\n修复缺失反向链接"]
    P5 --> P6["6. Embed Stale\n嵌入过期页面"]
    P6 --> P7["7. Find Orphans\n发现孤立页面"]
    P7 --> P8["8. Health Report\n生成健康报告"]
    P8 --> END["✅ 完成"]

    style START fill:#2d5016,color:#fff
    style END fill:#2d5016,color:#fff
    style P3 fill:#8b4513,color:#fff
    style P5 fill:#8b4513,color:#fff
```

### 端到端系统全景图

```mermaid
flowchart TB
    subgraph 数据源
        S1["📝 Markdown"]
        S2["📦 Git Repos"]
        S3["📎 Files"]
        S4["🔌 API"]
    end

    subgraph 摄入层
        I1["import"]
        I2["sync"]
        I3["files upload"]
        I4["put_page"]
    end

    subgraph 处理层
        P1["Chunkers\n分块"]
        P2["Embedding\n嵌入"]
        P3["Link Extract\n链接提取"]
        P4["Timeline\n时间线"]
        P5["Lint\n质量检查"]
        P6["Enrichment\n充实度"]
    end

    subgraph 存储层
        ST1[("Postgres\n+ pgvector")]
        ST2[("Git\nMarkdown 源")]
    end

    subgraph 查询层
        Q1["search\n关键词"]
        Q2["query\n混合RAG"]
        Q3["graph\n图遍历"]
        Q4["get_page\n页面读取"]
        Q5["backlinks\n反向链接"]
        Q6["code search\n代码搜索"]
    end

    subgraph 维护层
        M1["dream\n夜间周期"]
        M2["autopilot\n持续守护"]
        M3["doctor\n健康诊断"]
    end

    subgraph Agent
        AG["🤖 AI Agent\nClaude / OpenCode / Cursor"]
    end

    S1 --> I1
    S2 --> I2
    S3 --> I3
    S4 --> I4

    I1 --> P1
    I2 --> P1
    I3 --> P1
    I4 --> P1

    P1 --> P2
    P1 --> P3
    P1 --> P4
    P2 --> P6
    P3 --> P6
    P4 --> P6
    P5 --> P6

    P1 --> ST1
    P2 --> ST1
    P3 --> ST1
    P4 --> ST1
    ST1 <--> ST2

    ST1 --> Q1
    ST1 --> Q2
    ST1 --> Q3
    ST1 --> Q4
    ST1 --> Q5
    ST1 --> Q6

    M1 --> ST1
    M2 --> ST1
    M3 --> ST1

    Q1 --> AG
    Q2 --> AG
    Q3 --> AG
    Q4 --> AG
    Q5 --> AG
    Q6 --> AG
    AG --> I4
```

### Minions 任务队列并发模型

```mermaid
sequenceDiagram
    participant C as Client (CLI/MCP)
    participant Q as Queue (Postgres)
    participant W1 as Worker 1
    participant W2 as Worker 2
    participant H as Handler

    C->>Q: submit_job(name, params)
    Q-->>C: job_id

    W1->>Q: FOR UPDATE SKIP LOCKED
    Q-->>W1: claim job_1
    W2->>Q: FOR UPDATE SKIP LOCKED
    Q-->>W2: claim job_2

    W1->>H: dispatch(job_1)
    W2->>H: dispatch(job_2)

    H-->>W1: progress update
    W1->>Q: UPDATE progress
    H-->>W2: progress update
    W2->>Q: UPDATE progress

    H-->>W1: complete
    W1->>Q: UPDATE status=done
    H-->>W2: complete
    W2->>Q: UPDATE status=done

    C->>Q: get_job(job_id)
    Q-->>C: status + result
```

---

## Slide 9: 业务管线

### 数据管线全流程

```
┌─────────────────────────────────────────────────────────┐
│                    数据摄入层                             │
│                                                         │
│  Git Sync      Markdown      文件上传       API/Webhook  │
│  (增量同步)     Import        (S3/Supabase)  (自定义)    │
│  sync --watch  import <dir>   files upload                │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    处理管线                               │
│                                                         │
│  分块 (Chunkers)    链接提取       时间线提取             │
│  semantic/recursive  link-extract   timeline-extract     │
│  LLM/code            零 LLM 调用     正则自动提取         │
│                                                         │
│  Embedding          充实度评分      质量检查              │
│  OpenAI API          completeness   lint                  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    存储层                                 │
│                                                         │
│  Git 仓库 (源)     ←→   Postgres + pgvector (索引)       │
│  markdown 文件           Pages + Chunks + Links           │
│                           + Timeline + Embeddings         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    查询层                                 │
│                                                         │
│  关键词搜索      混合 RAG 搜索    图遍历                 │
│  search          query / ask       graph / graph-query   │
│                                                         │
│  代码搜索        反向链接          页面读取               │
│  code search     backlinks         get_page              │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    维护管线                               │
│                                                         │
│  dream (夜间周期)           autopilot (持续守护)          │
│  lint → extract → embed    循环执行 + cron 调度           │
│  → backlinks → health                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Slide 10: 部署管线

### 三种部署模式

| 模式 | 引擎 | 适用场景 |
|------|------|---------|
| **零配置本地** | PGLite WASM | 个人开发者，< 1,000 页面，2 秒启动 |
| **自托管** | Postgres + pgvector | 团队使用，自建服务器 |
| **云端** | Supabase | 生产环境，10K+ 页面，连接池 |

### 安装流程 (~30 分钟)

```bash
# 1. 安装
npm install -g gbrain

# 2. 初始化 (PGLite 零配置)
gbrain init

# 3. 导入内容
gbrain import ~/notes/
gbrain sync --repo ~/project/ --include-code

# 4. 注册到 AI Agent
# 编辑 ~/.config/claude-code/settings.json:
# { "mcp": { "gbrain": { "command": ["gbrain", "serve"] } } }
```

### 迁移支持

```bash
gbrain migrate --to supabase    # PGLite → Postgres (升级)
gbrain migrate --to pglite      # Postgres → PGLite (降级/备份)
```

### 数据库引擎对比

| 特性 | PGLite | Postgres |
|------|--------|----------|
| 启动时间 | 2 秒 | 需配置 |
| pgvector HNSW | ✅ | ✅ |
| tsvector + GIN | ✅ | ✅ |
| pg_trgm | ✅ | ✅ |
| 并发连接 | 单进程 | 连接池 (Supavisor) |
| 最大推荐页面 | < 1,000 | 10,000+ |
| 零配置 | ✅ | 需要连接 URL |

---

## Slide 11: 开发管线

### 技术栈

| 层面 | 技术 |
|------|------|
| 语言 | TypeScript (ESM) |
| 运行时 | Bun |
| 数据库 | Postgres 17.5 + pgvector |
| WASM 引擎 | @electric-sql/pglite |
| MCP 协议 | @modelcontextprotocol/sdk v1.0 |
| 搜索 | tsvector + pgvector HNSW + pg_trgm |
| 嵌入 | OpenAI Embeddings API |
| 测试 | Bun test + 自定义 E2E 框架 |
| 类型检查 | TypeScript strict mode |

### 代码组织

```mermaid
flowchart LR
    subgraph src["src/"]
        CLI["cli.ts<br/>638 LOC"]
        CORE["core/<br/>37 files"]
        CMD["commands/<br/>35 files"]
        MCP["mcp/<br/>server + tools"]
    end

    subgraph core["core/ 核心模块"]
        ENG["engine.ts<br/>37 methods"]
        OPS["operations.ts<br/>1,334 LOC"]
        SEARCH["search/<br/>hybrid + vector + keyword"]
        GRAPH["link-extraction.ts<br/>816 LOC"]
        MINIONS["minions/<br/>job queue + worker"]
        CHUNK["chunkers/<br/>semantic + code"]
        CYCLE["cycle.ts<br/>817 LOC"]
        CODE["code/<br/>code import + search"]
    end

    src --> core
    CLI --> CMD
    MCP --> OPS
    CLI --> OPS
```

### 工程质量

- 132 个测试文件，32K+ 行测试代码
- 27 个 E2E 测试覆盖核心管线
- Contract-First 设计：`operations.ts` 是 CLI 和 MCP 的单一事实来源
- 双引擎架构：同一套 SQL 在 PGLite WASM 和 Postgres 上运行
- 引擎间双向迁移测试

---

## Slide 12: 技术贡献

### 1. 自接线知识图谱 (零 LLM 调用)

正则驱动的关系提取，不需要调用 LLM 就能在页面间建立有类型链接。写入一个页面，自动发现并连接已存在的相关实体。BrainBench v1 证明：Graph F1 86.6% vs grep 57.8%。

### 2. 编译真理层架构

受 Karpathy LLM wiki 启发，两层页面架构让 AI 维护的知识库始终保持"最新综合结论 + 原始证据链"，解决了传统 wiki 信息过时的问题。

### 3. Pluggable Engine 抽象

BrainEngine 接口 (37 methods) 定义了完整的知识脑契约。两个实现共享同一套 SQL 和测试。新增引擎只需实现接口即可获得完整的 CLI + MCP + 搜索 + 图能力。

### 4. MCP 安全保障

`remote=true` 标志在 MCP 调用链中自动传播，实现了细粒度的安全边界：禁止 prompt injection (禁用 link extraction)、文件上传路径限制、job 名称白名单、图遍历深度限制。

### 5. SQL 级并发安全

Minions 任务队列使用 `FOR UPDATE SKIP LOCKED` 实现无锁并发 worker。E2E 测试验证：2 workers + 20 jobs → 恰好 20 完成，零重复认领，零遗漏。

---

## Slide 13: 生态贡献

### 开源工具链

| 工具 | 说明 |
|------|------|
| GBrain CLI | 55 个命令，覆盖知识脑全生命周期 |
| MCP Server | 36 个工具，7 个 Agent 平台已适配 |
| Skills Pack | 26 个技能模板，30 个使用指南 |
| repo-analyzer | Git 仓库分析 + wiki 自动生成 |
| E2E 测试框架 | 含 15 个 fixture 数据集，可复现基准 |

### 文档体系

| 类别 | 数量 | 内容 |
|------|------|------|
| 使用指南 | 30 个 | brain-agent loop, search modes, enrichment pipeline 等 |
| 架构文档 | 3 个 | infra-layer, Knowledge Runtime, Minions |
| MCP 部署 | 7 个 | 各 Agent 平台的 GBrain MCP 配置指南 |
| 集成方案 | 4 个 | credential-gateway, meeting-webhooks, reliability-repair |
| 设计文档 | 4 个 | Homebrew for Personal AI, 编译真理, 充实度管线 |
| 基准报告 | 5 个 | BrainBench v1, Minions vs OpenClaw, Knowledge Runtime v0.13 |

### 可复现基准

- **BrainBench v1**: 240 页 Claude Opus 生成语料库，完整检索质量评估
- **Minions vs OpenClaw**: 耐久性/吞吐/扇出/内存 4 维度对比
- **Knowledge Runtime v0.13**: 写入延迟/查询就绪时间/完整性修复率
- 所有基准含源码和复现指令

---

## Slide 14: 项目健康度

### 代码质量

| 指标 | 数值 |
|------|------|
| 测试/源码比 | 0.79 (32K / 40K LOC) |
| E2E 覆盖 | 27 个测试场景 |
| 引擎实现 | 2 个 (PGLite + Postgres) |
| 共享 SQL | 同一套 DDL 在两引擎运行 |

### 功能完整度

| 子系统 | 状态 | 说明 |
|--------|------|------|
| 页面 CRUD | ✅ | 含版本历史 + 回滚 |
| 混合搜索 | ✅ | 向量 + 关键词 + 扩展 + RRF |
| 知识图谱 | ✅ | 零 LLM 自接线 + 对账 |
| 时间线 | ✅ | 编译真理 + 原始证据两层 |
| 后台任务 | ✅ | 队列 + Worker + 8 个 Handler |
| MCP Server | ✅ | 36 tools, 7 platform guides |
| 代码索引 | ✅ | code import + code search |
| 充实度评分 | ✅ | 7 种实体类型评分标准 |
| 夜间维护 | ✅ | dream + autopilot 两种模式 |
| 仓库分析 | ✅ | Git 仓库 → wiki 自动生成 |
| 引擎迁移 | ✅ | PGLite ↔ Postgres 双向 |
| Skills 系统 | ✅ | 26 skills, contract-first |

### 测试层次

```
E2E Tests (27)
  ├── Tier 1 (无 API Key, PGLite 内存): 搜索质量, 图质量, MCP, Skills, 迁移
  └── Tier 2 (需要 DATABASE_URL, 真实 Postgres): 同步, 周期, Minions 并发, 升级

Benchmarks (5)
  ├── BrainBench v1 (检索质量)
  ├── Minions vs OpenClaw (4 维度)
  └── Knowledge Runtime v0.13 (延迟/修复率)

Unit Tests (132)
  └── 32,092 LOC, 覆盖所有核心模块
```

---

## Slide 15: 总结

### GBrain 是什么

一个为 AI agent 提供**持久化知识记忆**的 Postgres 原生个人知识脑。

### 核心能力

| 能力 | 实现 |
|------|------|
| 搜索 | 混合 RAG (向量 + 关键词 + 扩展 + RRF 融合) |
| 图谱 | 自接线知识图谱 (零 LLM 调用) |
| 记忆 | 编译真理 + 时间线两层架构 |
| 自动化 | Minions 任务队列 + autopilot 持续守护 |
| 集成 | MCP Server (36 tools, 7 platforms) |

### 关键数据

| 指标 | 数值 |
|------|------|
| 代码规模 | 40K LOC + 32K 测试 |
| 生产验证 | 17,888 pages, 21 cron jobs |
| 开源许可 | MIT |
| 安装时间 | ~30 分钟 |
| 数据库启动 | 2 秒 (PGLite WASM) |
| MCP 工具 | 36 个 |
| Agent 平台 | 7 个已适配 |
