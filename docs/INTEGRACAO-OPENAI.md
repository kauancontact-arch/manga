# Integração com a OpenAI

## Estado padrão: demonstração

Sem configuração, `aiMode()` devolve `demo`:

- nenhuma chamada paga é feita;
- o roteiro é montado localmente a partir do relato;
- as páginas são desenhadas por um renderizador procedural (`src/ai/demo.js`), determinístico;
- tudo aparece marcado como **demonstração** no site e no painel;
- o `usage_ledger` registra custo zero com `cost_source = 'DEMO'`, sem se confundir com produção.

Isso existe para que o fluxo editorial inteiro possa ser testado e demonstrado sem gastar crédito.

## Ativando a produção

```dotenv
OPENAI_API_KEY=<chave de projeto nova, com limite de gasto na conta>
OPENAI_TEXT_MODEL=<modelo de texto econômico com saída estruturada>
OPENAI_IMAGE_MODEL=<modelo de imagem de menor custo que atenda a qualidade>
AI_LIVE_ENABLED=true
```

Os quatro valores são obrigatórios: faltando qualquer um, o sistema permanece em demonstração e o painel informa exatamente o que falta.

**Os nomes de modelo não estão no código.** Consulte a documentação oficial vigente antes de preencher: nomes mudam e modelos são descontinuados. A tela de Configurações mostra o que está configurado, sem nunca exibir a chave.

Variáveis auxiliares:

| Variável | Para quê |
| --- | --- |
| `OPENAI_TEXT_API` | `responses` (padrão) ou `chat`, conforme a rota que o modelo escolhido aceita |
| `OPENAI_BASE_URL` | Gateway ou proxy corporativo |
| `OPENAI_IMAGE_SUPPORTS_REFERENCE` | `true` só se o modelo de imagem aceitar imagem de entrada; habilita o reuso da referência de personagem |

## Sobre o SDK

A especificação pede o SDK oficial. O pacote `openai` não pôde ser instalado no ambiente de build (registro de pacotes bloqueado). `src/ai/openai.js` fala o mesmo protocolo HTTP, exclusivamente no backend, e está isolado atrás de duas funções (`generateScript`, `generateImage`). Para adotar o SDK: `npm i openai` e reescrever **apenas esse arquivo** — nada mais no projeto conhece a API.

## Custos

### Como a estimativa é feita

Antes de cada job o painel mostra: número de chamadas de texto e de imagem, páginas, capa, referências, custo de texto, custo de imagem e total.

As tarifas vêm do ambiente, nunca do código:

```dotenv
PRICE_TEXT_INPUT_PER_MTOK=
PRICE_TEXT_OUTPUT_PER_MTOK=
PRICE_IMAGE_PER_CALL_LOW=
PRICE_IMAGE_PER_CALL_MEDIUM=
PRICE_IMAGE_PER_CALL_HIGH=
PRICE_TABLE_UPDATED_AT=2026-01-01
```

**Se a tarifa não estiver configurada, o sistema informa "não informado" e exige confirmação explícita.** Em nenhuma hipótese exibe zero como custo conhecido — zero só aparece no modo demonstração, e identificado como tal. Nenhum preço foi chumbado no código: preencher essas variáveis com os valores da tabela oficial vigente é parte do deploy.

### Orçamento

```dotenv
MONTHLY_AI_BUDGET_USD=
PER_MANGA_AI_BUDGET_USD=
MAX_CONCURRENT_JOBS=2
```

Antes de enfileirar, `budgetGate` soma o já gasto com o estimado. Se estourar o teto, a geração é **bloqueada**; prosseguir exige marcar a confirmação na tela. Regenerações também pedem confirmação.

### Como o custo é mantido baixo

| Técnica | Efeito |
| --- | --- |
| Uma chamada de imagem por página (não por quadro) | Reduz as chamadas de imagem em 3 a 5 vezes |
| Modo econômico padrão (2–4 páginas, qualidade baixa) | Menor custo por obra |
| Roteiro aprovado antes de qualquer imagem | Erros de narrativa custam uma chamada de texto, não cinco de imagem |
| Balões compostos localmente em SVG | Não se paga para a IA tentar escrever texto legível, e corrigir uma fala não gera imagem nova |
| Regeneração por página | Corrigir uma página custa uma chamada, não a obra inteira |
| Idempotência por hash de parâmetros | Clique duplo não vira cobrança dupla |
| Revista reaproveita as páginas | Compilado semanal custa zero |
| Cards e imagens sociais em SVG local | Nenhuma imagem paga para divulgação |
| Nada é gerado ao abrir tela | Só ação explícita do admin dispara chamada |

Uma observação honesta que a especificação pede e vale repetir: **preto e branco não reduz a tarifa por si só**. O ganho de custo vem do número de páginas e do nível de qualidade escolhido, não da ausência de cor.

### Registro de consumo

Cada chamada grava em `usage_ledger`: modelo, parâmetros, tokens de entrada e saída, imagens, custo estimado, custo real quando derivável das tarifas configuradas, e a origem (`VERIFIED`, `ESTIMATE`, `UNKNOWN`, `DEMO`). A tela de Custos separa o que é estimativa do que é verificável e conta quantos registros ficaram sem custo conhecido.

## Consistência de personagens

Não é garantida — nenhum sistema honesto promete isso hoje. O que o projeto faz para maximizá-la:

1. **Bíblia visual** com aparência, roupa, proporções, acessórios, paleta e regras de traço, construída a partir do roteiro e repetida integralmente em todas as chamadas de imagem.
2. **IDs estáveis** de personagem, referenciados quadro a quadro.
3. **Referência de personagem** opcional (modos Equilibrado e Premium), reutilizada como imagem de entrada quando o modelo configurado suporta.
4. **Revisão humana obrigatória**, com regeneração por página e restauração de versão anterior.

## Falhas

Erros 4xx são fatais e não repetem. 429 e 5xx entram em retry com backoff exponencial, até 3 tentativas. Timeout de 120 s (180 s para imagem). Toda falha fica visível no painel, com a mensagem da API, e é retomável por página sem refazer o que já ficou pronto.
