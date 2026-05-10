# OpenCode + GBrain 基准测试：任务完成度对比设计

## 目标

设计一个可复现的基准测试，对比 OpenCode 在有无 GBrain（作为 MCP 知识脑）辅助下的软件工程任务完成能力。三维度评估：成功率、效率、代码质量。

## 目标项目：Starlette

- **仓库**: encode/starlette，ASGI 框架/工具包
- **规模**: ~12K Python SLOC，结构清晰
- **选型理由**: Starlette 的中间件管道和路由系统涉及跨模块的数据流追踪，是 GBrain 知识图谱能力的典型优势场景。请求生命周期穿越 routing → middleware stack → endpoint → response 多个松耦合模块，agent 通过 GBrain 的 `traverse_graph` 可以沿调用链逐跳追踪，无需在文件间盲目搜索。测试覆盖优秀，适合自动验证。

## 任务集（8 个任务，5 种类型）

每个任务包含：`prompt.md`（agent 指令）、`seed.patch`（预埋修改）、`verify.sh`（自动验证）、`ground_truth.md`（供 judge 参考）。

`verify.sh` 契约：退出码 0 表示全部通过；退出码 2 表示部分通过（部分子检查失败）；其他退出码表示不通过。stdout/stderr 输出同步到 runner 日志以便调试。

### 1. fix_middleware_order — 修复 Middleware 执行顺序 Bug

- **类型**: fix_bug
- **场景**: 自定义 middleware 注册顺序错误导致响应头缺失
- **Prompt**: "用户报告在 Starlette 应用中，添加了 CustomHeaderMiddleware 后仍然看不到 X-Frame-Options 响应头。请检查 middleware 注册顺序并修复。"
- **涉及模块**: `starlette/middleware/`, `starlette/applications.py`
- **验证**: 启动测试请求，断言响应头中 `x-frame-options` 存在；`pytest tests/test_middleware.py` 全绿
- **GBrain 优势预期**: `traverse_graph` 从 application 出发沿 middleware 栈追踪执行顺序，比裸 grep `add_middleware` 高效

### 2. fix_route_param_type — 修复路由参数类型转换 Bug

- **类型**: fix_bug
- **场景**: `{item_id:int}` 路径参数被错误传递为字符串
- **Prompt**: "在 Starlette 路由中定义了 `{item_id:int}` 路径参数，但视图函数收到的仍然是字符串。请定位类型转换逻辑的 bug 并修复。"
- **涉及模块**: `starlette/routing.py`, `starlette/convertors.py`
- **验证**: `pytest tests/test_routing.py -k "convertor"` 通过

### 3. add_streaming_middleware — 添加流式响应计数 Middleware

- **类型**: add_feature
- **场景**: 新增 middleware 统计 StreamingResponse 的 chunk 数量
- **Prompt**: "为 Starlette 添加 ChunkCounterMiddleware，统计流式响应的 chunk 数量并记录到日志。需实现 middleware 并编写测试。"
- **涉及模块**: `starlette/middleware/`, `starlette/responses.py`
- **验证**: chunk=0 / chunk=1 / chunk>10 三种场景均正确；`pytest tests/test_middleware.py` 通过

### 4. add_custom_router_match — 添加基于请求头的路由匹配

- **类型**: add_feature
- **场景**: 根据 `Accept-Version` 请求头路由到不同视图函数
- **Prompt**: "扩展 Starlette routing 模块，支持基于请求头（Accept-Version: v2）的匹配规则。需保持向后兼容。"
- **涉及模块**: `starlette/routing.py`
- **验证**: 路由正确分发；无 header 时 fallback 到默认路由

### 5. understand_request_lifecycle — 理解请求生命周期

- **类型**: understand
- **场景**: 追踪 GET /api/users 从 socket 到 response 的完整路径
- **Prompt**: "追踪一个 HTTP 请求在 Starlette 中的完整处理链路。列出所有涉及的模块、类、方法，画出调用时序。如 docs/ 缺少文档则补充。"
- **涉及模块**: 全局（applications.py → routing.py → middleware/ → responses.py → requests.py）
- **验证**: LLM-as-judge 评估完整度（覆盖 ≥80% 关键节点为合格，ground_truth.md 定义关键节点清单）
- **GBrain 优势预期**: 这是 GBrain 最强的场景——`traverse_graph` + `get_backlinks` 一次性展示全链路调用关系，裸 opencode 需要逐文件探索

### 6. understand_middleware_routing_interaction — 理解 Middleware 与路由错误交互

- **类型**: understand
- **场景**: 分析 404 时 middleware 的行为
- **Prompt**: "分析 Starlette 中路由匹配失败（404）时 middleware 的 after_request 行为、ExceptionMiddleware 与自定义 middleware 的执行顺序、以及如何让自定义 middleware 在 404 时也被触发。"
- **涉及模块**: `starlette/middleware/errors.py`, `starlette/applications.py`, `starlette/routing.py`
- **验证**: LLM-as-judge 评估分析准确度

### 7. refactor_route_match — 重构路由匹配逻辑

- **类型**: refactor
- **场景**: Router.matches() 方法臃肿，提取子职责
- **Prompt**: "重构 BaseRoute.matches() 相关方法，将 URL 解析、参数提取、中间件包装分离。所有测试需通过，不改变公开 API。"
- **涉及模块**: `starlette/routing.py`
- **验证**: `pytest tests/test_routing.py` 全量通过 + LLM-as-judge 评估重构质量

### 8. write_test_middleware_stack — 为 Middleware 栈编写测试

- **类型**: write_test
- **场景**: 补充 middleware 栈执行顺序的测试覆盖
- **Prompt**: "补充三个缺失的 middleware 测试场景：多 middleware 精确执行顺序、middleware 抛异常后后续是否跳过、async/sync middleware 混合行为。"
- **涉及模块**: `starlette/middleware/`, `tests/test_middleware.py`
- **验证**: 新增测试覆盖三个场景，`pytest tests/test_middleware.py` 通过

### 任务分类汇总

| 类型 | 任务 | 核心考察 |
|------|------|---------|
| fix_bug | #1 middleware 顺序 | 跨文件 trace、隐式依赖 |
| fix_bug | #2 参数类型转换 | 单文件深度理解、类型系统 |
| add_feature | #3 流式计数 | 协议理解、新代码集成 |
| add_feature | #4 路由头匹配 | 架构扩展、向后兼容 |
| understand | #5 请求全链路 | 全局视野、跨模块追踪 |
| understand | #6 middleware/路由交互 | 边界行为、错误路径分析 |
| refactor | #7 路由拆分 | 结构判断、安全重构 |
| write_test | #8 middleware 栈测试 | 测试设计、边界覆盖 |

## 评分体系

### 维度 1: 成功率（权重 40%）

自动验证脚本判定：

| 结果 | 分数 |
|------|------|
| verify.sh 全通过 | 1.0 |
| 部分子检查失败 | 0.5 |
| 未完成或不通过 | 0.0 |

`success_rate = Σ(task_score) / 8`

对于 understand 类任务（#5、#6），由 LLM-as-judge 对比 ground_truth.md 打分（0-1 连续值）。

### 维度 2: 效率（权重 25%）

每个任务记录三组指标：

| 指标 | 含义 |
|------|------|
| 工具调用轮次 | agent 完整执行期间的工具调用总数 |
| Wall-clock 时间 | 从任务开始到结束的实际秒数 |
| Token 消耗 | 输入 + 输出 token 总数 |

评分：对每项指标做 min-max 归一化（A 组和 B 组合并计算 min/max），越少越好。

```
normalized = 1 - (value - min) / (max - min)
efficiency_score = 0.4 × rounds_norm + 0.3 × time_norm + 0.3 × tokens_norm
```

### 维度 3: 质量（权重 35%）

独立 LLM-as-judge（不与 opencode 共用模型）按 4 个子维度 1-5 评分：

| 子维度 | 权重 | 评分锚点 |
|--------|------|---------|
| 正确性 | 40% | 1=逻辑错误，3=基本正确但有小疏忽，5=无缺陷 |
| 代码风格 | 20% | 1=与项目风格冲突，3=基本一致，5=自然融入 |
| 边界处理 | 20% | 1=仅 happy path，3=覆盖了主要边界，5=充分覆盖 |
| 简洁性 | 20% | 1=过度工程，3=合理改动量，5=最小改动达成目标 |

质量分 = 各子维度加权平均 / 5（归一化到 [0, 1]）。

双 judge 取均值，评分标准锚点描述随 ground_truth.md 提供。
两个 judge 分差 >2 时引入第三个 judge，取三个分数的中位数。

### 综合评分

```
final_score = 0.40 × success_rate + 0.25 × efficiency_score + 0.35 × quality_score
```

## 实验执行流程

### 阶段 1: 准备

```bash
git clone https://github.com/encode/starlette /tmp/starlette-bench
```

为每个任务创建 seed 分支，应用 `seed.patch` 预埋修改。

### 阶段 2: 对照组 A（裸 OpenCode）

1. 每个任务独立 session（避免上下文污染）
2. 启动 opencode session，给定任务 prompt
3. Agent 仅可使用原生工具（read_file、grep、bash 等），无 GBrain MCP
4. 记录工具调用、耗时、token、任务输出
5. 每个任务完成后重置到 seed 分支

### 阶段 3: 实验组 B（OpenCode + GBrain）

1. GBrain 预索引 Starlette 代码库：
   ```bash
   cd /tmp/starlette-bench
   gbrain init
   gbrain config set sync.repo_path /tmp/starlette-bench
   gbrain sync --force        # 代码文件 → pages
   gbrain extract links       # imports/calls → graph links
   ```
2. 配置 OpenCode 连接 GBrain MCP server
3. 每个任务独立 session，给定任务 prompt
4. Agent 可使用 GBrain MCP 工具（search、traverse_graph、get_page、get_backlinks 等）
5. 记录指标同 A 组
6. 额外记录 GBrain 工具调用热力图

### 阶段 4: 评估

1. 对 A/B 组每个任务的输出运行 `verify.sh`
2. LLM-as-judge 对每个任务输出做质量评分（双 judge）
3. 归一化效率指标
4. 生成对比报告

## 报告格式

### 总览面板

```
══════════════════════════════════════════════════════
  OpenCode + GBrain 基准测试报告
  项目: Starlette (encode/starlette)
  日期: 2026-05-10
  OpenCode 版本: <version>
  GBrain 版本: <version>
══════════════════════════════════════════════════════

               对照组 A           实验组 B         Δ
               (裸 opencode)     (opencode+GBrain)
─────────────────────────────────────────────────────
成功率           5.5/8 (69%)      6.8/8 (85%)    +16%
效率 (归一化)     0.62             0.81           +0.19
质量 (1-5)       3.4              4.1            +0.7
─────────────────────────────────────────────────────
综合得分          0.63             0.82           +0.19

结论: B 组领先约 30%。GBrain 在跨模块理解任务中优势最明显。
```

### 逐任务明细表

| # | 任务 | A结果 | B结果 | A轮次 | B轮次 | Δ轮次 | A质量 | B质量 |
|---|------|-------|-------|-------|-------|-------|-------|-------|
| 1 | fix_middleware | 1.0 | 1.0 | 14 | 8 | -43% | 3.5 | 4.5 |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

### GBrain 工具使用热力图

| MCP 工具 | 调用次数 | 覆盖任务数 |
|----------|---------|-----------|
| search | - | - |
| traverse_graph | - | - |
| get_page | - | - |
| get_backlinks | - | - |
| ... | ... | ... |

## 文件结构

```
benchmarks/opencode-vs-gbrain/
├── tasks/
│   ├── 01_fix_middleware_order/
│   │   ├── prompt.md
│   │   ├── seed.patch
│   │   ├── verify.sh
│   │   └── ground_truth.md
│   ├── 02_fix_route_param_type/
│   │   └── ...
│   ├── ...
│   └── 08_write_test_middleware_stack/
│       └── ...
├── runner/
│   ├── run.ts                  # 主调度器
│   ├── metrics.ts              # 指标收集与归一化
│   └── judge.ts                # LLM-as-judge 质量评分
├── config/
│   └── opencode-mcp.json       # B 组 opencode MCP 配置
└── results/
    └── YYYY-MM-DD/
        ├── group_a/
        ├── group_b/
        └── report.md
```

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| opencode / GBrain 版本变化导致复现困难 | 报告中锁定版本号 |
| 同一 session 执行多任务导致上下文污染 | 每任务独立的 agent session，从 seed 分支开始 |
| LLM-as-judge 评分主观 | 双 judge 取均值；评分锚点描述写入 ground_truth.md |
| 任务难度不均衡导致方差大 | 先 pilot 1-2 个任务校准难度 |
| Starlette 项目更新导致 seed.patch 失效 | 锁定 commit SHA 作为基准版本 |

## 复现指令

```bash
# 1. 准备 Starlette
git clone https://github.com/encode/starlette /tmp/starlette-bench
cd /tmp/starlette-bench
git checkout <locked-commit-sha>

# 2. 安装依赖
pip install -e ".[dev]"

# 3. GBrain 预索引（仅 B 组需要）
gbrain init
gbrain config set sync.repo_path /tmp/starlette-bench
gbrain sync --force
gbrain extract links

# 4. 运行基准测试
cd /path/to/gbrain
bun run benchmarks/opencode-vs-gbrain/runner/run.ts
```
