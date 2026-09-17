export function fmt(n){
  if (n===null || n===undefined || isNaN(n)) return "—";
  return n.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}
export function money(n){ return "R$ " + fmt(n); }
export function moneyRound(n){
  if (n===null || n===undefined || isNaN(n)) return "—";
  return "R$ " + Math.round(n).toLocaleString('pt-BR');
}
export function pecas(n){
  if (n===null || n===undefined || isNaN(n)) return "—";
  return Math.round(n).toLocaleString('pt-BR') + ' pçs';
}
export function fmtDatePt(d){
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
}
export function toFloatBR(s){
  return parseFloat(s.replace(/\./g,'').replace(',', '.'));
}
export function normalizeName(s){ return (s||'').trim().toUpperCase().replace(/\s+/g,' '); }
