# GBrain

你的 AI  agent很聪明，但也很健忘。GBrain 给它一个大脑。

由 Y Combinator 总裁兼 CEO 构建，用于运行他自己的 AI agent。生产环境中支撑着他的 OpenClaw 和 Hermes 部署：**17,888 个页面，4,383 个人物，723 家公司**，21 个定时任务自主运行，12 天建成。agent在你睡觉时摄入会议、邮件、推文、语音通话和原始想法。它丰富每个遇到的人和公司。它修复自己的引用并在夜间整理记忆。你醒来时，大脑比睡前更聪明。

大脑自我连线。每次页面写入都提取实体引用并创建类型化链接（`attended`、`works_at`、`invested_in`、`founded`、`advises`），零 LLM 调用。混合搜索。自连线知识图谱。结构化时间线。反向链接加权排序。问"谁在 Acme AI 工作？"或"Bob 这个季度投资了什么？"——得到纯向量搜索无法触及的答案。端到端基准测试：在 240 页 Opus 生成的富文本语料库上，**Recall@5 从 83% 跃升至 95%，Precision@5 从 39% 升至 45%，agent的前 5 条阅读中多了 30 个正确答案**。图谱 F1：**86.6% vs grep 57.8%**（+28.8 分）。[完整报告](docs/benchmarks/2026-04-18-brainbench-v1.md)。

GBrain 是这些模式的通用化。26 个技能。30 分钟安装。你的 agent 完成工作。Garry 的个人 agent 变得更聪明，你的也是。

> **约 30 分钟获得一个完全工作的大脑。** 数据库 2 秒就绪（PGLite，无需服务器）。你只需回答几个关于 API 密钥的问题。

> **LLMs：** 获取 [`llms.txt`](llms.txt) 查看文档地图，或 [`llms-full.txt`](llms-full.txt) 获取内联核心文档的地图（一次获取）。**Agents：** 从 [`AGENTS.md`](AGENTS.md) 开始（如果你使用 Claude Code 则是 [`CLAUDE.md`](CLAUDE.md)）。

## 安装

### 在 agent 平台上（推荐）

GBrain 设计为由 AI agent 安装和操作。如果你还没有运行一个：

- **[OpenClaw](https://openclaw.ai)** ... 在 [Render 上部署 AlphaClaw](https://render.com/deploy?repo=https://github.com/chrysb/alphaclaw)（一键，8GB+ RAM）
- **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** ... 在 [Railway 上部署](https://github.com/praveen-ks-2001/hermes-agent-template)（一键）

将以下内容粘贴给你的 agent：

```
获取并遵循以下地址的指令：
https://raw.githubusercontent.com/garrytan/gbrain/master/INSTALL_FOR_AGENTS.md
```

就这些。agent 克隆仓库、安装 GBrain、设置大脑、加载 26 个技能、配置定时任务。你回答几个关于 API 密钥的问题。约 30 分钟。

如果你的 agent 不会自动读取 `AGENTS.md`，先让它读那个文件：
`https://raw.githubusercontent.com/garrytan/gbrain/master/AGENTS.md` 是非 Claude
agent 的操作协议（安装、阅读顺序、信任边界、常见任务）。完整文档地图使用同一 URL 根路径下的 `llms.txt`。

### 独立 CLI（无 agent）

```bash
git clone https://github.com/garrytan/gbrain.git && cd gbrain && bun install && bun link
gbrain init                     # 本地大脑，2 秒就绪
gbrain import ~/notes/          # 索引你的 markdown
gbrain query "我的笔记中出现了哪些主题？"
```

**不要使用 `bun install -g github:garrytan/gbrain`。** Bun 在全局安装时会阻止顶层
postinstall 钩子，导致 schema 迁移永远不会运行，CLI 首次打开 PGLite 时
会以 `Aborted()` 中止。请使用上面展示的 `git clone + bun install && bun link`。
参见 [#218](https://github.com/garrytan/gbrain/issues/218)。

```
3 个结果（混合搜索，0.12 秒）：

1. concepts/do-things-that-dont-scale (得分: 0.94)
   PG 的观点：不可扩展的努力教会你用户真正想要什么。
   [来源: paulgraham.com, 2013-07-01]

2. originals/founder-mode-observation (得分: 0.87)
   深度参与不是微观管理，如果它扩展了团队的思维。

3. concepts/build-something-people-want (得分: 0.81)
   YC 的座右铭。连接到 12 个其他大脑页面。
```

### MCP 服务器（Claude Code、Cursor、Windsurf）

GBrain 通过 stdio 暴露 30+ MCP 工具：

```json
{
  "mcpServers": {
    "gbrain": { "command": "gbrain", "args": ["serve"] }
  }
}
```

添加到 `~/.claude/server.json`（Claude Code）、设置 > MCP 服务器（Cursor）或你的客户端 MCP 配置。

### 远程 MCP（Claude Desktop、Cowork、Perplexity）

```bash
ngrok http 8787 --url your-brain.ngrok.app
bun run src/commands/auth.ts create "claude-desktop"
claude mcp add gbrain -t http https://your-brain.ngrok.app/mcp -H "Authorization: Bearer TOKEN"
```

各客户端指南：[`docs/mcp/`](docs/mcp/DEPLOY.md)。ChatGPT 需要 OAuth 2.1（尚未实现）。

## 26 个技能

GBrain 内置 26 个技能，由 `skills/RESOLVER.md` 组织。解析器告诉你的 agent 对任何任务应该读取哪个技能。

[技能文件即代码。](https://x.com/garrytan/status/2042925773300908103) 它们是完成知识工作最强大的方式。一个技能文件是一份厚重的 markdown 文档，编码了整个工作流：何时触发、检查什么、如何与其他技能串联、执行什么质量标准。agent 读取技能并执行它。技能也可以调用 GBrain 内置的确定性 TypeScript 代码（搜索、导入、嵌入、同步）来处理不应交给 LLM 判断的部分。[薄 harness，厚技能](docs/ethos/THIN_HARNESS_FAT_SKILLS.md)：智能存在于技能中，而非运行时。

### 始终在线

| 技能 | 功能 |
|-------|-------------|
| **signal-detector** | 每条消息触发。并行启动廉价模型捕获原创思考和实体提及。大脑在自动驾驶中积累。 |
| **brain-ops** | 调用任何外部 API 前先查询大脑。使每次响应更聪明的读-丰富-写循环。 |

### 内容摄入

| 技能 | 功能 |
|-------|-------------|
| **ingest** | 薄路由。检测输入类型并委派给正确的摄入技能。 |
| **idea-ingest** | 链接、文章、推文变成带分析、作者人物页面和交叉链接的大脑页面。 |
| **media-ingest** | 视频、音频、PDF、书籍、截图、GitHub 仓库。转录、实体提取、反向链接传播。 |
| **meeting-ingestion** | 转录变成大脑页面。每位参会者得到丰富。每家公司获得时间线条目。 |

### 大脑操作

| 技能 | 功能 |
|-------|-------------|
| **enrich** | 分层丰富（Tier 1/2/3）。创建和更新带 compiled truth 和时间线的人物/公司页面。 |
| **query** | 三层搜索合成带引用。说"大脑中没有关于 X 的信息"而非幻觉。 |
| **maintain** | 定期健康检查：过期页面、孤儿页面、死链接、引用审计、反向链接执行、标签一致性。 |
| **citation-fixer** | 扫描页面中缺失或格式错误的引用。修复格式以匹配标准。 |
| **repo-architecture** | 新大脑文件的存放位置。决策协议：主主题决定目录，而非格式。 |
| **publish** | 将大脑页面分享为密码保护的 HTML。零 LLM 调用。 |
| **data-research** | 带参数化 YAML 配方的结构化数据研究。从邮件中提取投资者更新、支出、公司指标。 |

### 运营

| 技能 | 功能 |
|-------|-------------|
| **daily-task-manager** | 带优先级（P0-P3）的任务生命周期。存储为可搜索的大脑页面。 |
| **daily-task-prep** | 早晨准备：日历预览带每位参会者的大脑上下文、开放线索、任务审查。 |
| **cron-scheduler** | 调度错峰（5 分钟偏移）、静默时段（时区感知带唤醒覆盖）、幂等性。 |
| **reports** | 时间戳报告带关键词路由。"最新的简报是什么？"立即找到。 |
| **cross-modal-review** | 通过第二模型的质量把关。拒绝路由：如果一个模型拒绝，静默切换。 |
| **webhook-transforms** | 外部事件（短信、会议、社交提及）转化为带实体提取的大脑页面。 |
| **testing** | 验证每个技能有带 frontmatter 的 SKILL.md、清单覆盖、解析器覆盖。 |
| **skill-creator** | 遵循一致性标准创建新技能。与已有技能的 MECE 检查。 |
| **minion-orchestrator** | 将长时间运行的 agent 工作作为后台任务。提交、按深度/上限/超时展开子任务、通过 child_done 收件箱收集结果。 |

### 身份与设置

| 技能 | 功能 |
|-------|-------------|
| **soul-audit** | 6 阶段访谈生成 SOUL.md（agent 身份）、USER.md（用户画像）、ACCESS_POLICY.md（4 级隐私）、HEARTBEAT.md（运行节奏）。 |
| **setup** | 自动配置 PGLite 或 Supabase。首次导入。GStack 检测。 |
| **migrate** | 从 Obsidian、Notion、Logseq、markdown、CSV、JSON、Roam 的通用迁移。 |
| **briefing** | 每日简报：会议上下文、活跃交易和引用跟踪。 |

### 约定

`skills/conventions/` 中的跨领域规则：
- **quality.md** ... 引用、反向链接、关注度门槛、来源归属
- **brain-first.md** ... 调用任何外部 API 前的 5 步查找
- **model-routing.md** ... 哪个模型用于哪个任务
- **test-before-bulk.md** ... 批量操作前先测试 3-5 项
- **cross-modal.yaml** ... 审查配对和拒绝路由链

## 工作原理

```
信号到达（会议、邮件、推文、链接）
  → 信号检测器捕获想法 + 实体（并行，永不阻塞）
  → 大脑操作：先检查大脑（gbrain search、gbrain get）
  → 带着完整上下文回复
  → 写入：用新信息 + 引用更新大脑页面
  → 自动链接：每次写入时提取类型化关系（零 LLM 调用）
  → 同步：gbrain 索引变更用于下次查询
```

每个循环增加知识。agent 在会议后丰富人物页面。下次该人物出现时，agent 已有上下文。差异每天都在积累。

系统自我变聪明。实体丰富自动升级：被提及一次的人获得存根页面（Tier 3）。跨不同来源被提及 3 次后，获得网络 + 社交丰富（Tier 2）。会议后或 8 次以上提及后，完整管线（Tier 1）。大脑自行学习谁重要。确定性分类器通过 fail-improve 循环随时间改进，该循环记录每次 LLM 回退并从失败中生成更好的正则模式。`gbrain doctor` 显示轨迹："意图分类器：87% 确定性，从第 1 周的 40% 提升。"

> "30 分钟内为我和 Jordan 的会议做准备"
> ... 拉取档案、共同历史、近期活动、开放线索

> "关于羞耻感与创始人表现之间的关系，我说过什么？"
> ... 搜索你的思考，而非互联网

## Minions：你的子 agent 不会再丢工作了

一个内建于大脑中的持久、Postgres 原生的任务队列。每个长时间运行的 agent 任务现在都是一个任务，能承受网关重启、流式传输进度、在中途暂停/恢复/操控、并显示在 `gbrain jobs list` 中。除现有大脑外零额外基础设施。

### 关键生产数据

我的个人 OpenClaw 部署：一个 Render 容器。Supabase Postgres 持有 45,000 页的大脑。19 个定时任务按时触发。真实网关负载来自真实日常工作。任务：从外部 API 拉取一个月社交帖子并端到端摄入大脑为结构化页面。

|              | Minions   | `sessions_spawn`               |
|---           |---        |---                             |
| 耗时         | **753ms** | **>10,000ms**（网关超时）       |
| Token 成本   | **$0.00** | 约 $0.03/次                    |
| 成功率       | **100%**  | **0%**（甚至无法启动）          |
| 内存/任务    | 约 2 MB   | 约 80 MB                       |

在 19 个定时任务负载下，子 agent 启动无法突破 10 秒的网关墙壁。Minions 在不到一秒内以零 token 着陆。**规模化：** 19,240 条帖子跨 36 个月，单 bash 循环，总计约 15 分钟，$0.00。子 agents：最佳约 9 分钟，约 $1.08 token，约 40% 启动失败。**实验室：** 持久性 ∞（SIGKILL 中途杀死，10/10 恢复），吞吐量约 10 倍，展开约 21 倍无失败墙，内存约 400 倍减少。

完整基准测试：[生产](docs/benchmarks/2026-04-18-minions-vs-openclaw-production.md)和[实验室](docs/benchmarks/2026-04-18-minions-vs-openclaw-subagents.md)。

### 路由规则

> **确定性工作**（相同输入 → 相同步骤 → 相同输出）→ **Minions**
> **判断性工作**（输入需要评估或决策）→ **子 agents**

拉取帖子、解析 JSON、写大脑页面、运行同步 —— 确定性的。$0 token、承受重启、毫秒级运行。分类收件箱、评估会议优先级、决定冷邮件是否值得回复 —— 判断性的。子 agents 真正擅长的事情。`minion_mode: pain_triggered`（默认）自动化这个路由。

### 修复了什么

六大日常痛点 —— 启动风暴、agents 停止响应、遗忘的派遣、运行中途网关崩溃、失控的孙任务、调试混乱 —— 都属于"用推理模型做确定性工作"的错误。Minions 通过不犯这个错误来修复它们：`max_children` 上限、`timeout_ms` + AbortSignal、`child_done` 收件箱、每个任务完整的 `parent_job_id`/`depth`/转录、Postgres 持久化带停转检测、通过递归 CTE 的级联取消。加上幂等键、附件验证、`removeOnComplete`，以及半秒验证安装的 `gbrain jobs smoke`。

```bash
gbrain jobs smoke                        # 验证安装
gbrain jobs submit sync --params '{}'    # 触发一个后台任务
gbrain jobs stats                        # 健康仪表板
gbrain jobs work --concurrency 4         # 启动 worker（仅 Postgres）
```

阅读 [`skills/minion-orchestrator/SKILL.md`](skills/minion-orchestrator/SKILL.md) 了解父子 DAG、扇入收集、通过收件箱操控。

**Minions 不是对后台工作的子 agent 的渐进式改进。它在类别上完全不同。** 753ms vs 网关超时。$0 vs tokens。100% vs 无法启动。如果你的 agent 按计划执行确定性工作，它现在就跑在 Minions 上。

### 健康检查与自我修复

Minions 从 v0.11.1 起是规范性的 —— 每次 `gbrain upgrade` 自动运行迁移（schema → smoke → prefs → 主机重写 → 环境感知的 autopilot 安装）。如果你想手动验证或将一个定时任务接入早晨简报：

```bash
gbrain doctor                    # 半迁移状态？打印醒目横幅并以非零退出
gbrain skillpack-check --quiet    # exit 0/1/2 用于管线门控
gbrain skillpack-check | jq       # 完整 JSON: {healthy, summary, actions[], doctor, migrations}
```

如果有问题，`actions[]` 告诉你应该运行的确切命令。深度故障排除：[`docs/guides/minions-fix.md`](docs/guides/minions-fix.md)。

将网关定时任务迁移到 Minions（确定性脚本，每次触发零 LLM token）：[`docs/guides/minions-shell-jobs.md`](docs/guides/minions-shell-jobs.md)。

## 持久化 agents：`gbrain agent`（v0.15）

你的子 agent 运行现在能承受崩溃了。OpenClaw 运行中挂了？worker 在重启时重新认领并从最后提交的回合重放。扇出 50 个分片，一个分片崩溃 —— 聚合器仍然在每个子任务到达终止状态并写出混合结果摘要后认领。工具调用以两阶段账本形式持久化（`pending` → `complete | failed`），所以重放是通过构造安全的，而非凭希望。

```bash
# 提交单个子 agent 运行
gbrain agent run "总结我最近 10 篇日记页面"

# 将 N 个提示扇出到 N 个子 agent + 1 个聚合器
gbrain agent run "分析每一页" \
  --fanout-manifest manifests/pages.json \
  --subagent-def analyzer

# 追踪运行中的任务（每轮回合心跳 + 完成时的完整转录）
gbrain agent logs 1247 --follow --since 5m
```

持久性是关键：每个 Anthropic 回合提交到 `subagent_messages`，每个工具调用提交到 `subagent_tool_executions`。Worker 被杀、OpenClaw 崩溃、超时 —— 全部可恢复。宿主仓库（你的 OpenClaw 等）通过 `GBRAIN_PLUGIN_PATH` + `gbrain.plugin.json` 清单提供自己的子 agent 定义：参见 [`docs/guides/plugin-authors.md`](docs/guides/plugin-authors.md)。Worker 上需要 `ANTHROPIC_API_KEY`。

## Skillify：你的技能树不再是黑盒

Hermes 及类似 agent 框架以后台行为方式自动创建技能。在你不知道 agent 生成了什么之前，这还可以。清单腐化。测试漂移。解析器条目过时。六个月后，你面对的是一堆不透明的"技能"，没有人读过，没有人测试过，没有人确定还能工作。

GBrain 提供同样的能力。区别在于人类保持在回路中。

- **`/skillify`** 将原始代码转化为正确技能化的功能：SKILL.md + 确定性脚本 + 单元测试 + 集成测试 + LLM 评估 + 解析器触发器 + 解析器触发器评估 + E2E 冒烟 + 大脑归档。十项。每项必需。
- **`gbrain check-resolvable`** 遍历整个技能树：可达性、MECE 重叠、DRY 违规、空白检测、孤儿技能。任何问题都以非零退出。
- **`scripts/skillify-check.ts`** — 机器可读审计。`--json` 用于 CI，`--recent` 用于最近 7 天的文件。

你来决定何时做什么。工具保持清单诚实。

### 为什么这对 OpenClaw 是正确的答案

自动生成的技能在行为首次出问题时就成为负担。是技能的问题？测试的问题？解析器触发器的问题？还是评估的问题？你不知道，因为你从未读过。调试一个黑盒纯粹是猜谜。

Skillify 让黑盒变得可读。你技能树中的每个技能都有：合约（SKILL.md）、测试该合约的测试、按评分标准对 LLM 输出打分的评估、用户实际输入的解析器触发器、以及确认触发器路由正确的测试。如果某处出错，你知道看哪一层。如果某处过时，`check-resolvable` 会告诉你。

实践中这个组合产出了**零孤儿技能，每个功能都有测试 + 评估 + 解析器触发器 + 触发器的评估。** 复合质量而非复合熵。

```bash
# 审计一个功能的技能完整性（10 项检查清单）
bun run scripts/skillify-check.ts src/commands/publish.ts

# 在 CI 中：当新功能未正确技能化时使构建失败
bun run scripts/skillify-check.ts --json --recent

# 发布前验证整个技能树
gbrain check-resolvable
```

**Skillify 不是锦上添花。它使技能树能在六个月的复合工作中存活。** 阅读 [`skills/skillify/SKILL.md`](skills/skillify/SKILL.md) 了解完整的 10 项检查清单及其捕获的反模式。

## 数据接入

GBrain 内置集成配方，你的 agent 为你设置。每个配方告诉 agent 需要请求什么凭据、如何验证以及注册什么定时任务。

| 配方 | 依赖 | 功能 |
|--------|----------|-------------|
| [公网隧道](recipes/ngrok-tunnel.md) | — | MCP + 语音的固定 URL（ngrok Hobby $8/月） |
| [凭据网关](recipes/credential-gateway.md) | — | Gmail + 日历访问 |
| [语音转大脑](recipes/twilio-voice-brain.md) | ngrok-tunnel | 电话转大脑页面（Twilio + OpenAI Realtime） |
| [邮件转大脑](recipes/email-to-brain.md) | credential-gateway | Gmail 转实体页面 |
| [X 转大脑](recipes/x-to-brain.md) | — | Twitter 时间线 + 提及 + 删除 |
| [日历转大脑](recipes/calendar-to-brain.md) | credential-gateway | Google 日历转可搜索的每日页面 |
| [会议同步](recipes/meeting-sync.md) | — | Circleback 转录转带参会者的大脑页面 |

**数据研究配方** 从邮件中提取结构化数据到可追踪的大脑页面。内置投资者更新（MRR、ARR、跑道、员工数）、支出追踪和公司指标的配方。使用 `gbrain research init` 创建你自己的。

运行 `gbrain integrations` 查看状态。

## GBrain + GStack

[GStack](https://github.com/garrytan/gstack) 是引擎。GBrain 是 mod。

- **[GStack](https://github.com/garrytan/gstack)** = 编码技能（发布、审查、QA、调查、办公时间、回顾）。70,000+ stars，每天 30,000 开发者。你的 agent 对自己写代码时，使用 GStack。
- **GBrain** = 其他所有技能（大脑操作、信号检测、摄入、丰富、定时任务、报告、身份）。你的 agent 记忆、思考和运行时，使用 GBrain。
- **`hosts/gbrain.ts`** = 桥梁。告诉 GStack 的编码技能在编码前先检查大脑。

`gbrain init` 检测 GStack 是否已安装并报告 mod 状态。如果 GStack 不在，它告诉你怎么获取。

## 架构

```
┌──────────────────┐    ┌───────────────┐    ┌──────────────────┐
│   大脑仓库        │    │    GBrain     │    │    AI Agent      │
│   (git)          │    │  (检索层)     │    │  (读写)          │
│                  │    │               │    │                  │
│  markdown 文件   │───>│  Postgres +   │<──>│  26 个技能       │
│  = 真相的        │    │  pgvector     │    │  定义如何使用    │
│    来源          │    │               │    │  大脑            │
│                  │<───│  混合         │    │                  │
│  人类始终可以    │    │  搜索         │    │  RESOLVER.md     │
│  读取和编辑      │    │  (向量 +      │    │  将意图路由      │
│                  │    │   关键词 +    │    │  到技能          │
│                  │    │   RRF)        │    │                  │
└──────────────────┘    └───────────────┘    └──────────────────┘
```

仓库是记录系统。GBrain 是检索层。agent 通过两者读取和写入。人类始终胜出……编辑任何 markdown 文件，`gbrain sync` 会获取变更。

## 知识模型

每个页面遵循 compiled truth + 时间线模式：

```markdown
---
type: concept
title: 做不可扩展的事
tags: [startups, growth, pg-essay]
---

Paul Graham 的观点：初创公司应该在早期做不可扩展的事。
核心洞察：不可扩展的努力教会你用户真正想要什么，
这是任何其他方式都无法学到的。

---

- 2013-07-01: 发布在 paulgraham.com
- 2024-11-15: 在 W25 批启动演讲中被引用
```

`---` 以上：**compiled truth**。你当前的最佳理解。当新证据改变图景时被重写。以下：**时间线**。仅追加的证据链。从不编辑，只添加。

## 知识图谱

页面不只是文本。每个对人物、公司或概念的提及都成为结构图谱中的类型化链接。大脑自我连线。

```
写一个提及 Alice 和 Acme AI 的会议页面
  → 自动链接从内容中提取实体引用（零 LLM 调用）
  → 推断类型：会议页面 + 人物引用 => `attended`
                   "X 的 CEO" 模式       => `works_at`
                   "投资了"              => `invested_in`
                   "建议"、"顾问"        => `advises`
                   "创立"、"共同创立"    => `founded`
  → 协调过期链接：编辑移除内容中不再存在的引用
  → 反向链接使连接良好的实体在搜索中排名更高
```

```bash
gbrain graph-query people/alice --type attended --depth 2
# 返回 Alice 与谁见面了，可传递
```

图谱支撑向量搜索无法回答的问题："谁在 Acme AI 工作？"、"Bob 投资了什么？"、"找到 Alice 和 Carol 之间的联系"。一条命令回填已有大脑：

```bash
gbrain extract links --source db        # 连线已有的 29K 页面
gbrain extract timeline --source db     # 从 markdown 时间线提取日期事件
```

然后提出图问题或观察搜索排名改进。基准测试：在 240 页 Opus 生成的富文本语料库上，**Recall@5 从 83% 跃升至 95%，Precision@5 从 39% 升至 45%，agent 的 top-5 阅读中多了 30 个正确答案**。图谱 F1 达 86.6% vs grep 57.8%（+28.8 分）。参见 [docs/benchmarks/2026-04-18-brainbench-v1.md](docs/benchmarks/2026-04-18-brainbench-v1.md)。

## 代码感知大脑

代码文件成为大脑页面。代码符号成为 chunk 元数据。导入/调用关系成为链接。所有已有的表和管线都被复用 —— 无并行系统、无新搜索引擎、无新图谱。一个查询界面同时覆盖 markdown 和代码。

设计是分层，而非分叉：

```
Markdown 页面 ──→ pages (type='concept') ──→ chunks (source='compiled_truth')
                                              ──→ links (source='markdown')

代码文件 ──────→ pages (type='code_file') ──→ chunks (source='source_code')
                                              ──→ links (source='code_import')
```

### 复用了什么

| 层级 | 代码如何接入 |
|---|---|
| **pages** | `type='code_file'`。同一张表。`compiled_truth` 存放原始源码。`frontmatter` 存放语言、文件路径、字节大小。内容哈希天然提供幂等重导入。 |
| **content_chunks** | `chunk_source='source_code'`。`symbol_name` 和 `symbol_kind` 列承载基于正则（无 tree-sitter）提取的符号（函数、类、接口）。`start_line` / `end_line` 用于精确定位。 |
| **links** | `link_source='code_import'`。导入/调用/继承/实现引用成为类型化图边。协调机制与 markdown 链接完全一致：重导入删除过期的 `code_import` 边，重新提取。 |
| **tags** | 语言标签（`typescript`、`python`、`go`）。同一张 tags 表 —— `gbrain code list --tag typescript` 直接生效。 |
| **search** | pages 上的 `code_search_vector` tsvector 列，使用 `simple` 配置（无词干提取 —— 保留 `putPage`、路径分隔符、驼峰标识符）。触发器按页面类型路由：代码页面获得 `simple` tsvector，markdown 页面获得 `english`。 |
| **graph** | `traverse_graph` 和 `get_backlinks` 递归 CTE 适用于任何链接类型。`gbrain graph-query code/src/core/operations --type calls --depth 2` 以与 markdown 引用相同的方式遍历代码引用。 |
| **page_versions** | 代码文件历史通过已有的版本系统追踪。 |
| **sync** | `isSyncable()` 返回 `'markdown' | 'code' | false`。`import` 和 `sync` 上的 `--include-code` 标志控制代码摄入。 |

### 导入管线

```
源码文件（.ts、.py、.go 等）
  → detectCodeLanguage（扩展名映射：17 种语言）
  → codePathToSlug: src/core/import-file.ts → code/src/core/import-file
  → chunkCode：基于空行 + 缩进的分割器（40-80 行，5 行重叠）
  → extractSymbols：基于正则（函数、类、接口、类型、常量、方法）
  → extractReferences：导入解析 + 本地调用检测 + extends/implements
  → embedBatch：对 chunk 文本进行 OpenAI 嵌入
  → transaction：
      putPage（type=code_file，compiled_truth=原始源码）
      addTag（语言）
      upsertChunks（chunk_source=source_code，符号元数据）
      DELETE + addLinksBatch（code_import 边，协调）
```

### 查询管线

```
"where is putPage defined?"
  → classifyQueryIntent: code_definition（正则模式，零 LLM）
  → intentToDetail: 'low'（优先签名级别的 chunk）
  → isCodeLikeQuery: 驼峰/蛇形/路径/关键字 → true
  → searchKeyword 路由到 code_search_vector（'simple' 配置，无词干提取）
  → 结果排序：ts_rank + symbol_name 精确匹配加权 +
    ILIKE 子串加权 + chunk_index 排序
```

```
"who calls putPage?"
  → classifyQueryIntent: code_relationship
  → intentToDetail: 'high'（需要广泛上下文）
  → gbrain graph-query code/src/core/operations --type calls --direction in
  → 递归 CTE 遍历 links WHERE link_source = 'code_import'
```

### 跨类型链接（代码 ↔ markdown）

Markdown 页面通过 wikilinks 引用代码：

```markdown
入口点是 [[code:src/core/import-file.ts#importFromContent]]。
```

这创建了一个双向链接：markdown 页面链接到代码页面，代码页面获得反向链接。`graph-query` 无需区分类型即可遍历。带 `link_type='tests'` 边的代码页面通过查找会议参会者的同一图谱遍历展示测试覆盖率。

### 命令

```bash
# 与 markdown 一起导入代码
gbrain import ~/repo/ --include-code
gbrain sync --include-code

# 列出已导入的代码文件
gbrain code list                          # 所有代码文件
gbrain code list --tag typescript         # 按语言过滤
gbrain code list --json                   # 机器可读

# 仅搜索代码（符号、标识符、路径）
gbrain code search putPage
gbrain code search "importFromContent" -n 10

# 通用搜索也会找到代码（自动检测代码式查询）
gbrain search putPage                     # 自动路由到 code_search_vector
gbrain query "where is putPage defined"   # 混合搜索，code_definition 意图

# 跨代码的图遍历
gbrain graph-query code/src/core/operations --type calls --depth 2
gbrain graph-query code/src/core/operations --type imports --direction in

# 查找无入向链接的代码文件（复用 find_orphans）
gbrain orphans --type code_file
```

### 语言

通过扩展名检测支持 17 种语言：TypeScript、JavaScript、Python、Go、Rust、Java、C、C++、Ruby、Swift、Kotlin、Shell、SQL。符号提取对 TypeScript/JavaScript、Python 和 Go 使用确定性正则模式（无 tree-sitter 依赖）—— 其他语言回退到基于空行的分块，无符号元数据。

### 设计决策

**无 tree-sitter。** 对三种主要语言使用基于正则的符号提取。Tree-sitter 会增加 WASM 膨胀和每种新语言的原生编译步骤。正则方法覆盖函数、类、接口、方法、类型别名、导出和文档注释。非 TS/Python/Go 文件仍会被分块和搜索 —— 它们只是暂时没有逐符号的元数据，直到添加解析器。

**无并行表。** `code_repositories`、`code_symbols`、`code_references` —— 都不存在。`sources` 处理多仓库。`pages` 处理代码文件。`content_chunks` 处理符号。`links` 处理引用。每个搜索、图谱和管理命令都在代码内容上工作，无需任何新的代码路径。

**无新搜索引擎。** 混合搜索管线是内容无关的。`code_search_vector` 配合 `simple` 配置保留了 `english` 词干提取会破坏的标识符。`isCodeLikeQuery` 自动检测代码查询，因此 `gbrain search putPage` 无需用户指定类型过滤即正确路由。

## 搜索

混合搜索：向量 + 关键词 + RRF 融合 + 多查询扩展 + 4 层去重。

```
查询
  → 意图分类器（实体？时间？事件？通用？）
  → 多查询扩展（Claude Haiku）
  → 向量搜索（HNSW 余弦）+ 关键词搜索（tsvector）
  → RRF 融合: 得分 = sum(1/(60 + 排名))
  → 余弦重打分 + compiled truth 加权
  → 4 层去重 + compiled truth 保证
  → 结果
```

仅关键词会遗漏概念匹配。仅向量会遗漏精确短语。RRF 两者兼得。搜索质量经过基准测试且可重现：`gbrain eval --qrels queries.json` 测量 P@k、Recall@k、MRR 和 nDCG@k。在部署前 A/B 测试配置变更。

## 为什么有效：多种策略协同作战

大脑不是一个招数。每个检索问题经过约 20 种确定性技术叠加组合。没有单一技术是魔法；胜利来自层层堆叠，使每层覆盖其他层遗漏的部分。

```
问题
  │
  ├─ 摄入（每次 put_page）
  │    ├─ 递归 markdown 分块（或语义 / LLM 引导）
  │    ├─ 代码分块：基于空行 + 缩进的分割器（40-80 行）
  │    ├─ 符号提取：确定性正则（函数、类、接口）
  │    ├─ 引用提取：导入解析 + 调用检测
  │    ├─ 嵌入缓存失效（编辑时）
  │    └─ 幂等导入（内容哈希去重）
  │
  ├─ 图谱提取（自动链接后置钩子，零 LLM）
  │    ├─ 实体引用正则（markdown 链接 + 裸标识符）
  │    ├─ 代码块剥离（代码块中无误报标识符）
  │    ├─ 类型推断级联（FOUNDED → INVESTED → ADVISES → WORKS_AT）
  │    ├─ 页面角色先验（合伙人简介语言 → invested_in）
  │    ├─ 页内去重（同一目标合并为一个链接）
  │    ├─ 过期链接协调（编辑移除已丢弃的引用）
  │    └─ 多类型链接约束（同一人可同时 works_at AND advises）
  │
  ├─ 搜索管线（每次查询）
  │    ├─ 意图分类器（entity / temporal / event / general
  │    │                     / code_definition / code_relationship — 自动路由）
  │    ├─ 代码查询检测器（驼峰、蛇形、类路径、关键字 → simple tsvector）
  │    ├─ 多查询扩展（Haiku 以 3 种方式重新表述问题）
  │    ├─ 向量搜索（HNSW 余弦，基于 OpenAI 嵌入）
  │    ├─ 关键词搜索（markdown 用 english tsvector，代码用 simple tsvector）
  │    ├─ 倒数排名融合（得分 = sum 1/(60+排名) 跨两个结果集）
  │    ├─ 余弦重打分（根据实际查询嵌入重新排序 chunk）
  │    ├─ compiled-truth 加权（评估优先于时间线噪音）
  │    ├─ 符号名称精确匹配加权（代码查询偏好精确标识符命中）
  │    ├─ 反向链接加权（连接良好的实体排名更高）
  │    └─ 来源感知去重（每个页面保证一个 CT chunk）
  │
  ├─ 图遍历（关系查询）
  │    ├─ 递归 CTE + 循环防护（visited-array 检查）
  │    ├─ 类型过滤边（--type works_at、attended 等）
  │    ├─ 方向控制（in / out / both）
  │    └─ 深度限制（远程 MCP ≤10；DoS 防护）
  │
  └─ AGENT 工作流（图自信混合）
       ├─ 先图查询（高精度类型化答案）
       ├─ 图无结果时回退到 grep
       └─ 图命中在 top-K 中排名靠前（更好的 P@K 和 R@K）
```

端到端 BrainBench v1 语料库（240 页富文本，PR #188 前后对比）：

| 指标                    | PR #188 前   | PR #188 后   | Δ           |
|-------------------------|-------------|--------------|-------------|
| **Precision@5**         | 39.2%       | **44.7%**    | **+5.4 分** |
| **Recall@5**            | 83.1%       | **94.6%**    | **+11.5 分**|
| top-5 中正确数           | 217         | 247          | **+30**     |
| 仅图 F1（消融）         | 57.8% (grep)| **86.6%**    | **+28.8 分**|

加上 5 个正交能力检查（身份解析、时间查询、10K 页规模的性能、对畸形输入的健壮性、
MCP 操作合约）。全部通过。[完整报告。](docs/benchmarks/2026-04-18-brainbench-v1.md)

要点：每种技术处理一类其他技术遗漏的输入。向量搜索漏掉精确标识符引用；关键词捕获它们。关键词漏掉概念匹配；向量捕获它们。RRF 选择两者最佳。Compiled-truth 加权使评估高于时间线噪音。自动链接提取连线图谱，让反向链接加权将连接良好的实体排名更高。图遍历回答搜索单独无法触及的问题。agent 选择图优先以获得精确性，回退到关键词以提高召回率。**全部确定性，全部协同作战，全部经过测量。**

## 语音

拨打电话号码。你的 AI 应答。它知道谁在呼叫，从大脑中提取他们的完整上下文，像一个真正了解你世界的人一样回应。通话结束时，一个大脑页面出现，包含转录、实体检测和交叉引用。

<p align="center">
  <img src="docs/images/voice-client.png" alt="Voice client connected" width="300" />
</p>

> [查看实际效果](https://x.com/garrytan/status/2043022208512172263)

语音配方随 GBrain 提供：[语音转大脑](recipes/twilio-voice-brain.md)。WebRTC 在浏览器标签页中零设置即可工作。真实电话号码是可选的。

## 引擎架构

```
CLI / MCP Server
     （薄封装，相同操作）
              |
      BrainEngine 接口（可插拔）
              |
     +--------+--------+
     |                  |
PGLiteEngine       PostgresEngine
  （默认）            （Supabase）
     |                  |
~/.gbrain/           Supabase Pro（$25/月）
brain.pglite         Postgres + pgvector
嵌入式 PG 17.5

     gbrain migrate --to supabase|pglite
         （双向迁移）
```

PGLite：嵌入式 Postgres，无服务器，零配置。当你的大脑超过本地规模（1000+ 文件、多设备），`gbrain migrate --to supabase` 迁移一切。

## 文件存储

大脑仓库会积累二进制文件。GBrain 有一个三阶段迁移：

```bash
gbrain files mirror <dir>       # 复制到云端，本地保持不变
gbrain files redirect <dir>     # 用 .redirect 指针替换本地文件
gbrain files clean <dir>        # 移除指针，仅云端
gbrain files restore <dir>      # 下载全部回来（撤销）
```

存储后端：S3 兼容（AWS、R2、MinIO）、Supabase Storage 或本地。

## 命令

```
设置
  gbrain init [--supabase|--url]        创建大脑（默认 PGLite）
  gbrain migrate --to supabase|pglite   双向引擎迁移
  gbrain upgrade                        自我更新带功能发现

页面
  gbrain get <slug>                     读取页面（模糊标识符匹配）
  gbrain put <slug> [< file.md]         写入/更新（自动版本）
  gbrain delete <slug>                  删除页面
  gbrain list [--type T] [--tag T]      过滤列表

搜索
  gbrain search <query>                 关键词搜索（代码感知，自动检测）
  gbrain query <question>              混合搜索（向量 + 关键词 + RRF）
  gbrain code list [--tag T] [-n N]     列出已导入的代码文件
  gbrain code search <query> [-n N]     仅搜索已导入的代码

导入
  gbrain import <dir> [--no-embed]      导入 markdown（--include-code 导入代码）
  gbrain sync [--repo <path>]           Git 到大脑增量同步
                                        （--include-code 同步代码，--watch，--install-cron）
  gbrain export [--dir ./out/]          导出为 markdown
  gbrain analyze-repo <url|path>        分析仓库，生成结构化文档
                                        （--include-tests，--query，--json）

文件
  gbrain files list|upload|sync|verify  文件存储操作

嵌入
  gbrain embed [<slug>|--all|--stale]   生成/刷新嵌入

链接 + 图谱
  gbrain link|unlink|backlinks          交叉引用管理
  gbrain extract links|timeline|all     从已有页面批量回填
                                        （--source db|fs，--type，--since，--dry-run）
  gbrain graph-query <slug>             类型化遍历（--type T --depth N
                                        --direction in|out|both）

任务（Minions）
  gbrain jobs submit <name> [--params JSON] [--follow]  提交一个后台任务
  gbrain jobs list [--status S] [--queue Q]             过滤列表任务
  gbrain jobs get|cancel|retry|delete <id>              任务生命周期管理
  gbrain jobs prune [--older-than 30d]                  清理已完成/死亡任务
  gbrain jobs stats                                     任务健康仪表板
  gbrain jobs smoke                                     一句命令健康检查
  gbrain jobs work [--queue Q] [--concurrency N]        启动 worker 守护进程

管理
  gbrain doctor [--json] [--fast]       健康检查（解析器、技能、数据库、嵌入）
  gbrain doctor --fix [--dry-run]       自动修复 DRY 违规（将内联规则委派到约定）
  gbrain stats                          大脑统计
  gbrain serve                          MCP 服务器（stdio）
  gbrain integrations                   集成配方仪表板
  gbrain check-backlinks check|fix      反向链接执行
  gbrain lint [--fix]                   LLM 制品检测
  gbrain repair-jsonb [--dry-run]       修复 v0.12.0 双重编码 JSONB（Postgres）
  gbrain orphans [--json] [--count]     查找零入向 wikilink 的页面
  gbrain transcribe <audio>             音频转录（Groq Whisper）
  gbrain research init <name>           脚手架化数据研究配方
  gbrain research list                  显示可用配方
```

运行 `gbrain --help` 获取完整参考。

## 起源故事

我在设置我的 [OpenClaw](https://openclaw.ai) agent，开始了一个 markdown 大脑仓库。一人一页，一公司一页，上方 compiled truth，下方时间线。一周之内：10,000+ 文件，3,000+ 人物，13 年的日历数据，280+ 会议转录，300+ 捕捉的想法。

agent 在我睡觉时运行。dream 循环扫描每一次对话，丰富缺失的实体，修复损坏的引用，整理记忆。我醒来时，大脑比睡前更聪明。

这个仓库中的技能是那些模式的通用化。花了 11 天手工构建的东西，作为一个 mod 提供，30 分钟安装。

## 文档

**面向 agents：**
- **[skills/RESOLVER.md](skills/RESOLVER.md)** ... 从这里开始。技能调度器。
- [各技能文件](skills/) ... 25 个独立指令集
- [GBRAIN_SKILLPACK.md](docs/GBRAIN_SKILLPACK.md) ... 遗留参考架构
- [数据接入](docs/integrations/README.md) ... 集成配方与数据流
- [GBRAIN_VERIFY.md](docs/GBRAIN_VERIFY.md) ... 安装验证

**面向人类：**
- [GBRAIN_RECOMMENDED_SCHEMA.md](docs/GBRAIN_RECOMMENDED_SCHEMA.md) ... 大脑仓库目录结构
- [薄 Harness，厚技能](docs/ethos/THIN_HARNESS_FAT_SKILLS.md) ... 架构哲学
- [ENGINES.md](docs/ENGINES.md) ... 可插拔引擎接口

**参考：**
- [GBRAIN_V0.md](docs/GBRAIN_V0.md) ... 完整产品规范
- [CHANGELOG.md](CHANGELOG.md) ... 版本历史

**基准测试：**
- [BrainBench v1（PR #188）](docs/benchmarks/2026-04-18-brainbench-v1.md) ... 240 页 Opus 语料库上的单一综合前后对比报告。7 个类别：关系查询、身份解析、时间查询、性能、健壮性、MCP 合约。

## 贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。运行 `bun test` 进行单元测试。E2E 测试：启动带 pgvector 的 Postgres，运行 `bun run test:e2e`，清理。

欢迎 PR：新丰富 API、性能优化、额外引擎后端、遵循 `skills/skill-creator/SKILL.md` 一致性标准的新技能。

## 许可证

MIT
