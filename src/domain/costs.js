import { aiMode, env } from '../config/env.js';
import { all, get, insert } from '../core/db.js';
import { monthKey } from '../core/dates.js';
import { qualityMode } from './catalog.js';

/**
 * Custos de IA.
 *
 * Princípio: nunca apresentar zero como custo conhecido. Se a tarifa não
 * estiver configurada, o custo é "não informado" e a operação exige
 * confirmação explícita do administrador.
 */

/** Lê a tarifa do ambiente no momento da chamada (permite recarregar sem rebuild). */
function priceEnv(key, fallback) {
  const raw = (process.env[key] ?? '').trim();
  if (raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function priceTable() {
  const p = {
    textInputPerMTok: priceEnv('PRICE_TEXT_INPUT_PER_MTOK', env.prices.textInputPerMTok),
    textOutputPerMTok: priceEnv('PRICE_TEXT_OUTPUT_PER_MTOK', env.prices.textOutputPerMTok),
    imagePerCall: {
      low: priceEnv('PRICE_IMAGE_PER_CALL_LOW', env.prices.imagePerCall.low),
      medium: priceEnv('PRICE_IMAGE_PER_CALL_MEDIUM', env.prices.imagePerCall.medium),
      high: priceEnv('PRICE_IMAGE_PER_CALL_HIGH', env.prices.imagePerCall.high),
    },
    updatedAt: (process.env.PRICE_TABLE_UPDATED_AT || env.prices.updatedAt || '').trim(),
  };
  return {
    textInputPerMTok: p.textInputPerMTok,
    textOutputPerMTok: p.textOutputPerMTok,
    imagePerCall: p.imagePerCall,
    updatedAt: p.updatedAt || null,
    hasText: p.textInputPerMTok !== null && p.textOutputPerMTok !== null,
    hasImage: Object.values(p.imagePerCall).some((v) => v !== null),
  };
}

/** Estimativa de tokens de texto a partir do tamanho do relato (aproximação declarada). */
export function estimateTextTokens({ sourceChars = 0, pages = 4 }) {
  const input = Math.ceil(sourceChars / 3.2) + 900;          // relato + instruções
  const output = 420 * pages + 300;                           // roteiro estruturado
  return { input, output };
}

/**
 * Estimativa de um job completo.
 * `imageCalls` conta uma chamada por página no modo econômico (uma por quadro é opcional e mais cara).
 */
export function estimateGeneration({
  qualityModeKey = 'ECONOMICO',
  pages = 4,
  includeCover = true,
  characterRefs = 0,
  sourceChars = 0,
  perFrame = false,
  framesTotal = 0,
}) {
  const mode = qualityMode(qualityModeKey);
  const prices = priceTable();
  const tokens = estimateTextTokens({ sourceChars, pages });

  const imageCalls = (perFrame ? Math.max(framesTotal, pages) : pages) + (includeCover ? 1 : 0) + characterRefs;
  const imageUnit = prices.imagePerCall[mode.imageQuality];

  const unknown = [];
  let textCost = null;
  if (prices.hasText) {
    textCost = (tokens.input / 1e6) * prices.textInputPerMTok + (tokens.output / 1e6) * prices.textOutputPerMTok;
  } else {
    unknown.push('Tarifa de texto não configurada (PRICE_TEXT_INPUT_PER_MTOK / PRICE_TEXT_OUTPUT_PER_MTOK).');
  }

  let imageCost = null;
  if (imageUnit !== null && imageUnit !== undefined) {
    imageCost = imageCalls * imageUnit;
  } else {
    unknown.push(`Tarifa de imagem não configurada para qualidade "${mode.imageQuality}" (PRICE_IMAGE_PER_CALL_${mode.imageQuality.toUpperCase()}).`);
  }

  const known = unknown.length === 0;
  return {
    mode: mode.key,
    modeLabel: mode.label,
    imageQuality: mode.imageQuality,
    pages,
    includeCover,
    characterRefs,
    perFrame,
    calls: { text: 1, image: imageCalls, total: 1 + imageCalls },
    tokens,
    textCostUsd: textCost,
    imageCostUsd: imageCost,
    totalUsd: known ? textCost + imageCost : null,
    known,
    unknownReasons: unknown,
    priceUpdatedAt: prices.updatedAt,
    aiMode: aiMode(),
  };
}

/* ------------------------------ orçamento ------------------------------- */

export function monthSpend(key = monthKey()) {
  const row = get(`SELECT
      SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)) AS total,
      SUM(CASE WHEN cost_source = 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown_entries,
      COUNT(*) AS entries
    FROM usage_ledger WHERE month_key = ? AND mode = 'live'`, [key]);
  return {
    monthKey: key,
    totalUsd: row?.total ?? 0,
    entries: row?.entries ?? 0,
    unknownEntries: row?.unknown_entries ?? 0,
  };
}

export function mangaSpend(mangaId) {
  const row = get(`SELECT
      SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)) AS total,
      SUM(CASE WHEN cost_source = 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown_entries,
      COUNT(*) AS entries
    FROM usage_ledger WHERE manga_id = ? AND mode = 'live'`, [mangaId]);
  return {
    totalUsd: row?.total ?? 0,
    entries: row?.entries ?? 0,
    unknownEntries: row?.unknown_entries ?? 0,
  };
}

/**
 * Autoriza (ou bloqueia) uma geração conforme orçamento e confirmação.
 * Em modo demo nunca há custo, portanto nunca bloqueia.
 */
export function budgetGate({ mangaId, estimate, confirmedUnknownCost = false, confirmedOverBudget = false }) {
  if (estimate.aiMode !== 'live') {
    return { allowed: true, reasons: [], requiresConfirmation: false, demo: true };
  }
  // Operação configurada para não travar por custo. O consumo segue registrado.
  if (!env.budget.gateEnabled) {
    return { allowed: true, reasons: [], requiresConfirmation: false, demo: false, gateOff: true };
  }
  const reasons = [];
  const needsConfirm = [];

  if (!estimate.known && !confirmedUnknownCost) {
    needsConfirm.push('Custo não verificável com as tarifas atuais. Confirme para prosseguir mesmo sem estimativa.');
  }

  const perManga = env.budget.perMangaUsd;
  if (perManga !== null && estimate.known) {
    const spent = mangaSpend(mangaId).totalUsd;
    if (spent + estimate.totalUsd > perManga) {
      reasons.push(`Orçamento por obra excedido: já gasto US$ ${spent.toFixed(4)}, estimativa US$ ${estimate.totalUsd.toFixed(4)}, teto US$ ${perManga.toFixed(2)}.`);
    }
  }

  const monthly = env.budget.monthlyUsd;
  if (monthly !== null && estimate.known) {
    const spent = monthSpend().totalUsd;
    if (spent + estimate.totalUsd > monthly) {
      reasons.push(`Orçamento mensal excedido: já gasto US$ ${spent.toFixed(4)}, estimativa US$ ${estimate.totalUsd.toFixed(4)}, teto US$ ${monthly.toFixed(2)}.`);
    }
  }

  if (reasons.length && !confirmedOverBudget) {
    return { allowed: false, reasons, requiresConfirmation: false, demo: false };
  }
  if (needsConfirm.length) {
    return { allowed: false, reasons: needsConfirm, requiresConfirmation: true, demo: false };
  }
  return { allowed: true, reasons: [], requiresConfirmation: false, demo: false };
}

/* -------------------------------- registro ------------------------------ */

/**
 * Registra consumo. `actualCostUsd` só é preenchido quando derivável das
 * tarifas configuradas e do usage retornado; caso contrário, cost_source=UNKNOWN.
 */
export function recordUsage({
  jobId = null, mangaId = null, kind, model = null, params = null,
  inputTokens = null, outputTokens = null, imagesCount = null,
  estimatedCostUsd = null, status = 'OK', mode = aiMode(),
}) {
  const prices = priceTable();
  let actual = null;
  let source = 'UNKNOWN';

  if (mode === 'demo') {
    actual = 0;
    source = 'DEMO';
  } else if (kind === 'TEXT' && prices.hasText && inputTokens !== null && outputTokens !== null) {
    actual = (inputTokens / 1e6) * prices.textInputPerMTok + (outputTokens / 1e6) * prices.textOutputPerMTok;
    source = 'VERIFIED';
  } else if (kind === 'IMAGE' && imagesCount !== null) {
    const quality = params?.quality;
    const unit = quality ? prices.imagePerCall[quality] : null;
    if (unit !== null && unit !== undefined) {
      actual = imagesCount * unit;
      source = 'VERIFIED';
    } else if (estimatedCostUsd !== null) {
      source = 'ESTIMATE';
    }
  } else if (estimatedCostUsd !== null) {
    source = 'ESTIMATE';
  }

  return insert('usage_ledger', {
    job_id: jobId,
    manga_id: mangaId,
    kind,
    model,
    params_json: params ? JSON.stringify(params) : null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    images_count: imagesCount,
    estimated_cost_usd: estimatedCostUsd,
    actual_cost_usd: actual,
    cost_source: source,
    status,
    mode,
    occurred_at: new Date().toISOString(),
    month_key: monthKey(),
  });
}

export function usageHistory({ mangaId = null, limit = 100 } = {}) {
  return mangaId
    ? all('SELECT * FROM usage_ledger WHERE manga_id = ? ORDER BY occurred_at DESC LIMIT ?', [mangaId, limit])
    : all('SELECT * FROM usage_ledger ORDER BY occurred_at DESC LIMIT ?', [limit]);
}

export function formatUsd(value) {
  if (value === null || value === undefined) return 'não informado';
  return `US$ ${Number(value).toFixed(4)}`;
}
