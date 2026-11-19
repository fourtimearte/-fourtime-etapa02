/* O TAMANHO 16A NA GRADE INFANTIL (v3.384)

   Pedido do Henrique em 19/11/2026: "colocar mais um tamanho na grade
   infantil, o 16A". Ele entra no fim da grade infantil, depois do 14A.
   A suite cobra:
     · a lista TAM_INFANTIL termina em 14A, 16A
     · a grade infantil desenha 8 linhas, a ultima e o 16A
     · a quantidade do 16A conta no total e vai para o .ft
     · o .ft com 16A reabre com o 16A; o .ft antigo abre igual
     · na grade adulta, o 16A preenchido sobe para o topo, como os outros
     · DTF: o 16A e da faixa infantil e vem depois do 14A
     · etiqueta e lista de nomes: o 16A depois do 14A
     · a folha nao ganha altura: 8 linhas cabem no espaco das 10 adultas
     · o servidor conhece o 16A (pagina do cliente) e o piso subiu para 3.384
*/
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';

const DIR = import.meta.dirname + '/';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}
const URL_ED = pathToFileURL(DIR + (process.env.FT_ARQ || editorAtual())).href;

const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
p.on('pageerror', e => falhas.push('erro na pagina: ' + e.message));
await p.goto(URL_ED);
await esperaPronto(p);

const linhasDaGrade = () => p.evaluate(() =>
  [...document.querySelectorAll('.lay-modulo')[0].querySelectorAll('.lay-tabela-mini tbody tr .c-tam')].map(td => td.textContent.trim()));

console.log('\n[1] a lista');
let r = await p.evaluate(() => TAM_INFANTIL.slice());
checa('grade infantil termina em 14A, 16A', r.slice(-2), ['14A', '16A']);
checa('grade infantil com 8 tamanhos', r.length, 8);

console.log('\n[2] a grade infantil na tela');
const alturaAdulta = await p.evaluate(() => document.querySelectorAll('.lay-modulo')[0].querySelector('.lay-tabela-mini').getBoundingClientRect().height);
await p.evaluate(() => document.querySelectorAll('.lay-modulo')[0].querySelector('.tam-modo').click());
r = await linhasDaGrade();
checa('8 linhas, a ultima e o 16A', [r.length, r[r.length - 1]], [8, '16A']);
const alturaInfantil = await p.evaluate(() => document.querySelectorAll('.lay-modulo')[0].querySelector('.lay-tabela-mini').getBoundingClientRect().height);
checa('a grade infantil nao fica mais alta que a adulta', alturaInfantil <= alturaAdulta + 0.5, true);

console.log('\n[3] quantidade, total e .ft');
r = await p.evaluate(() => {
  const m = document.querySelectorAll('.lay-modulo')[0];
  const tr = [...m.querySelectorAll('.lay-tabela-mini tbody tr')].find(x => x.querySelector('.c-tam').textContent.trim() === '16A');
  const q = tr.querySelector('.c-qtd'); q.textContent = '7';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  const doc = coletaEstado();
  return { tot: m.querySelector('.tot-qtd').textContent.trim(), grade: doc.layouts[0].grade, q16: (doc.layouts[0].tamanhos['16A'] || {}).q, doc: JSON.parse(JSON.stringify(doc)) };
});
checa('o 16A conta no total do layout', r.tot, '7');
checa('o .ft guarda a grade infantil', r.grade, 'infantil');
checa('o .ft guarda o 16A', r.q16, '7');
const docSalvo = r.doc;

r = await p.evaluate((doc) => {
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'teste.ft');
  const m = document.querySelectorAll('.lay-modulo')[0];
  const tr = [...m.querySelectorAll('.lay-tabela-mini tbody tr')].find(x => x.querySelector('.c-tam').textContent.trim() === '16A');
  return tr ? tr.querySelector('.c-qtd').textContent.trim() : null;
}, docSalvo);
checa('reabriu com o 16A preenchido', r, '7');

r = await p.evaluate((doc) => {
  const velho = JSON.parse(JSON.stringify(doc));
  velho.layouts[0].tamanhos = { '2A': { q: '3', u: '' }, '14A': { q: '4', u: '' } };
  aplicaEstado(velho, 'velho.ft');
  const m = document.querySelectorAll('.lay-modulo')[0];
  return { linhas: [...m.querySelectorAll('.lay-tabela-mini tbody tr .c-tam')].map(td => td.textContent.trim()), tot: m.querySelector('.tot-qtd').textContent.trim() };
}, docSalvo);
checa('arquivo antigo abre com a grade nova e o mesmo total', [r.linhas.length, r.linhas[7], r.tot], [8, '16A', '7']);

console.log('\n[4] na grade adulta o 16A sobe para o topo');
await p.evaluate((doc) => aplicaEstado(JSON.parse(JSON.stringify(doc)), 'teste.ft'), docSalvo);
await p.evaluate(() => document.querySelectorAll('.lay-modulo')[0].querySelector('.tam-modo').click());
r = await linhasDaGrade();
checa('adulta: 16A antes do PP', r.slice(0, 2), ['16A', 'PP']);
r = await p.evaluate(() => document.querySelectorAll('.lay-modulo')[0].querySelector('.lay-tabela-mini tbody tr').className);
checa('adulta: a linha do 16A marcada como infantil', /tam-infantil/.test(r), true);

console.log('\n[5] DTF, etiqueta e lista de nomes');
r = await p.evaluate(() => ({ faixa: dtfFaixa('16A'), dtf: DTF_ORDEM.indexOf('16A') - DTF_ORDEM.indexOf('14A'),
  etq: ETQ_ORDEM.indexOf('16A') - ETQ_ORDEM.indexOf('14A'), nn: nnTams().indexOf('16A') - nnTams().indexOf('14A') }));
checa('DTF: 16A na faixa infantil', r.faixa, 'infantil');
checa('DTF, etiqueta e nomes: 16A logo depois do 14A', [r.dtf, r.etq, r.nn], [1, 1, 1]);
r = await p.evaluate(() => {
  const est = { layouts: [{ ref: 'FT-010-000M - CAMISETA', tamanhos: { '16A': { q: '2' }, '14A': { q: '1' }, 'M': { q: '3' } } }] };
  const e = etiquetaPacote(est);
  return { ordem: Object.keys(e.layouts[0].tamanhos), total: e.total && e.total.etiquetas };
});
checa('etiqueta: M, 14A, 16A, na ordem da grade', r.ordem, ['M', '14A', '16A']);
checa('etiqueta: o 16A conta', r.total, 6);

await b.close();

console.log('\n[6] servidor');
const srv = readFileSync(DIR + 'server.py', 'utf8');
const m = srv.match(/_CLI_TAM_INFANTIL = \[([^\]]*)\]/);
checa('server.py: pagina do cliente conhece o 16A', m && /"16A"/.test(m[1]) && m[1].trim().endsWith('"16A"'), true);
checa('server.py: piso do editor em 3.384', (srv.match(/^FT_EDITOR_PISO = "([^"]+)"/m) || [])[1], '3.384');
const pag = readFileSync(DIR + 'cliente/pagina.html', 'utf8');
checa('pagina do cliente: lista padrao com o 16A', /infantil:\[[^\]]*'14A','16A'\]/.test(pag), true);

console.log(falhas.length ? `\n${falhas.length} FALHA(S): ${falhas.join(' | ')}` : '\nTUDO OK');
process.exit(falhas.length ? 1 : 0);
