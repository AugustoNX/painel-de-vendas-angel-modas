import { state, periodKey } from '../../core/store.js';
import { MONTH_NAMES, TIER_ORDER, TIER_LABEL, RATES } from '../../config/constants.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { money, esc } from '../../ui/format.js';
import { metaVendors, suggestTiers, goalFor } from '../../domain/metas.js';
import { monthWeeks, splitByWeek } from '../../domain/weeks.js';
import { saveGoal, deleteGoal } from '../../data/goals.repo.js';

const numberOrNull = value => (value === '' || value === null || isNaN(Number(value)) ? null : Number(value));

export function openGoalModal(year, monthIdx) {
  const key = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  const existing = state.goals[key] || null;
  const previous = previousGoal(year, monthIdx);
  const vendors = metaVendors();
  const selectedIds = existing?.vendorIds?.length ? existing.vendorIds : vendors.map(v => v.id);
  let overlayRef = null;

  const body = `
    <div class="goal-form">
      <div class="goal-row">
        <div class="field">
          <label for="goalObj">Objetivo total da loja (R$)</label>
          <input id="goalObj" type="number" step="0.01" min="0" value="${existing?.obj ?? ''}" placeholder="0,00">
        </div>
        <div class="field">
          <label for="goalCampanha">Campanha não comissionável (R$)</label>
          <input id="goalCampanha" type="number" step="0.01" min="0" value="${existing?.campanhaAlvo ?? 0}" placeholder="0,00">
          <span class="field-hint">Ex.: liquidação. Sai da base que vira meta das vendedoras.</span>
        </div>
        <div class="field">
          <label for="goalPreco">Preço médio por peça (R$)</label>
          <input id="goalPreco" type="number" step="0.01" min="0" value="${existing?.precoMedioPeca ?? ''}" placeholder="0,00">
          <span class="field-hint">Converte as metas em peças no balizador.</span>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Quem está na escala deste mês</div>
        <div class="check-grid">
          ${vendors.map(vendor => `<label class="check-item">
            <input type="checkbox" class="goal-vendor" value="${vendor.id}" ${selectedIds.includes(vendor.id) ? 'checked' : ''}>
            <span>${esc(vendor.name)}</span>
          </label>`).join('') || '<span class="field-hint">Nenhuma vendedora cadastrada ainda — cadastre em Equipe.</span>'}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">
          Metas por vendedora
          <button type="button" class="ghost-btn" id="goalAutoBtn">Calcular automaticamente</button>
          ${previous ? `<button type="button" class="ghost-btn" id="goalCopyBtn">Copiar de ${previous.label}</button>` : ''}
        </div>
        <div class="tier-inputs">
          ${TIER_ORDER.map(tier => `<div class="field tier-input" style="border-top-color:var(--${tier})">
            <label for="goalTier-${tier}">${TIER_LABEL[tier]} · ${(RATES[tier] * 100).toFixed(1)}%</label>
            <input id="goalTier-${tier}" type="number" step="0.01" min="0" value="${existing?.niveis?.[tier] ?? ''}" placeholder="deixe vazio se não valer">
          </div>`).join('')}
        </div>
        <div class="field-hint">Deixar em branco significa que o nível não existe no mês (foi o caso de Setembro sem Diamante).</div>
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
          if (!data.vendorIds.length) { showToast('Selecione pelo menos uma vendedora na escala'); return false; }
          if (!TIER_ORDER.some(tier => data.niveis[tier] !== null)) {
            showToast('Defina pelo menos uma faixa de meta'); return false;
          }
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
        const suggested = suggestTiers({
          obj: data.obj,
          campanhaAlvo: data.campanhaAlvo,
          vendorCount: data.vendorIds.length
        });
        TIER_ORDER.forEach(tier => {
          const input = overlay.querySelector(`#goalTier-${tier}`);
          if (suggested[tier] !== null) input.value = suggested[tier];
        });
        refresh();
        showToast('Faixas sugeridas — ajuste o que precisar');
      });

      overlay.querySelector('#goalCopyBtn')?.addEventListener('click', () => {
        overlay.querySelector('#goalObj').value = previous.goal.obj ?? '';
        overlay.querySelector('#goalCampanha').value = previous.goal.campanhaAlvo ?? 0;
        overlay.querySelector('#goalPreco').value = previous.goal.precoMedioPeca ?? '';
        TIER_ORDER.forEach(tier => {
          overlay.querySelector(`#goalTier-${tier}`).value = previous.goal.niveis?.[tier] ?? '';
        });
        refresh();
        showToast(`Valores copiados de ${previous.label}`);
      });

      overlay.querySelectorAll('input').forEach(input => input.addEventListener('input', refresh));
      refresh();
    }
  });

  function readForm() {
    const pick = id => overlayRef.querySelector(id);
    return {
      obj: numberOrNull(pick('#goalObj').value) || 0,
      campanhaAlvo: numberOrNull(pick('#goalCampanha').value) || 0,
      precoMedioPeca: numberOrNull(pick('#goalPreco').value) || 0,
      vendorIds: [...overlayRef.querySelectorAll('.goal-vendor:checked')].map(input => input.value),
      niveis: TIER_ORDER.reduce((acc, tier) => {
        acc[tier] = numberOrNull(pick(`#goalTier-${tier}`).value);
        return acc;
      }, {})
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
function renderPreview(overlay, year, monthIdx) {
  const pick = id => overlay.querySelector(id);
  const obj = numberOrNull(pick('#goalObj').value) || 0;
  const campanha = numberOrNull(pick('#goalCampanha').value) || 0;
  const preco = numberOrNull(pick('#goalPreco').value) || 0;
  const vendorCount = overlay.querySelectorAll('.goal-vendor:checked').length;
  const weeks = monthWeeks(year, monthIdx);

  const base = Math.max(obj - campanha, 0);
  const rows = TIER_ORDER.map(tier => {
    const value = numberOrNull(pick(`#goalTier-${tier}`).value);
    if (value === null) return `<tr class="off"><td>${TIER_LABEL[tier]}</td><td colspan="3">não vale neste mês</td></tr>`;
    const perWeek = splitByWeek(value, weeks);
    return `<tr>
      <td><span class="tier-badge b-${tier}">${TIER_LABEL[tier]}</span></td>
      <td>${money(value)}${preco > 0 ? ` · ${Math.round(value / preco)} pçs` : ''}</td>
      <td>${perWeek.map(v => Math.round(v).toLocaleString('pt-BR')).join(' · ')}</td>
      <td>${money(value * RATES[tier])}</td>
    </tr>`;
  }).join('');

  pick('#goalPreview').innerHTML = `
    <div class="preview-line">
      Base comissionável: <b>${money(base)}</b> ·
      ${vendorCount} vendedora${vendorCount === 1 ? '' : 's'} na escala ·
      média de <b>${vendorCount ? money(base / vendorCount) : '—'}</b> por vendedora ·
      ${weeks.length} semanas (pesos ${weeks.map(w => w.weight).join('-')})
    </div>
    <table class="preview-table">
      <thead><tr><th>Nível</th><th>Meta por vendedora</th><th>Quebra semanal (R$)</th><th>Bonificação</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
