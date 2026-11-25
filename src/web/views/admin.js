import { html, raw, jsonScript } from '../../core/html.js';
import { fmtDateTime, utcToEditorialLocal, EDITORIAL_TZ } from '../../core/dates.js';
import {
  ART_STYLES, CHALLENGE_STATUSES, COLOR_MODES, FIDELITY_LEVELS, FORMATS, GENRES,
  HUMOR_LEVELS, MAGAZINE_STATUSES, MANGA_STATUSES, NARRATIVE_TONES, NETWORKS,
  PANEL_DENSITIES, QUALITY_MODES, SUBMISSION_STATUSES, VISUAL_TONES, label, networkLabel,
} from '../../domain/catalog.js';
import { formatUsd } from '../../domain/costs.js';
import { assetUrl } from '../../core/assets.js';
import { pageLayers } from '../../domain/compose.js';

/* ----------------------------- componentes ------------------------------ */

/** Miniatura de página: arte em <img> e balões por cima. */
export function thumb(page) {
  const c = pageLayers(page);
  return html`<span class="page-layers" style="display:block">
    ${c.imageUrl ? html`<img src="${c.imageUrl}" alt="${c.alt}" loading="lazy" decoding="async">` : ''}
    ${raw(c.overlay)}
  </span>`;
}

/** Prévia grande usada no editor de balões. */
export function pageStage(page) {
  const c = pageLayers(page);
  return html`<div class="page-layers">
    ${c.imageUrl ? html`<img src="${c.imageUrl}" alt="${c.alt}">` : ''}
    ${raw(c.overlay)}
  </div>`;
}

export function statusChip(map, key) {
  const def = map[key] || { label: key, cls: 'neutral' };
  return html`<span class="status status--${def.cls}">${def.label}</span>`;
}
export const mangaStatus = (k) => statusChip(MANGA_STATUSES, k);
export const submissionStatus = (k) => statusChip(SUBMISSION_STATUSES, k);
export const challengeStatus = (k) => statusChip(CHALLENGE_STATUSES, k);
export const magazineStatus = (k) => statusChip(MAGAZINE_STATUSES, k);

export function csrfField(ctx) {
  return html`<input type="hidden" name="_csrf" value="${ctx.csrf || ''}">`;
}

export function selectField({ name, label: lbl, options, value, hint = '', required = false, id = null }) {
  return html`<label class="field"${raw(id ? ` for="${id}"` : '')}>
    <span>${lbl}</span>
    <select name="${name}"${raw(id ? ` id="${id}"` : '')}${raw(required ? ' required' : '')}>
      ${options.map((o) => html`<option value="${o.key}"${raw(String(value) === String(o.key) ? ' selected' : '')}>${o.label}</option>`)}
    </select>
    ${hint ? html`<small>${hint}</small>` : ''}
  </label>`;
}

export function textField({ name, label: lbl, value = '', type = 'text', hint = '', required = false, placeholder = '', id = null, attrs = '' }) {
  return html`<label class="field">
    <span>${lbl}</span>
    <input type="${type}" name="${name}" value="${value ?? ''}" placeholder="${placeholder}"${raw(id ? ` id="${id}"` : '')}${raw(required ? ' required' : '')}${raw(attrs)}>
    ${hint ? html`<small>${hint}</small>` : ''}
  </label>`;
}

export function textArea({ name, label: lbl, value = '', hint = '', rows = 5, required = false, id = null }) {
  return html`<label class="field">
    <span>${lbl}</span>
    <textarea name="${name}" rows="${rows}"${raw(id ? ` id="${id}"` : '')}${raw(required ? ' required' : '')}>${value ?? ''}</textarea>
    ${hint ? html`<small>${hint}</small>` : ''}
  </label>`;
}

export function checkField({ name, label: lbl, checked = false, hint = '' }) {
  return html`<label class="check">
    <input type="checkbox" name="${name}" value="1"${raw(checked ? ' checked' : '')}>
    <span>${lbl}${hint ? html`<br><small class="muted">${hint}</small>` : ''}</span>
  </label>`;
}

export function dateField({ name, label: lbl, value = '', hint = '' }) {
  return html`<label class="field">
    <span>${lbl}</span>
    <input type="datetime-local" name="${name}" value="${utcToEditorialLocal(value)}">
    <small>${hint || `Horário de ${EDITORIAL_TZ}.`}</small>
  </label>`;
}

export function emptyState(title, body, action = null) {
  return html`<div class="empty-state"><h3>${title}</h3><p>${body}</p>${action || ''}</div>`;
}

export function costPanel(estimate, { title = 'Estimativa de custo' } = {}) {
  return html`<div class="panel">
    <div class="panel__head"><h3>${title}</h3><span class="tag${raw(estimate.aiMode === 'live' ? ' tag--red' : ' tag--demo')}">${estimate.aiMode === 'live' ? 'Chamadas reais' : 'Modo demonstração'}</span></div>
    <div class="panel__body">
      <div class="cost-line"><span>Chamadas de texto</span><span class="mono">${estimate.calls.text}</span></div>
      <div class="cost-line"><span>Chamadas de imagem (${estimate.pages} página(s)${estimate.includeCover ? ' + capa' : ''}${estimate.characterRefs ? ` + ${estimate.characterRefs} referência(s)` : ''})</span><span class="mono">${estimate.calls.image}</span></div>
      <div class="cost-line"><span>Qualidade de imagem</span><span class="mono">${estimate.imageQuality}</span></div>
      <div class="cost-line"><span>Custo de texto</span><span class="mono${raw(estimate.textCostUsd === null ? ' cost-unknown' : '')}">${formatUsd(estimate.textCostUsd)}</span></div>
      <div class="cost-line"><span>Custo de imagem</span><span class="mono${raw(estimate.imageCostUsd === null ? ' cost-unknown' : '')}">${formatUsd(estimate.imageCostUsd)}</span></div>
      <div class="cost-line"><span>Total estimado</span><span class="mono${raw(estimate.totalUsd === null ? ' cost-unknown' : '')}">${formatUsd(estimate.totalUsd)}</span></div>
      ${estimate.aiMode === 'demo'
        ? html`<p class="muted mt-2 mb-0">Em modo demonstração nenhuma chamada paga é feita: as páginas são desenhadas localmente e identificadas como demonstração.</p>`
        : estimate.known
          ? html`<p class="muted mt-2 mb-0">Tarifas configuradas em ${estimate.priceUpdatedAt || 'data não informada'}. Estimativa, não cobrança.</p>`
          : html`<div class="notice notice--warn mt-2"><p class="mb-0"><strong>Custo não verificável.</strong> ${estimate.unknownReasons.join(' ')}</p></div>`}
    </div>
  </div>`;
}

/* ------------------------------- dashboard ------------------------------ */

export function dashboardView({ challenge, slots, stats, queue, reviewQueue, scheduled, failures, spend, aiStatus, recentAudit }) {
  return html`
${aiStatus.mode === 'demo' ? html`<div class="notice notice--demo mb-2">
  <h3>Modo demonstração ativo</h3>
  <p>Nenhuma chamada paga é feita. As páginas são desenhadas localmente e marcadas como demonstração no site.</p>
  <p class="mb-0"><strong>Para ativar a produção:</strong> ${aiStatus.blockers.join(' · ')}.</p>
</div>` : html`<div class="notice notice--warn mb-2"><p class="mb-0"><strong>Modo produção ativo.</strong> Gerações consomem crédito real na conta configurada.</p></div>`}

<div class="stat-grid mb-2">
  <div class="stat"><div class="stat__label">Edição atual</div><div class="stat__value">${challenge ? challenge.edition_number : 'não informado'}</div><div class="stat__note">${challenge ? challenge.theme.slice(0, 60) : 'Nenhuma edição cadastrada'}</div></div>
  <div class="stat"><div class="stat__label">Vagas preenchidas</div><div class="stat__value">${slots.filter((s) => s.filled).length}/3</div><div class="stat__note">uma por rede</div></div>
  <div class="stat"><div class="stat__label">Na fila de produção</div><div class="stat__value">${queue.length}</div><div class="stat__note">tarefas ativas</div></div>
  <div class="stat"><div class="stat__label">Aguardando revisão</div><div class="stat__value">${reviewQueue.length}</div><div class="stat__note">obras</div></div>
  <div class="stat"><div class="stat__label">Publicações agendadas</div><div class="stat__value">${scheduled.length}</div><div class="stat__note">obras e revistas</div></div>
  <div class="stat"><div class="stat__label">Publicadas</div><div class="stat__value">${stats.published}</div><div class="stat__note">no site</div></div>
</div>

<div class="split split--2">
  <div class="panel">
    <div class="panel__head"><h2>Vagas da edição ${challenge?.edition_number ?? 'não informado'}</h2>
      ${challenge ? html`<a class="btn btn--sm" href="/admin/desafios/${challenge.id}">Editar edição</a>` : ''}</div>
    <div class="panel__body">
      ${challenge ? html`<div class="grid grid--3">
        ${slots.map((slot) => html`<div class="card">
          <div class="row row--between"><span class="tag tag--ink">${networkLabel(slot.network)}</span>
            ${slot.filled ? submissionStatus(slot.selected.status) : html`<span class="status status--neutral">Vaga aberta</span>`}</div>
          ${slot.filled ? html`
            <p class="mt-2 mb-0"><strong>${slot.selected.author_pseudonym || 'sem pseudônimo'}</strong></p>
            <p class="muted" style="font-size:.85rem">${String(slot.selected.comment_text).slice(0, 110)}…</p>
            <p class="mb-0">${slot.consentOk ? html`<span class="status status--ok">Autorizado</span>` : html`<span class="status status--danger">Sem autorização</span>`}</p>
            ${slot.manga ? html`<p class="mt-2 mb-0">${mangaStatus(slot.manga.status)} <a class="btn btn--sm" href="/admin/estudio/${slot.manga.id}">Abrir no estúdio</a></p>`
              : html`<p class="mt-2 mb-0"><a class="btn btn--sm btn--primary" href="/admin/relatos/${slot.selected.id}">Preparar obra</a></p>`}`
            : html`<p class="muted mt-2 mb-0">Nenhum relato selecionado.${slot.nextEligible ? ' Há candidato elegível aguardando.' : ''}</p>
                   <a class="btn btn--sm" href="/admin/relatos/novo?edicao=${challenge.id}&rede=${slot.network}">Registrar relato</a>`}
        </div>`)}
      </div>` : emptyState('Nenhuma edição cadastrada', 'Crie o primeiro desafio para começar a semana editorial.', html`<a class="btn btn--primary" href="/admin/desafios/novo">Criar desafio</a>`)}
    </div>
  </div>

  <div class="flow">
    <div class="panel">
      <div class="panel__head"><h3>Custos</h3><a class="btn btn--sm" href="/admin/custos">Detalhar</a></div>
      <div class="panel__body">
        <div class="cost-line"><span>Mês corrente (real/estimado)</span><span class="mono">${formatUsd(spend.month.totalUsd)}</span></div>
        <div class="cost-line"><span>Registros sem custo verificável</span><span class="mono${raw(spend.month.unknownEntries ? ' cost-unknown' : '')}">${spend.month.unknownEntries}</span></div>
        <div class="cost-line"><span>Teto mensal</span><span class="mono">${spend.monthlyBudget === null ? 'não definido' : formatUsd(spend.monthlyBudget)}</span></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><h3>Falhas recentes</h3></div>
      <div class="panel__body">
        ${failures.length ? html`<ul class="timeline">${failures.map((f) => html`<li><time>${fmtDateTime(f.updated_at)}</time><span>${f.type}: ${f.error_message || 'erro'} ${f.manga_id ? html`<a href="/admin/estudio/${f.manga_id}">abrir</a>` : ''}</span></li>`)}</ul>`
          : html`<p class="muted mb-0">Nenhuma falha registrada.</p>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><h3>Atividade recente</h3></div>
      <div class="panel__body">
        ${recentAudit.length ? html`<ul class="timeline">${recentAudit.map((a) => html`<li><time>${fmtDateTime(a.created_at)}</time><span><strong>${a.actor}</strong> · ${a.summary || a.action}</span></li>`)}</ul>`
          : html`<p class="muted mb-0">Sem atividade ainda.</p>`}
      </div>
    </div>
  </div>
</div>

${reviewQueue.length ? html`
<div class="panel mt-2">
  <div class="panel__head"><h2>Fila de revisão</h2><a class="btn btn--sm" href="/admin/revisao">Abrir revisão</a></div>
  <div class="panel__body">
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Obra</th><th>Rede</th><th>Status</th><th>Páginas</th><th></th></tr></thead>
      <tbody>${reviewQueue.map((m) => html`<tr>
        <td><strong>${m.title}</strong></td><td>${m.network ? networkLabel(m.network) : 'não informado'}</td>
        <td>${mangaStatus(m.status)}</td><td class="mono">${m.page_count}</td>
        <td><a class="btn btn--sm" href="/admin/revisao/${m.id}">Revisar</a></td></tr>`)}</tbody>
    </table></div>
  </div>
</div>` : ''}`;
}

/* ------------------------------- desafios ------------------------------- */

export function challengeListView({ challenges }) {
  return html`
<div class="toolbar"><a class="btn btn--primary" href="/admin/desafios/novo">Novo desafio</a></div>
${challenges.length ? html`<div class="table-wrap"><table class="data">
  <thead><tr><th>Edição</th><th>Tema</th><th>Status</th><th>Lançamento</th><th>Apuração</th><th>Publicação</th><th></th></tr></thead>
  <tbody>${challenges.map((c) => html`<tr>
    <td class="mono">${c.edition_number}</td>
    <td>${c.theme}${c.allows_fiction ? html` <span class="tag">ficção permitida</span>` : ''}</td>
    <td>${challengeStatus(c.status)}</td>
    <td>${fmtDateTime(c.launch_at)}</td>
    <td>${fmtDateTime(c.close_at)}</td>
    <td>${fmtDateTime(c.publish_at)}</td>
    <td><a class="btn btn--sm" href="/admin/desafios/${c.id}">Abrir</a></td>
  </tr>`)}</tbody>
</table></div>` : emptyState('Nenhum desafio', 'O desafio define o tema da semana nas três redes.', html`<a class="btn btn--primary" href="/admin/desafios/novo">Criar o primeiro</a>`)}`;
}

export function challengeFormView({ ctx, challenge, slots, suggestedEdition, presets }) {
  const c = challenge || {};
  return html`
<form method="post" action="${challenge ? `/admin/desafios/${challenge.id}` : '/admin/desafios'}" class="split split--2">
  ${csrfField(ctx)}
  <div class="panel">
    <div class="panel__head"><h2>${challenge ? `Edição ${challenge.edition_number}` : 'Novo desafio'}</h2></div>
    <div class="panel__body">
      <div class="field-row">
        ${textField({ name: 'edition_number', label: 'Número da edição', value: c.edition_number ?? suggestedEdition, type: 'number', required: true, attrs: ' min="1" inputmode="numeric"' })}
        ${selectField({ name: 'status', label: 'Status', value: c.status || 'DRAFT', options: Object.entries(CHALLENGE_STATUSES).map(([key, v]) => ({ key, label: v.label })) })}
      </div>
      ${textArea({ name: 'theme', label: 'Tema da semana', value: c.theme || '', rows: 2, required: true, hint: 'O mesmo tema vai para Instagram, TikTok e X.' })}
      <details class="mb-2"><summary style="cursor:pointer">Usar um dos 10 temas sugeridos</summary>
        <ul style="padding-left:1.1rem">${presets.map((p) => html`<li>${p.text}</li>`)}</ul>
      </details>
      ${checkField({ name: 'allows_fiction', label: 'Este desafio aceita histórias fictícias', checked: !!c.allows_fiction, hint: 'Use apenas em desafios tipo Isekai. A obra será identificada como ficção.' })}
      <div class="field-row">
        ${dateField({ name: 'launch_at', label: 'Lançamento (segunda)', value: c.launch_at })}
        ${dateField({ name: 'close_at', label: 'Encerramento da apuração (quinta)', value: c.close_at })}
        ${dateField({ name: 'publish_at', label: 'Publicação (domingo)', value: c.publish_at })}
      </div>
      <fieldset><legend>Links oficiais dos posts</legend>
        ${textField({ name: 'instagram_url', label: 'Post do Instagram', value: c.instagram_url || '', type: 'url' })}
        ${textField({ name: 'tiktok_url', label: 'Vídeo do TikTok', value: c.tiktok_url || '', type: 'url' })}
        ${textField({ name: 'x_url', label: 'Post do X', value: c.x_url || '', type: 'url' })}
        ${textField({ name: 'rules_url', label: 'Link das regras', value: c.rules_url || '', type: 'url' })}
      </fieldset>
      ${textArea({ name: 'editorial_note', label: 'Nota editorial', value: c.editorial_note || '', rows: 3, hint: 'Registrada no histórico: adiamentos, exceções, decisões de desempate.' })}
      <div class="row">
        <button class="btn btn--primary" type="submit">Salvar</button>
        <a class="btn" href="/admin/desafios">Voltar</a>
      </div>
    </div>
  </div>

  <div class="flow">
    ${challenge ? html`<div class="panel">
      <div class="panel__head"><h3>Vagas</h3></div>
      <div class="panel__body">
        ${slots.map((s) => html`<div class="cost-line">
          <span>${networkLabel(s.network)}</span>
          <span>${s.filled ? html`${s.selected.author_pseudonym || 'sem pseudônimo'} ${s.consentOk ? html`<span class="status status--ok">ok</span>` : html`<span class="status status--danger">sem autorização</span>`}` : html`<span class="muted">vaga aberta</span>`}</span>
        </div>`)}
        <p class="mt-2 mb-0"><a class="btn btn--sm" href="/admin/relatos?edicao=${challenge.id}">Gerenciar relatos</a></p>
      </div>
    </div>
    <div class="panel">
      <div class="panel__head"><h3>Gerar comunicação</h3></div>
      <div class="panel__body">
        <p class="muted">Roteiro de vídeo e copy do X com o tema desta edição.</p>
        <a class="btn btn--sm btn--primary" href="/admin/roteiros-sociais?edicao=${challenge.id}">Abrir gerador</a>
        <a class="btn btn--sm" href="/admin/biblioteca?cards=${challenge.id}">Exportar cards</a>
      </div>
    </div>` : html`<div class="notice notice--info"><p class="mb-0">Depois de salvar, você poderá registrar os relatos vencedores de cada rede e gerar os roteiros de divulgação.</p></div>`}
  </div>
</form>`;
}

/* --------------------------- roteiros sociais --------------------------- */

export function socialView({ ctx, built, xCopy, presets, wpmOptions, selectedWpm, theme, history, challenges, challengeId }) {
  return html`
<div class="split split--2">
  <div class="flow">
    <form class="panel" method="get" action="/admin/roteiros-sociais">
      <div class="panel__head"><h2>Tema da semana</h2></div>
      <div class="panel__body">
        ${selectField({ name: 'edicao', label: 'Vincular a uma edição (opcional)', value: challengeId || '', options: [{ key: '', label: 'sem vínculo' }, ...challenges.map((c) => ({ key: c.id, label: `Edição ${c.edition_number}: ${c.theme.slice(0, 40)}` }))] })}
        ${selectField({ name: 'preset', label: 'Tema sugerido', value: '', options: [{ key: '', label: 'tema personalizado' }, ...presets.map((p) => ({ key: p.key, label: p.text }))] })}
        ${textArea({ name: 'tema', label: 'Tema personalizado', value: theme, rows: 2, hint: 'Se preenchido, substitui o tema sugerido. Só este trecho muda no roteiro.' })}
        ${selectField({ name: 'wpm', label: 'Velocidade de leitura', value: String(selectedWpm), options: wpmOptions.map((w) => ({ key: String(w), label: `${w} palavras por minuto` })), id: 'wpm' })}
        <button class="btn btn--primary" type="submit">Gerar roteiro</button>
      </div>
    </form>

    ${built ? html`<div class="panel">
      <div class="panel__head">
        <h3>Roteiro para Instagram e TikTok</h3>
        <span class="counter" data-duration-out>${built.words} palavras · ${built.durationSec.toFixed(1)}s</span>
      </div>
      <div class="panel__body">
        <div class="notice notice--warn mb-2" data-duration-warning${raw(built.overSixty ? '' : ' hidden')}>
          <p class="mb-0">Acima de 60 segundos: considere cortar o tema ou aumentar a velocidade de leitura.</p>
        </div>
        <div class="copybox">
          <pre data-script-box id="roteiro">${built.text}</pre>
        </div>
        <div class="row mt-2">
          <button class="btn btn--primary" type="button" data-copy="#roteiro">Copiar roteiro</button>
          <form method="post" action="/admin/roteiros-sociais" style="display:inline">
            ${csrfField(ctx)}
            <input type="hidden" name="tema" value="${built.theme}">
            <input type="hidden" name="wpm" value="${built.wpm}">
            <input type="hidden" name="edicao" value="${challengeId || ''}">
            <input type="hidden" name="x_copy" value="${xCopy?.text || ''}">
            <button class="btn" type="submit">Salvar no histórico</button>
          </form>
        </div>
        <p class="muted mt-2 mb-0">A copy é reproduzida literalmente; apenas o tema muda. A duração é estimada por palavras ÷ velocidade × 60. Pausas e entonação alteram a duração real. Voz, trilha, introdução e encerramento devem permanecer constantes entre os vídeos.</p>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><h3>Copy para o X</h3><span class="counter${raw(xCopy.overLimit ? ' counter--warn' : '')}">${xCopy.chars} / ${xCopy.limit}</span></div>
      <div class="panel__body">
        <label class="field"><span>Texto editável</span>
          <textarea id="xcopy" rows="5">${xCopy.text}</textarea>
        </label>
        <span class="counter" data-counter-for="xcopy" data-counter-max="280"></span>
        <div class="row mt-2"><button class="btn btn--primary" type="button" data-copy="#xcopy">Copiar copy do X</button></div>
      </div>
    </div>` : emptyState('Escolha um tema', 'Selecione um dos dez temas sugeridos ou escreva um personalizado para gerar o roteiro.')}
  </div>

  <div class="panel">
    <div class="panel__head"><h3>Histórico</h3></div>
    <div class="panel__body">
      ${history.length ? html`<ul class="timeline">${history.map((h) => html`<li>
        <time>${fmtDateTime(h.created_at)}</time>
        <span><strong>${h.theme}</strong><br><span class="muted">${h.word_count} palavras · ${Number(h.duration_sec).toFixed(1)}s a ${h.wpm} ppm</span></span>
      </li>`)}</ul>` : html`<p class="muted mb-0">Nenhum roteiro salvo ainda.</p>`}
    </div>
  </div>
</div>`;
}

/* -------------------------------- relatos ------------------------------- */

export function submissionListView({ submissions, challenges, filters }) {
  return html`
<form class="toolbar" method="get" action="/admin/relatos">
  ${selectField({ name: 'edicao', label: 'Edição', value: filters.edicao || '', options: [{ key: '', label: 'Todas' }, ...challenges.map((c) => ({ key: c.id, label: `Edição ${c.edition_number}` }))] })}
  ${selectField({ name: 'rede', label: 'Rede', value: filters.rede || '', options: [{ key: '', label: 'Todas' }, ...NETWORKS.map((n) => ({ key: n.key, label: n.label }))] })}
  <button class="btn" type="submit">Filtrar</button>
  <a class="btn btn--primary" href="/admin/relatos/novo">Registrar relato</a>
</form>

${submissions.length ? html`<div class="table-wrap"><table class="data">
  <thead><tr><th>Rede</th><th>Pseudônimo</th><th>Relato</th><th>Votos</th><th>Autorização</th><th>Status</th><th></th></tr></thead>
  <tbody>${submissions.map((s) => html`<tr>
    <td>${networkLabel(s.network)}<br><span class="muted">#${s.rank}</span></td>
    <td>${s.author_pseudonym || html`<span class="muted">não informado</span>`}</td>
    <td style="max-width:28rem">${String(s.comment_text).slice(0, 140)}${raw(s.comment_text.length > 140 ? '…' : '')}</td>
    <td class="mono">${s.votes ?? 'não informado'}</td>
    <td>${s.consent_status === 'GRANTED' ? html`<span class="status status--ok">Autorizado</span>` : s.consent_status === 'DENIED' ? html`<span class="status status--danger">Negado</span>` : html`<span class="status status--neutral">Pendente</span>`}</td>
    <td>${submissionStatus(s.status)}</td>
    <td><a class="btn btn--sm" href="/admin/relatos/${s.id}">Abrir</a></td>
  </tr>`)}</tbody>
</table></div>` : emptyState('Nenhum relato registrado', 'Registre manualmente o comentário vencedor de cada rede após a apuração.')}`;
}

export function submissionFormView({ ctx, submission, challenges, screen, eligibility, manga, defaults = {} }) {
  const s = submission || defaults;
  const isNew = !submission;
  return html`
<div class="split split--2">
  <form method="post" action="${isNew ? '/admin/relatos' : `/admin/relatos/${submission.id}`}" class="panel">
    ${csrfField(ctx)}
    <div class="panel__head"><h2>${isNew ? 'Registrar relato vencedor' : 'Editar relato'}</h2>${!isNew ? submissionStatus(submission.status) : ''}</div>
    <div class="panel__body">
      <div class="field-row">
        ${selectField({ name: 'challenge_id', label: 'Edição', value: s.challenge_id || '', required: true, options: challenges.map((c) => ({ key: c.id, label: `Edição ${c.edition_number}: ${c.theme.slice(0, 40)}` })) })}
        ${selectField({ name: 'network', label: 'Rede', value: s.network || 'INSTAGRAM', required: true, options: NETWORKS.map((n) => ({ key: n.key, label: n.label })) })}
        ${textField({ name: 'rank', label: 'Posição na apuração', value: s.rank ?? 1, type: 'number', attrs: ' min="1"', hint: '1 = mais curtido. Use 2, 3… para os próximos elegíveis.' })}
      </div>

      ${textArea({ name: 'comment_text', label: 'Comentário original', value: s.comment_text || '', rows: 6, required: true, hint: 'Cole o texto exatamente como publicado. Ele é tratado como dado, nunca como instrução para a IA.' })}

      <div class="field-row">
        ${textField({ name: 'source_url', label: 'URL de origem', value: s.source_url || '', type: 'url', hint: 'Link do comentário. Nunca é baixado automaticamente.' })}
        ${textField({ name: 'votes', label: 'Curtidas na apuração', value: s.votes ?? '', type: 'number', attrs: ' min="0" inputmode="numeric"' })}
      </div>
      <div class="field-row">
        ${dateField({ name: 'counted_at', label: 'Data/hora da apuração', value: s.counted_at })}
        ${dateField({ name: 'comment_posted_at', label: 'Data/hora do comentário', value: s.comment_posted_at, hint: 'Usada no desempate quando verificável.' })}
      </div>

      <fieldset><legend>Autoria e autorização</legend>
        ${textField({ name: 'author_pseudonym', label: 'Pseudônimo autorizado', value: s.author_pseudonym || '', hint: 'Nome que aparece nos créditos. Evite nome real.' })}
        ${textField({ name: 'author_handle', label: 'Perfil público para contato', value: s.author_handle || '', hint: 'Apenas o @ público. Não registre telefone, e-mail ou endereço.' })}
        ${selectField({ name: 'consent_status', label: 'Autorização', value: s.consent_status || 'PENDING', options: [{ key: 'PENDING', label: 'Pendente' }, { key: 'GRANTED', label: 'Concedida' }, { key: 'DENIED', label: 'Negada' }] })}
        ${textField({ name: 'consent_evidence', label: 'Evidência da autorização', value: s.consent_evidence || '', hint: 'Ex.: "print do DM de 21/11". Não cole dados pessoais.' })}
        ${checkField({ name: 'is_minor', label: 'Participante é menor de idade', checked: !!s.is_minor })}
        ${checkField({ name: 'guardian_consent', label: 'Autorização do responsável registrada', checked: !!s.guardian_consent })}
      </fieldset>

      <fieldset><legend>Direção editorial</legend>
        ${textArea({ name: 'expanded_story', label: 'Relato ampliado (opcional)', value: s.expanded_story || '', rows: 4, hint: 'Detalhes enviados pelo autor depois do contato.' })}
        <div class="field-row">
          ${selectField({ name: 'genre', label: 'Gênero', value: s.genre || 'COMEDIA', options: GENRES })}
          ${selectField({ name: 'art_style', label: 'Estilo de arte', value: s.art_style || 'CLASSICO_PB', options: ART_STYLES.map((a) => ({ key: a.key, label: a.label })) })}
        </div>
        <div class="field-row">
          ${selectField({ name: 'narrative_tone', label: 'Tom do roteiro', value: s.narrative_tone || 'HUMOR_COTIDIANO', options: NARRATIVE_TONES })}
          ${selectField({ name: 'visual_tone', label: 'Tom visual', value: s.visual_tone || 'EXPRESSIVO', options: VISUAL_TONES })}
        </div>
        ${checkField({ name: 'is_fiction', label: 'História declarada como ficção', checked: !!s.is_fiction, hint: 'Só é aceita em desafios que permitem ficção.' })}
        ${textArea({ name: 'editorial_notes', label: 'Observações editoriais', value: s.editorial_notes || '', rows: 3 })}
      </fieldset>

      <div class="row">
        <button class="btn btn--primary" type="submit">Salvar relato</button>
        <a class="btn" href="/admin/relatos">Voltar</a>
      </div>
    </div>
  </form>

  <div class="flow">
    ${screen ? html`<div class="panel">
      <div class="panel__head"><h3>Triagem de conteúdo</h3></div>
      <div class="panel__body">
        ${screen.blocked.length ? html`<div class="notice notice--warn"><p><strong>Bloqueado para geração:</strong></p><ul>${screen.blocked.map((b) => html`<li>${b.label}</li>`)}</ul><p class="mb-0">Decida editorialmente: desclassificar ou tratar o texto antes de produzir.</p></div>` : html`<p class="mb-2"><span class="status status--ok">Sem bloqueios</span></p>`}
        ${screen.identifiers.length ? html`<p class="mb-1"><strong>Identificadores detectados</strong> (removidos antes de enviar à IA):</p><div class="pill-row">${screen.identifiers.map((i) => html`<span class="tag">${i.label} ×${i.count}</span>`)}</div>` : html`<p class="muted mb-0">Nenhum identificador pessoal detectado.</p>`}
        ${screen.injectionSuspected ? html`<div class="notice notice--warn mt-2"><p class="mb-0">O texto contém frases que parecem instruções. Ele será enviado como dado delimitado e as instruções serão ignoradas.</p></div>` : ''}
      </div>
    </div>` : ''}

    ${submission ? html`<div class="panel">
      <div class="panel__head"><h3>Vaga e produção</h3></div>
      <div class="panel__body">
        ${eligibility.length ? html`<div class="notice notice--warn"><p class="mb-1"><strong>Pendências para ocupar a vaga:</strong></p><ul class="mb-0">${eligibility.map((p) => html`<li>${p}</li>`)}</ul></div>`
          : html`<p><span class="status status--ok">Pronto para ocupar a vaga</span></p>`}

        ${submission.status !== 'SELECTED' ? html`
          <form method="post" action="/admin/relatos/${submission.id}/selecionar" data-confirm="Confirmar este relato como vencedor da vaga?">
            ${csrfField(ctx)}
            <button class="btn btn--primary btn--block"${raw(eligibility.length ? ' disabled' : '')} type="submit">Definir como vencedor da vaga</button>
          </form>` : html`
          <p><span class="status status--ok">Vaga ocupada</span></p>
          ${manga ? html`<p>${mangaStatus(manga.status)} <a class="btn btn--sm" href="/admin/estudio/${manga.id}">Abrir no estúdio</a></p>`
            : html`<form method="post" action="/admin/relatos/${submission.id}/criar-obra">${csrfField(ctx)}
                <button class="btn btn--primary btn--block" type="submit">Criar obra no estúdio</button></form>`}`}

        <hr class="ink-rule mt-2 mb-2">
        <form method="post" action="/admin/relatos/${submission.id}/liberar" data-confirm="Liberar a vaga e registrar o motivo?">
          ${csrfField(ctx)}
          ${selectField({ name: 'status', label: 'Liberar vaga como', value: 'NO_RESPONSE', options: [
            { key: 'NO_RESPONSE', label: 'Sem resposta do autor' },
            { key: 'WITHDRAWN', label: 'Autorização negada' },
            { key: 'DISQUALIFIED', label: 'Desclassificado' },
          ] })}
          ${textField({ name: 'reason', label: 'Motivo (registrado no histórico)', value: '', required: true })}
          <button class="btn btn--danger btn--block" type="submit">Liberar vaga e indicar próximo elegível</button>
        </form>
      </div>
    </div>` : ''}
  </div>
</div>`;
}

/* -------------------------------- estúdio ------------------------------- */

export function studioListView({ mangas }) {
  return html`
${mangas.length ? html`<div class="table-wrap"><table class="data">
  <thead><tr><th>Obra</th><th>Edição</th><th>Rede</th><th>Status</th><th>Páginas</th><th>Modo</th><th></th></tr></thead>
  <tbody>${mangas.map((m) => html`<tr>
    <td><strong>${m.title}</strong><br><span class="muted">${m.author_pseudonym || 'não informado'}</span></td>
    <td class="mono">${m.edition_number ?? 'não informado'}</td>
    <td>${m.network ? networkLabel(m.network) : 'não informado'}</td>
    <td>${mangaStatus(m.status)}</td>
    <td class="mono">${m.page_count}</td>
    <td>${label(QUALITY_MODES, m.quality_mode)}</td>
    <td><a class="btn btn--sm" href="/admin/estudio/${m.id}">Abrir</a></td>
  </tr>`)}</tbody>
</table></div>` : emptyState('Nenhuma obra em produção', 'Selecione um relato vencedor e crie a obra para começar.')}`;
}

function styleCards(selected) {
  return html`<div class="style-grid">
    ${ART_STYLES.map((s) => html`<label class="style-card">
      <input type="radio" name="art_style" value="${s.key}"${raw(selected === s.key ? ' checked' : '')}>
      <span class="style-card__inner">
        <img src="/estatico/estilos/${s.key.toLowerCase()}.svg" alt="Amostra do estilo ${s.label}" loading="lazy" width="200" height="150">
        <span class="style-card__text"><strong>${s.label}</strong><span>${s.desc}</span></span>
      </span>
    </label>`)}
  </div>`;
}

export function studioView({ ctx, manga, submission, challenge, script, scriptVersions, estimate, jobSummary, pages, approvals, aiStatus }) {
  const hasScript = !!script;
  return html`
<div class="split split--2">
  <div class="flow">
    ${jobSummary.active ? html`<div class="panel" data-job-watch="${manga.id}">
      <div class="panel__head"><h3>Produção em andamento</h3><span class="status status--work" data-job-text>${jobSummary.label}</span></div>
      <div class="panel__body">
        <div class="progressbar"><span data-job-progress style="width:${jobSummary.progress}%"></span></div>
        <form method="post" action="/admin/estudio/${manga.id}/abortar" class="mt-2" data-confirm="Cancelar as tarefas pendentes desta obra?">
          ${csrfField(ctx)}<button class="btn btn--sm btn--danger" type="submit">Cancelar tarefas pendentes</button>
        </form>
      </div>
    </div>` : ''}

    ${manga.status === 'FAILED' ? html`<div class="notice notice--warn">
      <h3>A produção falhou</h3><p class="mb-0">${manga.failure_reason || 'Erro não detalhado.'} Corrija o que for necessário e tente de novo: as páginas já prontas são preservadas.</p>
    </div>` : ''}

    <div class="panel">
      <div class="panel__head"><h2>1. Roteiro</h2>${hasScript ? html`<span class="tag">versão ${script.version}</span>` : ''}</div>
      <div class="panel__body">
        ${!hasScript ? html`
          <p class="muted">Nenhum roteiro gerado. A geração textual acontece antes de qualquer imagem paga.</p>
          <form method="post" action="/admin/estudio/${manga.id}/roteiro/gerar">
            ${csrfField(ctx)}
            ${estimate.known || estimate.aiMode === 'demo' ? '' : checkField({ name: 'confirmar_custo', label: 'Confirmo prosseguir sem estimativa de custo' })}
            <button class="btn btn--primary" type="submit">Gerar roteiro</button>
          </form>`
        : html`
          <form method="post" action="/admin/estudio/${manga.id}/roteiro">
            ${csrfField(ctx)}
            ${textField({ name: 'titulo', label: 'Título', value: script.script.titulo, required: true })}
            ${textArea({ name: 'sinopse', label: 'Sinopse', value: script.script.sinopse, rows: 3, required: true })}
            <details>
              <summary style="cursor:pointer;font-weight:700;margin-bottom:.6rem">Editar o JSON completo do roteiro (${script.script.paginas.length} páginas)</summary>
              ${textArea({ name: 'script_json', label: 'Roteiro estruturado', value: JSON.stringify(script.script, null, 2), rows: 20, hint: 'Validado por schema ao salvar. Páginas, quadros, diálogos e prompts visuais.' })}
            </details>
            <div class="row mt-2">
              <button class="btn btn--primary" type="submit">Salvar roteiro</button>
              ${manga.status === 'SCRIPT_DRAFT' || manga.status === 'REVIEW' ? '' : ''}
            </div>
          </form>

          <div class="row mt-2">
            <form method="post" action="/admin/estudio/${manga.id}/roteiro/gerar" data-confirm="Gerar uma nova versão do roteiro?">
              ${csrfField(ctx)}<button class="btn btn--sm" type="submit">Regerar roteiro</button>
            </form>
            ${manga.status === 'SCRIPT_DRAFT' ? html`<form method="post" action="/admin/estudio/${manga.id}/roteiro/aprovar">
              ${csrfField(ctx)}<button class="btn btn--sm btn--primary" type="submit">Aprovar roteiro</button>
            </form>` : html`<span class="status status--ok">Roteiro aprovado</span>`}
          </div>

          <details class="mt-2"><summary style="cursor:pointer">Fatos preservados e elementos ficcionalizados</summary>
            <p class="mt-2 mb-1"><strong>Preservados do relato</strong></p>
            <ul>${script.script.fatos_preservados.map((f) => html`<li>${f}</li>`)}</ul>
            <p class="mb-1"><strong>Ficcionalizados para ritmo</strong></p>
            <ul>${script.script.elementos_ficcionalizados.map((f) => html`<li>${f}</li>`)}</ul>
          </details>

          <details class="mt-2"><summary style="cursor:pointer">Páginas e quadros</summary>
            ${script.script.paginas.map((p) => html`<div class="card mt-2">
              <strong>Página ${p.numero}:</strong> ${p.resumo}
              <ol style="padding-left:1.1rem">${p.quadros.map((q) => html`<li><em>${q.enquadramento}:</em> ${q.acao}
                ${q.dialogos.length ? html`<br><span class="muted">${q.dialogos.map((d) => `${d.tipo}: "${d.texto}"`).join(' · ')}</span>` : ''}</li>`)}</ol>
            </div>`)}
          </details>`}
      </div>
    </div>

    ${hasScript && ['SCRIPT_APPROVED', 'GENERATING', 'REVIEW', 'AUTHOR_APPROVED', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED'].includes(manga.status) ? html`
    <div class="panel">
      <div class="panel__head"><h2>2. Imagens</h2><span class="muted">${pages.filter((p) => p.status === 'READY').length} de ${script.script.paginas.length + 1} prontas</span></div>
      <div class="panel__body">
        <form method="post" action="/admin/estudio/${manga.id}/imagens">
          ${csrfField(ctx)}
          ${checkField({ name: 'incluir_capa', label: 'Gerar capa separada', checked: true })}
          ${checkField({ name: 'por_quadro', label: 'Gerar quadro a quadro (mais caro)', hint: 'Use apenas se o layout de página inteira não funcionar bem com o modelo.' })}
          ${estimate.aiMode === 'live' && !estimate.known ? checkField({ name: 'confirmar_custo', label: 'Confirmo prosseguir sem estimativa de custo' }) : ''}
          ${estimate.aiMode === 'live' ? checkField({ name: 'confirmar_orcamento', label: 'Confirmo mesmo que ultrapasse o orçamento configurado' }) : ''}
          <button class="btn btn--primary" type="submit">${pages.some((p) => p.status === 'READY') ? 'Gerar páginas faltantes' : 'Gerar páginas e capa'}</button>
        </form>
        ${pages.length ? html`<div class="page-strip mt-2">
          ${pages.map((p) => html`<div class="page-thumb">
            <div class="page-thumb__img">${p.status === 'READY' ? thumb(p) : html`<span class="muted">${p.status === 'FAILED' ? 'falhou' : 'pendente'}</span>`}</div>
            <div class="page-thumb__bar"><span>${p.kind === 'COVER' ? 'Capa' : `Página ${p.page_number}`}</span>
              <a class="btn btn--sm" href="/admin/revisao/${manga.id}#pagina-${p.id}">Abrir</a></div>
          </div>`)}
        </div>` : ''}
      </div>
    </div>` : ''}
  </div>

  <div class="flow">
    <div class="panel">
      <div class="panel__head"><h3>Obra</h3>${mangaStatus(manga.status)}</div>
      <div class="panel__body">
        <div class="cost-line"><span>Relato</span><span>${submission?.author_pseudonym || 'não informado'}</span></div>
        <div class="cost-line"><span>Rede</span><span>${submission ? networkLabel(submission.network) : 'não informado'}</span></div>
        <div class="cost-line"><span>Edição</span><span>${challenge?.edition_number ?? 'não informado'}</span></div>
        <div class="cost-line"><span>Autorização</span><span>${submission?.consent_status === 'GRANTED' ? html`<span class="status status--ok">ok</span>` : html`<span class="status status--danger">pendente</span>`}</span></div>
        ${manga.status === 'PUBLISHED' ? html`<p class="mt-2 mb-0"><a class="btn btn--sm" href="/mangas/${manga.slug}" target="_blank" rel="noopener">Ver no site ↗</a></p>` : ''}
        ${['REVIEW', 'AUTHOR_APPROVED', 'APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(manga.status) ? html`<p class="mt-2 mb-0"><a class="btn btn--sm btn--primary" href="/admin/revisao/${manga.id}">Ir para revisão</a></p>` : ''}
      </div>
    </div>

    <form class="panel" method="post" action="/admin/estudio/${manga.id}/parametros">
      ${csrfField(ctx)}
      <div class="panel__head"><h3>Controles narrativos e visuais</h3></div>
      <div class="panel__body">
        ${selectField({ name: 'quality_mode', label: 'Modo de qualidade', value: manga.quality_mode, options: QUALITY_MODES.map((q) => ({ key: q.key, label: `${q.label}: ${q.desc}` })) })}
        <div class="field-row">
          ${selectField({ name: 'genre', label: 'Gênero', value: manga.genre, options: GENRES })}
          ${selectField({ name: 'narrative_tone', label: 'Tom do roteiro', value: manga.narrative_tone, options: NARRATIVE_TONES })}
        </div>
        <div class="field-row">
          ${selectField({ name: 'visual_tone', label: 'Tom visual', value: manga.visual_tone, options: VISUAL_TONES })}
          ${selectField({ name: 'humor_intensity', label: 'Intensidade de humor', value: manga.humor_intensity, options: HUMOR_LEVELS })}
        </div>
        <div class="field-row">
          ${selectField({ name: 'fidelity', label: 'Fidelidade', value: manga.fidelity, options: FIDELITY_LEVELS })}
          ${selectField({ name: 'color_mode', label: 'Cor', value: manga.color_mode, options: COLOR_MODES })}
        </div>
        <div class="field-row">
          ${selectField({ name: 'panel_density', label: 'Densidade de quadros', value: manga.panel_density, options: PANEL_DENSITIES })}
          ${selectField({ name: 'format', label: 'Formato', value: manga.format, options: FORMATS })}
        </div>
        <div class="field-row">
          ${textField({ name: 'page_min', label: 'Páginas (mín.)', value: manga.page_min, type: 'number', attrs: ' min="1" max="8"' })}
          ${textField({ name: 'page_max', label: 'Páginas (máx.)', value: manga.page_max, type: 'number', attrs: ' min="1" max="8"' })}
        </div>
        <p class="field-label">Estilo de arte</p>
        ${styleCards(manga.art_style)}
        <button class="btn btn--primary mt-2" type="submit">Salvar parâmetros</button>
        <p class="muted mt-2 mb-0">Alterar parâmetros depois de aprovado invalida as aprovações e devolve a obra à revisão.</p>
      </div>
    </form>

    ${costPanel(estimate, { title: 'Prévia de custo da próxima geração' })}

    ${scriptVersions.length > 1 ? html`<div class="panel">
      <div class="panel__head"><h3>Versões do roteiro</h3></div>
      <div class="panel__body"><ul class="timeline">${scriptVersions.map((v) => html`<li><time>${fmtDateTime(v.created_at)}</time><span>v${v.version} · ${v.source} ${v.model ? `· ${v.model}` : ''}</span></li>`)}</ul></div>
    </div>` : ''}
  </div>
</div>`;
}

/* -------------------------------- revisão ------------------------------- */

export function reviewListView({ mangas }) {
  return html`
${mangas.length ? html`<div class="grid grid--3">${mangas.map((m) => html`<div class="card">
  <div class="row row--between">${mangaStatus(m.status)}<span class="muted mono">${m.page_count} pág.</span></div>
  <h3 style="margin-top:.6rem">${m.title}</h3>
  <p class="muted">${m.network ? networkLabel(m.network) : 'não informado'} · ${m.author_pseudonym || 'não informado'}</p>
  <a class="btn btn--sm btn--primary" href="/admin/revisao/${m.id}">Revisar</a>
</div>`)}</div>` : emptyState('Nada aguardando revisão', 'As obras aparecem aqui quando as páginas terminam de ser geradas.')}`;
}

export function reviewView({ ctx, manga, submission, pages, approvals, checklist, history, balloonPage, estimate }) {
  const authorOk = approvals.author && !approvals.author.invalidated_at;
  const editorialOk = approvals.editorial && !approvals.editorial.invalidated_at;
  return html`
<div class="split split--2">
  <div class="flow">
    <div class="panel">
      <div class="panel__head"><h2>Páginas</h2><span class="muted">clique para editar balões</span></div>
      <div class="panel__body">
        <div class="page-strip">
          ${pages.map((p) => html`<div class="page-thumb" id="pagina-${p.id}">
            <div class="page-thumb__img">${p.status === 'READY' ? thumb(p) : html`<span class="muted">${p.status}</span>`}</div>
            <div class="page-thumb__bar">
              <span>${p.kind === 'COVER' ? 'Capa' : `Pág. ${p.page_number}`} <span class="muted">v${p.version}</span></span>
              <a class="btn btn--sm" href="/admin/revisao/${manga.id}?pagina=${p.id}">Editar</a>
            </div>
            <div class="page-thumb__bar">
              <form method="post" action="/admin/revisao/${manga.id}/pagina/${p.id}/regerar" data-confirm="Regerar apenas esta página? As demais não são afetadas.">
                ${csrfField(ctx)}
                ${estimate.aiMode === 'live' ? html`<input type="hidden" name="confirmar_custo" value="1">` : ''}
                <button class="btn btn--sm btn--danger" type="submit">Regerar</button>
              </form>
              <form method="post" action="/admin/revisao/${manga.id}/pagina/${p.id}/ordem">
                ${csrfField(ctx)}
                <input type="hidden" name="direcao" value="up">
                <button class="btn btn--sm" type="submit" title="Mover para cima" ${raw(p.kind === 'COVER' ? 'disabled' : '')}>↑</button>
              </form>
            </div>
          </div>`)}
        </div>
      </div>
    </div>

    ${balloonPage ? html`<div class="panel">
      <div class="panel__head"><h2>Balões da ${balloonPage.kind === 'COVER' ? 'capa' : `página ${balloonPage.page_number}`}</h2>
        <a class="btn btn--sm" href="/admin/revisao/${manga.id}">Fechar</a></div>
      <div class="panel__body">
        <div class="balloon-editor">
          <div class="balloon-stage">
            ${pageStage(balloonPage)}
          </div>
          <form method="post" action="/admin/revisao/${manga.id}/pagina/${balloonPage.id}/baloes">
            ${csrfField(ctx)}
            ${textArea({ name: 'balloons_json', label: 'Camada de balões (JSON editável)', value: JSON.stringify(JSON.parse(balloonPage.balloons_json || '[]'), null, 2), rows: 16, hint: 'Posições x/y, largura, altura, tipo e texto. O texto nunca é gerado pela IA de imagem.' })}
            ${textArea({ name: 'alt_text', label: 'Texto alternativo', value: balloonPage.alt_text || '', rows: 2, required: true })}
            ${textArea({ name: 'transcript', label: 'Transcrição dos diálogos', value: balloonPage.transcript || '', rows: 5 })}
            <button class="btn btn--primary" type="submit">Salvar balões</button>
          </form>
          <form method="post" action="/admin/revisao/${manga.id}/pagina/${balloonPage.id}/refazer-baloes" data-confirm="Refazer o layout substitui as posições e o tamanho do texto desta página pelo cálculo atual. A versão de agora fica no histórico.">
            ${csrfField(ctx)}
            <button class="btn" type="submit">Refazer layout</button>
            <p class="hint">Recalcula posição e corpo do texto a partir do roteiro. Não gera arte nem custa nada.</p>
          </form>
        </div>
        ${history.length ? html`<details class="mt-2"><summary style="cursor:pointer">Histórico de versões desta página</summary>
          <ul class="timeline mt-2">${history.map((h) => html`<li><time>${fmtDateTime(h.created_at)}</time>
            <span>v${h.version}: ${h.note}
            <form method="post" action="/admin/revisao/${manga.id}/pagina/${balloonPage.id}/restaurar" style="display:inline">
              ${csrfField(ctx)}<input type="hidden" name="versao" value="${h.version}">
              <button class="btn btn--sm" type="submit">Restaurar</button>
            </form></span></li>`)}</ul>
        </details>` : ''}
      </div>
    </div>` : ''}
  </div>

  <div class="flow">
    <div class="panel">
      <div class="panel__head"><h3>Checklist de revisão</h3></div>
      <div class="panel__body">
        <ul style="list-style:none;padding:0;display:grid;gap:.45rem">
          ${checklist.map((c) => html`<li>${c.ok ? html`<span class="status status--ok">ok</span>` : html`<span class="status status--danger">pendente</span>`} ${c.label}</li>`)}
        </ul>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><h3>Aprovações</h3></div>
      <div class="panel__body">
        <p>${authorOk ? html`<span class="status status--ok">Autor aprovou</span> <span class="muted">${fmtDateTime(approvals.author.approved_at)}</span>` : html`<span class="status status--neutral">Autor ainda não aprovou</span>`}</p>
        ${!authorOk && manga.status === 'REVIEW' ? html`<form method="post" action="/admin/revisao/${manga.id}/aprovacao-autor">
          ${csrfField(ctx)}
          ${textField({ name: 'evidence', label: 'Como o autor aprovou', value: '', required: true, hint: 'Ex.: "respondeu OK no DM em 23/11". Registro obrigatório.' })}
          <button class="btn btn--primary btn--block" type="submit">Registrar aprovação do autor</button>
        </form>` : ''}

        <hr class="ink-rule mt-2 mb-2">
        <p>${editorialOk ? html`<span class="status status--ok">Aprovado para publicação</span>` : html`<span class="status status--neutral">Falta aprovação editorial</span>`}</p>
        ${authorOk && !editorialOk ? html`<form method="post" action="/admin/revisao/${manga.id}/aprovar">
          ${csrfField(ctx)}
          ${textField({ name: 'note', label: 'Nota de aprovação (opcional)', value: '' })}
          <button class="btn btn--primary btn--block" type="submit">Aprovar para publicação</button>
        </form>` : ''}
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><h3>Publicação</h3></div>
      <div class="panel__body">
        ${manga.status === 'PUBLISHED' ? html`
          <p><span class="status status--live">No ar desde ${fmtDateTime(manga.published_at)}</span></p>
          <a class="btn btn--sm" href="/mangas/${manga.slug}" target="_blank" rel="noopener">Ver no site ↗</a>
          <form method="post" action="/admin/revisao/${manga.id}/despublicar" class="mt-2" data-confirm="Remover esta obra do site?">
            ${csrfField(ctx)}
            ${textField({ name: 'reason', label: 'Motivo', value: '', required: true })}
            <button class="btn btn--danger btn--block" type="submit">Despublicar</button>
          </form>`
        : editorialOk ? html`
          <form method="post" action="/admin/revisao/${manga.id}/publicar" data-confirm="Publicar agora? A obra ficará visível para qualquer pessoa.">
            ${csrfField(ctx)}
            ${checkField({ name: 'confirmo', label: 'Confirmo que há autorização do autor e que revisei a obra' })}
            <button class="btn btn--primary btn--block" type="submit">Publicar agora</button>
          </form>
          <hr class="ink-rule mt-2 mb-2">
          <form method="post" action="/admin/revisao/${manga.id}/agendar">
            ${csrfField(ctx)}
            ${dateField({ name: 'quando', label: 'Agendar para', value: manga.scheduled_at })}
            <button class="btn btn--block" type="submit">Agendar publicação</button>
          </form>
          ${manga.status === 'SCHEDULED' ? html`<p class="mt-2 mb-0"><span class="status status--info">Agendada para ${fmtDateTime(manga.scheduled_at)}</span></p>` : ''}`
        : html`<p class="muted mb-0">A publicação é liberada depois das aprovações do autor e editorial.</p>`}
      </div>
    </div>
  </div>
</div>`;
}

/* ------------------------------- revistas ------------------------------- */

export function magazineListAdminView({ magazines }) {
  return html`
<div class="toolbar"><a class="btn btn--primary" href="/admin/revistas/nova">Nova revista</a></div>
${magazines.length ? html`<div class="table-wrap"><table class="data">
  <thead><tr><th>Edição</th><th>Título</th><th>Status</th><th>Publicada</th><th></th></tr></thead>
  <tbody>${magazines.map((m) => html`<tr>
    <td class="mono">${m.edition_number}</td><td>${m.title}</td>
    <td>${magazineStatus(m.status)}</td><td>${fmtDateTime(m.published_at)}</td>
    <td><a class="btn btn--sm" href="/admin/revistas/${m.id}">Abrir</a></td>
  </tr>`)}</tbody>
</table></div>` : emptyState('Nenhuma revista', 'Monte a revista da semana com as obras aprovadas.')}`;
}

export function magazineFormView({ ctx, magazine, entries, challenges, available, suggestedEdition }) {
  const m = magazine || {};
  return html`
<div class="split split--2">
  <form class="panel" method="post" action="${magazine ? `/admin/revistas/${magazine.id}` : '/admin/revistas'}">
    ${csrfField(ctx)}
    <div class="panel__head"><h2>${magazine ? `Revista da edição ${magazine.edition_number}` : 'Nova revista'}</h2>${magazine ? magazineStatus(magazine.status) : ''}</div>
    <div class="panel__body">
      <div class="field-row">
        ${textField({ name: 'edition_number', label: 'Número da edição', value: m.edition_number ?? suggestedEdition, type: 'number', required: true, attrs: ' min="1"' })}
        ${selectField({ name: 'challenge_id', label: 'Desafio vinculado', value: m.challenge_id || '', options: [{ key: '', label: 'nenhum' }, ...challenges.map((c) => ({ key: c.id, label: `Edição ${c.edition_number}` }))] })}
      </div>
      ${textField({ name: 'title', label: 'Título da revista', value: m.title || '', required: true })}
      ${textArea({ name: 'summary', label: 'Resumo', value: m.summary || '', rows: 3 })}
      ${textArea({ name: 'editorial_note', label: 'Aviso editorial', value: m.editorial_note || '', rows: 2, hint: 'Use para informar quando a edição sai com menos de três obras.' })}
      <button class="btn btn--primary" type="submit">Salvar</button>
    </div>
  </form>

  ${magazine ? html`<div class="flow">
    <div class="panel">
      <div class="panel__head"><h3>Sumário</h3>
        <form method="post" action="/admin/revistas/${magazine.id}/auto">${csrfField(ctx)}<button class="btn btn--sm" type="submit">Preencher com as obras aprovadas</button></form>
      </div>
      <div class="panel__body">
        ${entries.length ? html`<ol style="padding-left:1.1rem">${entries.map((e) => html`<li>
          <strong>${e.title}</strong> · ${networkLabel(e.network)} · ${e.page_count} páginas ${mangaStatus(e.manga_status)}
          <form method="post" action="/admin/revistas/${magazine.id}/remover" style="display:inline">
            ${csrfField(ctx)}<input type="hidden" name="manga_id" value="${e.manga_id}">
            <button class="btn btn--sm btn--danger" type="submit">Remover</button>
          </form>
        </li>`)}</ol>
        <p class="muted mb-0">A revista reaproveita as páginas já geradas. Nenhuma chamada de IA extra é feita para montar o compilado.</p>`
        : html`<p class="muted mb-0">Nenhuma obra adicionada.</p>`}

        ${available.length ? html`<form method="post" action="/admin/revistas/${magazine.id}/adicionar" class="mt-2">
          ${csrfField(ctx)}
          ${selectField({ name: 'manga_id', label: 'Adicionar obra aprovada', value: '', options: available.map((a) => ({ key: a.id, label: `${a.title} (${a.network ? networkLabel(a.network) : 'não informado'})` })) })}
          <button class="btn btn--sm btn--primary" type="submit">Adicionar</button>
        </form>` : ''}
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><h3>Publicação</h3></div>
      <div class="panel__body">
        ${magazine.status === 'PUBLISHED'
          ? html`<p><span class="status status--live">Publicada em ${fmtDateTime(magazine.published_at)}</span></p>
                 <a class="btn btn--sm" href="/revistas/${magazine.slug}" target="_blank" rel="noopener">Ver no site ↗</a>`
          : html`<form method="post" action="/admin/revistas/${magazine.id}/publicar" data-confirm="Publicar a revista agora?">
              ${csrfField(ctx)}
              ${checkField({ name: 'confirmo', label: 'Confirmo que todas as obras estão publicadas e revisadas' })}
              <button class="btn btn--primary btn--block" type="submit">Publicar revista</button>
            </form>
            <hr class="ink-rule mt-2 mb-2">
            <form method="post" action="/admin/revistas/${magazine.id}/agendar">
              ${csrfField(ctx)}
              ${dateField({ name: 'quando', label: 'Agendar para', value: magazine.scheduled_at })}
              <button class="btn btn--block" type="submit">Agendar</button>
            </form>`}
      </div>
    </div>
  </div>` : html`<div class="notice notice--info"><p class="mb-0">Salve a revista para montar o sumário com as obras aprovadas da edição.</p></div>`}
</div>`;
}

/* ------------------------------ biblioteca ------------------------------ */

export function libraryView({ ctx, mangas, cardData, sizes, templates }) {
  return html`
<div class="split split--2">
  <div class="panel">
    <div class="panel__head"><h2>Gerador de cards</h2><span class="tag tag--demo">sem custo de IA</span></div>
    <div class="panel__body">
      <form method="get" action="/admin/biblioteca">
        ${selectField({ name: 'template', label: 'Modelo', value: cardData.template, options: templates })}
        ${selectField({ name: 'tamanho', label: 'Dimensão', value: cardData.size, options: sizes })}
        ${textField({ name: 'tema', label: 'Tema / chamada', value: cardData.theme })}
        ${textField({ name: 'titulo', label: 'Título da obra', value: cardData.title })}
        <div class="field-row">
          ${textField({ name: 'autor', label: 'Pseudônimo', value: cardData.author })}
          ${textField({ name: 'rede', label: 'Rede', value: cardData.network })}
          ${textField({ name: 'edicao', label: 'Edição', value: cardData.edition })}
        </div>
        <button class="btn btn--primary" type="submit">Atualizar prévia</button>
      </form>
    </div>
  </div>

  <div class="panel">
    <div class="panel__head"><h3>Prévia</h3>
      <button class="btn btn--sm btn--primary" type="button" data-export-png="#card-preview svg" data-w="${cardData.w}" data-h="${cardData.h}" data-filename="mangaloop-${cardData.template}">Baixar PNG</button>
    </div>
    <div class="panel__body">
      <div id="card-preview" style="max-width:380px;margin-inline:auto">${raw(cardData.svg)}</div>
      <p class="muted mt-2 mb-0">O PNG é gerado no navegador a partir do SVG, com a identidade institucional. Nenhuma imagem paga é gerada para cards.</p>
    </div>
  </div>
</div>

<div class="panel mt-2">
  <div class="panel__head"><h2>Acervo</h2></div>
  <div class="panel__body">
    ${mangas.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th>Obra</th><th>Status</th><th>Edição</th><th>Páginas</th><th>Publicada</th><th></th></tr></thead>
      <tbody>${mangas.map((m) => html`<tr>
        <td><strong>${m.title}</strong><br><span class="muted">${m.author_pseudonym || 'não informado'}</span></td>
        <td>${mangaStatus(m.status)}</td><td class="mono">${m.edition_number ?? 'não informado'}</td>
        <td class="mono">${m.page_count}</td><td>${fmtDateTime(m.published_at)}</td>
        <td><a class="btn btn--sm" href="/admin/revisao/${m.id}">Abrir</a></td>
      </tr>`)}</tbody>
    </table></div>` : emptyState('Acervo vazio', 'As obras aparecem aqui conforme são produzidas.')}
  </div>
</div>`;
}

/* -------------------------------- custos -------------------------------- */

export function costsView({ month, perManga, prices, budgets, usage, aiStatus }) {
  return html`
<div class="stat-grid mb-2">
  <div class="stat"><div class="stat__label">Mês corrente</div><div class="stat__value">${formatUsd(month.totalUsd)}</div><div class="stat__note">${month.entries} registro(s)</div></div>
  <div class="stat"><div class="stat__label">Teto mensal</div><div class="stat__value">${budgets.monthly === null ? 'não informado' : formatUsd(budgets.monthly)}</div><div class="stat__note">MONTHLY_AI_BUDGET_USD</div></div>
  <div class="stat"><div class="stat__label">Teto por obra</div><div class="stat__value">${budgets.perManga === null ? 'não informado' : formatUsd(budgets.perManga)}</div><div class="stat__note">PER_MANGA_AI_BUDGET_USD</div></div>
  <div class="stat"><div class="stat__label">Sem custo verificável</div><div class="stat__value">${month.unknownEntries}</div><div class="stat__note">tarifas não configuradas</div></div>
</div>

${aiStatus.mode === 'demo' ? html`<div class="notice notice--demo mb-2"><p class="mb-0">Em modo demonstração todos os registros têm custo zero porque nenhuma chamada paga é feita. Esses valores não representam custo de produção.</p></div>` : ''}

${!prices.hasText || !prices.hasImage ? html`<div class="notice notice--warn mb-2">
  <h3>Tarifas incompletas</h3>
  <p class="mb-0">Sem tarifas configuradas o sistema informa "não informado" em vez de exibir zero. Configure as variáveis PRICE_* com os valores da documentação oficial vigente e registre a data em PRICE_TABLE_UPDATED_AT.</p>
</div>` : html`<p class="muted">Tarifas configuradas em ${prices.updatedAt || 'data não informada'}.</p>`}

<div class="panel mb-2">
  <div class="panel__head"><h3>Custo por obra</h3></div>
  <div class="panel__body">
    ${perManga.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th>Obra</th><th>Chamadas</th><th>Estimado</th><th>Real</th><th>Origem</th></tr></thead>
      <tbody>${perManga.map((r) => html`<tr>
        <td>${r.title}</td><td class="mono">${r.calls}</td>
        <td class="mono">${formatUsd(r.estimated)}</td>
        <td class="mono${raw(r.actual === null ? ' cost-unknown' : '')}">${formatUsd(r.actual)}</td>
        <td>${r.sources.join(', ')}</td>
      </tr>`)}</tbody>
    </table></div>` : html`<p class="muted mb-0">Nenhum consumo registrado.</p>`}
  </div>
</div>

<div class="panel">
  <div class="panel__head"><h3>Registros recentes</h3></div>
  <div class="panel__body">
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Quando</th><th>Tipo</th><th>Modelo</th><th>Tokens / imagens</th><th>Estimado</th><th>Real</th><th>Modo</th></tr></thead>
      <tbody>${usage.map((u) => html`<tr>
        <td>${fmtDateTime(u.occurred_at)}</td><td>${u.kind}</td><td>${u.model || 'não informado'}</td>
        <td class="mono">${u.kind === 'TEXT' ? `${u.input_tokens ?? 0} / ${u.output_tokens ?? 0}` : (u.images_count ?? 0)}</td>
        <td class="mono">${formatUsd(u.estimated_cost_usd)}</td>
        <td class="mono${raw(u.cost_source === 'UNKNOWN' ? ' cost-unknown' : '')}">${u.cost_source === 'UNKNOWN' ? 'não informado' : formatUsd(u.actual_cost_usd)}</td>
        <td>${u.mode}</td>
      </tr>`)}</tbody>
    </table></div>
  </div>
</div>`;
}

/* ----------------------------- configurações ---------------------------- */

export function settingsView({ ctx, settings, aiStatus, storage, admins }) {
  return html`
<div class="split split--2">
  <form class="panel" method="post" action="/admin/configuracoes">
    ${csrfField(ctx)}
    <div class="panel__head"><h2>Identidade e links</h2></div>
    <div class="panel__body">
      ${textField({ name: 'site_title', label: 'Nome do site', value: settings.site_title })}
      ${textField({ name: 'tagline', label: 'Slogan', value: settings.tagline })}
      ${textField({ name: 'signature', label: 'Assinatura', value: settings.signature })}
      <fieldset><legend>Redes oficiais</legend>
        ${textField({ name: 'instagram_url', label: 'Instagram', value: settings.instagram_url, type: 'url' })}
        ${textField({ name: 'tiktok_url', label: 'TikTok', value: settings.tiktok_url, type: 'url' })}
        ${textField({ name: 'x_url', label: 'X', value: settings.x_url, type: 'url' })}
        ${textField({ name: 'rules_url', label: 'Link público das regras', value: settings.rules_url, type: 'url' })}
      </fieldset>
      <fieldset><legend>Contato</legend>
        ${textField({ name: 'contact_email', label: 'E-mail de contato', value: settings.contact_email, type: 'email' })}
        ${textField({ name: 'takedown_email', label: 'E-mail de retirada de conteúdo', value: settings.takedown_email, type: 'email' })}
      </fieldset>
      <div class="field-row">
        ${textField({ name: 'max_pages', label: 'Limite de páginas por obra', value: settings.max_pages, type: 'number', attrs: ' min="1" max="12"' })}
        ${selectField({ name: 'default_quality_mode', label: 'Modo padrão', value: settings.default_quality_mode, options: QUALITY_MODES.map((q) => ({ key: q.key, label: q.label })) })}
      </div>
      <button class="btn btn--primary" type="submit">Salvar configurações</button>
    </div>
  </form>

  <div class="flow">
    <div class="panel">
      <div class="panel__head"><h3>Integração de IA</h3><span class="tag${raw(aiStatus.mode === 'live' ? ' tag--red' : ' tag--demo')}">${aiStatus.mode === 'live' ? 'produção' : 'demonstração'}</span></div>
      <div class="panel__body">
        <div class="cost-line"><span>Chave configurada</span><span>${aiStatus.hasKey ? 'sim' : 'não'}</span></div>
        <div class="cost-line"><span>Modelo de texto</span><span class="mono">${aiStatus.textModel || 'não informado'}</span></div>
        <div class="cost-line"><span>Modelo de imagem</span><span class="mono">${aiStatus.imageModel || 'não informado'}</span></div>
        <div class="cost-line"><span>Rota de texto</span><span class="mono">${aiStatus.textApi}</span></div>
        <div class="cost-line"><span>Entrada de imagem (referência)</span><span>${aiStatus.supportsImageReference ? 'habilitada' : 'desabilitada'}</span></div>
        <div class="cost-line"><span>Bloqueio por orçamento</span><span>${aiStatus.costGate ? 'ativo' : 'desligado'}</span></div>
        ${aiStatus.blockers.length ? html`<div class="notice notice--demo mt-2"><p class="mb-0">Para ativar produção: ${aiStatus.blockers.join(' · ')}.</p></div>` : ''}
        ${aiStatus.hasKey ? html`<form method="post" action="/admin/configuracoes/testar-ia" class="mt-2">
          ${csrfField(ctx)}
          <button class="btn btn--sm btn--block" type="submit">Testar conexão com a OpenAI</button>
          <small class="muted">Consulta apenas a lista de modelos da conta. Não gera cobrança.</small>
        </form>` : ''}
        <p class="muted mt-2 mb-0">Credenciais vivem apenas em variáveis de ambiente e nunca são exibidas aqui.</p>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><h3>Armazenamento</h3></div>
      <div class="panel__body">
        <div class="cost-line"><span>Driver</span><span class="mono">${storage.driver}</span></div>
        <div class="cost-line"><span>Bucket</span><span class="mono">${storage.bucket || 'não informado'}</span></div>
        <div class="cost-line"><span>Originais</span><span>privados</span></div>
      </div>
    </div>

    <form class="panel" method="post" action="/admin/configuracoes/senha">
      ${csrfField(ctx)}
      <div class="panel__head"><h3>Trocar minha senha</h3></div>
      <div class="panel__body">
        ${textField({ name: 'atual', label: 'Senha atual', value: '', type: 'password', required: true })}
        ${textField({ name: 'nova', label: 'Nova senha', value: '', type: 'password', required: true, hint: 'Mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo.' })}
        <button class="btn btn--primary" type="submit">Atualizar senha</button>
      </div>
    </form>

    <div class="panel">
      <div class="panel__head"><h3>Usuários administrativos</h3></div>
      <div class="panel__body">
        <ul class="timeline">${admins.map((a) => html`<li><time>${a.last_login_at ? fmtDateTime(a.last_login_at) : 'nunca'}</time><span>${a.username} ${a.is_active ? '' : '(inativo)'}</span></li>`)}</ul>
      </div>
    </div>
  </div>
</div>`;
}

/* --------------------------------- login -------------------------------- */

export function loginView({ error = null, username = '', nonce = '' }) {
  return html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>Entrar · MangaLoop</title>
<meta name="theme-color" content="#141414">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/estatico/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600;700&display=swap">
<link rel="stylesheet" href="${assetUrl('styles.css')}">
</head>
<body style="background:var(--ink);display:grid;place-items:center;min-height:100vh;padding:1rem">
<main style="width:min(100%,420px)">
  <div style="text-align:center;margin-bottom:1.2rem">
    <img src="/estatico/logo.svg" alt="" width="64" height="64" style="margin-inline:auto">
    <h1 style="color:var(--paper);font-size:1.6rem;margin-top:.6rem">Painel editorial</h1>
  </div>
  <form class="card" method="post" action="/admin/entrar">
    ${error ? html`<div class="notice notice--warn mb-2"><p class="mb-0">${error}</p></div>` : ''}
    <label class="field"><span>Usuário</span><input type="text" name="username" value="${username}" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" autofocus></label>
    <label class="field"><span>Senha</span><input type="password" name="password" required autocomplete="current-password" enterkeyhint="go"></label>
    <button class="btn btn--primary btn--block" type="submit">Entrar</button>
  </form>
  <p style="color:var(--muted-on-dark);text-align:center;margin-top:1rem;font-size:.85rem">
    <a href="/" style="color:var(--gold)">Voltar ao site público</a>
  </p>
</main>
</body>
</html>`;
}
