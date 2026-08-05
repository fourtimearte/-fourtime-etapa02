/* OS QUATRO CANTOS DA TABELA, NOS DOIS MODOS (v3.299)

   No modo SEM VALORES as colunas de dinheiro continuam no HTML com
   display:none. `:last-child` é seletor de DOM, não de olho: quem carrega o
   raio e a borda direita é a última célula do MARKUP, que ali está
   invisível — e o canto some.

   Isso já tinha sido corrigido no cabeçalho quando o modo nasceu, e ficou
   esquecido no rodapé: em cima arredondava, embaixo não. Este teste mede os
   quatro cantos nos dois modos, para os dois lados não voltarem a divergir. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v300.html';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:1000}});
const err=[]; p.on('pageerror',e=>err.push(String(e).slice(0,200)));
await p.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(p);
await p.evaluate(async()=>{
  const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
  for(let i=0;i<120;i++){ if(document.querySelectorAll('.lay-area').length>2)break;
    await new Promise(s=>setTimeout(s,100)); }
  await new Promise(s=>setTimeout(s,600));
});

/* mede o canto de cada PONTA VISÍVEL — é o que a pessoa vê */
const cantos=()=>p.evaluate(()=>{
  const t=document.querySelector('.lay-modulo .lay-tabela-mini');
  const vis=el=>getComputedStyle(el).display!=='none';
  const th=[...t.querySelectorAll('thead th')].filter(vis);
  const td=[...t.querySelectorAll('tfoot td')].filter(vis);
  const g=(e,prop)=>Math.round(parseFloat(getComputedStyle(e)[prop])||0);
  return {
    colunas:th.length,
    supEsq:g(th[0],'borderTopLeftRadius'),
    supDir:g(th[th.length-1],'borderTopRightRadius'),
    infEsq:g(td[0],'borderBottomLeftRadius'),
    infDir:g(td[td.length-1],'borderBottomRightRadius'),
    /* a moldura tem de fechar dos dois lados nas duas pontas */
    bdDirCab:Math.round(parseFloat(getComputedStyle(th[th.length-1]).borderRightWidth)*100)/100,
    bdDirRod:Math.round(parseFloat(getComputedStyle(td[td.length-1]).borderRightWidth)*100)/100
  };
});

console.log('\n=== 1. COM VALORES: os quatro cantos arredondados ===');
let r=await cantos();
console.log('     '+JSON.stringify(r));
checa('a tabela mostra as quatro colunas', r.colunas, 4);
checa('os quatro cantos têm raio', [r.supEsq,r.supDir,r.infEsq,r.infDir], [6,6,6,6]);
checa('  e a moldura fecha à direita', [r.bdDirCab>0,r.bdDirRod>0], [true,true]);

console.log('\n=== 2. SEM VALORES: a Qtd vira a ponta, e continua arredondada ===');
await p.evaluate(async()=>{ aplicaDinheiro(false); await new Promise(s=>setTimeout(s,500)); });
r=await cantos();
console.log('     '+JSON.stringify(r));
checa('sobram duas colunas visíveis', r.colunas, 2);
checa('os quatro cantos CONTINUAM com raio', [r.supEsq,r.supDir,r.infEsq,r.infDir], [6,6,6,6]);
checa('  e a moldura fecha à direita nas duas pontas',
  [r.bdDirCab>0,r.bdDirRod>0], [true,true]);
checa('  cabeçalho e rodapé com o MESMO tratamento', r.supDir, r.infDir);

console.log('\n=== 3. VOLTANDO PARA COM VALORES, nada ficou preso ===');
await p.evaluate(async()=>{ aplicaDinheiro(true); await new Promise(s=>setTimeout(s,500)); });
r=await cantos();
console.log('     '+JSON.stringify(r));
checa('as quatro colunas voltam', r.colunas, 4);
checa('  e os cantos seguem certos', [r.supEsq,r.supDir,r.infEsq,r.infDir], [6,6,6,6]);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', err.length, 0);
if(err.length)err.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('TABELA: quatro cantos arredondados com e sem valores');
