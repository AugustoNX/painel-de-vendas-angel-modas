import { state, setState, periodKey } from '../core/store.js';
import { isAdmin } from '../core/session.js';
import { watchVendors } from './vendors.repo.js';
import { watchUsers } from './users.repo.js';
import { watchSettings } from './settings.repo.js';
import { watchGoals } from './goals.repo.js';
import { watchSales } from './sales.repo.js';
import { watchClients, watchPurchases, watchContacts, watchTransfers } from './crm.repo.js';
import { watchMarcas, watchStockPurchases, watchBrandSales } from './stock.repo.js';

let globalUnsubs = [];
let salesUnsub = null;
let salesPeriod = null;

/**
 * Liga todas as escutas em tempo real. A partir daqui, qualquer alteração feita
 * por qualquer pessoa aparece no painel de todo mundo sem recarregar a página.
 */
export function startSync() {
  stopSync();

  globalUnsubs = [
    watchVendors(vendors => setState({ vendors })),
    watchSettings(settings => setState({ settings })),
    watchGoals(goals => setState({ goals })),
    watchClients(clients => setState({ clients })),
    watchPurchases(purchases => setState({ purchases })),
    watchContacts(contacts => setState({ contacts })),
    watchTransfers(transfers => setState({ transfers }))
  ];

  if (isAdmin()) {
    globalUnsubs.push(
      watchUsers(users => setState({ users })),
      watchMarcas(marcas => setState({ marcas })),
      watchStockPurchases(stockPurchases => setState({ stockPurchases })),
      watchBrandSales(brandSales => setState({ brandSales }))
    );
  }

  syncSalesPeriod();
  setState({ loading: false });
}

/** Troca a escuta de vendas quando o mês selecionado muda. */
export function syncSalesPeriod() {
  const key = periodKey();
  if (salesPeriod === key && salesUnsub) return;
  if (salesUnsub) salesUnsub();
  salesPeriod = key;
  setState({ sales: [] });
  salesUnsub = watchSales(key, sales => setState({ sales }));
}

export function stopSync() {
  globalUnsubs.forEach(unsub => unsub());
  globalUnsubs = [];
  if (salesUnsub) salesUnsub();
  salesUnsub = null;
  salesPeriod = null;
  Object.assign(state, {
    vendors: [], users: [], goals: {}, sales: [],
    clients: [], purchases: [], contacts: [], transfers: [],
    marcas: [], stockPurchases: [], brandSales: []
  });
}
