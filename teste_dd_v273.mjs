/* v3.273 — o menu do dropdown custom colava certo no campo.

   O defeito: a lateral <nav class="ft-menu"> roda com zoom:1.35. Um filho
   position:fixed dentro de um ancestral com zoom tem o zoom aplicado DUAS
   vezes — getBoundingClientRect() já devolve pixel real de tela, e o valor
   escrito em style.top/left é multiplicado outra vez pelo 1,35. Medido:
   top 412,7 escrito virava 557,1 desenhado.

   Este teste roda nas DUAS faixas: janela 1600 (menu em zoom 1,00, onde o
   defeito NÃO aparecia) e janela 2200 (menu em zoom 1,35, onde aparecia).
   Se o conserto tivesse sido "subtrai 148px", a primeira faixa quebraria. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}
function quase(r, o, e, tol) {
  const ok = Math.abs(o - e) <= tol;
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(52)} obtido=${o} esperado=${e}±${tol}`);
  if (!ok) falhas.push(r);
}

const browser = await abreNavegador();
const erros = [];

async function abreEditor(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
  await page.goto(pathToFileURL(DIR+'fourtime-editor-v275.html').href);
  await esperaPronto(page);
  await page.evaluate(() => document.getElementById('ftRailRel').click());
  await page.waitForTimeout(900);
  return page;
}

/* mede um dropdown pelo id do select por trás */
const MEDE = id => `(async () => {
  const sel = document.getElementById(${JSON.stringify(id)});
  const dd = sel.closest('.ft-dd');
  const bt = dd.querySelector('.ft-dd-bt');
  const menu = dd.querySelector('.ft-dd-menu') || document.body.querySelector('.ft-dd-menu.aberto');
  bt.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
  await new Promise(s => setTimeout(s, 300));
  const rb = bt.getBoundingClientRect(), rm = menu.getBoundingClientRect();
  return {
    zoomLateral: getComputedStyle(document.querySelector('.ft-menu')).zoom,
    paiDoMenu: menu.parentElement.tagName,
    desvioY: +(rm.top - rb.bottom).toFixed(1),
    desvioX: +(rm.left - rb.left).toFixed(1),
    /* o menu tem largura MÍNIMA de 140px de propósito (Ano/Mês/Dia/Tipo são
       campos de meia coluna e o texto da opção não pode ser cortado): o que
       se cobra aqui é max(140, campo), não a largura do campo. */
    larguraMenu: +rm.width.toFixed(1),
    larguraEsperada: Math.max(140, Math.round(rb.width)),
    dentroDaTela: rm.left >= 0 && rm.right <= innerWidth && rm.top >= 0 && rm.bottom <= innerHeight,
    opcoes: menu.querySelectorAll('.ft-dd-op').length,
  };
})()`;

for (const [w, h, zoomEsperado] of [[1600, 1000, '1'], [2200, 1200, '1.35']]) {
  console.log(`\n=== JANELA ${w}×${h} (lateral em zoom ${zoomEsperado}) ===`);
  const page = await abreEditor(w, h);
  for (const id of ['rlVend', 'rlAno', 'rlTipo']) {
    const r = await page.evaluate(MEDE(id));
    console.log(`  #${id}`);
    checa(`  ${id}: a lateral está mesmo em zoom ${zoomEsperado}`, r.zoomLateral, zoomEsperado);
    checa(`  ${id}: o menu sai do zoom (fica no BODY)`, r.paiDoMenu, 'BODY');
    quase(`  ${id}: 4px abaixo do campo`, r.desvioY, 4, 1.5);
    quase(`  ${id}: alinhado à esquerda do campo`, r.desvioX, 0, 1.5);
    quase(`  ${id}: largura = max(140, campo)`, r.larguraMenu, r.larguraEsperada, 1.5);
    checa(`  ${id}: inteiro dentro da tela`, r.dentroDaTela, true);
    checa(`  ${id}: montou as opções`, r.opcoes > 0, true);
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})));
    await page.waitForTimeout(200);
  }

  console.log('\n  --- escolher uma opção ainda funciona ---');
  const r = await page.evaluate(async () => {
    /* rlTipo e não rlVend: num editor recém-aberto não há venda nenhuma, e
       #rlVend só tem a opção "Todos" — escolher a única opção não muda nada
       e a falha seria da asserção, não do código. */
    const sel = document.getElementById('rlTipo');
    const dd = sel.closest('.ft-dd');
    const menu = dd.querySelector('.ft-dd-menu');
    const antes = sel.selectedIndex;
    let mudou = 0;
    sel.addEventListener('change', () => mudou++, {once:true});
    dd.querySelector('.ft-dd-bt').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
    await new Promise(s => setTimeout(s, 300));
    const ops = menu.querySelectorAll('.ft-dd-op');
    const alvo = Math.min(1, ops.length - 1);
    /* o pointerdown do documento vem ANTES do clique: se ele fechasse o
       menu, o clique nunca chegaria na opção. É o caso real do usuário. */
    ops[alvo].dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
    await new Promise(s => setTimeout(s, 60));
    const aindaAberto = menu.classList.contains('aberto');
    ops[alvo].click();
    await new Promise(s => setTimeout(s, 250));
    return { antes, depois: sel.selectedIndex, mudou, aindaAberto,
             fechou: !menu.classList.contains('aberto'),
             voltouPraCasa: menu.parentElement.classList.contains('ft-dd'),
             rotulo: dd.querySelector('.ft-dd-val').textContent,
             textoDaOpcao: sel.options[sel.selectedIndex].textContent };
  });
  checa('  o pointerdown na opção NÃO fecha antes do clique', r.aindaAberto, true);
  checa('  escolher troca o select', r.depois !== r.antes, true);
  checa('  e dispara change', r.mudou, 1);
  checa('  o menu fecha depois', r.fechou, true);
  checa('  e volta para dentro do .ft-dd', r.voltouPraCasa, true);
  checa('  o botão mostra o rótulo escolhido', r.rotulo, r.textoDaOpcao);

  console.log('\n  --- rolar fecha (menu fixo não acompanha) ---');
  const s = await page.evaluate(async () => {
    const dd = document.getElementById('rlVend').closest('.ft-dd');
    const menu = dd.querySelector('.ft-dd-menu');
    dd.querySelector('.ft-dd-bt').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
    await new Promise(s => setTimeout(s, 250));
    const aberto = menu.classList.contains('aberto');
    document.querySelector('.ft-menu').dispatchEvent(new Event('scroll', {bubbles:true}));
    await new Promise(s => setTimeout(s, 150));
    return { aberto, depois: menu.classList.contains('aberto') };
  });
  checa('  abriu', s.aberto, true);
  checa('  rolou, fechou', s.depois, false);

  console.log('\n  --- nenhum menu órfão sobra no body ---');
  const o = await page.evaluate(() => document.body.querySelectorAll(':scope > .ft-dd-menu').length);
  checa('  body limpo', o, 0);
  await page.close();
}

console.log('\n=== SEM ESPAÇO EMBAIXO: ABRE PARA CIMA ===');
{
  const page = await abreEditor(2200, 620);
  const r = await page.evaluate(MEDE('rlTipo'));
  console.log('     ' + JSON.stringify(r));
  checa('continua inteiro dentro da tela', r.dentroDaTela, true);
  await page.close();
}

console.log('\n' + '='.repeat(64));
checa('nenhum erro de página no total', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.273: O MENU DO DROPDOWN COLA NO CAMPO EM QUALQUER ZOOM');
