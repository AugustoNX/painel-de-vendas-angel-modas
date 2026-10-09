import { TIER_ORDER, TIER_LABEL } from '../../config/constants.js';
import { metaVendors, isTierOn, tierRate, vendorShare, workedDays } from '../../domain/metas.js';
import { monthWeeks } from '../../domain/weeks.js';
import { displayMasked, readNumber, parseNumber, setMasked } from '../../ui/mask.js';
import { esc } from '../../ui/format.js';
import { onClick, onChange } from '../../ui/actions.js';

/**
 * Configuração de um mês que aparece em dois lugares — no modal "Editar meta" e
 * na aba Equipe: quem está na escala e em quais dias, quais níveis valem, o
 * percentual de bonificação de cada um e o peso de cada semana. Os campos usam
 * classes (não ids) porque o modal pode abrir por cima da aba Equipe; toda
 * leitura parte de um container com `data-month-config="AAAA-MM"`.
 */

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Vendedora com o calendário aberto. Fica fora do DOM porque a aba Equipe é
// redesenhada a cada atualização do banco.
let openDaysVendorId = null;

function periodOf(periodKey) {
  const [year, month] = periodKey.split('-').map(Number);
  return { year, month: month - 1, days: new Date(year, month, 0).getDate() };
}

/** Atributo que marca o container da configuração; vai no elemento que envolve os campos. */
export function monthConfigAttr(periodKey) {
  return `data-month-config="${periodKey}"`;
}

/* ------------------------------------------------------------------ */
/* escala e dias trabalhados                                           */
/* ------------------------------------------------------------------ */

export function scaleFieldsHtml(goal, periodKey) {
  const vendors = metaVendors();
  if (!vendors.length) {
    return '<span class="field-hint">Nenhuma vendedora cadastrada ainda — cadastre em Equipe.</span>';
  }
  const selected = goal?.vendorIds?.length ? goal.vendorIds : vendors.map(v => v.id);
  const pseudo = { ...goal, periodKey };

  return `<div class="scale-list">
    ${vendors.map(vendor => {
      const isOpen = openDaysVendorId === vendor.id;
      return `<div class="scale-vendor${isOpen ? ' open' : ''}" data-vendor-id="${vendor.id}">
        <div class="scale-vendor-row">
          <label class="check-item">
            <input type="checkbox" class="mc-vendor" value="${vendor.id}" ${selected.includes(vendor.id) ? 'checked' : ''}>
            <span>${esc(vendor.name)}</span>
          </label>
          <button type="button" class="days-toggle" data-action="toggleDaysPanel" data-vendor-id="${vendor.id}">
            <span class="mc-days-summary">${daysSummary(pseudo, vendor.id)}</span>
            <span class="days-toggle-cta">${isOpen ? 'fechar' : 'dias trabalhados'}</span>
          </button>
        </div>
        ${daysPanelHtml(goal, periodKey, vendor)}
      </div>`;
    }).join('')}
  </div>
  <div class="field-hint">Por padrão a vendedora trabalha o mês inteiro. Em folga ou férias, marque só os dias trabalhados: as metas e a bonificação dela ficam proporcionais.</div>`;
}

function daysPanelHtml(goal, periodKey, vendor) {
  const { year, month, days } = periodOf(periodKey);
  const worked = workedDays({ ...goal, periodKey }, vendor.id);
  const offset = new Date(year, month, 1).getDay();

  const cells = Array.from({ length: days }, (_, idx) => {
    const day = idx + 1;
    const weekday = (offset + idx) % 7;
    const checked = !worked || worked.includes(day);
    return `<label class="day-cell${weekday === 0 ? ' sunday' : ''}">
      <input type="checkbox" class="mc-day" value="${day}" data-change-action="workDaysChanged" ${checked ? 'checked' : ''}>
      <span>${day}</span>
    </label>`;
  }).join('');

  return `<div class="days-panel">
    <div class="days-range">
      Trabalha do dia
      <input type="number" class="mc-range-from" min="1" max="${days}" value="1" aria-label="Primeiro dia trabalhado">
      ao dia
      <input type="number" class="mc-range-to" min="1" max="${days}" value="${days}" aria-label="Último dia trabalhado">
      <button type="button" class="ghost-btn" data-action="applyDaysRange" data-vendor-id="${vendor.id}">Aplicar</button>
      <button type="button" class="ghost-btn" data-action="setAllDays" data-vendor-id="${vendor.id}" data-on="1">Mês inteiro</button>
      <button type="button" class="ghost-btn" data-action="setAllDays" data-vendor-id="${vendor.id}" data-on="0">Limpar</button>
    </div>
    <div class="days-calendar">
      ${WEEKDAYS.map(name => `<span class="day-head">${name}</span>`).join('')}
      ${'<span></span>'.repeat(offset)}
      ${cells}
    </div>
    <div class="field-hint">Toque nos dias para marcar ou desmarcar. Dias desmarcados são folga.</div>
  </div>`;
}

function daysSummary(goal, vendorId) {
  const worked = workedDays(goal, vendorId);
  if (!worked) return 'Mês inteiro';
  const { days } = periodOf(goal.periodKey);
  if (!worked.length) return 'Nenhum dia marcado';
  const share = Math.round(vendorShare(goal, vendorId) * 100);
  return `${worked.length} de ${days} dias · ${share}% da meta`;
}

/** Atualiza os resumos ("15 de 31 dias · 48% da meta") depois de qualquer mudança. */
function refreshSummaries(root) {
  const goal = { ...readMonthConfig(root), periodKey: root.dataset.monthConfig };
  root.querySelectorAll('.scale-vendor').forEach(row => {
    row.querySelector('.mc-days-summary').textContent = daysSummary(goal, row.dataset.vendorId);
  });
}

/** Avisa quem observa o formulário (prévia do modal, rascunho da aba Equipe). */
function notifyEdited(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ------------------------------------------------------------------ */
/* níveis                                                              */
/* ------------------------------------------------------------------ */

export function tierFieldsHtml(goal) {
  return `<div class="tier-inputs">
    ${TIER_ORDER.map(tier => {
      const on = isTierOn(goal, tier);
      const disabled = on ? '' : 'disabled';
      const rate = Math.round(tierRate(goal, tier) * 10000) / 100;
      return `<div class="field tier-input${on ? '' : ' tier-off'}" data-tier="${tier}" style="border-top-color:var(--${tier})">
        <label class="check-item tier-toggle">
          <input type="checkbox" class="mc-tier-on" data-change-action="toggleTierOn" ${on ? 'checked' : ''}>
          <span>${TIER_LABEL[tier]}</span>
        </label>
        <label class="tier-field-label">Meta por vendedora (R$)
          <input type="text" class="mc-tier-value" inputmode="decimal" autocomplete="off" data-mask="money" maxlength="18" value="${displayMasked('money', goal?.niveis?.[tier])}" placeholder="0,00" ${disabled}>
        </label>
        <label class="tier-field-label">Bonificação (%)
          <input type="text" class="mc-tier-rate" inputmode="decimal" autocomplete="off" data-mask="money" maxlength="6" value="${displayMasked('money', rate)}" placeholder="0,00" ${disabled}>
        </label>
      </div>`;
    }).join('')}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* peso das semanas                                                    */
/* ------------------------------------------------------------------ */

export function weekWeightsHtml(goal, periodKey) {
  const { year, month } = periodOf(periodKey);
  const weeks = monthWeeks(year, month);
  return `<div class="week-weights">
    ${weeks.map(week => {
      const custom = goal?.pesosSemanas?.[week.idx];
      const value = custom !== null && custom !== undefined && custom !== '' ? custom : week.weight;
      return `<label class="week-weight-field">
        <span class="wwf-name">${week.label}</span>
        <span class="wwf-range">${week.periodo}</span>
        <input type="text" class="mc-week-weight" inputmode="decimal" autocomplete="off" maxlength="4"
          data-week="${week.idx}" data-default="${week.weight}" value="${String(value).replace('.', ',')}"
          data-change-action="weekWeightChanged" aria-label="Peso da ${week.label}">
      </label>`;
    }).join('')}
  </div>
  <div class="field-hint">O peso diz quanto da meta do mês cai em cada semana: peso 2 pede o dobro de uma semana de peso 1. Padrão: 1 nas semanas quebradas das pontas e 2 nas do meio.</div>`;
}

/* ------------------------------------------------------------------ */
/* leitura e validação                                                 */
/* ------------------------------------------------------------------ */

/** Lê os campos de dentro de `root`. Valores de níveis desligados são mantidos. */
export function readMonthConfig(root) {
  const config = {
    vendorIds: [...root.querySelectorAll('.mc-vendor:checked')].map(input => input.value),
    niveis: {},
    niveisAtivos: {},
    taxas: {},
    diasTrabalhados: null,
    pesosSemanas: null
  };

  TIER_ORDER.forEach(tier => {
    const box = root.querySelector(`.tier-input[data-tier="${tier}"]`);
    const rate = readNumber(box.querySelector('.mc-tier-rate'));
    config.niveis[tier] = readNumber(box.querySelector('.mc-tier-value'));
    config.niveisAtivos[tier] = box.querySelector('.mc-tier-on').checked;
    config.taxas[tier] = rate === null ? null : Math.round(rate * 100) / 10000;
  });

  // Só guarda quem não trabalha o mês inteiro.
  const dias = {};
  root.querySelectorAll('.scale-vendor').forEach(row => {
    const all = row.querySelectorAll('.mc-day');
    const checked = [...row.querySelectorAll('.mc-day:checked')].map(input => Number(input.value));
    if (checked.length < all.length) dias[row.dataset.vendorId] = checked;
  });
  if (Object.keys(dias).length) config.diasTrabalhados = dias;

  const inputs = [...root.querySelectorAll('.mc-week-weight')];
  const pesos = inputs.map(input => {
    const value = parseNumber(input.value);
    return value === null || value < 0 ? Number(input.dataset.default) : value;
  });
  if (pesos.some((peso, idx) => peso !== Number(inputs[idx].dataset.default))) config.pesosSemanas = pesos;

  return config;
}

/** Devolve a mensagem do primeiro problema, ou null quando está tudo certo. */
export function validateMonthConfig(config, { requireValues }) {
  if (!config.vendorIds.length) return 'Selecione pelo menos uma vendedora na escala';
  const semDias = config.vendorIds.find(id => config.diasTrabalhados?.[id]?.length === 0);
  if (semDias) {
    const name = metaVendors().find(v => v.id === semDias)?.name || 'a vendedora';
    return `Marque pelo menos um dia trabalhado para ${name} ou tire ela da escala`;
  }
  const onTiers = TIER_ORDER.filter(tier => config.niveisAtivos[tier]);
  if (!onTiers.length) return 'Ligue pelo menos um nível de meta';
  for (const tier of onTiers) {
    if (config.taxas[tier] === null) return `Informe o % de bonificação do ${TIER_LABEL[tier]}`;
    if (requireValues && config.niveis[tier] === null) {
      return `Informe a meta do ${TIER_LABEL[tier]} ou desligue esse nível`;
    }
  }
  if (config.pesosSemanas && !config.pesosSemanas.some(peso => peso > 0)) {
    return 'Pelo menos uma semana precisa ter peso maior que zero';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* preenchimento                                                       */
/* ------------------------------------------------------------------ */

/** Preenche os valores (R$) dos níveis; `null` deixa o campo como está. */
export function fillTierValues(root, values) {
  TIER_ORDER.forEach(tier => {
    if (values[tier] === null || values[tier] === undefined) return;
    setMasked(root.querySelector(`.tier-input[data-tier="${tier}"] .mc-tier-value`), values[tier]);
  });
}

/** Copia níveis ligados, valores e percentuais de outra meta para os campos. */
export function fillTierConfig(root, goal) {
  TIER_ORDER.forEach(tier => {
    const box = root.querySelector(`.tier-input[data-tier="${tier}"]`);
    setMasked(box.querySelector('.mc-tier-value'), goal?.niveis?.[tier]);
    setMasked(box.querySelector('.mc-tier-rate'), Math.round(tierRate(goal, tier) * 10000) / 100);
    setTierOn(box, isTierOn(goal, tier));
  });
}

function setTierOn(box, on) {
  box.querySelector('.mc-tier-on').checked = on;
  box.classList.toggle('tier-off', !on);
  box.querySelectorAll('.mc-tier-value, .mc-tier-rate').forEach(input => { input.disabled = !on; });
}

/* ------------------------------------------------------------------ */
/* ações                                                               */
/* ------------------------------------------------------------------ */

function vendorRow(el) {
  return el.closest('.scale-vendor');
}

function setDays(row, isWorked) {
  row.querySelectorAll('.mc-day').forEach(input => { input.checked = isWorked(Number(input.value)); });
  refreshSummaries(row.closest('[data-month-config]'));
  notifyEdited(row.querySelector('.mc-day'));
}

onClick({
  toggleDaysPanel(_data, el) {
    const row = vendorRow(el);
    const opening = !row.classList.contains('open');
    row.closest('[data-month-config]').querySelectorAll('.scale-vendor.open').forEach(other => {
      other.classList.remove('open');
      other.querySelector('.days-toggle-cta').textContent = 'dias trabalhados';
    });
    row.classList.toggle('open', opening);
    row.querySelector('.days-toggle-cta').textContent = opening ? 'fechar' : 'dias trabalhados';
    openDaysVendorId = opening ? row.dataset.vendorId : null;
  },

  applyDaysRange(_data, el) {
    const row = vendorRow(el);
    const from = Number(row.querySelector('.mc-range-from').value);
    const to = Number(row.querySelector('.mc-range-to').value);
    if (!from || !to || from > to) return;
    setDays(row, day => day >= from && day <= to);
  },

  setAllDays({ on }, el) {
    setDays(vendorRow(el), () => on === '1');
  }
});

onChange({
  toggleTierOn(_data, el) {
    setTierOn(el.closest('.tier-input'), el.checked);
  },
  workDaysChanged(_data, el) {
    refreshSummaries(el.closest('[data-month-config]'));
  },
  weekWeightChanged(_data, el) {
    refreshSummaries(el.closest('[data-month-config]'));
  }
});
