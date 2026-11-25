import { aiMode } from '../config/env.js';
import { audit } from '../core/audit.js';
import { get, insert, nowIso, run, update } from '../core/db.js';
import { stableHash } from '../core/ids.js';
import { putAsset } from '../core/storage.js';
import { layoutBalloons, panelGrid, PAGE_H, PAGE_W } from '../domain/balloons.js';
import { qualityMode } from '../domain/catalog.js';
import { budgetGate, estimateGeneration, recordUsage } from '../domain/costs.js';
import { completeJob, enqueue, failJob, setProgress } from '../domain/jobs.js';
import {
  ensurePage, getManga, getPage, latestScript, listPages, refreshPageCount,
  saveScriptVersion, setStatus, storyPages, coverPage, invalidateApprovalsIfNeeded,
} from '../domain/mangas.js';
import { countFrames, parseModelScript, parseScript } from '../domain/script.js';
import { buildDemoScript, renderDemoCover, renderDemoPage } from './demo.js';
import { generateImage, generateScript, OpenAiError } from './openai.js';
import {
  buildCharacterRefPrompt, buildCoverPrompt, buildPageImagePrompt,
  buildScriptUserPrompt, buildVisualBible, SCRIPT_SYSTEM_PROMPT,
} from './prompts.js';

const IMAGE_SIZE = '1024x1536';

/* ----------------------------- estimativas ------------------------------ */

export function estimateForManga(manga, { includeCover = true, perFrame = false, characterRefs = 0 } = {}) {
  const submission = get('SELECT * FROM submissions WHERE id = ?', [manga.submission_id]);
  const latest = latestScript(manga.id);
  const pages = latest ? latest.script.paginas.length : manga.page_min;
  return estimateGeneration({
    qualityModeKey: manga.quality_mode,
    pages,
    includeCover,
    characterRefs,
    perFrame,
    framesTotal: latest ? countFrames(latest.script) : 0,
    sourceChars: (submission?.comment_text?.length || 0) + (submission?.expanded_story?.length || 0),
  });
}

/* ------------------------- início das operações ------------------------- */

export function startScriptGeneration(mangaId, { actor = 'admin', confirmedUnknownCost = false, confirmedOverBudget = false } = {}) {
  const manga = getManga(mangaId);
  if (!manga) throw Object.assign(new Error('Obra não encontrada.'), { statusCode: 404 });
  const submission = get('SELECT * FROM submissions WHERE id = ?', [manga.submission_id]);
  if (!submission) throw Object.assign(new Error('Relato de origem não encontrado.'), { statusCode: 422 });
  if (submission.consent_status !== 'GRANTED') {
    throw Object.assign(new Error('Sem autorização do autor não é possível gerar.'), { statusCode: 422 });
  }

  const estimate = estimateForManga(manga, { includeCover: false });
  const gate = budgetGate({ mangaId, estimate: { ...estimate, calls: { ...estimate.calls, image: 0 }, imageCostUsd: 0 }, confirmedUnknownCost, confirmedOverBudget });
  if (!gate.allowed) throw Object.assign(new Error(gate.reasons.join(' ')), { statusCode: gate.requiresConfirmation ? 428 : 402, gate });

  const { job, reused } = enqueue({
    type: 'SCRIPT',
    mangaId,
    params: { quality: manga.quality_mode, pageMin: manga.page_min, pageMax: manga.page_max, submissionVersion: submission.updated_at },
    estimatedCostUsd: estimate.textCostUsd,
    costKnown: estimate.known,
    createdBy: actor,
    version: (latestScript(mangaId)?.version ?? 0) + 1,
  });
  return { job, reused, estimate };
}

/** Enfileira as imagens: uma chamada por página + capa (modo econômico). */
export function startImageGeneration(mangaId, {
  actor = 'admin', includeCover = true, perFrame = false,
  confirmedUnknownCost = false, confirmedOverBudget = false, onlyPageIds = null,
} = {}) {
  const manga = getManga(mangaId);
  if (!manga) throw Object.assign(new Error('Obra não encontrada.'), { statusCode: 404 });
  const latest = latestScript(mangaId);
  if (!latest) throw Object.assign(new Error('Gere e aprove o roteiro antes das imagens.'), { statusCode: 422 });
  if (!['SCRIPT_APPROVED', 'GENERATING', 'REVIEW', 'FAILED'].includes(manga.status)) {
    throw Object.assign(new Error('O roteiro precisa estar aprovado para gerar imagens.'), { statusCode: 409 });
  }

  const estimate = estimateForManga(manga, { includeCover, perFrame });
  const gate = budgetGate({ mangaId, estimate, confirmedUnknownCost, confirmedOverBudget });
  if (!gate.allowed) throw Object.assign(new Error(gate.reasons.join(' ')), { statusCode: gate.requiresConfirmation ? 428 : 402, gate });

  const jobs = [];
  for (const page of latest.script.paginas) {
    const row = ensurePage(mangaId, page.numero, { kind: 'STORY', altText: page.alt_text });
    if (onlyPageIds && !onlyPageIds.includes(row.id)) continue;
    jobs.push(enqueue({
      type: 'PAGE_IMAGE',
      mangaId,
      pageId: row.id,
      params: paramsForPage(manga, latest.script, page),
      estimatedCostUsd: estimate.known ? estimate.imageCostUsd / Math.max(1, estimate.calls.image) : null,
      costKnown: estimate.known,
      createdBy: actor,
      version: latest.version,
    }).job);
  }

  if (includeCover && !onlyPageIds) {
    const cover = ensurePage(mangaId, 0, { kind: 'COVER', altText: latest.script.capa.alt_text });
    jobs.push(enqueue({
      type: 'COVER_IMAGE',
      mangaId,
      pageId: cover.id,
      params: { quality: manga.quality_mode, scriptVersion: latest.version, prompt: latest.script.capa.prompt_visual },
      estimatedCostUsd: estimate.known ? estimate.imageCostUsd / Math.max(1, estimate.calls.image) : null,
      costKnown: estimate.known,
      createdBy: actor,
      version: latest.version,
    }).job);
  }

  if (manga.status !== 'GENERATING') setStatus(mangaId, 'GENERATING', { actor });
  audit('generation.started', { actor, entityType: 'manga', entityId: mangaId, summary: `${jobs.length} tarefa(s) de imagem enfileiradas`, meta: { mode: aiMode(), includeCover, perFrame } });
  return { jobs, estimate };
}

function paramsForPage(manga, script, page) {
  return {
    quality: manga.quality_mode,
    colorMode: manga.color_mode,
    artStyle: manga.art_style,
    scriptVersion: script.quantidade_paginas,
    pageNumber: page.numero,
    framesHash: stableHash(page.quadros.map((f) => ({ a: f.acao, p: f.prompt_visual, e: f.enquadramento }))),
  };
}

/** Regenera apenas uma página; as demais permanecem intactas. */
export function regeneratePage(pageId, { actor = 'admin', confirmedUnknownCost = false, confirmedOverBudget = false } = {}) {
  const page = getPage(pageId);
  if (!page) throw Object.assign(new Error('Página não encontrada.'), { statusCode: 404 });
  const manga = getManga(page.manga_id);
  const latest = latestScript(manga.id);
  if (!latest) throw Object.assign(new Error('Roteiro ausente.'), { statusCode: 422 });

  const estimate = estimateGeneration({
    qualityModeKey: manga.quality_mode, pages: 1, includeCover: false, sourceChars: 0,
  });
  const gate = budgetGate({ mangaId: manga.id, estimate, confirmedUnknownCost, confirmedOverBudget });
  if (!gate.allowed) throw Object.assign(new Error(gate.reasons.join(' ')), { statusCode: gate.requiresConfirmation ? 428 : 402, gate });

  const isCover = page.kind === 'COVER';
  const scriptPage = latest.script.paginas.find((p) => p.numero === page.page_number);
  const { job } = enqueue({
    type: isCover ? 'COVER_IMAGE' : 'PAGE_IMAGE',
    mangaId: manga.id,
    pageId,
    params: isCover
      ? { quality: manga.quality_mode, scriptVersion: latest.version, prompt: latest.script.capa.prompt_visual, regen: page.version }
      : { ...paramsForPage(manga, latest.script, scriptPage || { numero: page.page_number, quadros: [] }), regen: page.version },
    estimatedCostUsd: estimate.known ? estimate.imageCostUsd : null,
    costKnown: estimate.known,
    createdBy: actor,
    version: `${latest.version}-r${page.version}`,
  });
  update('pages', pageId, { status: 'PENDING', failure_reason: null });
  if (['REVIEW', 'AUTHOR_APPROVED', 'APPROVED', 'SCHEDULED'].includes(manga.status)) {
    invalidateApprovalsIfNeeded(manga, `Página ${page.page_number} será regerada.`, actor);
  }
  audit('page.regenerate', { actor, entityType: 'page', entityId: pageId, summary: `Regeração solicitada (página ${page.page_number})` });
  return { job, estimate };
}

export function startCharacterReference(mangaId, characterId, { actor = 'admin', confirmedUnknownCost = false, confirmedOverBudget = false } = {}) {
  const manga = getManga(mangaId);
  const mode = qualityMode(manga.quality_mode);
  if (!mode.allowCharacterRef) {
    throw Object.assign(new Error(`O modo ${mode.label} não inclui referência de personagem. Mude para Equilibrado ou Premium.`), { statusCode: 422 });
  }
  const estimate = estimateGeneration({ qualityModeKey: manga.quality_mode, pages: 0, includeCover: false, characterRefs: 1 });
  const gate = budgetGate({ mangaId, estimate, confirmedUnknownCost, confirmedOverBudget });
  if (!gate.allowed) throw Object.assign(new Error(gate.reasons.join(' ')), { statusCode: gate.requiresConfirmation ? 428 : 402, gate });

  const { job } = enqueue({
    type: 'CHARACTER_REF', mangaId, characterId,
    params: { characterId, quality: manga.quality_mode },
    estimatedCostUsd: estimate.imageCostUsd, costKnown: estimate.known, createdBy: actor,
  });
  return { job, estimate };
}

/* --------------------------- execução dos jobs -------------------------- */

export async function executeJob(job) {
  switch (job.type) {
    case 'SCRIPT': return runScriptJob(job);
    case 'PAGE_IMAGE': return runPageImageJob(job);
    case 'COVER_IMAGE': return runCoverJob(job);
    case 'CHARACTER_REF': return runCharacterRefJob(job);
    default: throw Object.assign(new Error(`Tipo de job não suportado: ${job.type}`), { fatal: true });
  }
}

async function runScriptJob(job) {
  const manga = getManga(job.manga_id);
  const submission = get('SELECT * FROM submissions WHERE id = ?', [manga.submission_id]);
  const challenge = get('SELECT * FROM challenges WHERE id = ?', [manga.challenge_id]);
  setProgress(job.id, 15, { label: 'montando o prompt' });

  const mode = qualityMode(manga.quality_mode);
  const minPages = Math.max(1, Math.min(manga.page_min, mode.pages[0]));
  const maxPages = Math.min(manga.page_max, mode.pages[1], 8);

  let script;
  let model = 'demo-local';
  let usage = { input: null, output: null };

  if (aiMode() === 'demo') {
    setProgress(job.id, 55, { label: 'gerando roteiro de demonstração' });
    script = parseScript(buildDemoScript({ submission, manga, pages: Math.max(minPages, Math.min(maxPages, 4)) }), { maxPages, minPages });
  } else {
    const userPrompt = buildScriptUserPrompt({ submission, manga, challenge, maxPages, minPages });
    setProgress(job.id, 35, { label: 'consultando o modelo de texto' });
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await generateScript({
        systemPrompt: SCRIPT_SYSTEM_PROMPT,
        userPrompt: attempt === 1 ? userPrompt : `${userPrompt}\n\nATENÇÃO: a resposta anterior era inválida (${lastError}). Responda somente com o JSON exigido.`,
      });
      model = res.model;
      usage = res.usage;
      recordUsage({
        jobId: job.id, mangaId: manga.id, kind: 'TEXT', model: res.model,
        inputTokens: usage.input, outputTokens: usage.output,
        estimatedCostUsd: job.estimated_cost_usd, status: 'OK',
      });
      const parsed = parseModelScript(res.text, { maxPages, minPages });
      if (parsed.ok) { script = parsed.script; break; }
      lastError = parsed.error;
      setProgress(job.id, 60, { label: 'reparando resposta do modelo' });
    }
    if (!script) throw Object.assign(new Error(`O modelo não devolveu um roteiro válido: ${lastError}`), { fatal: false });
  }

  setProgress(job.id, 85, { label: 'salvando roteiro' });
  const saved = saveScriptVersion(manga.id, script, { model, source: aiMode() === 'demo' ? 'DEMO' : 'AI', actor: job.created_by });
  if (aiMode() === 'demo') {
    recordUsage({ jobId: job.id, mangaId: manga.id, kind: 'TEXT', model: 'demo-local', status: 'OK', mode: 'demo' });
  }
  return { scriptVersion: saved.version, pages: script.paginas.length, frames: countFrames(script) };
}

async function renderOrGenerateBase({ job, manga, script, page, scriptPage }) {
  const visualBible = buildVisualBible({ manga, script });

  if (aiMode() === 'demo') {
    const svg = renderDemoPage({
      frames: scriptPage.quadros,
      colorMode: manga.color_mode,
      seed: `${manga.id}:${page.page_number}:${page.version}`,
      altText: scriptPage.alt_text,
    });
    const asset = await putAsset(Buffer.from(svg, 'utf8'), {
      mime: 'image/svg+xml', visibility: 'private', origin: 'demo',
      width: PAGE_W, height: PAGE_H, prefix: `mangas/${manga.id}`,
    });
    recordUsage({ jobId: job.id, mangaId: manga.id, kind: 'IMAGE', model: 'demo-local', imagesCount: 1, status: 'OK', mode: 'demo' });
    return asset;
  }

  const prompt = buildPageImagePrompt({ manga, script, page: scriptPage, visualBible });
  const quality = qualityMode(manga.quality_mode).imageQuality;
  const res = await generateImage({ prompt, size: IMAGE_SIZE, quality });
  const asset = await putAsset(res.buffer, {
    mime: res.mime, visibility: 'private', origin: 'openai',
    width: PAGE_W, height: PAGE_H, prefix: `mangas/${manga.id}`,
  });
  recordUsage({
    jobId: job.id, mangaId: manga.id, kind: 'IMAGE', model: res.model,
    params: { quality, size: IMAGE_SIZE }, imagesCount: 1,
    estimatedCostUsd: job.estimated_cost_usd, status: 'OK',
  });
  return asset;
}

async function runPageImageJob(job) {
  const manga = getManga(job.manga_id);
  const page = getPage(job.page_id);
  const latest = latestScript(manga.id);
  if (!latest) throw Object.assign(new Error('Roteiro ausente.'), { fatal: true });
  const scriptPage = latest.script.paginas.find((p) => p.numero === page.page_number);
  if (!scriptPage) throw Object.assign(new Error(`Página ${page.page_number} não existe no roteiro.`), { fatal: true });

  update('pages', page.id, { status: 'GENERATING', failure_reason: null });
  setProgress(job.id, 30, { label: `desenhando a página ${page.page_number}` });

  const asset = await renderOrGenerateBase({ job, manga, script: latest.script, page, scriptPage });

  setProgress(job.id, 75, { label: 'posicionando balões' });
  const rects = panelGrid(scriptPage.quadros.length);
  const balloons = layoutBalloons(scriptPage.quadros, rects);

  update('pages', page.id, {
    base_asset_id: asset.id,
    panels_json: JSON.stringify(rects),
    balloons_json: JSON.stringify(balloons),
    alt_text: scriptPage.alt_text,
    transcript: frameTranscript(scriptPage, latest.script),
    status: 'READY',
    origin: aiMode() === 'demo' ? 'demo' : 'openai',
    params_hash: job.idempotency_key,
  });
  refreshPageCount(manga.id);
  return { pageId: page.id, assetId: asset.id, balloons: balloons.length };
}

async function runCoverJob(job) {
  const manga = getManga(job.manga_id);
  const page = getPage(job.page_id);
  const latest = latestScript(manga.id);
  const submission = get('SELECT * FROM submissions WHERE id = ?', [manga.submission_id]);
  const challenge = get('SELECT * FROM challenges WHERE id = ?', [manga.challenge_id]);

  update('pages', page.id, { status: 'GENERATING', failure_reason: null });
  setProgress(job.id, 40, { label: 'desenhando a capa' });

  let asset;
  if (aiMode() === 'demo') {
    const svg = renderDemoCover({
      title: latest.script.titulo,
      author: submission?.author_pseudonym,
      network: submission?.network,
      edition: challenge?.edition_number,
      colorMode: manga.color_mode,
      seed: `${manga.id}:capa:${page.version}`,
      altText: latest.script.capa.alt_text,
    });
    asset = await putAsset(Buffer.from(svg, 'utf8'), {
      mime: 'image/svg+xml', visibility: 'private', origin: 'demo',
      width: PAGE_W, height: PAGE_H, prefix: `mangas/${manga.id}`,
    });
    recordUsage({ jobId: job.id, mangaId: manga.id, kind: 'IMAGE', model: 'demo-local', imagesCount: 1, status: 'OK', mode: 'demo' });
  } else {
    const prompt = buildCoverPrompt({ manga, script: latest.script, visualBible: buildVisualBible({ manga, script: latest.script }) });
    const quality = qualityMode(manga.quality_mode).imageQuality;
    const res = await generateImage({ prompt, size: IMAGE_SIZE, quality });
    asset = await putAsset(res.buffer, { mime: res.mime, visibility: 'private', origin: 'openai', width: PAGE_W, height: PAGE_H, prefix: `mangas/${manga.id}` });
    recordUsage({ jobId: job.id, mangaId: manga.id, kind: 'IMAGE', model: res.model, params: { quality, size: IMAGE_SIZE }, imagesCount: 1, estimatedCostUsd: job.estimated_cost_usd, status: 'OK' });
  }

  update('pages', page.id, {
    base_asset_id: asset.id,
    alt_text: latest.script.capa.alt_text,
    status: 'READY',
    origin: aiMode() === 'demo' ? 'demo' : 'openai',
    params_hash: job.idempotency_key,
  });
  update('mangas', manga.id, { cover_page_id: page.id });
  return { pageId: page.id, assetId: asset.id, cover: true };
}

async function runCharacterRefJob(job) {
  const manga = getManga(job.manga_id);
  const character = get('SELECT * FROM characters WHERE id = ?', [job.character_id]);
  if (!character) throw Object.assign(new Error('Personagem não encontrado.'), { fatal: true });
  const latest = latestScript(manga.id);
  const visualBible = buildVisualBible({ manga, script: latest.script });

  let asset;
  if (aiMode() === 'demo') {
    const svg = renderDemoCover({
      title: character.name, author: 'referência de personagem', network: 'interno',
      edition: 's/n', colorMode: manga.color_mode, seed: `${character.id}:ref`,
      altText: `Referência de ${character.name}`,
    });
    asset = await putAsset(Buffer.from(svg, 'utf8'), { mime: 'image/svg+xml', visibility: 'private', origin: 'demo', prefix: `mangas/${manga.id}/refs` });
    recordUsage({ jobId: job.id, mangaId: manga.id, kind: 'IMAGE', model: 'demo-local', imagesCount: 1, mode: 'demo' });
  } else {
    const res = await generateImage({
      prompt: buildCharacterRefPrompt({ character: { nome: character.name, descricao: character.description, roupa: character.outfit, acessorios: character.accessories }, visualBible }),
      size: IMAGE_SIZE,
      quality: qualityMode(manga.quality_mode).imageQuality,
    });
    asset = await putAsset(res.buffer, { mime: res.mime, visibility: 'private', origin: 'openai', prefix: `mangas/${manga.id}/refs` });
    recordUsage({ jobId: job.id, mangaId: manga.id, kind: 'IMAGE', model: res.model, imagesCount: 1, params: { quality: qualityMode(manga.quality_mode).imageQuality }, estimatedCostUsd: job.estimated_cost_usd });
  }
  update('characters', character.id, { ref_asset_id: asset.id });
  return { characterId: character.id, assetId: asset.id };
}

/** Quando todas as páginas estiverem prontas, a obra vai para revisão. */
function maybeFinishGeneration(mangaId) {
  if (!mangaId) return false;
  const manga = getManga(mangaId);
  if (!manga || manga.status !== 'GENERATING') return false;
  const pending = get("SELECT COUNT(*) AS n FROM generation_jobs WHERE manga_id = ? AND status IN ('QUEUED','RUNNING') AND type IN ('PAGE_IMAGE','COVER_IMAGE')", [mangaId]);
  if ((pending?.n ?? 0) > 0) return false;
  const ready = listPages(mangaId).filter((p) => p.status === 'READY');
  if (!ready.length) {
    setStatus(mangaId, 'FAILED', { actor: 'worker', reason: 'Nenhuma página foi gerada com sucesso.' });
    return false;
  }
  setStatus(mangaId, 'REVIEW', { actor: 'worker' });
  return true;
}

function frameTranscript(scriptPage, script) {
  const who = (id) => script.personagens.find((c) => c.id === id)?.nome || 'Personagem';
  return scriptPage.quadros.map((f) => {
    const lines = [];
    if (f.narrador) lines.push(`Narração: ${f.narrador}`);
    for (const d of f.dialogos) lines.push(`${who(d.personagem_id)}: ${d.texto}`);
    if (f.efeitos_sonoros?.length) lines.push(`Efeitos: ${f.efeitos_sonoros.join(', ')}`);
    return `Quadro ${f.ordem}: ${f.alt_text}${lines.length ? `\n${lines.join('\n')}` : ''}`;
  }).join('\n\n');
}

export { maybeFinishGeneration, OpenAiError };
