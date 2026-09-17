// Fonte das metas/objetivos por mês e semana (hoje vinham fixas no código).
//
// Isso vai virar uma chamada pra API do ERP. Por enquanto, fetchGoalsData()
// devolve os mesmos valores fixos que já estavam no painel, só que agora
// passando pelo mesmo formato que a API vai devolver — quando o endpoint
// existir, troque o corpo de fetchGoalsData() por uma chamada fetch(...) e
// mapeie a resposta pro formato abaixo. O resto do app (domain/vendas.js,
// vendas-view.js) não precisa mudar, porque eles só leem state.monthInfo e
// state.weekData, sem saber de onde esses dados vieram.
//
// Formato esperado do retorno:
// {
//   monthInfo: {
//     [nomeDoMes]: {
//       obj: number,            // objetivo total da loja no mês
//       campanhaAlvo: number,   // meta de campanha não comissionável (0 se não houver)
//       base: number,           // objetivo sem a campanha
//       niveis: { bronze:number|null, prata:number|null, ouro:number|null, diamante:number|null }
//     }, ...
//   },
//   weekData: {
//     [nomeDoMes]: {
//       semanas: string[],      // ex: "01/07 a 04/07", uma entrada por semana do mês
//       niveis: {
//         bronze:    { totalRs:number, totalPecas:number, semanal:[{rs,pecas}, ...] } | null,
//         prata:     { totalRs:number, totalPecas:number, semanal:[{rs,pecas}, ...] } | null,
//         ouro:      { totalRs:number, totalPecas:number, semanal:[{rs,pecas}, ...] } | null,
//         diamante:  { totalRs:number, totalPecas:number, semanal:[{rs,pecas}, ...] } | null
//       }
//     }, ...
//   }
// }

const MOCK_MONTH_INFO = {
  Julho:     { obj:227800.00, campanhaAlvo:80000, base:147800.00,
               niveis:{bronze:41876.67, prata:49266.67, ouro:54193.33, diamante:60105.33} },
  Agosto:    { obj:179441.07, campanhaAlvo:0, base:179441.07,
               niveis:{bronze:38131.23, prata:44860.27, ouro:49346.29, diamante:54729.53} },
  Setembro:  { obj:93900.00, campanhaAlvo:0, base:93900.00,
               niveis:{bronze:20658.00, prata:23475.00, ouro:26996.25, diamante:null} },
  Outubro:   { obj:147700.00, campanhaAlvo:0, base:147700.00,
               niveis:{bronze:31386.25, prata:36925.00, ouro:41356.00, diamante:46156.25} },
  Novembro:  { obj:241222.00, campanhaAlvo:0, base:241222.00,
               niveis:{bronze:53068.84, prata:60305.50, ouro:69351.325, diamante:78397.15} },
  Dezembro:  { obj:264087.00, campanhaAlvo:0, base:264087.00,
               niveis:{bronze:58099.14, prata:66021.75, ouro:77905.665, diamante:89129.3625} },
};

const MOCK_WEEK_DATA = {
  Julho: {
    semanas: ["01/07 a 04/07", "05/07 a 11/07", "12/07 a 18/07", "19/07 a 25/07", "26/07 a 31/07"],
    niveis: {
      bronze: { totalRs:41877, totalPecas:343, semanal:[{rs:5235, pecas:43}, {rs:10469, pecas:86}, {rs:10469, pecas:86}, {rs:10469, pecas:85}, {rs:5235, pecas:43}] },
      prata: { totalRs:49267, totalPecas:404, semanal:[{rs:6158, pecas:51}, {rs:12317, pecas:101}, {rs:12317, pecas:101}, {rs:12317, pecas:101}, {rs:6158, pecas:50}] },
      ouro: { totalRs:54193, totalPecas:444, semanal:[{rs:6774, pecas:56}, {rs:13549, pecas:111}, {rs:13548, pecas:111}, {rs:13548, pecas:111}, {rs:6774, pecas:55}] },
      diamante: { totalRs:60105, totalPecas:493, semanal:[{rs:7513, pecas:62}, {rs:15027, pecas:123}, {rs:15026, pecas:123}, {rs:15026, pecas:123}, {rs:7513, pecas:62}] }
    }
  },
  Agosto: {
    semanas: ["01/08 a 01/08", "02/08 a 08/08", "09/08 a 15/08", "16/08 a 22/08", "23/08 a 29/08", "30/08 a 31/08"],
    niveis: {
      bronze: { totalRs:38131, totalPecas:264, semanal:[{rs:3813, pecas:26}, {rs:7627, pecas:53}, {rs:7626, pecas:53}, {rs:7626, pecas:53}, {rs:7626, pecas:53}, {rs:3813, pecas:26}] },
      prata: { totalRs:44860, totalPecas:311, semanal:[{rs:4486, pecas:31}, {rs:8972, pecas:63}, {rs:8972, pecas:62}, {rs:8972, pecas:62}, {rs:8972, pecas:62}, {rs:4486, pecas:31}] },
      ouro: { totalRs:49346, totalPecas:342, semanal:[{rs:4935, pecas:34}, {rs:9869, pecas:69}, {rs:9869, pecas:69}, {rs:9869, pecas:68}, {rs:9869, pecas:68}, {rs:4935, pecas:34}] },
      diamante: { totalRs:54730, totalPecas:379, semanal:[{rs:5473, pecas:38}, {rs:10946, pecas:76}, {rs:10946, pecas:76}, {rs:10946, pecas:76}, {rs:10946, pecas:75}, {rs:5473, pecas:38}] }
    }
  },
  Setembro: {
    semanas: ["01/09 a 05/09", "06/09 a 12/09", "13/09 a 19/09", "20/09 a 26/09", "27/09 a 30/09"],
    niveis: {
      bronze: { totalRs:20658, totalPecas:146, semanal:[{rs:2582, pecas:18}, {rs:5165, pecas:37}, {rs:5165, pecas:37}, {rs:5164, pecas:36}, {rs:2582, pecas:18}] },
      prata: { totalRs:23475, totalPecas:166, semanal:[{rs:2934, pecas:21}, {rs:5869, pecas:42}, {rs:5869, pecas:41}, {rs:5869, pecas:41}, {rs:2934, pecas:21}] },
      ouro: { totalRs:26996, totalPecas:191, semanal:[{rs:3375, pecas:24}, {rs:6749, pecas:48}, {rs:6749, pecas:48}, {rs:6749, pecas:47}, {rs:3374, pecas:24}] },
      diamante: null
    }
  },
  Outubro: {
    semanas: ["01/10 a 03/10", "04/10 a 10/10", "11/10 a 17/10", "18/10 a 24/10", "25/10 a 31/10"],
    niveis: {
      bronze: { totalRs:31386, totalPecas:241, semanal:[{rs:3923, pecas:30}, {rs:7847, pecas:61}, {rs:7847, pecas:60}, {rs:7846, pecas:60}, {rs:3923, pecas:30}] },
      prata: { totalRs:36925, totalPecas:284, semanal:[{rs:4616, pecas:36}, {rs:9231, pecas:71}, {rs:9231, pecas:71}, {rs:9231, pecas:71}, {rs:4616, pecas:35}] },
      ouro: { totalRs:41356, totalPecas:318, semanal:[{rs:5170, pecas:40}, {rs:10339, pecas:80}, {rs:10339, pecas:79}, {rs:10339, pecas:79}, {rs:5169, pecas:40}] },
      diamante: { totalRs:46156, totalPecas:355, semanal:[{rs:5770, pecas:44}, {rs:11539, pecas:89}, {rs:11539, pecas:89}, {rs:11539, pecas:89}, {rs:5769, pecas:44}] }
    }
  },
  Novembro: {
    semanas: ["01/11 a 07/11", "08/11 a 14/11", "15/11 a 21/11", "22/11 a 28/11", "29/11 a 30/11"],
    niveis: {
      bronze: { totalRs:53069, totalPecas:503, semanal:[{rs:6634, pecas:63}, {rs:13267, pecas:126}, {rs:13267, pecas:126}, {rs:13267, pecas:125}, {rs:6634, pecas:63}] },
      prata: { totalRs:60306, totalPecas:572, semanal:[{rs:7538, pecas:72}, {rs:15077, pecas:143}, {rs:15077, pecas:143}, {rs:15076, pecas:143}, {rs:7538, pecas:71}] },
      ouro: { totalRs:69351, totalPecas:658, semanal:[{rs:8669, pecas:82}, {rs:17338, pecas:165}, {rs:17338, pecas:165}, {rs:17337, pecas:164}, {rs:8669, pecas:82}] },
      diamante: { totalRs:78397, totalPecas:743, semanal:[{rs:9800, pecas:93}, {rs:19599, pecas:186}, {rs:19599, pecas:186}, {rs:19599, pecas:185}, {rs:9800, pecas:93}] }
    }
  },
  Dezembro: {
    semanas: ["01/12 a 05/12", "06/12 a 12/12", "13/12 a 19/12", "20/12 a 26/12", "27/12 a 31/12"],
    niveis: {
      bronze: { totalRs:58099, totalPecas:368, semanal:[{rs:7262, pecas:46}, {rs:14525, pecas:92}, {rs:14525, pecas:92}, {rs:14525, pecas:92}, {rs:7262, pecas:46}] },
      prata: { totalRs:66022, totalPecas:418, semanal:[{rs:8253, pecas:52}, {rs:16506, pecas:105}, {rs:16505, pecas:105}, {rs:16505, pecas:104}, {rs:8253, pecas:52}] },
      ouro: { totalRs:77906, totalPecas:494, semanal:[{rs:9738, pecas:62}, {rs:19477, pecas:124}, {rs:19477, pecas:123}, {rs:19476, pecas:123}, {rs:9738, pecas:62}] },
      diamante: { totalRs:89129, totalPecas:565, semanal:[{rs:11141, pecas:71}, {rs:22283, pecas:141}, {rs:22282, pecas:141}, {rs:22282, pecas:141}, {rs:11141, pecas:71}] }
    }
  }
};

export async function fetchGoalsData(){
  // TODO: quando a API do ERP estiver pronta, substituir por algo assim:
  //
  // const res = await fetch(`${ERP_API_BASE_URL}/metas`, {
  //   headers: { Authorization: `Bearer ${ERP_API_TOKEN}` }
  // });
  // if (!res.ok) throw new Error('Falha ao buscar metas do ERP: ' + res.status);
  // return await res.json(); // já no formato { monthInfo, weekData } documentado acima
  return { monthInfo: MOCK_MONTH_INFO, weekData: MOCK_WEEK_DATA };
}
