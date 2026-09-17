import { openModal, field, selectField } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { state } from '../../core/store.js';
import { ROLE } from '../../config/constants.js';
import { createAccount, updateAccount, resetPassword, authMessage } from '../../core/session.js';
import { metaVendors } from '../../domain/metas.js';
import { createVendor } from '../../data/vendors.repo.js';
import { esc } from '../../ui/format.js';

const NEW_VENDOR = '__nova__';

function vendorOptions() {
  const vendors = metaVendors();
  return [{ value: '', label: '— selecione —' }, ...vendors.map(v => ({ value: v.id, label: v.name }))];
}

/**
 * Criação de conta: só o admin faz isso, não existe tela pública de cadastro.
 * A conta nasce de verdade no Firebase Auth, então o email digitado aqui já
 * entra no painel. Por padrão a funcionária recebe um link e escolhe a própria
 * senha — o admin nunca precisa inventar nem guardar credencial de ninguém.
 */
export function openCreateUserModal() {
  openModal({
    title: 'Criar acesso',
    subtitle: 'Informe o email da funcionária. A conta é criada na hora e ela passa a entrar no painel com o próprio login.',
    size: 'md',
    body: `
      ${selectField({
        id: 'userRole', label: 'Nível de acesso', value: ROLE.VENDEDORA,
        options: [
          { value: ROLE.VENDEDORA, label: 'Vendedora — lança as próprias vendas e vê a própria carteira' },
          { value: ROLE.ADMIN, label: 'Administração — vê tudo e define as metas' }
        ]
      })}

      <div id="userVendorWrap">
        ${selectField({
          id: 'userVendor', label: 'Vendedora vinculada', value: '',
          options: [...vendorOptions(), { value: NEW_VENDOR, label: '+ Cadastrar nova vendedora' }],
          hint: 'É esse vínculo que faz as vendas e as clientes dela aparecerem só para ela.'
        })}
        <div id="userNewVendorWrap" style="display:none;">
          ${field({ id: 'userNewVendor', label: 'Nome da nova vendedora', placeholder: 'Como aparece nas metas e no ranking' })}
        </div>
      </div>

      ${field({ id: 'userName', label: 'Nome', placeholder: 'Como aparece no painel' })}
      ${field({ id: 'userEmail', label: 'Email de acesso', type: 'email', placeholder: 'email@exemplo.com' })}

      <div class="modal-section">
        <div class="modal-section-title">Senha</div>
        <label class="check-item">
          <input type="radio" name="userPwMode" value="email" checked>
          <span>Enviar link por email para ela criar a senha <b>(recomendado)</b></span>
        </label>
        <label class="check-item">
          <input type="radio" name="userPwMode" value="manual">
          <span>Definir uma senha inicial agora</span>
        </label>
        <div id="userPasswordWrap" style="display:none;">
          ${field({ id: 'userPassword', label: 'Senha inicial', type: 'password', placeholder: 'mínimo 6 caracteres' })}
        </div>
      </div>`,
    onMount(overlay) {
      const role = overlay.querySelector('#userRole');
      const vendorWrap = overlay.querySelector('#userVendorWrap');
      const vendorSelect = overlay.querySelector('#userVendor');
      const newVendorWrap = overlay.querySelector('#userNewVendorWrap');
      const passwordWrap = overlay.querySelector('#userPasswordWrap');

      const sync = () => {
        const isVendedora = role.value === ROLE.VENDEDORA;
        vendorWrap.style.display = isVendedora ? '' : 'none';
        newVendorWrap.style.display = isVendedora && vendorSelect.value === NEW_VENDOR ? '' : 'none';
      };

      role.addEventListener('change', sync);
      vendorSelect.addEventListener('change', sync);
      overlay.querySelectorAll('input[name="userPwMode"]').forEach(radio => {
        radio.addEventListener('change', () => {
          passwordWrap.style.display = radio.value === 'manual' && radio.checked ? '' : 'none';
        });
      });
      sync();
    },
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Criar acesso',
        kind: 'primary',
        onClick: async ({ body }) => {
          const role = body.querySelector('#userRole').value;
          const email = body.querySelector('#userEmail').value.trim();
          const name = body.querySelector('#userName').value.trim();
          const byEmail = body.querySelector('input[name="userPwMode"]:checked').value === 'email';
          const password = body.querySelector('#userPassword').value;

          if (!email) { showToast('Digite o email da funcionária'); return false; }
          if (!byEmail && password.length < 6) {
            showToast('A senha inicial precisa ter pelo menos 6 caracteres');
            return false;
          }

          let vendorId = null;
          if (role === ROLE.VENDEDORA) {
            vendorId = body.querySelector('#userVendor').value;
            if (!vendorId) { showToast('Escolha a vendedora vinculada'); return false; }

            if (vendorId === NEW_VENDOR) {
              const vendorName = body.querySelector('#userNewVendor').value.trim();
              if (!vendorName) { showToast('Digite o nome da nova vendedora'); return false; }
              vendorId = await createVendor({ name: vendorName });
            }
          }

          try {
            const { emailSent } = await createAccount({
              email, password, role, vendorId,
              name: name || email.split('@')[0],
              sendSetupEmail: byEmail
            });

            if (byEmail) {
              showToast(emailSent
                ? `Acesso criado. ${email} recebeu o link para criar a senha.`
                : 'Acesso criado, mas o email falhou. Use "Enviar link de senha" na lista.');
            } else {
              showToast('Acesso criado para ' + email);
            }
          } catch (err) {
            showToast(authMessage(err));
            return false;
          }
        }
      }
    ]
  });
}

/** Reenvia o link de definição de senha para quem perdeu ou nunca recebeu. */
export function openSendPasswordLink(uid) {
  const user = state.users.find(u => u.id === uid);
  if (!user) return;

  openModal({
    title: 'Enviar link de senha',
    size: 'sm',
    body: `<p class="modal-text">Vamos mandar para <b>${esc(user.email)}</b> um link para criar uma senha nova.
      O acesso atual continua valendo até ela usar o link.</p>`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Enviar',
        kind: 'primary',
        onClick: async () => {
          try {
            await resetPassword(user.email);
            showToast('Link enviado para ' + user.email);
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
