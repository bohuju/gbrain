# OpenCode MCP 配置指南

将 GBrain 注册为 OpenCode 的 MCP Server，让你的 AI agent 在编码时直接读写大脑。

## 前置条件

### 数据库

GBrain 需要 Postgres + pgvector。本机没有 Postgres 时，用 Docker 启动：

```bash
sudo docker run -d --name gbrain-mcp-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gbrain_mcp \
  -p 5435:5432 \
  pgvector/pgvector:pg16
```

端口选择说明：
- 5435 是本地测试端口，避免与已有 Postgres（5432）冲突
- 生产环境建议用 Supabase 或自托管 Postgres，数据库名自定

### 编译 gbrain 二进制

```bash
cd /path/to/gbrain
bun build --compile --outfile bin/gbrain src/cli.ts
```

编译完成后二进制在 `bin/gbrain`，记下绝对路径。

## 初始化大脑

### 1. 初始化 Schema

```bash
/path/to/gbrain init --url postgresql://postgres:postgres@localhost:5435/gbrain_mcp
```

输出确认：
```
Brain ready. 0 pages. Engine: Postgres (Supabase).
Next: gbrain import <dir>
```

20+ schema 迁移自动执行。配置文件写入 `~/.gbrain/config.json`：

```json
{
  "engine": "postgres",
  "database_url": "postgresql://postgres:postgres@localhost:5435/gbrain_mcp"
}
```

### 2. 导入内容（可选但推荐）

```bash
# 导入 markdown 文件
/path/to/gbrain import ~/notes/

# 同时导入代码文件（--include-code）
/path/to/gbrain import ~/project/ --include-code

# 或通过 git 增量同步
/path/to/gbrain sync --repo ~/project/ --include-code
```

### 3. 设置 API Key（可选，启用向量搜索）

```bash
export OPENAI_API_KEY="sk-..."
```

不设置 API Key 时，关键词搜索（tsvector）和代码搜索仍然可用，向量搜索会跳过。

## 注册到 OpenCode

编辑 `~/.config/opencode/opencode.json`，在 `"mcp"` 对象中添加：

```json
{
  "mcp": {
    "gbrain": {
      "type": "local",
      "command": [
        "/home/bohuju/self_project/gbrain/bin/gbrain",
        "serve"
      ],
      "enabled": true,
      "timeout": 30000
    }
  }
}
```

配置项说明：

| 字段 | 值 | 说明 |
|---|---|---|
| `type` | `"local"` | 本地 stdio 进程 |
| `command` | `["/absolute/path/to/gbrain", "serve"]` | 必须用绝对路径，OpenCode 无法解析 `$PATH` |
| `enabled` | `true` | 设为 `false` 可临时禁用 |
| `timeout` | `30000` | 毫秒，混合搜索可能需要 3-5 秒 |

重启 OpenCode 后生效。

## 验证

### 1. 验证 Server 启动

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | /path/to/gbrain serve
```

预期输出包含：
```json
{"result":{"serverInfo":{"name":"gbrain","version":"x.y.z"},...}}
```

### 2. 验证工具列表

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | /path/to/gbrain serve
```

应列出 30+ 工具：`search`, `query`, `get_page`, `put_page`, `list_pages`, `traverse_graph`, `get_backlinks` 等。

### 3. 验证搜索

```bash
# 直接 CLI 测试
/path/to/gbrain search "your test query"
/path/to/gbrain code search "functionName"
/path/to/gbrain stats
```

### 4. 在 OpenCode 中验证

在 OpenCode 对话中直接提问：
- "search the brain for X"
- "use gbrain to find Y"
- 或直接让 agent 调用 `search` / `get_page` 等 MCP 工具

## 可用工具

GBrain 向 OpenCode 暴露 30+ 工具，以下是核心工具：

| 工具 | 用途 |
|---|---|
| `search` | 关键词搜索（代码感知，自动检测驼峰/蛇形/路径式查询） |
| `query` | 混合搜索（向量 + 关键词 + RRF 融合 + 多查询扩展） |
| `get_page` | 读取页面全文 |
| `put_page` | 创建/更新页面（自动版本） |
| `list_pages` | 过滤列出页面（可按 type、tag 过滤） |
| `get_backlinks` | 获取反向链接 |
| `traverse_graph` | 图遍历（类型过滤、方向、深度） |
| `add_link` / `remove_link` | 管理交叉引用 |
| `add_tag` / `remove_tag` | 标签管理 |
| `get_stats` | 大脑统计 |
| `get_health` | 健康指标 |
| `resolve_slugs` | 模糊 slug 解析 |
| `sync_brain` | 触发增量同步 |
| `submit_job` / `get_job` / `list_jobs` | Minions 任务队列操作 |
| `file_list` / `file_upload` / `file_url` | 文件存储操作 |

## 故障排除

### Server 无法启动

检查 PGLite WASM 兼容性。如果报 `PGLite failed to initialize its WASM runtime`，说明当前环境不支持 PGLite，必须用 Postgres：

```bash
cat ~/.gbrain/config.json | grep engine
# 应该是 "postgres"，不是 "pglite"
```

### 搜索无结果

确认数据库中已有页面：
```bash
/path/to/gbrain list
/path/to/gbrain stats
```

### Docker 容器管理

```bash
# 查看容器状态
sudo docker ps -a --filter "name=gbrain-mcp-pg"

# 启动已停止的容器
sudo docker start gbrain-mcp-pg

# 停止
sudo docker stop gbrain-mcp-pg

# 完全删除（数据丢失）
sudo docker stop gbrain-mcp-pg && sudo docker rm gbrain-mcp-pg
```

### 数据库连接失败

检查端口是否被占用：
```bash
ss -tlnp | grep 5435
```

检查 `~/.gbrain/config.json` 中的 `database_url` 是否正确。
