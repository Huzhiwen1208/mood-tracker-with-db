const http = require('http');
const { spawn } = require('child_process');

const baseUrl = new URL(process.env.CLIENT_TEST_BASE_URL || 'http://localhost:9090');
const rootDir = process.cwd();
const cookieJar = new Map();

function updateCookies(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) {
    return;
  }

  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const cookie of cookies) {
    const firstPart = cookie.split(';')[0];
    const equalIndex = firstPart.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }
    const name = firstPart.slice(0, equalIndex);
    const value = firstPart.slice(equalIndex + 1);
    if (value) {
      cookieJar.set(name, value);
    } else {
      cookieJar.delete(name);
    }
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function request(pathname, options = {}) {
  const url = new URL(pathname, baseUrl);
  const body = options.body ? JSON.stringify(options.body) : null;
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const cookies = cookieHeader();
  if (cookies) {
    headers.Cookie = cookies;
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          updateCookies(res.headers);
          const text = Buffer.concat(chunks).toString('utf8');
          const data = text ? JSON.parse(text) : {};
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(data.message || `HTTP ${res.statusCode}`);
            error.statusCode = res.statusCode;
            reject(error);
            return;
          }
          resolve({ data, statusCode: res.statusCode });
        });
      },
    );

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function isServerReady() {
  try {
    const { data } = await request('/api/health');
    return Boolean(data.ok);
  } catch (error) {
    return false;
  }
}

async function waitForServer(processRef) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (await isServerReady()) {
      return;
    }
    if (processRef && processRef.exitCode !== null) {
      throw new Error('服务进程已退出，无法继续测试。');
    }
    await sleep(300);
  }
  throw new Error('等待本地服务启动超时。');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  let serverProcess = null;
  let serverOutput = '';

  if (!(await isServerReady())) {
    serverProcess = spawn(process.execPath, ['backend/server.js'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });
    serverProcess.stderr.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });
    try {
      await waitForServer(serverProcess);
    } catch (error) {
      if (serverOutput) {
        console.error(serverOutput.trim());
      }
      throw error;
    }
  }

  try {
    const suffix = Date.now().toString(36).slice(-8);
    const account = `ct${suffix}`.slice(0, 24);
    const password = 'Client123!@#';
    const nickname = '客户端测试';

    const register = await request('/api/auth/register', {
      method: 'POST',
      body: { account, password, nickname },
    });
    assert(register.statusCode === 201, '注册接口没有返回 201。');
    assert(register.data.user.account === account, '注册返回用户不一致。');

    const me = await request('/api/auth/me');
    assert(me.data.user.account === account, '登录态持久化校验失败。');

    const moodPayload = {
      moodType: '正向 · 开心',
      content: `完成客户端全链路测试\n\n[MTC1|positive|开心|${new Date().toISOString().slice(0, 16)}]`,
    };
    const created = await request('/api/moods', {
      method: 'POST',
      body: moodPayload,
    });
    assert(created.statusCode === 201, '心情提交接口没有返回 201。');
    assert(created.data.mood.id, '心情提交没有返回记录 ID。');

    const listed = await request('/api/client/moods');
    const found = listed.data.moods.some((mood) => Number(mood.id) === Number(created.data.mood.id));
    assert(found, '提交后的心情没有出现在客户端读取接口中。');

    const revoked = await request(`/api/moods/${created.data.mood.id}`, {
      method: 'DELETE',
    });
    assert(revoked.statusCode === 200, '撤销接口没有返回 200。');

    const afterRevoke = await request('/api/client/moods');
    const stillVisible = afterRevoke.data.moods.some(
      (mood) => Number(mood.id) === Number(created.data.mood.id),
    );
    assert(!stillVisible, '撤销后的心情仍出现在客户端读取接口中。');

    await request('/api/auth/logout', { method: 'POST' });
    console.log('客户端全流程测试通过：注册、登录态、提交、读取、撤销均已验证。');
  } catch (error) {
    if (serverOutput) {
      console.error(serverOutput.trim());
    }
    throw error;
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

main().catch((error) => {
  console.error(`客户端全流程测试失败：${error.message}`);
  process.exit(1);
});
