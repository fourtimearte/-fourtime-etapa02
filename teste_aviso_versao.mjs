/* O AVISO DE VERSÃO NOVA não pode depender de estar logado na sincronização.
   O teste finge um servidor que responde /api/versao-publica e confere que
   o cartão acende — com a sincronização DESLIGADA, que é o caso de quem
   mais precisa do aviso. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:1000}});
const erros=[]; p.on('pageerror',e=>erros.push(String(e).slice(0,160)));
/* o servidor de mentira: só a rota da versão */
await p.route('**/api/versao-publica', route=>route.fulfill({
  status:200, contentType:'application/json', body:JSON.stringify({editor:'9.999', minimo:'0'})}));
await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v290.html')).href);
await esperaPronto(p);

console.log('\n=== 1. COM A SINCRONIZAÇÃO DESLIGADA, o aviso ainda chega ===');
let r=await p.evaluate(async ()=>{
  FT_SYNC.on=false; FT_SYNC.url=''; FT_SYNC.token='';
  document.getElementById('ftAvisoVersao').classList.remove('on');
  await ftVigiaVersao();
  await new Promise(s=>setTimeout(s,300));
  const cx=document.getElementById('ftAvisoVersao');
  return { aceso:cx.classList.contains('on'),
           texto:(document.getElementById('ftAvisoVersaoSub')||{}).textContent||'',
           minha:FT_EDITOR };
});
console.log('     '+JSON.stringify(r));
checa('o cartão de versão nova acendeu', r.aceso, true);
checa('  e diz qual é a minha e qual a publicada', /9\.999/.test(r.texto)&&r.texto.includes(r.minha), true);

console.log('\n=== 2. MESMA VERSÃO: o aviso NÃO aparece ===');
await p.route('**/api/versao-publica', route=>route.fulfill({
  status:200, contentType:'application/json', body:JSON.stringify({editor:'0.001'})}));
r=await p.evaluate(async ()=>{
  document.getElementById('ftAvisoVersao').classList.remove('on');
  await ftVigiaVersao();
  await new Promise(s=>setTimeout(s,300));
  return document.getElementById('ftAvisoVersao').classList.contains('on');
});
checa('versão publicada MENOR não acende nada', r, false);

console.log('\n=== 3. SEM SERVIDOR o editor não quebra ===');
await p.route('**/api/versao-publica', route=>route.abort());
r=await p.evaluate(async ()=>{ await ftVigiaVersao(); return 'sobreviveu'; });
checa('a vigia engole o erro', r, 'sobreviveu');

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
if(erros.length)erros.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('AVISO DE VERSÃO: chega mesmo sem sincronização');
