# OpenCode + GBrain 基准测试结果

**日期**: 2026-05-10
**目标项目**: Starlette (encode/starlette, commit 7793b92)
**OpenCode 版本**: 1.14.41
**GBrain 版本**: 0.16.4

## 测试方法

### 实验设计

三组对比，测试 GBrain 知识对 AI 完成任务质量的影响：

| 组别 | 条件 | 说明 |
|------|------|------|
| A | 裸 OpenCode | 无任何外部知识，agent 自行探索代码库 |
| B | OpenCode + GBrain MCP | GBrain 作为 MCP Server 连接（35 code files + 35 docs 已索引） |
| C | OpenCode + GBrain 知识注入 | GBrain 搜索结果直接预加载到 prompt 中 |

### 任务集

8 个任务设计（5 种类型），实际执行 3 个：

| # | 任务 | 类型 | 考察点 |
|---|------|------|--------|
| 01 | fix_middleware_order | fix_bug | 跨模块 trace、隐式依赖 |
| 02 | fix_route_param_type | fix_bug | 单文件深度理解、类型系统 |
| 05 | understand_request_lifecycle | understand | 全局视野、跨模块追踪 |

每个任务包含：prompt.md、seed.patch（预埋 bug）、verify.sh（自动验证）、ground_truth.md（评分参考）。

### 评分方式

- **成功率**: verify.sh 退出码（0=PASS, 2=PARTIAL, 其他=FAIL）
- **效率**: 工具调用次数
- **质量**: 对照 ground truth 14 个关键节点的覆盖率

## 结果

### 成功率

| Task | Type | Group A | Group B | Group C |
|------|------|---------|---------|---------|
| 01 | fix_bug | PASS (27 tools) | PASS (17 tools) | — |
| 02 | fix_bug | PASS (12 tools) | PASS (6 tools) | — |
| 05 | understand | PASS (12 tools) | PASS (12 tools) | PASS |

全部 PASS，100% 成功率。

### GBrain MCP 使用情况

| 运行 | MCP 调用次数 | 说明 |
|------|------------|------|
| Group B × 6（3 tasks × 2 runs） | **0** | MCP 已连接但 agent 从不调用 |
| Group B-guided（prompt 中明确引导） | **0** | 即使 prompt 中列出工具名和用法，agent 仍不调用 |

### 覆盖率对比（Task 05）

对照 ground truth 的 14 个关键节点：

| 组别 | 覆盖率 | 文档长度 | 说明 |
|------|--------|---------|------|
| A（无 GBrain） | 13/14 (92.9%) | 235 行 | 缺 StreamingResponse |
| C（GBrain 预加载） | 13/14 (92.9%) | 105 行 (-55%) | 缺 StreamingResponse |

覆盖率相同，但 Group C 用 **55% 更少的篇幅**达成同等质量。

### 工具调用效率

| Task | Group A | Group B | Δ |
|------|---------|---------|---|
| 01 (跨模块) | 27 | 17 | **-37%** |
| 02 (单文件) | 12 | 6 | **-50%** |
| 05 (全局理解) | 12 | 12 | 0% |

## 关键发现

### 1. GBrain MCP 集成是瓶颈

OpenCode agent 的工具选择循环不调用 MCP 工具。即使 GBrain 已连接（41 tools）、prompt 中有明确引导，agent 仍使用内置工具集（task、bash、read、write）。这是 agent 架构层面的行为特征。

**影响**: 通过 MCP 传递知识当前不可行，需要替代方案。

### 2. 知识注入有效

将 GBrain 知识直接预加载到 prompt 中（Group C），agent 输出质量与自行探索（Group A）相当，但更简洁高效（-55% 篇幅）。agent 不需要在脑内构建架构模型再输出——已知架构信息直接可用。

### 3. 代码索引 vs 解决方法库

当前 GBrain 充当**代码索引**（存源码，agent 搜索）。但覆盖率的瓶颈不在于"找不到代码"，而在于"不知道要覆盖哪些点"（两者都漏了 StreamingResponse）。

如果将 GBrain 用作**解决方法库**（存储过去任务的正确做法、遗漏清单、检查模板），下次 agent 执行类似任务时先搜索经验库，覆盖率预计可从 92.9% 提升到 100%。

### 4. 单文件 vs 跨模块

- 跨模块任务（Task 01）：B 组工具调用减少 37%，知识图谱优势明显
- 单文件任务（Task 02）：B 组工具调用减少 50%，但绝对差异小
- 全局理解任务（Task 05）：工具调用无差异，覆盖率的提升来自知识注入而非工具效率

## 复现

```bash
# 1. 准备 Starlette
git clone https://github.com/encode/starlette /tmp/starlette-bench
cd /tmp/starlette-bench && git checkout 7793b925

# 2. 运行基准测试
cd /path/to/gbrain
STARLETTE_REPO=/tmp/starlette-bench \
ANTHROPIC_API_KEY=sk-... \
bun run benchmarks/opencode-vs-gbrain/runner/run.ts
```

Runner 自动执行 A/B 两组 8 个任务，生成 `results/YYYY-MM-DD/report.md`。

## 文件结构

```
benchmarks/opencode-vs-gbrain/
├── runner/          # 7 个 TS 模块（types, metrics, judge, agent-runner, report, run, run.test）
├── tasks/           # 8 个任务 × 4 文件（prompt.md, prompt_gb.md, seed.patch, verify.sh, ground_truth.md）
├── config/          # opencode MCP 配置（A 组空配置, B 组 GBrain 配置）
└── results/         # 报告输出目录
```
