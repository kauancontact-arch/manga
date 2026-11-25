# Implantação

## Antes de subir

- [ ] **Revogar a chave de API antiga** da OpenAI e criar uma chave de projeto nova, com limite de gasto definido na própria conta.
- [ ] Gerar `AUTH_SECRET` com `openssl rand -base64 48`.
- [ ] Definir `APP_URL` com `https://` — a aplicação recusa subir em produção sem isso.
- [ ] Preencher as tarifas `PRICE_*` com os valores da tabela oficial vigente e registrar `PRICE_TABLE_UPDATED_AT`.
- [ ] Definir `MONTHLY_AI_BUDGET_USD` e `PER_MANGA_AI_BUDGET_USD`.
- [ ] Decidir o armazenamento: `STORAGE_DRIVER=s3` com bucket privado, ou disco com backup.
- [ ] Rodar `npm run lint`, `npm run build` e `npm test`.
- [ ] Ler [docs/SEGURANCA.md](SEGURANCA.md) e [docs/INTEGRACAO-OPENAI.md](INTEGRACAO-OPENAI.md).

## Variáveis mínimas de produção

```dotenv
NODE_ENV=production
APP_URL=https://seudominio.com
DATABASE_URL=postgresql://...      # ou file:./data/mangaloop.sqlite em instância única
AUTH_SECRET=<48 bytes aleatórios>
ADMIN_USERNAME=kauan
WORKER_TOKEN=<aleatório, se for disparar o worker por HTTP>
STORAGE_DRIVER=s3
STORAGE_BUCKET=...
STORAGE_ENDPOINT=https://...
STORAGE_REGION=...
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
MONTHLY_AI_BUDGET_USD=25
PER_MANGA_AI_BUDGET_USD=1.5
```

`assertProductionEnv()` recusa iniciar se `AUTH_SECRET` for curto, se `APP_URL` não for HTTPS, se o banco ainda apontar para SQLite ou se `ADMIN_INITIAL_PASSWORD` continuar no ambiente.

## Primeira subida

```bash
npm run migrate
ADMIN_INITIAL_PASSWORD='<senha forte>' npm run bootstrap:admin
unset ADMIN_INITIAL_PASSWORD        # e remova da configuração do serviço
npm start                           # processo web
npm run worker                      # processo do worker
```

Para instância única: `WORKER_EMBEDDED=true npm start`.

> Não rode `npm run seed` em produção. Ele cria conteúdo de demonstração e se recusa a rodar com a IA em modo produção, mas o lugar dele é o ambiente de testes.

## Topologia sugerida

```
Internet → proxy TLS (Caddy, nginx ou o balanceador da plataforma)
             ↓
         processo web (node src/server.js)         ← stateless
         processo worker (node src/worker.js)      ← um só, para não duplicar geração
             ↓
         PostgreSQL + bucket S3
```

Com SQLite, web e worker precisam compartilhar o mesmo volume — logo, a mesma máquina. Com PostgreSQL, escalam separados.

O worker também pode ser disparado por cron externo, autenticado por `WORKER_TOKEN`; a execução é idempotente e segura para repetir.

## Serviço systemd

```ini
[Unit]
Description=MangaLoop web
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/mangaloop
EnvironmentFile=/etc/mangaloop/env
ExecStart=/usr/bin/node src/server.js
Restart=always
User=mangaloop
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/mangaloop/data

[Install]
WantedBy=multi-user.target
```

Duplique a unidade trocando `ExecStart` para `src/worker.js`.

## Proxy reverso

Encaminhe `X-Forwarded-For` (usado no rate limit) e termine TLS no proxy. Não há necessidade de cache na frente: as páginas públicas já enviam `Cache-Control` e `ETag`, e as composições de página são imutáveis por versão.

## Pós-implantação

- [ ] Entrar em `/admin` e trocar a senha inicial em Configurações.
- [ ] Preencher links das redes, contato e canal de retirada.
- [ ] Conferir em Configurações que o modo de IA está como esperado.
- [ ] Abrir `/sitemap.xml` e `/robots.txt`.
- [ ] Rodar Lighthouse em `/` e numa página de leitor (ver [docs/ACESSIBILIDADE.md](ACESSIBILIDADE.md)).
- [ ] Fazer uma obra de ponta a ponta em homologação antes da primeira edição real.
- [ ] Configurar backup do banco e do bucket.

## Atualizações

```bash
git pull
npm run migrate      # idempotente
npm run lint && npm test
systemctl restart mangaloop-web mangaloop-worker
```

Migrations são aplicadas uma vez e registradas em `_migrations`. Não há etapa de build: o servidor renderiza HTML diretamente.
