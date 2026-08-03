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
await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v287.html')).href);
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

console.log('\n=== 4. O CALENDÁRIO DO ÍCONE ===');
r=await p.evaluate(async ()=>{
  const pr=perguntaDataArquivo();
  await new Promise(s=>setTimeout(s,150));
  const campo=document.getElementById('arqCampoData');
  campo.value=''; for(const c of '15082026'){campo.value+=c;campo.dispatchEvent(new Event('input',{bubbles:true}));}
  const bt=document.getElementById('arqBtCal');
  const rb=bt.getBoundingClientRect();
  bt.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  bt.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  await new Promise(s=>setTimeout(s,200));
  const menu=document.getElementById('calMenu');
  const em=getComputedStyle(menu), rm=menu.getBoundingClientRect();
  const veu=getComputedStyle(document.getElementById('ftArqFundo')).zIndex;
  const aberto={ visivel:em.display==='block',
                 acimaDoVeu:+em.zIndex > +veu,
                 dentroDaTela:rm.left>=0&&rm.top>=0&&rm.right<=innerWidth&&rm.bottom<=innerHeight,
                 perto:Math.abs(rm.top-rb.bottom)<400,
                 mes:document.getElementById('calMes').textContent.trim(),
                 marcado:(menu.querySelector('.cal-dia.sel')||{}).textContent,
                 temLimpar:getComputedStyle(document.getElementById('calLimpar')).display!=='none',
                 manualLigou:document.getElementById('arqOpManual').classList.contains('on') };
  /* escolhe o dia 3 do mesmo mês */
  const dia=[...menu.querySelectorAll('.cal-dia:not(.fora)')].find(d=>d.textContent.trim()==='3');
  dia.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  await new Promise(s=>setTimeout(s,200));
  const depois={ campo:campo.value, fechou:getComputedStyle(menu).display==='none',
                 caminho:document.getElementById('arqCaminho').textContent,
                 modalAberto:document.getElementById('ftArqFundo').classList.contains('on') };
  document.getElementById('arqConfirmar').click();
  return { aberto, depois, carimbo:await pr };
});
console.log('     '+JSON.stringify(r.aberto)+'\n     '+r.depois.caminho);
checa('o ícone abre o calendário', r.aberto.visivel, true);
checa('  ele fica ACIMA do véu do modal', r.aberto.acimaDoVeu, true);
checa('  e dentro da tela, perto do ícone', [r.aberto.dentroDaTela,r.aberto.perto], [true,true]);
checa('  já abre no mês da data digitada', r.aberto.mes, 'agosto 2026');
checa('  com o dia 15 marcado', r.aberto.marcado, '15');
checa('  sem "Limpar" (a data aqui é obrigatória)', r.aberto.temLimpar, false);
checa('  e marca a opção manual sozinho', r.aberto.manualLigou, true);
checa('clicar num dia preenche o campo', r.depois.campo, '03/08/2026');
checa('  fecha o calendário e mantém o modal', [r.depois.fechou,r.depois.modalAberto], [true,true]);
checa('  o caminho acompanha', /DIA 03/.test(r.depois.caminho), true);
checa('  e o carimbo sai certo', r.carimbo, '030826');

console.log('\n=== 5. O CALENDÁRIO DO CABEÇALHO NÃO REGREDIU ===');
r=await p.evaluate(async ()=>{
  const campo=document.querySelector('[data-h="envio"]');
  campo.value=''; campo.dispatchEvent(new Event('input',{bubbles:true}));
  const ic=document.querySelector('.hd-cal');
  ic.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  await new Promise(s=>setTimeout(s,200));
  const menu=document.getElementById('calMenu');
  const abriu=getComputedStyle(menu).display==='block';
  const temLimpar=getComputedStyle(document.getElementById('calLimpar')).display!=='none';
  const semAcima=!menu.classList.contains('acima');
  const dia=[...menu.querySelectorAll('.cal-dia:not(.fora)')].find(d=>d.textContent.trim()==='9');
  dia.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  await new Promise(s=>setTimeout(s,150));
  return { abriu, temLimpar, semAcima, valor:campo.value,
           fechou:getComputedStyle(menu).display==='none' };
});
checa('o ícone do cabeçalho ainda abre', r.abriu, true);
checa('  com "Limpar" de volta', r.temLimpar, true);
checa('  e sem o z-index de modal', r.semAcima, true);
checa('escolher o dia 9 preenche o ENVIO', /^09\/\d{2}\/\d{4}$/.test(r.valor), true);
checa('  e fecha o calendário', r.fechou, true);

console.log('\n=== 6. MÁSCARA DE DATA: O CURSOR FICA ONDE ESTAVA ===');
/* Reescrever o value de um input joga o cursor para o fim. Apagar um
   dígito do DIA mandava o cursor para depois do ANO e não dava para
   corrigir só um pedaço. Vale nos DOIS campos de data do sistema. */
async function editaDigito(sel){
  await p.click(sel);
  await p.evaluate(s=>{const c=document.querySelector(s);c.value='';
    c.dispatchEvent(new Event('input',{bubbles:true}));},sel);
  await p.keyboard.type('15082026');
  const digitado=await p.evaluate(s=>document.querySelector(s).value,sel);
  /* cursor logo depois do "5" do DIA */
  await p.evaluate(s=>document.querySelector(s).setSelectionRange(2,2),sel);
  await p.keyboard.press('Backspace');
  const apagou=await p.evaluate(s=>document.querySelector(s).selectionStart,sel);
  await p.keyboard.type('7');
  const dia=await p.evaluate(s=>document.querySelector(s).value,sel);
  /* agora o MÊS: cursor depois do segundo dígito dele */
  await p.evaluate(s=>document.querySelector(s).setSelectionRange(5,5),sel);
  await p.keyboard.press('Backspace'); await p.keyboard.type('9');
  const mes=await p.evaluate(s=>document.querySelector(s).value,sel);
  /* e o ANO: cursor no fim */
  await p.evaluate(s=>{const c=document.querySelector(s);c.setSelectionRange(10,10);},sel);
  await p.keyboard.press('Backspace'); await p.keyboard.type('7');
  const ano=await p.evaluate(s=>document.querySelector(s).value,sel);
  /* Backspace em cima da BARRA apaga o dígito, não a barra */
  await p.evaluate(s=>document.querySelector(s).setSelectionRange(3,3),sel);
  await p.keyboard.press('Backspace');
  const naBarra=await p.evaluate(s=>document.querySelector(s).value,sel);
  return {digitado,apagou,dia,mes,ano,naBarra};
}

await p.evaluate(()=>{perguntaDataArquivo();
  setTimeout(()=>document.getElementById('arqOpManual').click(),100);});
await p.waitForTimeout(450);
r=await editaDigito('#arqCampoData');
console.log('     modal: '+JSON.stringify(r));
checa('modal: a máscara põe as barras', r.digitado, '15/08/2026');
checa('  apagar no DIA deixa o cursor no DIA', r.apagou, 1);
checa('  e o dígito novo entra ali mesmo', r.dia, '17/08/2026');
checa('  o mesmo vale para o MÊS', r.mes, '17/09/2026');
checa('  e para o ANO', r.ano, '17/09/2027');
/* estava 17/09/2027 com o cursor logo DEPOIS da barra: some o "7" do dia
   (o dígito antes da barra), não a barra */
checa('  Backspace na barra apaga o dígito, não a barra', r.naBarra.replace(/\D/g,''), '1092027');
await p.evaluate(()=>document.getElementById('arqCancelar').click());
await p.waitForTimeout(300);

r=await editaDigito('[data-h="envio"]');
console.log('     envio: '+JSON.stringify(r));
checa('ENVIO: ganhou a máscara (antes ficava 15082026)', r.digitado, '15/08/2026');
checa('  apagar no DIA deixa o cursor no DIA', r.apagou, 1);
checa('  e o dígito novo entra ali mesmo', r.dia, '17/08/2026');
checa('  o mesmo vale para o MÊS', r.mes, '17/09/2026');
checa('  e para o ANO', r.ano, '17/09/2027');
r=await p.evaluate(async ()=>{
  const c=document.querySelector('[data-h="envio"]');
  c.value=''; c.dispatchEvent(new Event('input',{bubbles:true}));
  c.focus();
  for(const ch of 'A COMBINAR'){ c.value+=ch; c.dispatchEvent(new Event('input',{bubbles:true})); }
  return c.value;
});
checa('  mas texto livre continua passando inteiro', r, 'A COMBINAR');

console.log('\n=== 7. JÁ ARQUIVADO NÃO PERGUNTA DE NOVO ===');
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
