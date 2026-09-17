import { openModal, field } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { state } from '../../core/store.js';
import { createVendor, updateVendor } from '../../data/vendors.repo.js';

export function openVendorModal(vendorId = null) {
  const vendor = vendorId ? state.vendors.find(v => v.id === vendorId) : null;

  openModal({
    title: vendor ? `Editar ${vendor.name}` : 'Nova vendedora',
    subtitle: 'Vendedoras de apoio entram no total da loja, mas não têm meta nem bonificação.',
    body: `
      ${field({ id: 'vendorName', label: 'Nome', value: vendor?.name || '', placeholder: 'Nome que aparece no painel' })}
      <label class="check-item">
        <input type="checkbox" id="vendorExtra" ${vendor?.isExtra ? 'checked' : ''}>
        <span>É apoio (sem meta e sem bonificação)</span>
      </label>
      <label class="check-item">
        <input type="checkbox" id="vendorActive" ${vendor ? (vendor.active !== false ? 'checked' : '') : 'checked'}>
        <span>Ativa na equipe</span>
      </label>`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Salvar',
        kind: 'primary',
        onClick: async ({ body }) => {
          const name = body.querySelector('#vendorName').value.trim();
          if (!name) { showToast('Digite o nome'); return false; }

          const data = {
            name,
            isExtra: body.querySelector('#vendorExtra').checked,
            active: body.querySelector('#vendorActive').checked
          };

          if (vendor) await updateVendor(vendor.id, data);
          else await createVendor({ ...data, order: state.vendors.length });

          showToast(vendor ? 'Vendedora atualizada' : 'Vendedora cadastrada');
        }
      }
    ]
  });
}
