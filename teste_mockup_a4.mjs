/* O MOCKUP 2 DO RELATÓRIO DE ATIVIDADE, EM FOLHA A4 DEITADA

   A pergunta do dono é objetiva: cabe uma semana inteira em uma folha, ou
   vai virar várias? Este teste não responde por estimativa. Ele abre o
   mockup, varre o contador de pedidos de 4 a 60, e para cada valor lê
   quantas folhas a página realmente montou. O ponto de virada sai medido.

   Também cobra:
     - nenhum erro de página;
     - a folha tem mesmo 297 x 210mm;
     - nada vaza da margem (scrollHeight <= clientHeight em toda folha);
     - a numeração "Página N de M" bate com o número de folhas;
     - o rodapé de total aparece em TODAS as folhas: ele entra antes das
       linhas, senão a última linha de cada folha sai cortada;
     - a animação de mover a linha de dia funciona e muda o dado. */
import { abreNavegador } from './ft_navegador.mjs';
import { readFileSync, existsSync } from 'fs';

const ARQ = 'file://' + import.meta.dirname + '/mockup-relatorio-atividade-a4.html';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const ctx=await b.newContext({viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
const err=[];
/* AS FONTES DE VERDADE, OU A MEDIDA NÃO VALE NADA.
   O contêiner não alcança o Google Fonts, e sem a IBM Plex a folha era
   montada em fonte de sistema: outra largura, outra altura de linha,
   outra contagem de páginas. A resposta sairia errada por um motivo que
   não tem nada a ver com o relatório. As fontes ficam em cache no disco
   e são servidas para o navegador aqui. */
const CACHE = import.meta.dirname + '/fontes-cache/';
await p.route('**://fonts.googleapis.com/**', rota => {
  rota.fulfill({status:200, contentType:'text/css',
    body: readFileSync(CACHE+'plex.css','utf8')});
});
await p.route('**://fonts.gstatic.com/**', rota => {
  const nome = CACHE + rota.request().url().split('/').pop();
  if(!existsSync(nome)) return rota.abort();
  rota.fulfill({status:200, contentType:'font/woff2', body: readFileSync(nome)});
});
p.on('pageerror',e=>err.push(String(e).slice(0,200)));
p.on('console',m=>{ if(m.type()==='error')err.push('console: '+m.text().slice(0,160)); });
await p.goto(ARQ,{waitUntil:'load'});
await p.waitForSelector('.folha',{timeout:15000});
await p.evaluate(()=>document.fonts.ready);
checa('a IBM Plex chegou de verdade',
  await p.evaluate(()=>document.fonts.check('600 12px "IBM Plex Sans"')), true);
await p.evaluate(()=>{ montaFolhas(); });
await p.waitForTimeout(400);

console.log('\n=== 1. A FOLHA É UMA FOLHA A4 DEITADA ===');
let r=await p.evaluate(()=>{
  const f=document.querySelector('.folha').getBoundingClientRect();
  const mm=x=>+(x*25.4/96).toFixed(1);
  return {larg:mm(f.width), alt:mm(f.height)};
});
console.log('     '+JSON.stringify(r)+' mm');
checa('largura 297mm', Math.round(r.larg), 297);
checa('altura 210mm',  Math.round(r.alt),  210);

console.log('\n=== 2. O PONTO DE VIRADA, MEDIDO ===');
/* põe N pedidos e pergunta à página quantas folhas ela montou */
const mede=async n=>p.evaluate(async q=>{
  const s=document.getElementById('quantos');
  s.value=q;
  s.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(r=>setTimeout(r,120));
  const fs=[...document.querySelectorAll('.folha')];
  const vaza=fs.filter(f=>{ const c=f.querySelector('.folha-corpo');
    return c.scrollHeight>c.clientHeight+1; }).length;
  const linhas=document.querySelectorAll('.f-tab tbody tr:not(.f-dia)').length;
  const pag=[...document.querySelectorAll('.f-pag')].map(x=>x.textContent.trim());
  const rod=[...document.querySelectorAll('.f-rodape .f-fecho')].length;
  const sobra=document.querySelector('.f-sobra');
  return { folhas:fs.length, vaza, linhas, pag, rod,
           sobra: sobra?sobra.textContent.trim():'' };
},n);

const tabela=[];
for(let n=4;n<=60;n+=1){
  const m=await mede(n);
  tabela.push({n, ...m});
}
let virada=null;
for(const t of tabela){ if(t.folhas>1){ virada=t.n; break; } }
const uma=tabela.filter(t=>t.folhas===1);
const maiorDeUma=uma.length?uma[uma.length-1].n:0;
console.log('     pedidos -> folhas');
let linha='';
tabela.forEach(t=>{ linha+=`${String(t.n).padStart(2)}:${t.folhas}  `;
  if(t.n%12===3){console.log('       '+linha);linha='';} });
if(linha)console.log('       '+linha);
console.log(`     cabem em 1 folha: até ${maiorDeUma} pedidos`);
console.log(`     vira 2 folhas a partir de: ${virada} pedidos`);
const t18=tabela.find(t=>t.n===18);
console.log('     em 18 pedidos: '+JSON.stringify({folhas:t18.folhas,sobra:t18.sobra}));

checa('nenhuma folha deixa conteúdo vazar da margem',
  tabela.filter(t=>t.vaza>0).map(t=>t.n), []);
checa('o crescimento de folhas nunca anda para trás',
  tabela.every((t,i)=>i===0||t.folhas>=tabela[i-1].folhas), true);
checa('a numeração bate com o número de folhas',
  tabela.every(t=>t.pag.length===t.folhas &&
    t.pag[t.pag.length-1]===`Página ${t.folhas} de ${t.folhas}`), true);
checa('o rodapé de total aparece em toda folha',
  tabela.every(t=>t.rod===t.folhas), true);
checa('a régua de sobra aparece quando sobra papel',
  tabela.find(t=>t.n===18).sobra.includes('sobram'), true);
checa('toda linha entra em alguma folha (nada some)',
  tabela.every(t=>t.linhas===t.n), true);

console.log('\n=== 3. A ANIMAÇÃO DE MOVER A LINHA DE DIA ===');
await p.evaluate(()=>{ document.getElementById('quantos').value=18;
  document.getElementById('quantos').dispatchEvent(new Event('input',{bubbles:true})); });
await p.click('#abaTela');
await p.waitForTimeout(500);
r=await p.evaluate(()=>({
  grupos:document.querySelectorAll('#grupos .dia').length,
  linhas:document.querySelectorAll('#grupos .linha').length,
  alcas :document.querySelectorAll('#grupos .linha .puxador').length }));
console.log('     '+JSON.stringify(r));
checa('a tela mostra os dias', r.grupos>0, true);
checa('  e cada linha tem puxador de arrastar', r.alcas, r.linhas);

/* arrasta a primeira linha do primeiro dia para o último dia */
const antes=await p.evaluate(()=>[...document.querySelectorAll('#grupos .dia')]
  .map(g=>g.querySelectorAll('.linha').length));
const alvoIdx=antes.length-1;
const box=await p.evaluate(i=>{
  const g=[...document.querySelectorAll('#grupos .dia')];
  const a=g[0].querySelector('.linha .puxador').getBoundingClientRect();
  const d=g[i].getBoundingClientRect();
  return {ax:a.x+a.width/2, ay:a.y+a.height/2, dx:d.x+d.width/2, dy:d.y+d.height-20};
},alvoIdx);
await p.mouse.move(box.ax,box.ay);
await p.mouse.down();
await p.mouse.move(box.ax+8,box.ay+20,{steps:4});
await p.waitForTimeout(120);
const meio=await p.evaluate(()=>({
  voando:document.querySelectorAll('.voando').length,
  fantasma:document.querySelectorAll('.linha.fantasma').length }));
await p.mouse.move(box.dx,box.dy,{steps:14});
await p.waitForTimeout(160);
const noAlvo=await p.evaluate(()=>document.querySelectorAll('.buraco').length);
await p.screenshot({path:'shot-a4-arrasto.png'});
await p.mouse.up();
await p.waitForTimeout(900);
const depois=await p.evaluate(()=>[...document.querySelectorAll('#grupos .dia')]
  .map(g=>g.querySelectorAll('.linha').length));
console.log('     antes  '+JSON.stringify(antes));
console.log('     durante '+JSON.stringify(meio)+' buraco='+noAlvo);
console.log('     depois '+JSON.stringify(depois));
checa('durante o arrasto existe o clone voando', meio.voando, 1);
checa('  e a linha original vira fantasma', meio.fantasma, 1);
checa('  e o dia de destino abre um buraco', noAlvo>0, true);
checa('o dia de origem perdeu um pedido', depois[0], antes[0]-1);
checa('  e o dia de destino ganhou', depois[alvoIdx], antes[alvoIdx]+1);
checa('nada sobrou voando depois de soltar',
  await p.evaluate(()=>document.querySelectorAll('.voando,.fantasma,.buraco').length), 0);
checa('o total de pedidos não mudou',
  depois.reduce((a,x)=>a+x,0), antes.reduce((a,x)=>a+x,0));

console.log('\n=== 4. A FOLHA REFEZ A CONTA DEPOIS DO ARRASTO ===');
await p.click('#abaPapel');
await p.waitForTimeout(400);
checa('a folha continua sem vazar',
  await p.evaluate(()=>[...document.querySelectorAll('.folha-corpo')]
    .filter(c=>c.scrollHeight>c.clientHeight+1).length), 0);

console.log('\n=== 5. RETRATOS ===');
await p.evaluate(()=>{ document.getElementById('quantos').value=18;
  document.getElementById('quantos').dispatchEvent(new Event('input',{bubbles:true})); });
await p.waitForTimeout(300);
await p.screenshot({path:'shot-a4-folha.png',fullPage:false});
await p.evaluate(()=>{ document.getElementById('quantos').value=40;
  document.getElementById('quantos').dispatchEvent(new Event('input',{bubbles:true})); });
await p.waitForTimeout(300);
await p.screenshot({path:'shot-a4-duas.png',fullPage:true});
console.log('     shot-a4-folha.png, shot-a4-duas.png, shot-a4-arrasto.png');

console.log('\n'+'='.repeat(70));
checa('nenhum erro de página', err.length, 0);
if(err.length)err.slice(0,5).forEach(e=>console.log('     ! '+e));
await b.close();
console.log(`\nRESPOSTA: 1 folha até ${maiorDeUma} pedidos; ${virada} pedidos já viram 2 folhas.`);
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
