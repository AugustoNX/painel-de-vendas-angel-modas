import { state, periodKey } from '../core/store.js';
import { TIER_ORDER, TIER_LABEL, RATES, DEFAULT_TIER_MULTIPLIERS } from '../config/constants.js';
import { monthWeeks, splitByWeek, withWeights } from './weeks.js';
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

/** Data da venda mais recente no mês em exibição. */
export function lastSaleDate(vendorId) {
  return salesOf(vendorId)
    .map(sale => sale.date)
    .filter(Boolean)
    .sort()
    .pop() || null;
}

/**
 * O dia até onde faz sentido contar. Num mês já fechado a referência é o último
 * dia dele, senão todo mês antigo apareceria como "300 dias sem vender".
 */
function referenceDay() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthEnd = new Date(state.year, state.month + 1, 0);
  return today < monthEnd ? today : monthEnd;
}

/** Dias corridos desde a última venda. `null` quando não vendeu nada no mês. */
export function daysWithoutSelling(vendorId) {
  const last = lastSaleDate(vendorId);
  if (!last) return null;
  const [year, month, day] = last.split('-').map(Number);
  const diff = referenceDay() - new Date(year, month - 1, day);
  return Math.max(0, Math.round(diff / 86400000));
}

/** Quantos dias diferentes do mês tiveram venda. */
export function sellingDays(vendorId) {
  return new Set(salesOf(vendorId).map(sale => sale.date).filter(Boolean)).size;
}

/** Média por dia efetivamente trabalhado, não por dia do calendário. */
export function averagePerSellingDay(vendorId) {
  const days = sellingDays(vendorId);
  return days ? vendorTotal(vendorId) / days : 0;
}

/** Dias que ainda restam no mês em exibição, contando hoje. */
export function daysLeftInMonth() {
  const now = new Date();
  if (now.getFullYear() !== state.year || now.getMonth() !== state.month) return 0;
  return daysInMonth() - now.getDate() + 1;
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

/**
 * Um nível vale no mês quando está ligado e tem valor. Metas antigas não têm
 * `niveisAtivos`: nelas vale todo nível preenchido (deixar em branco desligava).
 */
export function isTierOn(goal, tier) {
  if (goal?.niveisAtivos) return goal.niveisAtivos[tier] !== false;
  if (goal?.niveis) return isNumber(goal.niveis[tier]);
  return true;
}

/**
 * Valor da meta do nível no mês, ou null quando o nível não vale. Com
 * `vendorId`, é a meta daquela vendedora: proporcional aos dias que ela trabalha.
 */
export function tierValue(goal, tier, vendorId = null) {
  const value = goal?.niveis?.[tier];
  if (!isTierOn(goal, tier) || !isNumber(value)) return null;
  const share = vendorShare(goal, vendorId);
  return share === 1 ? Number(value) : Math.round(Number(value) * share * 100) / 100;
}

/** Percentual de bonificação do nível no mês, em fração (0.015 = 1,5%). */
export function tierRate(goal, tier) {
  const rate = goal?.taxas?.[tier];
  return isNumber(rate) ? Number(rate) : RATES[tier];
}

export function availableTiers(goal) {
  return TIER_ORDER.filter(tier => tierValue(goal, tier) !== null);
}

function isNumber(value) {
  return value !== null && value !== undefined && value !== '' && !isNaN(value);
}

export function currentTier(goal, total, vendorId = null) {
  let reached = null;
  availableTiers(goal).forEach(tier => {
    if (total >= tierValue(goal, tier, vendorId)) reached = tier;
  });
  return reached;
}

export function nextTierInfo(goal, total, vendorId = null) {
  for (const tier of availableTiers(goal)) {
    const target = tierValue(goal, tier, vendorId);
    if (total < target) return { tier, alvo: target, falta: target - total };
  }
  return null;
}

export function topTierTarget(goal, vendorId = null) {
  const tiers = availableTiers(goal);
  return tiers.length ? tierValue(goal, tiers[tiers.length - 1], vendorId) : 0;
}

/**
 * Bonificação é o valor FIXO da faixa atingida (meta do nível × taxa do nível),
 * não uma comissão proporcional ao que a vendedora vendeu. Quem trabalha só
 * parte do mês tem a meta e, por consequência, a bonificação proporcionais.
 */
export function tierBonus(goal, tier, vendorId = null) {
  const value = tier ? tierValue(goal, tier, vendorId) : null;
  return value === null ? 0 : value * tierRate(goal, tier);
}

export function vendorBonus(goal, vendorId) {
  return tierBonus(goal, currentTier(goal, vendorTotal(vendorId), vendorId), vendorId);
}

/* ------------------------------------------------------------------ */
/* dias trabalhados                                                    */
/* ------------------------------------------------------------------ */

/** Ano e mês (0-11) a que a meta pertence. */
function goalPeriod(goal) {
  const [year, month] = String(goal?.periodKey || '').split('-').map(Number);
  return year && month ? { year, month: month - 1 } : { year: state.year, month: state.month };
}

/** Semanas do mês da meta, já com os pesos que o admin definiu. */
export function goalWeeks(goal) {
  const { year, month } = goalPeriod(goal);
  return withWeights(monthWeeks(year, month), goal?.pesosSemanas);
}

export function goalDaysInMonth(goal) {
  const { year, month } = goalPeriod(goal);
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Dias do mês em que a vendedora trabalha, ou null quando é o mês inteiro
 * (o padrão: quem não tem dias marcados trabalha todos os dias).
 */
export function workedDays(goal, vendorId) {
  const days = vendorId ? goal?.diasTrabalhados?.[vendorId] : null;
  if (!days) return null;
  const list = (Array.isArray(days) ? days : Object.values(days)).map(Number).filter(Boolean);
  return list.length >= goalDaysInMonth(goal) ? null : list;
}

/**
 * Parte do mês que a vendedora trabalha, de 0 a 1. Cada dia vale o peso da sua
 * semana dividido pelos dias da semana, então folgar numa semana de peso 2 pesa
 * mais que folgar numa semana de peso 1 — o mesmo critério do balizador.
 */
export function vendorShare(goal, vendorId) {
  const days = workedDays(goal, vendorId);
  if (!days) return 1;
  const worked = new Set(days);
  let total = 0;
  let mine = 0;
  goalWeeks(goal).forEach(week => {
    const perDay = week.weight / (week.end - week.start + 1);
    for (let day = week.start; day <= week.end; day++) {
      total += perDay;
      if (worked.has(day)) mine += perDay;
    }
  });
  return total > 0 ? mine / total : 1;
}

/**
 * Quantas vendedoras "de mês inteiro" a escala equivale: duas que trabalham
 * metade do mês contam como uma. É o divisor usado ao sugerir as faixas.
 */
export function equivalentVendors(goal, vendorIds) {
  return vendorIds.reduce((sum, vendorId) => sum + vendorShare(goal, vendorId), 0);
}

/** "Trabalha 15 de 31 dias · metas a 48%", ou null para quem trabalha o mês todo. */
export function workedDaysNote(goal, vendorId) {
  const days = workedDays(goal, vendorId);
  if (!days) return null;
  const share = Math.round(vendorShare(goal, vendorId) * 100);
  return `Trabalha ${days.length} de ${goalDaysInMonth(goal)} dias · metas proporcionais (${share}%)`;
}

/** Dias trabalhados que ainda restam no mês, contando hoje. */
export function workDaysLeft(goal, vendorId) {
  const left = daysLeftInMonth();
  const days = workedDays(goal, vendorId);
  if (!days || !left) return left;
  const today = daysInMonth() - left + 1;
  return days.filter(day => day >= today).length;
}

/** Quantos dias de cada semana a vendedora trabalha. */
function workedDaysInWeek(goal, vendorId, week) {
  const days = workedDays(goal, vendorId);
  const length = week.end - week.start + 1;
  if (!days) return length;
  return days.filter(day => day >= week.start && day <= week.end).length;
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

/** Semanas do mês em exibição, com os pesos da meta (quando houver). */
export function currentWeeks(goal = null) {
  return goal ? goalWeeks(goal) : monthWeeks(state.year, state.month);
}

/**
 * Metas semanais de um nível, em reais e em peças. As peças vêm do preço médio
 * por peça que o admin informa na meta do mês. Com `vendorId`, cada semana vale
 * só pelos dias que a vendedora trabalha nela (`worked` de `days`).
 */
export function weeklyTargets(goal, tier, vendorId = null) {
  const weeks = goalWeeks(goal);
  const total = tierValue(goal, tier);
  if (total === null) return weeks.map(week => ({ week, rs: null, pecas: null, worked: 0, days: 0 }));
  const valores = splitByWeek(total, weeks);
  const preco = Number(goal.precoMedioPeca || 0);
  return weeks.map((week, idx) => {
    const days = week.end - week.start + 1;
    const worked = workedDaysInWeek(goal, vendorId, week);
    const rs = worked === days ? valores[idx] : Math.round(valores[idx] * worked / days);
    return { week, rs, pecas: preco > 0 ? Math.round(rs / preco) : null, worked, days };
  });
}

export function monthPecasTarget(goal, tier, vendorId = null) {
  const preco = Number(goal?.precoMedioPeca || 0);
  const value = tierValue(goal, tier, vendorId);
  if (!preco || value === null) return null;
  return Math.round(value / preco);
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
  return publishedGoal(state.goals[periodKey(year, monthIdx)]);
}

/**
 * A aba Equipe pode salvar a escala e os níveis de um mês antes do objetivo da
 * loja existir. Enquanto não houver objetivo, o mês continua "sem meta".
 */
export function publishedGoal(goal) {
  return goal && Number(goal.obj) > 0 ? goal : null;
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
export function idealCumulativeByDay(goal, target, vendorId = null) {
  const weeks = currentWeeks(goal);
  const total = daysInMonth();
  const days = workedDays(goal, vendorId);
  const worked = day => !days || days.includes(day);

  // Peso de cada dia (o da semana dividido pelos dias dela); folga pesa zero.
  const weights = new Array(total).fill(0);
  weeks.forEach(week => {
    const perDay = week.weight / (week.end - week.start + 1);
    for (let day = week.start; day <= week.end; day++) weights[day - 1] = worked(day) ? perDay : 0;
  });
  const sum = weights.reduce((acc, value) => acc + value, 0);

  let running = 0;
  return weights.map(weight => (running += sum ? target * weight / sum : 0));
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

/** Rótulo de quem ainda não atingiu nenhum nível, ex.: "Abaixo do Prata". */
export function belowFirstTierLabel(goal) {
  const first = availableTiers(goal)[0];
  return `Abaixo do ${TIER_LABEL[first || 'bronze']}`;
}
