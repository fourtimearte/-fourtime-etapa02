/* IMPRIMIR DO TEMA ESCURO tem de sair IGUAL a imprimir do tema claro.
   O teste não confere uma lista de cores: compara os DOIS documentos
   elemento a elemento. Se um único pixel de cor divergir, ele aponta qual. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v289.html';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:1000}});
const erros=[]; p.on('pageerror',e=>erros.push(String(e).slice(0,160)));
await p.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(p);
await p.evaluate(async ()=>{
  const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
  await new Promise(s=>setTimeout(s,2600));
  /* põe um gênero em cada um dos três primeiros layouts e uma fileira
     cruzada, para as tintas entrarem na comparação */
  const est=coletaEstado();
  ['masculino','feminino','infantil'].forEach((g,i)=>{ if(est.layouts[i])est.layouts[i].genero=g; });
  if(est.layouts[0])est.layouts[0].tamanhos['10A']={q:'6',u:'79,90'};
  aplicaEstado(est);
  await new Promise(s=>setTimeout(s,3000));
});

/* colhe a "impressão digital" de cor de tudo o que está dentro da folha */
const COLHER = `(()=>{
  const out=[];
  document.querySelectorAll('.folha-a4, .folha-a4 *').forEach((el,i)=>{
    const s=getComputedStyle(el);
    out.push([ i+':'+el.tagName.toLowerCase()+'.'+(el.className&&el.className.split?el.className.split(' ')[0]:''),
      s.color, s.backgroundColor, s.borderTopColor, s.borderBottomColor, s.boxShadow.slice(0,60) ].join('|'));
  });
  return out;
})()`;

async function colhe(tema){
  return p.evaluate(async ({tema,COLHER})=>{
    document.body.dataset.tema=tema;
    await new Promise(s=>setTimeout(s,600));
    return eval(COLHER);
  }, {tema,COLHER});
}

console.log('\n=== 1. NA TELA os dois temas SÃO diferentes (senão o teste não prova nada) ===');
await p.emulateMedia({media:'screen'});
const telaClaro=await colhe('claro'), telaEscuro=await colhe('escuro');
const difTela=telaClaro.filter((v,i)=>v!==telaEscuro[i]).length;
checa('na tela há diferença entre os temas', difTela>0, true);
console.log(`     ${difTela} elementos diferentes de ${telaClaro.length}`);

console.log('\n=== 2. NO PAPEL os dois temas são IDÊNTICOS ===');
await p.emulateMedia({media:'print'});
const papelClaro=await colhe('claro'), papelEscuro=await colhe('escuro');
const dif=papelClaro.map((v,i)=>[v,papelEscuro[i]]).filter(([a,c])=>a!==c);
checa('mesmo número de elementos', papelEscuro.length, papelClaro.length);
checa('nenhuma diferença de cor no papel', dif.length, 0);
if(dif.length){
  console.log('     as 12 primeiras diferenças (claro → escuro):');
  dif.slice(0,12).forEach(([a,c])=>console.log('       '+a+'\n       '+c+'\n'));
}

console.log('\n=== 3. E o papel do tema escuro é o papel APROVADO ===');
await p.evaluate(()=>{document.body.dataset.tema='escuro';});
const r=await p.evaluate(()=>{
  const f=document.querySelector('.folha-a4');
  const g=sel=>{const el=f.querySelector(sel);return el?getComputedStyle(el):null;};
  return { folha:getComputedStyle(f).backgroundColor,
           /* uma fileira NORMAL: a cruzada é vermelha de propósito */
           textoTabela:(()=>{const tr=[...f.querySelectorAll('.lay-tabela-mini tbody tr')].find(x=>!x.className);
             return tr?getComputedStyle(tr.querySelector('td.num')).color:null;})(),
           bordaTabela:(()=>{const tr=[...f.querySelectorAll('.lay-tabela-mini tbody tr')].find(x=>!x.className);
             return tr?getComputedStyle(tr.querySelector('td.num')).borderTopColor:null;})(),
           rodapeTotal:g('.rodape-tot .rt-valor')?.color,
           generoMasc:(()=>{const c=[...f.querySelectorAll('.ft-combo[data-genero="masculino"] .ft-combo-caixa')][0];
             return c?getComputedStyle(c).backgroundColor:null;})(),
           linhaDoDocumento:(()=>{const cab=f.querySelector('.doc-header');
             return cab?getComputedStyle(cab).backgroundColor:null;})() };
});
checa('folha branca', r.folha, 'rgb(255, 255, 255)');
checa('tinta masculina clara', r.generoMasc, 'rgb(227, 238, 251)');
/* a linha do documento é UMA só desde a v279: comparar com ela */
checa('borda da tabela = linha do documento', r.bordaTabela, r.linhaDoDocumento);
console.log('     '+JSON.stringify(r));

console.log('\n=== 4. O HTML EXPORTADO também não leva o tema escuro ===');
const exp=await p.evaluate(()=>{
  document.body.dataset.tema='escuro';
  const d=new DOMParser().parseFromString(gerarHTML([]),'text/html');
  return { tema:d.body.dataset.tema||'(nenhum)', classe:d.body.className };
});
checa('o arquivo do cliente sai sem tema', exp.tema, '(nenhum)');
checa('  e continua sem valores', /sem-dinheiro/.test(exp.classe), true);

console.log('\n=== 5. A LOGO do documento no papel ===');
const logo=await p.evaluate(async ()=>{
  document.body.dataset.tema='escuro'; aplicaLogos();
  await new Promise(s=>setTimeout(s,400));
  /* NÃO há troca de src: a folha carrega as duas imagens e o CSS escolhe.
     O teste pergunta qual está VISÍVEL em cada mídia. */
  const quais=()=>[...document.querySelectorAll('.folha-a4 .logo-box,.folha-a4 .folha-logo')]
    .map(cx=>[...cx.querySelectorAll('img')].filter(i=>getComputedStyle(i).display!=='none')
      .map(i=>i.classList.contains('logo-papel')?'papel':'tema').join('+'));
  return quais;
});
await p.emulateMedia({media:'screen'});
const naTela=await p.evaluate(async ()=>[...document.querySelectorAll('.folha-a4 .logo-box,.folha-a4 .folha-logo')]
  .map(cx=>[...cx.querySelectorAll('img')].filter(i=>getComputedStyle(i).display!=='none')
    .map(i=>i.classList.contains('logo-papel')?'papel':'tema').join('+')));
await p.emulateMedia({media:'print'});
const noPapel=await p.evaluate(async ()=>[...document.querySelectorAll('.folha-a4 .logo-box,.folha-a4 .folha-logo')]
  .map(cx=>[...cx.querySelectorAll('img')].filter(i=>getComputedStyle(i).display!=='none')
    .map(i=>i.classList.contains('logo-papel')?'papel':'tema').join('+')));
const srcs=await p.evaluate(()=>[...document.querySelectorAll('.folha-a4 .logo-papel')]
  .map(i=>i.getAttribute('src')===LOGO_H_CLARA?'clara':'outra'));
console.log('     tela='+JSON.stringify(naTela)+' papel='+JSON.stringify(noPapel));
checa('havia logo no documento', naTela.length>0, true);
checa('na tela aparece a do tema', naTela.every(v=>v==='tema'), true);
checa('no papel aparece a de papel', noPapel.every(v=>v==='papel'), true);
checa('  e a de papel é a de texto escuro', srcs.every(v=>v==='clara'), true);

console.log('\n=== 6. HTML do Trello: a barra fixa fica ABAIXO do visualizador ===');
const arq=await p.evaluate(()=>{ document.body.dataset.tema='escuro'; return gerarHTML([]); });
const fs=await import('fs');
fs.writeFileSync(DIR+'export_teste.html', arq);
const cel=await b.newPage({viewport:{width:390,height:780}});
const errCel=[]; cel.on('pageerror',e=>errCel.push(String(e).slice(0,160)));
await cel.goto(pathToFileURL(DIR+'export_teste.html').href);
await cel.waitForTimeout(1200);
const pilha=await cel.evaluate(async ()=>{
  window.scrollTo(0,900); await new Promise(s=>setTimeout(s,700));
  const barra=document.getElementById('ftBarra');
  const barraVisivel=barra?barra.getBoundingClientRect().top>=-1:false;
  const im=document.querySelector('.lay-img.com-img img');
  if(im)im.click();
  await new Promise(s=>setTimeout(s,700));
  const v=document.getElementById('viewer');
  const noPonto=document.elementFromPoint(195,30);
  return { barraVisivel, aberto:v?v.classList.contains('open'):false,
           zViewer:v?+getComputedStyle(v).zIndex:null,
           zBarra:barra?+getComputedStyle(barra).zIndex:null,
           noTopo:noPonto?(noPonto.id||noPonto.className||noPonto.tagName):null };
});
console.log('     '+JSON.stringify(pilha));
checa('a barra estava visível antes de abrir', pilha.barraVisivel, true);
checa('o visualizador abriu', pilha.aberto, true);
checa('o visualizador fica ACIMA da barra', pilha.zViewer > pilha.zBarra, true);
checa('  e é ele que aparece no topo da tela', pilha.noTopo, 'viewer');
checa('sem erro de página no arquivo exportado', errCel.length, 0);
await cel.close();

await p.emulateMedia({media:'screen'});
console.log('\n=== A TARJA DE GÊNERO EXISTE NO TEMA ESCURO ===');
/* Reclamação real do chão de fábrica: "só a letra fica colorida". A causa
   era a tinta de gênero escura demais — 1.01:1 contra a folha do tema
   escuro. Contraste, não hex fixo: a paleta pode mudar, a tarja não pode
   sumir. */
const tarjas=await p.evaluate(async ()=>{
  document.body.dataset.tema='escuro';
  await new Promise(s=>setTimeout(s,300));
  const c=document.querySelector('.combo-ref'), cx=c.querySelector('.ft-combo-caixa');
  const out=[];
  for(const g of ['masculino','feminino','infantil']){
    c.dataset.genero=g;
    await new Promise(s=>setTimeout(s,80));
    const e=getComputedStyle(cx);
    let pai=cx.parentElement, atras='rgb(255, 255, 255)';
    while(pai){ const bg=getComputedStyle(pai).backgroundColor;
      if(bg&&!/rgba\(0, 0, 0, 0\)|transparent/.test(bg)){atras=bg;break;} pai=pai.parentElement; }
    out.push({g, fundo:e.backgroundColor, borda:e.borderTopColor, atras});
  }
  c.removeAttribute('data-genero');
  return out;
});
const lum=c=>{const v=c.map(x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4});
  return .2126*v[0]+.7152*v[1]+.0722*v[2];};
const razao=(a,b)=>{const[l1,l2]=[lum(a),lum(b)].sort((x,y)=>y-x);return +((l1+.05)/(l2+.05)).toFixed(2);};
const rgb=s=>(s.match(/\d+/g)||[0,0,0]).slice(0,3).map(Number);
for(const t of tarjas){
  const cT=razao(rgb(t.fundo),rgb(t.atras));
  const cB=razao(rgb(t.borda),rgb(t.atras));
  console.log(`     ${t.g.padEnd(10)} fundo=${t.fundo.padEnd(19)} tarja/folha=${cT}:1  borda/folha=${cB}:1`);
  checa(`${t.g}: a tarja se destaca da folha escura`, cT>=1.25, true);
  checa(`  e a borda dela também`, cB>=2, true);
}
await p.evaluate(()=>{document.body.dataset.tema='claro';});
console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('IMPRESSÃO SEMPRE CLARA: tema escuro imprime igual ao tema claro');
