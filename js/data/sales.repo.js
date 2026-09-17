import { DB_PATHS } from '../config/constants.js';
import { watchList, writeAt, removeAt, newId, nowIso, readList } from '../core/db.js';
import { session, isAdmin, myVendorId } from '../core/session.js';

const salesPath = periodKey => `${DB_PATHS.sales}/${periodKey}`;

/**
 * Vendas de um mês. Admin recebe tudo; vendedora recebe só as próprias — a
 * restrição vem das regras do banco, então o filtro aqui não é decorativo.
 */
export function watchSales(periodKey, onChange) {
  const filter = isAdmin() ? null : { field: 'vendorId', value: myVendorId() };
  return watchList(salesPath(periodKey), onChange, filter);
}

export function listSales(periodKey) {
  return readList(salesPath(periodKey));
}

export function addSale(periodKey, { date, vendorId, amount, pecas = 0, source = 'manual', controle = null }) {
  const id = newId(salesPath(periodKey));
  return writeAt(`${salesPath(periodKey)}/${id}`, {
    date, vendorId,
    amount: Number(amount) || 0,
    pecas: Number(pecas) || 0,
    source,
    controle,
    createdBy: session.uid || null,
    createdAt: nowIso()
  });
}

export function deleteSale(periodKey, saleId) {
  return removeAt(`${salesPath(periodKey)}/${saleId}`);
}

/** Importação em lote: grava registro a registro para respeitar as regras por filho. */
export function addSalesBatch(entries) {
  return Promise.all(entries.map(entry => addSale(entry.periodKey, entry)));
}
