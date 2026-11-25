import { aiMode } from '../config/env.js';
import { closeDb, get, migrate, update } from '../core/db.js';
import { setSetting } from '../core/settings.js';
import { createChallenge, getChallenge } from '../domain/challenges.js';
import { createSubmission, selectWinner } from '../domain/submissions.js';
import {
  approveForPublication, approveScript, createMangaFromSubmission, getManga,
  publishManga, registerAuthorApproval,
} from '../domain/mangas.js';
import { autoFill, createMagazine, publishMagazine } from '../domain/magazines.js';
import { startImageGeneration, startScriptGeneration } from '../ai/pipeline.js';
import { tick } from '../worker.js';
import { saveSocialScript } from '../domain/social.js';

/**
 * Seed de DEMONSTRAÇÃO, idempotente.
 *
 * Cria uma edição completa com três obras publicadas, para validar o fluxo
 * sem nenhuma chamada paga. Tudo fica marcado com is_demo = 1 e aparece
 * identificado como demonstração no site e no painel.
 *
 * Recusa-se a rodar em modo de IA "live" para não gastar crédito por engano.
 */

const EDITION = 1;

const DEMO = [
  {
    network: 'INSTAGRAM',
    pseudonym: 'Lia do 7º andar',
    votes: 1240,
    genre: 'COMEDIA',
    art_style: 'CHIBI',
    narrative_tone: 'HUMOR_ABSURDO',
    visual_tone: 'CARICATURAL',
    comment: 'Entrei no elevador errado no primeiro dia de trabalho. As portas abriram bem na reunião da diretoria. Eu estava de pijama porque achei que era dia de home office. Pedi desculpa, falei "entrega de documentos" e saí andando de costas. Ninguém nunca comentou nada.',
  },
  {
    network: 'TIKTOK',
    pseudonym: 'Rafa e a Nina',
    votes: 3187,
    genre: 'PETS',
    art_style: 'SLICE_OF_LIFE',
    narrative_tone: 'HUMOR_COTIDIANO',
    visual_tone: 'ACONCHEGANTE',
    comment: 'Minha cachorra aprendeu a abrir a geladeira sozinha. Durante duas semanas eu achei que estava ficando maluco porque as linguiças sumiam. Instalei uma câmera. Ela esperava eu sair, abria a porta com o focinho, pegava uma e fechava tudo de volta. Fechava.',
  },
  {
    network: 'X',
    pseudonym: 'Dedé da padaria',
    votes: 842,
    genre: 'NOSTALGIA',
    art_style: 'RETRO',
    narrative_tone: 'NOSTALGICO',
    visual_tone: 'ACONCHEGANTE',
    comment: 'Todo sábado meu avô me levava na padaria às seis da manhã. Ele comprava dois pães na chapa e dividia comigo no banco da praça, sem falar nada. Hoje eu levo meu filho no mesmo banco. Ele também não fala nada. Acho que é assim mesmo que funciona.',
  },
];

async function run() {
  migrate({ silent: true });

  if (aiMode() === 'live') {
    console.error('[seed] Modo de IA "live" ativo. O seed de demonstração não roda para não gerar custo.');
    console.error('[seed] Desative AI_LIVE_ENABLED para popular a demonstração.');
    process.exit(1);
  }

  setSetting('tagline', 'Sua vida pode ser o próximo capítulo.');
  setSetting('signature', 'Você conta. A comunidade escolhe. Nós ilustramos.');

  let challenge = get('SELECT * FROM challenges WHERE edition_number = ?', [EDITION]);
  if (!challenge) {
    challenge = createChallenge({
      edition_number: EDITION,
      theme: 'Me conte qual foi o maior mico da sua vida.',
      status: 'PUBLISHED',
      launch_at: isoDaysAgo(6),
      close_at: isoDaysAgo(3),
      publish_at: isoDaysAgo(0),
      editorial_note: 'Edição de demonstração criada pelo seed. Não representa uma apuração real.',
    });
    update('challenges', challenge.id, { is_demo: 1 });
    console.log(`[seed] Edição ${EDITION} criada.`);
  } else {
    console.log(`[seed] Edição ${EDITION} já existe; reaproveitando.`);
  }

  for (const item of DEMO) {
    const existing = get('SELECT * FROM submissions WHERE challenge_id = ? AND network = ?', [challenge.id, item.network]);
    let submission = existing;
    if (!submission) {
      const created = createSubmission({
        challenge_id: challenge.id,
        network: item.network,
        rank: 1,
        comment_text: item.comment,
        votes: item.votes,
        counted_at: isoDaysAgo(3),
        comment_posted_at: isoDaysAgo(5),
        author_pseudonym: item.pseudonym,
        consent_status: 'GRANTED',
        consent_evidence: 'Autorização simulada pelo seed de demonstração.',
        genre: item.genre,
        art_style: item.art_style,
        narrative_tone: item.narrative_tone,
        visual_tone: item.visual_tone,
        editorial_notes: 'Conteúdo de demonstração.',
      }, { actor: 'seed' });
      submission = created.submission;
      update('submissions', submission.id, { is_demo: 1 });
      selectWinner(submission.id, { actor: 'seed' });
      console.log(`[seed] Relato de ${item.network} registrado e selecionado.`);
    }

    let manga = get('SELECT * FROM mangas WHERE submission_id = ?', [submission.id]);
    if (!manga) {
      manga = createMangaFromSubmission(submission.id, {
        quality_mode: 'ECONOMICO',
        color_mode: 'PB',
        panel_density: 'MEDIA',
        page_min: 4,
        page_max: 4,
      }, { actor: 'seed' });
      update('mangas', manga.id, { is_demo: 1 });
    }

    manga = getManga(manga.id);
    if (manga.status === 'PUBLISHED') { console.log(`[seed] "${manga.title}" já publicada.`); continue; }

    if (manga.status === 'RECEIVED') {
      startScriptGeneration(manga.id, { actor: 'seed' });
      await tick();
    }
    if (getManga(manga.id).status === 'SCRIPT_DRAFT') approveScript(manga.id, { actor: 'seed' });
    if (getManga(manga.id).status === 'SCRIPT_APPROVED') {
      startImageGeneration(manga.id, { actor: 'seed', includeCover: true });
      await tick();
    }
    if (getManga(manga.id).status === 'REVIEW') {
      registerAuthorApproval(manga.id, { actor: 'seed', evidence: 'Aprovação simulada pelo seed.' });
      approveForPublication(manga.id, { actor: 'seed', note: 'Demonstração.' });
    }
    if (getManga(manga.id).status === 'APPROVED') {
      await publishManga(manga.id, { actor: 'seed', confirmed: true });
    }
    console.log(`[seed] "${getManga(manga.id).title}" → ${getManga(manga.id).status}`);
  }

  let magazine = get('SELECT * FROM magazines WHERE edition_number = ?', [EDITION]);
  if (!magazine) {
    magazine = createMagazine({
      challengeId: challenge.id,
      editionNumber: EDITION,
      title: 'MangaLoop nº 1: Micos memoráveis',
      summary: 'As três histórias mais curtidas da semana, uma por rede, reunidas em uma edição só.',
      editorialNote: 'Edição de demonstração: as obras foram desenhadas localmente, sem chamadas pagas de IA.',
      actor: 'seed',
    });
    update('magazines', magazine.id, { is_demo: 1 });
    autoFill(magazine.id, { actor: 'seed' });
    await publishMagazine(magazine.id, { actor: 'seed', confirmed: true });
    console.log('[seed] Revista publicada.');
  } else {
    console.log('[seed] Revista já existe.');
  }

  if (!get('SELECT id FROM social_scripts LIMIT 1')) {
    saveSocialScript({ challengeId: challenge.id, theme: challenge.theme, presetKey: 'P01', wpm: 150, createdBy: 'seed' });
    console.log('[seed] Roteiro social de exemplo salvo.');
  }

  console.log('\n[seed] Pronto. Conteúdo de DEMONSTRAÇÃO criado e identificado como tal.');
  console.log('[seed] Para limpar, apague o arquivo do banco e rode migrate novamente.');
  closeDb();
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(20, 0, 0, 0);
  return d.toISOString();
}

run().catch((err) => { console.error('[seed] falhou:', err); process.exit(1); });
