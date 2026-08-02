/* v3.263 — as duas marcas do relatório, cada uma no seu lugar.
   Mede o que o navegador REALMENTE pinta (getComputedStyle), na tela e com a
   folha de impressão ativa. Dizer "está no CSS" não é o mesmo que aparecer. */
import { abreNavegador } from './ft_navegador.mjs';
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

const browser = await abreNavegador();
// janela grande de propósito: abaixo de ~1000px de altura o menu se recolhe
// sozinho (body.menu-fechado), e aí ele esconde a marca POR PROJETO. Testar
// nessa largura mediria a regra errada.
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v272.html').href);
await page.waitForTimeout(2500);

const visivel = async (sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return 'NAO EXISTE';
  const c = getComputedStyle(el);
  if (c.display === 'none') return 'oculto(display)';
  if (c.visibility === 'hidden') return 'oculto(visibility)';
  return 'visivel';
}, sel);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), "3.272");
checa('sem erro de página', erros.length, 0);

console.log('\n=== 1. NA TELA, FORA DO RELATÓRIO ===');
await page.emulateMedia({ media: 'screen' });
checa('menu aberto', await page.evaluate(() => !document.body.classList.contains('menu-fechado')), true);
checa('a marca do menu aparece', await visivel('.ft-menu-marca'), 'visivel');

console.log('\n=== 1b. MENU RECOLHIDO ESCONDE A MARCA (de projeto) ===');
// não é o defeito que estamos consertando: recolhido, só cabe o hambúrguer
await page.evaluate(() => document.body.classList.add('menu-fechado'));
checa('recolhido, a marca sai', await visivel('.ft-menu-marca'), 'oculto(display)');
await page.evaluate(() => document.body.classList.remove('menu-fechado'));
checa('reaberto, ela volta', await visivel('.ft-menu-marca'), 'visivel');

console.log('\n=== 2. NA TELA, NA SEÇÃO RELATÓRIO ===');
// era aqui que estava o erro: escondia a marca do MENU (errada) e deixava a
// da FOLHA visível (que é para o papel)
await page.evaluate(() => {
  document.body.classList.add('sec-relatorio');
  const pg = document.getElementById('relPage'); if (pg) pg.hidden = false;
});
checa('a marca do MENU continua aparecendo', await visivel('.ft-menu-marca'), 'visivel');

console.log('\n=== 3. A MARCA DA FOLHA NÃO APARECE NA TELA ===');
let r = await page.evaluate(() => {
  // monta um cabeçalho de relatório igual ao que relDesenha produz
  const d = document.createElement('div');
  d.className = 'rel-folha';
  d.innerHTML = '<div class="rel-cab"><div class="rel-marca"><img alt="Fourtime"></div>'
              + '<div class="rel-tit"><h2>Relatório</h2></div></div>';
  document.body.appendChild(d);
  return getComputedStyle(document.querySelector('.rel-marca')).display;
});
checa('escondida na tela', r, 'none');
checa('  mas o resto do cabeçalho fica', await visivel('.rel-tit'), 'visivel');

console.log('\n=== 4. NA IMPRESSÃO, INVERTE ===');
await page.emulateMedia({ media: 'print' });
r = await page.evaluate(() => {
  document.body.classList.add('rel-imprimindo');
  return { folha: getComputedStyle(document.querySelector('.rel-marca')).display,
           menu: getComputedStyle(document.querySelector('.ft-menu')).display };
});
checa('a marca da FOLHA aparece', r.folha, 'flex');
checa('e o menu inteiro sai do papel', r.menu, 'none');

console.log('\n=== 5. AS FOLHAS CLONADAS TAMBÉM MOSTRAM A MARCA ===');
// relMontaImpressao() clona o .rel-cab para dentro de cada folha numerada;
// os clones herdam o display:none e só voltam pela regra de impressão
r = await page.evaluate(() => {
  const cab = document.querySelector('.rel-cab');
  const caixa = document.createElement('div');
  caixa.className = 'rel-print';
  const folha = document.createElement('div');
  folha.className = 'folha';
  folha.appendChild(cab.cloneNode(true));
  caixa.appendChild(folha);
  document.body.appendChild(caixa);
  const clone = caixa.querySelector('.rel-marca');
  return getComputedStyle(clone).display;
});
checa('o clone também aparece no papel', r, 'flex');

console.log('\n=== 6. DE VOLTA À TELA, TUDO COMO ANTES ===');
await page.emulateMedia({ media: 'screen' });
r = await page.evaluate(() => {
  document.body.classList.remove('rel-imprimindo');
  return { folha: getComputedStyle(document.querySelector('.rel-marca')).display,
           menu: getComputedStyle(document.querySelector('.ft-menu-marca')).visibility };
});
checa('a marca da folha some de novo', r.folha, 'none');
checa('e a do menu continua visível', r.menu, 'visible');

console.log('\n' + '='.repeat(60));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.263: LOGOS NO LUGAR CERTO');
