import { state, setState } from '../core/store.js';
import { COLECOES } from '../config/constants.js';
import { $ } from '../ui/dom.js';
import { onClick, onInput } from '../ui/actions.js';
import { showToast } from '../ui/toast.js';
import { openModal, field, selectField, confirmModal } from '../ui/modal.js';
import { money, esc, dateBr, todayIso, pct } from '../ui/format.js';
import { readNumber, readDate } from '../ui/mask.js';
import { vendorName } from '../domain/metas.js';
import { clientName } from '../domain/crm.js';
import { marcaById, findMarcaByName, otbCombos, otbSuggestion } from '../domain/otb.js';
import { createMarca, createStockPurchase, deleteStockPurchase } from '../data/stock.repo.js';
import { openPurchaseModal } from './modals/crm.modals.js';
import { openBrandSalesModal } from '../features/import-marcas.js';

export function renderCompras() {
  const el = $('viewCompras');
  if (!el) return;

  const tabs = `<nav class="subtabs">
    <button class="${state.comprasSubTab === 'clientes' ? 'active' : ''}" data-action="comprasTab" data-tab="clientes">Compras de clientes</button>
    <button class="${state.comprasSubTab === 'estoque' ? 'active' : ''}" data-action="comprasTab" data-tab="estoque">📦 Estoque por marca</button>
  </nav>`;

  el.innerHTML = tabs + (state.comprasSubTab === 'clientes' ? clientPurchases() : stockSection());
}

/* ------------------------------------------------------------------ */
/* compras de clientes                                                 */
/* ------------------------------------------------------------------ */

function clientPurchases() {
  const term = state.comprasSearchTerm.toLowerCase();
  const list = state.purchases.filter(purchase =>
    !term || clientName(purchase.clientId).toLowerCase().includes(term));
  const total = list.reduce((sum, purchase) => sum + Number(purchase.value || 0), 0);

  return `<div class="crm-toolbar">
      <input type="text" class="crm-search" placeholder="Buscar por nome da cliente..."
        value="${esc(state.comprasSearchTerm)}" data-input-action="comprasSearch">
      <button class="crm-add-btn" data-action="newPurchaseFromCompras">+ Nova compra</button>
    </div>
    <div class="crm-stats-row">
      <div class="crm-stat-chip"><div class="csc-label">Compras registradas</div><div class="csc-value">${list.length}</div></div>
      <div class="crm-stat-chip"><div class="csc-label">Total em compras</div><div class="csc-value">${money(total)}</div></div>
      <div class="crm-stat-chip"><div class="csc-label">Ticket médio</div><div class="csc-value">${list.length ? money(total / list.length) : '—'}</div></div>
    </div>
    <div id="comprasList">${purchaseTable(list)}</div>`;
}

function purchaseTable(list) {
  if (!list.length) return '<div class="empty-clients">Nenhuma compra encontrada.</div>';

  return `<table class="purchases">
    <thead><tr><th>Data</th><th>Cliente</th><th>Vendedora</th><th>Valor</th><th>Observação</th><th></th></tr></thead>
    <tbody>${list.map(purchase => `<tr>
      <td>${dateBr(purchase.date)}</td>
      <td>${esc(clientName(purchase.clientId))}</td>
      <td>${esc(vendorName(purchase.vendorId))}</td>
      <td>${money(purchase.value)}</td>
      <td>${esc(purchase.notes || '—')}</td>
      <td><button class="del-btn" data-action="deletePurchase" data-purchase-id="${purchase.id}">remover</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

/* ------------------------------------------------------------------ */
/* estoque por marca (OTB)                                             */
/* ------------------------------------------------------------------ */

function stockSection() {
  let html = `<div class="crm-toolbar">
    <button class="crm-add-btn" data-action="newStockPurchase">+ Registrar compra de estoque</button>
    <button class="crm-add-btn" data-action="importBrandSales">📄 Importar Análise de Vendas (PDF)</button>
  </div>`;

  if (state.marcas.length) {
    html += `<div class="marca-list">${state.marcas.map(marca => `<span class="marca-chip">${esc(marca.name)}</span>`).join('')}</div>`;
  }

  const combos = otbCombos().sort((a, b) =>
    (marcaById(a.marcaId)?.name || '').localeCompare(marcaById(b.marcaId)?.name || ''));

  if (!combos.length) {
    return html + '<div class="empty-clients">Nenhuma marca com compra ou venda registrada ainda. Comece registrando uma compra de estoque.</div>';
  }

  html += `<div class="otb-card">
    <h2>🧮 Sugestão de compra por marca e coleção</h2>
    <p class="card-sub">Compara o que foi comprado com o que já vendeu da coleção e sugere quanto comprar na próxima estação equivalente.</p>
    <table class="otb">
      <thead><tr><th>Marca</th><th>Coleção</th><th>Comprado</th><th>Vendido</th><th>Estoque</th><th>Sell-through</th><th>Sugestão</th></tr></thead>
      <tbody>${combos.map(combo => {
        const marca = marcaById(combo.marcaId);
        if (!marca) return '';
        const s = otbSuggestion(combo.marcaId, combo.colecao, combo.ano);
        const trend = s.fator === null ? '' : s.fator > 1 ? 'up' : s.fator < 1 ? 'down' : 'flat';
        return `<tr>
          <td><b>${esc(marca.name)}</b></td>
          <td>${esc(combo.colecao)} ${combo.ano}</td>
          <td>${s.compradoPecas} peças<br>${money(s.compradoValor)}</td>
          <td>${s.vendidoPecas} peças<br>${money(s.vendidoValor)}</td>
          <td>${s.estoquePecas} peças</td>
          <td>${s.sellThrough === null ? '—' : `<span class="sellthrough-bar-outer"><span class="sellthrough-bar-inner" style="width:${Math.min(s.sellThrough * 100, 100)}%"></span></span>${pct(s.sellThrough * 100)}`}</td>
          <td class="otb-suggestion ${trend}">${s.sugestaoPecas === null ? 'Sem venda registrada' :
            `${s.sugestaoPecas} peças<br>${money(s.sugestaoValor)}<div class="otb-hint">${esc(s.faixa)}</div>`}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;

  const purchases = [...state.stockPurchases].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (purchases.length) {
    html += `<div class="card">
      <h2>Compras de estoque lançadas</h2>
      <table class="data-table">
        <thead><tr><th>Data</th><th>Marca</th><th>Coleção</th><th>Peças</th><th>Valor</th><th>Custo/peça</th><th></th></tr></thead>
        <tbody>${purchases.map(purchase => `<tr>
          <td>${dateBr(purchase.date)}</td>
          <td>${esc(marcaById(purchase.marcaId)?.name || '—')}</td>
          <td>${esc(purchase.colecao)} ${purchase.ano}</td>
          <td>${purchase.pecas}</td>
          <td>${money(purchase.valor)}</td>
          <td>${purchase.pecas ? money(purchase.valor / purchase.pecas) : '—'}</td>
          <td><button class="del-btn" data-action="deleteStockPurchase" data-stock-id="${purchase.id}">remover</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  return html;
}

function openStockPurchaseModal() {
  openModal({
    title: 'Registrar compra de estoque',
    subtitle: 'Marcas novas são criadas automaticamente ao salvar.',
    body: `
      <div class="field">
        <label for="stockMarca">Marca</label>
        <input id="stockMarca" list="stockMarcaOptions" placeholder="Digite ou escolha a marca">
        <datalist id="stockMarcaOptions">${state.marcas.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist>
      </div>
      ${selectField({ id: 'stockColecao', label: 'Coleção', options: COLECOES.map(c => ({ value: c, label: c })), value: 'Verão' })}
      ${field({ id: 'stockAno', label: 'Ano da coleção', mask: 'year', value: new Date().getFullYear() })}
      ${field({ id: 'stockDate', label: 'Data da compra', mask: 'date', value: todayIso() })}
      ${field({ id: 'stockPecas', label: 'Quantidade de peças', mask: 'integer' })}
      ${field({ id: 'stockValor', label: 'Valor total (R$)', mask: 'money' })}`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Registrar',
        kind: 'primary',
        onClick: async ({ body }) => {
          const marcaName = body.querySelector('#stockMarca').value.trim();
          const pecasQtd = readNumber(body.querySelector('#stockPecas'));
          const valor = readNumber(body.querySelector('#stockValor'));
          const date = readDate(body.querySelector('#stockDate'));

          if (!marcaName) { showToast('Digite o nome da marca'); return false; }
          if (!date || !pecasQtd || pecasQtd <= 0 || !valor || valor <= 0) {
            showToast('Preencha data, peças e valor corretamente'); return false;
          }

          const marca = findMarcaByName(marcaName);
          const marcaId = marca ? marca.id : await createMarca(marcaName);

          await createStockPurchase({
            marcaId,
            colecao: body.querySelector('#stockColecao').value,
            ano: readNumber(body.querySelector('#stockAno')),
            date,
            pecas: pecasQtd,
            valor
          });
          showToast('Compra de estoque registrada');
        }
      }
    ]
  });
}

/* ------------------------------------------------------------------ */
/* ações                                                               */
/* ------------------------------------------------------------------ */

onClick({
  comprasTab({ tab }) { setState({ comprasSubTab: tab }); },
  newPurchaseFromCompras() { openPurchaseModal(null); },
  newStockPurchase() { openStockPurchaseModal(); },
  importBrandSales() { openBrandSalesModal(); },

  deleteStockPurchase({ stockId }) {
    confirmModal({
      title: 'Remover compra de estoque',
      message: 'Esse lançamento sai do cálculo de sell-through e das sugestões.',
      confirmLabel: 'Remover',
      onConfirm: async () => {
        await deleteStockPurchase(stockId);
        showToast('Lançamento removido');
      }
    });
  }
  // A ação "deletePurchase" é registrada uma única vez, na view de carteira.
});

onInput({
  comprasSearch(_data, el) {
    state.comprasSearchTerm = el.value;
    const container = $('comprasList');
    if (!container) return;
    const term = el.value.toLowerCase();
    container.innerHTML = purchaseTable(state.purchases.filter(purchase =>
      !term || clientName(purchase.clientId).toLowerCase().includes(term)));
  }
});
