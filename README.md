# Mood Tracker DB

一个运行在 MacOS 上的全栈心情记录系统，根目录固定为 `/Users/jackhu/src_code/mood-tracker-db`，统一通过 `http://localhost:9090` 提供页面和接口服务。

## 功能概览

- 用户注册：账号、密码、昵称注册，密码使用 Node.js `crypto.scrypt` 加密后存储
- 用户登录与登出：基于服务端 Session 表 + HttpOnly Cookie 维持登录态
- 心情发布：支持心情类型、内容、发布时间记录
- 心情撤销：已登录用户只能撤销自己发布且仍处于已发布状态的心情
- 管理员用户管理：管理员可新增系统用户、删除系统用户
- 响应式网页：注册、登录、心情发布、撤销、用户管理全部在网页端完成
- 更完整交互：字符计数、加载态、禁用态、Toast 提示、时间线筛选与统计

## 项目结构

```text
mood-tracker-db
├── backend
│   ├── config.js        # 配置读取
│   ├── db.js            # MySQL 命令行访问层
│   ├── security.js      # 密码加密与 Session Token
│   ├── services.js      # 业务逻辑
│   └── server.js        # HTTP 服务，统一对外暴露 9090
├── frontend
│   ├── index.html       # 页面结构
│   ├── styles.css       # 响应式样式
│   └── app.js           # 前端交互逻辑
├── scripts
│   └── init-db.js       # 初始化数据库与默认管理员
├── sql
│   └── init.sql         # 建库建表脚本
├── .env.example         # 环境变量示例
├── package.json
└── README.md
```

## 数据库设计

### `users`

- `account`: 唯一账号
- `password_hash`: 加密密码
- `nickname`: 昵称
- `role`: `admin` / `user`
- `is_active`: 软删除标记

### `moods`

- `user_id`: 发布者 ID
- `mood_type`: 心情类型
- `content`: 心情内容
- `status`: `published` / `revoked`
- `published_at`: 发布时间
- `revoked_at`: 撤销时间

### `sessions`

- `user_id`: 登录用户
- `token_hash`: Session Token 哈希
- `expires_at`: 过期时间
- `revoked_at`: 登出或失效时间

## 环境要求

- MacOS
- Node.js `>= 16.20`
- 本机可执行 `mysql` 命令
- Docker 中运行的 MySQL 8.0 容器
  - 容器 ID：`d59ce521836d0a9edfc4af5e5c07f8b4ec63e5d9f55de77cb98ab8341d67be4b`
  - 默认 Root 密码：`123456`
  - 默认映射端口：`3306`

## 配置说明

1. 复制配置模板：

```bash
cd /Users/jackhu/src_code/mood-tracker-db
cp .env.example .env
```

2. 默认配置已经对接当前 Docker MySQL 容器，可直接使用。常用变量如下：

```env
APP_PORT=9090
DB_MODE=host
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=123456
DB_NAME=mood_tracker_app
DB_CONTAINER_ID=d59ce521836d0a9edfc4af5e5c07f8b4ec63e5d9f55de77cb98ab8341d67be4b

ADMIN_ACCOUNT=admin
ADMIN_PASSWORD=Admin123!@#
ADMIN_NICKNAME=系统管理员
```

说明：

- `DB_MODE=host`：通过宿主机 `127.0.0.1:3306` 访问 MySQL
- `DB_MODE=docker-exec`：通过 `docker exec` 在容器内执行 MySQL 命令，适合某些受限环境

## 初始化与启动

### 1. 初始化数据库

```bash
cd /Users/jackhu/src_code/mood-tracker-db
npm run db:init
```

该命令会自动：

- 创建 `mood_tracker_app` 数据库
- 创建 `users`、`moods`、`sessions` 三张表
- 如果默认管理员不存在，则自动创建

### 2. 启动服务

```bash
cd /Users/jackhu/src_code/mood-tracker-db
npm start
```

启动成功后访问：

```text
http://localhost:9090
```

## 默认管理员

- 账号：`admin`
- 密码：`Admin123!@#`

首次进入网页后可用该管理员账号登录，并测试用户新增/删除流程。

## 使用说明

### 普通用户

1. 在网页中注册账号，系统会自动登录
2. 选择心情类型并填写内容后发布
3. 在时间线中可撤销自己发布的心情

### 管理员

1. 使用管理员账号登录
2. 在“管理员用户管理”区域中新增普通用户或管理员
3. 可删除非当前登录的其他系统用户

## 接口一览

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/moods`
- `POST /api/moods`
- `DELETE /api/moods/:id`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `DELETE /api/admin/users/:id`

## 稳定性设计

- 输入校验：账号、密码、昵称、心情内容均有长度与格式校验
- 异常处理：后端统一返回 JSON 错误信息
- 登录保护：发布、撤销、用户管理接口均要求登录
- 权限控制：管理员接口仅 `role=admin` 可用
- 软删除：删除用户不会直接物理删除，便于减少误操作风险

## 备注

- 项目未依赖第三方 npm 包，便于在受限网络环境中直接运行
- 所有可访问页面与接口都由同一个 Node 服务从 `localhost:9090` 对外提供
