import { state } from '../../core/store.js';
import { MONTH_NAMES, TIER_ORDER, TIER_LABEL } from '../../config/constants.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { money, ratePct, esc } from '../../ui/format.js';
import { displayMasked, readNumber, setMasked } from '../../ui/mask.js';
import { suggestTiers, goalFor, goalWeeks, equivalentVendors, vendorShare, tierValue, metaVendors } from '../../domain/metas.js';
import { splitByWeek } from '../../domain/weeks.js';
import { saveGoal, deleteGoal } from '../../data/goals.repo.js';
import {
  scaleFieldsHtml, tierFieldsHtml, weekWeightsHtml, monthConfigAttr, readMonthConfig, validateMonthConfig,
  fillTierValues, fillTierConfig
} from '../components/month-config.js';

export function openGoalModal(year, monthIdx) {
  const key = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  const existing = state.goals[key] || null;
  const previous = previousGoal(year, monthIdx);
  let overlayRef = null;

  const body = `
    <div class="goal-form" ${monthConfigAttr(key)}>
      <div class="goal-row">
        <div class="field">
          <label for="goalObj">Objetivo total da loja (R$)</label>
          <input id="goalObj" type="text" inputmode="decimal" autocomplete="off" data-mask="money" maxlength="18" value="${displayMasked('money', existing?.obj)}" placeholder="0,00">
        </div>
        <div class="field">
          <label for="goalCampanha">Campanha não comissionável (R$)</label>
          <input id="goalCampanha" type="text" inputmode="decimal" autocomplete="off" data-mask="money" maxlength="18" value="${displayMasked('money', existing?.campanhaAlvo ?? 0)}" placeholder="0,00">
          <span class="field-hint">Ex.: liquidação. Sai da base que vira meta das vendedoras.</span>
        </div>
        <div class="field">
          <label for="goalPreco">Preço médio por peça (R$)</label>
          <input id="goalPreco" type="text" inputmode="decimal" autocomplete="off" data-mask="money" maxlength="18" value="${displayMasked('money', existing?.precoMedioPeca)}" placeholder="0,00">
          <span class="field-hint">Converte as metas em peças no balizador.</span>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Quem está na escala deste mês</div>
        ${scaleFieldsHtml(existing, key)}
      </div>

      <div class="modal-section">
        <div class="modal-section-title">
          Níveis e metas por vendedora
          <button type="button" class="ghost-btn" id="goalAutoBtn">Calcular automaticamente</button>
          ${previous ? `<button type="button" class="ghost-btn" id="goalCopyBtn">Copiar de ${previous.label}</button>` : ''}
        </div>
        ${tierFieldsHtml(existing)}
        <div class="field-hint">Desmarque os níveis que não valem no mês (ex.: Setembro sem Diamante). O valor fica guardado caso você ligue de novo. A meta é de quem trabalha o mês inteiro.</div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Peso das semanas</div>
        ${weekWeightsHtml(existing, key)}
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Prévia</div>
        <div id="goalPreview" class="goal-preview"></div>
      </div>
    </div>`;

  openModal({
    title: `Meta de ${MONTH_NAMES[monthIdx]}/${year}`,
    subtitle: 'O balizador semanal e a conversão em peças são calculados a partir destes números.',
    size: 'lg',
    body,
    actions: [
      ...(existing ? [{
        label: 'Apagar meta',
        kind: 'danger',
        onClick: () => {
          confirmModal({
            title: 'Apagar meta do mês',
            message: `A meta de ${MONTH_NAMES[monthIdx]}/${year} será removida. As vendas lançadas continuam salvas.`,
            confirmLabel: 'Apagar',
            onConfirm: async () => {
              await deleteGoal(key);
              showToast('Meta apagada');
            }
          });
        }
      }] : []),
      { label: 'Cancelar', kind: 'secondary' },
      {
        label: 'Salvar meta',
        kind: 'primary',
        onClick: async () => {
          const data = readForm();
          if (!data.obj || data.obj <= 0) { showToast('Informe o objetivo da loja'); return false; }
          const problem = validateMonthConfig(data, { requireValues: true });
          if (problem) { showToast(problem); return false; }
          await saveGoal(key, { ...data, campanhaRealizado: existing?.campanhaRealizado ?? 0 });
          showToast(`Meta de ${MONTH_NAMES[monthIdx]}/${year} salva`);
        }
      }
    ],
    onMount(overlay) {
      overlayRef = overlay;
      const refresh = () => renderPreview(overlay, year, monthIdx);

      overlay.querySelector('#goalAutoBtn').addEventListener('click', () => {
        const data = readForm();
        fillTierValues(overlay, suggestTiers({
          obj: data.obj,
          campanhaAlvo: data.campanhaAlvo,
          // Quem trabalha meio mês conta como meia vendedora na divisão.
          vendorCount: equivalentVendors({ ...data, periodKey: key }, data.vendorIds)
        }));
        refresh();
        showToast('Faixas sugeridas — ajuste o que precisar');
      });

      overlay.querySelector('#goalCopyBtn')?.addEventListener('click', () => {
        setMasked(overlay.querySelector('#goalObj'), previous.goal.obj);
        setMasked(overlay.querySelector('#goalCampanha'), previous.goal.campanhaAlvo ?? 0);
        setMasked(overlay.querySelector('#goalPreco'), previous.goal.precoMedioPeca);
        fillTierConfig(overlay, previous.goal);
        refresh();
        showToast(`Valores copiados de ${previous.label}`);
      });

      overlay.querySelectorAll('input').forEach(input => input.addEventListener('input', refresh));
      refresh();
    }
  });

  // A prévia lê o mês pela chave, então ela vai junto da configuração.
  function renderPreview(overlay) {
    renderGoalPreview(overlay, key);
  }

  function readForm() {
    const pick = id => overlayRef.querySelector(id);
    return {
      obj: readNumber(pick('#goalObj')) || 0,
      campanhaAlvo: readNumber(pick('#goalCampanha')) || 0,
      precoMedioPeca: readNumber(pick('#goalPreco')) || 0,
      ...readMonthConfig(overlayRef)
    };
  }
}

function previousGoal(year, monthIdx) {
  const prevMonth = monthIdx === 0 ? 11 : monthIdx - 1;
  const prevYear = monthIdx === 0 ? year - 1 : year;
  const goal = goalFor(prevYear, prevMonth);
  return goal ? { goal, label: `${MONTH_NAMES[prevMonth]}/${prevYear}` } : null;
}

/** Mostra, enquanto o admin digita, o que cada número vai virar no painel. */
function renderGoalPreview(overlay, key) {
  const pick = id => overlay.querySelector(id);
  const obj = readNumber(pick('#goalObj')) || 0;
  const campanha = readNumber(pick('#goalCampanha')) || 0;
  const preco = readNumber(pick('#goalPreco')) || 0;
  const config = { ...readMonthConfig(overlay), periodKey: key };
  const vendorCount = config.vendorIds.length;
  const equivalent = equivalentVendors(config, config.vendorIds);
  const weeks = goalWeeks(config);

  const base = Math.max(obj - campanha, 0);
  const rows = TIER_ORDER.map(tier => {
    const value = config.niveis[tier];
    const rate = config.taxas[tier];
    if (!config.niveisAtivos[tier]) return `<tr class="off"><td>${TIER_LABEL[tier]}</td><td colspan="4">não vale neste mês</td></tr>`;
    if (value === null) return `<tr class="off"><td>${TIER_LABEL[tier]}</td><td colspan="4">falta informar a meta</td></tr>`;
    const perWeek = splitByWeek(value, weeks);
    return `<tr>
      <td><span class="tier-badge b-${tier}">${TIER_LABEL[tier]}</span></td>
      <td>${money(value)}${preco > 0 ? ` · ${Math.round(value / preco)} pçs` : ''}</td>
      <td>${perWeek.map(v => Math.round(v).toLocaleString('pt-BR')).join(' · ')}</td>
      <td>${rate === null ? '—' : ratePct(rate)}</td>
      <td>${rate === null ? '—' : money(value * rate)}</td>
    </tr>`;
  }).join('');

  const onTiers = TIER_ORDER.filter(tier => tierValue(config, tier) !== null);
  const partial = metaVendors().filter(v => config.vendorIds.includes(v.id) && vendorShare(config, v.id) < 1);
  const partialTable = partial.length && onTiers.length ? `
    <div class="mini-title">Metas proporcionais de quem não trabalha o mês inteiro</div>
    <table class="preview-table">
      <thead><tr><th>Vendedora</th><th>Dias</th>${onTiers.map(tier => `<th>${TIER_LABEL[tier]}</th>`).join('')}</tr></thead>
      <tbody>${partial.map(vendor => `<tr>
        <td>${esc(vendor.name)}</td>
        <td>${config.diasTrabalhados[vendor.id].length} dias · ${Math.round(vendorShare(config, vendor.id) * 100)}%</td>
        ${onTiers.map(tier => `<td>${money(tierValue(config, tier, vendor.id))}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>` : '';

  const equivalentLabel = Math.abs(equivalent - vendorCount) > 0.005
    ? ` (equivalem a ${equivalent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de mês inteiro)`
    : '';

  pick('#goalPreview').innerHTML = `
    <div class="preview-line">
      Base comissionável: <b>${money(base)}</b> ·
      ${vendorCount} vendedora${vendorCount === 1 ? '' : 's'} na escala${equivalentLabel} ·
      média de <b>${equivalent ? money(base / equivalent) : '—'}</b> por vendedora de mês inteiro ·
      ${weeks.length} semanas (pesos ${weeks.map(w => String(w.weight).replace('.', ',')).join('-')})
    </div>
    <table class="preview-table">
      <thead><tr><th>Nível</th><th>Meta por vendedora</th><th>Quebra semanal (R$)</th><th>Bonificação</th><th>Valor</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${partialTable}`;
}
