import { state } from '../state/store.js';
import { genId } from '../state/store.js';

export const COLECOES = ['Primavera','Verão','Outono','Inverno'];

export function marcaById(id){ return state.marcas.find(m=>m.id===id); }
export function findOrCreateMarca(name){
  const norm = (name||'').trim();
  if (!norm) return null;
  let m = state.marcas.find(x=> x.name.toLowerCase() === norm.toLowerCase());
  if (!m){
    m = { id: genId(), name: norm };
    state.marcas.push(m);
  }
  return m;
}
export function stockPurchasesFor(marcaId, colecao, ano){
  return state.stockPurchases.filter(p=>p.marcaId===marcaId && p.colecao===colecao && p.ano===ano);
}
export function brandSalesFor(marcaId, colecao, ano){
  return state.brandSales.filter(s=>s.marcaId===marcaId && s.colecao===colecao && s.ano===ano);
}
export function otbCombos(){
  const set = new Set();
  state.stockPurchases.forEach(p=> set.add(p.marcaId+'|'+p.colecao+'|'+p.ano));
  state.brandSales.forEach(s=> set.add(s.marcaId+'|'+s.colecao+'|'+s.ano));
  return [...set].map(key=>{
    const [marcaId, colecao, anoStr] = key.split('|');
    return { marcaId, colecao, ano: Number(anoStr) };
  });
}
export function otbSuggestion(marcaId, colecao, ano){
  const purchases = stockPurchasesFor(marcaId, colecao, ano);
  const compradoPecas = purchases.reduce((s,p)=> s+Number(p.pecas||0), 0);
  const compradoValor = purchases.reduce((s,p)=> s+Number(p.valor||0), 0);
  const sales = brandSalesFor(marcaId, colecao, ano);
  const vendidoPecas = sales.reduce((s,x)=> s+Number(x.pecas||0), 0);
  const vendidoValor = sales.reduce((s,x)=> s+Number(x.valor||0), 0);
  const estoquePecas = compradoPecas - vendidoPecas;
  const custoMedioPeca = compradoPecas>0 ? compradoValor/compradoPecas : 0;
  const sellThrough = compradoPecas>0 ? vendidoPecas/compradoPecas : null;

  let fator = null, faixa = null;
  if (sellThrough !== null){
    if (sellThrough >= 0.90){ fator = 1.10; faixa = 'Vendeu quase tudo — aumentar ~10%'; }
    else if (sellThrough >= 0.70){ fator = 1.00; faixa = 'Bom giro — manter volume'; }
    else if (sellThrough >= 0.50){ fator = 0.85; faixa = 'Giro médio — reduzir ~15%'; }
    else { fator = 0.60; faixa = 'Sobrou muito — reduzir bastante (~40%)'; }
  }
  const sugestaoPecas = fator!==null ? Math.round(compradoPecas*fator) : null;
  const sugestaoValor = sugestaoPecas!==null ? sugestaoPecas*custoMedioPeca : null;

  return { compradoPecas, compradoValor, vendidoPecas, vendidoValor, estoquePecas, custoMedioPeca, sellThrough, fator, faixa, sugestaoPecas, sugestaoValor };
}
