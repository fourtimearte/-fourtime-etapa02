/* v3.267 — a folha NUNCA é cortada, e Ctrl+0 volta à escala escolhida. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r);}
const browser = await abreNavegador();
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const erros=[]; page.on('pageerror',e=>erros.push(String(e).slice(0,200)));
await page.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v276.html')).href);
await esperaPronto(page);

/* "cortada" = a folha passa da borda direita da área que a contém */
const corte=()=>page.evaluate(()=>{
  const f=document.querySelector('.folha-a4'), a=document.querySelector('.area-paginas');
  const rf=f.getBoundingClientRect(), ra=a.getBoundingClientRect();
  return {folha:Math.round(rf.width), areaDir:Math.round(ra.right),
          folhaDir:Math.round(rf.right), janela:window.innerWidth,
          passa:Math.round(rf.right) > Math.round(window.innerWidth)+1,
          zoom:Number((window.ZOOM||1).toFixed(3))};
});

console.log('\n=== 1. ESTREITANDO A JANELA, A FOLHA NUNCA PASSA DA TELA ===');
for(const w of [1920,1600,1400,1244,1100,1000,900,800]){
  await page.setViewportSize({width:w,height:1000}); await page.waitForTimeout(380);
  const c=await corte();
  checa('janela '+String(w).padStart(4)+'px · folha '+String(c.folha).padStart(4)+'px · zoom '+c.zoom,
        c.passa, false);
}

console.log('\n=== 2. CTRL + = TAMBÉM NÃO CORTA ===');
// o atalho grava o modo 'manual', que antes escapava de qualquer teto
await page.setViewportSize({width:1100,height:1000}); await page.waitForTimeout(400);
let r=await page.evaluate(async ()=>{
  for(let i=0;i<10;i++){
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'=',ctrlKey:true,bubbles:true}));
    await new Promise(s=>setTimeout(s,30));
  }
  const f=document.querySelector('.folha-a4').getBoundingClientRect();
  return {modo:ZOOM_MODO, manual:Number(ZOOM_MANUAL.toFixed(2)),
          zoomReal:Number(window.ZOOM.toFixed(3)),
          passa:Math.round(f.right)>window.innerWidth+1};
});
checa('o modo virou manual', r.modo, 'manual');
// Ctrl+= multiplica o zoom APLICADO, não o pedido. Então ele cresce e PARA no
// teto, em vez de disparar para 4x e obrigar cinco Ctrl+- para voltar a ver
// alguma coisa. Era a asserção que estava errada, não o comportamento.
checa('  cresceu até o teto', r.manual > 1.0 && Math.abs(r.manual-r.zoomReal) < 0.2, true);
checa('  mas a folha NÃO passa da tela', r.passa, false);
console.log('     pediu '+r.manual+' · aplicou '+r.zoomReal+' (o que cabe)');

console.log('\n=== 3. CTRL + 0 VOLTA À ESCALA ESCOLHIDA DA RESOLUÇÃO ===');
for(const [w,faixa,escala] of [[1920,'1080p',1.05],[2560,'1440p',1.20],
                               [3200,'2160p',1.40],[1366,'768p',0.90],[1440,'900p',1.00]]){
  await page.setViewportSize({width:w,height:1000}); await page.waitForTimeout(400);
  const e=await page.evaluate(async ()=>{
    /* sujeira de propósito: modo manual, calibragem à mão e faixa forçada */
    ZOOM_MODO='manual'; ZOOM_MANUAL=2.4;
    window.CC_ESC_FOLHA=0.5; window.CC_ESC_MENU=1.9; window.V4_FAIXA_FORCADA='768p';
    aplicaZoom();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'0',ctrlKey:true,bubbles:true}));
    await new Promise(s=>setTimeout(s,200));
    return {faixa:v4FaixaReal().nome, alvo:v4Faixa().folha,
            calib:window.CC_ESC_FOLHA, forcada:window.V4_FAIXA_FORCADA,
            modo:ZOOM_MODO, zoom:Number(window.ZOOM.toFixed(3))};
  });
  checa('janela '+String(w).padStart(4)+' -> faixa', e.faixa, faixa);
  checa('  volta à escala escolhida', e.alvo, escala);
  checa('  limpa a calibragem manual', e.calib, 0);
  checa('  e a faixa forçada', e.forcada, '');
}

console.log('\n=== 4. CTRL + - CONTINUA DIMINUINDO ===');
await page.setViewportSize({width:1920,height:1080}); await page.waitForTimeout(400);
r=await page.evaluate(async ()=>{
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'0',ctrlKey:true,bubbles:true}));
  await new Promise(s=>setTimeout(s,150));
  const antes=window.ZOOM;
  for(let i=0;i<3;i++){
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'-',ctrlKey:true,bubbles:true}));
    await new Promise(s=>setTimeout(s,30));
  }
  return {antes:Number(antes.toFixed(3)), depois:Number(window.ZOOM.toFixed(3))};
});
checa('diminui', r.depois < r.antes, true);
console.log('     '+r.antes+' -> '+r.depois);

console.log('\n=== 5. SEM CTRL, AS TECLAS NÃO MEXEM NO ZOOM ===');
r=await page.evaluate(async ()=>{
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'0',ctrlKey:true,bubbles:true}));
  await new Promise(s=>setTimeout(s,150));
  const antes=window.ZOOM;
  ['=','-','0'].forEach(k=>document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true})));
  await new Promise(s=>setTimeout(s,150));
  return {mudou:Math.abs(window.ZOOM-antes)>0.001};
});
checa('teclas soltas não fazem nada', r.mudou, false);

console.log('\n'+'='.repeat(60));
checa('nenhum erro de página', erros.length, 0);
await browser.close();
if(falhas.length){console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`);process.exit(1);}
console.log('v3.267: NUNCA CORTA, E CTRL+0 VOLTA AO CALIBRADO');
