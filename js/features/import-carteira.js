import { state } from '../core/store.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { money, esc, dateBr, normalizeName } from '../ui/format.js';
import { metaVendors } from '../domain/metas.js';
import { findClientByName, clientStatus, transferSuggestion } from '../domain/crm.js';
import { extractPdfText } from './pdf-reader.js';
import { parseSalesReport } from './report-parser.js';
import { saveReportMapping, mappingKey } from '../data/settings.repo.js';
import { createClient, createPurchase, updateClient, createTransfer } from '../data/crm.repo.js';

const IGNORE = 'ignore';

export function openImportCarteiraModal() {
  let parsed = [];
  let mapping = { ...state.settings.reportNameMapping };

  openModal({
    title: 'Importar relatório para a carteira (PDF)',
    subtitle: 'Mesmo relatório "VENDAS / TROCAS - ANALÍTICO". Cria e atualiza clientes, compras e forma de pagamento — não mexe nas metas.',
    size: 'lg',
    body: `
      <div class="field"><input type="file" id="carteiraFile" accept="application/pdf"></div>
      <div id="carteiraStatus" class="import-status"></div>
      <div id="carteiraPreview"></div>`,
    actions: [
      { label: 'Fechar', kind: 'secondary' },
      {
        label: 'Confirmar importação',
        kind: 'primary',
        onClick: async ({ body }) => {
          if (!parsed.length) { showToast('Escolha um arquivo primeiro'); return false; }
          return confirmImport(parsed, mapping, body);
        }
      }
    ],
    onMount(overlay) {
      const input = overlay.querySelector('#carteiraFile');
      const status = overlay.querySelector('#carteiraStatus');
      const preview = overlay.querySelector('#carteiraPreview');

      const refresh = () => renderPreview(preview, parsed, mapping);

      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        status.textContent = 'Lendo o PDF...';
        preview.innerHTML = '';

        try {
          parsed = parseSalesReport(await extractPdfText(await file.arrayBuffer()));
          if (!parsed.length) {
            status.textContent = 'Não reconheci nenhuma venda nesse arquivo.';
            return;
          }
          const clientes = new Set(parsed.map(tx => normalizeName(tx.cliente))).size;
          status.innerHTML = `<b>${parsed.length}</b> vendas encontradas, de <b>${clientes}</b> clientes.`;
          refresh();
        } catch (err) {
          console.error(err);
          status.textContent = 'Não consegui ler esse arquivo. Confirme que é um PDF válido.';
        }
      });

      preview.addEventListener('change', event => {
        const select = event.target.closest('select[data-colab]');
        if (!select) return;
        mapping[mappingKey(select.dataset.colab)] = select.value;
        refresh();
      });
    }
  });
}

function vendorOptions(selected) {
  return [`<option value="${IGNORE}"${!selected || selected === IGNORE ? ' selected' : ''}>Ignorar</option>`]
    .concat(metaVendors().map(vendor =>
      `<option value="${vendor.id}"${selected === vendor.id ? ' selected' : ''}>${esc(vendor.name)}</option>`))
    .join('');
}

function groupByClient(parsed, mapping) {
  const groups = new Map();
  parsed.forEach(tx => {
    const vendorId = mapping[mappingKey(tx.colaborador)];
    if (!vendorId || vendorId === IGNORE) return;
    if (!tx.cliente) return;
    const key = normalizeName(tx.cliente);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...tx, vendorId });
  });
  return groups;
}

function renderPreview(container, parsed, mapping) {
  const byColab = {};
  parsed.forEach(tx => (byColab[tx.colaborador] ||= []).push(tx));

  const people = Object.entries(byColab).map(([colab, list]) => `<div class="import-person-row">
    <div>
      <div class="import-person-name">${esc(colab)}</div>
      <div class="import-person-stats">${list.length} vendas</div>
    </div>
    <select data-colab="${esc(colab)}">${vendorOptions(mapping[mappingKey(colab)])}</select>
  </div>`).join('');

  const groups = groupByClient(parsed, mapping);
  let novos = 0;
  let existentes = 0;
  let novasCompras = 0;
  let duplicadas = 0;

  groups.forEach(list => {
    const client = findClientByName(list[0].cliente);
    client ? existentes++ : novos++;
    list.forEach(tx => {
      const duplicate = state.purchases.some(purchase => purchase.controle === tx.controle);
      duplicate ? duplicadas++ : novasCompras++;
    });
  });

  container.innerHTML = `<div class="mini-title">Quem é quem (mesmo mapeamento de Objetivos e Vendas)</div>${people}
    <div class="import-summary-box">
      <b>${groups.size}</b> clientes mapeadas ·
      <b>${novos}</b> serão criadas ·
      <b>${existentes}</b> já existem ·
      <b>${novasCompras}</b> compras novas ·
      <b>${duplicadas}</b> já importadas serão puladas.
    </div>
    <details class="import-details">
      <summary>Ver os ${parsed.length} lançamentos detectados</summary>
      <table class="import-days">
        <thead><tr><th>Data</th><th>Cliente</th><th>Colaborador(a)</th><th>Valor</th><th>Pagamento</th></tr></thead>
        <tbody>${parsed.map(tx => `<tr>
          <td>${dateBr(tx.dateIso)}</td><td>${esc(tx.cliente)}</td><td>${esc(tx.colaborador)}</td>
          <td>${money(tx.valor)}</td><td>${esc(tx.paymentMethod)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </details>`;
}

async function confirmImport(parsed, mapping, body) {
  const status = body.querySelector('#carteiraStatus');
  const groups = groupByClient(parsed, mapping);

  if (!groups.size) {
    status.textContent = 'Nenhum colaborador foi associado a uma vendedora — nada para importar.';
    return false;
  }

  status.textContent = 'Importando...';
  await Promise.all(Object.entries(mapping).map(([name, vendorId]) => saveReportMapping(name, vendorId)));

  let clientesCriados = 0;
  let comprasAdicionadas = 0;
  let puladas = 0;
  let reativacoes = 0;

  for (const list of groups.values()) {
    list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    let client = findClientByName(list[0].cliente);
    let clientId = client?.id;

    if (!client) {
      clientId = await createClient({
        name: list[0].cliente,
        ownerVendorId: list[0].vendorId
      });
      clientesCriados++;
    }

    const statusBefore = client ? clientStatus(clientId) : { key: 'sem-compra' };
    let lastDate = null;
    let lastVendorId = null;

    for (const tx of list) {
      if (state.purchases.some(purchase => purchase.controle === tx.controle)) { puladas++; continue; }
      await createPurchase({
        clientId,
        date: tx.dateIso,
        vendorId: tx.vendorId,
        value: tx.valor,
        notes: tx.paymentMethod ? `Pagamento: ${tx.paymentMethod}` : '',
        controle: tx.controle
      });
      comprasAdicionadas++;
      if (!lastDate || tx.dateIso > lastDate) { lastDate = tx.dateIso; lastVendorId = tx.vendorId; }
    }

    // Cliente que estava fria e voltou a comprar vira uma reativação comemorada.
    if (lastDate && ['atencao', 'risco', 'inativa'].includes(statusBefore.key)) {
      const daysNow = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
      if (daysNow <= 30) {
        await updateClient(clientId, {
          lastReactivation: { vendorId: lastVendorId, date: lastDate, fromStatus: statusBefore.key }
        });
        reativacoes++;
      }
    }

    const suggestion = transferSuggestion(clientId);
    if (suggestion) await createTransfer(suggestion);
  }

  showToast(`Importação concluída: ${clientesCriados} cliente(s) nova(s), ${comprasAdicionadas} compra(s)` +
    (puladas ? `, ${puladas} pulada(s)` : '') + (reativacoes ? `, 🎉 ${reativacoes} reativação(ões)` : ''));
}
