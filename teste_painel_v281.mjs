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
await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v281.html')).href);
await esperaPronto(p);
await p.evaluate(async ()=>{ const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click(); await new Promise(s=>setTimeout(s,2600)); });

console.log('\n=== 1. NENHUM TOKEN DO PAINEL ESTÁ MORTO ===');
let r=await p.evaluate(async ()=>{
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
const fontes=await p.evaluate(async ()=>{
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
fontes.forEach(([pedida,usada])=>console.log(`     pediu ${pedida.padEnd(22)} → documento em ${usada}`));
checa('cada opção chega ao documento', fontes.every(([pedida,usada])=>pedida===usada), true);
checa('IBM Plex Sans está na lista', fontes.some(([x])=>x==='IBM Plex Sans'), true);
checa('IBM Plex Mono também', fontes.some(([x])=>x==='IBM Plex Mono'), true);

console.log('\n=== 3. O TAMANHO DA TABELA SOBREVIVE À COMPRESSÃO ===');
const tam=await p.evaluate(async ()=>{
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
console.log('     '+JSON.stringify(tam));
checa('mudar o token muda a tabela', tam.depois>tam.antes, true);
checa('  e continua maior depois da compressão', tam.comCompressao>tam.antes, true);

console.log('\n=== 4. A FONTE DO DOCUMENTO ALCANÇA O DOCUMENTO INTEIRO ===');
r=await p.evaluate(async ()=>{
  const f=el=>el?getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g,''):null;
  const partes=()=>({
    folha:f(document.querySelector('.folha-a4')),
    cabRotulo:f(document.querySelector('.hd-label')),
    cabValor:f(document.querySelector('.doc-header input')),
    aviso:f(document.querySelector('.warn-bar')),
    referencia:f(document.querySelector('.combo-ref textarea')),
    tabela:f(document.querySelector('.lay-tabela-mini td.num')),
    observacao:f(document.querySelector('.lay-area')),
    rodape:f(document.querySelector('.rodape-endereco')),
  });
  const interfaceAntes=f(document.querySelector('.ft-menu-item'));
  const sel=document.getElementById('ccFonte');
  sel.value='Georgia,serif'; sel.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>requestAnimationFrame(()=>requestAnimationFrame(s)));
  const doc=partes();
  const interfaceDepois=f(document.querySelector('.ft-menu-item'));
  return { doc, interfaceAntes, interfaceDepois };
});
console.log('     '+JSON.stringify(r.doc));
checa('todas as partes do documento seguem a escolha',
      Object.values(r.doc).every(v=>v==='Georgia'), true);
checa('  e a interface do editor NÃO é arrastada junto', r.interfaceDepois, r.interfaceAntes);

console.log('\n=== 5. A FONTE DA INTERFACE TEM CONTROLE PRÓPRIO ===');
r=await p.evaluate(async ()=>{
  const f=el=>el?getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g,''):null;
  const docAntes=f(document.querySelector('.hd-label'));
  const sel=document.getElementById('ccFonteUi');
  if(!sel)return {erro:'campo não existe'};
  sel.value='Arial,sans-serif'; sel.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>requestAnimationFrame(()=>requestAnimationFrame(s)));
  return { existe:true, menu:f(document.querySelector('.ft-menu-item')),
           aba:f(document.querySelector('.ft-tab')),
           docAntes, docDepois:f(document.querySelector('.hd-label')) };
});
console.log('     '+JSON.stringify(r));
checa('o campo existe no painel', r.existe, true);
checa('menu e abas seguem a escolha', [r.menu,r.aba], ['Arial','Arial']);
checa('  e o documento NÃO muda com ela', r.docDepois, r.docAntes);

console.log('\n=== 6. ESCOLHER FONTE NÃO FECHA O PAINEL ===');
r=await p.evaluate(async ()=>{
  const fundo=document.getElementById('cfgFundo');
  fundo.classList.add('on');
  await new Promise(s=>setTimeout(s,200));
  const abertoAntes=fundo.classList.contains('on');
  /* o <select> nativo devolve um mousedown com o FUNDO como alvo quando se
     escolhe uma opção: é exatamente o evento que fechava o painel */
  fundo.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  await new Promise(s=>setTimeout(s,120));
  const depoisDoMousedown=fundo.classList.contains('on');
  /* e um clique de verdade no fundo (desce E sobe nele) ainda fecha */
  fundo.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  fundo.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  await new Promise(s=>setTimeout(s,120));
  const depoisDoCliqueReal=fundo.classList.contains('on');
  fundo.classList.remove('on');
  return { abertoAntes, depoisDoMousedown, depoisDoCliqueReal };
});
console.log('     '+JSON.stringify(r));
checa('o painel continua aberto após o mousedown do select', r.depoisDoMousedown, true);
checa('  mas um clique inteiro no fundo ainda fecha', r.depoisDoCliqueReal, false);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('PAINEL DEV: todos os tokens vivos, fontes reais, tamanho da tabela mandando');
