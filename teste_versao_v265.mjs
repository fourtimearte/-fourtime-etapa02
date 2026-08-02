/* v3.265 — o aviso de versão nova virou cartão fixo no canto inferior direito. */
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v272.html').href);
await page.waitForTimeout(2600);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), "3.272");
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. SAIU DO SUBMENU DO ORÇAMENTO ===');
let r = await page.evaluate(() => {
  const el = document.getElementById('ftAvisoVersao');
  return {
    dentroDoMenu: !!el.closest('.ft-menu'),
    dentroDoPainelOrcamento: !!el.closest('[data-sec="orcamento"]'),
    dentroDoCanto: !!el.closest('.ft-notif-wrap'),
  };
});
checa('não está mais no menu', r.dentroDoMenu, false);
checa('nem no painel do orçamento', r.dentroDoPainelOrcamento, false);
checa('está no canto dos avisos', r.dentroDoCanto, true);

console.log('\n=== 2. ESCONDIDO ATÉ HAVER VERSÃO NOVA ===');
r = await page.evaluate(() => getComputedStyle(document.getElementById('ftAvisoVersao')).display);
checa('nasce oculto', r, 'none');

r = await page.evaluate(() => {
  ftAvisaVersao(FT_EDITOR);                  // mesma versão: nada a anunciar
  return getComputedStyle(document.getElementById('ftAvisoVersao')).display;
});
checa('mesma versão não aparece', r, 'none');

r = await page.evaluate(() => {
  ftAvisaVersao('3.200');                    // versão MAIS VELHA no servidor
  return getComputedStyle(document.getElementById('ftAvisoVersao')).display;
});
checa('versão mais velha não aparece', r, 'none');

console.log('\n=== 3. COM VERSÃO NOVA, APARECE NO CANTO INFERIOR DIREITO ===');
r = await page.evaluate(async () => {
  ftAvisaVersao('3.999');
  await new Promise(s => setTimeout(s, 450));
  const el = document.getElementById('ftAvisoVersao');
  const c = getComputedStyle(el), x = el.getBoundingClientRect();
  return {
    display: c.display, fundo: c.backgroundColor, raio: c.borderRadius,
    direita: Math.round(window.innerWidth - x.right),
    fundoDist: Math.round(window.innerHeight - x.bottom),
    sub: document.getElementById('ftAvisoVersaoSub').textContent,
    temBotao: !!document.getElementById('ftAvisoRecarregar'),
    largMax: c.maxWidth,
  };
});
checa('aparece', r.display, 'flex');
checa('caixa escura do kit (n-900)', r.fundo, 'rgb(22, 26, 32)');
checa('raio r-md 8px', r.raio, '8px');
checa('20px da direita', r.direita, 20);
checa('20px do fundo', r.fundoDist, 20);
checa('não passa de 320px', r.largMax, '320px');
checa('diz as duas versões', r.sub, 'Você está na v'+await page.evaluate(()=>FT_EDITOR)+' · publicada: v3.999');
checa('tem o botão de recarregar', r.temBotao, true);

console.log('\n=== 4. NÃO SOME SOZINHO ===');
// era um toast, sumiria em 2,6s; é um cartão, tem de ficar até atualizar
r = await page.evaluate(async () => {
  await new Promise(s => setTimeout(s, 4000));
  return getComputedStyle(document.getElementById('ftAvisoVersao')).display;
});
checa('continua na tela depois de 4s', r, 'flex');

console.log('\n=== 5. OS TOASTS PASSAM POR CIMA, O CARTÃO FICA EMBAIXO ===');
r = await page.evaluate(async () => {
  ftToast('mudança qualquer');
  await new Promise(s => setTimeout(s, 300));
  const cartao = document.getElementById('ftAvisoVersao').getBoundingClientRect();
  const toast = document.querySelector('.ft-notif').getBoundingClientRect();
  return { toastAcima: Math.round(toast.bottom) <= Math.round(cartao.top) + 1,
           semSobrepor: Math.round(toast.bottom) <= Math.round(cartao.top) + 1,
           ordemCartao: getComputedStyle(document.getElementById('ftAvisoVersao')).order };
});
checa('o toast fica ACIMA do cartão', r.toastAcima, true);
checa('  sem sobrepor', r.semSobrepor, true);
checa('  garantido por order:1', r.ordemCartao, '1');

r = await page.evaluate(async () => {
  await new Promise(s => setTimeout(s, 3000));     // o toast expira
  return { toasts: document.querySelectorAll('.ft-notif:not(.saindo)').length,
           cartao: getComputedStyle(document.getElementById('ftAvisoVersao')).display };
});
checa('o toast passa', r.toasts, 0);
checa('  e o cartão permanece', r.cartao, 'flex');

console.log('\n=== 6. O MENU RECOLHIDO NÃO O ESCONDE MAIS ===');
r = await page.evaluate(() => {
  document.body.classList.add('menu-fechado');
  const d = getComputedStyle(document.getElementById('ftAvisoVersao')).display;
  document.body.classList.remove('menu-fechado');
  return d;
});
checa('continua visível com o menu recolhido', r, 'flex');

console.log('\n=== 7. APARECE EM QUALQUER SEÇÃO ===');
r = await page.evaluate(() => {
  const vistos = {};
  ['clientes', 'banco', 'relatorio', 'bugs'].forEach(sec => {
    document.body.className = 'sec-' + sec;
    vistos[sec] = getComputedStyle(document.getElementById('ftAvisoVersao')).display;
  });
  document.body.className = 'folha-lisa sec-orcamento';
  return vistos;
});
checa('Clientes', r.clientes, 'flex');
checa('Banco', r.banco, 'flex');
checa('Relatório', r.relatorio, 'flex');
checa('Bugs', r.bugs, 'flex');

console.log('\n=== 8. O BOTÃO AINDA RECARREGA (e protege documento sujo) ===');
r = await page.evaluate(async () => {
  let recarregou = 0, perguntou = 0;
  window.ftRecarregaPagina = () => { recarregou++; };
  window.confirm = () => { perguntou++; return false; };
  FT_DOC_SUJO = false;
  document.getElementById('ftAvisoRecarregar').click();
  const limpo = { recarregou, perguntou };
  FT_DOC_SUJO = true;
  document.getElementById('ftAvisoRecarregar').click();
  return { limpo, sujo: { recarregou, perguntou } };
});
checa('documento limpo: recarrega direto', r.limpo, { recarregou: 1, perguntou: 0 });
checa('documento sujo: pergunta antes', r.sujo.perguntou, 1);
checa('  e não recarrega se disser não', r.sujo.recarregou, 1);

console.log('\n=== 9. NÃO SAI NO PAPEL ===');
await page.emulateMedia({ media: 'print' });
r = await page.evaluate(() => getComputedStyle(document.getElementById('ftAvisoVersao')).display);
checa('some na impressão', r, 'none');
await page.emulateMedia({ media: 'screen' });

console.log('\n' + '='.repeat(60));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.265: AVISO DE VERSÃO NO CANTO, E FICA');
