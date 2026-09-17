import { state, setState, currentGoal, periodKey } from '../core/store.js';
import { MONTH_NAMES, TIER_ORDER, TIER_LABEL, RATES } from '../config/constants.js';
import { isAdmin, isVendedora, myVendorId } from '../core/session.js';
import { $, val, num } from '../ui/dom.js';
import { onClick, onInput, onChange } from '../ui/actions.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { money, moneyRound, pecas, fmt, esc, dateBr, todayIso, dayMonth } from '../ui/format.js';
import { displayMasked, maskAttrs, parseDateBr, readNumber } from '../ui/mask.js';
import { lineChart, barChart } from '../ui/charts.js';
import {
  goalVendors, extraVendors, vendorById, vendorName, vendorTotal, vendorPecas, vendorWeekTotal,
  salesOf, currentTier, nextTierInfo, topTierTarget, tierBonus, vendorBonus, availableTiers,
  storeSummary, currentWeeks, weeklyTargets, monthPecasTarget, isMonthOpen, monthOpensAt,
  goalFor, knownYears, cumulativeByDay, idealCumulativeByDay, cutAtToday, daysInMonth,
  lastSaleDate, daysWithoutSelling, sellingDays, averagePerSellingDay, daysLeftInMonth
} from '../domain/metas.js';
import { addSale, deleteSale } from '../data/sales.repo.js';
import { patchGoal } from '../data/goals.repo.js';
import { openGoalModal } from './modals/goal.modal.js';
import { openSaleModal } from './modals/sale.modal.js';
import { openImportSalesModal } from '../features/import-vendas.js';
import { exportCommissionPdf } from '../features/report-pdf.js';

export function renderVendas() {
  const el = $('viewVendas');
  if (!el) return;

  const goal = currentGoal();
  let html = periodNav();

  if (!goal) {
    el.innerHTML = html + (isAdmin() ? emptyGoalState() : vendorNoGoalState());
    return;
  }

  if (isAdmin()) {
    html += storeCard(goal) + evolutionCard(goal) + rankingCard(goal) + idleCard(goal);
  } else {
    html += saleCtaCard() + vendorHeroCard(goal);
  }

  html += tierGoalsCard(goal);
  html += pacerCard(goal);
  html += vendorsAccordion(goal);
  if (isAdmin()) html += entryCard(goal);

  el.innerHTML = html;
}

/* ------------------------------------------------------------------ */
/* seleção de período                                                  */
/* ------------------------------------------------------------------ */

function periodNav() {
  const years = knownYears();
  const monthsHtml = MONTH_NAMES.map((name, idx) => {
    const open = isMonthOpen(state.year, idx);
    const hasGoal = !!goalFor(state.year, idx);
    const classes = [
      idx === state.month ? 'active' : '',
      !open ? 'locked' : '',
      open && !hasGoal ? 'no-goal' : ''
    ].filter(Boolean).join(' ');
    return `<button class="${classes}" data-action="selectMonth" data-month="${idx}" title="${hasGoal ? '' : 'Sem meta definida'}">
      ${!open ? '🔒 ' : ''}${name.slice(0, 3)}
    </button>`;
  }).join('');

  return `<div class="period-bar">
    <div class="year-picker">
      ${years.map(year => `<button class="${year === state.year ? 'active' : ''}" data-action="selectYear" data-year="${year}">${year}</button>`).join('')}
      <button class="year-add" data-action="selectYear" data-year="${Math.max(...years) + 1}" title="Ir para o próximo ano">+</button>
    </div>
    <nav class="months">${monthsHtml}</nav>
  </div>`;
}

function vendorNoGoalState() {
  const label = `${MONTH_NAMES[state.month]}/${state.year}`;
  return saleCtaCard() + `<div class="card empty-goal">
    <h2>Meta de ${label} ainda não publicada</h2>
    <p>Você já pode cadastrar as vendas do dia. Assim que a administração definir o objetivo, elas entram no acompanhamento dos níveis.</p>
  </div>` + (myVendorId() ? `<div class="card">${salesTable(myVendorId())}</div>` : '');
}

/**
 * O botão que a vendedora usa o dia inteiro: fecha a venda no caixa e vem
 * registrar o que saiu. O formulário completo abre num modal.
 */
function saleCtaCard() {
  if (!vendorById(myVendorId())) {
    return `<div class="card empty-goal"><h2>Seu acesso ainda não está ligado a uma vendedora</h2>
      <p>Peça para a administração vincular sua conta no menu Equipe.</p></div>`;
  }
  return `<div class="card sale-cta">
    <div>
      <h2>Fechou uma venda?</h2>
      <p>Cadastre o valor, as peças e o que saiu. Entra na hora na sua meta.</p>
    </div>
    <button class="sale-cta-btn" data-action="openSale">Registrar venda</button>
  </div>`;
}

function emptyGoalState() {
  const label = `${MONTH_NAMES[state.month]}/${state.year}`;
  if (isAdmin()) {
    return `<div class="card empty-goal">
      <h2>Sem meta definida para ${label}</h2>
      <p>Defina o objetivo da loja e as faixas de bonificação para começar a acompanhar o mês. O balizador semanal é calculado sozinho a partir do calendário.</p>
      <button class="btn-primary" data-action="openGoal">Definir meta de ${label}</button>
    </div>`;
  }
  return `<div class="card empty-goal">
    <h2>Meta de ${label} ainda não publicada</h2>
    <p>Assim que a administração definir o objetivo do mês, ele aparece aqui.</p>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* cartão da loja (admin)                                              */
/* ------------------------------------------------------------------ */

function storeCard(goal) {
  const summary = storeSummary(goal);
  const collapsed = state.storeCardCollapsed;

  let html = `<div class="card store-card">
    <div class="store-card-header">
      <h2>Loja — ${MONTH_NAMES[state.month]}/${state.year}</h2>
      <div class="store-card-header-right">
        ${collapsed ? `<span class="store-summary-inline">${money(summary.realizado)} de ${money(summary.objetivo)}</span>` : ''}
        <button class="ghost-btn" data-action="openGoal">Editar meta</button>
        <button class="minimize-btn" data-action="toggleStoreCard">${collapsed ? '+' : '−'}</button>
      </div>
    </div>`;

  if (!collapsed) {
    html += `<div class="kpi-grid">
      ${kpi('Objetivo da loja', money(summary.objetivo))}
      ${kpi('Realizado', money(summary.realizado), 'big')}
      ${kpi(summary.falta > 0 ? 'Falta para o objetivo' : 'Excedente', money(summary.falta > 0 ? summary.falta : summary.excedente), summary.falta > 0 ? 'missing' : 'done')}
      ${kpi('Peças vendidas', pecas(summary.pecas))}
      ${kpi('Bonificação a pagar', money(summary.bonificacao))}
      ${kpi('Ticket médio por peça', summary.pecas > 0 ? money(summary.realizado / summary.pecas) : '—')}
    </div>
    <div class="store-progress-outer"><div class="store-progress-inner" style="width:${summary.progresso}%"></div></div>
    <div class="progress-caption">${fmt(summary.progresso)}% do objetivo do mês</div>`;

    if (summary.extras > 0) {
      html += `<div class="stat-row"><span class="stat-label">Vendido pelos apoios (${extraVendors().map(v => esc(v.name)).join(', ')})</span>
        <span class="stat-value">${money(summary.extras)}</span></div>`;
    }

    if (Number(goal.campanhaAlvo) > 0) {
      html += `<div class="campaign-box">
        <label for="campanhaInput">Campanha não comissionável — meta ${money(goal.campanhaAlvo)}</label>
        <input id="campanhaInput" type="text" value="${displayMasked('money', goal.campanhaRealizado)}"
          placeholder="0,00" ${maskAttrs('money')} data-change-action="saveCampanha">
        <div class="campaign-note">Entra no faturamento da loja, mas não soma para nenhuma vendedora nem para a base de bonificação.</div>
      </div>`;
    }

    html += `<div class="card-footer-actions">
      <button class="crm-add-btn" data-action="exportPdf">📄 Relatório de comissões (PDF)</button>
    </div>`;
  }

  return html + '</div>';
}

function kpi(label, value, modifier = '') {
  return `<div class="kpi ${modifier}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span></div>`;
}

/* ------------------------------------------------------------------ */
/* cartão da vendedora logada                                          */
/* ------------------------------------------------------------------ */

function vendorHeroCard(goal) {
  const vendorId = myVendorId();
  const vendor = vendorById(vendorId);
  if (!vendor) {
    return `<div class="card empty-goal"><h2>Seu acesso ainda não está ligado a uma vendedora</h2>
      <p>Peça para a administração vincular sua conta no menu Equipe.</p></div>`;
  }

  const total = vendorTotal(vendorId);
  const tier = currentTier(goal, total);
  const next = nextTierInfo(goal, total);
  const bonus = tierBonus(goal, tier);
  const pecasVendidas = vendorPecas(vendorId);

  return `<div class="card store-card">
    <div class="store-card-header"><h2>${esc(vendor.name)} — ${MONTH_NAMES[state.month]}/${state.year}</h2></div>
    <div class="kpi-grid">
      ${kpi('Você vendeu', money(total), 'big')}
      ${kpi('Peças', pecas(pecasVendidas))}
      ${kpi('Nível atual', tier ? TIER_LABEL[tier] : 'Abaixo do Bronze')}
      ${kpi(next ? `Falta para ${TIER_LABEL[next.tier]}` : 'Nível máximo', next ? money(next.falta) : '🎉', next ? 'missing' : 'done')}
      ${kpi('Bonificação garantida', money(bonus), 'done')}
    </div>
    ${idleStrip(vendorId, next)}
    <div class="kpi-grid">
      ${kpi('Ticket médio por peça', pecasVendidas > 0 ? money(total / pecasVendidas) : '—')}
      ${kpi('Dias com venda no mês', `${sellingDays(vendorId)} de ${daysInMonth()}`)}
      ${kpi('Média por dia vendido', money(averagePerSellingDay(vendorId)))}
    </div>
    ${evolutionChart(goal, [vendorId], next ? next.alvo : topTierTarget(goal), next ? `Ritmo para ${TIER_LABEL[next.tier]}` : 'Ritmo do nível máximo')}
  </div>`;
}

/**
 * Faixa de "tempo sem vender": é o aviso mais acionável do painel, então fica
 * destacado e junto do quanto ainda precisa sair por dia até o fim do mês.
 */
function idleStrip(vendorId, next) {
  const idle = daysWithoutSelling(vendorId);
  const last = lastSaleDate(vendorId);
  const left = daysLeftInMonth();

  let tone = 'ok';
  let headline;
  if (idle === null) {
    tone = 'warn';
    headline = 'Nenhuma venda lançada neste mês ainda';
  } else if (idle === 0) {
    headline = 'Você vendeu hoje 🎉';
  } else {
    if (idle >= 3) tone = 'warn';
    headline = `${idle} dia${idle === 1 ? '' : 's'} sem vender`;
  }

  const perDay = next && left > 0
    ? `Para chegar no ${TIER_LABEL[next.tier]} faltam <b>${money(next.falta / left)}</b> por dia nos ${left} dia${left === 1 ? '' : 's'} restantes.`
    : next
      ? `Faltam <b>${money(next.falta)}</b> para o ${TIER_LABEL[next.tier]}.`
      : 'Você já está no nível máximo do mês.';

  return `<div class="idle-strip idle-${tone}">
    <div class="idle-main">${headline}</div>
    <div class="idle-sub">${last ? `Última venda em ${dateBr(last)}. ` : ''}${perDay}</div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* gráficos                                                            */
/* ------------------------------------------------------------------ */

function evolutionCard(goal) {
  return `<div class="card">
    <h2>Evolução do mês</h2>
    <p class="pacer-note">Comparação entre o acumulado real da loja e o ritmo necessário para bater o objetivo, dia a dia.</p>
    ${evolutionChart(goal, null, Number(goal.obj || 0), 'Ritmo ideal do objetivo')}
  </div>`;
}

function evolutionChart(goal, vendorIds, target, idealName) {
  const labels = Array.from({ length: daysInMonth() }, (_, i) => String(i + 1));
  return lineChart({
    labels,
    series: [
      { name: idealName, color: '#B9A16B', points: idealCumulativeByDay(target), dashed: true },
      { name: 'Realizado acumulado', color: '#1F3A5F', points: cutAtToday(cumulativeByDay(vendorIds)), fill: true }
    ]
  });
}

function rankingCard(goal) {
  const vendors = goalVendors(goal);
  if (!vendors.length) return '';

  const bronze = goal.niveis?.bronze ? Number(goal.niveis.bronze) : 0;
  const items = vendors
    .map(vendor => {
      const total = vendorTotal(vendor.id);
      const tier = currentTier(goal, total);
      return {
        label: vendor.name,
        value: total,
        marker: bronze,
        color: tier ? `var(--${tier})` : 'var(--muted)'
      };
    })
    .sort((a, b) => b.value - a.value);

  return `<div class="card">
    <h2>Ranking da equipe</h2>
    <p class="pacer-note">A marca na barra é a meta do Bronze — primeira faixa que gera bonificação.</p>
    ${barChart({ items })}
  </div>`;
}

/** Quem parou de vender: o admin precisa ver isso antes do fim do mês. */
function idleCard(goal) {
  const rows = goalVendors(goal)
    .map(vendor => ({ vendor, idle: daysWithoutSelling(vendor.id), last: lastSaleDate(vendor.id) }))
    .filter(row => row.idle === null || row.idle >= 3)
    .sort((a, b) => (b.idle ?? Infinity) - (a.idle ?? Infinity));

  if (!rows.length) {
    return `<div class="card attention-card success">
      <h2>Ninguém parada</h2>
      <p class="pacer-note">Todas as vendedoras da escala venderam nos últimos dois dias.</p>
    </div>`;
  }

  return `<div class="card attention-card">
    <h2>Tempo sem vender</h2>
    <p class="pacer-note">Vendedoras da escala sem nenhuma venda lançada há três dias ou mais.</p>
    ${rows.map(({ vendor, idle, last }) => `<div class="attention-row">
      <div>
        <div class="ar-name">${esc(vendor.name)}</div>
        <div class="ar-meta">${last ? `última venda em ${dateBr(last)}` : 'nenhuma venda neste mês'} · ${money(vendorTotal(vendor.id))} no mês</div>
      </div>
      <div class="ar-action">${idle === null ? '—' : `<b>${idle}</b> dias`}</div>
    </div>`).join('')}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* metas por nível                                                     */
/* ------------------------------------------------------------------ */

function tierGoalsCard(goal) {
  const blocks = TIER_ORDER.map(tier => {
    const value = goal.niveis?.[tier];
    const available = value !== null && value !== undefined && value !== '';
    const alvoPecas = monthPecasTarget(goal, tier);
    return `<div class="tier-goal-block" style="border-top-color:var(--${tier})">
      <div class="tg-name">${TIER_LABEL[tier]}</div>
      <div class="tg-value ${available ? '' : 'unavailable'}">${available ? money(value) : 'Não vale neste mês'}</div>
      ${alvoPecas ? `<div class="tg-pecas">${pecas(alvoPecas)}</div>` : ''}
      <div class="tg-rate">Faixa de ${(RATES[tier] * 100).toFixed(1)}%</div>
      ${available ? `<div class="tg-bonus"><span class="tg-bonus-label">Bonificação ao atingir</span>${money(tierBonus(goal, tier))}</div>` : ''}
    </div>`;
  }).join('');

  return `<div class="card">
    <h2>${isVendedora() ? 'Seus objetivos do mês' : 'Metas do mês — por vendedora'}</h2>
    <div class="tier-goals-grid">${blocks}</div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* balizador semanal                                                   */
/* ------------------------------------------------------------------ */

function pacerCard(goal) {
  const weeks = currentWeeks();
  const targetsByTier = Object.fromEntries(TIER_ORDER.map(tier => [tier, weeklyTargets(goal, tier)]));

  const rows = weeks.map(week => {
    const isOpen = state.openPacerWeeks.has(week.idx);
    let html = `<div class="week-item${isOpen ? ' open' : ''}">
      <button class="week-header" data-action="togglePacerWeek" data-week="${week.idx}">
        <span>${week.label}<span class="week-range">${week.periodo}</span></span>
        <span class="week-header-right"><span class="week-weight">peso ${week.weight}</span><span class="chevron">▶</span></span>
      </button>`;

    if (isOpen) {
      html += '<div class="week-body"><div class="week-tier-grid">';
      TIER_ORDER.forEach(tier => {
        const cell = targetsByTier[tier][week.idx];
        if (!cell || cell.rs === null) {
          html += `<div class="week-tier-block wtb-na"><div class="wtb-name">${TIER_LABEL[tier]}</div><div class="wtb-value">—</div></div>`;
          return;
        }
        html += `<div class="week-tier-block" style="border-top-color:var(--${tier})">
          <div class="wtb-name">${TIER_LABEL[tier]}</div>
          <div class="wtb-value">${moneyRound(cell.rs)}</div>
          ${cell.pecas !== null ? `<div class="wtb-pecas">${cell.pecas} peças</div>` : ''}
        </div>`;
      });
      html += '</div></div>';
    }
    return html + '</div>';
  }).join('');

  const totals = TIER_ORDER
    .map(tier => `<span>${TIER_LABEL[tier]}: <b>${goal.niveis?.[tier] ? moneyRound(goal.niveis[tier]) : '—'}</b></span>`)
    .join('');

  return `<div class="card">
    <h2>Balizador semanal — por vendedora</h2>
    <p class="pacer-note">Semanas reais de calendário (domingo a sábado). A primeira e a última pesam 1 e as do meio pesam 2, então semanas quebradas exigem menos.</p>
    <div class="week-accordion">${rows}</div>
    <div class="week-monthly-total">${totals}</div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* acordeão de vendedoras                                              */
/* ------------------------------------------------------------------ */

function vendorsAccordion(goal) {
  let vendors = goalVendors(goal);
  if (isVendedora()) vendors = vendors.filter(vendor => vendor.id === myVendorId());

  if (!vendors.length) {
    return `<div class="card"><div class="empty-clients">${isVendedora()
      ? 'Você não está na escala de metas deste mês.'
      : 'Nenhuma vendedora na escala deste mês. Edite a meta para incluir a equipe.'}</div></div>`;
  }

  let html = '<div class="vaccordion">' + vendors.map(vendor => vendorItem(goal, vendor)).join('');

  if (isAdmin()) {
    html += extraVendors().map(vendor => extraVendorItem(vendor)).join('');
  }

  return html + '</div>';
}

function vendorItem(goal, vendor) {
  const total = vendorTotal(vendor.id);
  const top = topTierTarget(goal) || total || 1;
  const tier = currentTier(goal, total);
  const next = nextTierInfo(goal, total);
  const isOpen = isVendedora() || state.openVendorId === vendor.id;

  const marks = availableTiers(goal).map(t => {
    const left = Math.min((Number(goal.niveis[t]) / top) * 100, 100);
    return `<div class="tier-mark tier-mark-${t}" style="left:${left}%" data-action="selectTier" data-vendor-id="${vendor.id}" data-tier="${t}"></div>`;
  }).join('');

  const labels = availableTiers(goal).map(t => {
    const left = Math.min((Number(goal.niveis[t]) / top) * 100, 100);
    const active = state.selectedTier[vendor.id] === t;
    return `<span class="tier-label-item${active ? ' active' : ''}" style="left:${left}%"
      data-action="selectTier" data-vendor-id="${vendor.id}" data-tier="${t}">${TIER_LABEL[t]}</span>`;
  }).join('');

  const badge = tier
    ? `<span class="tier-badge b-${tier}">${TIER_LABEL[tier]}</span>`
    : '<span class="tier-badge b-none">Abaixo do Bronze</span>';

  const chosen = state.selectedTier[vendor.id];
  let status;
  if (chosen && goal.niveis?.[chosen] != null) {
    const diff = Number(goal.niveis[chosen]) - total;
    status = diff > 0
      ? `${badge} faltam <b>${money(diff)}</b> para ${TIER_LABEL[chosen]} <span class="vaccordion-hint">(toque de novo para voltar ao automático)</span>`
      : `${badge} já bateu ${TIER_LABEL[chosen]} — excedente de <b>${money(-diff)}</b>`;
  } else {
    status = next
      ? `${badge} faltam <b>${money(next.falta)}</b> para ${TIER_LABEL[next.tier]}`
      : `${badge} nível máximo do mês atingido 🎉`;
  }

  return `<div class="vaccordion-item${isOpen ? ' open' : ''}">
    <button class="vaccordion-header" data-action="toggleVendor" data-vendor-id="${vendor.id}">
      <span>${esc(vendor.name)}</span>
      <span class="vaccordion-hint">${money(total)} ${tier ? `<span class="tier-dot tier-mark-${tier}"></span>` : ''}<span class="chevron">▶</span></span>
    </button>
    ${isOpen ? `<div class="vaccordion-body">
      <div class="vtotal">Vendido no mês: <b>${money(total)}</b> · ${pecas(vendorPecas(vendor.id))} · ${idleLabel(vendor.id)}</div>
      <div class="tier-track">
        <div class="tier-fill" style="width:${Math.min((total / top) * 100, 100)}%"></div>
        <div class="tier-marks">${marks}</div>
      </div>
      <div class="tier-labels">${labels}</div>
      <div class="tier-status">${status}</div>
      <div class="commission-line">
        <span>Bonificação a receber ${tier ? `(${TIER_LABEL[tier]} · faixa de ${(RATES[tier] * 100).toFixed(1)}%)` : '(nenhum nível ainda)'}</span>
        <b>${money(vendorBonus(goal, vendor.id))}</b>
      </div>
      <div class="pacer-note">Valor fixo da faixa atingida — não aumenta se vender mais dentro do mesmo nível.</div>
      ${vendorPacer(goal, vendor.id)}
      ${salesTable(vendor.id)}
    </div>` : ''}
  </div>`;
}

function idleLabel(vendorId) {
  const idle = daysWithoutSelling(vendorId);
  if (idle === null) return '<span class="idle-tag warn">sem vendas no mês</span>';
  if (idle === 0) return '<span class="idle-tag">vendeu hoje</span>';
  return `<span class="idle-tag${idle >= 3 ? ' warn' : ''}">${idle} dia${idle === 1 ? '' : 's'} sem vender</span>`;
}

function vendorPacer(goal, vendorId) {
  const targets = weeklyTargets(goal, 'bronze');
  const rows = currentWeeks().map(week => {
    const sold = vendorWeekTotal(vendorId, week);
    const target = targets[week.idx]?.rs;
    const hit = target !== null && sold >= target;
    const isOpen = state.openVendorPacerWeeks.has(week.idx);

    let html = `<div class="week-item${isOpen ? ' open' : ''}">
      <button class="week-header" data-action="toggleVendorWeek" data-week="${week.idx}">
        <span>${week.label}<span class="week-range">${week.periodo}</span></span>
        <span class="week-header-right">
          <span class="week-sold">${money(sold)}</span>
          ${hit ? '<span class="week-hit-dot" title="Bateu o ritmo do Bronze"></span>' : ''}
          <span class="chevron">▶</span>
        </span>
      </button>`;

    if (isOpen) {
      html += '<div class="week-body"><table class="pacer-mini"><tbody>';
      TIER_ORDER.forEach(tier => {
        const cell = weeklyTargets(goal, tier)[week.idx];
        if (!cell || cell.rs === null) {
          html += `<tr><td><span class="tier-badge b-none">${TIER_LABEL[tier]}</span></td><td class="pc-na">—</td></tr>`;
          return;
        }
        html += `<tr class="${sold >= cell.rs ? 'pacer-hit' : ''}">
          <td><span class="tier-badge b-${tier}">${TIER_LABEL[tier]}</span></td>
          <td>${moneyRound(cell.rs)}${cell.pecas !== null ? ` · ${pecas(cell.pecas)}` : ''}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }
    return html + '</div>';
  }).join('');

  return `<div class="mini-title">Balizador semanal</div><div class="week-accordion">${rows}</div>`;
}

function salesTable(vendorId) {
  const sales = salesOf(vendorId).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!sales.length) return '<div class="mini-title">Vendas lançadas</div><div class="empty-state">Nenhum lançamento ainda.</div>';

  // A vendedora corrige o que ela mesma digitou, mas não apaga o que veio do
  // relatório do ERP — as regras do banco recusam esse caso de qualquer forma.
  const canDelete = sale => isAdmin() || (vendorId === myVendorId() && sale.source !== 'import');

  const rows = sales.map(sale => `<tr>
    <td>
      <div>${dateBr(sale.date)}</div>
      ${sale.items ? `<div class="sale-items">${esc(sale.items)}</div>` : ''}
    </td>
    <td>${money(sale.amount)}</td>
    <td>${sale.pecas ? pecas(sale.pecas) : '—'}</td>
    <td>${sale.payment ? esc(sale.payment) : '—'}</td>
    <td>${sale.source === 'import' ? '<span class="src-tag">PDF</span>' : ''}</td>
    <td>${canDelete(sale) ? `<button class="del-btn" data-action="deleteSale" data-sale-id="${sale.id}">remover</button>` : ''}</td>
  </tr>`).join('');

  return `<div class="mini-title">Vendas lançadas</div>
    <table class="entries"><thead><tr><th>Data / o que saiu</th><th>Valor</th><th>Peças</th><th>Pagamento</th><th></th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function extraVendorItem(vendor) {
  const isOpen = state.openVendorId === vendor.id;
  return `<div class="vaccordion-item extra${isOpen ? ' open' : ''}">
    <button class="vaccordion-header" data-action="toggleVendor" data-vendor-id="${vendor.id}">
      <span>${esc(vendor.name)} <span class="vaccordion-hint">apoio</span></span>
      <span class="vaccordion-hint">${money(vendorTotal(vendor.id))}<span class="chevron">▶</span></span>
    </button>
    ${isOpen ? `<div class="vaccordion-body">
      <div class="vtotal">Vendido no mês: <b>${money(vendorTotal(vendor.id))}</b> · ${pecas(vendorPecas(vendor.id))}</div>
      <div class="pacer-note">Sem meta, nível ou bonificação — soma apenas no total da loja.</div>
      ${salesTable(vendor.id)}
    </div>` : ''}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* lançamento de vendas                                                */
/* ------------------------------------------------------------------ */

/**
 * O admin lança para qualquer uma; a vendedora lança só para si — o seletor some
 * e o vendorId sai direto do vínculo da conta, que é o mesmo que as regras do
 * banco exigem na gravação.
 */
function entryCard(goal) {
  const vendorPicker = `<div class="field"><label for="inpVendor">Vendedora</label>
        <select id="inpVendor">${[...goalVendors(goal), ...extraVendors()]
          .map(vendor => `<option value="${vendor.id}">${esc(vendor.name)}${vendor.isExtra ? ' (apoio)' : ''}</option>`)
          .join('')}</select></div>`;

  return `<div class="card entry-card">
    <div class="store-card-header">
      <h2>Lançar venda do dia</h2>
      <div class="store-card-header-right">
        <button class="ghost-btn" data-action="openSale">Formulário completo</button>
        <button class="crm-add-btn" data-action="openImportSales">📄 Importar relatório (PDF)</button>
      </div>
    </div>
    <div class="entry-form">
      <div class="field"><label for="inpDate">Data</label>
        <input id="inpDate" type="text" value="${displayMasked('date', todayIso())}" placeholder="00/00/0000" ${maskAttrs('date')}></div>
      ${vendorPicker}
      <div class="field grow"><label for="inpAmount">Valor vendido (R$)</label>
        <input id="inpAmount" type="text" placeholder="0,00" ${maskAttrs('money')} data-enter-action="addSale"></div>
      <div class="field"><label for="inpPecas">Peças</label>
        <input id="inpPecas" type="text" placeholder="0" ${maskAttrs('integer')} data-enter-action="addSale"></div>
      <button class="add-btn" data-action="addSale">Adicionar</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* ações                                                               */
/* ------------------------------------------------------------------ */

onClick({
  selectMonth({ month }) {
    const idx = Number(month);
    if (!isMonthOpen(state.year, idx)) {
      showToast(`Esse mês libera em ${dayMonth(monthOpensAt(state.year, idx))}`);
      return;
    }
    setState({ month: idx, openVendorId: null, openPacerWeeks: new Set(), openVendorPacerWeeks: new Set() });
  },

  selectYear({ year }) {
    setState({ year: Number(year), openVendorId: null });
  },

  toggleStoreCard() {
    setState({ storeCardCollapsed: !state.storeCardCollapsed });
  },

  toggleVendor({ vendorId }) {
    setState({
      openVendorId: state.openVendorId === vendorId ? null : vendorId,
      openVendorPacerWeeks: new Set()
    });
  },

  selectTier({ vendorId, tier }) {
    const selected = { ...state.selectedTier };
    selected[vendorId] = selected[vendorId] === tier ? null : tier;
    setState({ selectedTier: selected });
  },

  togglePacerWeek({ week }) {
    const weeks = new Set(state.openPacerWeeks);
    const idx = Number(week);
    weeks.has(idx) ? weeks.delete(idx) : weeks.add(idx);
    setState({ openPacerWeeks: weeks });
  },

  toggleVendorWeek({ week }) {
    const weeks = new Set(state.openVendorPacerWeeks);
    const idx = Number(week);
    weeks.has(idx) ? weeks.delete(idx) : weeks.add(idx);
    setState({ openVendorPacerWeeks: weeks });
  },

  openGoal() {
    openGoalModal(state.year, state.month);
  },

  openSale() {
    openSaleModal();
  },

  openImportSales() {
    openImportSalesModal();
  },

  exportPdf() {
    exportCommissionPdf();
  },

  async addSale() {
    const date = parseDateBr(val('inpDate'));
    const vendorId = isAdmin() ? val('inpVendor') : myVendorId();
    const amount = num('inpAmount');
    const qtd = num('inpPecas') ?? 0;

    if (!date || !vendorId || !amount || amount <= 0) {
      showToast('Preencha a data e um valor válido');
      return;
    }
    if (!date.startsWith(periodKey())) {
      showToast(`Essa data não pertence a ${MONTH_NAMES[state.month]}/${state.year}`);
      return;
    }

    await addSale(periodKey(), { date, vendorId, amount, pecas: qtd });
    $('inpAmount').value = '';
    $('inpPecas').value = '';
    $('inpAmount').focus();
    showToast(isAdmin()
      ? `Venda de ${money(amount)} lançada para ${vendorName(vendorId)}`
      : `Venda de ${money(amount)} lançada 🎉`);
  },

  deleteSale({ saleId }) {
    confirmModal({
      title: 'Remover lançamento',
      message: 'Esse lançamento será apagado do mês. Quer continuar?',
      confirmLabel: 'Remover',
      onConfirm: async () => {
        await deleteSale(periodKey(), saleId);
        showToast('Lançamento removido');
      }
    });
  }
});

onChange({
  async saveCampanha(_data, el) {
    await patchGoal(periodKey(), { campanhaRealizado: readNumber(el) || 0 });
    showToast('Campanha atualizada');
  }
});

onInput({});
