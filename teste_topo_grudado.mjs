/* ================================================================
   O CABECALHO UNICO, GRUDADO (v3.363)

   A maquete v6 foi aprovada com quatro promessas, e sao elas que esta
   suite cobra, uma a uma, medindo em vez de olhar:

     1. UM CABECALHO SO. Titulo, os quatro numeros e a fileira de colunas
        vivem dentro do mesmo cartao, e e o cartao inteiro que gruda. Antes
        so a fileira de colunas grudava, e ela sozinha nao diz de que
        semana e nem quantas pecas ha.

     2. ELE ENCOLHE, NAO SOME. Grudado, o titulo diminui e os numeros
        perdem a barra e a altura. A fileira de colunas NAO muda de
        tamanho: e dela que a lista depende para ser lida.

     3. A LISTA NAO ANDA UM PIXEL. Varrendo o limiar de ida e de volta, o
        deslocamento tem de ser ZERO e as trocas de estado, DUAS. Qualquer
        numero maior de trocas e a tremedeira voltando.

     4. O CINZA SO EXISTE GRUDADO. Parado, o cartao e da cor das outras
        caixas do editor. E ha um tom para cada tema.

   E cobra uma quinta coisa que nao e da maquete: que as classes de que as
   outras suites dependem (.atv-card.c-pec .val, .atv-satbar i,
   .atv-cab-lista > span) continuam existindo, no mesmo lugar. Foi a
   condicao para mexer aqui sem quebrar nada.
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
const pagina = await b.newPage({ viewport: { width: 1600, height: 820 } });
const erros = [];
pagina.on('pageerror', e => erros.push(String(e).slice(0, 180)));
await pagina.goto(path.isAbsolute(ARQ) ? 'file://' + ARQ : 'file://' + path.resolve(ARQ));
await esperaPronto(pagina);

/* ---------- 0. as pecas existem ---------- */
const faltam = await pagina.evaluate(() =>
  ['atvLigaTopo'].filter(n => typeof window[n] === 'undefined'));
ok('a peca de grudar existe', faltam.length === 0, 'faltam: ' + faltam.join(', '));
if (faltam.length) {
  console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)  (parou: falta a v3.363)');
  await b.close(); process.exit(1);
}

/* ---------- a semana de mentira ----------
   Trinta pedidos em seis dias: o bastante para a pagina rolar de verdade
   numa janela de 820px, que e o que a prova pede. */
const abre = async () => await pagina.evaluate(() => {
  ATV.hojeFixo = '2026-08-19';
  ATV.semana = '2026-08-17';
  const dias = ['17','18','19','20','21','22'];
  const linhas = [];
  for (let i = 0; i < 30; i++) {
    const d = dias[i % 6];
    linhas.push({ id: 'ID' + i, pedido: 'PD0041' + String(i).padStart(2,'0'),
      cliente: 'CLIENTE ' + (i+1), departamento: 'Sublimação',
      entrega: '2026-08-' + d, plan: '2026-08-' + d, planManual: false,
      etapa: '', sub: 40 + i, per: 20 + i, total: 60 + i * 2,
      mexidoEm: '', novo: false, rolado: false });
  }
  ATV.linhas = linhas; ATV.todasDaSemana = linhas.slice();
  const pg = document.getElementById('atvPage');
  pg.hidden = false;
  const area = document.querySelector('.area-paginas');
  if (area) area.style.display = 'none';
  atvDesenha();
});
await abre();
await pagina.waitForTimeout(400);

console.log('\n=== 1. UM CABECALHO SO ===');
const um = await pagina.evaluate(() => {
  const pg = document.getElementById('atvPage');
  const topo = pg.querySelector('.atv-topo');
  const dentro = s => !!(topo && topo.querySelector(s));
  return {
    filhos: [...pg.children].map(e => e.className.split(' ')[0]).slice(0, 4),
    grudavel: topo ? getComputedStyle(topo).position : '',
    cab: dentro('.atv-cab'), cards: dentro('.atv-cards'), lista: dentro('.atv-cab-lista'),
    /* a fileira de colunas nao gruda mais sozinha */
    listaSolta: getComputedStyle(pg.querySelector('.atv-cab-lista')).position,
    /* uma so caixa desenhada, e nao tres */
    cartaoUnico: pg.querySelectorAll('.atv-flut').length,
    ancora: getComputedStyle(pg).overflowAnchor,
  };
});
ok('a sentinela vem antes do cabecalho', um.filhos[0] === 'atv-sentinela', JSON.stringify(um.filhos));
ok('  e o vao logo depois dele', um.filhos[2] === 'atv-vao', JSON.stringify(um.filhos));
ok('o cabecalho e grudado', um.grudavel === 'sticky', um.grudavel);
ok('  e traz o titulo dentro', um.cab === true);
ok('  os quatro numeros dentro', um.cards === true);
ok('  e a fileira de colunas dentro', um.lista === true);
ok('a fileira de colunas nao gruda mais sozinha', um.listaSolta === 'static', um.listaSolta);
ok('e o desenho e de UM cartao, nao tres', um.cartaoUnico === 1, String(um.cartaoUnico));
ok('a ancora de rolagem do navegador esta desligada', um.ancora === 'none', um.ancora);

console.log('\n=== 2. ELE ENCOLHE, NAO SOME ===');
const enc = await pagina.evaluate(async () => {
  const pg = document.getElementById('atvPage');
  const topo = pg.querySelector('.atv-topo');
  const esp = () => new Promise(r => setTimeout(r, 120));
  const medir = () => ({
    titulo: parseFloat(getComputedStyle(topo.querySelector('.atv-cab h2')).fontSize),
    valor: parseFloat(getComputedStyle(topo.querySelector('.atv-card .val')).fontSize),
    barra: getComputedStyle(topo.querySelector('.atv-satbar')).display,
    colunas: parseFloat(getComputedStyle(topo.querySelector('.atv-cab-lista')).fontSize),
    alto: Math.round(topo.getBoundingClientRect().height),
    /* nada some: os quatro numeros continuam na tela */
    numeros: [...topo.querySelectorAll('.atv-card .val')].map(e => e.textContent),
  });
  pg.scrollTop = 0; await esp();
  const parado = medir();
  pg.scrollTop = 320; await esp();
  const grudado = medir();
  pg.scrollTop = 0; await esp();
  return { parado, grudado };
});
ok('o titulo diminui ao grudar', enc.grudado.titulo < enc.parado.titulo,
   enc.parado.titulo + ' -> ' + enc.grudado.titulo);
ok('o numero diminui ao grudar', enc.grudado.valor < enc.parado.valor,
   enc.parado.valor + ' -> ' + enc.grudado.valor);
ok('a barra de saturacao sai', enc.parado.barra !== 'none' && enc.grudado.barra === 'none',
   enc.parado.barra + ' -> ' + enc.grudado.barra);
ok('a fileira de colunas NAO encolhe', enc.grudado.colunas === enc.parado.colunas,
   enc.parado.colunas + ' -> ' + enc.grudado.colunas);
ok('o cabecalho fica mais baixo', enc.grudado.alto < enc.parado.alto,
   enc.parado.alto + ' -> ' + enc.grudado.alto);
ok('e os quatro numeros continuam a vista',
   JSON.stringify(enc.grudado.numeros) === JSON.stringify(enc.parado.numeros)
   && enc.grudado.numeros.length === 4, JSON.stringify(enc.grudado.numeros));

console.log('\n=== 3. A LISTA NAO ANDA UM PIXEL ===');
const tre = await pagina.evaluate(async () => {
  const pg = document.getElementById('atvPage');
  const topo = pg.querySelector('.atv-topo');
  const esp = () => new Promise(r => requestAnimationFrame(
    () => requestAnimationFrame(() => setTimeout(r, 40))));
  let trocas = 0, ant = topo.classList.contains('grudado');
  const mo = new MutationObserver(() => {
    const v = topo.classList.contains('grudado');
    if (v !== ant) { trocas++; ant = v; }
  });
  mo.observe(topo, { attributes: true, attributeFilter: ['class'] });
  /* o marco e a primeira linha da lista: marco + scrollTop e uma constante
     enquanto a lista nao andar */
  const marco = () => Math.round(pg.querySelector('.atv-linha').getBoundingClientRect().top);
  const passos = [0,1,2,4,8,12,16,20,24,32,64,120,220,120,64,32,24,20,16,12,8,4,2,1,0];
  let base = null; const desvios = []; let grampeou = 0;
  for (const y of passos) {
    pg.scrollTop = y; await esp();
    if (pg.scrollTop !== y) grampeou++;
    const s = marco() + pg.scrollTop;
    if (base === null) base = s; else desvios.push(Math.abs(s - base));
  }
  mo.disconnect();
  pg.scrollTop = 0; await esp();
  return { trocas, maiorDesvio: Math.max(...desvios), grampeou };
});
ok('a lista nao se move NENHUM pixel', tre.maiorDesvio === 0, String(tre.maiorDesvio));
ok('o navegador nao grampeia a rolagem', tre.grampeou === 0, String(tre.grampeou));
ok('duas trocas de estado, o minimo possivel', tre.trocas === 2, String(tre.trocas));

console.log('\n=== 4. O CINZA SO EXISTE GRUDADO ===');
const cor = await pagina.evaluate(async () => {
  const pg = document.getElementById('atvPage');
  const topo = pg.querySelector('.atv-topo');
  const esp = () => new Promise(r => setTimeout(r, 260));
  const ler = () => ({
    flut: getComputedStyle(topo.querySelector('.atv-flut')).backgroundColor,
    cards: getComputedStyle(topo.querySelector('.atv-cards')).backgroundColor,
    sombra: getComputedStyle(topo.querySelector('.atv-flut')).boxShadow,
  });
  const caixa = getComputedStyle(pg.querySelector('.atv-dia')).backgroundColor;
  const pag = getComputedStyle(pg).backgroundColor;
  pg.scrollTop = 0; await esp(); const parado = ler();
  pg.scrollTop = 320; await esp(); const grudado = ler();
  pg.scrollTop = 0; await esp(); const voltou = ler();
  return { parado, grudado, voltou, caixa, pag };
});
const luz = s => { const m = s.match(/\d+/g) || [0,0,0];
  return (+m[0] * 299 + +m[1] * 587 + +m[2] * 114) / 1000; };
ok('parado, o cabecalho e da cor das outras caixas', cor.parado.flut === cor.caixa,
   cor.parado.flut + ' vs ' + cor.caixa);
ok('grudado, ele muda de cor', cor.grudado.flut !== cor.parado.flut,
   cor.parado.flut + ' -> ' + cor.grudado.flut);
ok('  e escurece um degrau no tema claro', luz(cor.grudado.flut) < luz(cor.parado.flut) - 4,
   luz(cor.parado.flut).toFixed(0) + ' -> ' + luz(cor.grudado.flut).toFixed(0));
ok('  a faixa dos numeros escurece mais que o corpo',
   luz(cor.grudado.cards) < luz(cor.grudado.flut),
   luz(cor.grudado.flut).toFixed(0) + ' / ' + luz(cor.grudado.cards).toFixed(0));
/* O QUE SEPARA O GRUDADO DA PAGINA NAO E A COR, E A SOMBRA.
   Esta conferencia ja cobrou o contrario, e estava errada: na maquete v6 o
   cabecalho grudado fica praticamente da COR DA PAGINA (245.6 contra
   243.4) e quem o descola e a sombra com a borda. O que tem de ser grande
   e o degrau entre PARADO e GRUDADO, que e a promessa "o cinza so aparece
   quando gruda". Medido na maquete: 11.6. Aqui: 11.1. */
ok('  o degrau entre parado e grudado e do tamanho do da maquete',
   luz(cor.parado.flut) - luz(cor.grudado.flut) >= 9,
   (luz(cor.parado.flut) - luz(cor.grudado.flut)).toFixed(1));
ok('  e a pagina fica um degrau abaixo do cartao parado, para o recuo se ver',
   luz(cor.parado.flut) - luz(cor.pag) >= 5,
   (luz(cor.parado.flut) - luz(cor.pag)).toFixed(1) + '  (pagina ' + cor.pag + ')');
ok('  e ganha sombra', cor.grudado.sombra !== 'none' && cor.grudado.sombra !== cor.parado.sombra);
ok('soltando, o branco volta', cor.voltou.flut === cor.parado.flut,
   cor.voltou.flut + ' vs ' + cor.parado.flut);

console.log('\n=== 5. O TEMA ESCURO TEM O SEU TOM ===');
const esc = await pagina.evaluate(async () => {
  const pg = document.getElementById('atvPage');
  const topo = pg.querySelector('.atv-topo');
  const esp = () => new Promise(r => setTimeout(r, 260));
  const antes = document.body.dataset.tema || '';
  document.body.dataset.tema = 'escuro';
  await esp();
  pg.scrollTop = 0; await esp();
  const parado = getComputedStyle(topo.querySelector('.atv-flut')).backgroundColor;
  pg.scrollTop = 320; await esp();
  const grudado = getComputedStyle(topo.querySelector('.atv-flut')).backgroundColor;
  pg.scrollTop = 0; await esp();
  if (antes) document.body.dataset.tema = antes; else delete document.body.dataset.tema;
  await esp();
  return { parado, grudado };
});
ok('no escuro os dois estados tambem diferem', esc.grudado !== esc.parado,
   esc.parado + ' -> ' + esc.grudado);
ok('  e no escuro o degrau e para CIMA', luz(esc.grudado) > luz(esc.parado),
   luz(esc.parado).toFixed(0) + ' -> ' + luz(esc.grudado).toFixed(0));

console.log('\n=== 6. O QUE AS OUTRAS SUITES COBRAM CONTINUA NO LUGAR ===');
await pagina.evaluate(() => { document.getElementById('atvPage').scrollTop = 0; });
await pagina.waitForTimeout(250);
const velho = await pagina.evaluate(() => {
  const t = s => (document.querySelector(s) || {}).textContent || '';
  return {
    cartoes: document.querySelectorAll('.atv-card').length,
    pec: t('.atv-card.c-pec .val'), pecPe: t('.atv-card.c-pec .pe'),
    capPe: t('.atv-card.c-cap .pe'), sat: t('.atv-card.c-sat .val'),
    pedPe: t('.atv-card.c-ped .pe'),
    satId: !!document.getElementById('atvCardSat'),
    barra: (document.querySelector('.atv-satbar i') || {}).style
             ? document.querySelector('.atv-satbar i').style.width : '',
    colunas: [...document.querySelectorAll('.atv-cab-lista > span')].map(s => s.textContent),
    linhas: document.querySelectorAll('.atv-linha').length,
    dias: document.querySelectorAll('.atv-dia').length,
  };
});
ok('os quatro cartoes continuam quatro', velho.cartoes === 4, String(velho.cartoes));
ok('  com valor e conta em cada um',
   !!velho.pec && !!velho.pecPe && !!velho.capPe && !!velho.sat && !!velho.pedPe,
   JSON.stringify(velho));
ok('  o cartao de saturacao mantem o id', velho.satId === true);
ok('  a barra de saturacao mantem a largura medida', /%$/.test(velho.barra), velho.barra);
/* ONZE desde a v3.372: a coluna Aviso entrou entre Nome e Departamento.
   Ela nao cabe em Atualizacao, onde mora a ETAPA: etapa diz ONDE o pedido
   esta, aviso diz o que esta ATRAPALHANDO, e as duas coisas acontecem ao
   mesmo tempo. */
ok('as onze colunas continuam com os mesmos nomes',
   JSON.stringify(velho.colunas) === JSON.stringify(
     ['','Pedido','Nome','Aviso','Departamento','Entrega','Planejamento','Total','Subl.','Person.','Atualização']),
   JSON.stringify(velho.colunas));
ok('os seis dias e as trinta linhas continuam desenhados',
   velho.dias === 6 && velho.linhas === 30, velho.dias + ' dias, ' + velho.linhas + ' linhas');

console.log('\n=== 7. O RELATORIO DE PEDIDOS GANHOU O MESMO CABECALHO ===');
/* Ate a v3.364 esta pagina mostrava a FOLHA IMPRESSA reduzida por
   transform:scale(), e por isso nao podia receber a maquete: transform
   anula position:sticky, e o cabecalho precisava de uma barra a parte.
   Desde que a impressao se soltou da tela (v3.364), a tela e livre. */
const rel = await pagina.evaluate(async () => {
  const pg = document.getElementById('relPage');
  pg.hidden = false;
  REL.periodos = { anos: [2026], meses: [8,9], comMovimento: [8,9] };
  REL.sel = { ano: 2026, meses: [8,9], mes: 8, dia: 0 };
  REL.filtro = { vendedor:'', cliente:'', dia:0, tipo:'' };
  const it = (i,mes,dia) => ({ id:'R'+i, dia, mes, ano:2026,
    cliente:'CLIENTE DE NOME BEM COMPRIDO '+i, pedido:'PD004'+(100+i),
    vendedor:['Lucas','Dani','Kev','Alam','Fabricio'][i%5], arquivo:'a'+i+'.ft',
    subPecas:80+i, subValor:6000+i*90, perPecas:30+i, perValor:2500+i*70, mistos:[] });
  REL.dados = { ano:2026, meses:[8,9], mes:8, dia:0, geradoEm:'2026-08-30T02:36:00Z',
    itens: [...Array(60)].map((_,i) => it(i+1, i<30?8:9, (i%28)+1)), falhas:[] };
  REL.fora = new Set();
  relDesenha();
  await new Promise(r => setTimeout(r, 500));
  const topo = pg.querySelector('.rv-topo');
  const esp = () => new Promise(r => setTimeout(r, 260));
  const medir = () => ({
    titulo: parseFloat(getComputedStyle(topo.querySelector('.rv-cab h2')).fontSize),
    valor: parseFloat(getComputedStyle(topo.querySelector('.rv-m .v')).fontSize),
    colunas: parseFloat(getComputedStyle(topo.querySelector('.rv-cabc')).fontSize),
    flut: getComputedStyle(topo.querySelector('.rv-flut')).backgroundColor,
    nums: getComputedStyle(topo.querySelector('.rv-nums')).backgroundColor,
    alto: Math.round(topo.getBoundingClientRect().height),
  });
  pg.scrollTop = 0; await esp(); const parado = medir();
  pg.scrollTop = 400; await esp(); const grudado = medir();
  pg.scrollTop = 0; await esp();

  /* a tremedeira, medida do mesmo jeito que na Atividade */
  const esp2 = () => new Promise(r => requestAnimationFrame(
    () => requestAnimationFrame(() => setTimeout(r, 40))));
  let trocas = 0, ant = topo.classList.contains('grudado');
  const mo = new MutationObserver(() => {
    const v = topo.classList.contains('grudado');
    if (v !== ant) { trocas++; ant = v; } });
  mo.observe(topo, { attributes:true, attributeFilter:['class'] });
  const marco = () => Math.round(pg.querySelector('.rv-lin[data-id]').getBoundingClientRect().top);
  let base = null; const desvios = []; let grampeou = 0;
  for (const y of [0,1,2,4,8,12,16,20,24,32,64,120,220,120,64,32,24,20,16,12,8,4,2,1,0]) {
    pg.scrollTop = y; await esp2();
    if (pg.scrollTop !== y) grampeou++;
    const v = marco() + pg.scrollTop;
    if (base === null) base = v; else desvios.push(Math.abs(v - base));
  }
  mo.disconnect();
  pg.scrollTop = 0; await esp2();

  const larg = sel => [...document.querySelector(sel).children]
    .map(e => Math.round(e.getBoundingClientRect().width));
  const esq = sel => Math.round(document.querySelector(sel).getBoundingClientRect().left);
  return {
    parado, grudado, trocas, maiorDesvio: Math.max(...desvios), grampeou,
    cartoes: pg.querySelectorAll('.rv-cart').length,
    linhas: pg.querySelectorAll('.rv-lin[data-id]').length,
    subtotais: pg.querySelectorAll('.rv-sub').length,
    meses: [...pg.querySelectorAll('.rv-grp .ms')].map(e => e.textContent),
    cabc: larg('.rv-cabc'), lin: larg('.rv-lin[data-id]'), sub: larg('.rv-sub'),
    esqCab: esq('.rv-cabc'), esqLin: esq('.rv-lin[data-id]'),
    cortadas: [...pg.querySelectorAll('.rv-lin > *')]
      .filter(e => e.scrollWidth > e.clientWidth + 1).length,
    semFolha: !pg.querySelector('.rel-folha'),
    semBarraFixa: !pg.querySelector('.rel-fixo'),
    espelho: !!pg.querySelector('.rel-topo #relAno'),
    espelhoEscondido: getComputedStyle(pg.querySelector('.rel-topo')).display,
  };
});
ok('a folha saiu da tela', rel.semFolha === true);
ok('  e a barra fixa foi junto', rel.semBarraFixa === true);
ok('  mas o espelho escondido dos filtros ficou',
   rel.espelho === true && rel.espelhoEscondido === 'none', rel.espelhoEscondido);
/* 60 pedidos, dias 1 a 28, dois meses: cinco semanas em cada mes, mais o
   cartao do total geral fechando a lista */
ok('a semana virou cartao, como o dia da Atividade',
   rel.cartoes === 11 && rel.subtotais === 11,
   rel.cartoes + ' cartoes, ' + rel.subtotais + ' subtotais');
ok('  com as 60 linhas dentro', rel.linhas === 60, String(rel.linhas));
ok('  e o mes na frente da semana, porque sao dois meses somados',
   rel.meses.length === 10 && rel.meses[0] === 'Agosto'
   && rel.meses[rel.meses.length-1] === 'Setembro', JSON.stringify(rel.meses));
ok('o titulo diminui ao grudar', rel.grudado.titulo < rel.parado.titulo,
   rel.parado.titulo + ' -> ' + rel.grudado.titulo);
ok('o numero diminui ao grudar', rel.grudado.valor < rel.parado.valor,
   rel.parado.valor + ' -> ' + rel.grudado.valor);
ok('a fileira de colunas NAO encolhe', rel.grudado.colunas === rel.parado.colunas,
   rel.parado.colunas + ' -> ' + rel.grudado.colunas);
ok('o cabecalho fica mais baixo', rel.grudado.alto < rel.parado.alto,
   rel.parado.alto + ' -> ' + rel.grudado.alto);
ok('o cinza so aparece grudado', rel.grudado.flut !== rel.parado.flut
   && luz(rel.grudado.flut) < luz(rel.parado.flut) - 4,
   rel.parado.flut + ' -> ' + rel.grudado.flut);
ok('  e a faixa dos numeros escurece mais que o corpo',
   luz(rel.grudado.nums) < luz(rel.grudado.flut),
   luz(rel.grudado.flut).toFixed(0) + ' / ' + luz(rel.grudado.nums).toFixed(0));
ok('a lista nao se move NENHUM pixel', rel.maiorDesvio === 0, String(rel.maiorDesvio));
ok('  sem grampear a rolagem', rel.grampeou === 0, String(rel.grampeou));
ok('  e com duas trocas de estado, o minimo possivel', rel.trocas === 2, String(rel.trocas));
ok('as colunas do cabecalho batem com as da linha',
   JSON.stringify(rel.cabc) === JSON.stringify(rel.lin),
   JSON.stringify(rel.cabc) + ' vs ' + JSON.stringify(rel.lin));
ok('  e com as do subtotal', JSON.stringify(rel.sub) === JSON.stringify(rel.lin),
   JSON.stringify(rel.sub));
ok('  na mesma margem esquerda', rel.esqCab === rel.esqLin, rel.esqCab + ' vs ' + rel.esqLin);
ok('nenhuma celula corta o proprio conteudo', rel.cortadas === 0, String(rel.cortadas));

console.log('\n=== 7b. NADA SE METE ENTRE O CABECALHO E A PRIMEIRA SEMANA ===');
/* A nota dos mistos explicava o asterisco e, para isso, se punha entre o
   cabecalho grudado e a lista, empurrando tudo a cada desenho. Saiu na
   v3.369. O asterisco continua, e continua se explicando sozinho no
   passar do mouse, um pedido de cada vez e com as tecnicas pelo nome. */
const mistos = await pagina.evaluate(async () => {
  const pg = document.getElementById('relPage');
  REL.dados.itens.forEach((x, i) => { x.mistos = i % 3 === 0
    ? [{ tags: ['Sublimação', 'Silk'] }] : []; });
  relDesenha();
  await new Promise(r => setTimeout(r, 350));
  const cel = pg.querySelector('.rv-lin .n.misto');
  const filhos = [...pg.children].map(e => e.className.split(' ')[0]);
  const iVao = filhos.indexOf('rv-vao');
  return {
    notas: pg.querySelectorAll('.rv-nota').length,
    depoisDoVao: iVao >= 0 ? filhos[iVao + 1] : '-',
    asteriscos: pg.querySelectorAll('.rv-lin .n.misto').length,
    sinal: cel ? cel.textContent.trim().slice(-1) : '',
    dica: cel ? (cel.getAttribute('title') || '') : '',
  };
});
ok('a nota dos mistos nao esta mais na tela', mistos.notas === 0, String(mistos.notas));
ok('  a primeira semana vem logo depois do cabecalho',
   mistos.depoisDoVao === 'rv-cart', mistos.depoisDoVao);
ok('o asterisco continua no valor', mistos.asteriscos > 0 && mistos.sinal === '*',
   mistos.asteriscos + ' / ' + mistos.sinal);
ok('  e continua se explicando no passar do mouse',
   /sublimação junto de outra técnica/i.test(mistos.dica)
   && /Sublimação \+ Silk/.test(mistos.dica), mistos.dica);

console.log('\n=== 8a. OS DOIS BOTOES DA LINHA, E A ORDEM DAS COLUNAS ===');
/* A REGRESSAO QUE ESTA SECAO EXISTE PARA IMPEDIR (v3.370 -> v3.371).

   `.rel-x` e `.rel-abrir` eram os botoes da linha, e o desenho deles
   morava no bloco da FOLHA IMPRESSA, porque ate a v3.364 a tela ERA a
   folha. A v3.370 trocou aquele bloco inteiro pela folha nova, que nao
   tem botao nenhum (papel nao clica), e levou os dois junto.

   Sem CSS, um `<button>` volta ao desenho padrao do navegador: caixa
   cinza com borda `2px outset` e fonte de 13.33px. Era essa a caixa em
   volta do nome do cliente. E o X, sem `svg{width}`, virou um botao de
   4px, que e o mesmo que sumir.

   Por isso a conferencia mede o COMPUTADO: a existencia da regra nao diz
   nada quando o problema e a AUSENCIA dela. */
const botoes = await pagina.evaluate(async () => {
  const pg = document.getElementById('relPage');
  pg.hidden = false;
  relDesenha();
  await new Promise(r => setTimeout(r, 350));
  const lin = pg.querySelector('.rv-lin[data-id]');
  const ler = e => { if (!e) return null; const c = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { existe:true, borda:c.borderStyle, larguraBorda:c.borderTopWidth,
      fundo:c.backgroundColor, tam:c.fontSize, peso:c.fontWeight, cor:c.color,
      w:Math.round(r.width), h:Math.round(r.height),
      display:c.display };
  };
  const bt = lin.querySelector('.cli .rv-abrir');
  const x = lin.querySelector('.rv-x');
  const svg = x ? x.querySelector('svg') : null;
  return {
    abrir: ler(bt), cel: ler(lin.querySelector('.cli')), xis: ler(x),
    xisSvg: svg ? { w:Math.round(svg.getBoundingClientRect().width),
                    h:Math.round(svg.getBoundingClientRect().height) } : null,
    colunas: [...pg.querySelectorAll('.rv-cabc > *')].map(e => e.textContent.trim()),
    /* e nenhum nome da folha impressa sobrou solto na tela */
    restosDaFolha: pg.querySelectorAll('.rel-abrir, .rel-x').length,
  };
});
ok('o nome do cliente nao tem caixa nem borda de botao',
   botoes.abrir && botoes.abrir.borda === 'none'
   && botoes.abrir.fundo === 'rgba(0, 0, 0, 0)',
   JSON.stringify(botoes.abrir));
ok('  e usa a fonte da celula, e nao a do navegador',
   !!botoes.abrir && botoes.abrir.tam === botoes.cel.tam
   && botoes.abrir.peso === botoes.cel.peso && botoes.abrir.cor === botoes.cel.cor,
   botoes.abrir ? (botoes.abrir.tam + '/' + botoes.abrir.peso + ' vs '
     + botoes.cel.tam + '/' + botoes.cel.peso) : 'botao ausente');
ok('o X de tirar da conta esta la, do tamanho de um botao',
   botoes.xis && botoes.xis.w >= 20 && botoes.xis.h >= 20,
   JSON.stringify(botoes.xis));
ok('  com o icone desenhado dentro dele',
   botoes.xisSvg && botoes.xisSvg.w >= 10 && botoes.xisSvg.h >= 10,
   JSON.stringify(botoes.xisSvg));
ok('nenhum nome da folha impressa sobrou na tela',
   botoes.restosDaFolha === 0, String(botoes.restosDaFolha));
/* A ORDEM DAS COLUNAS (v3.371, a pedido): o numero do pedido e o que se
   procura primeiro numa lista de pedidos, e fica ao lado do cliente. */
ok('a ordem e Pedido, Dia, Cliente, Vendedor',
   JSON.stringify(botoes.colunas.slice(0, 5))
     === JSON.stringify(['', 'Pedido', 'Dia', 'Cliente', 'Vendedor']),
   JSON.stringify(botoes.colunas.slice(0, 5)));

console.log('\n=== 8. O RECUO LATERAL, EM VARIAS ALTURAS DE JANELA ===');
/* A REGRESSAO QUE ESTA SECAO EXISTE PARA IMPEDIR (v3.368).

   O cartao encostava no menu e na borda direita. As margens estavam
   certas no CSS da pagina: quem as anulava era
   `.rel-page{padding-left:0;padding-right:0}`, sobra do tempo em que o
   que morava ali era a folha A4, e que vem no fim do arquivo, vencendo.

   E o motivo de nenhuma suite ter visto: logo acima existia
   `@media (max-height:900px){ .rel-page{padding:0 22px ... !important} }`,
   tambem do layout antigo, que DEVOLVIA o recuo em telas baixas. Todas as
   suites rodavam em 900px ou menos de altura, exatamente dentro da faixa
   onde o defeito nao aparecia.

   Por isso esta secao mede em VARIAS alturas, e nao numa so. Medida numa
   janela so nao e medida de layout, e sorte. */
const ALTURAS = [768, 900, 901, 1000, 1080];
const recuos = [];
for (const alt of ALTURAS) {
  await pagina.setViewportSize({ width: 1600, height: alt });
  await pagina.waitForTimeout(200);
  await pagina.evaluate(() => { relDesenha(); });
  await pagina.waitForTimeout(320);
  const m = await pagina.evaluate(() => {
    const medir = (pgSel, cartaoSel) => {
      const pg = document.querySelector(pgSel);
      const c = pg && pg.querySelector(cartaoSel);
      if (!pg || !c) return null;
      const a = pg.getBoundingClientRect(), b = c.getBoundingClientRect();
      return { esq: Math.round(b.left - a.left), dir: Math.round(a.right - b.right) };
    };
    const pgAtv = document.getElementById('atvPage');
    const eraAtv = pgAtv.hidden;
    pgAtv.hidden = false;
    const atv = medir('#atvPage', '.atv-flut');
    pgAtv.hidden = eraAtv;
    return { rel: medir('#relPage', '.rv-cart'), relTopo: medir('#relPage', '.rv-flut'), atv };
  });
  recuos.push({ alt, ...m });
}
await pagina.setViewportSize({ width: 1600, height: 820 });
await pagina.waitForTimeout(200);
console.log('     ' + JSON.stringify(recuos));
ok('o Relatorio tem recuo dos dois lados em TODA altura de janela',
   recuos.every(r => r.rel && r.rel.esq >= 16 && r.rel.dir >= 16),
   JSON.stringify(recuos.map(r => r.alt + ':' + (r.rel ? r.rel.esq + '/' + r.rel.dir : 'sem'))));
ok('  e o mesmo recuo em todas elas, sem depender da altura',
   new Set(recuos.map(r => r.rel.esq + '|' + r.rel.dir)).size === 1,
   JSON.stringify(recuos.map(r => r.rel.esq + '|' + r.rel.dir)));
ok('  o cabecalho grudado comeca na mesma margem que os cartoes',
   recuos.every(r => r.relTopo && r.relTopo.esq === r.rel.esq
                     && r.relTopo.dir === r.rel.dir),
   JSON.stringify(recuos.map(r => r.relTopo.esq + '|' + r.relTopo.dir)));
ok('a Atividade tem o MESMO recuo do Relatorio, em toda altura',
   recuos.every(r => r.atv && r.atv.esq === r.rel.esq && r.atv.dir === r.rel.dir),
   JSON.stringify(recuos.map(r => r.alt + ':' + (r.atv ? r.atv.esq + '/' + r.atv.dir : 'sem'))));

console.log('\n=== 8b. A ESCADA DE PESO DAS DUAS TABELAS ===');
/* "Parece que esta tudo igual, mesma fonte e peso." Estava mesmo, e por
   dois motivos que so aparecem medindo celula por celula:

   1. O NOME DO CLIENTE nao ficava em negrito no Relatorio. A classe pedia
      600, mas quem carrega o texto e um botao, e o botao dela era o
      `.rel-abrir` da FOLHA IMPRESSA, com `font-weight:500` na mao. Desde a
      v3.371 o botao e `.rv-abrir` e mora com o resto da tela.

   2. A COLUNA PEDIDO da Atividade perdia o monoespacado. `.atv-linha
      .abre` traz `font-family:inherit`, `font-size:inherit` e
      `color:inherit` para o botao do NOME desaprender o estilo de botao;
      so que a celula do PEDIDO E um botao, tem a mesma especificidade e
      vem depois.

   Nos dois casos o defeito e o mesmo: uma regra escrita para OUTRA coisa,
   com a mesma especificidade e mais abaixo no arquivo, apagando o peso de
   quem devia puxar a leitura. Por isso a conferencia mede o COMPUTADO, e
   nao a existencia da regra. */
const escada = await pagina.evaluate(async () => {
  const pg = document.getElementById('relPage');
  pg.hidden = false;
  REL.dados.itens.forEach(x => { x.mistos = []; });
  relDesenha();
  await new Promise(r => setTimeout(r, 350));
  const ler = e => { if (!e) return null; const c = getComputedStyle(e);
    return { peso: +c.fontWeight, tam: c.fontSize,
      mono: /Mono|mono/.test(c.fontFamily), cor: c.color, fam: c.fontFamily }; };
  const lin = pg.querySelector('.rv-lin[data-id]');
  const rel = {
    vend: ler(lin.querySelector('.vend')),
    dia: ler(lin.querySelector('.dt')),
    cliCelula: ler(lin.querySelector('.cli')),
    cliBotao: ler(lin.querySelector('.cli .rv-abrir')),
    ped: ler(lin.querySelector('.ped')),
    valor: ler(lin.querySelector('.n.v')),
    total: ler(lin.querySelector('.n.forte')),
    cabc: ler(pg.querySelector('.rv-cabc > *')),
  };
  /* a Atividade, desenhada com a semana de mentira ja montada */
  const pa = document.getElementById('atvPage');
  pa.hidden = false; atvDesenha();
  await new Promise(r => setTimeout(r, 300));
  const la = pa.querySelector('.atv-linha');
  const filhos = [...la.children];
  const atv = {
    ped: ler(filhos[1]), nome: ler(filhos[2]), dep: ler(filhos[3]),
    entrega: ler(filhos[4]), tot: ler(la.querySelector('.n.tot')),
    sub: ler(la.querySelector('.n.tr-s')),
  };
  pa.hidden = true;
  return { rel, atv };
});
console.log('     REL ' + JSON.stringify(escada.rel));
console.log('     ATV ' + JSON.stringify(escada.atv));
/* --- Relatorio de Pedidos --- */
ok('o cliente sai em 600, e o botao dentro dele tambem',
   escada.rel.cliCelula.peso === 600 && escada.rel.cliBotao.peso === 600,
   escada.rel.cliCelula.peso + ' / ' + escada.rel.cliBotao.peso);
ok('  e na mesma cor da celula, sem o cinza de botao',
   escada.rel.cliBotao.cor === escada.rel.cliCelula.cor,
   escada.rel.cliBotao.cor + ' vs ' + escada.rel.cliCelula.cor);
ok('o vendedor e o pedido ficam mais fracos que o cliente',
   escada.rel.vend.peso === 500 && escada.rel.ped.peso === 500
   && escada.rel.vend.cor !== escada.rel.cliCelula.cor,
   escada.rel.vend.peso + '/' + escada.rel.ped.peso + ' ' + escada.rel.vend.cor);
ok('os totais do pedido sobem para 600, acima dos valores da tecnica',
   escada.rel.total.peso === 600 && escada.rel.valor.peso === 500,
   escada.rel.total.peso + ' vs ' + escada.rel.valor.peso);
ok('  o cabecalho de colunas em 700, acima de todos',
   escada.rel.cabc.peso === 700, String(escada.rel.cabc.peso));
ok('dia, pedido e valores sao monoespacados; vendedor e cliente nao',
   escada.rel.dia.mono && escada.rel.ped.mono && escada.rel.valor.mono
   && !escada.rel.vend.mono && !escada.rel.cliCelula.mono,
   JSON.stringify([escada.rel.dia.mono, escada.rel.ped.mono, escada.rel.valor.mono,
                   escada.rel.vend.mono, escada.rel.cliCelula.mono]));
/* --- Relatorio de Atividade --- */
ok('a coluna Pedido continua monoespacada, mesmo sendo um botao',
   escada.atv.ped.mono === true && escada.atv.ped.peso === 700,
   escada.atv.ped.peso + ' mono=' + escada.atv.ped.mono + ' ' + escada.atv.ped.tam);
ok('  e na cor forte da linha, e nao no cinza que o botao herdaria',
   escada.atv.ped.cor === escada.atv.entrega.cor,
   escada.atv.ped.cor + ' vs ' + escada.atv.entrega.cor);
ok('o nome do cliente sai em 600, como no Relatorio',
   escada.atv.nome.peso === 600, String(escada.atv.nome.peso));
ok('  o departamento fica em 500, abaixo dele',
   escada.atv.dep.peso === 500, String(escada.atv.dep.peso));
ok('o total sobe para 700, acima das duas tecnicas',
   escada.atv.tot.peso === 700 && escada.atv.sub.peso === 500,
   escada.atv.tot.peso + ' vs ' + escada.atv.sub.peso);
ok('as duas tabelas usam o MESMO tom forte',
   escada.rel.cliCelula.cor === escada.atv.nome.cor,
   escada.rel.cliCelula.cor + ' vs ' + escada.atv.nome.cor);
/* O NOME DO CLIENTE E A MESMA COISA NAS DUAS PAGINAS (v3.371, a pedido).
   A Atividade e a referencia: e dela que sai a medida. */
ok('  e o nome do cliente sai identico nas duas: tamanho, peso e cor',
   escada.rel.cliBotao.tam === escada.atv.nome.tam
   && escada.rel.cliBotao.peso === escada.atv.nome.peso
   && escada.rel.cliBotao.cor === escada.atv.nome.cor,
   escada.rel.cliBotao.tam + '/' + escada.rel.cliBotao.peso + '/' + escada.rel.cliBotao.cor
   + '  vs  ' + escada.atv.nome.tam + '/' + escada.atv.nome.peso + '/' + escada.atv.nome.cor);

console.log('\n=== 9. A IMPRESSAO NAO FOI TOCADA ===');
/* A folha nao mora mais na tela: quem a monta e relFolhaFonte(), desde a
   v3.364. E dela que o papel sai, e e ela que tem de continuar inteira. */
const imp = await pagina.evaluate(() => {
  const folha = relFolhaFonte();
  const tab = folha && folha.querySelector('.rel-tab');
  return {
    folha: !!folha,
    cabFolha: !!(folha && folha.querySelector('.rel-cab')),
    rodFolha: !!(folha && folha.querySelector('.rel-rod')),
    tabela: !!tab,
    colunasTabela: tab ? tab.querySelectorAll('thead tr:last-child th').length : 0,
    colunasColgroup: tab ? tab.querySelectorAll('colgroup col').length : 0,
    /* v3.370: os quatro resumos moram dentro do topo da folha */
    cardsFolha: folha ? folha.querySelectorAll('.rel-res .cx').length : 0,
    /* nenhuma peca da tela nova pode ter vazado para dentro da folha */
    semTelaDentro: folha ? folha.querySelectorAll('.rv-topo,.rv-cart,.rv-lin').length === 0 : false,
    montaAtividade: typeof atvMontaImpressao === 'function',
    montaRelatorio: typeof relMontaImpressao === 'function',
  };
});
ok('a folha do relatorio continua inteira',
   imp.folha && imp.cabFolha && imp.rodFolha && imp.tabela, JSON.stringify(imp));
/* DEZ COLUNAS, e nao mais onze: a coluna de acao era o botao de tirar da
   conta, que so faz sentido na tela. No papel ela nunca teve conteudo, e
   escondida por CSS ainda desalinhava as larguras do colgroup. */
ok('  com as dez colunas do papel', imp.colunasTabela === 10, String(imp.colunasTabela));
ok('  e o colgroup com o mesmo tanto', imp.colunasColgroup === 10, String(imp.colunasColgroup));
ok('  e os quatro resumos no topo', imp.cardsFolha === 4, String(imp.cardsFolha));
ok('  sem nada da tela nova dentro dela', imp.semTelaDentro === true);
ok('as duas montagens de papel continuam la',
   imp.montaAtividade && imp.montaRelatorio, JSON.stringify(imp));
const regras = await pagina.evaluate(() => {
  const txt = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n')
    .replace(/\s+/g, ' ');
  return {
    atvSaiNoPapel: /body\.atv-imprimindo \.atv-page\{display:none/.test(txt),
    /* v3.370: a folha ja NASCE 297x210mm, entao nao ha mais reducao para
       desfazer. O que se cobra agora e que ela tenha o tamanho do papel. */
    folhaEmMilimetros: /\.rel-folha\{[^}]*width:297mm;height:210mm/.test(txt),
    semTransformNoPapel: /body\.rel-imprimindo \.rel-folha\{ ?transform:none ?!important/
      .test(txt),
  };
});
ok('a pagina de tela da atividade fica fora do papel', regras.atvSaiNoPapel === true);
ok('a folha impressa e uma A4 deitada de verdade, 297 x 210 mm',
   regras.folhaEmMilimetros === true);
ok('  e nenhuma escala sobra na hora de imprimir',
   regras.semTransformNoPapel === true);

console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
if (erros.length) { console.log('  erros de pagina: ' + erros.slice(0,3).join(' // ')); falhas++; }
await b.close();
process.exit(falhas ? 1 : 0);
