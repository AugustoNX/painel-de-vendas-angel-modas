import { state } from '../state/store.js';
import { MONTH_NUM } from '../config/constants.js';
import { money, pecas, toFloatBR } from '../utils/format.js';
import { extractPdfText } from '../utils/pdf.js';
import { showToast } from '../ui/toast.js';
import { saveConfig, saveEntries, saveExtraEntries, genId } from '../state/store.js';
import { renderAll } from './vendas-view.js';

/* ================= Importar relatório PDF ================= */

export function openImportModal(){
  document.getElementById('importFileInput').value = '';
  document.getElementById('importStatus').textContent = '';
  document.getElementById('importPreviewArea').innerHTML = '';
  document.getElementById('importConfirmBtn').style.display = 'none';
  state.importParsedTransactions = [];
  document.getElementById('importModal').classList.add('open');
}
export function closeImportModal(){
  document.getElementById('importModal').classList.remove('open');
}

export function monthNameFromDateStr(dateStr){
  const parts = dateStr.split('/');
  const mm = parts[1], yyyy = parts[2];
  if (yyyy !== '2026') return null;
  const found = Object.entries(MONTH_NUM).find(([k,v])=> v===mm);
  return found ? found[0] : null;
}

const PAYMENT_METHODS = ['CARTÃO DE CRÉDITO - REDE','CARTÃO DE DEBITO - SICREDI','CREDIÁRIO','DINHEIRO','PIX'];
export function extractPaymentMethod(block){
  let earliest = null, earliestIdx = Infinity;
  PAYMENT_METHODS.forEach(pm=>{
    const idx = block.indexOf(pm);
    if (idx !== -1 && idx < earliestIdx){ earliestIdx = idx; earliest = pm; }
  });
  return earliest || 'Não informado';
}

export function parseReportText(text){
  const anchorRe = /(\d{6})\s+(\d{2}\/\d{2}\/\d{4})\s+/g;
  const anchors = [];
  let m;
  while ((m = anchorRe.exec(text)) !== null){
    anchors.push({ controle: m[1], date: m[2], index: m.index, headerEnd: m.index + m[0].length });
  }
  const results = [];
  for (let i=0; i<anchors.length; i++){
    const start = anchors[i].index;
    const end = (i+1 < anchors.length) ? anchors[i+1].index : text.length;
    const block = text.slice(start, end);
    const qtdeM = block.match(/TOTAL QTDE:\s*(-?\d+)/);
    const totalGeralM = block.match(/TOTAL GERAL:\s*([\-\d.,]+)/);
    const colabM = block.match(/COLABORADOR\(A\):\s*(.+?)(?=\s*TOTAL QTDE:|\s*COND\.PGTO|\n|$)/);
    if (!qtdeM || !totalGeralM || !colabM) continue;
    const month = monthNameFromDateStr(anchors[i].date);

    // client name: text between the date and "PRODUTO", minus status tags
    const headerSlice = text.slice(anchors[i].headerEnd, anchors[i].headerEnd + 200);
    const nameM = headerSlice.match(/^(.*?)(?=PRODUTO|\n)/);
    let cliente = nameM ? nameM[1] : '';
    cliente = cliente.replace(/FAT\.|PEN\./gi, '').replace(/SITUAÇÃO/gi,'').trim();
    cliente = cliente.replace(/^[.,\-\s]+/, '').trim();

    const paymentMethod = extractPaymentMethod(block);

    results.push({
      controle: anchors[i].controle,
      dateStr: anchors[i].date,
      month: month,
      qtde: parseInt(qtdeM[1], 10),
      valor: toFloatBR(totalGeralM[1]),
      colaborador: colabM[1].trim(),
      cliente: cliente,
      paymentMethod: paymentMethod
    });
  }
  return results;
}

export function importTargetOptions(selectedKey){
  let html = '<option value="ignore"' + (selectedKey==='ignore'?' selected':'') + '>Ignorar (não importar)</option>';
  state.config.names.forEach((name,i)=>{
    const key = 'v'+i;
    html += `<option value="${key}"${selectedKey===key?' selected':''}>${name} (vendedora)</option>`;
  });
  (state.config.extraNames||[]).forEach((name,i)=>{
    const key = 'e'+i;
    html += `<option value="${key}"${selectedKey===key?' selected':''}>${name} (extra)</option>`;
  });
  return html;
}

export async function handleImportFile(input){
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('importStatus');
  statusEl.textContent = 'Lendo o PDF...';
  document.getElementById('importPreviewArea').innerHTML = '';
  document.getElementById('importConfirmBtn').style.display = 'none';
  try{
    const buffer = await file.arrayBuffer();
    const text = await extractPdfText(buffer);
    const parsed = parseReportText(text);
    if (!parsed.length){
      statusEl.textContent = 'Não consegui reconhecer nenhuma venda nesse PDF. Confirme se é o relatório "VENDAS / TROCAS - ANALÍTICO".';
      return;
    }
    state.importParsedTransactions = parsed;
    const outOfRange = parsed.filter(p => !p.month).length;
    statusEl.textContent = `${parsed.length} vendas encontradas no PDF` + (outOfRange ? ` (${outOfRange} fora do período Jul-Dez/2026, serão ignoradas)` : '') + '. Confira o mapeamento abaixo antes de confirmar.';
    renderImportPreview();
  }catch(err){
    statusEl.textContent = 'Não consegui ler esse arquivo. Confirme que é um PDF válido do relatório de vendas.';
    console.error(err);
  }
}

export function renderImportPreview(){
  const area = document.getElementById('importPreviewArea');
  const byColab = {};
  state.importParsedTransactions.forEach(t=>{
    if (!t.month) return;
    if (!byColab[t.colaborador]) byColab[t.colaborador] = [];
    byColab[t.colaborador].push(t);
  });

  const mapping = state.config.reportNameMapping || {};
  let html = '<div class="mini-title">Quem é quem</div>';
  Object.keys(byColab).forEach(colab=>{
    const list = byColab[colab];
    const totalValor = list.reduce((s,t)=> s+t.valor, 0);
    const totalPecas = list.reduce((s,t)=> s+t.qtde, 0);
    const selectedKey = mapping[colab] || 'ignore';
    const safeId = 'mapSel_' + colab.replace(/[^a-zA-Z0-9]/g,'');
    html += `<div class="import-person-row">
      <div>
        <div class="import-person-name">${colab}</div>
        <div class="import-person-stats">${list.length} vendas · ${money(totalValor)} · ${pecas(totalPecas)}</div>
      </div>
      <select id="${safeId}" data-colab="${colab.replace(/"/g,'&quot;')}" onchange="updateImportMapping(this)">
        ${importTargetOptions(selectedKey)}
      </select>
    </div>`;
  });

  html += '<details class="import-details"><summary>Ver todos os lançamentos detectados, dia a dia</summary>';
  html += '<table class="import-days"><thead><tr><th>Data</th><th>Colaborador(a)</th><th>Valor</th><th>Peças</th></tr></thead><tbody>';
  state.importParsedTransactions.forEach(t=>{
    html += `<tr><td>${t.dateStr}${t.month?'':' ⚠️'}</td><td>${t.colaborador}</td><td>${money(t.valor)}</td><td>${t.qtde}</td></tr>`;
  });
  html += '</tbody></table></details>';

  area.innerHTML = html;
  document.getElementById('importConfirmBtn').style.display = '';
}

export function updateImportMapping(sel){
  if (!state.config.reportNameMapping) state.config.reportNameMapping = {};
  state.config.reportNameMapping[sel.dataset.colab] = sel.value;
}

export async function confirmImport(){
  await saveConfig(); // persist any new name mappings
  const mapping = state.config.reportNameMapping || {};
  const byGroup = {}; // key: mapKey|month|date -> {valor, qtde}
  state.importParsedTransactions.forEach(t=>{
    if (!t.month) return;
    const mapKey = mapping[t.colaborador];
    if (!mapKey || mapKey === 'ignore') return;
    const groupKey = mapKey + '|' + t.month + '|' + t.dateStr;
    if (!byGroup[groupKey]) byGroup[groupKey] = { mapKey, month: t.month, dateStr: t.dateStr, valor: 0, qtde: 0 };
    byGroup[groupKey].valor += t.valor;
    byGroup[groupKey].qtde += t.qtde;
  });

  let added = 0, skipped = 0;
  Object.values(byGroup).forEach(g=>{
    const [dd, mm, yyyy] = g.dateStr.split('/');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    if (g.mapKey.startsWith('v')){
      const vendorIdx = Number(g.mapKey.slice(1));
      const exists = state.entries.some(e => e.month===g.month && e.vendorIdx===vendorIdx && e.date===isoDate);
      if (exists){ skipped++; return; }
      state.entries.push({ id: genId(), month: g.month, date: isoDate, vendorIdx, amount: g.valor, pecas: g.qtde });
      added++;
    } else if (g.mapKey.startsWith('e')){
      const extraIdx = Number(g.mapKey.slice(1));
      const exists = state.extraEntries.some(e => e.month===g.month && e.extraIdx===extraIdx && e.date===isoDate);
      if (exists){ skipped++; return; }
      state.extraEntries.push({ id: genId(), month: g.month, date: isoDate, extraIdx, amount: g.valor, pecas: g.qtde });
      added++;
    }
  });

  await saveEntries();
  await saveExtraEntries();
  closeImportModal();
  renderAll();
  showToast(`Importação concluída: ${added} lançamento(s) adicionado(s)${skipped ? ', ' + skipped + ' pulado(s) por já existir' : ''}`);
}
