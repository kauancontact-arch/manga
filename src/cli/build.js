import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config/env.js';
import { ART_STYLES } from '../domain/catalog.js';

/**
 * "Build" do projeto.
 *
 * A aplicação é renderizada no servidor e não tem etapa de empacotamento:
 * este comando apenas verifica que os artefatos estáticos exigidos existem,
 * para que uma implantação não suba com telas quebradas.
 */

const required = [
  'src/web/assets/styles.css',
  'src/web/assets/app.js',
  'src/web/assets/logo.svg',
  ...ART_STYLES.map((s) => `src/web/assets/estilos/${s.key.toLowerCase()}.svg`),
];

const missing = required.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
if (missing.length) {
  console.error(`[build] faltam artefatos:\n - ${missing.join('\n - ')}`);
  process.exit(1);
}

const css = fs.readFileSync(path.join(ROOT, 'src/web/assets/styles.css'), 'utf8');
for (const token of ['--ink', '--paper', '--primary', '--gold', '--muted']) {
  if (!css.includes(token)) {
    console.error(`[build] token de design ausente no CSS: ${token}`);
    process.exit(1);
  }
}

console.log(`[build] ok — ${required.length} artefatos estáticos presentes e tokens de design definidos.`);
