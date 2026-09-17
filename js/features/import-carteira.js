import { state } from '../state/store.js';
import { money, normalizeName } from '../utils/format.js';
import { extractPdfText } from '../utils/pdf.js';
import { showToast } from '../ui/toast.js';
import { saveConfig, saveCrmData, genId } from '../state/store.js';
import { parseReportText, importTargetOptions } from './import-vendas.js';
import { clientStatus, findClientByName, checkTransferNeeded } from '../domain/crm.js';
import { refreshCrmViews } from './carteira-view.js';

/* ================= Importar relatório PDF — Gestão de Carteira ================= */

export function openCarteiraImportModal(){
  document.getElementById('importCarteiraFileInput').value = '';
  document.getElementById('importCarteiraStatus').textContent = '';
  document.getElementById('importCarteiraPreviewArea').innerHTML = '';
  document.getElementById('importCarteiraConfirmBtn').style.display = 'none';
  state.importCarteiraParsedTransactions = [];
  document.getElementById('importCarteiraModal').classList.add('open');
}
export function closeCarteiraImportModal(){
  document.getElementById('importCarteiraModal').classList.remove('open');
}

export async function handleCarteiraImportFile(input){
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('importCarteiraStatus');
  statusEl.textContent = 'Lendo o PDF...';
  document.getElementById('importCarteiraPreviewArea').innerHTML = '';
  document.getElementById('importCarteiraConfirmBtn').style.display = 'none';
  try{
    const buffer = await file.arrayBuffer();
    const text = await extractPdfText(buffer);
    const parsed = parseReportText(text);
    if (!parsed.length){
      statusEl.textContent = 'Não consegui reconhecer nenhuma venda nesse PDF. Confirme se é o relatório "VENDAS / TROCAS - ANALÍTICO".';
      return;
    }
    state.importCarteiraParsedTransactions = parsed;
    const uniqueClients = new Set(parsed.map(t=>normalizeName(t.cliente))).size;
    statusEl.textContent = `${parsed.length} vendas encontradas, de ${uniqueClients} clientes. Confira o mapeamento das vendedoras antes de confirmar.`;
    renderCarteiraImportPreview();
  }catch(err){
    statusEl.textContent = 'Não consegui ler esse arquivo. Confirme que é um PDF válido do relatório de vendas.';
    console.error(err);
  }
}

export function renderCarteiraImportPreview(){
  const area = document.getElementById('importCarteiraPreviewArea');
  const byColab = {};
  state.importCarteiraParsedTransactions.forEach(t=>{
    if (!byColab[t.colaborador]) byColab[t.colaborador] = [];
    byColab[t.colaborador].push(t);
  });

  const mapping = state.config.reportNameMapping || {};
  let html = '<div class="mini-title">Quem é quem (mesmo mapeamento usado em Objetivos e Vendas)</div>';
  Object.keys(byColab).forEach(colab=>{
    const list = byColab[colab];
    const selectedKey = mapping[colab] || 'ignore';
    const safeId = 'mapSelC_' + colab.replace(/[^a-zA-Z0-9]/g,'');
    html += `<div class="import-person-row">
      <div>
        <div class="import-person-name">${colab}</div>
        <div class="import-person-stats">${list.length} vendas</div>
      </div>
      <select id="${safeId}" data-colab="${colab.replace(/"/g,'&quot;')}" onchange="updateImportMapping(this); renderCarteiraImportPreview();">
        ${importTargetOptions(selectedKey)}
      </select>
    </div>`;
  });

  const validTx = state.importCarteiraParsedTransactions.filter(t => (mapping[t.colaborador]||'').startsWith('v'));
  const byClient = {};
  validTx.forEach(t=>{
    const key = normalizeName(t.cliente);
    if (!byClient[key]) byClient[key] = [];
    byClient[key].push(t);
  });
  let novos = 0, existentes = 0, duplicadas = 0, novasCompras = 0;
  Object.keys(byClient).forEach(key=>{
    const list = byClient[key];
    const existingClient = findClientByName(list[0].cliente);
    if (existingClient) existentes++; else novos++;
    list.forEach(t=>{
      const dup = existingClient && state.crmPurchases.some(p => p.controle === t.controle);
      if (dup) duplicadas++; else novasCompras++;
    });
  });

  html += `<div class="import-summary-box">
    <b>${Object.keys(byClient).length}</b> clientes identificados (mapeados) ·
    <b>${novos}</b> serão criados ·
    <b>${existentes}</b> já existem ·
    <b>${novasCompras}</b> compras novas serão adicionadas ·
    <b>${duplicadas}</b> já existiam e serão puladas.
  </div>`;

  html += '<details class="import-details"><summary>Ver todos os lançamentos detectados, dia a dia</summary>';
  html += '<table class="import-days"><thead><tr><th>Data</th><th>Cliente</th><th>Colaborador(a)</th><th>Valor</th><th>Pagamento</th></tr></thead><tbody>';
  state.importCarteiraParsedTransactions.forEach(t=>{
    html += `<tr><td>${t.dateStr}</td><td>${t.cliente}</td><td>${t.colaborador}</td><td>${money(t.valor)}</td><td>${t.paymentMethod}</td></tr>`;
  });
  html += '</tbody></table></details>';

  area.innerHTML = html;
  document.getElementById('importCarteiraConfirmBtn').style.display = '';
}

export async function confirmCarteiraImport(){
  await saveConfig();
  const mapping = state.config.reportNameMapping || {};
  const validTx = state.importCarteiraParsedTransactions.filter(t => (mapping[t.colaborador]||'').startsWith('v'));

  const byClient = {};
  validTx.forEach(t=>{
    const key = normalizeName(t.cliente);
    if (!byClient[key]) byClient[key] = [];
    byClient[key].push(t);
  });

  let clientsCreated = 0, purchasesAdded = 0, purchasesSkipped = 0, reactivations = 0;

  Object.values(byClient).forEach(list=>{
    list.sort((a,b)=> a.dateStr.localeCompare(b.dateStr));
    let client = findClientByName(list[0].cliente);
    if (!client){
      const ownerVendorIdx = Number(mapping[list[0].colaborador].slice(1));
      client = { id: genId(), name: list[0].cliente, phone:'', birthday:'', notes:'', ownerVendorIdx, createdAt: new Date().toISOString() };
      state.crmClients.push(client);
      clientsCreated++;
    }

    const statusBefore = clientStatus(client.id);
    let lastNewDate = null, lastNewVendorIdx = null;

    list.forEach(t=>{
      const already = state.crmPurchases.some(p => p.controle === t.controle);
      if (already){ purchasesSkipped++; return; }
      const [dd,mm,yyyy] = t.dateStr.split('/');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      const vendorIdx = Number(mapping[t.colaborador].slice(1));
      state.crmPurchases.push({
        id: genId(), clientId: client.id, date: isoDate, vendorIdx,
        value: t.valor, notes: t.paymentMethod ? ('Pagamento: ' + t.paymentMethod) : '',
        controle: t.controle
      });
      purchasesAdded++;
      if (!lastNewDate || isoDate > lastNewDate){ lastNewDate = isoDate; lastNewVendorIdx = vendorIdx; }
      checkTransferNeeded(client.id);
    });

    if (lastNewDate){
      const statusAfter = clientStatus(client.id);
      const wasConcerning = ['atencao','risco','inativa'].includes(statusBefore.key);
      if (wasConcerning && statusAfter.key === 'ativa'){
        client.lastReactivation = { vendorIdx: lastNewVendorIdx, date: lastNewDate, fromStatus: statusBefore.key };
        reactivations++;
      }
    }
  });

  await saveCrmData();
  closeCarteiraImportModal();
  refreshCrmViews();
  showToast(`Importação concluída: ${clientsCreated} cliente(s) novo(s), ${purchasesAdded} compra(s) adicionada(s)${purchasesSkipped?', '+purchasesSkipped+' pulada(s) por já existir':''}${reactivations?', 🎉 '+reactivations+' reativação(ões)!':''}`);
}
