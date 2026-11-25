import { get, nowIso, run } from './db.js';

const DEFAULTS = {
  site_title: 'MangaLoop',
  tagline: 'Sua vida pode ser o próximo capítulo.',
  signature: 'Você conta. A comunidade escolhe. Nós ilustramos.',
  instagram_url: '',
  tiktok_url: '',
  x_url: '',
  contact_email: '',
  takedown_email: '',
  rules_url: '',
  close_weekday_note: 'Quinta-feira, horário configurável por edição.',
  publish_weekday_note: 'Domingo, horário configurável por edição.',
  logo_asset_id: null,
  avatar_asset_id: null,
  max_pages: 8,
  default_quality_mode: 'ECONOMICO',
  analytics_enabled: false,
};

export function getSetting(key) {
  const row = get('SELECT value_json FROM site_settings WHERE key = ?', [key]);
  if (!row) return DEFAULTS[key] ?? null;
  try { return JSON.parse(row.value_json); } catch { return DEFAULTS[key] ?? null; }
}

export function setSetting(key, value) {
  run(`INSERT INTO site_settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value ?? null), nowIso()]);
}

export function allSettings() {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) out[key] = getSetting(key);
  return out;
}

export { DEFAULTS as SETTING_DEFAULTS };
