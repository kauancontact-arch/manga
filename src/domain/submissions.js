import { all, get, insert, nowIso, tx, update } from '../core/db.js';
import { z } from '../core/schema.js';
import { audit } from '../core/audit.js';
import { editorialLocalToUtc } from '../core/dates.js';
import { NETWORK_KEYS } from './catalog.js';
import { screenContent } from './safety.js';

export const submissionSchema = z.object({
  challenge_id: z.string({ min: 1 }),
  network: z.enum(NETWORK_KEYS),
  rank: z.int({ min: 1, max: 50 }).default(1),
  comment_text: z.string({ min: 3, max: 6000 }),
  source_url: z.url().optional(),
  votes: z.int({ min: 0, max: 100000000 }).optional(),
  counted_at: z.string().optional(),
  comment_posted_at: z.string().optional(),
  author_pseudonym: z.string({ min: 1, max: 80 }).optional(),
  author_handle: z.string({ max: 120 }).optional(),
  expanded_story: z.string({ max: 12000 }).optional(),
  genre: z.string({ max: 40 }).optional(),
  art_style: z.string({ max: 40 }).optional(),
  narrative_tone: z.string({ max: 40 }).optional(),
  visual_tone: z.string({ max: 40 }).optional(),
  editorial_notes: z.string({ max: 4000 }).optional(),
  consent_status: z.enum(['PENDING', 'GRANTED', 'DENIED']).default('PENDING'),
  consent_at: z.string().optional(),
  consent_evidence: z.string({ max: 500 }).optional(),
  is_minor: z.boolean().default(false),
  guardian_consent: z.boolean().default(false),
  is_fiction: z.boolean().default(false),
});

function normalize(data) {
  const screen = screenContent(`${data.comment_text}\n${data.expanded_story || ''}`);
  return {
    ...data,
    counted_at: editorialLocalToUtc(data.counted_at),
    comment_posted_at: editorialLocalToUtc(data.comment_posted_at),
    consent_at: data.consent_status === 'GRANTED' ? (editorialLocalToUtc(data.consent_at) || nowIso()) : null,
    content_flags: JSON.stringify(screen.flags),
    screen,
  };
}

export function createSubmission(input, { actor = 'admin' } = {}) {
  const parsed = submissionSchema.parse(input);
  const { screen, ...data } = normalize(parsed);
  const id = insert('submissions', { ...data, status: screen.requiresReview ? 'PENDING' : 'ELIGIBLE' });
  audit('submission.created', {
    actor, entityType: 'submission', entityId: id,
    summary: `Relato registrado (${data.network}, edição ${data.challenge_id})`,
    meta: { flags: screen.flags, requiresReview: screen.requiresReview },
  });
  return { submission: getSubmission(id), screen };
}

export function updateSubmission(id, input, { actor = 'admin' } = {}) {
  const parsed = submissionSchema.parse(input);
  const { screen, ...data } = normalize(parsed);
  update('submissions', id, data);
  audit('submission.updated', { actor, entityType: 'submission', entityId: id, summary: 'Relato atualizado', meta: { flags: screen.flags } });
  return { submission: getSubmission(id), screen };
}

export function getSubmission(id) {
  return get('SELECT * FROM submissions WHERE id = ?', [id]);
}

export function listSubmissions({ challengeId = null, network = null, status = null, limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (challengeId) { where.push('challenge_id = ?'); params.push(challengeId); }
  if (network) { where.push('network = ?'); params.push(network); }
  if (status) { where.push('status = ?'); params.push(status); }
  params.push(limit);
  return all(`SELECT * FROM submissions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY network, rank, created_at LIMIT ?`, params);
}

/** Pré-requisitos para ocupar uma vaga. */
export function eligibilityProblems(submission) {
  const problems = [];
  if (!submission) return ['Relato não encontrado.'];
  if (submission.status === 'DISQUALIFIED') problems.push('Relato desclassificado.');
  if (submission.consent_status !== 'GRANTED') problems.push('Autorização do autor ainda não registrada.');
  if (!submission.author_pseudonym) problems.push('Informe o pseudônimo autorizado.');
  if (submission.is_minor && !submission.guardian_consent) problems.push('Participante menor: registre a autorização do responsável.');
  const screen = screenContent(`${submission.comment_text}\n${submission.expanded_story || ''}`);
  if (screen.blocked.length) problems.push(`Triagem bloqueou: ${screen.blocked.map((b) => b.label).join(', ')}.`);
  const challenge = get('SELECT allows_fiction FROM challenges WHERE id = ?', [submission.challenge_id]);
  if (submission.is_fiction && !challenge?.allows_fiction) {
    problems.push('Este desafio não aceita histórias fictícias.');
  }
  return problems;
}

/**
 * Seleciona o relato como vencedor da vaga (edição + rede).
 * Garante vaga única por rede e um único slot por participante na semana.
 */
export function selectWinner(id, { actor = 'admin', force = false } = {}) {
  const submission = getSubmission(id);
  if (!submission) throw Object.assign(new Error('Relato não encontrado.'), { statusCode: 404 });

  const problems = eligibilityProblems(submission);
  if (problems.length && !force) throw Object.assign(new Error(problems.join(' ')), { statusCode: 422, problems });

  return tx(() => {
    const occupied = get("SELECT * FROM submissions WHERE challenge_id = ? AND network = ? AND status = 'SELECTED' AND id <> ?",
      [submission.challenge_id, submission.network, id]);
    if (occupied) throw Object.assign(new Error(`A vaga de ${submission.network} já está ocupada nesta edição.`), { statusCode: 409 });

    if (submission.author_pseudonym) {
      const sameAuthor = get("SELECT * FROM submissions WHERE challenge_id = ? AND author_pseudonym = ? AND status = 'SELECTED' AND id <> ?",
        [submission.challenge_id, submission.author_pseudonym, id]);
      if (sameAuthor) throw Object.assign(new Error('Este participante já ocupa uma vaga nesta edição.'), { statusCode: 409 });
    }

    update('submissions', id, { status: 'SELECTED' });
    audit('submission.selected', { actor, entityType: 'submission', entityId: id, summary: `Vaga ${submission.network} preenchida`, meta: { forced: force } });
    return getSubmission(id);
  });
}

/**
 * Registra o motivo (sem autorização, sem resposta, desclassificação) e
 * indica o próximo elegível da MESMA rede. Nunca inventa vencedor.
 */
export function releaseSlot(id, { reason, status = 'NO_RESPONSE', actor = 'admin' } = {}) {
  const submission = getSubmission(id);
  if (!submission) throw Object.assign(new Error('Relato não encontrado.'), { statusCode: 404 });
  if (!reason || String(reason).trim().length < 3) {
    throw Object.assign(new Error('Informe o motivo editorial.'), { statusCode: 422 });
  }
  return tx(() => {
    update('submissions', id, { status, disqualify_reason: String(reason).slice(0, 500) });
    audit('submission.released', { actor, entityType: 'submission', entityId: id, summary: `Vaga liberada (${status})`, meta: { reason } });
    const next = get(
      "SELECT * FROM submissions WHERE challenge_id = ? AND network = ? AND status IN ('ELIGIBLE','PENDING') AND id <> ? ORDER BY rank ASC, votes DESC LIMIT 1",
      [submission.challenge_id, submission.network, id]
    );
    return { released: getSubmission(id), next };
  });
}

/**
 * Desempate: comentário mais antigo quando verificável; caso contrário,
 * exige decisão editorial registrada.
 */
export function resolveTie(submissionIds, { actor = 'admin', editorialDecisionId = null, note = '' } = {}) {
  const rows = submissionIds.map(getSubmission).filter(Boolean);
  if (rows.length < 2) throw Object.assign(new Error('Informe ao menos dois relatos.'), { statusCode: 422 });
  const allHaveTime = rows.every((r) => r.comment_posted_at);
  if (allHaveTime) {
    const winner = rows.slice().sort((a, b) => new Date(a.comment_posted_at) - new Date(b.comment_posted_at))[0];
    audit('submission.tie_resolved', { actor, entityType: 'submission', entityId: winner.id, summary: 'Desempate pelo comentário mais antigo', meta: { candidates: submissionIds } });
    return { winner, criterion: 'COMENTARIO_MAIS_ANTIGO' };
  }
  if (!editorialDecisionId) {
    throw Object.assign(new Error('Horário de publicação não verificável em todos os relatos. Registre a decisão editorial escolhendo um relato.'), { statusCode: 422 });
  }
  const winner = getSubmission(editorialDecisionId);
  audit('submission.tie_resolved', { actor, entityType: 'submission', entityId: winner.id, summary: 'Desempate por decisão editorial', meta: { candidates: submissionIds, note } });
  return { winner, criterion: 'DECISAO_EDITORIAL', note };
}

export function setConsent(id, { status, evidence = '', actor = 'admin' } = {}) {
  update('submissions', id, {
    consent_status: status,
    consent_at: status === 'GRANTED' ? nowIso() : null,
    consent_evidence: String(evidence).slice(0, 500),
  });
  audit('submission.consent', { actor, entityType: 'submission', entityId: id, summary: `Autorização: ${status}` });
  return getSubmission(id);
}
