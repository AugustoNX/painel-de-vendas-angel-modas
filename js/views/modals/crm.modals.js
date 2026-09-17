import { openModal, field, selectField } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { state } from '../../core/store.js';
import { isAdmin, myVendorId } from '../../core/session.js';
import { todayIso } from '../../ui/format.js';
import { metaVendors } from '../../domain/metas.js';
import { clientById, transferSuggestion } from '../../domain/crm.js';
import { createClient, updateClient, createPurchase, createContact, createTransfer } from '../../data/crm.repo.js';

const vendorOptions = () => metaVendors().map(vendor => ({ value: vendor.id, label: vendor.name }));

export function openClientModal(clientId = null) {
  const client = clientId ? clientById(clientId) : null;
  const ownerDefault = client?.ownerVendorId || (isAdmin() ? metaVendors()[0]?.id : myVendorId());

  openModal({
    title: client ? `Editar ${client.name}` : 'Nova cliente',
    body: `
      ${field({ id: 'clientName', label: 'Nome', value: client?.name || '', placeholder: 'Nome completo' })}
      ${field({ id: 'clientPhone', label: 'Telefone / WhatsApp', value: client?.phone || '', placeholder: '(00) 00000-0000' })}
      ${field({ id: 'clientBirthday', label: 'Aniversário (dia/mês)', value: client?.birthday || '', placeholder: 'ex: 15/03' })}
      ${selectField({
        id: 'clientOwner', label: 'Carteira de', options: vendorOptions(), value: ownerDefault,
        attrs: isAdmin() ? '' : 'disabled',
        hint: isAdmin() ? '' : 'Vendedoras só cadastram na própria carteira.'
      })}
      ${field({ id: 'clientNotes', label: 'Preferências / observações', value: client?.notes || '', placeholder: 'tamanho, estilo, o que costuma comprar...' })}`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Salvar cliente',
        kind: 'primary',
        onClick: async ({ body }) => {
          const name = body.querySelector('#clientName').value.trim();
          if (!name) { showToast('Digite o nome da cliente'); return false; }

          const data = {
            name,
            phone: body.querySelector('#clientPhone').value.trim(),
            birthday: body.querySelector('#clientBirthday').value.trim(),
            notes: body.querySelector('#clientNotes').value.trim(),
            ownerVendorId: isAdmin() ? body.querySelector('#clientOwner').value : myVendorId()
          };

          if (client) await updateClient(client.id, data);
          else await createClient(data);
          showToast('Cliente salva');
        }
      }
    ]
  });
}

export function openPurchaseModal(clientId = null) {
  const clients = [...state.clients].sort((a, b) => a.name.localeCompare(b.name));

  openModal({
    title: 'Registrar compra',
    body: `
      ${selectField({
        id: 'purchaseClient', label: 'Cliente', value: clientId || '',
        options: [{ value: '', label: '— selecione —' }, ...clients.map(c => ({ value: c.id, label: c.name }))]
      })}
      ${field({ id: 'purchaseDate', label: 'Data', type: 'date', value: todayIso() })}
      ${selectField({ id: 'purchaseVendor', label: 'Quem atendeu', options: vendorOptions(), value: isAdmin() ? '' : myVendorId() })}
      ${field({ id: 'purchaseValue', label: 'Valor (R$)', type: 'number', placeholder: '0,00', attrs: 'step="0.01" min="0"' })}
      ${field({ id: 'purchaseNotes', label: 'O que comprou (opcional)', placeholder: 'ex: vestido + sandália' })}`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Registrar',
        kind: 'primary',
        onClick: async ({ body }) => {
          const targetClient = body.querySelector('#purchaseClient').value;
          const date = body.querySelector('#purchaseDate').value;
          const value = Number(body.querySelector('#purchaseValue').value);

          if (!targetClient) { showToast('Selecione uma cliente'); return false; }
          if (!date || !value || value <= 0) { showToast('Preencha a data e um valor válido'); return false; }

          await createPurchase({
            clientId: targetClient,
            date,
            vendorId: body.querySelector('#purchaseVendor').value,
            value,
            notes: body.querySelector('#purchaseNotes').value.trim()
          });

          const suggestion = transferSuggestion(targetClient);
          if (suggestion) await createTransfer(suggestion);

          showToast('Compra registrada');
        }
      }
    ]
  });
}

export function openContactModal(clientId) {
  openModal({
    title: 'Registrar contato',
    subtitle: 'O contato de hoje tira a cliente da lista de tarefas.',
    body: `
      ${field({ id: 'contactDate', label: 'Data', type: 'date', value: todayIso() })}
      ${selectField({
        id: 'contactChannel', label: 'Canal', value: 'WhatsApp',
        options: ['WhatsApp', 'Ligação', 'Instagram', 'Presencial', 'Outro'].map(c => ({ value: c, label: c }))
      })}
      ${field({ id: 'contactNote', label: 'O que foi conversado', placeholder: 'ex: disse que volta em agosto' })}`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Registrar',
        kind: 'primary',
        onClick: async ({ body }) => {
          const date = body.querySelector('#contactDate').value;
          if (!date) { showToast('Preencha a data'); return false; }

          await createContact({
            clientId,
            date,
            channel: body.querySelector('#contactChannel').value,
            note: body.querySelector('#contactNote').value.trim(),
            vendorId: isAdmin() ? clientById(clientId)?.ownerVendorId : myVendorId()
          });
          showToast('Contato registrado');
        }
      }
    ]
  });
}
