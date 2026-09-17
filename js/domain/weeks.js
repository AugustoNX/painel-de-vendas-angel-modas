/**
 * Semanas reais de calendário (domingo a sábado) recortadas dentro do mês.
 * A primeira e a última semana pesam 1 e as do meio pesam 2, que é como a loja
 * distribui o ritmo de venda — semanas "quebradas" nas pontas exigem menos.
 */
export function monthWeeks(year, monthIdx) {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const weeks = [];
  let start = 1;

  while (start <= lastDay) {
    const weekday = new Date(year, monthIdx, start).getDay();
    const end = Math.min(start + (6 - weekday), lastDay);
    weeks.push({ start, end });
    start = end + 1;
  }

  const pad = n => String(n).padStart(2, '0');
  const monthLabel = pad(monthIdx + 1);

  return weeks.map((week, idx) => ({
    idx,
    start: week.start,
    end: week.end,
    weight: weeks.length > 1 && (idx === 0 || idx === weeks.length - 1) ? 1 : 2,
    label: `Semana ${idx + 1}`,
    periodo: `${pad(week.start)}/${monthLabel} a ${pad(week.end)}/${monthLabel}`
  }));
}

/**
 * Distribui um total mensal pelas semanas conforme o peso de cada uma,
 * corrigindo o arredondamento para que a soma feche exatamente com o total.
 */
export function splitByWeek(total, weeks) {
  if (!total || !weeks.length) return weeks.map(() => 0);
  const totalWeight = weeks.reduce((sum, week) => sum + week.weight, 0);
  const values = weeks.map(week => Math.round(total * week.weight / totalWeight));
  const drift = Math.round(total) - values.reduce((sum, value) => sum + value, 0);
  if (drift !== 0) {
    const biggest = values.indexOf(Math.max(...values));
    values[biggest] += drift;
  }
  return values;
}

export function weekOfDay(weeks, day) {
  return weeks.find(week => day >= week.start && day <= week.end) || null;
}
