import { all } from './db.js';

export function slugify(value, { max = 70 } = {}) {
  const base = String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return base || 'item';
}

/** Gera slug unico na tabela informada, acrescentando sufixo numerico. */
export function uniqueSlug(table, value, { ignoreId = null, max = 70 } = {}) {
  const base = slugify(value, { max });
  const rows = all(`SELECT slug FROM ${table} WHERE slug = ? OR slug LIKE ?`, [base, `${base}-%`]);
  const taken = new Set(rows.map((r) => r.slug));
  if (ignoreId) {
    const own = all(`SELECT slug FROM ${table} WHERE id = ?`, [ignoreId]).map((r) => r.slug);
    for (const s of own) taken.delete(s);
  }
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
