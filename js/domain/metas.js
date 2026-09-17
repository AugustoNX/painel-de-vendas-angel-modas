import { state, periodKey } from '../core/store.js';
import { TIER_ORDER, RATES, DEFAULT_TIER_MULTIPLIERS } from '../config/constants.js';
import { monthWeeks, splitByWeek } from './weeks.js';
import { isVendedora } from '../core/session.js';

/* ------------------------------------------------------------------ */
/* vendedoras                                                          */
/* ------------------------------------------------------------------ */

export function vendorById(vendorId) {
  return state.vendors.find(v => v.id === vendorId) || null;
}

export function vendorName(vendorId) {
  return vendorById(vendorId)?.name || '—';
}

/** Vendedoras com meta (não inclui os apoios, que só somam no total da loja). */
export function metaVendors() {
  return state.vendors.filter(v => !v.isExtra && v.active !== false);
}

export function extraVendors() {
  return state.vendors.filter(v => v.isExtra && v.active !== false);
}

/** Quem participa da meta do mês — o admin pode tirar alguém da escala. */
export function goalVendors(goal) {
  const all = metaVendors();
  if (!goal?.vendorIds?.length) return all;
  return all.filter(v => goal.vendorIds.includes(v.id));
}

/* ------------------------------------------------------------------ */
/* totais de venda                                                     */
/* ------------------------------------------------------------------ */

export function salesOf(vendorId) {
  return state.sales.filter(sale => sale.vendorId === vendorId);
}

export function vendorTotal(vendorId) {
  return salesOf(vendorId).reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
}

export function vendorPecas(vendorId) {
  return salesOf(vendorId).reduce((sum, sale) => sum + Number(sale.pecas || 0), 0);
}

export function vendorWeekTotal(vendorId, week) {
  return salesOf(vendorId)
    .filter(sale => {
      const day = Number((sale.date || '').split('-')[2]);
      return day >= week.start && day <= week.end;
    })
    .reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
}

export function teamTotal(goal) {
  return goalVendors(goal).reduce((sum, vendor) => sum + vendorTotal(vendor.id), 0);
}

export function extrasTotal() {
  return extraVendors().reduce((sum, vendor) => sum + vendorTotal(vendor.id), 0);
}

export function allPecas(goal) {
  return goalVendors(goal).reduce((sum, v) => sum + vendorPecas(v.id), 0)
    + extraVendors().reduce((sum, v) => sum + vendorPecas(v.id), 0);
}

/* ------------------------------------------------------------------ */
/* níveis e bonificação                                                */
/* ------------------------------------------------------------------ */

export function availableTiers(goal) {
  if (!goal?.niveis) return [];
  return TIER_ORDER.filter(tier => isNumber(goal.niveis[tier]));
}

function isNumber(value) {
  return value !== null && value !== undefined && value !== '' && !isNaN(value);
}

export function currentTier(goal, total) {
  let reached = null;
  availableTiers(goal).forEach(tier => {
    if (total >= Number(goal.niveis[tier])) reached = tier;
  });
  return reached;
}

export function nextTierInfo(goal, total) {
  for (const tier of availableTiers(goal)) {
    const target = Number(goal.niveis[tier]);
    if (total < target) return { tier, alvo: target, falta: target - total };
  }
  return null;
}

export function topTierTarget(goal) {
  const tiers = availableTiers(goal);
  return tiers.length ? Number(goal.niveis[tiers[tiers.length - 1]]) : 0;
}

/**
 * Bonificação é o valor FIXO da faixa atingida (meta do nível × taxa do nível),
 * não uma comissão proporcional ao que a vendedora vendeu.
 */
export function tierBonus(goal, tier) {
  if (!tier || !isNumber(goal?.niveis?.[tier])) return 0;
  return Number(goal.niveis[tier]) * RATES[tier];
}

export function vendorBonus(goal, vendorId) {
  return tierBonus(goal, currentTier(goal, vendorTotal(vendorId)));
}

/* ------------------------------------------------------------------ */
/* resumo da loja                                                      */
/* ------------------------------------------------------------------ */

export function storeSummary(goal) {
  const equipe = teamTotal(goal);
  const extras = extrasTotal();
  const campanha = Number(goal?.campanhaRealizado || 0);
  const realizado = equipe + extras + campanha;
  const objetivo = Number(goal?.obj || 0);
  const bonificacao = goalVendors(goal).reduce((sum, v) => sum + vendorBonus(goal, v.id), 0);

  return {
    objetivo,
    realizado,
    equipe,
    extras,
    campanha,
    bonificacao,
    pecas: allPecas(goal),
    falta: Math.max(objetivo - realizado, 0),
    excedente: Math.max(realizado - objetivo, 0),
    progresso: objetivo > 0 ? Math.min((realizado / objetivo) * 100, 100) : 0
  };
}

/* ------------------------------------------------------------------ */
/* balizador semanal                                                   */
/* ------------------------------------------------------------------ */

export function currentWeeks() {
  return monthWeeks(state.year, state.month);
}

/**
 * Metas semanais de um nível, em reais e em peças. As peças vêm do preço médio
 * por peça que o admin informa na meta do mês.
 */
export function weeklyTargets(goal, tier) {
  const weeks = currentWeeks();
  if (!isNumber(goal?.niveis?.[tier])) return weeks.map(week => ({ week, rs: null, pecas: null }));
  const total = Number(goal.niveis[tier]);
  const valores = splitByWeek(total, weeks);
  const preco = Number(goal.precoMedioPeca || 0);
  return weeks.map((week, idx) => ({
    week,
    rs: valores[idx],
    pecas: preco > 0 ? Math.round(valores[idx] / preco) : null
  }));
}

export function monthPecasTarget(goal, tier) {
  const preco = Number(goal?.precoMedioPeca || 0);
  if (!preco || !isNumber(goal?.niveis?.[tier])) return null;
  return Math.round(Number(goal.niveis[tier]) / preco);
}

/* ------------------------------------------------------------------ */
/* apoio ao admin ao definir a meta                                    */
/* ------------------------------------------------------------------ */

/**
 * Sugere as quatro faixas a partir do objetivo da loja: a meta-base é o
 * objetivo comissionável dividido pelas vendedoras da escala, e cada faixa é um
 * múltiplo dessa base. O admin pode ajustar qualquer valor depois.
 */
export function suggestTiers({ obj, campanhaAlvo = 0, vendorCount, multipliers = DEFAULT_TIER_MULTIPLIERS }) {
  const base = Math.max(Number(obj || 0) - Number(campanhaAlvo || 0), 0);
  if (!vendorCount || base <= 0) return { bronze: null, prata: null, ouro: null, diamante: null };
  const perVendor = base / vendorCount;
  return TIER_ORDER.reduce((acc, tier) => {
    acc[tier] = Math.round(perVendor * multipliers[tier] * 100) / 100;
    return acc;
  }, {});
}

/* ------------------------------------------------------------------ */
/* meses                                                               */
/* ------------------------------------------------------------------ */

/** Vendedora não abre mês futuro: o mês libera no primeiro dia útil dele. */
export function isMonthOpen(year, monthIdx) {
  if (!isVendedora()) return true;
  const first = new Date(year, monthIdx, 1);
  while (first.getDay() === 0) first.setDate(first.getDate() + 1);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()) >= first;
}

export function monthOpensAt(year, monthIdx) {
  const first = new Date(year, monthIdx, 1);
  while (first.getDay() === 0) first.setDate(first.getDate() + 1);
  return first;
}

export function goalFor(year, monthIdx) {
  return state.goals[periodKey(year, monthIdx)] || null;
}

/* ------------------------------------------------------------------ */
/* séries diárias para os gráficos                                     */
/* ------------------------------------------------------------------ */

export function daysInMonth() {
  return new Date(state.year, state.month + 1, 0).getDate();
}

/** Acumulado de venda dia a dia. Sem `vendorIds`, soma a loja inteira. */
export function cumulativeByDay(vendorIds = null) {
  const total = daysInMonth();
  const perDay = new Array(total).fill(0);

  state.sales.forEach(sale => {
    if (vendorIds && !vendorIds.includes(sale.vendorId)) return;
    const day = Number((sale.date || '').split('-')[2]);
    if (day >= 1 && day <= total) perDay[day - 1] += Number(sale.amount || 0);
  });

  let running = 0;
  return perDay.map(value => (running += value));
}

/**
 * Ritmo ideal acumulado: o alvo do mês distribuído pelo peso de cada semana e,
 * dentro da semana, igualmente entre os dias. É a linha que mostra se a equipe
 * está adiantada ou atrasada em relação à meta.
 */
export function idealCumulativeByDay(target) {
  const weeks = currentWeeks();
  const total = daysInMonth();
  const perWeek = splitByWeek(target, weeks);
  const perDay = new Array(total).fill(0);

  weeks.forEach((week, idx) => {
    const days = week.end - week.start + 1;
    for (let day = week.start; day <= week.end; day++) perDay[day - 1] = perWeek[idx] / days;
  });

  let running = 0;
  return perDay.map(value => (running += value));
}

/** Corta a série no dia de hoje — não faz sentido desenhar o futuro como zero. */
export function cutAtToday(series) {
  const now = new Date();
  if (now.getFullYear() !== state.year || now.getMonth() !== state.month) return series;
  return series.map((value, idx) => (idx < now.getDate() ? value : null));
}

/** Anos que já têm meta cadastrada, mais o ano atual. */
export function knownYears() {
  const years = new Set(Object.keys(state.goals).map(key => Number(key.split('-')[0])));
  years.add(new Date().getFullYear());
  years.add(state.year);
  return [...years].filter(Boolean).sort();
}
