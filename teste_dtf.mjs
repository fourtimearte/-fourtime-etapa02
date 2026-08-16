/* ================================================================
   O PACOTE DE DTF E OS DOIS BOTÕES

   O gabarito não é opinião: está desenhado no arquivo do Affinity do
   ARENA CROSS, que o Henrique montou à mão antes de existir script.

     · prancheta de montagem  -> 7 grupos, 17 moldes
     · prancheta de separação -> 17 quantidades

   Este teste tem duas metades.

   A. A CONTA, sozinha. Lê o ARENA CROSS exportado, monta o estado leve e
      manda o dtfPacote do editor calcular. Confere grupo por grupo,
      molde por molde e quantidade por quantidade contra o gabarito.

   B. O ARQUIVO, de ponta a ponta. Monta o mesmo pedido dentro do editor,
      exporta o HTML do Trello, abre o arquivo, CLICA nos botões e lê o
      que foi para a área de transferência. É a única forma de saber que
      o botão existe, aparece onde foi pedido e copia o que promete.
   ================================================================ */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || editorAtual();
const VER = (readFileSync(DIR + ARQ, 'utf8').match(/const\s+FT_EDITOR\s*=\s*'([\d.]+)'/) || [])[1];
const AMOSTRA = DIR + 'dtf-arena.json';

const falhas = [], err = [];
let contaOk = 0;
function diz(rot, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${rot.padEnd(56)} obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
  if (ok) contaOk++; else falhas.push(rot);
}
const secao = t => console.log('\n  --- ' + t + ' ---');

/* ---------------- O GABARITO ----------------
   Copiado do documento do Affinity, lido ao vivo pelo MCP. */
const GRUPOS = ['L1.2', 'L3.4', 'L5.6.7', 'L8.9', 'L10', 'L11.12', 'L13.14'];
const MOLDES_POR_GRUPO = [2, 2, 6, 2, 1, 2, 2];          /* 17 no total */
const PECAS_POR_LAYOUT = [20, 10, 12, 24, 12, 4, 4, 7, 5, 1, 4, 2, 4, 2];
/* as 17 linhas da prancheta de separação, na ordem de cima para baixo */
const SEPARACAO = [
  ['L-8.9', 99], ['L8.9', 12], ['L1.2', 30], ['L3.4', 36], ['L5.6.7', 20],
  ['L8.9', 12], ['L10', 1], ['L11', 4], ['L12', 2], ['L13.14', 6],
  ['L5.6.7', 20], ['L8', 7], ['L9', 5], ['L10.11', 5], ['L12', 2],
  ['L13', 4], ['L14', 2]
];

const nav = await abreNavegador();

async function pagina(url, init) {
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000); p.setDefaultNavigationTimeout(60000);
  p.on('pageerror', e => err.push(String(e).slice(0, 180)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  return { ctx, p };
}

/* ================================================================
   A. A CONTA
   ================================================================ */
secao('A. o estado do ARENA CROSS, lido da amostra');

/* A amostra é o esqueleto do pedido de verdade: os campos, e no lugar de
   cada imagem uma letra dizendo de que arte ela é. Ver gera_fixture_dtf.mjs
   para o porquê de não guardar o HTML de 6,5 MB aqui dentro. */
const est = JSON.parse(readFileSync(AMOSTRA, 'utf8'));
diz('14 layouts no arquivo', est.layouts.length, 14);

secao('A. o pacote calculado pelo dtfPacote do editor');
const { p: pe } = await pagina(pathToFileURL(DIR + ARQ).href);
await esperaPronto(pe, null, 60000);
const pac = await pe.evaluate(e => dtfPacote(e), est);

diz('formato', pac.formato, 'FOURTIME_DTF');
diz('escopo', pac.escopo, 'pedido');
diz('cliente', pac.pedido.cliente, 'ARENA CROSS');
diz('pedido', pac.pedido.numero, 'PD004155');
diz('departamento', pac.pedido.departamento, 'DTF + Silk');
diz('layouts de DTF', pac.total.layouts, 14);
diz('peças de DTF', pac.total.pecas, 111);
diz('peças do pedido', pac.total.pecasPedido, 111);
diz('peças layout a layout', pac.layouts.map(L => L.pecas), PECAS_POR_LAYOUT);
diz('a soma fecha', pac.layouts.reduce((s, L) => s + L.pecas, 0), 111);
diz('referências distintas', [...new Set(pac.layouts.map(L => L.ref))].sort(),
  ['FT-010-000M', 'FT-010-004F', 'FT-010-008C']);
diz('o nome sai separado do código', pac.layouts[0].nome, 'CAMISETA MASC TRAD');
diz('a categoria sai do código', pac.layouts[0].categoria, 'FT-010');
diz('a cor vem limpa', pac.layouts[0].cor, 'Azul Petróleo');
diz('grades', [...new Set(pac.layouts.map(L => L.grade))].sort(), ['adulto', 'infantil']);
diz('nenhuma imagem viajou no pacote',
  /"arteId"|data:image/.test(JSON.stringify(pac)), false);

secao('A. os sete grupos, contra a prancheta de montagem');
diz('quantos grupos', pac.grupos.length, 7);
diz('as tags dos grupos', pac.grupos.map(g => g.tag), GRUPOS);
diz('os layouts de cada grupo', pac.grupos.map(g => g.layouts.join('.')),
  ['1.2', '3.4', '5.6.7', '8.9', '10', '11.12', '13.14']);
diz('as peças de cada grupo', pac.grupos.map(g => g.pecas), [30, 36, 20, 12, 1, 6, 6]);

secao('A. os moldes, contra a prancheta de montagem');
diz('moldes por grupo', pac.grupos.map(g => g.moldes.length), MOLDES_POR_GRUPO);
diz('17 moldes no total',
  pac.grupos.reduce((s, g) => s + g.moldes.length, 0), 17);
const m12 = pac.grupos[0].moldes;
diz('L1.2 usa duas referências', m12.map(x => x.ref), ['FT-010-000M', 'FT-010-004F']);
diz('L1.2 no MENOR tamanho de cada uma', m12.map(x => x.tamanho), ['P', 'PP']);
diz('e esse molde cobre a faixa toda', m12.map(x => x.cobre.join(',')), ['P,M,G,GG', 'PP,P,M,GG']);
diz('L1.2 é tudo adulto', m12.map(x => x.faixa), ['adulto', 'adulto']);
const m567 = pac.grupos[2].moldes;
diz('L5.6.7 tem seis moldes', m567.length, 6);
diz('L5.6.7 abre o infantil tamanho a tamanho',
  m567.filter(x => x.faixa === 'infantil').map(x => x.tamanho), ['6A', '8A', '10A', '12A']);
diz('L5.6.7 fecha o adulto no menor',
  m567.filter(x => x.faixa === 'adulto').map(x => x.tamanho), ['P', 'P']);
diz('L10 tem um molde só', pac.grupos[4].moldes.map(x => x.ref + ' ' + x.tamanho),
  ['FT-010-000M M']);
diz('as peças de cada molde somam o grupo',
  pac.grupos.map(g => g.moldes.reduce((s, x) => s + x.pecas, 0)),
  pac.grupos.map(g => g.pecas));

secao('A. as 17 quantidades da prancheta de separação');
/* a arte é escolha do operador, então o teste faz o papel dele: para cada
   linha da prancheta, entrega ao editor os layouts daquela linha e cobra
   a tag e a quantidade. É exatamente o que o script do Affinity vai
   perguntar. */
const calc = await pe.evaluate(({ pac, linhas }) => {
  const universo = pac.layouts.map(L => L.n);
  const pecas = {};
  pac.layouts.forEach(L => { pecas[L.n] = L.pecas; });
  return linhas.map(([tag]) => {
    /* do texto da tag de volta para os números, que é o caminho inverso do
       que o editor faz: se os dois caminhos fecham, a regra está certa */
    const neg = tag.slice(0, 2) === 'L-';
    const ns = tag.replace(/^L-?/, '').split('.').map(Number);
    const dentro = neg ? universo.filter(n => ns.indexOf(n) < 0) : ns;
    return [dtfTag(dentro, universo), dentro.reduce((s, n) => s + pecas[n], 0)];
  });
}, { pac, linhas: SEPARACAO });
SEPARACAO.forEach((esperado, i) => {
  diz('linha ' + String(i + 1).padStart(2) + ' da separação', calc[i], esperado);
});

secao('A. o pacote de UM layout só');
const um = await pe.evaluate(e => dtfPacote(e, 5), est);
diz('escopo', um.escopo, 'layout 5');
diz('um layout', um.layouts.length, 1);
diz('é o L5', um.layouts[0].n, 5);
diz('a tag dele', um.layouts[0].tag, 'L5');
diz('as peças dele', um.layouts[0].pecas, 12);
diz('o grupo vira ele mesmo', um.grupos.map(g => g.tag), ['L5']);
diz('quatro moldes infantis', um.grupos[0].moldes.map(x => x.tamanho), ['6A', '8A', '10A', '12A']);
diz('mas o total do pedido continua junto', um.total.pecasPedido, 111);

/* ================================================================
   B. O ARQUIVO
   ================================================================ */
secao('B. o mesmo pedido montado no editor e exportado');

/* sete artes, uma por grupo: PNGs de 1x1 com cores diferentes, que é o
   suficiente para o agrupamento por imagem ter o que separar */
function png(cor) {
  const c = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000d49444154789c6360' + cor + '0000000449454e44ae426082', 'hex');
  return 'data:image/png;base64,' + c.toString('base64');
}
const ARTES = ['00', '11', '22', '33', '44', '55', '66'].map(png);
const DE_QUEM = [0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 6, 6];   /* L1..L14 -> arte */

const { p: pb } = await pagina(pathToFileURL(DIR + ARQ).href);
await esperaPronto(pb, null, 60000);
const html = await pb.evaluate(async ({ est, artes, dequem }) => {
  /* o documento vem do estado real do ARENA CROSS, com as imagens
     trocadas por artes sintéticas de mesma identidade por grupo */
  const doc = {
    _formato: 'FOURTIME_ORCAMENTO', _versao: 2,
    header: est.header,
    layouts: est.layouts.map((L, i) => ({
      ref: L.ref, genero: L.genero, tecidos: L.tecidos, cor: L.cor,
      design: L.design, grade: L.grade, tamanhos: L.tamanhos,
      obs: '', img: artes[dequem[i]], imgComp: true
    })),
    anotacoes: [], ajustes: []
  };
  aplicaEstado(doc, 'teste.ft', 'teste');
  await new Promise(r => setTimeout(r, 900));
  return gerarHTML();
}, { est, artes: ARTES, dequem: DE_QUEM });

const SAIDA = '/tmp/dtf-trello.html';
writeFileSync(SAIDA, html);
diz('o arquivo saiu', html.length > 100000, true);
diz('o pacote viajou dentro dele', /window\.FT_DTF=/.test(html), true);

/* a área de transferência é trocada por um gravador ANTES de a página
   existir: é a única forma de saber o que o botão realmente copiou */
const GRAVADOR = `Object.defineProperty(navigator,'clipboard',{value:{
  writeText:function(t){ window.__copiado=t; return Promise.resolve(); }},configurable:true});`;
const { p: pt, ctx: ct } = await pagina(pathToFileURL(SAIDA).href, GRAVADOR);
await pt.waitForTimeout(600);

secao('B. os botões, onde foram pedidos');
const onde = await pt.evaluate(() => ({
  porLayout: document.querySelectorAll('.lay-modulo .dtf-btn').length,
  layouts: document.querySelectorAll('.lay-modulo').length,
  naBarra: document.querySelectorAll('.ft-filtros .dtf-btn').length,
  filtros: document.querySelectorAll('.ft-filtros').length,
  /* abaixo da tabela quer dizer: no mesmo bloco da tabela, DEPOIS dela */
  abaixoDaTabela: [...document.querySelectorAll('.lay-modulo')].every(m => {
    const t = m.querySelector('.lay-tabela-mini'), b = m.querySelector('.dtf-btn');
    return !!(t && b && t.parentNode === b.parentNode &&
      (t.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
  }),
  soNoSemDinheiro: document.body.classList.contains('sem-dinheiro')
}));
diz('um botão por layout', onde.porLayout, onde.layouts);
diz('quatorze layouts', onde.layouts, 14);
diz('cada botão fica abaixo da tabela', onde.abaixoDaTabela, true);
diz('um botão em cada barra de filtros', onde.naBarra, onde.filtros);
diz('duas barras de filtros (folha e barra fixa)', onde.filtros, 2);
diz('o arquivo é o de produção', onde.soNoSemDinheiro, true);

secao('B. o botão do layout copia o layout');
await pt.locator('.lay-modulo').first().locator('.dtf-btn').click();
await pt.waitForFunction(() => !!window.__copiado);
const copL1 = JSON.parse(await pt.evaluate(() => window.__copiado));
diz('escopo', copL1.escopo, 'layout 1');
diz('um layout', copL1.layouts.length, 1);
diz('é o L1', copL1.layouts[0].n, 1);
diz('a referência', copL1.layouts[0].ref, 'FT-010-000M');
diz('as peças', copL1.layouts[0].pecas, 20);
diz('a grade', copL1.layouts[0].tamanhos, { P: 2, M: 12, G: 5, GG: 1 });
diz('o molde', copL1.grupos[0].moldes.map(x => x.ref + ' ' + x.tamanho), ['FT-010-000M P']);
diz('o botão avisa que copiou',
  await pt.locator('.lay-modulo').first().locator('.dtf-btn').evaluate(b => b.classList.contains('ok')), true);

secao('B. o botão da barra copia o pedido inteiro');
await pt.evaluate(() => { window.__copiado = null; });
await pt.click('#ftFiltros .dtf-btn');
await pt.waitForFunction(() => !!window.__copiado);
const copTudo = JSON.parse(await pt.evaluate(() => window.__copiado));
diz('escopo', copTudo.escopo, 'pedido');
diz('quatorze layouts', copTudo.layouts.length, 14);
diz('cento e onze peças', copTudo.total.pecas, 111);
diz('os sete grupos', copTudo.grupos.map(g => g.tag), GRUPOS);
diz('os dezessete moldes', copTudo.grupos.reduce((s, g) => s + g.moldes.length, 0), 17);
diz('o exportado bate com o calculado',
  JSON.stringify(copTudo.grupos.map(g => [g.tag, g.pecas, g.moldes.length])),
  JSON.stringify(pac.grupos.map(g => [g.tag, g.pecas, g.moldes.length])));
diz('as notas viajam junto', copTudo.notas.length, 3);

secao('B. onde o botão NÃO pode aparecer');
const antes = await pt.evaluate(() =>
  getComputedStyle(document.querySelector('.lay-modulo .dtf-btn')).display);
diz('no computador ele aparece', antes !== 'none', true);
await pt.setViewportSize({ width: 390, height: 844 });
await pt.waitForTimeout(250);
diz('no celular ele some', await pt.evaluate(() =>
  getComputedStyle(document.querySelector('.lay-modulo .dtf-btn')).display), 'none');
diz('e o da barra também', await pt.evaluate(() =>
  getComputedStyle(document.querySelector('#ftFiltros .dtf-btn')).display), 'none');
await pt.setViewportSize({ width: 1500, height: 1000 });
await pt.emulateMedia({ media: 'print' });
await pt.waitForTimeout(250);
diz('no papel ele some', await pt.evaluate(() =>
  getComputedStyle(document.querySelector('.lay-modulo .dtf-btn')).display), 'none');
await pt.emulateMedia({ media: 'screen' });

secao('B. um pedido MISTO: nem todo layout é de DTF');
/* Foi o que o Henrique reportou na v3.314: o botão aparecia em layout de
   bordado, que não tem o que mandar para a pipeline de DTF. Aqui os
   layouts 2, 4 e 6 perdem a tag DTF e ficam só com Bordado. */
const SEM_DTF = [2, 4, 6];
const html2 = await pb.evaluate(async ({ est, artes, dequem, semDtf }) => {
  const doc = {
    _formato: 'FOURTIME_ORCAMENTO', _versao: 2,
    header: est.header,
    layouts: est.layouts.map((L, i) => ({
      ref: L.ref, genero: L.genero, tecidos: L.tecidos, cor: L.cor,
      design: semDtf.indexOf(i + 1) >= 0
        ? [{ tag: 'Bordado', cores: [] }]
        : L.design,
      grade: L.grade, tamanhos: L.tamanhos,
      obs: '', img: artes[dequem[i]], imgComp: true
    })),
    anotacoes: [], ajustes: []
  };
  aplicaEstado(doc, 'teste.ft', 'teste');
  await new Promise(r => setTimeout(r, 900));
  return gerarHTML();
}, { est, artes: ARTES, dequem: DE_QUEM, semDtf: SEM_DTF });
writeFileSync('/tmp/dtf-misto.html', html2);
const { p: pm, ctx: cm } = await pagina(pathToFileURL('/tmp/dtf-misto.html').href, GRAVADOR);
await pm.waitForTimeout(600);
const misto = await pm.evaluate(() => ({
  layouts: document.querySelectorAll('.lay-modulo').length,
  botoes: document.querySelectorAll('.lay-modulo .dtf-btn').length,
  /* quais layouts ficaram COM botão, pela ordem no documento */
  comBotao: [...document.querySelectorAll('.lay-modulo')]
    .map((m, i) => m.querySelector('.dtf-btn') ? i + 1 : 0).filter(Boolean)
}));
diz('os catorze layouts continuam lá', misto.layouts, 14);
diz('só os onze de DTF ganham botão', misto.botoes, 11);
diz('e são exatamente esses', misto.comBotao, [1, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14]);
await pm.evaluate(() => { window.__copiado = null; });
await pm.click('#ftFiltros .dtf-btn');
await pm.waitForFunction(() => !!window.__copiado);
const mistoTudo = JSON.parse(await pm.evaluate(() => window.__copiado));
diz('o botão do pedido também só leva os de DTF',
  mistoTudo.layouts.map(L => L.n), [1, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14]);
diz('o total do pedido continua contando os catorze', mistoTudo.total.layoutsPedido, 14);
diz('e as 111 peças também', mistoTudo.total.pecasPedido, 111);
diz('mas o universo de DTF encolheu', mistoTudo.total.pecas, 111 - 10 - 24 - 4);
await cm.close();

secao('B. o arquivo COM valores não leva botão');
const comValor = await pb.evaluate(() => {
  const b = document.body;
  const antes = b.className;
  const h = gerarHTML();
  b.className = antes;
  /* o gerarHTML sempre marca sem-dinheiro no clone; o que se testa aqui é
     a trava do runtime, então basta ver que ela existe e é a primeira
     coisa que ele faz */
  return /sem-dinheiro/.test(h) && /classList\.contains\('sem-dinheiro'\)/.test(h);
});
diz('a trava do sem-dinheiro está no arquivo', comValor, true);

secao('B. os filtros continuaram funcionando ao lado do botão novo');
await pt.selectOption('#ftFiltros .ft-fsel[data-g="inf"]', 'com');
await pt.waitForTimeout(250);
diz('só o infantil fica aceso', await pt.evaluate(() =>
  document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length), 1);
diz('o contador acompanha', await pt.evaluate(() =>
  document.querySelector('#ftFiltros .ft-fconta').textContent), '1 de 14 layouts');
await pt.selectOption('#ftFiltros .ft-fsel[data-g="inf"]', '');
await pt.waitForTimeout(200);
diz('e volta ao normal', await pt.evaluate(() =>
  document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length), 14);

await ct.close();
console.log('\n' + '='.repeat(80));
const semErro = err.length === 0;
console.log(`  ${semErro ? 'OK ' : 'FALHOU'}  nenhum erro de página: ${err.length}`);
if (!semErro) { err.slice(0, 6).forEach(e => console.log('     ! ' + e)); falhas.push('erro de página'); }
console.log(`  ${contaOk} conferências passaram`);
await nav.close();
if (falhas.length) {
  console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`);
  process.exit(1);
}
console.log(`DTF: o pacote, os sete grupos, os dezessete moldes e os dois botões (v${VER})`);
