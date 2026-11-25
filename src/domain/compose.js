import { assetRow, assetUrl, readAsset } from '../core/storage.js';
import { PAGE_H, PAGE_W, renderBalloonLayer, renderComposite } from './balloons.js';

/**
 * Composição de página: arte base (imutável) + camada de balões (editável).
 * As duas camadas são guardadas separadamente; a composição é montada na
 * entrega, o que permite reeditar texto sem gerar imagem de novo.
 */

export function pageBalloons(page) {
  try { return JSON.parse(page.balloons_json || '[]'); } catch { return []; }
}
export function pagePanels(page) {
  try { return JSON.parse(page.panels_json || '[]'); } catch { return []; }
}

/** SVG servido ao leitor: referencia a imagem base por URL. */
export function pageCompositeSvg(page, { altText = null } = {}) {
  const balloons = pageBalloons(page);
  const base = page.base_asset_id ? assetRow(page.base_asset_id) : null;
  return renderComposite({
    baseHref: base ? assetUrl(page.base_asset_id) : null,
    balloons,
    width: PAGE_W,
    height: PAGE_H,
    altText: altText ?? page.alt_text ?? `Página ${page.page_number}`,
  });
}

/** SVG autocontido (base embutida em base64) para exportação e arquivamento. */
export async function pageCompositeStandalone(page) {
  const balloons = pageBalloons(page);
  let baseHref = null;
  let baseSvgInner = null;
  if (page.base_asset_id) {
    const found = await readAsset(page.base_asset_id);
    if (found) {
      if (found.asset.mime === 'image/svg+xml') {
        baseSvgInner = found.buffer.toString('utf8')
          .replace(/<\?xml[^>]*\?>/i, '')
          .replace(/^[\s\S]*?<svg[^>]*>/i, '')
          .replace(/<\/svg>\s*$/i, '');
      } else {
        baseHref = `data:${found.asset.mime};base64,${found.buffer.toString('base64')}`;
      }
    }
  }
  return renderComposite({
    baseHref,
    baseSvgInner,
    balloons,
    width: PAGE_W,
    height: PAGE_H,
    altText: page.alt_text || `Página ${page.page_number}`,
  });
}

/**
 * Página em duas camadas, para a entrega ao leitor.
 *
 * Embutir a arte dentro do SVG custa um terço a mais de bytes e impede o
 * navegador de guardar a imagem em cache. No leitor a arte vai como <img>,
 * que o navegador guarda e reaproveita, e os balões por cima como SVG.
 */
export function pageLayers(page) {
  const base = page.base_asset_id ? assetRow(page.base_asset_id) : null;
  return {
    imageUrl: base ? assetUrl(page.base_asset_id) : null,
    mime: base?.mime || null,
    overlay: renderBalloonLayer(pageBalloons(page), { width: PAGE_W, height: PAGE_H }),
    width: PAGE_W,
    height: PAGE_H,
    alt: page.alt_text || `Página ${page.page_number}`,
  };
}
