import { all, get, insert, nowIso, run, tx, update } from '../core/db.js';
import { audit } from '../core/audit.js';
import { uniqueSlug } from '../core/slug.js';
import { editorialLocalToUtc } from '../core/dates.js';
import { promoteAssetToPublic } from '../core/storage.js';
import { listPages } from './mangas.js';

/**
 * Revista semanal.
 * Reúne obras já aprovadas reaproveitando as páginas existentes:
 * nenhuma chamada de IA extra é feita para montar o compilado.
 */

export function createMagazine({ challengeId = null, editionNumber, title, summary = '', editorialNote = '', actor = 'admin' }) {
  if (get('SELECT id FROM magazines WHERE edition_number = ?', [editionNumber])) {
    throw Object.assign(new Error(`Já existe revista para a edição ${editionNumber}.`), { statusCode: 409 });
  }
  const id = insert('magazines', {
    slug: uniqueSlug('magazines', `edicao-${editionNumber}-${title}`),
    edition_number: editionNumber,
    title,
    challenge_id: challengeId,
    summary,
    editorial_note: editorialNote,
    cover_mode: 'REUSE',
    status: 'DRAFT',
  });
  audit('magazine.created', { actor, entityType: 'magazine', entityId: id, summary: `Revista da edição ${editionNumber} criada` });
  return getMagazine(id);
}

export function getMagazine(id) { return get('SELECT * FROM magazines WHERE id = ?', [id]); }
export function getMagazineBySlug(slug) { return get('SELECT * FROM magazines WHERE slug = ?', [slug]); }

export function listMagazines({ status = null, limit = 60 } = {}) {
  return status
    ? all('SELECT * FROM magazines WHERE status = ? ORDER BY edition_number DESC LIMIT ?', [status, limit])
    : all('SELECT * FROM magazines ORDER BY edition_number DESC LIMIT ?', [limit]);
}

export function magazineEntries(magazineId) {
  return all(`
    SELECT e.*, m.slug, m.title, m.synopsis, m.status AS manga_status, m.cover_page_id, m.page_count,
           s.network, s.author_pseudonym
    FROM magazine_entries e
    JOIN mangas m ON m.id = e.manga_id
    LEFT JOIN submissions s ON s.id = m.submission_id
    WHERE e.magazine_id = ?
    ORDER BY e.position ASC`, [magazineId]);
}

export function addEntry(magazineId, mangaId, { actor = 'admin' } = {}) {
  const manga = get('SELECT * FROM mangas WHERE id = ?', [mangaId]);
  if (!manga) throw Object.assign(new Error('Obra não encontrada.'), { statusCode: 404 });
  if (!['APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(manga.status)) {
    throw Object.assign(new Error('Somente obras aprovadas entram na revista.'), { statusCode: 422 });
  }
  if (get('SELECT id FROM magazine_entries WHERE magazine_id = ? AND manga_id = ?', [magazineId, mangaId])) {
    return magazineEntries(magazineId);
  }
  const last = get('SELECT MAX(position) AS p FROM magazine_entries WHERE magazine_id = ?', [magazineId]);
  insert('magazine_entries', { magazine_id: magazineId, manga_id: mangaId, position: (last?.p ?? 0) + 1 });
  audit('magazine.entry_added', { actor, entityType: 'magazine', entityId: magazineId, summary: `Obra ${manga.title} adicionada` });
  return magazineEntries(magazineId);
}

export function removeEntry(magazineId, mangaId, { actor = 'admin' } = {}) {
  return tx(() => {
    run('DELETE FROM magazine_entries WHERE magazine_id = ? AND manga_id = ?', [magazineId, mangaId]);
    magazineEntries(magazineId).forEach((e, i) => {
      run('UPDATE magazine_entries SET position = ? WHERE id = ?', [i + 1, e.id]);
    });
    audit('magazine.entry_removed', { actor, entityType: 'magazine', entityId: magazineId, summary: 'Obra removida da revista' });
    return magazineEntries(magazineId);
  });
}

export function reorderEntries(magazineId, orderedMangaIds, { actor = 'admin' } = {}) {
  return tx(() => {
    orderedMangaIds.forEach((mangaId, i) => {
      run('UPDATE magazine_entries SET position = ? WHERE magazine_id = ? AND manga_id = ?', [-(i + 1), magazineId, mangaId]);
    });
    orderedMangaIds.forEach((mangaId, i) => {
      run('UPDATE magazine_entries SET position = ? WHERE magazine_id = ? AND manga_id = ?', [i + 1, magazineId, mangaId]);
    });
    audit('magazine.reordered', { actor, entityType: 'magazine', entityId: magazineId, summary: 'Ordem editorial alterada' });
    return magazineEntries(magazineId);
  });
}

/** Monta automaticamente com as obras aprovadas da edição, na ordem das redes. */
export function autoFill(magazineId, { actor = 'admin' } = {}) {
  const magazine = getMagazine(magazineId);
  if (!magazine?.challenge_id) throw Object.assign(new Error('Revista sem edição vinculada.'), { statusCode: 422 });
  const order = { INSTAGRAM: 1, TIKTOK: 2, X: 3 };
  const candidates = all(`
    SELECT m.id, s.network FROM mangas m
    LEFT JOIN submissions s ON s.id = m.submission_id
    WHERE m.challenge_id = ? AND m.status IN ('APPROVED','SCHEDULED','PUBLISHED')`, [magazine.challenge_id])
    .sort((a, b) => (order[a.network] ?? 9) - (order[b.network] ?? 9));
  for (const c of candidates) addEntry(magazineId, c.id, { actor });
  return magazineEntries(magazineId);
}

export function scheduleMagazine(magazineId, whenLocal, { actor = 'admin' } = {}) {
  const iso = editorialLocalToUtc(whenLocal);
  if (!iso) throw Object.assign(new Error('Data inválida.'), { statusCode: 422 });
  update('magazines', magazineId, { status: 'SCHEDULED', scheduled_at: iso });
  audit('magazine.scheduled', { actor, entityType: 'magazine', entityId: magazineId, summary: `Agendada para ${iso}` });
  return getMagazine(magazineId);
}

/**
 * Publica a revista. Exige que todas as obras estejam publicadas (ou publica-as
 * junto, se já aprovadas) e reaproveita as páginas existentes.
 */
export async function publishMagazine(magazineId, { actor = 'admin', confirmed = false } = {}) {
  const magazine = getMagazine(magazineId);
  if (!magazine) throw Object.assign(new Error('Revista não encontrada.'), { statusCode: 404 });
  if (!confirmed) throw Object.assign(new Error('Confirmação explícita necessária.'), { statusCode: 428 });

  const entries = magazineEntries(magazineId);
  if (!entries.length) throw Object.assign(new Error('A revista não tem obras.'), { statusCode: 422 });

  const notPublished = entries.filter((e) => e.manga_status !== 'PUBLISHED');
  if (notPublished.length) {
    throw Object.assign(
      new Error(`Publique antes as obras: ${notPublished.map((e) => e.title).join(', ')}.`),
      { statusCode: 422 }
    );
  }

  if (magazine.cover_asset_id) await promoteAssetToPublic(magazine.cover_asset_id);

  return tx(() => {
    update('magazines', magazineId, { status: 'PUBLISHED', published_at: nowIso(), scheduled_at: null });
    audit('magazine.published', { actor, entityType: 'magazine', entityId: magazineId, summary: `Revista publicada com ${entries.length} obra(s)` });
    return getMagazine(magazineId);
  });
}

export function unpublishMagazine(magazineId, { actor = 'admin', reason = '' } = {}) {
  update('magazines', magazineId, { status: 'ARCHIVED' });
  audit('magazine.unpublished', { actor, entityType: 'magazine', entityId: magazineId, summary: `Despublicada: ${reason}` });
  return getMagazine(magazineId);
}

/** Páginas de leitura contínua da revista: reutiliza as páginas das obras. */
export function magazineReadingPages(magazineId) {
  const entries = magazineEntries(magazineId);
  const out = [];
  for (const entry of entries) {
    const pages = listPages(entry.manga_id).filter((p) => p.status === 'READY');
    const cover = pages.find((p) => p.kind === 'COVER');
    const story = pages.filter((p) => p.kind === 'STORY').sort((a, b) => a.page_number - b.page_number);
    out.push({ entry, cover, pages: story });
  }
  return out;
}
