/* O MÓDULO DE INFORMAÇÕES E A BUSCA AMPLIADA DE CLIENTE (v3.328)

   Duas mudanças no editor de orçamento, conferidas juntas porque as duas
   têm a mesma forma: uma coisa que já existia passa a reconhecer sozinha
   um caso que antes obrigava a pessoa a se virar.

     · Um layout com só imagem JÁ ERA um anexo (etiqueta de cliente,
       tabela de medidas, croqui). Ele só não sabia disso, e levava junto
       uma ficha em branco que a fábrica lia como "faltou preencher".
     · Um cliente JÁ ERA conhecido por três nomes (fantasia, razão social
       e a pessoa de contato). A busca só olhava um deles.

   O que este teste cobra, acima de tudo, é a SEGURANÇA das duas: virar
   módulo de informações não pode esconder dado nenhum, e procurar por
   outro caminho não pode mudar o que fica escrito no cabeçalho.  */
import { abreNavegador, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
/* um pixel PNG: o teste precisa de uma imagem de verdade, não do maior
   arquivo que couber */
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf'
  + 'FcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(56)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const nav = await abreNavegador();
const ctx = await nav.newContext({ viewport: { width: 1560, height: 1000 } });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
const err = [];
p.on('pageerror', e => err.push(String(e).slice(0, 200)));
await p.goto(pathToFileURL(DIR + editorAtual()).href, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.fonts.ready);

const esperaCalmo = () => p.waitForTimeout(350);
const põe = (i, sel, v) => p.evaluate(([i, sel, v]) => {
  const t = document.querySelectorAll('.lay-modulo')[i].querySelector(sel);
  t.value = v; t.dispatchEvent(new Event('input', { bubbles: true }));
}, [i, sel, v]);
const põeTabela = (i, v) => p.evaluate(([i, v]) => {
  const c = document.querySelectorAll('.lay-modulo')[i]
    .querySelector('.lay-tabela-mini tbody .c-qtd');
  c.textContent = v; c.dispatchEvent(new Event('input', { bubbles: true }));
}, [i, v]);
const imagem = (i, px) => p.evaluate(([i, px]) => {
  const m = document.querySelectorAll('.lay-modulo')[i];
  aplicaImagem(m.querySelector('.lay-img'), px);
}, [i, px]);
const retrato = () => p.evaluate(() =>
  [...document.querySelectorAll('.lay-modulo')].map(m => ({
    num: m.dataset.num,
    info: m.classList.contains('info'),
    ref: (m.querySelector('.combo-ref textarea') || {}).value || '',
  })));

console.log('\n=== 1. UM LAYOUT COMUM NAO VIRA INFORMACAO ===');
await p.evaluate(() => { document.getElementById('btnNovoLayout').click();
                         document.getElementById('btnNovoLayout').click(); });
await esperaCalmo();
checa('o documento comeca com tres layouts',
  await p.evaluate(() => document.querySelectorAll('.lay-modulo').length), 3);
await põe(0, '.combo-ref textarea', 'FT-010-008C — CAMISETA');
await põe(0, '.combo-tecido textarea', 'PV');
await imagem(0, PX);
await esperaCalmo();
let r = await retrato();
console.log('     ' + JSON.stringify(r));
/* IMAGEM SOZINHA NAO BASTA: o que decide e nada do que SOME estar
   preenchido. Um layout com referencia e tecido continua sendo layout,
   com imagem ou sem. */
checa('layout com referencia e tecido nao vira informacao', r[0].info, false);
checa('  nem os que estao vazios, porque nao tem imagem',
  [r[1].info, r[2].info], [false, false]);

console.log('\n=== 2. SO IMAGEM: VIRA MODULO DE INFORMACOES ===');
await imagem(1, PX);
await esperaCalmo();
r = await retrato();
console.log('     ' + JSON.stringify(r));
checa('o layout que so tem imagem vira informacao',
  r.filter(x => x.info).length, 1);
/* E DESCE PARA O FIM. Um anexo no meio do pedido obriga quem esta no chao
   de fabrica a pular por cima dele. */
checa('  e desce para o fim do pedido', r[r.length - 1].info, true);
/* O NUMERO DESCE JUNTO. Um L-02 impresso na terceira posicao e a receita
   para alguem procurar a folha errada. */
checa('  com o numero do layout acompanhando', r.map(x => x.num), ['1', '2', '3']);

r = await p.evaluate(() => {
  const m = [...document.querySelectorAll('.lay-modulo')].find(x => x.classList.contains('info'));
  const vis = n => getComputedStyle(m.querySelector('.lay-ficha > :nth-child(' + n + ')')).display;
  return {
    selo: getComputedStyle(m.querySelector('.lay-info-selo')).display,
    seloTxt: m.querySelector('.lay-info-selo').textContent,
    tecido: vis(1), cor: vis(2), design: vis(3), tabela: vis(4), obs: vis(5),
    referencia: getComputedStyle(m.querySelector('.combo-ref')).display,
    botao: getComputedStyle(m.querySelector('.lay-btn')).display,
    imagem: !!m.querySelector('.lay-img img'),
  };
});
console.log('     ' + JSON.stringify(r));
checa('a referencia mostra INFORMACOES', [r.selo, r.seloTxt], ['block', 'INFORMAÇÕES']);
checa('  somem tecido, cor e a tabela', [r.tecido, r.cor, r.tabela],
  ['none', 'none', 'none']);
checa('  ficam design e observacao', [r.design, r.obs], ['block', 'block']);
checa('  e tambem a imagem, a referencia e o botao de layout',
  [r.imagem, r.referencia !== 'none', r.botao !== 'none'], [true, true, true]);

console.log('\n=== 3. IMAGEM E OBSERVACAO TAMBEM CONTA ===');
/* Observacao e design continuam a vista no modulo, entao preenche-los nao
   pode tirar ninguem do modo: nada estaria sendo escondido. */
await p.evaluate(() => {
  const m = [...document.querySelectorAll('.lay-modulo')].find(x => x.classList.contains('info'));
  const a = m.querySelector('.lay-area');
  a.textContent = 'Etiqueta que vai costurada na gola.';
  a.dispatchEvent(new Event('input', { bubbles: true }));
});
await esperaCalmo();
checa('escrever a observacao nao tira o modulo do modo informacoes',
  (await retrato()).filter(x => x.info).length, 1);

console.log('\n=== 4. O QUE SOME E EXATAMENTE O QUE DECIDE ===');
/* A propriedade que faz esta feature ser segura: se um campo que some
   estiver preenchido, o modulo NAO fica no modo. Assim virar informacao
   nunca esconde dado nenhum. Conferido campo a campo, sempre no mesmo
   modulo, sempre partindo do zero. */
const zera = () => p.evaluate(px => {
  const m = [...document.querySelectorAll('.lay-modulo')].pop();
  m.querySelectorAll('.combo-ref textarea,.combo-tecido textarea,.combo-cor textarea')
    .forEach(t => { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
  m.querySelectorAll('.lay-tabela-mini tbody .c-qtd,.lay-tabela-mini tbody .c-uni')
    .forEach(c => { c.textContent = ''; c.dispatchEvent(new Event('input', { bubbles: true })); });
  aplicaImagem(m.querySelector('.lay-img'), px);
}, PX);
const noAnexo = (sel, v) => p.evaluate(([sel, v]) => {
  const m = [...document.querySelectorAll('.lay-modulo')].find(x => x.classList.contains('info'))
    || [...document.querySelectorAll('.lay-modulo')].pop();
  if (sel === 'tabela') {
    const c = m.querySelector('.lay-tabela-mini tbody .c-qtd');
    c.textContent = v; c.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const t = m.querySelector(sel);
    t.value = v; t.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, [sel, v]);
const quantosInfo = () => p.evaluate(() =>
  document.querySelectorAll('.lay-modulo.info').length);

const porCampo = [];
for (const [rot, sel, v] of [
  ['tecido', '.combo-tecido textarea', 'DRY FIT'],
  ['cor', '.combo-cor textarea', 'PRETO'],
  ['tabela', 'tabela', '12'],
  ['referencia', '.combo-ref textarea', 'FT-777'],
]) {
  await zera(); await esperaCalmo();
  const virou = await quantosInfo();
  await noAnexo(sel, v); await esperaCalmo();
  porCampo.push({ campo: rot, viraAnexoSozinho: virou === 1, depois: await quantosInfo() });
}
console.log('     ' + JSON.stringify(porCampo));
checa('so com a imagem, ele vira anexo nas quatro vezes',
  porCampo.map(x => x.viraAnexoSozinho), [true, true, true, true]);
checa('  e qualquer campo que SOME o tira do modo na hora',
  porCampo.map(x => x.depois), [0, 0, 0, 0]);

console.log('\n=== 5. DIGITAR A REFERENCIA E A PORTA DE SAIDA ===');
/* Sem esta porta, um layout de verdade em que a imagem foi posta antes do
   resto viraria anexo e ficaria preso assim: os campos que o trariam de
   volta estao justamente entre os que sumiram. A referencia fica. */
await zera(); await esperaCalmo();
r = await p.evaluate(() => {
  const m = document.querySelector('.lay-modulo.info');
  const t = m.querySelector('.combo-ref textarea');
  const daPara = getComputedStyle(t).display !== 'none' && !t.disabled;
  t.value = 'FT-999 — VOLTOU'; t.dispatchEvent(new Event('input', { bubbles: true }));
  return { daPara, info: m.classList.contains('info'),
    ficou: (m.querySelector('.combo-ref textarea') || {}).value };
});
await esperaCalmo();
console.log('     ' + JSON.stringify(r) + '  ' + JSON.stringify(await retrato()));
checa('o campo de referencia continua utilizavel no anexo', r.daPara, true);
checa('  digitar nele devolve o modulo ao normal', r.info, false);
checa('  e o que foi digitado ficou', r.ficou, 'FT-999 — VOLTOU');
checa('nao sobra nenhum anexo', await quantosInfo(), 0);
checa('nenhum modulo se perdeu no caminho',
  await p.evaluate(() => document.querySelectorAll('.lay-modulo').length), 3);

console.log('\n=== 6. DOIS ANEXOS FICAM NA ORDEM ENTRE SI ===');
r = await p.evaluate(async px => {
  document.getElementById('btnNovoLayout').click();
  await new Promise(s => setTimeout(s, 200));
  const M = [...document.querySelectorAll('.lay-modulo')];
  /* o 1o e o 3o viram anexo; o 2o e o 4o continuam layout */
  [0, 2].forEach(i => {
    M[i].querySelectorAll('.combo-ref textarea,.combo-tecido textarea,.combo-cor textarea')
      .forEach(t => { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
    aplicaImagem(M[i].querySelector('.lay-img'), px);
  });
  [1, 3].forEach(i => {
    const t = M[i].querySelector('.combo-ref textarea');
    t.value = 'FT-REAL-' + i; t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(s => setTimeout(s, 400));
  repagina();
  await new Promise(s => setTimeout(s, 200));
  return [...document.querySelectorAll('.lay-modulo')].map(m => ({
    num: m.dataset.num, info: m.classList.contains('info'),
    ref: (m.querySelector('.combo-ref textarea') || {}).value || '' }));
}, PX);
console.log('     ' + JSON.stringify(r));
checa('os dois layouts de producao vem primeiro',
  r.slice(0, 2).map(x => x.info), [false, false]);
checa('  e os dois anexos depois', r.slice(2).map(x => x.info), [true, true]);
checa('  numerados na ordem em que serao impressos',
  r.map(x => x.num), ['1', '2', '3', '4']);

console.log('\n=== 7. A BUSCA DE CLIENTE ACHA POR TRES CAMINHOS ===');
r = await p.evaluate(() => {
  DB.clientes = [
    { id: 'c1', n: 'ARENA CROSS', razao: 'ARENA PROMOCOES DE EVENTOS LTDA',
      resp: 'Dona Marta', doc: '12.345.678/0001-90' },
    { id: 'c2', n: 'VIAPOL', razao: 'VIAPOL INDUSTRIA QUIMICA S.A.',
      resp: 'Ricardo Nunes', doc: '98.765.432/0001-10' },
    { id: 'c3', n: 'FUTURIZE', razao: '', resp: '', doc: '' },
  ];
  sincClientes();
  const inp = document.querySelector('[data-h="cliente"]');
  const busca = q => {
    inp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const b = document.querySelector('#pickMenu .pick-busca');
    b.value = q; b.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('#pickMenu .pick-lista .pick-item')]
      .filter(x => !x.classList.contains('pick-novo'))
      .map(x => ({ v: x.dataset.v, por: (x.querySelector('.pick-por') || {}).textContent || '' }));
  };
  return { nome: busca('arena'), razao: busca('quimica'),
    resp: busca('marta'), doc: busca('98.765'), nada: busca('zzzz') };
});
console.log('     ' + JSON.stringify(r));
checa('pelo nome, como sempre', r.nome.map(x => x.v), ['ARENA CROSS']);
checa('pela razao social', r.razao.map(x => x.v), ['VIAPOL']);
checa('pelo responsavel', r.resp.map(x => x.v), ['ARENA CROSS']);
checa('  e pelo CNPJ de brinde', r.doc.map(x => x.v), ['VIAPOL']);
checa('o que nao existe continua nao existindo', r.nada.length, 0);
/* SEM EXPLICACAO, ACHAR "ARENA CROSS" AO DIGITAR "MARTA" PARECE DEFEITO.
   A linha diz por onde veio o achado, e diz o pedaco CERTO: dos tres
   textos de fora, o que casou. */
checa('a linha diz por onde achou', r.resp[0].por, 'Dona Marta');
checa('  e pela razao mostra a razao', r.razao[0].por, 'VIAPOL INDUSTRIA QUIMICA S.A.');
checa('quem nao tem outro nome nao ganha explicacao nenhuma',
  r.nome[0].por, '');

console.log('\n=== 8. O CABECALHO CONTINUA RECEBENDO O NOME ===');
/* A regra que ele pediu em uma linha: "o que fica no cabecalho e o mesmo
   que ja esta, mesmo que seja buscado por outro meio". */
r = await p.evaluate(() => {
  const inp = document.querySelector('[data-h="cliente"]');
  inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const b = document.querySelector('#pickMenu .pick-busca');
  b.value = 'ricardo'; b.dispatchEvent(new Event('input', { bubbles: true }));
  const linha = document.querySelector('#pickMenu .pick-lista .pick-item');
  const oQueMostra = linha.dataset.v;
  linha.click();
  return { oQueMostra, noCabecalho: inp.value,
    doc: (document.querySelector('[data-h="cpf"]')
      || document.querySelector('[data-h="cnpj"]')
      || document.querySelector('[data-h="cpfcnpj"]') || {}).value || '' };
});
console.log('     ' + JSON.stringify(r));
checa('procurar pelo responsavel e escolher poe o NOME no cabecalho',
  [r.oQueMostra, r.noCabecalho], ['VIAPOL', 'VIAPOL']);
checa('  e o CNPJ do cadastro veio junto, como sempre',
  r.doc, '98.765.432/0001-10');

console.log('\n' + '='.repeat(76));
checa('nenhum erro de pagina', err.length, 0);
if (err.length) err.slice(0, 5).forEach(e => console.log('     ! ' + e));
await nav.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('INFO E BUSCA: o anexo se reconhece sozinho, e o cliente atende por tres nomes');
