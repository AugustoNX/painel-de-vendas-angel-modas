import { esc } from './format.js';

const W = 720;   // largura de referência: o SVG escala junto com o card
const PAD = { top: 16, right: 16, bottom: 26, left: 58 };

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}

function shortMoney(value) {
  if (value >= 1000000) return 'R$ ' + (value / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (value >= 1000) return 'R$ ' + Math.round(value / 1000) + 'k';
  return 'R$ ' + Math.round(value);
}

/**
 * Gráfico de linhas em SVG puro. Cada série recebe os mesmos rótulos no eixo X.
 * Usado para acompanhar o acumulado do mês contra o ritmo ideal da meta.
 */
export function lineChart({ series, labels, height = 210, valueLabel = shortMoney }) {
  if (!series.length || !labels.length) return '';

  const maxValue = niceMax(Math.max(1, ...series.flatMap(s => s.points.filter(p => p !== null))));
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = i => PAD.left + (labels.length === 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const y = value => PAD.top + innerH - (value / maxValue) * innerH;

  const gridCount = 4;
  let grid = '';
  for (let i = 0; i <= gridCount; i++) {
    const value = (maxValue / gridCount) * i;
    const gy = y(value);
    grid += `<line x1="${PAD.left}" y1="${gy}" x2="${W - PAD.right}" y2="${gy}" class="chart-grid"/>`;
    grid += `<text x="${PAD.left - 8}" y="${gy + 4}" class="chart-axis" text-anchor="end">${valueLabel(value)}</text>`;
  }

  const step = Math.max(1, Math.ceil(labels.length / 8));
  let xAxis = '';
  labels.forEach((label, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    xAxis += `<text x="${x(i)}" y="${height - 8}" class="chart-axis" text-anchor="middle">${esc(label)}</text>`;
  });

  const paths = series.map(serie => {
    const points = serie.points
      .map((value, i) => (value === null ? null : `${x(i)},${y(value)}`))
      .filter(Boolean);
    if (!points.length) return '';

    const line = `<polyline points="${points.join(' ')}" fill="none" stroke="${serie.color}" stroke-width="2.5"
      stroke-linejoin="round" stroke-linecap="round"${serie.dashed ? ' stroke-dasharray="6 5"' : ''}/>`;

    const area = serie.fill
      ? `<polygon points="${PAD.left},${y(0)} ${points.join(' ')} ${x(serie.points.length - 1)},${y(0)}"
          fill="${serie.color}" opacity="0.12"/>`
      : '';

    const lastIdx = serie.points.reduce((acc, value, i) => (value === null ? acc : i), -1);
    const dot = lastIdx >= 0 && !serie.dashed
      ? `<circle cx="${x(lastIdx)}" cy="${y(serie.points[lastIdx])}" r="4" fill="${serie.color}"/>`
      : '';

    return area + line + dot;
  }).join('');

  const legend = series.map(serie =>
    `<span class="chart-legend-item"><i style="background:${serie.color}"></i>${esc(serie.name)}</span>`).join('');

  return `<div class="chart">
    <svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" role="img" aria-label="Gráfico de evolução">
      ${grid}${xAxis}${paths}
    </svg>
    <div class="chart-legend">${legend}</div>
  </div>`;
}

/** Barras horizontais comparáveis — ranking de vendedoras, por exemplo. */
export function barChart({ items, valueLabel = shortMoney, markerLabel = 'meta' }) {
  if (!items.length) return '';
  const max = Math.max(...items.map(item => Math.max(item.value, item.marker || 0)), 1);

  return `<div class="bar-chart">${items.map(item => {
    const width = (item.value / max) * 100;
    const markerLeft = item.marker ? (item.marker / max) * 100 : null;
    return `<div class="bar-row">
      <div class="bar-label">${esc(item.label)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${width}%; background:${item.color || 'var(--accent)'}"></div>
        ${markerLeft !== null ? `<div class="bar-marker" style="left:${Math.min(markerLeft, 100)}%" title="${markerLabel}: ${valueLabel(item.marker)}"></div>` : ''}
      </div>
      <div class="bar-value">${valueLabel(item.value)}</div>
    </div>`;
  }).join('')}</div>`;
}

/** Faixas proporcionais de uma composição (segmentos de carteira, status etc.). */
export function stackedBar(segments) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  if (!total) return '';
  return `<div class="stacked-bar">${segments.filter(seg => seg.value > 0).map(seg =>
    `<span style="width:${(seg.value / total) * 100}%; background:${seg.color}" title="${esc(seg.label)}: ${seg.value}"></span>`
  ).join('')}</div>`;
}

export { shortMoney };
