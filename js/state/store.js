import { firebaseStorage as appStorage } from '../services/firebase-storage.service.js';
import { fetchGoalsData } from '../services/erp-goals.service.js';
import { showToast } from '../ui/toast.js';

export const state = {
  config: { names:["Geovana","Kelly","Maria Fernanda","Vendedora 4"], julyActive:[true,true,true,false], adminEmails:[], vendorEmails:["","","",""], extraNames:["Gustavo","Angela"] },
  monthInfo: {}, // metas por mês — vem da API do ERP, ver loadGoalsData()
  weekData: {},  // metas por semana — idem
  entries: [],
  currentMonth: "Julho",
  openVendorIdx: null,
  selectedTier: {},
  openExtraIdx: null,
  openPacerWeeks: new Set(),
  openVendorPacerWeeks: new Set(),
  storeCardCollapsed: false,
  currentView: "vendas",
  crmClients: [],
  crmPurchases: [],
  crmTransfers: [],
  crmContacts: [],
  marcas: [],
  stockPurchases: [],
  brandSales: [],
  comprasSubTab: 'clientes',
  currentUser: null, // { role:'gestor' } or { role:'vendor', vendorIdx:n }
  extraEntries: [],
  openCarteiras: new Set(),
  openClients: new Set(),
  crmSearchTerm: "",
  comprasSearchTerm: "",
  brandSalesParsed: [],
  importParsedTransactions: [], // {controle, dateStr, month, qtde, valor, colaborador}
  importUnknownNames: [],       // colaborador names with no mapping yet
  importCarteiraParsedTransactions: [],
};

export function genId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

export async function loadGoalsData(){
  try{
    const { monthInfo, weekData } = await fetchGoalsData();
    state.monthInfo = monthInfo || {};
    state.weekData = weekData || {};
  }catch(e){
    console.error('Erro ao carregar metas do ERP', e);
    showToast('Não consegui carregar as metas do ERP');
  }
}

export async function loadData(){
  try{
    const c = await appStorage.get('config');
    if (c && c.value) state.config = JSON.parse(c.value);
  }catch(e){ /* keep defaults */ }
  if (!state.config.extraNames) state.config.extraNames = ["Gustavo","Angela"];
  if (!state.config.vendorEmails) state.config.vendorEmails = state.config.names.map(()=>'');
  if (!state.config.reportNameMapping) state.config.reportNameMapping = {};
  if (!state.config.adminEmails || !state.config.adminEmails.length){
    // migração: versões antigas salvavam um único managerEmail em vez de uma lista
    const migrated = state.config.managerEmail ? [state.config.managerEmail] : [];
    state.config.adminEmails = migrated;
    if (migrated.length) await saveConfig();
  }
  try{
    const e = await appStorage.get('entries');
    if (e && e.value) state.entries = JSON.parse(e.value);
  }catch(e){ state.entries = []; }
  try{
    const ee = await appStorage.get('extra_entries');
    if (ee && ee.value) state.extraEntries = JSON.parse(ee.value);
  }catch(e){ state.extraEntries = []; }
  try{
    const cr = await appStorage.get('crm_data');
    if (cr && cr.value){
      const parsed = JSON.parse(cr.value);
      state.crmClients = parsed.clients || [];
      state.crmPurchases = parsed.purchases || [];
      state.crmTransfers = parsed.transfers || [];
      state.crmContacts = parsed.contacts || [];
    }
  }catch(e){ /* keep defaults */ }
  try{
    const es = await appStorage.get('estoque_data');
    if (es && es.value){
      const parsed = JSON.parse(es.value);
      state.marcas = parsed.marcas || [];
      state.stockPurchases = parsed.stockPurchases || [];
      state.brandSales = parsed.brandSales || [];
    }
  }catch(e){ /* keep defaults */ }
}
export async function saveConfig(){
  try{ await appStorage.set('config', JSON.stringify(state.config)); }catch(e){ showToast('Erro ao salvar configurações'); }
}
export async function saveEntries(){
  try{ await appStorage.set('entries', JSON.stringify(state.entries)); }catch(e){ showToast('Erro ao salvar lançamento'); }
}
export async function saveExtraEntries(){
  try{ await appStorage.set('extra_entries', JSON.stringify(state.extraEntries)); }catch(e){ showToast('Erro ao salvar lançamento'); }
}
export async function saveCrmData(){
  try{
    await appStorage.set('crm_data', JSON.stringify({ clients: state.crmClients, purchases: state.crmPurchases, transfers: state.crmTransfers, contacts: state.crmContacts }));
  }catch(e){ showToast('Erro ao salvar dados do CRM'); }
}
export async function saveEstoqueData(){
  try{
    await appStorage.set('estoque_data', JSON.stringify({ marcas: state.marcas, stockPurchases: state.stockPurchases, brandSales: state.brandSales }));
  }catch(e){ showToast('Erro ao salvar dados de estoque'); }
}
