import { state } from './state/store.js';
import { showToast } from './ui/toast.js';
import {
  isGestor, submitLogin, logout
} from './features/auth.js';
import {
  closeAllVendors, addEntry, deleteEntry, toggleStoreCard, generateCommissionReportPDF,
  updateCampaign, selectTierForVendor, toggleVendor, deleteExtraEntry, toggleExtraVendor,
  addExtraEntry, toggleVendorPacerWeek, togglePacerWeek
} from './features/vendas-view.js';
import { openSettings, closeSettings, saveSettings } from './features/settings.js';
import { openUserModal, closeUserModal, updateUserRoleFields, saveNewUser } from './features/users.js';
import {
  renderCarteira, closeClientModal, saveClient, closePurchaseModal, savePurchase,
  closeContactModal, saveContact, updateCrmSearch, openClientModal, openContactModal,
  approveTransfer, rejectTransfer, toggleCarteira, toggleClient, openPurchaseModal,
  deleteClient, deletePurchase, deleteContact
} from './features/carteira-view.js';
import {
  renderCompras, switchComprasSubTab, updateComprasSearch, openStockPurchaseModal,
  closeStockPurchaseModal, saveStockPurchase, openBrandSalesImportModal,
  closeBrandSalesImportModal, handleBrandSalesImportFile, confirmBrandSalesImport
} from './features/compras-view.js';
import {
  openImportModal, closeImportModal, handleImportFile, confirmImport, updateImportMapping
} from './features/import-vendas.js';
import {
  openCarteiraImportModal, closeCarteiraImportModal, handleCarteiraImportFile,
  confirmCarteiraImport, renderCarteiraImportPreview
} from './features/import-carteira.js';

export function switchView(v){
  if (v === 'compras' && !isGestor()){
    showToast('Essa área é só para o Gestor');
    v = 'vendas';
  }
  state.currentView = v;
  document.getElementById('salesView').style.display = (v==='vendas') ? '' : 'none';
  document.getElementById('carteiraView').style.display = (v==='carteira') ? '' : 'none';
  document.getElementById('comprasView').style.display = (v==='compras') ? '' : 'none';
  document.getElementById('navBtnVendas').classList.toggle('active', v==='vendas');
  document.getElementById('navBtnCarteira').classList.toggle('active', v==='carteira');
  document.getElementById('navBtnCompras').classList.toggle('active', v==='compras');
  if (v === 'carteira') renderCarteira();
  if (v === 'compras') renderCompras();
}

Object.assign(window, {
  switchView,
  closeAllVendors, addEntry, deleteEntry, toggleStoreCard, generateCommissionReportPDF,
  updateCampaign, selectTierForVendor, toggleVendor, deleteExtraEntry, toggleExtraVendor,
  addExtraEntry, toggleVendorPacerWeek, togglePacerWeek,
  openSettings, closeSettings, saveSettings,
  openUserModal, closeUserModal, updateUserRoleFields, saveNewUser,
  closeClientModal, saveClient, closePurchaseModal, savePurchase,
  closeContactModal, saveContact, updateCrmSearch, openClientModal, openContactModal,
  approveTransfer, rejectTransfer, toggleCarteira, toggleClient, openPurchaseModal,
  deleteClient, deletePurchase, deleteContact,
  switchComprasSubTab, updateComprasSearch, openStockPurchaseModal,
  closeStockPurchaseModal, saveStockPurchase, openBrandSalesImportModal,
  closeBrandSalesImportModal, handleBrandSalesImportFile, confirmBrandSalesImport,
  openImportModal, closeImportModal, handleImportFile, confirmImport, updateImportMapping,
  openCarteiraImportModal, closeCarteiraImportModal, handleCarteiraImportFile,
  confirmCarteiraImport, renderCarteiraImportPreview,
  submitLogin, logout
});
