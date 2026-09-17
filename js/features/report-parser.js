import { toFloatBR } from '../ui/format.js';

/**
 * Lê o relatório "VENDAS / TROCAS - ANALÍTICO" exportado do ERP.
 * Cada venda começa com "número de controle + data", e é esse par que serve de
 * âncora para recortar os blocos do texto extraído do PDF.
 */
const PAYMENT_METHODS = [
  'CARTÃO DE CRÉDITO - REDE', 'CARTÃO DE DEBITO - SICREDI', 'CREDIÁRIO', 'DINHEIRO', 'PIX'
];

function extractPaymentMethod(block) {
  let earliest = null;
  let earliestIdx = Infinity;
  PAYMENT_METHODS.forEach(method => {
    const idx = block.indexOf(method);
    if (idx !== -1 && idx < earliestIdx) { earliestIdx = idx; earliest = method; }
  });
  return earliest || 'Não informado';
}

export function parseSalesReport(text) {
  const anchorRe = /(\d{6})\s+(\d{2}\/\d{2}\/\d{4})\s+/g;
  const anchors = [];
  let match;

  while ((match = anchorRe.exec(text)) !== null) {
    anchors.push({ controle: match[1], date: match[2], index: match.index, headerEnd: match.index + match[0].length });
  }

  const results = [];
  anchors.forEach((anchor, i) => {
    const block = text.slice(anchor.index, i + 1 < anchors.length ? anchors[i + 1].index : text.length);
    const qtde = block.match(/TOTAL QTDE:\s*(-?\d+)/);
    const totalGeral = block.match(/TOTAL GERAL:\s*([\-\d.,]+)/);
    const colaborador = block.match(/COLABORADOR\(A\):\s*(.+?)(?=\s*TOTAL QTDE:|\s*COND\.PGTO|\n|$)/);
    if (!qtde || !totalGeral || !colaborador) return;

    const headerSlice = text.slice(anchor.headerEnd, anchor.headerEnd + 200);
    const nameMatch = headerSlice.match(/^(.*?)(?=PRODUTO|\n)/);
    const cliente = (nameMatch ? nameMatch[1] : '')
      .replace(/FAT\.|PEN\./gi, '')
      .replace(/SITUAÇÃO/gi, '')
      .replace(/^[.,\-\s]+/, '')
      .trim();

    const [dd, mm, yyyy] = anchor.date.split('/');

    results.push({
      controle: anchor.controle,
      dateStr: anchor.date,
      dateIso: `${yyyy}-${mm}-${dd}`,
      periodKey: `${yyyy}-${mm}`,
      qtde: parseInt(qtde[1], 10),
      valor: toFloatBR(totalGeral[1]),
      colaborador: colaborador[1].trim(),
      cliente,
      paymentMethod: extractPaymentMethod(block)
    });
  });

  return results;
}

/**
 * Lê o relatório "ANÁLISE DE VENDAS" (por produto) e tenta casar cada produto
 * com uma marca já cadastrada. Produtos sem marca reconhecida ficam de fora.
 */
export function parseBrandSalesReport(text, marcas) {
  const anchorRe = /^(\d{6})\s+/gm;
  const anchors = [];
  let match;
  while ((match = anchorRe.exec(text)) !== null) anchors.push({ index: match.index });

  const rowRe = /^(\d{6})\s+(.+?)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(\d+)\s+([\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/;
  const results = [];

  anchors.forEach((anchor, i) => {
    const block = text
      .slice(anchor.index, i + 1 < anchors.length ? anchors[i + 1].index : text.length)
      .replace(/\n+$/, '');
    const lines = block.split('\n');
    const row = rowRe.exec(lines[0]);
    if (!row) return;

    const [, controle, produtoPart, , , vendasQtde, total] = row;
    const extraLines = lines.slice(1).filter(line => line.trim() && !/^QUANTIDADE/i.test(line.trim()));
    const produto = [produtoPart.trim(), ...extraLines.map(line => line.trim())].join(' ').replace(/\s+/g, ' ');

    const marca = marcas.find(m => {
      const safe = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${safe}\\b`, 'i').test(produto);
    });

    results.push({
      controle,
      produto,
      marcaId: marca?.id || null,
      marcaName: marca?.name || null,
      pecas: parseInt(vendasQtde, 10),
      valor: toFloatBR(total)
    });
  });

  return results;
}
