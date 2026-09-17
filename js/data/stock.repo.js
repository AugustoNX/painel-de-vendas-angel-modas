import { DB_PATHS } from '../config/constants.js';
import { watchList, writeAt, removeAt, newId, nowIso } from '../core/db.js';

export function watchMarcas(onChange) {
  return watchList(DB_PATHS.marcas, list =>
    onChange([...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))));
}

export function createMarca(name) {
  const id = newId(DB_PATHS.marcas);
  return writeAt(`${DB_PATHS.marcas}/${id}`, { name: name.trim(), createdAt: nowIso() }).then(() => id);
}

export function watchStockPurchases(onChange) {
  return watchList(DB_PATHS.stockPurchases, onChange);
}

export function createStockPurchase({ marcaId, colecao, ano, date, pecas, valor }) {
  const id = newId(DB_PATHS.stockPurchases);
  return writeAt(`${DB_PATHS.stockPurchases}/${id}`, {
    marcaId, colecao, ano: Number(ano), date,
    pecas: Number(pecas) || 0,
    valor: Number(valor) || 0,
    createdAt: nowIso()
  });
}

export function deleteStockPurchase(id) {
  return removeAt(`${DB_PATHS.stockPurchases}/${id}`);
}

export function watchBrandSales(onChange) {
  return watchList(DB_PATHS.brandSales, onChange);
}

export function createBrandSale({ marcaId, colecao, ano, pecas, valor }) {
  const id = newId(DB_PATHS.brandSales);
  return writeAt(`${DB_PATHS.brandSales}/${id}`, {
    marcaId, colecao, ano: Number(ano),
    pecas: Number(pecas) || 0,
    valor: Number(valor) || 0,
    importedAt: nowIso()
  });
}

export function deleteBrandSale(id) {
  return removeAt(`${DB_PATHS.brandSales}/${id}`);
}
