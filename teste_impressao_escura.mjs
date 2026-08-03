/* IMPRIMIR DO TEMA ESCURO tem de sair IGUAL a imprimir do tema claro.
   O teste não confere uma lista de cores: compara os DOIS documentos
   elemento a elemento. Se um único pixel de cor divergir, ele aponta qual. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v277.html';
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
             return c?getComputedStyle(c).backgroundColor:null;})() };
});
checa('folha branca', r.folha, 'rgb(255, 255, 255)');
checa('tinta masculina clara', r.generoMasc, 'rgb(227, 238, 251)');
checa('borda da tabela clara', r.bordaTabela, 'rgb(228, 232, 237)');
console.log('     '+JSON.stringify(r));

console.log('\n=== 4. O HTML EXPORTADO também não leva o tema escuro ===');
const exp=await p.evaluate(()=>{
  document.body.dataset.tema='escuro';
  const d=new DOMParser().parseFromString(gerarHTML([]),'text/html');
  return { tema:d.body.dataset.tema||'(nenhum)', classe:d.body.className };
});
checa('o arquivo do cliente sai sem tema', exp.tema, '(nenhum)');
checa('  e continua sem valores', /sem-dinheiro/.test(exp.classe), true);

await p.emulateMedia({media:'screen'});
await p.evaluate(()=>{document.body.dataset.tema='claro';});
console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('IMPRESSÃO SEMPRE CLARA: tema escuro imprime igual ao tema claro');
