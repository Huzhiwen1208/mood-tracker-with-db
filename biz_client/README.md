# 心情管理客户端

这是一个独立于原首页的客户端程序，访问地址为：

```text
http://localhost:9090/client/
```

客户端复用原应用的账号、Session、心情提交和撤销能力，并额外提供个人记录管理、周期统计和情绪分析报告。

## 对接方式

- 注册：`POST /api/auth/register`
- 登录：`POST /api/auth/login`
- 登录态恢复：`GET /api/auth/me`
- 发送心情：`POST /api/moods`
- 撤销心情：`DELETE /api/moods/:id`
- 个人记录读取：`GET /api/client/moods`

其中新增、撤销都直接写入原应用的 `moods` 表。编辑操作采用“先创建新记录，再撤销旧记录”的方式同步到原应用数据库，因为原应用当前没有原生更新心情接口。

## 客户端数据格式

原应用的 `moods` 表只有 `mood_type` 和 `content` 两个业务字段。为了支持情绪类型、标签、描述和发生时间，客户端会按以下方式写入：

```text
mood_type: 正向 · 开心
content:
今天完成了一件重要的事

[MTC1|positive|开心|2026-06-29T10:30]
```

旧首页仍可把它当成普通心情内容展示；客户端会识别末尾的 `[MTC1|...]` 标记并还原为结构化记录。

## 启动

```bash
docker compose up --build -d
```

然后访问：

```text
http://localhost:9090/client/
```

## 测试

推荐在应用容器内执行：

```bash
docker compose exec app npm run test:client
```

如果你是在宿主机直接启动服务，也可以运行 `npm run test:client`。

测试会自动检查 `http://localhost:9090`。如果服务未运行，它会临时启动 `backend/server.js`，然后完成注册、登录态校验、心情提交、个人记录读取、撤销和撤销后读取校验。
