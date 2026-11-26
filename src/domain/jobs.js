import { aiMode } from '../config/env.js';
import { all, get, insert, nowIso, run, tx, update } from '../core/db.js';
import { audit } from '../core/audit.js';
import { stableHash } from '../core/ids.js';

/**
 * Fila de jobs persistente.
 * Nada depende de uma única requisição HTTP longa: a rota apenas enfileira e
 * o worker processa, com idempotência, timeout, retry com backoff e cancelamento.
 */

export const JOB_TYPES = ['SCRIPT', 'PAGE_IMAGE', 'COVER_IMAGE', 'CHARACTER_REF', 'COMPOSITE'];

const RUNNING_TIMEOUT_MS = 1000 * 60 * 5;
const BACKOFF_BASE_MS = 4000;

export function idempotencyKeyFor({ type, mangaId, pageId = null, params = {}, version = 1 }) {
  return `${type}:${mangaId || '-'}:${pageId || '-'}:v${version}:${stableHash(params).slice(0, 24)}`;
}

/**
 * Enfileira um job. Se já existir um job ativo com a mesma chave de
 * idempotência, devolve o existente em vez de duplicar a chamada paga.
 */
export function enqueue({
  type, mangaId = null, pageId = null, characterId = null,
  params = {}, estimatedCostUsd = null, costKnown = false,
  maxAttempts = 3, createdBy = 'admin', version = 1,
}) {
  if (!JOB_TYPES.includes(type)) throw new Error(`Tipo de job inválido: ${type}`);
  const key = idempotencyKeyFor({ type, mangaId, pageId, params, version });

  return tx(() => {
    const existing = get('SELECT * FROM generation_jobs WHERE idempotency_key = ?', [key]);
    if (existing && ['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(existing.status)) {
      return { job: existing, reused: true };
    }
    if (existing) run('DELETE FROM generation_jobs WHERE id = ?', [existing.id]);

    const id = insert('generation_jobs', {
      type,
      manga_id: mangaId,
      page_id: pageId,
      character_id: characterId,
      status: 'QUEUED',
      idempotency_key: key,
      params_json: JSON.stringify(params),
      max_attempts: maxAttempts,
      run_after: nowIso(),
      estimated_cost_usd: estimatedCostUsd,
      cost_known: costKnown ? 1 : 0,
      mode: aiMode(),
      created_by: createdBy,
    });
    audit('job.enqueued', { actor: createdBy, entityType: 'job', entityId: id, summary: `${type} enfileirado`, meta: { mangaId, pageId } });
    return { job: getJob(id), reused: false };
  });
}

export function getJob(id) {
  return get('SELECT * FROM generation_jobs WHERE id = ?', [id]);
}

export function listJobs({ mangaId = null, status = null, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (mangaId) { where.push('manga_id = ?'); params.push(mangaId); }
  if (status) { where.push('status = ?'); params.push(status); }
  params.push(limit);
  return all(`SELECT * FROM generation_jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`, params);
}

/** Devolve jobs travados (processo morto) para a fila. */
export function reclaimStalled() {
  const cutoff = new Date(Date.now() - RUNNING_TIMEOUT_MS).toISOString();
  const stalled = all("SELECT * FROM generation_jobs WHERE status = 'RUNNING' AND locked_at < ?", [cutoff]);
  for (const job of stalled) {
    const exhausted = job.attempts >= job.max_attempts;
    update('generation_jobs', job.id, {
      status: exhausted ? 'FAILED' : 'QUEUED',
      locked_at: null,
      error_message: 'Tempo limite excedido; job retomado.',
      finished_at: exhausted ? nowIso() : null,
      run_after: exhausted ? null : nowIso(),
    });
  }
  return stalled.length;
}

/** Reserva o próximo job pronto para execução. Seguro com múltiplos workers. */
export function claimNext({ maxConcurrent = 2 } = {}) {
  return tx(() => {
    const running = get("SELECT COUNT(*) AS n FROM generation_jobs WHERE status = 'RUNNING'");
    if ((running?.n ?? 0) >= maxConcurrent) return null;
    const next = get("SELECT * FROM generation_jobs WHERE status = 'QUEUED' AND (run_after IS NULL OR run_after <= ?) ORDER BY created_at ASC LIMIT 1", [nowIso()]);
    if (!next) return null;
    update('generation_jobs', next.id, {
      status: 'RUNNING',
      attempts: next.attempts + 1,
      started_at: next.started_at || nowIso(),
      locked_at: nowIso(),
      error_message: null,
    });
    return getJob(next.id);
  });
}

export function setProgress(id, progress, { label = null } = {}) {
  const current = getJob(id);
  if (!current || current.status !== 'RUNNING') return;
  const result = current.result_json ? safeParse(current.result_json) : {};
  update('generation_jobs', id, {
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    result_json: JSON.stringify({ ...result, label: label ?? result.label ?? null }),
  });
}

export function completeJob(id, result = {}, { actualCostUsd = null } = {}) {
  update('generation_jobs', id, {
    status: 'SUCCEEDED',
    progress: 100,
    finished_at: nowIso(),
    locked_at: null,
    result_json: JSON.stringify(result),
    actual_cost_usd: actualCostUsd,
    error_message: null,
  });
  return getJob(id);
}

/** Falha com retry exponencial limitado. Erros marcados `fatal` não repetem. */
export function failJob(id, error, { fatal = false } = {}) {
  const job = getJob(id);
  if (!job) return null;
  const message = String(error?.message || error || 'Erro desconhecido').slice(0, 900);
  const exhausted = fatal || job.attempts >= job.max_attempts;
  update('generation_jobs', id, {
    status: exhausted ? 'FAILED' : 'QUEUED',
    error_message: message,
    locked_at: null,
    finished_at: exhausted ? nowIso() : null,
    run_after: exhausted ? null : new Date(Date.now() + BACKOFF_BASE_MS * 2 ** job.attempts).toISOString(),
  });
  audit('job.failed', { actor: 'worker', entityType: 'job', entityId: id, summary: message.slice(0, 200), meta: { exhausted, attempts: job.attempts } });
  return getJob(id);
}

export function cancelJob(id, { actor = 'admin' } = {}) {
  const job = getJob(id);
  if (!job || ['SUCCEEDED', 'CANCELLED'].includes(job.status)) return job;
  update('generation_jobs', id, { status: 'CANCELLED', finished_at: nowIso(), locked_at: null, error_message: 'Cancelado pelo administrador.' });
  audit('job.cancelled', { actor, entityType: 'job', entityId: id, summary: 'Job cancelado' });
  return getJob(id);
}

/** Cancela toda a fila pendente de uma obra (usado ao interromper geração). */
export function cancelPendingForManga(mangaId, { actor = 'admin' } = {}) {
  const pending = all("SELECT id FROM generation_jobs WHERE manga_id = ? AND status IN ('QUEUED','RUNNING')", [mangaId]);
  for (const job of pending) cancelJob(job.id, { actor });
  return pending.length;
}

/** Resumo para a interface: progresso agregado dos jobs de uma obra. */
export function mangaJobSummary(mangaId) {
  const rows = all("SELECT * FROM generation_jobs WHERE manga_id = ? AND status IN ('QUEUED','RUNNING','FAILED','SUCCEEDED') ORDER BY created_at", [mangaId]);

  // Uma falha que já foi superada não é mais notícia: se uma tentativa
  // posterior do mesmo tipo deu certo, o erro antigo some. Sem isso o estúdio
  // mostrava "o modelo não devolveu um roteiro válido" ao lado do roteiro
  // pronto, porque a tentativa que falhou continua na tabela.
  const ultimoSucesso = new Map();
  for (const j of rows) if (j.status === 'SUCCEEDED') ultimoSucesso.set(j.type, j.created_at);
  const jobs = rows.filter((j) => {
    if (j.status === 'SUCCEEDED') return false;
    if (j.status !== 'FAILED') return true;
    const sucesso = ultimoSucesso.get(j.type);
    return !(sucesso && sucesso >= j.created_at);
  });

  if (!jobs.length) return { active: false, progress: 100, label: 'Sem tarefas pendentes.', failed: 0, done: true };
  const failed = jobs.filter((j) => j.status === 'FAILED');
  const working = jobs.filter((j) => j.status !== 'FAILED');
  const progress = working.length
    ? Math.round(working.reduce((s, j) => s + (j.status === 'RUNNING' ? j.progress : 0), 0) / working.length)
    : 100;
  const current = working.find((j) => j.status === 'RUNNING') || working[0];
  const label = failed.length && !working.length
    ? (failed.length === 1 ? 'Uma tarefa falhou.' : `${failed.length} tarefas falharam.`)
    : current
      ? `${jobLabel(current.type)}: ${safeParse(current.result_json)?.label || current.status.toLowerCase()}`
      : 'Concluído.';
  return { active: working.length > 0, progress, label, failed: failed.length, done: working.length === 0, jobs };
}

export function jobLabel(type) {
  return ({
    SCRIPT: 'Roteiro',
    PAGE_IMAGE: 'Imagem de página',
    COVER_IMAGE: 'Capa',
    CHARACTER_REF: 'Referência de personagem',
    COMPOSITE: 'Composição final',
  })[type] || type;
}

function safeParse(value) {
  try { return JSON.parse(value); } catch { return {}; }
}

export { safeParse as parseJobResult };
