# Acessibilidade

Meta: **WCAG 2.1 AA**.

## Contraste

A paleta institucional foi usada com as combinações verificadas:

| Combinação | Razão medida | Uso |
| --- | --- | --- |
| `#141414` sobre `#F8F5ED` | 16,91:1 | Texto corrido |
| `#F8F5ED` sobre `#141414` | 16,91:1 | Texto sobre fundo escuro |
| `#FFFFFF` sobre `#E63946` | 4,17:1 | **Não usado em texto pequeno** |
| `#141414` sobre `#E63946` | 4,42:1 | Apenas texto grande (≥ 24 px, ou ≥ 18,7 px em negrito) |
| `#FFFFFF` sobre `#C1121F` (`--primary-action`) | 6,22:1 | Botões, tags e navegação ativa com texto branco |
| `#A4121D` (`--primary-deep`) sobre `#F8F5ED` | 7,18:1 | Links e texto de destaque em vermelho |
| `#7E0C16` (`--primary-ink`) sobre `#F8F5ED` | 9,88:1 | Hover de link |
| `#5E5E5E` (`--muted-on-paper`) sobre `#F8F5ED` | 5,95:1 | Texto secundário |
| `#B9B4AA` (`--muted-on-dark`) sobre `#141414` | 8,92:1 | Texto secundário no escuro |
| `#141414` sobre `#FFC857` | 11,98:1 | Faixas douradas de vencedor |

Valores calculados pela fórmula de contraste relativo da WCAG, não estimados.

O `--muted` institucional (`#777777`) dá 4,11:1 sobre papel: fica reservado a detalhes e bordas, nunca a texto corrido. Por isso existem as variantes `--muted-on-paper` e `--muted-on-dark`.

Branco pequeno sobre `#E63946` não é usado em lugar nenhum. Onde a interface precisa de texto branco sobre vermelho — botão primário, tag de destaque, item ativo do menu — a superfície usa a variante escura `--primary-action`, exatamente a saída que a especificação sugere. O `--primary` institucional segue nas peças gráficas, faixas e títulos grandes.

## Estrutura e navegação

- Link "pular para o conteúdo" como primeiro elemento focável.
- Marcos semânticos (`header`, `nav`, `main`, `footer`), um `h1` por página e hierarquia sem saltos.
- Foco visível com contorno de 3 px em todos os controles.
- Alvos de toque de no mínimo 44×44 px.
- Formulários com `label` associado, dicas em `small` e erros em texto, nunca só em cor.
- Estado da navegação indicado por `aria-current="page"`, não apenas por cor.

## Leitura de mangá

Quadrinho é um formato difícil para leitura assistida. O que foi feito:

- cada página tem `alt` descritivo vindo do roteiro;
- o SVG composto carrega `role="img"` e `<title>`;
- há **transcrição completa dos diálogos** em `<details>`, no leitor e na página da obra, com narração, falas por personagem e efeitos sonoros;
- a transcrição é texto de verdade, selecionável e indexável;
- `figcaption` identifica cada página.

## Interação

- Leitor navegável por teclado: setas, PageUp/PageDown, espaço, Home e End.
- Gestos de toque no modo página a página, sem substituir os botões.
- Progresso anunciado por região `aria-live`.
- Dois modos de leitura: rolagem contínua (padrão) e página a página.
- Posição salva localmente, com oferta de retomar — sem cadastro e sem cookie de rastreio.

## Movimento e preferências

`prefers-reduced-motion` desliga transições e rolagem suave. Nenhuma animação automática, nenhum carrossel que se move sozinho, nenhum conteúdo piscante.

## Mobile

Projeto mobile-first: coluna única, tipografia fluida com `clamp()`, `viewport-fit=cover` com `env(safe-area-inset-bottom)` na barra do leitor, sem zoom bloqueado, imagens com `width`/`height` para evitar deslocamento de layout.

## Verificação pendente

Contrastes foram calculados e a marcação foi construída segundo as regras acima, mas **não houve auditoria em navegador nem com leitor de tela** neste ambiente — não há navegador instalado. Antes de abrir ao público, rode:

- axe DevTools ou Lighthouse nas rotas `/`, `/mangas`, `/mangas/:slug`, `/mangas/:slug/ler`, `/revistas/:slug/ler` e `/participar`;
- navegação só por teclado no leitor;
- VoiceOver (iOS) e TalkBack (Android) na página da obra e na transcrição.
