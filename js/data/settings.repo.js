import { DB_PATHS } from '../config/constants.js';
import { watchValue, updateAt, writeAt } from '../core/db.js';

const DEFAULTS = {
  storeName: 'Angel Modas',
  handle: '@lojaangelmodas',
  reportNameMapping: {}
};

export function watchSettings(onChange) {
  return watchValue(`${DB_PATHS.settings}/app`, value =>
    onChange({ ...DEFAULTS, ...(value || {}), reportNameMapping: value?.reportNameMapping || {} }));
}

export function saveSettings(patch) {
  return updateAt(`${DB_PATHS.settings}/app`, patch);
}

/** Chaves do Firebase não aceitam . # $ / [ ] — nomes do PDF precisam ser limpos. */
export function mappingKey(reportName) {
  return String(reportName).replace(/[.#$/[\]]/g, '_');
}

/** O "quem é quem" do relatório do ERP: nome no PDF -> vendedora do painel. */
export function saveReportMapping(reportName, vendorId) {
  return writeAt(`${DB_PATHS.settings}/app/reportNameMapping/${mappingKey(reportName)}`, vendorId);
}
