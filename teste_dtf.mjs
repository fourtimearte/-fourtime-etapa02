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

secao('B. nada do editor vaza para o arquivo do cliente');
/* O DEFEITO QUE ELE VIU: um "Pessoas" solto no canto de cima da tela,
   empurrando o orcamento inteiro 19px para baixo.

   O modal de Pessoas nasceu com o CSS dentro do <style id="cssRel">, que
   o exportador apaga inteiro de proposito. O MARCADO dele nunca entrou na
   lista de remocao: o estilo ia embora, o elemento ficava, e um <div> sem
   estilo nenhum nao e invisivel — vira um bloco comum com a palavra
   dentro.

   Por isso a conferencia nao e "o Pessoas sumiu": e que NADA de nivel
   mais alto sobrou alem da barra fixa e do documento. Assim o proximo
   modal que alguem criar e esquecer de remover cai aqui, e nao na tela de
   um cliente. */
/* TERCEIRA VEZ que isto acontece: primeiro o #ftLoginFundo, depois o
   #ftUsersFundo (o "Pessoas |" da v3.323), agora o calendario do
   planejamento aparecendo no canto de baixo do pedido de um cliente.
   Sempre a mesma causa: o exportador apagava por LISTA DE IDS, e toda
   lista envelhece no dia em que alguem cria mais uma tela.

   E a conferencia daqui deixou passar porque media VISIBILIDADE: pulava
   quem estava com altura zero. Um modal fechado tem altura zero, entao
   ele passava limpo aqui e vazava na maquina do usuario, que tinha o
   calendario aberto na hora de exportar.

   A regra agora e de EXISTENCIA: no <body> do arquivo gerado so podem
   existir a barra fixa, o documento e as folhas de estilo. Aberto ou
   fechado, com altura ou sem, qualquer outra coisa reprova. */
const solto = await pt.evaluate(() => {
  const fora = [];
  document.querySelectorAll('body > *').forEach(el => {
    if (el.tagName === 'STYLE' || el.tagName === 'LINK' || el.tagName === 'SCRIPT') return;
    fora.push({ id: el.id || '', cls: (el.className || '').toString().split(' ')[0],
      tag: el.tagName.toLowerCase() });
  });
  return { fora,
    /* nada pode estar EMPURRANDO o documento para baixo */
    topoDoDocumento: Math.round(document.querySelector('.app').getBoundingClientRect().top),
    /* e as telas do editor nao existem mais aqui dentro */
    sobrouDoEditor: ['ftUsersFundo', 'ftLoginFundo', 'relPage', 'bdPage', 'cliPage',
      'bugPage', 'atvPage', 'atvMenuEtapa', 'atvNotif', 'atvCarga', 'cssRel', 'ftAtvCss',
      'ftArqFundo', 'ftNotifWrap', 'atvCal', 'atvToast', 'atvListaModal',
      'atvPrint', 'atvMedindo']
      .filter(id => !!document.getElementById(id)) };
});
diz('no arquivo só existem a barra fixa, o documento e o visualizador',
  solto.fora.map(x => x.id || x.cls || x.tag).sort(), ['app', 'ftBarra', 'viewer']);
diz('  e o documento começa no alto da página', solto.topoDoDocumento, 0);
diz('  nenhuma tela do editor viajou junto', solto.sobrouDoEditor, []);

secao('A2. o cartao de tecido e cor chega inteiro no arquivo do cliente');
/* O QUE ESTA EM JOGO (v3.340).

   Tecido e cor viraram um cartao so, e nele a cor se le em DOIS lugares
   ao mesmo tempo: o nome, embaixo do nome do tecido, e o quadrado
   pintado na ponta da linha. Ate a v3.339 o quadrado era um controle
   (so servia para abrir o menu) e o exportador o APAGAVA junto com os
   outros botoes. Se ele continuasse na lista de remocao, o arquivo que
   vai para o Trello sairia com metade da linha.

   E o contrario tambem conta: o que era botao de verdade — o "+", o
   "x" de remover e a seta da lista — nao pode viajar, porque ali nao
   existe JavaScript nenhum para atende-los. */
const cartao = await pt.evaluate(() => {
  const linhas = [...document.querySelectorAll('.tec-linha')];
  return {
    linhas: linhas.length,
    todasComQuadrado: linhas.every(l => !!l.querySelector('.cor-sw')),
    pares: linhas.map(l => ({
      tec: (l.querySelector('.combo-tecido textarea') || {}).value || '',
      cor: (l.querySelector('.combo-cor textarea') || {}).value || '',
      /* sem quadrado nao ha o que medir: devolve `false` e deixa a
         conferencia reprovar, em vez de derrubar a suite inteira */
      pintado: !!(l.querySelector('.cor-sw') && getComputedStyle(l.querySelector('.cor-sw'))
        .getPropertyValue('--cor-sw').trim()) })),
    /* um rotulo Tecido por cartao, e nenhum por linha */
    rotulosNoTopo: document.querySelectorAll('.tec-cab-rot').length,
    cartoes: document.querySelectorAll('.tec-card').length,
    rotulosNaLinha: document.querySelectorAll('.tec-linha .ft-combo-rotulo').length,
    /* e nenhum controle sobrou */
    controles: document.querySelectorAll('.tec-btn,.tec-card .ft-combo-abrir').length,
    /* o quadrado nao responde a clique nenhum no arquivo do cliente */
    inerte: (linhas.length && linhas[0].querySelector('.cor-sw'))
      ? getComputedStyle(linhas[0].querySelector('.cor-sw')).pointerEvents
      : 'sem quadrado',
  };
});
diz('toda linha de tecido levou o seu quadrado', cartao.todasComQuadrado, true);
diz('  e o quadrado esta pintado onde ha cor',
  cartao.pares.filter(x => x.cor).every(x => x.pintado), true);
diz('  o nome da cor veio junto do nome do tecido',
  cartao.pares.every(x => x.tec !== ''), true);
diz('um rotulo Tecido por cartao', cartao.rotulosNoTopo, cartao.cartoes);
diz('  e nenhum rotulo por linha', cartao.rotulosNaLinha, 0);
diz('nenhum botao do cartao viajou', cartao.controles, 0);
diz('  e o quadrado viajou inerte', cartao.inerte, 'none');

secao('A3. o cartao de design chega inteiro no arquivo do cliente');
/* O DESENHO NOVO DA v3.343 tambem tem de atravessar a exportacao: as
   fileiras, a palavra DESIGN em pe e as fichas de cor com a amostra
   rente a borda. E o que e CONTROLE fica para tras: o "+" e o "x" da
   pilula nao tem quem os atenda do outro lado, e um botao que nao faz
   nada e um convite a clicar em vao. */
const desenho = await pt.evaluate(() => {
  const cx = document.querySelector('.design-caixa');
  const tag = document.querySelector('.design-tag');
  const tok = document.querySelector('.dtf-tok');
  return {
    fileiras: document.querySelectorAll('.des-fila').length,
    rotEmPe: cx ? getComputedStyle(cx.querySelector('.design-rot')).writingMode : '(sem)',
    /* o "+" e o "x" nao viajam */
    mais: document.querySelectorAll('.design-add').length,
    xDaPilula: tag ? getComputedStyle(tag, '::after').display : '(sem pilula)',
    /* a ficha de cor chegou desenhada */
    temCodigo: !!(tok && tok.querySelector('.dtf-cod')),
    amostraRente: tok && tok.querySelector('.dtf-chip')
      ? +(tok.querySelector('.dtf-chip').getBoundingClientRect().left
          - tok.getBoundingClientRect().left).toFixed(1) : null,
    /* e nada disso responde a clique */
    inerte: cx ? getComputedStyle(cx).pointerEvents : '(sem)',
  };
});
diz('as fileiras do design viajaram', desenho.fileiras > 0, true);
diz('  com a palavra DESIGN em pe', desenho.rotEmPe, 'vertical-rl');
/* A FORMA da ficha de cor nao se cobra aqui: o pedido do ARENA CROSS nao
   tem codigo de cor nenhum, e uma conferencia que passa por falta de
   alvo e pior que conferencia nenhuma. Quem cobra e o bloco 2 da suite
   mediana, que garante uma cor antes de exportar. */
diz('o "+" do design nao viajou', desenho.mais, 0);
diz('  nem o "x" da pilula aparece', desenho.xDaPilula, 'none');
diz('  e o cartao inteiro chegou inerte', desenho.inerte, 'none');

secao('B. o visualizador de imagem ABRE dentro do arquivo do cliente');
/* A OUTRA METADE DA MESMA MOEDA (v3.332).

   A v3.330 trocou a lista de bloqueio por uma lista de permissão para
   que nenhum flutuante novo do editor vaze para a folha do cliente.
   Acertou nisso, e levou junto o #viewer: ele MORA no mesmo nível dos
   flutuantes, mas não é do editor, e sim do arquivo. Sem ele o clique
   numa imagem não abre nada, e ninguém percebe porque o arquivo continua
   com a cara certa.

   Conferir "nada sobrou" nunca ia pegar isso. Só conferir "o que tem de
   funcionar funciona" pega, e é por isso que esta seção clica de
   verdade. */
const vw = await pt.evaluate(() => {
  const v = document.getElementById('viewer');
  return { existe: !!v,
    nasceFechado: v ? !v.classList.contains('open') : null,
    temImg: !!document.getElementById('vImg'),
    temFechar: !!document.getElementById('vClose'),
    temBaixar: !!document.getElementById('vDown') };
});
diz('o visualizador viajou junto', vw.existe, true);
diz('  fechado, seja qual for o estado do editor', vw.nasceFechado, true);
diz('  com a imagem, o fechar e o baixar',
  [vw.temImg, vw.temFechar, vw.temBaixar], [true, true, true]);

if (!vw.existe) {
  /* sem o elemento não há o que clicar: as conferências abaixo
     reprovam de uma vez, sem derrubar a suíte */
  diz('clicar na imagem abre o visualizador', 'não há visualizador no arquivo', true);
} else {
  await pt.click('.lay-modulo .lay-img.com-img img');
  await pt.waitForTimeout(300);
  const aberto = await pt.evaluate(() => {
    const v = document.getElementById('viewer');
    const im = document.getElementById('vImg');
    const r = v.getBoundingClientRect();
    return { abriu: v.classList.contains('open'),
      visivel: getComputedStyle(v).display !== 'none' && r.width > 0,
      /* a imagem que abriu é a do layout que foi clicado, e não outra */
      mesmaImagem: im.src === document.querySelector('.lay-modulo .lay-img.com-img img').src,
      /* o ajuste à tela roda no onload: sem ele a imagem fica com o
         tamanho natural e o zoom não bate */
      zoom: (document.getElementById('vZoom') || {}).textContent || '' };
  });
  diz('clicar na imagem abre o visualizador', aberto.abriu, true);
  diz('  e ele aparece de verdade', aberto.visivel, true);
  diz('  mostrando a imagem daquele layout', aberto.mesmaImagem, true);
  diz('  com o zoom calculado', /%$/.test(aberto.zoom), true);

  await pt.keyboard.press('Escape');
  await pt.waitForTimeout(250);
  diz('e o Esc fecha', await pt.evaluate(() =>
    !document.getElementById('viewer').classList.contains('open')), true);
}

secao('B. tudo que os runtimes procuram existe no arquivo');
/* A REGRA GERAL, para não depender de eu lembrar (v3.332).

   O arquivo do cliente leva cinco runtimes injetados no fim: visualizador,
   barra fixa, brilho, filtros e DTF. Cada um procura elementos por id. Se
   a limpeza da exportação levar um deles, o arquivo continua com a cara
   certa e para de funcionar em silêncio, que foi exatamente o que
   aconteceu com o #viewer.

   Em vez de conferir um id de cada vez, esta seção LÊ o script que foi
   para o arquivo, extrai todo id que ele procura e cobra que exista. Um
   runtime novo, com um elemento novo, já nasce coberto. */
const ids = await pt.evaluate(() => {
  const txt = [...document.querySelectorAll('script')].map(s => s.textContent).join('\n');
  const achados = new Set();
  const re1 = /getElementById\(['"]([\w-]+)/g, re2 = /querySelector(?:All)?\(['"]#([\w-]+)/g;
  let m;
  while ((m = re1.exec(txt))) achados.add(m[1]);
  while ((m = re2.exec(txt))) achados.add(m[1]);
  const lista = [...achados].sort();
  return { procurados: lista, faltando: lista.filter(id => !document.getElementById(id)) };
});
console.log('     procurados: ' + JSON.stringify(ids.procurados));
diz('nenhum elemento procurado pelos runtimes está faltando', ids.faltando, []);

secao('B. a logo sai no papel do arquivo do cliente');
/* IMPRIMIR DO TRELLO SAÍA SEM LOGO NENHUMA (v3.336).

   O editor carrega DUAS logos em cada caixa: a da tela, que segue o
   tema, e a `.logo-papel`, de texto escuro, que só existe para o papel.
   A regra de impressão do editor esconde a primeira e mostra a segunda.

   O exportador apaga a `.logo-papel` do clone, com razão: o arquivo do
   cliente já é claro e a logo que fica ali já é a certa. O que ninguém
   ligou aos dois é que a REGRA DE IMPRESSÃO continuou viajando junto:
   no papel ela escondia a única logo que existia e mandava mostrar uma
   que tinha sido removida.

   Imprimir do editor funcionava, imprimir do arquivo não. Por isso esta
   conferência mede o arquivo EXPORTADO com `@media print` de verdade,
   e conta as logos VISÍVEIS, em vez de conferir que a marcação existe:
   ela existia o tempo todo. */
const contaLogos = async () => pt.evaluate(() => {
  const caixas = [...document.querySelectorAll('.folha-a4 .logo-box,.folha-a4 .folha-logo')];
  return caixas.map(cx => {
    const vis = [...cx.querySelectorAll('img')].filter(im => {
      const r = im.getBoundingClientRect();
      return getComputedStyle(im).display !== 'none' && r.width > 2 && r.height > 2;
    });
    return vis.length;
  });
});
const logosTela = await contaLogos();
await pt.emulateMedia({ media: 'print' });
await pt.waitForTimeout(350);
const logosPapel = await contaLogos();
await pt.emulateMedia({ media: 'screen' });
await pt.waitForTimeout(250);
diz('o arquivo tem caixa de logo em toda folha', logosTela.length > 1, true);
diz('  na tela, uma logo em cada', [...new Set(logosTela)], [1]);
/* O DEFEITO: aqui vinha [0]. Uma folha sem logo é uma folha que não
   parece nossa na mesa do cliente. */
diz('  e no papel também uma em cada', [...new Set(logosPapel)], [1]);

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

secao('B. a barra de filtros nunca quebra de linha');
/* O DEFEITO QUE ELE VIU: a barra crescia de altura sozinha quando o
   ESTADO mudava. Aparecia o limpar, o contador passava de "14 layouts"
   para "3 de 14 layouts", o botão de DTF virava "copiado": cada uma
   dessas mudanças alarga um pedaço, o meio recebe menos espaço, e com
   flex-wrap:wrap os campos caíam para uma segunda linha.

   Conferir "a barra existe" nunca pegaria isso. O que se mede aqui é a
   ALTURA, estado por estado: ela tem de ser a mesma em todos. Uma barra
   que muda de altura no meio do trabalho é a definição do defeito. */
const alturaBarras = () => pt.evaluate(() => {
  const r = {};
  document.querySelectorAll('.ft-filtros').forEach(b => {
    const int = b.querySelector('.ft-fint');
    r[b.id || 'solta'] = {
      alt: Math.round(b.getBoundingClientRect().height),
      /* UMA LINHA SÓ, medida na própria grade: o número de fileiras que
         o navegador calculou. Contar posições dos filhos não serviria,
         porque com align-items:center eles têm alturas diferentes e
         topos diferentes de propósito. */
      fileiras: (getComputedStyle(int).gridTemplateRows || '').split(' ').filter(Boolean).length,
      /* e os campos do meio não podem ter quebrado entre si */
      campos: (() => {
        const cp = int.querySelector('.ft-fcampos');
        if (!cp) return 1;
        const topos = new Set([...cp.children].map(x => Math.round(x.getBoundingClientRect().top)));
        return topos.size;
      })(),
      /* e nada pode transbordar para fora da caixa */
      vaza: int.scrollWidth > int.clientWidth + 1,
    };
  });
  return r;
});
const estados = {};
estados.limpo = await alturaBarras();
await pt.selectOption('#ftFiltros .ft-fsel[data-g="inf"]', 'com');
await pt.waitForTimeout(260);
estados.umFiltro = await alturaBarras();
/* o pior caso é TODO campo escolhido ao mesmo tempo: escolhe a primeira
   opção de verdade de cada um, seja ela qual for neste pedido */
await pt.evaluate(() => {
  document.querySelectorAll('#ftFiltros .ft-fsel,#ftFiltrosFixo .ft-fsel').forEach(sel => {
    const op = [...sel.options].find(o => o.value);
    if (op) { sel.value = op.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
});
await pt.waitForTimeout(300);
estados.tresFiltros = await alturaBarras();
/* e o botão de DTF em estado de "copiado", que era o outro que mexia na largura */
await pt.evaluate(() => {
  document.querySelectorAll('.ft-filtros .dtf-btn').forEach(b => b.classList.add('ok'));
});
await pt.waitForTimeout(200);
estados.copiado = await alturaBarras();
await pt.evaluate(() => {
  document.querySelectorAll('.ft-filtros .dtf-btn').forEach(b => b.classList.remove('ok'));
  const x = document.querySelector('#ftFiltros [data-limpa]'); if (x) x.click();
});
await pt.waitForTimeout(260);
estados.depoisDeLimpar = await alturaBarras();

const nomes = Object.keys(estados);
const idsBarra = Object.keys(estados.limpo);
console.log('     ' + JSON.stringify(estados));
diz('as duas barras existem no arquivo', idsBarra.length, 2);
idsBarra.forEach(id => {
  const alturas = [...new Set(nomes.map(n => estados[n][id].alt))];
  diz('a altura da barra ' + id + ' não muda com o estado', alturas.length, 1);
  diz('  a grade tem sempre uma fileira só',
    [...new Set(nomes.map(n => estados[n][id].fileiras))], [1]);
  diz('  e os campos não quebram entre si',
    [...new Set(nomes.map(n => estados[n][id].campos))], [1]);
  diz('  e nada transborda',
    [...new Set(nomes.map(n => estados[n][id].vaza))], [false]);
});

secao('B. o desenho novo da barra');
const rDes = await pt.evaluate(() => {
  const b = document.getElementById('ftFiltros');
  const lim = b.querySelector('[data-limpa]');
  const dtf = b.querySelector('.dtf-btn');
  const cx = b.querySelector('.ft-fconta');
  return {
    /* o limpar é só um X: nenhum texto dentro */
    limpaTexto: (lim.textContent || '').trim(),
    limpaTitulo: lim.getAttribute('title') || '',
    limpaQuadrado: Math.round(lim.getBoundingClientRect().width) === Math.round(lim.getBoundingClientRect().height),
    /* o botão do pedido é ícone mais DTF */
    dtfTexto: (dtf.querySelector('span') || {}).textContent || '',
    dtfTemIcone: !!dtf.querySelector('svg'),
    dtfTitulo: dtf.getAttribute('title') || '',
    /* o contador perdeu a palavra layout nos dois estados */
    contaLimpo: cx.textContent,
  };
});
console.log('     ' + JSON.stringify(rDes));
diz('o limpar não tem texto, só o X', rDes.limpaTexto, '');
diz('  mas continua dizendo o que faz', rDes.limpaTitulo, 'Limpar filtros');
diz('  e é quadrado', rDes.limpaQuadrado, true);
diz('o botão do pedido é ícone mais DTF', [rDes.dtfTexto, rDes.dtfTemIcone], ['DTF', true]);
diz('  e o title explica o que ele copia', /pedido inteiro/.test(rDes.dtfTitulo), true);
diz('sem filtro, o contador é só o número', rDes.contaLimpo, '14');
await pt.selectOption('#ftFiltros .ft-fsel[data-g="inf"]', 'com');
await pt.waitForTimeout(250);
diz('  com filtro, dois números e nada mais', await pt.evaluate(() =>
  document.querySelector('#ftFiltros .ft-fconta').textContent), '1 de 14');
await pt.selectOption('#ftFiltros .ft-fsel[data-g="inf"]', '');
await pt.waitForTimeout(200);

secao('B. os filtros continuaram funcionando ao lado do botão novo');
await pt.selectOption('#ftFiltros .ft-fsel[data-g="inf"]', 'com');
await pt.waitForTimeout(250);
diz('só o infantil fica aceso', await pt.evaluate(() =>
  document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length), 1);
diz('o contador acompanha', await pt.evaluate(() =>
  document.querySelector('#ftFiltros .ft-fconta').textContent), '1 de 14');
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
