import { state } from '../state/store.js';
import { money } from '../utils/format.js';
import { showToast } from '../ui/toast.js';
import { saveCrmData, genId } from '../state/store.js';
import { isGestor, isVendor, requireGestor } from './auth.js';
import { allVendorNames } from '../domain/vendas.js';
import { renderCompras } from './compras-view.js';
import {
  CLIENT_STATUS_TIERS, clientTotal, clientLastPurchase, clientStatus,
  computeMonetaryTerciles, clientRFMSegment, clientPeriodComparison, computeABC,
  dailyTaskList, vendorPortfolioHealth, clientsForVendor, pendingTransfersCount,
  checkTransferNeeded, clientContacts
} from '../domain/crm.js';

export function refreshCrmViews(){
  updateTransferBadge();
  if (state.currentView === 'carteira') renderCarteira();
  if (state.currentView === 'compras') renderCompras();
}
export function updateTransferBadge(){
  const badge = document.getElementById('transferBadge');
  const pending = pendingTransfersCount();
  if (pending>0){ badge.style.display='inline-flex'; badge.textContent = pending; }
  else { badge.style.display='none'; }
}

export async function approveTransfer(id){
  const t = state.crmTransfers.find(x=>x.id===id);
  if (!t) return;
  const client = state.crmClients.find(c=>c.id===t.clientId);
  if (client) client.ownerVendorIdx = t.toVendorIdx;
  t.status = 'approved';
  await saveCrmData();
  refreshCrmViews();
  showToast('Carteira transferida');
}
export async function rejectTransfer(id){
  const t = state.crmTransfers.find(x=>x.id===id);
  if (!t) return;
  t.status = 'rejected';
  await saveCrmData();
  refreshCrmViews();
  showToast('Transferência recusada');
}

export function toggleCarteira(idx){
  if (state.openCarteiras.has(idx)) state.openCarteiras.delete(idx); else state.openCarteiras.add(idx);
  renderCarteira();
}
export function toggleClient(id){
  if (state.openClients.has(id)) state.openClients.delete(id); else state.openClients.add(id);
  renderCarteira();
}
export function updateCrmSearch(val){
  state.crmSearchTerm = val.toLowerCase();
  renderCarteira();
}

/* --- client modal --- */
export function openClientModal(editId){
  document.getElementById('clientModalTitle').textContent = editId ? 'Editar cliente' : 'Novo cliente';
  document.getElementById('clientEditId').value = editId || '';
  const sel = document.getElementById('clientOwner');
  sel.innerHTML = '';
  allVendorNames().forEach((name,i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = name;
    sel.appendChild(opt);
  });
  if (editId){
    const c = state.crmClients.find(x=>x.id===editId);
    if (c){
      document.getElementById('clientName').value = c.name || '';
      document.getElementById('clientPhone').value = c.phone || '';
      document.getElementById('clientBirthday').value = c.birthday || '';
      document.getElementById('clientNotes').value = c.notes || '';
      sel.value = c.ownerVendorIdx;
    }
  } else {
    document.getElementById('clientName').value = '';
    document.getElementById('clientPhone').value = '';
    document.getElementById('clientBirthday').value = '';
    document.getElementById('clientNotes').value = '';
    if (isVendor()) sel.value = state.currentUser.vendorIdx;
  }
  sel.disabled = isVendor();
  document.getElementById('clientModal').classList.add('open');
}
export function closeClientModal(){
  document.getElementById('clientModal').classList.remove('open');
}
export async function saveClient(){
  const editId = document.getElementById('clientEditId').value;
  const name = document.getElementById('clientName').value.trim();
  if (!name){ showToast('Digite o nome do cliente'); return; }
  const phone = document.getElementById('clientPhone').value.trim();
  const birthday = document.getElementById('clientBirthday').value.trim();
  const notes = document.getElementById('clientNotes').value.trim();
  const ownerVendorIdx = Number(document.getElementById('clientOwner').value);
  if (editId){
    const c = state.crmClients.find(x=>x.id===editId);
    if (c){ c.name=name; c.phone=phone; c.birthday=birthday; c.notes=notes; c.ownerVendorIdx=ownerVendorIdx; }
  } else {
    state.crmClients.push({ id: genId(), name, phone, birthday, notes, ownerVendorIdx, createdAt: new Date().toISOString() });
  }
  await saveCrmData();
  closeClientModal();
  refreshCrmViews();
  showToast('Cliente salvo');
}
export function deleteClient(id){
  requireGestor(async ()=>{
    state.crmClients = state.crmClients.filter(c=>c.id!==id);
    state.crmPurchases = state.crmPurchases.filter(p=>p.clientId!==id);
    state.crmTransfers = state.crmTransfers.filter(t=>t.clientId!==id);
    await saveCrmData();
    refreshCrmViews();
    showToast('Cliente removido');
  });
}

/* --- purchase modal --- */
export function populatePurchaseClientSelect(selectedId){
  const sel = document.getElementById('purchaseClient');
  sel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = 'Selecione um cliente...'; placeholder.disabled = true;
  sel.appendChild(placeholder);
  [...state.crmClients].sort((a,b)=> a.name.localeCompare(b.name)).forEach(c=>{
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    sel.appendChild(opt);
  });
  sel.value = selectedId || '';
  if (!selectedId) placeholder.selected = true;
}
export function openPurchaseModal(clientId){
  populatePurchaseClientSelect(clientId || null);
  document.getElementById('purchaseDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('purchaseValue').value = '';
  document.getElementById('purchaseNotes').value = '';
  const sel = document.getElementById('purchaseVendor');
  sel.innerHTML = '';
  allVendorNames().forEach((name,i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = name;
    sel.appendChild(opt);
  });
  document.getElementById('purchaseModal').classList.add('open');
}
export function closePurchaseModal(){
  document.getElementById('purchaseModal').classList.remove('open');
}
export async function savePurchase(){
  const clientId = document.getElementById('purchaseClient').value;
  const date = document.getElementById('purchaseDate').value;
  const vendorIdx = Number(document.getElementById('purchaseVendor').value);
  const value = Number(document.getElementById('purchaseValue').value);
  const notes = document.getElementById('purchaseNotes').value.trim();
  if (!clientId){ showToast('Selecione um cliente'); return; }
  if (!date || isNaN(value) || value<=0){ showToast('Preencha a data e um valor válido'); return; }
  state.crmPurchases.push({ id: genId(), clientId, date, vendorIdx, value, notes });
  checkTransferNeeded(clientId);
  await saveCrmData();
  closePurchaseModal();
  refreshCrmViews();
  showToast('Compra registrada');
}
export function deletePurchase(id){
  state.crmPurchases = state.crmPurchases.filter(p=>p.id!==id);
  saveCrmData();
  refreshCrmViews();
}

/* --- contact history --- */
export function openContactModal(clientId){
  document.getElementById('contactClientId').value = clientId;
  document.getElementById('contactDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('contactChannel').value = 'WhatsApp';
  document.getElementById('contactNote').value = '';
  document.getElementById('contactModal').classList.add('open');
}
export function closeContactModal(){
  document.getElementById('contactModal').classList.remove('open');
}
export async function saveContact(){
  const clientId = document.getElementById('contactClientId').value;
  const date = document.getElementById('contactDate').value;
  const channel = document.getElementById('contactChannel').value;
  const note = document.getElementById('contactNote').value.trim();
  if (!date){ showToast('Preencha a data'); return; }
  const vendorIdx = isVendor() ? state.currentUser.vendorIdx : (state.crmClients.find(c=>c.id===clientId)||{}).ownerVendorIdx;
  state.crmContacts.push({ id: genId(), clientId, date, channel, note, vendorIdx });
  await saveCrmData();
  closeContactModal();
  refreshCrmViews();
  showToast('Contato registrado');
}
export function deleteContact(id){
  state.crmContacts = state.crmContacts.filter(c=>c.id!==id);
  saveCrmData();
  refreshCrmViews();
}

/* --- rendering --- */
export function renderCarteira(){
  const wrap = document.getElementById('carteiraView');
  updateTransferBadge();
  const rfmTerciles = computeMonetaryTerciles(state.crmClients.map(c=>c.id));

  let html = '';

  html += `<div class="crm-toolbar">
    <input type="text" class="crm-search" placeholder="Buscar cliente por nome ou telefone..." value="${state.crmSearchTerm}" oninput="updateCrmSearch(this.value)">
    <button class="crm-add-btn" onclick="openClientModal(null)">+ Novo cliente</button>
    ${isGestor() ? `<button class="crm-add-btn" onclick="openCarteiraImportModal()">📄 Importar relatório (PDF)</button>` : ''}
  </div>`;

  const totalClientes = state.crmClients.length;
  const totalGasto = state.crmPurchases.reduce((s,p)=> s+Number(p.value||0), 0);
  html += `<div class="crm-stats-row">
    <div class="crm-stat-chip"><div class="csc-label">Clientes cadastrados</div><div class="csc-value">${totalClientes}</div></div>
    <div class="crm-stat-chip"><div class="csc-label">Total em compras (todas as carteiras)</div><div class="csc-value">${money(totalGasto)}</div></div>
  </div>`;

  const visibleVendorIdxs = isGestor() ? allVendorNames().map((n,i)=>i) : [state.currentUser.vendorIdx];

  const visibleClients = state.crmClients.filter(c => visibleVendorIdxs.includes(c.ownerVendorIdx));

  const tasks = dailyTaskList(visibleClients).slice(0, 12);
  if (tasks.length){
    html += `<div class="task-card"><h2>📋 Tarefas de hoje</h2>
      <p style="font-size:12px; color:#3E5A85; margin:0 0 6px 0;">Priorizado pelo status mais urgente e maior valor histórico. Some da lista assim que você registrar um contato hoje.</p>`;
    tasks.forEach(({client, status})=>{
      const vendorName = allVendorNames()[client.ownerVendorIdx];
      html += `<div class="task-row">
        <div>
          <span class="tr-name">${client.name}</span> <span class="status-badge status-${status.key}">${status.badge}</span>
          <div class="tr-meta">${status.days} dias sem comprar · ${money(clientTotal(client.id))} em histórico${isGestor() ? ' · ' + vendorName : ''}${client.phone ? ' · ' + client.phone : ''}</div>
        </div>
        <button class="task-btn" onclick="openContactModal('${client.id}')">Registrar contato</button>
      </div>`;
    });
    html += `</div>`;
  }

  const statusCounts = {};
  CLIENT_STATUS_TIERS.forEach(t=> statusCounts[t.key] = 0);
  statusCounts['sem-compra'] = 0;
  const attentionList = [];
  visibleClients.forEach(c=>{
    const st = clientStatus(c.id);
    statusCounts[st.key] = (statusCounts[st.key]||0) + 1;
    if (['atencao','risco','inativa'].includes(st.key)){
      attentionList.push({ client: c, status: st });
    }
  });
  attentionList.sort((a,b)=> b.status.days - a.status.days);

  html += '<div class="attention-summary">';
  CLIENT_STATUS_TIERS.forEach(t=>{
    html += `<div class="attention-chip status-${t.key}">${statusCounts[t.key]} ${t.badge}</div>`;
  });
  if (statusCounts['sem-compra']) html += `<div class="attention-chip status-sem-compra">${statusCounts['sem-compra']} sem compras</div>`;
  html += '</div>';

  if (attentionList.length){
    html += `<div class="attention-card"><h2>⚠️ Clientes que precisam de atenção</h2>
      <p style="font-size:12px; color:#8A5A4A; margin:0 0 6px 0;">Clientes com 60 dias ou mais sem comprar — veja a ação recomendada pra cada uma.</p>`;
    attentionList.forEach(({client, status})=>{
      const vendorName = allVendorNames()[client.ownerVendorIdx];
      html += `<div class="attention-row">
        <div>
          <span class="ar-name">${client.name}</span> <span class="status-badge status-${status.key}">${status.badge}</span>
          <div class="ar-meta">${status.days} dias sem comprar${isGestor() ? ' · carteira de ' + vendorName : ''}${client.phone ? ' · ' + client.phone : ''}</div>
        </div>
        <div class="ar-action">${status.action}</div>
      </div>`;
    });
    html += `</div>`;
  }

  const reactivatedList = visibleClients.filter(c => c.lastReactivation)
    .sort((a,b)=> b.lastReactivation.date.localeCompare(a.lastReactivation.date));
  if (reactivatedList.length){
    html += `<div class="attention-card" style="background:#EAF7EF; border-color:#BFE3CC;">
      <h2 style="color:#2C6B45;">🎉 Clientes reativadas</h2>`;
    reactivatedList.forEach(client=>{
      const r = client.lastReactivation;
      html += `<div class="attention-row" style="border-bottom-color:#D3EEDD;">
        <div>
          <span class="ar-name">${client.name}</span>
          <div class="ar-meta" style="color:#2C6B45;">Reativada por <b>${state.config.names[r.vendorIdx]}</b> em <b>${r.date.split('-').reverse().join('/')}</b></div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  const pendingList = state.crmTransfers.filter(t=> t.status==='pending' && visibleVendorIdxs.includes(t.toVendorIdx));
  if (pendingList.length){
    html += `<div class="transfers-card"><h2 style="margin:0 0 10px 0; font-size:14px; font-family:var(--font-display);">⚠️ Solicitações de transferência de carteira</h2>`;
    pendingList.forEach(t=>{
      const client = state.crmClients.find(c=>c.id===t.clientId);
      if (!client) return;
      html += `<div class="transfer-row">
        <div class="transfer-text"><b>${client.name}</b>: as últimas 3 compras foram com <b>${state.config.names[t.toVendorIdx]}</b>, mas a carteira atual é de <b>${state.config.names[t.fromVendorIdx]}</b>.</div>
        ${isGestor() ? `<div class="transfer-actions">
          <button class="transfer-approve" onclick="approveTransfer('${t.id}')">Aprovar</button>
          <button class="transfer-reject" onclick="rejectTransfer('${t.id}')">Recusar</button>
        </div>` : `<div class="transfer-text" style="font-style:italic;">Só o gestor pode decidir</div>`}
      </div>`;
    });
    html += `</div>`;
  }

  const abcList = computeABC(visibleClients);
  const abcA = abcList.filter(x=>x.classe==='A');
  const abcB = abcList.filter(x=>x.classe==='B');
  const abcC = abcList.filter(x=>x.classe==='C');
  if (abcList.length){
    html += `<div class="card" style="margin-bottom:16px;">
      <h2 style="font-size:14px; margin:0 0 8px 0;">📊 Curva ABC de clientes</h2>
      <div class="abc-summary">
        <div class="attention-chip" style="background:#2C6B45;">${abcA.length} classe A</div>
        <div class="attention-chip" style="background:#D9A62E;">${abcB.length} classe B</div>
        <div class="attention-chip" style="background:#9A9AA1;">${abcC.length} classe C</div>
      </div>
      <p class="pacer-note" style="margin:0 0 8px 0;">Classe A = clientes que juntas somam até 80% do faturamento das carteiras visíveis. São quem merece o atendimento mais próximo.</p>
      <details class="import-details"><summary>Ver ranking completo</summary>`;
    abcList.forEach(x=>{
      html += `<div class="abc-row"><span><span class="abc-badge abc-${x.classe}">${x.classe}</span>${x.client.name}</span><span>${money(x.total)} (${Math.round(x.pctOfTotal*100)}%)</span></div>`;
    });
    html += `</details></div>`;
  }

  if (isGestor()){
    html += `<div class="card" style="margin-bottom:16px;">
      <h2 style="font-size:14px; margin:0 0 10px 0;">💚 Saúde da carteira por vendedora</h2>`;
    allVendorNames().forEach((name, idx)=>{
      const h = vendorPortfolioHealth(idx);
      html += `<div class="health-row">
        <span style="font-weight:700;">${name}</span>
        <span>${h.total} clientes · <span class="health-bar-outer"><span class="health-bar-inner" style="width:${h.ativaPct}%"></span></span> ${h.ativaPct}% ativas · ticket médio ${money(h.avgTicket)}</span>
      </div>`;
    });
    html += `</div>`;
  }

  html += '<div class="vaccordion">';
  visibleVendorIdxs.forEach((idx)=>{
    const name = allVendorNames()[idx];
    let list = clientsForVendor(idx);
    if (state.crmSearchTerm){
      list = list.filter(c=> (c.name||'').toLowerCase().includes(state.crmSearchTerm) || (c.phone||'').toLowerCase().includes(state.crmSearchTerm));
    }
    const carteiraTotal = list.reduce((s,c)=> s+clientTotal(c.id), 0);
    const health = vendorPortfolioHealth(idx);
    const isOpen = state.openCarteiras.has(idx);
    html += `<div class="vaccordion-item${isOpen?' open':''}">
      <button class="vaccordion-header" onclick="toggleCarteira(${idx})">
        <span>Carteira de ${name} <span class="vaccordion-hint">(${list.length} cliente${list.length!==1?'s':''} · ${health.ativaPct}% ativas)</span></span>
        <span class="vaccordion-hint">${money(carteiraTotal)} <span class="chevron">▶</span></span>
      </button>`;
    if (isOpen){
      html += `<div class="vaccordion-body" style="padding:0;">`;
      if (!list.length){
        html += `<div class="empty-clients">Nenhum cliente ${state.crmSearchTerm?'encontrado':'nessa carteira ainda'}.</div>`;
      } else {
        list.forEach(c=>{
          html += renderClientRow(c, rfmTerciles);
        });
      }
      html += `</div>`;
    }
    html += `</div>`;
  });
  html += '</div>';

  wrap.innerHTML = html;
}

export function renderClientRow(c, terciles){
  const total = clientTotal(c.id);
  const last = clientLastPurchase(c.id);
  const status = clientStatus(c.id);
  const isOpen = state.openClients.has(c.id);
  const reactivated = c.lastReactivation;
  const segment = clientRFMSegment(c.id, terciles || computeMonetaryTerciles(state.crmClients.map(x=>x.id)));
  let html = `<div style="border-top:1px solid var(--line);">
    <button class="client-row-header" onclick="toggleClient('${c.id}')">
      <div class="client-main">
        <span class="client-name">${c.name}</span><span class="status-badge status-${status.key}">${status.badge}</span>
        <span class="status-badge" style="background:${segment.color};">${segment.label}</span>${reactivated ? ' <span title="Reativada">🎉</span>' : ''}
        <span class="client-sub">${c.phone || 'sem telefone'}${last ? ' · última compra ' + last.date.split('-').reverse().join('/') + ' (' + status.days + ' dias)' : ''}</span>
      </div>
      <div class="client-right"><span class="client-total">${money(total)}</span><span class="chevron">▶</span></div>
    </button>`;
  if (isOpen){
    html += `<div class="client-body">`;
    if (reactivated){
      html += `<div class="client-detail-row" style="background:#EAF7EF; padding:8px 10px; border-radius:8px; margin-bottom:10px;">
        <span>🎉 Reativada por <b>${state.config.names[reactivated.vendorIdx]}</b> em <b>${reactivated.date.split('-').reverse().join('/')}</b></span>
      </div>`;
    }
    html += `<div class="client-detail-row"><span>Status</span><b>${status.label}</b></div>`;
    html += `<div class="client-detail-row"><span>Ação recomendada</span><b>${status.action}</b></div>`;
    html += `<div class="client-detail-row"><span>Segmento</span><b>${segment.label}</b></div>`;
    html += `<div class="client-detail-row"><span>Frequência</span><b>${segment.freq} compra${segment.freq!==1?'s':''}</b></div>`;

    const cmp = clientPeriodComparison(c.id, 90);
    const cmpArrow = cmp.trend==='up' ? '▲' : (cmp.trend==='down' ? '▼' : '—');
    const cmpColor = cmp.trend==='up' ? 'var(--ok)' : (cmp.trend==='down' ? 'var(--danger)' : 'var(--muted)');
    let cmpText = `${money(cmp.current)} (últimos ${cmp.windowDays}d) vs ${money(cmp.previous)} (${cmp.windowDays}d anteriores)`;
    if (cmp.pct !== null) cmpText += ` <span style="color:${cmpColor}; font-weight:700;">${cmpArrow} ${Math.abs(cmp.pct)}%</span>`;
    else if (cmp.trend==='new') cmpText += ` <span style="color:${cmpColor}; font-weight:700;">novo neste período</span>`;
    html += `<div class="client-detail-row"><span>Comparação de período</span><b>${cmpText}</b></div>`;

    html += `<div class="client-detail-row"><span>Aniversário</span><b>${c.birthday || '—'}</b></div>`;
    html += `<div class="client-detail-row"><span>Preferências</span><b>${c.notes || '—'}</b></div>`;
    html += `<div class="client-actions">
      <button onclick="openPurchaseModal('${c.id}')">+ Registrar compra</button>
      <button onclick="openContactModal('${c.id}')">+ Registrar contato</button>
      <button onclick="openClientModal('${c.id}')">Editar</button>
      ${isGestor() ? `<button onclick="deleteClient('${c.id}')">Remover cliente</button>` : ''}
    </div>`;
    const purchases = state.crmPurchases.filter(p=>p.clientId===c.id).sort((a,b)=> b.date.localeCompare(a.date));
    if (purchases.length){
      html += `<table class="purchases"><thead><tr><th>Data</th><th>Vendedora</th><th>Valor</th><th>O que comprou</th><th></th></tr></thead><tbody>`;
      purchases.forEach(p=>{
        const [y,m,d] = p.date.split('-');
        html += `<tr><td>${d}/${m}/${y}</td><td>${state.config.names[p.vendorIdx] ?? '—'}</td><td>${money(p.value)}</td><td>${p.notes||'—'}</td>
          <td><button class="del-btn" onclick="deletePurchase('${p.id}')">remover</button></td></tr>`;
      });
      html += `</tbody></table>`;
    } else {
      html += `<div class="empty-state">Nenhuma compra registrada ainda.</div>`;
    }
    const contacts = clientContacts(c.id);
    html += `<div class="mini-title">Histórico de contato</div>`;
    if (contacts.length){
      html += `<table class="purchases"><thead><tr><th>Data</th><th>Canal</th><th>Nota</th><th></th></tr></thead><tbody>`;
      contacts.forEach(ct=>{
        const [y,m,d] = ct.date.split('-');
        html += `<tr><td>${d}/${m}/${y}</td><td>${ct.channel}</td><td>${ct.note||'—'}</td>
          <td><button class="del-btn" onclick="deleteContact('${ct.id}')">remover</button></td></tr>`;
      });
      html += `</tbody></table>`;
    } else {
      html += `<div class="empty-state">Nenhum contato registrado ainda.</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}
