'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_FILENAME = 'admin-auth.json';
const SESSION_SECRET_FILENAME = 'session-secret';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getEnvPassword() {
  const value = process.env.ADMIN_PASSWORD;
  return value ? String(value) : '';
}

function loadSessionSecret(dataDir) {
  const fromEnv = process.env.SESSION_SECRET && String(process.env.SESSION_SECRET).trim();
  if (fromEnv) return fromEnv;
  ensureDir(dataDir);
  const file = path.join(dataDir, SESSION_SECRET_FILENAME);
  try {
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing) return existing;
    }
  } catch (err) {
    console.error('讀取 session secret 失敗：', err.message);
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret + '\n', { encoding: 'utf8', mode: 0o600 });
  return secret;
}

function isCookieSecure() {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1';
}

function authFilePath(dataDir) {
  return path.join(dataDir, AUTH_FILENAME);
}

function readAuthRecord(dataDir) {
  const file = authFilePath(dataDir);
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || parsed.algo !== 'scrypt' || !parsed.salt || !parsed.hash) return null;
    return parsed;
  } catch (err) {
    console.error('讀取後台密碼檔失敗：', err.message);
    return null;
  }
}

function writeAuthRecord(dataDir, record) {
  ensureDir(dataDir);
  const file = authFilePath(dataDir);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch (_) {}
}

function isConfigured(dataDir) {
  return !!(readAuthRecord(dataDir) || getEnvPassword());
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
  return {
    algo: 'scrypt',
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    keylen: SCRYPT.keylen,
    updatedAt: new Date().toISOString(),
  };
}

function timingSafeEqualBuffer(a, b) {
  if (!Buffer.isBuffer(a)) a = Buffer.from(a);
  if (!Buffer.isBuffer(b)) b = Buffer.from(b);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function timingSafeEqualString(a, b) {
  return timingSafeEqualBuffer(Buffer.from(String(a)), Buffer.from(String(b)));
}

function verifyPasswordHash(password, record) {
  if (!record || record.algo !== 'scrypt') return false;
  const salt = Buffer.from(record.salt, 'hex');
  const expected = Buffer.from(record.hash, 'hex');
  const keylen = Number(record.keylen) || SCRYPT.keylen;
  const actual = crypto.scryptSync(String(password), salt, keylen, {
    N: Number(record.N) || SCRYPT.N,
    r: Number(record.r) || SCRYPT.r,
    p: Number(record.p) || SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqualBuffer(actual, expected);
}

function verifyLogin(dataDir, password) {
  const record = readAuthRecord(dataDir);
  if (record) {
    return verifyPasswordHash(password, record) ? 'ok' : 'invalid';
  }
  const envPassword = getEnvPassword();
  if (envPassword) {
    return timingSafeEqualString(password, envPassword) ? 'ok' : 'invalid';
  }
  return 'needs-setup';
}

function setupPassword(dataDir, password, confirm) {
  if (isConfigured(dataDir)) return { ok: false, status: 409, error: '已經設定咗後台密碼' };
  if (String(password || '').length < 8) {
    return { ok: false, status: 400, error: '密碼最少要 8 個字元' };
  }
  if (String(password) !== String(confirm || '')) {
    return { ok: false, status: 400, error: '兩次輸入嘅密碼唔一致' };
  }
  writeAuthRecord(dataDir, hashPassword(password));
  return { ok: true };
}

module.exports = {
  AUTH_FILENAME,
  SESSION_SECRET_FILENAME,
  getEnvPassword,
  loadSessionSecret,
  isCookieSecure,
  readAuthRecord,
  isConfigured,
  verifyLogin,
  setupPassword,
};
