# MCP server 生成核心方法论
可以总结成 5 步（面向 Agent 的远程 APP 能力封装方法）：
1. 从 client 业务反推 APP 能力。不把 client 里的所有功能都变成 MCP tool，只抽取真正需要调用远程 APP 的能力，最后收敛成：list_moods、send_mood、revoke_mood

2. 排除登录注册这种支撑能力。登录注册不是 Agent 业务目标，而是 MCP server 的内部基础设施，所以不暴露 login/register tool，让 MCP server 内部维护认证和 Session

3. 【需要人工判断】按可逆性设计 tool。
（1）list_moods：只读，可视为安全
（2）send_mood：可回滚，因为能用 revoke_mood 撤销新记录
（3）revoke_mood：不可回滚，因为 APP 没有恢复接口
这个判断直接影响 Agent 是否需要确认、是否能自动执行

4. MCP tool 应该表达业务语义，而不是 HTTP 细节。不暴露 POST /api/moods，而是暴露 send_mood。入参是 category/tag/description/occurred_at，MCP server 内部负责转换成 APP 的 moodType/content/[MTC1|...]

5. 把风险信息写进 tool 描述和 annotations。
（1）list_moods 标成 readOnlyHint: true
（2）revoke_mood 标成 destructiveHint: true
（3）send_mood 返回 rollback
这样 Agent 不只是“能调用”，还知道怎么安全调用

- 哪些是业务原语？
- 哪些只是认证/支撑逻辑？
- 哪些操作会改变远程状态？
- 改变后能不能用现有能力回滚？
- Agent 看到的 tool 名称和参数是否符合业务语义？
- 不可逆操作有没有显式标注和保护？

这套方法以后可以复用到别的 APP。比如 todo、CRM、财务系统、内容管理系统，都可以先做一张表：
APP 能力	MCP tool	是否写数据	是否可回滚	是否需要确认

然后再决定 MCP server 怎么写。MCP server 不是简单把 API 包一层，而是把 APP 改造成 Agent 可以安全理解和操作的业务能力层。

# 意图识别
“意图识别”其实分了两层：用户意图识别 和 系统能力意图识别。
一、识别你的真实目标
不是只按字面理解“做一个 MCP server”，而是先判断如何让 Business client Agent 可以安全、稳定地代替 Business client 去调用情绪管理 APP 的核心业务能力。

把目标拆成几个判断：
（1）Agent 需要 MCP tool，而不是普通脚本
（2）tool tool 应该服务 client 业务，而不是暴露所有 API
（3）登录注册是内部支撑能力，不应变成业务 tool
（4）MCP 设计要考虑 Agent 安全执行和回滚边界

这一步的方法论是：
让 ai 不急着实现，先从用户表达里找“目标对象、使用主体、边界条件、风险偏好”。

二、识别 Business client 与 APP 的职责边界
我先把 Business client 里的功能分成两类：
|类型|	例子|	适合哪种 MCP tool|
|--|--|--|
|APP 原生/远程能力|	发送心情、撤销心情、读取心情|	适合远程MCP-server|
|Business client 本地派生能力|	统计、报告、筛选、编辑流程|	适合本地MCP-server| 

这样就避免把“统计报告”“编辑心情”也误做成远程 tool。
这里的方法论是：
MCP tool 应该封装远程系统的业务原语，而不是把前端页面上的每个按钮都变成工具。

三、识别 APP 能力的业务意图
同一个 HTTP API，不能只看路径，要看它改变了什么业务状态。
|API|	表面动作|	业务意图|	状态影响|
|--|--|--|--|
|GET| /api/client/moods|	拉列表|	查看个人情绪历史|	不改变状态|
|POST| /api/moods|	发请求|	新增一条心情记录|	创建数据|
|DELETE| /api/moods/:id|	删除请求|	撤销一条心情记录|	改变记录状态为 revoked|

方法论是：
识别 API 意图时，不只看 HTTP 动词本身，而看它对领域对象的生命周期做了什么。

四、用可逆性反推 MCP 设计
可逆性不是抽象判断，而是问：
当前 APP 已暴露的能力里，有没有一个操作能把这个操作造成的状态变化恢复掉？

|操作|	状态变化|	可回滚依据|
|--|--|--|
|list_moods|	无状态变化|	不需要回滚|
|send_mood|	新增 published 记录|	可用 revoke_mood(id) 撤销|
|revoke_mood|	published -> revoked|	没有 restore 接口，不可回滚|

方法论是：
回滚能力必须来自 APP 已存在的公开能力，不能靠“理论上能改数据库”来算可逆。

五、把识别结果转成 Agent 可理解的工具
最后才设计 MCP tool：
|识别结果|	MCP 设计|
|--|--|
|读取是安全操作|	readOnlyHint: true|
|发送可补偿回滚|	返回 rollback 参数|
|撤销不可逆|	destructiveHint: true|
|登录注册不是业务目标|	放进 MCP server 内部|
|client 有结构化情绪字段|	tool 入参用 category/tag/description/occurred_at|

方法论是：
MCP server 不是 API 转发器，而是“意图翻译层”：把 Agent 的业务意图翻译成 APP 能执行的操作，同时暴露安全边界。

## 总结
（1）识别用户最终想让谁做事：这里是 client Agent
（2）识别 Agent 要操作哪个远程系统：这里是 情绪管理 APP
（3）从 client 中剥离出真正依赖远程 APP 的业务能力
（4）排除认证、UI、统计、报告等支撑或派生能力
（5）对每个 APP 能力判断状态变化
（6）根据 APP 已有能力判断是否可回滚
（7）把能力设计成业务语义 MCP tool
（8）把可逆性、安全性、破坏性写进 tool 描述和 annotations

这次的意图识别方法是：从“用户要 Agent 完成什么业务”出发，穿过 Businessclient 页面功能，定位到底层 APP 的状态改变能力，再按可逆性把它们封装成 Agent 安全可用的 MCP tools