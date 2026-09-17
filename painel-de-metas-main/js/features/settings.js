import { state } from '../state/store.js';
import { showToast } from '../ui/toast.js';
import { saveConfig } from '../state/store.js';
import { isGestor, renderLoginStatus } from './auth.js';
import { renderAll } from './vendas-view.js';
import { refreshCrmViews } from './carteira-view.js';

export function openSettings(){
  if (!isGestor()){ showToast('Só o gestor pode abrir as configurações'); return; }
  const namesWrap = document.getElementById('namesFields');
  namesWrap.innerHTML = '';
  [0,1,2,3].forEach(i=>{
    const div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = `<label>Nome da vendedora ${i+1}</label><input type="text" id="nameInput${i}" value="${state.config.names[i]}">`;
    namesWrap.appendChild(div);
  });
  const julyWrap = document.getElementById('julyChecks');
  julyWrap.innerHTML = '';
  [0,1,2,3].forEach(i=>{
    const div = document.createElement('div');
    div.className = 'july-check';
    div.innerHTML = `<input type="checkbox" id="julyCheck${i}" ${state.config.julyActive[i] ? 'checked':''}> <label for="julyCheck${i}">${state.config.names[i]}</label>`;
    julyWrap.appendChild(div);
  });
  const emailWrap = document.getElementById('vendorPasswordFields');
  emailWrap.innerHTML = '';
  [0,1,2,3].forEach(i=>{
    const div = document.createElement('div');
    div.className = 'field';
    const current = (state.config.vendorEmails && state.config.vendorEmails[i]) || '';
    div.innerHTML = `<label>Email de login de ${state.config.names[i]}</label><input type="email" id="vendorEmailInput${i}" value="${current}" placeholder="email@exemplo.com">`;
    emailWrap.appendChild(div);
  });
  const extraWrap = document.getElementById('extraFields');
  extraWrap.innerHTML = '';
  (state.config.extraNames||[]).forEach((name,i)=>{
    const div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = `<label>Nome ${i+1}</label><input type="text" id="extraNameInput${i}" value="${name}">`;
    extraWrap.appendChild(div);
  });
  const adminList = document.getElementById('adminEmailsList');
  adminList.innerHTML = (state.config.adminEmails||[]).length
    ? state.config.adminEmails.map(e=>`• ${e}`).join('<br>')
    : 'Nenhum administrador cadastrado ainda.';
  document.getElementById('settingsModal').classList.add('open');
}
export function closeSettings(){
  document.getElementById('settingsModal').classList.remove('open');
}
export async function saveSettings(){
  const newNames = [0,1,2,3].map(i => document.getElementById('nameInput'+i).value.trim() || state.config.names[i]);
  const newJuly = [0,1,2,3].map(i => document.getElementById('julyCheck'+i).checked);
  const checkedCount = newJuly.filter(Boolean).length;
  if (checkedCount !== 3){
    showToast('Marque exatamente 3 vendedoras para Julho');
    return;
  }
  const newVendorEmails = [0,1,2,3].map(i => document.getElementById('vendorEmailInput'+i).value.trim());
  const newExtraNames = (state.config.extraNames||[]).map((old,i)=> document.getElementById('extraNameInput'+i).value.trim() || old);
  state.config.names = newNames;
  state.config.julyActive = newJuly;
  state.config.vendorEmails = newVendorEmails;
  state.config.extraNames = newExtraNames;
  await saveConfig();
  closeSettings();
  renderLoginStatus();
  renderAll();
  if (state.currentView === 'carteira' || state.currentView === 'compras') refreshCrmViews();
  showToast('Configurações salvas');
}
