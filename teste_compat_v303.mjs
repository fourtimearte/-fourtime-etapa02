/* COMPATIBILIDADE — um .ft salvo por uma versão ANTIGA precisa abrir na
   v277 com tudo no lugar. O teste não confia no formato: ele SALVA numa
   versão antiga de verdade (v276, v275, v274) e ABRE na v277, comparando
   campo a campo. É o caminho do usuário: salvar ontem, abrir hoje. */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
async function abre(arq){
  const p=await b.newPage({viewport:{width:1600,height:1000}});
  const err=[]; p.on('pageerror',e=>err.push(String(e).slice(0,160)));
  await p.goto(pathToFileURL(DIR+arq).href);
  await esperaPronto(p);
  return {p,err};
}
/* o que interessa comparar: tudo o que o usuário digitou */
const RESUMO = `(()=>{
  const est=coletaEstado();
  const h=est.header||{};
  return {
    header:['cliente','cpf','vendedor','departamento','embalagem','pagamento','entrega','envio','pedido','prazo']
      .reduce((o,k)=>(o[k]=h[k]===undefined?null:h[k],o),{}),
    layouts:(est.layouts||[]).map(L=>({
      ref:L.ref||'', genero:L.genero||'', tecidos:(L.tecidos||[]).filter(Boolean),
      cor:L.cor||'', grade:L.grade||'', obs:(L.obs||'').replace(/<[^>]*>/g,'').trim(),
      temImg:!!L.img,
      design:(L.design||[]).map(d=>d.tag+'['+((d.cores||[]).join(','))+']').sort(),
      tamanhos:Object.keys(L.tamanhos||{}).sort().map(t=>t+':'+(L.tamanhos[t].q||'')+'/'+(L.tamanhos[t].u||''))
    })),
    ajustes:(est.ajustes||[]).map(a=>JSON.stringify(a)),
    pecas:document.querySelector('.rt-pecas')?document.querySelector('.rt-pecas').textContent:null,
    total:document.querySelector('.rt-geral')?document.querySelector('.rt-geral').textContent:null
  };
})()`;

/* a versão NOVA vem do ambiente; as antigas são fixas, é o ponto do teste */
const NOVA = process.env.FT_ARQ || editorAtual();
/* a versao esperada sai do proprio nome do arquivo: 311 vira 3.311 */
const VER  = process.env.FT_VER || ('3.'+NOVA.match(/v(\d+)/)[1]);
/* as versoes recentes entram primeiro: a que acabou de sair e a que
   tem mais chance de ter quebrado alguma coisa */
for (const antiga of ['fourtime-editor-v310.html','fourtime-editor-v309.html','fourtime-editor-v308.html','fourtime-editor-v307.html','fourtime-editor-v306.html','fourtime-editor-v305.html','fourtime-editor-v304.html','fourtime-editor-v303.html','fourtime-editor-v302.html','fourtime-editor-v301.html','fourtime-editor-v300.html','fourtime-editor-v299.html','fourtime-editor-v298.html','fourtime-editor-v297.html','fourtime-editor-v296.html','fourtime-editor-v295.html','fourtime-editor-v294.html','fourtime-editor-v293.html','fourtime-editor-v292.html','fourtime-editor-v291.html','fourtime-editor-v290.html','fourtime-editor-v289.html','fourtime-editor-v288.html','fourtime-editor-v287.html','fourtime-editor-v286.html','fourtime-editor-v285.html','fourtime-editor-v284.html','fourtime-editor-v283.html','fourtime-editor-v282.html','fourtime-editor-v281.html','fourtime-editor-v280.html','fourtime-editor-v279.html','fourtime-editor-v278.html','fourtime-editor-v277.html','fourtime-editor-v276.html','fourtime-editor-v275.html','fourtime-editor-v274.html']){
  console.log('\n=== .ft salvo na '+antiga.replace('fourtime-editor-','').replace('.html','')+' → aberto na v'+VER+' ===');
  let velha;
  try { velha = await abre(antiga); } catch(e){ console.log('  (versão não está aqui, pulando)'); continue; }
  const dados = await velha.p.evaluate(async (RESUMO)=>{
    const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
    await new Promise(s=>setTimeout(s,2400));
    /* um ajuste de valor, para exercitar o bloco financeiro também */
    const add=document.getElementById('finAdd'); if(add){ add.click(); await new Promise(s=>setTimeout(s,500));
      const v=document.querySelector('.fin-valor'); if(v){ v.value='150,00'; v.dispatchEvent(new Event('input',{bubbles:true})); }
      const m=document.querySelector('.fin-motivo'); if(m){ m.value='Brinde'; m.dispatchEvent(new Event('input',{bubbles:true})); }
      await new Promise(s=>setTimeout(s,600)); }
    return { arquivo:JSON.stringify(coletaEstado()), resumo:eval(RESUMO), versao:FT_EDITOR };
  }, RESUMO);
  checa('a versão antiga abriu', typeof dados.versao, 'string');
  await velha.p.close();

  const nova = await abre(NOVA);
  const depois = await nova.p.evaluate(async ({arq,RESUMO})=>{
    aplicaEstado(JSON.parse(arq));
    await new Promise(s=>setTimeout(s,4200));
    return { resumo:eval(RESUMO), versao:FT_EDITOR,
             folhas:document.querySelectorAll('.folha-a4').length,
             estouro:[...document.querySelectorAll('.folha-a4')].map(f=>+excedeFolha(f).toFixed(1)) };
  }, {arq:dados.arquivo, RESUMO});

  checa('abriu na v'+VER, depois.versao, VER);
  checa('cabeçalho idêntico', depois.resumo.header, dados.resumo.header);
  checa('mesmo número de layouts', depois.resumo.layouts.length, dados.resumo.layouts.length);
  for(let i=0;i<dados.resumo.layouts.length;i++)
    checa('  layout '+(i+1)+' idêntico', depois.resumo.layouts[i], dados.resumo.layouts[i]);
  checa('ajustes de valor preservados', depois.resumo.ajustes, dados.resumo.ajustes);
  checa('peças e total batem', [depois.resumo.pecas,depois.resumo.total], [dados.resumo.pecas,dados.resumo.total]);
  checa('nenhuma folha estourada ao abrir', depois.estouro.every(v=>v<=0.5), true);
  checa('sem erro de página', nova.err.length, 0);
  if(nova.err.length) nova.err.slice(0,3).forEach(e=>console.log('     ! '+e));
  await nova.p.close();
}

console.log('\n'+'='.repeat(66));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('COMPATIBILIDADE OK: .ft das versões anteriores abre igual na v'+VER);
