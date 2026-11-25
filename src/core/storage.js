import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { get, insert } from './db.js';
import { newId } from './ids.js';

/**
 * Armazenamento de objetos.
 * - driver "local": disco, separado em private/ e public/ (desenvolvimento).
 * - driver "s3":    qualquer servico compativel com S3, assinado com SigV4.
 * Originais ficam sempre privados; apenas derivados publicados vao para public/.
 */

const ALLOWED_UPLOAD_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function extFor(mime) {
  return ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'application/json': '.json' })[mime] || '.bin';
}

/** Verificacao de assinatura do arquivo: nao confia na extensao nem no content-type. */
export function sniffMime(buffer) {
  const b = buffer;
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  const head = b.slice(0, 400).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

/** SVG enviado por upload e sanitizado: remove script, handlers e referencias externas. */
export function sanitizeSvg(svgText) {
  return String(svgText)
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*foreignObject[\s\S]*?<\s*\/\s*foreignObject\s*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')\s*(?!#)(javascript:|data:text\/html)[^"']*\2/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '');
}

export function validateUpload(file) {
  if (!file || !file.size) return { ok: false, error: 'Arquivo vazio.' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `Arquivo acima de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` };
  const sniffed = sniffMime(file.buffer);
  if (!sniffed) return { ok: false, error: 'Formato nao reconhecido. Use PNG, JPEG, WebP ou SVG.' };
  if (!ALLOWED_UPLOAD_MIME.has(sniffed)) return { ok: false, error: 'Tipo de arquivo nao permitido.' };
  let buffer = file.buffer;
  if (sniffed === 'image/svg+xml') buffer = Buffer.from(sanitizeSvg(buffer.toString('utf8')), 'utf8');
  return { ok: true, mime: sniffed, buffer };
}

/* ------------------------------ drivers --------------------------------- */

function localPath(key) {
  const full = path.join(env.storage.localDir, key);
  if (!path.resolve(full).startsWith(path.resolve(env.storage.localDir))) throw new Error('Chave de armazenamento invalida.');
  return full;
}

const localDriver = {
  async put(key, buffer) {
    const full = localPath(key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
    return { key };
  },
  async getBuffer(key) {
    const full = localPath(key);
    return fs.existsSync(full) ? fs.readFileSync(full) : null;
  },
  async remove(key) {
    const full = localPath(key);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  },
};

/* --------------------------- S3 (SigV4) --------------------------------- */

function hmac(key, data) { return crypto.createHmac('sha256', key).update(data).digest(); }
function sha256hex(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

function signRequest({ method, key, payload, contentType, acl }) {
  const s = env.storage;
  const url = new URL(`${s.endpoint.replace(/\/+$/, '')}/${s.bucket}/${key}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = s.region || 'us-east-1';
  const payloadHash = sha256hex(payload ?? '');

  const headers = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  if (acl) headers['x-amz-acl'] = acl;

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${String(headers[h]).trim()}\n`).join('');
  const signedHeaderList = signedHeaders.join(';');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaderList, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  let signing = hmac(`AWS4${s.secretKey}`, dateStamp);
  signing = hmac(signing, region);
  signing = hmac(signing, 's3');
  signing = hmac(signing, 'aws4_request');
  const signature = crypto.createHmac('sha256', signing).update(stringToSign).digest('hex');

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${s.accessKey}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`;
  return { url: url.toString(), headers };
}

const s3Driver = {
  async put(key, buffer, { mime, visibility } = {}) {
    const { url, headers } = signRequest({
      method: 'PUT', key, payload: buffer, contentType: mime,
      acl: visibility === 'public' ? 'public-read' : 'private',
    });
    const res = await fetch(url, { method: 'PUT', headers, body: buffer });
    if (!res.ok) throw new Error(`Falha ao enviar objeto (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return { key };
  },
  async getBuffer(key) {
    const { url, headers } = signRequest({ method: 'GET', key, payload: '' });
    const res = await fetch(url, { method: 'GET', headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Falha ao ler objeto (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  },
  async remove(key) {
    const { url, headers } = signRequest({ method: 'DELETE', key, payload: '' });
    await fetch(url, { method: 'DELETE', headers });
  },
};

function driver() {
  if (env.storage.driver === 's3') {
    const missing = ['bucket', 'endpoint', 'accessKey', 'secretKey'].filter((k) => !env.storage[k]);
    if (missing.length) throw new Error(`STORAGE_DRIVER=s3 exige: ${missing.join(', ')}`);
    return s3Driver;
  }
  return localDriver;
}

/* ------------------------------- API ------------------------------------ */

/**
 * Grava um objeto e registra o Asset correspondente.
 * `visibility: 'private'` para originais e rascunhos; 'public' somente apos publicacao.
 */
export async function putAsset(buffer, { mime, visibility = 'private', origin = 'demo', width = null, height = null, prefix = 'misc' }) {
  const id = newId();
  const key = `${visibility}/${prefix}/${id}${extFor(mime)}`;
  await driver().put(key, buffer, { mime, visibility });
  insert('assets', {
    id, storage_key: key, visibility, mime, bytes: buffer.length,
    width, height, checksum: sha256hex(buffer).slice(0, 32), origin,
  });
  return { id, key, mime, bytes: buffer.length, visibility };
}

export async function readAsset(assetId) {
  const asset = get('SELECT * FROM assets WHERE id = ?', [assetId]);
  if (!asset) return null;
  const buffer = await driver().getBuffer(asset.storage_key);
  return buffer ? { asset, buffer } : null;
}

export function assetRow(assetId) {
  return assetId ? get('SELECT * FROM assets WHERE id = ?', [assetId]) : null;
}

/** URL servida pela aplicacao. Privados exigem sessao admin. */
export function assetUrl(assetId, { download = false } = {}) {
  if (!assetId) return null;
  const asset = assetRow(assetId);
  if (!asset) return null;
  if (asset.visibility === 'public' && env.storage.publicBaseUrl) {
    return `${env.storage.publicBaseUrl.replace(/\/+$/, '')}/${asset.storage_key}`;
  }
  return `/midia/${assetId}${download ? '?download=1' : ''}`;
}

export async function promoteAssetToPublic(assetId) {
  const found = await readAsset(assetId);
  if (!found) return null;
  if (found.asset.visibility === 'public') return found.asset;
  const newKey = found.asset.storage_key.replace(/^private\//, 'public/');
  await driver().put(newKey, found.buffer, { mime: found.asset.mime, visibility: 'public' });
  const { run } = await import('./db.js');
  run('UPDATE assets SET storage_key = ?, visibility = ? WHERE id = ?', [newKey, 'public', assetId]);
  return { ...found.asset, storage_key: newKey, visibility: 'public' };
}

export { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME };
