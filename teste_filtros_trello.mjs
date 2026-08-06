/* FILTROS DE LAYOUT NO ARQUIVO DO TRELLO (v3.302)

   O que não pode regredir:
     1. NADA disso existe no editor — é recurso do arquivo exportado;
     2. duas barras, um estado: a de cima (antes da primeira folha) e a de
        baixo (dentro da barra fixa) são a mesma lista, e clicar numa
        atualiza a outra;
     3. os chips saem do DOCUMENTO, não de uma lista fixa: só aparece o que
        existe neste pedido, com a contagem certa;
     4. quem não casa fica a 20% de opacidade — e NÃO some, porque sumir
        mudaria a paginação;
     5. dentro de um grupo os filtros somam (OU); entre grupos, restringem (E);
     6. no papel não há filtro nem layout apagado.                        */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
import { writeFileSync } from 'fs';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v302.html';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1400,height:900}});
const erE=[]; p.on('pageerror',e=>erE.push(String(e).slice(0,200)));
await p.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(p);

console.log('\n=== 1. O EDITOR NÃO TEM FILTRO NENHUM ===');
const html=await p.evaluate(async()=>{
  const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
  for(let i=0;i<120;i++){ if(document.querySelectorAll('.lay-area').length>2)break;
    await new Promise(s=>setTimeout(s,100)); }
  await new Promise(s=>setTimeout(s,700));
  const a=[...document.querySelectorAll('.lay-area')];
  a.forEach(x=>x.innerHTML='');
  if(a[0])a[0].innerHTML='Conferir o escudo antes de imprimir.';
  if(a[2])a[2].innerHTML='Gola em ribana preta.';
  /* uma tabela em grade infantil: sem ela o filtro "Infantil · com" não
     teria alvo e o teste não provaria nada */
  const t=[...document.querySelectorAll('.lay-modulo .lay-tabela-mini')];
  if(t[1])t[1].querySelector('.tam-modo').click();
  await new Promise(s=>setTimeout(s,400));
  return gerarHTML();
});
checa('nenhuma barra de filtro no editor',
  await p.evaluate(()=>document.querySelectorAll('.ft-filtros').length), 0);
checa('  e nenhum layout apagado',
  await p.evaluate(()=>document.querySelectorAll('.ft-apagado').length), 0);
writeFileSync('/tmp/ft_export_filtros.html',html);
await p.close();

console.log('\n=== 2. NO ARQUIVO: DUAS BARRAS, CHIPS DO DOCUMENTO ===');
const q=await b.newPage({viewport:{width:1180,height:900}});
const erA=[]; q.on('pageerror',e=>erA.push(String(e).slice(0,200)));
await q.goto(pathToFileURL('/tmp/ft_export_filtros.html').href);
await q.waitForTimeout(800);
const r1=await q.evaluate(()=>({
  barras:document.querySelectorAll('.ft-filtros').length,
  cimaAntesDaFolha:(()=>{ const f=document.getElementById('ftFiltros'),
    fo=document.querySelector('.folha-a4');
    return !!(f&&fo&&(f.compareDocumentPosition(fo)&Node.DOCUMENT_POSITION_FOLLOWING)); })(),
  baixoDentroDaBarraFixa:!!document.querySelector('#ftBarra #ftFiltrosFixo'),
  grupos:[...new Set([...document.querySelectorAll('#ftFiltros .ft-chip')].map(c=>c.dataset.g))],
  mods:document.querySelectorAll('.lay-modulo').length,
  conta:(document.querySelector('#ftFiltros .ft-fconta')||{}).textContent
}));
console.log('     '+JSON.stringify(r1));
checa('duas barras', r1.barras, 2);
checa('  a de cima vem ANTES da primeira folha', r1.cimaAntesDaFolha, true);
checa('  e a de baixo mora na barra fixa', r1.baixoDentroDaBarraFixa, true);
checa('os três grupos de filtro', r1.grupos, ['design','obs','inf']);
checa('o contador começa sem filtro', r1.conta, r1.mods+' layouts');

/* a contagem de cada chip tem de bater com o documento */
const bate=await q.evaluate(()=>{
  const mods=[...document.querySelectorAll('.lay-modulo')];
  const real=(g,v)=>mods.filter(m=>{
    if(g==='design')return [...m.querySelectorAll('.design-tag')]
      .some(t=>(t.dataset.tag||t.textContent||'').trim()===v);
    const tab=m.querySelector('.lay-tabela-mini');
    if(g==='obs')return (v==='com')===!!m.querySelector('.lay-area.tem-obs');
    const inf=!!(tab&&(tab.dataset.modo==='infantil'||m.querySelector('tr.tam-infantil')));
    return (v==='com')===inf;
  }).length;
  return [...document.querySelectorAll('#ftFiltros .ft-chip')]
    .filter(c=>+c.querySelector('.qt').textContent!==real(c.dataset.g,c.dataset.v))
    .map(c=>c.dataset.g+':'+c.dataset.v);
});
checa('todo chip conta o que existe mesmo', bate, []);
checa('  e nenhum chip devolve zero',
  await q.evaluate(()=>[...document.querySelectorAll('#ftFiltros .ft-chip')]
    .filter(c=>c.querySelector('.qt').textContent==='0').length), 0);

console.log('\n=== 3. APAGA A 20%, E NÃO SOME ===');
const um=await q.evaluate(async()=>{
  const c=document.querySelector('#ftFiltros .ft-chip[data-g="design"]');
  const alvo=c.dataset.v, esperado=+c.querySelector('.qt').textContent;
  c.click(); await new Promise(s=>setTimeout(s,350));
  const mods=[...document.querySelectorAll('.lay-modulo')];
  const ap=mods.filter(m=>m.classList.contains('ft-apagado'));
  return { alvo, esperado, acesos:mods.length-ap.length, apagados:ap.length,
    opacidade:ap.length?getComputedStyle(ap[0]).opacity:null,
    /* NÃO some: continua ocupando o mesmo espaço */
    aindaVisivel:ap.length?(getComputedStyle(ap[0]).display!=='none'
      && ap[0].getBoundingClientRect().height>10):null,
    espelho:[...document.querySelectorAll('#ftFiltrosFixo .ft-chip.on')].map(x=>x.dataset.v),
    conta:document.querySelector('#ftFiltrosFixo .ft-fconta').textContent };
});
console.log('     '+JSON.stringify(um));
checa('acende exatamente o que o chip prometia', um.acesos, um.esperado);
checa('  os outros ficam a 20%', um.opacidade, '0.2');
checa('  mas continuam ocupando o lugar', um.aindaVisivel, true);
checa('a outra barra acompanha', um.espelho, [um.alvo]);
checa('  e mostra a mesma conta', um.conta, um.acesos+' de '+r1.mods+' layouts');

console.log('\n=== 4. DENTRO DO GRUPO SOMA; ENTRE GRUPOS RESTRINGE ===');
const dois=await q.evaluate(async()=>{
  const cs=[...document.querySelectorAll('#ftFiltros .ft-chip[data-g="design"]')];
  const a=+cs[0].querySelector('.qt').textContent;
  const bq=+cs[1].querySelector('.qt').textContent;
  cs[1].click(); await new Promise(s=>setTimeout(s,300));
  const soma=document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length;
  /* agora um filtro de OUTRO grupo: só pode diminuir */
  document.querySelector('#ftFiltros .ft-chip[data-g="obs"][data-v="com"]').click();
  await new Promise(s=>setTimeout(s,300));
  const cruz=document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length;
  return {a,b:bq,soma,cruz};
});
console.log('     '+JSON.stringify(dois));
checa('dois chips do MESMO grupo somam (OU)', dois.soma>=Math.max(dois.a,dois.b), true);
checa('  e nunca passam da soma dos dois', dois.soma<=dois.a+dois.b, true);
checa('um chip de OUTRO grupo restringe (E)', dois.cruz<=dois.soma, true);

console.log('\n=== 5. LIMPAR, POR QUALQUER UMA DAS BARRAS ===');
const lim=await q.evaluate(async()=>{
  const vis=getComputedStyle(document.querySelector('#ftFiltros .ft-flimpa')).display;
  document.querySelector('#ftFiltrosFixo .ft-flimpa').click();
  await new Promise(s=>setTimeout(s,300));
  return { limparAparece:vis,
    apagados:document.querySelectorAll('.lay-modulo.ft-apagado').length,
    marcados:document.querySelectorAll('.ft-chip.on').length,
    conta:document.querySelector('#ftFiltros .ft-fconta').textContent,
    escondeDeNovo:getComputedStyle(document.querySelector('#ftFiltros .ft-flimpa')).display };
});
console.log('     '+JSON.stringify(lim));
checa('o "limpar" só aparece filtrando', [lim.limparAparece,lim.escondeDeNovo], ['block','none']);
checa('limpar pela barra fixa apaga tudo', [lim.apagados,lim.marcados], [0,0]);
checa('  e o contador volta ao total', lim.conta, r1.mods+' layouts');

console.log('\n=== 6. O PAPEL NÃO TEM FILTRO NEM LAYOUT APAGADO ===');
await q.evaluate(()=>document.querySelector('#ftFiltros .ft-chip[data-g="design"]').click());
await q.waitForTimeout(300);
await q.emulateMedia({media:'print'});
await q.waitForTimeout(500);
const papel=await q.evaluate(()=>{
  const f=document.querySelector('.ft-filtros');
  const ap=document.querySelector('.lay-modulo.ft-apagado');
  return { filtroVisivel:getComputedStyle(f).display,
           barraVisivel:getComputedStyle(document.getElementById('ftBarra')).display,
           opacidadeDoApagado:ap?getComputedStyle(ap).opacity:null,
           aindaMarcadoNoDOM:!!ap };
});
console.log('     '+JSON.stringify(papel));
checa('a barra de filtros some no papel', papel.filtroVisivel, 'none');
checa('  a barra fixa também', papel.barraVisivel, 'none');
checa('o layout apagado volta a 100% no papel', papel.opacidadeDoApagado, '1');
checa('  (a marca continua no DOM: quem volta da impressão volta filtrando)',
  papel.aindaMarcadoNoDOM, true);
await q.emulateMedia({media:'screen'});

console.log('\n=== 7. A BARRA FIXA COM O CORPO MAIOR ===');
const cor=await q.evaluate(()=>{
  const g=s=>getComputedStyle(document.querySelector(s));
  return { rotulo:g('#ftBarra .rot').fontSize, valor:g('#ftBarra .val').fontSize,
           pedido:g('#ftBarra .ft-bi.pedido .val').fontSize,
           total:g('#ftBarra .ft-bi.total .val').fontSize };
});
console.log('     '+JSON.stringify(cor));
checa('rótulo 9 -> 10,5px', cor.rotulo, '10.5px');
checa('valor 13 -> 15px', cor.valor, '15px');
checa('pedido 13 -> 15px', cor.pedido, '15px');
checa('total 12,5 -> 14px', cor.total, '14px');

console.log('\n'+'='.repeat(64));
checa('nenhum erro no editor', erE.length, 0);
if(erE.length)erE.slice(0,3).forEach(e=>console.log('     ! '+e));
checa('nenhum erro no arquivo do Trello', erA.length, 0);
if(erA.length)erA.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('FILTROS: só no arquivo do Trello, duas barras, e o resto a 20%');
