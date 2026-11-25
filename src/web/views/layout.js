import { aiMode, env } from '../../config/env.js';
import { html, raw } from '../../core/html.js';
import { allSettings } from '../../core/settings.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Anton&family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap';

export const BRAND_MARK = raw(`<svg class="brand__mark" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <circle cx="60" cy="60" r="57" fill="#141414" stroke="currentColor" stroke-width="5"/>
  <path d="M22 78c12-6 24-6 36 0V38c-12-6-24-6-36 0z" fill="#F8F5ED" stroke="#141414" stroke-width="3"/>
  <path d="M98 78c-12-6-24-6-36 0V38c12-6 24-6 36 0z" fill="#F8F5ED" stroke="#141414" stroke-width="3"/>
  <path d="M14 66c16 14 76 14 92 0" fill="none" stroke="#E63946" stroke-width="8" stroke-linecap="round"/>
</svg>`);

function brand(href = '/') {
  return html`<a class="brand" href="${href}">${BRAND_MARK}<span class="brand__word">Manga<i>Loop.</i></span></a>`;
}

const PUBLIC_NAV = [
  ['/', 'Inicio'],
  ['/mangas', 'Mangas'],
  ['/revistas', 'Revistas'],
  ['/participar', 'Participar'],
  ['/sobre', 'Sobre'],
];

/**
 * Layout publico. Mobile-first, sem login, com metadados sociais.
 */
export function publicLayout({
  title,
  description = 'MangaLoop transforma historias reais em mangas originais. Voce conta. A comunidade escolhe. Nos ilustramos.',
  body,
  ctx,
  canonical = null,
  ogImage = null,
  ogType = 'website',
  pathname = '/',
  bodyClass = '',
  noindex = false,
  demoNotice = false,
  structuredData = null,
}) {
  const s = allSettings();
  const fullTitle = title ? `${title} · MangaLoop` : 'MangaLoop · Sua vida pode ser o proximo capitulo.';
  const url = canonical ? `${env.appUrl}${canonical}` : `${env.appUrl}${pathname}`;
  const image = ogImage ? (ogImage.startsWith('http') ? ogImage : `${env.appUrl}${ogImage}`) : `${env.appUrl}/og/padrao.svg`;

  return html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>${fullTitle}</title>
<meta name="description" content="${description}">
${noindex ? raw('<meta name="robots" content="noindex, nofollow">') : raw('<meta name="robots" content="index, follow">')}
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="MangaLoop">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${fullTitle}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<meta name="theme-color" content="#141414">
<meta name="color-scheme" content="light">
<link rel="icon" href="/estatico/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/estatico/styles.css">
${structuredData ? raw(`<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>`) : ''}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
${demoNotice ? html`<div class="demo-banner" role="status">Conteudo de demonstracao: obras geradas localmente para validar o fluxo, sem chamadas pagas de IA.</div>` : ''}
<header class="site-header">
  <div class="wrap site-header__inner">
    ${brand('/')}
    <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="nav-principal">
      <span aria-hidden="true">☰</span> Menu
    </button>
    <nav class="site-nav" id="nav-principal" data-nav aria-label="Navegação principal">
      <ul>
        ${PUBLIC_NAV.map(([href, label]) => html`<li><a href="${href}"${raw(pathname === href || (href !== '/' && pathname.startsWith(href)) ? ' aria-current="page"' : '')}>${label}</a></li>`)}
      </ul>
    </nav>
  </div>
</header>
<main id="conteudo">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        ${brand('/')}
        <p class="mt-2" style="max-width:34ch">${s.signature}</p>
        <p><strong style="color:var(--gold)">${s.tagline}</strong></p>
      </div>
      <div>
        <h4>Ler</h4>
        <ul>
          <li><a href="/mangas">Catalogo de mangas</a></li>
          <li><a href="/revistas">Revistas semanais</a></li>
          <li><a href="/participar">Como participar</a></li>
        </ul>
      </div>
      <div>
        <h4>Institucional</h4>
        <ul>
          <li><a href="/sobre">Sobre</a></li>
          <li><a href="/regras">Regras</a></li>
          <li><a href="/privacidade">Privacidade</a></li>
          <li><a href="/termos">Termos</a></li>
          <li><a href="/contato">Contato e retirada de conteudo</a></li>
        </ul>
      </div>
      <div>
        <h4>Redes oficiais</h4>
        <ul>
          ${s.instagram_url ? html`<li><a href="${s.instagram_url}" rel="noopener me">Instagram</a></li>` : html`<li class="muted">Instagram em breve</li>`}
          ${s.tiktok_url ? html`<li><a href="${s.tiktok_url}" rel="noopener me">TikTok</a></li>` : html`<li class="muted">TikTok em breve</li>`}
          ${s.x_url ? html`<li><a href="${s.x_url}" rel="noopener me">X</a></li>` : html`<li class="muted">X em breve</li>`}
        </ul>
      </div>
    </div>
    <div class="footer-legal">
      <p>Os relatos pertencem a quem os escreveu e sao adaptados com autorizacao. As obras sao adaptacoes ilustradas com apoio de inteligencia artificial, revisadas por pessoas antes da publicacao.</p>
      <p class="mb-0">© ${new Date().getFullYear()} MangaLoop · <a href="/contato">Pedido de retirada de conteudo</a></p>
    </div>
  </div>
</footer>
<script src="/estatico/app.js" defer nonce="${ctx?.nonce || ''}"></script>
</body>
</html>`;
}

const ADMIN_NAV = [
  ['/admin', 'Visão geral'],
  ['/admin/desafios', 'Desafios'],
  ['/admin/roteiros-sociais', 'Gerador de roteiros'],
  ['/admin/relatos', 'Relatos vencedores'],
  ['/admin/estudio', 'Estúdio de mangás'],
  ['/admin/revisao', 'Revisão'],
  ['/admin/revistas', 'Revistas'],
  ['/admin/biblioteca', 'Biblioteca'],
  ['/admin/custos', 'Custos'],
  ['/admin/configuracoes', 'Configurações'],
];

export function adminLayout({ title, body, ctx, pathname = '/admin', subtitle = '', actions = null, flash = null }) {
  const mode = aiMode();
  return html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>${title} · Admin MangaLoop</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#141414">
<meta name="color-scheme" content="light">
<link rel="icon" href="/estatico/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/estatico/styles.css">
</head>
<body>
<a class="skip-link" href="#admin-conteudo">Pular para o conteúdo</a>
<div class="admin">
  <aside class="admin__side">
    ${brand('/admin')}
    <nav aria-label="Navegação administrativa">
      <ul>
        ${ADMIN_NAV.map(([href, label]) => html`<li><a href="${href}"${raw(isCurrent(pathname, href) ? ' aria-current="page"' : '')}>${label}</a></li>`)}
      </ul>
    </nav>
    <div class="side-foot">
      <p class="mb-0"><strong style="color:var(--paper)">Modo de IA:</strong> ${mode === 'live' ? 'produção (chamadas pagas)' : 'demonstração (sem custo)'}</p>
      <p class="mb-0">Sessão: ${ctx?.user?.username || 'anônima'}</p>
      <form method="post" action="/admin/sair" style="margin-top:.6rem">
        <input type="hidden" name="_csrf" value="${ctx?.csrf || ''}">
        <button class="btn btn--sm btn--ghost btn--block" type="submit">Sair</button>
      </form>
      <p style="margin-top:.6rem"><a href="/" target="_blank" rel="noopener">Ver site público ↗</a></p>
    </div>
  </aside>
  <div class="admin__main" id="admin-conteudo">
    <div class="admin__head">
      <div>
        <h1>${title}</h1>
        ${subtitle ? html`<p>${subtitle}</p>` : ''}
      </div>
      ${actions ? html`<div class="row">${actions}</div>` : ''}
    </div>
    ${flash ? renderFlash(flash) : ''}
    ${body}
  </div>
</div>
<script src="/estatico/app.js" defer nonce="${ctx?.nonce || ''}"></script>
</body>
</html>`;
}

function isCurrent(pathname, href) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function renderFlash(flash) {
  if (!flash) return '';
  const cls = flash.type === 'erro' ? 'notice--warn' : flash.type === 'aviso' ? 'notice--demo' : 'notice--ok';
  return html`<div class="notice ${cls} mb-2" role="status"><p class="mb-0">${flash.message}</p></div>`;
}

/** Extrai mensagens curtas de ?ok= / ?erro= / ?aviso= */
export function readFlash(ctx) {
  for (const type of ['ok', 'erro', 'aviso']) {
    if (ctx.query[type]) return { type, message: String(ctx.query[type]).slice(0, 300) };
  }
  return null;
}
