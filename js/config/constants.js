export const ROLE = { ADMIN: 'admin', VENDEDORA: 'vendedora' };

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const TIER_ORDER = ['bronze', 'prata', 'ouro', 'diamante'];
export const TIER_LABEL = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante' };
export const RATES = { bronze: 0.01, prata: 0.015, ouro: 0.02, diamante: 0.03 };

// Multiplicadores aplicados sobre a meta-base (objetivo ÷ nº de vendedoras) quando
// o admin usa o botão de calcular metas automaticamente. Cada valor continua
// editável à mão depois, mês a mês.
export const DEFAULT_TIER_MULTIPLIERS = { bronze: 0.88, prata: 1, ouro: 1.15, diamante: 1.3 };

export const COLECOES = ['Primavera', 'Verão', 'Outono', 'Inverno'];

export const PAYMENT_METHODS = ['PIX', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Crediário', 'Outro'];

/** Atalhos do que mais sai numa loja de roupa — a vendedora toca em vez de digitar. */
export const CLOTHING_ITEMS = [
  'Vestido', 'Conjunto', 'Blusa', 'Calça', 'Saia', 'Short',
  'Jaqueta', 'Body', 'Macacão', 'Calçado', 'Bolsa', 'Acessório'
];

export const DB_PATHS = {
  users: 'users',
  vendors: 'vendors',
  settings: 'settings',
  goals: 'goals',
  sales: 'sales',
  clients: 'clients',
  purchases: 'purchases',
  contacts: 'contacts',
  transfers: 'transfers',
  marcas: 'stock/marcas',
  stockPurchases: 'stock/purchases',
  brandSales: 'stock/brandSales'
};

export const VIEWS = { VENDAS: 'vendas', CARTEIRA: 'carteira', COMPRAS: 'compras', EQUIPE: 'equipe' };
