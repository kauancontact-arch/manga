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

const estimativa = {
  known: true, aiMode: 'live', pages: 4, includeCover: true, characterRefs: 0,
  imageQuality: 'low', calls: { text: 1, image: 5 },
  textCostUsd: 0.02, imageCostUsd: 0.2, totalUsd: 0.22, total: 0.22, items: [],
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

test('o estúdio mostra o erro de uma tarefa que falhou', () => {
  const out = String(A.studioView({
    ctx, manga: { ...manga, status: 'DRAFT', page_min: 3, page_max: 6 },
    submission, challenge: { edition_number: 1 },
    script: null, scriptVersions: [],
    estimate: estimativa,
    jobSummary: {
      active: false, progress: 100, failed: 1, done: true,
      label: '1 tarefa(s) falharam.',
      jobs: [{ type: 'SCRIPT', status: 'FAILED', attempts: 3, max_attempts: 3, error_message: 'A API devolveu 429.' }],
    },
    pages: [], approvals: {}, aiStatus: { mode: 'live', blockers: [] },
  }));
  assert.ok(out.includes('Uma tarefa falhou'), 'o aviso aparece');
  assert.ok(out.includes('A API devolveu 429.'), 'o motivo do erro aparece');
  assert.ok(out.includes('Roteiro:'), 'o tipo da tarefa aparece em português');
  assert.ok(out.includes('Gerar roteiro'), 'o botão de gerar continua disponível');
});

test('o estúdio sem falhas não mostra o aviso', () => {
  const out = String(A.studioView({
    ctx, manga: { ...manga, status: 'DRAFT', page_min: 3, page_max: 6 },
    submission, challenge: { edition_number: 1 },
    script: null, scriptVersions: [],
    estimate: estimativa,
    jobSummary: { active: false, progress: 100, failed: 0, done: true, label: 'Sem tarefas pendentes.' },
    pages: [], approvals: {}, aiStatus: { mode: 'live', blockers: [] },
  }));
  assert.ok(!out.includes('tarefa falhou'));
  assert.ok(!out.includes('tarefas falharam'));
});
