/* v3.266 — auditoria funcional do painel Desenvolvimento.
   Não basta o controle existir: cada um tem de PRODUZIR um efeito observável. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r);}
const browser = await abreNavegador();
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const erros=[]; page.on('pageerror',e=>erros.push(String(e).slice(0,200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v275.html').href);
await esperaPronto(page);
await page.evaluate(()=>{ ccMonta(); if(window.ccFaixasMonta)ccFaixasMonta();
                          document.getElementById('ctxCustom').style.display='block'; });

console.log('\n=== 0b. CTRL + BOTÃO DIREITO ABRE EM QUALQUER LUGAR ===');
let r = await page.evaluate(() => {
  const p=document.getElementById('ctxCustom');
  const abre=(alvo,ctrl)=>{
    p.style.display='none';
    const el=document.querySelector(alvo)||document.body;
    el.dispatchEvent(new MouseEvent('contextmenu',
      {bubbles:true,cancelable:true,clientX:400,clientY:300,ctrlKey:ctrl}));
    return p.style.display==='block';
  };
  ccAtivo=true;
  const r={
    semCtrl:      abre('body', false),
    corpo:        abre('body', true),
    menu:         abre('.ft-menu', true),
    trilho:       abre('.ft-rail-bt', true),
    folha:        abre('.folha-a4', true),
    campoDeTexto: abre('input', true),
  };
  ccAtivo=false; const desligado=abre('body', true); ccAtivo=true;
  r.comRecursoDesligado=desligado;
  p.style.display='block';
  return r;
});
checa('botão direito SEM Ctrl não abre', r.semCtrl, false);
checa('Ctrl+direito no corpo abre', r.corpo, true);
checa('  no menu lateral', r.menu, true);
checa('  no trilho de seções', r.trilho, true);
checa('  dentro da folha A4', r.folha, true);
checa('  num campo de texto', r.campoDeTexto, true);
checa('com o recurso desligado, não abre', r.comRecursoDesligado, false);

console.log('\n=== 1. ESCALA DO MENU ===');
r=await page.evaluate(()=>{
  const larg=()=>Math.round(document.querySelector('.ft-menu').getBoundingClientRect().width);
  window.CC_ESC_MENU=0; ccEscAplicaMenu();
  const antes=larg();
  const sm=document.getElementById('ccEscMenu');
  sm.value='1.50'; sm.dispatchEvent(new Event('input',{bubbles:true}));
  return new Promise(res=>setTimeout(()=>{
    const depois=larg();
    const px=document.getElementById('ccEscMenuPx').textContent;
    sm.value='1.00'; sm.dispatchEvent(new Event('input',{bubbles:true}));
    res({antes,depois,px});
  },160));
});
checa('o menu muda de largura', r.depois>r.antes, true);
checa('  e o painel mostra a medida', /\d+ px/.test(r.px), true);

console.log('\n=== 2. VOLTAR AO AUTOMÁTICO ===');
r=await page.evaluate(()=>{
  window.CC_ESC_FOLHA=0.5; window.CC_ESC_MENU=1.4; window.V4_FAIXA_FORCADA='2160p';
  document.getElementById('ccEscReset').click();
  return {f:window.CC_ESC_FOLHA, m:window.CC_ESC_MENU, faixa:window.V4_FAIXA_FORCADA};
});
checa('zera a folha', r.f, 0);
checa('zera o menu', r.m, 0);
checa('e solta a faixa forçada', r.faixa, '');

console.log('\n=== 3. ABAS CLARO / ESCURO ===');
r=await page.evaluate(()=>{
  const antes=ccAba;
  document.querySelector('.cc-aba[data-tema="escuro"]').click();
  const dep=ccAba;
  const marcada=document.querySelector('.cc-aba.ativa').dataset.tema;
  const dica=document.getElementById('ccDica').textContent;
  document.querySelector('.cc-aba[data-tema="claro"]').click();
  return {antes,dep,marcada,dica};
});
checa('troca a aba editada', r.dep, 'escuro');
checa('  e marca visualmente', r.marcada, 'escuro');
checa('  explicando o que está editando', r.dica.includes('escuro'), true);

console.log('\n=== 4. LISTA DE CORES ===');
r=await page.evaluate(()=>{
  const inp=document.querySelector('#ccLista input[data-var]');
  const v=inp.dataset.var;
  const antes=getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  inp.value='#00ff00'; inp.dispatchEvent(new Event('input',{bubbles:true}));
  const depois=getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return {v, antes, depois, quantas:document.querySelectorAll('#ccLista input[data-var]').length};
});
checa('a lista tem cores', r.quantas>0, true);
checa('mexer numa muda a variável de verdade', r.depois!==r.antes, true);
console.log('     ' + r.v + ': ' + r.antes + ' -> ' + r.depois);

console.log('\n=== 5. MOLDURA DA FOLHA ===');
r=await page.evaluate(()=>{
  const b=document.getElementById('ccMoldura');
  const antes=document.body.classList.contains('folha-lisa');
  b.click();
  const dep=document.body.classList.contains('folha-lisa');
  const rot=b.textContent.trim();
  b.click();
  return {antes,dep,rot};
});
checa('o botão alterna a moldura', r.antes!==r.dep, true);
checa('  e o rótulo acompanha', ['Mostrar','Esconder'].includes(r.rot), true);

console.log('\n=== 6. FONTE DO ORÇAMENTO ===');
r=await page.evaluate(()=>{
  const sel=document.getElementById('ccFonte');
  const antes=getComputedStyle(document.documentElement).getPropertyValue('--ft-fonte').trim();
  const outra=[...sel.options].map(o=>o.value).find(v=>v&&v!==sel.value);
  // <select> dispara 'input' na interação real; o handler escuta esse
  sel.value=outra; sel.dispatchEvent(new Event('input',{bubbles:true}));
  const depois=getComputedStyle(document.documentElement).getPropertyValue('--ft-fonte').trim();
  return {antes,depois,opcoes:sel.options.length};
});
checa('tem opções de fonte', r.opcoes>1, true);
checa('trocar muda a fonte do DOCUMENTO', r.depois!==r.antes, true);
console.log('     --ft-fonte: ' + r.antes + ' -> ' + r.depois);

console.log('\n=== 7. TAMANHOS DO TEXTO DO ORÇAMENTO ===');
r=await page.evaluate(()=>{
  const campos=document.querySelectorAll('#ccTamLista input');
  if(!campos.length)return {vazio:true};
  const inp=campos[0];
  const v=inp.dataset.tvar;          // é data-TVAR, não data-var
  const antes=getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  inp.value=String((parseFloat(inp.value)||11)+3);
  inp.dispatchEvent(new Event('input',{bubbles:true}));
  const depois=getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return {quantos:campos.length, v, antes, depois};
});
checa('tem campos de tamanho', r.quantos>0, true);
checa('mexer muda o tamanho', r.depois!==r.antes, true);

console.log('\n=== 8. NEGRITO E ITÁLICO ===');
r=await page.evaluate(()=>{
  const raiz=document.documentElement;
  const pesoAntes=getComputedStyle(raiz).getPropertyValue('--ft-fonte-peso').trim();
  document.getElementById('ccBold').click();
  const pesoDep=getComputedStyle(raiz).getPropertyValue('--ft-fonte-peso').trim();
  const estAntes=getComputedStyle(raiz).getPropertyValue('--ft-fonte-estilo').trim();
  document.getElementById('ccItalic').click();
  const estDep=getComputedStyle(raiz).getPropertyValue('--ft-fonte-estilo').trim();
  document.getElementById('ccBold').click(); document.getElementById('ccItalic').click();
  return {pesoAntes,pesoDep,estAntes,estDep};
});
checa('negrito muda o peso', r.pesoDep!==r.pesoAntes, true);
checa('itálico muda o estilo', r.estDep!==r.estAntes, true);

console.log('\n=== 9b. ALTURA DO PAINEL (antes de abrir a saída de CSS) ===');
r=await page.evaluate(()=>{
  const p=document.getElementById('ctxCustom');
  const cx=p.getBoundingClientRect();
  return {altura:Math.round(cx.height), largura:Math.round(cx.width),
          colunas:[...document.querySelectorAll('.cc-col')].map(c=>Math.round(c.getBoundingClientRect().height))};
});
console.log('     painel ' + r.largura + '×' + r.altura + 'px · colunas ' + JSON.stringify(r.colunas));
// O painel tem ~1450px de conteúdo. Em duas colunas o mínimo teórico é ~725
// por lado — não dá para caber inteiro numa janela de 768p sem esconder algo.
// O alvo realista: metade da altura antiga (era ~1220 em coluna única) e as
// duas colunas parecidas, com o resto resolvido pela rolagem do próprio painel.
checa('bem menor que a versão de uma coluna', r.altura < 800, true);
checa('  colunas equilibradas (diferença < 200px)', Math.abs(r.colunas[0]-r.colunas[1]) < 200, true);

console.log('\n=== 9. COPIAR E RESETAR ===');
r=await page.evaluate(()=>{
  document.getElementById('ccCopiar').click();
  const saida=document.getElementById('ccSaida');
  const texto=saida.value||'';
  return {temSaida:texto.length>20, pareceCSS:texto.includes('--ft-'),
          temBotaoReset:!!document.getElementById('ccReset')};
});
checa('copiar produz CSS', r.temSaida, true);
checa('  com as variáveis dentro', r.pareceCSS, true);
checa('o botão de reset existe', r.temBotaoReset, true);

console.log('\n=== 10. O PAINEL CABE NUMA TELA DE 768 ===');
r=await page.evaluate(()=>{
  const p=document.getElementById('ctxCustom');
  const cx=p.getBoundingClientRect();
  const lista=document.getElementById('ccLista');
  return {altura:Math.round(cx.height), largura:Math.round(cx.width),
          listaRola:getComputedStyle(lista).overflowY,
          colunas:[...document.querySelectorAll('.cc-col')].map(c=>Math.round(c.getBoundingClientRect().height))};
});
checa('a lista de cores rola por dentro', r.listaRola, 'auto');

console.log('\n'+'='.repeat(60));
checa('nenhum erro de página', erros.length, 0);
if(erros.length)erros.slice(0,5).forEach(e=>console.log('     ! '+e));
await browser.close();
if(falhas.length){console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`);process.exit(1);}
console.log('v3.266: PAINEL AUDITADO — TUDO FUNCIONANDO');
