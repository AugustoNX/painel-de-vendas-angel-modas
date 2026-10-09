import { DB_PATHS } from '../config/constants.js';
import { watchValue, writeAt, updateAt, removeAt, nowIso } from '../core/db.js';
import { session } from '../core/session.js';

/**
 * Meta de um mês. O admin define só os totais; o balizador semanal é calculado
 * a partir das semanas reais do calendário (ver domain/weeks.js).
 *
 * { obj, campanhaAlvo, campanhaRealizado, precoMedioPeca,
 *   niveis: { bronze, prata, ouro, diamante },   // meta por vendedora de mês inteiro
 *   niveisAtivos: { bronze: true, ... },          // false = nível não vale nesse mês
 *   taxas: { bronze: 0.01, ... },                 // % de bonificação de cada nível
 *   vendorIds: [ids das vendedoras que participam da meta],
 *   diasTrabalhados: { vendorId: [dias do mês] }, // ausente = trabalha o mês inteiro
 *   pesosSemanas: [1, 2, 2, 2, 1] }               // ausente = peso padrão das semanas
 */
export function watchGoals(onChange) {
  // `periodKey` não é gravado: só deixa cada meta saber de qual mês ela é.
  return watchValue(DB_PATHS.goals, value => onChange(Object.fromEntries(
    Object.entries(value || {}).map(([key, goal]) => [key, { ...goal, periodKey: key }])
  )));
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
