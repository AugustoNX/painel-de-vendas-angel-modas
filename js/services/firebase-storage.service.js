import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getDatabase, ref, get as dbGet, set as dbSet, remove as dbRemove } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export const firebaseAuthService = {
  async signIn(email, password){
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },
  async signOut(){
    try{ await fbSignOut(auth); }catch(e){ /* ignore */ }
  },
  // Cria uma conta nova sem derrubar a sessão de quem está logado: usa uma
  // instância separada do Firebase só pra isso (senão o SDK loga automaticamente
  // como a conta recém-criada e desloga o admin que estava usando o painel).
  async createUser(email, password){
    const secondaryApp = initializeApp(firebaseConfig, 'user-creation-' + Date.now());
    const secondaryAuth = getAuth(secondaryApp);
    try{
      await createUserWithEmailAndPassword(secondaryAuth, email, password);
    } finally {
      await fbSignOut(secondaryAuth).catch(()=>{});
      await deleteApp(secondaryApp).catch(()=>{});
    }
  }
};

export const firebaseStorage = {
  async get(key){
    try{
      const snapshot = await dbGet(ref(db, key));
      if (!snapshot.exists()) return null;
      return { key, value: snapshot.val() };
    }catch(e){ console.error('Erro lendo do Firebase', key, e); return null; }
  },
  async set(key, value){
    try{
      await dbSet(ref(db, key), value);
      return { key, value };
    }catch(e){ console.error('Erro salvando no Firebase', key, e); return null; }
  },
  async delete(key){
    try{
      await dbRemove(ref(db, key));
      return { key, deleted:true };
    }catch(e){ console.error('Erro removendo do Firebase', key, e); return null; }
  }
};
