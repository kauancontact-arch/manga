import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBalloons, measureBalloon, PAGE_H, PAGE_W, panelGrid, renderComposite, sanitizeBalloons, wrapText } from '../../src/domain/balloons.js';

test('a grade cobre a página sem sair dos limites', () => {
  for (let n = 1; n <= 8; n++) {
    const rects = panelGrid(n);
    assert.equal(rects.length, n);
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0);
      assert.ok(r.x + r.w <= PAGE_W);
      assert.ok(r.y + r.h <= PAGE_H);
      assert.ok(r.w > 80 && r.h > 80);
    }
  }
});

test('quebra de linha respeita a largura disponível', () => {
  const linhas = wrapText('Eu juro que apertei o botão certo mas o elevador tinha outros planos', 300, 25);
  assert.ok(linhas.length > 1);
  for (const l of linhas) assert.ok(l.length <= 24, `linha longa demais: ${l}`);
});

test('o balão cresce com o texto e respeita a largura máxima', () => {
  const curto = measureBalloon('Oi!', { maxWidth: 320 });
  const longo = measureBalloon('Uma fala bem mais comprida que ocupa várias linhas no balão', { maxWidth: 320 });
  assert.ok(longo.height > curto.height);
  assert.ok(longo.width <= 320);
});

test('posiciona narração, falas e onomatopeias dentro do quadro', () => {
  const frames = [{
    id: 'q1', narrador: 'Segunda-feira, 8h47.',
    dialogos: [{ texto: 'Espera, segura a porta!', tipo: 'GRITO', personagem_id: 'p1' }, { texto: 'Esse não é o meu andar...', tipo: 'PENSAMENTO', personagem_id: 'p1' }],
    efeitos_sonoros: ['PLIM'],
  }];
  const rects = panelGrid(1);
  const balloons = layoutBalloons(frames, rects);
  assert.equal(balloons.length, 4);
  assert.deepEqual(balloons.map((b) => b.type), ['NARRACAO', 'GRITO', 'PENSAMENTO', 'SFX']);
  for (const b of balloons) {
    assert.ok(b.x >= rects[0].x - 5 && b.x + b.w <= rects[0].x + rects[0].w + 5, `balão fora do quadro: ${b.id}`);
    assert.ok(b.y >= rects[0].y - 5);
  }
});

test('a onomatopeia não fica no centro do quadro', () => {
  const rects = panelGrid(1);
  const [sfx] = layoutBalloons([{ id: 'q1', dialogos: [], efeitos_sonoros: ['TUM'] }], rects);
  const centroX = rects[0].x + rects[0].w / 2;
  const centroY = rects[0].y + rects[0].h / 2;
  const distante = Math.abs(sfx.x - centroX) > rects[0].w * 0.15 || Math.abs(sfx.y - centroY) > rects[0].h * 0.15;
  assert.ok(distante, 'onomatopeia sobrepõe o centro do quadro');
});

test('a composição é SVG válido com texto acessível', () => {
  const balloons = layoutBalloons([{ id: 'q1', dialogos: [{ texto: 'Olá!', tipo: 'FALA' }], efeitos_sonoros: [] }], panelGrid(1));
  const svg = renderComposite({ balloons, altText: 'Página de teste' });
  assert.match(svg, /^<svg/);
  assert.match(svg, /<title>Página de teste<\/title>/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /<tspan/);
});

test('a composição escapa HTML no texto dos balões', () => {
  const svg = renderComposite({ balloons: sanitizeBalloons([{ id: 'b1', type: 'FALA', text: '<script>alert(1)</script>', x: 10, y: 10, w: 200, h: 80 }]), altText: 'x' });
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
});

test('a edição manual de balões é saneada e limitada', () => {
  const sujos = sanitizeBalloons([
    { id: 'a', type: 'INVALIDO', text: 'ok', x: 99999, y: -9999, w: 1e9, h: 5, fontSize: 500 },
    { id: 'b', type: 'FALA', text: '   ' },
  ]);
  assert.equal(sujos.length, 1);
  assert.equal(sujos[0].type, 'FALA');
  assert.ok(sujos[0].x <= PAGE_W + 200);
  assert.ok(sujos[0].fontSize <= 90);
});
