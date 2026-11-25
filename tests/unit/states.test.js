import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, TRANSITIONS } from '../../src/domain/mangas.js';
import { MANGA_STATUSES } from '../../src/domain/catalog.js';

test('todos os estados especificados existem com rótulo', () => {
  const esperados = ['RECEIVED', 'SCRIPT_DRAFT', 'SCRIPT_APPROVED', 'GENERATING', 'REVIEW', 'AUTHOR_APPROVED', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'ARCHIVED'];
  for (const estado of esperados) {
    assert.ok(TRANSITIONS[estado], `faltou transição para ${estado}`);
    assert.ok(MANGA_STATUSES[estado]?.label, `faltou rótulo para ${estado}`);
  }
});

test('o caminho feliz é permitido passo a passo', () => {
  const caminho = ['RECEIVED', 'SCRIPT_DRAFT', 'SCRIPT_APPROVED', 'GENERATING', 'REVIEW', 'AUTHOR_APPROVED', 'APPROVED', 'PUBLISHED'];
  for (let i = 0; i < caminho.length - 1; i++) {
    assert.ok(canTransition(caminho[i], caminho[i + 1]), `${caminho[i]} → ${caminho[i + 1]} deveria ser permitido`);
  }
});

test('atalhos perigosos são bloqueados', () => {
  assert.equal(canTransition('RECEIVED', 'PUBLISHED'), false);
  assert.equal(canTransition('SCRIPT_DRAFT', 'PUBLISHED'), false);
  assert.equal(canTransition('GENERATING', 'PUBLISHED'), false);
  assert.equal(canTransition('REVIEW', 'PUBLISHED'), false);
  assert.equal(canTransition('REVIEW', 'APPROVED'), false);
  assert.equal(canTransition('AUTHOR_APPROVED', 'PUBLISHED'), false);
});

test('publicado só sai para arquivado', () => {
  assert.deepEqual(TRANSITIONS.PUBLISHED, ['ARCHIVED']);
});

test('falha é recuperável sem perder o roteiro', () => {
  assert.ok(canTransition('FAILED', 'GENERATING'));
  assert.ok(canTransition('FAILED', 'SCRIPT_APPROVED'));
});

test('nenhuma transição aponta para estado inexistente', () => {
  for (const [from, list] of Object.entries(TRANSITIONS)) {
    for (const to of list) {
      assert.ok(TRANSITIONS[to], `${from} → ${to}: estado de destino não existe`);
    }
  }
});
