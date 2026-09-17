import { VIEWS, MONTH_NAMES } from './config/constants.js';
import { state, setState, subscribe, periodKey } from './core/store.js';
import { watchSession, session, isAdmin, isVendedora, signOut } from './core/session.js';
import { startSync, stopSync, syncSalesPeriod } from './data/sync.js';
import { initActions, onClick } from './ui/actions.js';
import { closeAllModals } from './ui/modal.js';
import { $, setHtml, show } from './ui/dom.js';
import { esc } from './ui/format.js';
import { showToast } from './ui/toast.js';
import { renderLogin, hideLogin } from './views/login.view.js';
import { renderVendas } from './views/vendas.view.js';
import { renderCarteira } from './views/carteira.view.js';
import { renderCompras } from './views/compras.view.js';
import { renderEquipe } from './views/equipe.view.js';
import { pendingTransfers } from './domain/crm.js';
import { vendorName } from './domain/metas.js';

const NAV = [
  { view: VIEWS.VENDAS, icon: '📊', label: 'Objetivos e Vendas', adminOnly: false },
  { view: VIEWS.CARTEIRA, icon: '👥', label: 'Gestão de Carteira', adminOnly: false },
  { view: VIEWS.COMPRAS, icon: '🛍️', label: 'Gestão de Compras', adminOnly: true },
  { view: VIEWS.EQUIPE, icon: '⚙️', label: 'Equipe e Acessos', adminOnly: true }
];

let lastPeriod = null;

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */

function render() {
  if (!session.profile) return;

  const key = periodKey();
  if (key !== lastPeriod) {
    lastPeriod = key;
    syncSalesPeriod();
  }

  renderHeader();
  renderNav();

  show('viewVendas', state.view === VIEWS.VENDAS);
  show('viewCarteira', state.view === VIEWS.CARTEIRA);
  show('viewCompras', state.view === VIEWS.COMPRAS);
  show('viewEquipe', state.view === VIEWS.EQUIPE);

  if (state.view === VIEWS.VENDAS) renderVendas();
  if (state.view === VIEWS.CARTEIRA) renderCarteira();
  if (state.view === VIEWS.COMPRAS) renderCompras();
  if (state.view === VIEWS.EQUIPE) renderEquipe();
}

function renderHeader() {
  const profile = session.profile;
  const roleLabel = isAdmin()
    ? 'Administração'
    : `Vendedora · ${esc(vendorName(profile.vendorId))}`;

  setHtml('sessionBox', `
    <div class="session-info">
      <span class="session-name">${esc(profile.name || profile.email)}</span>
      <span class="session-role">${roleLabel}</span>
    </div>
    <button class="logout-btn" data-action="logout">Sair</button>`);

  setHtml('subtitle', isAdmin()
    ? `Painel de metas · ${MONTH_NAMES[state.month]}/${state.year} · lançamento de vendas, carteira de clientes e compras`
    : `Seus resultados de ${MONTH_NAMES[state.month]}/${state.year} e a sua carteira de clientes`);
}

function renderNav() {
  const pending = pendingTransfers().length;

  setHtml('sidebarNav', NAV
    .filter(item => !item.adminOnly || isAdmin())
    .map(item => `<button class="${state.view === item.view ? 'active' : ''}" data-action="goTo" data-view="${item.view}">
      ${item.icon} <span>${item.label}</span>
      ${item.view === VIEWS.CARTEIRA && pending ? `<span class="view-badge">${pending}</span>` : ''}
    </button>`)
    .join(''));
}

/* ------------------------------------------------------------------ */
/* sessão                                                              */
/* ------------------------------------------------------------------ */

function onSessionChange(profile, reason) {
  closeAllModals();

  if (!profile) {
    stopSync();
    lastPeriod = null;
    show('appShell', false);
    renderLogin(reason === 'sem-perfil'
      ? 'Sua conta existe, mas ainda não tem acesso liberado. Peça para a administração cadastrar você.'
      : reason === 'inativo'
        ? 'Seu acesso está bloqueado. Fale com a administração.'
        : '');
    return;
  }

  hideLogin();
  show('appShell', true);

  // Vendedora não abre mês futuro: cai no mês corrente ao entrar.
  if (isVendedora()) {
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();
  }
  if (!isAdmin() && state.view !== VIEWS.CARTEIRA) state.view = VIEWS.VENDAS;

  startSync();
  render();
}

/* ------------------------------------------------------------------ */
/* ações globais                                                       */
/* ------------------------------------------------------------------ */

onClick({
  goTo({ view }) {
    if ((view === VIEWS.COMPRAS || view === VIEWS.EQUIPE) && !isAdmin()) {
      showToast('Essa área é só da administração');
      return;
    }
    setState({ view });
  },

  async logout() {
    await signOut();
    showToast('Você saiu do painel');
  }
});

/* ------------------------------------------------------------------ */
/* bootstrap                                                           */
/* ------------------------------------------------------------------ */

initActions();
subscribe(render);
renderLogin();
watchSession(onSessionChange);
