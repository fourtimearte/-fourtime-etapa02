/* AS TRÊS CORREÇÕES DA v3.292

   1. CEP/CNPJ — sair do campo não pode mais matar a busca. Sair dispara
      'change' -> bdPersiste() -> normalizaClientes(), que REFAZ cada cliente
      e cada endereço num objeto novo. As guardas antigas comparavam por
      REFERÊNCIA, então a resposta que chegava depois era jogada fora e a
      ficha ficava vazia. Agora o alvo é buscado de novo depois do await e a
      identidade é conferida por ID.

   2. PAINEL DEV — escolher a fonte DO DOCUMENTO não pode fechar o painel. O
      seletor virou dropdown custom e o menu dele mora no <body> (para
      escapar do zoom da folha): clicar numa fonte era, tecnicamente, clique
      FORA do painel. O da INTERFACE é um <select> comum — por isso só um
      dos dois fechava.

   3. VISUALIZADOR DE IMAGEM — clicar fora da imagem fecha. Sem estragar o
      arrasto: soltar longe de onde apertou continua sendo pan.            */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v300.html';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(56)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();

/* ================================================================
   1. CEP — DIGITAR E SAIR DO CAMPO
   ================================================================ */
console.log('\n=== 1. CEP: digitar e SAIR do campo ainda preenche ===');
const p=await b.newPage({viewport:{width:1500,height:1000}});
const err=[]; p.on('pageerror',e=>err.push(String(e).slice(0,200)));
/* resposta REAL do 59607838, com atraso parecido com o da rede: sem o
   atraso, a resposta chegaria antes do 'change' e o defeito não apareceria */
const CEP={cep:'59607838',state:'RN',city:'Mossoró',neighborhood:'Aeroporto',street:'Rua Tereza Costa'};
await p.route('**/brasilapi.com.br/api/cep/**',async r=>{
  await new Promise(s=>setTimeout(s,900));
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CEP)});
});
await p.route('**/opencep.com/**',r=>r.abort());
await p.route('**/viacep.com.br/**',r=>r.abort());
await p.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(p);

let r=await p.evaluate(async()=>{
  const out={};
  document.querySelector('.ft-rail-bt[data-sec="clientes"]').click();
  await new Promise(s=>setTimeout(s,600));

  /* CASO A — digita e NÃO sai do campo (sempre funcionou) */
  DB.clientes=[{id:'c1',n:'CLIENTE TESTE'}]; CLI_SEL='c1'; cliFicha();
  await new Promise(s=>setTimeout(s,400));
  let cep=document.getElementById('cli_cep');
  cep.value='59607838'; cep.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,1600));
  out.semSair={cidade:document.getElementById('cli_cidade').value,
               rua:document.getElementById('cli_rua').value};

  /* CASO B — digita e SAI do campo: é o gesto de quem usa */
  DB.clientes=[{id:'c2',n:'CLIENTE DOIS'}]; CLI_SEL='c2'; cliFicha();
  await new Promise(s=>setTimeout(s,400));
  cep=document.getElementById('cli_cep');
  cep.value='59607838'; cep.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,120));
  cep.dispatchEvent(new Event('change',{bubbles:true}));   /* o blur real dispara isto */
  await new Promise(s=>setTimeout(s,1800));
  out.saindoDoCampo={cidade:document.getElementById('cli_cidade').value,
                     rua:document.getElementById('cli_rua').value};

  /* CASO C — endereço avulso, mesmo gesto */
  DB.clientes=[{id:'c3',n:'CLIENTE TRES',enderecos:[]}]; CLI_SEL='c3'; cliFicha();
  await new Promise(s=>setTimeout(s,300));
  document.getElementById('cliMaisEnd').click();
  await new Promise(s=>setTimeout(s,400));
  const id=(DB.clientes.find(c=>c.id==='c3').enderecos[0]||{}).id;
  const c2=document.getElementById('end_'+id+'_cep');
  c2.value='59607838'; c2.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,120));
  c2.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(s=>setTimeout(s,1800));
  out.avulso={cidade:(document.getElementById('end_'+id+'_cidade')||{}).value,
              rua:(document.getElementById('end_'+id+'_rua')||{}).value};
  return out;
});
console.log('     '+JSON.stringify(r));
checa('sem sair do campo, preenche', [r.semSair.cidade,r.semSair.rua], ['Mossoró','Rua Tereza Costa']);
checa('SAINDO do campo, também preenche', [r.saindoDoCampo.cidade,r.saindoDoCampo.rua], ['Mossoró','Rua Tereza Costa']);
checa('  e no endereço avulso igual', [r.avulso.cidade,r.avulso.rua], ['Mossoró','Rua Tereza Costa']);
await p.close();

/* ================================================================
   2. PAINEL DEV x FONTE DO DOCUMENTO
   ================================================================ */
console.log('\n=== 2. Escolher a fonte do documento não fecha o painel ===');
const q=await b.newPage({viewport:{width:1500,height:1000}});
const errQ=[]; q.on('pageerror',e=>errQ.push(String(e).slice(0,200)));
await q.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(q);
await q.evaluate(()=>localStorage.setItem('ft-cfg-cores','1'));
await q.reload(); await esperaPronto(q);

const disp=()=>q.evaluate(()=>document.getElementById('ctxCustom').style.display);
await q.evaluate(()=>document.body.dispatchEvent(new MouseEvent('contextmenu',
  {bubbles:true,ctrlKey:true,clientX:500,clientY:300})));
await q.waitForTimeout(400);
checa('Ctrl+botão direito abre o painel', await disp(), 'block');

/* v3.296: os dois seletores de fonte mudaram para a aba "Fontes". Sem
   abrir a aba, o elemento está em display:none, o getBoundingClientRect
   devolve zeros e o clique vai parar em (0,0) — fora do painel, que então
   fecha. O teste acusava exatamente o defeito que ele existe para vigiar,
   e por um motivo que não era o defeito. */
await q.evaluate(()=>{ const bt=document.querySelector('.cc-nav-bt[data-painel="fontes"]');
  if(bt)bt.click(); });
await q.waitForTimeout(250);
await q.evaluate(()=>{ const s=document.getElementById('ccFonte');
  if(s)(s.closest('.ft-dd')||s).scrollIntoView({block:'center'}); });
await q.waitForTimeout(200);
checa('a fonte do documento é dropdown custom',
  await q.evaluate(()=>!!document.getElementById('ccFonte').closest('.ft-dd')), true);

/* CLIQUE DE VERDADE: o dropdown abre no 'pointerdown', que um MouseEvent
   sintético nunca produz — dispatchEvent aqui não testaria nada. */
const bt=await q.evaluate(()=>{
  const r=document.getElementById('ccFonte').closest('.ft-dd')
          .querySelector('.ft-dd-bt').getBoundingClientRect();
  return {x:r.left+r.width/2,y:r.top+r.height/2};
});
await q.mouse.click(bt.x,bt.y);
await q.waitForTimeout(300);
checa('o menu de fontes abre com opções',
  await q.evaluate(()=>document.querySelectorAll('.ft-dd-menu.aberto .ft-dd-op').length)>0, true);
checa('  e o painel continua aberto', await disp(), 'block');

const op=await q.evaluate(()=>{
  const menu=document.querySelector('.ft-dd-menu.aberto'); if(!menu)return null;
  const ops=[...menu.querySelectorAll('.ft-dd-op')];
  const alvo=ops.find(x=>!x.classList.contains('on'))||ops[0];
  const r=alvo.getBoundingClientRect();
  return {x:r.left+r.width/2,y:r.top+r.height/2,txt:alvo.textContent.trim()};
});
if(op){ await q.mouse.click(op.x,op.y); await q.waitForTimeout(400); }
checa('ESCOLHER a fonte NÃO fecha o painel', await disp(), 'block');
checa('  e a fonte foi mesmo aplicada',
  await q.evaluate(()=>getComputedStyle(document.documentElement)
    .getPropertyValue('--ft-fonte').trim().length>0), true);

/* o <select> comum da interface continua sem fechar (é o controle) */
await q.evaluate(()=>{ const s=document.getElementById('ccFonteUi');
  s.scrollIntoView({block:'center'});
  s.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  s.selectedIndex=1;
  s.dispatchEvent(new Event('input',{bubbles:true}));
  s.dispatchEvent(new Event('change',{bubbles:true})); });
await q.waitForTimeout(250);
checa('a fonte da interface também não fecha', await disp(), 'block');

/* e clicar FORA de verdade tem que continuar fechando */
const fora=await q.evaluate(()=>{
  const r=document.querySelector('.ft-rail').getBoundingClientRect();
  return {x:r.left+r.width/2,y:r.bottom-20};
});
await q.mouse.click(fora.x,fora.y);
await q.waitForTimeout(250);
checa('clicar fora de verdade ainda fecha', await disp(), 'none');
await q.close();

/* ================================================================
   3. VISUALIZADOR: CLICAR FORA DA IMAGEM FECHA
   ================================================================ */
console.log('\n=== 3. Visualizador: clique fora fecha, arrasto não ===');
const v=await b.newPage({viewport:{width:1200,height:800}});
const errV=[]; v.on('pageerror',e=>errV.push(String(e).slice(0,200)));
await v.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(v);

/* O visualizador tem que ser aberto pelo CAMINHO OFICIAL — clicando numa
   imagem de layout. Abrir "na mão" pondo a classe .open deixa o V.img do
   runtime valendo null e o pan quebra: seria um defeito do teste, não do
   editor. */
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAQUlEQVR42u3QMQEAAAgDoC251a3gLzSgmXBPCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCV0tXHkBAWvIrmMAAAAASUVORK5CYII=';
const aberto=()=>v.evaluate(()=>document.getElementById('viewer').classList.contains('open'));
async function abreVisualizador(){
  await v.evaluate(async(png)=>{
    const cx=document.querySelector('.lay-img');
    cx.classList.add('com-img');
    cx.innerHTML='<img alt="">';
    const im=cx.querySelector('img'); im.src=png;
    await new Promise(s=>{ im.onload=s; if(im.complete&&im.naturalWidth)s(); });
    im.click();                                   /* é este clique que abre */
  }, PNG);
  await v.waitForTimeout(400);
}
/* onde a imagem foi parar na tela — o runtime é quem decide o encaixe */
const cx=()=>v.evaluate(()=>{
  const r=document.getElementById('vImg').getBoundingClientRect();
  return {l:r.left,t:r.top,w:r.width,h:r.height,
          transform:document.getElementById('vImg').style.transform};
});
await abreVisualizador();
checa('o visualizador está aberto para o teste', await aberto(), true);
let cai=await cx();
console.log('     imagem em '+JSON.stringify(cai));
/* o encaixe é pela dimensão mais restritiva: uma imagem quadrada numa tela
   deitada preenche a ALTURA toda e deixa faixas de fundo à esquerda e à
   direita. Basta uma dessas faixas para o teste ter onde clicar. */
checa('  e sobra faixa de fundo para clicar', cai.l>20||cai.t>20, true);

/* clique num ponto do FUNDO, comprovadamente fora da imagem */
const foraX=cai.l>20?Math.round(cai.l/2):Math.round(cai.l+cai.w+ (1200-cai.l-cai.w)/2);
const foraY=cai.t>20?Math.round(cai.t/2):Math.round(cai.t+cai.h/2);
await v.mouse.click(foraX, foraY);
await v.waitForTimeout(250);
checa('clicar FORA da imagem fecha o visualizador', await aberto(), false);

/* reabre pelo mesmo caminho e confere que clicar NA IMAGEM não fecha */
await abreVisualizador();
cai=await cx();
await v.mouse.click(Math.round(cai.l+cai.w/2), Math.round(cai.t+cai.h/2));
await v.waitForTimeout(250);
checa('clicar NA imagem não fecha', await aberto(), true);

/* ARRASTAR o fundo (pan) não pode fechar */
const antes=(await cx()).transform;
await v.mouse.move(foraX, foraY);
await v.mouse.down();
await v.mouse.move(foraX+200, foraY+100, {steps:8});
await v.mouse.up();
await v.waitForTimeout(250);
checa('arrastar o fundo é pan, não fecha', await aberto(), true);
const depois=await cx();
console.log('     transform antes='+antes+'  depois='+depois.transform);
checa('  e a imagem andou os 200x100 do arrasto',
  [Math.round(depois.l-cai.l), Math.round(depois.t-cai.t)], [200,100]);

/* o botão X continua fechando */
await v.evaluate(()=>document.getElementById('vClose').click());
await v.waitForTimeout(200);
checa('o botão X continua fechando', await aberto(), false);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página (clientes)', err.length, 0);
if(err.length)err.slice(0,3).forEach(e=>console.log('     ! '+e));
checa('nenhum erro de página (painel)', errQ.length, 0);
if(errQ.length)errQ.slice(0,3).forEach(e=>console.log('     ! '+e));
checa('nenhum erro de página (visualizador)', errV.length, 0);
if(errV.length)errV.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.292: CEP sobrevive ao blur, o painel não foge da fonte, o visualizador fecha no fundo');
