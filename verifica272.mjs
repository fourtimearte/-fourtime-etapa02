import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';
const b = await abreNavegador();
const p = await b.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:2});
const err=[]; p.on('pageerror',e=>err.push(String(e).slice(0,200)));
await p.goto(pathToFileURL(DIR+'fourtime-editor-v276.html').href);
await esperaPronto(p);

console.log('AVISO sem valores:', await p.evaluate(async ()=>{
  const e=ms=>new Promise(s=>setTimeout(s,ms));
  const txt=()=>document.querySelector('.warn-bar').innerText.trim();
  const com=txt();
  document.body.classList.add('sem-dinheiro'); await e(100);
  const sem=txt();
  document.body.classList.remove('sem-dinheiro'); await e(50);
  return JSON.stringify({com,sem});
}));

console.log('\nTEMA ESCURO na folha:', await p.evaluate(async ()=>{
  document.body.dataset.tema='escuro';
  await new Promise(s=>setTimeout(s,350));
  const f=document.querySelector('.folha-a4');
  const ta=document.querySelector('.folha-a4 .ft-combo textarea');
  const cx=document.querySelector('.folha-a4 .ft-combo-caixa');
  const lum=c=>{const [R,G,B]=c.match(/\d+/g).map(Number);return +((0.2126*R+0.7152*G+0.0722*B)/255).toFixed(2);};
  const o={folha:getComputedStyle(f).backgroundColor,
    texto:getComputedStyle(ta).color, lumTexto:lum(getComputedStyle(ta).color),
    lumFolha:lum(getComputedStyle(f).backgroundColor),
    gradiente:getComputedStyle(cx).backgroundImage.slice(0,80)};
  document.body.dataset.tema='';
  return JSON.stringify(o,null,1);
}));

console.log('\nCANTOS do cabeçalho:', await p.evaluate(()=>{
  const c=getComputedStyle(document.querySelector('.doc-header'));
  return JSON.stringify({raio:c.borderRadius,gap:c.gap,fundo:c.backgroundColor,overflow:c.overflow});
}));

console.log('\nCARTÃO do documento:', await p.evaluate(async ()=>{
  const c=document.querySelector('[data-h="pedido"]');
  c.value='PD003929'; c.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,150));
  const pd=document.getElementById('docCartaoPedido'), di=document.getElementById('docNomeDica');
  return JSON.stringify({pedido:pd.textContent, estado:di.textContent,
    pedidoEsquerda: pd.getBoundingClientRect().x < di.getBoundingClientRect().x});
}));

console.log('\nTÍTULO nos campos:', await p.evaluate(async ()=>{
  const inp=document.querySelector('[data-h="cliente"]');
  inp.value='ASSOCIAÇÃO ATLÉTICA DO JARDIM AMÉRICA';
  await new Promise(s=>setTimeout(s,120));
  const sp=inp.closest('.hd-input-wrap').querySelector('.hd-titulo');
  return JSON.stringify({dadoReal:inp.value, exibido:sp.textContent,
    inputTransparente:getComputedStyle(inp).color});
}));

console.log('\nFUNDO da página:', await p.evaluate(()=>{
  const f=document.querySelector('.folha-a4'), c=getComputedStyle(f);
  return JSON.stringify({fundoArea:getComputedStyle(document.querySelector('.area-paginas')).backgroundColor,
    borda:c.borderTopWidth+' '+c.borderTopColor, sombra:c.boxShadow.slice(0,60)});
}));
console.log('\nerros:',err);
await b.close();
