/* ARQUIVAR EM ORGANIZADOS COM DATA ESCOLHIDA
   A data manda na PASTA e no NOME. O teste não confere pixels: confere
   que a escolha vira o carimbo DDMMAA que o resto do sistema usa. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:1000}});
const erros=[]; p.on('pageerror',e=>erros.push(String(e).slice(0,160)));
await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v282.html')).href);
await esperaPronto(p);

console.log('\n=== 1. O MODAL ABRE E MOSTRA O CAMINHO ===');
let r=await p.evaluate(async ()=>{
  const pr=perguntaDataArquivo();            /* não espera: só abrir */
  await new Promise(s=>setTimeout(s,200));
  const f=document.getElementById('ftArqFundo');
  const aberto=f.classList.contains('on');
  const caminho=document.getElementById('arqCaminho').textContent;
  const hojeMarcado=document.getElementById('arqOpHoje').classList.contains('on');
  const campoVisivel=getComputedStyle(document.getElementById('arqLinhaData')).display!=='none';
  document.getElementById('arqCancelar').click();
  const cancelou=await pr;
  return { aberto, caminho, hojeMarcado, campoVisivel, cancelou,
           fechou:!f.classList.contains('on') };
});
console.log('     '+r.caminho);
checa('abre com "hoje" marcado', [r.aberto,r.hojeMarcado], [true,true]);
checa('  o campo de data fica escondido no modo automático', r.campoVisivel, false);
checa('  o caminho já vem montado', /Organizados/.test(r.caminho)&&/\.ft/.test(r.caminho), true);
checa('cancelar devolve nada e fecha', [r.cancelou,r.fechou], [null,true]);

console.log('\n=== 2. DATA ESCOLHIDA VIRA O CARIMBO DDMMAA ===');
r=await p.evaluate(async ()=>{
  const pr=perguntaDataArquivo();
  await new Promise(s=>setTimeout(s,150));
  document.getElementById('arqOpManual').click();
  const campo=document.getElementById('arqCampoData');
  campo.value=''; 
  for(const c of '28072026'){ campo.value+=c; campo.dispatchEvent(new Event('input',{bubbles:true})); }
  await new Promise(s=>setTimeout(s,150));
  const caminho=document.getElementById('arqCaminho').textContent;
  document.getElementById('arqConfirmar').click();
  return { carimbo:await pr, caminho };
});
console.log('     '+r.caminho);
checa('28/07/2026 → 280726', r.carimbo, '280726');
checa('  o caminho mostra a pasta certa', /2026 - 07 - JULHO/.test(r.caminho)&&/DIA 28/.test(r.caminho), true);
checa('  e o nome termina com a data escolhida', /-280726\.ft/.test(r.caminho), true);

console.log('\n=== 3. A MÁSCARA E A VALIDAÇÃO ===');
r=await p.evaluate(async ()=>{
  const pr=perguntaDataArquivo();
  await new Promise(s=>setTimeout(s,150));
  document.getElementById('arqOpManual').click();
  const campo=document.getElementById('arqCampoData'), bt=document.getElementById('arqConfirmar');
  const põe=v=>{campo.value=''; for(const c of v){campo.value+=c;campo.dispatchEvent(new Event('input',{bubbles:true}));}};
  põe('3107202');                          /* incompleta */
  const incompleta={txt:campo.value, travado:bt.disabled};
  põe('31022026');                         /* 31 de fevereiro não existe */
  const impossivel={txt:campo.value, travado:bt.disabled};
  põe('01012099');                         /* futuro */
  const futuro={aviso:document.getElementById('arqNota').textContent,
                alerta:document.getElementById('arqNota').classList.contains('alerta'),
                travado:bt.disabled};
  document.getElementById('arqCancelar').click(); await pr;
  return { incompleta, impossivel, futuro };
});
console.log('     '+JSON.stringify(r));
checa('a máscara põe as barras sozinha', r.incompleta.txt, '31/07/202');
checa('  data incompleta trava o botão', r.incompleta.travado, true);
checa('31/02 não passa', r.impossivel.travado, true);
checa('data futura avisa mas NÃO trava', [r.futuro.alerta,r.futuro.travado], [true,false]);

console.log('\n=== 4. JÁ ARQUIVADO NÃO PERGUNTA DE NOVO ===');
r=await p.evaluate(async ()=>{
  defineDataArquivo('280726');
  const antes=dataArquivo();
  document.getElementById('opSalvarOrganizado').click();
  await new Promise(s=>setTimeout(s,400));
  const abriu=document.getElementById('ftArqFundo').classList.contains('on');
  defineDataArquivo('');
  return { antes, abriu };
});
checa('com data registrada, o modal não aparece', r.abriu, false);
checa('  e a data registrada é a que estava', r.antes, '280726');

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
if(erros.length)erros.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('ARQUIVAR: a data escolhida chega ao nome e à pasta');
