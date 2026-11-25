import { escapeHtml } from '../core/html.js';

/**
 * Cards promocionais e imagens sociais.
 * São SVG compostos localmente (identidade institucional aplicada), sem
 * nenhuma chamada paga de geração de imagem. A exportação para PNG acontece
 * no navegador, via canvas.
 */

export const CARD_SIZES = {
  avatar: { w: 1080, h: 1080, label: 'Avatar (1080×1080)' },
  feed: { w: 1080, h: 1350, label: 'Feed (1080×1350)' },
  story: { w: 1080, h: 1920, label: 'Stories / Reels / TikTok (1080×1920)' },
  xbanner: { w: 1500, h: 500, label: 'Banner do X (1500×500)' },
  xpost: { w: 1600, h: 900, label: 'Post do X (1600×900)' },
  cover: { w: 1600, h: 2400, label: 'Capa (1600×2400)' },
};

const INK = '#141414';
const PAPER = '#F8F5ED';
const RED = '#E63946';
const GOLD = '#FFC857';

function defs() {
  return `<defs>
    <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="3.4" fill="currentColor" opacity=".30"/>
    </pattern>
    <pattern id="dots-s" width="9" height="9" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="2" fill="currentColor" opacity=".25"/>
    </pattern>
  </defs>`;
}

function wrap(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((`${line} ${w}`).trim().length > maxChars) { if (line) lines.push(line.trim()); line = w; }
    else line = `${line} ${w}`;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function logoMark(x, y, size) {
  const s = size / 120;
  return `<g transform="translate(${x},${y}) scale(${s})">
    <circle cx="60" cy="60" r="57" fill="${INK}" stroke="${PAPER}" stroke-width="5"/>
    <path d="M22 78c12-6 24-6 36 0V38c-12-6-24-6-36 0z" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
    <path d="M98 78c-12-6-24-6-36 0V38c12-6 24-6 36 0z" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
    <path d="M14 66c16 14 76 14 92 0" fill="none" stroke="${RED}" stroke-width="8" stroke-linecap="round"/>
  </g>`;
}

function brandWord(x, y, size, { onDark = true, accent = RED } = {}) {
  // Compacto para nunca estourar a largura; `accent` evita vermelho sobre vermelho.
  return `<text x="${x}" y="${y}" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${size}" fill="${onDark ? PAPER : INK}">Manga<tspan fill="${accent}">Loop.</tspan></text>`;
}

/**
 * Quatro modelos: desafio (vermelho), encerramento (preto), vencedor (dourado)
 * e lançamento (preto/creme).
 */
export function renderCard({ template = 'desafio', size = 'feed', theme = '', title = '', author = '', network = '', edition = '', ctaUrl = '' }) {
  const { w, h } = CARD_SIZES[size] || CARD_SIZES.feed;
  const vertical = h >= w;
  const pad = Math.round(w * 0.075);
  const titleSize = Math.round(w * (vertical ? 0.092 : 0.062));

  const common = `${defs()}`;

  if (template === 'desafio') {
    const lines = wrap(theme || 'Tema da semana', vertical ? 16 : 26).slice(0, 5);
    return svg(w, h, `${common}
      <rect width="${w}" height="${h}" fill="${RED}"/>
      <g color="${INK}"><rect width="${w}" height="${h}" fill="url(#dots)"/></g>
      <path d="M0 ${h * 0.14} L${w} ${h * 0.08} L${w} ${h * 0.2} L0 ${h * 0.27} Z" fill="${INK}" opacity=".9"/>
      <text x="${pad}" y="${h * 0.185}" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${Math.round(w * 0.036)}" fill="${GOLD}" letter-spacing="6">DESAFIO DA SEMANA</text>
      <g font-family="'Anton',Impact,sans-serif" fill="${PAPER}" font-size="${titleSize}">
        ${lines.map((l, i) => `<text x="${pad}" y="${h * 0.37 + i * titleSize * 1.06}">${escapeHtml(l.toUpperCase())}</text>`).join('')}
      </g>
      <rect x="${pad}" y="${h * 0.76}" width="${w - pad * 2}" height="${Math.round(h * 0.09)}" fill="${PAPER}" stroke="${INK}" stroke-width="6"/>
      <text x="${w / 2}" y="${h * 0.76 + h * 0.062}" text-anchor="middle" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${Math.round(w * 0.038)}" fill="${INK}">Conte sua história nos comentários</text>
      ${logoMark(pad, h - pad - w * 0.12, w * 0.12)}
      ${brandWord(pad + w * 0.145, h - pad - w * 0.032, w * 0.044, { accent: GOLD })}
    `);
  }

  if (template === 'encerramento') {
    const lines = wrap(theme || 'Última chance', vertical ? 15 : 24).slice(0, 4);
    return svg(w, h, `${common}
      <rect width="${w}" height="${h}" fill="${INK}"/>
      <g color="${PAPER}"><rect width="${w}" height="${h}" fill="url(#dots-s)" opacity=".5"/></g>
      ${Array.from({ length: 16 }, (_, i) => `<line x1="${-w * 0.1 + i * (w / 12)}" y1="0" x2="${-w * 0.35 + i * (w / 12)}" y2="${h}" stroke="${RED}" stroke-width="${i % 3 ? 2 : 7}" opacity=".5"/>`).join('')}
      <g transform="rotate(-2 ${w / 2} ${h / 2})">
        <rect x="${pad * 0.6}" y="${h * 0.2}" width="${w - pad * 1.2}" height="${Math.round(h * 0.1)}" fill="${RED}"/>
        <text x="${w / 2}" y="${h * 0.2 + h * 0.072}" text-anchor="middle" font-family="'Anton',Impact,sans-serif" font-size="${Math.round(w * 0.075)}" fill="${PAPER}" letter-spacing="3">ÚLTIMA CHANCE</text>
      </g>
      <g font-family="'Anton',Impact,sans-serif" fill="${PAPER}" font-size="${titleSize}">
        ${lines.map((l, i) => `<text x="${pad}" y="${h * 0.47 + i * titleSize * 1.06}">${escapeHtml(l.toUpperCase())}</text>`).join('')}
      </g>
      <g font-family="'Inter',sans-serif" font-size="${Math.round(w * 0.032)}" fill="${GOLD}">
        ${wrap('A apuração encerra hoje. O relato mais curtido vira mangá.', vertical ? 30 : 52).map((l, i) => `<text x="${pad}" y="${h * 0.73 + i * w * 0.045}">${escapeHtml(l)}</text>`).join('')}
      </g>
      ${logoMark(pad, h - pad - w * 0.12, w * 0.12)}
      ${brandWord(pad + w * 0.145, h - pad - w * 0.032, w * 0.044)}
    `);
  }

  if (template === 'vencedor') {
    const lines = wrap(title || 'História vencedora', vertical ? 14 : 22).slice(0, 4);
    return svg(w, h, `${common}
      <rect width="${w}" height="${h}" fill="${GOLD}"/>
      <g color="${INK}"><rect width="${w}" height="${h}" fill="url(#dots)" opacity=".7"/></g>
      <path d="M0 0 L${w} 0 L${w} ${h * 0.12} L0 ${h * 0.16} Z" fill="${INK}"/>
      <text x="${pad}" y="${h * 0.082}" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${Math.round(w * 0.034)}" fill="${GOLD}" letter-spacing="6">RELATO VENCEDOR · ${escapeHtml(String(network || '').toUpperCase())}</text>
      <g font-family="'Anton',Impact,sans-serif" fill="${INK}" font-size="${titleSize}">
        ${lines.map((l, i) => `<text x="${pad}" y="${h * 0.34 + i * titleSize * 1.06}">${escapeHtml(l.toUpperCase())}</text>`).join('')}
      </g>
      <rect x="${pad}" y="${h * 0.63}" width="${w - pad * 2}" height="${Math.round(h * 0.13)}" fill="${INK}"/>
      <text x="${pad + 36}" y="${h * 0.63 + h * 0.055}" font-family="'Inter',sans-serif" font-size="${Math.round(w * 0.034)}" fill="${PAPER}">Relato de</text>
      <text x="${pad + 36}" y="${h * 0.63 + h * 0.105}" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${Math.round(w * 0.05)}" fill="${GOLD}">${escapeHtml(author || 'autor anônimo')}</text>
      ${logoMark(pad, h - pad - w * 0.12, w * 0.12)}
      ${brandWord(pad + w * 0.145, h - pad - w * 0.032, w * 0.044, { onDark: false })}
      <text x="${w - pad}" y="${h - pad - w * 0.035}" text-anchor="end" font-family="'Inter',sans-serif" font-size="${Math.round(w * 0.03)}" fill="${INK}">Edição ${escapeHtml(String(edition || 's/n'))}</text>
    `);
  }

  // lançamento
  const lines = wrap(title || 'Nova edição no ar', vertical ? 14 : 22).slice(0, 4);
  return svg(w, h, `${common}
    <rect width="${w}" height="${h}" fill="${INK}"/>
    <g color="${PAPER}"><rect width="${w}" height="${h}" fill="url(#dots-s)" opacity=".4"/></g>
    <rect x="0" y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="${PAPER}"/>
    <path d="M0 ${h * 0.62} L${w} ${h * 0.57} L${w} ${h * 0.64} L0 ${h * 0.69} Z" fill="${RED}"/>
    <g font-family="'Anton',Impact,sans-serif" fill="${PAPER}" font-size="${titleSize}">
      ${lines.map((l, i) => `<text x="${pad}" y="${h * 0.24 + i * titleSize * 1.06}">${escapeHtml(l.toUpperCase())}</text>`).join('')}
    </g>
    <text x="${pad}" y="${h * 0.76}" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${Math.round(w * 0.042)}" fill="${INK}">Já está no ar para ler de graça</text>
    <text x="${pad}" y="${h * 0.82}" font-family="'Inter',sans-serif" font-size="${Math.round(w * 0.032)}" fill="#5E5E5E">${escapeHtml(ctaUrl || 'mangaloop')}</text>
    ${logoMark(w - pad - w * 0.14, h * 0.72, w * 0.14)}
  `);
}

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

/** Imagem social (Open Graph) de uma obra ou da home. */
export function renderOgImage({ title = 'MangaLoop', subtitle = 'Sua vida pode ser o próximo capítulo.', badge = '' }) {
  const w = 1200;
  const h = 630;
  const lines = wrap(title, 24).slice(0, 3);
  return svg(w, h, `${defs()}
    <rect width="${w}" height="${h}" fill="${INK}"/>
    <g color="${PAPER}"><rect width="${w}" height="${h}" fill="url(#dots-s)" opacity=".35"/></g>
    <path d="M${w * 0.62} -40 L${w + 60} -40 L${w + 60} ${h + 40} L${w * 0.5} ${h + 40} Z" fill="${RED}" opacity=".92"/>
    ${badge ? `<rect x="64" y="60" width="${26 + badge.length * 17}" height="46" fill="${GOLD}"/><text x="${64 + 16}" y="92" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="24" fill="${INK}">${escapeHtml(badge)}</text>` : ''}
    <g font-family="'Anton',Impact,sans-serif" fill="${PAPER}" font-size="72">
      ${lines.map((l, i) => `<text x="64" y="${220 + i * 78}">${escapeHtml(l.toUpperCase())}</text>`).join('')}
    </g>
    <text x="64" y="${h - 96}" font-family="'Inter',sans-serif" font-size="28" fill="#D9D4CA">${escapeHtml(subtitle)}</text>
    ${logoMark(64, h - 84, 64)}
    ${brandWord(146, h - 38, 34)}
  `);
}
