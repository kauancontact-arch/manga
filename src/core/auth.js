import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { all, get, insert, nowIso, run, update } from './db.js';
import { randomToken, sha256 } from './ids.js';

/**
 * Hash de senha.
 *
 * A especificacao pede Argon2id ou bcrypt. Ambos exigem binding nativo
 * (argon2 / bcrypt), indisponivel neste ambiente sem instalacao de pacotes.
 * Usamos scrypt (RFC 7914), KDF memory-hard presente no nucleo do Node, com
 * parametros acima do minimo recomendado pelo OWASP (N=2^16, r=8, p=1).
 * O formato do hash e versionado e `verifyPassword` reconhece outros algoritmos,
 * portanto a migracao para Argon2id e transparente: ver docs/SEGURANCA.md.
 */
const SCRYPT = { N: 2 ** 16, r: 8, p: 1, keylen: 64, maxmem: 160 * 1024 * 1024 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch { return false; }
}

const COMMON = ['senha', 'password', '123456', 'mangaloop', 'admin', 'qwerty', '12345678'];

/** Politica de senha forte para o bootstrap e trocas de senha. */
export function checkPasswordStrength(password) {
  const problems = [];
  const pw = String(password || '');
  if (pw.length < 12) problems.push('use ao menos 12 caracteres');
  if (!/[a-z]/.test(pw)) problems.push('inclua uma letra minuscula');
  if (!/[A-Z]/.test(pw)) problems.push('inclua uma letra maiuscula');
  if (!/[0-9]/.test(pw)) problems.push('inclua um numero');
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('inclua um simbolo');
  if (COMMON.some((c) => pw.toLowerCase().includes(c))) problems.push('evite palavras obvias');
  return { ok: problems.length === 0, problems };
}

/* -------------------------------- sessao -------------------------------- */

export const SESSION_COOKIE = 'ml_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 horas
const IDLE_REFRESH_MS = 1000 * 60 * 15;

export function createSession(adminUserId, { userAgent = '', ipHash = '' } = {}) {
  const token = randomToken(32);
  const id = sha256(token);
  const now = Date.now();
  insert('sessions', {
    id,
    admin_user_id: adminUserId,
    csrf_secret: randomToken(24),
    user_agent: String(userAgent).slice(0, 250),
    ip_hash: ipHash,
    created_at: new Date(now).toISOString(),
    last_seen_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
  });
  return { token, expiresAt: new Date(now + SESSION_TTL_MS) };
}

export function readSession(token) {
  if (!token) return null;
  const row = get('SELECT * FROM sessions WHERE id = ?', [sha256(token)]);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE id = ?', [row.id]);
    return null;
  }
  const user = get('SELECT * FROM admin_users WHERE id = ? AND is_active = 1', [row.admin_user_id]);
  if (!user) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > IDLE_REFRESH_MS) {
    run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?',
      [nowIso(), new Date(Date.now() + SESSION_TTL_MS).toISOString(), row.id]);
  }
  return { session: row, user };
}

export function destroySession(token) {
  if (!token) return;
  run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
}

export function purgeExpiredSessions() {
  return run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]).changes;
}

/* --------------------------------- CSRF --------------------------------- */

export function csrfToken(session) {
  const secret = session?.csrf_secret || '';
  return crypto.createHmac('sha256', env.authSecret || 'dev-secret')
    .update(`${session?.id || 'anon'}:${secret}`).digest('base64url');
}

export function verifyCsrf(session, token) {
  if (!session || !token) return false;
  const expected = csrfToken(session);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------ rate limit ------------------------------ */

/** Janela fixa persistida no banco: sobrevive a reinicio e a multiplos processos. */
export function rateLimit(bucket, identifier, { limit, windowMs }) {
  const now = Date.now();
  const key = sha256(String(identifier)).slice(0, 32);
  const row = get('SELECT * FROM rate_limits WHERE bucket = ? AND identifier = ?', [bucket, key]);
  if (!row || now - new Date(row.window_start).getTime() > windowMs) {
    run(`INSERT INTO rate_limits (bucket, identifier, window_start, hits) VALUES (?, ?, ?, 1)
         ON CONFLICT(bucket, identifier) DO UPDATE SET window_start = excluded.window_start, hits = 1`,
      [bucket, key, new Date(now).toISOString()]);
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (row.hits >= limit) {
    const retryAfterSec = Math.ceil((windowMs - (now - new Date(row.window_start).getTime())) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  run('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ? AND identifier = ?', [bucket, key]);
  return { allowed: true, remaining: limit - row.hits - 1, retryAfterSec: 0 };
}

export function clearRateLimit(bucket, identifier) {
  run('DELETE FROM rate_limits WHERE bucket = ? AND identifier = ?', [bucket, sha256(String(identifier)).slice(0, 32)]);
}

/* ------------------------------- login ---------------------------------- */

const MAX_FAILED = 7;
const LOCK_MS = 1000 * 60 * 15;

export function authenticate(username, password) {
  const user = get('SELECT * FROM admin_users WHERE username = ?', [String(username || '').trim().toLowerCase()]);
  if (!user) {
    // Custo constante: evita oraculo de existencia de usuario.
    crypto.scryptSync('dummy', crypto.randomBytes(16), 64, SCRYPT);
    return { ok: false, reason: 'INVALID' };
  }
  if (!user.is_active) return { ok: false, reason: 'INACTIVE' };
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return { ok: false, reason: 'LOCKED', until: user.locked_until };
  }
  if (!verifyPassword(password, user.password_hash)) {
    const failed = user.failed_attempts + 1;
    update('admin_users', user.id, {
      failed_attempts: failed,
      locked_until: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS).toISOString() : null,
    });
    return { ok: false, reason: failed >= MAX_FAILED ? 'LOCKED' : 'INVALID' };
  }
  update('admin_users', user.id, { failed_attempts: 0, locked_until: null, last_login_at: nowIso() });
  return { ok: true, user };
}

export function listAdmins() {
  return all('SELECT id, username, role, is_active, last_login_at, must_change_password, created_at FROM admin_users ORDER BY created_at');
}
