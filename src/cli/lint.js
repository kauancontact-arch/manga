import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config/env.js';

/**
 * Verificação estática sem dependências externas:
 * - sintaxe de todos os módulos (node --check)
 * - SVGs estáticos bem formados
 * - nenhuma credencial aparente no código versionado
 */

const SKIP_DIRS = new Set(['node_modules', 'data', '.git', 'test-results', 'playwright-report']);
const problems = [];
let checked = 0;

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

const SECRET_PATTERNS = [
  { re: /sk-[A-Za-z0-9_-]{20,}/, label: 'possível chave de API da OpenAI' },
  { re: /AKIA[0-9A-Z]{16}/, label: 'possível chave AWS' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: 'chave privada' },
];

walk(ROOT, (file) => {
  const rel = path.relative(ROOT, file);
  const ext = path.extname(file);

  if (ext === '.js') {
    checked += 1;
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      problems.push(`${rel}: erro de sintaxe\n${String(err.stderr || err.message).split('\n').slice(0, 3).join('\n')}`);
    }
  }

  if (ext === '.svg') {
    const body = fs.readFileSync(file, 'utf8');
    if (!body.trimStart().startsWith('<svg')) problems.push(`${rel}: SVG não começa com <svg>`);
    const unescaped = body.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, '');
    if (unescaped.includes('&')) problems.push(`${rel}: "&" não escapado no SVG`);
  }

  if (['.js', '.md', '.json', '.html', '.css'].includes(ext) && !rel.startsWith('docs/')) {
    const body = fs.readFileSync(file, 'utf8');
    for (const p of SECRET_PATTERNS) {
      if (p.re.test(body)) problems.push(`${rel}: ${p.label} encontrada no código`);
    }
  }
});

/**
 * Travessão é proibido em tudo que vira texto do site (decisão editorial).
 * Comentários de código ficam de fora: o leitor nunca os vê.
 */
const USER_FACING = /^src\/(web|domain|ai|core\/dates)/;
walk(path.join(ROOT, 'src'), (file) => {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (!rel.endsWith('.js') || !USER_FACING.test(rel)) return;
  const linhas = fs.readFileSync(file, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    if (!linha.includes('\u2014')) return;
    const semComentario = linha.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\*|\/\/).*/, '');
    if (semComentario.includes('\u2014')) {
      problems.push(`${rel}:${i + 1}: travessão em texto do site`);
    }
  });
});

const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
for (const line of envExample.split('\n')) {
  const m = /^(OPENAI_API_KEY|AUTH_SECRET|STORAGE_SECRET_KEY|ADMIN_INITIAL_PASSWORD)=(.+)$/.exec(line.trim());
  if (m && m[2].trim()) problems.push(`.env.example: ${m[1]} deveria estar vazio`);
}

if (problems.length) {
  console.error(`[lint] ${problems.length} problema(s):\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log(`[lint] ok — ${checked} módulo(s) verificado(s), SVGs válidos, nenhuma credencial no código.`);
