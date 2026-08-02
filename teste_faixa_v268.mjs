/* v3.268 — a faixa da FOLHA vem do MONITOR; a do MENU vem da JANELA.

   O caso que originou a mudança: monitor 4K a 125% = screen.width 3072.
   Em tela cheia a janela também é 3072 (faixa 2160p, folha 1,40) — certo.
   Encostando a janela na metade da tela ela vira 1535px; até a v3.267 isso
   caía na faixa 1080p e a folha despencava para 1,05 mesmo sobrando espaço.

   screen.width não muda com o viewport do Playwright, então ele é fixado
   por addInitScript ANTES de qualquer script da página rodar. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const ARQ = DIR+'fourtime-editor-v275.html';
const URL = pathToFileURL(ARQ).href;
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}
function quase(r, o, e, tol) {
  const ok = Math.abs(o - e) <= tol;
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(50)} obtido=${o} esperado=${e}±${tol}`);
  if (!ok) falhas.push(r);
}

const browser = await abreNavegador();

const erros = [];
/* monta uma página com o monitor e a janela que eu quiser */
async function abre(telaW, janW, janH) {
  const page = await browser.newPage({ viewport: { width: janW, height: janH } });
  page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
  await page.addInitScript(w => {
    Object.defineProperty(window.screen, 'width',      { get: () => w });
    Object.defineProperty(window.screen, 'availWidth', { get: () => w });
  }, telaW);
  await page.goto(URL);
  await esperaPronto(page);
  return page;
}
/* o que interessa medir: faixas, zoom aplicado e se a folha cabe */
const RAIO_X = `(() => {
  const fm = v4FaixaMonitor(), fj = v4FaixaJanela();
  const m  = zoomMedidas();
  const folha = document.querySelector('.folha-a4');
  const cx = folha ? folha.getBoundingClientRect() : null;
  const menu = document.querySelector('.ft-menu');
  return {
    tela: screen.width, janela: innerWidth,
    monitor: fm.nome, janelaFaixa: fj.nome, folhaFaixa: v4Faixa().nome,
    zoom: +(window.ZOOM || 1).toFixed(4),
    esperadoFolha: fm.folha, esperadoMenu: fj.menu,
    espaco: m ? Math.round(m.largura) : null,
    largFolha: cx ? Math.round(cx.width) : null,
    direitaFolha: cx ? Math.round(cx.right) : null,
    menuZoom: menu ? (getComputedStyle(menu).zoom || '') : '',
  };
})()`;

console.log('\n=== 0. CARREGOU ===');
let page = await abre(3072, 3072, 1400);
checa('versão', await page.evaluate(() => FT_EDITOR), '3.275');
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. 4K EM TELA CHEIA (3072 × 3072) — nada muda ===');
let r = await page.evaluate(RAIO_X);
checa('monitor é 2160p', r.monitor, '2160p');
checa('janela é 2160p', r.janelaFaixa, '2160p');
checa('a folha usa 2160p', r.folhaFaixa, '2160p');
quase('zoom da folha = 1,40', r.zoom, 1.40, 0.001);
checa('menu na escala 1,35', r.menuZoom, '1.35');
console.log(`     (espaço=${r.espaco}px  folha=${r.largFolha}px)`);
checa('a folha não é cortada', r.direitaFolha <= r.janela, true);
await page.close();

console.log('\n=== 2. MESMO 4K, JANELA NA METADE (3072 × 1535) — O CASO ===');
page = await abre(3072, 1535, 1400);
r = await page.evaluate(RAIO_X);
checa('monitor continua 2160p', r.monitor, '2160p');
checa('mas a janela é 1080p', r.janelaFaixa, '1080p');
checa('a FOLHA segue o monitor', r.folhaFaixa, '2160p');
quase('zoom da folha continua 1,40', r.zoom, 1.40, 0.001);
/* asserção minha estava errada, não o código: com zoom 1,00 o editor limpa
   style.zoom, e o computado de zoom limpo é "1" (não string vazia). */
checa('o MENU segue a janela (1,00 = sem zoom)', r.menuZoom, '1');
console.log(`     (espaço=${r.espaco}px  folha=${r.largFolha}px  sobra=${r.espaco - r.largFolha}px)`);
checa('cabe sem cortar', r.direitaFolha <= r.janela, true);
checa('  e sobra espaço de verdade', r.espaco - r.largFolha > 0, true);
await page.close();

console.log('\n=== 3. JANELA ESTREITA DE VERDADE — o teto tem de agir ===');
/* 900px num monitor 4K: a faixa do monitor pede 1,40 (1112px de folha),
   mas não cabe. O teto de largura da v3.267 continua mandando. */
page = await abre(3072, 900, 1000);
r = await page.evaluate(RAIO_X);
checa('monitor ainda é 2160p', r.monitor, '2160p');
checa('a faixa pedida seria 1,40', r.esperadoFolha, 1.40);
checa('mas o zoom aplicado é menor', r.zoom < 1.40, true);
console.log(`     (espaço=${r.espaco}px  folha=${r.largFolha}px  zoom=${r.zoom})`);
checa('a folha NÃO é cortada', r.direitaFolha <= r.janela, true);
await page.close();

console.log('\n=== 4. MONITOR PEQUENO DE VERDADE (1366 × 1366) ===');
/* quem tem monitor pequeno continua recebendo a escala pequena */
page = await abre(1366, 1366, 900);
r = await page.evaluate(RAIO_X);
checa('monitor é 768p', r.monitor, '768p');
checa('a folha usa 768p', r.folhaFaixa, '768p');
quase('zoom da folha = 0,90', r.zoom, 0.90, 0.001);
checa('a folha não é cortada', r.direitaFolha <= r.janela, true);
await page.close();

console.log('\n=== 5. 1080p EM TELA CHEIA (1920 × 1920) ===');
page = await abre(1920, 1920, 1080);
r = await page.evaluate(RAIO_X);
checa('monitor é 1440p (1920 ≥ 1500 e < 2000 → 1080p)', r.monitor, '1080p');
quase('zoom da folha = 1,05', r.zoom, 1.05, 0.001);
checa('a folha não é cortada', r.direitaFolha <= r.janela, true);

console.log('\n=== 6. CTRL+0 VOLTA PARA A FAIXA DO MONITOR ===');
r = await page.evaluate(async () => {
  window.CC_ESC_FOLHA = 0.6; aplicaZoom();          /* estraga de propósito */
  const antes = +(window.ZOOM || 1).toFixed(4);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true }));
  await new Promise(s => setTimeout(s, 400));
  return { antes, depois: +(window.ZOOM || 1).toFixed(4),
           calibragem: window.CC_ESC_FOLHA, forcada: window.V4_FAIXA_FORCADA,
           faixa: v4FaixaMonitor().folha };
});
quase('estava fora de escala', r.antes, 0.60, 0.001);
checa('  limpa a calibragem', r.calibragem, 0);
checa('  limpa a faixa forçada', r.forcada, '');
quase('  volta para a escala do monitor', r.depois, r.faixa, 0.001);
await page.close();

console.log('\n=== 7. O PAINEL CONTA AS DUAS MEDIDAS ===');
page = await abre(3072, 1535, 1400);
r = await page.evaluate(() => {
  ccFaixasMonta();
  const linhas = [...document.querySelectorAll('#ccFaixas tbody tr')].map(tr => ({
    f: tr.dataset.f,
    monitor: tr.classList.contains('agora'),
    janela: tr.classList.contains('agora-jan'),
    rotulo: tr.querySelector('.nm small').textContent.trim(),
  }));
  return { dica: document.getElementById('ccFaixaDica').textContent, linhas };
});
console.log('     dica: ' + r.dica);
checa('a dica diz o monitor', r.dica.includes('monitor 3072px → 2160p'), true);
checa('a dica diz a janela', r.dica.includes('janela 1535px → 1080p'), true);
checa('● na linha do monitor', r.linhas.find(l => l.f === '2160p').monitor, true);
checa('○ na linha da janela', r.linhas.find(l => l.f === '1080p').janela, true);
checa('  e não trocado', r.linhas.find(l => l.f === '2160p').janela, false);
checa('rótulo do monitor', r.linhas.find(l => l.f === '2160p').rotulo, 'monitor (folha)');
checa('rótulo da janela', r.linhas.find(l => l.f === '1080p').rotulo, 'janela (menu)');

console.log('\n=== 8. "VER" AINDA FORÇA A FAIXA DA FOLHA ===');
r = await page.evaluate(async () => {
  document.querySelector('#ccFaixas [data-ver="768p"]').click();
  await new Promise(s => setTimeout(s, 400));
  const forcado = { faixa: v4Faixa().nome, zoom: +(window.ZOOM || 1).toFixed(4),
                    dica: document.getElementById('ccFaixaDica').textContent };
  document.querySelector('#ccFaixas [data-ver="768p"]').click();   /* solta */
  await new Promise(s => setTimeout(s, 400));
  return { forcado, solto: { faixa: v4Faixa().nome, zoom: +(window.ZOOM || 1).toFixed(4) } };
});
checa('força 768p', r.forcado.faixa, '768p');
quase('  e a folha vai a 0,90', r.forcado.zoom, 0.90, 0.001);
checa('  a dica avisa que está forçado', r.forcado.dica.startsWith('folha forçada em 768p'), true);
checa('soltando, volta ao monitor', r.solto.faixa, '2160p');
quase('  e a 1,40', r.solto.zoom, 1.40, 0.001);
await page.close();

console.log('\n=== 9. TELA CHEIA: UMA LINHA SÓ MARCADA ===');
page = await abre(3072, 3072, 1400);
r = await page.evaluate(() => {
  ccFaixasMonta();
  const tr = document.querySelector('#ccFaixas tr[data-f="2160p"]');
  return { ambas: tr.classList.contains('agora') && tr.classList.contains('agora-jan'),
           rotulo: tr.querySelector('.nm small').textContent.trim(),
           outras: [...document.querySelectorAll('#ccFaixas tbody tr')]
             .filter(t => t.dataset.f !== '2160p' &&
               (t.classList.contains('agora') || t.classList.contains('agora-jan'))).length };
});
checa('a mesma linha responde pelos dois', r.ambas, true);
checa('  e o rótulo diz isso', r.rotulo, 'monitor + janela');
checa('  nenhuma outra marcada', r.outras, 0);
await page.close();

console.log('\n' + '='.repeat(62));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.268: A FOLHA SEGUE O MONITOR, O MENU SEGUE A JANELA');
