# MangaLoop

Editora digital colaborativa que transforma comentários das redes sociais em mangás originais, com apoio de inteligência artificial e curadoria editorial humana.

**Sua vida pode ser o próximo capítulo.**
Você conta. A comunidade escolhe. Nós ilustramos.

---

## O que já está implementado

| Área | Situação |
| --- | --- |
| Site público mobile-first (home, catálogo, obra, leitor, revistas, institucional) | Funcional |
| Leitor vertical e página a página, com progresso local, teclado, toque e transcrição | Funcional |
| Banco de dados, migrations e seed de demonstração identificado | Funcional |
| Autenticação administrativa, sessão, CSRF, rate limit e auditoria | Funcional |
| Painel editorial completo (10 seções) | Funcional |
| Gerador de roteiro semanal (copy literal) e copy do X | Funcional |
| Cadastro de relatos vencedores, vagas por rede, consentimento e desempate | Funcional |
| Pipeline de IA: roteiro em JSON validado → aprovação → imagens → balões → revisão | Funcional |
| Fila de jobs persistente com idempotência, retry, backoff, timeout e cancelamento | Funcional |
| Camada de balões SVG editável, separada da arte base | Funcional |
| Custos: estimativa, orçamento, registro de consumo e bloqueio | Funcional |
| Publicação, agendamento, despublicação e revista semanal | Funcional |
| SEO, Open Graph, sitemap, compartilhamento nativo | Funcional |
| Integração OpenAI (texto + imagem) | Implementada, **desligada por padrão** |
| Testes unitários, de integração e jornada HTTP ponta a ponta | 89 testes |

Por padrão a aplicação roda em **modo demonstração**: nenhuma chamada paga é feita, as páginas são desenhadas localmente e tudo aparece identificado como demonstração. Ver [docs/INTEGRACAO-OPENAI.md](docs/INTEGRACAO-OPENAI.md) para ativar a produção.

---

## Requisitos

- **Node.js 22.5 ou superior** (usa o SQLite embutido do Node, `node:sqlite`)
- Nenhuma dependência externa em produção (`dependencies` vazio)
- PostgreSQL e armazenamento S3 são opcionais e documentados em [docs/ARQUITETURA.md](docs/ARQUITETURA.md)

---

## Instalação

```bash
git clone <repositório> mangaloop
cd mangaloop
cp .env.example .env
```

Edite o `.env`. Para desenvolvimento, o mínimo é:

```dotenv
DATABASE_URL=file:./data/mangaloop.sqlite
AUTH_SECRET=<gere com: openssl rand -base64 48>
APP_URL=http://localhost:3000
ADMIN_USERNAME=kauan
ADMIN_INITIAL_PASSWORD=<senha forte, usada só no bootstrap>
```

Depois:

```bash
npm run migrate            # cria o esquema
npm run bootstrap:admin    # cria o usuário kauan com a senha do ambiente
npm run seed               # (opcional) conteúdo de DEMONSTRAÇÃO identificado
npm start                  # http://localhost:3000
npm run worker             # em outro terminal: fila de geração e agendamentos
```

Remova `ADMIN_INITIAL_PASSWORD` do ambiente assim que o usuário existir.

Para um processo só (desenvolvimento ou instância pequena):

```bash
WORKER_EMBEDDED=true npm start
```

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm start` | Sobe o servidor HTTP |
| `npm run dev` | Servidor com recarga automática |
| `npm run worker` | Worker de geração, publicação agendada e limpeza de sessões |
| `npm run migrate` | Aplica migrations pendentes (idempotente) |
| `npm run bootstrap:admin` | Cria ou redefine a senha do admin inicial (idempotente) |
| `npm run seed` | Popula a demonstração; recusa rodar com IA em modo produção |
| `npm test` | Suíte completa: 89 testes unitários e de integração |
| `npm run test:unit` | Só unitários |
| `npm run test:integration` | Só integração e jornada HTTP |
| `npm run test:e2e` | E2E de navegador (Playwright, exige instalação local) |
| `npm run lint` | Sintaxe, SVGs e varredura de credenciais no código |
| `npm run build` | Verifica artefatos estáticos e tokens de design |

---

## Estrutura

```
src/
  config/env.js          Ambiente, modo de IA, validação de produção
  core/                  Infra: banco, migrations, HTTP, auth, storage, auditoria
  domain/                Regras de negócio (desafios, relatos, obras, custos, balões…)
  ai/                    Prompts, cliente OpenAI, renderizador de demonstração, pipeline
  web/                   Rotas públicas e administrativas + views
  cli/                   migrate, seed, bootstrap-admin, lint, build
  server.js              Montagem do servidor
  worker.js              Fila e agendamentos
tests/
  unit/                  Copy, estados, orçamento, schema, segurança, balões
  integration/           Autenticação, pipeline, publicação, jornada HTTP ponta a ponta
  e2e/                   Playwright (navegador, execução local)
docs/                    Arquitetura, segurança, operação, OpenAI, acessibilidade, limitações
```

---

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — decisões técnicas, modelo de dados, portabilidade
- [docs/SEGURANCA.md](docs/SEGURANCA.md) — autenticação, CSRF, uploads, injeção de prompt, privacidade
- [docs/INTEGRACAO-OPENAI.md](docs/INTEGRACAO-OPENAI.md) — ativar produção, modelos, custos, orçamento
- [docs/OPERACAO.md](docs/OPERACAO.md) — rotina editorial da semana, passo a passo no painel
- [docs/ACESSIBILIDADE.md](docs/ACESSIBILIDADE.md) — contraste, navegação, leitura assistida
- [docs/DEPLOY.md](docs/DEPLOY.md) — checklist de implantação
- [docs/DECISOES-E-LIMITACOES.md](docs/DECISOES-E-LIMITACOES.md) — o que foi assumido e o que falta
- [docs/ETAPAS-E-SKILLS.md](docs/ETAPAS-E-SKILLS.md) — etapas de implementação e skills usadas em cada uma

---

## Licença e conteúdo

Os relatos pertencem a quem os escreveu e são adaptados mediante autorização registrada. As obras são adaptações ilustradas com apoio de IA, revisadas por pessoas antes da publicação. O logotipo embutido é uma marca conceitual em SVG: o arquivo oficial pode ser enviado pelo painel.
