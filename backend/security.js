const crypto = require('crypto');
const { config } = require('./config');

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, expectedHex] = parts;
  const derivedKey = await scryptAsync(password, salt);
  const expected = Buffer.from(expectedHex, 'hex');

  if (expected.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, derivedKey);
}

function createSessionToken() {
  return crypto.randomBytes(config.auth.sessionTokenBytes).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = {
  createSessionToken,
  hashPassword,
  sha256,
  verifyPassword,
};

