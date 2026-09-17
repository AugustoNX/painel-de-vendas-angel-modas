import { state } from '../state/store.js';
import { genId } from '../state/store.js';
import { normalizeName } from '../utils/format.js';

export const CLIENT_STATUS_TIERS = [
  { key:'ativa',    max:30,      label:'Cliente ativa',          badge:'Ativa',        action:'Atendimento normal e novidades.' },
  { key:'leve',      max:59,      label:'Atenção leve',           badge:'Atenção leve', action:'Interação nas redes, responder stories, enviar novidades quando fizer sentido.' },
  { key:'atencao',   max:89,      label:'Precisa de atenção',     badge:'Precisa de atenção', action:'Contato individual pelo WhatsApp.' },
  { key:'risco',     max:179,     label:'Alto risco de perda',    badge:'Alto risco',   action:'Conversa mais personalizada e convite para voltar.' },
  { key:'inativa',   max:Infinity, label:'Cliente inativa',       badge:'Inativa',      action:'Campanha específica de reativação com benefício.' },
];

export function clientTotal(clientId){
  return state.crmPurchases.filter(p=>p.clientId===clientId).reduce((s,p)=> s+Number(p.value||0), 0);
}
export function clientLastPurchase(clientId){
  const list = state.crmPurchases.filter(p=>p.clientId===clientId).sort((a,b)=> b.date.localeCompare(a.date));
  return list.length ? list[0] : null;
}
export function clientsForVendor(vendorIdx){
  return state.crmClients.filter(c=>c.ownerVendorIdx===vendorIdx);
}
export function pendingTransfersCount(){
  return state.crmTransfers.filter(t=>t.status==='pending').length;
}
export function daysSinceDateStr(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  const purchaseDate = new Date(y, m-1, d);
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((todayOnly - purchaseDate) / 86400000);
}
export function clientStatus(clientId){
  const last = clientLastPurchase(clientId);
  if (!last) return { key:'sem-compra', label:'Sem compras', badge:'Sem compras', action:'Nenhuma compra registrada ainda.', days:null };
  const days = daysSinceDateStr(last.date);
  const tier = CLIENT_STATUS_TIERS.find(t => days <= t.max);
  return Object.assign({ days }, tier);
}

/* ---- RFM: Frequência, Monetário, Segmentação ---- */
export function clientFrequency(clientId){
  return state.crmPurchases.filter(p=>p.clientId===clientId).length;
}
export function frequencyTier(freq){
  if (freq <= 1) return 'nova';
  if (freq <= 3) return 'ocasional';
  return 'frequente';
}
export function computeMonetaryTerciles(clientIds){
  const totals = clientIds.map(id=>clientTotal(id)).filter(v=>v>0).sort((a,b)=>a-b);
  if (!totals.length) return { low:0, high:0 };
  const lowIdx = Math.floor(totals.length/3);
  const highIdx = Math.floor(totals.length*2/3);
  return { low: totals[lowIdx] || totals[0], high: totals[highIdx] || totals[totals.length-1] };
}
export function monetaryTier(total, terciles){
  if (total <= 0) return 'baixo';
  if (total <= terciles.low) return 'baixo';
  if (total <= terciles.high) return 'medio';
  return 'alto';
}
export const RFM_SEGMENTS = {
  'sem-compra': { label:'Sem compras', color:'#9A9AA1' },
  'perdida':    { label:'Perdida', color:'#7A2E2E' },
  'risco-alto': { label:'Em risco (alto valor)', color:'#C0473B' },
  'risco':      { label:'Em risco', color:'#D9756B' },
  'atencao-alto': { label:'Atenção (alto valor)', color:'#E07B39' },
  'atencao':    { label:'Atenção', color:'#E8A165' },
  'campea':     { label:'Campeã', color:'#2C6B45' },
  'fiel':       { label:'Fiel', color:'#3E8C55' },
  'ocasional-alto': { label:'Grande compradora ocasional', color:'#2E7D9A' },
  'nova':       { label:'Nova cliente', color:'#6B7EC9' },
  'regular':    { label:'Regular', color:'#8A8FA3' },
};
export function clientRFMSegment(clientId, terciles){
  const status = clientStatus(clientId);
  if (status.key === 'sem-compra') return Object.assign({key:'sem-compra'}, RFM_SEGMENTS['sem-compra']);
  const freq = clientFrequency(clientId);
  const fTier = frequencyTier(freq);
  const total = clientTotal(clientId);
  const mTier = monetaryTier(total, terciles);
  const highValue = (fTier === 'frequente' || mTier === 'alto');

  let key;
  if (status.key === 'inativa') key = 'perdida';
  else if (status.key === 'risco') key = highValue ? 'risco-alto' : 'risco';
  else if (status.key === 'atencao') key = highValue ? 'atencao-alto' : 'atencao';
  else if (fTier === 'frequente' && mTier === 'alto') key = 'campea';
  else if (fTier === 'frequente') key = 'fiel';
  else if (mTier === 'alto') key = 'ocasional-alto';
  else if (fTier === 'nova') key = 'nova';
  else key = 'regular';

  return Object.assign({ key, freq, total, fTier, mTier }, RFM_SEGMENTS[key]);
}

export function clientPeriodComparison(clientId, windowDays){
  windowDays = windowDays || 90;
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const cutoff1 = new Date(todayOnly.getTime() - windowDays*86400000);
  const cutoff2 = new Date(todayOnly.getTime() - 2*windowDays*86400000);
  let current = 0, previous = 0;
  state.crmPurchases.filter(p=>p.clientId===clientId).forEach(p=>{
    const [y,m,d] = p.date.split('-').map(Number);
    const pd = new Date(y, m-1, d);
    if (pd > cutoff1) current += Number(p.value||0);
    else if (pd > cutoff2) previous += Number(p.value||0);
  });
  let trend = 'stable';
  if (previous === 0 && current > 0) trend = 'new';
  else if (previous > 0 && current > previous * 1.1) trend = 'up';
  else if (previous > 0 && current < previous * 0.9) trend = 'down';
  const pct = previous > 0 ? Math.round(((current-previous)/previous)*100) : null;
  return { current, previous, trend, pct, windowDays };
}

/* ---- Curva ABC ---- */
export function computeABC(clientsList){
  const withTotal = clientsList.map(c=>({ client:c, total: clientTotal(c.id) })).filter(x=>x.total>0);
  withTotal.sort((a,b)=> b.total - a.total);
  const grandTotal = withTotal.reduce((s,x)=>s+x.total,0);
  let cum = 0;
  return withTotal.map(x=>{
    cum += x.total;
    const cumPct = grandTotal>0 ? cum/grandTotal : 0;
    let classe = 'C';
    if (cumPct <= 0.8) classe = 'A';
    else if (cumPct <= 0.95) classe = 'B';
    return Object.assign({ classe, cumPct, pctOfTotal: grandTotal>0 ? x.total/grandTotal : 0 }, x);
  });
}

/* ---- Central de tarefas do dia ---- */
export const TASK_PRIORITY = { inativa:3, risco:2, atencao:1 };
export function dailyTaskList(clientsList){
  return clientsList
    .map(c=> ({ client:c, status: clientStatus(c.id) }))
    .filter(x => TASK_PRIORITY[x.status.key] !== undefined && !contactedToday(x.client.id))
    .sort((a,b)=>{
      const p = TASK_PRIORITY[b.status.key] - TASK_PRIORITY[a.status.key];
      if (p !== 0) return p;
      return clientTotal(b.client.id) - clientTotal(a.client.id);
    });
}

/* ---- Saúde da carteira por vendedora ---- */
export function vendorPortfolioHealth(vendorIdx){
  const list = clientsForVendor(vendorIdx);
  const total = list.length;
  if (!total) return { total:0, ativaCount:0, concernCount:0, ativaPct:0, concernPct:0, avgTicket:0 };
  let ativaCount=0, concernCount=0, sumTotal=0;
  list.forEach(c=>{
    const st = clientStatus(c.id);
    if (['ativa','leve'].includes(st.key)) ativaCount++;
    if (['atencao','risco','inativa'].includes(st.key)) concernCount++;
    sumTotal += clientTotal(c.id);
  });
  return {
    total, ativaCount, concernCount,
    ativaPct: Math.round(ativaCount/total*100),
    concernPct: Math.round(concernCount/total*100),
    avgTicket: sumTotal/total
  };
}

export function checkTransferNeeded(clientId){
  const client = state.crmClients.find(c=>c.id===clientId);
  if (!client) return;
  const list = state.crmPurchases.filter(p=>p.clientId===clientId).sort((a,b)=> b.date.localeCompare(a.date));
  if (list.length < 3) return;
  const last3 = list.slice(0,3);
  const sameVendor = last3.every(p=>p.vendorIdx===last3[0].vendorIdx);
  if (!sameVendor) return;
  const newOwner = last3[0].vendorIdx;
  if (newOwner === client.ownerVendorIdx) return;
  const already = state.crmTransfers.some(t=>t.clientId===clientId && t.status==='pending' && t.toVendorIdx===newOwner);
  if (already) return;
  state.crmTransfers.push({
    id: genId(), clientId, fromVendorIdx: client.ownerVendorIdx, toVendorIdx: newOwner,
    createdAt: new Date().toISOString(), status:'pending'
  });
}

export function clientNameById(id){
  const c = state.crmClients.find(x=>x.id===id);
  return c ? c.name : '(cliente removido)';
}
export function clientContacts(clientId){
  return state.crmContacts.filter(c=>c.clientId===clientId).sort((a,b)=> b.date.localeCompare(a.date));
}
export function contactedToday(clientId){
  const todayIso = new Date().toISOString().slice(0,10);
  return state.crmContacts.some(c=>c.clientId===clientId && c.date===todayIso);
}
export function findClientByName(name){
  const norm = normalizeName(name);
  return state.crmClients.find(c => normalizeName(c.name) === norm);
}
