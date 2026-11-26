import { aiMode, env } from '../config/env.js';
import { SCRIPT_JSON_SCHEMA } from './prompts.js';

/**
 * Cliente OpenAI — exclusivamente backend.
 *
 * Nota de implementação: o SDK oficial (`openai`) não pôde ser instalado neste
 * ambiente (o registro de pacotes está bloqueado). Este módulo fala o mesmo
 * protocolo HTTP do SDK e está isolado atrás de uma interface pequena
 * (generateScript / generateImage), de modo que trocar por
 * `import OpenAI from 'openai'` exige mudar apenas este arquivo.
 * Ver docs/INTEGRACAO-OPENAI.md.
 *
 * Nenhum nome de modelo é fixado no código: tudo vem de OPENAI_TEXT_MODEL e
 * OPENAI_IMAGE_MODEL, conferidos na documentação oficial vigente.
 */

const TIMEOUT_MS = 120000;

export class OpenAiError extends Error {
  constructor(message, { status = 0, fatal = false, body = null } = {}) {
    super(message);
    this.name = 'OpenAiError';
    this.status = status;
    this.fatal = fatal;
    this.body = body;
  }
}

function assertLive() {
  if (aiMode() !== 'live') {
    throw new OpenAiError('Modo demonstração ativo: nenhuma chamada paga é feita.', { fatal: true });
  }
}

async function request(path, payload, { timeoutMs = TIMEOUT_MS } = {}) {
  assertLive();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${env.openai.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new OpenAiError(`Tempo limite de ${timeoutMs}ms excedido.`, { status: 408 });
    throw new OpenAiError(`Falha de rede ao chamar a API: ${err.message}`, { status: 0 });
  }
  clearTimeout(timer);

  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }

  if (!res.ok) {
    const message = body?.error?.message || `HTTP ${res.status}`;
    // 400/401/403/404/422 não adiantam repetir; 429 e 5xx sim.
    const fatal = [400, 401, 403, 404, 422].includes(res.status);
    throw new OpenAiError(`API respondeu ${res.status}: ${message}`, { status: res.status, fatal, body });
  }
  return body;
}

/** GET simples na API. Usado só para diagnóstico; não gera cobrança. */
async function getJson(path, { timeoutMs = 20000 } = {}) {
  if (!env.openai.apiKey) throw new OpenAiError('Nenhuma chave configurada.', { fatal: true });
  const res = await fetch(`${env.openai.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${env.openai.apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    throw new OpenAiError(`API respondeu ${res.status}: ${body?.error?.message || 'erro'}`, { status: res.status, body });
  }
  return body;
}

/**
 * Verifica a chave e confirma que os modelos configurados existem na conta.
 * Chama apenas /models, que não é cobrado.
 */
export async function checkConnection() {
  const body = await getJson('/models');
  const ids = (body?.data || []).map((m) => m.id);
  return {
    ok: true,
    total: ids.length,
    textModelAvailable: ids.includes(env.openai.textModel),
    imageModelAvailable: ids.includes(env.openai.imageModel),
    imageModels: ids.filter((id) => id.startsWith('gpt-image')).sort(),
    sampleTextModels: ids.filter((id) => id.startsWith('gpt-6') || id.startsWith('gpt-5')).sort().slice(0, 12),
  };
}

/* ------------------------------- texto ---------------------------------- */

/**
 * Gera o roteiro estruturado. Usa a Responses API por padrão e aceita a rota
 * de chat completions para modelos que ainda a exigem (OPENAI_TEXT_API=chat).
 */
/**
 * Gera o roteiro estruturado.
 *
 * O formato de saída é negociado em escada: tenta json_schema, cai para
 * json_object e, por último, texto livre (o prompt já exige JSON puro).
 * Assim um modelo que não aceite um desses modos não derruba a geração.
 */
/**
 * Tempo de espera de um roteiro, em milissegundos.
 *
 * Era fixo em 120000, o que bastava para 4 páginas e estourava a partir de
 * uma dúzia: o modelo ainda estava escrevendo quando a conexão era cortada, e
 * as três tentativas morriam no mesmo ponto. Cresce junto com o teto de saída,
 * porque é ele que diz quanto texto ainda falta vir.
 */
export const scriptTimeoutMs = (maxOutputTokens) => Math.min(120000 + Math.max(0, maxOutputTokens - 6000) * 14, 540000);

export async function generateScript({ systemPrompt, userPrompt, maxOutputTokens = 6000 }) {
  const api = (process.env.OPENAI_TEXT_API || 'responses').toLowerCase();
  const model = env.openai.textModel;

  const formatos = [
    { nome: 'json_schema', responses: { format: { type: 'json_schema', ...SCRIPT_JSON_SCHEMA } }, chat: { type: 'json_schema', json_schema: SCRIPT_JSON_SCHEMA } },
    { nome: 'json_object', responses: { format: { type: 'json_object' } }, chat: { type: 'json_object' } },
    { nome: 'livre', responses: null, chat: null },
  ];

  let ultimoErro = null;
  for (const formato of formatos) {
    try {
      if (api === 'chat') {
        const payload = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_completion_tokens: maxOutputTokens,
        };
        if (formato.chat) payload.response_format = formato.chat;
        const body = await request('/chat/completions', payload, { timeoutMs: scriptTimeoutMs(maxOutputTokens) });
        return {
          text: body?.choices?.[0]?.message?.content ?? '',
          model: body?.model ?? model,
          usage: { input: body?.usage?.prompt_tokens ?? null, output: body?.usage?.completion_tokens ?? null },
          format: formato.nome,
          raw: body,
        };
      }

      const payload = {
        model,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_output_tokens: maxOutputTokens,
      };
      if (formato.responses) payload.text = formato.responses;
      const body = await request('/responses', payload, { timeoutMs: scriptTimeoutMs(maxOutputTokens) });
      return {
        text: extractResponsesText(body),
        model: body?.model ?? model,
        usage: { input: body?.usage?.input_tokens ?? null, output: body?.usage?.output_tokens ?? null },
        format: formato.nome,
        raw: body,
      };
    } catch (err) {
      ultimoErro = err;
      // Só vale tentar outro formato quando a recusa foi do próprio parâmetro.
      const recusaDeFormato = err instanceof OpenAiError && err.status === 400;
      if (!recusaDeFormato) throw err;
      console.warn(`[openai] formato ${formato.nome} recusado (${err.message}); tentando o próximo.`);
    }
  }
  throw ultimoErro ?? new OpenAiError('Nenhum formato de saída aceito pelo modelo.', { fatal: true });
}

function extractResponsesText(body) {
  if (typeof body?.output_text === 'string' && body.output_text) return body.output_text;
  const chunks = [];
  for (const item of body?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('');
}

/* ------------------------------- imagem --------------------------------- */

/**
 * Gera uma imagem. `quality` e `size` são políticas internas mapeadas aqui
 * para os valores aceitos pelo modelo configurado.
 */
export async function generateImage({ prompt, size = '1024x1536', quality = 'low', referenceImages = [] }) {
  // WebP corta a página de alguns megabytes para algumas centenas de KB, o que
  // muda a experiência de leitura no celular. Se o modelo não aceitar o
  // parâmetro, a chamada é repetida sem ele e o retorno volta a ser PNG.
  const formato = (process.env.OPENAI_IMAGE_FORMAT || 'webp').toLowerCase();
  const compressao = Number(process.env.OPENAI_IMAGE_COMPRESSION || 82);
  const payload = {
    model: env.openai.imageModel,
    prompt,
    size,
    quality,
    n: 1,
  };
  if (formato && formato !== 'png') {
    payload.output_format = formato;
    if (['webp', 'jpeg'].includes(formato) && Number.isFinite(compressao)) {
      payload.output_compression = Math.max(1, Math.min(100, compressao));
    }
  }
  // Entrada de imagem (referência de personagem) só é enviada quando suportada.
  if (referenceImages.length && process.env.OPENAI_IMAGE_SUPPORTS_REFERENCE === 'true') {
    payload.image = referenceImages;
  }

  let body;
  try {
    body = await request('/images/generations', payload, { timeoutMs: 180000 });
  } catch (err) {
    const recusouFormato = err instanceof OpenAiError && err.status === 400 && payload.output_format;
    if (!recusouFormato) throw err;
    console.warn(`[openai] formato ${payload.output_format} recusado (${err.message}); repetindo em PNG.`);
    delete payload.output_format;
    delete payload.output_compression;
    body = await request('/images/generations', payload, { timeoutMs: 180000 });
  }
  const first = body?.data?.[0];
  if (!first?.b64_json && !first?.url) {
    throw new OpenAiError('A API não retornou imagem utilizável.', { status: 502, body });
  }

  let buffer;
  if (first.b64_json) {
    buffer = Buffer.from(first.b64_json, 'base64');
  } else {
    // A URL vem da própria API da OpenAI; nunca de conteúdo de usuário.
    const url = new URL(first.url);
    if (!/(^|\.)openai\.com$|(^|\.)oaiusercontent\.com$/.test(url.hostname)) {
      throw new OpenAiError('URL de imagem fora do domínio esperado.', { status: 502, fatal: true });
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new OpenAiError(`Falha ao baixar a imagem (${res.status}).`, { status: res.status });
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const mime = ({ webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' })[payload.output_format || 'png'] || 'image/png';
  return {
    buffer,
    mime,
    model: body?.model ?? env.openai.imageModel,
    usage: {
      images: 1,
      input: body?.usage?.input_tokens ?? null,
      output: body?.usage?.output_tokens ?? null,
    },
    raw: { created: body?.created, size, quality, format: payload.output_format || 'png' },
  };
}

/** Diagnóstico de configuração para a tela de Configurações (não faz chamada paga). */
export function connectionStatus() {
  return {
    mode: aiMode(),
    hasKey: !!env.openai.apiKey,
    textModel: env.openai.textModel || null,
    imageModel: env.openai.imageModel || null,
    baseUrl: env.openai.baseUrl,
    liveEnabled: env.openai.liveEnabled,
    textApi: (process.env.OPENAI_TEXT_API || 'responses').toLowerCase(),
    supportsImageReference: process.env.OPENAI_IMAGE_SUPPORTS_REFERENCE === 'true',
    costGate: env.budget.gateEnabled,
  };
}
