const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const rootDir = path.resolve(__dirname, '..');
const fileEnv = parseEnvFile(path.join(rootDir, '.env'));
const env = { ...fileEnv, ...process.env };

const config = {
  rootDir,
  frontendDir: path.join(rootDir, 'frontend'),
  clientDir: path.join(rootDir, 'biz_client'),
  sqlDir: path.join(rootDir, 'sql'),
  app: {
    port: Number(env.APP_PORT || 9090),
    sessionCookieName: env.SESSION_COOKIE_NAME || 'mood_tracker_session',
  },
  db: {
    mode: env.DB_MODE || 'tcp',
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '123456',
    database: env.DB_NAME || 'mood_tracker_app',
    containerId:
      env.DB_CONTAINER_ID ||
      'd59ce521836d0a9edfc4af5e5c07f8b4ec63e5d9f55de77cb98ab8341d67be4b',
    mysqlBinary: env.MYSQL_BIN || 'mysql',
    dockerBinary: env.DOCKER_BIN || 'docker',
    connectRetries: Math.max(Number(env.DB_CONNECT_RETRIES || 10), 1),
    connectRetryDelayMs: Math.max(Number(env.DB_CONNECT_RETRY_DELAY_MS || 1000), 100),
  },
  auth: {
    sessionDays: Number(env.SESSION_DAYS || 7),
    sessionTokenBytes: Number(env.SESSION_TOKEN_BYTES || 32),
  },
  bootstrap: {
    adminAccount: env.ADMIN_ACCOUNT || 'admin',
    adminPassword: env.ADMIN_PASSWORD || 'Admin123!@#',
    adminNickname: env.ADMIN_NICKNAME || '系统管理员',
  },
};

module.exports = {
  config,
};
