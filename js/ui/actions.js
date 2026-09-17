/**
 * Ponte única entre o HTML renderizado e o código: em vez de expor funções no
 * `window` e escrever `onclick="..."` nos templates, os elementos declaram
 * `data-action` e um só ouvinte no documento despacha o evento certo.
 */
const handlers = { click: {}, input: {}, change: {}, submit: {} };

export function registerActions(type, map) {
  Object.assign(handlers[type], map);
}

export const onClick = map => registerActions('click', map);
export const onInput = map => registerActions('input', map);
export const onChange = map => registerActions('change', map);

function dispatch(type, event) {
  const attr = type === 'click' ? 'data-action' : `data-${type}-action`;
  const el = event.target.closest(`[${attr}]`);
  if (!el) return;
  const name = el.getAttribute(attr);
  const handler = handlers[type][name];
  if (!handler) return;
  if (type === 'click' && el.tagName !== 'INPUT') event.preventDefault();
  Promise.resolve(handler(el.dataset, el, event)).catch(err => {
    console.error(`Erro na ação "${name}"`, err);
  });
}

export function initActions() {
  document.addEventListener('click', event => dispatch('click', event));
  document.addEventListener('input', event => dispatch('input', event));
  document.addEventListener('change', event => dispatch('change', event));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const el = event.target.closest('[data-enter-action]');
    if (!el) return;
    const handler = handlers.click[el.getAttribute('data-enter-action')];
    if (handler) handler(el.dataset, el, event);
  });
}
