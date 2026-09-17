import { state } from '../core/store.js';
import { normalizeName } from '../ui/format.js';

export const CLIENT_STATUS_TIERS = [
  { key: 'ativa', max: 30, label: 'Cliente ativa', badge: 'Ativa', action: 'Atendimento normal e novidades.' },
  { key: 'leve', max: 59, label: 'Atenção leve', badge: 'Atenção leve', action: 'Interação nas redes, responder stories, enviar novidades quando fizer sentido.' },
  { key: 'atencao', max: 89, label: 'Precisa de atenção', badge: 'Precisa de atenção', action: 'Contato individual pelo WhatsApp.' },
  { key: 'risco', max: 179, label: 'Alto risco de perda', badge: 'Alto risco', action: 'Conversa mais personalizada e convite para voltar.' },
  { key: 'inativa', max: Infinity, label: 'Cliente inativa', badge: 'Inativa', action: 'Campanha específica de reativação com benefício.' }
];

export const RFM_SEGMENTS = {
  'sem-compra': { label: 'Sem compras', color: '#9A9AA1' },
  perdida: { label: 'Perdida', color: '#7A2E2E' },
  'risco-alto': { label: 'Em risco (alto valor)', color: '#C0473B' },
  risco: { label: 'Em risco', color: '#D9756B' },
  'atencao-alto': { label: 'Atenção (alto valor)', color: '#E07B39' },
  atencao: { label: 'Atenção', color: '#E8A165' },
  campea: { label: 'Campeã', color: '#2C6B45' },
  fiel: { label: 'Fiel', color: '#3E8C55' },
  'ocasional-alto': { label: 'Grande compradora ocasional', color: '#2E7D9A' },
  nova: { label: 'Nova cliente', color: '#6B7EC9' },
  regular: { label: 'Regular', color: '#8A8FA3' }
};

/* ---------------- consultas básicas ---------------- */

export function clientById(clientId) {
  return state.clients.find(client => client.id === clientId) || null;
}

export function clientName(clientId) {
  return clientById(clientId)?.name || '(cliente removida)';
}

export function purchasesOf(clientId) {
  return state.purchases
    .filter(purchase => purchase.clientId === clientId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function clientTotal(clientId) {
  return purchasesOf(clientId).reduce((sum, purchase) => sum + Number(purchase.value || 0), 0);
}

export function clientFrequency(clientId) {
  return purchasesOf(clientId).length;
}

export function lastPurchase(clientId) {
  return purchasesOf(clientId)[0] || null;
}

export function clientsOf(vendorId) {
  return state.clients.filter(client => client.ownerVendorId === vendorId);
}

export function contactsOf(clientId) {
  return state.contacts
    .filter(contact => contact.clientId === clientId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function findClientByName(name) {
  const key = normalizeName(name);
  return state.clients.find(client => (client.nameKey || normalizeName(client.name)) === key) || null;
}

export function pendingTransfers() {
  return state.transfers.filter(transfer => transfer.status === 'pending');
}

/* ---------------- status por recência ---------------- */

export function daysSince(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - then) / 86400000);
}

export function clientStatus(clientId) {
  const last = lastPurchase(clientId);
  if (!last) {
    return { key: 'sem-compra', label: 'Sem compras', badge: 'Sem compras', action: 'Nenhuma compra registrada ainda.', days: null };
  }
  const days = daysSince(last.date);
  return { days, ...CLIENT_STATUS_TIERS.find(tier => days <= tier.max) };
}

export function contactedToday(clientId) {
  const today = new Date().toISOString().slice(0, 10);
  return state.contacts.some(contact => contact.clientId === clientId && contact.date === today);
}

/* ---------------- RFM ---------------- */

export function monetaryTerciles(clientIds) {
  const totals = clientIds.map(clientTotal).filter(total => total > 0).sort((a, b) => a - b);
  if (!totals.length) return { low: 0, high: 0 };
  return {
    low: totals[Math.floor(totals.length / 3)] || totals[0],
    high: totals[Math.floor((totals.length * 2) / 3)] || totals[totals.length - 1]
  };
}

function frequencyTier(freq) {
  if (freq <= 1) return 'nova';
  if (freq <= 3) return 'ocasional';
  return 'frequente';
}

function monetaryTier(total, terciles) {
  if (total <= 0 || total <= terciles.low) return 'baixo';
  return total <= terciles.high ? 'medio' : 'alto';
}

export function clientSegment(clientId, terciles) {
  const status = clientStatus(clientId);
  if (status.key === 'sem-compra') return { key: 'sem-compra', freq: 0, total: 0, ...RFM_SEGMENTS['sem-compra'] };

  const freq = clientFrequency(clientId);
  const fTier = frequencyTier(freq);
  const total = clientTotal(clientId);
  const mTier = monetaryTier(total, terciles);
  const highValue = fTier === 'frequente' || mTier === 'alto';

  let key;
  if (status.key === 'inativa') key = 'perdida';
  else if (status.key === 'risco') key = highValue ? 'risco-alto' : 'risco';
  else if (status.key === 'atencao') key = highValue ? 'atencao-alto' : 'atencao';
  else if (fTier === 'frequente' && mTier === 'alto') key = 'campea';
  else if (fTier === 'frequente') key = 'fiel';
  else if (mTier === 'alto') key = 'ocasional-alto';
  else if (fTier === 'nova') key = 'nova';
  else key = 'regular';

  return { key, freq, total, fTier, mTier, ...RFM_SEGMENTS[key] };
}

export function periodComparison(clientId, windowDays = 90) {
  const now = new Date();
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff1 = new Date(todayOnly.getTime() - windowDays * 86400000);
  const cutoff2 = new Date(todayOnly.getTime() - 2 * windowDays * 86400000);

  let current = 0;
  let previous = 0;
  purchasesOf(clientId).forEach(purchase => {
    const [y, m, d] = purchase.date.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date > cutoff1) current += Number(purchase.value || 0);
    else if (date > cutoff2) previous += Number(purchase.value || 0);
  });

  let trend = 'stable';
  if (previous === 0 && current > 0) trend = 'new';
  else if (previous > 0 && current > previous * 1.1) trend = 'up';
  else if (previous > 0 && current < previous * 0.9) trend = 'down';

  return {
    current, previous, trend, windowDays,
    pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
  };
}

/* ---------------- curva ABC ---------------- */

export function computeABC(clients) {
  const ranked = clients
    .map(client => ({ client, total: clientTotal(client.id) }))
    .filter(row => row.total > 0)
    .sort((a, b) => b.total - a.total);

  const grandTotal = ranked.reduce((sum, row) => sum + row.total, 0);
  let cumulative = 0;

  return ranked.map(row => {
    cumulative += row.total;
    const cumPct = grandTotal > 0 ? cumulative / grandTotal : 0;
    const classe = cumPct <= 0.8 ? 'A' : cumPct <= 0.95 ? 'B' : 'C';
    return { ...row, classe, cumPct, pctOfTotal: grandTotal > 0 ? row.total / grandTotal : 0 };
  });
}

/* ---------------- tarefas e saúde da carteira ---------------- */

const TASK_PRIORITY = { inativa: 3, risco: 2, atencao: 1 };

export function dailyTasks(clients) {
  return clients
    .map(client => ({ client, status: clientStatus(client.id) }))
    .filter(row => TASK_PRIORITY[row.status.key] !== undefined && !contactedToday(row.client.id))
    .sort((a, b) =>
      (TASK_PRIORITY[b.status.key] - TASK_PRIORITY[a.status.key]) ||
      (clientTotal(b.client.id) - clientTotal(a.client.id)));
}

export function portfolioHealth(vendorId) {
  const clients = clientsOf(vendorId);
  if (!clients.length) return { total: 0, ativaCount: 0, concernCount: 0, ativaPct: 0, concernPct: 0, avgTicket: 0, revenue: 0 };

  let ativaCount = 0;
  let concernCount = 0;
  let revenue = 0;

  clients.forEach(client => {
    const status = clientStatus(client.id);
    if (['ativa', 'leve'].includes(status.key)) ativaCount++;
    if (['atencao', 'risco', 'inativa'].includes(status.key)) concernCount++;
    revenue += clientTotal(client.id);
  });

  return {
    total: clients.length,
    ativaCount,
    concernCount,
    revenue,
    ativaPct: Math.round((ativaCount / clients.length) * 100),
    concernPct: Math.round((concernCount / clients.length) * 100),
    avgTicket: revenue / clients.length
  };
}

/**
 * Se as últimas 3 compras de uma cliente foram com outra vendedora, a carteira
 * provavelmente mudou de dona — isso vira uma solicitação para o admin decidir.
 */
export function transferSuggestion(clientId) {
  const client = clientById(clientId);
  if (!client) return null;

  const last3 = purchasesOf(clientId).slice(0, 3);
  if (last3.length < 3) return null;

  const newOwner = last3[0].vendorId;
  if (!newOwner || !last3.every(purchase => purchase.vendorId === newOwner)) return null;
  if (newOwner === client.ownerVendorId) return null;

  const alreadyOpen = state.transfers.some(transfer =>
    transfer.clientId === clientId && transfer.status === 'pending' && transfer.toVendorId === newOwner);
  if (alreadyOpen) return null;

  return { clientId, fromVendorId: client.ownerVendorId, toVendorId: newOwner };
}
