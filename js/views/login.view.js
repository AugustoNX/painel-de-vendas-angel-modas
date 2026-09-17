import { $, val } from '../ui/dom.js';
import { onClick } from '../ui/actions.js';
import { showToast } from '../ui/toast.js';
import { signIn, resetPassword, authMessage } from '../core/session.js';

let busy = false;

export function renderLogin(message = '') {
  const overlay = $('loginOverlay');
  overlay.classList.add('open');
  overlay.innerHTML = `
    <div class="modal modal-sm login-card">
      <div class="login-brand">ANGEL</div>
      <h3>Entrar no painel</h3>
      <p class="modal-hint">Use o email e a senha que a administração criou para você. Não existe cadastro aberto.</p>
      <div class="field">
        <label for="loginEmail">Email</label>
        <input id="loginEmail" type="email" autocomplete="username" placeholder="seu@email.com" data-enter-action="login">
      </div>
      <div class="field">
        <label for="loginPassword">Senha</label>
        <input id="loginPassword" type="password" autocomplete="current-password" placeholder="Sua senha" data-enter-action="login">
      </div>
      <div id="loginError" class="login-error">${message}</div>
      <button class="btn-primary login-submit" data-action="login">Entrar</button>
      <button class="link-btn" data-action="forgotPassword">Esqueci minha senha</button>
    </div>`;
}

export function hideLogin() {
  $('loginOverlay').classList.remove('open');
}

function setError(message) {
  const el = $('loginError');
  if (el) el.textContent = message;
}

onClick({
  async login() {
    if (busy) return;
    const email = val('loginEmail');
    const password = $('loginPassword')?.value || '';
    if (!email || !password) { setError('Preencha o email e a senha.'); return; }

    busy = true;
    setError('Entrando...');
    try {
      await signIn(email, password);
      // A tela some quando o observador de sessão confirmar o perfil.
    } catch (err) {
      setError(authMessage(err));
    } finally {
      busy = false;
    }
  },

  async forgotPassword() {
    const email = val('loginEmail');
    if (!email) { setError('Digite seu email primeiro para receber o link de redefinição.'); return; }
    try {
      await resetPassword(email);
      showToast('Link de redefinição enviado para ' + email);
      setError('Confira sua caixa de entrada.');
    } catch (err) {
      setError(authMessage(err));
    }
  }
});
