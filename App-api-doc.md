# Mood Tracker DB

一个基于 Node.js 和 MySQL 8 的全栈心情记录系统。仓库现在默认按 Docker Compose 方式启动应用和数据库，不再依赖固定的本机目录、已有 MySQL 实例或特定容器 ID，推送到远程后其他人可以直接按本文复现。

## 功能概览

- 用户注册、登录、登出
- 基于服务端 Session 和 HttpOnly Cookie 的登录态管理
- 心情发布、个人撤销
- 管理员新增用户、删除用户
- 首页 Web 端交互
- 独立客户端工作台，支持个人记录、周期统计、趋势分析
- 客户端全链路测试脚本

## 项目结构

```text
mood-tracker-db
├── backend
│   ├── config.js
│   ├── db.js
│   ├── security.js
│   ├── services.js
│   └── server.js
├── frontend
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── biz_client
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── README.md
├── scripts
│   ├── init-db.js
│   └── test-client-flow.js
├── sql
│   └── init.sql
├── .env.example
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

## 默认管理员

- 账号：`admin`
- 密码：`Admin123!@#`

如果你改了 `.env`，以你自己的配置为准。

## 数据库设计

### `users`

- `account`：唯一账号
- `password_hash`：密码哈希
- `nickname`：昵称
- `role`：`admin` / `user`
- `is_active`：软删除标记

### `moods`

- `user_id`：发布者 ID
- `mood_type`：心情类型
- `content`：心情内容
- `status`：`published` / `revoked`
- `published_at`：发布时间
- `revoked_at`：撤销时间

### `sessions`

- `user_id`：登录用户
- `token_hash`：Session Token 哈希
- `expires_at`：过期时间
- `revoked_at`：登出或失效时间

## 常用命令

在 Docker 环境内执行：

```bash
docker compose exec app npm run test:client
docker compose exec app npm run db:init
```

如果你已经在宿主机启动了服务，也可以直接执行：

```bash
npm run test:client
npm run db:init
```

`test:client` 会验证注册、登录态、心情提交、个人记录读取、撤销和撤销后的数据一致性。

## 可选：宿主机直接运行 Node.js

如果你只想把 MySQL 放进 Docker，而 Node.js 直接跑在宿主机，也可以：

1. 启动数据库：

```bash
docker compose up -d mysql
```

2. 将 `.env` 中的数据库地址改为宿主机端口：

```env
DB_MODE=tcp
DB_HOST=127.0.0.1
DB_PORT=3307
```

3. 启动应用：

```bash
npm start
```

这个模式仍然不依赖本机预装 MySQL，但需要宿主机具备 Node.js 和 `mysql` 命令行。

## 接口一览

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/moods`
- `POST /api/moods`
- `DELETE /api/moods/:id`
- `GET /api/client/moods`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `DELETE /api/admin/users/:id`

## 实现说明

- 服务启动时会自动初始化数据库结构，并在数据库尚未 ready 时按重试策略等待
- `biz_client` 目录通过 `/client/` 路由对外暴露
- 项目没有第三方 npm 依赖，应用容器只额外安装了 MySQL 客户端
- 删除用户采用软删除，避免直接物理删除业务数据
