/* O MÓDULO DE INFORMAÇÕES E A BUSCA AMPLIADA DE CLIENTE
   (v3.328, e o botão da v3.331)

   O anexo (etiqueta de cliente, tabela de medidas, croqui) precisa ir
   junto do pedido sem levar uma ficha de produção em branco atrás. Da
   v3.328 à v3.330 ele era reconhecido sozinho: imagem e mais nada virava
   informação na hora.

   ERA ISSO QUE ESTAVA ERRADO, e é o que esta suíte passa a cobrar ao
   contrário. Montar um layout começa por colar a imagem: naquele
   instante o módulo tinha imagem e nada mais, virava anexo, e tecido,
   cor e tabela sumiam da frente de quem estava indo preenchê-los. O
   automatismo acertava o caso raro e atrapalhava o caso comum.

   Agora quem decide é um botão ao lado da referência. As duas
   propriedades que esta suíte defende:

     · NADA muda de forma sozinho. Imagem, observação, design, o que for:
       enquanto o botão estiver apagado, é layout de produção.
     · Marcar nunca PERDE dado. O que some fica guardado e volta inteiro
       ao desmarcar; se havia algo preenchido, o editor avisa.

   A segunda metade é a busca de cliente por três nomes (fantasia, razão
   social e responsável), que não pode mudar o que vai para o cabeçalho.  */
import { abreNavegador, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
/* FT_ARQ permite apontar para uma versao especifica: e assim que se
   confere que uma conferencia nova REPROVA na versao anterior. */
const ARQ = process.env.FT_ARQ || editorAtual();
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
await p.goto(pathToFileURL(DIR + ARQ).href, { waitUntil: 'domcontentloaded' });
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
/* o botão que transforma em informações, à direita da referência */
const marca = (i) => p.evaluate(i => {
  document.querySelectorAll('.lay-modulo')[i].querySelector('.lay-info-btn').click();
}, i);
const marcaNoInfo = () => p.evaluate(() => {
  const m = document.querySelector('.lay-modulo.info')
    || [...document.querySelectorAll('.lay-modulo')].pop();
  m.querySelector('.lay-info-btn').click();
});
const retrato = () => p.evaluate(() =>
  [...document.querySelectorAll('.lay-modulo')].map(m => ({
    num: m.dataset.num,
    info: m.classList.contains('info'),
    ref: (m.querySelector('.combo-ref textarea') || {}).value || '',
  })));

console.log('\n=== 1. NADA VIRA INFORMACAO SOZINHO ===');
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
checa('layout com referencia e tecido nao vira informacao', r[0].info, false);
checa('  nem os vazios', [r[1].info, r[2].info], [false, false]);

console.log('\n=== 1b. O DEFEITO DELE: A IMAGEM PRIMEIRO ===');
/* "se uma pessoa comeca criando um modulo de layout e coloca a imagem
   primeiro ele automaticamente ja remove o resto e deixa so observacao".

   Esta e a ordem natural de montar um layout, e era exatamente a que
   quebrava. O modulo tem imagem e mais nada; os campos que ela vai
   preencher em seguida PRECISAM continuar na frente dela. */
await imagem(1, PX);
await esperaCalmo();
r = await p.evaluate(() => {
  const m = document.querySelectorAll('.lay-modulo')[1];
  /* POR NOME, e nao por posicao. A v3.340 juntou tecido e cor num
     bloco so, e a ficha passou de cinco blocos para quatro: todo
     `nth-child` daqui passou a apontar para outra coisa. */
  const CL = { 1: '.lf-tec', 2: '.lf-tec', 3: '.lf-design', 4: '.lf-tabela', 5: '.lf-obs' };
  const vis = n => getComputedStyle(m.querySelector('.lay-ficha > ' + CL[n])).display;
  return { info: m.classList.contains('info'),
    tecido: vis(1), cor: vis(2), tabela: vis(4),
    aceso: ((m.querySelector('.lay-info-btn')||{getAttribute:()=>'sem botão'}).getAttribute('aria-pressed')),
    quantosInfo: document.querySelectorAll('.lay-modulo.info').length };
});
console.log('     ' + JSON.stringify(r));
checa('so a imagem NAO transforma o modulo', r.info, false);
checa('  tecido, cor e tabela continuam na frente de quem vai preencher',
  [r.tecido, r.cor, r.tabela].map(x => x !== 'none'), [true, true, true]);
checa('  e o botao esta apagado', r.aceso, 'false');
checa('  nenhum anexo apareceu no pedido', r.quantosInfo, 0);
/* e da para terminar de montar o layout normalmente */
await põe(1, '.combo-tecido textarea', 'DRY FIT');
await põe(1, '.combo-cor textarea', 'PRETO');
await põeTabela(1, '10');
await esperaCalmo();
r = await retrato();
checa('o layout se monta inteiro sem virar anexo no meio do caminho',
  r.map(x => x.info), [false, false, false]);

console.log('\n=== 2. O BOTAO TRANSFORMA, E DESCE PARA O FIM ===');
/* o modulo 3, vazio, recebe imagem e o clique */
await imagem(2, PX);
await esperaCalmo();
await marca(2);
await esperaCalmo();
r = await retrato();
console.log('     ' + JSON.stringify(r));
checa('marcar o botao transforma em informacao',
  r.filter(x => x.info).length, 1);
/* E DESCE PARA O FIM. Um anexo no meio do pedido obriga quem esta no chao
   de fabrica a pular por cima dele. */
checa('  e desce para o fim do pedido', r[r.length - 1].info, true);
/* O NUMERO DESCE JUNTO. Um L-02 impresso na terceira posicao e a receita
   para alguem procurar a folha errada. */
checa('  com o numero do layout acompanhando', r.map(x => x.num), ['1', '2', '3']);

r = await p.evaluate(() => {
  const m = document.querySelector('.lay-modulo.info');
  /* POR NOME, e nao por posicao. A v3.340 juntou tecido e cor num
     bloco so, e a ficha passou de cinco blocos para quatro: todo
     `nth-child` daqui passou a apontar para outra coisa. */
  const CL = { 1: '.lf-tec', 2: '.lf-tec', 3: '.lf-design', 4: '.lf-tabela', 5: '.lf-obs' };
  const vis = n => getComputedStyle(m.querySelector('.lay-ficha > ' + CL[n])).display;
  return {
    selo: getComputedStyle(m.querySelector('.lay-info-selo')).display,
    seloTxt: m.querySelector('.lay-info-selo').textContent,
    tecido: vis(1), cor: vis(2), design: vis(3), tabela: vis(4), obs: vis(5),
    referencia: getComputedStyle(m.querySelector('.combo-ref')).display,
    botao: getComputedStyle(m.querySelector('.lay-btn')).display,
    aceso: ((m.querySelector('.lay-info-btn')||{getAttribute:()=>'sem botão'}).getAttribute('aria-pressed')),
    convite: m.querySelector('.combo-ref textarea').placeholder,
    imagem: !!m.querySelector('.lay-img img'),
  };
});
console.log('     ' + JSON.stringify(r));
checa('a referencia mostra INFORMACOES', [r.selo, r.seloTxt], ['block', 'INFORMAÇÕES']);
checa('  somem tecido, cor e a tabela', [r.tecido, r.cor, r.tabela],
  ['none', 'none', 'none']);
/* o bloco da observacao virou flex na v3.329 para poder esticar e ocupar
   o que a tabela deixou; o que importa aqui e que os dois estao visiveis */
checa('  ficam design e observacao',
  [r.design !== 'none', r.obs !== 'none'], [true, true]);
checa('  e tambem a imagem, a referencia e o botao de layout',
  [r.imagem, r.referencia !== 'none', r.botao !== 'none'], [true, true, true]);
checa('  o botao fica aceso, dizendo por que a ficha encolheu', r.aceso, 'true');
checa('  e o campo convida a dizer o que e', r.convite, 'o que é esta informação…');

console.log('\n=== 2b. DESMARCAR VOLTA A SER LAYOUT ===');
await marcaNoInfo();
await esperaCalmo();
r = await p.evaluate(() => {
  const m = [...document.querySelectorAll('.lay-modulo')].pop();
  /* POR NOME, e nao por posicao. A v3.340 juntou tecido e cor num
     bloco so, e a ficha passou de cinco blocos para quatro: todo
     `nth-child` daqui passou a apontar para outra coisa. */
  const CL = { 1: '.lf-tec', 2: '.lf-tec', 3: '.lf-design', 4: '.lf-tabela', 5: '.lf-obs' };
  const vis = n => getComputedStyle(m.querySelector('.lay-ficha > ' + CL[n])).display;
  return { quantosInfo: document.querySelectorAll('.lay-modulo.info').length,
    tecido: vis(1), cor: vis(2), tabela: vis(4),
    aceso: ((m.querySelector('.lay-info-btn')||{getAttribute:()=>'sem botão'}).getAttribute('aria-pressed')),
    convite: m.querySelector('.combo-ref textarea').placeholder };
});
console.log('     ' + JSON.stringify(r));
checa('desmarcar devolve o layout de producao', r.quantosInfo, 0);
checa('  com tecido, cor e tabela de volta',
  [r.tecido, r.cor, r.tabela].map(x => x !== 'none'), [true, true, true]);
checa('  o botao apaga', r.aceso, 'false');
checa('  e o campo volta a pedir a referencia', r.convite, 'Referência');
await marca(2); await esperaCalmo();   /* volta a ser anexo para as proximas secoes */

console.log('\n=== 3. NADA DO QUE SE DIGITA TIRA O MODULO DO MODO ===');
/* Na versao automatica, preencher tecido, cor ou a tabela expulsava o
   modulo do modo na tecla. Isso era o outro lado da mesma moeda: o
   estado mudava debaixo da mao de quem estava digitando. Agora so o
   botao muda o estado. */
await p.evaluate(() => {
  const m = document.querySelector('.lay-modulo.info');
  const a = m.querySelector('.lay-area');
  a.textContent = 'Etiqueta que vai costurada na gola.';
  a.dispatchEvent(new Event('input', { bubbles: true }));
});
await esperaCalmo();
checa('escrever a observacao nao tira o modulo do modo',
  (await retrato()).filter(x => x.info).length, 1);

const noAnexo = (sel, v) => p.evaluate(([sel, v]) => {
  const m = document.querySelector('.lay-modulo.info')
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
]) {
  await noAnexo(sel, v); await esperaCalmo();
  porCampo.push({ campo: rot, continua: await quantosInfo() });
}
console.log('     ' + JSON.stringify(porCampo));
checa('preencher os campos escondidos nao expulsa mais ninguem',
  porCampo.map(x => x.continua), [1, 1, 1]);

console.log('\n=== 4. MARCAR ESCONDE, MAS NUNCA PERDE ===');
/* A versao automatica garantia que virar informacao nunca escondia dado
   nenhum porque dado preenchido impedia a conversao. Com um botao, essa
   recusa seria um clique sem resposta. A garantia passa a ser outra, e
   mais forte: o dado nao e apagado, so fica guardado, e volta inteiro. */
r = await p.evaluate(async () => {
  const m = document.querySelector('.lay-modulo.info');
  /* ele esta marcado e com tecido, cor e tabela preenchidos pela secao 3 */
  const escondido = {
    /* tecido e cor sao o MESMO bloco desde a v3.340 */
    tecido: getComputedStyle(m.querySelector('.lay-ficha > .lf-tec')).display,
    cor: getComputedStyle(m.querySelector('.lay-ficha > .lf-tec')).display,
    tabela: getComputedStyle(m.querySelector('.lay-ficha > .lf-tabela')).display };
  const guardado = {
    tecido: m.querySelector('.combo-tecido textarea').value,
    cor: m.querySelector('.combo-cor textarea').value,
    tabela: m.querySelector('.lay-tabela-mini tbody .c-qtd').textContent.trim() };
  /* e o arquivo leva tudo junto: desmarcar amanha devolve o layout inteiro */
  const L = coletaEstado().layouts.filter(x => x.info)[0] || {};
  return { escondido, guardado,
    noArquivo: { tecidos: L.tecidos, cor: L.cor, tamanhos: Object.keys(L.tamanhos || {}).length > 0 } };
});
console.log('     ' + JSON.stringify(r));
checa('o que some esta mesmo escondido',
  [r.escondido.tecido, r.escondido.cor, r.escondido.tabela], ['none', 'none', 'none']);
checa('  mas continua guardado no campo',
  [r.guardado.tecido, r.guardado.cor, r.guardado.tabela], ['DRY FIT', 'PRETO', '12']);
checa('  e vai inteiro para o arquivo',
  [r.noArquivo.tecidos[0], r.noArquivo.cor, r.noArquivo.tamanhos],
  ['DRY FIT', 'PRETO', true]);
/* desmarcar traz tudo de volta a vista, exatamente como estava */
await marcaNoInfo(); await esperaCalmo();
r = await p.evaluate(() => {
  const m = [...document.querySelectorAll('.lay-modulo')].pop();
  return { tecido: m.querySelector('.combo-tecido textarea').value,
    cor: m.querySelector('.combo-cor textarea').value,
    tabela: m.querySelector('.lay-tabela-mini tbody .c-qtd').textContent.trim(),
    visivel: getComputedStyle(m.querySelector('.lay-ficha > .lf-tec')).display !== 'none' };
});
console.log('     ' + JSON.stringify(r));
checa('desmarcar devolve tudo a vista, sem perder um caractere',
  [r.tecido, r.cor, r.tabela, r.visivel], ['DRY FIT', 'PRETO', '12', true]);

/* daqui para baixo o ultimo modulo volta a ser um anexo limpo */
const zera = () => p.evaluate(px => {
  const m = [...document.querySelectorAll('.lay-modulo')].pop();
  m.querySelectorAll('.combo-ref textarea,.combo-tecido textarea,.combo-cor textarea')
    .forEach(t => { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
  m.querySelectorAll('.lay-tabela-mini tbody .c-qtd,.lay-tabela-mini tbody .c-uni')
    .forEach(c => { c.textContent = ''; c.dispatchEvent(new Event('input', { bubbles: true })); });
  aplicaImagem(m.querySelector('.lay-img'), px);
  if (!m.classList.contains('info')) m.querySelector('.lay-info-btn').click();
}, PX);

console.log('\n=== 5. ESCREVER NA FRENTE DE INFORMACOES (v3.329) ===');
/* O anexo precisa dizer O QUE ele e ("INFORMACOES  ETIQUETA DE GOLA"), e
   esse texto so tem um lugar razoavel para morar: a referencia, que e o
   unico campo de titulo que sobrou a vista.

   Na v3.329 isso obrigou a separar ENTRAR de FICAR, porque entrar era
   automatico e escrever na referencia expulsava o modulo. Com o botao da
   v3.331 a distincao deixou de existir: nao ha mais "entrar sozinho", e
   nenhum campo digitado mexe no estado. O que continua valendo, e e o
   que esta secao cobra, e o selo aparecer como prefixo e o texto poder
   ser escrito na frente dele. */
await zera(); await esperaCalmo();
r = await p.evaluate(() => {
  const m = document.querySelector('.lay-modulo.info');
  const selo = m.querySelector('.lay-info-selo');
  const cx = m.querySelector('.combo-ref .ft-combo-caixa');
  const ta = m.querySelector('.combo-ref textarea');
  const rs = selo.getBoundingClientRect(), rc = cx.getBoundingClientRect();
  return {
    seloVisivel: getComputedStyle(selo).display !== 'none',
    /* A MARGEM QUE FALTAVA: o selo era absoluto em `left:0`, ou seja, na
       borda da caixa, enquanto todo o resto do documento respeita o
       respiro interno. Como item normal da linha, ele herda esse respiro. */
    respiroDoSelo: rs.left - rc.left >= parseFloat(getComputedStyle(cx).paddingLeft) - 0.5,
    campoDepoisDoSelo: ta.getBoundingClientRect().left >= rs.right - 0.5,
    /* e o que se digita PRECISA aparecer: na v3.328 o texto era
       transparente para nao se sobrepor ao selo */
    textoTransparente: /transparent|rgba\(0, 0, 0, 0\)/.test(getComputedStyle(ta).color),
    convite: ta.placeholder,
  };
});
console.log('     ' + JSON.stringify(r));
checa('o selo INFORMACOES aparece na linha da referencia', r.seloVisivel, true);
checa('  respeitando o respiro da caixa, como todo o resto', r.respiroDoSelo, true);
checa('  e o campo comeca DEPOIS dele', r.campoDepoisDoSelo, true);
checa('  o que se digita nao e invisivel', r.textoTransparente, false);
checa('  e o campo convida a dizer o que e', r.convite, 'o que é esta informação…');

await noAnexo('.combo-ref textarea', 'ETIQUETA DE GOLA'); await esperaCalmo();
r = await p.evaluate(() => {
  const m = document.querySelector('.lay-modulo.info');
  return { info: !!m, texto: m ? m.querySelector('.combo-ref textarea').value : '' };
});
console.log('     ' + JSON.stringify(r));
checa('escrever na referencia NAO tira o anexo do modo', r.info, true);
checa('  e o texto fica', r.texto, 'ETIQUETA DE GOLA');
/* e preencher o que some tambem nao tira mais: guarda, esconde e avisa */
await noAnexo('.combo-tecido textarea', 'PV'); await esperaCalmo();
checa('  preencher tecido tambem nao tira', await quantosInfo(), 1);
checa('  e o tecido fica guardado, fora da vista',
  await p.evaluate(() => {
    const m = document.querySelector('.lay-modulo.info');
    return [m.querySelector('.combo-tecido textarea').value,
      getComputedStyle(m.querySelector('.lay-ficha > .lf-tec')).display];
  }), ['PV', 'none']);

console.log('\n=== 5b. O MODO SOBREVIVE A SALVAR E REABRIR ===');
/* O modo deixou de ser deduzivel a partir dos campos no instante em que a
   referencia passou a poder ser escrita: um anexo com "ETIQUETA DE GOLA"
   na referencia e igualzinho, de fora, a um layout que so tem referencia
   e imagem. Por isso ele passou a ser GRAVADO. */
await zera(); await esperaCalmo();
await noAnexo('.combo-ref textarea', 'TABELA DE MEDIDAS'); await esperaCalmo();
r = await p.evaluate(async () => {
  const doc = coletaEstado();
  const gravou = doc.layouts.map(l => !!l.info);
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'x.ft', '');
  await new Promise(s => setTimeout(s, 700));
  const m = document.querySelector('.lay-modulo.info');
  return { gravou, reabriu: !!m,
    ref: m ? m.querySelector('.combo-ref textarea').value : '',
    quantos: document.querySelectorAll('.lay-modulo').length };
});
console.log('     ' + JSON.stringify(r));
checa('o arquivo guarda quem e anexo', r.gravou.filter(Boolean).length, 1);
checa('  reabrir devolve o modo', r.reabriu, true);
checa('  com o texto que estava la', r.ref, 'TABELA DE MEDIDAS');
checa('  e sem perder modulo nenhum', r.quantos, 3);

console.log('\n=== 5c. A OBSERVACAO NAO ENCOLHE NO MODO SEM VALOR ===');
/* A grade do modo sem dinheiro tem `align-items:start`. No modulo de
   informacoes, onde a tabela sumiu e sobrou meia ficha vazia, isso
   deixava a observacao do tamanho do texto, com um vao embaixo. */
r = await p.evaluate(async () => {
  const mede = () => {
    const m = document.querySelector('.lay-modulo.info');
    return {
      obs: +m.querySelector('.lay-area').getBoundingClientRect().height.toFixed(1),
      ficha: +m.querySelector('.lay-ficha').getBoundingClientRect().height.toFixed(1) };
  };
  const com = mede();
  document.body.classList.add('sem-dinheiro');
  await new Promise(s => setTimeout(s, 350));
  const sem = mede();
  document.body.classList.remove('sem-dinheiro');
  await new Promise(s => setTimeout(s, 250));
  return { com, sem };
});
console.log('     ' + JSON.stringify(r));
checa('sem valor, a observacao nao fica menor que com valor',
  r.sem.obs >= r.com.obs, true);
/* e ela ocupa o que a tabela deixou, em vez de abrir um vao */
checa('  e preenche a ficha, sem vao embaixo',
  r.sem.obs > r.sem.ficha * 0.55, true);

console.log('\n=== 6. DOIS ANEXOS FICAM NA ORDEM ENTRE SI ===');
r = await p.evaluate(async px => {
  document.getElementById('btnNovoLayout').click();
  await new Promise(s => setTimeout(s, 200));
  const M = [...document.querySelectorAll('.lay-modulo')];
  /* o 1o e o 3o viram anexo pelo BOTAO; o 2o e o 4o continuam layout */
  const poe = (m, quer) => {
    if (m.classList.contains('info') !== quer) m.querySelector('.lay-info-btn').click();
  };
  [0, 2].forEach(i => {
    M[i].querySelectorAll('.combo-ref textarea,.combo-tecido textarea,.combo-cor textarea')
      .forEach(t => { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
    aplicaImagem(M[i].querySelector('.lay-img'), px);
    poe(M[i], true);
  });
  [1, 3].forEach(i => {
    poe(M[i], false);
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

console.log('\n=== 6b. O SELO SAI CERTO NO PAPEL E NO ARQUIVO DO TRELLO ===');
/* Ele reclamou dos TRES lugares: editor, HTML do Trello e A4 impresso. A
   margem era a mesma causa nos tres (o `left:0` do absoluto), mas cobrar
   so o editor deixaria os outros dois na fe. */
r = await p.evaluate(async () => {
  const m = document.querySelector('.lay-modulo.info');
  const mede = () => {
    const selo = m.querySelector('.lay-info-selo');
    const cx = m.querySelector('.combo-ref .ft-combo-caixa');
    const ta = m.querySelector('.combo-ref textarea');
    const rs = selo.getBoundingClientRect(), rc = cx.getBoundingClientRect();
    return { colado: rs.left - rc.left < 2,
      depois: ta.getBoundingClientRect().left >= rs.right - 0.5,
      visivel: getComputedStyle(selo).display !== 'none' };
  };
  const tela = mede();
  /* IMPRESSAO: o editor imprime a propria folha, entao o que vale e como
     ela fica com as regras de @media print aplicadas. */
  document.body.classList.add('imprimindo');
  await new Promise(s => setTimeout(s, 250));
  const papel = mede();
  document.body.classList.remove('imprimindo');
  return { tela, papel };
});
console.log('     ' + JSON.stringify(r));
checa('na tela o selo nao encosta na borda', r.tela.colado, false);
checa('  e no papel tambem nao', r.papel.colado, false);
checa('  nos dois o campo vem depois dele',
  [r.tela.depois, r.papel.depois], [true, true]);

/* O ARQUIVO DO TRELLO e o documento exportado: o selo tem de ir junto, e
   o CSS que o desenha tambem. Sem o segundo, ele apareceria como texto
   solto no meio da referencia. */
r = await p.evaluate(() => {
  /* `gerarHTML` e o mesmo gerador que o botao do Trello usa: o exportador
     so comprime as imagens antes de chama-lo. */
  if (typeof gerarHTML !== 'function') return { pulou: true };
  let html = '';
  try { html = String(gerarHTML() || ''); } catch (e) { return { erro: String(e.message).slice(0, 120) }; }
  return { pulou: false,
    temSelo: html.indexOf('lay-info-selo') >= 0,
    temBotao: /<button[^>]*lay-info-btn/.test(html),
    temPalavra: html.indexOf('INFORMAÇÕES') >= 0,
    temCss: html.indexOf('.lay-modulo.info') >= 0,
    temClasse: /class="[^"]*\blay-modulo\b[^"]*\binfo\b/.test(html)
             || /class="[^"]*\binfo\b[^"]*\blay-modulo\b/.test(html) };
});
console.log('     ' + JSON.stringify(r));
if (r.pulou) {
  console.log('     (a exportacao do Trello nao esta exposta nesta pagina; conferida na suite propria)');
} else {
  checa('o arquivo do Trello leva o selo', r.temSelo, true);
  checa('  e NAO leva o botao, que e coisa do editor', r.temBotao, false);
  checa('  com a palavra escrita', r.temPalavra, true);
  checa('  o CSS que o desenha', r.temCss, true);
  checa('  e a marca de anexo no modulo', r.temClasse, true);
}

console.log('\n=== 6c. O BOTAO E DO EDITOR, E SO DELE ===');
const displayDoBotao = () => p.evaluate(() => {
  const m = document.querySelector('.lay-modulo.info') || document.querySelector('.lay-modulo');
  return getComputedStyle(m.querySelector('.lay-info-btn')).display;
});
/* o `@media print` de verdade, e nao uma classe que imita impressao */
const tela = await displayDoBotao();
await p.emulateMedia({ media: 'print' });
await esperaCalmo();
const papel = await displayDoBotao();
await p.emulateMedia({ media: 'screen' });
await esperaCalmo();
r = { tela, papel };
console.log('     ' + JSON.stringify(r));
checa('no editor o botao existe', r.tela !== 'none', true);
checa('  e no papel ele some', r.papel, 'none');

console.log('\n=== 6d. ARQUIVO ANTIGO NAO PERDE OS ANEXOS ===');
/* Um .ft salvo antes da v3.329 nao tem a marca `info`, porque ela nao
   existia. Se a marca ausente fosse lida como "nao e anexo", todo anexo
   de todo orcamento ja arquivado voltaria a abrir como layout de
   producao, com a ficha vazia atras. A deducao antiga roda uma vez, so
   nesse caso, e so quando NADA alem da imagem esta preenchido. */
r = await p.evaluate(async px => {
  const doc = { _formato: 'FOURTIME_ORCAMENTO', _versao: 2, header: {}, anotacoes: [],
    layouts: [
      /* anexo de arquivo velho: imagem e mais nada */
      { img: px, tecidos: [''], design: [], tamanhos: {} },
      /* layout de verdade de arquivo velho: imagem e tecido */
      { img: px, tecidos: ['PV'], cor: '', design: [], tamanhos: {} },
      /* arquivo novo manda a marca, e ela ganha de qualquer deducao:
         um anexo com a ficha preenchida continua anexo */
      { img: px, tecidos: ['DRY FIT'], cor: 'PRETO', design: [], tamanhos: {}, info: true },
      /* e um layout com so imagem, marcado como layout, CONTINUA layout */
      { img: px, tecidos: [''], design: [], tamanhos: {}, info: false },
    ] };
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'velho.ft', '');
  await new Promise(s => setTimeout(s, 800));
  /* a ordem impressa se decide na repaginacao, que e por onde passa
     qualquer mexida no documento */
  repagina();
  await new Promise(s => setTimeout(s, 300));
  return [...document.querySelectorAll('.lay-modulo')].map(m => ({
    info: m.classList.contains('info'),
    aceso: ((m.querySelector('.lay-info-btn')||{getAttribute:()=>'sem botão'}).getAttribute('aria-pressed')),
    tecido: m.querySelector('.combo-tecido textarea').value }));
}, PX);
console.log('     ' + JSON.stringify(r));
/* a ordem na tela ja e a de impressao: os layouts primeiro, anexos no fim */
checa('o anexo velho continua anexo, e os layouts continuam layouts',
  r.map(x => x.info), [false, false, true, true]);
checa('  o botao de cada um conta a mesma historia',
  r.map(x => x.aceso), ['false', 'false', 'true', 'true']);
checa('  e o anexo com ficha preenchida guardou o tecido',
  r.filter(x => x.info).map(x => x.tecido).sort(), ['', 'DRY FIT']);

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
console.log('INFO E BUSCA: o anexo e uma escolha no botao, e o cliente atende por tres nomes');
