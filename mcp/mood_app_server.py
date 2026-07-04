#!/usr/bin/env python3
import datetime as dt
import json
import os
import re
import sys
import traceback
import urllib.error
import urllib.request


CLIENT_MARKER = "MTC1"
DEFAULT_BASE_URL = "http://localhost:9090"

CATEGORIES = {
    "positive": {"label": "正向", "score": 1, "fallback_tag": "开心"},
    "neutral": {"label": "中性", "score": 0, "fallback_tag": "平静"},
    "negative": {"label": "负向", "score": -1, "fallback_tag": "焦虑"},
}

SERVER_INFO = {
    "name": "mood-tracker-app-mcp",
    "version": "1.0.0",
}


class AppError(Exception):
    def __init__(self, message, status_code=None):
      super().__init__(message)
      self.status_code = status_code


def now_local_minute():
    return dt.datetime.now().strftime("%Y-%m-%dT%H:%M")


def sanitize_tag(value):
    tag = str(value or "").strip()
    tag = re.sub(r"[\|\[\]]", " ", tag)
    tag = re.sub(r"\s+", " ", tag)
    return tag[:16]


def parse_json(text):
    if not text:
        return {}
    return json.loads(text)


def category_label(category):
    return CATEGORIES.get(category, CATEGORIES["neutral"])["label"]


def infer_category(mood_type):
    text = str(mood_type or "")
    if "正向" in text or "开心" in text or "庆祝" in text:
        return "positive"
    if "负向" in text or "难过" in text or "烦躁" in text or "焦虑" in text:
        return "negative"
    return "neutral"


def infer_tag(mood_type, category):
    text = re.sub(r"[😊😌😢😤🤔🥳]", "", str(mood_type or "")).strip()
    for label in ("正向", "中性", "负向", "·"):
        text = text.replace(label, " ")
    text = re.sub(r"\s+", " ", text).strip()
    return sanitize_tag(text) or CATEGORIES[category]["fallback_tag"]


def build_content(category, tag, description, occurred_at):
    marker = f"[{CLIENT_MARKER}|{category}|{tag}|{occurred_at}]"
    content = f"{description.strip()}\n\n{marker}".strip()
    if len(content) > 300:
        raise AppError("心情描述过长：描述和结构化同步信息合计不能超过 300 个字符。")
    return content


def parse_mood(mood):
    content = str(mood.get("content") or "")
    mood_type = str(mood.get("moodType") or "")
    fallback_category = infer_category(mood_type)
    match = re.search(r"\n{0,2}\[MTC1\|([^|]+)\|([^|]*)\|([^\]]+)\]\s*$", content)

    if match:
        category = match.group(1) if match.group(1) in CATEGORIES else fallback_category
        tag = sanitize_tag(match.group(2)) or infer_tag(mood_type, category)
        description = content[: match.start()].strip()
        occurred_at = match.group(3) or mood.get("publishedAt")
        is_client_record = True
    else:
        category = fallback_category
        tag = infer_tag(mood_type, category)
        description = content
        occurred_at = mood.get("publishedAt")
        is_client_record = False

    return {
        "id": int(mood.get("id")),
        "category": category,
        "categoryLabel": category_label(category),
        "tag": tag,
        "description": description,
        "occurredAt": occurred_at,
        "publishedAt": mood.get("publishedAt"),
        "status": mood.get("status"),
        "author": mood.get("author"),
        "isClientRecord": is_client_record,
        "raw": mood,
    }


class MoodAppClient:
    def __init__(self):
        self.base_url = os.environ.get("MOOD_APP_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
        self.account = os.environ.get("MOOD_APP_ACCOUNT", "").strip()
        self.password = os.environ.get("MOOD_APP_PASSWORD", "")
        self.cookies = {}
        self.current_user = None
        self._load_cookie_from_env()

    def _load_cookie_from_env(self):
        raw_cookie = os.environ.get("MOOD_APP_SESSION_COOKIE", "").strip()
        if not raw_cookie:
            return
        for part in raw_cookie.split(";"):
            if "=" not in part:
                continue
            name, value = part.strip().split("=", 1)
            if name and value:
                self.cookies[name] = value

    def _cookie_header(self):
        return "; ".join(f"{name}={value}" for name, value in self.cookies.items())

    def _store_cookies(self, headers):
        set_cookies = headers.get_all("Set-Cookie") or []
        for item in set_cookies:
            first = item.split(";", 1)[0]
            if "=" not in first:
                continue
            name, value = first.split("=", 1)
            if value:
                self.cookies[name] = value
            else:
                self.cookies.pop(name, None)

    def request(self, path, method="GET", body=None, retry_auth=True):
        url = f"{self.base_url}{path}"
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        cookies = self._cookie_header()
        if cookies:
            headers["Cookie"] = cookies

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                self._store_cookies(response.headers)
                text = response.read().decode("utf-8")
                return parse_json(text)
        except urllib.error.HTTPError as error:
            text = error.read().decode("utf-8", errors="replace")
            payload = parse_json(text) if text else {}
            message = payload.get("message") or f"远程 APP 返回 HTTP {error.code}"
            if error.code == 401 and retry_auth:
                self.login(force=True)
                return self.request(path, method=method, body=body, retry_auth=False)
            raise AppError(message, error.code)
        except urllib.error.URLError as error:
            raise AppError(f"无法连接情绪管理 APP：{error.reason}") from error

    def login(self, force=False):
        if self.current_user and not force:
            return self.current_user

        if self.cookies and not force:
            try:
                data = self.request("/api/auth/me", retry_auth=False)
                self.current_user = data.get("user")
                return self.current_user
            except AppError:
                self.current_user = None

        if not self.account or not self.password:
            raise AppError(
                "MCP server 未配置登录凭据。请设置 MOOD_APP_ACCOUNT 和 MOOD_APP_PASSWORD，"
                "或设置 MOOD_APP_SESSION_COOKIE。"
            )

        data = self.request(
            "/api/auth/login",
            method="POST",
            body={"account": self.account, "password": self.password},
            retry_auth=False,
        )
        self.current_user = data.get("user")
        return self.current_user

    def list_moods(self, arguments):
        user = self.login()
        try:
            data = self.request("/api/client/moods")
            moods = data.get("moods") or []
        except AppError as error:
            if error.status_code != 404:
                raise
            data = self.request("/api/moods")
            user_id = int(user["id"])
            moods = [
                mood for mood in (data.get("moods") or [])
                if mood.get("author") and int(mood["author"].get("id")) == user_id
            ]

        records = [parse_mood(mood) for mood in moods]
        records = self._filter_records(records, arguments or {})
        limit = int((arguments or {}).get("limit") or len(records) or 0)
        if limit > 0:
            records = records[:limit]

        return {
            "records": records,
            "count": len(records),
            "baseUrl": self.base_url,
            "operation": {
                "name": "list_moods",
                "reversible": True,
                "reason": "只读操作，不改变远程 APP 数据。",
            },
        }

    def _filter_records(self, records, arguments):
        category = arguments.get("category")
        tag = sanitize_tag(arguments.get("tag"))
        start_date = arguments.get("start_date")
        end_date = arguments.get("end_date")

        def in_range(record):
            occurred_at = str(record.get("occurredAt") or "")
            if category and record.get("category") != category:
                return False
            if tag and record.get("tag") != tag:
                return False
            if start_date and occurred_at < start_date:
                return False
            if end_date and occurred_at > end_date:
                return False
            return True

        return [record for record in records if in_range(record)]

    def send_mood(self, arguments):
        self.login()
        category = arguments.get("category")
        if category not in CATEGORIES:
            raise AppError("category 必须是 positive、neutral 或 negative。")

        tag = sanitize_tag(arguments.get("tag"))
        description = str(arguments.get("description") or "").strip()
        occurred_at = str(arguments.get("occurred_at") or now_local_minute()).strip()

        if not tag:
            raise AppError("tag 不能为空。")
        if not description:
            raise AppError("description 不能为空。")

        mood_type = f"{category_label(category)} · {tag}"[:32]
        content = build_content(category, tag, description, occurred_at)
        data = self.request(
            "/api/moods",
            method="POST",
            body={"moodType": mood_type, "content": content},
        )
        record = parse_mood(data["mood"])
        return {
            "record": record,
            "rollback": {
                "tool": "revoke_mood",
                "arguments": {"mood_id": record["id"]},
            },
            "operation": {
                "name": "send_mood",
                "reversible": True,
                "reason": "创建成功后可用 revoke_mood 撤销新记录。",
            },
        }

    def revoke_mood(self, arguments):
        self.login()
        mood_id = arguments.get("mood_id")
        if mood_id is None:
            raise AppError("mood_id 不能为空。")
        try:
            mood_id = int(mood_id)
        except (TypeError, ValueError) as error:
            raise AppError("mood_id 必须是数字。") from error

        data = self.request(f"/api/moods/{mood_id}", method="DELETE")
        return {
            "moodId": mood_id,
            "message": data.get("message", "心情已撤销。"),
            "operation": {
                "name": "revoke_mood",
                "reversible": False,
                "reason": "远程 APP 没有恢复已撤销心情记录的能力。",
            },
        }


TOOLS = [
    {
        "name": "list_moods",
        "description": "读取当前登录用户的心情记录。可逆性：可以；这是只读操作，不改变远程情绪管理 APP 数据。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["positive", "neutral", "negative"],
                    "description": "可选。按情绪类型过滤。",
                },
                "tag": {
                    "type": "string",
                    "description": "可选。按情绪标签过滤。",
                },
                "start_date": {
                    "type": "string",
                    "description": "可选。按发生时间下限过滤，例如 2026-06-01 或 2026-06-01T00:00。",
                },
                "end_date": {
                    "type": "string",
                    "description": "可选。按发生时间上限过滤，例如 2026-06-30 或 2026-06-30T23:59。",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5000,
                    "description": "可选。最多返回多少条记录。",
                },
            },
            "additionalProperties": False,
        },
        "annotations": {
            "title": "读取心情记录",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    },
    {
        "name": "send_mood",
        "description": "向远程情绪管理 APP 发送一条心情记录。可逆性：可以；返回的 rollback 可用于撤销本次新记录。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["positive", "neutral", "negative"],
                    "description": "情绪类型：positive 正向，neutral 中性，negative 负向。",
                },
                "tag": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 16,
                    "description": "情绪标签，例如 开心、焦虑、疲惫。",
                },
                "description": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 220,
                    "description": "情绪描述。",
                },
                "occurred_at": {
                    "type": "string",
                    "description": "可选。发生时间，例如 2026-06-29T14:30；不传则使用当前本地时间。",
                },
            },
            "required": ["category", "tag", "description"],
            "additionalProperties": False,
        },
        "annotations": {
            "title": "发送心情",
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": False,
            "openWorldHint": True,
        },
    },
    {
        "name": "revoke_mood",
        "description": "按心情记录 ID 撤销远程情绪管理 APP 中的一条记录。可逆性：不可以；APP 没有恢复已撤销记录的接口。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "mood_id": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "要撤销的心情记录 ID。",
                },
            },
            "required": ["mood_id"],
            "additionalProperties": False,
        },
        "annotations": {
            "title": "撤销心情",
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": False,
            "openWorldHint": True,
        },
    },
]


class JsonRpcServer:
    def __init__(self):
        self.client = MoodAppClient()

    def handle(self, message):
        method = message.get("method")
        msg_id = message.get("id")
        params = message.get("params") or {}

        try:
            if method == "initialize":
                requested_version = params.get("protocolVersion") or "2024-11-05"
                return self.response(msg_id, {
                    "protocolVersion": requested_version,
                    "capabilities": {"tools": {}},
                    "serverInfo": SERVER_INFO,
                })
            if method == "tools/list":
                return self.response(msg_id, {"tools": TOOLS})
            if method == "tools/call":
                return self.response(msg_id, self.call_tool(params))
            if method == "ping":
                return self.response(msg_id, {})
            if method and method.startswith("notifications/"):
                return None
            return self.error(msg_id, -32601, f"未知 MCP 方法：{method}")
        except AppError as error:
            return self.response(msg_id, {
                "content": [{"type": "text", "text": str(error)}],
                "isError": True,
            })
        except Exception as error:
            if os.environ.get("MOOD_MCP_DEBUG") == "1":
                traceback.print_exc(file=sys.stderr)
            return self.error(msg_id, -32603, f"工具执行失败：{error}")

    def call_tool(self, params):
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if name == "list_moods":
            result = self.client.list_moods(arguments)
        elif name == "send_mood":
            result = self.client.send_mood(arguments)
        elif name == "revoke_mood":
            result = self.client.revoke_mood(arguments)
        else:
            raise AppError(f"未知 tool：{name}")

        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(result, ensure_ascii=False, indent=2),
                }
            ],
            "structuredContent": result,
            "isError": False,
        }

    @staticmethod
    def response(msg_id, result):
        if msg_id is None:
            return None
        return {"jsonrpc": "2.0", "id": msg_id, "result": result}

    @staticmethod
    def error(msg_id, code, message):
        if msg_id is None:
            return None
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": code, "message": message},
        }


def read_message(stdin):
    first_line = stdin.readline()
    if not first_line:
        return None

    if first_line.lstrip().startswith(b"{"):
        return json.loads(first_line.decode("utf-8"))

    headers = {}
    line = first_line
    while line and line.strip():
        text = line.decode("ascii", errors="replace")
        if ":" in text:
            key, value = text.split(":", 1)
            headers[key.strip().lower()] = value.strip()
        line = stdin.readline()

    length = int(headers.get("content-length", "0"))
    if length <= 0:
        return None
    body = stdin.read(length)
    return json.loads(body.decode("utf-8"))


def write_message(stdout, message):
    if message is None:
        return
    body = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    stdout.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii"))
    stdout.write(body)
    stdout.flush()


def main():
    server = JsonRpcServer()
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    while True:
        message = read_message(stdin)
        if message is None:
            break
        response = server.handle(message)
        write_message(stdout, response)


if __name__ == "__main__":
    main()
