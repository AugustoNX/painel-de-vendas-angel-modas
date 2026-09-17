import { state, setState } from '../core/store.js';
import { MONTH_NAMES, TIER_ORDER, TIER_LABEL, ROLE } from '../config/constants.js';
import { session } from '../core/session.js';
import { $ } from '../ui/dom.js';
import { onClick } from '../ui/actions.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { money, pecas, esc } from '../ui/format.js';
import { lineChart, barChart } from '../ui/charts.js';
import { metaVendors, extraVendors, vendorName } from '../domain/metas.js';
import { RATES } from '../config/constants.js';
import { updateVendor } from '../data/vendors.repo.js';
import { revokeUser } from '../data/users.repo.js';
import { listSales } from '../data/sales.repo.js';
import { openVendorModal } from './modals/vendor.modal.js';
import { openCreateUserModal, openEditUserModal } from './modals/user.modal.js';

// Cache da análise anual: ela lê todos os meses do ano, então só roda sob demanda.
let yearAnalysis = null;
let analysisLoading = false;

export function renderEquipe() {
  const el = $('viewEquipe');
  if (!el) return;
  el.innerHTML = vendorsSection() + usersSection() + analysisSection();
}

/* ------------------------------------------------------------------ */
/* vendedoras                                                          */
/* ------------------------------------------------------------------ */

function vendorsSection() {
  const rows = [...metaVendors(), ...extraVendors(), ...state.vendors.filter(v => v.active === false)]
    .filter((vendor, idx, list) => list.findIndex(v => v.id === vendor.id) === idx)
    .map(vendor => {
      const account = state.users.find(user => user.vendorId === vendor.id);
      return `<tr class="${vendor.active === false ? 'row-off' : ''}">
        <td><b>${esc(vendor.name)}</b></td>
        <td>${vendor.isExtra ? '<span class="chip">Apoio</span>' : '<span class="chip chip-accent">Com meta</span>'}</td>
        <td>${vendor.active === false ? '<span class="chip chip-off">Inativa</span>' : '<span class="chip chip-ok">Ativa</span>'}</td>
        <td>${account ? esc(account.email) : '<span class="muted-text">sem acesso vinculado</span>'}</td>
        <td class="row-actions">
          <button class="ghost-btn" data-action="editVendor" data-vendor-id="${vendor.id}">Editar</button>
          <button class="ghost-btn" data-action="toggleVendorActive" data-vendor-id="${vendor.id}">
            ${vendor.active === false ? 'Reativar' : 'Desativar'}
          </button>
        </td>
      </tr>`;
    }).join('');

  return `<div class="card">
    <div class="store-card-header">
      <h2>Vendedoras</h2>
      <button class="crm-add-btn" data-action="newVendor">+ Nova vendedora</button>
    </div>
    <p class="pacer-note">A vendedora é o registro usado nas metas, nas vendas e nas carteiras. O acesso de login é separado e fica na tabela abaixo.</p>
    ${rows ? `<table class="data-table">
      <thead><tr><th>Nome</th><th>Tipo</th><th>Situação</th><th>Acesso vinculado</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>`
      : '<div class="empty-state">Nenhuma vendedora cadastrada. Comece criando a equipe.</div>'}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* acessos                                                             */
/* ------------------------------------------------------------------ */

function usersSection() {
  const rows = state.users.map(user => `<tr class="${user.active === false ? 'row-off' : ''}">
    <td><b>${esc(user.name || user.email)}</b>${user.id === session.uid ? ' <span class="chip chip-accent">você</span>' : ''}</td>
    <td>${esc(user.email)}</td>
    <td>${user.role === ROLE.ADMIN ? '<span class="chip chip-admin">Administração</span>' : '<span class="chip">Vendedora</span>'}</td>
    <td>${user.vendorId ? esc(vendorName(user.vendorId)) : '—'}</td>
    <td>${user.active === false ? '<span class="chip chip-off">Bloqueado</span>' : '<span class="chip chip-ok">Liberado</span>'}</td>
    <td class="row-actions">
      <button class="ghost-btn" data-action="editUser" data-uid="${user.id}">Editar</button>
      ${user.id === session.uid ? '' : `<button class="ghost-btn danger" data-action="revokeUser" data-uid="${user.id}">Remover acesso</button>`}
    </td>
  </tr>`).join('');

  return `<div class="card">
    <div class="store-card-header">
      <h2>Acessos ao painel</h2>
      <button class="crm-add-btn" data-action="newUser">+ Criar acesso</button>
    </div>
    <p class="pacer-note">Não existe cadastro aberto: toda conta nasce aqui. Remover o acesso tira a pessoa do painel na hora, mesmo que a conta de email continue existindo.</p>
    ${rows ? `<table class="data-table">
      <thead><tr><th>Nome</th><th>Email</th><th>Nível</th><th>Vendedora</th><th>Situação</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>`
      : '<div class="empty-state">Nenhum acesso cadastrado além do seu.</div>'}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* desempenho do ano                                                   */
/* ------------------------------------------------------------------ */

function analysisSection() {
  if (analysisLoading) {
    return '<div class="card"><h2>Desempenho do ano</h2><div class="empty-state">Carregando os meses...</div></div>';
  }

  if (!yearAnalysis || yearAnalysis.year !== state.year) {
    return `<div class="card">
      <div class="store-card-header">
        <h2>Desempenho de ${state.year}</h2>
        <button class="crm-add-btn" data-action="loadYearAnalysis">Carregar análise do ano</button>
      </div>
      <p class="pacer-note">Compara mês a mês o que cada vendedora vendeu, o nível atingido e a bonificação acumulada.</p>
    </div>`;
  }

  const { months, vendors, totals } = yearAnalysis;
  const colors = ['#1F3A5F', '#B9A16B', '#2C6B45', '#C0473B', '#6B7EC9', '#E07B39'];

  const chart = lineChart({
    labels: months.map(m => MONTH_NAMES[m.monthIdx].slice(0, 3)),
    height: 240,
    series: vendors.map((vendor, idx) => ({
      name: vendor.name,
      color: colors[idx % colors.length],
      points: months.map(month => month.byVendor[vendor.id]?.total || 0)
    }))
  });

  const ranking = barChart({
    items: vendors
      .map((vendor, idx) => ({ label: vendor.name, value: totals[vendor.id].total, color: colors[idx % colors.length] }))
      .sort((a, b) => b.value - a.value)
  });

  const tableRows = vendors.map(vendor => {
    const row = totals[vendor.id];
    return `<tr>
      <td><b>${esc(vendor.name)}</b></td>
      <td>${money(row.total)}</td>
      <td>${pecas(row.pecas)}</td>
      <td>${row.metasBatidas}/${months.filter(m => m.goal).length}</td>
      <td>${row.tiers.map(t => `<span class="tier-badge b-${t}">${TIER_LABEL[t]}</span>`).join(' ') || '—'}</td>
      <td><b>${money(row.bonus)}</b></td>
    </tr>`;
  }).join('');

  return `<div class="card">
    <div class="store-card-header">
      <h2>Desempenho de ${state.year}</h2>
      <button class="ghost-btn" data-action="loadYearAnalysis">Atualizar</button>
    </div>
    ${chart}
    <div class="mini-title">Total vendido no ano</div>
    ${ranking}
    <table class="data-table">
      <thead><tr><th>Vendedora</th><th>Vendido</th><th>Peças</th><th>Meses com meta batida</th><th>Níveis atingidos</th><th>Bonificação</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}

async function loadYearAnalysis() {
  analysisLoading = true;
  setState({});

  const vendors = metaVendors();
  const months = [];

  for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
    const key = `${state.year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const goal = state.goals[key] || null;
    const sales = await listSales(key);
    if (!goal && !sales.length) continue;

    const byVendor = {};
    sales.forEach(sale => {
      const bucket = byVendor[sale.vendorId] || (byVendor[sale.vendorId] = { total: 0, pecas: 0 });
      bucket.total += Number(sale.amount || 0);
      bucket.pecas += Number(sale.pecas || 0);
    });
    months.push({ monthIdx, goal, byVendor });
  }

  const totals = {};
  vendors.forEach(vendor => {
    totals[vendor.id] = { total: 0, pecas: 0, bonus: 0, metasBatidas: 0, tiers: [] };
  });

  months.forEach(month => {
    vendors.forEach(vendor => {
      const sold = month.byVendor[vendor.id]?.total || 0;
      const row = totals[vendor.id];
      row.total += sold;
      row.pecas += month.byVendor[vendor.id]?.pecas || 0;

      if (!month.goal?.niveis) return;
      let reached = null;
      TIER_ORDER.forEach(tier => {
        const target = month.goal.niveis[tier];
        if (target != null && sold >= Number(target)) reached = tier;
      });
      if (reached) {
        row.metasBatidas++;
        row.bonus += Number(month.goal.niveis[reached]) * RATES[reached];
        if (!row.tiers.includes(reached)) row.tiers.push(reached);
      }
    });
  });

  yearAnalysis = { year: state.year, months, vendors, totals };
  analysisLoading = false;
  setState({});
}

/* ------------------------------------------------------------------ */
/* ações                                                               */
/* ------------------------------------------------------------------ */

onClick({
  newVendor() { openVendorModal(); },
  editVendor({ vendorId }) { openVendorModal(vendorId); },

  async toggleVendorActive({ vendorId }) {
    const vendor = state.vendors.find(v => v.id === vendorId);
    if (!vendor) return;
    await updateVendor(vendorId, { active: vendor.active === false });
    showToast(vendor.active === false ? 'Vendedora reativada' : 'Vendedora desativada');
  },

  newUser() { openCreateUserModal(); },
  editUser({ uid }) { openEditUserModal(uid); },

  revokeUser({ uid }) {
    const user = state.users.find(u => u.id === uid);
    confirmModal({
      title: 'Remover acesso',
      message: `<b>${esc(user?.name || user?.email || '')}</b> deixa de entrar no painel imediatamente. Os dados lançados por essa pessoa continuam salvos.`,
      confirmLabel: 'Remover acesso',
      onConfirm: async () => {
        await revokeUser(uid);
        showToast('Acesso removido');
      }
    });
  },

  loadYearAnalysis() { return loadYearAnalysis(); }
});
