import { state, currentGoal } from '../core/store.js';
import { MONTH_NAMES, TIER_ORDER, TIER_LABEL, RATES } from '../config/constants.js';
import { showToast } from '../ui/toast.js';
import { money } from '../ui/format.js';
import {
  goalVendors, extraVendors, vendorTotal, vendorPecas, currentTier, tierBonus, storeSummary
} from '../domain/metas.js';

const NAVY = [31, 58, 95];

export function exportCommissionPdf() {
  if (typeof window.jspdf === 'undefined') {
    showToast('Gerador de PDF não carregou. Confira sua internet e tente de novo.');
    return;
  }

  const goal = currentGoal();
  if (!goal) { showToast('Defina a meta do mês antes de gerar o relatório'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const periodo = `${MONTH_NAMES[state.month]}/${state.year}`;
  const hoje = new Date().toLocaleDateString('pt-BR');
  const summary = storeSummary(goal);

  doc.setFontSize(16);
  doc.text('ANGEL MODAS — Relatório de Comissões', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Mês de referência: ${periodo}   ·   Gerado em ${hoje}`, 14, 25);
  doc.setTextColor(0);

  doc.setFontSize(12);
  doc.text('Resumo da loja', 14, 36);
  doc.autoTable({
    startY: 40,
    theme: 'grid',
    headStyles: { fillColor: NAVY },
    styles: { fontSize: 10 },
    head: [['Objetivo', 'Realizado', 'Diferença', 'Peças', 'Bonificação total']],
    body: [[
      money(summary.objetivo),
      money(summary.realizado),
      summary.falta > 0 ? `falta ${money(summary.falta)}` : `+${money(summary.excedente)}`,
      String(summary.pecas),
      money(summary.bonificacao)
    ]]
  });

  let y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(12);
  doc.text('Metas do mês (por vendedora)', 14, y);
  doc.autoTable({
    startY: y + 4,
    theme: 'grid',
    headStyles: { fillColor: NAVY },
    styles: { fontSize: 10 },
    head: [['Nível', 'Meta por vendedora', 'Faixa', 'Bonificação ao atingir']],
    body: TIER_ORDER.map(tier => {
      const value = goal.niveis?.[tier];
      const available = value !== null && value !== undefined && value !== '';
      return [
        TIER_LABEL[tier],
        available ? money(value) : 'não vale neste mês',
        `${(RATES[tier] * 100).toFixed(1)}%`,
        available ? money(tierBonus(goal, tier)) : '—'
      ];
    })
  });

  y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(12);
  doc.text('Resultado por vendedora', 14, y);

  const rows = [];
  let totalVendido = 0;
  let totalPecas = 0;
  let totalBonus = 0;

  goalVendors(goal).forEach(vendor => {
    const total = vendorTotal(vendor.id);
    const qtd = vendorPecas(vendor.id);
    const tier = currentTier(goal, total);
    const bonus = tierBonus(goal, tier);
    totalVendido += total;
    totalPecas += qtd;
    totalBonus += bonus;
    rows.push([
      vendor.name,
      money(total),
      String(qtd),
      tier ? TIER_LABEL[tier] : 'Abaixo do Bronze',
      tier ? `${(RATES[tier] * 100).toFixed(1)}%` : '—',
      money(bonus)
    ]);
  });

  extraVendors().forEach(vendor => {
    const total = vendorTotal(vendor.id);
    if (!total) return;
    totalVendido += total;
    totalPecas += vendorPecas(vendor.id);
    rows.push([`${vendor.name} (apoio)`, money(total), String(vendorPecas(vendor.id)), '—', '—', money(0)]);
  });

  rows.push(['TOTAL', money(totalVendido), String(totalPecas), '', '', money(totalBonus)]);

  doc.autoTable({
    startY: y + 4,
    theme: 'grid',
    headStyles: { fillColor: NAVY },
    styles: { fontSize: 10 },
    head: [['Vendedora', 'Vendido', 'Peças', 'Nível atingido', 'Faixa', 'Bonificação']],
    body: rows,
    didParseCell(data) {
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [239, 236, 229];
      }
    }
  });

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    'Bonificação por desempenho: valor fixo da faixa atingida (meta do nível × taxa), não proporcional ao valor exato vendido.',
    14, doc.lastAutoTable.finalY + 10, { maxWidth: 180 }
  );

  doc.save(`comissoes_${MONTH_NAMES[state.month].toLowerCase()}_${state.year}.pdf`);
  showToast('Relatório gerado — confira sua pasta de downloads');
}
