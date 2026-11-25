import { html, raw, paragraphs } from '../../core/html.js';
import { pageLayers } from '../../domain/compose.js';
import { fmtLongDate } from '../../core/dates.js';
import { GENRES, label, networkLabel, NETWORKS } from '../../domain/catalog.js';
import { mangaCredits } from '../../domain/mangas.js';

const genreLabel = (k) => (k ? label(GENRES, k) : null);


/** Página do leitor: arte em <img> e balões em SVG por cima. */
function pageFigure(page, legenda, { eager = false } = {}) {
  const camadas = pageLayers(page);
  return html`<figure class="reader__page" data-page>
    <div class="page-layers">
      ${camadas.imageUrl
        ? html`<img src="${camadas.imageUrl}" alt="${camadas.alt}" width="${camadas.width}" height="${camadas.height}" loading="${raw(eager ? 'eager' : 'lazy')}" decoding="async">`
        : html`<div class="empty-state">Página indisponível</div>`}
      ${raw(camadas.overlay)}
    </div>
    <figcaption>${legenda}</figcaption>
  </figure>`;
}

export function mangaCard(manga, { coverUrl = null, featured = false } = {}) {
  return html`<a class="manga-card" href="/mangas/${manga.slug}">
    ${featured ? html`<span class="ribbon">Desta semana</span>` : ''}
    <div class="manga-card__cover">
      ${coverUrl
        ? html`<img src="${coverUrl}" alt="Capa de ${manga.title}" loading="lazy" width="400" height="600">`
        : html`<div class="empty-state" style="height:100%;border:0;display:grid;place-items:center"><span class="muted">Sem capa</span></div>`}
    </div>
    <div class="manga-card__body">
      <h3 class="manga-card__title">${manga.title}</h3>
      <div class="tag-row">
        ${manga.network ? html`<span class="tag">${networkLabel(manga.network)}</span>` : ''}
        ${genreLabel(manga.genre) ? html`<span class="tag tag--gold">${genreLabel(manga.genre)}</span>` : ''}
        ${manga.is_demo ? html`<span class="tag tag--demo">Demonstração</span>` : ''}
      </div>
      <p class="manga-card__meta">${manga.author_pseudonym ? `Relato de ${manga.author_pseudonym}` : 'Autoria em preparo'} · ${manga.page_count} páginas</p>
    </div>
  </a>`;
}

export function homePage({ current, nextOne, featured, recent, magazines, settings, slots }) {
  return html`
<section class="hero">
  <div class="wrap">
    <p class="hero__kicker">Editora digital colaborativa</p>
    <h1 class="hero__title">Sua vida pode ser o <em>próximo capítulo</em>.</h1>
    <p class="hero__lead">${settings.signature} Toda semana, três comunidades contam histórias reais e três delas viram mangás originais, de graça, com crédito para quem contou.</p>
    <div class="hero__actions">
      <a class="btn btn--primary" href="/mangas">Ler os mangás</a>
      <a class="btn btn--ghost" href="/participar">Como participar</a>
    </div>
  </div>
</section>

${current ? html`
<section class="section section--paper">
  <div class="wrap">
    <div class="section__head">
      <div>
        <h2>Edição ${current.edition_number}</h2>
        <p>${current.theme}</p>
      </div>
      ${current.status === 'LIVE' ? html`<span class="tag tag--red">Desafio no ar</span>` : html`<span class="tag">Encerrado</span>`}
    </div>
    <div class="grid grid--3">
      ${slots.map((slot) => html`
        <div class="card">
          <div class="tag-row mb-0"><span class="tag tag--ink">${networkLabel(slot.network)}</span></div>
          ${slot.manga && slot.manga.status === 'PUBLISHED'
            ? html`<h3 style="margin-top:.7rem"><a href="/mangas/${slot.manga.slug}">${slot.manga.title}</a></h3>
                   <p class="muted mb-0">Relato de ${slot.selected?.author_pseudonym || 'autor anônimo'}</p>`
            : html`<h3 style="margin-top:.7rem">Vaga em preparo</h3>
                   <p class="muted mb-0">${slot.filled ? 'Relato escolhido; a obra está em produção editorial.' : 'Ainda recebendo relatos nesta rede.'}</p>`}
        </div>`)}
    </div>
  </div>
</section>` : ''}

<section class="section section--paper-2">
  <div class="wrap">
    <div class="section__head">
      <div><h2>Mangás da semana</h2><p>Histórias reais adaptadas e revisadas antes de publicar.</p></div>
      <a class="btn btn--sm" href="/mangas">Ver catálogo</a>
    </div>
    ${featured.length
      ? html`<div class="grid grid--3">${featured.map((m) => mangaCard(m, { coverUrl: m.coverUrl, featured: true }))}</div>`
      : html`<div class="empty-state"><h3>Ainda não há mangás publicados</h3><p class="mb-0">Assim que a primeira edição for publicada, as obras aparecem aqui.</p></div>`}
  </div>
</section>

${recent.length ? html`
<section class="section section--paper">
  <div class="wrap">
    <div class="section__head"><div><h2>Edições anteriores</h2><p>O acervo completo continua disponível para leitura.</p></div></div>
    <div class="grid grid--4">${recent.map((m) => mangaCard(m, { coverUrl: m.coverUrl }))}</div>
  </div>
</section>` : ''}

${magazines.length ? html`
<section class="section section--ink">
  <div class="wrap">
    <div class="section__head"><div><h2>Revistas</h2><p>As três obras da semana reunidas em uma edição só.</p></div>
    <a class="btn btn--sm btn--gold" href="/revistas">Ver todas</a></div>
    <div class="grid grid--3">
      ${magazines.map((mag) => html`
        <a class="card" href="/revistas/${mag.slug}" style="text-decoration:none;color:inherit">
          <span class="tag tag--gold">Edição ${mag.edition_number}</span>
          <h3 style="margin-top:.6rem">${mag.title}</h3>
          <p class="mb-0" style="color:var(--text-dim)">${mag.summary || 'Compilado semanal com as três histórias vencedoras.'}</p>
        </a>`)}
    </div>
  </div>
</section>` : ''}

<section class="section section--paper-2">
  <div class="wrap">
    <div class="split split--2">
      <div class="card card--hard">
        <h2>Próximo desafio</h2>
        ${nextOne
          ? html`<p class="lead">${nextOne.theme}</p>
                 <p class="muted">${nextOne.launch_at ? `Começa em ${fmtLongDate(nextOne.launch_at)}.` : 'Data a confirmar.'}</p>`
          : html`<p class="lead">O tema da próxima semana é anunciado às segundas nas três redes.</p>`}
        <a class="btn btn--primary" href="/participar">Quero participar</a>
      </div>
      <div class="card">
        <h3>Onde a história acontece</h3>
        <ul style="list-style:none;padding:0;display:grid;gap:.6rem">
          ${NETWORKS.map((n) => {
            const url = n.key === 'INSTAGRAM' ? settings.instagram_url : n.key === 'TIKTOK' ? settings.tiktok_url : settings.x_url;
            return html`<li><strong>${n.label}</strong>: ${n.comment}${url ? html` · <a href="${url}" rel="noopener me">abrir perfil</a>` : ''}</li>`;
          })}
        </ul>
        <p class="muted mb-0">Cada rede elege a sua história de forma independente. As curtidas de redes diferentes não são comparadas entre si.</p>
      </div>
    </div>
  </div>
</section>`;
}

export function catalogPage({ mangas, filters, genres, total }) {
  return html`
<section class="section section--paper">
  <div class="wrap">
    <div class="section__head">
      <div><h1>Catálogo</h1><p>${total === 1 ? '1 obra publicada.' : `${total} obras publicadas.`}</p></div>
    </div>

    <form class="card mb-2" method="get" action="/mangas" role="search">
      <div class="field-row">
        <label class="field"><span>Buscar</span>
          <input type="search" name="q" value="${filters.q || ''}" placeholder="Título ou sinopse" enterkeyhint="search" autocapitalize="none" autocorrect="off">
        </label>
        <label class="field"><span>Gênero</span>
          <select name="genero">
            <option value="">Todos</option>
            ${genres.map((g) => html`<option value="${g.key}"${raw(filters.genero === g.key ? ' selected' : '')}>${g.label}</option>`)}
          </select>
        </label>
        <label class="field"><span>Rede de origem</span>
          <select name="rede">
            <option value="">Todas</option>
            ${NETWORKS.map((n) => html`<option value="${n.key}"${raw(filters.rede === n.key ? ' selected' : '')}>${n.label}</option>`)}
          </select>
        </label>
        <label class="field"><span>Edição</span>
          <input type="number" name="edicao" min="1" value="${filters.edicao || ''}" placeholder="Nº">
        </label>
      </div>
      <div class="row">
        <button class="btn btn--primary" type="submit">Filtrar</button>
        <a class="btn btn--sm" href="/mangas">Limpar</a>
      </div>
    </form>

    ${mangas.length
      ? html`<div class="grid grid--3">${mangas.map((m) => mangaCard(m, { coverUrl: m.coverUrl }))}</div>`
      : html`<div class="empty-state"><h3>Nenhuma obra encontrada</h3><p class="mb-0">Ajuste os filtros ou volte ao <a href="/mangas">catálogo completo</a>.</p></div>`}
  </div>
</section>`;
}

export function mangaDetailPage({ manga, coverUrl, submission, challenge, magazine, pagesCount, transcript }) {
  const credits = mangaCredits(manga);
  return html`
<article class="section section--paper">
  <div class="wrap">
    <div class="split split--2">
      <div>
        <div class="tag-row mb-2">
          ${submission?.network ? html`<span class="tag tag--red">Vencedor no ${networkLabel(submission.network)}</span>` : ''}
          ${challenge ? html`<span class="tag">Edição ${challenge.edition_number}</span>` : ''}
          ${genreLabel(manga.genre) ? html`<span class="tag tag--gold">${genreLabel(manga.genre)}</span>` : ''}
          ${manga.is_demo ? html`<span class="tag tag--demo">Demonstração</span>` : ''}
        </div>
        <h1>${manga.title}</h1>
        <p class="lead">${manga.synopsis}</p>

        <div class="row mb-2">
          <a class="btn btn--primary" href="/mangas/${manga.slug}/ler">Ler agora</a>
          <button class="btn" type="button" data-share data-share-title="${manga.title}" data-share-url="/mangas/${manga.slug}">Compartilhar</button>
          ${magazine ? html`<a class="btn btn--sm" href="/revistas/${magazine.slug}">Ver na revista</a>` : ''}
        </div>

        <dl class="card">
          <div class="cost-line"><dt>Autoria do relato</dt><dd class="mb-0"><strong>${submission?.author_pseudonym || 'autor anônimo'}</strong></dd></div>
          <div class="cost-line"><dt>Rede vencedora</dt><dd class="mb-0">${submission ? networkLabel(submission.network) : 'não informada'}</dd></div>
          <div class="cost-line"><dt>Publicado em</dt><dd class="mb-0">${fmtLongDate(manga.published_at)}</dd></div>
          <div class="cost-line"><dt>Páginas</dt><dd class="mb-0">${pagesCount}</dd></div>
          <div class="cost-line"><dt>Adaptação</dt><dd class="mb-0">${credits.adaptacao || 'Adaptação editorial com apoio de IA.'}</dd></div>
        </dl>

        <div class="notice notice--info mt-2">
          <p class="mb-0">${manga.ai_disclosure}</p>
        </div>
      </div>

      <div>
        ${coverUrl ? html`<img src="${coverUrl}" alt="Capa de ${manga.title}" width="600" height="900" style="border:2px solid var(--ink)">` : ''}
      </div>
    </div>

    ${transcript ? html`
    <details class="card mt-2">
      <summary style="cursor:pointer;font-weight:700">Transcrição acessível dos diálogos</summary>
      <div class="mt-2" style="white-space:pre-wrap">${transcript}</div>
    </details>` : ''}
  </div>
</article>`;
}

export function readerPage({ manga, pages, coverPage, transcript, nextManga }) {
  return html`
<div class="reader" data-reader data-slug="${manga.slug}">
  <div class="reader__bar">
    <a class="btn btn--sm btn--ghost" href="/mangas/${manga.slug}">Voltar</a>
    <h1 class="reader__title">${manga.title}</h1>
    <span class="mono" data-page-label aria-live="polite">1 / ${pages.length}</span>
  </div>
  <div class="reader__progress" data-progress><span></span></div>

  <div class="row" style="padding:.6rem .8rem;gap:.4rem">
    <button class="btn btn--sm btn--ghost" type="button" data-mode-btn="vertical" aria-pressed="true">Rolagem</button>
    <button class="btn btn--sm btn--ghost" type="button" data-mode-btn="paged" aria-pressed="false">Página a página</button>
    <button class="btn btn--sm btn--ghost" type="button" data-share data-share-title="${manga.title}" data-share-url="/mangas/${manga.slug}">Compartilhar</button>
  </div>

  <div class="notice notice--ok hidden" data-resume hidden style="margin:.6rem .8rem">
    <p class="mb-0">Você parou no meio desta leitura. <button class="btn btn--sm" type="button" data-resume-go>Continuar de onde parei</button></p>
  </div>

  <div class="reader__stage">
    ${coverPage ? pageFigure(coverPage, 'Capa', { eager: true }) : ''}
    ${pages.map((p, i) => pageFigure(p, `Página ${p.page_number} de ${pages.length}`, { eager: i < 1 }))}
  </div>

  <details class="transcript">
    <summary>Transcrição acessível dos diálogos</summary>
    <div class="transcript__body" style="white-space:pre-wrap">${transcript}</div>
  </details>

  <div class="wrap" style="padding:2rem 1rem 6rem;color:#fff">
    <p>Fim do capítulo. ${nextManga ? html`Continue com <a href="/mangas/${nextManga.slug}" style="color:var(--gold)">${nextManga.title}</a>.` : html`Veja mais no <a href="/mangas" style="color:var(--gold)">catálogo</a>.`}</p>
  </div>

  <nav class="reader__nav" aria-label="Navegação de leitura">
    <button class="btn btn--sm" type="button" data-prev>← Anterior</button>
    <button class="btn btn--sm" type="button" data-next>Próxima →</button>
  </nav>
</div>`;
}

export function magazineListPage({ magazines }) {
  return html`
<section class="section section--paper">
  <div class="wrap">
    <div class="section__head"><div><h1>Revistas</h1><p>Uma edição por semana, com as três histórias vencedoras.</p></div></div>
    ${magazines.length
      ? html`<div class="grid grid--3">${magazines.map((m) => html`
          <a class="card card--hard" href="/revistas/${m.slug}" style="text-decoration:none;color:inherit">
            <span class="tag tag--gold">Edição ${m.edition_number}</span>
            <h3 style="margin-top:.6rem">${m.title}</h3>
            <p class="muted">${m.summary || 'Compilado semanal.'}</p>
            <p class="mb-0 muted">${fmtLongDate(m.published_at)}</p>
          </a>`)}</div>`
      : html`<div class="empty-state"><h3>Nenhuma revista publicada ainda</h3><p class="mb-0">A primeira edição sai no domingo seguinte ao primeiro desafio.</p></div>`}
  </div>
</section>`;
}

export function magazineDetailPage({ magazine, entries, coverUrl }) {
  return html`
<section class="section section--paper">
  <div class="wrap">
    <div class="split split--2">
      <div>
        <span class="tag tag--gold">Edição ${magazine.edition_number}</span>
        <h1 style="margin-top:.6rem">${magazine.title}</h1>
        ${magazine.summary ? paragraphs(magazine.summary) : ''}
        <p class="muted">Publicada em ${fmtLongDate(magazine.published_at)}.</p>
        <div class="row">
          <a class="btn btn--primary" href="/revistas/${magazine.slug}/ler">Ler a revista</a>
          <button class="btn" type="button" data-share data-share-title="${magazine.title}" data-share-url="/revistas/${magazine.slug}">Compartilhar</button>
        </div>
      </div>
      <div>${coverUrl ? html`<img src="${coverUrl}" alt="Capa da ${magazine.title}" style="border:2px solid var(--ink)">` : ''}</div>
    </div>

    <h2 class="mt-2">Sumário</h2>
    <ol class="stack" style="padding-left:1.1rem">
      ${entries.map((e) => html`<li>
        <strong><a href="/mangas/${e.slug}">${e.title}</a></strong>
        <div class="muted">${networkLabel(e.network)} · relato de ${e.author_pseudonym || 'autor anônimo'} · ${e.page_count} páginas</div>
      </li>`)}
    </ol>
    ${magazine.editorial_note ? html`<div class="notice notice--demo mt-2"><p class="mb-0">${magazine.editorial_note}</p></div>` : ''}
  </div>
</section>`;
}

export function magazineReaderPage({ magazine, blocks }) {
  const flat = blocks.flatMap((b) => b.pages);
  return html`
<div class="reader" data-reader data-slug="revista-${magazine.slug}">
  <div class="reader__bar">
    <a class="btn btn--sm btn--ghost" href="/revistas/${magazine.slug}">Voltar</a>
    <h1 class="reader__title">${magazine.title}</h1>
    <span class="mono" data-page-label aria-live="polite">1 / ${flat.length}</span>
  </div>
  <div class="reader__progress" data-progress><span></span></div>
  <div class="reader__stage">
    ${blocks.map((block) => html`
      ${block.cover ? pageFigure(block.cover, `${block.entry.title}, relato de ${block.entry.author_pseudonym || 'autor anônimo'} (${networkLabel(block.entry.network)})`) : ''}
      ${block.pages.map((p) => pageFigure(p, `${block.entry.title} · página ${p.page_number}`))}`)}
  </div>
  <nav class="reader__nav" aria-label="Navegação de leitura">
    <button class="btn btn--sm" type="button" data-prev>← Anterior</button>
    <button class="btn btn--sm" type="button" data-next>Próxima →</button>
  </nav>
</div>`;
}

export function participatePage({ settings, current, nextOne }) {
  return html`
<section class="hero">
  <div class="wrap">
    <p class="hero__kicker">Participar é de graça</p>
    <h1 class="hero__title">Conte sua história <em>nas redes</em>.</h1>
    <p class="hero__lead">Não existe cadastro aqui no site. Tudo acontece onde a comunidade já está: Instagram, TikTok e X.</p>
  </div>
</section>

<section class="section section--paper">
  <div class="wrap">
    ${current ? html`
    <div class="card card--hard mb-2">
      <span class="tag tag--red">Desafio da semana</span>
      <h2 style="margin-top:.6rem">${current.theme}</h2>
      <p class="muted mb-0">${current.close_at ? `A apuração encerra em ${fmtLongDate(current.close_at)}.` : 'O prazo de apuração é anunciado nas redes.'}</p>
    </div>` : ''}

    <div class="grid grid--3">
      ${NETWORKS.map((n) => {
        const url = n.key === 'INSTAGRAM' ? settings.instagram_url : n.key === 'TIKTOK' ? settings.tiktok_url : settings.x_url;
        const where = n.key === 'INSTAGRAM' ? (current?.instagram_url || url) : n.key === 'TIKTOK' ? (current?.tiktok_url || url) : (current?.x_url || url);
        return html`<div class="card">
          <span class="tag tag--ink">${n.label}</span>
          <h3 style="margin-top:.6rem">${n.comment}</h3>
          <p class="muted">As curtidas funcionam como votos. Cada rede escolhe a sua própria história vencedora.</p>
          ${where ? html`<a class="btn btn--sm btn--primary" href="${where}" rel="noopener">Ir para o post oficial</a>` : html`<p class="mb-0 muted">Link do post publicado na segunda-feira.</p>`}
        </div>`;
      })}
    </div>

    <h2 class="mt-2">Como funciona a semana</h2>
    <ol class="stack">
      <li><strong>Segunda.</strong> O desafio é lançado nas três redes, com o mesmo tema.</li>
      <li><strong>Terça a quinta.</strong> A comunidade conta histórias e curte as que merecem virar mangá.</li>
      <li><strong>Quinta.</strong> A apuração é encerrada no horário divulgado na edição.</li>
      <li><strong>Sexta.</strong> Confirmamos a elegibilidade e pedimos a autorização de quem escreveu.</li>
      <li><strong>Sábado.</strong> O mangá é produzido, revisado e enviado para aprovação do autor.</li>
      <li><strong>Domingo.</strong> Três mangás e a revista da semana são publicados aqui.</li>
    </ol>

    <div class="notice notice--demo mt-2">
      <h3>O essencial das regras</h3>
      <ul>
        <li>Participar é gratuito e sem compra. Não pedimos compartilhamento nem marcação de terceiros.</li>
        <li>Um participante ocupa no máximo uma vaga por semana.</li>
        <li>Curtidas artificiais, plágio e conteúdo inadequado desclassificam o relato.</li>
        <li>Sem a sua autorização, nada é publicado. Você escolhe o pseudônimo que aparece nos créditos.</li>
        <li>Em caso de empate, vale o comentário mais antigo quando o horário for verificável; caso contrário, a decisão editorial é registrada publicamente.</li>
      </ul>
      <p class="mb-0"><a href="/regras">Ler as regras completas</a></p>
    </div>

    ${nextOne ? html`<p class="mt-2 muted">Próximo tema anunciado: <strong>${nextOne.theme}</strong>.</p>` : ''}
  </div>
</section>`;
}

export function editorialPage({ title, lead, blocks }) {
  return html`
<section class="section section--paper">
  <div class="wrap-narrow">
    <h1>${title}</h1>
    ${lead ? html`<p class="lead">${lead}</p>` : ''}
    ${blocks.map((b) => html`<section class="mt-2"><h2>${b.heading}</h2>${paragraphs(b.body)}</section>`)}
  </div>
</section>`;
}

export function notFoundPage() {
  return html`
<section class="section section--paper">
  <div class="wrap-narrow text-center">
    <h1>Página não encontrada</h1>
    <p class="lead">Esse link não existe ou a obra ainda não foi publicada.</p>
    <a class="btn btn--primary" href="/">Voltar para o início</a>
  </div>
</section>`;
}

export function errorPage({ message }) {
  return html`
<section class="section section--paper">
  <div class="wrap-narrow text-center">
    <h1>Algo deu errado</h1>
    <p class="lead">${message}</p>
    <a class="btn btn--primary" href="/">Voltar para o início</a>
  </div>
</section>`;
}
