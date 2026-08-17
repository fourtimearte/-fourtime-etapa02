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
/* o bloco da observacao virou flex na v3.329 para poder esticar e ocupar
   o que a tabela deixou; o que importa aqui e que os dois estao visiveis */
checa('  ficam design e observacao',
  [r.design !== 'none', r.obs !== 'none'], [true, true]);
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

/* A REFERENCIA SAIU DESTA LISTA na v3.329: ela NAO some no modo
   informacoes, entao escrever nela nao esconde nada e nao precisa tirar
   ninguem do modo. E ali que se escreve o que a informacao e. */
const porCampo = [];
for (const [rot, sel, v] of [
  ['tecido', '.combo-tecido textarea', 'DRY FIT'],
  ['cor', '.combo-cor textarea', 'PRETO'],
  ['tabela', 'tabela', '12'],
]) {
  await zera(); await esperaCalmo();
  const virou = await quantosInfo();
  await noAnexo(sel, v); await esperaCalmo();
  porCampo.push({ campo: rot, viraAnexoSozinho: virou === 1, depois: await quantosInfo() });
}
console.log('     ' + JSON.stringify(porCampo));
checa('so com a imagem, ele vira anexo nas tres vezes',
  porCampo.map(x => x.viraAnexoSozinho), [true, true, true]);
checa('  e qualquer campo que SOME o tira do modo na hora',
  porCampo.map(x => x.depois), [0, 0, 0]);

console.log('\n=== 5. ESCREVER NA FRENTE DE INFORMACOES (v3.329) ===');
/* O anexo precisa dizer O QUE ele e ("INFORMACOES  ETIQUETA DE GOLA"), e
   esse texto so tem um lugar razoavel para morar: a referencia, que e o
   unico campo de titulo que sobrou a vista.

   Isso obrigou a separar ENTRAR de FICAR. Entrar continua exigindo a
   referencia vazia, senao um layout de producao em que alguem ja digitou
   a referencia viraria anexo ao colar a imagem. Ficar nao exige: a
   referencia nao some, entao escrever nela nao esconde nada. */
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
/* mas preencher o que SOME continua tirando, que e a propriedade de
   seguranca da secao 4 */
await noAnexo('.combo-tecido textarea', 'PV'); await esperaCalmo();
checa('  preencher tecido continua tirando', await quantosInfo(), 0);

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
  checa('  com a palavra escrita', r.temPalavra, true);
  checa('  o CSS que o desenha', r.temCss, true);
  checa('  e a marca de anexo no modulo', r.temClasse, true);
}

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
