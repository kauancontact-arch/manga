import test from 'node:test';
import assert from 'node:assert/strict';
import { runToReview, seedWinner, useTestDatabase } from '../support/env.js';

useTestDatabase('publication');

const { migrate, get, update } = await import('../../src/core/db.js');
migrate({ silent: true });

const M = await import('../../src/domain/mangas.js');
const Mag = await import('../../src/domain/magazines.js');
const { usageHistory } = await import('../../src/domain/costs.js');

async function obraEmRevisao(edition, network, pseudonym) {
  const { manga, submission, challenge } = await seedWinner({ edition, network, pseudonym });
  await runToReview(manga.id);
  return { manga: M.getManga(manga.id), submission, challenge };
}

test('publicar exige confirmação explícita', async () => {
  const { manga } = await obraEmRevisao(1, 'INSTAGRAM', 'Confirma');
  M.registerAuthorApproval(manga.id, { actor: 'teste', evidence: 'DM' });
  M.approveForPublication(manga.id, { actor: 'teste' });
  await assert.rejects(() => M.publishManga(manga.id, { actor: 'teste', confirmed: false }), /Confirmação/);
  const publicada = await M.publishManga(manga.id, { actor: 'teste', confirmed: true });
  assert.equal(publicada.status, 'PUBLISHED');
  assert.ok(publicada.published_at);
});

test('sem aprovação do autor não há aprovação editorial nem publicação', async () => {
  const { manga } = await obraEmRevisao(2, 'TIKTOK', 'SemAutor');
  assert.throws(() => M.approveForPublication(manga.id, { actor: 'teste' }), /Transição inválida|aprovação do autor/i);
  await assert.rejects(() => M.publishManga(manga.id, { actor: 'teste', confirmed: true }), /Transição inválida|aprovação/i);
  assert.notEqual(M.getManga(manga.id).status, 'PUBLISHED');
});

test('sem autorização registrada no relato a publicação é barrada', async () => {
  const { manga, submission } = await obraEmRevisao(3, 'X', 'SemConsent');
  M.registerAuthorApproval(manga.id, { actor: 'teste', evidence: 'DM' });
  update('submissions', submission.id, { consent_status: 'PENDING' });
  assert.throws(() => M.approveForPublication(manga.id, { actor: 'teste' }), /Autorização/i);
});

test('rascunho não vaza: as páginas só ficam públicas após publicar', async () => {
  const { manga } = await obraEmRevisao(4, 'INSTAGRAM', 'Vazamento');
  const pagina = M.storyPages(manga.id)[0];
  assert.equal(get('SELECT visibility FROM assets WHERE id = ?', [pagina.base_asset_id]).visibility, 'private');

  M.registerAuthorApproval(manga.id, { actor: 'teste', evidence: 'DM' });
  M.approveForPublication(manga.id, { actor: 'teste' });
  await M.publishManga(manga.id, { actor: 'teste', confirmed: true });

  const depois = M.storyPages(manga.id)[0];
  assert.equal(get('SELECT visibility FROM assets WHERE id = ?', [depois.base_asset_id]).visibility, 'public');
});

test('alterar a obra depois de aprovada invalida a aprovação e volta à revisão', async () => {
  const { manga } = await obraEmRevisao(5, 'TIKTOK', 'Invalida');
  M.registerAuthorApproval(manga.id, { actor: 'teste', evidence: 'DM' });
  M.approveForPublication(manga.id, { actor: 'teste' });
  assert.equal(M.getManga(manga.id).status, 'APPROVED');

  M.updateMangaParams(manga.id, { color_mode: 'DUOTONE' }, { actor: 'teste' });
  assert.equal(M.getManga(manga.id).status, 'REVIEW');
  assert.ok(get("SELECT invalidated_at FROM approvals WHERE manga_id = ? AND kind='AUTHOR'", [manga.id]).invalidated_at);
});

test('agendamento publica pelo worker quando a hora chega', async () => {
  const { manga } = await obraEmRevisao(6, 'X', 'Agendada');
  M.registerAuthorApproval(manga.id, { actor: 'teste', evidence: 'DM' });
  M.approveForPublication(manga.id, { actor: 'teste' });
  update('mangas', manga.id, { status: 'SCHEDULED', scheduled_at: new Date(Date.now() - 1000).toISOString() });

  const { publishScheduled } = await import('../../src/worker.js');
  await publishScheduled();
  assert.equal(M.getManga(manga.id).status, 'PUBLISHED');
});

test('despublicar tira do ar sem apagar o histórico', async () => {
  const { manga } = await obraEmRevisao(7, 'INSTAGRAM', 'Despublica');
  M.registerAuthorApproval(manga.id, { actor: 'teste', evidence: 'DM' });
  M.approveForPublication(manga.id, { actor: 'teste' });
  await M.publishManga(manga.id, { actor: 'teste', confirmed: true });
  M.unpublishManga(manga.id, { actor: 'teste', reason: 'pedido do autor' });
  const atual = M.getManga(manga.id);
  assert.equal(atual.status, 'ARCHIVED');
  assert.ok(atual.unpublished_at);
  assert.equal(M.listPublished().find((m) => m.id === manga.id), undefined);
  assert.ok(M.listPages(manga.id).length > 0, 'as páginas continuam no acervo interno');
});

test('a revista reúne as obras sem gerar imagem nova', async () => {
  const a = await obraEmRevisao(8, 'INSTAGRAM', 'RevistaA');
  const b = await obraEmRevisao(9, 'TIKTOK', 'RevistaB');
  for (const { manga } of [a, b]) {
    M.registerAuthorApproval(manga.id, { actor: 'teste', evidence: 'DM' });
    M.approveForPublication(manga.id, { actor: 'teste' });
    await M.publishManga(manga.id, { actor: 'teste', confirmed: true });
  }

  const antes = usageHistory({ limit: 1000 }).length;
  const revista = Mag.createMagazine({ editionNumber: 99, title: 'Semana de teste', actor: 'teste' });
  Mag.addEntry(revista.id, a.manga.id, { actor: 'teste' });
  Mag.addEntry(revista.id, b.manga.id, { actor: 'teste' });
  await Mag.publishMagazine(revista.id, { actor: 'teste', confirmed: true });
  const depois = usageHistory({ limit: 1000 }).length;

  assert.equal(antes, depois, 'montar a revista não gerou nenhuma chamada extra');
  const blocos = Mag.magazineReadingPages(revista.id);
  assert.equal(blocos.length, 2);
  assert.ok(blocos.every((b) => b.pages.length > 0));
  assert.deepEqual(Mag.magazineEntries(revista.id).map((e) => e.position), [1, 2]);
});

test('a revista não publica com obra ainda não publicada', async () => {
  const c = await obraEmRevisao(10, 'X', 'RevistaC');
  M.registerAuthorApproval(c.manga.id, { actor: 'teste', evidence: 'DM' });
  M.approveForPublication(c.manga.id, { actor: 'teste' });

  const revista = Mag.createMagazine({ editionNumber: 98, title: 'Incompleta', actor: 'teste' });
  Mag.addEntry(revista.id, c.manga.id, { actor: 'teste' });
  await assert.rejects(() => Mag.publishMagazine(revista.id, { actor: 'teste', confirmed: true }), /Publique antes/);
});
