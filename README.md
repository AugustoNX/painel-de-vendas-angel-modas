# Painel de Metas — Angel Modas

Painel de gestão de vendas da loja: metas mensais por nível, acompanhamento
diário por vendedora, carteira de clientes (CRM) e sugestão de compras (OTB).
Os dados ficam no Firebase Realtime Database e chegam à tela em tempo real.

## Níveis de acesso

| | Admin | Vendedora |
|---|---|---|
| Ver resultados de toda a equipe | sim | apenas os próprios |
| Definir metas e níveis do mês | sim | não |
| Lançar e importar vendas | sim | não |
| Carteira de clientes | toda a loja | apenas a sua |
| Gestão de compras e estoque | sim | não |
| Criar e editar contas | sim | não |

Não existe cadastro público: as contas são criadas pelo admin em
**Equipe e Acessos**. A única exceção é o primeiro acesso — enquanto não houver
nenhum usuário no banco, o primeiro e-mail que entrar vira admin automaticamente
(as regras do Realtime Database fecham essa brecha assim que o registro existe).

## Como rodar localmente

Os módulos ES não carregam por `file://`, então é preciso servir a pasta por
HTTP. O script abaixo usa só o .NET que já vem no Windows:

```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8080
```

Depois abra <http://localhost:8080>. Com Node instalado, `npx serve .` também
resolve.

Antes de publicar, vale rodar a verificação estática — ela pega import quebrado,
símbolo que não é exportado e `data-action` sem handler:

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-modules.ps1
```

## Deploy

```bash
firebase deploy --only database   # publica database.rules.json
firebase deploy --only hosting
```

As credenciais do projeto ficam em `js/config/firebase.config.js` e as regras de
segurança em `database.rules.json`.

## Estrutura

```
js/
  app.js            bootstrap, navegação e sessão
  config/           credenciais do Firebase e constantes do domínio
  core/             firebase, wrapper do Realtime DB, store observável, sessão
  data/             um repositório por coleção + orquestração dos listeners
  domain/           regras de negócio puras (metas, semanas, CRM, OTB)
  features/         importação de PDF e geração de relatórios
  ui/               formatação, modais, toasts, gráficos SVG, delegação de eventos
  views/            telas e seus modais
```

A dependência anda em uma direção só: `views` → `domain`/`data` → `core`. Nada
em `domain/` toca o Firebase — são funções puras sobre o `state`, o que mantém a
regra de negócio testável e a origem dos dados trocável.

## Modelo de dados

```
users/{uid}                        perfil, papel (admin|vendedora) e vendorId
vendors/{vendorId}                 vendedoras, inclusive apoio (isExtra)
settings/                          preferências e mapeamentos de importação
goals/{YYYY-MM}                    objetivo do mês, níveis, preço médio, escala
sales/{YYYY-MM}/{saleId}           lançamentos, indexados por vendorId e date
clients/{clientId}                 carteira, com vendedora responsável
purchases/{purchaseId}             compras das clientes
contacts/{contactId}               histórico de contato do CRM
transfers/{transferId}             sugestões de troca de carteira
stock/                             marcas, compras de estoque e vendas por marca
```

As vendas são particionadas por mês (`sales/2026-09/...`) para que o painel
baixe só o período aberto em vez da base inteira. Vendedora lê o próprio nó
filtrando por `vendorId` — o filtro é exigido pela própria regra de segurança,
não é só uma escolha do cliente.

## Importação de PDF

O painel lê três relatórios do ERP em `pdf.js`: vendas do período, carteira de
clientes e vendas por marca. A importação sempre mostra uma prévia antes de
gravar, deixa você casar nomes do relatório com as vendedoras cadastradas (o
mapeamento fica salvo) e ignora lançamentos já existentes.
