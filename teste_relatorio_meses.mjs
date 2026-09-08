/* ================================================================
   VARIOS MESES NO RELATORIO (v3.361)

   O seletor de mes virou uma grade de doze botoes e a escolha virou um
   CONJUNTO. O que esta suite cobra, alem dos botoes:

     - um mes so continua se comportando EXATAMENTE como antes (era a
       condicao para a mudanca nao custar nada a quem so quer o mes);
     - cada mes continua sendo guardado sozinho, no seu proprio .ftr, no
       formato de sempre. O combinado nunca vira arquivo.
   ================================================================ */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import path from 'path';

const ARQ = process.env.FT_ARQ || editorAtual();
let falhas = 0, feitas = 0;
function ok(nome, cond, extra) {
  feitas++;
  if (cond) console.log('  ok   ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (extra ? '  ->  ' + extra : '')); }
}
const IT = (id,mes,dia,cli,vend) => ({id,dia,mes,ano:2026,cliente:cli,pedido:'PD00'+id,
  vendedor:vend||'Lucas',subPecas:10,subValor:1000,perPecas:5,perValor:500,mistos:[]});

const b = await abreNavegador();
const pagina = await b.newPage({viewport:{width:1600,height:1000}});
const erros = [];
pagina.on('pageerror', e => erros.push(String(e).slice(0,180)));
await pagina.goto(path.isAbsolute(ARQ) ? 'file://'+ARQ : 'file://'+path.resolve(ARQ));
await esperaPronto(pagina);

/* ---------- 0. as pecas existem ---------- */
const pecas = await pagina.evaluate(() =>
  ['relMesesGrade','relMesesSel','relPeriodoTexto','relCarimba']
    .filter(n => typeof window[n] === 'undefined'));
ok('as pecas de vários meses existem', pecas.length === 0, 'faltam: ' + pecas.join(', '));
if (pecas.length) {
  console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)  (parou: falta a v3.361)');
  await b.close(); process.exit(1);
}

/* ---------- 1. o <select> de mes sumiu, a grade entrou ---------- */
const grade = await pagina.evaluate(async () => {
  REL.periodos = {anos:[2026], meses:[7,8,9], comMovimento:[7,8,9]};
  REL.sel = {ano:2026, meses:[9], mes:9, dia:0};
  REL.dados = null;
  relDesenha();
  await new Promise(r => setTimeout(r, 250));
  const g = document.getElementById('rlMesGrade');
  const m = document.getElementById('relMesGrade');
  return {
    semSelect: !document.getElementById('relMes') && !document.getElementById('rlMes'),
    botoes: g ? g.querySelectorAll('.rl-mes').length : 0,
    colunas: g ? getComputedStyle(g).gridTemplateColumns : '',
    espelho: m ? m.querySelectorAll('.rl-mes').length : 0,
    /* o editor nasceu em julho de 2026: antes disso nao ha o que arquivar */
    travados: g ? [...g.querySelectorAll('.rl-mes[disabled]')].map(x=>+x.dataset.m) : [],
    marcados: g ? [...g.querySelectorAll('.rl-mes.on')].map(x=>+x.dataset.m) : [],
    /* mes sem movimento CONTINUA clicavel: e nele que se gera o primeiro */
    vazioClicavel: g ? !g.querySelector('.rl-mes[data-m="10"]').disabled : false,
    anoLargo: (() => { const a=document.getElementById('rlAno');
      return a ? Math.round(a.getBoundingClientRect().width) : 0; })()
  };
});
ok('os dois seletores de mês sumiram', grade.semSelect === true);
ok('a grade tem doze botões', grade.botoes === 12, String(grade.botoes));
ok('em quatro colunas', /repeat\(4|(\S+ ){3}\S+$/.test(grade.colunas), grade.colunas);
ok('o motor tem a mesma grade', grade.espelho === 12, String(grade.espelho));
ok('meses antes de julho/2026 vêm travados',
   JSON.stringify(grade.travados) === '[1,2,3,4,5,6]', JSON.stringify(grade.travados));
ok('setembro veio marcado', JSON.stringify(grade.marcados) === '[9]', JSON.stringify(grade.marcados));
ok('mês sem movimento continua clicável', grade.vazioClicavel === true);

/* ---------- 2. marcar e desmarcar ---------- */
const cliques = await pagina.evaluate(async () => {
  const g = document.getElementById('rlMesGrade');
  const bt = m => g.querySelector('.rl-mes[data-m="'+m+'"]');
  const out = {};
  bt(8).click(); await new Promise(r=>setTimeout(r,200));
  out.doisMeses = relMesesSel();
  bt(7).click(); await new Promise(r=>setTimeout(r,200));
  out.tresMeses = relMesesSel();
  bt(7).click(); await new Promise(r=>setTimeout(r,200));
  out.desmarcou = relMesesSel();
  /* desmarcar o ULTIMO nao pode deixar a tela sem periodo nenhum */
  bt(8).click(); await new Promise(r=>setTimeout(r,200));
  const so = relMesesSel();
  document.getElementById('rlMesGrade').querySelector('.rl-mes[data-m="'+so[0]+'"]').click();
  await new Promise(r=>setTimeout(r,200));
  out.ultimoResiste = relMesesSel();
  return out;
});
ok('clicar em agosto soma dois meses',
   JSON.stringify(cliques.doisMeses) === '[8,9]', JSON.stringify(cliques.doisMeses));
ok('e julho vira três, sempre em ordem',
   JSON.stringify(cliques.tresMeses) === '[7,8,9]', JSON.stringify(cliques.tresMeses));
ok('clicar de novo desmarca',
   JSON.stringify(cliques.desmarcou) === '[8,9]', JSON.stringify(cliques.desmarcou));
ok('desmarcar o último não deixa sem período',
   cliques.ultimoResiste.length === 1, JSON.stringify(cliques.ultimoResiste));

/* ---------- 3. UM MES: tudo como era antes ---------- */
const um = await pagina.evaluate(async () => {
  REL.sel = {ano:2026, meses:[9], mes:9, dia:0};
  REL.filtro = {vendedor:'',cliente:'',dia:0,tipo:''};
  REL.dados = {ano:2026, meses:[9], mes:9, dia:0, geradoEm:new Date().toISOString(),
    itens:[
      {id:'c',dia:3,mes:9,ano:2026,cliente:'PRIME',pedido:'PD003',vendedor:'Lucas',subPecas:6,subValor:600,perPecas:4,perValor:400,mistos:[]},
      {id:'d',dia:22,mes:9,ano:2026,cliente:'TEAM BIA',pedido:'PD004',vendedor:'Kev',subPecas:3,subValor:300,perPecas:1,perValor:100,mistos:[]}
    ], falhas:[]};
  relDesenha(); await new Promise(r=>setTimeout(r,250));
  const fd = document.getElementById('relDia');
  return {
    /* v3.365: o periodo mora no cabecalho grudado da tela, e a semana
       virou cartao. A folha continua existindo, mas so na impressao. */
    titulo: (document.querySelector('.rv-cab .per')||{}).textContent||'',
    semanas: [...document.querySelectorAll('.rv-grp')].map(t=>t.textContent.trim()),
    dias: fd ? [...fd.options].map(o=>o.text) : []
  };
});
ok('com um mês o título é o de sempre',
   /Setembro de 2026$/.test(um.titulo), um.titulo);
ok('com um mês a semana NÃO ganha o nome do mês',
   um.semanas.every(t => !/SETEMBRO|Setembro/.test(t)), JSON.stringify(um.semanas));
ok('com um mês o filtro de dia é só o número',
   JSON.stringify(um.dias) === '["Todos os dias","Dia 3","Dia 22"]', JSON.stringify(um.dias));

/* ---------- 4. VARIOS MESES ---------- */
const varios = await pagina.evaluate(async () => {
  REL.sel = {ano:2026, meses:[8,9], mes:8, dia:0};
  REL.filtro = {vendedor:'',cliente:'',dia:0,tipo:''};
  REL.dados = {ano:2026, meses:[8,9], mes:8, dia:0, geradoEm:new Date().toISOString(),
    itens:[
      {id:'a',dia:3,mes:8,ano:2026,cliente:'3B CROSS',pedido:'PD001',vendedor:'Lucas',subPecas:10,subValor:1000,perPecas:5,perValor:500,mistos:[]},
      {id:'b',dia:14,mes:8,ano:2026,cliente:'SAGA',pedido:'PD002',vendedor:'Dani',subPecas:8,subValor:800,perPecas:2,perValor:200,mistos:[]},
      {id:'c',dia:3,mes:9,ano:2026,cliente:'PRIME',pedido:'PD003',vendedor:'Lucas',subPecas:6,subValor:600,perPecas:4,perValor:400,mistos:[]},
      {id:'d',dia:22,mes:9,ano:2026,cliente:'TEAM BIA',pedido:'PD004',vendedor:'Kev',subPecas:3,subValor:300,perPecas:1,perValor:100,mistos:[]}
    ], falhas:[]};
  relDesenha(); await new Promise(r=>setTimeout(r,250));
  const out = {
    titulo: (document.querySelector('.rv-cab .per')||{}).textContent||'',
    semanas: [...document.querySelectorAll('.rv-grp')].map(t=>t.textContent.trim()),
    linhas: document.querySelectorAll('.rv-lin[data-id]').length,
    somaPecas: relSomas().tp,
    dias: [...document.getElementById('relDia').options].map(o=>o.value+'|'+o.text)
  };
  /* o dia 3 existe nos DOIS meses: filtrar pelo de setembro deixa só um */
  REL.filtro.dia = '9-3'; relDesenha(); await new Promise(r=>setTimeout(r,200));
  out.filtrado = [...document.querySelectorAll('.rv-lin[data-id] .cli')].map(e=>e.textContent.trim());
  REL.filtro.dia = 0; relDesenha();
  return out;
});
ok('o título vira a faixa de meses',
   /Agosto a Setembro de 2026$/.test(varios.titulo), varios.titulo);
ok('as quatro linhas entram na mesma lista', varios.linhas === 4, String(varios.linhas));
ok('a soma junta os dois meses', varios.somaPecas === 39, String(varios.somaPecas));
ok('cada semana diz de que mês é',
   varios.semanas.length === 4
   && /AGOSTO|Agosto/.test(varios.semanas[0]) && /SETEMBRO|Setembro/.test(varios.semanas[2]),
   JSON.stringify(varios.semanas));
ok('o filtro de dia mostra o mês junto',
   varios.dias.join(';') === '|Todos os dias;8-3|Dia 3 · Ago;8-14|Dia 14 · Ago;9-3|Dia 3 · Set;9-22|Dia 22 · Set',
   JSON.stringify(varios.dias));
ok('filtrar "dia 3 de setembro" não traz o dia 3 de agosto',
   JSON.stringify(varios.filtrado) === '["PRIME"]', JSON.stringify(varios.filtrado));

/* ---------- 5. o texto do periodo, nos tres formatos ---------- */
const txt = await pagina.evaluate(() => ({
  um:      relPeriodoTexto({ano:2026, meses:[9]}),
  seguido: relPeriodoTexto({ano:2026, meses:[7,8,9]}),
  salteado:relPeriodoTexto({ano:2026, meses:[7,9,12]}),
  velho:   relPeriodoTexto({ano:2026, mes:8})     /* .ftr antigo, sem `meses` */
}));
ok('um mês: "Setembro de 2026"', txt.um === 'Setembro de 2026', txt.um);
ok('seguidos: "Julho a Setembro de 2026"', txt.seguido === 'Julho a Setembro de 2026', txt.seguido);
ok('salteados: a lista curta', txt.salteado === 'Jul, Set, Dez de 2026', txt.salteado);
ok('um .ftr antigo (só `mes`) ainda tem título', txt.velho === 'Agosto de 2026', txt.velho);

/* ---------- 6. O CONTRATO COM O DRIVE NAO MUDOU ---------- */
const rede = await pagina.evaluate(async () => {
  const chamadas = [];
  const orig = window.ftSyncFetch;
  window.ftSyncFetch = async (c, o) => {
    chamadas.push({url:c, corpo:o&&o.body?JSON.parse(o.body):null});
    if (/relatorio-lista/.test(c))
      return {ok:true, json:async()=>({ok:true, arquivos:[{id:'x1',nome:'A-PD001-030826.ft',dia:3}]})};
    if (/relatorio-lote/.test(c))
      return {ok:true, json:async()=>({ok:true, itens:[{id:'x1',dia:3,cliente:'A',pedido:'PD001',
        vendedor:'Lucas',subPecas:1,subValor:10,perPecas:0,perValor:0,mistos:[]}], falhas:[]})};
    return {ok:true, json:async()=>({ok:true})};
  };
  const urlAntes = FT_SYNC.url; FT_SYNC.url = 'http://x';
  REL.sel = {ano:2026, meses:[8,9], mes:8, dia:0};
  await relCarrega();
  window.ftSyncFetch = orig; FT_SYNC.url = urlAntes;
  const guardar = chamadas.filter(c=>/relatorio-guardar/.test(c.url));
  return {
    listas: chamadas.filter(c=>/relatorio-lista/.test(c.url)).map(c=>c.url),
    guardou: guardar.map(c=>({ano:c.corpo.ano, mes:c.corpo.mes, dia:c.corpo.dia,
                              itens:(c.corpo.itens||[]).length})),
    /* o combinado NAO pode ter virado arquivo: nada de "meses" no corpo */
    corpoTemMeses: guardar.some(c=>c.corpo && c.corpo.meses !== undefined),
    itensCarimbados: (REL.dados.itens||[]).map(x=>x.mes)
  };
});
ok('pede a lista uma vez por mês, no singular',
   rede.listas.length === 2 && /mes=8/.test(rede.listas[0]) && /mes=9/.test(rede.listas[1]),
   JSON.stringify(rede.listas));
ok('guarda UM ARQUIVO POR MÊS', rede.guardou.length === 2, JSON.stringify(rede.guardou));
ok('  cada um com o seu mês e dia 0',
   JSON.stringify(rede.guardou) === '[{"ano":2026,"mes":8,"dia":0,"itens":1},{"ano":2026,"mes":9,"dia":0,"itens":1}]',
   JSON.stringify(rede.guardou));
ok('  e nenhum corpo carrega uma lista de meses', rede.corpoTemMeses === false);
ok('os itens vêm carimbados com o mês',
   JSON.stringify(rede.itensCarimbados) === '[8,9]', JSON.stringify(rede.itensCarimbados));

ok('nenhum erro de página', erros.length === 0, erros.slice(0,2).join(' // '));
await b.close();
console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
