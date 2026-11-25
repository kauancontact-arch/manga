import { env } from '../config/env.js';
import { audit } from './audit.js';
import { checkPasswordStrength, hashPassword } from './auth.js';
import { get, insert, update } from './db.js';
import { setSetting } from './settings.js';

/**
 * Cria o administrador inicial e aplica preferências vindas do ambiente.
 * Idempotente: roda em todo boot e só age quando falta algo.
 */
export function bootstrapAdmin({ silent = false } = {}) {
  const username = (env.admin.username || 'kauan').trim().toLowerCase();
  const password = env.admin.initialPassword;
  const existing = get('SELECT * FROM admin_users WHERE username = ?', [username]);

  if (env.defaultQualityMode) setSetting('default_quality_mode', env.defaultQualityMode);

  if (existing) {
    if (!silent) console.log(`[bootstrap] usuário "${username}" já existe.`);
    return { created: false, user: existing };
  }
  if (!password) {
    if (!silent) console.warn('[bootstrap] nenhum administrador cadastrado e ADMIN_INITIAL_PASSWORD ausente.');
    return { created: false, user: null };
  }
  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    console.error(`[bootstrap] senha inicial fraca: ${strength.problems.join('; ')}. Usuário não criado.`);
    return { created: false, user: null, error: strength.problems };
  }
  const id = insert('admin_users', {
    username,
    password_hash: hashPassword(password),
    password_algo: 'scrypt',
    role: 'admin',
    is_active: 1,
  });
  audit('admin.created', { actor: 'bootstrap', entityType: 'admin_user', entityId: id, summary: `Usuário ${username} criado no boot` });
  if (!silent) console.log(`[bootstrap] usuário "${username}" criado. Troque a senha no primeiro acesso e remova ADMIN_INITIAL_PASSWORD.`);
  return { created: true, user: get('SELECT * FROM admin_users WHERE id = ?', [id]) };
}

export function resetAdminPassword(password) {
  const username = (env.admin.username || 'kauan').trim().toLowerCase();
  const user = get('SELECT * FROM admin_users WHERE username = ?', [username]);
  if (!user) return bootstrapAdmin();
  update('admin_users', user.id, {
    password_hash: hashPassword(password), password_algo: 'scrypt',
    is_active: 1, failed_attempts: 0, locked_until: null,
  });
  audit('admin.password_reset', { actor: 'bootstrap', entityType: 'admin_user', entityId: user.id, summary: 'Senha redefinida' });
  return { created: false, user };
}
