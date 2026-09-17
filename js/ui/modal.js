import { esc } from './format.js';
import { displayMasked, maskAttrs, maskPlaceholder } from './mask.js';

const stack = [];

function root() {
  let el = document.getElementById('modalRoot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modalRoot';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Abre um modal montado em tempo de execução. O conteúdo e os botões ficam
 * junto da lógica que os usa, então o index.html não precisa conhecer cada tela.
 *
 * actions: [{ label, kind: 'primary' | 'secondary' | 'danger', onClick }]
 * onClick pode devolver `false` (ou uma Promise de `false`) para manter aberto.
 */
export function openModal({ title, subtitle = '', body = '', actions = [], size = 'md', onMount }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="modal-close" type="button" aria-label="Fechar">×</button>
      </div>
      ${subtitle ? `<p class="modal-hint">${subtitle}</p>` : ''}
      <div class="modal-body"></div>
      ${actions.length ? '<div class="modal-actions"></div>' : ''}
    </div>`;

  overlay.querySelector('.modal-body').innerHTML = body;

  const close = () => {
    overlay.remove();
    const idx = stack.indexOf(overlay);
    if (idx >= 0) stack.splice(idx, 1);
  };

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });

  const actionsWrap = overlay.querySelector('.modal-actions');
  actions.forEach(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn-${action.kind || 'secondary'}`;
    button.textContent = action.label;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await action.onClick?.({ close, body: overlay.querySelector('.modal-body') });
        if (result !== false) close();
      } finally {
        button.disabled = false;
      }
    });
    actionsWrap.appendChild(button);
  });

  root().appendChild(overlay);
  stack.push(overlay);
  onMount?.(overlay, { close });

  const firstField = overlay.querySelector('input:not([type=hidden]), select, textarea');
  firstField?.focus();

  return { close, el: overlay };
}

export function confirmModal({ title, message, confirmLabel = 'Confirmar', danger = true, onConfirm }) {
  return openModal({
    title,
    body: `<p class="modal-text">${message}</p>`,
    actions: [
      { label: 'Cancelar', kind: 'secondary' },
      { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => onConfirm() }
    ]
  });
}

export function closeAllModals() {
  [...stack].forEach(overlay => overlay.remove());
  stack.length = 0;
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && stack.length) stack[stack.length - 1].querySelector('.modal-close').click();
});

/** Campo de formulário padronizado para o corpo dos modais. */
export function field({ id, label, type = 'text', value = '', placeholder = '', hint = '', attrs = '', mask = '' }) {
  const inputType = mask === 'phone' ? 'tel' : mask ? 'text' : type;
  const shown = mask ? displayMasked(mask, value) : value;
  const ph = maskPlaceholder(mask, placeholder);
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <input id="${id}" type="${inputType}" value="${esc(shown)}" placeholder="${esc(ph)}" ${mask ? maskAttrs(mask) : ''} ${attrs}>
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </div>`;
}

export function selectField({ id, label, options, value, hint = '', attrs = '' }) {
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <select id="${id}" ${attrs}>
      ${options.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </div>`;
}
