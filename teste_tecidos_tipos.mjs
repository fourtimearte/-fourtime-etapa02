/* TECIDOS POR TIPO (v3.334)

   O catálogo de tecidos deixou de ser uma lista de 33 textos corridos e
   passou a ser `{n, g}`: nome e tipo. É a mesma mudança que as cores
   fizeram na v3.288 e as referências na v3.301, e pelo mesmo motivo:
   ninguém procura tecido em ordem alfabética, procura pela família.

   Os tipos e os nomes novos são do Henrique, montados por ele no editor
   de categorias. O que esta suíte cobra é o que a mudança NÃO pode
   quebrar:

     · o `.ft` guarda tecido como TEXTO, e continua guardando
     · nenhum tecido pode sumir na conversão nem no sincronismo
     · quem apagou um tecido de propósito não o vê voltar no plantio
     · o menu do orçamento continua aceitando texto livre
     · mudar de tipo é privilégio de admin, nas duas telas
*/
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

/* a lista que ele mandou, palavra por palavra */
const DELE = {
  ALG: ['ALGODAO 100%','ALGODAO COM ELASTANO','ALGODÃO CONFORT MIX','ALGODAO FLAME',
        'ALGODAO MESCLA COM ELASTANO','ALGODAO MESCLA SEM ELASTANO','ALGODÃO NATURALINHO',
        'ALGODÃO PIMA','ALGODAO STRONG'],
  POL: ['POLIAMIDA 100%','POLIAMIDA COM ELASTANO','POLIAMIDA FLOW COM ELASTANO',
        'POLIAMIDA FRESH','POLIAMIDA FURADINHA COM ELASTANO','POLIAMIDA MICRO PERFURADA'],
  DRY: ['DRY FIT CREPE 100%','DRYFIT COM ELASTANO PROTEÇÃO UV50','DRYFIT FURADINHO COM ELASTANO',
        'DRYFIT FURADINHO SEM ELASTANO','DRYFIT JAKAR 100%','DRYFIT POLIESTER 100%'],
  PIQ: ['PIQUET 100%','PIQUET COM ELASTANO','PIQUET MISTO'],
  MOL: ['MOLETINHO COM ELASTANO','MOLETOM','MOLETOM FELPUDO','MOLETOM SUBLIMAVEL'],
  SPX: ['SUPLEX POLIAMIDA','SUPLEX POLIESTER'],
  VIS: ['VISCOSE PV ANTIPILING','VISCOSE VIS UP LIGTH'],
  PP:  ['POLIESTER PP ANTIPILING'],
  TPA: ['BRIM LEVE','BRIM PESADO','TACTEL POLIAMIDA COM ELASTANO',
        'TACTEL POLIESTE COM ELASTANO','TERBRIM POLIESTER'],
  ESP: ['NEOPRENE'],
};
const TOTAL = Object.values(DELE).reduce((n, a) => n + a.length, 0);

/* a lista antiga, de antes da v3.334, para cobrar a conversão */
const ANTIGA = ["ALGODAO 100%","ALGODAO COM ELASTANO","ALGODAO FLAME","ALGODAO MESCLA COM ELASTANO",
"ALGODAO MESCLA SEM ELASTANO","ALGODAO STRONG","BRIM LEVE","BRIM PESADO","CONFORT MIX MESCLA",
"CREPE DE POLIESTER 100%","DRYFIT COM ELASTANO PROTEÇÃO UV50","DRYFIT FURADINHO COM ELASTANO",
"DRYFIT FURADINHO SEM ELASTANO","DRYFIT POLIESTER 100%","MOLETINHO COM ELASTANO","MOLETOM",
"NATURALINHO","NEOPRENE","PIQUET 100%","PIQUET COM ELASTANO","PIQUET MISTO",
"POLIAMIDA 96% ELASTANO 4%","POLIAMIDA FLOW","POLIAMIDA FRESH","POLIAMIDA FURADINHA COM ELASTANO",
"PV ANTIPILING","SUPLEX 84% POLIESTER 16% ELASTANO","SUPLEX POLIAMIDA","TACTEL COM ELASTANO",
"TERBRIM 65% POLIESTER 35%ALGODAO","VIS UP LIGTH","PROFIT","SG PARIS"];

const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
const erros = [];
p.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await p.goto(pathToFileURL(DIR + (process.env.FT_ARQ || editorAtual())).href);
await esperaPronto(p);

console.log('\n=== 1. O CATALOGO E EXATAMENTE O QUE ELE MANDOU ===');
let r = await p.evaluate(D => {
  const porGrupo = {};
  DB.tecidos.forEach(t => { (porGrupo[t.g] = porGrupo[t.g] || []).push(t.n); });
  Object.keys(porGrupo).forEach(g => porGrupo[g].sort());
  const nomes = DB.tecidos.map(t => t.n);
  const esperado = {};
  Object.keys(D).forEach(g => esperado[g] = D[g].slice().sort());
  return { total: DB.tecidos.length,
    confere: JSON.stringify(porGrupo) === JSON.stringify(esperado),
    porGrupo,
    semTipo: DB.tecidos.filter(t => !t.g).map(t => t.n),
    repetidos: [...new Set(nomes.filter((n, i) => nomes.indexOf(n) !== i))],
    /* a ordem dos tipos é a que ele deu, e é ela que o menu segue */
    ordem: TEC_GRUPO_ORDEM };
}, DELE);
checa('os 39 tecidos estão lá', r.total, TOTAL);
checa('  cada um no tipo que ele escolheu', r.confere, true);
if (!r.confere) console.log('     ' + JSON.stringify(r.porGrupo));
checa('  nenhum ficou sem tipo', r.semTipo, []);
checa('  e nenhum repetido', r.repetidos, []);
checa('a ordem dos tipos é a dele', r.ordem,
  ['ALG','POL','DRY','PIQ','MOL','SPX','VIS','PP','TPA','ESP']);

console.log('\n=== 2. UM BANCO ANTIGO CONVERTE SEM PERDER NADA ===');
/* O caso real: a máquina tem a lista de 33 textos, e o servidor também.
   A conversão precisa dar tipo a quem o nome permite, aplicar os nomes
   novos, e deixar visível o que não dá para adivinhar. */
r = await p.evaluate(A => {
  DB.tecidos = A.slice();          /* o banco velho, textos soltos */
  FT_SYNC.remocoes = {};
  normalizaTecidos();
  const renomeados = ftRenomeiaTecidos();
  ftSemeiaTecidos();
  normalizaTecidos();
  sincTecidos();
  const nomes = DB.tecidos.map(t => t.n);
  return { renomeados,
    total: DB.tecidos.length,
    semTipo: DB.tecidos.filter(t => !t.g).map(t => t.n).sort(),
    /* os nomes velhos que foram trocados não podem ter sobrado */
    sobrouVelho: ['CONFORT MIX MESCLA','NATURALINHO','PV ANTIPILING','VIS UP LIGTH',
      'POLIAMIDA 96% ELASTANO 4%','POLIAMIDA FLOW','SUPLEX 84% POLIESTER 16% ELASTANO',
      'TERBRIM 65% POLIESTER 35%ALGODAO','CREPE DE POLIESTER 100%'].filter(n => nomes.includes(n)),
    /* e os novos entraram no lugar */
    entraramNovos: ['ALGODÃO CONFORT MIX','ALGODÃO NATURALINHO','VISCOSE PV ANTIPILING',
      'VISCOSE VIS UP LIGTH','POLIAMIDA COM ELASTANO','POLIAMIDA FLOW COM ELASTANO',
      'SUPLEX POLIESTER','TERBRIM POLIESTER','DRY FIT CREPE 100%'].every(n => nomes.includes(n)),
    /* sem a lápide, a mesclagem do servidor devolve o nome velho */
    lapides: (FT_SYNC.remocoes.tecidos || []).length,
    temTodosOsNovos: Object.values(A).length >= 0 };
}, ANTIGA);
console.log('     ' + JSON.stringify({ renomeados: r.renomeados, total: r.total, semTipo: r.semTipo, lapides: r.lapides }));
checa('os nove nomes trocados foram trocados', r.renomeados, 9);
checa('  e nenhum nome velho sobrou', r.sobrouVelho, []);
checa('  os novos entraram no lugar', r.entraramNovos, true);
checa('  cada troca virou lápide para o servidor', r.lapides, 9);
/* os três que ele não mapeou continuam VISÍVEIS, em sem tipo: sumir com
   um tecido que vira ordem de compra seria pior que mostrar */
checa('o que não dá para adivinhar fica em sem tipo, à vista',
  r.semTipo, ['PROFIT','SG PARIS','TACTEL COM ELASTANO']);
checa('  e o total é o catálogo mais esses três', r.total, TOTAL + 3);

console.log('\n=== 3. O PLANTIO NAO RESSUSCITA O QUE FOI APAGADO ===');
r = await p.evaluate(() => {
  localStorage.removeItem('fourtime_tecidos_apagados');
  DB.tecidos = DB.tecidos.filter(t => t.n !== 'NEOPRENE');
  const semMarca = (ftSemeiaTecidos(), DB.tecidos.some(t => t.n === 'NEOPRENE'));
  /* agora apagando de propósito */
  tecMarcaApagado('NEOPRENE');
  DB.tecidos = DB.tecidos.filter(t => t.n !== 'NEOPRENE');
  ftSemeiaTecidos();
  const comMarca = DB.tecidos.some(t => t.n === 'NEOPRENE');
  /* e o plantio roda duas vezes sem duplicar nada */
  const antes = DB.tecidos.length;
  ftSemeiaTecidos(); ftSemeiaTecidos();
  const depois = DB.tecidos.length;
  tecDesmarcaApagado('NEOPRENE'); ftSemeiaTecidos(); sincTecidos();
  return { semMarca, comMarca, idempotente: antes === depois,
    voltou: DB.tecidos.some(t => t.n === 'NEOPRENE') };
});
console.log('     ' + JSON.stringify(r));
checa('sumiu sem querer: o plantio devolve', r.semMarca, true);
checa('apagado de propósito: o plantio respeita', r.comMarca, false);
checa('  plantar duas vezes não duplica', r.idempotente, true);
checa('  e desmarcar traz de volta', r.voltou, true);

console.log('\n=== 4. O MENU DO ORCAMENTO, POR TIPO ===');
r = await p.evaluate(async () => {
  /* o banco volta ao catálogo limpo para a contagem bater */
  DB.tecidos = DB.tecidos.filter(t => !['PROFIT','SG PARIS','TACTEL COM ELASTANO'].includes(t.n));
  sincTecidos();
  const ta = document.querySelector('.combo-tecido textarea');
  ta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(s => setTimeout(s, 300));
  const m = document.getElementById('pickMenu');
  const o = { abriu: m.style.display === 'block',
    grupos: [...m.querySelectorAll('.pick-grp')].map(g => g.dataset.g),
    itens: m.querySelectorAll('.pick-item').length,
    recolhidos: m.querySelectorAll('.pick-grp.aberto').length };
  /* buscar abre sozinho quem tem resultado */
  const bu = m.querySelector('.pick-busca');
  bu.value = 'furadinho'; bu.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(s => setTimeout(s, 200));
  o.busca = { grupos: [...m.querySelectorAll('.pick-grp')].map(g => g.dataset.g),
    abertos: m.querySelectorAll('.pick-grp.aberto').length,
    itens: [...m.querySelectorAll('.pick-grp-lista .pick-item')].map(i => i.dataset.v) };
  /* procurar pelo NOME DO TIPO também acha */
  bu.value = 'viscose'; bu.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(s => setTimeout(s, 200));
  o.porTipo = [...m.querySelectorAll('.pick-grp-lista .pick-item')].map(i => i.dataset.v);
  /* texto livre continua existindo */
  bu.value = 'TECIDO QUE NAO EXISTE'; bu.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(s => setTimeout(s, 200));
  o.temUsarAssim = !!m.querySelector('.pick-novo');
  /* e escolher põe no campo */
  bu.value = 'JAKAR'; bu.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(s => setTimeout(s, 200));
  m.querySelector('.pick-grp-lista .pick-item').click();
  await new Promise(s => setTimeout(s, 200));
  o.noCampo = ta.value;
  return o;
});
console.log('     ' + JSON.stringify(r));
checa('o menu abre agrupado', [r.abriu, r.grupos.length], [true, 10]);
checa('  com os 39 tecidos dentro', r.itens, TOTAL);
checa('  e todos os tipos recolhidos', r.recolhidos, 0);
/* "furadinho" com O só existe nos dois dryfit; a poliamida é
   "FURADINHA", com A. É por isso que o termo é esse. */
checa('buscar mostra só o tipo que tem resultado', r.busca.grupos, ['DRY']);
checa('  já aberto, sem precisar clicar', r.busca.abertos, 1);
checa('  com os dois furadinhos', r.busca.itens,
  ['DRYFIT FURADINHO COM ELASTANO','DRYFIT FURADINHO SEM ELASTANO']);
checa('procurar pelo NOME DO TIPO acha o tipo inteiro', r.porTipo,
  ['VISCOSE PV ANTIPILING','VISCOSE VIS UP LIGTH']);
checa('tecido fora do catálogo continua tendo saída', r.temUsarAssim, true);
checa('escolher põe o tecido no campo', r.noCampo, 'DRYFIT JAKAR 100%');

console.log('\n=== 5. ARRASTAR DE TIPO NO MENU E SO DE ADMIN ===');
r = await p.evaluate(async () => {
  const abre = async () => {
    document.getElementById('pickMenu').style.display = 'none';
    const ta = document.querySelector('.combo-tecido textarea');
    ta.value = ''; ta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise(s => setTimeout(s, 250));
    return document.getElementById('pickMenu');
  };
  FT_SYNC.on = true; FT_SYNC.ehAdmin = false;
  let m = await abre();
  const semAdmin = m.querySelectorAll('.pick-alca').length;
  FT_SYNC.ehAdmin = true;
  m = await abre();
  const comAdmin = m.querySelectorAll('.pick-alca').length;
  document.getElementById('pickMenu').style.display = 'none';
  return { semAdmin, comAdmin };
});
console.log('     ' + JSON.stringify(r));
checa('quem não é admin não vê alça nenhuma', r.semAdmin, 0);
checa('  e o admin vê uma por tecido', r.comAdmin, TOTAL);

console.log('\n=== 6. A PAGINA DO BANCO, POR TIPO ===');
r = await p.evaluate(async () => {
  FT_SYNC.ehAdmin = true;
  document.querySelector('.ft-rail-bt[data-sec="banco"]').click();
  await new Promise(s => setTimeout(s, 600));
  bdCat = 'tecidos'; bdBusca = ''; bdRender();
  await new Promise(s => setTimeout(s, 300));
  const pg = document.getElementById('bdPage');
  const o = { cartoes: pg.querySelectorAll('.bd-tg').length,
    seletorDoNovo: !!pg.querySelector('#bdNovoTipo'),
    linhas: pg.querySelectorAll('.bd-tec-linha').length,
    seletores: pg.querySelectorAll('.bd-tec-grupo').length };
  /* mudar o tipo pelo seletor */
  const linha = pg.querySelector('.bd-tec-linha[data-tec="NEOPRENE"]');
  const sel = linha.querySelector('.bd-tec-grupo');
  sel.value = 'TPA'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(s => setTimeout(s, 350));
  o.mudouPeloSeletor = DB.tecidos.find(t => t.n === 'NEOPRENE').g;
  /* o cartão de destino nasce aberto: soltar numa gaveta fechada é o
     gesto terminar no vazio */
  o.destinoAberto = !!document.querySelector('#bdPage .bd-tg[data-g="TPA"].aberto');
  /* e a função de mover é a MESMA que o menu do orçamento usa */
  tecMoveParaGrupo('NEOPRENE', 'ESP');
  bdRender();
  await new Promise(s => setTimeout(s, 300));
  o.voltou = DB.tecidos.find(t => t.n === 'NEOPRENE').g;
  return o;
});
console.log('     ' + JSON.stringify(r));
checa('um cartão por tipo, inclusive os vazios', r.cartoes, 10);
checa('  o tecido novo já nasce com tipo', r.seletorDoNovo, true);
checa('  cada linha tem o seletor de tipo', [r.linhas, r.seletores], [TOTAL, TOTAL]);
checa('mudar pelo seletor muda o cadastro', r.mudouPeloSeletor, 'TPA');
checa('  e o cartão de destino já abre', r.destinoAberto, true);
checa('a mesma função serve as duas telas', r.voltou, 'ESP');

console.log('\n=== 7. RENOMEAR E APAGAR NAO PERDEM O TIPO ===');
r = await p.evaluate(async () => {
  const pg = document.getElementById('bdPage');
  const linha = pg.querySelector('.bd-tec-linha[data-tec="NEOPRENE"]');
  const inp = linha.querySelector('.bd-item-input');
  inp.value = 'NEOPRENE 3MM';
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(s => setTimeout(s, 350));
  const o = { renomeado: DB.tecidos.find(t => t.n === 'NEOPRENE 3MM'),
    /* o objeto continua objeto: um `DB[cat][i]=v` teria trocado por texto
       e o tipo iria junto */
    aindaTemTipo: (DB.tecidos.find(t => t.n === 'NEOPRENE 3MM') || {}).g };
  /* apagar marca para não replantar */
  const l2 = document.querySelector('#bdPage .bd-tec-linha[data-tec="NEOPRENE 3MM"]');
  l2.querySelector('.bd-item-del').click();
  await new Promise(s => setTimeout(s, 350));
  o.apagado = !DB.tecidos.some(t => t.n === 'NEOPRENE 3MM');
  o.marcado = [...JSON.parse(localStorage.getItem('fourtime_tecidos_apagados') || '[]')]
    .includes('NEOPRENE 3MM');
  ftSemeiaTecidos();
  o.naoVoltou = !DB.tecidos.some(t => t.n === 'NEOPRENE 3MM');
  return o;
});
console.log('     ' + JSON.stringify(r));
checa('renomear mantém o objeto e o tipo', r.aindaTemTipo, 'ESP');
checa('apagar tira da lista', r.apagado, true);
checa('  marca para o plantio não replantar', r.marcado, true);
checa('  e ele não volta', r.naoVoltou, true);

console.log('\n=== 8. A FICHA DE MATERIAL CONTINUA LENDO OS TECIDOS ===');
/* a ficha guarda o tecido pelo NOME; com o objeto novo, um `.map(t=>t)`
   esquecido escreveria [object Object] em todo <option> */
r = await p.evaluate(async () => {
  bdCat = 'referencias'; bdBusca = ''; bdRender();
  await new Promise(s => setTimeout(s, 300));
  const ref = DB.referencias[0];
  _bdRefAbertos = new Set([refParse(ref).grupo]);
  _bdFichaAberta = ref;
  if (!fichaDe(ref)) { const f = fichaCria(ref);
    f.tec.push({ nome: (DB.tecidos[0] || {}).n || '', parte: 'Corpo', base: 1, aj: {} }); }
  bdRender();
  await new Promise(s => setTimeout(s, 350));
  const ops = [...document.querySelectorAll('#bdPage .bd-ficha select[data-ft] option')]
    .map(o => o.textContent);
  return { quantas: ops.length, temObjeto: ops.some(t => /object Object/.test(t)),
    primeira: ops[0] || '' };
});
console.log('     ' + JSON.stringify(r));
checa('a ficha lista todos os tecidos', r.quantas > 30, true);
checa('  pelo nome, e não pelo objeto', r.temObjeto, false);

console.log('\n=== 9. UMA MAQUINA COM BANCO ANTIGO ABRE INTEIRA ===');
/* O DEFEITO DA v3.334, e o motivo de esta seção existir.

   Este catálogo é montado no TOPO do script, junto com a leitura do
   banco, muito antes de o resto do editor existir. A conversão dos
   nomes velhos chamava `ftMarcaRemocao`, que toca em `FT_SYNC` — uma
   `const` que só nasce centenas de linhas abaixo. Tocar numa const na
   zona morta não devolve undefined: estoura um ReferenceError, e ele
   MATOU o resto do arquivo inteiro.

   O que se via: a folha fora de lugar (o motor de escala nunca subiu) e
   nenhum botão respondendo (nenhum ouvinte foi ligado).

   Passou pela bateria pelo pior motivo possível: no banco de fábrica da
   v3.334 já não existe nome velho nenhum, então o laço da conversão não
   entrava no corpo e a linha ruim nunca era executada. Máquina limpa
   passava, máquina de verdade quebrava.

   Por isso esta conferência põe um banco ANTIGO no localStorage, recarrega
   e cobra o editor de pé: com zoom calculado, com a folha desenhada e sem
   um único erro de página. */
const errosDepois = [];
p.removeAllListeners('pageerror');
p.on('pageerror', e => errosDepois.push(String(e).slice(0, 200)));
await p.evaluate(A => {
  const bd = JSON.parse(localStorage.getItem('fourtime_bd_v1') || '{}');
  bd.tecidos = A.slice();          /* textos soltos, com os nomes velhos */
  localStorage.setItem('fourtime_bd_v1', JSON.stringify(bd));
}, ANTIGA);
await p.reload({ waitUntil: 'domcontentloaded' });
await esperaPronto(p);
r = await p.evaluate(() => ({
  zoom: window.ZOOM > 0,
  folha: !!document.querySelector('.folha-a4'),
  /* o motor de escala pôs a largura na área: é o sinal de que o script
     chegou até o fim */
  temLargura: !!(document.querySelector('.area-paginas') || {}).style.width,
  botoes: typeof window.gerarHTML === 'function' && !!document.getElementById('btnNovoLayout'),
  tecidos: DB.tecidos.length,
  objetos: DB.tecidos.every(t => t && typeof t === 'object' && t.n),
  /* e a conversão aconteceu de verdade, não só "não quebrou" */
  converteu: DB.tecidos.some(t => t.n === 'VISCOSE PV ANTIPILING'),
  velhoSumiu: !DB.tecidos.some(t => t.n === 'PV ANTIPILING'),
  /* a lápide da troca saiu da fila assim que FT_SYNC passou a existir */
  lapide: (FT_SYNC.remocoes.tecidos || []).includes('PV ANTIPILING'),
}));
console.log('     ' + JSON.stringify(r));
checa('o editor sobe inteiro com banco antigo',
  [r.zoom, r.folha, r.temLargura, r.botoes], [true, true, true, true]);
checa('  sem um único erro de página', errosDepois, []);
checa('  o banco velho virou objeto', r.objetos, true);
checa('  a conversão rodou', [r.converteu, r.velhoSumiu], [true, true]);
checa('  e a lápide saiu da fila quando deu', r.lapide, true);

console.log('\n' + '='.repeat(76));
checa('nenhum erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 5).forEach(e => console.log('     ! ' + e));
await b.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('TECIDOS POR TIPO: o catálogo dele, a conversão sem perda e as duas telas');
