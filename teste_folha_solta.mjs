/* ================================================================
   A FOLHA IMPRESSA SE SOLTOU DA TELA (v3.364)

   Ate a v3.363 a impressao do Relatorio de Pedidos era um DECALQUE:
   relMontaImpressao pegava a folha desenhada no visualizador e clonava
   `.rel-cab`, `.rel-cards`, `.rel-fatia`, `.rel-leg` e a tabela, pedaco
   por pedaco. Funcionava, e cobrava um preco escondido: mexer no
   visualizador era mexer no papel. Foi por isso que a maquete v6 entrou
   na Atividade e nao entrou aqui.

   Agora ha um gerador so, que monta a folha a partir dos DADOS, e e dele
   que o papel sai. A tela chama o mesmo gerador hoje; amanha pode chamar
   outra coisa.

   O QUE ESTA SUITE COBRA, e nesta ordem de importancia:

     1. QUE O PAPEL NAO MUDOU. A folha montada com o visualizador na tela
        e a folha montada com o visualizador ARRANCADO do documento tem de
        ser o mesmo HTML, caractere por caractere. Este e o teste que
        importa: se ele passa, a mudanca nao custou nada a quem imprime.

     2. Que a paginacao continua medida e continua dando os mesmos
        numeros de folhas nos mesmos cenarios.

     3. Que nome de cliente com `<`, `&` e `"` continua entrando por
        textContent e chegando inteiro ao papel.

     4. Que nada de lixo fica no documento depois de imprimir.
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

const b = await abreNavegador();
const pagina = await b.newPage({ viewport: { width: 1600, height: 900 } });
const erros = [];
pagina.on('pageerror', e => erros.push(String(e).slice(0, 180)));
await pagina.goto(path.isAbsolute(ARQ) ? 'file://' + ARQ : 'file://' + path.resolve(ARQ));
await esperaPronto(pagina);

/* ---------- 0. o gerador existe ---------- */
const faltam = await pagina.evaluate(() =>
  ['relFolhaFonte', 'relPreencheTextos'].filter(n => typeof window[n] === 'undefined'));
ok('o gerador da folha existe', faltam.length === 0, 'faltam: ' + faltam.join(', '));
if (faltam.length) {
  console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)  (parou: falta a v3.364)');
  await b.close(); process.exit(1);
}

/* os dados de mentira. Nomes com < & " de proposito: e por causa deles que
   os textos entram por textContent, e o papel tem de passar por esse
   caminho tambem. */
const NOMES = ['3B <CROSS>', 'AÇAÍ & COCO', 'ARENA "X"', 'BLACK BOX', 'CROSS DUBAI'];
const monta = async cen => await pagina.evaluate(async c => {
  const pg = document.getElementById('relPage');
  pg.hidden = false;
  const area = document.querySelector('.area-paginas');
  if (area) area.style.display = 'none';
  REL.periodos = { anos: [2026], meses: c.meses, comMovimento: c.meses };
  REL.sel = { ano: 2026, meses: c.meses, mes: c.meses[0], dia: 0 };
  REL.filtro = { cliente: '', vend: '', dia: 0, tipo: '' };
  const itens = [];
  for (let i = 0; i < c.n; i++) itens.push({
    id: 'R' + i, dia: (i % 28) + 1, mes: c.meses[i % c.meses.length], ano: 2026,
    cliente: c.nomes[i % c.nomes.length] + ' ' + i,
    pedido: 'PD004' + (100 + i), vendedor: ['Lucas','Dani','Kev','Alam','Fabricio'][i % 5],
    arquivo: 'orc' + i + '.ft', subPecas: 40 + i, subValor: 3000 + i * 77,
    perPecas: 15 + (i % 9), perValor: 1200 + i * 41,
    mistos: (c.mistos && i % 5 === 0) ? [{ tags: ['sublimacao', 'silk'] }] : [] });
  REL.dados = { ano: 2026, meses: c.meses, mes: c.meses[0], dia: 0,
    geradoEm: '2026-08-30T02:36:00.000Z', itens, falhas: [] };
  REL.fora = new Set(c.fora || []);
  relDesenha();
  await new Promise(r => setTimeout(r, 400));

  /* A: como sempre, com o visualizador desenhado na tela */
  const nA = relMontaImpressao();
  const htmlA = (document.getElementById('relPrint') || {}).outerHTML || '';
  relDesmontaImpressao();

  /* B: com a PAGINA INTEIRA esvaziada. Desde a v3.365 a tela nem
     desenha mais uma folha, entao arrancar so o palco ja nao provaria
     nada: o que se prova aqui e que a impressao nao precisa de NADA do
     que esta no visualizador. */
  pg.innerHTML = '';
  const semFolhaNaTela = !pg.querySelector('.rel-folha');
  const nB = relMontaImpressao();
  const cx = document.getElementById('relPrint');
  const htmlB = cx ? cx.outerHTML : '';
  const folhas = cx ? [...cx.querySelectorAll('.folha')] : [];
  const detalhe = {
    cabPorFolha: folhas.map(f => f.querySelectorAll('.rel-cab').length),
    rodPorFolha: folhas.map(f => (f.querySelector('.rel-rod .pg')||{}).textContent),
    /* v3.370: os quatro resumos moram DENTRO do topo e se repetem em todas
       as folhas, como na Atividade. Antes so a primeira os tinha, e quem
       pegasse a folha 3 no chao de fabrica nao sabia de que periodo era. */
    resumosPorFolha: folhas.map(f => f.querySelectorAll('.rel-res .cx').length),
    rodapePorFolha: folhas.map(f => f.querySelectorAll('.rel-rod').length),
    theadPorFolha: folhas.map(f => f.querySelectorAll('thead').length),
    tfootTotal: cx ? cx.querySelectorAll('tfoot').length : -1,
    linhasTotal: cx ? cx.querySelectorAll('tbody tr[data-id]').length : -1,
    /* o texto do primeiro cliente, como chegou ao papel */
    /* no papel o cliente e texto, e nao botao: papel nao clica */
    primeiroCliente: folhas.length
      ? (folhas[0].querySelector('tbody tr[data-id] .cli') || {}).textContent : '',
    primeiroVend: folhas.length
      ? (folhas[0].querySelector('tbody tr[data-id] .vend') || {}).textContent : '',
    primeiroPed: folhas.length
      ? (folhas[0].querySelector('tbody tr[data-id] .ped') || {}).textContent : '',
    /* DUPLA ESCAPADA e o defeito de verdade: `<` vira `&lt;` na
       serializacao, e isso e o certo. Errado e `&amp;lt;`, que e o sinal
       de que o texto passou duas vezes pelo escapador e vai sair
       "3B &lt;CROSS&gt;" impresso na folha. */
    temEntidade: /&amp;lt;|&amp;amp;|&amp;quot;/.test(cx ? cx.innerHTML : ''),
  };
  relDesmontaImpressao();
  const sobrou = document.querySelectorAll('.rel-medindo, #relPrint').length;
  return { nA, nB, semFolhaNaTela, igual: htmlA === htmlB, tamanho: htmlA.length,
           detalhe, sobrou };
}, cen);

console.log('\n=== 1. O PAPEL NAO DEPENDE MAIS DA TELA ===');
/* OS NUMEROS DE FOLHAS SAO O GANHO DA v3.370, e por isso ficam escritos
   aqui: se um dia a folha voltar a inchar, e aqui que vai doer.

     cenario                        antes (v3.369)   agora
     um mes, 40 pedidos                    3           2
     dois meses somados, 60 pedidos       10           6
     com dois pedidos fora da conta        3           2
     com mistos, 24 pedidos                2           1
     140 pedidos                          22          13

   O conteudo e o mesmo; o que saiu foi peso: os quatro cartoes grandes, a
   barra de fatia, a legenda, o fundo das seis colunas de numero, a tarja
   escura da semana e o zebrado das linhas. */
const CENARIOS = [
  { nome: 'um mes, 40 pedidos',            meses: [8],    n: 40,  nomes: NOMES, folhas: 2  },
  { nome: 'dois meses somados, 60 pedidos', meses: [8, 9], n: 60,  nomes: NOMES, folhas: 6 },
  { nome: 'com dois pedidos fora da conta', meses: [8],    n: 30,  nomes: NOMES, folhas: 2,
    fora: ['R3', 'R7'] },
  { nome: 'com mistos e nomes com < & "',   meses: [8],    n: 24,  nomes: NOMES, folhas: 1,
    mistos: true },
  { nome: 'muitas folhas, 140 pedidos',     meses: [8, 9], n: 140, nomes: NOMES, folhas: 13 },
];
const guardado = [];
for (const c of CENARIOS) {
  const r = await monta(c);
  guardado.push({ c, r });
  ok('[' + c.nome + '] o visualizador saiu do documento', r.semFolhaNaTela === true);
  ok('  e o papel sai IDENTICO, caractere por caractere', r.igual === true,
     'A=' + r.nA + ' B=' + r.nB + ' tam=' + r.tamanho);
  ok('  com o mesmo numero de folhas dos dois jeitos', r.nA === r.nB,
     r.nA + ' vs ' + r.nB);
  ok('  e a paginacao continua dando ' + c.folhas + ' folha(s)', r.nB === c.folhas,
     String(r.nB));
  ok('  sem deixar lixo no documento', r.sobrou === 0, String(r.sobrou));
}

console.log('\n=== 2. CADA FOLHA CONTINUA COMPLETA ===');
const g = guardado[4].r.detalhe;      /* o cenario das 22 folhas */
ok('o cabecalho se repete em TODAS as folhas',
   g.cabPorFolha.every(v => v === 1) && g.cabPorFolha.length === 13,
   JSON.stringify(g.cabPorFolha.slice(0, 5)) + ' de ' + g.cabPorFolha.length);
ok('o cabecalho da tabela tambem',
   g.theadPorFolha.every(v => v === 1), JSON.stringify(g.theadPorFolha.slice(0, 5)));
ok('os quatro resumos se repetem em TODAS as folhas',
   g.resumosPorFolha.every(v => v === 4), JSON.stringify(g.resumosPorFolha.slice(0,5)));
ok('  e o rodape tambem, um por folha',
   g.rodapePorFolha.every(v => v === 1), JSON.stringify(g.rodapePorFolha.slice(0,5)));
ok('o total geral fecha uma vez so', g.tfootTotal === 1, String(g.tfootTotal));
ok('as 140 linhas cabem todas, sem perder nenhuma', g.linhasTotal === 140,
   String(g.linhasTotal));
ok('a numeracao vai de 1 a 13, na ordem',
   g.rodPorFolha.every((t, i) => t === 'Página ' + (i + 1) + ' de 13'),
   g.rodPorFolha.slice(0, 3).join(' | '));

console.log('\n=== 3. OS NOMES CHEGAM INTEIROS AO PAPEL ===');
const m = guardado[3].r.detalhe;      /* o cenario dos nomes com < & " */
ok('o cliente sai com os sinais como se escreve',
   m.primeiroCliente === '3B <CROSS> 0', m.primeiroCliente);
ok('  e nao virou entidade HTML pelo caminho', m.temEntidade === false);
ok('o vendedor sai preenchido', m.primeiroVend === 'Lucas', m.primeiroVend);
ok('e o numero do pedido tambem', m.primeiroPed === 'PD004100', m.primeiroPed);

console.log('\n=== 4. A TELA NAO E MAIS O PAPEL ===');
/* Na v3.364 esta conferencia dizia o contrario: a tela e o papel eram a
   MESMA string, e havia um aviso de que no dia em que a tela mudasse ela
   falharia de proposito. O dia chegou na v3.365. Agora ela cobra a
   separacao, que e o que se queria desde o comeco. */
const separado = await pagina.evaluate(async () => {
  const pg = document.getElementById('relPage');
  relDesenha();
  await new Promise(r => setTimeout(r, 400));
  const fonte = relFolhaFonte();
  return {
    /* a tela: uma lista, com cabecalho grudado e cartoes de semana */
    telaTemFolha: !!pg.querySelector('.rel-folha'),
    telaTemTopo: !!pg.querySelector('.rv-topo'),
    telaTemCartoes: pg.querySelectorAll('.rv-cart').length > 0,
    telaTemLinhas: pg.querySelectorAll('.rv-lin[data-id]').length,
    /* a folha: continua sendo a folha, montada a parte */
    fonteTemCab: !!fonte.querySelector('.rel-cab'),
    fonteTemCards: fonte.querySelectorAll('.rel-res .cx').length,
    fonteTemTabela: !!fonte.querySelector('.rel-tab'),
    fonteTemTopoDaTela: !!fonte.querySelector('.rv-topo'),
    /* e a escala e a barra fixa, que so existiam por causa do transform,
       nao estao mais em lugar nenhum */
    semEscala: typeof relAjustaEscala === 'undefined',
    semBarraFixa: typeof relSincronizaFixo === 'undefined' && !pg.querySelector('.rel-fixo'),
  };
});
ok('a tela nao desenha mais a folha', separado.telaTemFolha === false);
ok('  ela e uma lista, com cabecalho grudado', separado.telaTemTopo === true);
ok('  e cartoes de semana com linhas dentro',
   separado.telaTemCartoes === true && separado.telaTemLinhas === 140,
   String(separado.telaTemLinhas));
ok('a folha continua inteira, montada a parte',
   separado.fonteTemCab && separado.fonteTemTabela && separado.fonteTemCards === 4,
   JSON.stringify(separado));
ok('  e nada da tela vazou para dentro dela', separado.fonteTemTopoDaTela === false);
ok('a escala e a barra fixa sumiram, e nao ficaram mortas por perto',
   separado.semEscala === true && separado.semBarraFixa === true,
   'escala=' + separado.semEscala + ' barra=' + separado.semBarraFixa);

console.log('\n=== 5. IMPRIMINDO DE VERDADE, SO A FOLHA SAI ===');
/* A REGRESSAO QUE ESTA SECAO EXISTE PARA IMPEDIR (v3.365 -> v3.366).

   Ate a v3.364 o visualizador era `.rel-palco`, e havia uma regra so para
   ele: `body.rel-imprimindo .rel-palco{display:none}`. A v3.365 trocou o
   visualizador por outra coisa e NAO trocou a regra. A lista da tela
   passou a sair impressa junto com as folhas, e o papel dobrou de altura.

   As suites de entao olhavam o HTML das folhas montadas, e por isso nao
   viram nada: as folhas continuavam certas. O que estava errado era o que
   estava AO LADO delas na hora de imprimir.

   Entao esta secao imprime de verdade: liga a midia `print`, poe a classe
   `rel-imprimindo`, e mede o que sobrou visivel. */
await pagina.emulateMedia({ media: 'print' });
const papel = await pagina.evaluate(async () => {
  const pg = document.getElementById('relPage');
  pg.hidden = false;
  relDesenha();
  await new Promise(r => setTimeout(r, 400));
  const altura = pg.scrollHeight;         /* antes de imprimir */
  document.body.classList.add('rel-imprimindo');
  const folhas = relMontaImpressao();
  await new Promise(r => setTimeout(r, 200));
  const vis = e => { const c = getComputedStyle(e);
    return c.display !== 'none' && c.visibility !== 'hidden'
      && e.getBoundingClientRect().height > 0; };
  const sobrou = [...pg.children]
    .filter(e => !e.classList.contains('rel-print') && vis(e))
    .map(e => e.className || e.tagName);
  const cx = document.getElementById('relPrint');
  const r = {
    folhas,
    /* NADA da tela pode estar visivel ao lado das folhas */
    sobrouNaFolha: sobrou,
    /* e a pagina inteira tem de medir o mesmo que as folhas: se medir
       mais, e porque tem coisa impressa embaixo delas */
    alturaPagina: Math.round(pg.scrollHeight),
    alturaFolhas: Math.round(cx ? cx.scrollHeight : 0),
    /* a folha comeca na margem zero: recuo de tela nao vaza para o papel */
    recuoFolha: Math.round(cx.querySelector('.folha').getBoundingClientRect().left
                           - pg.getBoundingClientRect().left),
    recuoPagina: getComputedStyle(pg).padding,
    /* e a tela, sem imprimir, continua com o recuo dela */
    alturaTela: Math.round(altura),
  };
  document.body.classList.remove('rel-imprimindo');
  relDesmontaImpressao();
  return r;
});
await pagina.emulateMedia({ media: 'screen' });
ok('nenhuma peca da tela sobra visivel no papel',
   papel.sobrouNaFolha.length === 0, JSON.stringify(papel.sobrouNaFolha));
ok('  e a pagina impressa mede exatamente o que as folhas medem',
   papel.alturaPagina === papel.alturaFolhas,
   papel.alturaPagina + ' vs ' + papel.alturaFolhas);
ok('a folha comeca na margem zero do papel', papel.recuoFolha === 0,
   String(papel.recuoFolha));
ok('  porque o recuo da tela nao vale na impressao',
   papel.recuoPagina === '0px', papel.recuoPagina);

console.log('\n=== 5b. NADA CRUZA O RODAPE (v3.373) ===');
/* A REGUA MEDIA A LINHA ERRADA.

   `cabe()` perguntava pela ultima linha do TBODY. O TOTAL GERAL nao mora
   no tbody, mora no tfoot, e vem depois dele no papel: a regua olhava a
   ultima linha de dados, via que cabia, e o total geral era desenhado
   ATRAVESSANDO o texto do rodape na ultima folha. De todo relatorio.

   Aqui a conferencia nao pergunta ao HTML se a regra existe. Ela monta as
   folhas de verdade, mede a ultima linha de cada uma contra o rodape, e
   cobra que sobre folga. E a unica forma de ver isto: o HTML das folhas
   estava certo o tempo todo. */
const cruzou = async cen => await pagina.evaluate(async c => {
  const nomes = ['LADO DE FORA','LETICIA JUMPERS','LETICIA JUMPERS ARTESANAL',
                 'SOLDISBEL','UMBROKEN FUNCIONAL'];
  REL.periodos = { anos:[2026], meses:c.meses, comMovimento:c.meses };
  REL.sel = { ano:2026, meses:c.meses, mes:c.meses[0], dia:0 };
  REL.filtro = { cliente:'', vend:'', dia:0, tipo:'' };
  const itens = [];
  for (let i = 0; i < c.n; i++) itens.push({
    id:'R'+i, dia:(i%28)+1, mes:c.meses[i%c.meses.length], ano:2026,
    cliente:nomes[i%nomes.length], pedido:'PD004'+(100+i),
    vendedor:['Lucas','Dani','Kev','Alam','Fabricio'][i%5], arquivo:'orc'+i+'.ft',
    subPecas:40+i, subValor:3000+i*77, perPecas:15+(i%9), perValor:1200+i*41, mistos:[] });
  REL.dados = { ano:2026, meses:c.meses, mes:c.meses[0], dia:0,
    geradoEm:'2026-08-30T02:36:00.000Z', itens, falhas:[] };
  REL.fora = new Set();
  relDesenha();
  await new Promise(r => setTimeout(r, 150));
  relDesmontaImpressao();
  relMontaImpressao();
  document.body.classList.add('rel-imprimindo');
  const maus = [];
  document.querySelectorAll('#relPrint .folha').forEach((f, i) => {
    const rod = f.querySelector('.rel-rod');
    const trs = f.querySelectorAll('tbody tr, tfoot tr');
    const ult = trs[trs.length - 1];
    if (!ult || !rod) return;
    const folga = rod.getBoundingClientRect().top - ult.getBoundingClientRect().bottom;
    if (folga < 0) maus.push('folha ' + (i+1) + ' (' +
      (ult.parentElement.tagName === 'TFOOT' ? 'total geral' : 'linha') +
      ') cruza ' + folga.toFixed(1) + 'px');
  });
  document.body.classList.remove('rel-imprimindo');
  relDesmontaImpressao();
  return maus;
}, cen);

/* Estes numeros nao sao decorativos: sao os que a varredura pegou com o
   total geral por cima do rodape. 50 dava -9.9px, 102 dava -12.7px. */
for (const cen of [{ n:25, meses:[8] }, { n:50, meses:[8] }, { n:102, meses:[8] },
                   { n:154, meses:[8] }, { n:22, meses:[7,8] }, { n:66, meses:[7,8] }]) {
  const maus = await cruzou(cen);
  ok('nada cruza o rodape com ' + cen.n + ' pedidos em ' + cen.meses.length + ' mes(es)',
     maus.length === 0, maus.join(' · '));
}

/* e a regua tem de olhar o tfoot ANTES do tbody: invertida, ela volta a
   medir a linha errada sem que nenhuma folha pareca diferente */
const regua = await pagina.evaluate(() => {
  /* a funcao inteira, e nao um pedaco: o comentario que explica o conserto
     e maior que qualquer fatia que se escolha, e cortava a linha medida */
  const t = String(window.relMontaImpressao).replace(/\s+/g, ' ');
  return {
    tfootPrimeiro: /tfoot tr:last-child'\) *\|\| *tbody\.lastElementChild/.test(t),
  };
});
ok('a regua olha o total geral antes da ultima linha de dados',
   regua.tfootPrimeiro, JSON.stringify(regua));

/* e o rodape e opaco: mesmo que algo transborde, o texto dele continua legivel */
const rodOpaco = await pagina.evaluate(async () => {
  relDesenha();
  await new Promise(r => setTimeout(r, 120));
  relMontaImpressao();
  const rod = document.querySelector('#relPrint .rel-rod');
  const c = rod ? getComputedStyle(rod) : null;
  const r = c ? { bg:c.backgroundColor, z:c.zIndex, pos:c.position } : null;
  relDesmontaImpressao();
  return r;
});
ok('o rodape do papel e opaco e fica por cima',
   !!rodOpaco && rodOpaco.bg === 'rgb(255, 255, 255)' && rodOpaco.z !== 'auto',
   JSON.stringify(rodOpaco));

console.log('\n=== 6. O CAMINHO DA IMPRESSAO CONTINUA INTEIRO ===');
const caminho = await pagina.evaluate(() => ({
  monta: typeof relMontaImpressao === 'function',
  desmonta: typeof relDesmontaImpressao === 'function',
  imprime: typeof relImprime === 'function',
  /* a folha do papel continua com a largura natural da A4 deitada, sem escala */
  natural: getComputedStyle(document.documentElement).getPropertyValue('--rel-natural').trim(),
}));
ok('as tres pecas da impressao continuam la',
   caminho.monta && caminho.desmonta && caminho.imprime, JSON.stringify(caminho));

console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
if (erros.length) { console.log('  erros de pagina: ' + erros.slice(0, 3).join(' // ')); falhas++; }
await b.close();
process.exit(falhas ? 1 : 0);
