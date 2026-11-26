/* A CONFERENCIA DO TRELLO, DTF (v3.385)

   Pedido do Henrique (24 e 26/11/2026), metodo A do wireframe: uma pagina
   propria dentro da Atividade, na mesma semana, que le o Trello e mostra
   cada pedido de DTF com a coluna do cartao, as tags e o link. A suite cobra:
     · so entram os pedidos com DTF no Departamento (DTF + Silk tambem)
     · so as 5 tags de DTF, SEMPRE na ordem dele, sem nenhuma outra;
       acento e caixa nao importam (REVISAO H = REVISÃO H)
     · os avisos: so pelo nome, sem cartao, varios cartoes
     · os quatro quadros de numeros
     · o editor manda so id, numero e cliente (nada de valor)
     · a impressao e a folha da Atividade, com TAGS DO TRELLO logo depois
       do NOME; voltar devolve a Atividade e a impressao dela igual
     · erro do servidor aparece na tela e nao quebra nada
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
const URL_ED = pathToFileURL(DIR + (process.env.FT_ARQ || editorAtual())).href;

const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', e => falhas.push('erro na pagina: ' + e.message));

/* o editor abre como arquivo e fala com http://ft.test: a resposta
   inventada precisa das licencas de CORS, e o OPTIONS tambem */
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS' };
const ped = (id, n, cliente, dia, dep, total, etapa) => ({ id, pedido: 'PD00' + n, cliente,
  vendedor: 'Dani', departamento: dep, entrega: dia + '/08/2026', sub: 0, per: total, total,
  etapa: etapa || '', plan: '2026-08-' + dia, planManual: false, concluidoEm: '', sumiu: false,
  entregaMudou: '', mesArq: '2026-08' });
const PEDIDOS = {
  a: ped('a', 4421, 'SUPERE SPORTS LTDA', '17', 'DTF', 141),
  b: ped('b', 4425, 'COLEGIO YOLANDA', '17', 'Sublimação', 260),
  c: ped('c', 4428, 'ATLETICA MEDICINA UFG', '18', 'DTF + Silk', 90),
  d: ped('d', 4430, 'ARENA CROSS', '18', 'DTF', 77),
  e: ped('e', 4439, 'TIA KAROL SPORTS', '21', 'DTF', 60),
};
await p.route('**/api/ft/atv/mes*', r => { const k = new URL(r.request().url()).searchParams.get('mes');
  r.fulfill({ status: 200, headers: CORS, contentType: 'application/json',
    body: JSON.stringify({ ok: true, mes: k, existe: k === '2026-08', carimbo: 'c1', versao: 1, pedidos: k === '2026-08' ? PEDIDOS : {} }) }); });
await p.route('**/api/ft/atv/carimbo*', r => r.fulfill({ status: 200, headers: CORS, contentType: 'application/json',
  body: JSON.stringify({ ok: true, carimbos: { '2026-08': 'c1' } }) }));
let PEDIDOS_ENVIADOS = null, CHAMADAS = 0, ERRO = '';
const tg = (n, c) => ({ n, c });
await p.route('**/api/trello/conferencia', async r => {
  CHAMADAS++;
  PEDIDOS_ENVIADOS = JSON.parse(r.request().postData() || '{}').pedidos;
  if (ERRO) return r.fulfill({ status: 502, headers: CORS, contentType: 'application/json', body: JSON.stringify({ detail: ERRO }) });
  const cart = (titulo, coluna, tags, varios) => ({ titulo, url: 'https://trello.com/c/' + titulo.length, coluna, tags, varios: varios || 1 });
  await r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ ok: true,
    lidoEm: '2026-08-19T13:32:00Z', quadros: ['PRODUÇÃO'], resultado: {
      a: { como: 'numero', cartao: cart('PD004421 SUPERE', 'PRENSA DTF',
        [tg('URGENTE', 'red'), tg('CONFERIDO HENRIQUE', 'purple'), tg('MONTAGEM', 'orange'),
         tg('DTF ENTREGUE PARA IMPRESSÃO', 'green'), tg('revisao h', 'blue_light'), tg('REVISAR', 'yellow')]) },
      c: { como: 'nome', cartao: cart('ATLETICA MEDICINA', 'ARTE', [tg('ARTE APROVADA', 'green')]) },
      d: { como: 'numero', cartao: cart('4430 ARENA', 'IMPRESSÃO DTF', [tg('REVISAR', 'yellow'), tg('DTF ENTREGUE PARA IMPRESSAO', 'green')], 2) },
      e: { como: '', cartao: null },
    } }) });
});

/* registrada por ultimo: o Playwright confere a ultima primeiro */
await p.route('**://ft.test/**', (r) => r.request().method() === 'OPTIONS'
  ? r.fulfill({ status: 204, headers: CORS }) : r.fallback());
await p.goto(URL_ED);
await esperaPronto(p);
await p.evaluate(() => {
  FT_SYNC.url = 'http://ft.test';
  ATV.hojeFixo = '2026-08-19';
  ATV.semana = '2026-08-17';
  atvAlternar(true);
});
await p.waitForFunction(() => !ATV.carregando && ATV.todasDaSemana.length === 5, null, { timeout: 30000 });

console.log('\n[1] o botao abre a Conferencia e le o Trello sozinho');
checa('o item Conferência do Trello existe no painel', await p.evaluate(() => !!document.getElementById('miAtvConf')), true);
await p.evaluate(() => document.getElementById('miAtvConf').click());
await p.waitForFunction(() => confLido() && !CONF.lendo, null, { timeout: 30000 });
checa('leu o Trello uma vez ao abrir', CHAMADAS, 1);
checa('titulo da pagina', await p.evaluate(() => document.querySelector('#atvPage .atv-cab h2').textContent), 'Conferência do Trello · DTF');
checa('mandou so os de DTF, so id, numero e cliente', PEDIDOS_ENVIADOS,
  [{ id: 'a', pedido: 'PD004421', cliente: 'SUPERE SPORTS LTDA' }, { id: 'c', pedido: 'PD004428', cliente: 'ATLETICA MEDICINA UFG' },
   { id: 'd', pedido: 'PD004430', cliente: 'ARENA CROSS' }, { id: 'e', pedido: 'PD004439', cliente: 'TIA KAROL SPORTS' }]);

const linhas = () => p.evaluate(() => [...document.querySelectorAll('#atvPage .atv-linha.conf')].map(l => ({
  ped: l.querySelector('.ped').textContent,
  tags: [...l.querySelectorAll('.conf-tag')].map(t => t.textContent),
  aviso: l.querySelector('.conf-av').textContent,
  col: l.querySelector('.col').textContent,
  link: (l.querySelector('.conf-link') || {}).href || '' })));
let L = await linhas();
console.log('\n[2] as linhas');
checa('4 pedidos de DTF, Sublimação fora', L.map(x => x.ped), ['PD004421', 'PD004428', 'PD004430', 'PD004439']);
checa('so as 5 tags de DTF, na ordem dele', L[0].tags,
  ['DTF ENTREGUE PARA IMPRESSÃO', 'REVISAR', 'MONTAGEM', 'revisao h', 'CONFERIDO HENRIQUE']);
checa('URGENTE (fora da lista) nao aparece', L[0].tags.includes('URGENTE'), false);
checa('sem acento casa: DTF ENTREGUE ... IMPRESSAO primeiro', L[2].tags, ['DTF ENTREGUE PARA IMPRESSAO', 'REVISAR']);
checa('cartao sem nenhuma das 5', await p.evaluate(() => document.querySelectorAll('#atvPage .atv-linha.conf')[1].querySelector('.tags').textContent), 'nenhuma das tags de DTF');
checa('avisos', L.map(x => x.aviso), ['', 'SÓ PELO NOME', '2 CARTÕES COM O Nº', 'SEM CARTÃO']);
checa('coluna do Trello', L.map(x => x.col), ['PRENSA DTF', 'ARTE', 'IMPRESSÃO DTF', '']);
checa('link do cartão', [L[0].link, L[3].link], ['https://trello.com/c/15', '']);
checa('cor da tag vem do Trello (green)', await p.evaluate(() => getComputedStyle(document.querySelector('.conf-tag')).backgroundColor), 'rgb(31, 132, 90)');
checa('tag clara com texto escuro', await p.evaluate(() => getComputedStyle([...document.querySelectorAll('.conf-tag')][3]).color), 'rgb(23, 43, 77)');
checa('quadros: pedidos, achados, so nome, sem cartao', await p.evaluate(() =>
  [...document.querySelectorAll('#atvPage .atv-card .val')].map(v => v.textContent)), ['4', '3', '1', '1']);
checa('linha da conferencia nao tem etapa clicavel', await p.evaluate(() => document.querySelectorAll('#atvPage .atv-linha.conf .atv-chip').length), 0);

console.log('\n[3] a impressao');
let papel = await p.evaluate(() => { CONF.ativo = true; const n = atvMontaImpressao();
  const f = document.querySelector('#atvPrint');
  const r = { folhas: n, ths: [...f.querySelectorAll('thead th')].map(t => t.textContent), h3: f.querySelector('h3').textContent,
    tags: [...f.querySelectorAll('tbody tr:not(.f-dia)')].map(tr => [...tr.querySelectorAll('.conf-ftag')].map(x => x.textContent)),
    pedidos: [...f.querySelectorAll('tbody td.ped')].map(t => t.textContent),
    caixas: [...f.querySelectorAll('.atv-f-res .cx .v')].map(v => v.textContent) };
  atvDesmontaImpressao(); return r; });
checa('folha com o titulo da conferencia', papel.h3, 'Conferência do Trello · DTF');
checa('TAGS DO TRELLO logo depois do NOME', papel.ths.slice(0, 4), ['Pedido', 'Nome', 'Tags do Trello', 'Aviso']);
checa('no papel, so os de DTF', papel.pedidos, ['PD004421', 'PD004428', 'PD004430', 'PD004439']);
checa('no papel, as tags na ordem', papel.tags[0], ['DTF ENTREGUE PARA IMPRESSÃO', 'REVISAR', 'MONTAGEM', 'revisao h', 'CONFERIDO HENRIQUE']);
checa('no papel, os quatro quadros', papel.caixas, ['4', '3', '1', '1']);

console.log('\n[4] voltar para a Atividade');
await p.evaluate(() => document.getElementById('confVolta').click());
checa('a Atividade volta com as colunas dela', await p.evaluate(() =>
  [!!document.querySelector('#atvPage .atv-cab-lista:not(.conf)'), document.querySelector('#atvPage .atv-cab h2').textContent]),
  [true, 'Relatório de Atividade']);
papel = await p.evaluate(() => { atvMontaImpressao(); const f = document.querySelector('#atvPrint');
  const r = [f.querySelector('h3').textContent, [...f.querySelectorAll('thead th')].length, f.querySelectorAll('tbody td.ped').length];
  atvDesmontaImpressao(); return r; });
checa('a impressao da Atividade continua igual', papel, ['Relatório de Atividade', 10, 5]);

console.log('\n[5] o Trello recusa');
ERRO = 'O Trello recusou a leitura (401) em boards.';
await p.evaluate(() => confAbre());
await p.waitForFunction(() => !CONF.lendo && CONF.erro, null, { timeout: 30000 });
checa('o erro aparece na tela', await p.evaluate(() => (document.querySelector('#atvPage .atv-prog .txt') || {}).textContent || ''),
  'Não consegui ler o Trello: O Trello recusou a leitura (401) em boards.');
checa('nao fica relendo sozinho depois do erro', await p.evaluate(async () => { const n = 0; await new Promise(s => setTimeout(s, 400)); return CONF.lendo; }), false);
ERRO = '';
await p.evaluate(() => document.getElementById('confLer').click());
await p.waitForFunction(() => confLido() && !CONF.lendo, null, { timeout: 30000 });
checa('Ler de novo funciona depois do erro', (await linhas()).length, 4);

console.log('\n[6] sair da Atividade desliga a Conferencia');
checa('fechar a secao volta CONF.ativo a falso', await p.evaluate(() => { atvAlternar(false); return CONF.ativo; }), false);

await b.close();
console.log('\n' + (falhas.length ? 'FALHAS: ' + falhas.join(' | ') : 'TUDO CERTO'));
process.exit(falhas.length ? 1 : 0);
