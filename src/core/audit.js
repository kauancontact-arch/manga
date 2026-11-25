import { all, insert } from './db.js';
import { sha256 } from './ids.js';

/** Registro de auditoria. Nunca grava segredos nem o texto integral de relatos sensiveis. */
export function audit(action, { actor = 'sistema', entityType = null, entityId = null, summary = '', meta = null, ip = null } = {}) {
  insert('audit_logs', {
    actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary: String(summary).slice(0, 400),
    meta_json: meta ? JSON.stringify(redact(meta)) : null,
    ip_hash: ip ? sha256(String(ip)).slice(0, 24) : null,
  });
}

const SECRET_KEYS = /(key|secret|token|password|senha|authorization|cookie)/i;

function redact(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_KEYS.test(k) ? '[omitido]' : redact(v);
  }
  return out;
}

export function recentAudit(limit = 50) {
  return all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?', [limit]);
}

export function auditFor(entityType, entityId, limit = 50) {
  return all('SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?', [entityType, entityId, limit]);
}
