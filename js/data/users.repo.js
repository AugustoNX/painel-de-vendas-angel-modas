import { DB_PATHS } from '../config/constants.js';
import { watchList, updateAt, removeAt } from '../core/db.js';

export function watchUsers(onChange) {
  return watchList(DB_PATHS.users, list =>
    onChange([...list].sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''))));
}

export function updateUser(uid, patch) {
  return updateAt(`${DB_PATHS.users}/${uid}`, patch);
}

/**
 * Remove só o perfil de acesso. A conta continua existindo no Firebase Auth
 * (isso exige o SDK de servidor), mas sem perfil ela não entra no painel.
 */
export function revokeUser(uid) {
  return removeAt(`${DB_PATHS.users}/${uid}`);
}
