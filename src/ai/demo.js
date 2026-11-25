import { escapeHtml } from '../core/html.js';
import { PAGE_H, PAGE_W, panelGrid } from '../domain/balloons.js';
import { sha256 } from '../core/ids.js';

/**
 * Renderizador de demonstração.
 *
 * Produz a ARTE BASE das páginas localmente, sem nenhuma chamada paga.
 * O desenho é procedural, original e determinístico (mesma semente → mesma
 * imagem), o que torna o pipeline inteiro testável com custo zero.
 * Em produção, esta camada é substituída pela API de imagem; o contrato
 * (SVG/PNG de 1000x1500 com áreas livres para balões) é o mesmo.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text) {
  return parseInt(sha256(String(text)).slice(0, 8), 16);
}

const PALETTES = {
  PB: { ink: '#141414', paper: '#F8F5ED', tone: '#141414', accent: '#141414' },
  DUOTONE: { ink: '#141414', paper: '#F8F5ED', tone: '#141414', accent: '#E63946' },
  COLORIDO: { ink: '#141414', paper: '#FFFDF7', tone: '#2563EB', accent: '#E63946' },
};

function defs(palette) {
  return `<defs>
  <pattern id="ht-a" width="7" height="7" patternUnits="userSpaceOnUse">
    <circle cx="1.6" cy="1.6" r="1.5" fill="${palette.tone}" opacity=".40"/>
  </pattern>
  <pattern id="ht-b" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
    <circle cx="1.2" cy="1.2" r="1.1" fill="${palette.tone}" opacity=".30"/>
  </pattern>
  <pattern id="ht-c" width="10" height="10" patternUnits="userSpaceOnUse">
    <circle cx="2" cy="2" r="2.4" fill="${palette.tone}" opacity=".22"/>
  </pattern>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${palette.paper}" stop-opacity="1"/>
    <stop offset="100%" stop-color="${palette.paper}" stop-opacity="0"/>
  </linearGradient>
  <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter>
</defs>`;
}

function speedLines(rect, rand, palette, { density = 26, from = 'right' } = {}) {
  const lines = [];
  const cx = from === 'right' ? rect.x + rect.w : rect.x;
  const cy = rect.y + rect.h * 0.45;
  for (let i = 0; i < density; i++) {
    const angle = (rand() - 0.5) * 1.5;
    const len = rect.w * (0.4 + rand() * 0.6);
    const x2 = cx + Math.cos(angle) * len * (from === 'right' ? -1 : 1);
    const y2 = cy + Math.sin(angle) * len;
    lines.push(`<line x1="${cx.toFixed(0)}" y1="${(cy + (rand() - 0.5) * rect.h * 0.8).toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${palette.ink}" stroke-width="${(0.8 + rand() * 2).toFixed(1)}" opacity="${(0.25 + rand() * 0.5).toFixed(2)}"/>`);
  }
  return lines.join('');
}

function cityscape(rect, rand, palette) {
  const base = rect.y + rect.h * 0.78;
  let out = `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="url(#ht-c)" opacity=".5"/>`;
  let x = rect.x;
  while (x < rect.x + rect.w) {
    const w = 26 + rand() * 54;
    const h = 40 + rand() * (rect.h * 0.46);
    out += `<rect x="${x.toFixed(0)}" y="${(base - h).toFixed(0)}" width="${Math.min(w, rect.x + rect.w - x).toFixed(0)}" height="${h.toFixed(0)}" fill="${palette.ink}" opacity=".88"/>`;
    for (let wy = base - h + 10; wy < base - 12; wy += 16) {
      if (rand() > 0.55) out += `<rect x="${(x + 6 + rand() * (w - 16)).toFixed(0)}" y="${wy.toFixed(0)}" width="6" height="8" fill="${palette.paper}" opacity=".8"/>`;
    }
    x += w + 5;
  }
  return out;
}

function interior(rect, rand, palette) {
  const vpx = rect.x + rect.w * (0.3 + rand() * 0.4);
  const vpy = rect.y + rect.h * 0.45;
  let out = `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="url(#ht-b)" opacity=".45"/>`;
  for (let i = 0; i < 7; i++) {
    const ex = rect.x + (i / 6) * rect.w;
    out += `<line x1="${vpx.toFixed(0)}" y1="${vpy.toFixed(0)}" x2="${ex.toFixed(0)}" y2="${(rect.y + rect.h).toFixed(0)}" stroke="${palette.ink}" stroke-width="1.6" opacity=".35"/>`;
  }
  out += `<line x1="${rect.x}" y1="${vpy.toFixed(0)}" x2="${rect.x + rect.w}" y2="${vpy.toFixed(0)}" stroke="${palette.ink}" stroke-width="2.4" opacity=".55"/>`;
  return out;
}

function sunburst(rect, rand, palette) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let out = '';
  const rays = 34;
  for (let i = 0; i < rays; i++) {
    const a1 = (i / rays) * Math.PI * 2;
    const a2 = a1 + (Math.PI * 2) / rays * 0.48;
    const r = Math.max(rect.w, rect.h) * 1.1;
    out += `<path d="M${cx} ${cy} L${(cx + Math.cos(a1) * r).toFixed(0)} ${(cy + Math.sin(a1) * r).toFixed(0)} L${(cx + Math.cos(a2) * r).toFixed(0)} ${(cy + Math.sin(a2) * r).toFixed(0)} Z" fill="${palette.ink}" opacity="${i % 2 ? 0.1 : 0.22}"/>`;
  }
  return out;
}

/** Figura estilizada original: silhueta simples, sem referência a obra existente. */
function figure(x, baseY, scale, rand, palette, { pose = 'neutro', accent = false } = {}) {
  const s = scale;
  const headR = 26 * s;
  const headY = baseY - 150 * s;
  const color = accent ? palette.accent : palette.ink;
  const lean = pose === 'corrida' ? 10 * s : pose === 'surpresa' ? -4 * s : 0;
  const armA = pose === 'surpresa' ? -55 * s : pose === 'corrida' ? -30 * s : 18 * s;
  const armB = pose === 'surpresa' ? -50 * s : pose === 'corrida' ? 34 * s : 22 * s;

  return `<g transform="translate(${x.toFixed(0)},0)">
    <ellipse cx="${lean.toFixed(0)}" cy="${(baseY + 6).toFixed(0)}" rx="${(44 * s).toFixed(0)}" ry="${(9 * s).toFixed(0)}" fill="${palette.ink}" opacity=".22"/>
    <path d="M${(-30 * s).toFixed(0)} ${baseY.toFixed(0)} L${(-16 * s + lean).toFixed(0)} ${(baseY - 86 * s).toFixed(0)} L${(16 * s + lean).toFixed(0)} ${(baseY - 86 * s).toFixed(0)} L${(30 * s).toFixed(0)} ${baseY.toFixed(0)} Z" fill="${color}" opacity=".93"/>
    <path d="M${(-20 * s + lean).toFixed(0)} ${(baseY - 86 * s).toFixed(0)} q${(20 * s).toFixed(0)} ${(-34 * s).toFixed(0)} ${(40 * s).toFixed(0)} 0 z" fill="${color}"/>
    <line x1="${(-18 * s + lean).toFixed(0)}" y1="${(baseY - 80 * s).toFixed(0)}" x2="${(-34 * s + armA).toFixed(0)}" y2="${(baseY - 32 * s).toFixed(0)}" stroke="${color}" stroke-width="${(11 * s).toFixed(1)}" stroke-linecap="round"/>
    <line x1="${(18 * s + lean).toFixed(0)}" y1="${(baseY - 80 * s).toFixed(0)}" x2="${(34 * s + armB).toFixed(0)}" y2="${(baseY - 36 * s).toFixed(0)}" stroke="${color}" stroke-width="${(11 * s).toFixed(1)}" stroke-linecap="round"/>
    <circle cx="${lean.toFixed(0)}" cy="${headY.toFixed(0)}" r="${headR.toFixed(0)}" fill="${palette.paper}" stroke="${color}" stroke-width="${(4 * s).toFixed(1)}"/>
    <path d="M${(lean - headR).toFixed(0)} ${(headY - 6 * s).toFixed(0)} q${headR.toFixed(0)} ${(-30 * s).toFixed(0)} ${(headR * 2).toFixed(0)} 0 q${(-headR * 0.6).toFixed(0)} ${(-10 * s).toFixed(0)} ${(-headR * 2).toFixed(0)} 0 z" fill="${color}"/>
    <circle cx="${(lean - 9 * s).toFixed(0)}" cy="${headY.toFixed(0)}" r="${(3.4 * s).toFixed(1)}" fill="${color}"/>
    <circle cx="${(lean + 9 * s).toFixed(0)}" cy="${headY.toFixed(0)}" r="${(3.4 * s).toFixed(1)}" fill="${color}"/>
    ${pose === 'surpresa'
      ? `<ellipse cx="${lean.toFixed(0)}" cy="${(headY + 13 * s).toFixed(0)}" rx="${(6 * s).toFixed(1)}" ry="${(8 * s).toFixed(1)}" fill="${color}"/>`
      : `<path d="M${(lean - 7 * s).toFixed(0)} ${(headY + 12 * s).toFixed(0)} q${(7 * s).toFixed(0)} ${(6 * s).toFixed(0)} ${(14 * s).toFixed(0)} 0" stroke="${color}" stroke-width="${(2.6 * s).toFixed(1)}" fill="none" stroke-linecap="round"/>`}
  </g>`;
}

const POSE_BY_FRAMING = {
  PLANO_ABERTO: 'neutro', PANORAMICA: 'neutro', PLANO_MEDIO: 'neutro',
  CLOSE: 'surpresa', CLOSE_EXTREMO: 'surpresa', DETALHE: 'neutro',
  PLONGEE: 'corrida', CONTRA_PLONGEE: 'surpresa',
};

function backdropFor(frame, rect, rand, palette) {
  const text = `${frame.prompt_visual} ${frame.acao}`.toLowerCase();
  if (/rua|cidade|pr[eé]dio|avenida|janela|metr[ôo]|exterior|c[ée]u/.test(text)) return cityscape(rect, rand, palette);
  if (/sala|escrit[óo]rio|elevador|quarto|cozinha|casa|corredor|mesa|reuni[ãa]o/.test(text)) return interior(rect, rand, palette);
  if (/choque|susto|revela|explos|grito|surpres/.test(text)) return sunburst(rect, rand, palette);
  return `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="url(#ht-a)" opacity=".35"/>` + interior(rect, rand, palette);
}

/** Desenha uma página inteira. Reserva o topo de cada quadro para os balões. */
export function renderDemoPage({ frames, colorMode = 'PB', seed = 'demo', altText = '', label = 'DEMONSTRAÇÃO' }) {
  const palette = PALETTES[colorMode] || PALETTES.PB;
  const rand = mulberry32(seedFrom(seed));
  const rects = panelGrid(frames.length);

  const panels = frames.map((frame, i) => {
    const rect = rects[i];
    const inner = { x: rect.x + 4, y: rect.y + 4, w: rect.w - 8, h: rect.h - 8 };
    const pose = POSE_BY_FRAMING[frame.enquadramento] || 'neutro';
    const closeUp = frame.enquadramento === 'CLOSE' || frame.enquadramento === 'CLOSE_EXTREMO';
    // Em close só cabe uma pessoa; nos demais planos, até três.
    const people = closeUp ? 1 : Math.max(1, Math.min(3, (frame.personagens_ids || []).length || 1));
    const scale = (rect.h / 460) * (closeUp ? 1.9 : people > 2 ? 0.85 : 1);
    // Em close, ancora a cabeça na metade inferior do quadro (a figura é
    // desenhada a partir da linha do chão, 150*escala abaixo da cabeça).
    const baseY = closeUp ? rect.y + rect.h * 0.62 + 150 * scale : rect.y + rect.h * 0.94;

    const figures = Array.from({ length: people }, (_, p) => {
      const slot = (p + 1) / (people + 1);
      return figure(rect.x + rect.w * slot, baseY, scale, rand, palette, { pose, accent: p === 0 && colorMode !== 'PB' });
    }).join('');

    const action = /corre|pula|cai|bate|derruba|voa|choque/.test(`${frame.acao}`.toLowerCase());

    return `<g data-quadro="${escapeHtml(frame.id)}">
  <clipPath id="clip-${escapeHtml(frame.id)}"><rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}"/></clipPath>
  <g clip-path="url(#clip-${escapeHtml(frame.id)})">
    <rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" fill="${palette.paper}"/>
    ${backdropFor(frame, inner, rand, palette)}
    ${action ? speedLines(inner, rand, palette, { density: 18, from: rand() > 0.5 ? 'right' : 'left' }) : ''}
    ${figures}
    <rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${Math.round(inner.h * 0.34)}" fill="url(#fade)" opacity=".85"/>
  </g>
  <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="none" stroke="${palette.ink}" stroke-width="5"/>
</g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}" role="img" aria-label="${escapeHtml(altText)}">
<title>${escapeHtml(altText)}</title>
${defs(palette)}
<rect width="${PAGE_W}" height="${PAGE_H}" fill="${palette.paper}"/>
<rect width="${PAGE_W}" height="${PAGE_H}" fill="url(#ht-c)" opacity=".18"/>
${panels}
<g opacity=".82">
  <rect x="${PAGE_W - 250}" y="${PAGE_H - 52}" width="214" height="30" fill="#FFC857" stroke="#141414" stroke-width="2.5"/>
  <text x="${PAGE_W - 143}" y="${PAGE_H - 31}" text-anchor="middle" font-family="'Anton',Impact,sans-serif" font-size="17" fill="#141414" letter-spacing="1.6">${escapeHtml(label)}</text>
</g>
</svg>`;
}

/** Capa de demonstração. */
export function renderDemoCover({ title, author, network, edition, colorMode = 'PB', seed = 'capa', altText = '' }) {
  const palette = PALETTES[colorMode] || PALETTES.PB;
  const rand = mulberry32(seedFrom(seed));
  const rect = { x: 0, y: 0, w: PAGE_W, h: PAGE_H };
  const words = String(title || 'Sem título').toUpperCase().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 14) { lines.push(line.trim()); line = w; } else line = `${line} ${w}`;
  }
  if (line.trim()) lines.push(line.trim());
  const titleLines = lines.slice(0, 4);
  const fontSize = titleLines.length > 2 ? 92 : 112;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}" role="img" aria-label="${escapeHtml(altText || `Capa de ${title}`)}">
<title>${escapeHtml(altText || `Capa de ${title}`)}</title>
${defs(palette)}
<rect width="${PAGE_W}" height="${PAGE_H}" fill="#141414"/>
${sunburst({ x: 0, y: 180, w: PAGE_W, h: 900 }, rand, { ink: '#F8F5ED', paper: palette.paper, tone: '#F8F5ED', accent: palette.accent })}
<rect width="${PAGE_W}" height="${PAGE_H}" fill="url(#ht-a)" opacity=".25"/>
<path d="M-40 980 q300 -150 1080 -40 L1040 1500 L-40 1500 Z" fill="#E63946"/>
<g transform="translate(0,-40)">${figure(PAGE_W * 0.5, 1040, 2.5, rand, { ink: '#141414', paper: '#F8F5ED', accent: '#FFC857' }, { pose: 'surpresa', accent: false })}</g>
<rect x="60" y="150" width="${PAGE_W - 120}" height="${titleLines.length * (fontSize + 8) + 46}" fill="#F8F5ED" stroke="#141414" stroke-width="7" transform="rotate(-1.2 500 300)"/>
<g transform="rotate(-1.2 500 300)" font-family="'Anton',Impact,sans-serif" fill="#141414" text-anchor="middle">
${titleLines.map((l, i) => `<text x="${PAGE_W / 2}" y="${236 + i * (fontSize + 8)}" font-size="${fontSize}" letter-spacing="1">${escapeHtml(l)}</text>`).join('\n')}
</g>
<g transform="translate(60,${PAGE_H - 230})">
  <rect x="0" y="0" width="${PAGE_W - 120}" height="150" fill="#141414" stroke="#FFC857" stroke-width="5"/>
  <text x="28" y="48" font-family="'Space Grotesk',sans-serif" font-size="28" font-weight="700" fill="#FFC857">MangaLoop · Edição ${escapeHtml(String(edition ?? 's/n'))}</text>
  <text x="28" y="92" font-family="'Inter',sans-serif" font-size="26" fill="#F8F5ED">Relato de ${escapeHtml(author || 'autor anônimo')}</text>
  <text x="28" y="128" font-family="'Inter',sans-serif" font-size="22" fill="#B9B4AA">Vencedor em ${escapeHtml(network || 'rede não informada')} · adaptação ilustrada com apoio de IA</text>
</g>
<g opacity=".9">
  <rect x="${PAGE_W - 250}" y="30" width="214" height="34" fill="#FFC857" stroke="#141414" stroke-width="2.5"/>
  <text x="${PAGE_W - 143}" y="54" text-anchor="middle" font-family="'Anton',Impact,sans-serif" font-size="18" fill="#141414" letter-spacing="1.6">DEMONSTRAÇÃO</text>
</g>
</svg>`;
}

/* ------------------------- roteiro de demonstração ----------------------- */

import { sanitizeForPrompt } from '../domain/safety.js';
import { panelDensity } from '../domain/catalog.js';

const FRAMINGS_CYCLE = ['PLANO_ABERTO', 'PLANO_MEDIO', 'CLOSE', 'CONTRA_PLONGEE', 'DETALHE', 'PANORAMICA'];
const SFX_POOL = ['PLIM', 'TUM', 'SHHH', 'POFT', 'CLANG', 'VRUM'];

function sentences(text) {
  return String(text)
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/**
 * Gera um roteiro estruturado válido sem chamar nenhuma API.
 * Serve para desenvolvimento, testes e para a biblioteca de demonstração.
 * O resultado é sempre identificado como demonstração na interface.
 */
export function buildDemoScript({ submission, manga, pages = 4 }) {
  const source = sanitizeForPrompt(`${submission.comment_text} ${submission.expanded_story || ''}`, { maxChars: 1200 });
  const parts = sentences(source);
  const density = panelDensity(manga.panel_density);
  const framesPerPage = Math.max(2, Math.min(density.max, density.min + 1));
  const protagonist = submission.author_pseudonym || 'A protagonista';
  const rand = mulberry32(seedFrom(submission.id || source));

  // Título curto: primeira oração, cortada em limite de palavra, sem reticências.
  const titleBase = (parts[0] || 'Uma história real').replace(/[.!?…]+$/, '').trim();
  let titulo = titleBase;
  if (titulo.length > 42) {
    const cut = titulo.slice(0, 42);
    titulo = cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).trim().replace(/[,;:]$/, '');
    // Remove palavras funcionais penduradas no fim do corte.
    const dangling = /\s+(a|o|as|os|um|uma|de|da|do|em|no|na|para|pra|com|que|e|ou|por|ao|à)$/i;
    while (dangling.test(titulo)) titulo = titulo.replace(dangling, '');
  }
  titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);

  const personagens = [
    {
      id: 'p1',
      nome: protagonist,
      papel: 'protagonista',
      descricao: 'Pessoa jovem adulta, cabelo curto e desarrumado, sobrancelhas expressivas, sempre com a mesma jaqueta escura e um crachá torto.',
      roupa: 'Jaqueta escura por cima de camiseta clara, calça simples, tênis gasto.',
      proporcoes: 'Sete cabeças de altura, ombros estreitos, mãos grandes para reforçar a comédia.',
      acessorios: 'Crachá torto no bolso do peito.',
      paleta: manga.color_mode === 'PB' ? 'Preto, branco e retícula média.' : 'Preto, creme e um acento vermelho.',
      regras_traco: 'Contorno grosso, olhos grandes, boca muito expressiva.',
    },
    {
      id: 'p2',
      nome: 'A testemunha',
      papel: 'coadjuvante',
      descricao: 'Figura adulta de porte formal, óculos retangulares, postura rígida e expressão de incredulidade constante.',
      roupa: 'Blazer liso e camisa abotoada até o colarinho.',
      proporcoes: 'Oito cabeças, silhueta reta.',
      acessorios: 'Óculos retangulares e caneca de café.',
      paleta: 'Tons neutros.',
      regras_traco: 'Linhas retas, poucas hachuras.',
    },
  ];

  const cenarios = [
    { id: 'c1', nome: 'O lugar do acontecimento', descricao: 'Ambiente cotidiano, iluminação dura, poucos objetos em cena para destacar os personagens.' },
    { id: 'c2', nome: 'O ponto de virada', descricao: 'O mesmo ambiente visto de outro ângulo, com profundidade exagerada.' },
  ];

  const paginas = Array.from({ length: pages }, (_, pi) => {
    const quadros = Array.from({ length: framesPerPage }, (_, fi) => {
      const idx = pi * framesPerPage + fi;
      const line = parts[idx % Math.max(1, parts.length)] || 'A história continua.';
      const framing = FRAMINGS_CYCLE[idx % FRAMINGS_CYCLE.length];
      const isLast = pi === pages - 1 && fi === framesPerPage - 1;
      return {
        id: `q${pi + 1}_${fi + 1}`,
        ordem: fi + 1,
        enquadramento: framing,
        cenario_id: pi % 2 === 0 ? 'c1' : 'c2',
        personagens_ids: fi % 3 === 2 ? ['p1', 'p2'] : ['p1'],
        acao: line.slice(0, 220),
        expressao: isLast ? 'Alívio constrangido' : fi === 0 ? 'Determinação ingênua' : 'Olhos arregalados',
        dialogos: fi === framesPerPage - 1
          ? [{ personagem_id: 'p1', texto: isLast ? 'No fim, virou história para contar.' : 'Isso não pode estar acontecendo…', tipo: isLast ? 'FALA' : 'PENSAMENTO' }]
          : [{ personagem_id: 'p1', texto: line.slice(0, 90), tipo: fi === 0 ? 'FALA' : 'FALA' }],
        narrador: fi === 0 && pi === 0 ? 'Era para ser um dia comum.' : '',
        efeitos_sonoros: rand() > 0.55 ? [SFX_POOL[idx % SFX_POOL.length]] : [],
        prompt_visual: `${framing.toLowerCase().replace('_', ' ')} em ${pi % 2 === 0 ? 'ambiente interno cotidiano' : 'vista ampla do mesmo ambiente'}; ${line.slice(0, 120)}; espaço livre no topo do quadro.`,
        alt_text: `Quadro ${fi + 1}: ${line.slice(0, 160)}`,
      };
    });
    return {
      numero: pi + 1,
      resumo: `Página ${pi + 1} do capítulo de demonstração.`,
      alt_text: `Página ${pi + 1} com ${framesPerPage} quadros em preto e branco mostrando a sequência da história.`,
      quadros,
    };
  });

  return {
    titulo,
    sinopse: `${parts.slice(0, 2).join(' ').slice(0, 280) || 'Uma pequena história cotidiana que virou mangá.'}`,
    genero: manga.genre || 'COMEDIA',
    tom_narrativo: manga.narrative_tone || 'HUMOR_COTIDIANO',
    tom_visual: manga.visual_tone || 'EXPRESSIVO',
    fatos_preservados: parts.slice(0, 3).map((p) => p.slice(0, 200)),
    elementos_ficcionalizados: [
      'Diálogos e reações foram escritos para dar ritmo cômico.',
      'Personagens secundários foram anonimizados e estilizados.',
    ],
    quantidade_paginas: pages,
    personagens,
    cenarios,
    paginas,
    capa: {
      conceito: 'A protagonista em primeiro plano, com o elemento central da história ao fundo.',
      prompt_visual: 'Composição vertical com a protagonista em destaque, fundo com raios de impacto e retícula, faixa inferior limpa.',
      alt_text: `Capa de ${titulo}, com a protagonista em destaque.`,
    },
  };
}
