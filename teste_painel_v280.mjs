/* PAINEL DEV — todo token da paleta e da tipografia tem de MEXER em algo.
   O teste aplica um valor berrante em cada um e conta quantos elementos
   mudaram de aparência. Zero = token morto, e token morto é um controle
   que mente para quem usa. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:1000}});
const erros=[]; p.on('pageerror',e=>erros.push(String(e).slice(0,160)));
await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v280.html')).href);
await esperaPronto(p);
await p.evaluate(async ()=>{ const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click(); await new Promise(s=>setTimeout(s,2600)); });

console.log('\n=== 1. NENHUM TOKEN DO PAINEL ESTÁ MORTO ===');
const r=await p.evaluate(async ()=>{
  ['masculino','feminino','infantil'].forEach((g,i)=>{
    const c=document.querySelectorAll('.combo-ref')[i]; if(c)c.dataset.genero=g; });
  const alvo=()=>[document.body,document.querySelector('.folha-a4'),
                  document.querySelector('.ft-menu'),document.querySelector('.ft-tabbar')].filter(Boolean);
  const digital=()=>{ const o=[]; alvo().forEach(raiz=>[raiz,...raiz.querySelectorAll('*')].forEach(el=>{
    const s=getComputedStyle(el);
    o.push(s.color+'|'+s.backgroundColor+'|'+s.borderTopColor+'|'+s.borderLeftColor+'|'
          +s.fontSize+'|'+s.fontFamily.slice(0,24)+'|'+s.fontWeight+'|'+s.fontStyle); })); return o; };
  const espera=()=>new Promise(s=>requestAnimationFrame(()=>requestAnimationFrame(s)));
  const raiz=document.documentElement;
  const testa=async(v,valor)=>{
    const antes=digital(); const tinha=raiz.style.getPropertyValue(v);
    raiz.style.setProperty(v,valor,'important'); await espera();
    const depois=digital();
    if(tinha)raiz.style.setProperty(v,tinha); else raiz.style.removeProperty(v);
    await espera();
    let n=0; for(let i=0;i<antes.length;i++) if(antes[i]!==depois[i])n++;
    return n;
  };
  const out=[];
  for(const [v] of CC_VARS) out.push([v,await testa(v,'#ff00ff')]);
  for(const [v] of CC_TAMANHOS) out.push([v,await testa(v,'27px')]);
  out.push(['--ft-fonte',await testa('--ft-fonte','"Courier New",monospace')]);
  out.push(['--ft-fonte-peso',await testa('--ft-fonte-peso','900')]);
  out.push(['--ft-fonte-estilo',await testa('--ft-fonte-estilo','italic')]);
  return out;
});
const mortos=r.filter(x=>x[1]===0).map(x=>x[0]);
r.forEach(([v,n])=>console.log(`     ${v.padEnd(24)} ${String(n).padStart(5)} elementos`));
checa('tokens sem efeito nenhum', mortos, []);

console.log('\n=== 2. AS FONTES DO SELETOR EXISTEM DE VERDADE ===');
const f=await p.evaluate(async ()=>{
  const sel=document.getElementById('ccFonte');
  const opcoes=[...sel.options].map(o=>o.value);
  const res=[];
  for(const v of opcoes){
    sel.value=v; sel.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(s=>requestAnimationFrame(()=>requestAnimationFrame(s)));
    const usada=getComputedStyle(document.querySelector('.folha-a4 .lay-area')||document.body).fontFamily;
    res.push([v.split(',')[0].replace(/['"]/g,''), usada.split(',')[0].replace(/['"]/g,'')]);
  }
  return res;
});
f.forEach(([pedida,usada])=>console.log(`     pediu ${pedida.padEnd(22)} → documento em ${usada}`));
checa('cada opção chega ao documento', f.every(([pedida,usada])=>pedida===usada), true);
checa('IBM Plex Sans está na lista', f.some(([x])=>x==='IBM Plex Sans'), true);
checa('IBM Plex Mono também', f.some(([x])=>x==='IBM Plex Mono'), true);

console.log('\n=== 3. O TAMANHO DA TABELA SOBREVIVE À COMPRESSÃO ===');
const t=await p.evaluate(async ()=>{
  const td=()=>document.querySelector('.folha-a4 .lay-tabela-mini td.num');
  const raiz=document.documentElement;
  const antes=parseFloat(getComputedStyle(td()).fontSize);
  raiz.style.setProperty('--ft-tam-tabela','16px');
  await new Promise(s=>setTimeout(s,300));
  const depois=parseFloat(getComputedStyle(td()).fontSize);
  /* e continua valendo DEPOIS de a compressão gravar o --tf inline */
  if(typeof reajusta==='function')reajusta();
  await new Promise(s=>setTimeout(s,900));
  const comCompressao=parseFloat(getComputedStyle(td()).fontSize);
  const nivel=document.querySelector('.lay-tabela-mini').dataset.nivel||'0';
  raiz.style.removeProperty('--ft-tam-tabela');
  return { antes, depois, comCompressao, nivel };
});
console.log('     '+JSON.stringify(t));
checa('mudar o token muda a tabela', t.depois>t.antes, true);
checa('  e continua maior depois da compressão', t.comCompressao>t.antes, true);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('PAINEL DEV: todos os tokens vivos, fontes reais, tamanho da tabela mandando');
