export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function money(n) {
  return 'R$ ' + fmt(n);
}

export function moneyRound(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
}

export function pecas(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('pt-BR') + ' pçs';
}

export function pct(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.round(n) + '%';
}

/** '2026-07-15' -> '15/07/2026' */
export function dateBr(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function dayMonth(date) {
  return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0');
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** '1.234,56' -> 1234.56 */
export function toFloatBR(s) {
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
}

export function normalizeName(s) {
  return (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Escapa texto vindo do usuário antes de entrar em template HTML. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
