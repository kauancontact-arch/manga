import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env, ROOT } from '../config/env.js';
import { newId } from './ids.js';

/**
 * Camada de acesso a dados.
 *
 * O driver ativo e o SQLite embutido do Node (`node:sqlite`), que roda sem
 * dependencias externas. Toda a aplicacao fala com o banco por este modulo
 * usando SQL padrao e parametros posicionais (?), de modo que a troca por
 * PostgreSQL exige implementar apenas `get/all/run/tx` sobre o driver `pg`.
 * Ver docs/ARQUITETURA.md, secao "Portabilidade do banco".
 */

let db = null;
let currentFile = null;

function resolveFile(databaseUrl) {
  if (databaseUrl.startsWith('postgres')) {
    throw new Error(
      'DATABASE_URL aponta para PostgreSQL, mas o driver pg nao esta instalado neste ambiente. ' +
      'Use file:./data/mangaloop.sqlite para desenvolvimento ou habilite o adaptador Postgres (docs/ARQUITETURA.md).'
    );
  }
  const raw = databaseUrl.replace(/^file:/, '') || './data/mangaloop.sqlite';
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

export function getDb() {
  if (db) return db;
  currentFile = resolveFile(env.databaseUrl);
  fs.mkdirSync(path.dirname(currentFile), { recursive: true });
  db = new DatabaseSync(currentFile);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/** Usado pelos testes: aponta para um arquivo isolado. */
export function useDatabaseFile(file) {
  if (db) { try { db.close(); } catch { /* ignore */ } }
  db = null;
  currentFile = file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

export function closeDb() {
  if (db) { try { db.close(); } catch { /* ignore */ } }
  db = null;
}

export function all(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}
export function get(sql, params = []) {
  return getDb().prepare(sql).get(...params) ?? null;
}
export function run(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}
export function exec(sql) {
  return getDb().exec(sql);
}

/** Transacao sincrona. Reverte em caso de excecao. */
export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (err) {
    try { d.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

/* ------------------------------ migrations ------------------------------ */

const MIGRATIONS_DIR = path.join(ROOT, 'src', 'core', 'migrations');

export function migrate({ silent = false } = {}) {
  const d = getDb();
  d.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(all('SELECT name FROM _migrations').map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    d.exec('BEGIN IMMEDIATE');
    try {
      d.exec(sql);
      d.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      d.exec('COMMIT');
      ran.push(file);
      if (!silent) console.log(`[migrate] aplicada: ${file}`);
    } catch (err) {
      try { d.exec('ROLLBACK'); } catch { /* ignore */ }
      throw new Error(`Falha na migration ${file}: ${err.message}`);
    }
  }
  if (!ran.length && !silent) console.log('[migrate] banco ja atualizado.');
  return ran;
}

/* ------------------------------- helpers -------------------------------- */

export function nowIso() {
  return new Date().toISOString();
}

/** INSERT a partir de objeto. Preenche id/created_at/updated_at quando ausentes. */
export function insert(table, data) {
  const row = { ...data };
  if (!row.id) row.id = newId();
  const ts = nowIso();
  if (row.created_at === undefined && hasColumn(table, 'created_at')) row.created_at = ts;
  if (row.updated_at === undefined && hasColumn(table, 'updated_at')) row.updated_at = ts;
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  run(sql, keys.map((k) => normalize(row[k])));
  return row.id;
}

/** UPDATE por id. Atualiza updated_at automaticamente. */
export function update(table, id, data) {
  const row = { ...data };
  if (hasColumn(table, 'updated_at')) row.updated_at = nowIso();
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  if (!keys.length) return 0;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  const res = run(sql, [...keys.map((k) => normalize(row[k])), id]);
  return res.changes;
}

function normalize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

const columnCache = new Map();
export function hasColumn(table, column) {
  if (!columnCache.has(table)) {
    const cols = all(`PRAGMA table_info(${table})`).map((c) => c.name);
    columnCache.set(table, new Set(cols));
  }
  return columnCache.get(table).has(column);
}

export function resetColumnCache() { columnCache.clear(); }
