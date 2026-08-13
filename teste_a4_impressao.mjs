/* A PROVA NO PDF, NÃO NA TELA

   Contar folhas na tela é contar <section class="folha">. Isso responde
   quantas folhas o mockup DESENHOU, não quantas a impressora vai cuspir.
   Se a altura de 210mm estourar por um pixel, o navegador parte cada
   folha em duas e o relatório sai com o dobro de páginas, metade delas
   quase em branco. Este teste manda imprimir de verdade, em PDF, e conta
   as páginas do arquivo. Se o desenhado e o impresso não baterem, a
   resposta que eu der ao dono está errada. */
import { abreNavegador } from './ft_navegador.mjs';
import { readFileSync, existsSync, unlinkSync } from 'fs';

const DIR=import.meta.dirname+'/';
const ARQ='file://'+DIR+'mockup-relatorio-atividade-a4.html';
const CACHE=DIR+'fontes-cache/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const ctx=await b.newContext({viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
await p.route('**://fonts.googleapis.com/**', r=>r.fulfill({status:200,
  contentType:'text/css', body:readFileSync(CACHE+'plex.css','utf8')}));
await p.route('**://fonts.gstatic.com/**', r=>{
  const n=CACHE+r.request().url().split('/').pop();
  if(!existsSync(n))return r.abort();
  r.fulfill({status:200,contentType:'font/woff2',body:readFileSync(n)});
});
await p.goto(ARQ,{waitUntil:'load'});
await p.waitForSelector('.folha');
await p.evaluate(()=>document.fonts.ready);
await p.evaluate(()=>montaFolhas());

/* conta páginas do PDF sem biblioteca: o /Count do nó raiz de páginas */
function paginasDoPdf(caminho){
  const t=readFileSync(caminho,'latin1');
  const c=[...t.matchAll(/\/Type\s*\/Pages[\s\S]{0,240}?\/Count\s+(\d+)/g)]
    .map(m=>+m[1]);
  const d=[...t.matchAll(/\/Type\s*\/Page[^s]/g)].length;
  return c.length?Math.max(...c):d;
}

console.log('\n=== O DESENHADO E O IMPRESSO ===');
console.log('  pedidos   folhas na tela   páginas no PDF   tamanho da página');
const linhas=[];
for(const n of [6,12,18,24,25,30,40,51,52,60]){
  const folhas=await p.evaluate(async q=>{
    const s=document.getElementById('quantos'); s.value=q;
    s.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,150));
    return document.querySelectorAll('.folha').length;
  },n);
  const pdf=DIR+`_p${n}.pdf`;
  await p.pdf({path:pdf, landscape:true, format:'A4', printBackground:true,
    margin:{top:'0',right:'0',bottom:'0',left:'0'}});
  const pags=paginasDoPdf(pdf);
  /* MediaBox em pontos: A4 deitada = 842 x 595 */
  const t=readFileSync(pdf,'latin1');
  const mb=(t.match(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/)||[]);
  /* A4 deitada = 841.89 x 595.28pt. O Chrome escreve a caixa em pixels
     convertidos, e sobra meio ponto de arredondamento: 842.25 x 595.5.
     Meio ponto é 0,18mm, e nenhuma impressora enxerga isso. A conferência
     é por tolerância, senão o teste reprova a página certa. */
  const perto=(a,b)=>Math.abs(a-b)<=1.5;
  const tam=mb.length
    ? (perto(+mb[3],841.89)&&perto(+mb[4],595.28) ? 'A4 deitada' : `${(+mb[3]).toFixed(1)} x ${(+mb[4]).toFixed(1)} pt`)
    : '?';
  console.log(`  ${String(n).padStart(5)}   ${String(folhas).padStart(12)}   ${String(pags).padStart(12)}   ${tam}`);
  linhas.push({n,folhas,pags,tam});
  unlinkSync(pdf);
}
checa('o PDF tem exatamente as folhas desenhadas',
  linhas.filter(l=>l.pags!==l.folhas).map(l=>l.n), []);
checa('a página é A4 deitada (841.89 x 595.28 pt)',
  [...new Set(linhas.map(l=>l.tam))], ['A4 deitada']);

const uma=linhas.filter(l=>l.pags===1).map(l=>l.n);
console.log(`\n  1 página impressa com: ${uma.join(', ')} pedidos`);
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('IMPRESSÃO: o que a tela mostra é o que sai do papel');
