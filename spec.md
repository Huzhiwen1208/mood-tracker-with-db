service: mood-app-for-biz-client
principal: authenticated_user
assumption:
  - MCP server 启动时已经持有可用登录态，或可用固定账号自动登录
  - MCP tool 仅暴露“心情记录域”操作，不暴露注册/登录

domain_object:
  mood_record:
    persisted_fields:
      - id
      - user_id
      - mood_type
      - content
      - status
      - published_at
      - revoked_at
    derived_fields:
      - category
      - tag
      - description
      - occurred_at
      - is_client_record

encoding_rule:
  - 写入时：
    mood_type = "{category_label} · {tag}"
    content = "{description}\n\n[MTC1|{category}|{tag}|{occurred_at}]"
  - 读取时：
    从 content 末尾的 [MTC1|...] 还原 category/tag/occurred_at
    若无标记，则退化为普通 mood 记录

operations:
  list_mood:
    purpose: 读取当前登录用户的已发布心情记录
    backend_mapping:
      preferred: GET /api/client/moods
      fallback: GET /api/moods + filter(author.id == current_user.id)
    input:
      - category? : positive | neutral | negative
      - tag? : string
      - start_date? : datetime/string
      - end_date? : datetime/string
      - limit? : integer
    output:
      - records[] : structured mood records
      - count : integer
    state_effect: none
    reversible: true
    rollback: none

  send_mood:
    purpose: 创建一条新的心情记录
    backend_mapping:
      - POST /api/moods
    input:
      - category : positive | neutral | negative
      - tag : string
      - description : string
      - occurred_at? : datetime/string
    output:
      - record : created structured mood record
      - rollback:
          tool: revoke_mood
          arguments:
            mood_id: created_record.id
    precondition:
      - authenticated_user exists
      - tag 非空
      - description 非空
      - encoded content 长度 <= 300
    state_effect:
      - mood_record: Absent -> Published
    reversible: true
    rollback:
      - compensation by revoke_mood(created_id)

  revoke_mood:
    purpose: 撤销当前用户的一条已发布心情记录
    backend_mapping:
      - DELETE /api/moods/{id}
    input:
      - mood_id : integer
    output:
      - mood_id
      - message
    precondition:
      - authenticated_user owns mood_id
      - target status == published
    state_effect:
      - mood_record: Published -> Revoked
    reversible: false
    rollback: none