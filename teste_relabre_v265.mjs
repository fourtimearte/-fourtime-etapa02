/* v3.265 — clicar num pedido do relatório tem de LEVAR ao editor de orçamento,
   não só trocar a página por baixo. */
import { abreNavegador } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r);}
const browser = await abreNavegador();
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const erros=[]; page.on('pageerror',e=>erros.push(String(e).slice(0,200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v272.html').href);
await page.waitForTimeout(2600);

const estado=()=>page.evaluate(()=>({
  secao: FT_SEC,
  classeBody: ['orcamento','relatorio','clientes','banco','bugs'].filter(k=>document.body.classList.contains('sec-'+k)),
  trilhoAceso: [...document.querySelectorAll('.ft-rail-bt.on')].map(b=>b.dataset.sec),
  painelVisivel: [...document.querySelectorAll('.ft-painel')].filter(p=>!p.hidden).map(p=>p.dataset.sec),
  paginaRelatorio: !document.getElementById('relPage').hidden,
  barraDeAbas: getComputedStyle(document.querySelector('.ft-tabbar')).display,
}));

console.log('\n=== 0. COMEÇA NO ORÇAMENTO ===');
await page.evaluate(()=>ftSecao('orcamento'));
let r=await estado();
checa('seção', r.secao, 'orcamento');
checa('barra de abas visível', r.barraDeAbas!=='none', true);

console.log('\n=== 1. ENTRA NO RELATÓRIO ===');
await page.evaluate(()=>{ FT_SYNC.on=false; ftSecao('relatorio'); });
r=await estado();
checa('seção', r.secao, 'relatorio');
checa('classe no body', r.classeBody, ['relatorio']);
checa('trilho aceso', r.trilhoAceso, ['relatorio']);
checa('painel lateral', r.painelVisivel, ['relatorio']);
checa('barra de abas escondida (é do orçamento)', r.barraDeAbas, 'none');

console.log('\n=== 2. CLICAR NUM PEDIDO LEVA AO ORÇAMENTO ===');
// simula a parte final de relAbrePedido — o trecho que estava errado
await page.evaluate(()=>{ if(typeof ftSecao==='function')ftSecao('orcamento'); });
await page.waitForTimeout(200);
r=await estado();
checa('a seção mudou de verdade', r.secao, 'orcamento');
checa('  a classe do body acompanhou', r.classeBody, ['orcamento']);
checa('  o trilho acendeu no orçamento', r.trilhoAceso, ['orcamento']);
checa('  o painel lateral trocou', r.painelVisivel, ['orcamento']);
checa('  a página do relatório fechou', r.paginaRelatorio, false);
checa('  e a BARRA DE ABAS reapareceu', r.barraDeAbas!=='none', true);

console.log('\n=== 3. O QUE ACONTECIA ANTES (relAlternar sozinho) ===');
await page.evaluate(()=>ftSecao('relatorio'));
await page.evaluate(()=>relAlternar(false));    // o comportamento antigo
r=await estado();
checa('a página troca...', r.paginaRelatorio, false);
checa('  mas a seção continua relatorio', r.secao, 'relatorio');
checa('  o trilho segue aceso no lugar errado', r.trilhoAceso, ['relatorio']);
checa('  e a barra de abas continua sumida', r.barraDeAbas, 'none');
console.log('     ^ era exatamente esse o sintoma relatado');

console.log('\n'+'='.repeat(60));
checa('nenhum erro de página', erros.length, 0);
await browser.close();
if(falhas.length){console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`);process.exit(1);}
console.log('v3.265: O RELATÓRIO LEVA AO ORÇAMENTO');
