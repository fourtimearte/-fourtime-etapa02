/* ANIMAÇÕES DE ATENÇÃO NO HTML DO TRELLO
   `brilhar` (900ms) na observação do layout e `pulsar` (1.1s) nas cores de
   DTF/Sublimação do design — as duas do Design Kit v5. O que não pode
   regredir: só no arquivo EXPORTADO, só onde há conteúdo, 10 repetições ao
   abrir e 5 a cada vez que a janela recupera o foco. */
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
await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v289.html')).href);
await esperaPronto(p);

console.log('\n=== 1. O EDITOR NÃO BRILHA — a animação é só do arquivo ===');
let r=await p.evaluate(async ()=>{
  const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
  /* esperar um tempo FIXO aqui é frágil: com a bateria em paralelo o kit
     demora mais e o teste media um documento pela metade. Espera pelo SINAL. */
  for(let i=0;i<120;i++){
    if(document.querySelectorAll('.lay-area').length>2)break;
    await new Promise(s=>setTimeout(s,100));
  }
  await new Promise(s=>setTimeout(s,400));
  /* o KIT DE TESTE sorteia de ZERO a três cores por tag de design — havia
     execução em que nenhuma saía e o teste do `pulsar` ficava sem alvo.
     Se o sorteio não deu cor, o teste põe uma: o que se mede aqui é a
     animação, não a sorte. */
  if(!document.querySelector('.lay-modulo .dtf-tok')){
    let g=document.querySelector('.lay-modulo .design-grupo');
    if(!g){
      const wrap=document.querySelector('.lay-modulo .design-wrap');
      if(wrap){ g=criaGrupo('DTF'); wrap.appendChild(g); }
    }
    if(g){
      g.querySelector('.design-tokens').insertAdjacentHTML('beforeend',
        tokenHTML('001')+tokenHTML('S05'));
      atualizaGrupo(g);
      await new Promise(s=>setTimeout(s,250));
    }
  }
  const areas=[...document.querySelectorAll('.lay-area')];
  areas.forEach(a=>a.innerHTML='');
  areas[0].innerHTML='Conferir o escudo antes de imprimir.';
  if(areas[2])areas[2].innerHTML='Gola em ribana preta.';
  await new Promise(s=>setTimeout(s,700));
  return { classeNoEditor:document.querySelectorAll('.play-brilhar,.play-pulsar').length,
           marcaNoEditor:document.querySelectorAll('.lay-area.tem-obs').length,
           coresNoEditor:document.querySelectorAll('.lay-modulo .dtf-tok').length,
           html:await gerarHTML() };
});
const html=r.html;
writeFileSync('/tmp/export_brilho.html',html);
checa('nada brilha dentro do editor', r.classeNoEditor, 0);
checa('  e nem a marca .tem-obs existe lá', r.marcaNoEditor, 0);
checa('o arquivo exportado leva os keyframes', /@keyframes a-brilhar/.test(html), true);
checa('  e o motor que dispara', /BRILHO_RUNTIME/.test(html), true);
checa('  e a animação pulsar também', /@keyframes a-pulsar/.test(html), true);
checa('  o kit_teste tem cor de DTF/Subli para pulsar', r.coresNoEditor>0, true);
checa('  a contagem vem de uma variável', /animation-iteration-count:var\(--rep/.test(html), true);
checa('  e nada anima na impressão do arquivo',
      /@media print\{ \.play-brilhar,\.play-pulsar\{animation:none/.test(html), true);
await p.close();

console.log('\n=== 2. NO ARQUIVO: AO ABRIR, DEZ VEZES, SÓ ONDE HÁ CONTEÚDO ===');
const q=await b.newPage({viewport:{width:1100,height:700}});
const errQ=[]; q.on('pageerror',e=>errQ.push(String(e).slice(0,160)));
await q.goto(pathToFileURL('/tmp/export_brilho.html').href);
await q.waitForTimeout(400);
r=await q.evaluate(async ()=>{
  const comTexto=[...document.querySelectorAll('.lay-area.tem-obs')];
  const semTexto=[...document.querySelectorAll('.lay-area:not(.tem-obs)')];
  const cores=[...document.querySelectorAll('.lay-modulo .dtf-tok')];
  const obs=comTexto[0], cor=cores[0];
  const eo=getComputedStyle(obs), ec=cor?getComputedStyle(cor):null;
  return {
    todosComTexto:comTexto.every(e=>(e.textContent||'').trim().length>0),
    todosSemTexto:semTexto.every(e=>(e.textContent||'').trim().length===0),
    qtdSemTexto:semTexto.length, qtdCores:cores.length,
    /* AO ABRIR: 10 repetições, sem depender de rolagem */
    obs:{ tocando:obs.classList.contains('play-brilhar'), anim:eo.animationName,
          dur:eo.animationDuration, easing:eo.animationTimingFunction,
          vezes:eo.animationIterationCount,
          temAnel:/rgba\(198, 22, 27, 0\.35\)/.test(eo.boxShadow),
          guardouASombra:/rgba\(17, 18, 20, 0\.05\)/.test(eo.boxShadow) },
    cor:ec?{ tocando:cor.classList.contains('play-pulsar'), anim:ec.animationName,
             dur:ec.animationDuration, easing:ec.animationTimingFunction,
             vezes:ec.animationIterationCount }:null,
    vazioBrilhou:semTexto.length?semTexto[0].classList.contains('play-brilhar'):null
  };
});
console.log('     '+JSON.stringify(r));
checa('a marca só caiu em quem tem texto', [r.todosComTexto,r.todosSemTexto], [true,true]);
checa('  e sobrou campo sem marca para comparar', r.qtdSemTexto>0, true);
checa('  e há cor de DTF/Subli no arquivo', r.qtdCores>0, true);
checa('abrir o documento já dispara o brilho', r.obs.tocando, true);
checa('  é a animação do kit', [r.obs.anim,r.obs.dur], ['a-brilhar','0.9s']);
checa('  com o easing do kit', r.obs.easing, 'cubic-bezier(0.2, 0.7, 0.3, 1)');
checa('  DEZ vezes na primeira rodada', r.obs.vezes, '10');
checa('  o anel é o vermelho da marca', r.obs.temAnel, true);
checa('  e a sombra normal do campo continua embaixo', r.obs.guardouASombra, true);
checa('a cor de DTF/Subli pulsa junto', r.cor.tocando, true);
checa('  com o tempo do kit', [r.cor.anim,r.cor.dur], ['a-pulsar','1.1s']);
checa('  e as mesmas dez vezes', r.cor.vezes, '10');
checa('campo sem texto nunca brilha', r.vazioBrilhou, false);

console.log('\n=== 3. PERDER E RECUPERAR O FOCO: MAIS CINCO ===');
/* deixa a primeira rodada terminar antes de medir a segunda. Quem manda no
   relógio é a mais LONGA das duas: pulsar, 10 x 1,1s = 11s. */
await q.waitForTimeout(11400);
r=await q.evaluate(()=>{
  const obs=document.querySelector('.lay-area.tem-obs');
  const cor=document.querySelector('.lay-modulo .dtf-tok');
  return { obsParou:!obs.classList.contains('play-brilhar'),
           corParou:!cor.classList.contains('play-pulsar'),
           sombraVoltou:getComputedStyle(obs).boxShadow };
});
console.log('     '+JSON.stringify(r));
checa('passadas as dez, o brilho para sozinho', r.obsParou, true);
checa('  e o pulso também', r.corParou, true);
checa('  a sombra do campo volta ao normal', r.sombraVoltou,
      'rgba(17, 18, 20, 0.05) 0px 1px 2px 0px');
r=await q.evaluate(async ()=>{
  window.dispatchEvent(new Event('focus'));
  await new Promise(s=>setTimeout(s,120));
  const obs=document.querySelector('.lay-area.tem-obs');
  const cor=document.querySelector('.lay-modulo .dtf-tok');
  const um={ obs:getComputedStyle(obs).animationIterationCount,
             cor:getComputedStyle(cor).animationIterationCount };
  /* focus e visibilitychange chegam juntos: a segunda chamada é ignorada */
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(s=>setTimeout(s,120));
  return { um, aindaCinco:getComputedStyle(obs).animationIterationCount };
});
console.log('     '+JSON.stringify(r));
checa('voltar o foco repete CINCO vezes', [r.um.obs,r.um.cor], ['5','5']);
checa('  e um segundo aviso na mesma volta não reinicia', r.aindaCinco, '5');

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página no editor', erros.length, 0);
checa('nenhum erro de página no arquivo exportado', errQ.length, 0);
if(errQ.length)errQ.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('BRILHO: só no arquivo do Trello, só onde tem observação escrita');
