import { state } from '../state/store.js';
import { showToast } from '../ui/toast.js';
import { saveConfig } from '../state/store.js';
import { isGestor, requireGestor } from './auth.js';
import { firebaseAuthService } from '../services/firebase-storage.service.js';

const AUTH_ERROR_MESSAGES = {
  'auth/email-already-in-use': 'Esse email já tem uma conta no Firebase.',
  'auth/invalid-email': 'Email inválido.',
  'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).'
};

export function openUserModal(){
  if (!isGestor()){ showToast('Só o administrador pode criar usuários'); return; }
  document.getElementById('userRole').value = 'funcionario';
  populateUserVendorSlotSelect();
  updateUserRoleFields();
  document.getElementById('userEmail').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userModal').classList.add('open');
}
export function closeUserModal(){
  document.getElementById('userModal').classList.remove('open');
}
function populateUserVendorSlotSelect(){
  const sel = document.getElementById('userVendorSlot');
  sel.innerHTML = '';
  state.config.names.forEach((name, i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = name;
    sel.appendChild(opt);
  });
}
export function updateUserRoleFields(){
  const role = document.getElementById('userRole').value;
  document.getElementById('userVendorSlotField').style.display = role === 'funcionario' ? '' : 'none';
}

export async function saveNewUser(){
  requireGestor(async ()=>{
    const role = document.getElementById('userRole').value;
    const email = document.getElementById('userEmail').value.trim();
    const password = document.getElementById('userPassword').value;
    if (!email || !password){ showToast('Preencha email e senha'); return; }
    if (password.length < 6){ showToast('A senha precisa ter pelo menos 6 caracteres'); return; }

    try{
      await firebaseAuthService.createUser(email, password);
    }catch(err){
      showToast(AUTH_ERROR_MESSAGES[err.code] || 'Não consegui criar o usuário.');
      return;
    }

    if (role === 'admin'){
      if (!state.config.adminEmails) state.config.adminEmails = [];
      if (!state.config.adminEmails.some(e => e.toLowerCase() === email.toLowerCase())){
        state.config.adminEmails.push(email);
      }
    } else {
      const idx = Number(document.getElementById('userVendorSlot').value);
      if (!state.config.vendorEmails) state.config.vendorEmails = state.config.names.map(()=>'');
      state.config.vendorEmails[idx] = email;
    }
    await saveConfig();
    closeUserModal();
    showToast('Usuário criado com sucesso');
  });
}
