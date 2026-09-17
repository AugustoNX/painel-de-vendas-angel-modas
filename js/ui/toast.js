let timer = null;

export function showToast(message, kind = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'toast show toast-' + kind;
  clearTimeout(timer);
  timer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

export const toastError = message => showToast(message, 'error');
export const toastOk = message => showToast(message, 'ok');
