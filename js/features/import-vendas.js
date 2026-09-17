import { state } from '../core/store.js';
import { MONTH_NAMES } from '../config/constants.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { money, pecas, esc, dateBr } from '../ui/format.js';
import { metaVendors, extraVendors } from '../domain/metas.js';
import { extractPdfText } from './pdf-reader.js';
import { parseSalesReport } from './report-parser.js';
import { saveReportMapping, mappingKey } from '../data/settings.repo.js';
import { listSales, addSale } from '../data/sales.repo.js';

const IGNORE = 'ignore';

export function openImportSalesModal() {
  let parsed = [];
  let mapping = { ...state.settings.reportNameMapping };

  openModal({
    title: 'Importar relatório de vendas (PDF)',
    subtitle: 'Relatório "VENDAS / TROCAS - ANALÍTICO" do ERP. Nada é salvo até você confirmar, e lançamentos já importados são pulados automaticamente.',
    size: 'lg',
    body: `
      <div class="field"><input type="file" id="importFile" accept="application/pdf"></div>
      <div id="importStatus" class="import-status"></div>
      <div id="importPreview"></div>`,
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
      const input = overlay.querySelector('#importFile');
      const status = overlay.querySelector('#importStatus');
      const preview = overlay.querySelector('#importPreview');

      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        status.textContent = 'Lendo o PDF...';
        preview.innerHTML = '';

        try {
          parsed = parseSalesReport(await extractPdfText(await file.arrayBuffer()));
          if (!parsed.length) {
            status.textContent = 'Não reconheci nenhuma venda nesse arquivo. Confirme que é o relatório "VENDAS / TROCAS - ANALÍTICO".';
            return;
          }
          const periods = [...new Set(parsed.map(t => t.periodKey))].sort();
          status.innerHTML = `<b>${parsed.length}</b> vendas encontradas, de ${periods.map(labelPeriod).join(', ')}.
            Confira quem é quem antes de confirmar.`;
          renderPreview(preview, parsed, mapping);
        } catch (err) {
          console.error(err);
          status.textContent = 'Não consegui ler esse arquivo. Confirme que é um PDF válido.';
        }
      });

      preview.addEventListener('change', event => {
        const select = event.target.closest('select[data-colab]');
        if (!select) return;
        mapping[mappingKey(select.dataset.colab)] = select.value;
      });
    }
  });
}

function labelPeriod(key) {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]}/${year}`;
}

function vendorOptions(selected) {
  const options = [`<option value="${IGNORE}"${selected === IGNORE || !selected ? ' selected' : ''}>Ignorar (não importar)</option>`];
  metaVendors().forEach(vendor => {
    options.push(`<option value="${vendor.id}"${selected === vendor.id ? ' selected' : ''}>${esc(vendor.name)}</option>`);
  });
  extraVendors().forEach(vendor => {
    options.push(`<option value="${vendor.id}"${selected === vendor.id ? ' selected' : ''}>${esc(vendor.name)} (apoio)</option>`);
  });
  return options.join('');
}

function renderPreview(container, parsed, mapping) {
  const byColab = {};
  parsed.forEach(tx => (byColab[tx.colaborador] ||= []).push(tx));

  const people = Object.entries(byColab).map(([colab, list]) => {
    const total = list.reduce((sum, tx) => sum + tx.valor, 0);
    const qtd = list.reduce((sum, tx) => sum + tx.qtde, 0);
    return `<div class="import-person-row">
      <div>
        <div class="import-person-name">${esc(colab)}</div>
        <div class="import-person-stats">${list.length} vendas · ${money(total)} · ${pecas(qtd)}</div>
      </div>
      <select data-colab="${esc(colab)}">${vendorOptions(mapping[mappingKey(colab)])}</select>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="mini-title">Quem é quem</div>${people}
    <details class="import-details">
      <summary>Ver os ${parsed.length} lançamentos detectados</summary>
      <table class="import-days">
        <thead><tr><th>Data</th><th>Colaborador(a)</th><th>Valor</th><th>Peças</th></tr></thead>
        <tbody>${parsed.map(tx => `<tr>
          <td>${dateBr(tx.dateIso)}</td><td>${esc(tx.colaborador)}</td><td>${money(tx.valor)}</td><td>${tx.qtde}</td>
        </tr>`).join('')}</tbody>
      </table>
    </details>`;
}

/**
 * Junta as vendas do PDF por vendedora e por dia, e grava um lançamento por dia.
 * Antes disso lê o que já existe no mês para não duplicar uma importação repetida.
 */
async function confirmImport(parsed, mapping, body) {
  const status = body.querySelector('#importStatus');
  status.textContent = 'Importando...';

  await Promise.all(Object.entries(mapping).map(([name, vendorId]) => saveReportMapping(name, vendorId)));

  const grouped = new Map();
  parsed.forEach(tx => {
    const vendorId = mapping[mappingKey(tx.colaborador)];
    if (!vendorId || vendorId === IGNORE) return;
    const key = `${tx.periodKey}|${vendorId}|${tx.dateIso}`;
    const bucket = grouped.get(key) || { periodKey: tx.periodKey, vendorId, date: tx.dateIso, amount: 0, pecas: 0 };
    bucket.amount += tx.valor;
    bucket.pecas += tx.qtde;
    grouped.set(key, bucket);
  });

  if (!grouped.size) {
    status.textContent = 'Nenhum colaborador foi associado a uma vendedora — nada para importar.';
    showToast('Associe pelo menos uma pessoa antes de confirmar');
    return false;
  }

  const periods = [...new Set([...grouped.values()].map(entry => entry.periodKey))];
  const existing = new Set();
  for (const period of periods) {
    (await listSales(period)).forEach(sale => existing.add(`${period}|${sale.vendorId}|${sale.date}`));
  }

  let added = 0;
  let skipped = 0;
  for (const entry of grouped.values()) {
    const key = `${entry.periodKey}|${entry.vendorId}|${entry.date}`;
    if (existing.has(key)) { skipped++; continue; }
    await addSale(entry.periodKey, { ...entry, source: 'import' });
    added++;
  }

  showToast(`Importação concluída: ${added} lançamento(s)${skipped ? `, ${skipped} pulado(s) por já existir` : ''}`);
}
