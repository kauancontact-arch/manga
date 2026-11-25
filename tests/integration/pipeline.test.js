import test from 'node:test';
import assert from 'node:assert/strict';
import { runToReview, seedWinner, useTestDatabase } from '../support/env.js';

useTestDatabase('pipeline');

const { migrate, get, all } = await import('../../src/core/db.js');
migrate({ silent: true });

const M = await import('../../src/domain/mangas.js');
const P = await import('../../src/ai/pipeline.js');
const J = await import('../../src/domain/jobs.js');
const { tick } = await import('../../src/worker.js');
const { usageHistory } = await import('../../src/domain/costs.js');

test('geração de roteiro produz versão validada e muda o estado', async () => {
  const { manga } = await seedWinner({ edition: 1, network: 'INSTAGRAM' });
  assert.equal(manga.status, 'RECEIVED');

  P.startScriptGeneration(manga.id, { actor: 'teste' });
  await tick();

  const atual = M.getManga(manga.id);
  assert.equal(atual.status, 'SCRIPT_DRAFT');
  const script = M.latestScript(manga.id);
  assert.equal(script.version, 1);
  assert.ok(script.script.paginas.length >= 1);
  assert.ok(script.script.personagens.length >= 1);
  assert.equal(atual.title, script.script.titulo);
  assert.ok(all('SELECT * FROM characters WHERE manga_id = ?', [manga.id]).length >= 1);
});

test('sem autorização do autor a geração é recusada', async () => {
  const { manga, submission } = await seedWinner({ edition: 2, network: 'TIKTOK', pseudonym: 'Sem Consent' });
  const { update } = await import('../../src/core/db.js');
  update('submissions', submission.id, { consent_status: 'PENDING' });
  assert.throws(() => P.startScriptGeneration(manga.id, { actor: 'teste' }), /autorização/i);
});

test('não gera imagens antes do roteiro ser aprovado', async () => {
  const { manga } = await seedWinner({ edition: 3, network: 'X', pseudonym: 'Pré Aprovação' });
  P.startScriptGeneration(manga.id, { actor: 'teste' });
  await tick();
  assert.throws(() => P.startImageGeneration(manga.id, { actor: 'teste' }), /aprovado/i);
});

test('jobs são idempotentes: pedir duas vezes não duplica chamadas', async () => {
  const { manga } = await seedWinner({ edition: 4, network: 'INSTAGRAM', pseudonym: 'Idem' });
  P.startScriptGeneration(manga.id, { actor: 'teste' });
  await tick();
  M.approveScript(manga.id, { actor: 'teste' });

  const primeira = P.startImageGeneration(manga.id, { actor: 'teste', includeCover: true });
  const segunda = P.startImageGeneration(manga.id, { actor: 'teste', includeCover: true });
  const ids = new Set([...primeira.jobs, ...segunda.jobs].map((j) => j.id));
  assert.equal(ids.size, primeira.jobs.length, 'a segunda chamada reaproveitou os mesmos jobs');
});

test('pipeline completo deixa a obra em revisão com páginas e capa', async () => {
  const { manga } = await seedWinner({ edition: 5, network: 'TIKTOK', pseudonym: 'Completo' });
  const final = await runToReview(manga.id);
  assert.equal(final.status, 'REVIEW');
  assert.ok(final.page_count >= 1);

  const pages = M.listPages(manga.id);
  assert.ok(pages.every((p) => p.status === 'READY'), 'todas as páginas prontas');
  assert.ok(pages.some((p) => p.kind === 'COVER'), 'capa gerada');
  for (const p of pages) {
    assert.ok(p.base_asset_id, 'imagem base gravada');
    assert.ok((p.alt_text || '').length > 4, 'texto alternativo presente');
  }
  const story = M.storyPages(manga.id);
  assert.ok(JSON.parse(story[0].balloons_json).length > 0, 'camada de balões criada');
});

test('arte base e camada de balões ficam guardadas separadamente', async () => {
  const { manga } = await seedWinner({ edition: 6, network: 'X', pseudonym: 'Camadas' });
  await runToReview(manga.id);
  const page = M.storyPages(manga.id)[0];
  const asset = get('SELECT * FROM assets WHERE id = ?', [page.base_asset_id]);
  assert.ok(asset, 'asset da arte base existe');
  assert.equal(asset.visibility, 'private', 'original fica privado antes de publicar');
  const balloons = JSON.parse(page.balloons_json);
  assert.ok(Array.isArray(balloons) && balloons.length > 0);

  const { pageCompositeStandalone } = await import('../../src/domain/compose.js');
  const svg = await pageCompositeStandalone(page);
  assert.match(svg, /^<svg/);
  assert.ok(!svg.includes('href="/midia/'), 'a composição é autocontida');
});

test('regerar uma página não altera as demais e invalida aprovações', async () => {
  const { manga } = await seedWinner({ edition: 7, network: 'INSTAGRAM', pseudonym: 'Regera' });
  await runToReview(manga.id);
  M.registerAuthorApproval(manga.id, { actor: 'teste', evidence: 'ok' });

  const antes = M.storyPages(manga.id).map((p) => ({ id: p.id, asset: p.base_asset_id }));
  P.regeneratePage(antes[0].id, { actor: 'teste' });
  await tick();
  const depois = M.storyPages(manga.id).map((p) => ({ id: p.id, asset: p.base_asset_id }));

  assert.notEqual(antes[0].asset, depois[0].asset, 'a página pedida foi regerada');
  for (let i = 1; i < antes.length; i++) {
    assert.equal(antes[i].asset, depois[i].asset, `página ${i + 1} foi alterada sem necessidade`);
  }
  assert.equal(M.getManga(manga.id).status, 'REVIEW');
  const aprovacao = get("SELECT * FROM approvals WHERE manga_id = ? AND kind = 'AUTHOR' ORDER BY approved_at DESC LIMIT 1", [manga.id]);
  assert.ok(aprovacao.invalidated_at, 'a aprovação do autor foi invalidada');
});

test('falha de job é visível, registrada e recuperável', async () => {
  const { manga } = await seedWinner({ edition: 8, network: 'TIKTOK', pseudonym: 'Falha' });
  const { job } = J.enqueue({ type: 'PAGE_IMAGE', mangaId: manga.id, params: { teste: 1 }, maxAttempts: 2 });
  const claimed = J.claimNext();
  J.failJob(claimed.id, new Error('API indisponível'));
  const aposPrimeira = J.getJob(job.id);
  assert.equal(aposPrimeira.status, 'QUEUED', 'tenta de novo com backoff');
  assert.ok(new Date(aposPrimeira.run_after) > new Date());
  assert.match(aposPrimeira.error_message, /API indisponível/);

  J.failJob(job.id, new Error('de novo'), { fatal: true });
  assert.equal(J.getJob(job.id).status, 'FAILED');
  assert.ok(J.listJobs({ mangaId: manga.id, status: 'FAILED' }).length >= 1);
});

test('cancelar interrompe as tarefas pendentes da obra', async () => {
  const { manga } = await seedWinner({ edition: 9, network: 'X', pseudonym: 'Cancela' });
  P.startScriptGeneration(manga.id, { actor: 'teste' });
  await tick();
  M.approveScript(manga.id, { actor: 'teste' });
  P.startImageGeneration(manga.id, { actor: 'teste' });
  const cancelados = M.abortGeneration(manga.id, { actor: 'teste' });
  assert.ok(cancelados > 0);
  assert.equal(J.listJobs({ mangaId: manga.id, status: 'QUEUED' }).length, 0);
});

test('em modo demo nenhum custo real é cobrado e tudo fica registrado', async () => {
  const registros = usageHistory({ limit: 500 });
  assert.ok(registros.length > 0);
  assert.ok(registros.every((r) => r.mode === 'demo'));
  assert.ok(registros.every((r) => r.actual_cost_usd === 0));
  assert.ok(registros.every((r) => r.cost_source === 'DEMO'));
});
