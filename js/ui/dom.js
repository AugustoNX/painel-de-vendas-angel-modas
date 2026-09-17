import { parseNumber } from './mask.js';

export const $ = id => document.getElementById(id);

export function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

export function show(id, visible = true) {
  const el = $(id);
  if (el) el.style.display = visible ? '' : 'none';
}

export function val(id) {
  const el = $(id);
  return el ? el.value.trim() : '';
}

/** Número de um input (aceita 1.234,56), ou null quando está vazio ou inválido. */
export function num(id) {
  const el = $(id);
  if (!el || el.value.trim() === '') return null;
  return parseNumber(el.value);
}

export function setVal(id, value) {
  const el = $(id);
  if (el) el.value = value ?? '';
}

export function checked(id) {
  const el = $(id);
  return !!(el && el.checked);
}
