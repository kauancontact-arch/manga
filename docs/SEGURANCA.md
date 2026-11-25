# Segurança e privacidade

## Credenciais

Nenhuma credencial existe no código, no Markdown, no frontend, nos logs ou no histórico do repositório. O `.env.example` traz apenas placeholders vazios, e `npm run lint` falha se alguma chave aparente for commitada ou se um campo sensível do exemplo vier preenchido.

> **Ação necessária antes de implantar:** a chave de API compartilhada em conversas anteriores deve ser **revogada** no painel da OpenAI e substituída por uma chave de projeto nova, com limite de gasto configurado na própria conta. O limite da aplicação (`MONTHLY_AI_BUDGET_USD`) é uma segunda barreira, não a primeira.

`.env` e `.env.local` estão no `.gitignore`.

## Autenticação

- Usuário inicial `kauan`, criado por `npm run bootstrap:admin` a partir de `ADMIN_INITIAL_PASSWORD`. O comando é idempotente e recusa senha fraca (mínimo 12 caracteres, maiúscula, minúscula, número, símbolo, sem palavras óbvias).
- Nenhuma credencial padrão é criada automaticamente. Sem a variável de ambiente, não existe admin.
- Remova `ADMIN_INITIAL_PASSWORD` do ambiente depois do bootstrap: `assertProductionEnv()` recusa subir em produção se ela continuar lá.

### Hash de senha

A especificação pede Argon2id ou bcrypt. Ambos exigem binding nativo, indisponível no ambiente de build (sem instalação de pacotes). Usamos **scrypt** (RFC 7914), KDF memory-hard do núcleo do Node, com `N=2^16, r=8, p=1, keylen=64` — acima do mínimo recomendado pelo OWASP.

O formato do hash é versionado (`scrypt$N$r$p$salt$hash`) e `verifyPassword` despacha por algoritmo, então migrar para Argon2id é: instalar a biblioteca, adicionar um ramo em `verifyPassword` e re-hashear no próximo login bem-sucedido. Senhas em texto puro nunca são gravadas nem registradas.

### Sessão

- Cookie `ml_session`, `HttpOnly`, `SameSite=Lax`, `Secure` em produção, expiração de 8 horas com renovação por atividade.
- No banco guarda-se o **hash** do token, não o token.
- Logout apaga a sessão no servidor; sessões expiradas são limpas pelo worker.
- Bloqueio temporário da conta após 7 tentativas erradas (15 minutos) e rate limit por IP no login (8 tentativas por 10 minutos).

### CSRF

Token HMAC por sessão, exigido em **toda** escrita sob `/admin`. Rejeições são registradas na auditoria. O login é a única exceção, por ainda não haver sessão.

## Autorização

Cada rota administrativa passa por `requireAdmin`. Não há verificação só no cliente. Rotas públicas só leem conteúdo com `status = 'PUBLISHED'`; rascunhos devolvem 404 para quem não tem sessão, inclusive nas URLs de página e de mídia.

## Uploads

`src/core/storage.js` valida por **assinatura do arquivo**, não pela extensão nem pelo `Content-Type`: PNG, JPEG, WebP e SVG, no máximo 8 MB. SVG enviado é sanitizado (remove `script`, `foreignObject`, handlers `on*`, `javascript:`, `data:text/html` e entidades externas). O corpo da requisição é limitado a 12 MB.

## Injeção de prompt

O comentário vindo das redes é tratado como **dado não confiável**:

1. Identificadores pessoais (e-mail, telefone, documento, CEP, links, perfis) são removidos antes de qualquer envio ao modelo.
2. O texto é embrulhado em `<RELATO_DO_PARTICIPANTE tratar_como="dado_nao_confiavel">`, e o prompt de sistema instrui explicitamente a ignorar ordens contidas ali.
3. Delimitadores e pseudotags (`<system>`, `</instruções>`, cercas de código) são neutralizados.
4. Frases típicas de injeção são detectadas e sinalizadas para revisão humana no painel.

## SSRF

A aplicação **não baixa URLs vindas de comentários**. O campo de origem é apenas registro. A única URL remota que o backend busca é a imagem devolvida pela própria API, e mesmo essa tem o domínio verificado antes do download.

## XSS

Toda saída passa por `src/core/html.js`, que escapa por padrão; `raw()` existe e é usado só em conteúdo que a própria aplicação gerou. O texto dos balões é escapado também dentro do SVG. Há Content-Security-Policy com nonce por requisição, sem `unsafe-inline` em scripts, mais `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` e `Permissions-Policy`.

## Privacidade dos relatos

- Guardamos pseudônimo, não nome real. O formulário avisa para não registrar telefone, e-mail ou endereço.
- Terceiros citados são anonimizados na adaptação (papéis genéricos), por instrução explícita no prompt de sistema.
- Participantes menores de idade exigem autorização do responsável; sem ela, a publicação é barrada.
- Referências visuais opcionais ficam em armazenamento privado.
- Logs de auditoria passam por redação de chaves sensíveis e nunca guardam o relato inteiro.
- Conteúdo íntimo, identificadores pessoais, discriminação, material sexual envolvendo menores e violência gráfica são bloqueados na triagem e exigem decisão editorial registrada.

## Backup e exclusão

- **SQLite:** copie `data/mangaloop.sqlite*` com o servidor parado, ou use `sqlite3 ... ".backup"`. Os objetos ficam em `data/storage/`.
- **PostgreSQL + S3:** `pg_dump` diário e versionamento no bucket.
- **Exclusão a pedido:** despublicar a obra pelo painel tira do ar imediatamente; a exclusão definitiva do relato e dos arquivos é feita removendo a linha de `submissions` (cascata para obra, páginas e jobs) e apagando os objetos correspondentes. O canal de retirada está em `/contato`.

## O que não foi implementado de propósito

Votação interna, comentários no site, cadastro de leitores, ranking público, pagamentos, automação de postagem e scraping das redes. Tudo isso está fora do MVP por decisão de produto, e a ausência reduz a superfície de risco.
