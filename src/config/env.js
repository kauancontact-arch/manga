import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Carrega .env sem dependencias externas. Nao sobrescreve variaveis ja definidas. */
function loadDotEnv(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return;
  const raw = fs.readFileSync(full, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv('.env.local');
loadDotEnv('.env');

const str = (k, fallback = '') => (process.env[k] ?? fallback).trim();
const bool = (k, fallback = false) => {
  const v = str(k);
  if (v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};
const num = (k, fallback = null) => {
  const v = str(k);
  if (v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const nodeEnv = str('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

export const env = {
  nodeEnv,
  isProd,
  isTest,
  port: num('PORT', 3000),
  appUrl: str('APP_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  databaseUrl: str('DATABASE_URL', 'file:./data/mangaloop.sqlite'),
  editorialTimezone: str('EDITORIAL_TIMEZONE', 'America/Sao_Paulo'),

  admin: {
    username: str('ADMIN_USERNAME', 'kauan'),
    initialPassword: str('ADMIN_INITIAL_PASSWORD'),
  },
  authSecret: str('AUTH_SECRET'),

  openai: {
    apiKey: str('OPENAI_API_KEY'),
    baseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
    textModel: str('OPENAI_TEXT_MODEL'),
    imageModel: str('OPENAI_IMAGE_MODEL'),
    liveEnabled: bool('AI_LIVE_ENABLED', false),
  },

  storage: {
    driver: str('STORAGE_DRIVER', 'local'),
    bucket: str('STORAGE_BUCKET'),
    endpoint: str('STORAGE_ENDPOINT'),
    region: str('STORAGE_REGION'),
    accessKey: str('STORAGE_ACCESS_KEY'),
    secretKey: str('STORAGE_SECRET_KEY'),
    publicBaseUrl: str('STORAGE_PUBLIC_BASE_URL'),
    localDir: str('STORAGE_LOCAL_DIR') || path.join(ROOT, 'data', 'storage'),
  },

  budget: {
    monthlyUsd: num('MONTHLY_AI_BUDGET_USD', null),
    perMangaUsd: num('PER_MANGA_AI_BUDGET_USD', null),
    // AI_COST_GATE=off libera a geração sem confirmação de custo nem teto.
    // O consumo continua sendo registrado no usage_ledger.
    gateEnabled: str('AI_COST_GATE', 'on').toLowerCase() !== 'off',
  },

  defaultQualityMode: str('DEFAULT_QUALITY_MODE'),
  allowSqliteInProd: bool('ALLOW_SQLITE_IN_PROD', false),

  prices: {
    textInputPerMTok: num('PRICE_TEXT_INPUT_PER_MTOK', null),
    textOutputPerMTok: num('PRICE_TEXT_OUTPUT_PER_MTOK', null),
    imagePerCall: {
      low: num('PRICE_IMAGE_PER_CALL_LOW', null),
      medium: num('PRICE_IMAGE_PER_CALL_MEDIUM', null),
      high: num('PRICE_IMAGE_PER_CALL_HIGH', null),
    },
    updatedAt: str('PRICE_TABLE_UPDATED_AT'),
  },

  worker: {
    token: str('WORKER_TOKEN'),
    pollMs: num('WORKER_POLL_MS', 2000),
    maxConcurrent: num('MAX_CONCURRENT_JOBS', 2),
  },
};

/**
 * Modo de IA efetivo.
 * "live"  -> chamadas reais e pagas (exige chave + AI_LIVE_ENABLED + modelos).
 * "demo"  -> fixtures locais, custo zero, SEMPRE identificado na interface.
 */
export function aiMode() {
  const o = env.openai;
  if (o.liveEnabled && o.apiKey && o.textModel && o.imageModel) return 'live';
  return 'demo';
}

/** Motivos pelos quais o modo live nao esta disponivel (exibido no admin). */
export function aiModeBlockers() {
  const o = env.openai;
  const out = [];
  if (!o.liveEnabled) out.push('AI_LIVE_ENABLED nao esta como true');
  if (!o.apiKey) out.push('OPENAI_API_KEY ausente');
  if (!o.textModel) out.push('OPENAI_TEXT_MODEL ausente');
  if (!o.imageModel) out.push('OPENAI_IMAGE_MODEL ausente');
  return out;
}

/**
 * Validacao de ambiente para producao. Lanca erro cedo, antes de servir trafego.
 * A senha inicial NAO entra aqui: no primeiro boot em container ela precisa
 * existir para criar o administrador. O aviso de remove-la vem depois do
 * bootstrap, em bootstrapAdmin.
 */
export function assertProductionEnv() {
  const problems = [];
  if (!env.authSecret || env.authSecret.length < 32) {
    problems.push('AUTH_SECRET ausente ou com menos de 32 caracteres.');
  }
  if (!env.appUrl.startsWith('https://')) {
    problems.push('APP_URL deve usar https em producao.');
  }
  if (env.databaseUrl.startsWith('file:') && !env.allowSqliteInProd) {
    problems.push('DATABASE_URL aponta para SQLite. Use PostgreSQL, ou declare ALLOW_SQLITE_IN_PROD=true quando o arquivo estiver em volume persistente.');
  }
  if (problems.length) {
    throw new Error('Ambiente de producao invalido:\n - ' + problems.join('\n - '));
  }
}
