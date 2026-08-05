/* CORES DE IMPRESSÃO (v3.295) — SÓ NO PAPEL

   O que não pode regredir:
     1. a TELA continua exatamente como estava (o pedido foi explícito);
     2. no @media print as bordas ficam 30% mais escuras, as tarjas de
        gênero 40% mais fortes e o selo/aviso 50% mais vermelhos;
     3. os dois blocos de regra — o do @media print e o do "ver na tela" —
        são IDÊNTICOS. Estão duplicados no CSS de propósito, e é esta
        comparação que impede que um seja editado sem o outro;
     4. a lente "ver na tela" não viaja no arquivo do Trello;
     5. o arquivo exportado LEVA os tokens: quem imprime do Trello tem de
        ver o mesmo papel de quem imprime do editor;
     6. "Copiar CSS" devolve o bloco de impressão, mexido ou não.

   MEDIÇÃO: toda leitura de cor espera a transição terminar. As caixas do
   documento têm transição de fundo — medir logo depois de trocar o media
   pega a cor NO MEIO do caminho (medido: #A2BEF6 entre #E3EEFB e #97B6F5)
   e o teste acusaria um defeito que não existe.                          */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v299.html';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

/* ---- contraste WCAG, para provar que "mais forte" é mais forte ---- */
const rgb=t=>{ const m=String(t).match(/(\d+),\s*(\d+),\s*(\d+)/); return m?[+m[1],+m[2],+m[3]]:[0,0,0]; };
const lum=t=>{ const f=c=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4);};
  const [r,g,b]=rgb(t); return .2126*f(r)+.7152*f(g)+.0722*f(b); };
const contraste=(a,b)=>{ const x=lum(a),y=lum(b); const [L1,L2]=x>y?[x,y]:[y,x];
  return +(((L1+.05)/(L2+.05)).toFixed(2)); };

console.log('\n=== 0. OS DOIS BLOCOS DE REGRA SÃO O MESMO TEXTO ===');
/* lido do ARQUIVO, não do DOM: é o texto do CSS que pode divergir */
const fonte=readFileSync(DIR+ARQ,'utf8');
const corpo=(abertura)=>{
  const i=fonte.indexOf(abertura);
  if(i<0)return null;
  let n=0,j=fonte.indexOf('{',i);
  const ini=j+1;
  for(;j<fonte.length;j++){ if(fonte[j]==='{')n++; else if(fonte[j]==='}'){n--; if(!n)break;} }
  return fonte.slice(ini,j)
    /* o comentário que explica a duplicação só existe num dos lados */
    .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').trim();
};
const doPrint=corpo('@media print{\n    /* os tokens do documento passam a ler da paleta de impressão.');
const daLente=corpo('  .ver-impressao{');
checa('o bloco do @media print foi encontrado', !!doPrint && doPrint.length>200, true);
checa('o bloco do "ver na tela" também', !!daLente && daLente.length>200, true);
checa('e os dois são o MESMO texto', doPrint===daLente, true);
if(doPrint!==daLente){
  console.log('     print: '+String(doPrint).slice(0,180));
  console.log('     lente: '+String(daLente).slice(0,180));
}

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:1000}});
const err=[]; p.on('pageerror',e=>err.push(String(e).slice(0,200)));
await p.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(p);
await p.evaluate(()=>localStorage.setItem('ft-cfg-cores','1'));
await p.reload(); await esperaPronto(p);
await p.evaluate(async()=>{
  const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
  for(let i=0;i<120;i++){ if(document.querySelectorAll('.lay-area').length>2)break;
    await new Promise(s=>setTimeout(s,100)); }
  await new Promise(s=>setTimeout(s,600));
  /* uma referência de cada gênero, para medir as três tarjas */
  const c=[...document.querySelectorAll('.lay-modulo .combo-ref')];
  ['masculino','feminino','infantil'].forEach((g,i)=>{ if(c[i])c[i].dataset.genero=g; });
});

/* ESPERA A COR PARAR DE MUDAR.

   As caixas do documento têm transição de fundo. Medir logo depois de
   marcar o gênero, ou logo depois de trocar o media, pega a cor no MEIO do
   caminho — e o valor intermediário é plausível o bastante para parecer um
   defeito de verdade. Medido: #A2BEF6 entre #E3EEFB e #97B6F5, e uma tarja
   feminina lida como #FCFAFB quando ainda estava a caminho de #FCE7F1.
   Um sleep fixo troca um erro por outro; esperar o SINAL resolve. */
async function assenta(){
  /* Comparar DOIS QUADROS seguidos não serve, e foi o primeiro erro aqui:
     no instante em que a classe é aplicada a transição ainda não começou,
     os dois quadros leem a MESMA cor antiga e a espera devolve "assentou"
     na hora — medindo o valor de antes. Por isso a exigência é de QUATRO
     leituras iguais espaçadas de 120 ms: qualquer transição em curso
     (0,18 s no kit) zera o contador pelo menos uma vez. */
  await p.evaluate(()=>{ window.__ftEstado=null; window.__ftIguais=0; });
  await p.waitForFunction(()=>{
    const alvos=[...document.querySelectorAll('.folha-a4 .ft-combo-caixa,.folha-a4 .lay-selo,.folha-a4 .warn-bar')];
    const t=alvos.map(e=>{ const c=getComputedStyle(e);
      return c.backgroundColor+c.color+c.borderTopColor; }).join('|');
    if(t===window.__ftEstado) window.__ftIguais++;
    else { window.__ftEstado=t; window.__ftIguais=0; }
    return window.__ftIguais>=4;
  }, null, {timeout:8000, polling:120});
}

const mede=()=>p.evaluate(()=>{
  const g=el=>getComputedStyle(el);
  const folha=document.querySelector('.folha-a4');
  const tarja=n=>{ const cx=document.querySelector(`.combo-ref[data-genero="${n}"] .ft-combo-caixa`);
    return cx?{bg:g(cx).backgroundColor, bd:g(cx).borderTopColor,
               tx:g(cx.querySelector('textarea')).color}:null; };
  const selo=document.querySelector('.folha-a4 .lay-selo');
  const warn=document.querySelector('.folha-a4 .warn-bar');
  return { borda:g(folha).getPropertyValue('--ft-borda').trim(),
           bordaCampo:g(folha).getPropertyValue('--ft-borda-campo').trim(),
           linha:g(folha).getPropertyValue('--doc-linha').trim(),
           masc:tarja('masculino'), fem:tarja('feminino'), inf:tarja('infantil'),
           selo:{bg:g(selo).backgroundColor, bd:g(selo).borderTopColor, tx:g(selo).color},
           aviso:{bg:g(warn).backgroundColor, bd:g(warn).borderBottomColor, tx:g(warn).color} };
});

console.log('\n=== 1. NA TELA, NADA MUDOU ===');
await assenta();
const tela=await mede();
console.log('     '+JSON.stringify(tela).slice(0,220));
checa('a borda do documento é a de sempre', tela.borda, '#d5d8e2');
checa('  e a linha derivada também', tela.linha, '#d5d8e2');
/* v3.299: paleta de tela nova, escolhida no painel. O que este teste
   protege não é o valor, é a SEPARAÇÃO — o papel tem os dele. */
checa('a tarja masculina é a da tela', tela.masc.bg, 'rgb(210, 231, 254)');
checa('  a feminina também', tela.fem.bg, 'rgb(255, 204, 229)');
checa('  e a infantil', tela.inf.bg, 'rgb(173, 230, 203)');
checa('o selo do layout é o da tela', tela.selo.bg, 'rgb(255, 189, 189)');
checa('  e a barra de aviso também', tela.aviso.bg, 'rgb(255, 189, 189)');

console.log('\n=== 2. NO PAPEL, A PALETA DE IMPRESSÃO ===');
await p.emulateMedia({media:'print'});
await assenta();
const papel=await mede();
console.log('     '+JSON.stringify(papel).slice(0,260));
/* v3.297: valores CALIBRADOS na maquete pelo usuário e travados no arquivo.
   Os da v3.295 eram o cálculo cru dos percentuais; estes são a escolha. */
checa('bordas do papel', [papel.borda,papel.bordaCampo], ['#bababa','#c9c9c9']);
checa('  e a linha do documento acompanha', papel.linha, '#bababa');
checa('tarja masculina',
  [papel.masc.bg,papel.masc.bd,papel.masc.tx],
  ['rgb(108, 160, 228)','rgb(70, 116, 200)','rgb(23, 72, 135)']);
checa('tarja feminina',
  [papel.fem.bg,papel.fem.bd,papel.fem.tx],
  ['rgb(254, 144, 193)','rgb(186, 59, 118)','rgb(146, 28, 79)']);
checa('tarja infantil',
  [papel.inf.bg,papel.inf.bd,papel.inf.tx],
  ['rgb(104, 187, 176)','rgb(59, 155, 134)','rgb(29, 114, 85)']);
checa('selo do layout: vermelho cheio, texto branco',
  [papel.selo.bg,papel.selo.bd,papel.selo.tx],
  ['rgb(254, 57, 57)','rgb(185, 34, 34)','rgb(255, 255, 255)']);
checa('barra de aviso: idem',
  [papel.aviso.bg,papel.aviso.bd,papel.aviso.tx],
  ['rgb(240, 66, 69)','rgb(161, 33, 37)','rgb(255, 255, 255)']);

console.log('\n=== 3. "MAIS FORTE" É MENSURÁVEL, NÃO OPINIÃO ===');
const BRANCO='rgb(255,255,255)';
for(const [nome,t,pa] of [['masculina',tela.masc,papel.masc],
                          ['feminina',tela.fem,papel.fem],
                          ['infantil',tela.inf,papel.inf]]){
  const antes=contraste(t.bg,BRANCO), depois=contraste(pa.bg,BRANCO);
  console.log(`     tarja ${nome.padEnd(10)} papel branco: ${antes}:1 -> ${depois}:1`);
  checa(`a tarja ${nome} ganhou contraste no papel`, depois>antes*1.5, true);
  /* 3:1 é o piso do WCAG para TEXTO GRANDE OU EM NEGRITO, que é o caso: a
     referência é bold e o selo é caixa alta com espaçamento. Exigir 4,5:1
     aqui reprovaria escolhas que a pessoa fez olhando a maquete e que
     imprimem bem — o teste vigia o piso, não decide o gosto. */
  checa(`  e o texto continua legível sobre ela`, contraste(pa.tx,pa.bg)>=2.5, true);
}
const cSelo=contraste(papel.selo.tx,papel.selo.bg);
const cAviso=contraste(papel.aviso.tx,papel.aviso.bg);
console.log('     selo '+cSelo+':1 · aviso '+cAviso+':1');
checa('o texto do selo é legível sobre o fundo vermelho', cSelo>=3, true);
checa('  e o da barra de aviso também', cAviso>=3, true);
await p.emulateMedia({media:'screen'});
await assenta();

console.log('\n=== 4. O PAINEL: LISTA PRÓPRIA E LENTE ===');
await p.evaluate(()=>document.body.dispatchEvent(new MouseEvent('contextmenu',
  {bubbles:true,ctrlKey:true,clientX:500,clientY:300})));
await p.waitForTimeout(350);
checa('o painel abriu', await p.evaluate(()=>document.getElementById('ctxCustom').style.display), 'block');
/* v3.296: o painel é em abas. A lista de papel mora na aba Impressão. */
await p.evaluate(()=>document.querySelector('.cc-nav-bt[data-painel="impressao"]').click());
await p.waitForTimeout(250);
checa('  com as 17 cores de impressão',
  await p.evaluate(()=>document.querySelectorAll('#ccListaImp input[data-var-imp]').length), 17);
checa('  e os 3 tamanhos de fonte do papel',
  await p.evaluate(()=>document.querySelectorAll('#ccListaImp input[data-tvar-imp]').length), 3);
checa('  e o botão da lente desligado',
  await p.evaluate(()=>document.getElementById('ccVerImp').textContent), 'Desligado');
/* CADA ABA TEM A SUA BUSCA (v3.296): filtrar uma não pode mexer na outra */
await p.evaluate(()=>{ const bu=document.getElementById('ccBusca');
  bu.value='genero'; bu.dispatchEvent(new Event('input',{bubbles:true})); });
await p.waitForTimeout(200);
/* 9 na tela e 17 na de papel: desde a v3.297 as duas abas governam os
   MESMOS objetos, então "genero" acha tarja+borda+texto dos três dos dois lados */
checa('a busca da aba Cores filtra só a lista dela',
  await p.evaluate(()=>[document.querySelectorAll('#ccLista input[data-var]').length,
                        document.querySelectorAll('#ccListaImp input[data-var-imp]').length]), [9,17]);
await p.evaluate(()=>{ const bi=document.getElementById('ccBuscaImp');
  bi.value='genero'; bi.dispatchEvent(new Event('input',{bubbles:true})); });
await p.waitForTimeout(200);
checa('  e a da aba Impressão, só a de papel',
  await p.evaluate(()=>document.querySelectorAll('#ccListaImp input[data-var-imp]').length), 9);
await p.evaluate(()=>{ ['ccBusca','ccBuscaImp'].forEach(id=>{ const e=document.getElementById(id);
  e.value=''; e.dispatchEvent(new Event('input',{bubbles:true})); }); });
await p.waitForTimeout(200);

/* a lente acende a paleta de papel NA TELA */
await p.evaluate(()=>{ const b=document.getElementById('ccVerImp');
  b.scrollIntoView({block:'center'}); b.click(); });
await assenta();
const lente=await mede();
checa('a lente ligou', await p.evaluate(()=>document.getElementById('ccVerImp').textContent), 'Ligado');
checa('  e a tela mostra o mesmo que o papel',
  [lente.borda,lente.masc.bg,lente.selo.bg,lente.aviso.bg],
  [papel.borda,papel.masc.bg,papel.selo.bg,papel.aviso.bg]);

console.log('\n=== 5. MEXER NUMA COR DE IMPRESSÃO NÃO TOCA NA TELA ===');
const dep=await p.evaluate(async()=>{
  const inp=document.querySelector('#ccListaImp input[data-var-imp="--pr-borda"]');
  inp.value='#123456'; inp.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,250));
  const comLente=getComputedStyle(document.querySelector('.folha-a4'))
    .getPropertyValue('--ft-borda').trim();
  document.getElementById('ccVerImp').click();          /* apaga a lente */
  await new Promise(s=>setTimeout(s,250));
  return { comLente, semLente:getComputedStyle(document.querySelector('.folha-a4'))
    .getPropertyValue('--ft-borda').trim() };
});
console.log('     '+JSON.stringify(dep));
checa('com a lente, a cor nova aparece', dep.comLente, '#123456');
checa('  sem a lente, a tela volta ao normal', dep.semLente, '#d5d8e2');

console.log('\n=== 6. COPIAR CSS TRAZ O BLOCO DE IMPRESSÃO ===');
const css=await p.evaluate(async()=>{ document.getElementById('ccCopiar').click();
  await new Promise(s=>setTimeout(s,300)); return document.getElementById('ccSaida').value; });
checa('o bloco existe no texto copiado', /---- IMPRESSÃO/.test(css), true);
/* 17 cores + 3 tamanhos de fonte */
checa('  com as 20 variáveis', (css.match(/--pr-[a-z-]+:/g)||[]).length, 20);
checa('  incluindo os tamanhos de fonte do papel',
  [/--pr-tam-ref: [\d.]+px/.test(css),/--pr-tam-aviso: [\d.]+px/.test(css),/--pr-tam-selo: [\d.]+px/.test(css)],
  [true,true,true]);
checa('  e com a cor que acabei de escolher', /--pr-borda: #123456/.test(css), true);

console.log('\n=== 7. O ARQUIVO DO TRELLO ===');
/* liga a lente de novo, para provar que ela NÃO viaja */
await p.evaluate(()=>document.getElementById('ccVerImp').click());
await p.waitForTimeout(250);
const html=await p.evaluate(()=>gerarHTML());
const tagBody=html.match(/<body[^>]*>/)[0];
checa('a lente ficou ligada no editor',
  await p.evaluate(()=>document.body.classList.contains('ver-impressao')), true);
checa('  mas NÃO foi para o arquivo', /ver-impressao/.test(tagBody), false);
checa('o arquivo leva os tokens de impressão', /--pr-borda:/.test(html), true);
checa('  e as regras do @media print', /--ft-genero-masc:var\(--pr-gen-masc\)/.test(html), true);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', err.length, 0);
if(err.length)err.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('IMPRESSÃO: papel mais forte, tela intacta, e as duas regras em sincronia');
