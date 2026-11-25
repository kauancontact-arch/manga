import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.AI_LIVE_ENABLED = 'false';

const { estimateGeneration, formatUsd } = await import('../../src/domain/costs.js');

test('sem tarifas configuradas o custo é desconhecido, nunca zero', () => {
  const e = estimateGeneration({ qualityModeKey: 'ECONOMICO', pages: 4, includeCover: true, sourceChars: 300 });
  assert.equal(e.known, false);
  assert.equal(e.totalUsd, null);
  assert.ok(e.unknownReasons.length >= 1);
  assert.equal(formatUsd(e.totalUsd), 'não informado');
  assert.notEqual(formatUsd(e.totalUsd), 'US$ 0.0000');
});

test('conta uma chamada de imagem por página mais a capa', () => {
  const e = estimateGeneration({ qualityModeKey: 'ECONOMICO', pages: 4, includeCover: true });
  assert.equal(e.calls.image, 5);
  assert.equal(e.calls.text, 1);
  assert.equal(e.calls.total, 6);

  const semCapa = estimateGeneration({ qualityModeKey: 'ECONOMICO', pages: 4, includeCover: false });
  assert.equal(semCapa.calls.image, 4);
});

test('modo quadro a quadro é mais caro em número de chamadas', () => {
  const porPagina = estimateGeneration({ qualityModeKey: 'EQUILIBRADO', pages: 5, includeCover: true, framesTotal: 18 });
  const porQuadro = estimateGeneration({ qualityModeKey: 'EQUILIBRADO', pages: 5, includeCover: true, framesTotal: 18, perFrame: true });
  assert.ok(porQuadro.calls.image > porPagina.calls.image);
  assert.equal(porQuadro.calls.image, 19);
});

test('cada modo de qualidade usa a qualidade de imagem correspondente', () => {
  assert.equal(estimateGeneration({ qualityModeKey: 'ECONOMICO', pages: 2 }).imageQuality, 'low');
  assert.equal(estimateGeneration({ qualityModeKey: 'EQUILIBRADO', pages: 4 }).imageQuality, 'medium');
  assert.equal(estimateGeneration({ qualityModeKey: 'PREMIUM', pages: 8 }).imageQuality, 'high');
});

test('com tarifas configuradas o total é a soma de texto e imagem', async () => {
  process.env.PRICE_TEXT_INPUT_PER_MTOK = '0.15';
  process.env.PRICE_TEXT_OUTPUT_PER_MTOK = '0.60';
  process.env.PRICE_IMAGE_PER_CALL_LOW = '0.011';
  process.env.PRICE_TABLE_UPDATED_AT = '2026-01-01';
  const e = estimateGeneration({ qualityModeKey: 'ECONOMICO', pages: 4, includeCover: true, sourceChars: 300 });
  assert.equal(e.known, true);
  assert.ok(e.imageCostUsd > 0);
  assert.ok(e.textCostUsd > 0);
  assert.ok(Math.abs(e.totalUsd - (e.textCostUsd + e.imageCostUsd)) < 1e-12);
  assert.equal(e.imageCostUsd, 5 * 0.011);
  delete process.env.PRICE_TEXT_INPUT_PER_MTOK;
  delete process.env.PRICE_TEXT_OUTPUT_PER_MTOK;
  delete process.env.PRICE_IMAGE_PER_CALL_LOW;
  delete process.env.PRICE_TABLE_UPDATED_AT;
});
