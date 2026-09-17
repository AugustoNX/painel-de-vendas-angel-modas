import { toFloatBR, dateBr } from './format.js';

const INPUT_MODE = {
  phone: 'tel',
  money: 'decimal',
  integer: 'numeric',
  year: 'numeric',
  date: 'numeric',
  birthday: 'numeric'
};

const MAX_LENGTH = {
  phone: 15,
  birthday: 5,
  date: 10,
  year: 4,
  money: 18,
  integer: 14
};

const PLACEHOLDER = {
  phone: '(00) 00000-0000',
  money: '0,00',
  integer: '0',
  date: '00/00/0000',
  birthday: '00/00',
  year: '2026'
};

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function digitCount(value) {
  return digits(value).length;
}

function caretFromDigits(formatted, count) {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen += 1;
      if (seen >= count) return i + 1;
    }
  }
  return formatted.length;
}

export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  const n = toFloatBR(s);
  return isNaN(n) ? null : n;
}

export function readNumber(el) {
  return el ? parseNumber(el.value) : null;
}

/** Aceita 16/09/2026 ou 2026-09-16 e devolve ISO. Inválida vira string vazia. */
export function parseDateBr(str) {
  const raw = String(str || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? raw : '';
  }
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function readDate(el) {
  return el ? parseDateBr(el.value) : '';
}

function typingPhone(raw) {
  const d = digits(raw).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function typingBirthday(raw) {
  const d = digits(raw).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

function typingDate(raw) {
  const d = digits(raw).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function typingYear(raw) {
  return digits(raw).slice(0, 4);
}

function typingInteger(raw) {
  const d = digits(raw);
  if (!d) return '';
  return Number(d).toLocaleString('pt-BR');
}

function typingMoney(raw) {
  let s = String(raw ?? '').replace(/[^\d,]/g, '');
  const comma = s.indexOf(',');
  if (comma >= 0) {
    s = s.slice(0, comma).replace(/,/g, '') + ',' + s.slice(comma + 1).replace(/\D/g, '').slice(0, 2);
  }
  const [intRaw = '', decPart] = s.split(',');
  const intPart = intRaw.replace(/^0+(?=\d)/, '');
  const grouped = intPart === '' ? (decPart !== undefined ? '0' : '') : Number(intPart).toLocaleString('pt-BR');
  return decPart !== undefined ? `${grouped},${decPart}` : grouped;
}

function formatMoney(value) {
  const n = parseNumber(value);
  if (n === null) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInteger(value) {
  const n = parseNumber(value);
  if (n === null) return '';
  return Math.round(n).toLocaleString('pt-BR');
}

function formatDate(value) {
  const iso = parseDateBr(value);
  if (iso) return dateBr(iso);
  return typingDate(value);
}

export function displayMasked(mask, value) {
  if (value === null || value === undefined || value === '') return '';
  switch (mask) {
    case 'money': return formatMoney(value);
    case 'integer': return formatInteger(value);
    case 'year': return typingYear(value) || String(value);
    case 'date': return formatDate(value);
    case 'birthday': return typingBirthday(value);
    case 'phone': return typingPhone(value);
    default: return String(value);
  }
}

export function maskPlaceholder(mask, fallback = '') {
  return fallback || PLACEHOLDER[mask] || '';
}

export function maskAttrs(mask) {
  if (!mask) return '';
  const parts = [
    `data-mask="${mask}"`,
    `inputmode="${INPUT_MODE[mask] || 'text'}"`,
    'autocomplete="off"'
  ];
  if (MAX_LENGTH[mask]) parts.push(`maxlength="${MAX_LENGTH[mask]}"`);
  return parts.join(' ');
}

function formatTyping(mask, raw) {
  switch (mask) {
    case 'phone': return typingPhone(raw);
    case 'birthday': return typingBirthday(raw);
    case 'date': return typingDate(raw);
    case 'year': return typingYear(raw);
    case 'integer': return typingInteger(raw);
    case 'money': return typingMoney(raw);
    default: return raw;
  }
}

function formatBlur(mask, raw) {
  if (!String(raw || '').trim()) return '';
  switch (mask) {
    case 'money': return formatMoney(raw) || raw;
    case 'integer': return formatInteger(raw) || raw;
    case 'date': {
      const iso = parseDateBr(raw);
      return iso ? dateBr(iso) : typingDate(raw);
    }
    case 'phone': return typingPhone(raw);
    case 'birthday': return typingBirthday(raw);
    case 'year': return typingYear(raw);
    default: return raw;
  }
}

export function setMasked(el, value) {
  if (!el) return;
  const mask = el.dataset.mask;
  el.value = mask ? displayMasked(mask, value) : (value ?? '');
}

function applyTyping(el) {
  const mask = el.dataset.mask;
  const before = digitCount(el.value.slice(0, el.selectionStart ?? el.value.length));
  const next = formatTyping(mask, el.value);
  if (next === el.value) return;
  el.value = next;
  const pos = caretFromDigits(next, before);
  try { el.setSelectionRange(pos, pos); } catch { /* input type may not support selection */ }
}

let hooked = false;

/** Liga uma vez só: qualquer input com data-mask, inclusive os criados depois, ganha formatação. */
export function applyMasks() {
  if (hooked) return;
  hooked = true;

  document.addEventListener('input', event => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || !el.dataset.mask) return;
    applyTyping(el);
  }, true);

  document.addEventListener('focusout', event => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || !el.dataset.mask) return;
    const next = formatBlur(el.dataset.mask, el.value);
    if (next !== el.value) el.value = next;
  }, true);
}
