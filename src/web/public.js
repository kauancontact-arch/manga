import { env } from '../config/env.js';
import { all, get } from '../core/db.js';
import { html } from '../core/html.js';
import { assetUrl, readAsset } from '../core/storage.js';
import { allSettings } from '../core/settings.js';
import { currentChallenge, nextChallenge, slotStatus } from '../domain/challenges.js';
import { GENRES } from '../domain/catalog.js';
import { pageCompositeStandalone } from '../domain/compose.js';
import { getMangaBySlug, listPublished, mangaTranscript, storyPages, coverPage, listPages } from '../domain/mangas.js';
import { getMagazineBySlug, listMagazines, magazineEntries, magazineReadingPages } from '../domain/magazines.js';
import { renderOgImage } from '../domain/cards.js';
import { publicLayout } from './views/layout.js';
import * as V from './views/public.js';
import { CONTATO, PRIVACIDADE, REGRAS, SOBRE, TERMOS } from './content.js';

/** Enriquece a obra com a URL pública da capa. */
function withCover(manga) {
  const cover = coverPage(manga.id);
  return { ...manga, coverUrl: cover?.base_asset_id ? `/pagina/${cover.id}.svg` : null };
}

function anyDemo(list) {
  return list.some((m) => m.is_demo);
}

export function registerPublicRoutes(router) {
  /* --------------------------------- home -------------------------------- */
  router.get('/', (ctx) => {
    const settings = allSettings();
    const current = currentChallenge();
    const nextOne = nextChallenge();
    const slots = current ? slotStatus(current.id) : [];
    const published = listPublished({ limit: 24 }).map(withCover);
    const featured = current ? published.filter((m) => m.challenge_id === current.id).slice(0, 3) : published.slice(0, 3);
    const featuredIds = new Set(featured.map((m) => m.id));
    const recent = published.filter((m) => !featuredIds.has(m.id)).slice(0, 8);
    const magazines = listMagazines({ status: 'PUBLISHED', limit: 3 });

    ctx.html(publicLayout({
      title: null,
      ctx,
      pathname: '/',
      demoNotice: anyDemo(published),
      body: V.homePage({ current, nextOne, featured, recent, magazines, settings, slots }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'MangaLoop',
        url: env.appUrl,
        slogan: settings.tagline,
      },
    }));
  });

  /* ------------------------------- catálogo ------------------------------ */
  router.get('/mangas', (ctx) => {
    const q = (ctx.query.q || '').slice(0, 80);
    const genero = (ctx.query.genero || '').slice(0, 40);
    const rede = (ctx.query.rede || '').slice(0, 20);
    const edicao = Number(ctx.query.edicao) || null;

    let rows = listPublished({ search: q || null, genre: genero || null, network: rede || null, limit: 200 });
    if (edicao) rows = rows.filter((m) => m.edition_number === edicao);
    const mangas = rows.map(withCover);

    ctx.html(publicLayout({
      title: 'Catálogo de mangás',
      description: 'Todos os mangás publicados pelo MangaLoop, adaptados de histórias reais contadas pela comunidade.',
      ctx,
      pathname: '/mangas',
      demoNotice: anyDemo(mangas),
      body: V.catalogPage({ mangas, filters: { q, genero, rede, edicao }, genres: GENRES, total: mangas.length }),
    }));
  });

  /* ------------------------------- obra ---------------------------------- */
  router.get('/mangas/:slug', (ctx) => {
    const manga = getMangaBySlug(ctx.params.slug);
    if (!manga || manga.status !== 'PUBLISHED') return renderNotFound(ctx);
    const submission = manga.submission_id ? get('SELECT * FROM submissions WHERE id = ?', [manga.submission_id]) : null;
    const challenge = manga.challenge_id ? get('SELECT * FROM challenges WHERE id = ?', [manga.challenge_id]) : null;
    const magazineRow = get(`SELECT mg.* FROM magazines mg
      JOIN magazine_entries e ON e.magazine_id = mg.id
      WHERE e.manga_id = ? AND mg.status = 'PUBLISHED' LIMIT 1`, [manga.id]);
    const cover = coverPage(manga.id);
    const pages = storyPages(manga.id).filter((p) => p.status === 'READY');

    ctx.html(publicLayout({
      title: manga.title,
      description: manga.synopsis || 'Mangá adaptado de uma história real da comunidade MangaLoop.',
      ctx,
      pathname: `/mangas/${manga.slug}`,
      canonical: `/mangas/${manga.slug}`,
      ogType: 'article',
      ogImage: `/og/${manga.slug}.svg`,
      demoNotice: !!manga.is_demo,
      body: V.mangaDetailPage({
        manga,
        coverUrl: cover?.base_asset_id ? `/pagina/${cover.id}.svg` : null,
        submission,
        challenge,
        magazine: magazineRow,
        pagesCount: pages.length,
        transcript: mangaTranscript(manga.id),
      }),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ComicStory',
        name: manga.title,
        description: manga.synopsis,
        datePublished: manga.published_at,
        inLanguage: manga.language,
        publisher: { '@type': 'Organization', name: 'MangaLoop' },
      },
    }));
  });

  /* ------------------------------- leitor -------------------------------- */
  router.get('/mangas/:slug/ler', (ctx) => {
    const manga = getMangaBySlug(ctx.params.slug);
    if (!manga || manga.status !== 'PUBLISHED') return renderNotFound(ctx);
    const pages = storyPages(manga.id).filter((p) => p.status === 'READY');
    if (!pages.length) return renderNotFound(ctx);
    const cover = coverPage(manga.id);
    const nextManga = get(`SELECT slug, title FROM mangas WHERE status = 'PUBLISHED' AND published_at < ? ORDER BY published_at DESC LIMIT 1`, [manga.published_at || new Date().toISOString()]);

    ctx.html(publicLayout({
      title: `Ler ${manga.title}`,
      description: manga.synopsis,
      ctx,
      pathname: `/mangas/${manga.slug}/ler`,
      canonical: `/mangas/${manga.slug}`,
      ogImage: `/og/${manga.slug}.svg`,
      bodyClass: 'is-reader',
      body: V.readerPage({
        manga,
        pages,
        coverPage: cover?.status === 'READY' ? cover : null,
        transcript: mangaTranscript(manga.id),
        nextManga,
      }),
    }));
  });

  /* ------------------------------ revistas ------------------------------- */
  router.get('/revistas', (ctx) => {
    const magazines = listMagazines({ status: 'PUBLISHED', limit: 60 });
    ctx.html(publicLayout({
      title: 'Revistas',
      description: 'Edições semanais do MangaLoop reunindo as três histórias vencedoras.',
      ctx, pathname: '/revistas',
      body: V.magazineListPage({ magazines }),
    }));
  });

  router.get('/revistas/:slug', (ctx) => {
    const magazine = getMagazineBySlug(ctx.params.slug);
    if (!magazine || magazine.status !== 'PUBLISHED') return renderNotFound(ctx);
    const entries = magazineEntries(magazine.id);
    const firstCover = entries[0] ? coverPage(entries[0].manga_id) : null;
    ctx.html(publicLayout({
      title: magazine.title,
      description: magazine.summary || `Edição ${magazine.edition_number} do MangaLoop.`,
      ctx,
      pathname: `/revistas/${magazine.slug}`,
      canonical: `/revistas/${magazine.slug}`,
      ogImage: `/og/revista-${magazine.slug}.svg`,
      body: V.magazineDetailPage({
        magazine,
        entries,
        coverUrl: magazine.cover_asset_id ? assetUrl(magazine.cover_asset_id) : (firstCover ? `/pagina/${firstCover.id}.svg` : null),
      }),
    }));
  });

  router.get('/revistas/:slug/ler', (ctx) => {
    const magazine = getMagazineBySlug(ctx.params.slug);
    if (!magazine || magazine.status !== 'PUBLISHED') return renderNotFound(ctx);
    const blocks = magazineReadingPages(magazine.id).filter((b) => b.pages.length);
    if (!blocks.length) return renderNotFound(ctx);
    ctx.html(publicLayout({
      title: `Ler ${magazine.title}`,
      ctx,
      pathname: `/revistas/${magazine.slug}/ler`,
      canonical: `/revistas/${magazine.slug}`,
      body: V.magazineReaderPage({ magazine, blocks }),
    }));
  });

  /* ---------------------------- institucional ---------------------------- */
  router.get('/participar', (ctx) => {
    ctx.html(publicLayout({
      title: 'Participar',
      description: 'Como participar dos desafios semanais do MangaLoop no Instagram, TikTok e X.',
      ctx, pathname: '/participar',
      body: V.participatePage({ settings: allSettings(), current: currentChallenge(), nextOne: nextChallenge() }),
    }));
  });

  const editorial = (path, content) => router.get(path, (ctx) => {
    ctx.html(publicLayout({
      title: content.title,
      description: content.lead,
      ctx, pathname: path,
      body: V.editorialPage(content),
    }));
  });
  editorial('/sobre', SOBRE);
  editorial('/regras', REGRAS);
  editorial('/privacidade', PRIVACIDADE);
  editorial('/termos', TERMOS);

  router.get('/contato', (ctx) => {
    const s = allSettings();
    const content = {
      ...CONTATO,
      blocks: [
        ...CONTATO.blocks,
        {
          heading: 'Como falar com a gente',
          body: s.takedown_email || s.contact_email
            ? `Escreva para ${s.takedown_email || s.contact_email}. Respondemos em até 5 dias úteis.`
            : 'O endereço de contato é publicado nas redes oficiais e configurado no painel editorial. Enquanto isso, fale com a equipe por mensagem direta em qualquer uma das três redes.',
        },
      ],
    };
    ctx.html(publicLayout({ title: content.title, description: content.lead, ctx, pathname: '/contato', body: V.editorialPage(content) }));
  });

  /* ------------------------- mídia e composições -------------------------- */

  /** Página composta (arte base + balões). Só serve obras publicadas. */
  router.get('/pagina/:pageId.svg', async (ctx) => {
    const page = get('SELECT * FROM pages WHERE id = ?', [ctx.params.pageId]);
    if (!page || page.status !== 'READY') return ctx.text('Não encontrado', 404);
    const manga = get('SELECT * FROM mangas WHERE id = ?', [page.manga_id]);
    const isAdmin = !!ctx.user;
    if (!manga || (manga.status !== 'PUBLISHED' && !isAdmin)) return ctx.text('Não encontrado', 404);
    // Autocontido: um SVG carregado por <img> não busca recursos externos,
    // então a arte base é embutida junto com a camada de balões.
    const svg = await pageCompositeStandalone(page);
    ctx.flush(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': manga.status === 'PUBLISHED' ? 'public, max-age=3600' : 'private, no-store',
      ETag: `W/"${page.id}-${page.version}"`,
    }, svg);
  });

  /** Arquivo de mídia. Privado exige sessão administrativa. */
  router.get('/midia/:assetId', async (ctx) => {
    const found = await readAsset(ctx.params.assetId);
    if (!found) return ctx.text('Não encontrado', 404);
    if (found.asset.visibility !== 'public' && !ctx.user) return ctx.text('Não autorizado', 403);
    ctx.flush(200, {
      'Content-Type': found.asset.mime,
      'Content-Length': found.buffer.length,
      'Cache-Control': found.asset.visibility === 'public' ? 'public, max-age=86400' : 'private, no-store',
      'Content-Disposition': ctx.query.download ? `attachment; filename="mangaloop-${found.asset.id}"` : 'inline',
    }, found.buffer);
  });

  /** Imagem social gerada localmente (sem custo de IA). */
  router.get('/og/:name.svg', (ctx) => {
    const name = ctx.params.name;
    let title = 'MangaLoop';
    let badge = '';
    if (name !== 'padrao') {
      if (name.startsWith('revista-')) {
        const mag = getMagazineBySlug(name.replace('revista-', ''));
        if (mag) { title = mag.title; badge = `Edição ${mag.edition_number}`; }
      } else {
        const manga = getMangaBySlug(name);
        if (manga && manga.status === 'PUBLISHED') {
          title = manga.title;
          const challenge = manga.challenge_id ? get('SELECT edition_number FROM challenges WHERE id = ?', [manga.challenge_id]) : null;
          badge = challenge ? `Edição ${challenge.edition_number}` : '';
        }
      }
    }
    ctx.flush(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      renderOgImage({ title, badge }));
  });

  /* ------------------------------- SEO ----------------------------------- */
  router.get('/sitemap.xml', (ctx) => {
    const urls = [
      { loc: '/', priority: '1.0' },
      { loc: '/mangas', priority: '0.8' },
      { loc: '/revistas', priority: '0.7' },
      { loc: '/participar', priority: '0.7' },
      { loc: '/sobre', priority: '0.4' },
      { loc: '/regras', priority: '0.4' },
      { loc: '/privacidade', priority: '0.3' },
      { loc: '/termos', priority: '0.3' },
      { loc: '/contato', priority: '0.3' },
    ];
    for (const m of all("SELECT slug, published_at FROM mangas WHERE status = 'PUBLISHED'")) {
      urls.push({ loc: `/mangas/${m.slug}`, lastmod: m.published_at, priority: '0.9' });
      urls.push({ loc: `/mangas/${m.slug}/ler`, lastmod: m.published_at, priority: '0.6' });
    }
    for (const m of all("SELECT slug, published_at FROM magazines WHERE status = 'PUBLISHED'")) {
      urls.push({ loc: `/revistas/${m.slug}`, lastmod: m.published_at, priority: '0.8' });
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${env.appUrl}${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
    ctx.flush(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }, xml);
  });

  router.get('/robots.txt', (ctx) => {
    ctx.text(`User-agent: *
Disallow: /admin
Disallow: /midia
Allow: /

Sitemap: ${env.appUrl}/sitemap.xml
`);
  });
}

export function renderNotFound(ctx) {
  ctx.html(publicLayout({ title: 'Página não encontrada', ctx, noindex: true, body: V.notFoundPage() }), 404);
}

export function renderError(ctx, message, status = 500) {
  ctx.html(publicLayout({ title: 'Erro', ctx, noindex: true, body: V.errorPage({ message }) }), status);
}
