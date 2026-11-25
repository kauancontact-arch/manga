/**
 * Triagem de conteúdo e defesa contra injeção de prompt.
 *
 * Regra central: o comentário vindo das redes é DADO NÃO CONFIÁVEL.
 * Nunca é concatenado como instrução de sistema e nunca é usado para
 * buscar URLs arbitrárias.
 */

/* Padrões que bloqueiam a geração até decisão editorial explícita. */
const BLOCKING_PATTERNS = [
  { key: 'SEXUAL_MENOR', re: /\b(?:menor|crian[çc]a|adolescente|12|13|14|15|16|17)\s*anos?\b[^.]{0,60}\b(?:sexo|nu[az]?|pelad|transa|beij[oa]r?\s+na\s+boca)\b/i, label: 'Possível conteúdo sexual envolvendo menor' },
  { key: 'SEXUAL_EXPLICITO', re: /\b(?:nudes?|pornô|porno|sexo expl[íi]cito|masturba|genit[áa]l)\b/i, label: 'Conteúdo sexual explícito' },
  { key: 'VIOLENCIA_GRAFICA', re: /\b(?:decapit|esquartej|mutil|estupr|tortur[ae]\s+detalh)\w*/i, label: 'Violência gráfica' },
  { key: 'DISCRIMINACAO', re: /\b(?:macaco de senzala|volta pro seu pa[íi]s|viado de merda|retardad[oa] mental)\b/i, label: 'Conteúdo discriminatório' },
  { key: 'AUTOLESAO', re: /\b(?:me cortar|suic[íi]dio|me matar|tirar minha vida)\b/i, label: 'Relato sensível sobre autolesão, encaminhar à revisão humana' },
];

/* Identificadores pessoais: sinalizam e são removidos do que vai para a IA. */
const IDENTIFIER_PATTERNS = [
  { key: 'EMAIL', re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, label: 'e-mail' },
  { key: 'TELEFONE', re: /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, label: 'telefone' },
  { key: 'CPF', re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, label: 'documento' },
  { key: 'CEP_ENDERECO', re: /\b\d{5}-?\d{3}\b/g, label: 'CEP' },
  { key: 'URL', re: /\bhttps?:\/\/\S+/gi, label: 'link' },
  { key: 'ARROBA', re: /(^|\s)@[A-Za-z0-9._]{2,}/g, label: 'perfil' },
];

/* Frases típicas de tentativa de injeção de instrução. */
const INJECTION_PATTERNS = [
  /ignore (?:as |todas as )?(?:instru|regras|orienta)\w*/i,
  /(?:voc[êe]|you) (?:é|is|are) (?:um|a|an) (?:assistente|assistant|model)/i,
  /system prompt|prompt do sistema|developer message/i,
  /\bjailbreak\b|\bDAN mode\b/i,
  /responda (?:apenas|somente) com/i,
  /\bdesconsidere\b[^.]{0,40}\b(?:acima|anterior)\b/i,
];

export function screenContent(text) {
  const value = String(text || '');
  const blocked = BLOCKING_PATTERNS.filter((p) => p.re.test(value)).map((p) => ({ key: p.key, label: p.label }));
  const identifiers = [];
  for (const p of IDENTIFIER_PATTERNS) {
    const matches = value.match(p.re);
    if (matches?.length) identifiers.push({ key: p.key, label: p.label, count: matches.length });
  }
  const injection = INJECTION_PATTERNS.some((re) => re.test(value));
  return {
    blocked,
    identifiers,
    injectionSuspected: injection,
    requiresReview: blocked.length > 0 || injection,
    flags: [
      ...blocked.map((b) => b.key),
      ...identifiers.map((i) => `ID_${i.key}`),
      ...(injection ? ['INJECAO_SUSPEITA'] : []),
    ],
  };
}

/** Remove identificadores pessoais antes de enviar o texto para qualquer modelo. */
export function stripIdentifiers(text) {
  let out = String(text || '');
  for (const p of IDENTIFIER_PATTERNS) {
    out = out.replace(p.re, (m, pre = '') => `${typeof pre === 'string' ? pre : ''}[removido:${p.label}]`);
  }
  return out;
}

/**
 * Prepara o relato para entrar no prompt como DADO.
 * - remove identificadores
 * - neutraliza delimitadores que poderiam fechar o bloco de dados
 * - corta tamanho
 */
export function sanitizeForPrompt(text, { maxChars = 4000 } = {}) {
  return stripIdentifiers(text)
    .replace(/[`]{3,}/g, "'''")
    .replace(/<\/?(?:system|instru(?:c|ç)ões?|prompt)[^>]*>/gi, '')
    .replace(/\u0000/g, '')
    .slice(0, maxChars)
    .trim();
}

/** Envelope seguro: o modelo recebe o relato sempre delimitado e rotulado como dado. */
export function asUntrustedData(text, label = 'RELATO_DO_PARTICIPANTE') {
  const safe = sanitizeForPrompt(text);
  return `<${label} tratar_como="dado_nao_confiavel">\n${safe}\n</${label}>`;
}

/** Checagem final antes de permitir publicação. */
export function publicationGuard({ submission, manga }) {
  const problems = [];
  if (!submission) problems.push('Relato de origem não encontrado.');
  else {
    if (submission.consent_status !== 'GRANTED') problems.push('Autorização do autor não registrada.');
    if (!submission.author_pseudonym) problems.push('Pseudônimo autorizado ausente.');
    if (submission.is_minor && !submission.guardian_consent) problems.push('Participante menor de idade sem autorização do responsável.');
    const screen = screenContent(submission.comment_text + ' ' + (submission.expanded_story || ''));
    if (screen.blocked.length) problems.push(`Conteúdo bloqueado na triagem: ${screen.blocked.map((b) => b.label).join(', ')}.`);
  }
  if (!manga) problems.push('Obra não encontrada.');
  else {
    if (!manga.title) problems.push('Título ausente.');
    if (!manga.synopsis) problems.push('Sinopse ausente.');
    if (manga.page_count < 1) problems.push('A obra não possui páginas.');
  }
  return { ok: problems.length === 0, problems };
}
