import { state } from '../state/store.js';
import { MONTHS, RATES, TIER_ORDER, TIER_LABEL } from '../config/constants.js';
import { fmt, money, moneyRound, pecas, fmtDatePt } from '../utils/format.js';
import { showToast } from '../ui/toast.js';
import { saveEntries, saveExtraEntries, saveConfig, genId } from '../state/store.js';
import { isGestor, isVendor } from './auth.js';
import {
  activeVendorIndexes, vendorTotal, vendorPecasTotal, vendorWeekTotal,
  extraTotal, extraPecasTotal, extraMonthSum, extraMonthPecasSum,
  weeklyTargetRS, weeklyTargetPecas, campaignActual, currentTier, nextTierInfo,
  topTierTarget, tierBonusAmount, getWeeksForMonth, isMonthUnlocked, getFirstBusinessDay
} from '../domain/vendas.js';

export function toggleStoreCard(){
  state.storeCardCollapsed = !state.storeCardCollapsed;
  renderStoreCard();
}

export function toggleVendor(idx){
  state.openVendorIdx = (state.openVendorIdx === idx) ? null : idx;
  state.openVendorPacerWeeks = new Set();
  renderVendorsAccordion();
}
export function selectTierForVendor(idx, tier){
  state.selectedTier[idx] = (state.selectedTier[idx] === tier) ? null : tier;
  renderVendorsAccordion();
}
export function toggleExtraVendor(idx){
  state.openExtraIdx = (state.openExtraIdx === idx) ? null : idx;
  renderVendorsAccordion();
}
export function closeAllVendors(){
  state.openVendorIdx = null;
  state.openExtraIdx = null;
  state.openVendorPacerWeeks = new Set();
  renderVendorsAccordion();
}
export function togglePacerWeek(w){
  if (state.openPacerWeeks.has(w)) state.openPacerWeeks.delete(w); else state.openPacerWeeks.add(w);
  renderWeeklyPacerCard();
}
export function toggleVendorPacerWeek(w){
  if (state.openVendorPacerWeeks.has(w)) state.openVendorPacerWeeks.delete(w); else state.openVendorPacerWeeks.add(w);
  renderVendorsAccordion();
}

export function renderMonthNav(){
  const nav = document.getElementById('monthNav');
  nav.innerHTML = '';
  MONTHS.forEach(m=>{
    const unlocked = isMonthUnlocked(m);
    const b = document.createElement('button');
    b.innerHTML = unlocked ? m : `🔒 ${m}`;
    if (m===state.currentMonth) b.classList.add('active');
    if (!unlocked){
      b.classList.add('locked');
      b.onclick = ()=>{ showToast(`Esse mês libera em ${fmtDatePt(getFirstBusinessDay(m))}`); };
    } else {
      b.onclick = ()=>{ state.currentMonth = m; state.openVendorIdx = null; state.openExtraIdx = null; state.openPacerWeeks = new Set(); state.openVendorPacerWeeks = new Set(); renderAll(); };
    }
    nav.appendChild(b);
  });
}

export function renderStoreCard(){
  const wrapEl = document.getElementById('storeCard');
  if (isVendor()){
    wrapEl.style.display = 'none';
    wrapEl.innerHTML = '';
    return;
  }
  wrapEl.style.display = '';
  const info = state.monthInfo[state.currentMonth];
  const idxs = activeVendorIndexes(state.currentMonth);
  const vendorSum = idxs.reduce((s,i)=> s + vendorTotal(state.currentMonth,i), 0);
  const pecasSum = idxs.reduce((s,i)=> s + vendorPecasTotal(state.currentMonth,i), 0) + extraMonthPecasSum(state.currentMonth);
  const camp = campaignActual(state.currentMonth);
  const extraSum = extraMonthSum(state.currentMonth);
  const totalLoja = vendorSum + camp + extraSum;
  const falta = Math.max(info.obj - totalLoja, 0);
  const pct = Math.min((totalLoja/info.obj)*100, 100);

  let totalComm = 0;
  idxs.forEach(i=>{
    const total = vendorTotal(state.currentMonth, i);
    const tier = currentTier(state.currentMonth, total);
    totalComm += tierBonusAmount(state.currentMonth, tier);
  });

  let html = `<div class="store-card-header">
    <h2>Loja — ${state.currentMonth}</h2>
    <div class="store-card-header-right">
      ${state.storeCardCollapsed ? `<span class="store-summary-inline">${money(totalLoja)} de ${money(info.obj)}</span>` : ''}
      <button class="minimize-btn" onclick="toggleStoreCard()" title="${state.storeCardCollapsed ? 'Expandir' : 'Recolher'}">${state.storeCardCollapsed ? '+' : '−'}</button>
    </div>
  </div>`;

  if (!state.storeCardCollapsed){
    html += `<div class="stat-row"><span class="stat-label">Objetivo da loja</span><span class="stat-value">${money(info.obj)}</span></div>`;
    html += `<div class="stat-row"><span class="stat-label">Realizado</span><span class="stat-value big">${money(totalLoja)}</span></div>`;
    html += `<div class="store-progress-outer"><div class="store-progress-inner" style="width:${pct}%"></div></div>`;
    html += `<div class="stat-row"><span class="stat-label">${falta>0 ? 'Falta para o objetivo' : 'Objetivo batido, excedente'}</span>
              <span class="stat-value ${falta>0?'missing':'done'}">${money(falta>0?falta:(totalLoja-info.obj))}</span></div>`;
    if (extraSum > 0){
      html += `<div class="stat-row"><span class="stat-label">— dessas, vendido por Gustavo/Angela</span><span class="stat-value">${money(extraSum)}</span></div>`;
    }
    html += `<div class="stat-row"><span class="stat-label">Peças vendidas (equipe)</span><span class="stat-value">${pecas(pecasSum)}</span></div>`;
    html += `<div class="stat-row"><span class="stat-label">Bonificação total a pagar (equipe)</span><span class="stat-value">${money(totalComm)}</span></div>`;
    html += `<div style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--line);">
      <button class="crm-add-btn" onclick="generateCommissionReportPDF()">📄 Gerar relatório de comissões (PDF)</button>
    </div>`;

    if (info.campanhaAlvo > 0){
      html += `<div class="campaign-box">
        <label>Vendas da campanha não comissionável (ex: Liquidação de Inverno — meta R$ ${fmt(info.campanhaAlvo)})</label>
        <input type="number" id="campanhaInput" step="0.01" min="0" value="${camp||''}" placeholder="0,00" oninput="updateCampaign(this.value)">
        <div class="campaign-note">Esse valor entra no faturamento da loja, mas não é somado a nenhuma vendedora nem entra na base de comissão.</div>
      </div>`;
    }
  }
  document.getElementById('storeCard').innerHTML = html;
}

export function renderVendorsAccordion(){
  let idxs = activeVendorIndexes(state.currentMonth);
  const info = state.monthInfo[state.currentMonth];
  const wrap = document.getElementById('vendorsAccordion');
  wrap.innerHTML = '';
  if (isVendor()){
    idxs = idxs.includes(state.currentUser.vendorIdx) ? [state.currentUser.vendorIdx] : [];
    if (!idxs.length){
      wrap.innerHTML = `<div class="empty-clients">Você não está na escala de vendas de ${state.currentMonth}.</div>`;
      return;
    }
  }
  idxs.forEach(i=>{
    const total = vendorTotal(state.currentMonth, i);
    const pecasTotal = vendorPecasTotal(state.currentMonth, i);
    const top = topTierTarget(state.currentMonth);
    const pct = Math.min((total/top)*100, 100);
    const tier = currentTier(state.currentMonth, total);
    const next = nextTierInfo(state.currentMonth, total);
    const rate = tier ? RATES[tier] : 0;
    const comm = tierBonusAmount(state.currentMonth, tier);
    const isOpen = isVendor() ? true : (state.openVendorIdx === i);

    let marksHtml = '';
    TIER_ORDER.forEach(t=>{
      const val = info.niveis[t];
      if (val !== null && val !== undefined){
        const left = Math.min((val/top)*100, 100);
        marksHtml += `<div class="tier-mark tier-mark-${t}" style="left:${left}%; cursor:pointer;" onclick="selectTierForVendor(${i}, '${t}')"></div>`;
      }
    });
    let labelsHtml = '<div class="tier-labels">';
    TIER_ORDER.forEach(t=>{
      const val = info.niveis[t];
      if (val !== null && val !== undefined){
        const left = Math.min((val/top)*100, 100);
        const isActive = state.selectedTier[i] === t;
        labelsHtml += `<span class="tier-label-item${isActive?' active':''}" style="left:${left}%" onclick="selectTierForVendor(${i}, '${t}')">${TIER_LABEL[t]}</span>`;
      }
    });
    labelsHtml += '</div>';

    const badge = tier ? `<span class="tier-badge b-${tier}">${TIER_LABEL[tier]}</span>` : `<span class="tier-badge b-none">Abaixo do Bronze</span>`;
    let statusHtml;
    const chosenTier = state.selectedTier[i];
    if (chosenTier && info.niveis[chosenTier] !== null && info.niveis[chosenTier] !== undefined){
      const targetVal = info.niveis[chosenTier];
      const falta = targetVal - total;
      statusHtml = falta > 0
        ? `${badge} faltam <b>${money(falta)}</b> para ${TIER_LABEL[chosenTier]} <span class="vaccordion-hint">(toque de novo pra voltar ao automático)</span>`
        : `${badge} já bateu ${TIER_LABEL[chosenTier]} — excedente de <b>${money(-falta)}</b> <span class="vaccordion-hint">(toque de novo pra voltar ao automático)</span>`;
    } else {
      statusHtml = next
        ? `${badge} faltam <b>${money(next.falta)}</b> para ${TIER_LABEL[next.tier]}`
        : `${badge} nível máximo do mês atingido 🎉`;
    }

    const vendorEntries = state.entries.filter(e=>e.month===state.currentMonth && e.vendorIdx===i)
                                  .sort((a,b)=> b.date.localeCompare(a.date));
    let entriesHtml = '<div class="mini-title">Vendas lançadas no mês</div>';
    if (vendorEntries.length === 0){
      entriesHtml += '<div class="empty-state">Nenhum lançamento ainda.</div>';
    } else {
      entriesHtml += '<table class="entries"><thead><tr><th>Data</th><th>Valor</th><th>Peças</th><th></th></tr></thead><tbody>';
      vendorEntries.forEach(e=>{
        const [y,m,d] = e.date.split('-');
        entriesHtml += `<tr><td>${d}/${m}/${y}</td><td>${money(Number(e.amount))}</td><td>${e.pecas ? pecas(Number(e.pecas)) : '—'}</td>
          <td><button class="del-btn" onclick="deleteEntry('${e.id}')">remover</button></td></tr>`;
      });
      entriesHtml += '</tbody></table>';
    }

    const item = document.createElement('div');
    item.className = 'vaccordion-item' + (isOpen ? ' open' : '');
    item.innerHTML = `
      <button class="vaccordion-header" onclick="toggleVendor(${i})">
        <span>${state.config.names[i]}</span>
        <span class="vaccordion-hint">${isOpen ? '' : 'toque para ver'} <span class="chevron">▶</span></span>
      </button>
      ${isOpen ? `<div class="vaccordion-body">
        <div class="vtotal">Vendido no mês: <b>${money(total)}</b> &nbsp;·&nbsp; ${pecas(pecasTotal)}</div>
        <div class="tier-track">
          <div class="tier-fill" style="width:${pct}%"></div>
          <div class="tier-marks">${marksHtml}</div>
        </div>
        ${labelsHtml}
        <div class="tier-status">${statusHtml}</div>
        <div class="commission-line"><span>Bonificação a receber (${tier?TIER_LABEL[tier]+' · faixa de '+(rate*100).toFixed(1)+'%':'nenhum nível ainda'})</span><b>${money(comm)}</b></div>
        <div class="pacer-note" style="margin-top:-4px;">Valor fixo do nível atingido — não aumenta se ela vender mais dentro da mesma faixa.</div>
        ${buildWeeklyPacerHtml(state.currentMonth, i)}
        ${entriesHtml}
      </div>` : ''}
    `;
    wrap.appendChild(item);
  });

  if (isGestor()){
    (state.config.extraNames||[]).forEach((name, idx)=>{
      const total = extraTotal(state.currentMonth, idx);
      const pecasTotal = extraPecasTotal(state.currentMonth, idx);
      const isOpen = state.openExtraIdx === idx;
      const list = state.extraEntries.filter(e=>e.month===state.currentMonth && e.extraIdx===idx)
                                .sort((a,b)=> b.date.localeCompare(a.date));
      let entriesHtml = '<div class="mini-title">Vendas lançadas no mês</div>';
      if (list.length === 0){
        entriesHtml += '<div class="empty-state">Nenhum lançamento ainda.</div>';
      } else {
        entriesHtml += '<table class="entries"><thead><tr><th>Data</th><th>Valor</th><th>Peças</th><th></th></tr></thead><tbody>';
        list.forEach(e=>{
          const [y,m,d] = e.date.split('-');
          entriesHtml += `<tr><td>${d}/${m}/${y}</td><td>${money(Number(e.amount))}</td><td>${e.pecas ? pecas(Number(e.pecas)) : '—'}</td>
            <td><button class="del-btn" onclick="deleteExtraEntry('${e.id}')">remover</button></td></tr>`;
        });
        entriesHtml += '</tbody></table>';
      }

      const item2 = document.createElement('div');
      item2.className = 'vaccordion-item' + (isOpen ? ' open' : '');
      item2.innerHTML = `
        <button class="vaccordion-header" onclick="toggleExtraVendor(${idx})">
          <span>${name}</span>
          <span class="vaccordion-hint">${isOpen ? '' : 'toque para ver'} <span class="chevron">▶</span></span>
        </button>
        ${isOpen ? `<div class="vaccordion-body">
          <div class="vtotal">Vendido no mês: <b>${money(total)}</b> &nbsp;·&nbsp; ${pecas(pecasTotal)}</div>
          <div class="pacer-note" style="margin-top:8px;">Sem meta, nível ou comissão — só soma no total da loja.</div>
          <div class="entry-form" style="margin-top:10px;">
            <div class="field"><label>Data</label><input type="date" id="extraDate${idx}"></div>
            <div class="field grow"><label>Valor (R$)</label><input type="number" id="extraAmount${idx}" step="0.01" min="0" placeholder="0,00"></div>
            <div class="field"><label>Peças</label><input type="number" id="extraPecas${idx}" step="1" min="0" placeholder="0" style="min-width:80px;"></div>
            <button class="add-btn" onclick="addExtraEntry(${idx})">Adicionar</button>
          </div>
          ${entriesHtml}
        </div>` : ''}
      `;
      wrap.appendChild(item2);
      if (isOpen){
        const dateInput = document.getElementById('extraDate'+idx);
        if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
      }
    });
  }
}

export function buildWeeklyPacerHtml(month, vendorIdx){
  const weeks = getWeeksForMonth(month);
  let html = '<div class="mini-title">Balizador semanal · meta menor a cada semana</div>';
  html += '<div class="week-accordion">';
  weeks.forEach(w=>{
    const sold = vendorWeekTotal(month, vendorIdx, w);
    const bronzeTarget = weeklyTargetRS(month, 'bronze', w);
    const hit = bronzeTarget !== null && sold >= bronzeTarget;
    const isOpen = state.openVendorPacerWeeks.has(w.idx);
    html += `<div class="week-item${isOpen?' open':''}">
      <button class="week-header" onclick="toggleVendorPacerWeek(${w.idx})">
        <span>${w.label}<span class="week-range">${w.periodo}</span></span>
        <span class="week-header-right">
          <span class="week-sold">${money(sold)}</span>
          ${hit ? '<span class="week-hit-dot" title="Bateu o ritmo do Bronze nessa semana"></span>' : ''}
          <span class="chevron">▶</span>
        </span>
      </button>`;
    if (isOpen){
      html += '<div class="week-body"><table class="pacer-mini"><tbody>';
      TIER_ORDER.forEach(t=>{
        const rs = weeklyTargetRS(month, t, w);
        if (rs === null){
          html += `<tr><td><span class="tier-badge b-none">${TIER_LABEL[t]}</span></td><td class="pc-na">—</td></tr>`;
          return;
        }
        const pc = weeklyTargetPecas(month, t, w);
        const wHit = sold >= rs;
        html += `<tr class="${wHit?'pacer-hit':''}"><td><span class="tier-badge b-${t}">${TIER_LABEL[t]}</span></td><td>${moneyRound(rs)} · ${pecas(pc)}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

export function renderEntryForm(){
  const sel = document.getElementById('inpVendor');
  sel.innerHTML = '';
  let entryIdxs = activeVendorIndexes(state.currentMonth);
  if (isVendor()) entryIdxs = entryIdxs.filter(i => i === state.currentUser.vendorIdx);
  entryIdxs.forEach(i=>{
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = state.config.names[i];
    sel.appendChild(opt);
  });
  sel.disabled = isVendor();
  const dateInput = document.getElementById('inpDate');
  if (!dateInput.value){
    const today = new Date();
    dateInput.value = today.toISOString().slice(0,10);
  }
}

export function generateCommissionReportPDF(){
  if (typeof window.jspdf === 'undefined'){
    showToast('Não consegui carregar o gerador de PDF. Verifique sua internet e tente de novo.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const info = state.monthInfo[state.currentMonth];
  const idxs = activeVendorIndexes(state.currentMonth);
  const today = new Date();
  const geradoEm = String(today.getDate()).padStart(2,'0')+'/'+String(today.getMonth()+1).padStart(2,'0')+'/'+today.getFullYear();

  doc.setFontSize(16);
  doc.text('ANGEL MODAS — Relatório de Comissões', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Mês de referência: ${state.currentMonth}/${info.obj ? '2026' : ''}   ·   Gerado em ${geradoEm}`, 14, 25);
  doc.setTextColor(0);

  doc.setFontSize(12);
  doc.text('Metas do mês (por vendedora)', 14, 36);
  const metasRows = TIER_ORDER.map(t=>{
    const val = info.niveis[t];
    return [
      TIER_LABEL[t],
      val!==null && val!==undefined ? money(val) : 'Não disponível',
      (RATES[t]*100).toFixed(1)+'%',
      val!==null && val!==undefined ? money(tierBonusAmount(state.currentMonth, t)) : 'Não disponível'
    ];
  });
  doc.autoTable({
    startY: 40,
    head: [['Nível','Meta por vendedora (R$)','Comissão','Bonificação a pagar (R$)']],
    body: metasRows,
    theme: 'grid',
    headStyles: { fillColor: [31,58,95] },
    styles: { fontSize: 10 }
  });

  let y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(12);
  doc.text('Resultado por vendedora', 14, y);

  const vendorRows = [];
  let totalVendido = 0, totalPecas = 0, totalComissao = 0;
  idxs.forEach(i=>{
    const total = vendorTotal(state.currentMonth, i);
    const pecasQtd = vendorPecasTotal(state.currentMonth, i);
    const tier = currentTier(state.currentMonth, total);
    const rate = tier ? RATES[tier] : 0;
    const comissao = tierBonusAmount(state.currentMonth, tier);
    totalVendido += total; totalPecas += pecasQtd; totalComissao += comissao;
    vendorRows.push([
      state.config.names[i],
      money(total),
      String(pecasQtd),
      tier ? TIER_LABEL[tier] : 'Abaixo do Bronze',
      tier ? (rate*100).toFixed(1)+'%' : '—',
      money(comissao)
    ]);
  });
  vendorRows.push(['TOTAL', money(totalVendido), String(totalPecas), '', '', money(totalComissao)]);

  doc.autoTable({
    startY: y+4,
    head: [['Vendedora','Vendido (R$)','Peças','Nível atingido','% da faixa','Bonificação a pagar (R$)']],
    body: vendorRows,
    theme: 'grid',
    headStyles: { fillColor: [31,58,95] },
    styles: { fontSize: 10 },
    didParseCell: function(data){
      if (data.row.index === vendorRows.length-1){
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [239,236,229];
      }
    }
  });

  y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Bonificação por desempenho: valor FIXO da faixa (nível) que a vendedora atingiu — meta daquele nível × sua taxa — não é proporcional ao valor exato vendido.', 14, y);

  const fileMonth = state.currentMonth.toLowerCase();
  doc.save(`comissoes_${fileMonth}_2026.pdf`);
  showToast('Relatório gerado — confira sua pasta de downloads');
}

export function renderTierGoalsCard(){
  const info = state.monthInfo[state.currentMonth];
  const wrap = document.getElementById('tierGoalsCard');
  wrap.style.display = '';
  let html = `<h2>${isVendor() ? 'Seus objetivos' : 'Metas do mês — por vendedora'}</h2>`;
  html += '<div class="tier-goals-grid">';
  TIER_ORDER.forEach(t=>{
    const val = info.niveis[t];
    const colorVar = `var(--${t})`;
    const bonus = (val!==null && val!==undefined) ? val * RATES[t] : null;
    html += `<div class="tier-goal-block" style="border-top-color:${colorVar}">
      <div class="tg-name">${TIER_LABEL[t]}</div>
      <div class="tg-value ${val===null||val===undefined?'unavailable':''}">${val!==null && val!==undefined ? money(val) : 'Não disponível'}</div>
      <div class="tg-rate">Comissão ${(RATES[t]*100).toFixed(1)}%</div>
      ${bonus!==null ? `<div class="tg-bonus"><span class="tg-bonus-label">Bonificação ao atingir</span>${money(bonus)}</div>` : ''}
    </div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;
}

export function renderWeeklyPacerCard(){
  const wd = state.weekData[state.currentMonth];
  const wrap = document.getElementById('weeklyPacerCard');
  wrap.style.display = '';
  const nWeeks = wd.semanas.length;
  let html = `<h2>Balizador semanal — por vendedora</h2>`;
  html += `<p class="pacer-note">Semanas de calendário (domingo a sábado) — a 1ª e a última semana pesam 1, as semanas do meio pesam 2. Toque numa semana pra ver a meta de cada nível.</p>`;
  html += '<div class="week-accordion">';

  for (let w=0; w<nWeeks; w++){
    const isOpen = state.openPacerWeeks.has(w);
    html += `<div class="week-item${isOpen?' open':''}">
      <button class="week-header" onclick="togglePacerWeek(${w})">
        <span>Semana ${w+1}<span class="week-range">${wd.semanas[w]}</span></span>
        <span class="chevron">▶</span>
      </button>`;
    if (isOpen){
      html += '<div class="week-body"><div class="week-tier-grid">';
      TIER_ORDER.forEach(t=>{
        const n = wd.niveis[t];
        if (!n){
          html += `<div class="week-tier-block wtb-na"><div class="wtb-name">${TIER_LABEL[t]}</div><div class="wtb-value">Não disponível</div></div>`;
          return;
        }
        const wk = n.semanal[w];
        html += `<div class="week-tier-block" style="border-top-color:var(--${t})">
          <div class="wtb-name">${TIER_LABEL[t]}</div>
          <div class="wtb-value">${moneyRound(wk.rs)}</div>
          <div class="wtb-pecas">${wk.pecas} peças</div>
        </div>`;
      });
      html += '</div></div>';
    }
    html += '</div>';
  }
  html += '</div>';

  html += '<div class="week-monthly-total">';
  TIER_ORDER.forEach(t=>{
    const n = wd.niveis[t];
    html += `<span>${TIER_LABEL[t]} total: <b>${n ? moneyRound(n.totalRs) : '—'}</b></span>`;
  });
  html += '</div>';

  wrap.innerHTML = html;
}

export async function addExtraEntry(idx){
  const date = document.getElementById('extraDate'+idx).value;
  const amount = Number(document.getElementById('extraAmount'+idx).value);
  const pecasRaw = document.getElementById('extraPecas'+idx).value;
  const pecasVal = pecasRaw === '' ? 0 : Number(pecasRaw);
  if (!date || isNaN(amount) || amount<=0){ showToast('Preencha a data e um valor válido'); return; }
  state.extraEntries.push({ id: genId(), month: state.currentMonth, date, extraIdx: idx, amount, pecas: pecasVal });
  await saveExtraEntries();
  renderVendorsAccordion();
  showToast('Venda lançada');
}
export async function deleteExtraEntry(id){
  state.extraEntries = state.extraEntries.filter(e=>e.id!==id);
  await saveExtraEntries();
  renderVendorsAccordion();
}

export function renderAll(){
  renderMonthNav();
  renderStoreCard();
  renderTierGoalsCard();
  renderWeeklyPacerCard();
  renderVendorsAccordion();
  document.getElementById('entryCard').style.display = isGestor() ? '' : 'none';
  if (isGestor()) renderEntryForm();
}

export async function addEntry(){
  const date = document.getElementById('inpDate').value;
  const vendorIdx = Number(document.getElementById('inpVendor').value);
  const amount = Number(document.getElementById('inpAmount').value);
  const pecasRaw = document.getElementById('inpPecas').value;
  const pecas = pecasRaw === '' ? 0 : Number(pecasRaw);
  if (!date || isNaN(amount) || amount <= 0){
    showToast('Preencha a data e um valor válido');
    return;
  }
  state.entries.push({ id: genId(), month: state.currentMonth, date, vendorIdx, amount, pecas });
  await saveEntries();
  document.getElementById('inpAmount').value = '';
  document.getElementById('inpPecas').value = '';
  renderAll();
  showToast('Venda lançada');
}

export async function deleteEntry(id){
  state.entries = state.entries.filter(e => e.id !== id);
  await saveEntries();
  renderAll();
  showToast('Lançamento removido');
}

export async function updateCampaign(val){
  state.config['campaignActual_' + state.currentMonth] = Number(val)||0;
  await saveConfig();
  renderStoreCard();
}
