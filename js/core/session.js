import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut,
  createUserWithEmailAndPassword, updatePassword, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { auth, authReady, withSecondaryApp } from './firebase.js';
import { readOnce, writeAt, updateAt, nowIso } from './db.js';
import { ROLE, DB_PATHS } from '../config/constants.js';

export const session = {
  uid: null,
  email: null,
  profile: null,   // { role, vendorId, name, email }
  ready: false
};

export function isLogged() { return !!session.profile; }
export function isAdmin() { return session.profile?.role === ROLE.ADMIN; }
export function isVendedora() { return session.profile?.role === ROLE.VENDEDORA; }
export function myVendorId() { return session.profile?.vendorId || null; }

/** Vendedora só enxerga a própria carteira e as próprias vendas. */
export function canSeeVendor(vendorId) {
  return isAdmin() || myVendorId() === vendorId;
}

export const AUTH_ERRORS = {
  'auth/invalid-email': 'Email inválido.',
  'auth/user-disabled': 'Essa conta foi desativada.',
  'auth/user-not-found': 'Email ou senha incorretos.',
  'auth/wrong-password': 'Email ou senha incorretos.',
  'auth/invalid-credential': 'Email ou senha incorretos.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
  'auth/email-already-in-use': 'Esse email já tem conta no painel.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem conexão com o servidor. Confira sua internet.'
};

export function authMessage(err) {
  return AUTH_ERRORS[err?.code] || 'Não consegui completar a operação. Tente de novo.';
}

/**
 * Observa o login. Na primeira execução do painel (banco sem nenhum usuário),
 * quem entrar primeiro vira o administrador — é assim que a conta inicial nasce,
 * já que não existe tela pública de cadastro.
 */
export function watchSession(onChange) {
  authReady.finally(() => {
    onAuthStateChanged(auth, async user => {
      if (!user) {
        session.uid = null;
        session.email = null;
        session.profile = null;
        session.ready = true;
        onChange(null);
        return;
      }

      session.uid = user.uid;
      session.email = user.email;

      let profile = await readOnce(`${DB_PATHS.users}/${user.uid}`);
      if (!profile) {
        const anyUser = await readOnce(DB_PATHS.users);
        if (!anyUser) {
          profile = {
            email: user.email,
            name: user.email.split('@')[0],
            role: ROLE.ADMIN,
            vendorId: null,
            active: true,
            createdAt: nowIso()
          };
          await writeAt(`${DB_PATHS.users}/${user.uid}`, profile);
        }
      }

      if (!profile || profile.active === false) {
        session.profile = null;
        session.ready = true;
        await fbSignOut(auth).catch(() => {});
        onChange(null, profile ? 'inativo' : 'sem-perfil');
        return;
      }

      session.profile = profile;
      session.ready = true;
      onChange(profile);
    });
  });
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function signOut() {
  return fbSignOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

/**
 * Cria a conta de acesso de alguém da equipe. Só o admin chama isso: a conta
 * nasce no Firebase Auth e o perfil (nível de acesso) é gravado em /users.
 */
export async function createAccount({ email, password, role, vendorId, name }) {
  const uid = await withSecondaryApp(async secondary => {
    const secondaryAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    await fbSignOut(secondaryAuth).catch(() => {});
    return cred.user.uid;
  });

  await writeAt(`${DB_PATHS.users}/${uid}`, {
    email: email.trim(),
    name: name || email.split('@')[0],
    role,
    vendorId: role === ROLE.VENDEDORA ? vendorId : null,
    active: true,
    createdAt: nowIso(),
    createdBy: session.uid
  });

  return uid;
}

export function updateAccount(uid, patch) {
  return updateAt(`${DB_PATHS.users}/${uid}`, patch);
}

export function changeMyPassword(newPassword) {
  return updatePassword(auth.currentUser, newPassword);
}
