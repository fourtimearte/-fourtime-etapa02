/* BRILHO NA OBSERVAÇÃO — só no HTML do Trello
   A animação `brilhar` do Design Kit v5: anel de brilho, 900ms, ease
   cubic-bezier(.2,.7,.3,1). Três coisas para não regredir:
   só no arquivo EXPORTADO, só em campo COM texto, e disparando quando o
   campo entra na tela (um orçamento de 4 páginas não pode brilhar tudo no
   carregamento, para ninguém ver). */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
import { writeFileSync } from 'fs';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1400,height:900}});
const erros=[]; p.on('pageerror',e=>erros.push(String(e).slice(0,160)));
await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v286.html')).href);
await esperaPronto(p);

console.log('\n=== 1. O EDITOR NÃO BRILHA — a animação é só do arquivo ===');
let r=await p.evaluate(async ()=>{
  const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
  await new Promise(s=>setTimeout(s,2200));
  const areas=[...document.querySelectorAll('.lay-area')];
  areas.forEach(a=>a.innerHTML='');
  areas[0].innerHTML='Conferir o escudo antes de imprimir.';
  if(areas[2])areas[2].innerHTML='Gola em ribana preta.';
  await new Promise(s=>setTimeout(s,700));
  return { classeNoEditor:document.querySelectorAll('.play-brilhar').length,
           marcaNoEditor:document.querySelectorAll('.lay-area.tem-obs').length,
           html:await gerarHTML() };
});
const html=r.html;
writeFileSync('/tmp/export_brilho.html',html);
checa('nada brilha dentro do editor', r.classeNoEditor, 0);
checa('  e nem a marca .tem-obs existe lá', r.marcaNoEditor, 0);
checa('o arquivo exportado leva os keyframes', /@keyframes a-brilhar/.test(html), true);
checa('  e o motor que dispara', /BRILHO_RUNTIME/.test(html), true);
checa('  com a duração e o easing do kit',
      /animation:a-brilhar \.9s cubic-bezier\(\.2,\.7,\.3,1\) both/.test(html), true);
checa('  e sem brilho na impressão do arquivo',
      /@media print\{ \.play-brilhar\{animation:none/.test(html), true);
await p.close();

console.log('\n=== 2. NO ARQUIVO: BRILHA SÓ ONDE TEM TEXTO, AO ENTRAR NA TELA ===');
const q=await b.newPage({viewport:{width:1100,height:700}});
const errQ=[]; q.on('pageerror',e=>errQ.push(String(e).slice(0,160)));
await q.goto(pathToFileURL('/tmp/export_brilho.html').href);
await q.waitForTimeout(400);
r=await q.evaluate(async ()=>{
  const comTexto=[...document.querySelectorAll('.lay-area.tem-obs')];
  const semTexto=[...document.querySelectorAll('.lay-area:not(.tem-obs)')];
  const todosComTexto=comTexto.every(e=>(e.textContent||'').trim().length>0);
  const todosSemTexto=semTexto.every(e=>(e.textContent||'').trim().length===0);
  /* o alvo é um campo que começa FORA da tela: assim dá para ver o disparo */
  const alvo=comTexto.find(e=>e.getBoundingClientRect().top>innerHeight)||comTexto[0];
  window.scrollTo(0,0); await new Promise(s=>setTimeout(s,250));
  alvo.scrollIntoView({block:'center'});
  await new Promise(s=>setTimeout(s,150));
  const e=getComputedStyle(alvo);
  const durante={ tocando:alvo.classList.contains('play-brilhar'),
                  anim:e.animationName, dur:e.animationDuration,
                  easing:e.animationTimingFunction,
                  /* o anel é o SEGUNDO box-shadow; o primeiro é a sombra do campo */
                  temAnel:/rgba\(198, 22, 27, 0\.35\)/.test(e.boxShadow),
                  guardouASombra:/rgba\(17, 18, 20, 0\.05\)/.test(e.boxShadow) };
  await new Promise(s=>setTimeout(s,1000));
  const depois={ tocando:alvo.classList.contains('play-brilhar'),
                 sombra:getComputedStyle(alvo).boxShadow };
  /* campo vazio entra na tela e não acontece nada */
  let vazioBrilhou=null;
  if(semTexto.length){
    semTexto[0].scrollIntoView({block:'center'});
    await new Promise(s=>setTimeout(s,350));
    vazioBrilhou=semTexto[0].classList.contains('play-brilhar');
  }
  return { qtdComTexto:comTexto.length, qtdSemTexto:semTexto.length,
           todosComTexto, todosSemTexto, durante, depois, vazioBrilhou };
});
console.log('     '+JSON.stringify(r));
checa('a marca só caiu em quem tem texto', [r.todosComTexto,r.todosSemTexto], [true,true]);
checa('  e sobrou campo sem marca para comparar', r.qtdSemTexto>0, true);
checa('entrar na tela dispara o brilho', r.durante.tocando, true);
checa('  é a animação do kit', [r.durante.anim,r.durante.dur], ['a-brilhar','0.9s']);
checa('  com o easing do kit', r.durante.easing, 'cubic-bezier(0.2, 0.7, 0.3, 1)');
checa('  o anel é o vermelho da marca', r.durante.temAnel, true);
checa('  e a sombra normal do campo continua embaixo', r.durante.guardouASombra, true);
checa('acabou, a classe sai e a sombra volta ao normal',
      [r.depois.tocando, r.depois.sombra], [false,'rgba(17, 18, 20, 0.05) 0px 1px 2px 0px']);
checa('campo sem texto nunca brilha', r.vazioBrilhou, false);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página no editor', erros.length, 0);
checa('nenhum erro de página no arquivo exportado', errQ.length, 0);
if(errQ.length)errQ.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('BRILHO: só no arquivo do Trello, só onde tem observação escrita');
