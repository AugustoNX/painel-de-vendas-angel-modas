import { DB_PATHS } from '../config/constants.js';
import { watchList, writeAt, updateAt, removeAt, newId, nowIso } from '../core/db.js';

const sortVendors = list => [...list].sort((a, b) => {
  if (!!a.isExtra !== !!b.isExtra) return a.isExtra ? 1 : -1;
  return (a.order ?? 0) - (b.order ?? 0) || (a.name || '').localeCompare(b.name || '');
});

export function watchVendors(onChange) {
  return watchList(DB_PATHS.vendors, list => onChange(sortVendors(list)));
}

export function createVendor({ name, isExtra = false, order = 0 }) {
  const id = newId(DB_PATHS.vendors);
  return writeAt(`${DB_PATHS.vendors}/${id}`, {
    name: name.trim(),
    isExtra,
    active: true,
    order,
    createdAt: nowIso()
  }).then(() => id);
}

export function updateVendor(vendorId, patch) {
  return updateAt(`${DB_PATHS.vendors}/${vendorId}`, patch);
}

export function deleteVendor(vendorId) {
  return removeAt(`${DB_PATHS.vendors}/${vendorId}`);
}
