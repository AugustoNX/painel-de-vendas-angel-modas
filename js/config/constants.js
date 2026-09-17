export const MONTHS = ["Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// MONTH_INFO e WEEK_DATA (as metas por mês/semana) saíram daqui — agora vêm
// de forma assíncrona via js/services/erp-goals.service.js e ficam em
// state.monthInfo / state.weekData (ver js/state/store.js), porque no futuro
// serão buscadas de uma API do ERP em vez de fixas no código.

export const RATES = { bronze:0.01, prata:0.015, ouro:0.02, diamante:0.03 };
export const TIER_ORDER = ["bronze","prata","ouro","diamante"];
export const TIER_LABEL = { bronze:"Bronze", prata:"Prata", ouro:"Ouro", diamante:"Diamante" };
export const MONTH_NUM = { Julho:"07", Agosto:"08", Setembro:"09", Outubro:"10", Novembro:"11", Dezembro:"12" };
