import { state } from '../state/store.js';
import { money, toFloatBR } from '../utils/format.js';
import { showToast } from '../ui/toast.js';
import { saveEstoqueData, genId } from '../state/store.js';
import { extractPdfText } from '../utils/pdf.js';
import { clientNameById } from '../domain/crm.js';
import { marcaById, findOrCreateMarca, otbCombos, otbSuggestion } from '../domain/compras.js';
import { updateTransferBadge } from './carteira-view.js';

export function renderCompras(){
  const wrap = document.getElementById('comprasView');
  updateTransferBadge();

  let html = '';
  html += `<nav class="months" style="margin-bottom:16px;">
    <button class="${state.comprasSubTab==='clientes'?'active':''}" onclick="switchComprasSubTab('clientes')">Compras de clientes</button>
    <button class="${state.comprasSubTab==='estoque'?'active':''}" onclick="switchComprasSubTab('estoque')">📦 Estoque por marca</button>
  </nav>`;

  if (state.comprasSubTab === 'clientes'){
    html += renderComprasClientesHtml();
  } else {
    wrap.innerHTML = html;
    renderEstoqueSection();
    return;
  }

  wrap.innerHTML = html;
}
export function switchComprasSubTab(tab){
  state.comprasSubTab = tab;
  renderCompras();
}

export function renderComprasClientesHtml(){
  let html = '';
  html += `<div class="crm-toolbar">
    <input type="text" class="crm-search" placeholder="Buscar por nome do cliente..." value="${state.comprasSearchTerm}" oninput="updateComprasSearch(this.value)">
    <button class="crm-add-btn" onclick="openPurchaseModal(null)">+ Nova compra</button>
  </div>`;

  let list = [...state.crmPurchases];
  if (state.comprasSearchTerm){
    list = list.filter(p => clientNameById(p.clientId).toLowerCase().includes(state.comprasSearchTerm));
  }
  const totalCompras = list.length;
  const totalValor = list.reduce((s,p)=> s+Number(p.value||0), 0);
  html += `<div class="crm-stats-row">
    <div class="crm-stat-chip"><div class="csc-label">Compras registradas</div><div class="csc-value">${totalCompras}</div></div>
    <div class="crm-stat-chip"><div class="csc-label">Total em compras</div><div class="csc-value">${money(totalValor)}</div></div>
  </div>`;

  list.sort((a,b)=> b.date.localeCompare(a.date));
  if (!list.length){
    html += `<div class="empty-clients">Nenhuma compra ${state.comprasSearchTerm?'encontrada':'registrada ainda'}.</div>`;
  } else {
    html += `<table class="purchases"><thead><tr><th>Data</th><th>Cliente</th><th>Vendedora</th><th>Valor</th><th>O que comprou</th><th></th></tr></thead><tbody>`;
    list.forEach(p=>{
      const [y,m,d] = p.date.split('-');
      html += `<tr><td>${d}/${m}/${y}</td><td>${clientNameById(p.clientId)}</td><td>${state.config.names[p.vendorIdx] ?? '—'}</td><td>${money(p.value)}</td><td>${p.notes||'—'}</td>
        <td><button class="del-btn" onclick="deletePurchase('${p.id}')">remover</button></td></tr>`;
    });
    html += `</tbody></table>`;
  }
  return html;
}
export function updateComprasSearch(val){
  state.comprasSearchTerm = val.toLowerCase();
  renderCompras();
}

/* ---- Estoque por Marca: render ---- */
export function renderEstoqueSection(){
  const wrap = document.getElementById('comprasView');
  let html = wrap.innerHTML; // keep sub-nav already rendered

  html += `<div class="crm-toolbar">
    <button class="crm-add-btn" onclick="openStockPurchaseModal()">+ Registrar compra de estoque</button>
    <button class="crm-add-btn" onclick="openBrandSalesImportModal()">📄 Importar Análise de Vendas (PDF)</button>
  </div>`;

  if (state.marcas.length){
    html += '<div>';
    state.marcas.forEach(m=> html += `<span class="marca-chip">${m.name}</span>`);
    html += '</div>';
  }

  const combos = otbCombos();
  if (!combos.length){
    html += `<div class="empty-clients">Nenhuma marca com compra ou venda registrada ainda. Comece registrando uma compra de estoque.</div>`;
  } else {
    html += `<div class="otb-card"><h2>🧮 Sugestão de compra por marca e coleção</h2>
      <p style="font-size:12px; color:#4B3A8F; margin:0;">Compara o que foi comprado com o que já vendeu daquela coleção, e sugere quanto comprar na próxima vez da mesma estação.</p>
      <table class="otb"><thead><tr>
        <th>Marca</th><th>Coleção</th><th>Comprado</th><th>Vendido</th><th>Estoque restante</th><th>Sell-through</th><th>Sugestão próxima coleção</th>
      </tr></thead><tbody>`;
    combos.sort((a,b)=> (marcaById(a.marcaId)?.name||'').localeCompare(marcaById(b.marcaId)?.name||''));
    combos.forEach(({marcaId, colecao, ano})=>{
      const marca = marcaById(marcaId);
      if (!marca) return;
      const s = otbSuggestion(marcaId, colecao, ano);
      const stClass = s.sellThrough===null ? '' : (s.sellThrough>=0.9?'up':(s.sellThrough<0.5?'down':'flat'));
      const sugClass = s.fator===null ? '' : (s.fator>1?'up':(s.fator<1?'down':'flat'));
      html += `<tr>
        <td><b>${marca.name}</b></td>
        <td>${colecao} ${ano}</td>
        <td>${s.compradoPecas} peças<br>${money(s.compradoValor)}</td>
        <td>${s.vendidoPecas} peças<br>${money(s.vendidoValor)}</td>
        <td>${s.estoquePecas} peças</td>
        <td>${s.sellThrough===null ? '—' : `<span class="sellthrough-bar-outer"><span class="sellthrough-bar-inner" style="width:${Math.min(s.sellThrough*100,100)}%"></span></span>${Math.round(s.sellThrough*100)}%`}</td>
        <td class="otb-suggestion ${sugClass}">${s.sugestaoPecas===null ? 'Sem dado de venda ainda' : `${s.sugestaoPecas} peças<br>${money(s.sugestaoValor)}<div style="font-weight:400; font-size:11px; color:var(--muted);">${s.faixa}</div>`}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  wrap.innerHTML = html;
  populateMarcaDatalist();
}
export function populateMarcaDatalist(){
  const dl = document.getElementById('marcaListOptions');
  if (!dl) return;
  dl.innerHTML = '';
  state.marcas.forEach(m=>{
    const opt = document.createElement('option');
    opt.value = m.name;
    dl.appendChild(opt);
  });
}

/* ---- Registrar compra de estoque ---- */
export function openStockPurchaseModal(){
  document.getElementById('stockMarcaInput').value = '';
  document.getElementById('stockColecao').value = 'Verão';
  document.getElementById('stockAno').value = new Date().getFullYear();
  document.getElementById('stockDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('stockPecas').value = '';
  document.getElementById('stockValor').value = '';
  populateMarcaDatalist();
  document.getElementById('stockPurchaseModal').classList.add('open');
}
export function closeStockPurchaseModal(){
  document.getElementById('stockPurchaseModal').classList.remove('open');
}
export async function saveStockPurchase(){
  const marcaName = document.getElementById('stockMarcaInput').value.trim();
  const colecao = document.getElementById('stockColecao').value;
  const ano = Number(document.getElementById('stockAno').value);
  const date = document.getElementById('stockDate').value;
  const pecas = Number(document.getElementById('stockPecas').value);
  const valor = Number(document.getElementById('stockValor').value);
  if (!marcaName){ showToast('Digite o nome da marca'); return; }
  if (!date || isNaN(pecas) || pecas<=0 || isNaN(valor) || valor<=0){ showToast('Preencha data, peças e valor corretamente'); return; }
  const marca = findOrCreateMarca(marcaName);
  state.stockPurchases.push({ id: genId(), marcaId: marca.id, colecao, ano, date, pecas, valor });
  await saveEstoqueData();
  closeStockPurchaseModal();
  renderEstoqueSection();
  showToast('Compra de estoque registrada');
}

/* ---- Importar Análise de Vendas por Marca ---- */
export function openBrandSalesImportModal(){
  document.getElementById('importBrandSalesFileInput').value = '';
  document.getElementById('importBrandSalesStatus').textContent = '';
  document.getElementById('importBrandSalesPreviewArea').innerHTML = '';
  document.getElementById('importBrandSalesConfirmBtn').style.display = 'none';
  document.getElementById('brandSalesColecao').value = 'Verão';
  document.getElementById('brandSalesAno').value = new Date().getFullYear();
  state.brandSalesParsed = [];
  document.getElementById('importBrandSalesModal').classList.add('open');
}
export function closeBrandSalesImportModal(){
  document.getElementById('importBrandSalesModal').classList.remove('open');
}

export function parseAnaliseVendasText(text){
  const anchorRe = /^(\d{6})\s+/gm;
  const anchors = [];
  let m;
  while ((m = anchorRe.exec(text)) !== null){
    anchors.push({ controle: m[1], index: m.index });
  }
  const rowRe = /^(\d{6})\s+(.+?)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(\d+)\s+([\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/;
  const results = [];
  for (let i=0; i<anchors.length; i++){
    const start = anchors[i].index;
    const end = (i+1<anchors.length) ? anchors[i+1].index : text.length;
    const block = text.slice(start, end).replace(/\n+$/,'');
    const lines = block.split('\n');
    const rm = rowRe.exec(lines[0]);
    if (!rm) continue;
    const [, controle, produtoPart, custo, venda, vendasQtde, total, lucro] = rm;
    const extraLines = lines.slice(1).filter(l => l.trim() && !/^QUANTIDADE/i.test(l.trim()));
    const produtoText = [produtoPart.trim()].concat(extraLines.map(l=>l.trim())).join(' ').replace(/\s+/g,' ');
    let marcaEncontrada = null;
    for (const mk of state.marcas){
      const re = new RegExp('\\b' + mk.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b', 'i');
      if (re.test(produtoText)){ marcaEncontrada = mk; break; }
    }
    results.push({
      controle, produto: produtoText,
      marcaId: marcaEncontrada ? marcaEncontrada.id : null,
      marcaName: marcaEncontrada ? marcaEncontrada.name : null,
      vendasQtde: parseInt(vendasQtde,10),
      total: toFloatBR(total)
    });
  }
  return results;
}

export async function handleBrandSalesImportFile(input){
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('importBrandSalesStatus');
  statusEl.textContent = 'Lendo o PDF...';
  document.getElementById('importBrandSalesPreviewArea').innerHTML = '';
  document.getElementById('importBrandSalesConfirmBtn').style.display = 'none';
  try{
    const buffer = await file.arrayBuffer();
    const text = await extractPdfText(buffer);
    const parsed = parseAnaliseVendasText(text);
    if (!parsed.length){
      statusEl.textContent = 'Não consegui reconhecer nenhum produto nesse PDF. Confirme se é o relatório "ANÁLISE DE VENDAS".';
      return;
    }
    state.brandSalesParsed = parsed;
    const comMarca = parsed.filter(p=>p.marcaId);
    statusEl.textContent = `${parsed.length} produtos encontrados — ${comMarca.length} com marca cadastrada reconhecida, ${parsed.length-comMarca.length} sem marca (não vão contar).`;
    renderBrandSalesPreview();
  }catch(err){
    statusEl.textContent = 'Não consegui ler esse arquivo. Confirme que é um PDF válido.';
    console.error(err);
  }
}

export function renderBrandSalesPreview(){
  const area = document.getElementById('importBrandSalesPreviewArea');
  const byMarca = {};
  state.brandSalesParsed.filter(p=>p.marcaId).forEach(p=>{
    if (!byMarca[p.marcaId]) byMarca[p.marcaId] = { name:p.marcaName, pecas:0, valor:0, itens:0 };
    byMarca[p.marcaId].pecas += p.vendasQtde;
    byMarca[p.marcaId].valor += p.total;
    byMarca[p.marcaId].itens += 1;
  });
  let html = '<div class="mini-title">Resumo por marca reconhecida</div>';
  if (!Object.keys(byMarca).length){
    html += `<div class="empty-state">Nenhum produto desse PDF bateu com uma marca já cadastrada. Cadastre a marca primeiro (registrando uma compra de estoque) e importe de novo.</div>`;
  } else {
    Object.values(byMarca).forEach(b=>{
      html += `<div class="import-person-row"><div><div class="import-person-name">${b.name}</div><div class="import-person-stats">${b.itens} produtos · ${b.pecas} peças vendidas</div></div><div><b>${money(b.valor)}</b></div></div>`;
    });
  }
  const semMarca = state.brandSalesParsed.filter(p=>!p.marcaId);
  html += `<details class="import-details" style="margin-top:10px;"><summary>${semMarca.length} produtos sem marca reconhecida (não entram na conta)</summary>`;
  semMarca.slice(0,50).forEach(p=> html += `<div class="abc-row"><span>${p.produto}</span><span>${p.vendasQtde}x · ${money(p.total)}</span></div>`);
  if (semMarca.length>50) html += `<div class="pacer-note">... e mais ${semMarca.length-50}.</div>`;
  html += `</details>`;
  area.innerHTML = html;
  document.getElementById('importBrandSalesConfirmBtn').style.display = Object.keys(byMarca).length ? '' : 'none';
}

export async function confirmBrandSalesImport(){
  const colecao = document.getElementById('brandSalesColecao').value;
  const ano = Number(document.getElementById('brandSalesAno').value);
  const byMarca = {};
  state.brandSalesParsed.filter(p=>p.marcaId).forEach(p=>{
    if (!byMarca[p.marcaId]) byMarca[p.marcaId] = { pecas:0, valor:0 };
    byMarca[p.marcaId].pecas += p.vendasQtde;
    byMarca[p.marcaId].valor += p.total;
  });
  let added = 0;
  Object.entries(byMarca).forEach(([marcaId, v])=>{
    state.brandSales.push({ id: genId(), marcaId, colecao, ano, pecas: v.pecas, valor: v.valor, importedAt: new Date().toISOString() });
    added++;
  });
  await saveEstoqueData();
  closeBrandSalesImportModal();
  renderEstoqueSection();
  showToast(`Importação concluída: vendas de ${added} marca(s) somadas em ${colecao} ${ano}`);
}
