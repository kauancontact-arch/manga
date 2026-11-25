import { aiMode, aiModeBlockers, env } from '../config/env.js';
import { audit, recentAudit } from '../core/audit.js';
import {
  authenticate, checkPasswordStrength, createSession, destroySession,
  hashPassword, listAdmins, rateLimit, clearRateLimit, SESSION_COOKIE, verifyPassword,
} from '../core/auth.js';
import { all, get, update } from '../core/db.js';
import { html } from '../core/html.js';
import { allSettings, setSetting } from '../core/settings.js';
import { sha256 } from '../core/ids.js';
import {
  createChallenge, currentChallenge, getChallenge, listChallenges,
  nextEditionNumber, slotStatus, updateChallenge,
} from '../domain/challenges.js';
import { ART_STYLES, GENRES, QUALITY_MODES } from '../domain/catalog.js';
import { CARD_SIZES, renderCard } from '../domain/cards.js';
import { formatUsd, mangaSpend, monthSpend, priceTable, usageHistory } from '../domain/costs.js';
import { listJobs, mangaJobSummary } from '../domain/jobs.js';
import {
  abortGeneration, activeApproval, approveForPublication, approveScript,
  coverPage, createMangaFromSubmission, getManga, getPage, latestScript,
  listMangas, listPages, pageHistory, publishManga, registerAuthorApproval,
  reorderPages, restorePageVersion, savePageVersion, saveScriptVersion,
  schedulePublication, scriptVersions, storyPages, unpublishManga, updateMangaParams,
} from '../domain/mangas.js';
import {
  addEntry, autoFill, createMagazine, getMagazine, listMagazines,
  magazineEntries, publishMagazine, removeEntry, scheduleMagazine,
} from '../domain/magazines.js';
import { sanitizeBalloons } from '../domain/balloons.js';
import {
  buildScript, buildXCopy, nextPreset, saveSocialScript, socialHistory,
  THEME_PRESETS, WPM_OPTIONS,
} from '../domain/social.js';
import {
  createSubmission, eligibilityProblems, getSubmission, listSubmissions,
  releaseSlot, selectWinner, updateSubmission,
} from '../domain/submissions.js';
import { screenContent } from '../domain/safety.js';
import { estimateForManga, regeneratePage, startImageGeneration, startScriptGeneration } from '../ai/pipeline.js';
import { checkConnection, connectionStatus } from '../ai/openai.js';
import { adminLayout, readFlash } from './views/layout.js';
import * as A from './views/admin.js';

/* ------------------------------ utilidades ------------------------------ */

function requireAdmin(handler) {
  return async (ctx) => {
    if (!ctx.user) {
      const next = encodeURIComponent(ctx.url.pathname + ctx.url.search);
      return ctx.redirect(`/admin/entrar?next=${next}`, 302);
    }
    return handler(ctx);
  };
}

function page(ctx, { title, subtitle = '', body, actions = null }) {
  ctx.html(adminLayout({ title, subtitle, body, ctx, pathname: ctx.pathname, actions, flash: readFlash(ctx) }));
}

function aiStatus() {
  return { ...connectionStatus(), mode: aiMode(), blockers: aiModeBlockers() };
}

const bool = (v) => v === '1' || v === 'on' || v === 'true' || v === true;

/* -------------------------------- rotas --------------------------------- */

export function registerAdminRoutes(router) {
  /* ------------------------------- login -------------------------------- */

  router.get('/admin/entrar', (ctx) => {
    if (ctx.user) return ctx.redirect('/admin');
    ctx.html(A.loginView({ error: ctx.query.erro || null, nonce: ctx.nonce }));
  }, { skipCsrf: true });

  router.post('/admin/entrar', async (ctx) => {
    const limiter = rateLimit('login', ctx.ip, { limit: 8, windowMs: 1000 * 60 * 10 });
    if (!limiter.allowed) {
      return ctx.html(A.loginView({ error: `Muitas tentativas. Tente novamente em ${Math.ceil(limiter.retryAfterSec / 60)} minuto(s).` }), 429);
    }
    const username = String(ctx.fields.username || '').trim();
    const password = String(ctx.fields.password || '');
    const result = authenticate(username, password);
    if (!result.ok) {
      audit('auth.failed', { actor: username || 'desconhecido', summary: `Falha de login (${result.reason})`, ip: ctx.ip });
      const message = result.reason === 'LOCKED'
        ? 'Conta temporariamente bloqueada por excesso de tentativas. Aguarde 15 minutos.'
        : 'Usuário ou senha inválidos.';
      return ctx.html(A.loginView({ error: message, username }), 401);
    }
    clearRateLimit('login', ctx.ip);
    const { token, expiresAt } = createSession(result.user.id, { userAgent: ctx.req.headers['user-agent'], ipHash: sha256(ctx.ip).slice(0, 24) });
    ctx.setCookie(SESSION_COOKIE, token, { expires: expiresAt, sameSite: 'Lax', secure: env.isProd, httpOnly: true });
    audit('auth.success', { actor: result.user.username, summary: 'Login realizado', ip: ctx.ip });
    const next = typeof ctx.fields.next === 'string' && ctx.fields.next.startsWith('/admin') ? ctx.fields.next : '/admin';
    ctx.redirect(next);
  }, { skipCsrf: true });

  router.post('/admin/sair', requireAdmin((ctx) => {
    destroySession(ctx.cookies[SESSION_COOKIE]);
    ctx.clearCookie(SESSION_COOKIE);
    audit('auth.logout', { actor: ctx.user.username, summary: 'Sessão encerrada' });
    ctx.redirect('/admin/entrar');
  }));

  /* ------------------------------ dashboard ----------------------------- */

  router.get('/admin', requireAdmin((ctx) => {
    const challenge = currentChallenge();
    const slots = challenge ? slotStatus(challenge.id) : [];
    const queue = listJobs({ status: 'QUEUED' }).concat(listJobs({ status: 'RUNNING' }));
    const reviewQueue = listMangas({ status: 'REVIEW', limit: 20 }).concat(listMangas({ status: 'AUTHOR_APPROVED', limit: 20 }));
    const scheduled = listMangas({ status: 'SCHEDULED', limit: 20 });
    const failures = listJobs({ status: 'FAILED', limit: 5 });
    const stats = { published: listMangas({ status: 'PUBLISHED', limit: 1000 }).length };

    page(ctx, {
      title: 'Visão geral',
      subtitle: challenge ? `Edição ${challenge.edition_number} · ${challenge.theme}` : 'Nenhuma edição em andamento',
      body: A.dashboardView({
        challenge, slots, stats, queue, reviewQueue, scheduled, failures,
        spend: { month: monthSpend(), monthlyBudget: env.budget.monthlyUsd },
        aiStatus: aiStatus(),
        recentAudit: recentAudit(8),
      }),
    });
  }));

  /* ------------------------------ desafios ------------------------------ */

  router.get('/admin/desafios', requireAdmin((ctx) => {
    page(ctx, { title: 'Desafios', subtitle: 'O tema da semana vai igual para as três redes.', body: A.challengeListView({ challenges: listChallenges() }) });
  }));

  router.get('/admin/desafios/novo', requireAdmin((ctx) => {
    page(ctx, {
      title: 'Novo desafio',
      body: A.challengeFormView({ ctx, challenge: null, slots: [], suggestedEdition: nextEditionNumber(), presets: THEME_PRESETS }),
    });
  }));

  router.post('/admin/desafios', requireAdmin((ctx) => {
    const challenge = createChallenge(normalizeChallenge(ctx.fields));
    audit('challenge.created', { actor: ctx.user.username, entityType: 'challenge', entityId: challenge.id, summary: `Edição ${challenge.edition_number} criada` });
    ctx.flash(`/admin/desafios/${challenge.id}`, 'ok', 'Desafio criado.');
  }));

  router.get('/admin/desafios/:id', requireAdmin((ctx) => {
    const challenge = getChallenge(ctx.params.id);
    if (!challenge) return ctx.text('Desafio não encontrado', 404);
    page(ctx, {
      title: `Edição ${challenge.edition_number}`,
      subtitle: challenge.theme,
      body: A.challengeFormView({ ctx, challenge, slots: slotStatus(challenge.id), suggestedEdition: challenge.edition_number, presets: THEME_PRESETS }),
    });
  }));

  router.post('/admin/desafios/:id', requireAdmin((ctx) => {
    const challenge = updateChallenge(ctx.params.id, normalizeChallenge(ctx.fields));
    audit('challenge.updated', { actor: ctx.user.username, entityType: 'challenge', entityId: challenge.id, summary: 'Desafio atualizado' });
    ctx.flash(`/admin/desafios/${challenge.id}`, 'ok', 'Alterações salvas.');
  }));

  /* -------------------------- roteiros sociais -------------------------- */

  router.get('/admin/roteiros-sociais', requireAdmin((ctx) => {
    const challenges = listChallenges({ limit: 30 });
    const challengeId = ctx.query.edicao || '';
    const challenge = challengeId ? getChallenge(challengeId) : null;
    const preset = THEME_PRESETS.find((p) => p.key === ctx.query.preset);
    const theme = (ctx.query.tema || '').trim() || preset?.text || challenge?.theme || '';
    const wpm = WPM_OPTIONS.includes(Number(ctx.query.wpm)) ? Number(ctx.query.wpm) : 150;
    const settings = allSettings();

    const built = theme ? buildScript(theme, wpm) : null;
    const xCopy = theme ? buildXCopy(theme, { rulesUrl: challenge?.rules_url || settings.rules_url }) : null;

    page(ctx, {
      title: 'Gerador de roteiros sociais',
      subtitle: 'Copy aprovada, reproduzida literalmente. Só o tema muda, sem chamada de IA.',
      body: A.socialView({
        ctx, built, xCopy, presets: THEME_PRESETS, wpmOptions: WPM_OPTIONS,
        selectedWpm: wpm, theme, history: socialHistory(12), challenges, challengeId,
      }),
    });
  }));

  router.post('/admin/roteiros-sociais', requireAdmin((ctx) => {
    const theme = String(ctx.fields.tema || '').trim();
    if (!theme) return ctx.flash('/admin/roteiros-sociais', 'erro', 'Informe o tema.');
    const saved = saveSocialScript({
      challengeId: ctx.fields.edicao || null,
      theme,
      wpm: Number(ctx.fields.wpm) || 150,
      xCopy: ctx.fields.x_copy || null,
      createdBy: ctx.user.username,
    });
    audit('social.saved', { actor: ctx.user.username, entityType: 'social_script', entityId: saved.id, summary: `Roteiro salvo (${saved.words} palavras)` });
    ctx.flash(`/admin/roteiros-sociais?tema=${encodeURIComponent(theme)}&wpm=${saved.wpm}`, 'ok', 'Roteiro salvo no histórico.');
  }));

  /* ------------------------------- relatos ------------------------------ */

  router.get('/admin/relatos', requireAdmin((ctx) => {
    page(ctx, {
      title: 'Relatos vencedores',
      subtitle: 'Registro manual da apuração. Uma vaga por rede, por edição.',
      body: A.submissionListView({
        submissions: listSubmissions({ challengeId: ctx.query.edicao || null, network: ctx.query.rede || null }),
        challenges: listChallenges({ limit: 30 }),
        filters: { edicao: ctx.query.edicao, rede: ctx.query.rede },
      }),
    });
  }));

  router.get('/admin/relatos/novo', requireAdmin((ctx) => {
    const challenges = listChallenges({ limit: 30 });
    page(ctx, {
      title: 'Registrar relato vencedor',
      body: A.submissionFormView({
        ctx, submission: null, challenges, screen: null, eligibility: [], manga: null,
        defaults: { challenge_id: ctx.query.edicao || challenges[0]?.id, network: ctx.query.rede || 'INSTAGRAM' },
      }),
    });
  }));

  router.post('/admin/relatos', requireAdmin((ctx) => {
    const { submission, screen } = createSubmission(normalizeSubmission(ctx.fields), { actor: ctx.user.username });
    const msg = screen.requiresReview ? 'Relato registrado e enviado para revisão de conteúdo.' : 'Relato registrado.';
    ctx.flash(`/admin/relatos/${submission.id}`, screen.requiresReview ? 'aviso' : 'ok', msg);
  }));

  router.get('/admin/relatos/:id', requireAdmin((ctx) => {
    const submission = getSubmission(ctx.params.id);
    if (!submission) return ctx.text('Relato não encontrado', 404);
    const manga = get('SELECT * FROM mangas WHERE submission_id = ?', [submission.id]);
    page(ctx, {
      title: 'Relato vencedor',
      subtitle: `${submission.network} · edição ${getChallenge(submission.challenge_id)?.edition_number ?? 'não informada'}`,
      body: A.submissionFormView({
        ctx, submission, challenges: listChallenges({ limit: 30 }),
        screen: screenContent(`${submission.comment_text}\n${submission.expanded_story || ''}`),
        eligibility: eligibilityProblems(submission),
        manga,
      }),
    });
  }));

  router.post('/admin/relatos/:id', requireAdmin((ctx) => {
    const { submission } = updateSubmission(ctx.params.id, normalizeSubmission(ctx.fields), { actor: ctx.user.username });
    ctx.flash(`/admin/relatos/${submission.id}`, 'ok', 'Relato atualizado.');
  }));

  router.post('/admin/relatos/:id/selecionar', requireAdmin((ctx) => {
    try {
      selectWinner(ctx.params.id, { actor: ctx.user.username });
      ctx.flash(`/admin/relatos/${ctx.params.id}`, 'ok', 'Relato definido como vencedor da vaga.');
    } catch (err) {
      // Vaga ocupada, participante repetido ou pendência de elegibilidade:
      // são decisões editoriais, não erros de sistema.
      ctx.flash(`/admin/relatos/${ctx.params.id}`, 'erro', err.message);
    }
  }));

  router.post('/admin/relatos/:id/liberar', requireAdmin((ctx) => {
    const { next } = releaseSlot(ctx.params.id, {
      reason: String(ctx.fields.reason || ''), status: String(ctx.fields.status || 'NO_RESPONSE'), actor: ctx.user.username,
    });
    ctx.flash(next ? `/admin/relatos/${next.id}` : '/admin/relatos', 'aviso',
      next ? 'Vaga liberada. Este é o próximo elegível da mesma rede.' : 'Vaga liberada. Não há próximo elegível registrado nesta rede.');
  }));

  router.post('/admin/relatos/:id/criar-obra', requireAdmin((ctx) => {
    const settings = allSettings();
    const manga = createMangaFromSubmission(ctx.params.id, { quality_mode: settings.default_quality_mode }, { actor: ctx.user.username });
    ctx.flash(`/admin/estudio/${manga.id}`, 'ok', 'Obra criada. Comece pelo roteiro.');
  }));

  /* ------------------------------- estúdio ------------------------------ */

  router.get('/admin/estudio', requireAdmin((ctx) => {
    page(ctx, {
      title: 'Estúdio de mangás',
      subtitle: 'Roteiro, parâmetros e geração de páginas.',
      body: A.studioListView({ mangas: listMangas({ limit: 100 }) }),
    });
  }));

  router.get('/admin/estudio/:id', requireAdmin((ctx) => {
    const manga = getManga(ctx.params.id);
    if (!manga) return ctx.text('Obra não encontrada', 404);
    page(ctx, {
      title: manga.title,
      subtitle: 'Estúdio',
      body: A.studioView({
        ctx, manga,
        submission: manga.submission_id ? getSubmission(manga.submission_id) : null,
        challenge: manga.challenge_id ? getChallenge(manga.challenge_id) : null,
        script: latestScript(manga.id),
        scriptVersions: scriptVersions(manga.id),
        estimate: estimateForManga(manga),
        jobSummary: mangaJobSummary(manga.id),
        pages: listPages(manga.id),
        approvals: {},
        aiStatus: aiStatus(),
      }),
    });
  }));

  router.post('/admin/estudio/:id/parametros', requireAdmin((ctx) => {
    updateMangaParams(ctx.params.id, {
      genre: ctx.fields.genre, art_style: ctx.fields.art_style, narrative_tone: ctx.fields.narrative_tone,
      visual_tone: ctx.fields.visual_tone, humor_intensity: ctx.fields.humor_intensity, fidelity: ctx.fields.fidelity,
      color_mode: ctx.fields.color_mode, panel_density: ctx.fields.panel_density, format: ctx.fields.format,
      page_min: ctx.fields.page_min, page_max: ctx.fields.page_max, quality_mode: ctx.fields.quality_mode,
    }, { actor: ctx.user.username });
    ctx.flash(`/admin/estudio/${ctx.params.id}`, 'ok', 'Parâmetros salvos.');
  }));

  router.post('/admin/estudio/:id/roteiro/gerar', requireAdmin((ctx) => {
    try {
      startScriptGeneration(ctx.params.id, {
        actor: ctx.user.username,
        confirmedUnknownCost: bool(ctx.fields.confirmar_custo),
        confirmedOverBudget: bool(ctx.fields.confirmar_orcamento),
      });
      ctx.flash(`/admin/estudio/${ctx.params.id}`, 'ok', 'Geração de roteiro enfileirada.');
    } catch (err) {
      ctx.flash(`/admin/estudio/${ctx.params.id}`, 'erro', err.message);
    }
  }));

  router.post('/admin/estudio/:id/roteiro', requireAdmin((ctx) => {
    const current = latestScript(ctx.params.id);
    if (!current) return ctx.flash(`/admin/estudio/${ctx.params.id}`, 'erro', 'Não há roteiro para editar.');
    let draft = current.script;
    if (ctx.fields.script_json) {
      try { draft = JSON.parse(ctx.fields.script_json); }
      catch { return ctx.flash(`/admin/estudio/${ctx.params.id}`, 'erro', 'JSON do roteiro inválido.'); }
    }
    draft.titulo = String(ctx.fields.titulo || draft.titulo);
    draft.sinopse = String(ctx.fields.sinopse || draft.sinopse);
    try {
      saveScriptVersion(ctx.params.id, draft, { source: 'HUMAN', actor: ctx.user.username, note: 'Edição manual' });
      ctx.flash(`/admin/estudio/${ctx.params.id}`, 'ok', 'Roteiro salvo.');
    } catch (err) {
      ctx.flash(`/admin/estudio/${ctx.params.id}`, 'erro', err.message);
    }
  }));

  router.post('/admin/estudio/:id/roteiro/aprovar', requireAdmin((ctx) => {
    approveScript(ctx.params.id, { actor: ctx.user.username });
    ctx.flash(`/admin/estudio/${ctx.params.id}`, 'ok', 'Roteiro aprovado. Agora é possível gerar as imagens.');
  }));

  router.post('/admin/estudio/:id/imagens', requireAdmin((ctx) => {
    try {
      const { jobs } = startImageGeneration(ctx.params.id, {
        actor: ctx.user.username,
        includeCover: bool(ctx.fields.incluir_capa),
        perFrame: bool(ctx.fields.por_quadro),
        confirmedUnknownCost: bool(ctx.fields.confirmar_custo),
        confirmedOverBudget: bool(ctx.fields.confirmar_orcamento),
      });
      ctx.flash(`/admin/estudio/${ctx.params.id}`, 'ok', `${jobs.length} tarefa(s) enfileirada(s).`);
    } catch (err) {
      ctx.flash(`/admin/estudio/${ctx.params.id}`, 'erro', err.message);
    }
  }));

  router.post('/admin/estudio/:id/abortar', requireAdmin((ctx) => {
    const n = abortGeneration(ctx.params.id, { actor: ctx.user.username });
    ctx.flash(`/admin/estudio/${ctx.params.id}`, 'aviso', `${n} tarefa(s) cancelada(s).`);
  }));

  router.get('/admin/api/mangas/:id/jobs', requireAdmin((ctx) => {
    const summary = mangaJobSummary(ctx.params.id);
    ctx.json({ progress: summary.progress, label: summary.label, done: summary.done, failed: summary.failed });
  }));

  /* ------------------------------- revisão ------------------------------ */

  router.get('/admin/revisao', requireAdmin((ctx) => {
    const mangas = ['GENERATING', 'REVIEW', 'AUTHOR_APPROVED', 'APPROVED', 'SCHEDULED']
      .flatMap((status) => listMangas({ status, limit: 40 }));
    page(ctx, { title: 'Revisão', subtitle: 'Continuidade, legibilidade, fidelidade e aprovações.', body: A.reviewListView({ mangas }) });
  }));

  router.get('/admin/revisao/:id', requireAdmin((ctx) => {
    const manga = getManga(ctx.params.id);
    if (!manga) return ctx.text('Obra não encontrada', 404);
    const submission = manga.submission_id ? getSubmission(manga.submission_id) : null;
    const pages = listPages(manga.id);
    const balloonPage = ctx.query.pagina ? getPage(ctx.query.pagina) : null;
    const authorApproval = activeApproval(manga.id, 'AUTHOR');
    const editorialApproval = activeApproval(manga.id, 'EDITORIAL');

    const checklist = [
      { label: 'Autorização do autor registrada', ok: submission?.consent_status === 'GRANTED' },
      { label: 'Pseudônimo definido', ok: !!submission?.author_pseudonym },
      { label: 'Todas as páginas geradas', ok: pages.length > 0 && pages.every((p) => p.status === 'READY') },
      { label: 'Capa gerada', ok: !!pages.find((p) => p.kind === 'COVER' && p.status === 'READY') },
      { label: 'Texto alternativo em todas as páginas', ok: pages.every((p) => (p.alt_text || '').length > 4) },
      { label: 'Sinopse preenchida', ok: !!manga.synopsis },
      { label: 'Aprovação do autor', ok: !!authorApproval },
      { label: 'Aprovação editorial', ok: !!editorialApproval },
    ];

    page(ctx, {
      title: manga.title,
      subtitle: 'Revisão editorial',
      body: A.reviewView({
        ctx, manga, submission, pages,
        approvals: { author: authorApproval, editorial: editorialApproval },
        checklist,
        history: balloonPage ? pageHistory(balloonPage.id) : [],
        balloonPage,
        estimate: estimateForManga(manga, { includeCover: false }),
      }),
    });
  }));

  router.post('/admin/revisao/:id/pagina/:pageId/baloes', requireAdmin((ctx) => {
    let balloons = [];
    try { balloons = sanitizeBalloons(JSON.parse(ctx.fields.balloons_json || '[]')); }
    catch { return ctx.flash(`/admin/revisao/${ctx.params.id}?pagina=${ctx.params.pageId}`, 'erro', 'JSON de balões inválido.'); }
    savePageVersion(ctx.params.pageId, {
      balloons_json: JSON.stringify(balloons),
      alt_text: String(ctx.fields.alt_text || '').slice(0, 600),
      transcript: String(ctx.fields.transcript || '').slice(0, 6000),
    }, { note: 'Balões editados', actor: ctx.user.username });
    ctx.flash(`/admin/revisao/${ctx.params.id}?pagina=${ctx.params.pageId}`, 'ok', 'Balões salvos.');
  }));

  router.post('/admin/revisao/:id/pagina/:pageId/regerar', requireAdmin((ctx) => {
    try {
      regeneratePage(ctx.params.pageId, {
        actor: ctx.user.username,
        confirmedUnknownCost: bool(ctx.fields.confirmar_custo),
        confirmedOverBudget: bool(ctx.fields.confirmar_orcamento),
      });
      ctx.flash(`/admin/revisao/${ctx.params.id}`, 'ok', 'Regeração desta página enfileirada. As demais não são afetadas.');
    } catch (err) {
      ctx.flash(`/admin/revisao/${ctx.params.id}`, 'erro', err.message);
    }
  }));

  router.post('/admin/revisao/:id/pagina/:pageId/restaurar', requireAdmin((ctx) => {
    restorePageVersion(ctx.params.pageId, Number(ctx.fields.versao), { actor: ctx.user.username });
    ctx.flash(`/admin/revisao/${ctx.params.id}?pagina=${ctx.params.pageId}`, 'ok', 'Versão restaurada.');
  }));

  router.post('/admin/revisao/:id/pagina/:pageId/ordem', requireAdmin((ctx) => {
    const pages = storyPages(ctx.params.id);
    const index = pages.findIndex((p) => p.id === ctx.params.pageId);
    if (index > 0) {
      const ordered = pages.map((p) => p.id);
      [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
      reorderPages(ctx.params.id, ordered, { actor: ctx.user.username });
    }
    ctx.flash(`/admin/revisao/${ctx.params.id}`, 'ok', 'Ordem atualizada.');
  }));

  router.post('/admin/revisao/:id/aprovacao-autor', requireAdmin((ctx) => {
    registerAuthorApproval(ctx.params.id, { actor: ctx.user.username, evidence: String(ctx.fields.evidence || '') });
    ctx.flash(`/admin/revisao/${ctx.params.id}`, 'ok', 'Aprovação do autor registrada.');
  }));

  router.post('/admin/revisao/:id/aprovar', requireAdmin((ctx) => {
    approveForPublication(ctx.params.id, { actor: ctx.user.username, note: String(ctx.fields.note || '') });
    ctx.flash(`/admin/revisao/${ctx.params.id}`, 'ok', 'Obra aprovada para publicação.');
  }));

  router.post('/admin/revisao/:id/publicar', requireAdmin(async (ctx) => {
    if (!bool(ctx.fields.confirmo)) return ctx.flash(`/admin/revisao/${ctx.params.id}`, 'erro', 'Marque a confirmação para publicar.');
    await publishManga(ctx.params.id, { actor: ctx.user.username, confirmed: true });
    ctx.flash(`/admin/revisao/${ctx.params.id}`, 'ok', 'Obra publicada.');
  }));

  router.post('/admin/revisao/:id/agendar', requireAdmin((ctx) => {
    schedulePublication(ctx.params.id, String(ctx.fields.quando || ''), { actor: ctx.user.username });
    ctx.flash(`/admin/revisao/${ctx.params.id}`, 'ok', 'Publicação agendada.');
  }));

  router.post('/admin/revisao/:id/despublicar', requireAdmin((ctx) => {
    unpublishManga(ctx.params.id, { actor: ctx.user.username, reason: String(ctx.fields.reason || '') });
    ctx.flash(`/admin/revisao/${ctx.params.id}`, 'aviso', 'Obra removida do site.');
  }));

  /* ------------------------------ revistas ------------------------------ */

  router.get('/admin/revistas', requireAdmin((ctx) => {
    page(ctx, { title: 'Revistas', subtitle: 'Compilado semanal reaproveitando as páginas já geradas.', body: A.magazineListAdminView({ magazines: listMagazines() }) });
  }));

  router.get('/admin/revistas/nova', requireAdmin((ctx) => {
    page(ctx, {
      title: 'Nova revista',
      body: A.magazineFormView({ ctx, magazine: null, entries: [], challenges: listChallenges({ limit: 30 }), available: [], suggestedEdition: nextEditionNumber() }),
    });
  }));

  router.post('/admin/revistas', requireAdmin((ctx) => {
    const magazine = createMagazine({
      challengeId: ctx.fields.challenge_id || null,
      editionNumber: Number(ctx.fields.edition_number),
      title: String(ctx.fields.title || '').trim(),
      summary: String(ctx.fields.summary || ''),
      editorialNote: String(ctx.fields.editorial_note || ''),
      actor: ctx.user.username,
    });
    ctx.flash(`/admin/revistas/${magazine.id}`, 'ok', 'Revista criada.');
  }));

  router.get('/admin/revistas/:id', requireAdmin((ctx) => {
    const magazine = getMagazine(ctx.params.id);
    if (!magazine) return ctx.text('Revista não encontrada', 404);
    const entries = magazineEntries(magazine.id);
    const used = new Set(entries.map((e) => e.manga_id));
    const available = ['APPROVED', 'SCHEDULED', 'PUBLISHED']
      .flatMap((s) => listMangas({ status: s, limit: 60 }))
      .filter((m) => !used.has(m.id));
    page(ctx, {
      title: `Revista da edição ${magazine.edition_number}`,
      body: A.magazineFormView({ ctx, magazine, entries, challenges: listChallenges({ limit: 30 }), available, suggestedEdition: magazine.edition_number }),
    });
  }));

  router.post('/admin/revistas/:id', requireAdmin((ctx) => {
    update('magazines', ctx.params.id, {
      edition_number: Number(ctx.fields.edition_number),
      title: String(ctx.fields.title || '').trim(),
      summary: String(ctx.fields.summary || ''),
      editorial_note: String(ctx.fields.editorial_note || ''),
      challenge_id: ctx.fields.challenge_id || null,
    });
    ctx.flash(`/admin/revistas/${ctx.params.id}`, 'ok', 'Revista atualizada.');
  }));

  router.post('/admin/revistas/:id/auto', requireAdmin((ctx) => {
    autoFill(ctx.params.id, { actor: ctx.user.username });
    ctx.flash(`/admin/revistas/${ctx.params.id}`, 'ok', 'Sumário preenchido com as obras aprovadas.');
  }));

  router.post('/admin/revistas/:id/adicionar', requireAdmin((ctx) => {
    addEntry(ctx.params.id, String(ctx.fields.manga_id), { actor: ctx.user.username });
    ctx.flash(`/admin/revistas/${ctx.params.id}`, 'ok', 'Obra adicionada.');
  }));

  router.post('/admin/revistas/:id/remover', requireAdmin((ctx) => {
    removeEntry(ctx.params.id, String(ctx.fields.manga_id), { actor: ctx.user.username });
    ctx.flash(`/admin/revistas/${ctx.params.id}`, 'aviso', 'Obra removida da revista.');
  }));

  router.post('/admin/revistas/:id/publicar', requireAdmin(async (ctx) => {
    if (!bool(ctx.fields.confirmo)) return ctx.flash(`/admin/revistas/${ctx.params.id}`, 'erro', 'Marque a confirmação para publicar.');
    await publishMagazine(ctx.params.id, { actor: ctx.user.username, confirmed: true });
    ctx.flash(`/admin/revistas/${ctx.params.id}`, 'ok', 'Revista publicada.');
  }));

  router.post('/admin/revistas/:id/agendar', requireAdmin((ctx) => {
    scheduleMagazine(ctx.params.id, String(ctx.fields.quando || ''), { actor: ctx.user.username });
    ctx.flash(`/admin/revistas/${ctx.params.id}`, 'ok', 'Revista agendada.');
  }));

  /* ----------------------------- biblioteca ----------------------------- */

  router.get('/admin/biblioteca', requireAdmin((ctx) => {
    const template = ['desafio', 'encerramento', 'vencedor', 'lancamento'].includes(ctx.query.template) ? ctx.query.template : 'desafio';
    const size = CARD_SIZES[ctx.query.tamanho] ? ctx.query.tamanho : 'feed';
    const current = currentChallenge();
    const data = {
      template,
      size,
      theme: ctx.query.tema || current?.theme || 'Me conte qual foi o maior mico da sua vida.',
      title: ctx.query.titulo || '',
      author: ctx.query.autor || '',
      network: ctx.query.rede || '',
      edition: ctx.query.edicao || current?.edition_number || '',
      ctaUrl: `${env.appUrl.replace(/^https?:\/\//, '')}/mangas`,
    };
    const svg = renderCard(data);
    page(ctx, {
      title: 'Biblioteca',
      subtitle: 'Acervo e exportação de cards com a identidade institucional.',
      body: A.libraryView({
        ctx,
        mangas: listMangas({ limit: 200 }),
        cardData: { ...data, svg, w: CARD_SIZES[size].w, h: CARD_SIZES[size].h },
        sizes: Object.entries(CARD_SIZES).map(([key, v]) => ({ key, label: v.label })),
        templates: [
          { key: 'desafio', label: 'Desafio (vermelho)' },
          { key: 'encerramento', label: 'Encerramento (preto)' },
          { key: 'vencedor', label: 'Vencedor (dourado)' },
          { key: 'lancamento', label: 'Lançamento (preto e creme)' },
        ],
      }),
    });
  }));

  /* -------------------------------- custos ------------------------------ */

  router.get('/admin/custos', requireAdmin((ctx) => {
    const usage = usageHistory({ limit: 80 });
    const byManga = new Map();
    for (const u of usage) {
      if (!u.manga_id) continue;
      const entry = byManga.get(u.manga_id) || { calls: 0, estimated: 0, actual: 0, unknown: false, sources: new Set() };
      entry.calls += 1;
      entry.estimated += u.estimated_cost_usd || 0;
      if (u.actual_cost_usd === null) entry.unknown = true; else entry.actual += u.actual_cost_usd;
      entry.sources.add(u.cost_source);
      byManga.set(u.manga_id, entry);
    }
    const perManga = [...byManga.entries()].map(([id, v]) => ({
      title: getManga(id)?.title || id,
      calls: v.calls,
      estimated: v.estimated || null,
      actual: v.unknown ? null : v.actual,
      sources: [...v.sources],
    }));

    page(ctx, {
      title: 'Custos',
      subtitle: 'Estimativas, consumo registrado e limites de orçamento.',
      body: A.costsView({
        month: monthSpend(), perManga, prices: priceTable(),
        budgets: { monthly: env.budget.monthlyUsd, perManga: env.budget.perMangaUsd },
        usage, aiStatus: aiStatus(),
      }),
    });
  }));

  /* ---------------------------- configurações --------------------------- */

  router.get('/admin/configuracoes', requireAdmin((ctx) => {
    page(ctx, {
      title: 'Configurações',
      body: A.settingsView({ ctx, settings: allSettings(), aiStatus: aiStatus(), storage: env.storage, admins: listAdmins() }),
    });
  }));

  router.post('/admin/configuracoes', requireAdmin((ctx) => {
    for (const key of ['site_title', 'tagline', 'signature', 'instagram_url', 'tiktok_url', 'x_url', 'rules_url', 'contact_email', 'takedown_email', 'default_quality_mode']) {
      if (ctx.fields[key] !== undefined) setSetting(key, String(ctx.fields[key]).slice(0, 400));
    }
    if (ctx.fields.max_pages) setSetting('max_pages', Math.max(1, Math.min(12, Number(ctx.fields.max_pages) || 8)));
    audit('settings.updated', { actor: ctx.user.username, summary: 'Configurações do site atualizadas' });
    ctx.flash('/admin/configuracoes', 'ok', 'Configurações salvas.');
  }));

  router.post('/admin/configuracoes/testar-ia', requireAdmin(async (ctx) => {
    try {
      const r = await checkConnection();
      const partes = [
        `chave válida, ${r.total} modelos na conta`,
        `texto ${connectionStatus().textModel}: ${r.textModelAvailable ? 'disponível' : 'NÃO encontrado'}`,
        `imagem ${connectionStatus().imageModel}: ${r.imageModelAvailable ? 'disponível' : 'NÃO encontrado'}`,
      ];
      if (r.imageModels.length) partes.push(`modelos de imagem na conta: ${r.imageModels.join(', ')}`);
      audit('ai.connection_checked', { actor: ctx.user.username, summary: partes[0] });
      ctx.flash('/admin/configuracoes', 'ok', partes.join(' · '));
    } catch (err) {
      ctx.flash('/admin/configuracoes', 'erro', `Falha ao falar com a API: ${err.message}`);
    }
  }));

  router.post('/admin/configuracoes/senha', requireAdmin((ctx) => {
    const atual = String(ctx.fields.atual || '');
    const nova = String(ctx.fields.nova || '');
    if (!verifyPassword(atual, ctx.user.password_hash)) {
      return ctx.flash('/admin/configuracoes', 'erro', 'Senha atual incorreta.');
    }
    const strength = checkPasswordStrength(nova);
    if (!strength.ok) return ctx.flash('/admin/configuracoes', 'erro', `Senha fraca: ${strength.problems.join('; ')}.`);
    update('admin_users', ctx.user.id, { password_hash: hashPassword(nova), must_change_password: 0 });
    audit('admin.password_changed', { actor: ctx.user.username, entityType: 'admin_user', entityId: ctx.user.id, summary: 'Senha alterada pelo próprio usuário' });
    ctx.flash('/admin/configuracoes', 'ok', 'Senha atualizada.');
  }));
}

/* ------------------------------ normalização ---------------------------- */

function normalizeChallenge(fields) {
  return {
    edition_number: fields.edition_number,
    theme: fields.theme,
    allows_fiction: bool(fields.allows_fiction),
    launch_at: fields.launch_at,
    close_at: fields.close_at,
    publish_at: fields.publish_at,
    instagram_url: fields.instagram_url,
    tiktok_url: fields.tiktok_url,
    x_url: fields.x_url,
    rules_url: fields.rules_url,
    status: fields.status,
    editorial_note: fields.editorial_note,
  };
}

function normalizeSubmission(fields) {
  return {
    challenge_id: fields.challenge_id,
    network: fields.network,
    rank: fields.rank || 1,
    comment_text: fields.comment_text,
    source_url: fields.source_url,
    votes: fields.votes,
    counted_at: fields.counted_at,
    comment_posted_at: fields.comment_posted_at,
    author_pseudonym: fields.author_pseudonym,
    author_handle: fields.author_handle,
    expanded_story: fields.expanded_story,
    genre: fields.genre,
    art_style: fields.art_style,
    narrative_tone: fields.narrative_tone,
    visual_tone: fields.visual_tone,
    editorial_notes: fields.editorial_notes,
    consent_status: fields.consent_status,
    consent_evidence: fields.consent_evidence,
    is_minor: bool(fields.is_minor),
    guardian_consent: bool(fields.guardian_consent),
    is_fiction: bool(fields.is_fiction),
  };
}
