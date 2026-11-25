# Etapas de implementação e skills utilizadas

A ordem seguiu a especificação (seção 11). Abaixo, o que foi feito em cada etapa, o que foi validado e quais *skills* entraram — separando honestamente **o que foi usado** do **que está previsto** para as próximas iterações.

---

## Etapa 1 — Fundação, design system, banco, autenticação e site público

**Entregue**
Scaffold sem dependências; tokens CSS da identidade institucional (Ink Black, Manga Paper, Tokyo Red, Golden Chapter, Graphite) com Anton, Space Grotesk e Inter; esquema do banco com 17 tabelas e migrations versionadas; sessão com hash de senha, CSRF, rate limit e auditoria; site público mobile-first com home, catálogo, obra, leitor, revistas e páginas institucionais; seed de demonstração identificado.

**Validação** — migrations aplicadas e reaplicadas sem efeito colateral; 13 rotas públicas respondendo 200; redirecionamento do painel sem sessão; contrastes calculados pela fórmula WCAG.

**Skills usadas**
- `emilkowalski-skills:mobile-native` — aplicada ao design system e aos dois layouts. Rendeu correções concretas: `-webkit-tap-highlight-color: transparent`, `overscroll-behavior` na raiz e `contain` nos contêineres roláveis, `touch-action: manipulation` nos alvos de toque, `user-select: none` só em controles, todas as regras `:hover` fechadas em `@media (hover: hover) and (pointer: fine)`, `100dvh` no leitor, `env(safe-area-inset-top)` no cabeçalho, `interactive-widget=resizes-content` no viewport, `theme-color` declarado e `inputmode`/`enterkeyhint` nos campos.

**Previstas**
- `anthropic-skills:frontend-design` — segunda passada de direção visual quando houver os assets oficiais.
- `anthropic-skills:built-in-browser` ou `chrome-browser` — abrir as telas num navegador real para a auditoria visual que este ambiente não permite.

---

## Etapa 2 — CRUD editorial, desafios, gerador social e vencedores

**Entregue**
CRUD de desafios com datas no fuso editorial e links das três redes; gerador de roteiro com a copy aprovada reproduzida literalmente, dez presets, velocidade 120/150/180 ppm, contagem de palavras, duração estimada, aviso acima de 60 s e histórico; copy do X com contador de caracteres e link de regras; cadastro de relatos vencedores com triagem de conteúdo, consentimento, vaga única por rede, limite de uma vaga por participante, desempate e liberação de vaga com motivo.

**Validação** — 11 testes só da copy (literalidade frase a frase, invariância ao trocar o tema, fórmula da duração); índices únicos parciais no banco barrando vaga duplicada; teste de jornada confirmando que a segunda vaga na mesma rede é recusada.

**Skills usadas** — nenhuma. É regra de negócio e texto aprovado; qualquer skill aqui seria enfeite.

---

## Etapa 3 — Pipeline textual, editor de roteiro e aprovação

**Entregue**
Prompt de sistema com o relato sempre delimitado como dado não confiável; schema completo do roteiro (personagens com ID, cenários, páginas, quadros, enquadramento, ação, expressão, diálogos, narrador, efeitos sonoros, texto alternativo e prompt visual); extração e reparo de JSON; duas tentativas, a segunda informando o erro da primeira; editor de roteiro no painel; aprovação obrigatória antes de qualquer imagem paga.

**Validação** — 10 testes de schema, incluindo resposta suja com cerca de código e vírgula sobrando; 6 testes de injeção de prompt e remoção de identificadores.

**Skills usadas** — nenhuma. Prompt e contrato JSON foram escritos à mão a partir da especificação.

---

## Etapa 4 — Jobs de imagem, balões, revisão, custos e armazenamento

**Entregue**
Fila persistente com idempotência por hash, retry com backoff, timeout, cancelamento e limite de concorrência; bíblia visual reaproveitada em todas as chamadas; uma chamada por página no modo econômico; camada de balões em SVG determinístico, separada da arte base, com seis tipos, quebra de linha e rabicho; revisão com regeneração por página, histórico e restauração; estimativa de custo, orçamento por obra e por mês, registro de consumo; armazenamento local e S3 com assinatura SigV4.

**Validação** — 10 testes de pipeline (idempotência, isolamento da regeneração, separação das camadas, falha retomável, cancelamento); 8 testes de balões; 5 de orçamento, incluindo o caso em que o custo é desconhecido e o sistema se recusa a exibir zero.

**Skills usadas** — nenhuma invocada. O renderizador de demonstração e o compositor de balões são código próprio, verificados rasterizando as páginas e olhando o resultado.

**Previstas**
- `dataviz` — se a tela de Custos ganhar gráficos de consumo ao longo do tempo. Hoje são tabelas, que bastam para o volume atual.

---

## Etapa 5 — Publicação, revista, leitor, SEO, testes e documentação

**Entregue**
Publicação transacional com dupla aprovação e confirmação explícita; agendamento pelo worker; despublicação; revista reaproveitando páginas sem custo extra; leitor vertical e página a página com progresso, teclado, toque e transcrição; Open Graph, imagem social gerada localmente, sitemap só de obras publicadas, compartilhamento nativo com fallback; 89 testes; documentação completa.

**Validação** — 9 testes de publicação, 16 de jornada HTTP ponta a ponta (login, três vencedores, geração, aprovações, publicação, leitura anônima, rascunho não vazando, sitemap, revista, logout).

**Skills usadas**
- `anthropic-skills:docs` — para entregar esta documentação como documento editável.

**Previstas**
- `railway:use-railway` — para a implantação, quando você decidir subir. O conector da Railway já está disponível nesta sessão: dá para criar o projeto, provisionar PostgreSQL e bucket, configurar variáveis e domínio, e acompanhar os logs do deploy.
- `anthropic-skills:pdf` — se quiser a revista semanal também em PDF para download.

---

## Skills consideradas e descartadas

| Skill | Por que não |
| --- | --- |
| `emilkowalski-skills:animate`, `choreograph`, `gestures` | A especificação pede interface de leitura limpa. O leitor tem transições curtas e `prefers-reduced-motion`; mais movimento atrapalharia a leitura. |
| `emilkowalski-skills:break-ui` | Vale a pena numa próxima rodada, com nomes longos, pseudônimos de uma letra, relatos gigantes e emoji. Hoje os limites estão no schema, não testados de forma adversarial. |
| `anthropic-skills:xlsx`, `pptx` | Nenhum entregável do MVP é planilha ou apresentação. |
| `anthropic-skills:skill-creator` | Nada aqui é procedimento recorrente que justifique virar skill. |
| `workflows:*`, `anthropic-skills:video-making` | Fora do escopo (jogos e vídeo). |

---

## Resumo honesto

Uma skill mudou o código de verdade: `mobile-native`, e as correções estão listadas acima. `docs` entra na entrega desta documentação, e `use-railway` entra se e quando você mandar implantar. As demais etapas foram implementação direta da especificação — e dizer que usei mais skills do que usei seria enfeitar o relatório.
