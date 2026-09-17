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

      let profile;
      try {
        profile = await readOnce(`${DB_PATHS.users}/${user.uid}`);
        if (!profile) profile = await bootstrapFirstAdmin(user);
      } catch (err) {
        // Sem isso, qualquer falha de leitura deixaria a tela de login travada.
        console.error('Falha ao carregar o perfil', err);
        session.profile = null;
        session.ready = true;
        await fbSignOut(auth).catch(() => {});
        onChange(null, 'erro');
        return;
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

/**
 * Cria o administrador inicial. Em vez de perguntar ao banco se já existe
 * alguém em /users (leitura que só o admin tem), tentamos gravar o perfil: a
 * regra `!root.child('users').exists()` só deixa passar enquanto o banco está
 * vazio. Recusa aqui significa que a equipe já existe e essa conta ficou sem
 * perfil — caso de quem foi criado direto no console do Firebase.
 */
async function bootstrapFirstAdmin(user) {
  const profile = {
    email: user.email,
    name: user.email.split('@')[0],
    role: ROLE.ADMIN,
    vendorId: null,
    active: true,
    createdAt: nowIso()
  };

  try {
    await writeAt(`${DB_PATHS.users}/${user.uid}`, profile);
    return profile;
  } catch (err) {
    if (isPermissionDenied(err)) return null;
    throw err;
  }
}

function isPermissionDenied(err) {
  const code = String(err?.code || err?.message || '').toUpperCase();
  return code.includes('PERMISSION_DENIED') || code.includes('PERMISSION-DENIED');
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
