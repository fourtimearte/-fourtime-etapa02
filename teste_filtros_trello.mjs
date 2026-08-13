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
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
import { writeFileSync } from 'fs';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || editorAtual();
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
  grupos:[...document.querySelectorAll('#ftFiltros .ft-fsel')].map(c=>c.dataset.g),
  mods:document.querySelectorAll('.lay-modulo').length,
  conta:(document.querySelector('#ftFiltros .ft-fconta')||{}).textContent
}));
console.log('     '+JSON.stringify(r1));
checa('duas barras', r1.barras, 2);
checa('  a de cima vem ANTES da primeira folha', r1.cimaAntesDaFolha, true);
checa('  e a de baixo mora na barra fixa', r1.baixoDentroDaBarraFixa, true);
checa('os três grupos de filtro', r1.grupos, ['design','obs','inf']);
checa('o contador começa sem filtro', r1.conta, r1.mods+' layouts');

/* toda opção precisa contar o que existe mesmo no documento */
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
  const ruins=[];
  [...document.querySelectorAll('#ftFiltros .ft-fsel')].forEach(sel=>{
    [...sel.options].forEach(o=>{
      if(!o.value)return;                       /* a opção "Todos" não conta */
      const n=+(o.textContent.match(/\((\d+)\)$/)||[,'-'])[1];
      if(n!==real(sel.dataset.g,o.value))ruins.push(sel.dataset.g+':'+o.value);
    });
  });
  return ruins;
});
checa('toda opção conta o que existe mesmo', bate, []);
checa('  e nenhuma opção devolve zero',
  await q.evaluate(()=>[...document.querySelectorAll('#ftFiltros .ft-fsel option')]
    .filter(o=>o.value&&/\(0\)$/.test(o.textContent)).length), 0);
/* v3.309: a opção vazia deixou de ser "Todos" e passou a ser o NOME do
   filtro. Foi o que permitiu tirar o rótulo de fora e caber os três campos
   numa linha só no celular. No computador ela continua sendo a primeira, e
   continua sendo a que limpa aquele filtro. */
checa('  toda lista começa pelo nome do filtro',
  await q.evaluate(()=>[...document.querySelectorAll('#ftFiltros .ft-fsel')]
    .map(s=>s.options[0].value===''?s.options[0].textContent:'(!)')),
  ['Design','Observação','Infantil'])

console.log('\n=== 3. APAGA A 20%, E NÃO SOME ===');
const um=await q.evaluate(async()=>{
  const c=document.querySelector('#ftFiltros .ft-fsel[data-g="design"]');
  const op=c.options[1];
  const alvo=op.value, esperado=+(op.textContent.match(/\((\d+)\)$/)||[,0])[1];
  c.value=alvo; c.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(s=>setTimeout(s,350));
  const mods=[...document.querySelectorAll('.lay-modulo')];
  const ap=mods.filter(m=>m.classList.contains('ft-apagado'));
  return { alvo, esperado, acesos:mods.length-ap.length, apagados:ap.length,
    opacidade:ap.length?getComputedStyle(ap[0]).opacity:null,
    /* NÃO some: continua ocupando o mesmo espaço */
    aindaVisivel:ap.length?(getComputedStyle(ap[0]).display!=='none'
      && ap[0].getBoundingClientRect().height>10):null,
    espelho:[document.querySelector('#ftFiltrosFixo .ft-fsel[data-g="design"]').value],
    marcado:document.querySelector('#ftFiltrosFixo .ft-fsel[data-g="design"]').classList.contains('on'),
    conta:document.querySelector('#ftFiltrosFixo .ft-fconta').textContent };
});
console.log('     '+JSON.stringify(um));
checa('acende exatamente o que o chip prometia', um.acesos, um.esperado);
checa('  os outros ficam a 20%', um.opacidade, '0.2');
checa('  mas continuam ocupando o lugar', um.aindaVisivel, true);
checa('a outra barra acompanha', um.espelho, [um.alvo]);
checa('  e mostra a mesma conta', um.conta, um.acesos+' de '+r1.mods+' layouts');

console.log('\n=== 4. CADA CAMPO É ESCOLHA ÚNICA; ENTRE CAMPOS RESTRINGE ===');
const dois=await q.evaluate(async()=>{
  const sel=document.querySelector('#ftFiltros .ft-fsel[data-g="design"]');
  const troca=async v=>{ sel.value=v; sel.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(s=>setTimeout(s,280));
    return document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length; };
  const n1=await troca(sel.options[1].value);
  /* trocar a escolha SUBSTITUI: campo não acumula, é escolha única */
  const n2=await troca(sel.options[2].value);
  const esperado2=+(sel.options[2].textContent.match(/\((\d+)\)$/)||[,0])[1];
  /* um filtro de OUTRO campo só pode diminuir */
  const o=document.querySelector('#ftFiltros .ft-fsel[data-g="obs"]');
  o.value='com'; o.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(s=>setTimeout(s,280));
  const cruz=document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length;
  return {n1,n2,esperado2,cruz};
});
console.log('     '+JSON.stringify(dois));
checa('trocar a escolha SUBSTITUI, não soma', dois.n2, dois.esperado2);
checa('outro campo restringe (E)', dois.cruz<=dois.n2, true);

console.log('\n=== 5. LIMPAR, POR QUALQUER UMA DAS BARRAS ===');
const lim=await q.evaluate(async()=>{
  const vis=getComputedStyle(document.querySelector('#ftFiltros .ft-flimpa')).visibility;
  document.querySelector('#ftFiltrosFixo .ft-flimpa').click();
  await new Promise(s=>setTimeout(s,300));
  return { limparAparece:vis,
    apagados:document.querySelectorAll('.lay-modulo.ft-apagado').length,
    marcados:document.querySelectorAll('.ft-fsel.on').length,
    valores:[...document.querySelectorAll('.ft-fsel')].map(s=>s.value).join('|'),
    conta:document.querySelector('#ftFiltros .ft-fconta').textContent,
    escondeDeNovo:getComputedStyle(document.querySelector('#ftFiltros .ft-flimpa')).visibility };
});
console.log('     '+JSON.stringify(lim));
checa('o "limpar" só aparece filtrando', [lim.limparAparece,lim.escondeDeNovo], ['visible','hidden']);
checa('limpar pela barra fixa apaga tudo', [lim.apagados,lim.marcados], [0,0]);
checa('  e todos os campos voltam a "Todos"', lim.valores, '|||||');
checa('  e o contador volta ao total', lim.conta, r1.mods+' layouts');

console.log('\n=== 6. O PAPEL NÃO TEM FILTRO NEM LAYOUT APAGADO ===');
await q.evaluate(()=>{ const s=document.querySelector('#ftFiltros .ft-fsel[data-g="design"]');
  s.value=s.options[1].value; s.dispatchEvent(new Event('change',{bubbles:true})); });
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

console.log('\n=== 7. A BARRA FIXA: CORPO MAIOR E CENTRALIZADA ===');
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
const centro=await q.evaluate(()=>{
  const int=document.querySelector('.ft-barra-int');
  const r=int.getBoundingClientRect();
  const itens=[...int.querySelectorAll('.ft-bi')];
  const e=itens[0].getBoundingClientRect().left-r.left;
  const d=r.right-itens[itens.length-1].getBoundingClientRect().right;
  return { just:getComputedStyle(int).justifyContent,
           /* centrado = a folga da esquerda e a da direita são parecidas */
           simetrico:Math.abs(e-d)<26, esq:Math.round(e), dir:Math.round(d) };
});
console.log('     '+JSON.stringify(centro));
checa('a barra fixa está centralizada', centro.just, 'center');
checa('  e as folgas dos dois lados batem', centro.simetrico, true);

/* ---------------------------------------------------------------------
   O BURACO QUE DEIXOU O ERRO PASSAR (v3.304)

   A seção 7 media a centralização da LINHA DE DADOS e parava aí. A linha
   de filtros, logo abaixo, dentro da mesma barra, tinha margin:0 anulando
   o margin:0 auto da regra base — ficava colada na esquerda enquanto a de
   cima estava centrada. Em 1400px de tela a diferença é pequena; em um
   monitor largo é gritante, e foi assim que apareceu.

   Agora a conta é direta: as DUAS linhas têm de começar e terminar na
   mesma coluna, e medido numa tela larga, que é onde dói.
   --------------------------------------------------------------------- */
console.log('\n=== 8. A LINHA DE FILTROS ALINHA COM A LINHA DE DADOS ===');
await q.setViewportSize({width:1900,height:900});
await q.waitForTimeout(350);
const alinha=await q.evaluate(()=>{
  const int=document.querySelector('.ft-barra-int');
  const fora=document.getElementById('ftFiltrosFixo');
  /* sem o miolo separado (versões até a 3.303) mede-se a própria linha —
     é a geometria antiga, e é ela que tem de reprovar aqui */
  const fil=fora.querySelector('.ft-fint')||fora;
  const barra=document.getElementById('ftBarra');
  const a=int.getBoundingClientRect(), f=fil.getBoundingClientRect();
  const rb=barra.getBoundingClientRect(), rf=fora.getBoundingClientRect();
  return {
    esqIgual:Math.abs(a.left-f.left)<2, dirIgual:Math.abs(a.right-f.right)<2,
    esqDados:Math.round(a.left), esqFiltro:Math.round(f.left),
    dirDados:Math.round(a.right), dirFiltro:Math.round(f.right),
    /* e a linha de filtros continua centrada em si: folga igual dos dois lados */
    folgaEsq:Math.round(f.left-rf.left), folgaDir:Math.round(rf.right-f.right),
    /* o FUNDO e o filete, esses sim, atravessam a barra inteira */
    fundoCheio:Math.abs(rf.width-rb.width)<2,
    larguraTela:Math.round(rb.width)
  };
});
console.log('     '+JSON.stringify(alinha));
checa('numa tela larga, a barra ocupa tudo', alinha.larguraTela>1800, true);
checa('filtro e dados começam na mesma coluna', alinha.esqIgual, true);
checa('  e terminam na mesma coluna', alinha.dirIgual, true);
checa('  com folga igual dos dois lados', Math.abs(alinha.folgaEsq-alinha.folgaDir)<2, true);
checa('o fundo do filtro, esse, atravessa a barra toda', alinha.fundoCheio, true);
await q.setViewportSize({width:1400,height:900});
await q.waitForTimeout(250);

console.log('\n'+'='.repeat(64));
checa('nenhum erro no editor', erE.length, 0);
if(erE.length)erE.slice(0,3).forEach(e=>console.log('     ! '+e));
checa('nenhum erro no arquivo do Trello', erA.length, 0);
if(erA.length)erA.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('FILTROS: só no arquivo do Trello, duas barras, e o resto a 20%');
