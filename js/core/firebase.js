import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import {
  getAuth, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { firebaseConfig } from '../config/firebase.config.js';

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// A sessão fica salva no navegador, então recarregar a página não desloga ninguém.
export const authReady = setPersistence(auth, browserLocalPersistence)
  .catch(err => console.warn('Não consegui manter a sessão salva no navegador', err));

// Criar uma conta pelo app principal derrubaria a sessão do admin, porque o SDK
// loga automaticamente como o usuário recém-criado. Por isso a criação de contas
// roda numa instância separada e descartável do Firebase.
export async function withSecondaryApp(fn) {
  const secondary = initializeApp(firebaseConfig, 'secondary-' + Date.now());
  try {
    return await fn(secondary);
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
}
