import { all, get, insert, nowIso, run, tx, update } from '../core/db.js';
import { audit } from '../core/audit.js';
import { z } from '../core/schema.js';
import { uniqueSlug } from '../core/slug.js';
import { editorialLocalToUtc } from '../core/dates.js';
import { promoteAssetToPublic } from '../core/storage.js';
import { PAGINAS, qualityMode } from './catalog.js';
import { publicationGuard } from './safety.js';
import { countFrames, parseScript, scriptTranscript } from './script.js';
import { cancelPendingForManga } from './jobs.js';

/**
 * Máquina de estados da obra. Toda transição é validada no servidor;
 * alterações após aprovação invalidam a aprovação correspondente.
 */
export const TRANSITIONS = {
  RECEIVED: ['SCRIPT_DRAFT', 'FAILED', 'ARCHIVED'],
  SCRIPT_DRAFT: ['SCRIPT_DRAFT', 'SCRIPT_APPROVED', 'FAILED', 'ARCHIVED'],
  SCRIPT_APPROVED: ['GENERATING', 'SCRIPT_DRAFT', 'FAILED', 'ARCHIVED'],
  GENERATING: ['REVIEW', 'GENERATING', 'FAILED', 'SCRIPT_APPROVED', 'ARCHIVED'],
  REVIEW: ['REVIEW', 'GENERATING', 'AUTHOR_APPROVED', 'SCRIPT_DRAFT', 'FAILED', 'ARCHIVED'],
  AUTHOR_APPROVED: ['APPROVED', 'REVIEW', 'GENERATING', 'ARCHIVED'],
  APPROVED: ['SCHEDULED', 'PUBLISHED', 'REVIEW', 'ARCHIVED'],
  SCHEDULED: ['PUBLISHED', 'APPROVED', 'REVIEW', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  FAILED: ['SCRIPT_DRAFT', 'SCRIPT_APPROVED', 'GENERATING', 'ARCHIVED'],
  ARCHIVED: ['APPROVED', 'REVIEW', 'SCRIPT_DRAFT'],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(manga, to) {
  if (!canTransition(manga.status, to)) {
    throw Object.assign(
      new Error(`Transição inválida: ${manga.status} → ${to}.`),
      { statusCode: 409 }
    );
  }
}

export const mangaParamsSchema = z.object({
  title: z.string({ min: 2, max: 120 }).optional(),
  genre: z.string({ max: 40 }).optional(),
  art_style: z.string({ max: 40 }).default('CLASSICO_PB'),
  narrative_tone: z.string({ max: 40 }).optional(),
  visual_tone: z.string({ max: 40 }).optional(),
  humor_intensity: z.enum(['BAIXA', 'MEDIA', 'ALTA']).default('MEDIA'),
  fidelity: z.enum(['ALTA', 'ADAPTACAO']).default('ALTA'),
  color_mode: z.enum(['PB', 'DUOTONE', 'COLORIDO']).default('PB'),
  panel_density: z.enum(['BAIXA', 'MEDIA', 'ALTA']).default('MEDIA'),
  page_min: z.int({ min: PAGINAS.min, max: PAGINAS.max }).default(4),
  page_max: z.int({ min: PAGINAS.min, max: PAGINAS.max }).default(6),
  format: z.enum(['VERTICAL', 'PAGINA']).default('VERTICAL'),
  language: z.string({ max: 10 }).default('pt-BR'),
  quality_mode: z.enum(['ECONOMICO', 'EQUILIBRADO', 'PREMIUM']).default('ECONOMICO'),
});

export function getManga(id) { return get('SELECT * FROM mangas WHERE id = ?', [id]); }
export function getMangaBySlug(slug) { return get('SELECT * FROM mangas WHERE slug = ?', [slug]); }

export function listMangas({ status = null, challengeId = null, search = null, genre = null, network = null, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('m.status = ?'); params.push(status); }
  if (challengeId) { where.push('m.challenge_id = ?'); params.push(challengeId); }
  if (genre) { where.push('m.genre = ?'); params.push(genre); }
  if (network) { where.push('s.network = ?'); params.push(network); }
  if (search) { where.push('(LOWER(m.title) LIKE ? OR LOWER(m.synopsis) LIKE ?)'); params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  params.push(limit, offset);
  return all(`
    SELECT m.*, s.network AS network, s.author_pseudonym AS author_pseudonym, c.edition_number AS edition_number
    FROM mangas m
    LEFT JOIN submissions s ON s.id = m.submission_id
    LEFT JOIN challenges c ON c.id = m.challenge_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY COALESCE(m.published_at, m.created_at) DESC
    LIMIT ? OFFSET ?`, params);
}

export function countMangas(filters = {}) {
  const rows = listMangas({ ...filters, limit: 10000, offset: 0 });
  return rows.length;
}

export function listPublished(options = {}) {
  return listMangas({ ...options, status: 'PUBLISHED' });
}

/** Cria a obra a partir de um relato vencedor. Uma obra por relato. */
export function createMangaFromSubmission(submissionId, params = {}, { actor = 'admin' } = {}) {
  const submission = get('SELECT * FROM submissions WHERE id = ?', [submissionId]);
  if (!submission) throw Object.assign(new Error('Relato não encontrado.'), { statusCode: 404 });
  if (submission.status !== 'SELECTED') throw Object.assign(new Error('Somente relatos selecionados viram obra.'), { statusCode: 422 });
  const existing = get('SELECT * FROM mangas WHERE submission_id = ?', [submissionId]);
  if (existing) return existing;

  const data = mangaParamsSchema.parse({
    genre: submission.genre || params.genre,
    art_style: submission.art_style || params.art_style,
    narrative_tone: submission.narrative_tone || params.narrative_tone,
    visual_tone: submission.visual_tone || params.visual_tone,
    ...params,
  });
  const mode = qualityMode(data.quality_mode);
  const title = data.title || `Edição em preparo, ${submission.network}`;

  const id = insert('mangas', {
    ...data,
    title,
    slug: uniqueSlug('mangas', title),
    challenge_id: submission.challenge_id,
    submission_id: submissionId,
    page_min: data.page_min ?? mode.pages[0],
    page_max: Math.min(data.page_max ?? mode.pages[1], PAGINAS.max),
    status: 'RECEIVED',
    is_demo: submission.is_demo ? 1 : 0,
    credits_json: JSON.stringify({
      autor_pseudonimo: submission.author_pseudonym,
      rede_vencedora: submission.network,
      adaptacao: 'Roteiro e arte adaptados com apoio de inteligência artificial, sob curadoria editorial humana.',
    }),
    ai_disclosure: 'Esta obra é uma adaptação ilustrada criada com apoio de inteligência artificial e revisada por pessoas antes da publicação.',
  });
  audit('manga.created', { actor, entityType: 'manga', entityId: id, summary: `Obra criada a partir do relato ${submissionId}` });
  return getManga(id);
}

export function updateMangaParams(id, params, { actor = 'admin' } = {}) {
  const manga = getManga(id);
  if (!manga) throw Object.assign(new Error('Obra não encontrada.'), { statusCode: 404 });
  const data = mangaParamsSchema.parse({ ...manga, ...params });
  if (data.page_min > data.page_max) {
    throw Object.assign(new Error('Página mínima não pode ser maior que a máxima.'), { statusCode: 422 });
  }
  const patch = { ...data };
  if (data.title && data.title !== manga.title) patch.slug = uniqueSlug('mangas', data.title, { ignoreId: id });
  update('mangas', id, patch);
  invalidateApprovalsIfNeeded(manga, 'Parâmetros da obra alterados.', actor);
  audit('manga.params_updated', { actor, entityType: 'manga', entityId: id, summary: 'Parâmetros atualizados' });
  return getManga(id);
}

export function setStatus(id, status, { actor = 'admin', reason = null } = {}) {
  const manga = getManga(id);
  assertTransition(manga, status);
  update('mangas', id, { status, failure_reason: status === 'FAILED' ? reason : null });
  audit('manga.status', { actor, entityType: 'manga', entityId: id, summary: `${manga.status} → ${status}`, meta: { reason } });
  return getManga(id);
}

/* ------------------------------- roteiro -------------------------------- */

export function saveScriptVersion(mangaId, scriptRaw, { model = null, source = 'AI', note = null, actor = 'admin' } = {}) {
  const manga = getManga(mangaId);
  if (!manga) throw Object.assign(new Error('Obra não encontrada.'), { statusCode: 404 });
  const script = parseScript(scriptRaw, { maxPages: manga.page_max, minPages: 1 });

  return tx(() => {
    const last = get('SELECT MAX(version) AS v FROM script_versions WHERE manga_id = ?', [mangaId]);
    const version = (last?.v ?? 0) + 1;
    insert('script_versions', {
      manga_id: mangaId,
      version,
      script_json: JSON.stringify(script),
      model,
      source,
      note,
      created_by: actor,
    });
    update('mangas', mangaId, {
      title: script.titulo,
      slug: uniqueSlug('mangas', script.titulo, { ignoreId: mangaId }),
      synopsis: script.sinopse,
      status: canTransition(manga.status, 'SCRIPT_DRAFT') ? 'SCRIPT_DRAFT' : manga.status,
    });
    syncCharacters(mangaId, script);
    invalidateApprovalsIfNeeded(manga, 'Nova versão de roteiro.', actor);
    audit('script.saved', { actor, entityType: 'manga', entityId: mangaId, summary: `Roteiro v${version} salvo (${source})`, meta: { frames: countFrames(script) } });
    return { version, script };
  });
}

function syncCharacters(mangaId, script) {
  run('DELETE FROM characters WHERE manga_id = ?', [mangaId]);
  for (const c of script.personagens) {
    insert('characters', {
      manga_id: mangaId,
      ref_id: c.id,
      name: c.nome,
      role: c.papel,
      description: c.descricao,
      outfit: c.roupa,
      proportions: c.proporcoes,
      accessories: c.acessorios,
      palette: c.paleta,
      line_rules: c.regras_traco,
    });
  }
}

export function latestScript(mangaId) {
  const row = get('SELECT * FROM script_versions WHERE manga_id = ? ORDER BY version DESC LIMIT 1', [mangaId]);
  if (!row) return null;
  return { version: row.version, script: JSON.parse(row.script_json), row };
}

export function scriptVersions(mangaId) {
  return all('SELECT id, version, model, source, note, created_by, created_at FROM script_versions WHERE manga_id = ? ORDER BY version DESC', [mangaId]);
}

export function getScriptVersion(mangaId, version) {
  const row = get('SELECT * FROM script_versions WHERE manga_id = ? AND version = ?', [mangaId, version]);
  return row ? { version: row.version, script: JSON.parse(row.script_json), row } : null;
}

export function approveScript(mangaId, { actor = 'admin', note = '' } = {}) {
  const manga = getManga(mangaId);
  const latest = latestScript(mangaId);
  if (!latest) throw Object.assign(new Error('Não há roteiro para aprovar.'), { statusCode: 422 });
  assertTransition(manga, 'SCRIPT_APPROVED');
  return tx(() => {
    insert('approvals', {
      manga_id: mangaId, kind: 'SCRIPT', script_version: latest.version,
      manga_version: manga.version, approved_by: actor, approved_at: nowIso(), note,
    });
    update('mangas', mangaId, { status: 'SCRIPT_APPROVED' });
    audit('script.approved', { actor, entityType: 'manga', entityId: mangaId, summary: `Roteiro v${latest.version} aprovado` });
    return getManga(mangaId);
  });
}

/* -------------------------------- páginas -------------------------------- */

export function listPages(mangaId) {
  return all('SELECT * FROM pages WHERE manga_id = ? ORDER BY kind DESC, page_number ASC', [mangaId]);
}
export function storyPages(mangaId) {
  return all("SELECT * FROM pages WHERE manga_id = ? AND kind = 'STORY' ORDER BY page_number ASC", [mangaId]);
}
export function coverPage(mangaId) {
  return get("SELECT * FROM pages WHERE manga_id = ? AND kind = 'COVER' LIMIT 1", [mangaId]);
}
export function getPage(id) { return get('SELECT * FROM pages WHERE id = ?', [id]); }

/** Cria (ou reaproveita) o registro da página antes de gerar a imagem. */
export function ensurePage(mangaId, pageNumber, { kind = 'STORY', altText = '', panels = [], balloons = [] } = {}) {
  const existing = get('SELECT * FROM pages WHERE manga_id = ? AND page_number = ? AND kind = ?', [mangaId, pageNumber, kind]);
  if (existing) return existing;
  const id = insert('pages', {
    manga_id: mangaId,
    page_number: pageNumber,
    kind,
    alt_text: altText,
    panels_json: JSON.stringify(panels),
    balloons_json: JSON.stringify(balloons),
    status: 'PENDING',
  });
  return getPage(id);
}

/** Salva nova versão da página preservando o histórico para restauração. */
export function savePageVersion(pageId, patch, { note = 'Atualização', actor = 'admin' } = {}) {
  const page = getPage(pageId);
  if (!page) throw Object.assign(new Error('Página não encontrada.'), { statusCode: 404 });
  return tx(() => {
    insert('page_versions', {
      page_id: pageId,
      version: page.version,
      base_asset_id: page.base_asset_id,
      balloons_json: page.balloons_json,
      panels_json: page.panels_json,
      alt_text: page.alt_text,
      transcript: page.transcript,
      note,
    });
    update('pages', pageId, { ...patch, version: page.version + 1 });
    const manga = getManga(page.manga_id);
    invalidateApprovalsIfNeeded(manga, `Página ${page.page_number} alterada.`, actor);
    audit('page.updated', { actor, entityType: 'page', entityId: pageId, summary: note });
    return getPage(pageId);
  });
}

export function pageHistory(pageId) {
  return all('SELECT * FROM page_versions WHERE page_id = ? ORDER BY version DESC', [pageId]);
}

export function restorePageVersion(pageId, version, { actor = 'admin' } = {}) {
  const snapshot = get('SELECT * FROM page_versions WHERE page_id = ? AND version = ?', [pageId, version]);
  if (!snapshot) throw Object.assign(new Error('Versão não encontrada.'), { statusCode: 404 });
  return savePageVersion(pageId, {
    base_asset_id: snapshot.base_asset_id,
    balloons_json: snapshot.balloons_json,
    panels_json: snapshot.panels_json,
    alt_text: snapshot.alt_text,
    transcript: snapshot.transcript,
    status: 'READY',
  }, { note: `Restaurada versão ${version}`, actor });
}

export function reorderPages(mangaId, orderedPageIds, { actor = 'admin' } = {}) {
  return tx(() => {
    // Desloca para números temporários, evitando colisão com o índice único.
    orderedPageIds.forEach((pageId, i) => {
      run('UPDATE pages SET page_number = ? WHERE id = ? AND manga_id = ?', [-(i + 1), pageId, mangaId]);
    });
    orderedPageIds.forEach((pageId, i) => {
      run('UPDATE pages SET page_number = ? WHERE id = ? AND manga_id = ?', [i + 1, pageId, mangaId]);
    });
    refreshPageCount(mangaId);
    const manga = getManga(mangaId);
    invalidateApprovalsIfNeeded(manga, 'Ordem das páginas alterada.', actor);
    audit('page.reordered', { actor, entityType: 'manga', entityId: mangaId, summary: 'Páginas reordenadas' });
    return storyPages(mangaId);
  });
}

export function refreshPageCount(mangaId) {
  const row = get("SELECT COUNT(*) AS n FROM pages WHERE manga_id = ? AND kind = 'STORY' AND status = 'READY'", [mangaId]);
  update('mangas', mangaId, { page_count: row?.n ?? 0 });
  return row?.n ?? 0;
}

/* ------------------------------ aprovações ------------------------------ */

const APPROVAL_SENSITIVE = new Set(['AUTHOR_APPROVED', 'APPROVED', 'SCHEDULED', 'PUBLISHED']);

/** Alterações após aprovação invalidam a aprovação correspondente. */
export function invalidateApprovalsIfNeeded(manga, reason, actor = 'admin') {
  if (!manga || !APPROVAL_SENSITIVE.has(manga.status)) return false;
  run(`UPDATE approvals SET invalidated_at = ?, invalidated_reason = ?
       WHERE manga_id = ? AND invalidated_at IS NULL AND kind IN ('AUTHOR','EDITORIAL')`,
    [nowIso(), reason, manga.id]);
  if (manga.status !== 'PUBLISHED') {
    update('mangas', manga.id, { status: 'REVIEW', scheduled_at: null });
  }
  audit('approval.invalidated', { actor, entityType: 'manga', entityId: manga.id, summary: reason });
  return true;
}

export function activeApproval(mangaId, kind) {
  return get('SELECT * FROM approvals WHERE manga_id = ? AND kind = ? AND invalidated_at IS NULL ORDER BY approved_at DESC LIMIT 1', [mangaId, kind]);
}

export function registerAuthorApproval(mangaId, { actor = 'admin', note = '', evidence = '' } = {}) {
  const manga = getManga(mangaId);
  assertTransition(manga, 'AUTHOR_APPROVED');
  if (manga.page_count < 1) throw Object.assign(new Error('A obra ainda não tem páginas prontas.'), { statusCode: 422 });
  return tx(() => {
    insert('approvals', {
      manga_id: mangaId, kind: 'AUTHOR', manga_version: manga.version,
      approved_by: actor, approved_at: nowIso(), note: [note, evidence].filter(Boolean).join(' · ').slice(0, 400),
    });
    update('mangas', mangaId, { status: 'AUTHOR_APPROVED' });
    audit('approval.author', { actor, entityType: 'manga', entityId: mangaId, summary: 'Aprovação do autor registrada pelo admin' });
    return getManga(mangaId);
  });
}

export function approveForPublication(mangaId, { actor = 'admin', note = '' } = {}) {
  const manga = getManga(mangaId);
  assertTransition(manga, 'APPROVED');
  const submission = get('SELECT * FROM submissions WHERE id = ?', [manga.submission_id]);
  const guard = publicationGuard({ submission, manga });
  if (!guard.ok) throw Object.assign(new Error(guard.problems.join(' ')), { statusCode: 422, problems: guard.problems });
  if (!activeApproval(mangaId, 'AUTHOR')) throw Object.assign(new Error('Falta a aprovação do autor.'), { statusCode: 422 });
  return tx(() => {
    insert('approvals', { manga_id: mangaId, kind: 'EDITORIAL', manga_version: manga.version, approved_by: actor, approved_at: nowIso(), note });
    update('mangas', mangaId, { status: 'APPROVED' });
    audit('approval.editorial', { actor, entityType: 'manga', entityId: mangaId, summary: 'Aprovada para publicação' });
    return getManga(mangaId);
  });
}

/* ------------------------------ publicação ------------------------------ */

export function schedulePublication(mangaId, whenLocal, { actor = 'admin' } = {}) {
  const manga = getManga(mangaId);
  assertTransition(manga, 'SCHEDULED');
  const iso = editorialLocalToUtc(whenLocal);
  if (!iso) throw Object.assign(new Error('Data de agendamento inválida.'), { statusCode: 422 });
  update('mangas', mangaId, { status: 'SCHEDULED', scheduled_at: iso });
  audit('manga.scheduled', { actor, entityType: 'manga', entityId: mangaId, summary: `Agendada para ${iso}` });
  return getManga(mangaId);
}

/**
 * Publicação transacional: valida consentimento e aprovações, promove os
 * assets para público e grava a data. Sem autorização não há publicação.
 */
export async function publishManga(mangaId, { actor = 'admin', confirmed = false } = {}) {
  const manga = getManga(mangaId);
  if (!manga) throw Object.assign(new Error('Obra não encontrada.'), { statusCode: 404 });
  if (!confirmed) throw Object.assign(new Error('Confirmação explícita necessária para publicar.'), { statusCode: 428 });
  assertTransition(manga, 'PUBLISHED');

  const submission = get('SELECT * FROM submissions WHERE id = ?', [manga.submission_id]);
  const guard = publicationGuard({ submission, manga });
  if (!guard.ok) throw Object.assign(new Error(guard.problems.join(' ')), { statusCode: 422, problems: guard.problems });
  if (!activeApproval(mangaId, 'AUTHOR')) throw Object.assign(new Error('Falta a aprovação do autor.'), { statusCode: 422 });
  if (!activeApproval(mangaId, 'EDITORIAL')) throw Object.assign(new Error('Falta a aprovação editorial.'), { statusCode: 422 });

  const pages = listPages(mangaId).filter((p) => p.status === 'READY');
  if (!pages.length) throw Object.assign(new Error('A obra não possui páginas prontas.'), { statusCode: 422 });

  // Promoção dos arquivos é assíncrona; a transição de estado é atômica depois.
  for (const page of pages) {
    if (page.composite_asset_id) await promoteAssetToPublic(page.composite_asset_id);
    else if (page.base_asset_id) await promoteAssetToPublic(page.base_asset_id);
  }

  return tx(() => {
    update('mangas', mangaId, { status: 'PUBLISHED', published_at: nowIso(), unpublished_at: null, scheduled_at: null });
    audit('manga.published', { actor, entityType: 'manga', entityId: mangaId, summary: `Obra publicada (${pages.length} páginas)` });
    return getManga(mangaId);
  });
}

export function unpublishManga(mangaId, { actor = 'admin', reason = '' } = {}) {
  const manga = getManga(mangaId);
  assertTransition(manga, 'ARCHIVED');
  return tx(() => {
    update('mangas', mangaId, { status: 'ARCHIVED', unpublished_at: nowIso() });
    audit('manga.unpublished', { actor, entityType: 'manga', entityId: mangaId, summary: `Despublicada: ${reason || 'sem motivo informado'}` });
    return getManga(mangaId);
  });
}

export function abortGeneration(mangaId, { actor = 'admin' } = {}) {
  const cancelled = cancelPendingForManga(mangaId, { actor });
  const manga = getManga(mangaId);
  if (manga.status === 'GENERATING') {
    const target = storyPages(mangaId).some((p) => p.status === 'READY') ? 'REVIEW' : 'SCRIPT_APPROVED';
    update('mangas', mangaId, { status: target });
  }
  return cancelled;
}

export function mangaTranscript(mangaId) {
  const latest = latestScript(mangaId);
  return latest ? scriptTranscript(latest.script) : '';
}

export function mangaCredits(manga) {
  try { return JSON.parse(manga.credits_json || '{}'); } catch { return {}; }
}
