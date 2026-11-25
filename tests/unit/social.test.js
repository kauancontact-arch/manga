import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScript, buildXCopy, countWords, estimateDurationSec, isLiteralScript,
  SCRIPT_TEMPLATE, THEME_PRESETS, THEME_PLACEHOLDER, X_LIMIT, WPM_OPTIONS,
} from '../../src/domain/social.js';

test('a copy do roteiro é reproduzida literalmente, mudando apenas o tema', () => {
  const tema = 'Me conte qual foi o maior mico da sua vida.';
  const { text } = buildScript(tema, 150);
  assert.equal(text, SCRIPT_TEMPLATE.replace(THEME_PLACEHOLDER, tema));
  assert.ok(isLiteralScript(text, tema));
  assert.ok(!text.includes(THEME_PLACEHOLDER));
});

test('o roteiro mantém todas as frases aprovadas na ordem', () => {
  const { text } = buildScript('Tema qualquer', 150);
  const esperadas = [
    'Nós vamos transformar um comentário deste vídeo em um mangá de verdade.',
    'E ele pode ser o seu.',
    'O desafio desta semana é:',
    'Conte sua história aqui nos comentários.',
    'O relato mais curtido será transformado gratuitamente em um mangá original, com os créditos para você.',
    'Agora é com você. Conte sua história ou curta aquela que merece virar um mangá.',
    'Você conta. A comunidade escolhe. Nós ilustramos.',
    'MangaLoop. Sua vida pode ser o próximo capítulo.',
  ];
  let cursor = -1;
  for (const frase of esperadas) {
    const idx = text.indexOf(frase);
    assert.ok(idx > cursor, `frase fora de ordem ou ausente: ${frase}`);
    cursor = idx;
  }
});

test('trocar o tema não altera nenhuma outra palavra', () => {
  const a = buildScript('Tema A', 150).text;
  const b = buildScript('Tema B', 150).text;
  assert.equal(a.replace('Tema A', '§'), b.replace('Tema B', '§'));
});

test('duração = palavras ÷ velocidade × 60', () => {
  for (const wpm of WPM_OPTIONS) {
    const r = buildScript('Tema de teste', wpm);
    assert.equal(r.durationSec, (r.words / wpm) * 60);
    assert.equal(r.words, countWords(r.text));
  }
});

test('velocidade maior produz duração menor', () => {
  const lento = buildScript('Tema', 120).durationSec;
  const rapido = buildScript('Tema', 180).durationSec;
  assert.ok(rapido < lento);
});

test('marca roteiros acima de 60 segundos', () => {
  const curto = buildScript('Tema curto', 180);
  assert.equal(curto.overSixty, false);
  const temaLongo = 'palavra '.repeat(120).trim();
  const longo = buildScript(temaLongo, 120);
  assert.equal(longo.overSixty, true);
  assert.ok(longo.durationSec > 60);
});

test('existem exatamente os 10 presets especificados', () => {
  assert.equal(THEME_PRESETS.length, 10);
  assert.equal(THEME_PRESETS[0].text, 'Me conte qual foi o maior mico da sua vida.');
  assert.equal(THEME_PRESETS[9].text, 'Me conte uma lembrança que você gostaria de eternizar para sempre.');
  assert.equal(new Set(THEME_PRESETS.map((p) => p.key)).size, 10);
});

test('tema personalizado é aceito e tema vazio é rejeitado', () => {
  assert.ok(buildScript('Meu tema inventado', 150).text.includes('Meu tema inventado'));
  assert.throws(() => buildScript('', 150), /Tema/);
  assert.throws(() => buildScript('   ', 150), /Tema/);
});

test('copy do X conta caracteres e sinaliza excesso', () => {
  const copy = buildXCopy('Me conte sobre o pior encontro da sua vida.');
  assert.equal(copy.limit, X_LIMIT);
  assert.equal(copy.chars, [...copy.text].length);
  assert.equal(copy.overLimit, false);
  assert.ok(copy.text.includes('Você conta. A comunidade escolhe. Nós ilustramos.'));

  const gigante = buildXCopy('x'.repeat(300));
  assert.equal(gigante.overLimit, true);
});

test('copy do X inclui o link das regras quando configurado', () => {
  const copy = buildXCopy('Tema', { rulesUrl: 'https://exemplo.test/regras' });
  assert.ok(copy.text.includes('https://exemplo.test/regras'));
  assert.ok(buildXCopy('Tema').text.includes('Regras') === false);
});

test('estimativa de duração é estável e proporcional', () => {
  assert.equal(estimateDurationSec(150, 150), 60);
  assert.equal(estimateDurationSec(75, 150), 30);
  assert.equal(estimateDurationSec(0, 150), 0);
});
