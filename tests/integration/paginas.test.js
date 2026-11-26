import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWinner, useTestDatabase } from '../support/env.js';

useTestDatabase('paginas');

const { migrate } = await import('../../src/core/db.js');
migrate({ silent: true });

const M = await import('../../src/domain/mangas.js');
const { PAGINAS, clampPaginas } = await import('../../src/domain/catalog.js');

/**
 * O teto de páginas estava escrito solto em cinco lugares e eles divergiram:
 * o schema aceitava 12, a criação da obra e o pedido de roteiro cortavam em 8,
 * e o modo de qualidade ainda apertava os dois lados da faixa. Pedir de 4 a 20
 * virava de 2 a 4 no modo Econômico, sem nada na tela dizendo isso.
 */

test('o limite de páginas vem de um lugar só', () => {
  assert.equal(PAGINAS.max, 20);
  assert.equal(clampPaginas(20), 20);
  assert.equal(clampPaginas(25), 20, 'acima do teto prende no teto');
  assert.equal(clampPaginas(0), PAGINAS.min);
  assert.equal(clampPaginas('abc'), PAGINAS.min, 'valor inválido não vira NaN');
});

test('uma obra aceita a faixa de 4 a 20 páginas', async () => {
  const { manga } = await seedWinner({ edition: 1, network: 'INSTAGRAM', pseudonym: 'Faixa' });
  const alterada = M.updateMangaParams(manga.id, { page_min: 4, page_max: 20 }, { actor: 'teste' });
  assert.equal(alterada.page_min, 4);
  assert.equal(alterada.page_max, 20, 'não é mais cortada em 8');
});

test('o modo de qualidade não aperta mais a faixa escolhida', async () => {
  const { manga } = await seedWinner({ edition: 2, network: 'TIKTOK', pseudonym: 'Economico' });
  const alterada = M.updateMangaParams(manga.id, { quality_mode: 'ECONOMICO', page_min: 4, page_max: 20 }, { actor: 'teste' });
  assert.equal(alterada.quality_mode, 'ECONOMICO');
  assert.equal(alterada.page_min, 4);
  assert.equal(alterada.page_max, 20);
});

test('acima do teto a obra recusa em vez de cortar calada', async () => {
  const { manga } = await seedWinner({ edition: 3, network: 'X', pseudonym: 'Acima' });
  assert.throws(() => M.updateMangaParams(manga.id, { page_max: 40 }, { actor: 'teste' }));
});

test('uma falha superada por um sucesso posterior some do resumo', async () => {
  const { insert } = await import('../../src/core/db.js');
  const { mangaJobSummary } = await import('../../src/domain/jobs.js');
  const { manga } = await seedWinner({ edition: 4, network: 'INSTAGRAM', pseudonym: 'Superada' });

  insert('generation_jobs', {
    type: 'SCRIPT', manga_id: manga.id, status: 'FAILED', idempotency_key: `k-falha-${manga.id}`,
    params_json: '{}', max_attempts: 3, attempts: 3, error_message: 'JSON inválido',
    created_at: '2026-11-25T20:00:00.000Z',
  });
  assert.equal(mangaJobSummary(manga.id).failed, 1, 'a falha aparece enquanto nada deu certo');

  insert('generation_jobs', {
    type: 'SCRIPT', manga_id: manga.id, status: 'SUCCEEDED', idempotency_key: `k-ok-${manga.id}`,
    params_json: '{}', max_attempts: 3, attempts: 1,
    created_at: '2026-11-26T04:50:00.000Z',
  });
  assert.equal(mangaJobSummary(manga.id).failed, 0, 'depois do sucesso a falha antiga some');
});
