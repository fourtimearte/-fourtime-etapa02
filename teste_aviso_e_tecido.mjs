/* ================================================================
   TRES MUDANCAS DA v3.372, e o que cada uma existe para impedir

   1. O CLIQUE DE COR E O DE TECIDO SE SEPARARAM. O nome da cor mora
      dentro do cartao "Escolha o Tecido", embaixo do nome do tecido:
      clicar nele abria o menu de COR, e clicar dois pixels acima abria a
      lista de TECIDO. Duas listas diferentes na mesma caixa, dependendo
      de onde a pessoa acertou. Agora o cartao inteiro abre o tecido, e a
      cor se escolhe no quadrado, que e o unico lugar onde ela aparece
      como cor e nao como texto.

   2. O @page DA IMPRESSAO DO RELATORIO VOLTOU A SER MARGEM ZERO. A
      margem de 10/10/14mm vinha do tempo em que a folha era um bloco que
      crescia. Desde a v3.370 a folha tem ALTURA FIXA de 210mm e o
      respiro dela propria: somados, cada folha ia para uma area
      imprimivel de 186mm e sobravam 24mm que caiam na pagina seguinte.
      Uma pagina com o rodape riscado por cima da ultima linha, e logo
      depois uma pagina em branco, alternando.

   3. A COLUNA AVISO ENTROU NA ATIVIDADE, antes de Departamento, com a
      tag "Falta tecido" em vermelho. Ela nao cabe em Atualizacao: la
      mora a ETAPA, que diz ONDE o pedido esta; aviso diz o que esta
      ATRAPALHANDO, e um pedido pode estar em Costura e faltando tecido
      ao mesmo tempo.
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
const pagina = await b.newPage({ viewport: { width: 1700, height: 1000 } });
const erros = [];
pagina.on('pageerror', e => erros.push(String(e).slice(0, 180)));
await pagina.goto(path.isAbsolute(ARQ) ? 'file://' + ARQ : 'file://' + path.resolve(ARQ));
await esperaPronto(pagina);

console.log('\n=== 1. O QUADRADO ABRE A COR, O CARTAO ABRE O TECIDO ===');
const aberto = () => pagina.evaluate(() => {
  const v = e => !!e && getComputedStyle(e).display !== 'none' && e.offsetHeight > 0;
  return { cor: v(document.getElementById('corMenu')),
           tecido: v(document.getElementById('pickMenu')) };
});
const fecha = async () => { await pagina.keyboard.press('Escape');
  await pagina.waitForTimeout(220); };

await pagina.click('.tec-linha .cor-sw'); await pagina.waitForTimeout(300);
let r = await aberto();
ok('o QUADRADO abre o menu de cor', r.cor === true && r.tecido === false, JSON.stringify(r));
await fecha();

await pagina.click('.tec-linha .combo-cor textarea'); await pagina.waitForTimeout(300);
r = await aberto();
ok('o NOME DA COR abre a lista de tecido, e nao a de cor',
   r.tecido === true && r.cor === false, JSON.stringify(r));
await fecha();

await pagina.click('.tec-linha .combo-tecido textarea'); await pagina.waitForTimeout(300);
r = await aberto();
ok('o NOME DO TECIDO continua abrindo a lista de tecido',
   r.tecido === true && r.cor === false, JSON.stringify(r));
await fecha();

/* o recheio do cartao, entre os dois campos, tambem abre o tecido */
const noVao = await pagina.evaluate(async () => {
  const linha = document.querySelector('.tec-linha');
  const r = linha.getBoundingClientRect();
  /* uma quina do cartao, longe dos campos, do quadrado e do X */
  const ev = new MouseEvent('click', { bubbles:true, clientX:r.left+3, clientY:r.top+3 });
  linha.dispatchEvent(ev);
  await new Promise(r2 => setTimeout(r2, 250));
  const v = e => !!e && getComputedStyle(e).display !== 'none' && e.offsetHeight > 0;
  return { cor: v(document.getElementById('corMenu')),
           tecido: v(document.getElementById('pickMenu')) };
});
ok('  e o recheio do cartao tambem', noVao.tecido === true && noVao.cor === false,
   JSON.stringify(noVao));
await fecha();

console.log('\n=== 2. A FOLHA DO RELATORIO CABE NA PAGINA ===');
const papel = await pagina.evaluate(() => {
  /* a regra que relImprime injeta, lida da propria funcao */
  const f = String(window.relImprime || '');
  const m = f.match(/@media print\{@page\{[^}]*\}\}/);
  const regra = m ? m[0] : '';
  /* e a altura que a folha pede */
  const txt = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const alt = /\.rel-folha\{[^}]*height:210mm/.test(txt.replace(/\s+/g, ''))
    || /width:297mm;height:210mm/.test(txt.replace(/\s+/g, ''));
  return { regra, alturaFixa: alt };
});
ok('o @page do relatorio e A4 deitada', /size:A4 landscape/.test(papel.regra), papel.regra);
/* MARGEM ZERO E O PONTO. A folha tem 210mm de altura e o respiro dela
   propria; qualquer margem de pagina soma e empurra o excedente para uma
   segunda folha fisica, que sai em branco. */
ok('  com MARGEM ZERO, porque a folha ja tem a dela',
   /margin:0[;}]/.test(papel.regra), papel.regra);
ok('  e a folha pede altura fixa de 210mm', papel.alturaFixa === true);

console.log('\n=== 3. A COLUNA AVISO, NA ATIVIDADE ===');
const av = await pagina.evaluate(async () => {
  window.atvPodePlanejar = () => true;
  const x = document.getElementById('ftRailAtv'); if (x) x.click();
  await new Promise(r => setTimeout(r, 700));
  ATV.hojeFixo = '2026-08-19'; ATV.semana = '2026-08-17';
  const dias = ['17','18','19','20','21','22']; const L = [];
  for (let i = 0; i < 12; i++) { const d = dias[i % 6];
    L.push({ id:'I'+i, pedido:'PD0048'+(80+i), cliente:'CLIENTE '+i,
      departamento:'Sublimação', entrega:'2026-08-'+d, plan:'2026-08-'+d,
      planManual:false, etapa:i%3?'corte':'', aviso:i%4===0?'falta-tecido':'',
      sub:40+i, per:20+i, total:60+i*2, mexidoEm:'', novo:false, rolado:false }); }
  ATV.linhas = L; ATV.todasDaSemana = L.slice();
  ATV.carregando = false; ATV.varrendo = false;
  if (typeof atvCargaPinta === 'function') atvCargaPinta();
  const c = document.getElementById('atvCarga'); if (c) c.hidden = true;
  atvDesenha();
  await new Promise(r => setTimeout(r, 450));
  const lin = document.querySelector('.atv-linha');
  const chip = document.querySelector('.atv-aviso:not(.sem)');
  const esq = s => [...document.querySelectorAll(s)].map(e => Math.round(e.getBoundingClientRect().left));
  return {
    cabecalho: [...document.querySelectorAll('.atv-cab-lista > span')].map(e => e.textContent.trim()),
    colunasCab: document.querySelectorAll('.atv-cab-lista > *').length,
    colunasLinha: lin.children.length,
    /* a coluna Aviso e a QUARTA: vazia, Pedido, Nome, Aviso */
    xCab: esq('.atv-cab-lista > *')[3],
    xLin: Math.round(lin.children[3].getBoundingClientRect().left),
    comAviso: [...document.querySelectorAll('.atv-aviso:not(.sem)')].map(e => e.textContent.trim()),
    semAviso: document.querySelectorAll('.atv-aviso.sem').length,
    cor: chip ? getComputedStyle(chip).color : '',
    cortadas: [...document.querySelectorAll('.atv-linha > *')]
      .filter(e => e.scrollWidth > e.clientWidth + 1).length,
    /* o menu, e o recado que ele manda */
    opcoes: (() => { const m = document.getElementById('atvMenuAviso');
      return m ? [...m.querySelectorAll('button')].map(b2 => b2.textContent.trim()) : []; })(),
  };
});
ok('a coluna Aviso entrou antes de Departamento',
   JSON.stringify(av.cabecalho.slice(0, 5))
     === JSON.stringify(['', 'Pedido', 'Nome', 'Aviso', 'Departamento']),
   JSON.stringify(av.cabecalho.slice(0, 5)));
ok('  cabecalho e linha com o mesmo tanto de colunas',
   av.colunasCab === 11 && av.colunasLinha === 11,
   av.colunasCab + ' / ' + av.colunasLinha);
ok('  e a coluna comeca no mesmo x nos dois', av.xCab === av.xLin,
   av.xCab + ' vs ' + av.xLin);
ok('a tag "Falta tecido" aparece onde o pedido a tem',
   av.comAviso.length === 3 && av.comAviso.every(t => t === 'Falta tecido'),
   JSON.stringify(av.comAviso));
ok('  em VERMELHO', av.cor === 'rgb(198, 22, 27)', av.cor);
ok('  e quem nao tem aviso mostra o convite, e nao um vazio',
   av.semAviso === 9, String(av.semAviso));
ok('nenhuma celula da linha corta o proprio conteudo', av.cortadas === 0, String(av.cortadas));
ok('o menu de aviso oferece a tag e o "sem aviso"',
   JSON.stringify(av.opcoes) === JSON.stringify(['Falta tecido', 'sem aviso']),
   JSON.stringify(av.opcoes));

/* o clique grava um recado do campo `aviso`, e nao de `etapa` */
const rec = await pagina.evaluate(async () => {
  window.__rec = []; const o = window.atvRecado;
  window.atvRecado = (id, c, v) => { window.__rec.push([id, c, v]); return o && o(id, c, v); };
  const chip = document.querySelector('.atv-linha .atv-aviso.sem');
  chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const abriu = document.getElementById('atvMenuAviso').classList.contains('on');
  const bt = document.querySelector('#atvMenuAviso button[data-k="falta-tecido"]');
  if (bt) bt.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  return { abriu, recados: window.__rec };
});
ok('clicar no aviso abre o menu dele', rec.abriu === true);
ok('  e escolher grava um recado do campo aviso',
   rec.recados.length === 1 && rec.recados[0][1] === 'aviso'
   && rec.recados[0][2] === 'falta-tecido', JSON.stringify(rec.recados));

console.log('\n=== 4. A COLUNA AVISO TAMBEM VAI PARA O PAPEL ===');
const folha = await pagina.evaluate(() => {
  const n = atvMontaImpressao();
  const cx = document.getElementById('atvPrint');
  const th = [...cx.querySelectorAll('table thead th')].map(e => e.textContent.trim());
  const cols = cx.querySelectorAll('table colgroup col').length;
  const chips = [...cx.querySelectorAll('td.av .atv-f-chip')].map(e => e.textContent.trim());
  const faixa = cx.querySelector('tr.f-dia td');
  const r = { folhas:n, th, cols, chips,
    colspanDaFaixa: faixa ? +faixa.getAttribute('colspan') : -1 };
  atvDesmontaImpressao();
  return r;
});
ok('o papel tem a mesma coluna, no mesmo lugar',
   JSON.stringify(folha.th.slice(0, 4)) === JSON.stringify(['Pedido','Nome','Aviso','Departamento']),
   JSON.stringify(folha.th.slice(0, 4)));
ok('  com o colgroup do mesmo tamanho do cabecalho',
   folha.cols === folha.th.length, folha.cols + ' vs ' + folha.th.length);
ok('  a faixa do dia atravessa todas as colunas',
   folha.colspanDaFaixa === folha.th.length,
   folha.colspanDaFaixa + ' vs ' + folha.th.length);
ok('  e a tag sai impressa', folha.chips.length === 3
   && folha.chips.every(t => t === 'Falta tecido'), JSON.stringify(folha.chips));

console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
if (erros.length) { console.log('  erros de pagina: ' + erros.slice(0, 3).join(' // ')); falhas++; }
await b.close();
process.exit(falhas ? 1 : 0);
