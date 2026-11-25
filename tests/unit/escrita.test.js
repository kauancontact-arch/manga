import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTATO, PRIVACIDADE, REGRAS, SOBRE, TERMOS } from '../../src/web/content.js';
import { SCRIPT_SYSTEM_PROMPT } from '../../src/ai/prompts.js';
import { buildScript, buildXCopy } from '../../src/domain/social.js';
import { GENRES, ART_STYLES, NARRATIVE_TONES, VISUAL_TONES, QUALITY_MODES, NETWORKS } from '../../src/domain/catalog.js';

const TRAVESSAO = '—';

test('as páginas institucionais não usam travessão', () => {
  for (const pagina of [SOBRE, REGRAS, PRIVACIDADE, TERMOS, CONTATO]) {
    assert.ok(!pagina.title.includes(TRAVESSAO), `título de ${pagina.title}`);
    assert.ok(!pagina.lead.includes(TRAVESSAO), `lead de ${pagina.title}`);
    for (const bloco of pagina.blocks) {
      assert.ok(!bloco.heading.includes(TRAVESSAO), `${pagina.title} / ${bloco.heading}`);
      assert.ok(!bloco.body.includes(TRAVESSAO), `${pagina.title} / ${bloco.heading}`);
    }
  }
});

test('os rótulos do catálogo não usam travessão', () => {
  for (const lista of [GENRES, ART_STYLES, NARRATIVE_TONES, VISUAL_TONES, QUALITY_MODES, NETWORKS]) {
    for (const item of lista) {
      assert.ok(!item.label.includes(TRAVESSAO), item.label);
      if (item.desc) assert.ok(!item.desc.includes(TRAVESSAO), item.desc);
    }
  }
});

test('a copy social segue sem travessão depois das mudanças', () => {
  const r = buildScript('Me conte qual foi o maior mico da sua vida.', 150);
  assert.ok(!r.text.includes(TRAVESSAO));
  assert.ok(!buildXCopy('Tema qualquer').text.includes(TRAVESSAO));
});

test('o prompt proíbe travessão no conteúdo gerado pela IA', () => {
  assert.match(SCRIPT_SYSTEM_PROMPT, /NUNCA use travessão/);
  assert.ok(SCRIPT_SYSTEM_PROMPT.includes(TRAVESSAO), 'a regra precisa mostrar o caractere ao modelo');
});
