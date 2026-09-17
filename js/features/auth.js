import { state } from '../state/store.js';
import { showToast } from '../ui/toast.js';
import { isMonthUnlocked, latestUnlockedMonth } from '../domain/vendas.js';
import { renderAll } from './vendas-view.js';
import { switchView } from '../main.js';
import { loadData, loadGoalsData, saveConfig } from '../state/store.js';
import { firebaseAuthService } from '../services/firebase-storage.service.js';

/* --- login / session --- */
export function isGestor(){ return state.currentUser && state.currentUser.role === 'gestor'; }
export function isVendor(){ return state.currentUser && state.currentUser.role === 'vendor'; }

export async function submitLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password){ showToast('Preencha o email e a senha'); return; }

  let firebaseUser;
  try{
    firebaseUser = await firebaseAuthService.signIn(email, password);
  }catch(err){
    showToast('Email ou senha incorretos');
    return;
  }

  await Promise.all([loadData(), loadGoalsData()]);

  const normalizedEmail = email.toLowerCase();
  let role = null;
  if (!state.config.adminEmails || !state.config.adminEmails.length){
    // primeiro login do painel: essa conta vira o primeiro Adm
    state.config.adminEmails = [email];
    await saveConfig();
    role = { role:'gestor' };
  } else if (state.config.adminEmails.some(e => (e||'').toLowerCase() === normalizedEmail)){
    role = { role:'gestor' };
  } else {
    const idx = (state.config.vendorEmails||[]).findIndex(e => (e||'').toLowerCase() === normalizedEmail);
    if (idx !== -1) role = { role:'vendor', vendorIdx: idx };
  }

  if (!role){
    showToast('Esse email não está associado a nenhum perfil. Peça pro gestor cadastrar em Configurações.');
    await firebaseAuthService.signOut();
    return;
  }

  state.currentUser = role;
  document.getElementById('loginOverlay').classList.remove('open');
  document.getElementById('loginPassword').value = '';
  if (isVendor() && !isMonthUnlocked(state.currentMonth)) state.currentMonth = latestUnlockedMonth();
  renderLoginStatus();
  renderAll();
  switchView('vendas');
}
export async function logout(){
  state.currentUser = null;
  await firebaseAuthService.signOut();
  document.getElementById('loginOverlay').classList.add('open');
}
export function renderLoginStatus(){
  const el = document.getElementById('loginStatus');
  if (!state.currentUser){ el.innerHTML = ''; return; }
  const name = isGestor() ? 'Gestor' : state.config.names[state.currentUser.vendorIdx];
  el.innerHTML = `Logado como <b>${name}</b> · <button class="logout-btn" onclick="logout()">Sair</button>`;
  const gearBtn = document.querySelector('.gear-btn');
  if (gearBtn) gearBtn.style.display = isGestor() ? '' : 'none';
  const comprasBtn = document.getElementById('navBtnCompras');
  if (comprasBtn) comprasBtn.style.display = isGestor() ? '' : 'none';
}
export function requireGestor(purpose){
  if (isGestor()){ purpose(); return; }
  showToast('Só o gestor pode fazer isso');
}
