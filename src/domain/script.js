import { z, ValidationError } from '../core/schema.js';

/**
 * Roteiro de capítulo — contrato entre a geração textual e o restante do pipeline.
 * Validado por schema antes de qualquer imagem paga ser gerada.
 */

export const FRAMINGS = ['PLANO_ABERTO', 'PLANO_MEDIO', 'CLOSE', 'CLOSE_EXTREMO', 'PLONGEE', 'CONTRA_PLONGEE', 'DETALHE', 'PANORAMICA'];
export const BALLOON_TYPES = ['FALA', 'PENSAMENTO', 'GRITO', 'SUSSURRO', 'NARRACAO'];

const characterSchema = z.object({
  id: z.string({ min: 1, max: 40 }),
  nome: z.string({ min: 1, max: 80 }),
  papel: z.string({ max: 60 }).default('secundário'),
  descricao: z.string({ min: 5, max: 900 }),
  roupa: z.string({ max: 400 }).default(''),
  proporcoes: z.string({ max: 200 }).default(''),
  acessorios: z.string({ max: 300 }).default(''),
  paleta: z.string({ max: 200 }).default(''),
  regras_traco: z.string({ max: 300 }).default(''),
});

const sceneSchema = z.object({
  id: z.string({ min: 1, max: 40 }),
  nome: z.string({ min: 1, max: 120 }),
  descricao: z.string({ max: 800 }).default(''),
});

const dialogueSchema = z.object({
  personagem_id: z.string({ max: 40 }).default(''),
  texto: z.string({ min: 1, max: 220 }),
  tipo: z.enum(BALLOON_TYPES).default('FALA'),
});

const frameSchema = z.object({
  id: z.string({ min: 1, max: 40 }),
  ordem: z.int({ min: 1, max: 12 }),
  enquadramento: z.enum(FRAMINGS).default('PLANO_MEDIO'),
  cenario_id: z.string({ max: 40 }).default(''),
  personagens_ids: z.array(z.string({ max: 40 })).default([]),
  acao: z.string({ min: 3, max: 600 }),
  expressao: z.string({ max: 300 }).default(''),
  dialogos: z.array(dialogueSchema, { max: 4 }).default([]),
  narrador: z.string({ max: 220 }).default(''),
  efeitos_sonoros: z.array(z.string({ max: 24 }), { max: 4 }).default([]),
  prompt_visual: z.string({ min: 10, max: 1200 }),
  alt_text: z.string({ min: 5, max: 400 }),
});

const pageSchema = z.object({
  numero: z.int({ min: 1, max: 12 }),
  resumo: z.string({ max: 400 }).default(''),
  alt_text: z.string({ min: 5, max: 600 }),
  quadros: z.array(frameSchema, { min: 1, max: 8 }),
});

const coverSchema = z.object({
  conceito: z.string({ max: 600 }).default(''),
  prompt_visual: z.string({ min: 10, max: 1200 }),
  alt_text: z.string({ min: 5, max: 400 }),
});

export const scriptSchema = z.object({
  titulo: z.string({ min: 2, max: 120 }),
  sinopse: z.string({ min: 10, max: 900 }),
  genero: z.string({ max: 40 }).default(''),
  tom_narrativo: z.string({ max: 40 }).default(''),
  tom_visual: z.string({ max: 40 }).default(''),
  fatos_preservados: z.array(z.string({ max: 300 }), { max: 20 }).default([]),
  elementos_ficcionalizados: z.array(z.string({ max: 300 }), { max: 20 }).default([]),
  quantidade_paginas: z.int({ min: 1, max: 12 }),
  personagens: z.array(characterSchema, { min: 1, max: 8 }),
  cenarios: z.array(sceneSchema, { max: 8 }).default([]),
  paginas: z.array(pageSchema, { min: 1, max: 12 }),
  capa: coverSchema,
});

/** Extrai JSON de uma resposta que pode vir com cercas de código ou texto em volta. */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  try { return JSON.parse(candidate); } catch { /* tenta recorte */ }
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  const sliced = candidate.slice(first, last + 1);
  try { return JSON.parse(sliced); } catch { /* tenta reparos simples */ }
  const repaired = sliced
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  try { return JSON.parse(repaired); } catch { return null; }
}

/**
 * Normaliza um roteiro antes da validação: preenche IDs e ordens ausentes,
 * reenumera páginas e respeita o limite de páginas configurado.
 */
export function normalizeScript(rawInput, { maxPages = 8 } = {}) {
  const raw = rawInput && typeof rawInput === 'object' ? { ...rawInput } : {};
  const characters = Array.isArray(raw.personagens) ? raw.personagens : [];
  raw.personagens = characters.map((c, i) => ({
    ...c,
    id: String(c?.id || `p${i + 1}`).slice(0, 40),
    nome: c?.nome || `Personagem ${i + 1}`,
    descricao: c?.descricao || 'Descrição não informada pelo modelo; completar na revisão.',
  }));
  const validIds = new Set(raw.personagens.map((c) => c.id));

  const scenes = Array.isArray(raw.cenarios) ? raw.cenarios : [];
  raw.cenarios = scenes.map((s, i) => ({ ...s, id: String(s?.id || `c${i + 1}`).slice(0, 40), nome: s?.nome || `Cenário ${i + 1}` }));

  let pages = Array.isArray(raw.paginas) ? raw.paginas : [];
  pages = pages.slice(0, maxPages).map((p, pi) => {
    const frames = (Array.isArray(p?.quadros) ? p.quadros : []).slice(0, 8).map((f, fi) => ({
      ...f,
      id: String(f?.id || `q${pi + 1}_${fi + 1}`).slice(0, 40),
      ordem: Number.isInteger(f?.ordem) ? f.ordem : fi + 1,
      personagens_ids: (Array.isArray(f?.personagens_ids) ? f.personagens_ids : []).filter((id) => validIds.has(id)),
      dialogos: (Array.isArray(f?.dialogos) ? f.dialogos : []).slice(0, 4).map((d) => ({
        ...d,
        personagem_id: validIds.has(d?.personagem_id)
          ? d.personagem_id
          : (raw.personagens.length === 1 ? raw.personagens[0].id : ''),
        texto: String(d?.texto || '').slice(0, 220),
        tipo: BALLOON_TYPES.includes(d?.tipo) ? d.tipo : 'FALA',
      })).filter((d) => d.texto.trim()),
      efeitos_sonoros: (Array.isArray(f?.efeitos_sonoros) ? f.efeitos_sonoros : []).slice(0, 4).map((s) => String(s).slice(0, 24)),
      alt_text: String(f?.alt_text || f?.acao || 'Quadro sem descrição acessível.').slice(0, 400),
      prompt_visual: String(f?.prompt_visual || f?.acao || '').slice(0, 1200),
      acao: String(f?.acao || f?.prompt_visual || 'Ação não descrita.').slice(0, 600),
    }));
    frames.sort((a, b) => a.ordem - b.ordem);
    frames.forEach((f, i) => { f.ordem = i + 1; });
    return {
      ...p,
      numero: pi + 1,
      alt_text: String(p?.alt_text || `Página ${pi + 1}.`).slice(0, 600),
      quadros: frames.length ? frames : [{
        id: `q${pi + 1}_1`, ordem: 1, enquadramento: 'PLANO_MEDIO', cenario_id: '', personagens_ids: [],
        acao: 'Quadro vazio gerado para manter a estrutura; revisar.', expressao: '', dialogos: [], narrador: '',
        efeitos_sonoros: [], prompt_visual: 'Cena simples em branco, aguardando revisão editorial.',
        alt_text: 'Quadro pendente de revisão.',
      }],
    };
  });
  raw.paginas = pages;
  raw.quantidade_paginas = pages.length;
  raw.capa = {
    conceito: raw?.capa?.conceito || '',
    prompt_visual: raw?.capa?.prompt_visual || `Capa de mangá para "${raw.titulo || 'obra'}".`,
    alt_text: raw?.capa?.alt_text || `Capa de ${raw.titulo || 'obra'}.`,
  };
  raw.fatos_preservados = Array.isArray(raw.fatos_preservados) ? raw.fatos_preservados : [];
  raw.elementos_ficcionalizados = Array.isArray(raw.elementos_ficcionalizados) ? raw.elementos_ficcionalizados : [];
  return raw;
}

/** Valida e devolve o roteiro normalizado, ou lança ValidationError. */
export function parseScript(raw, { maxPages = 8, minPages = 1 } = {}) {
  const normalized = normalizeScript(raw, { maxPages });
  const parsed = scriptSchema.parse(normalized);
  const issues = [];
  if (parsed.paginas.length < minPages) issues.push({ path: 'paginas', message: `o roteiro precisa de ao menos ${minPages} página(s)` });
  if (parsed.paginas.length > maxPages) issues.push({ path: 'paginas', message: `o roteiro excede o limite de ${maxPages} páginas` });
  const ids = new Set();
  for (const page of parsed.paginas) {
    for (const frame of page.quadros) {
      if (ids.has(frame.id)) issues.push({ path: `paginas[${page.numero}]`, message: `id de quadro duplicado: ${frame.id}` });
      ids.add(frame.id);
    }
  }
  if (issues.length) throw new ValidationError(issues);
  return parsed;
}

/** Tentativa de parse com reparo limitado (usada nas respostas do modelo). */
export function parseModelScript(text, options = {}) {
  const raw = extractJson(text);
  if (!raw) return { ok: false, error: 'Resposta do modelo não continha JSON válido.' };
  try {
    return { ok: true, script: parseScript(raw, options) };
  } catch (err) {
    return { ok: false, error: err.message, issues: err.issues || [] };
  }
}

/** Transcrição acessível dos diálogos (exibida no leitor público). */
export function scriptTranscript(script) {
  const lines = [];
  for (const page of script.paginas) {
    lines.push(`Página ${page.numero}`);
    for (const frame of page.quadros) {
      const who = (id) => script.personagens.find((c) => c.id === id)?.nome || 'Personagem';
      const parts = [];
      if (frame.narrador) parts.push(`Narração: ${frame.narrador}`);
      for (const d of frame.dialogos) {
        const prefix = d.tipo === 'PENSAMENTO' ? ' (pensamento)' : d.tipo === 'GRITO' ? ' (gritando)' : d.tipo === 'SUSSURRO' ? ' (sussurrando)' : '';
        parts.push(`${who(d.personagem_id)}${prefix}: ${d.texto}`);
      }
      if (frame.efeitos_sonoros.length) parts.push(`Efeitos: ${frame.efeitos_sonoros.join(', ')}`);
      lines.push(`  Quadro ${frame.ordem}: ${frame.alt_text}${parts.length ? `\n    ${parts.join('\n    ')}` : ''}`);
    }
  }
  return lines.join('\n');
}

export function countFrames(script) {
  return script.paginas.reduce((sum, p) => sum + p.quadros.length, 0);
}
