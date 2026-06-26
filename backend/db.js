const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { config } = require('./config');

function escapeSqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('数值参数非法');
    }
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\u0000/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u001a/g, '\\Z')
    .replace(/'/g, "\\'");

  return `'${escaped}'`;
}

function buildMysqlArgs(sql, database) {
  const baseArgs = [
    '--default-character-set=utf8mb4',
    '--batch',
    '--raw',
    '--skip-column-names',
    '-u',
    config.db.user,
    `-p${config.db.password}`,
  ];

  if (config.db.mode === 'docker-exec') {
    const mysqlArgs = [...baseArgs];
    if (database) {
      mysqlArgs.push('-D', database);
    }
    mysqlArgs.push('-e', `SET time_zone = '+00:00';\n${sql}`);
    return {
      command: config.db.dockerBinary,
      args: ['exec', '-i', config.db.containerId, config.db.mysqlBinary, ...mysqlArgs],
    };
  }

  const mysqlArgs = [
    '--protocol=TCP',
    '-h',
    config.db.host,
    '-P',
    String(config.db.port),
    ...baseArgs,
  ];

  if (database) {
    mysqlArgs.push('-D', database);
  }

  mysqlArgs.push('-e', `SET time_zone = '+00:00';\n${sql}`);

  return {
    command: config.db.mysqlBinary,
    args: mysqlArgs,
  };
}

function runSql(sql, options = {}) {
  const database =
    Object.prototype.hasOwnProperty.call(options, 'database') ? options.database : config.db.database;
  const { command, args } = buildMysqlArgs(sql, database);

  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr || stdout || error.message;
        reject(new Error(`数据库执行失败: ${message.trim()}`));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

function parseLastJson(output) {
  if (!output) {
    return null;
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  return JSON.parse(lines[lines.length - 1]);
}

async function queryFirstJson(sql, options) {
  const output = await runSql(sql, options);
  return parseLastJson(output);
}

async function queryArrayJson(sql, options) {
  const data = await queryFirstJson(sql, options);
  return Array.isArray(data) ? data : [];
}

async function initializeSchema() {
  const rawSql = await fs.readFile(path.join(config.sqlDir, 'init.sql'), 'utf8');
  const sql = rawSql.replace(/mood_tracker_app/g, config.db.database);
  await runSql(sql, { database: null });
}

module.exports = {
  escapeSqlValue,
  initializeSchema,
  queryArrayJson,
  queryFirstJson,
  runSql,
};
