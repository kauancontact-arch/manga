import { env } from '../config/env.js';
import { bootstrapAdmin, resetAdminPassword } from '../core/bootstrap.js';
import { closeDb, migrate } from '../core/db.js';

/**
 * Cria o administrador inicial, ou redefine a senha quando ele já existe.
 * Idempotente. A senha vem de ADMIN_INITIAL_PASSWORD e deve sair do ambiente depois.
 */
migrate({ silent: true });

if (!env.admin.initialPassword) {
  console.error('[bootstrap] defina ADMIN_INITIAL_PASSWORD com uma senha forte e rode de novo.');
  process.exit(1);
}

const forcar = process.argv.includes('--redefinir');
const resultado = forcar ? resetAdminPassword(env.admin.initialPassword) : bootstrapAdmin();
if (!forcar && !resultado.created && resultado.user) {
  console.log('[bootstrap] use --redefinir para trocar a senha do usuário existente.');
}
closeDb();
