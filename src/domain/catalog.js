/** Vocabulário editorial do produto. Fonte única para formulários, validação e rótulos. */

export const NETWORKS = [
  { key: 'INSTAGRAM', label: 'Instagram', comment: 'Comentário no post oficial' },
  { key: 'TIKTOK', label: 'TikTok', comment: 'Comentário no vídeo oficial' },
  { key: 'X', label: 'X', comment: 'Resposta ao post oficial' },
];
export const NETWORK_KEYS = NETWORKS.map((n) => n.key);
export const networkLabel = (k) => NETWORKS.find((n) => n.key === k)?.label || k;

export const GENRES = [
  { key: 'COMEDIA', label: 'Comédia' },
  { key: 'ROMANCE_LEVE', label: 'Romance leve' },
  { key: 'PETS', label: 'Pets' },
  { key: 'MISTERIO', label: 'Mistério' },
  { key: 'NOSTALGIA', label: 'Nostalgia' },
  { key: 'AMIZADE', label: 'Amizade' },
  { key: 'ISEKAI', label: 'Fantasia / Isekai' },
  { key: 'COTIDIANO', label: 'Cotidiano' },
  { key: 'SUPERACAO', label: 'Superação' },
];

export const ART_STYLES = [
  { key: 'CLASSICO_PB', label: 'Mangá clássico P&B', desc: 'Tinta preta, retícula, linhas de velocidade, expressões exageradas.', palette: ['#141414', '#F8F5ED', '#777777'], default: true },
  { key: 'CHIBI', label: 'Chibi / super deformed', desc: 'Proporções caricaturais, olhos expressivos, reações cômicas.', palette: ['#141414', '#FFC857', '#F8F5ED'] },
  { key: 'SHONEN', label: 'Shonen de aventura', desc: 'Enquadramentos dinâmicos, energia e contraste.', palette: ['#141414', '#E63946', '#F8F5ED'] },
  { key: 'SHOJO', label: 'Shojo delicado', desc: 'Linhas suaves, flores, luz e emoção.', palette: ['#713B57', '#E85D8E', '#FFF0F3'] },
  { key: 'SLICE_OF_LIFE', label: 'Slice of life', desc: 'Cotidiano, gestos naturais, cenários simples.', palette: ['#52796F', '#DDB892', '#FAEDCD'] },
  { key: 'SEINEN', label: 'Seinen editorial', desc: 'Composição madura, sombras e traço detalhado, sem conteúdo gráfico.', palette: ['#141414', '#4A4A4A', '#F2EDE1'] },
  { key: 'YONKOMA', label: 'Yonkoma', desc: 'Quatro quadros: preparação, desenvolvimento, virada e conclusão.', palette: ['#141414', '#FFC857', '#F8F5ED'] },
  { key: 'WEBTOON', label: 'Webtoon colorido', desc: 'Composição vertical, cores planas e espaçamento.', palette: ['#2563EB', '#E9B949', '#EFF6FF'] },
  { key: 'ISEKAI_FANTASIA', label: 'Isekai fantasia', desc: 'Mundos mágicos, arquitetura fantástica, figurinos originais.', palette: ['#172554', '#2563EB', '#E9B949'] },
  { key: 'RETRO', label: 'Retrô', desc: 'Retícula de impressão, textura de papel, traço nostálgico.', palette: ['#52796F', '#DDB892', '#F2EDE1'] },
];
export const ART_STYLE_KEYS = ART_STYLES.map((s) => s.key);
export const artStyle = (k) => ART_STYLES.find((s) => s.key === k) || ART_STYLES[0];

export const NARRATIVE_TONES = [
  { key: 'HUMOR_ABSURDO', label: 'Humor absurdo' },
  { key: 'HUMOR_COTIDIANO', label: 'Humor cotidiano' },
  { key: 'PASTELAO', label: 'Pastelão' },
  { key: 'IRONIA_LEVE', label: 'Ironia leve' },
  { key: 'ACOLHEDOR', label: 'Acolhedor' },
  { key: 'EMOCIONANTE', label: 'Emocionante' },
  { key: 'NOSTALGICO', label: 'Nostálgico' },
  { key: 'SUSPENSE_LEVE', label: 'Suspense leve' },
  { key: 'AVENTURA_EPICA', label: 'Aventura épica' },
];

export const VISUAL_TONES = [
  { key: 'EXPRESSIVO', label: 'Expressivo' },
  { key: 'MINIMALISTA', label: 'Minimalista' },
  { key: 'DELICADO', label: 'Delicado' },
  { key: 'DRAMATICO', label: 'Dramático' },
  { key: 'CINEMATOGRAFICO', label: 'Cinematográfico' },
  { key: 'CARICATURAL', label: 'Caricatural' },
  { key: 'ACONCHEGANTE', label: 'Aconchegante' },
];

export const HUMOR_LEVELS = [
  { key: 'BAIXA', label: 'Baixa' },
  { key: 'MEDIA', label: 'Média' },
  { key: 'ALTA', label: 'Alta' },
];

export const FIDELITY_LEVELS = [
  { key: 'ALTA', label: 'Alta fidelidade ao relato' },
  { key: 'ADAPTACAO', label: 'Adaptação criativa' },
];

export const COLOR_MODES = [
  { key: 'PB', label: 'Preto e branco' },
  { key: 'DUOTONE', label: 'Duotone' },
  { key: 'COLORIDO', label: 'Colorido' },
];

export const PANEL_DENSITIES = [
  { key: 'BAIXA', label: 'Baixa (2–3 quadros)', min: 2, max: 3 },
  { key: 'MEDIA', label: 'Média (3–5 quadros)', min: 3, max: 5 },
  { key: 'ALTA', label: 'Alta (5–7 quadros)', min: 5, max: 7 },
];
export const panelDensity = (k) => PANEL_DENSITIES.find((p) => p.key === k) || PANEL_DENSITIES[1];

export const FORMATS = [
  { key: 'VERTICAL', label: 'Vertical (leitura contínua)' },
  { key: 'PAGINA', label: 'Página a página' },
];

/**
 * Modos de qualidade. São políticas internas do produto; os valores reais de
 * parâmetro da API são resolvidos em src/ai/openai.js conforme o modelo configurado.
 */
/**
 * Limite de páginas de uma obra. Fica aqui, num lugar só, porque antes o
 * número 8 estava escrito solto no schema, na criação da obra, no pedido de
 * roteiro, na validação do roteiro e no formulário, e eles divergiram: o
 * schema aceitava 12, o resto cortava em 8 sem avisar.
 */
export const PAGINAS = { min: 1, max: 20 };

/** Prende um número de páginas dentro de PAGINAS. Valor inválido cai no mínimo. */
export const clampPaginas = (n) => Math.min(Math.max(Math.trunc(Number(n)) || PAGINAS.min, PAGINAS.min), PAGINAS.max);

/**
 * O par `pages` é a sugestão de cada modo, usada como padrão quando a obra
 * ainda não tem faixa escolhida. Ele não limita: quem manda é o page_min e o
 * page_max da obra, dentro de PAGINAS.
 */
export const QUALITY_MODES = [
  { key: 'ECONOMICO', label: 'Econômico', pages: [2, 4], imageQuality: 'low', colorHint: 'PB', allowCharacterRef: false, desc: 'P&B, qualidade econômica, sugere 2 a 4 páginas. Menor custo por página.' },
  { key: 'EQUILIBRADO', label: 'Equilibrado', pages: [4, 6], imageQuality: 'medium', colorHint: null, allowCharacterRef: true, desc: 'Qualidade intermediária, sugere 4 a 6 páginas, referência de personagem opcional.' },
  { key: 'PREMIUM', label: 'Premium', pages: [6, 8], imageQuality: 'high', colorHint: null, allowCharacterRef: true, desc: 'Qualidade superior e referências de personagem, sugere 6 a 8 páginas.' },
];
export const qualityMode = (k) => QUALITY_MODES.find((q) => q.key === k) || QUALITY_MODES[0];

export const MANGA_STATUSES = {
  RECEIVED: { label: 'Recebido', cls: 'neutral' },
  SCRIPT_DRAFT: { label: 'Roteiro em rascunho', cls: 'info' },
  SCRIPT_APPROVED: { label: 'Roteiro aprovado', cls: 'info' },
  GENERATING: { label: 'Gerando imagens', cls: 'work' },
  REVIEW: { label: 'Em revisão', cls: 'work' },
  AUTHOR_APPROVED: { label: 'Aprovado pelo autor', cls: 'ok' },
  APPROVED: { label: 'Aprovado para publicação', cls: 'ok' },
  SCHEDULED: { label: 'Agendado', cls: 'ok' },
  PUBLISHED: { label: 'Publicado', cls: 'live' },
  FAILED: { label: 'Falhou', cls: 'danger' },
  ARCHIVED: { label: 'Arquivado', cls: 'neutral' },
};

export const SUBMISSION_STATUSES = {
  PENDING: { label: 'Aguardando apuração', cls: 'neutral' },
  ELIGIBLE: { label: 'Elegível', cls: 'info' },
  SELECTED: { label: 'Vencedor da vaga', cls: 'ok' },
  DISQUALIFIED: { label: 'Desclassificado', cls: 'danger' },
  NO_RESPONSE: { label: 'Sem resposta', cls: 'danger' },
  WITHDRAWN: { label: 'Autorização negada', cls: 'danger' },
};

export const CHALLENGE_STATUSES = {
  DRAFT: { label: 'Rascunho', cls: 'neutral' },
  LIVE: { label: 'No ar', cls: 'live' },
  CLOSED: { label: 'Encerrado', cls: 'work' },
  PUBLISHED: { label: 'Edição publicada', cls: 'ok' },
  CANCELLED: { label: 'Cancelado', cls: 'danger' },
};

export const MAGAZINE_STATUSES = {
  DRAFT: { label: 'Rascunho', cls: 'neutral' },
  SCHEDULED: { label: 'Agendada', cls: 'info' },
  PUBLISHED: { label: 'Publicada', cls: 'live' },
  ARCHIVED: { label: 'Arquivada', cls: 'neutral' },
};

/** Presets recomendados por gênero (combináveis, nunca obrigatórios). */
export const GENRE_PRESETS = {
  COMEDIA: { art_style: 'CHIBI', narrative_tone: 'HUMOR_ABSURDO', visual_tone: 'CARICATURAL', humor_intensity: 'ALTA', color_mode: 'PB', panel_density: 'MEDIA' },
  ROMANCE_LEVE: { art_style: 'SHOJO', narrative_tone: 'ACOLHEDOR', visual_tone: 'DELICADO', humor_intensity: 'BAIXA', color_mode: 'DUOTONE', panel_density: 'MEDIA' },
  PETS: { art_style: 'CHIBI', narrative_tone: 'HUMOR_COTIDIANO', visual_tone: 'ACONCHEGANTE', humor_intensity: 'ALTA', color_mode: 'PB', panel_density: 'ALTA' },
  MISTERIO: { art_style: 'SEINEN', narrative_tone: 'SUSPENSE_LEVE', visual_tone: 'DRAMATICO', humor_intensity: 'BAIXA', color_mode: 'PB', panel_density: 'MEDIA' },
  NOSTALGIA: { art_style: 'RETRO', narrative_tone: 'NOSTALGICO', visual_tone: 'ACONCHEGANTE', humor_intensity: 'BAIXA', color_mode: 'DUOTONE', panel_density: 'BAIXA' },
  AMIZADE: { art_style: 'SLICE_OF_LIFE', narrative_tone: 'HUMOR_COTIDIANO', visual_tone: 'EXPRESSIVO', humor_intensity: 'MEDIA', color_mode: 'PB', panel_density: 'MEDIA' },
  ISEKAI: { art_style: 'ISEKAI_FANTASIA', narrative_tone: 'AVENTURA_EPICA', visual_tone: 'CINEMATOGRAFICO', humor_intensity: 'MEDIA', color_mode: 'COLORIDO', panel_density: 'MEDIA' },
  COTIDIANO: { art_style: 'SLICE_OF_LIFE', narrative_tone: 'IRONIA_LEVE', visual_tone: 'MINIMALISTA', humor_intensity: 'MEDIA', color_mode: 'PB', panel_density: 'MEDIA' },
  SUPERACAO: { art_style: 'SHONEN', narrative_tone: 'EMOCIONANTE', visual_tone: 'DRAMATICO', humor_intensity: 'BAIXA', color_mode: 'PB', panel_density: 'MEDIA' },
};

/** Paletas temáticas complementares (não substituem a identidade institucional). */
export const THEME_PALETTES = {
  COMEDIA: ['#FFC857', '#E63946', '#141414', '#F8F5ED'],
  ROMANCE_LEVE: ['#E85D8E', '#FFB5C2', '#713B57', '#FFF0F3'],
  MISTERIO: ['#17152D', '#6948B7', '#A29BFE', '#E9E5FF'],
  ISEKAI: ['#172554', '#2563EB', '#E9B949', '#EFF6FF'],
  PETS: ['#E78A36', '#F6C78C', '#805333', '#FFF5E8'],
  NOSTALGIA: ['#52796F', '#84A98C', '#DDB892', '#FAEDCD'],
};
export const themePalette = (genre) => THEME_PALETTES[genre] || ['#141414', '#E63946', '#777777', '#F8F5ED'];

export const label = (list, key) => list.find((i) => i.key === key)?.label || key || 'não informado';
