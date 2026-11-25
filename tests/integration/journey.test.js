import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { useTestDatabase } from '../support/env.js';

useTestDatabase('journey');

const { migrate, insert } = await import('../../src/core/db.js');
migrate({ silent: true });

const { hashPassword } = await import('../../src/core/auth.js');
const { createApp } = await import('../../src/server.js');
const { tick } = await import('../../src/worker.js');

const SENHA = 'Tr0vao-Rubro!2026';
insert('admin_users', { username: 'kauan', password_hash: hashPassword(SENHA), password_algo: 'scrypt', role: 'admin', is_active: 1 });

const server = http.createServer(createApp());
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

let cookie = '';

async function req(path, { method = 'GET', form = null, follow = false } = {}) {
  const headers = { Cookie: cookie };
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  const res = await fetch(`${base}${path}`, { method, headers, body, redirect: follow ? 'follow' : 'manual' });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const pair = c.split(';')[0];
    if (pair.startsWith('ml_session=')) cookie = pair;
  }
  return res;
}

async function csrfDe(path) {
  const html = await (await req(path)).text();
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  assert.ok(m, `não achei CSRF em ${path}`);
  return m[1];
}

/* ------------------------------ jornada --------------------------------- */

test('visitante não acessa o painel', async () => {
  const res = await req('/admin');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/admin\/entrar/);
});

test('login inválido é recusado e o válido abre sessão', async () => {
  const ruim = await req('/admin/entrar', { method: 'POST', form: { username: 'kauan', password: 'errada' } });
  assert.equal(ruim.status, 401);

  const bom = await req('/admin/entrar', { method: 'POST', form: { username: 'kauan', password: SENHA } });
  assert.equal(bom.status, 303);
  assert.ok(cookie.includes('ml_session='));
  assert.equal((await req('/admin')).status, 200);
});

test('escrita sem CSRF é bloqueada', async () => {
  const res = await req('/admin/configuracoes', { method: 'POST', form: { site_title: 'Invadido' } });
  assert.equal(res.status, 403);
});

let challengeId;
test('admin cria o desafio da semana', async () => {
  const csrf = await csrfDe('/admin/desafios/novo');
  const res = await req('/admin/desafios', {
    method: 'POST',
    form: { _csrf: csrf, edition_number: '1', theme: 'Me conte qual foi o maior mico da sua vida.', status: 'LIVE' },
  });
  assert.equal(res.status, 303);
  challengeId = /\/admin\/desafios\/([^?]+)/.exec(res.headers.get('location'))[1];
  assert.ok(challengeId);
});

test('o gerador social mantém a copy literal e calcula a duração', async () => {
  const html = await (await req('/admin/roteiros-sociais?preset=P01&wpm=150')).text();
  assert.ok(html.includes('Nós vamos transformar um comentário deste vídeo em um mangá de verdade.'));
  assert.ok(html.includes('Me conte qual foi o maior mico da sua vida.'));
  assert.ok(html.includes('MangaLoop. Sua vida pode ser o próximo capítulo.'));
  assert.ok(!html.includes('[TEMA DA SEMANA]'));
  assert.match(html, /palavras ·/);
});

const vencedores = [
  { network: 'INSTAGRAM', pseudonym: 'Lia do 7º andar', comment: 'Entrei no elevador errado e cheguei na reunião da diretoria de pijama. Pedi desculpa e saí de costas.' },
  { network: 'TIKTOK', pseudonym: 'Rafa e a Nina', comment: 'Minha cachorra aprendeu a abrir a geladeira. Instalei uma câmera e flagrei ela pegando linguiça.' },
  { network: 'X', pseudonym: 'Dedé da padaria', comment: 'Todo sábado meu avô me levava na padaria às seis da manhã e a gente dividia o pão sem falar nada.' },
];
const submissionIds = [];
const mangaIds = [];

test('admin cadastra três vencedores independentes, um por rede', async () => {
  for (const v of vencedores) {
    const csrf = await csrfDe('/admin/relatos/novo');
    const res = await req('/admin/relatos', {
      method: 'POST',
      form: {
        _csrf: csrf, challenge_id: challengeId, network: v.network, rank: '1',
        comment_text: v.comment, votes: '1200', author_pseudonym: v.pseudonym,
        consent_status: 'GRANTED', consent_evidence: 'DM', genre: 'COMEDIA',
        art_style: 'CLASSICO_PB', narrative_tone: 'HUMOR_COTIDIANO', visual_tone: 'EXPRESSIVO',
      },
    });
    assert.equal(res.status, 303);
    submissionIds.push(/\/admin\/relatos\/([^?]+)/.exec(res.headers.get('location'))[1]);
  }
  assert.equal(submissionIds.length, 3);
});

test('cada relato ocupa a vaga da sua rede e vira obra', async () => {
  for (const id of submissionIds) {
    const csrf = await csrfDe(`/admin/relatos/${id}`);
    const sel = await req(`/admin/relatos/${id}/selecionar`, { method: 'POST', form: { _csrf: csrf } });
    assert.equal(sel.status, 303);

    const csrf2 = await csrfDe(`/admin/relatos/${id}`);
    const obra = await req(`/admin/relatos/${id}/criar-obra`, { method: 'POST', form: { _csrf: csrf2 } });
    assert.equal(obra.status, 303);
    mangaIds.push(/\/admin\/estudio\/([^?]+)/.exec(obra.headers.get('location'))[1]);
  }
  const dash = await (await req('/admin')).text();
  assert.match(dash, /3\/3/);
});

test('uma segunda vaga na mesma rede é recusada', async () => {
  const csrf = await csrfDe('/admin/relatos/novo');
  const res = await req('/admin/relatos', {
    method: 'POST',
    form: {
      _csrf: csrf, challenge_id: challengeId, network: 'INSTAGRAM', rank: '2',
      comment_text: 'Outro relato qualquer que também é engraçado e tem tamanho suficiente.',
      author_pseudonym: 'Outra pessoa', consent_status: 'GRANTED',
    },
  });
  const id = /\/admin\/relatos\/([^?]+)/.exec(res.headers.get('location'))[1];
  const csrf2 = await csrfDe(`/admin/relatos/${id}`);
  const sel = await req(`/admin/relatos/${id}/selecionar`, { method: 'POST', form: { _csrf: csrf2 } });
  assert.equal(sel.status, 303);
  assert.match(decodeURIComponent(sel.headers.get('location')), /erro=.*vaga de INSTAGRAM já está ocupada/i);
  const { getSubmission } = await import('../../src/domain/submissions.js');
  assert.notEqual(getSubmission(id).status, 'SELECTED');
});

test('roteiro, imagens, revisão, aprovações e publicação', async () => {
  for (const mangaId of mangaIds) {
    let csrf = await csrfDe(`/admin/estudio/${mangaId}`);
    assert.equal((await req(`/admin/estudio/${mangaId}/roteiro/gerar`, { method: 'POST', form: { _csrf: csrf } })).status, 303);
    await tick();

    const estudio = await (await req(`/admin/estudio/${mangaId}`)).text();
    assert.match(estudio, /Roteiro em rascunho|versão 1/);

    csrf = await csrfDe(`/admin/estudio/${mangaId}`);
    assert.equal((await req(`/admin/estudio/${mangaId}/roteiro/aprovar`, { method: 'POST', form: { _csrf: csrf } })).status, 303);

    csrf = await csrfDe(`/admin/estudio/${mangaId}`);
    assert.equal((await req(`/admin/estudio/${mangaId}/imagens`, { method: 'POST', form: { _csrf: csrf, incluir_capa: '1' } })).status, 303);
    await tick();

    csrf = await csrfDe(`/admin/revisao/${mangaId}`);
    assert.equal((await req(`/admin/revisao/${mangaId}/aprovacao-autor`, { method: 'POST', form: { _csrf: csrf, evidence: 'Respondeu OK no DM' } })).status, 303);

    csrf = await csrfDe(`/admin/revisao/${mangaId}`);
    assert.equal((await req(`/admin/revisao/${mangaId}/aprovar`, { method: 'POST', form: { _csrf: csrf, note: 'ok' } })).status, 303);

    csrf = await csrfDe(`/admin/revisao/${mangaId}`);
    const pub = await req(`/admin/revisao/${mangaId}/publicar`, { method: 'POST', form: { _csrf: csrf, confirmo: '1' } });
    assert.equal(pub.status, 303);
    assert.match(pub.headers.get('location'), /ok=/);
  }
});

test('publicar sem marcar a confirmação não publica', async () => {
  const { listMangas, getManga, unpublishManga } = await import('../../src/domain/mangas.js');
  const alvo = listMangas({ status: 'PUBLISHED', limit: 1 })[0];
  unpublishManga(alvo.id, { actor: 'teste', reason: 'teste de confirmação' });
  const { update } = await import('../../src/core/db.js');
  update('mangas', alvo.id, { status: 'APPROVED' });

  const csrf = await csrfDe(`/admin/revisao/${alvo.id}`);
  const res = await req(`/admin/revisao/${alvo.id}/publicar`, { method: 'POST', form: { _csrf: csrf } });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /erro=/);
  assert.notEqual(getManga(alvo.id).status, 'PUBLISHED');

  const csrf2 = await csrfDe(`/admin/revisao/${alvo.id}`);
  await req(`/admin/revisao/${alvo.id}/publicar`, { method: 'POST', form: { _csrf: csrf2, confirmo: '1' } });
  assert.equal(getManga(alvo.id).status, 'PUBLISHED');
});

test('leitor anônimo lê as obras no celular, sem cadastro', async () => {
  const anon = async (p) => fetch(`${base}${p}`);
  const { listPublished } = await import('../../src/domain/mangas.js');
  const obras = listPublished({ limit: 10 });
  assert.equal(obras.length, 3);

  const home = await anon('/');
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Sua vida pode ser o/);
  assert.match(homeHtml, /width=device-width/);

  for (const obra of obras) {
    const detalhe = await anon(`/mangas/${obra.slug}`);
    assert.equal(detalhe.status, 200);
    const html = await detalhe.text();
    assert.match(html, /og:image/);
    assert.match(html, /rel="canonical"/);
    assert.ok(html.includes(obra.title));

    const leitor = await anon(`/mangas/${obra.slug}/ler`);
    assert.equal(leitor.status, 200);
    const leitorHtml = await leitor.text();
    const paginas = [...leitorHtml.matchAll(/\/pagina\/([a-z0-9]+)\.svg/g)];
    assert.ok(paginas.length >= 2, 'o leitor lista capa e páginas');
    assert.match(leitorHtml, /Transcrição acessível/);

    const svg = await anon(`/pagina/${paginas[1][1]}.svg`);
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get('content-type'), /svg/);
    const svgBody = await svg.text();
    assert.match(svgBody, /<title>/, 'a página tem título acessível');
  }
});

test('rascunho não vaza por URL pública', async () => {
  const { listMangas } = await import('../../src/domain/mangas.js');
  const { listPages } = await import('../../src/domain/mangas.js');
  const { update } = await import('../../src/core/db.js');
  const obra = listMangas({ status: 'PUBLISHED', limit: 1 })[0];
  update('mangas', obra.id, { status: 'ARCHIVED' });

  const anonSemCookie = await fetch(`${base}/mangas/${obra.slug}`);
  assert.equal(anonSemCookie.status, 404);
  const pagina = listPages(obra.id)[0];
  assert.equal((await fetch(`${base}/pagina/${pagina.id}.svg`)).status, 404);
  update('mangas', obra.id, { status: 'PUBLISHED' });
});

test('o público não alcança endpoints pagos', async () => {
  const { listMangas } = await import('../../src/domain/mangas.js');
  const obra = listMangas({ status: 'PUBLISHED', limit: 1 })[0];
  for (const rota of [`/admin/estudio/${obra.id}/roteiro/gerar`, `/admin/estudio/${obra.id}/imagens`]) {
    const res = await fetch(`${base}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '', redirect: 'manual' });
    assert.ok([302, 403].includes(res.status), `${rota} deveria exigir sessão (status ${res.status})`);
  }
});

test('sitemap lista apenas obras publicadas', async () => {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  const { listMangas } = await import('../../src/domain/mangas.js');
  for (const obra of listMangas({ status: 'PUBLISHED', limit: 10 })) {
    assert.ok(xml.includes(`/mangas/${obra.slug}`));
  }
  for (const obra of listMangas({ status: 'ARCHIVED', limit: 10 })) {
    assert.ok(!xml.includes(`/mangas/${obra.slug}<`));
  }
});

test('a revista reúne as três obras e é lida sem cadastro', async () => {
  let csrf = await csrfDe('/admin/revistas/nova');
  const criada = await req('/admin/revistas', {
    method: 'POST',
    form: { _csrf: csrf, edition_number: '1', title: 'MangaLoop nº 1', challenge_id: challengeId, summary: 'Três histórias da semana.' },
  });
  const magId = /\/admin\/revistas\/([^?]+)/.exec(criada.headers.get('location'))[1];

  csrf = await csrfDe(`/admin/revistas/${magId}`);
  await req(`/admin/revistas/${magId}/auto`, { method: 'POST', form: { _csrf: csrf } });

  csrf = await csrfDe(`/admin/revistas/${magId}`);
  const pub = await req(`/admin/revistas/${magId}/publicar`, { method: 'POST', form: { _csrf: csrf, confirmo: '1' } });
  assert.match(pub.headers.get('location'), /ok=/);

  const { getMagazine } = await import('../../src/domain/magazines.js');
  const revista = getMagazine(magId);
  assert.equal(revista.status, 'PUBLISHED');

  const pagina = await fetch(`${base}/revistas/${revista.slug}`);
  assert.equal(pagina.status, 200);
  const leitura = await fetch(`${base}/revistas/${revista.slug}/ler`);
  assert.equal(leitura.status, 200);
  const html = await leitura.text();
  assert.ok([...html.matchAll(/\/pagina\//g)].length >= 6, 'a revista reúne as páginas das obras');
});

test('logout encerra a sessão', async () => {
  const csrf = await csrfDe('/admin');
  const res = await req('/admin/sair', { method: 'POST', form: { _csrf: csrf } });
  assert.equal(res.status, 303);
  assert.equal((await req('/admin')).status, 302);
});
