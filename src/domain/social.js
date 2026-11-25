import { all, insert } from '../core/db.js';

/**
 * Gerador de roteiro semanal para Instagram e TikTok.
 *
 * A copy aprovada é reproduzida literalmente: a única parte variável é o tema.
 * Este módulo NÃO chama IA — é composição determinística de texto.
 */

export const SCRIPT_TEMPLATE_PARTS = Object.freeze([
  'Nós vamos transformar um comentário deste vídeo em um mangá de verdade.',
  'E ele pode ser o seu.',
  'O desafio desta semana é:',
  '[TEMA DA SEMANA]',
  'Conte sua história aqui nos comentários.',
  'O relato mais curtido será transformado gratuitamente em um mangá original, com os créditos para você.',
  'Agora é com você. Conte sua história ou curta aquela que merece virar um mangá.',
  'Você conta. A comunidade escolhe. Nós ilustramos.',
  'MangaLoop. Sua vida pode ser o próximo capítulo.',
]);

export const SCRIPT_TEMPLATE = SCRIPT_TEMPLATE_PARTS.join('\n\n');

export const THEME_PLACEHOLDER = '[TEMA DA SEMANA]';

export const X_TEMPLATE = '[TEMA DA SEMANA] O relato mais curtido nas respostas vai virar um mangá gratuito, com créditos para o autor. Você conta. A comunidade escolhe. Nós ilustramos.';

export const X_LIMIT = 280;

export const WPM_OPTIONS = [120, 150, 180];

export const THEME_PRESETS = Object.freeze([
  { key: 'P01', text: 'Me conte qual foi o maior mico da sua vida.' },
  { key: 'P02', text: 'Me conte uma história de amor que você nunca conseguiu esquecer.' },
  { key: 'P03', text: 'Me conte a coisa mais absurda que seu pet já fez.' },
  { key: 'P04', text: 'Me conte algo inexplicável que aconteceu com você e que ninguém acredita.' },
  { key: 'P05', text: 'Me conte uma memória da infância que você gostaria de viver novamente.' },
  { key: 'P06', text: 'Me conte sobre o pior encontro da sua vida.' },
  { key: 'P07', text: 'Se você acordasse em um Isekai amanhã, como gostaria que fosse sua história?' },
  { key: 'P08', text: 'Me conte a aventura mais absurda que você já viveu com seus amigos.' },
  { key: 'P09', text: 'Me conte sobre um dia que mudou completamente sua vida.' },
  { key: 'P10', text: 'Me conte uma lembrança que você gostaria de eternizar para sempre.' },
]);

/** Conta palavras do jeito que uma locução conta: sequências separadas por espaço. */
export function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/** Duração estimada em segundos. Pausas e entonação alteram a duração real. */
export function estimateDurationSec(words, wpm) {
  const rate = Number(wpm) || 150;
  if (rate <= 0) return 0;
  return (words / rate) * 60;
}

export function formatDuration(sec) {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}min ${String(s).padStart(2, '0')}s` : `${total}s`;
}

/**
 * Monta o roteiro substituindo apenas o marcador de tema.
 * O restante da copy é imutável — qualquer alteração quebraria o teste de literalidade.
 */
export function buildScript(theme, wpm = 150) {
  const cleanTheme = String(theme || '').trim();
  if (!cleanTheme) throw new Error('Tema é obrigatório.');
  const text = SCRIPT_TEMPLATE.replace(THEME_PLACEHOLDER, cleanTheme);
  const words = countWords(text);
  const durationSec = estimateDurationSec(words, wpm);
  return {
    theme: cleanTheme,
    wpm: Number(wpm),
    text,
    words,
    durationSec,
    durationLabel: formatDuration(durationSec),
    overSixty: durationSec > 60,
  };
}

/** Copy curta para o X, com contagem de caracteres e link opcional de regras. */
export function buildXCopy(theme, { rulesUrl = '' } = {}) {
  const cleanTheme = String(theme || '').trim();
  if (!cleanTheme) throw new Error('Tema é obrigatório.');
  let text = X_TEMPLATE.replace(THEME_PLACEHOLDER, cleanTheme);
  if (rulesUrl) text += ` Regras: ${rulesUrl}`;
  return {
    text,
    chars: [...text].length,
    limit: X_LIMIT,
    overLimit: [...text].length > X_LIMIT,
  };
}

/** Verifica que o roteiro gerado difere do template apenas no tema. */
export function isLiteralScript(text, theme) {
  return text === SCRIPT_TEMPLATE.replace(THEME_PLACEHOLDER, String(theme).trim());
}

export function saveSocialScript({ challengeId = null, theme, presetKey = null, wpm = 150, xCopy = null, createdBy = null }) {
  const built = buildScript(theme, wpm);
  const id = insert('social_scripts', {
    challenge_id: challengeId,
    theme: built.theme,
    preset_key: presetKey,
    wpm: built.wpm,
    word_count: built.words,
    duration_sec: Number(built.durationSec.toFixed(2)),
    script_text: built.text,
    x_copy: xCopy,
    x_char_count: xCopy ? [...xCopy].length : null,
    created_by: createdBy,
  });
  return { id, ...built };
}

export function socialHistory(limit = 30) {
  return all('SELECT * FROM social_scripts ORDER BY created_at DESC LIMIT ?', [limit]);
}

/** Sugere o próximo preset ainda não utilizado, em ordem. */
export function nextPreset() {
  const used = new Set(all('SELECT preset_key FROM social_scripts WHERE preset_key IS NOT NULL').map((r) => r.preset_key));
  return THEME_PRESETS.find((p) => !used.has(p.key)) || THEME_PRESETS[0];
}
