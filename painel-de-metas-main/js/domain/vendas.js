import { state } from '../state/store.js';
import { MONTHS, RATES, TIER_ORDER, MONTH_NUM } from '../config/constants.js';
import { isVendor } from '../features/auth.js';

// Bonificação por desempenho: valor FIXO da faixa atingida (meta do nível × taxa),
// não uma comissão proporcional ao que a vendedora vendeu de fato.
export function tierBonusAmount(month, tier){
  if (!tier) return 0;
  const val = state.monthInfo[month].niveis[tier];
  if (val === null || val === undefined) return 0;
  return val * RATES[tier];
}
export function vendorBonus(month, vendorIdx){
  const total = vendorTotal(month, vendorIdx);
  const tier = currentTier(month, total);
  return tierBonusAmount(month, tier);
}

export function getWeeksForMonth(month){
  const wd = state.weekData[month];
  return wd.semanas.map((periodo, idx)=>{
    const [startPart, endPart] = periodo.split(' a ');
    const start = Number(startPart.split('/')[0]);
    const end = Number(endPart.split('/')[0]);
    return { idx, start, end, label:`Semana ${idx+1}`, periodo };
  });
}

export function allVendorNames(){ return state.config.names; }

export function activeVendorIndexes(month){
  if (month === "Julho"){
    const idxs = [];
    state.config.julyActive.forEach((v,i)=>{ if(v) idxs.push(i); });
    return idxs.length === 3 ? idxs : [0,1,2];
  }
  return [0,1,2,3];
}

export function vendorTotal(month, idx){
  return state.entries.filter(e => e.month===month && e.vendorIdx===idx)
                .reduce((s,e)=> s + Number(e.amount||0), 0);
}
export function vendorPecasTotal(month, idx){
  return state.entries.filter(e => e.month===month && e.vendorIdx===idx)
                .reduce((s,e)=> s + Number(e.pecas||0), 0);
}
export function vendorWeekTotal(month, idx, week){
  return state.entries.filter(e=>{
    if (e.month!==month || e.vendorIdx!==idx) return false;
    const day = Number(e.date.split('-')[2]);
    return day >= week.start && day <= week.end;
  }).reduce((s,e)=> s + Number(e.amount||0), 0);
}
export function extraTotal(month, idx){
  return state.extraEntries.filter(e => e.month===month && e.extraIdx===idx)
                .reduce((s,e)=> s + Number(e.amount||0), 0);
}
export function extraPecasTotal(month, idx){
  return state.extraEntries.filter(e => e.month===month && e.extraIdx===idx)
                .reduce((s,e)=> s + Number(e.pecas||0), 0);
}
export function extraMonthSum(month){
  return (state.config.extraNames||[]).reduce((s,_,i)=> s + extraTotal(month, i), 0);
}
export function extraMonthPecasSum(month){
  return (state.config.extraNames||[]).reduce((s,_,i)=> s + extraPecasTotal(month, i), 0);
}
export function weeklyTargetRS(month, tier, week){
  const n = state.weekData[month].niveis[tier];
  if (!n) return null;
  return n.semanal[week.idx].rs;
}
export function weeklyTargetPecas(month, tier, week){
  const n = state.weekData[month].niveis[tier];
  if (!n) return null;
  return n.semanal[week.idx].pecas;
}
export function campaignActual(month){
  const key = 'campaignActual_' + month;
  const v = state.config[key];
  return v ? Number(v) : 0;
}

export function currentTier(month, total){
  const n = state.monthInfo[month].niveis;
  let reached = null;
  TIER_ORDER.forEach(t=>{
    if (n[t] !== null && n[t] !== undefined && total >= n[t]) reached = t;
  });
  return reached;
}
export function nextTierInfo(month, total){
  const n = state.monthInfo[month].niveis;
  for (const t of TIER_ORDER){
    if (n[t] !== null && n[t] !== undefined && total < n[t]){
      return { tier:t, falta: n[t]-total, alvo:n[t] };
    }
  }
  return null; // superou todos os níveis disponíveis no mês
}
export function topTierTarget(month){
  const n = state.monthInfo[month].niveis;
  for (let i=TIER_ORDER.length-1;i>=0;i--){
    const t = TIER_ORDER[i];
    if (n[t] !== null && n[t] !== undefined) return n[t];
  }
  return n.bronze;
}

export function getFirstBusinessDay(month){
  const monthIdx = Number(MONTH_NUM[month]) - 1;
  let d = new Date(2026, monthIdx, 1);
  while (d.getDay() === 0){ d.setDate(d.getDate()+1); } // skip Sunday
  return d;
}
export function isMonthUnlocked(month){
  if (!isVendor()) return true;
  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDateOnly >= getFirstBusinessDay(month);
}
export function latestUnlockedMonth(){
  let result = MONTHS[0];
  MONTHS.forEach(m=>{ if (isMonthUnlocked(m)) result = m; });
  return result;
}
