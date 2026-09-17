import {
  ref, push, get, set, update, remove, onValue, off, query, orderByChild, equalTo
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { db } from './firebase.js';

/** Converte um snapshot de coleção em array, com o id da chave embutido em cada item. */
function toList(snapshot) {
  const out = [];
  snapshot.forEach(child => {
    const val = child.val();
    out.push(typeof val === 'object' && val !== null ? { id: child.key, ...val } : { id: child.key, value: val });
  });
  return out;
}

export function newId(path) {
  return push(ref(db, path)).key;
}

export async function readOnce(path) {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function readList(path) {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? toList(snapshot) : [];
}

export function writeAt(path, value) {
  return set(ref(db, path), value);
}

export function updateAt(path, partial) {
  return update(ref(db, path), partial);
}

export function removeAt(path) {
  return remove(ref(db, path));
}

/**
 * Escuta um nó (objeto único) em tempo real. Devolve a função de cancelamento.
 */
export function watchValue(path, onChange) {
  const node = ref(db, path);
  const handler = onValue(node, snapshot => onChange(snapshot.exists() ? snapshot.val() : null),
    err => console.error('Erro lendo', path, err));
  return () => off(node, 'value', handler);
}

/**
 * Escuta uma coleção em tempo real e entrega sempre um array pronto pra usar.
 * `filter` permite restringir a leitura a um campo — necessário para as
 * vendedoras, que pelas regras do banco só podem ler as próprias vendas.
 */
export function watchList(path, onChange, filter) {
  const base = ref(db, path);
  const target = filter
    ? query(base, orderByChild(filter.field), equalTo(filter.value))
    : base;
  const handler = onValue(target, snapshot => onChange(snapshot.exists() ? toList(snapshot) : []),
    err => { console.error('Erro lendo lista', path, err); onChange([]); });
  return () => off(base, 'value', handler);
}

/** Grava vários registros da mesma coleção respeitando as regras por filho. */
export function writeMany(basePath, recordsById) {
  return Promise.all(
    Object.entries(recordsById).map(([id, value]) => writeAt(`${basePath}/${id}`, value))
  );
}

export function nowIso() {
  return new Date().toISOString();
}
