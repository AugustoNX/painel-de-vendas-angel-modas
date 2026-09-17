import { DB_PATHS } from '../config/constants.js';
import { watchValue, writeAt, updateAt, removeAt, nowIso } from '../core/db.js';
import { session } from '../core/session.js';

/**
 * Meta de um mês. O admin define só os totais; o balizador semanal é calculado
 * a partir das semanas reais do calendário (ver domain/weeks.js).
 *
 * { obj, campanhaAlvo, campanhaRealizado, precoMedioPeca,
 *   niveis: { bronze, prata, ouro, diamante },   // null = nível não vale nesse mês
 *   vendorIds: [ids das vendedoras que participam da meta] }
 */
export function watchGoals(onChange) {
  return watchValue(DB_PATHS.goals, value => onChange(value || {}));
}

export function saveGoal(periodKey, goal) {
  return writeAt(`${DB_PATHS.goals}/${periodKey}`, {
    ...goal,
    updatedAt: nowIso(),
    updatedBy: session.uid || null
  });
}

export function patchGoal(periodKey, patch) {
  return updateAt(`${DB_PATHS.goals}/${periodKey}`, { ...patch, updatedAt: nowIso() });
}

export function deleteGoal(periodKey) {
  return removeAt(`${DB_PATHS.goals}/${periodKey}`);
}
