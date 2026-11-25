import test from 'node:test';
import assert from 'node:assert/strict';
import { countFrames, extractJson, parseModelScript, parseScript, scriptTranscript } from '../../src/domain/script.js';

const base = {
  titulo: 'O elevador errado',
  sinopse: 'Uma funcionária entra no elevador errado e cai na reunião da diretoria.',
  quantidade_paginas: 2,
  personagens: [{ id: 'p1', nome: 'Lia', descricao: 'Jovem de cabelo curto e crachá torto.' }],
  paginas: [
    { numero: 1, alt_text: 'Lia corre pelo corredor.', quadros: [{ id: 'q1', ordem: 1, acao: 'Lia corre', prompt_visual: 'Corredor com retícula forte', alt_text: 'Lia correndo', dialogos: [{ texto: 'Segura a porta!', tipo: 'GRITO' }] }] },
    { numero: 2, alt_text: 'As portas abrem.', quadros: [{ id: 'q2', ordem: 1, acao: 'Portas abrem', prompt_visual: 'Sala de reunião surpresa', alt_text: 'Diretoria surpresa' }] },
  ],
  capa: { prompt_visual: 'Elevador com luz vermelha', alt_text: 'Capa com elevador' },
};

test('valida um roteiro completo', () => {
  const s = parseScript(structuredClone(base), { maxPages: 6 });
  assert.equal(s.quantidade_paginas, 2);
  assert.equal(countFrames(s), 2);
  assert.equal(s.paginas[0].quadros[0].enquadramento, 'PLANO_MEDIO');
});

test('rejeita roteiro sem páginas ou sem título utilizável', () => {
  assert.throws(() => parseScript({ titulo: 'x' }, { maxPages: 4 }), /Validacao falhou/);
  const semPaginas = structuredClone(base);
  semPaginas.paginas = [];
  assert.throws(() => parseScript(semPaginas, { maxPages: 4 }), /paginas/);
});

test('capa ausente é reparada com prompt utilizável em vez de quebrar o pipeline', () => {
  const semCapa = structuredClone(base);
  delete semCapa.capa;
  const s = parseScript(semCapa, { maxPages: 4 });
  assert.ok(s.capa.prompt_visual.includes(base.titulo));
  assert.ok(s.capa.alt_text.length >= 5);
});

test('corta o roteiro no limite de páginas configurado', () => {
  const grande = structuredClone(base);
  grande.paginas = Array.from({ length: 10 }, (_, i) => ({
    numero: i + 1, alt_text: `Página ${i + 1} com ação.`,
    quadros: [{ id: `q${i}`, ordem: 1, acao: 'algo acontece', prompt_visual: 'cena simples com retícula', alt_text: 'descrição acessível' }],
  }));
  const s = parseScript(grande, { maxPages: 4 });
  assert.equal(s.paginas.length, 4);
  assert.equal(s.quantidade_paginas, 4);
});

test('preenche ids e ordens ausentes de forma determinística', () => {
  const semIds = structuredClone(base);
  delete semIds.personagens[0].id;
  delete semIds.paginas[0].quadros[0].id;
  delete semIds.paginas[0].quadros[0].ordem;
  const s = parseScript(semIds, { maxPages: 4 });
  assert.equal(s.personagens[0].id, 'p1');
  assert.equal(s.paginas[0].quadros[0].id, 'q1_1');
  assert.equal(s.paginas[0].quadros[0].ordem, 1);
});

test('extrai JSON de resposta com cercas de código e vírgula sobrando', () => {
  const sujo = 'Claro!\n```json\n{"a":1,"b":[1,2,],}\n```';
  assert.deepEqual(extractJson(sujo), { a: 1, b: [1, 2] });
  assert.equal(extractJson('sem json aqui'), null);
});

test('parseModelScript devolve erro legível em vez de lançar', () => {
  const r = parseModelScript('desculpe, não consigo ajudar');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/);

  const ok = parseModelScript(JSON.stringify(base), { maxPages: 4 });
  assert.equal(ok.ok, true);
  assert.equal(ok.script.titulo, 'O elevador errado');
});

test('quadros com ids duplicados são rejeitados', () => {
  const dup = structuredClone(base);
  dup.paginas[1].quadros[0].id = 'q1';
  assert.throws(() => parseScript(dup, { maxPages: 4 }), /duplicado/);
});

test('diálogo sem personagem assume o único personagem existente', () => {
  const s = parseScript(structuredClone(base), { maxPages: 4 });
  assert.equal(s.paginas[0].quadros[0].dialogos[0].personagem_id, 'p1');
  assert.match(scriptTranscript(s), /Lia \(gritando\): Segura a porta!/);
});

test('a transcrição cobre todas as páginas e quadros', () => {
  const t = scriptTranscript(parseScript(structuredClone(base), { maxPages: 4 }));
  assert.match(t, /Página 1/);
  assert.match(t, /Página 2/);
  assert.match(t, /Quadro 1/);
});
