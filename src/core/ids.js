import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Identificador ordenavel por tempo (timestamp base36 + aleatorio). */
export function newId(prefix = '') {
  const time = Date.now().toString(36).padStart(9, '0');
  const bytes = crypto.randomBytes(8);
  let rand = '';
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `${prefix}${time}${rand}`;
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Hash estavel de parametros, usado em cache de geracao e idempotencia. */
export function stableHash(obj) {
  return sha256(stableStringify(obj));
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
