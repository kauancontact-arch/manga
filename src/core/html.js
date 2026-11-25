/** Template HTML com escape automatico. Previne XSS por padrao. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

class RawHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Marca conteudo ja sanitizado como seguro. Use com parcimonia. */
export function raw(value) { return new RawHtml(String(value ?? '')); }

function render(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof RawHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new RawHtml(out);
}

/** Serializa dados para embutir em <script type="application/json">. */
export function jsonScript(data) {
  return raw(JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'));
}

/** Atributo opcional: attr('class','x') -> ' class="x"'; vazio quando sem valor. */
export function attr(name, value) {
  if (value === null || value === undefined || value === false || value === '') return raw('');
  if (value === true) return raw(` ${name}`);
  return raw(` ${name}="${escapeHtml(value)}"`);
}

/** Converte texto simples em paragrafos HTML seguros. */
export function paragraphs(text) {
  const blocks = String(text || '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return raw(blocks.map((b) => `<p>${escapeHtml(b).replace(/\n/g, '<br>')}</p>`).join(''));
}

export { RawHtml };
