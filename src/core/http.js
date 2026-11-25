import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { RawHtml } from './html.js';

export const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB (uploads de capa)

/* --------------------------------- rotas -------------------------------- */

export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler, opts = {}) => {
    routes.push({ method, ...compile(pattern), handler, opts });
  };
  return {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    put: (p, h, o) => add('PUT', p, h, o),
    del: (p, h, o) => add('DELETE', p, h, o),
    routes,
    match(method, pathname) {
      let pathMatched = false;
      for (const route of routes) {
        const m = route.regex.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        const params = {};
        route.keys.forEach((k, i) => { params[k] = safeDecode(m[i + 1]); });
        return { route, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
}

function compile(pattern) {
  const keys = [];
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z0-9_]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })
    .replace(/\*$/, '(.*)');
  if (pattern.endsWith('*')) keys.push('wildcard');
  return { regex: new RegExp(`^${regexStr}$`), keys, pattern };
}

function safeDecode(v) { try { return decodeURIComponent(v); } catch { return v; } }

/* -------------------------------- cookies ------------------------------- */

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = safeDecode(part.slice(i + 1).trim());
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) parts.push(`Expires=${new Date(opts.expires).toUTCString()}`);
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.sameSite !== null) parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.secure ?? env.isProd) parts.push('Secure');
  return parts.join('; ');
}

/* --------------------------------- corpo -------------------------------- */

export async function readBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error('Corpo da requisicao excede o limite permitido.');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function parseBody(req) {
  const type = String(req.headers['content-type'] || '');
  if (req.method === 'GET' || req.method === 'HEAD') return { fields: {}, files: {} };
  const buf = await readBody(req);
  if (!buf.length) return { fields: {}, files: {} };

  if (type.includes('application/json')) {
    try { return { fields: JSON.parse(buf.toString('utf8')), files: {} }; }
    catch { const e = new Error('JSON invalido.'); e.statusCode = 400; throw e; }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return { fields: expandFields(new URLSearchParams(buf.toString('utf8'))), files: {} };
  }
  if (type.includes('multipart/form-data')) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
    if (!boundary) { const e = new Error('multipart sem boundary.'); e.statusCode = 400; throw e; }
    return parseMultipart(buf, boundary[1] || boundary[2].trim());
  }
  return { fields: {}, files: {} };
}

function expandFields(params) {
  const out = {};
  for (const [key, value] of params.entries()) {
    if (key.endsWith('[]')) {
      const k = key.slice(0, -2);
      (out[k] ||= []).push(value);
    } else if (out[key] !== undefined) {
      out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Parser multipart/form-data minimo, suficiente para campos e um upload por campo. */
function parseMultipart(buf, boundary) {
  const fields = {};
  const files = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let start = buf.indexOf(delimiter);
  if (start === -1) return { fields, files };
  start += delimiter.length;
  while (start < buf.length) {
    if (buf.slice(start, start + 2).toString() === '--') break;
    if (buf.slice(start, start + 2).toString() === '\r\n') start += 2;
    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headerText = buf.slice(start, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;
    const next = buf.indexOf(delimiter, bodyStart);
    if (next === -1) break;
    const body = buf.slice(bodyStart, next - 2); // remove \r\n final
    const nameMatch = /name="([^"]*)"/i.exec(headerText);
    const fileMatch = /filename="([^"]*)"/i.exec(headerText);
    const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);
    const name = nameMatch ? nameMatch[1] : null;
    if (name) {
      if (fileMatch && fileMatch[1]) {
        files[name] = {
          filename: path.basename(fileMatch[1]).slice(0, 180),
          mime: (typeMatch ? typeMatch[1].trim() : 'application/octet-stream').toLowerCase(),
          buffer: body,
          size: body.length,
        };
      } else if (name.endsWith('[]')) {
        (fields[name.slice(0, -2)] ||= []).push(body.toString('utf8'));
      } else if (fields[name] !== undefined) {
        fields[name] = Array.isArray(fields[name]) ? [...fields[name], body.toString('utf8')] : [fields[name], body.toString('utf8')];
      } else {
        fields[name] = body.toString('utf8');
      }
    }
    start = next + delimiter.length;
  }
  return { fields, files };
}

/* ------------------------------- respostas ------------------------------ */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export function cspHeader(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}

export function createContext(req, res) {
  const url = new URL(req.url, `${env.appUrl}`);
  const nonce = crypto.randomBytes(16).toString('base64');
  const ctx = {
    req,
    res,
    url,
    method: req.method,
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    searchParams: url.searchParams,
    cookies: parseCookies(req.headers.cookie),
    params: {},
    fields: {},
    files: {},
    nonce,
    user: null,
    session: null,
    headers: { ...SECURITY_HEADERS, 'Content-Security-Policy': cspHeader(nonce) },
    setCookies: [],
    setCookie(name, value, opts) { ctx.setCookies.push(serializeCookie(name, value, opts)); },
    clearCookie(name) { ctx.setCookies.push(serializeCookie(name, '', { maxAge: 0 })); },
    ip: clientIp(req),
    flush(status, headers, body) {
      const out = { ...ctx.headers, ...headers };
      if (ctx.setCookies.length) out['Set-Cookie'] = ctx.setCookies;
      res.writeHead(status, out);
      res.end(body);
    },
    html(body, status = 200, extra = {}) {
      const payload = body instanceof RawHtml ? body.value : String(body);
      ctx.flush(status, { 'Content-Type': 'text/html; charset=utf-8', ...extra }, payload);
    },
    json(data, status = 200, extra = {}) {
      ctx.flush(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }, JSON.stringify(data));
    },
    text(body, status = 200, extra = {}) {
      ctx.flush(status, { 'Content-Type': 'text/plain; charset=utf-8', ...extra }, body);
    },
    redirect(location, status = 303) {
      ctx.flush(status, { Location: location }, '');
    },
    /** Redireciona preservando uma mensagem curta para o proximo render. */
    flash(location, type, message) {
      const sep = location.includes('?') ? '&' : '?';
      ctx.redirect(`${location}${sep}${type}=${encodeURIComponent(message)}`);
    },
  };
  return ctx;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || '0.0.0.0';
}

/* ----------------------------- estaticos -------------------------------- */

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

export function serveStatic(ctx, baseDir, relative, { maxAge = 3600 } = {}) {
  const clean = path.normalize(relative).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(baseDir, clean);
  if (!full.startsWith(path.resolve(baseDir))) { ctx.text('Não encontrado', 404); return true; }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return false;
  const body = fs.readFileSync(full);
  const etag = `W/"${crypto.createHash('sha1').update(body).digest('base64url')}"`;
  if (ctx.req.headers['if-none-match'] === etag) { ctx.flush(304, {}, ''); return true; }
  ctx.flush(200, {
    'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': `public, max-age=${maxAge}`,
    ETag: etag,
  }, body);
  return true;
}

export { MIME };
