import http from 'node:http';
import path from 'node:path';
import { assertProductionEnv, env, ROOT } from './config/env.js';
import { audit } from './core/audit.js';
import { readSession, SESSION_COOKIE, csrfToken, verifyCsrf, rateLimit } from './core/auth.js';
import { migrate } from './core/db.js';
import { bootstrapAdmin } from './core/bootstrap.js';
import { createContext, createRouter, parseBody, serveStatic } from './core/http.js';
import { registerPublicRoutes, renderError, renderNotFound } from './web/public.js';
import { registerAdminRoutes } from './web/admin.js';
import { startWorker } from './worker.js';

const STATIC_DIR = path.join(ROOT, 'src', 'web', 'assets');

export function buildRouter() {
  const router = createRouter();
  registerAdminRoutes(router);
  registerPublicRoutes(router);
  return router;
}

export function createApp() {
  const router = buildRouter();

  return async function handle(req, res) {
    const ctx = createContext(req, res);
    try {
      // Estáticos
      if (ctx.pathname.startsWith('/estatico/')) {
        if (serveStatic(ctx, STATIC_DIR, ctx.pathname.replace('/estatico/', ''), { maxAge: 86400 })) return;
        return ctx.text('Não encontrado', 404);
      }

      // Sessão administrativa (também usada para liberar mídia privada)
      const token = ctx.cookies[SESSION_COOKIE];
      const found = token ? readSession(token) : null;
      if (found) {
        ctx.user = found.user;
        ctx.session = found.session;
        ctx.csrf = csrfToken(found.session);
      }

      const match = router.match(ctx.method, ctx.pathname);
      if (!match) return renderNotFound(ctx);
      if (match.methodNotAllowed) return ctx.text('Método não permitido', 405);

      ctx.params = match.params;

      if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
        const limiter = rateLimit('post', `${ctx.ip}:${ctx.pathname}`, { limit: 60, windowMs: 60000 });
        if (!limiter.allowed) {
          return ctx.text(`Muitas requisições. Tente novamente em ${limiter.retryAfterSec}s.`, 429, { 'Retry-After': String(limiter.retryAfterSec) });
        }
        const parsed = await parseBody(req);
        ctx.fields = parsed.fields;
        ctx.files = parsed.files;

        // CSRF para qualquer rota autenticada de escrita.
        if (!match.route.opts?.skipCsrf && ctx.pathname.startsWith('/admin')) {
          const sent = ctx.fields._csrf || req.headers['x-csrf-token'];
          if (!verifyCsrf(ctx.session, sent)) {
            audit('security.csrf_rejected', { actor: ctx.user?.username || 'anônimo', summary: `CSRF inválido em ${ctx.pathname}`, ip: ctx.ip });
            return ctx.text('Token de segurança inválido. Recarregue a página e tente de novo.', 403);
          }
        }
      }

      await match.route.handler(ctx);
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) {
        console.error(`[erro] ${ctx.method} ${ctx.pathname}:`, err);
        audit('error.unhandled', { actor: ctx.user?.username || 'anônimo', summary: `${ctx.method} ${ctx.pathname}: ${err.message}` });
      }
      if (res.headersSent) return;
      if (ctx.pathname.startsWith('/admin')) {
        return ctx.html(`<!doctype html><meta charset="utf-8"><title>Erro</title>
          <body style="font-family:system-ui;padding:2rem;max-width:40rem">
          <h1>${status === 500 ? 'Erro interno' : 'Não foi possível concluir'}</h1>
          <p>${escape(err.message)}</p>
          <p><a href="javascript:history.back()">Voltar</a></p>`, status);
      }
      return renderError(ctx, status >= 500 ? 'Tivemos um problema inesperado. Tente novamente em instantes.' : err.message, status);
    }
  };
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function startServer({ port = env.port, silent = false } = {}) {
  migrate({ silent: true });
  if (env.isProd) assertProductionEnv();
  bootstrapAdmin({ silent });
  const server = http.createServer(createApp());
  server.listen(port, () => {
    if (!silent) {
      console.log(`[mangaloop] servidor em http://localhost:${port}`);
      console.log(`[mangaloop] painel em http://localhost:${port}/admin`);
    }
  });
  if (process.env.WORKER_EMBEDDED === 'true') startWorker({ silent });
  return server;
}

const invokedDirectly = process.argv[1]?.endsWith('server.js');
if (invokedDirectly) startServer();
