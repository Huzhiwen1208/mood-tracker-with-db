const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { config } = require('./config');
const {
  createMood,
  createSession,
  createUser,
  deactivateUser,
  findUserByAccount,
  getSessionUser,
  initializeApplication,
  listPublishedMoods,
  listUsers,
  revokeMood,
  revokeSession,
  revokeSessionsByUserId,
  verifyUserCredentials,
} = require('./services');

const MAX_BODY_SIZE = 1024 * 1024;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
  });
  res.end();
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }

  return header.split(';').reduce((acc, item) => {
    const index = item.indexOf('=');
    if (index === -1) {
      return acc;
    }

    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', [cookie]);
    return;
  }

  res.setHeader('Set-Cookie', Array.isArray(current) ? [...current, cookie] : [current, cookie]);
}

function createCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path || '/'}`);
  segments.push(`SameSite=${options.sameSite || 'Lax'}`);

  if (options.httpOnly !== false) {
    segments.push('HttpOnly');
  }

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  return segments.join('; ');
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error('请求 JSON 格式无效'));
      }
    });

    req.on('error', reject);
  });
}

function isValidAccount(account) {
  return /^[a-zA-Z0-9_.-]{3,24}$/.test(account);
}

function validateUserPayload(body, options = {}) {
  const errors = [];
  const account = String(body.account || '').trim();
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim();
  const role = body.role === 'admin' ? 'admin' : 'user';

  if (!isValidAccount(account)) {
    errors.push('账号需为 3 到 24 位，可包含字母、数字、点、下划线和中划线。');
  }

  if (password.length < 8 || password.length > 72) {
    errors.push('密码长度需在 8 到 72 位之间。');
  }

  if (nickname.length < 2 || nickname.length > 20) {
    errors.push('昵称长度需在 2 到 20 个字符之间。');
  }

  if (!options.allowRole && body.role) {
    errors.push('当前接口不允许自定义角色。');
  }

  return {
    account,
    nickname,
    password,
    role,
    errors,
  };
}

function validateMoodPayload(body) {
  const errors = [];
  const moodType = String(body.moodType || '').trim();
  const content = String(body.content || '').trim();

  if (!moodType || moodType.length > 32) {
    errors.push('请选择合法的心情类型。');
  }

  if (!content || content.length > 300) {
    errors.push('心情内容不能为空，且不能超过 300 个字符。');
  }

  return {
    moodType,
    content,
    errors,
  };
}

async function getRequestUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[config.app.sessionCookieName];
  if (!token) {
    return null;
  }

  const session = await getSessionUser(token);
  if (!session) {
    return null;
  }

  return {
    token,
    user: session.user,
  };
}

function requireAuth(context) {
  if (!context || !context.user) {
    const error = new Error('请先登录后再继续操作。');
    error.statusCode = 401;
    throw error;
  }
}

function requireAdmin(context) {
  requireAuth(context);
  if (context.user.role !== 'admin') {
    const error = new Error('仅管理员可执行该操作。');
    error.statusCode = 403;
    throw error;
  }
}

async function serveStatic(req, res, pathname, rootDir = config.frontendDir) {
  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const staticRoot = path.resolve(rootDir);
  const candidatePath = path.normalize(path.join(staticRoot, relativePath));

  if (candidatePath !== staticRoot && !candidatePath.startsWith(`${staticRoot}${path.sep}`)) {
    sendJson(res, 403, { message: '禁止访问该资源。' });
    return;
  }

  let filePath = candidatePath;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (error) {
    if (!path.extname(filePath)) {
      filePath = path.join(staticRoot, 'index.html');
    }
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': content.length,
    });
    res.end(content);
  } catch (error) {
    sendJson(res, 404, { message: '页面不存在。' });
  }
}

async function handleApi(req, res, pathname) {
  const context = await getRequestUser(req);

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'mood-tracker-db' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    if (!context) {
      sendJson(res, 401, { message: '未登录。' });
      return;
    }
    sendJson(res, 200, { user: context.user });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJsonBody(req);
    const payload = validateUserPayload(body);
    if (payload.errors.length > 0) {
      sendJson(res, 400, { message: payload.errors.join(' ') });
      return;
    }

    const existing = await findUserByAccount(payload.account);
    if (existing) {
      sendJson(res, 409, { message: '该账号已存在，请更换后重试。' });
      return;
    }

    const user = await createUser(payload);
    const sessionToken = await createSession(user.id);
    appendCookie(
      res,
      createCookie(config.app.sessionCookieName, sessionToken, {
        maxAge: config.auth.sessionDays * 24 * 60 * 60,
      }),
    );
    sendJson(res, 201, { message: '注册成功，已自动登录。', user });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJsonBody(req);
    const account = String(body.account || '').trim();
    const password = String(body.password || '');

    if (!account || !password) {
      sendJson(res, 400, { message: '请输入账号和密码。' });
      return;
    }

    const user = await verifyUserCredentials(account, password);
    if (!user) {
      sendJson(res, 401, { message: '账号或密码错误。' });
      return;
    }

    const sessionToken = await createSession(user.id);
    appendCookie(
      res,
      createCookie(config.app.sessionCookieName, sessionToken, {
        maxAge: config.auth.sessionDays * 24 * 60 * 60,
      }),
    );
    sendJson(res, 200, { message: '登录成功。', user });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    if (context) {
      await revokeSession(context.token);
    }

    appendCookie(
      res,
      createCookie(config.app.sessionCookieName, '', {
        maxAge: 0,
      }),
    );
    sendJson(res, 200, { message: '已退出登录。' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/moods') {
    const moods = await listPublishedMoods();
    sendJson(res, 200, { moods });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/client/moods') {
    requireAuth(context);
    const moods = await listPublishedMoods({
      userId: context.user.id,
      limit: 5000,
    });
    sendJson(res, 200, { moods });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/moods') {
    requireAuth(context);
    const body = await readJsonBody(req);
    const payload = validateMoodPayload(body);
    if (payload.errors.length > 0) {
      sendJson(res, 400, { message: payload.errors.join(' ') });
      return;
    }

    const mood = await createMood({
      userId: context.user.id,
      moodType: payload.moodType,
      content: payload.content,
    });
    sendJson(res, 201, { message: '心情已发布。', mood });
    return;
  }

  const moodMatch = pathname.match(/^\/api\/moods\/(\d+)$/);
  if (req.method === 'DELETE' && moodMatch) {
    requireAuth(context);
    const moodId = Number(moodMatch[1]);
    const result = await revokeMood(moodId, context.user.id);
    if (!result || Number(result.affectedRows) === 0) {
      sendJson(res, 404, { message: '未找到可撤销的心情记录。' });
      return;
    }
    sendJson(res, 200, { message: '心情已撤销。' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    requireAdmin(context);
    const users = await listUsers();
    sendJson(res, 200, { users });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/users') {
    requireAdmin(context);
    const body = await readJsonBody(req);
    const payload = validateUserPayload(body, { allowRole: true });
    if (payload.errors.length > 0) {
      sendJson(res, 400, { message: payload.errors.join(' ') });
      return;
    }

    const existing = await findUserByAccount(payload.account);
    if (existing) {
      sendJson(res, 409, { message: '该账号已存在，请更换后重试。' });
      return;
    }

    const user = await createUser(payload);
    sendJson(res, 201, { message: '用户创建成功。', user });
    return;
  }

  const userMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (req.method === 'DELETE' && userMatch) {
    requireAdmin(context);
    const userId = Number(userMatch[1]);

    if (userId === Number(context.user.id)) {
      sendJson(res, 400, { message: '不能删除当前登录的管理员账号。' });
      return;
    }

    const result = await deactivateUser(userId);
    if (!result || Number(result.affectedRows) === 0) {
      sendJson(res, 404, { message: '用户不存在或已被删除。' });
      return;
    }

    await revokeSessionsByUserId(userId);
    sendJson(res, 200, { message: '用户已删除。' });
    return;
  }

  sendJson(res, 404, { message: '接口不存在。' });
}

async function requestHandler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }

    if (pathname === '/client') {
      redirect(res, '/client/');
      return;
    }

    if (pathname.startsWith('/client/')) {
      const clientPath = pathname.slice('/client'.length) || '/';
      await serveStatic(req, res, clientPath, config.clientDir);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      message: statusCode >= 500 ? '服务内部错误，请稍后重试。' : error.message,
    });
  }
}

async function start() {
  await initializeApplication();

  const server = http.createServer(requestHandler);
  server.listen(config.app.port, () => {
    console.log(`Mood Tracker DB 服务已启动: http://localhost:${config.app.port}`);
  });
}

start().catch((error) => {
  console.error('启动失败:', error.message);
  process.exit(1);
});
