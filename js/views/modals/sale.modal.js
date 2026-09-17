import { PAYMENT_METHODS, CLOTHING_ITEMS, MONTH_NAMES, TIER_LABEL } from '../../config/constants.js';
import { state, currentGoal, periodKey } from '../../core/store.js';
import { isAdmin, myVendorId } from '../../core/session.js';
import { openModal, field, selectField, textareaField } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { todayIso, money, esc } from '../../ui/format.js';
import { readNumber, readDate } from '../../ui/mask.js';
import { extraVendors, goalVendors, vendorById, vendorName, vendorTotal, nextTierInfo } from '../../domain/metas.js';
import { addSale } from '../../data/sales.repo.js';
import { createPurchase, createTransfer } from '../../data/crm.repo.js';
import { clientsOf, transferSuggestion } from '../../domain/crm.js';

/**
 * Formulário de uma venda recém-fechada. A vendedora só lança no próprio nome
 * (as regras do banco recusam qualquer outro vendorId). O admin escolhe quem.
 */
export function openSaleModal() {
  const vendorId = isAdmin() ? null : myVendorId();
  if (!isAdmin() && !vendorById(vendorId)) {
    showToast('Seu acesso ainda não está ligado a uma vendedora');
    return;
  }

  const goal = currentGoal();
  const clients = (isAdmin() ? state.clients : clientsOf(vendorId))
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const vendorOptions = [...goalVendors(goal || {}), ...extraVendors()]
    .map(vendor => ({ value: vendor.id, label: vendor.name + (vendor.isExtra ? ' (apoio)' : '') }));

  openModal({
    title: isAdmin() ? 'Lançar venda' : 'Registrar a sua venda',
    subtitle: isAdmin()
      ? 'O valor entra na meta de quem atendeu e no total da loja.'
      : 'Fechou o atendimento? Cadastre aqui. O valor entra na hora na sua meta.',
    size: 'md',
    body: `
      ${isAdmin()
        ? selectField({ id: 'saleVendor', label: 'Vendedora', options: [{ value: '', label: '— quem atendeu —' }, ...vendorOptions] })
        : ''}
      <div class="goal-row">
        ${field({ id: 'saleDate', label: 'Data', mask: 'date', value: todayIso() })}
        ${field({ id: 'saleAmount', label: 'Valor (R$)', mask: 'money' })}
        ${field({ id: 'salePecas', label: 'Peças', mask: 'integer', placeholder: '1' })}
      </div>
      ${selectField({
        id: 'salePayment', label: 'Forma de pagamento', value: 'PIX',
        options: PAYMENT_METHODS.map(method => ({ value: method, label: method }))
      })}
      <div class="field">
        <label>O que saiu</label>
        <div class="item-chips">
          ${CLOTHING_ITEMS.map(item => `<button type="button" class="item-chip" data-item="${esc(item)}">${esc(item)}</button>`).join('')}
        </div>
      </div>
      ${textareaField({
        id: 'saleItems',
        label: 'Detalhe (tamanho, cor, marca…)',
        placeholder: 'ex: vestido floral P + sandália 37',
        hint: 'Toque nas peças acima ou descreva. Ajuda na hora de lembrar o que vendeu.',
        rows: 2
      })}
      ${selectField({
        id: 'saleClient',
        label: 'Cliente (opcional)',
        value: '',
        options: [
          { value: '', label: 'Não informar agora' },
          ...clients.map(client => ({ value: client.id, label: client.name }))
        ],
        hint: 'Se escolher, a compra também entra na carteira dela.'
      })}`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Salvar venda',
        kind: 'primary',
        onClick: async ({ body }) => {
          const date = readDate(body.querySelector('#saleDate'));
          const amount = readNumber(body.querySelector('#saleAmount'));
          const pecas = readNumber(body.querySelector('#salePecas')) ?? 0;
          const items = body.querySelector('#saleItems').value.trim();
          const payment = body.querySelector('#salePayment').value;
          const clientId = body.querySelector('#saleClient').value || null;
          const targetVendor = isAdmin() ? body.querySelector('#saleVendor').value : vendorId;

          if (!date || !amount || amount <= 0) { showToast('Preencha a data e o valor da venda'); return false; }
          if (!targetVendor) { showToast('Escolha quem atendeu'); return false; }

          const key = date.slice(0, 7);
          const before = vendorTotal(targetVendor);

          try {
            await addSale(key, {
              date,
              vendorId: targetVendor,
              amount,
              pecas,
              items,
              payment,
              clientId
            });

            if (clientId) {
              await createPurchase({
                clientId,
                date,
                vendorId: targetVendor,
                value: amount,
                notes: items
              });
              const suggestion = transferSuggestion(clientId);
              if (suggestion) await createTransfer(suggestion);
            }
          } catch (err) {
            console.error('Falha ao salvar venda', err);
            showToast('Não consegui salvar a venda. Confira se as regras do banco foram publicadas.');
            return false;
          }

          showToast(progressToast({ amount, before, vendorId: targetVendor, period: key }));
        }
      }
    ],
    onMount(overlay) {
      overlay.querySelectorAll('.item-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const input = overlay.querySelector('#saleItems');
          const piece = chip.dataset.item;
          const current = input.value.trim();
          input.value = current
            ? (current.toLowerCase().includes(piece.toLowerCase()) ? current : `${current}, ${piece.toLowerCase()}`)
            : piece.toLowerCase();
          chip.classList.add('picked');
          input.focus();
        });
      });
    }
  });
}

function progressToast({ amount, before, vendorId, period }) {
  const after = before + amount;
  const who = isAdmin() ? ` para ${vendorName(vendorId)}` : '';
  const monthIdx = Number(period.slice(5, 7)) - 1;
  const otherMonth = period !== periodKey()
    ? ` Lançada em ${MONTH_NAMES[monthIdx]} — abra esse mês para ver.`
    : '';
  const goal = state.goals[period];
  const next = goal ? nextTierInfo(goal, after) : null;

  if (!goal) return `Venda de ${money(amount)} salva${who}.${otherMonth}`;

  if (next) {
    return `Venda de ${money(amount)} salva${who}. Faltam ${money(next.falta)} para o ${TIER_LABEL[next.tier]}.${otherMonth}`;
  }
  return `Venda de ${money(amount)} salva${who}. Nível máximo do mês atingido 🎉${otherMonth}`;
}
