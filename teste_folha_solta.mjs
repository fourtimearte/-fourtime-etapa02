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

  /* B: com o visualizador ARRANCADO do documento */
  const palco = pg.querySelector('.rel-palco');
  if (palco) palco.remove();
  const semFolhaNaTela = !pg.querySelector('.rel-folha');
  const nB = relMontaImpressao();
  const cx = document.getElementById('relPrint');
  const htmlB = cx ? cx.outerHTML : '';
  const folhas = cx ? [...cx.querySelectorAll('.folha')] : [];
  const detalhe = {
    cabPorFolha: folhas.map(f => f.querySelectorAll('.rel-cab').length),
    rodPorFolha: folhas.map(f => f.querySelector('.rodape-pg').textContent),
    cardsPrimeira: folhas.length ? folhas[0].querySelectorAll('.rel-cards .rel-card').length : -1,
    cardsSegunda: folhas.length > 1 ? folhas[1].querySelectorAll('.rel-cards').length : -1,
    theadPorFolha: folhas.map(f => f.querySelectorAll('thead').length),
    tfootTotal: cx ? cx.querySelectorAll('tfoot').length : -1,
    linhasTotal: cx ? cx.querySelectorAll('tbody tr[data-id]').length : -1,
    /* o texto do primeiro cliente, como chegou ao papel */
    primeiroCliente: folhas.length
      ? (folhas[0].querySelector('tbody tr[data-id] .cli .rel-abrir') || {}).textContent : '',
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
/* os numeros de folhas sao os mesmos medidos na v3.363, antes da mudanca */
const CENARIOS = [
  { nome: 'um mes, 40 pedidos',            meses: [8],    n: 40,  nomes: NOMES, folhas: 3  },
  { nome: 'dois meses somados, 60 pedidos', meses: [8, 9], n: 60,  nomes: NOMES, folhas: 10 },
  { nome: 'com dois pedidos fora da conta', meses: [8],    n: 30,  nomes: NOMES, folhas: 3,
    fora: ['R3', 'R7'] },
  { nome: 'com mistos e nomes com < & "',   meses: [8],    n: 24,  nomes: NOMES, folhas: 2,
    mistos: true },
  { nome: 'muitas folhas, 140 pedidos',     meses: [8, 9], n: 140, nomes: NOMES, folhas: 22 },
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
   g.cabPorFolha.every(v => v === 1) && g.cabPorFolha.length === 22,
   JSON.stringify(g.cabPorFolha.slice(0, 5)) + ' de ' + g.cabPorFolha.length);
ok('o cabecalho da tabela tambem',
   g.theadPorFolha.every(v => v === 1), JSON.stringify(g.theadPorFolha.slice(0, 5)));
ok('os quatro cartoes so na PRIMEIRA folha',
   g.cardsPrimeira === 4 && g.cardsSegunda === 0,
   g.cardsPrimeira + ' / ' + g.cardsSegunda);
ok('o total geral fecha uma vez so', g.tfootTotal === 1, String(g.tfootTotal));
ok('as 140 linhas cabem todas, sem perder nenhuma', g.linhasTotal === 140,
   String(g.linhasTotal));
ok('a numeracao vai de 1 a 22, na ordem',
   g.rodPorFolha.every((t, i) => t === 'Página ' + (i + 1) + ' de 22'),
   g.rodPorFolha.slice(0, 3).join(' | '));

console.log('\n=== 3. OS NOMES CHEGAM INTEIROS AO PAPEL ===');
const m = guardado[3].r.detalhe;      /* o cenario dos nomes com < & " */
ok('o cliente sai com os sinais como se escreve',
   m.primeiroCliente === '3B <CROSS> 0', m.primeiroCliente);
ok('  e nao virou entidade HTML pelo caminho', m.temEntidade === false);
ok('o vendedor sai preenchido', m.primeiroVend === 'Lucas', m.primeiroVend);
ok('e o numero do pedido tambem', m.primeiroPed === 'PD004100', m.primeiroPed);

console.log('\n=== 4. A TELA E O PAPEL AINDA SAO O MESMO DESENHO, HOJE ===');
/* Hoje os dois chamam o mesmo gerador. Esta conferencia registra isso: no
   dia em que a tela mudar, ela FALHA de proposito, e quem mudar vai ler
   aqui que o papel nao mudou junto e que isso e o esperado. */
const espelho = await pagina.evaluate(async () => {
  const pg = document.getElementById('relPage');
  relDesenha();
  await new Promise(r => setTimeout(r, 350));
  const naTela = pg.querySelector('.rel-folha');
  const fonte = relFolhaFonte();
  const limpa = e => e.innerHTML.replace(/\s+/g, ' ').trim();
  return { igual: limpa(naTela) === limpa(fonte),
           tamTela: limpa(naTela).length, tamFonte: limpa(fonte).length };
});
ok('a folha da tela e a folha do papel sao a mesma, por enquanto',
   espelho.igual === true, espelho.tamTela + ' vs ' + espelho.tamFonte);

console.log('\n=== 5. O CAMINHO DA IMPRESSAO CONTINUA INTEIRO ===');
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
