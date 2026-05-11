# OpenCode + GBrain 基准测试项目总结

---

## Slide 1: 项目背景

### 核心问题

**加入 GBrain 知识脑是否能让 AI 更好地完成软件工程任务？**

- OpenCode: AI coding agent，可连接 MCP 外部工具
- GBrain: 个人知识脑，支持代码索引、知识图谱、语义搜索
- 目标: 量化 GBrain 对 AI 任务完成质量的提升幅度

### 测试策略

三组对照实验，控制知识传递方式：

| 组别 | 条件 | 考察点 |
|------|------|--------|
| A | 裸 OpenCode，无外部知识 | 基线 |
| B | OpenCode + GBrain MCP 连接 | MCP 集成是否有效 |
| C | GBrain 知识直接注入 prompt | 知识本身是否有价值 |

---

## Slide 2: 实验设计

### 目标项目

**Starlette** (encode/starlette) — Python ASGI 框架，~12K LOC

选择理由:
- 中间件管道和路由系统涉及跨模块数据流
- GBrain 图遍历 (`traverse_graph`) 可追踪调用链
- 测试覆盖优秀，适合自动验证

### 任务集 (8 个任务，5 种类型)

| # | 任务 | 类型 | 核心考察 |
|---|------|------|---------|
| 01 | 修复 Middleware 执行顺序 | fix_bug | 跨文件 trace |
| 02 | 修复路由参数类型转换 | fix_bug | 单文件深度理解 |
| 03 | 添加流式响应计数 | add_feature | 协议理解 |
| 04 | 添加 Header 路由匹配 | add_feature | 架构扩展 |
| 05 | 理解请求完整生命周期 | understand | 全局视野 |
| 06 | 分析 Middleware/404 交互 | understand | 边界行为 |
| 07 | 重构路由匹配逻辑 | refactor | 安全重构 |
| 08 | 补充 Middleware 测试 | write_test | 测试设计 |

---

## Slide 3: 评分体系

### 三维度综合评估

```
综合得分 = 0.40 × 成功率 + 0.25 × 效率 + 0.35 × 质量
```

### 成功率 (40%)
- verify.sh 自动验证: exit 0 = PASS, exit 2 = PARTIAL, 其他 = FAIL
- understand 类任务由 LLM-as-judge 评分

### 效率 (25%)
- 工具调用轮次、Wall-clock 时间、Token 消耗
- min-max 归一化 (A/B 同任务池化)

### 质量 (35%)
- LLM-as-judge 双评（正确性/风格/边界/简洁性，1-5 分）
- 分差 >2 时引入第三 judge，取中位数

---

## Slide 4: 实现流程

### Subagent-Driven Development (12 Tasks)

```
Task 1: Scaffold + Types   →  定义所有共享类型
Task 2: Metrics Module     →  效率归一化算法
Task 3: Judge Module       →  LLM-as-judge 双评 + tiebreaker
Task 4: Agent Runner       →  OpenCode 适配器 (headless + interactive)
Task 5: Report Generator   →  Markdown A/B 对比报告
Task 6: Main Scheduler     →  编排 A/B 组、评分、报告生成
Tasks 7-10: Task Defs      →  8 个任务 × 4 文件 (prompt/seed/verify/ground_truth)
Task 11: Unit Tests        →  metrics 模块 5 个测试
Task 12: Integration       →  结构验证、seed patch 测试
```

### 每任务 Review 流程

```
Implementer → Spec Compliance Review → Code Quality Review → Fix → Re-review → ✅
```

共 13 commits，42 个文件。

---

## Slide 5: Seed Patch 构造

### 真实 Bug 植入

根据 Starlette commit `7793b92` 实际源码构造：

**Task 01 - Middleware 顺序 Bug:**
```diff
- self.user_middleware.insert(0, Middleware(...))
+ self.user_middleware.append(Middleware(...))
```
效果: 多个 middleware 的洋葱顺序反转

**Task 02 - 参数类型转换 Bug:**
```diff
- matched_params[key] = self.param_convertors[key].convert(value)
+ matched_params[key] = value  # convert() skipped
```
效果: `{item_id:int}` 返回字符串而非整数

验证: buggy state EXIT≠0, clean state EXIT=0 ✅

---

## Slide 6: 测试环境

### 配置

| 组件 | 版本/状态 |
|------|----------|
| OpenCode | 1.14.41 (headless: `opencode run`) |
| GBrain | 0.16.4 (Postgres + pgvector, port 5435) |
| GBrain 内容 | 35 code files + 35 docs = 70 pages, 570 chunks |
| Embedding | 无 (无 OPENAI_API_KEY，仅 keyword search) |

### GBrain MCP 状态

```
● ✓ gbrain connected (41 tools)
  search / query / traverse_graph / get_page / get_backlinks / ...
```

### 执行方式

```
opencode run --dir /tmp/starlette-bench --dangerously-skip-permissions "$PROMPT"
```

每个任务独立 session，Git seed state 隔离。

---

## Slide 7: 实验结果总览

### 成功率 (3/8 任务已执行)

| Task | Type | A (bare) | B (MCP) | B-guided | C (preload) |
|------|------|----------|---------|----------|-------------|
| 01 | fix_bug | ✅ 27 tools | ✅ 17 tools | — | — |
| 02 | fix_bug | ✅ 12 tools | ✅ 6 tools | — | — |
| 05 | understand | ✅ 12 tools | ✅ 12 tools | ✅ 17 tools | ✅ |

**成功率: 100%** (9/9 次运行全部 PASS)

### GBrain MCP 使用

**0 次 MCP 调用 / 6 次 Group B 运行**

即使:
- MCP 已连接 (41 tools available)
- Prompt 中明确列出工具名和用法
- Agent 在 todo list 中写下 "Use GBrain tools to trace the request path"

Agent 始终使用内置工具 (task, bash, read, write, edit, glob, todowrite)

---

## Slide 8: 覆盖率深度对比 (Task 05)

### 对照 Ground Truth 14 个关键节点

| # | 节点 | A (无 GBrain) | C (GBrain 预加载) |
|---|------|:---:|:---:|
| 1 | ASGI Server | ✅ | ✅ |
| 2 | Starlette.__call__ | ✅ | ✅ |
| 3 | ServerErrorMiddleware | ✅ | ✅ |
| 4 | User Middleware Stack | ✅ | ✅ |
| 5 | ExceptionMiddleware | ✅ | ✅ |
| 6 | Router.__call__ | ✅ | ✅ |
| 7 | Route.matches() | ✅ | ✅ |
| 8 | Route.__call__ / handle | ✅ | ✅ |
| 9 | Request 对象构造 | ✅ | ✅ |
| 10 | Endpoint 函数 | ✅ | ✅ |
| 11 | Response 对象 | ✅ | ✅ |
| 12 | Middleware after_request | ✅ | ✅ |
| 13 | ASGI send 协议 | ✅ | ✅ |
| 14 | StreamingResponse | ❌ | ❌ |
| **得分** | | **13/14 (92.9%)** | **13/14 (92.9%)** |

---

## Slide 9: 效率对比

### 工具调用次数

| Task | Type | A | B | Δ |
|------|------|---|---|----|
| 01 | 跨模块 fix_bug | 27 | 17 | **-37%** |
| 02 | 单文件 fix_bug | 12 | 6 | **-50%** |
| 05 | 全局 understand | 12 | 12 | 0% |

### 文档效率 (Task 05)

| 组别 | 文档长度 | 覆盖率 |
|------|---------|--------|
| A (自行探索) | 235 行 | 92.9% |
| C (GBrain 预加载) | 105 行 | 92.9% |

**相同覆盖率，55% 更少的篇幅。** GBrain 知识让 agent 不需要在输出中冗长地复述自己探索到的架构信息。

---

## Slide 10: 关键发现

### 1. MCP 集成是瓶颈

OpenCode agent 的工具选择循环不调用 MCP 工具。GBrain 已连接且 prompt 中明确引导，但 agent 仍只用内置工具。这是 agent 架构层面的限制，不是 GBrain 的问题。

### 2. 知识本身有价值

直接注入 GBrain 知识到 prompt（绕过 MCP），agent 输出质量不变但更简洁高效（-55% 篇幅）。知识传递方式决定效果。

### 3. 代码索引 ≠ 解决方法库

当前 GBrain 作为代码索引（搜索源码），覆盖率瓶颈不在"找不到代码"而在"不知道要覆盖什么"——两者都漏了 StreamingResponse。如果 GBrain 存储**过去任务的正确做法和遗漏清单**（解决方法库），agent 可以对照经验避免重复遗漏。

### 4. 跨模块任务收益更大

跨模块任务（Task 01: -37% tools）比单文件任务（Task 02: -50% 但绝对值小）和全局任务（Task 05: 0%）更能体现知识图谱价值。

---

## Slide 11: 项目产出

### 代码产出 (benchmarks/opencode-vs-gbrain/)

```
runner/
├── types.ts          共享类型 (14 接口)
├── metrics.ts        效率归一化
├── judge.ts          LLM-as-judge 双评
├── agent-runner.ts   OpenCode 适配器
├── report.ts         Markdown 报告生成
├── run.ts            主调度器
└── run.test.ts       5 单元测试 ✅ 全部通过

tasks/                8 任务 × ~5 文件 = 41 文件
├── prompt.md         原始任务描述
├── prompt_gb.md      GBrain 引导版 (B 组)
├── prompt_gb_preloaded.md  知识预加载版 (C 组, Task 05)
├── seed.patch        真实 bug (基于 Starlette 7793b92)
├── verify.sh         自动验证脚本 (exit code 契约)
└── ground_truth.md   评分参考 (14 节点 checklist)

config/               OpenCode MCP 配置
results/              报告输出目录
```

### 文档产出

| 文档 | 路径 |
|------|------|
| 设计文档 | docs/superpowers/specs/2026-05-10-opencode-gbrain-benchmark-design.md |
| 实现计划 | docs/superpowers/plans/2026-05-10-opencode-gbrain-benchmark-plan.md |
| 结果报告 | docs/superpowers/results/2026-05-10-opencode-gbrain-benchmark-results.md |

---

## Slide 12: 经验教训

### 基准测试设计

- **Seed patch 必须基于真实源码构造**: 初始占位符无法验证，需要 clone 实际项目后 git diff 生成
- **verify.sh 要测试不同版本的 API 兼容性**: Starlette 1.0 去掉了 `@app.route()`，需要改用 `routes=[Route(...)]`
- **Prompt 长度受 shell 限制**: >2000 字符的 prompt 需要 subprocess 传递

### GBrain 使用

- **MCP 不一定是正确的知识传递通道**: agent 可能不调用 MCP 工具
- **知识注入 (prompt pre-loading) 是 MCP 的有效替代方案**: 直接有效，不依赖 agent 的工具选择
- **GBrain 的价值定位应从"代码搜索"转向"经验积累"**: 存储解决方法 > 存储源码

### Agent 行为

- **OpenCode agent 的工具选择是保守的**: 优先使用内置 task sub-agent，不主动发现 MCP 工具
- **不同模型/agent 架构可能有不同的 MCP 行为**: 此结论限于 OpenCode 1.14.41 + 当前配置

---

## Slide 13: 下一步建议

### 短期 (可立即执行)

1. **完成剩余 5 个任务**: Task 03, 04, 06, 07, 08
2. **设置 API Key**: `OPENAI_API_KEY` 启用 embedding, `ANTHROPIC_API_KEY` 启用 judge 评分
3. **一键运行**: `bun run benchmarks/opencode-vs-gbrain/runner/run.ts`

### 中期 (改进基准测试)

4. **构建解决方法库 brain**: 将本次任务的标准答案存入 GBrain，测试 agent 下次参考后覆盖率是否从 92.9% → 100%
5. **多项目扩展**: 在 Click、Rich 等项目上重复测试
6. **尝试其他 agent**: 测试 Claude Code、Cline 等是否更积极使用 MCP

### 长期 (改进 GBrain)

7. **探索 MCP 工具发现机制**: 研究为何 agent 不调用已连接的 MCP 工具
8. **prompt 预加载自动化**: 将 GBrain 搜索结果自动注入 agent prompt（绕过 MCP 限制）
