import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prepara um banco isolado por arquivo de teste.
 * Deve ser chamado ANTES de importar qualquer módulo da aplicação.
 */
export function useTestDatabase(name) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dir = path.join(root, 'data', 'test');
  fs.mkdirSync(dir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const f = path.join(dir, `${name}.sqlite${suffix}`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  process.env.DATABASE_URL = `file:./data/test/${name}.sqlite`;
  process.env.NODE_ENV = 'test';
  process.env.AI_LIVE_ENABLED = 'false';
  process.env.AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-aqui';
  process.env.APP_URL = 'http://localhost:3999';
  return path.join(dir, `${name}.sqlite`);
}

/** Cria uma edição + relato autorizado + obra, prontos para o pipeline. */
export async function seedWinner({ network = 'INSTAGRAM', edition = 1, pseudonym = 'Autor Teste', comment = null } = {}) {
  const { createChallenge } = await import('../../src/domain/challenges.js');
  const { createSubmission, selectWinner } = await import('../../src/domain/submissions.js');
  const { createMangaFromSubmission } = await import('../../src/domain/mangas.js');

  const challenge = createChallenge({ edition_number: edition, theme: 'Me conte qual foi o maior mico da sua vida.', status: 'LIVE' });
  const { submission } = createSubmission({
    challenge_id: challenge.id,
    network,
    comment_text: comment || 'Entrei no elevador errado. Cheguei na reunião da diretoria de pijama. Pedi desculpa e saí de costas. Ninguém comentou nada depois.',
    author_pseudonym: pseudonym,
    votes: 1200,
    consent_status: 'GRANTED',
    genre: 'COMEDIA',
  });
  selectWinner(submission.id, { actor: 'teste' });
  const manga = createMangaFromSubmission(submission.id, { quality_mode: 'ECONOMICO', page_min: 2, page_max: 2 }, { actor: 'teste' });
  return { challenge, submission, manga };
}

/** Executa o pipeline completo em modo demo até a obra ficar em REVIEW. */
export async function runToReview(mangaId) {
  const { startScriptGeneration, startImageGeneration } = await import('../../src/ai/pipeline.js');
  const { approveScript, getManga } = await import('../../src/domain/mangas.js');
  const { tick } = await import('../../src/worker.js');

  startScriptGeneration(mangaId, { actor: 'teste' });
  await tick();
  approveScript(mangaId, { actor: 'teste' });
  startImageGeneration(mangaId, { actor: 'teste', includeCover: true });
  await tick();
  return getManga(mangaId);
}
