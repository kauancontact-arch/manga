# Decisões, limitações e o que não foi verificado

Este documento existe porque a especificação pede honestidade sobre o que está pronto, o que foi assumido e o que ainda depende de terceiros.

## Decisões técnicas que divergem da especificação

| Pedido | Entregue | Motivo | Custo de voltar |
| --- | --- | --- | --- |
| Next.js, TypeScript, Tailwind, Prisma | Servidor HTTP próprio, JS ESM, design system em CSS, camada de dados própria | O ambiente de construção não permite instalar pacotes (`npm install` recusado por política de rede). Um esqueleto que não roda valeria menos que uma aplicação completa | Médio: as views são funções puras; os contratos estão explícitos |
| PostgreSQL | `node:sqlite` com SQL padrão | Mesmo motivo; não havia servidor PostgreSQL disponível | Baixo: trocar quatro funções em `src/core/db.js` |
| Zod | Validador próprio com API compatível | Mesmo motivo | Trivial: trocar o import |
| SDK oficial da OpenAI | Cliente HTTP próprio, backend apenas, mesmo protocolo | Mesmo motivo | Trivial: reescrever um arquivo |
| Argon2id ou bcrypt | scrypt (RFC 7914), `N=2^16` | Ambos exigem binding nativo | Baixo: o hash é versionado e `verifyPassword` despacha por algoritmo |

Nenhuma dessas trocas altera o comportamento visível do produto. Todas estão isoladas atrás de módulos pequenos.

## O que não foi verificado neste ambiente

- **Nenhuma chamada real à API da OpenAI foi feita.** O cliente está escrito segundo o protocolo documentado, mas não existe chave neste ambiente e seria irresponsável gastar crédito sem autorização. A primeira geração em modo produção deve ser feita com uma obra de teste e acompanhada.
- **Nenhum nome de modelo foi fixado.** Modelos mudam e são descontinuados; os nomes vêm do ambiente, conferidos na documentação oficial no momento do deploy.
- **Nenhum preço foi chumbado.** Sem tarifas configuradas o sistema diz "não informado" e exige confirmação — nunca exibe zero como custo conhecido.
- **Não houve verificação visual em navegador.** Não há navegador instalado aqui. O CSS foi escrito mobile-first com contrastes calculados, e as composições de página foram rasterizadas e conferidas como imagem, mas Lighthouse, leitor de tela e aparelho real continuam pendentes.
- **E2E de navegador não rodou.** As specs do Playwright estão em `tests/e2e/`; a jornada equivalente roda no nível HTTP em `tests/integration/journey.test.js`, que faz login, cria desafio, cadastra três vencedores, gera, aprova, publica e lê como visitante anônimo.
- **Armazenamento S3 não foi exercitado contra um bucket real.** A assinatura SigV4 está implementada; o driver local foi usado em todos os testes.

## Limitações conhecidas do produto

- **Consistência de personagens não é garantida.** A bíblia visual, os IDs estáveis e a referência opcional reduzem a variação entre páginas, mas modelos de imagem ainda derivam. Por isso a revisão humana é obrigatória e a regeneração é por página.
- **A arte do modo demonstração é esquemática de propósito.** Ela existe para validar o pipeline sem custo, não para parecer mangá publicado. Fica marcada como demonstração em toda página gerada.
- **O layout de quadros é pedido no prompt, não imposto.** Se o modelo ignorar a grade, o painel oferece geração quadro a quadro (mais cara) ou substituição manual da imagem.
- **Posicionamento de balões é heurístico.** A arte base é instruída a deixar o topo de cada quadro livre, e os balões vão para lá. Quando a arte não coopera, o editor de balões permite mover tudo.
- **Sem integração com as redes.** Apuração registrada à mão, por decisão de escopo: nada de scraping nem de API social no MVP.
- **Um único idioma.** Toda a interface e o conteúdo são pt-BR.

## Riscos operacionais a observar

| Risco | Mitigação atual | O que ainda fazer |
| --- | --- | --- |
| Gasto inesperado com IA | Orçamento por obra e por mês, confirmação explícita, estimativa antes de cada job | Definir também o limite na conta da OpenAI |
| Publicar sem autorização | Bloqueio em três pontos: seleção da vaga, aprovação editorial e publicação | Treinar a rotina de registro da evidência |
| Relato com dado pessoal | Triagem automática, remoção antes do envio à IA, aviso no formulário | Revisão humana continua necessária |
| Participante menor de idade | Campo obrigatório e bloqueio sem autorização do responsável | Definir o procedimento de coleta dessa autorização |
| Conteúdo inadequado | Padrões de bloqueio + encaminhamento à revisão | Ampliar a lista conforme a operação revelar casos |
| Perda de dados | Migrations versionadas, histórico de páginas e roteiros | Configurar backup automatizado antes da primeira edição |

## Conformidade legal — pendente de verificação

A especificação pede, e vale repetir: antes de lançar a primeira edição pública, confira as regras de promoção das três plataformas e a legislação brasileira aplicável a concursos culturais. A aplicação não exige compra, compartilhamento ou marcação de terceiros, e as regras estão publicadas em `/regras` — mas a validação jurídica é externa ao software.
