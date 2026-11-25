import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config/env.js';

/**
 * Versão dos arquivos estáticos.
 *
 * Os estáticos são servidos com cache longo, o que é bom para o leitor e
 * ruim depois de um deploy: o navegador continua com a versão anterior.
 * A assinatura do conteúdo entra na URL, então um arquivo novo tem URL nova
 * e o cache antigo deixa de ser usado sozinho.
 */
const DIR = path.join(ROOT, 'src', 'web', 'assets');
const cache = new Map();

export function assetVersion(file) {
  if (cache.has(file)) return cache.get(file);
  let marca = 'dev';
  try {
    const conteudo = fs.readFileSync(path.join(DIR, file));
    marca = crypto.createHash('sha1').update(conteudo).digest('base64url').slice(0, 10);
  } catch {
    marca = String(Date.now());
  }
  cache.set(file, marca);
  return marca;
}

/** URL do estático já versionada. */
export function assetUrl(file) {
  return `/estatico/${file}?v=${assetVersion(file)}`;
}
