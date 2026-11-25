import { escapeHtml } from '../core/html.js';

/**
 * Camada de balões.
 *
 * O texto NUNCA é gerado pela IA de imagem: ele é composto como SVG
 * determinístico sobre a imagem base, com posições editáveis, quebra de
 * linha controlada, fontes licenciadas e contraste garantido.
 */

export const PAGE_W = 1000;
export const PAGE_H = 1500;

const FONT_STACK = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const SFX_FONT = "'Anton', 'Arial Narrow', Impact, sans-serif";

/* Largura média por caractere, em fração do tamanho da fonte (Inter, peso 600). */
const CHAR_W = 0.54;

export function wrapText(text, maxWidthPx, fontSize) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const maxChars = Math.max(6, Math.floor(maxWidthPx / (fontSize * CHAR_W)));
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars - 1) + '-' : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Corpo de texto dos balões.
 *
 * A página tem 1000px de largura e é lida num celular de 375px, ou seja, a
 * 0,375 do tamanho desenhado. Um corpo de 25px vira 9px na tela, que obriga a
 * dar zoom em toda fala. Os valores abaixo põem o texto perto de 13px no
 * celular, que é o corpo usual de quadrinho em leitor de telefone.
 */
export const CORPO = { fala: 34, grito: 40, narracao: 30 };

export function measureBalloon(text, { fontSize = CORPO.fala, maxWidth = 300, padX = 26, padY = 22, lineHeight = 1.28 } = {}) {
  const lines = wrapText(text, maxWidth - padX * 2, fontSize);
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const width = Math.min(maxWidth, Math.max(130, longest * fontSize * CHAR_W + padX * 2));
  const height = lines.length * fontSize * lineHeight + padY * 2;
  return { lines, width, height, fontSize, lineHeight };
}

/**
 * Grades de quadros. A IA recebe o mesmo layout para que a arte base
 * já nasça com áreas livres onde os balões serão posicionados.
 */
export function panelGrid(frameCount, { density = 'MEDIA', gutter = 22, margin = 34 } = {}) {
  const n = Math.max(1, Math.min(8, frameCount));
  const innerW = PAGE_W - margin * 2;
  const innerH = PAGE_H - margin * 2;

  const rows = {
    1: [[1]],
    2: [[1], [1]],
    3: [[1], [2]],
    4: [[2], [2]],
    5: [[2], [1], [2]],
    6: [[2], [2], [2]],
    7: [[2], [2], [3]],
    8: [[2], [3], [3]],
  }[n];

  const rowCount = rows.length;
  const rowH = (innerH - gutter * (rowCount - 1)) / rowCount;
  const rects = [];
  let index = 0;
  rows.forEach((row, r) => {
    const cols = row[0];
    const colW = (innerW - gutter * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) {
      index += 1;
      rects.push({
        index,
        x: Math.round(margin + c * (colW + gutter)),
        y: Math.round(margin + r * (rowH + gutter)),
        w: Math.round(colW),
        h: Math.round(rowH),
      });
    }
  });
  return rects.slice(0, n);
}

/**
 * Posiciona balões dentro de cada quadro, preferindo o topo (zona reservada),
 * alternando lados e evitando sobreposição simples.
 */
export function layoutBalloons(frames, rects) {
  const balloons = [];
  frames.forEach((frame, i) => {
    const rect = rects[i] || rects[rects.length - 1];
    if (!rect) return;
    let cursorY = rect.y + 18;

    if (frame.narrador) {
      const box = measureBalloon(frame.narrador, { fontSize: CORPO.narracao, maxWidth: rect.w - 40 });
      balloons.push({
        id: `${frame.id}-nar`, frameId: frame.id, type: 'NARRACAO', text: frame.narrador,
        x: rect.x + 18, y: cursorY, w: box.width, h: box.height, fontSize: box.fontSize,
        tailX: null, tailY: null, locked: false,
      });
      cursorY += box.height + 12;
    }

    frame.dialogos.forEach((d, di) => {
      const maxWidth = Math.min(420, rect.w - 40);
      const box = measureBalloon(d.texto, { fontSize: d.tipo === 'GRITO' ? CORPO.grito : CORPO.fala, maxWidth });
      const alignRight = di % 2 === 1;
      const x = alignRight ? rect.x + rect.w - box.width - 20 : rect.x + 20;
      const y = Math.min(cursorY, rect.y + rect.h - box.height - 70);
      balloons.push({
        id: `${frame.id}-d${di + 1}`, frameId: frame.id, type: d.tipo, text: d.texto,
        speaker: d.personagem_id || '',
        x: Math.round(x), y: Math.round(y), w: box.width, h: box.height, fontSize: box.fontSize,
        tailX: Math.round(alignRight ? x + box.width * 0.3 : x + box.width * 0.7),
        tailY: Math.round(y + box.height + 36),
        locked: false,
      });
      cursorY = y + box.height + 14;
    });

    // Onomatopeias ficam nas bordas laterais, longe do centro do quadro,
    // onde a arte costuma posicionar os personagens.
    (frame.efeitos_sonoros || []).forEach((sfx, si) => {
      const leftSide = si % 2 === 1;
      balloons.push({
        id: `${frame.id}-s${si + 1}`, frameId: frame.id, type: 'SFX', text: sfx,
        x: Math.round(leftSide ? rect.x + rect.w * 0.07 : rect.x + rect.w * 0.60),
        y: Math.round(rect.y + rect.h * (0.86 - si * 0.1)),
        w: 0, h: 0, fontSize: Math.round(Math.min(52, Math.max(30, rect.w / Math.max(4, sfx.length) * 1.5))),
        rotate: leftSide ? 7 : -8, locked: false,
      });
    });
  });
  return balloons;
}

/* ------------------------------ renderização ---------------------------- */

function balloonShape(b) {
  const { x, y, w, h } = b;
  const rx = Math.round(w / 2);
  const ry = Math.round(h / 2);
  const cx = x + rx;
  const cy = y + ry;

  if (b.type === 'NARRACAO') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F8F5ED" stroke="#141414" stroke-width="3"/>`;
  }
  if (b.type === 'GRITO') {
    const points = [];
    const spikes = 22;
    for (let i = 0; i < spikes; i++) {
      const angle = (i / spikes) * Math.PI * 2;
      const radius = i % 2 === 0 ? 1 : 0.82;
      points.push(`${(cx + Math.cos(angle) * rx * radius * 1.1).toFixed(1)},${(cy + Math.sin(angle) * ry * radius * 1.25).toFixed(1)}`);
    }
    return `<polygon points="${points.join(' ')}" fill="#fff" stroke="#141414" stroke-width="3.5"/>`;
  }
  if (b.type === 'PENSAMENTO') {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#141414" stroke-width="3"/>
      <circle cx="${cx - rx * 0.3}" cy="${cy + ry + 20}" r="10" fill="#fff" stroke="#141414" stroke-width="2.5"/>
      <circle cx="${cx - rx * 0.45}" cy="${cy + ry + 42}" r="6" fill="#fff" stroke="#141414" stroke-width="2.5"/>`;
  }
  if (b.type === 'SUSSURRO') {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#141414" stroke-width="2.5" stroke-dasharray="9 7"/>`;
  }
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#141414" stroke-width="3"/>`;
}

function balloonTail(b) {
  if (b.type === 'NARRACAO' || b.type === 'SFX' || b.tailX === null || b.tailX === undefined) return '';
  const baseX = b.x + b.w / 2;
  const baseY = b.y + b.h - 4;
  return `<polygon points="${baseX - 16},${baseY - 6} ${baseX + 16},${baseY - 6} ${b.tailX},${b.tailY}" fill="#fff" stroke="#141414" stroke-width="3" stroke-linejoin="round"/>
    <line x1="${baseX - 13}" y1="${baseY - 7}" x2="${baseX + 13}" y2="${baseY - 7}" stroke="#fff" stroke-width="5"/>`;
}

function balloonText(b) {
  if (b.type === 'SFX') {
    return `<text x="${b.x}" y="${b.y}" font-family="${SFX_FONT}" font-size="${b.fontSize}" fill="#E63946" stroke="#141414" stroke-width="2.5" paint-order="stroke" transform="rotate(${b.rotate || 0} ${b.x} ${b.y})" letter-spacing="2">${escapeHtml(b.text)}</text>`;
  }
  const { lines, lineHeight } = measureBalloon(b.text, { fontSize: b.fontSize, maxWidth: b.w });
  const startY = b.y + b.h / 2 - ((lines.length - 1) * b.fontSize * lineHeight) / 2 + b.fontSize * 0.34;
  const anchor = b.type === 'NARRACAO' ? 'start' : 'middle';
  const tx = b.type === 'NARRACAO' ? b.x + 18 : b.x + b.w / 2;
  const style = b.type === 'PENSAMENTO' ? ' font-style="italic"' : '';
  const weight = b.type === 'GRITO' ? '800' : '600';
  return `<text font-family="${FONT_STACK}" font-size="${b.fontSize}" font-weight="${weight}" fill="#141414" text-anchor="${anchor}"${style}>` +
    lines.map((line, i) => `<tspan x="${tx}" y="${(startY + i * b.fontSize * lineHeight).toFixed(1)}">${escapeHtml(line)}</tspan>`).join('') +
    '</text>';
}

/** Camada de balões isolada (sem a arte base). Guardada separadamente no banco. */
export function renderBalloonLayer(balloons, { width = PAGE_W, height = PAGE_H } = {}) {
  const body = balloons.map((b) => `<g data-balloon="${escapeHtml(b.id)}">${balloonTail(b)}${b.type === 'SFX' ? '' : balloonShape(b)}${balloonText(b)}</g>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
}

/**
 * Composição final: arte base + camada de balões.
 * `baseHref` pode ser uma URL servida pela aplicação ou um data: URI.
 */
export function renderComposite({ baseHref = null, baseSvgInner = null, balloons = [], width = PAGE_W, height = PAGE_H, altText = '' }) {
  const base = baseSvgInner
    ? baseSvgInner
    : baseHref
      ? `<image href="${escapeHtml(baseHref)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect width="${width}" height="${height}" fill="#F8F5ED"/>`;
  const layer = balloons.map((b) => `<g data-balloon="${escapeHtml(b.id)}">${balloonTail(b)}${b.type === 'SFX' ? '' : balloonShape(b)}${balloonText(b)}</g>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(altText)}">
<title>${escapeHtml(altText)}</title>
${base}
${layer}
</svg>`;
}

/** Validação de edição manual de balões vinda do painel. */
export function sanitizeBalloons(input) {
  const list = Array.isArray(input) ? input : [];
  return list.slice(0, 40).map((b, i) => ({
    id: String(b.id || `b${i + 1}`).slice(0, 60),
    frameId: String(b.frameId || '').slice(0, 60),
    type: ['FALA', 'PENSAMENTO', 'GRITO', 'SUSSURRO', 'NARRACAO', 'SFX'].includes(b.type) ? b.type : 'FALA',
    text: String(b.text || '').slice(0, 220),
    speaker: String(b.speaker || '').slice(0, 40),
    x: clamp(Number(b.x) || 0, -200, PAGE_W + 200),
    y: clamp(Number(b.y) || 0, -200, PAGE_H + 200),
    w: clamp(Number(b.w) || 160, 0, PAGE_W),
    h: clamp(Number(b.h) || 90, 0, PAGE_H),
    fontSize: clamp(Number(b.fontSize) || CORPO.fala, 10, 90),
    rotate: clamp(Number(b.rotate) || 0, -45, 45),
    tailX: b.tailX === null || b.tailX === undefined ? null : clamp(Number(b.tailX), -200, PAGE_W + 200),
    tailY: b.tailY === null || b.tailY === undefined ? null : clamp(Number(b.tailY), -200, PAGE_H + 200),
  })).filter((b) => b.text.trim());
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
