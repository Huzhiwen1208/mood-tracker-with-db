# 情绪管理 APP MCP Server

这个 MCP server 用 Python 标准库实现，通过 stdio 暴露远程情绪管理 APP 的三个业务能力：

| MCP tool | APP 能力 | 是否可以回滚 |
|---|---|---|
| `list_moods` | 读取心情记录 | 可以 |
| `send_mood` | 发送心情 | 可以 |
| `revoke_mood` | 撤销心情 | 不可以 |

说明：

- `list_moods` 是只读操作，不改变远程 APP 数据。
- `send_mood` 创建成功后会返回 `rollback`，Agent 可以用其中的 `revoke_mood` 参数撤销新记录。
- `revoke_mood` 会撤销远程 APP 中的记录；当前 APP 没有恢复已撤销记录的接口，所以不可回滚。

## 启动方式

```bash
MOOD_APP_BASE_URL=http://localhost:9090 \
MOOD_APP_ACCOUNT=admin \
MOOD_APP_PASSWORD='Admin123!@#' \
python3 mcp/mood_app_server.py
```

`MOOD_APP_BASE_URL` 默认是 `http://localhost:9090`。

## 认证方式

推荐使用账号密码，让 MCP server 内部自动登录：

```bash
export MOOD_APP_ACCOUNT=your_account
export MOOD_APP_PASSWORD='your_password'
```

也可以传入已有 Cookie：

```bash
export MOOD_APP_SESSION_COOKIE='mood_tracker_session=xxxx'
```

对 Agent 暴露的 tool 仍然只有 `list_moods`、`send_mood`、`revoke_mood`，登录细节由 MCP server 内部处理。

## Codex/Agent 配置示例

```json
{
  "mcpServers": {
    "mood-app": {
      "command": "python3",
      "args": [
        "/path/to/mood-tracker-db/mcp/mood_app_server.py"
      ],
      "env": {
        "MOOD_APP_BASE_URL": "http://localhost:9090",
        "MOOD_APP_ACCOUNT": "admin",
        "MOOD_APP_PASSWORD": "Admin123!@#"
      }
    }
  }
}
```

## Tool 入参

### `list_moods`

可选参数：

- `category`: `positive` / `neutral` / `negative`
- `tag`: 情绪标签
- `start_date`: 发生时间下限，例如 `2026-06-01`
- `end_date`: 发生时间上限，例如 `2026-06-30T23:59`
- `limit`: 返回数量上限

### `send_mood`

必填参数：

- `category`: `positive` / `neutral` / `negative`
- `tag`: 情绪标签
- `description`: 情绪描述

可选参数：

- `occurred_at`: 发生时间，例如 `2026-06-29T14:30`

### `revoke_mood`

必填参数：

- `mood_id`: 要撤销的心情记录 ID
