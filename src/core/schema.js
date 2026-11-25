/**
 * Validador de schema minimo, com a mesma ergonomia do Zod.
 * Existe porque o ambiente de build nao permite dependencias externas;
 * a API foi mantida compativel para permitir a troca por Zod sem reescrever
 * as regras (ver docs/ARQUITETURA.md).
 */

export class ValidationError extends Error {
  constructor(issues) {
    super(`Validacao falhou: ${issues.map((i) => `${i.path || '(raiz)'}: ${i.message}`).join('; ')}`);
    this.name = 'ValidationError';
    this.issues = issues;
    this.statusCode = 422;
  }
}

class Schema {
  constructor(parseFn, meta = {}) {
    this._parse = parseFn;
    this.meta = meta;
  }
  safeParse(value, pathPrefix = '') {
    const issues = [];
    const out = this._parse(value, pathPrefix, issues);
    return issues.length ? { ok: false, issues } : { ok: true, value: out };
  }
  parse(value) {
    const res = this.safeParse(value);
    if (!res.ok) throw new ValidationError(res.issues);
    return res.value;
  }
  optional() {
    return new Schema((v, p, issues) => (v === undefined || v === null || v === '' ? undefined : this._parse(v, p, issues)), { ...this.meta, optional: true });
  }
  nullable() {
    return new Schema((v, p, issues) => (v === null || v === undefined || v === '' ? null : this._parse(v, p, issues)), { ...this.meta, nullable: true });
  }
  default(defaultValue) {
    return new Schema((v, p, issues) => (v === undefined || v === null || v === '' ? defaultValue : this._parse(v, p, issues)), this.meta);
  }
  refine(fn, message) {
    return new Schema((v, p, issues) => {
      const out = this._parse(v, p, issues);
      if (!issues.length && !fn(out)) issues.push({ path: p, message });
      return out;
    }, this.meta);
  }
  transform(fn) {
    return new Schema((v, p, issues) => {
      const out = this._parse(v, p, issues);
      return issues.length ? out : fn(out);
    }, this.meta);
  }
}

const fail = (issues, path, message) => { issues.push({ path, message }); return undefined; };

export const z = {
  string({ min = 0, max = Infinity, trim = true, pattern = null, patternMessage = 'formato invalido' } = {}) {
    return new Schema((v, p, issues) => {
      if (typeof v !== 'string') return fail(issues, p, 'deve ser texto');
      const s = trim ? v.trim() : v;
      if (s.length < min) return fail(issues, p, `deve ter ao menos ${min} caractere(s)`);
      if (s.length > max) return fail(issues, p, `deve ter no maximo ${max} caractere(s)`);
      if (pattern && !pattern.test(s)) return fail(issues, p, patternMessage);
      return s;
    }, { type: 'string', min, max });
  },
  int({ min = -Infinity, max = Infinity } = {}) {
    return new Schema((v, p, issues) => {
      const n = typeof v === 'string' ? Number(v.trim()) : v;
      if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) return fail(issues, p, 'deve ser um numero inteiro');
      if (n < min) return fail(issues, p, `deve ser >= ${min}`);
      if (n > max) return fail(issues, p, `deve ser <= ${max}`);
      return n;
    }, { type: 'int', min, max });
  },
  number({ min = -Infinity, max = Infinity } = {}) {
    return new Schema((v, p, issues) => {
      const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) return fail(issues, p, 'deve ser um numero');
      if (n < min) return fail(issues, p, `deve ser >= ${min}`);
      if (n > max) return fail(issues, p, `deve ser <= ${max}`);
      return n;
    }, { type: 'number' });
  },
  boolean() {
    return new Schema((v, p, issues) => {
      if (typeof v === 'boolean') return v;
      if (v === undefined || v === null || v === '') return false;
      const s = String(v).toLowerCase();
      if (['1', 'true', 'on', 'yes', 'sim'].includes(s)) return true;
      if (['0', 'false', 'off', 'no', 'nao'].includes(s)) return false;
      return fail(issues, p, 'deve ser booleano');
    }, { type: 'boolean' });
  },
  enum(values) {
    return new Schema((v, p, issues) => {
      const s = typeof v === 'string' ? v.trim() : v;
      if (!values.includes(s)) return fail(issues, p, `deve ser um de: ${values.join(', ')}`);
      return s;
    }, { type: 'enum', values });
  },
  isoDate() {
    return new Schema((v, p, issues) => {
      if (typeof v !== 'string' || !v.trim()) return fail(issues, p, 'data invalida');
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return fail(issues, p, 'data invalida');
      return d.toISOString();
    }, { type: 'date' });
  },
  url({ protocols = ['http:', 'https:'] } = {}) {
    return new Schema((v, p, issues) => {
      if (typeof v !== 'string') return fail(issues, p, 'deve ser texto');
      try {
        const u = new URL(v.trim());
        if (!protocols.includes(u.protocol)) return fail(issues, p, 'protocolo nao permitido');
        return u.toString();
      } catch { return fail(issues, p, 'URL invalida'); }
    }, { type: 'url' });
  },
  array(item, { min = 0, max = Infinity } = {}) {
    return new Schema((v, p, issues) => {
      if (!Array.isArray(v)) return fail(issues, p, 'deve ser uma lista');
      if (v.length < min) return fail(issues, p, `deve ter ao menos ${min} item(ns)`);
      if (v.length > max) return fail(issues, p, `deve ter no maximo ${max} item(ns)`);
      return v.map((entry, i) => item._parse(entry, `${p}[${i}]`, issues));
    }, { type: 'array' });
  },
  object(shape, { strip = true } = {}) {
    return new Schema((v, p, issues) => {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return fail(issues, p, 'deve ser um objeto');
      const out = {};
      for (const [key, schema] of Object.entries(shape)) {
        const childPath = p ? `${p}.${key}` : key;
        const parsed = schema._parse(v[key], childPath, issues);
        if (parsed !== undefined) out[key] = parsed;
        else if (schema.meta?.nullable && v[key] !== undefined) out[key] = null;
      }
      if (!strip) for (const k of Object.keys(v)) if (!(k in shape)) out[k] = v[k];
      return out;
    }, { type: 'object', shape });
  },
  any() { return new Schema((v) => v, { type: 'any' }); },
};

export { Schema };
