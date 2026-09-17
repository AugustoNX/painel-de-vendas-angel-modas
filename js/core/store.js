import { VIEWS } from '../config/constants.js';

const today = new Date();

export const state = {
  // --- dados vindos do Firebase (mantidos em tempo real) ---
  vendors: [],
  users: [],
  settings: { reportNameMapping: {} },
  goals: {},            // { 'YYYY-MM': meta }
  sales: [],            // vendas do período selecionado
  clients: [],
  purchases: [],
  contacts: [],
  transfers: [],
  marcas: [],
  stockPurchases: [],
  brandSales: [],

  // --- período selecionado ---
  year: today.getFullYear(),
  month: today.getMonth(),   // 0-11

  // --- estado de interface ---
  view: VIEWS.VENDAS,
  loading: true,
  openVendorId: null,
  openPacerWeeks: new Set(),
  openVendorPacerWeeks: new Set(),
  selectedTier: {},
  storeCardCollapsed: false,
  openCarteiras: new Set(),
  openClients: new Set(),
  crmSearchTerm: '',
  comprasSearchTerm: '',
  comprasSubTab: 'clientes',

  // --- buffers de importação (não persistidos) ---
  importSales: [],
  importCarteira: [],
  importBrandSales: []
};

const listeners = new Set();
let frame = null;

/** Registra um observador do estado. Devolve a função para cancelar. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notifica os observadores no próximo quadro de animação. O agrupamento evita
 * que várias atualizações do Firebase chegando juntas causem vários re-renders.
 */
export function notify() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    listeners.forEach(listener => {
      try { listener(); } catch (err) { console.error('Erro ao renderizar', err); }
    });
  });
}

export function setState(patch) {
  Object.assign(state, patch);
  notify();
}

export function periodKey(year = state.year, month = state.month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function currentGoal() {
  return state.goals[periodKey()] || null;
}
