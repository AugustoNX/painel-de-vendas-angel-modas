import { openModal, field, selectField } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { state } from '../../core/store.js';
import { isAdmin, myVendorId } from '../../core/session.js';
import { todayIso } from '../../ui/format.js';
import { readNumber, readDate } from '../../ui/mask.js';
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
      ${field({ id: 'clientPhone', label: 'Telefone / WhatsApp', mask: 'phone', value: client?.phone || '' })}
      ${field({ id: 'clientBirthday', label: 'Aniversário (dia/mês)', mask: 'birthday', value: client?.birthday || '' })}
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
      ${field({ id: 'purchaseDate', label: 'Data', mask: 'date', value: todayIso() })}
      ${selectField({
        id: 'purchaseVendor', label: 'Quem atendeu', options: vendorOptions(),
        value: isAdmin() ? '' : myVendorId(),
        attrs: isAdmin() ? '' : 'disabled',
        hint: isAdmin() ? '' : 'A compra entra no seu nome.'
      })}
      ${field({ id: 'purchaseValue', label: 'Valor (R$)', mask: 'money' })}
      ${field({ id: 'purchaseNotes', label: 'O que comprou (opcional)', placeholder: 'ex: vestido + sandália' })}`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Registrar',
        kind: 'primary',
        onClick: async ({ body }) => {
          const targetClient = body.querySelector('#purchaseClient').value;
          const date = readDate(body.querySelector('#purchaseDate'));
          const value = readNumber(body.querySelector('#purchaseValue'));

          if (!targetClient) { showToast('Selecione uma cliente'); return false; }
          if (!date || !value || value <= 0) { showToast('Preencha a data e um valor válido'); return false; }

          await createPurchase({
            clientId: targetClient,
            date,
            vendorId: isAdmin() ? body.querySelector('#purchaseVendor').value : myVendorId(),
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
      ${field({ id: 'contactDate', label: 'Data', mask: 'date', value: todayIso() })}
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
          const date = readDate(body.querySelector('#contactDate'));
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
