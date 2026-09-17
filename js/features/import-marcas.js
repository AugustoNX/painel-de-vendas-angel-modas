import { state } from '../core/store.js';
import { COLECOES } from '../config/constants.js';
import { openModal, selectField, field } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { money, esc } from '../ui/format.js';
import { extractPdfText } from './pdf-reader.js';
import { parseBrandSalesReport } from './report-parser.js';
import { createBrandSale } from '../data/stock.repo.js';

export function openBrandSalesModal() {
  let parsed = [];

  openModal({
    title: 'Importar Análise de Vendas por marca (PDF)',
    subtitle: 'Relatório "ANÁLISE DE VENDAS" do ERP. Só entram produtos cuja marca já está cadastrada — os demais aparecem à parte e não contam em nenhum cálculo.',
    size: 'lg',
    body: `
      <div class="goal-row">
        ${selectField({ id: 'brandColecao', label: 'Coleção destas vendas', options: COLECOES.map(c => ({ value: c, label: c })), value: 'Verão' })}
        ${field({ id: 'brandAno', label: 'Ano', type: 'number', value: new Date().getFullYear(), attrs: 'min="2020" max="2100"' })}
      </div>
      <div class="field"><input type="file" id="brandFile" accept="application/pdf"></div>
      <div id="brandStatus" class="import-status"></div>
      <div id="brandPreview"></div>`,
    actions: [
      { label: 'Fechar', kind: 'secondary' },
      {
        label: 'Confirmar importação',
        kind: 'primary',
        onClick: async ({ body }) => {
          const recognized = parsed.filter(row => row.marcaId);
          if (!recognized.length) { showToast('Nenhum produto com marca cadastrada foi reconhecido'); return false; }

          const colecao = body.querySelector('#brandColecao').value;
          const ano = Number(body.querySelector('#brandAno').value);

          const byMarca = new Map();
          recognized.forEach(row => {
            const bucket = byMarca.get(row.marcaId) || { pecas: 0, valor: 0 };
            bucket.pecas += row.pecas;
            bucket.valor += row.valor;
            byMarca.set(row.marcaId, bucket);
          });

          for (const [marcaId, totals] of byMarca) {
            await createBrandSale({ marcaId, colecao, ano, ...totals });
          }
          showToast(`Vendas de ${byMarca.size} marca(s) somadas em ${colecao} ${ano}`);
        }
      }
    ],
    onMount(overlay) {
      const input = overlay.querySelector('#brandFile');
      const status = overlay.querySelector('#brandStatus');
      const preview = overlay.querySelector('#brandPreview');

      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        status.textContent = 'Lendo o PDF...';
        preview.innerHTML = '';

        try {
          parsed = parseBrandSalesReport(await extractPdfText(await file.arrayBuffer()), state.marcas);
          if (!parsed.length) {
            status.textContent = 'Não reconheci nenhum produto. Confirme que é o relatório "ANÁLISE DE VENDAS".';
            return;
          }
          const recognized = parsed.filter(row => row.marcaId);
          status.innerHTML = `<b>${parsed.length}</b> produtos encontrados — <b>${recognized.length}</b> com marca cadastrada,
            ${parsed.length - recognized.length} sem marca (não contam).`;
          renderPreview(preview, parsed);
        } catch (err) {
          console.error(err);
          status.textContent = 'Não consegui ler esse arquivo. Confirme que é um PDF válido.';
        }
      });
    }
  });
}

function renderPreview(container, parsed) {
  const byMarca = new Map();
  parsed.filter(row => row.marcaId).forEach(row => {
    const bucket = byMarca.get(row.marcaId) || { name: row.marcaName, pecas: 0, valor: 0, itens: 0 };
    bucket.pecas += row.pecas;
    bucket.valor += row.valor;
    bucket.itens++;
    byMarca.set(row.marcaId, bucket);
  });

  const semMarca = parsed.filter(row => !row.marcaId);

  container.innerHTML = `<div class="mini-title">Resumo por marca reconhecida</div>
    ${byMarca.size
      ? [...byMarca.values()].map(marca => `<div class="import-person-row">
          <div>
            <div class="import-person-name">${esc(marca.name)}</div>
            <div class="import-person-stats">${marca.itens} produtos · ${marca.pecas} peças</div>
          </div>
          <div><b>${money(marca.valor)}</b></div>
        </div>`).join('')
      : '<div class="empty-state">Nenhum produto bateu com uma marca cadastrada. Cadastre a marca registrando uma compra de estoque e importe de novo.</div>'}
    <details class="import-details">
      <summary>${semMarca.length} produtos sem marca reconhecida</summary>
      ${semMarca.slice(0, 60).map(row => `<div class="abc-row">
        <span>${esc(row.produto)}</span><span>${row.pecas}x · ${money(row.valor)}</span>
      </div>`).join('')}
      ${semMarca.length > 60 ? `<div class="pacer-note">... e mais ${semMarca.length - 60}.</div>` : ''}
    </details>`;
}
