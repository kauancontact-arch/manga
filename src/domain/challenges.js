import { all, get, insert, tx, update } from '../core/db.js';
import { z } from '../core/schema.js';
import { uniqueSlug } from '../core/slug.js';
import { editorialLocalToUtc } from '../core/dates.js';
import { NETWORK_KEYS } from './catalog.js';

export const challengeSchema = z.object({
  edition_number: z.int({ min: 1, max: 9999 }),
  theme: z.string({ min: 5, max: 220 }),
  allows_fiction: z.boolean().default(false),
  launch_at: z.string().optional(),
  close_at: z.string().optional(),
  publish_at: z.string().optional(),
  instagram_url: z.url().optional(),
  tiktok_url: z.url().optional(),
  x_url: z.url().optional(),
  rules_url: z.url().optional(),
  status: z.enum(['DRAFT', 'LIVE', 'CLOSED', 'PUBLISHED', 'CANCELLED']).default('DRAFT'),
  editorial_note: z.string({ max: 2000 }).optional(),
});

export function createChallenge(input) {
  const data = challengeSchema.parse(input);
  if (get('SELECT id FROM challenges WHERE edition_number = ?', [data.edition_number])) {
    const err = new Error(`Já existe uma edição número ${data.edition_number}.`);
    err.statusCode = 409;
    throw err;
  }
  const id = insert('challenges', {
    ...data,
    slug: uniqueSlug('challenges', `edicao-${data.edition_number}-${data.theme}`),
    launch_at: editorialLocalToUtc(data.launch_at),
    close_at: editorialLocalToUtc(data.close_at),
    publish_at: editorialLocalToUtc(data.publish_at),
  });
  return getChallenge(id);
}

export function updateChallenge(id, input) {
  const data = challengeSchema.parse(input);
  const existing = get('SELECT id FROM challenges WHERE edition_number = ? AND id <> ?', [data.edition_number, id]);
  if (existing) {
    const err = new Error(`Já existe uma edição número ${data.edition_number}.`);
    err.statusCode = 409;
    throw err;
  }
  update('challenges', id, {
    ...data,
    launch_at: editorialLocalToUtc(data.launch_at),
    close_at: editorialLocalToUtc(data.close_at),
    publish_at: editorialLocalToUtc(data.publish_at),
  });
  return getChallenge(id);
}

export function getChallenge(id) {
  return get('SELECT * FROM challenges WHERE id = ?', [id]);
}
export function getChallengeBySlug(slug) {
  return get('SELECT * FROM challenges WHERE slug = ?', [slug]);
}
export function listChallenges({ status = null, limit = 100 } = {}) {
  return status
    ? all('SELECT * FROM challenges WHERE status = ? ORDER BY edition_number DESC LIMIT ?', [status, limit])
    : all('SELECT * FROM challenges ORDER BY edition_number DESC LIMIT ?', [limit]);
}

/** Edição corrente: a mais recente no ar; sem isso, a última encerrada. */
export function currentChallenge() {
  return get("SELECT * FROM challenges WHERE status = 'LIVE' ORDER BY edition_number DESC LIMIT 1")
    || get("SELECT * FROM challenges WHERE status IN ('CLOSED','PUBLISHED') ORDER BY edition_number DESC LIMIT 1");
}

/** Próximo desafio anunciado publicamente (rascunho agendado ou no ar à frente). */
export function nextChallenge() {
  const current = currentChallenge();
  return get('SELECT * FROM challenges WHERE edition_number > ? ORDER BY edition_number ASC LIMIT 1', [current?.edition_number ?? 0]);
}

export function nextEditionNumber() {
  const row = get('SELECT MAX(edition_number) AS n FROM challenges');
  return (row?.n ?? 0) + 1;
}

/** Situação das três vagas (uma por rede) de uma edição. */
export function slotStatus(challengeId) {
  const rows = all('SELECT * FROM submissions WHERE challenge_id = ? ORDER BY rank ASC', [challengeId]);
  return NETWORK_KEYS.map((network) => {
    const inNetwork = rows.filter((r) => r.network === network);
    const selected = inNetwork.find((r) => r.status === 'SELECTED') || null;
    const manga = selected ? get('SELECT * FROM mangas WHERE submission_id = ?', [selected.id]) : null;
    return {
      network,
      selected,
      manga,
      candidates: inNetwork,
      nextEligible: inNetwork.find((r) => r.status === 'ELIGIBLE') || null,
      filled: !!selected,
      consentOk: selected?.consent_status === 'GRANTED',
    };
  });
}

export function setChallengeStatus(id, status, { note = null } = {}) {
  return tx(() => {
    update('challenges', id, { status, editorial_note: note ?? undefined });
    return getChallenge(id);
  });
}

export function deleteChallenge(id) {
  const used = get('SELECT COUNT(*) AS n FROM mangas WHERE challenge_id = ?', [id]);
  if (used?.n > 0) {
    const err = new Error('Não é possível excluir: já existem obras vinculadas a esta edição.');
    err.statusCode = 409;
    throw err;
  }
  update('challenges', id, { status: 'CANCELLED' });
}
