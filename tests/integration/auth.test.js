import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from '../support/env.js';

useTestDatabase('auth');

const { migrate, insert, get, run } = await import('../../src/core/db.js');
const auth = await import('../../src/core/auth.js');

migrate({ silent: true });

function criarAdmin(username = 'kauan', senha = 'Tr0vao-Rubro!2026') {
  return insert('admin_users', {
    username, password_hash: auth.hashPassword(senha), password_algo: 'scrypt', role: 'admin', is_active: 1,
  });
}

test('senha é guardada como hash, nunca em texto puro', () => {
  const id = criarAdmin('hash-user');
  const row = get('SELECT * FROM admin_users WHERE id = ?', [id]);
  assert.ok(!row.password_hash.includes('Tr0vao'));
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(auth.verifyPassword('Tr0vao-Rubro!2026', row.password_hash));
  assert.ok(!auth.verifyPassword('outra-senha', row.password_hash));
});

test('política de senha forte', () => {
  assert.equal(auth.checkPasswordStrength('senha123').ok, false);
  assert.equal(auth.checkPasswordStrength('Mangaloop2026!').ok, false, 'deve recusar palavra óbvia');
  assert.equal(auth.checkPasswordStrength('Tr0vao-Rubro!2026').ok, true);
});

test('autenticação aceita a senha certa e recusa a errada', () => {
  criarAdmin('login-user');
  assert.equal(auth.authenticate('login-user', 'Tr0vao-Rubro!2026').ok, true);
  assert.equal(auth.authenticate('login-user', 'errada').ok, false);
  assert.equal(auth.authenticate('inexistente', 'qualquer').ok, false);
});

test('bloqueia a conta após tentativas repetidas', () => {
  criarAdmin('lock-user');
  let ultimo;
  for (let i = 0; i < 8; i++) ultimo = auth.authenticate('lock-user', 'errada');
  assert.equal(ultimo.reason, 'LOCKED');
  // Mesmo com a senha certa, segue bloqueada durante a janela.
  assert.equal(auth.authenticate('lock-user', 'Tr0vao-Rubro!2026').ok, false);
});

test('sessão é criada, lida e destruída; o token não é guardado em claro', () => {
  const id = criarAdmin('sessao-user');
  const { token } = auth.createSession(id, { userAgent: 'teste' });
  const found = auth.readSession(token);
  assert.equal(found.user.id, id);
  assert.equal(get('SELECT COUNT(*) AS n FROM sessions WHERE id = ?', [token]).n, 0, 'o token cru não pode ser a chave');
  auth.destroySession(token);
  assert.equal(auth.readSession(token), null);
});

test('sessão expirada não autentica', () => {
  const id = criarAdmin('exp-user');
  const { token } = auth.createSession(id);
  run('UPDATE sessions SET expires_at = ? WHERE admin_user_id = ?', [new Date(Date.now() - 1000).toISOString(), id]);
  assert.equal(auth.readSession(token), null);
});

test('CSRF só valida o token da própria sessão', () => {
  const a = criarAdmin('csrf-a');
  const b = criarAdmin('csrf-b');
  auth.createSession(a);
  auth.createSession(b);
  const sa = get('SELECT * FROM sessions WHERE admin_user_id = ?', [a]);
  const sb = get('SELECT * FROM sessions WHERE admin_user_id = ?', [b]);
  const tokenA = auth.csrfToken(sa);
  assert.equal(auth.verifyCsrf(sa, tokenA), true);
  assert.equal(auth.verifyCsrf(sb, tokenA), false);
  assert.equal(auth.verifyCsrf(sa, 'falso'), false);
  assert.equal(auth.verifyCsrf(null, tokenA), false);
});

test('rate limit fecha a janela e depois libera', () => {
  const bucket = 'teste-rl';
  for (let i = 0; i < 3; i++) {
    assert.equal(auth.rateLimit(bucket, '1.2.3.4', { limit: 3, windowMs: 60000 }).allowed, true);
  }
  const bloqueado = auth.rateLimit(bucket, '1.2.3.4', { limit: 3, windowMs: 60000 });
  assert.equal(bloqueado.allowed, false);
  assert.ok(bloqueado.retryAfterSec > 0);
  auth.clearRateLimit(bucket, '1.2.3.4');
  assert.equal(auth.rateLimit(bucket, '1.2.3.4', { limit: 3, windowMs: 60000 }).allowed, true);
});
