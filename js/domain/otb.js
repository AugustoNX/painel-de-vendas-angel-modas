import { state } from '../core/store.js';

export function marcaById(marcaId) {
  return state.marcas.find(marca => marca.id === marcaId) || null;
}

export function findMarcaByName(name) {
  const key = (name || '').trim().toLowerCase();
  return state.marcas.find(marca => (marca.name || '').toLowerCase() === key) || null;
}

export function stockPurchasesFor(marcaId, colecao, ano) {
  return state.stockPurchases.filter(p => p.marcaId === marcaId && p.colecao === colecao && p.ano === ano);
}

export function brandSalesFor(marcaId, colecao, ano) {
  return state.brandSales.filter(s => s.marcaId === marcaId && s.colecao === colecao && s.ano === ano);
}

/** Cada combinação marca + coleção + ano que já tem compra ou venda registrada. */
export function otbCombos() {
  const keys = new Set();
  state.stockPurchases.forEach(p => keys.add(`${p.marcaId}|${p.colecao}|${p.ano}`));
  state.brandSales.forEach(s => keys.add(`${s.marcaId}|${s.colecao}|${s.ano}`));
  return [...keys].map(key => {
    const [marcaId, colecao, ano] = key.split('|');
    return { marcaId, colecao, ano: Number(ano) };
  });
}

const SELL_THROUGH_BANDS = [
  { min: 0.9, fator: 1.1, faixa: 'Vendeu quase tudo — aumentar ~10%' },
  { min: 0.7, fator: 1, faixa: 'Bom giro — manter volume' },
  { min: 0.5, fator: 0.85, faixa: 'Giro médio — reduzir ~15%' },
  { min: 0, fator: 0.6, faixa: 'Sobrou muito — reduzir bastante (~40%)' }
];

export function otbSuggestion(marcaId, colecao, ano) {
  const purchases = stockPurchasesFor(marcaId, colecao, ano);
  const sales = brandSalesFor(marcaId, colecao, ano);

  const compradoPecas = purchases.reduce((sum, p) => sum + Number(p.pecas || 0), 0);
  const compradoValor = purchases.reduce((sum, p) => sum + Number(p.valor || 0), 0);
  const vendidoPecas = sales.reduce((sum, s) => sum + Number(s.pecas || 0), 0);
  const vendidoValor = sales.reduce((sum, s) => sum + Number(s.valor || 0), 0);

  const custoMedioPeca = compradoPecas > 0 ? compradoValor / compradoPecas : 0;
  const sellThrough = compradoPecas > 0 ? vendidoPecas / compradoPecas : null;
  const band = sellThrough === null ? null : SELL_THROUGH_BANDS.find(b => sellThrough >= b.min);
  const sugestaoPecas = band ? Math.round(compradoPecas * band.fator) : null;

  return {
    compradoPecas,
    compradoValor,
    vendidoPecas,
    vendidoValor,
    estoquePecas: compradoPecas - vendidoPecas,
    custoMedioPeca,
    sellThrough,
    fator: band?.fator ?? null,
    faixa: band?.faixa ?? null,
    sugestaoPecas,
    sugestaoValor: sugestaoPecas === null ? null : sugestaoPecas * custoMedioPeca
  };
}
