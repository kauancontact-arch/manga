import { strict as assert } from 'node:assert';
import test from 'node:test';

test('o teto de saída do roteiro acompanha o número de páginas', async () => {
  const { scriptTokenBudget } = await import('../../src/ai/pipeline.js');
  // 4 páginas cabiam no teto antigo; 20 não, e era aí que o JSON vinha cortado.
  assert.ok(scriptTokenBudget(4) >= 6000);
  assert.ok(scriptTokenBudget(20) > scriptTokenBudget(8));
  assert.ok(scriptTokenBudget(20) <= 32000);
  assert.equal(scriptTokenBudget(999), scriptTokenBudget(20), 'acima do limite de páginas não cresce mais');
});

test('o tempo de espera do roteiro acompanha o teto de saída', async () => {
  const { scriptTimeoutMs } = await import('../../src/ai/openai.js');
  const { scriptTokenBudget } = await import('../../src/ai/pipeline.js');
  // Quanto maior o roteiro, mais tempo o modelo leva escrevendo.
  assert.ok(scriptTimeoutMs(6000) >= 120000, 'o piso é o tempo de antes');
  assert.ok(scriptTimeoutMs(scriptTokenBudget(20)) > scriptTimeoutMs(scriptTokenBudget(4)));
  assert.ok(scriptTimeoutMs(scriptTokenBudget(20)) > 5 * 60 * 1000, 'passa de cinco minutos');
  assert.ok(scriptTimeoutMs(999999) <= 540000, 'tem um teto');
});
