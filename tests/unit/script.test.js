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
