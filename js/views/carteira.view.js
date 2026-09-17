import { state, setState } from '../core/store.js';
import { isAdmin, myVendorId } from '../core/session.js';
import { $ } from '../ui/dom.js';
import { onClick, onInput } from '../ui/actions.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { money, esc, dateBr } from '../ui/format.js';
import { displayMasked } from '../ui/mask.js';
import { stackedBar } from '../ui/charts.js';
import { metaVendors, vendorName } from '../domain/metas.js';
import {
  CLIENT_STATUS_TIERS, clientsOf, clientTotal, lastPurchase, clientStatus, purchasesOf,
  contactsOf, monetaryTerciles, clientSegment, periodComparison, computeABC, dailyTasks,
  portfolioHealth, pendingTransfers, clientById
} from '../domain/crm.js';
import { deleteClient, deletePurchase, deleteContact, updateClient, resolveTransfer } from '../data/crm.repo.js';
import { openClientModal, openPurchaseModal, openContactModal } from './modals/crm.modals.js';
import { openImportCarteiraModal } from '../features/import-carteira.js';

export function renderCarteira() {
  const el = $('viewCarteira');
  if (!el) return;

  const visibleVendors = isAdmin() ? metaVendors() : metaVendors().filter(v => v.id === myVendorId());
  const visibleIds = visibleVendors.map(v => v.id);
  const visibleClients = state.clients.filter(client => visibleIds.includes(client.ownerVendorId));
  const terciles = monetaryTerciles(state.clients.map(client => client.id));

  el.innerHTML = [
    toolbar(),
    overview(visibleClients),
    tasksCard(visibleClients),
    attentionCard(visibleClients),
    reactivatedCard(visibleClients),
    transfersCard(visibleIds),
    abcCard(visibleClients),
    healthCard(visibleVendors),
    portfolios(visibleVendors, terciles)
  ].join('');
}

function toolbar() {
  return `<div class="crm-toolbar">
    <input type="text" class="crm-search" placeholder="Buscar cliente por nome ou telefone..."
      value="${esc(state.crmSearchTerm)}" data-input-action="crmSearch">
    <button class="crm-add-btn" data-action="newClient">+ Nova cliente</button>
    ${isAdmin() ? '<button class="crm-add-btn" data-action="importCarteira">📄 Importar relatório (PDF)</button>' : ''}
  </div>`;
}

function overview(clients) {
  const total = clients.reduce((sum, client) => sum + clientTotal(client.id), 0);
  const counts = {};
  CLIENT_STATUS_TIERS.forEach(tier => { counts[tier.key] = 0; });
  counts['sem-compra'] = 0;
  clients.forEach(client => { counts[clientStatus(client.id).key]++; });

  const segments = [
    { label: 'Ativas', value: counts.ativa, color: '#2C6B45' },
    { label: 'Atenção leve', value: counts.leve, color: '#8FBF9F' },
    { label: 'Precisam de atenção', value: counts.atencao, color: '#E8A165' },
    { label: 'Alto risco', value: counts.risco, color: '#D9756B' },
    { label: 'Inativas', value: counts.inativa, color: '#7A2E2E' },
    { label: 'Sem compras', value: counts['sem-compra'], color: '#9A9AA1' }
  ];

  return `<div class="card">
    <div class="kpi-grid">
      ${kpi('Clientes na visão', clients.length)}
      ${kpi('Total em compras', money(total))}
      ${kpi('Ticket médio por cliente', clients.length ? money(total / clients.length) : '—')}
      ${kpi('Precisam de ação', counts.atencao + counts.risco + counts.inativa, 'missing')}
    </div>
    ${stackedBar(segments)}
    <div class="attention-summary">
      ${segments.filter(s => s.value > 0).map(s =>
        `<div class="attention-chip" style="background:${s.color}">${s.value} ${esc(s.label)}</div>`).join('')}
    </div>
  </div>`;
}

function kpi(label, value, modifier = '') {
  return `<div class="kpi ${modifier}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span></div>`;
}

function tasksCard(clients) {
  const tasks = dailyTasks(clients).slice(0, 12);
  if (!tasks.length) return '';

  return `<div class="task-card">
    <h2>📋 Tarefas de hoje</h2>
    <p class="card-sub">Ordenado pelo status mais urgente e pelo maior valor histórico. Some da lista assim que o contato for registrado.</p>
    ${tasks.map(({ client, status }) => `<div class="task-row">
      <div>
        <span class="tr-name">${esc(client.name)}</span>
        <span class="status-badge status-${status.key}">${status.badge}</span>
        <div class="tr-meta">${status.days} dias sem comprar · ${money(clientTotal(client.id))} em histórico${isAdmin() ? ' · ' + esc(vendorName(client.ownerVendorId)) : ''}${client.phone ? ' · ' + esc(displayMasked('phone', client.phone)) : ''}</div>
      </div>
      <div class="task-actions">
        ${client.phone ? `<a class="task-btn ghost" target="_blank" rel="noopener"
          href="https://wa.me/55${esc(String(client.phone).replace(/\D/g, ''))}">WhatsApp</a>` : ''}
        <button class="task-btn" data-action="newContact" data-client-id="${client.id}">Registrar contato</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function attentionCard(clients) {
  const list = clients
    .map(client => ({ client, status: clientStatus(client.id) }))
    .filter(row => ['atencao', 'risco', 'inativa'].includes(row.status.key))
    .sort((a, b) => b.status.days - a.status.days);

  if (!list.length) return '';

  return `<div class="attention-card">
    <h2>⚠️ Clientes que precisam de atenção</h2>
    <p class="card-sub">60 dias ou mais sem comprar, com a ação recomendada para cada caso.</p>
    ${list.map(({ client, status }) => `<div class="attention-row">
      <div>
        <span class="ar-name">${esc(client.name)}</span>
        <span class="status-badge status-${status.key}">${status.badge}</span>
        <div class="ar-meta">${status.days} dias sem comprar${isAdmin() ? ' · carteira de ' + esc(vendorName(client.ownerVendorId)) : ''}${client.phone ? ' · ' + esc(displayMasked('phone', client.phone)) : ''}</div>
      </div>
      <div class="ar-action">${status.action}</div>
    </div>`).join('')}
  </div>`;
}

function reactivatedCard(clients) {
  const list = clients
    .filter(client => client.lastReactivation)
    .sort((a, b) => b.lastReactivation.date.localeCompare(a.lastReactivation.date));
  if (!list.length) return '';

  return `<div class="attention-card success">
    <h2>🎉 Clientes reativadas</h2>
    ${list.map(client => `<div class="attention-row">
      <div>
        <span class="ar-name">${esc(client.name)}</span>
        <div class="ar-meta">Reativada por <b>${esc(vendorName(client.lastReactivation.vendorId))}</b> em <b>${dateBr(client.lastReactivation.date)}</b></div>
      </div>
    </div>`).join('')}
  </div>`;
}

function transfersCard(visibleIds) {
  const pending = pendingTransfers().filter(transfer => isAdmin() || visibleIds.includes(transfer.toVendorId));
  if (!pending.length) return '';

  return `<div class="transfers-card">
    <h2>⚠️ Solicitações de transferência de carteira</h2>
    ${pending.map(transfer => {
      const client = clientById(transfer.clientId);
      if (!client) return '';
      return `<div class="transfer-row">
        <div class="transfer-text">
          <b>${esc(client.name)}</b>: as últimas 3 compras foram com <b>${esc(vendorName(transfer.toVendorId))}</b>,
          mas a carteira é de <b>${esc(vendorName(transfer.fromVendorId))}</b>.
        </div>
        ${isAdmin() ? `<div class="transfer-actions">
          <button class="transfer-approve" data-action="approveTransfer" data-transfer-id="${transfer.id}">Aprovar</button>
          <button class="transfer-reject" data-action="rejectTransfer" data-transfer-id="${transfer.id}">Recusar</button>
        </div>` : '<div class="transfer-text muted-text">Só a administração decide</div>'}
      </div>`;
    }).join('')}
  </div>`;
}

function abcCard(clients) {
  const ranking = computeABC(clients);
  if (!ranking.length) return '';

  const count = classe => ranking.filter(row => row.classe === classe).length;

  return `<div class="card">
    <h2>📊 Curva ABC de clientes</h2>
    <div class="abc-summary">
      <div class="attention-chip" style="background:#2C6B45">${count('A')} classe A</div>
      <div class="attention-chip" style="background:#D9A62E">${count('B')} classe B</div>
      <div class="attention-chip" style="background:#9A9AA1">${count('C')} classe C</div>
    </div>
    <p class="pacer-note">Classe A são as clientes que somam até 80% do faturamento — as que merecem o atendimento mais próximo.</p>
    <details class="import-details"><summary>Ver ranking completo</summary>
      ${ranking.map(row => `<div class="abc-row">
        <span><span class="abc-badge abc-${row.classe}">${row.classe}</span>${esc(row.client.name)}</span>
        <span>${money(row.total)} (${Math.round(row.pctOfTotal * 100)}%)</span>
      </div>`).join('')}
    </details>
  </div>`;
}

function healthCard(vendors) {
  if (!isAdmin() || !vendors.length) return '';

  return `<div class="card">
    <h2>💚 Saúde da carteira por vendedora</h2>
    ${vendors.map(vendor => {
      const health = portfolioHealth(vendor.id);
      return `<div class="health-row">
        <span class="health-name">${esc(vendor.name)}</span>
        <span class="health-data">
          ${health.total} clientes ·
          <span class="health-bar-outer"><span class="health-bar-inner" style="width:${health.ativaPct}%"></span></span>
          ${health.ativaPct}% ativas · ticket médio ${money(health.avgTicket)} · ${money(health.revenue)} no histórico
        </span>
      </div>`;
    }).join('')}
  </div>`;
}

function portfolios(vendors, terciles) {
  const term = state.crmSearchTerm.toLowerCase();

  return '<div class="vaccordion" id="crmPortfolios">' + vendors.map(vendor => {
    let clients = clientsOf(vendor.id);
    if (term) {
      const phoneDigits = term.replace(/\D/g, '');
      clients = clients.filter(client =>
        (client.name || '').toLowerCase().includes(term)
        || (client.phone || '').toLowerCase().includes(term)
        || (phoneDigits && String(client.phone || '').replace(/\D/g, '').includes(phoneDigits)));
    }

    const health = portfolioHealth(vendor.id);
    const isOpen = state.openCarteiras.has(vendor.id);
    const total = clients.reduce((sum, client) => sum + clientTotal(client.id), 0);

    return `<div class="vaccordion-item${isOpen ? ' open' : ''}">
      <button class="vaccordion-header" data-action="toggleCarteira" data-vendor-id="${vendor.id}">
        <span>Carteira de ${esc(vendor.name)}
          <span class="vaccordion-hint">(${clients.length} cliente${clients.length === 1 ? '' : 's'} · ${health.ativaPct}% ativas)</span></span>
        <span class="vaccordion-hint">${money(total)}<span class="chevron">▶</span></span>
      </button>
      ${isOpen ? `<div class="vaccordion-body flush">
        ${clients.length
          ? clients.map(client => clientRow(client, terciles)).join('')
          : `<div class="empty-clients">Nenhuma cliente ${term ? 'encontrada' : 'nessa carteira ainda'}.</div>`}
      </div>` : ''}
    </div>`;
  }).join('') + '</div>';
}

function clientRow(client, terciles) {
  const status = clientStatus(client.id);
  const segment = clientSegment(client.id, terciles);
  const last = lastPurchase(client.id);
  const isOpen = state.openClients.has(client.id);

  let html = `<div class="client-block">
    <button class="client-row-header" data-action="toggleClient" data-client-id="${client.id}">
      <div class="client-main">
        <span class="client-name">${esc(client.name)}</span>
        <span class="status-badge status-${status.key}">${status.badge}</span>
        <span class="status-badge" style="background:${segment.color}">${esc(segment.label)}</span>
        ${client.lastReactivation ? '<span title="Reativada">🎉</span>' : ''}
        <span class="client-sub">${esc(client.phone ? displayMasked('phone', client.phone) : 'sem telefone')}${last ? ` · última compra ${dateBr(last.date)} (${status.days} dias)` : ''}</span>
      </div>
      <div class="client-right"><span class="client-total">${money(clientTotal(client.id))}</span><span class="chevron">▶</span></div>
    </button>`;

  if (isOpen) {
    const comparison = periodComparison(client.id, 90);
    const arrow = comparison.trend === 'up' ? '▲' : comparison.trend === 'down' ? '▼' : '—';
    const color = comparison.trend === 'up' ? 'var(--ok)' : comparison.trend === 'down' ? 'var(--danger)' : 'var(--muted)';
    let comparisonText = `${money(comparison.current)} (últimos 90d) vs ${money(comparison.previous)} (90d anteriores)`;
    if (comparison.pct !== null) comparisonText += ` <b style="color:${color}">${arrow} ${Math.abs(comparison.pct)}%</b>`;
    else if (comparison.trend === 'new') comparisonText += ` <b style="color:${color}">novo neste período</b>`;

    const purchases = purchasesOf(client.id);
    const contacts = contactsOf(client.id);

    html += `<div class="client-body">
      ${client.lastReactivation ? `<div class="reactivation-note">🎉 Reativada por <b>${esc(vendorName(client.lastReactivation.vendorId))}</b> em <b>${dateBr(client.lastReactivation.date)}</b></div>` : ''}
      <div class="client-detail-row"><span>Status</span><b>${status.label}</b></div>
      <div class="client-detail-row"><span>Ação recomendada</span><b>${status.action}</b></div>
      <div class="client-detail-row"><span>Segmento</span><b>${esc(segment.label)}</b></div>
      <div class="client-detail-row"><span>Frequência</span><b>${segment.freq} compra${segment.freq === 1 ? '' : 's'}</b></div>
      <div class="client-detail-row"><span>Comparação de período</span><b>${comparisonText}</b></div>
      <div class="client-detail-row"><span>Aniversário</span><b>${esc(client.birthday || '—')}</b></div>
      <div class="client-detail-row"><span>Preferências</span><b>${esc(client.notes || '—')}</b></div>
      <div class="client-actions">
        <button data-action="newPurchase" data-client-id="${client.id}">+ Registrar compra</button>
        <button data-action="newContact" data-client-id="${client.id}">+ Registrar contato</button>
        <button data-action="editClient" data-client-id="${client.id}">Editar</button>
        ${isAdmin() ? `<button data-action="moveClient" data-client-id="${client.id}">Mudar de carteira</button>
          <button class="danger" data-action="deleteClient" data-client-id="${client.id}">Remover</button>` : ''}
      </div>
      ${purchases.length ? `<table class="purchases">
        <thead><tr><th>Data</th><th>Vendedora</th><th>Valor</th><th>O que comprou</th><th></th></tr></thead>
        <tbody>${purchases.map(purchase => `<tr>
          <td>${dateBr(purchase.date)}</td>
          <td>${esc(vendorName(purchase.vendorId))}</td>
          <td>${money(purchase.value)}</td>
          <td>${esc(purchase.notes || '—')}</td>
          <td><button class="del-btn" data-action="deletePurchase" data-purchase-id="${purchase.id}">remover</button></td>
        </tr>`).join('')}</tbody></table>`
        : '<div class="empty-state">Nenhuma compra registrada ainda.</div>'}
      <div class="mini-title">Histórico de contato</div>
      ${contacts.length ? `<table class="purchases">
        <thead><tr><th>Data</th><th>Canal</th><th>Nota</th><th></th></tr></thead>
        <tbody>${contacts.map(contact => `<tr>
          <td>${dateBr(contact.date)}</td>
          <td>${esc(contact.channel)}</td>
          <td>${esc(contact.note || '—')}</td>
          <td><button class="del-btn" data-action="deleteContact" data-contact-id="${contact.id}">remover</button></td>
        </tr>`).join('')}</tbody></table>`
        : '<div class="empty-state">Nenhum contato registrado ainda.</div>'}
    </div>`;
  }

  return html + '</div>';
}

/* ------------------------------------------------------------------ */
/* ações                                                               */
/* ------------------------------------------------------------------ */

onInput({
  // Redesenha só a lista de carteiras: re-renderizar a view inteira tiraria o
  // foco do campo a cada tecla digitada.
  crmSearch(_data, el) {
    state.crmSearchTerm = el.value;
    const container = $('crmPortfolios');
    if (!container) return;
    const vendors = isAdmin() ? metaVendors() : metaVendors().filter(v => v.id === myVendorId());
    const terciles = monetaryTerciles(state.clients.map(client => client.id));
    container.outerHTML = portfolios(vendors, terciles);
  }
});

onClick({
  newClient() { openClientModal(); },
  editClient({ clientId }) { openClientModal(clientId); },
  newPurchase({ clientId }) { openPurchaseModal(clientId); },
  newContact({ clientId }) { openContactModal(clientId); },
  importCarteira() { openImportCarteiraModal(); },

  toggleCarteira({ vendorId }) {
    const open = new Set(state.openCarteiras);
    open.has(vendorId) ? open.delete(vendorId) : open.add(vendorId);
    setState({ openCarteiras: open });
  },

  toggleClient({ clientId }) {
    const open = new Set(state.openClients);
    open.has(clientId) ? open.delete(clientId) : open.add(clientId);
    setState({ openClients: open });
  },

  moveClient({ clientId }) {
    const client = clientById(clientId);
    const options = metaVendors().filter(vendor => vendor.id !== client.ownerVendorId);
    if (!options.length) { showToast('Não há outra vendedora para receber a carteira'); return; }

    confirmModal({
      title: 'Mudar de carteira',
      message: `Passar <b>${esc(client.name)}</b> para a carteira de <b>${esc(options[0].name)}</b>?`,
      confirmLabel: `Passar para ${options[0].name}`,
      danger: false,
      onConfirm: async () => {
        await updateClient(clientId, { ownerVendorId: options[0].id });
        showToast('Carteira atualizada');
      }
    });
  },

  deleteClient({ clientId }) {
    const client = clientById(clientId);
    confirmModal({
      title: 'Remover cliente',
      message: `<b>${esc(client?.name || '')}</b> e o histórico dela saem do painel. Isso não pode ser desfeito.`,
      confirmLabel: 'Remover',
      onConfirm: async () => {
        await Promise.all([
          ...purchasesOf(clientId).map(purchase => deletePurchase(purchase.id)),
          ...contactsOf(clientId).map(contact => deleteContact(contact.id))
        ]);
        await deleteClient(clientId);
        showToast('Cliente removida');
      }
    });
  },

  async deletePurchase({ purchaseId }) {
    await deletePurchase(purchaseId);
    showToast('Compra removida');
  },

  async deleteContact({ contactId }) {
    await deleteContact(contactId);
    showToast('Contato removido');
  },

  async approveTransfer({ transferId }) {
    const transfer = state.transfers.find(t => t.id === transferId);
    if (!transfer) return;
    await updateClient(transfer.clientId, { ownerVendorId: transfer.toVendorId });
    await resolveTransfer(transferId, 'approved');
    showToast('Carteira transferida');
  },

  async rejectTransfer({ transferId }) {
    await resolveTransfer(transferId, 'rejected');
    showToast('Transferência recusada');
  }
});
