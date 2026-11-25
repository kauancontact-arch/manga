import { env } from '../config/env.js';

const TZ = env.editorialTimezone || 'America/Sao_Paulo';

const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' });

export const EDITORIAL_TZ = TZ;

export function fmtDateTime(iso) { return iso ? `${dateTimeFmt.format(new Date(iso))}` : 'sem data'; }
export function fmtDate(iso) { return iso ? dateFmt.format(new Date(iso)) : 'sem data'; }
export function fmtLongDate(iso) { return iso ? longFmt.format(new Date(iso)) : 'sem data'; }
export function fmtWeekday(iso) { return iso ? weekdayFmt.format(new Date(iso)) : 'sem data'; }

/** Converte "2026-11-30T20:00" digitado no fuso editorial para UTC ISO. */
export function editorialLocalToUtc(localValue) {
  if (!localValue) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(localValue.trim());
  if (!m) { const d = new Date(localValue); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  const [, y, mo, d, h, mi] = m.map(Number);
  // Busca o instante UTC cuja representacao no fuso editorial e a data informada.
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMs(new Date(guess));
    const corrected = Date.UTC(y, mo - 1, d, h, mi) - offset;
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess).toISOString();
}

/** Converte UTC ISO para o valor de um <input type="datetime-local"> no fuso editorial. */
export function utcToEditorialLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}

function tzOffsetMs(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, parts.hour === '24' ? 0 : +parts.hour, +parts.minute, +parts.second);
  return asUtc - date.getTime();
}

export function monthKey(iso = new Date().toISOString()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
    .format(new Date(iso)).slice(0, 7);
}

export function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function isPast(iso) { return !!iso && new Date(iso).getTime() <= Date.now(); }
