import { env } from './config/env.js';
import { audit } from './core/audit.js';
import { all, migrate, nowIso, update } from './core/db.js';
import { purgeExpiredSessions } from './core/auth.js';
import { claimNext, completeJob, failJob, reclaimStalled } from './domain/jobs.js';
import { executeJob, maybeFinishGeneration } from './ai/pipeline.js';
import { publishManga } from './domain/mangas.js';
import { publishMagazine } from './domain/magazines.js';

/**
 * Worker de segundo plano.
 * - processa a fila de geração (idempotente, com retry e backoff)
 * - publica o que estiver agendado
 * - faz limpeza de sessões expiradas
 *
 * Pode rodar como processo separado (npm run worker) ou embutido no servidor
 * em ambientes pequenos (WORKER_EMBEDDED=true).
 */

let running = false;
let stopped = false;

export async function tick() {
  if (running) return;
  running = true;
  try {
    reclaimStalled();
    let job = claimNext({ maxConcurrent: env.worker.maxConcurrent });
    while (job) {
      try {
        const result = await executeJob(job);
        completeJob(job.id, result ?? {});
      } catch (err) {
        const fatal = err?.fatal === true;
        const after = failJob(job.id, err, { fatal });
        if (job.page_id) update('pages', job.page_id, { status: 'FAILED', failure_reason: String(err.message).slice(0, 400) });
        // Um job de roteiro que esgota as tentativas precisa aparecer na obra.
        // Antes isso só valia para erro fatal, então uma falha que passou pelo
        // retry (limite de taxa, timeout, resposta fora do schema) deixava o
        // estúdio mostrando "nenhum roteiro gerado", sem erro em lugar nenhum:
        // de fora parecia que a geração nunca tinha acontecido.
        if (job.manga_id && after?.status === 'FAILED' && job.type === 'SCRIPT') {
          update('mangas', job.manga_id, { status: 'FAILED', failure_reason: String(err.message).slice(0, 400) });
        }
      }
      // Encerra a geração quando não restam tarefas de imagem pendentes.
      if (job.manga_id && ['PAGE_IMAGE', 'COVER_IMAGE'].includes(job.type)) maybeFinishGeneration(job.manga_id);
      job = claimNext({ maxConcurrent: env.worker.maxConcurrent });
    }
    await publishScheduled();
  } finally {
    running = false;
  }
}

/** Publicação agendada: idempotente, segura para rodar a cada ciclo. */
export async function publishScheduled() {
  const dueMangas = all("SELECT * FROM mangas WHERE status = 'SCHEDULED' AND scheduled_at IS NOT NULL AND scheduled_at <= ?", [nowIso()]);
  for (const manga of dueMangas) {
    try {
      await publishManga(manga.id, { actor: 'worker', confirmed: true });
    } catch (err) {
      update('mangas', manga.id, { failure_reason: `Publicação agendada falhou: ${String(err.message).slice(0, 300)}` });
      audit('manga.schedule_failed', { actor: 'worker', entityType: 'manga', entityId: manga.id, summary: err.message });
    }
  }

  const dueMagazines = all("SELECT * FROM magazines WHERE status = 'SCHEDULED' AND scheduled_at IS NOT NULL AND scheduled_at <= ?", [nowIso()]);
  for (const magazine of dueMagazines) {
    try {
      await publishMagazine(magazine.id, { actor: 'worker', confirmed: true });
    } catch (err) {
      audit('magazine.schedule_failed', { actor: 'worker', entityType: 'magazine', entityId: magazine.id, summary: err.message });
    }
  }
  return { mangas: dueMangas.length, magazines: dueMagazines.length };
}

export function startWorker({ silent = false } = {}) {
  migrate({ silent: true });
  if (!silent) console.log(`[worker] iniciado (intervalo ${env.worker.pollMs}ms, concorrência ${env.worker.maxConcurrent}, modo ${process.env.AI_LIVE_ENABLED === 'true' ? 'live' : 'demo'})`);
  const loop = async () => {
    if (stopped) return;
    try { await tick(); } catch (err) { console.error('[worker] erro no ciclo:', err.message); }
    setTimeout(loop, env.worker.pollMs);
  };
  loop();
  setInterval(() => { purgeExpiredSessions(); }, 1000 * 60 * 30);
}

export function stopWorker() { stopped = true; }

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  startWorker();
  process.on('SIGINT', () => { stopWorker(); process.exit(0); });
  process.on('SIGTERM', () => { stopWorker(); process.exit(0); });
}
