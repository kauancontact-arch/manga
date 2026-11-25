import { strict as assert } from 'node:assert';
import test from 'node:test';
import * as A from '../../src/web/views/admin.js';

/**
 * As telas do painel são montadas por template literal, então um nome errado
 * dentro de uma função só aparece quando aquele ramo é renderizado. O lint faz
 * a checagem de sintaxe e não pega isso. Estes testes renderizam as telas com
 * os ramos opcionais ligados, que é onde um nome errado se esconde.
 */

const ctx = { csrf: 'tok-de-teste', user: { username: 'kauan' }, flash: null };

const page = (over = {}) => ({
  id: 'pg1', manga_id: 'm1', page_number: 1, kind: 'STORY', status: 'READY',
  balloons_json: '[{"id":"b1","type":"FALA","text":"Oi","x":40,"y":40,"w":300,"h":110,"fontSize":34}]',
  panels_json: '[{"x":40,"y":40,"w":920,"h":420}]',
  alt_text: 'Uma página', transcript: 'Oi', version: 2, base_asset_id: null, ...over,
});

const manga = {
  id: 'm1', title: 'Obra de teste', slug: 'obra-de-teste', status: 'IN_REVIEW',
  synopsis: 'Sinopse', network: 'INSTAGRAM', art_style: 'SHONEN', genre: 'COMEDIA',
  quality_mode: 'PADRAO', author_pseudonym: 'Autora',
};

const submission = { id: 's1', author_pseudonym: 'Autora', raw_text: 'Relato', network: 'INSTAGRAM', permalink: '' };

test('a tela de revisão renderiza com o editor de balões aberto', () => {
  const out = String(A.reviewView({
    ctx, manga, submission, pages: [page()],
    approvals: { author: null, editorial: null },
    checklist: [{ label: 'Sinopse preenchida', ok: true }],
    history: [{ version: 1, note: 'Balões editados', actor: 'kauan', created_at: '2026-11-25T00:00:00Z' }],
    balloonPage: page(),
    estimate: { total: 0, source: 'DEMO', items: [] },
  }));
  assert.ok(out.includes('name="_csrf"'), 'o campo de csrf foi renderizado');
  assert.ok(out.includes('refazer-baloes'), 'a ação de refazer layout está na tela');
  assert.ok(out.includes('Salvar balões'));
  assert.ok(!out.includes('—'), 'nenhum travessão na tela');
});

test('a tela de revisão renderiza sem o editor aberto', () => {
  const out = String(A.reviewView({
    ctx, manga, submission, pages: [page()],
    approvals: { author: null, editorial: null },
    checklist: [{ label: 'Sinopse preenchida', ok: true }],
    history: [], balloonPage: null,
    estimate: { total: 0, source: 'DEMO', items: [] },
  }));
  assert.ok(out.includes('Sinopse preenchida'), 'o checklist foi renderizado');
  assert.ok(!out.includes('refazer-baloes'), 'sem página escolhida, não há o que refazer');
});
