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
ok('  o cinza nao se confunde com o fundo da pagina',
   Math.abs(luz(cor.grudado.flut) - luz(cor.pag)) > 4,
   cor.grudado.flut + ' vs pagina ' + cor.pag);
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
ok('as dez colunas continuam com os mesmos nomes',
   JSON.stringify(velho.colunas) === JSON.stringify(
     ['','Pedido','Nome','Departamento','Entrega','Planejamento','Total','Subl.','Person.','Atualização']),
   JSON.stringify(velho.colunas));
ok('os seis dias e as trinta linhas continuam desenhados',
   velho.dias === 6 && velho.linhas === 30, velho.dias + ' dias, ' + velho.linhas + ' linhas');

console.log('\n=== 7. A BARRA FIXA DO RELATORIO DE PEDIDOS ===');
const rel = await pagina.evaluate(async () => {
  const pg = document.getElementById('relPage');
  pg.hidden = false;
  REL.periodos = { anos: [2026], meses: [8,9], comMovimento: [8,9] };
  REL.sel = { ano: 2026, meses: [8,9], mes: 8, dia: 0 };
  const it = (id,mes,dia) => ({ id:'R'+id, dia, mes, ano:2026, cliente:'CLIENTE '+id,
    pedido:'PD004'+id, vendedor:'Lucas', arquivo:'a'+id+'.json',
    subPecas:10, subValor:1000, perPecas:5, perValor:500, mistos:[] });
  REL.dados = { ano:2026, meses:[8,9], mes:8, dia:0, geradoEm:new Date().toISOString(),
    itens: [...Array(24)].map((_,i) => it(i+1, i < 12 ? 8 : 9, (i % 12) + 1)), falhas: [] };
  REL.fora = new Set();
  relDesenha();
  await new Promise(r => setTimeout(r, 350));
  if (typeof relSincronizaFixo === 'function') relSincronizaFixo();
  await new Promise(r => setTimeout(r, 200));
  const fixo = document.getElementById('relFixo');
  const tit = fixo.querySelector('.rel-fx-tit');
  const cx = fixo.querySelector('.cx');
  return {
    escondida: fixo.hidden,
    posicao: getComputedStyle(fixo).position,
    altura: getComputedStyle(fixo).height,
    temTitulo: !!tit,
    titulo: tit ? (tit.querySelector('b') || {}).textContent : '',
    periodo: (document.getElementById('relFxPer') || {}).textContent || '',
    fundo: getComputedStyle(cx).backgroundColor,
    cartoes: fixo.querySelectorAll('.rel-fx-card').length,
    colunas: fixo.querySelectorAll('.rel-fx-cols span').length,
    grupos: fixo.querySelectorAll('.rel-fx-grupos span').length,
    /* o recuo do titulo acompanha o dos cartoes: as duas linhas comecam no
       mesmo x que a tabela da folha */
    recuoIgual: tit ? tit.style.paddingLeft === fixo.querySelector('.rel-fx-cards').style.paddingLeft : false,
  };
});
ok('a barra existe e e grudada', rel.escondida === false && rel.posicao === 'sticky',
   rel.posicao + ' escondida=' + rel.escondida);
ok('  e continua de altura zero, sem empurrar nada', rel.altura === '0px', rel.altura);
ok('a barra agora traz o nome do relatorio', rel.titulo === 'Relatório de Pedidos', rel.titulo);
ok('  e o periodo, que era o que sumia ao rolar',
   rel.periodo === 'Agosto a Setembro de 2026', rel.periodo);
ok('  alinhado com os cartoes', rel.recuoIgual === true);
ok('  num tom cinza, e nao branco sobre a folha branca',
   luz(rel.fundo) < 250 && luz(rel.fundo) > 200, rel.fundo + ' luz=' + luz(rel.fundo).toFixed(0));
ok('os quatro totais, os grupos e as colunas continuam la',
   rel.cartoes === 4 && rel.grupos === 4 && rel.colunas === 11,
   rel.cartoes + ' / ' + rel.grupos + ' / ' + rel.colunas);

console.log('\n=== 8. A IMPRESSAO NAO FOI TOCADA ===');
const imp = await pagina.evaluate(() => {
  const folha = document.querySelector('#relPage .rel-folha');
  const cab = folha ? folha.querySelector('.rel-cab') : null;
  const tab = folha ? folha.querySelector('.rel-tab') : null;
  return {
    /* a folha do relatorio continua sendo o desenho impresso, intocado */
    folha: !!folha, cabFolha: !!cab, tabela: !!tab,
    colunasTabela: tab ? tab.querySelectorAll('thead tr:last-child th').length : 0,
    cardsFolha: folha ? folha.querySelectorAll('.rel-cards .rel-card').length : 0,
    /* a barra fixa nao existe no papel */
    fixoNoPapel: [...document.styleSheets].some(() => false) || null,
    /* e a atividade imprime de uma estrutura propria, montada a parte */
    montaImpressao: typeof atvMontaImpressao === 'function',
  };
});
ok('a folha do relatorio continua inteira',
   imp.folha && imp.cabFolha && imp.tabela, JSON.stringify(imp));
ok('  com as onze colunas de sempre', imp.colunasTabela === 11, String(imp.colunasTabela));
ok('  e os quatro cartoes da folha', imp.cardsFolha === 4, String(imp.cardsFolha));
ok('a atividade continua imprimindo de estrutura propria', imp.montaImpressao === true);
const regras = await pagina.evaluate(() => {
  const txt = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  return {
    fixoSaiNoPapel: /@media print\{\s*\.rel-fixo\{display:none/.test(txt.replace(/\s+/g,' ').replace(/@media print \{ /g,'@media print{')),
    paginaSaiNoPapel: /body\.atv-imprimindo \.atv-page\{display:none/.test(txt.replace(/\s+/g,' ')),
  };
});
ok('a barra fixa continua fora do papel', regras.fixoSaiNoPapel === true);
ok('e a pagina de tela da atividade tambem', regras.paginaSaiNoPapel === true);

console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
if (erros.length) { console.log('  erros de pagina: ' + erros.slice(0,3).join(' // ')); falhas++; }
await b.close();
process.exit(falhas ? 1 : 0);
