# Arquitetura

## Decisão de stack e por que ela difere do pedido original

A especificação sugere Next.js, TypeScript, Tailwind, PostgreSQL e Prisma. O ambiente em que esta implementação foi construída **não tem acesso ao registro de pacotes** (`npm install` é recusado por política de rede). Em vez de entregar um esqueleto que não roda, o projeto foi construído sobre o que o runtime oferece de fábrica:

| Camada | Especificação | Implementado | Como migrar |
| --- | --- | --- | --- |
| Framework | Next.js (App Router) | Servidor HTTP próprio com roteador, renderização no servidor e melhorias progressivas | As views são funções puras que devolvem HTML; viram componentes React com pouca cirurgia |
| Tipos | TypeScript | JavaScript ESM com JSDoc e validação por schema em tempo de execução | Renomear para `.ts` e adicionar tipos; os contratos já estão explícitos em `src/domain/script.js` |
| CSS | Tailwind | Design system próprio com tokens CSS (`src/web/assets/styles.css`) | Os tokens mapeiam direto para `theme.extend` do Tailwind |
| Banco | PostgreSQL + Prisma | `node:sqlite` com SQL padrão e migrations versionadas | Ver "Portabilidade do banco" abaixo |
| Validação | Zod | `src/core/schema.js`, API compatível (`z.object`, `.parse`, `.safeParse`, `.optional`, `.default`) | Trocar o import; as regras não mudam |
| SDK OpenAI | pacote `openai` | Cliente HTTP próprio em `src/ai/openai.js`, mesmo protocolo | Trocar o conteúdo de um arquivo |
| Armazenamento | S3 | Driver local **e** driver S3 com assinatura SigV4 | Já pronto: `STORAGE_DRIVER=s3` |

O resultado é uma aplicação com **zero dependências de produção**, que sobe com `node src/server.js`. Isso tem efeitos colaterais positivos: superfície de ataque menor, sem risco de cadeia de suprimentos, build instantâneo. E um custo: nenhuma das conveniências de ecossistema vem de graça.

---

## Camadas

```
HTTP  →  src/server.js         sessão, CSRF, rate limit, erros, estáticos
         src/web/public.js     rotas públicas (somente leitura de conteúdo publicado)
         src/web/admin.js      rotas /admin/* (todas exigem sessão)
              ↓
Domínio  src/domain/*.js       regras de negócio, máquina de estados, orçamento
              ↓
IA       src/ai/pipeline.js    orquestra roteiro → imagens → balões
         src/ai/openai.js      único ponto que fala com a API paga
         src/ai/demo.js        renderizador local, custo zero
              ↓
Infra    src/core/*.js         banco, armazenamento, auth, auditoria, HTML
```

Regras que a estrutura garante:

- **Nenhuma rota pública chama a IA.** As rotas de geração vivem sob `/admin` e passam pelo guarda de sessão.
- **Nenhuma requisição HTTP espera a geração terminar.** A rota enfileira; o worker processa.
- **Toda transição de estado é validada no servidor**, não na interface.

---

## Modelo de dados

Entidades e o papel de cada uma:

| Tabela | Papel |
| --- | --- |
| `admin_users`, `sessions`, `rate_limits` | Acesso administrativo |
| `challenges` | Desafio da semana: tema, datas, links das três redes, status |
| `submissions` | Relato apurado: rede, comentário, votos, origem, pseudônimo, consentimento, sinalizações de triagem |
| `mangas` | A obra: parâmetros narrativos e visuais, estado, versão, contagem de páginas, créditos |
| `characters` | Bíblia visual persistida, uma linha por personagem do roteiro |
| `script_versions` | Histórico completo dos roteiros em JSON |
| `pages`, `page_versions` | Página: arte base, camada de balões, alt, transcrição, versão e histórico |
| `assets` | Objetos no armazenamento, com visibilidade privada/pública |
| `generation_jobs` | Fila persistente com idempotência, tentativas e custo |
| `usage_ledger` | Consumo por chamada: modelo, tokens, imagens, custo estimado e real |
| `approvals` | Aprovações de roteiro, do autor e editorial, com invalidação |
| `magazines`, `magazine_entries` | Revista semanal e ordem editorial |
| `social_scripts` | Histórico do gerador de roteiros |
| `audit_logs` | Trilha de auditoria sem segredos |
| `site_settings` | Configuração editável pelo painel |
| `generation_cache` | Reuso por hash de parâmetros |

Invariantes garantidas pelo banco, não só pelo código:

```sql
-- uma vaga ativa por edição e rede
CREATE UNIQUE INDEX uq_submission_slot
  ON submissions(challenge_id, network) WHERE status = 'SELECTED';

-- um participante não ocupa duas vagas na mesma semana
CREATE UNIQUE INDEX uq_submission_author_week
  ON submissions(challenge_id, author_pseudonym)
  WHERE status = 'SELECTED' AND author_pseudonym IS NOT NULL;
```

Datas são gravadas em UTC (ISO-8601) e convertidas para `America/Sao_Paulo` na interface (`src/core/dates.js`), inclusive na ida: o que o admin digita num campo `datetime-local` é interpretado no fuso editorial.

---

## Máquina de estados da obra

```
RECEIVED → SCRIPT_DRAFT → SCRIPT_APPROVED → GENERATING → REVIEW
         → AUTHOR_APPROVED → APPROVED → SCHEDULED → PUBLISHED → ARCHIVED
                                   ↘ FAILED (retomável)
```

- Atalhos como `RECEIVED → PUBLISHED` são recusados no servidor.
- `PUBLISHED` só sai para `ARCHIVED`.
- Qualquer alteração em parâmetros, roteiro, páginas ou balões depois de uma aprovação **invalida a aprovação** e devolve a obra para `REVIEW` (`invalidateApprovalsIfNeeded`).

---

## Geração: o pipeline

1. **Validação** — consentimento, elegibilidade e triagem de conteúdo. Bloqueios param a geração.
2. **Roteiro** — uma chamada de texto com saída estruturada, validada por schema; até duas tentativas, a segunda informando o erro da primeira. O JSON passa por reparo (cercas de código, vírgula sobrando, IDs e ordens ausentes).
3. **Aprovação do roteiro** — nenhuma imagem paga é gerada antes disso.
4. **Bíblia visual** — descrição canônica de personagens, roupas, proporções, paleta e regras de traço, reaproveitada em **todas** as chamadas de imagem. É o que sustenta a consistência entre páginas geradas por requisições independentes.
5. **Imagens** — uma chamada por página (modo econômico) com o layout de quadros descrito no prompt e instrução explícita de deixar o topo de cada quadro livre. Capa em chamada separada. Fallback por quadro é opcional e mais caro.
6. **Balões** — compostos como SVG determinístico sobre a arte base, com quebra de linha controlada, tipos (fala, pensamento, grito, sussurro, narração, onomatopeia), rabicho e contraste. O texto **nunca** é pedido à IA de imagem.
7. **Revisão** — regeneração por página, comparação de versões e restauração.
8. **Publicação** — transacional, com promoção dos arquivos para público.

A arte base e a camada de balões ficam guardadas separadamente. A composição é montada na entrega (`src/domain/compose.js`), o que permite reescrever uma fala sem gerar imagem de novo.

> Detalhe que custou um bug: um SVG carregado por `<img>` não busca recursos externos. A rota `/pagina/:id.svg` entrega a composição **autocontida**, com a arte base embutida.

---

## Fila de jobs

- **Idempotência** por chave derivada de tipo, obra, página, versão e hash dos parâmetros. Pedir a mesma geração duas vezes devolve o mesmo job.
- **Retry** com backoff exponencial até `max_attempts`; erros 4xx da API são marcados fatais e não repetem.
- **Timeout**: jobs `RUNNING` parados há mais de 5 minutos voltam para a fila.
- **Cancelamento** por obra, que também devolve a obra ao estado anterior.
- **Concorrência** limitada por `MAX_CONCURRENT_JOBS`.

---

## Portabilidade do banco

Todo acesso passa por `src/core/db.js`, que expõe `get`, `all`, `run`, `tx`, `insert`, `update`. O SQL é padrão e usa parâmetros posicionais. Para migrar para PostgreSQL:

1. Instalar `pg`.
2. Reimplementar `get/all/run/tx` sobre um pool, trocando `?` por `$1..$n`.
3. Ajustar na migration: `TEXT PRIMARY KEY` continua válido; índices únicos parciais (`WHERE`) existem no Postgres com a mesma sintaxe; `PRAGMA` sai.
4. O restante do código não muda.

A mesma lógica vale para o armazenamento: `src/core/storage.js` já traz os dois drivers.

---

## Acessibilidade e SEO

- Cada página de mangá tem `alt` próprio e transcrição textual dos diálogos, exposta no leitor.
- O SVG composto carrega `role="img"` e `<title>`.
- Metadados Open Graph e imagem social são gerados localmente em SVG, sem custo de IA.
- O sitemap lista apenas obras publicadas; rascunhos retornam 404 para quem não tem sessão.
