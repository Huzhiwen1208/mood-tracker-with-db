# ReAgentOS

## 项目介绍

可重置智能体操作系统聚焦智能体快速重置的核心挑战，从“0到1”构建语义感知的操作系统框架，实现内核的语义感知与回滚机制，全面支撑端侧产品的 AI 智能体应用。

## 关键技术亮点

- 从“系统级回滚”到“语义级回滚”的跨越式创新，突破传统操作系统的局限，赋予智能体更高的自适应与可恢复能力。

## 宏观架构

1. Localstate：本机状态变化管理，建议通过一个本地的 MCP-server 进行管理
2. Restful 语义感知模型（真实世界模型）：与真实世界（远端APP）互动，负责真实世界的状态管理。远程APP+本地业务==>远程的 MCP-server 管理（幂等 + 可逆 + 拦截）
3. 语义元数据（语义标签）：实现 undo 回撤的基础，记录每个操作的语义标签，用于后续的回撤操作。

## 语义划分
1. 可撤销语义操作：使用语义标签 undo 即可
2. 不可撤销语义操作。
   1. 危险操作：支付场景、删除操作等
   2. 非危险操作。
      1. 可通过 backup 变为可撤销语义操作
      2. 不可通过 backup 回撤

# Demonstration
## 运行要求

推荐方案只要求：

- Docker Desktop 或 Docker Engine
- Docker Compose v2

如果你要在宿主机直接跑 Node.js，再额外需要：

- Node.js `>= 16.20.0`
- 本机可执行 `mysql` 命令

## 快速开始

### 1. 准备环境变量

```bash
cp .env.example .env
```

默认配置已经适配 `docker-compose.yml`：

```env
APP_PORT=9090
DB_MODE=tcp
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=123456
DB_NAME=mood_tracker_app
DB_CONNECT_RETRIES=30
DB_CONNECT_RETRY_DELAY_MS=2000

ADMIN_ACCOUNT=admin
ADMIN_PASSWORD=Admin123!@#
ADMIN_NICKNAME=系统管理员
```

常见可调整项：

- `APP_PORT`：宿主机访问端口
- `DB_PASSWORD`：MySQL Root 密码，同时也是应用连接密码
- `DB_NAME`：业务数据库名
- `DB_PORT_FORWARD`：宿主机访问 MySQL 的映射端口，默认 `3307`
- `ADMIN_ACCOUNT` / `ADMIN_PASSWORD`：默认管理员账号

### 2. 启动完整环境

```bash
docker compose up --build -d
```

首次启动会自动完成：

- MySQL 容器启动
- 应用容器构建和启动
- 数据库建库建表
- 默认管理员创建

访问地址：

- 首页：`http://localhost:9090`
- 独立客户端：`http://localhost:9090/client/`

### 3. 查看状态

```bash
docker compose ps
docker compose logs -f app
```

### 4. 停止环境

```bash
docker compose down
```

如果需要连同数据库数据一起清空：

```bash
docker compose down -v
```
# TODO LIST

1. 核心TODO：参考 cli-anything（代码+论文），进一步得出：业务+APP=>MCP 的数学化，形式化方法论
2. 总结demo路径：通过简单的demo（麻雀虽小，五脏俱全）==> 总结出一套意图识别、Restful远程化MCP、本地化MCP的方法论==> 通过复杂系统验证 ==> 暴露出不足和需要改进的点 ==> 问题解决方案+展望
3. 整体需要数学化一些：比如实体关系图、状态机、状态转换函数、spec 等