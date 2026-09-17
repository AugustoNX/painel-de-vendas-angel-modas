import { openModal, field, selectField } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { state } from '../../core/store.js';
import { ROLE } from '../../config/constants.js';
import { createAccount, updateAccount, authMessage } from '../../core/session.js';
import { metaVendors } from '../../domain/metas.js';

function vendorOptions() {
  const vendors = metaVendors();
  return [{ value: '', label: '— selecione —' }, ...vendors.map(v => ({ value: v.id, label: v.name }))];
}

/** Criação de conta: só o admin faz isso, não existe tela pública de cadastro. */
export function openCreateUserModal() {
  openModal({
    title: 'Criar acesso',
    subtitle: 'A conta é criada no Firebase e já nasce com o nível de acesso escolhido. Combine a senha inicial com a pessoa — ela pode trocar depois.',
    body: `
      ${selectField({
        id: 'userRole', label: 'Nível de acesso', value: ROLE.VENDEDORA,
        options: [
          { value: ROLE.VENDEDORA, label: 'Vendedora — vê só os próprios números e a própria carteira' },
          { value: ROLE.ADMIN, label: 'Administração — vê tudo e define as metas' }
        ]
      })}
      <div id="userVendorWrap">
        ${selectField({ id: 'userVendor', label: 'Vinculada a qual vendedora', options: vendorOptions(), value: '' })}
      </div>
      ${field({ id: 'userName', label: 'Nome', placeholder: 'Como aparece no painel' })}
      ${field({ id: 'userEmail', label: 'Email', type: 'email', placeholder: 'email@exemplo.com' })}
      ${field({ id: 'userPassword', label: 'Senha inicial', value: '', placeholder: 'mínimo 6 caracteres' })}`,
    onMount(overlay) {
      const role = overlay.querySelector('#userRole');
      const wrap = overlay.querySelector('#userVendorWrap');
      const sync = () => { wrap.style.display = role.value === ROLE.VENDEDORA ? '' : 'none'; };
      role.addEventListener('change', sync);
      sync();
    },
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Criar acesso',
        kind: 'primary',
        onClick: async ({ body }) => {
          const role = body.querySelector('#userRole').value;
          const vendorId = body.querySelector('#userVendor').value;
          const name = body.querySelector('#userName').value.trim();
          const email = body.querySelector('#userEmail').value.trim();
          const password = body.querySelector('#userPassword').value;

          if (!email || !password) { showToast('Preencha email e senha'); return false; }
          if (password.length < 6) { showToast('A senha precisa ter pelo menos 6 caracteres'); return false; }
          if (role === ROLE.VENDEDORA && !vendorId) { showToast('Escolha a vendedora vinculada'); return false; }

          try {
            await createAccount({ email, password, role, vendorId, name });
            showToast('Acesso criado para ' + email);
          } catch (err) {
            showToast(authMessage(err));
            return false;
          }
        }
      }
    ]
  });
}

export function openEditUserModal(uid) {
  const user = state.users.find(u => u.id === uid);
  if (!user) return;

  openModal({
    title: `Acesso de ${user.name || user.email}`,
    subtitle: 'A senha só pode ser trocada pela própria pessoa, pelo link "Esqueci minha senha" na tela de entrada.',
    body: `
      ${field({ id: 'editName', label: 'Nome', value: user.name || '' })}
      ${selectField({
        id: 'editRole', label: 'Nível de acesso', value: user.role,
        options: [
          { value: ROLE.VENDEDORA, label: 'Vendedora' },
          { value: ROLE.ADMIN, label: 'Administração' }
        ]
      })}
      ${selectField({ id: 'editVendor', label: 'Vinculada a', options: vendorOptions(), value: user.vendorId || '' })}
      <label class="check-item">
        <input type="checkbox" id="editActive" ${user.active !== false ? 'checked' : ''}>
        <span>Acesso liberado</span>
      </label>`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Salvar',
        kind: 'primary',
        onClick: async ({ body }) => {
          const role = body.querySelector('#editRole').value;
          const vendorId = body.querySelector('#editVendor').value;
          if (role === ROLE.VENDEDORA && !vendorId) { showToast('Escolha a vendedora vinculada'); return false; }

          await updateAccount(uid, {
            name: body.querySelector('#editName').value.trim() || user.email,
            role,
            vendorId: role === ROLE.VENDEDORA ? vendorId : null,
            active: body.querySelector('#editActive').checked
          });
          showToast('Acesso atualizado');
        }
      }
    ]
  });
}
