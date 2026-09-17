import { DB_PATHS } from '../config/constants.js';
import { watchList, writeAt, updateAt, removeAt, newId, nowIso } from '../core/db.js';
import { session } from '../core/session.js';
import { normalizeName } from '../ui/format.js';

/* ---------------- clientes ---------------- */
export function watchClients(onChange) {
  return watchList(DB_PATHS.clients, list =>
    onChange([...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))));
}

export function createClient({ name, phone = '', birthday = '', notes = '', ownerVendorId }) {
  const id = newId(DB_PATHS.clients);
  return writeAt(`${DB_PATHS.clients}/${id}`, {
    name: name.trim(),
    nameKey: normalizeName(name),
    phone, birthday, notes, ownerVendorId,
    createdAt: nowIso(),
    createdBy: session.uid || null
  }).then(() => id);
}

export function updateClient(clientId, patch) {
  const data = { ...patch };
  if (patch.name) data.nameKey = normalizeName(patch.name);
  return updateAt(`${DB_PATHS.clients}/${clientId}`, data);
}

export function deleteClient(clientId) {
  return removeAt(`${DB_PATHS.clients}/${clientId}`);
}

/* ---------------- compras ---------------- */
export function watchPurchases(onChange) {
  return watchList(DB_PATHS.purchases, list =>
    onChange([...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))));
}

export function createPurchase({ clientId, date, vendorId, value, notes = '', controle = null }) {
  const id = newId(DB_PATHS.purchases);
  return writeAt(`${DB_PATHS.purchases}/${id}`, {
    clientId, date, vendorId,
    value: Number(value) || 0,
    notes, controle,
    createdAt: nowIso(),
    createdBy: session.uid || null
  }).then(() => id);
}

export function deletePurchase(purchaseId) {
  return removeAt(`${DB_PATHS.purchases}/${purchaseId}`);
}

/* ---------------- contatos ---------------- */
export function watchContacts(onChange) {
  return watchList(DB_PATHS.contacts, list =>
    onChange([...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))));
}

export function createContact({ clientId, date, channel, note = '', vendorId }) {
  const id = newId(DB_PATHS.contacts);
  return writeAt(`${DB_PATHS.contacts}/${id}`, {
    clientId, date, channel, note, vendorId,
    createdAt: nowIso(),
    createdBy: session.uid || null
  });
}

export function deleteContact(contactId) {
  return removeAt(`${DB_PATHS.contacts}/${contactId}`);
}

/* ---------------- transferências de carteira ---------------- */
export function watchTransfers(onChange) {
  return watchList(DB_PATHS.transfers, onChange);
}

export function createTransfer({ clientId, fromVendorId, toVendorId }) {
  const id = newId(DB_PATHS.transfers);
  return writeAt(`${DB_PATHS.transfers}/${id}`, {
    clientId, fromVendorId, toVendorId,
    status: 'pending',
    createdAt: nowIso()
  });
}

export function resolveTransfer(transferId, status) {
  return updateAt(`${DB_PATHS.transfers}/${transferId}`, { status, resolvedAt: nowIso(), resolvedBy: session.uid || null });
}
