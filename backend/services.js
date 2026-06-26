const { config } = require('./config');
const { escapeSqlValue, initializeSchema, queryArrayJson, queryFirstJson, runSql } = require('./db');
const { createSessionToken, hashPassword, sha256, verifyPassword } = require('./security');

function toPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: Number(user.id),
    account: user.account,
    nickname: user.nickname,
    role: user.role,
    createdAt: user.createdAt,
  };
}

async function findUserByAccount(account) {
  const sql = `
    SELECT JSON_OBJECT(
      'id', id,
      'account', account,
      'nickname', nickname,
      'role', role,
      'passwordHash', password_hash,
      'createdAt', DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
    )
    FROM users
    WHERE account = ${escapeSqlValue(account)} AND is_active = 1
    LIMIT 1;
  `;

  return queryFirstJson(sql);
}

async function findUserById(userId) {
  const sql = `
    SELECT JSON_OBJECT(
      'id', id,
      'account', account,
      'nickname', nickname,
      'role', role,
      'createdAt', DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
    )
    FROM users
    WHERE id = ${escapeSqlValue(userId)} AND is_active = 1
    LIMIT 1;
  `;

  return queryFirstJson(sql);
}

async function listUsers() {
  const sql = `
    SELECT COALESCE(
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', id,
          'account', account,
          'nickname', nickname,
          'role', role,
          'createdAt', createdAt
        )
      ),
      JSON_ARRAY()
    )
    FROM (
      SELECT
        id,
        account,
        nickname,
        role,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
      FROM users
      WHERE is_active = 1
      ORDER BY created_at DESC, id DESC
    ) AS active_users;
  `;

  const users = await queryArrayJson(sql);
  return users.map(toPublicUser);
}

async function createUser(input) {
  const passwordHash = await hashPassword(input.password);
  const role = input.role === 'admin' ? 'admin' : 'user';

  await runSql(`
    INSERT INTO users (account, password_hash, nickname, role)
    VALUES (
      ${escapeSqlValue(input.account)},
      ${escapeSqlValue(passwordHash)},
      ${escapeSqlValue(input.nickname)},
      ${escapeSqlValue(role)}
    );
  `);

  const createdUser = await findUserByAccount(input.account);
  return toPublicUser(createdUser);
}

async function deactivateUser(userId) {
  const sql = `
    UPDATE users
    SET is_active = 0, updated_at = UTC_TIMESTAMP()
    WHERE id = ${escapeSqlValue(userId)} AND is_active = 1;

    SELECT JSON_OBJECT('affectedRows', ROW_COUNT());
  `;

  return queryFirstJson(sql);
}

async function verifyUserCredentials(account, password) {
  const user = await findUserByAccount(account);
  if (!user) {
    return null;
  }

  const matched = await verifyPassword(password, user.passwordHash);
  if (!matched) {
    return null;
  }

  return toPublicUser(user);
}

async function createSession(userId) {
  const token = createSessionToken();
  const tokenHash = sha256(token);

  await runSql(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (
      ${escapeSqlValue(userId)},
      ${escapeSqlValue(tokenHash)},
      DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${escapeSqlValue(config.auth.sessionDays)} DAY)
    );
  `);

  return token;
}

async function getSessionUser(token) {
  if (!token) {
    return null;
  }

  const tokenHash = sha256(token);
  const sql = `
    SELECT JSON_OBJECT(
      'sessionId', s.id,
      'user', JSON_OBJECT(
        'id', u.id,
        'account', u.account,
        'nickname', u.nickname,
        'role', u.role,
        'createdAt', DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s')
      )
    )
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${escapeSqlValue(tokenHash)}
      AND s.revoked_at IS NULL
      AND s.expires_at > UTC_TIMESTAMP()
      AND u.is_active = 1
    LIMIT 1;
  `;

  return queryFirstJson(sql);
}

async function revokeSession(token) {
  if (!token) {
    return;
  }

  const tokenHash = sha256(token);
  await runSql(`
    UPDATE sessions
    SET revoked_at = UTC_TIMESTAMP()
    WHERE token_hash = ${escapeSqlValue(tokenHash)} AND revoked_at IS NULL;
  `);
}

async function revokeSessionsByUserId(userId) {
  await runSql(`
    UPDATE sessions
    SET revoked_at = UTC_TIMESTAMP()
    WHERE user_id = ${escapeSqlValue(userId)} AND revoked_at IS NULL;
  `);
}

async function listPublishedMoods() {
  const sql = `
    SELECT COALESCE(
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', moodId,
          'moodType', moodType,
          'content', content,
          'status', status,
          'publishedAt', publishedAt,
          'author', JSON_OBJECT(
            'id', userId,
            'account', account,
            'nickname', nickname
          )
        )
      ),
      JSON_ARRAY()
    )
    FROM (
      SELECT
        m.id AS moodId,
        m.mood_type AS moodType,
        m.content AS content,
        m.status AS status,
        DATE_FORMAT(m.published_at, '%Y-%m-%d %H:%i:%s') AS publishedAt,
        u.id AS userId,
        u.account AS account,
        u.nickname AS nickname
      FROM moods m
      JOIN users u ON u.id = m.user_id
      WHERE m.status = 'published' AND u.is_active = 1
      ORDER BY m.published_at DESC, m.id DESC
      LIMIT 100
    ) AS mood_rows;
  `;

  return queryArrayJson(sql);
}

async function createMood(input) {
  const result = await queryFirstJson(`
    INSERT INTO moods (user_id, mood_type, content)
    VALUES (
      ${escapeSqlValue(input.userId)},
      ${escapeSqlValue(input.moodType)},
      ${escapeSqlValue(input.content)}
    );

    SELECT JSON_OBJECT('id', LAST_INSERT_ID());
  `);

  const sql = `
    SELECT JSON_OBJECT(
      'id', m.id,
      'moodType', m.mood_type,
      'content', m.content,
      'status', m.status,
      'publishedAt', DATE_FORMAT(m.published_at, '%Y-%m-%d %H:%i:%s'),
      'author', JSON_OBJECT(
        'id', u.id,
        'account', u.account,
        'nickname', u.nickname
      )
    )
    FROM moods m
    JOIN users u ON u.id = m.user_id
    WHERE m.id = ${escapeSqlValue(result.id)}
    LIMIT 1;
  `;

  return queryFirstJson(sql);
}

async function revokeMood(moodId, userId) {
  return queryFirstJson(`
    UPDATE moods
    SET status = 'revoked', revoked_at = UTC_TIMESTAMP()
    WHERE id = ${escapeSqlValue(moodId)}
      AND user_id = ${escapeSqlValue(userId)}
      AND status = 'published';

    SELECT JSON_OBJECT('affectedRows', ROW_COUNT());
  `);
}

async function ensureDefaultAdmin() {
  const existing = await findUserByAccount(config.bootstrap.adminAccount);
  if (existing) {
    return toPublicUser(existing);
  }

  const created = await createUser({
    account: config.bootstrap.adminAccount,
    password: config.bootstrap.adminPassword,
    nickname: config.bootstrap.adminNickname,
    role: 'admin',
  });

  return toPublicUser(created);
}

async function initializeApplication() {
  await initializeSchema();
  return ensureDefaultAdmin();
}

module.exports = {
  createMood,
  createSession,
  createUser,
  deactivateUser,
  ensureDefaultAdmin,
  findUserByAccount,
  findUserById,
  getSessionUser,
  initializeApplication,
  listPublishedMoods,
  listUsers,
  revokeMood,
  revokeSession,
  revokeSessionsByUserId,
  toPublicUser,
  verifyUserCredentials,
};
