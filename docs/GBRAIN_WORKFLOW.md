# GBrain 项目工作流程

这份文档详细说明 GBrain 个人知识大脑的核心工作流程和数据流。

## 目录
- [核心架构](#核心架构)
- [数据流入流程](#数据流入流程)
- [日常维护周期](#日常维护周期)
- [查询与检索流程](#查询与检索流程)
- [后台任务系统](#后台任务系统)
- [技能系统](#技能系统)

---

## 核心架构

### 三层结构
```
┌─────────────────────────────────────────────────────────────┐
│                   Agent 交互层                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │    CLI      │  │  MCP 服务   │  │   Skills       │    │
│  └─────────────┘  └─────────────┘  └─────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                   核心操作层 (Contract)                      │
│              src/core/operations.ts (40+ 操作)              │
├─────────────────────────────────────────────────────────────┤
│                   引擎抽象层 (BrainEngine)                   │
│              ┌─────────────────┬─────────────────┐         │
│              │   PGLiteEngine  │ PostgresEngine  │         │
│              │  (嵌入式默认)   │  (Supabase/自建) │         │
│              └─────────────────┴─────────────────┘         │
├─────────────────────────────────────────────────────────────┤
│                   存储层                                    │
│      ┌──────────────┐        ┌──────────────────┐         │
│      │ Git 仓库     │        │  数据库          │         │
│      │ (事实来源)   │        │  (索引/向量)    │         │
│      └──────────────┘        └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 关键设计原则

1. **Git 即事实来源**
   - Markdown 文件存在 Git 仓库中，人类可以直接读写
   - 数据库是索引层，用于快速检索，不是事实来源

2. **契约优先 (Contract-first)**
   - 所有操作定义在 `src/core/operations.ts`
   - CLI 和 MCP 都从同一契约生成

3. **可插拔引擎**
   - PGLite：嵌入式 Postgres，零配置，适合 1000 页以下
   - Postgres：完整的 pgvector + hybrid search，适合大规模
   - `gbrain migrate` 双向迁移

---

## 数据流入流程

### 1. 信号捕获 (Signal Detection)

每个用户消息都会触发并行的信号检测（不阻塞主响应）：

```
用户输入
   │
   ├─> 主响应路径（同步）
   │
   └─> 信号检测器（后台并行）
         │
         ├─> 提取原创想法
         │    └─> 创建 concepts/ 或 ideas/ 页面
         │
         ├─> 提取实体引用
         │    ├─> 人物 → people/ 页面
         │    ├─> 公司 → companies/ 页面
         │    └─> 项目 → projects/ 页面
         │
         └─> 来源归因
              └─> 添加引用链接
```

### 2. 内容摄入 (Ingestion)

根据内容类型路由到不同技能：

| 内容类型 | 处理技能 | 输出 |
|---------|---------|------|
| 链接/文章/推文 | idea-ingest | wiki/ 页面 + 作者 + 引用 |
| 视频/音频/PDF | media-ingest | 转录 + 实体提取 + 时间线 |
| 会议记录 | meeting-ingestion | 会议页面 + 参会者 + 时间线 |
| 通用内容 | ingest | 路由到上述技能 |

### 3. 实体富集 (Enrichment)

三层富集策略，根据提及频率自动升级：

```
提及 1 次 → Tier 3：存根页面（基本信息）
提及 2-7 次 → Tier 2：网页 + 社交信息富集
提及 8+ 次 / 会议参与 → Tier 1：完整富集流程
```

富集内容：
- 人物：背景、专业领域、联系方式
- 公司：业务描述、团队、融资历史
- 概念：解释、相关概念链接、时间线

### 4. 自动链接 (Auto-linking)

每次页面写入时，零 LLM 调用的链接提取：

```
页面写入
   │
   ├─> 提取实体引用
   │    ├─> Markdown 链接：[名字](people/slug)
   │    └─> Obsidian 链接：[[people/slug|名字]]
   │
   ├─> 推断链接类型
   │    ├─> 会议页 + 人物 → attended
   │    ├─> "CEO of X" → works_at
   │    ├─> "投资了" → invested_in
   │    ├─> "创立了" → founded
   │    ├─> "顾问" → advises
   │    └─> 默认 → mentions
   │
   ├─> 协调（Reconciliation）
   │    └─> 删除内容中不再存在的链接
   │
   └─> 写入 links 表
```

### 5. 知识图谱数据模型

```
pages: slug, title, content, frontmatter, type
links: from_slug, to_slug, type, inferred_at
timeline_entries: slug, date, event, source_slug
```

---

## 日常维护周期

### Dream Cycle (`gbrain dream`)

GBrain 的核心是夜间维护周期，让大脑自动变得更聪明。**相位顺序有语义意义**（先修复文件，再索引）：

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: lint --fix  (文件系统修复，不涉及 DB)                  │
│   - 检测 LLM 产物痕迹（占位日期、临时文本）                     │
│   - 修复 frontmatter 格式问题                                   │
│   - 清理代码围栏                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Phase 2: backlinks --fix  (文件系统修复，不涉及 DB)             │
│   - 执行铁律："若 A 提及 B，则 B 必须提及 A"                   │
│   - 为缺失的反向链接添加合理的引用（"A 在会议中提到了 B"）     │
├─────────────────────────────────────────────────────────────────┤
│ Phase 3: sync  (DB 拾取前两阶段的变更)                          │
│   - Git -> DB 增量同步                                          │
│   - 按内容哈希去重                                               │
│   - 切块更新 (chunks)                                            │
├─────────────────────────────────────────────────────────────────┤
│ Phase 4: extract  (DB 写入链接和时间线)                         │
│   - 批量提取实体链接                                             │
│   - 批量提取时间线条目                                           │
├─────────────────────────────────────────────────────────────────┤
│ Phase 5: embed --stale  (DB 写入向量)                          │
│   - 仅为变更内容重新生成嵌入                                     │
│   - 批处理优化                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Phase 6: orphans  (DB 只读，仅报告)                            │
│   - 找出零入站链接的页面                                         │
│   - 建议处理方式（链接或归档）                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 协调机制 (Coordination)

防止并行运行导致损坏：

| 引擎类型 | 锁机制 | TTL |
|---------|-------|-----|
| Postgres | `gbrain_cycle_locks` 表行锁 | 30 分钟 |
| PGLite | `~/.gbrain/cycle.lock` 文件锁 | 30 分钟 |

锁在相位间刷新，长时间运行的周期不会超时。

### 自动运行方式

三种方式都收敛到 `runCycle()`，保证行为一致：

1. **一次性运行**：`gbrain dream --repo ~/brain`
2. **守护进程**：`gbrain autopilot --install`
3. **Minions 任务**：`gbrain jobs submit autopilot-cycle`

---

## 查询与检索流程

### 混合搜索 (Hybrid Search)

四层搜索流水线，结果合并并重新排序：

```
用户查询
   │
   ├─> 意图分类（Intent Classification）
   │    ├─> 实体查询 → 优先图谱遍历
   │    ├─> 时间查询 → 优先时间线筛选
   │    ├─> 事件查询 → 优先相关会议
   │    └─> 通用查询 → 完整混合搜索
   │
   ├─> 多查询扩展（Multi-Query Expansion）
   │    └─> Claude Haiku 重写为 3 种变体
   │
   ├─> 并行检索
   │    ├─> 向量搜索 (pgvector HNSW，cosine)
   │    └─> 关键词搜索 (tsvector + websearch_to_tsquery)
   │
   ├─> RRF 融合
   │    └─> score = sum(1/(60 + rank))
   │
   ├─> 重排序与提升
   │    ├─> 余弦相似度重评分
   │    ├─> 编译真理提升（评估 > 时间线）
   │    └─> 反向链接提升（连接好的实体靠前）
   │
   └─> 去重
        └─> 每页一个编译真理块保证
```

### 图谱查询 (Graph Query)

回答"谁认识谁"类问题：

```
gbrain graph-query people/alice \
  --type attended \
  --depth 2 \
  --direction both
```

实现：递归 CTE + 循环检测，不重复访问节点。

### 查询技能 (Query Skill)

用户自然语言查询的处理：

```
用户："我和 Bob 聊过什么？"
   │
   ├─> 大脑优先检查
   │    ├─> 先查询 people/bob 页面
   │    └─> 查找与 Bob 相关的会议
   │
   ├─> 图谱查询
   │    └─> 从 Bob 遍历 attended 类型边
   │
   ├─> 混合搜索
   │    └─> "Bob" + 相关关键词
   │
   ├─> 结果合成
   │    └─> 引用具体页面
   │
   └─> 返回（带引用）
        └─> "你在 meetings/2024-03-15 和 Bob 讨论了..."
```

---

## 后台任务系统

### Minions：Postgres 原生队列

确定性工作用 Minions，判断工作用子代理：

```
┌──────────────────────────────────────────────────────────────┐
│               任务状态机                                      │
│                                                              │
│  pending → queued → claimed → running → complete             │
│              ↓         ↓         ↓                          │
│           failed  (stalled) (cancelled)                     │
│              ↓         ↓         ↓                          │
│           dead      retry      (killed)                     │
└──────────────────────────────────────────────────────────────┘
```

### 核心特性

1. **父子任务 (Parent-Child)**
   - `max_children` 限制扇出
   - `child_done` 收件箱在所有子任务结束后聚合

2. **停滞检测 (Stall Detection)**
   - 每 30 秒心跳
   - `max_stalled`（默认 5 次错过心跳）后重新排队
   - SIGKILL 救援测试验证

3. **超时安全 (Timeout Safety)**
   - 每个任务的 `timeout_ms`
   - AbortSignal 传播到子进程
   - 优雅关闭 → 5 秒宽限期 → SIGKILL

### 子代理 (Subagents)

判断型工作（需要推理）用持久化子代理：

```
gbrain agent run "总结最近 10 页日记"
```

实现：
- 每轮 Anthropic 调用提交到 `subagent_messages`
- 工具调用二阶段提交：`pending → complete/failed`
- 崩溃重启从最后完整轮恢复
- `gbrain agent logs <job>` 流式查看

---

## 技能系统

### 技能解析器 (Skill Resolver)

`skills/RESOLVER.md` 定义路由表：

| 触发词 | 技能 |
|-------|------|
| 每条消息（并行不阻塞） | signal-detector |
| 任何大脑读写 | brain-ops |
| "告诉我关于"、"搜索" | query |
| "富集"、"创建人物页面" | enrich |
| 链接/文章/推文 | idea-ingest |
| 视频/音频/PDF | media-ingest |
| 会议记录 | meeting-ingestion |
| "后台任务"、"并行" | minion-orchestrator |

### 约定技能 (Conventions)

所有大脑写入技能必须遵守的交叉规则：

- `skills/conventions/quality.md` — 引用、反向链接、知名度门槛
- `skills/conventions/brain-first.md` — 先查大脑，再调用外部 API
- `skills/conventions/subagent-routing.md` — Minions vs 内联判断
- `skills/_brain-filing-rules.md` — 目录结构
- `skills/_output-rules.md` — 输出质量标准

### 技能创建流程

`skill-creator` 技能要求：

```
1. 定义触发词
2. 写 Phase 1-N 流程
3. 写质量检查
4. 写失败模式处理
5. 链接相关技能
6. 添加到 RESOLVER.md
7. 写测试用例
8. 验证可解析性 (gbrain check-resolvable)
```

### 技能验证 (Skillify)

`gbrain check-resolvable` 验证：

- 所有技能存在且可访问
- 无重复触发词
- 无循环依赖
- 无 DRY 违规（内联规则应委托到约定）
- RESOLVER.md 覆盖完整

---

## 页面数据模型

### 编译真理与时间线 (Compiled Truth + Timeline)

```markdown
---
title: "Acme AI"
type: company
tags: [startup, ai, yc]
founded: 2023
---

Acme AI 是一家 AI 初创公司，为开发者提供 API。
创始人：Alice（CEO）和 Bob（CTO）。
他们的核心产品是 AcmeGPT，一个用于代码生成的 LLM。

<!-- timeline -->
- 2023-01-15: 创立，Y Combinator W23
- 2023-03-20: 种子轮融资 500 万美元，领投 a16z
- 2023-06-01: 发布 AcmeGPT 测试版
- 2023-09-15: 宣布 1 万美元 ARR
- 2024-01-20: Garry 的会议记录：团队考虑 pivot 到垂直领域
```

**规则**：
- 分隔符上方：**编译真理** - 当前最佳理解，可重写
- 分隔符下方：**时间线** - 仅追加证据，永不删除
- 时间线必须有显式分隔符：`<!-- timeline -->` 或 `---` 紧接 `## Timeline` 之前

### 推荐目录结构

```
brain/
├── people/                    (人物)
│   ├── alice.md
│   └── bob.md
├── companies/                 (公司)
│   ├── acme-ai.md
│   └── stripe.md
├── deals/                     (交易/融资)
│   └── acme-ai-seed.md
├── concepts/                  (概念/想法)
│   └── ai-agents.md
├── projects/                  (项目)
│   └── gbrain.md
├── meetings/                  (会议记录)
│   └── 2024-01-20-alice.md
├── wiki/                      (通用知识)
│   └── llms.md
└── writing/                   (原创写作)
    └── essays/
```

---

## 集成食谱 (Integration Recipes)

`recipes/` 目录包含可执行的集成说明：

| 食谱 | 功能 |
|-----|------|
| ngrok-tunnel | 公共 URL 用于 MCP + 语音 |
| credential-gateway | Gmail + Calendar 访问 |
| twilio-voice-brain | 电话 → 大脑页面 |
| email-to-brain | Gmail → 实体页面 |
| x-to-brain | Twitter 时间线 + 提及 |
| calendar-to-brain | Google Calendar → 可搜索的日页面 |
| meeting-sync | Circleback 转录 → 带参会者的大脑页面 |

每个食谱包含：
- 前置检查
- 凭证询问
- 健康检查命令
- 建议的 cron 时间表

---

## 健康检查 (Doctor)

`gbrain doctor` 运行全面诊断：

```
检查项：
├─ 配置有效性
├─ 数据库连接
├─ schema 版本（0 警告！表示迁移未运行）
├─ JSONB 完整性（修复 v0.12 双重编码）
├─ markdown 完整性（检测截断页面）
├─ 嵌入覆盖率（未嵌入块 < 5% 为 ok）
├─ 链接密度（每页 > 2 个链接为 ok）
├─ 时间线覆盖率（实体 > 70% 有时间线为 ok）
├─ 孤儿页面（< 20 为 ok）
├─ 死链接
├─ 同步失败（未确认失败阻塞书签前进）
└─ 大脑得分（满分 100）
```

自动修复：
- `gbrain doctor --fix` 修复 DRY 违规
- `gbrain repair-jsonb` 修复双重编码
- `gbrain sync --skip-failed` 确认失败，继续前进

---

## 开发工作流

### 本地开发

```bash
git clone github.com/garrytan/gbrain
cd gbrain
bun install
bun link  # 安装 gbrain CLI 到 PATH

gbrain init  # 创建测试大脑
bun test      # 运行单元测试
```

### 测试

**单元测试**（不需要数据库）：
```bash
bun test
```

**端到端测试**（需要 Postgres）：
```bash
# 启动测试数据库
docker run -d --name gbrain-test-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gbrain_test \
  -p 5435:5432 \
  pgvector/pgvector:pg16

# 等待就绪后
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/gbrain_test \
  bun run test:e2e

# 清理
docker stop gbrain-test-pg && docker rm gbrain-test-pg
```

### 发布 (Ship)

**不要手动创建 PR**。使用 `/ship` 技能：

1. 运行完整测试（单元 + E2E）
2. 递增版本
3. 更新 CHANGELOG（Garry 语气 + 发布摘要）
4. 运行文档发布 (`/document-release`)
5. 创建 PR

---

## 数据流总结图

```
                     ┌──────────────┐
                     │   用户输入   │
                     └──────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────┐ ┌───────────────┐
    │ Signal-Detector │ │ Response │ │ Idea/Media/  │
    │ (后台并行)    │ │ (主路径) │ │ Meeting-Ingest│
    └──────┬───────┘ └──────────┘ └───────┬───────┘
           │                              │
           │                              ▼
           │                    ┌─────────────────┐
           │                    │  写入 Git 文件  │
           │                    └────────┬────────┘
           │                             │
           └──────────────────┬──────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   put_page()     │
                    │  (自动链接提取)  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
      ┌─────────────┐ ┌──────────┐  ┌───────────┐
      │ 写入 pages │ │ 写入 links │ │ 时间线条目│
      └─────────────┘ └──────────┘  └───────────┘

                    夜间周期 (gbrain dream)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐  ┌───────────┐
        │ lint --fix│   │ backlinks│  │ sync      │
        └──────────┘   └──────────┘  └─────┬─────┘
              │               │            │
              └───────────────┼────────────┘
                              ▼
              ┌─────────────────────────────┐
              │ extract (链接 + 时间线)     │
              └─────────────┬───────────────┘
                            ▼
              ┌─────────────────────────────┐
              │ embed --stale (向量)        │
              └─────────────┬───────────────┘
                            ▼
              ┌─────────────────────────────┐
              │ orphans (报告)              │
              └─────────────────────────────┘

                    查询路径
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌─────────────────────────────────────────────┐
      │ 意图分类 → 多查询扩展 → 向量 + 关键词搜索 │
      └──────────────────┬──────────────────────────┘
                         ▼
              ┌─────────────────────────────┐
              │ RRF 融合 → 重排序 → 去重    │
              └─────────────┬───────────────┘
                         ▼
              ┌─────────────────────────────┐
              │ 带引用的合成回答            │
              └─────────────────────────────┘
```

---

## 关键性能指标

来自生产部署（Garry 的 OpenClaw）：

| 指标 | 值 |
|-----|----|
| 总页面数 | 17,888 |
| 人物页面数 | 4,383 |
| 公司页面数 | 723 |
| 搜索延迟（P95） | < 100ms |
| Dream Cycle 时间 | 2-5 分钟 |
| Minions 任务成功率 | > 99% |
| 端到端摄入（链接 → 富集） | < 2 秒 |

---

*最后更新：2024-05-07*
