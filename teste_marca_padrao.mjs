/* A MARCA DE "ESTÁ NO ARQUIVO" (v3.298)

   Todo ajuste do painel é gravado no localStorage DESTA MÁQUINA. Passadas
   duas semanas não há como saber, olhando, se aquele azul é o do sistema —
   o que todo mundo vê — ou uma escolha que só existe neste navegador.

   A marca responde isso em cada campo, em TODAS as abas:
     ✓ verde     é o valor de fábrica, o que está escrito no arquivo
     ● vermelho  mudado aqui e ainda não publicado

   O que este teste cobra:
     1. toda linha de token tem marca — nenhuma sobra sem;
     2. num arquivo recém-aberto, TODAS são ✓;
     3. mexer vira ●, e VOLTAR AO VALOR DE FÁBRICA volta a ✓ (é o ponto
        delicado: quem compara "existe algo gravado?" em vez de comparar o
        VALOR marca pendência onde não há);
     4. o rodapé conta as pendências do painel INTEIRO, não da aba aberta;
     5. "Restaurar" devolve tudo para ✓.                                   */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v299.html';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1600,height:1050}});
const err=[]; p.on('pageerror',e=>err.push(String(e).slice(0,200)));
await p.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(p);
await p.evaluate(()=>localStorage.setItem('ft-cfg-cores','1'));
await p.reload(); await esperaPronto(p);
await p.evaluate(()=>document.body.dispatchEvent(new MouseEvent('contextmenu',
  {bubbles:true,ctrlKey:true,clientX:400,clientY:120})));
await p.waitForTimeout(400);
const vai=async n=>{ await p.evaluate(x=>document.querySelector(`.cc-nav-bt[data-painel="${x}"]`).click(),n);
  await p.waitForTimeout(250); };
const rodape=()=>p.evaluate(()=>document.getElementById('ccPendentes').textContent);

console.log('\n=== 1. TODO CAMPO DE TOKEN TEM MARCA, EM TODAS AS ABAS ===');
/* cores: 34 · impressão: 17 cores + 3 tamanhos · fontes: 4 tamanhos +
   fonte do documento + fonte da interface + estado (B/I) */
for(const [aba,quantos] of [['cores',34],['impressao',20],['fontes',7]]){
  await vai(aba);
  const r=await p.evaluate(n=>{
    const pn=document.querySelector(`.cc-painel[data-painel="${n}"]`);
    return { marcas:pn.querySelectorAll('.cc-marca').length,
             padrao:pn.querySelectorAll('.cc-marca.padrao').length,
             local:pn.querySelectorAll('.cc-marca.local').length,
             vazias:[...pn.querySelectorAll('.cc-marca')].filter(m=>!m.innerHTML.trim()).length };
  },aba);
  console.log('     '+aba+': '+JSON.stringify(r));
  checa(`aba ${aba}: uma marca por token`, r.marcas, quantos);
  checa(`  nenhuma marca vazia`, r.vazias, 0);
  checa(`  e todas dizem "está no arquivo"`, [r.padrao,r.local], [quantos,0]);
}
checa('o rodapé confirma', await rodape(), 'tudo igual ao arquivo');

console.log('\n=== 2. MEXER VIRA ●, VOLTAR AO PADRÃO VOLTA A ✓ ===');
await vai('cores');
const ciclo=await p.evaluate(async()=>{
  const i=document.querySelector('#ccLista input[data-var="--ft-borda"]');
  const cls=()=>i.closest('.cc-linha').querySelector('.cc-marca').className;
  const rod=()=>document.getElementById('ccPendentes').textContent;
  const out={inicio:cls()};
  i.value='#123456'; i.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,150));
  out.mexido=cls(); out.rodMexido=rod();
  /* volta EXATAMENTE ao valor de fábrica — a entrada continua gravada no
     localStorage, e é aí que uma checagem preguiçosa erraria */
  i.value='#d5d8e2'; i.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,150));
  out.voltou=cls(); out.rodVoltou=rod();
  /* e maiúscula/minúscula não pode contar como diferença */
  i.value='#D5D8E2'; i.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,150));
  out.caixaAlta=cls();
  return out;
});
console.log('     '+JSON.stringify(ciclo));
checa('começa como "no arquivo"', ciclo.inicio, 'cc-marca padrao');
checa('mexeu, vira "só nesta máquina"', ciclo.mexido, 'cc-marca local');
checa('  e o rodapé conta', ciclo.rodMexido, '1 ajuste só nesta máquina');
checa('voltou ao valor de fábrica, volta a ✓', ciclo.voltou, 'cc-marca padrao');
checa('  e o rodapé zera', ciclo.rodVoltou, 'tudo igual ao arquivo');
checa('#D5D8E2 e #d5d8e2 são a mesma cor', ciclo.caixaAlta, 'cc-marca padrao');

console.log('\n=== 3. O RODAPÉ CONTA O PAINEL INTEIRO, NÃO A ABA ===');
const total=await p.evaluate(async()=>{
  /* uma pendência em cada canto: cor de tela, cor de papel, tamanho de papel
     e tamanho do documento */
  const mexe=async(sel,val)=>{ const i=document.querySelector(sel);
    i.value=val; i.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(s=>setTimeout(s,120)); };
  await mexe('#ccLista input[data-var="--ft-preto"]','#ff0000');
  document.querySelector('.cc-nav-bt[data-painel="impressao"]').click();
  await new Promise(s=>setTimeout(s,200));
  await mexe('#ccListaImp input[data-var-imp="--pr-borda"]','#00ff00');
  await mexe('#ccListaImp input[data-tvar-imp="--pr-tam-selo"]','14');
  document.querySelector('.cc-nav-bt[data-painel="fontes"]').click();
  await new Promise(s=>setTimeout(s,200));
  await mexe('#ccTamLista input[data-tvar="--ft-tam-tabela"]','15');
  return { rodape:document.getElementById('ccPendentes').textContent,
           /* estando na aba Fontes, as marcas das outras abas seguem lá */
           abaAberta:'fontes',
           locaisNoTodo:document.querySelectorAll('.cc-painel .cc-marca.local').length };
});
console.log('     '+JSON.stringify(total));
checa('quatro pendências em três abas', total.rodape, '4 ajustes só nesta máquina');
checa('  e as quatro marcas continuam lá', total.locaisNoTodo, 4);

console.log('\n=== 4. RESTAURAR DEVOLVE TUDO PARA O ARQUIVO ===');
const dep=await p.evaluate(async()=>{
  document.getElementById('ccReset').click();
  await new Promise(s=>setTimeout(s,350));
  return { rodape:document.getElementById('ccPendentes').textContent,
           locais:document.querySelectorAll('.cc-painel .cc-marca.local').length };
});
console.log('     '+JSON.stringify(dep));
checa('o rodapé volta a zero', dep.rodape, 'tudo igual ao arquivo');
checa('  e nenhuma marca vermelha sobra', dep.locais, 0);

console.log('\n=== 5. A LEGENDA É GLOBAL, NÃO DE UMA ABA ===');
const leg=await p.evaluate(()=>{
  const l=document.querySelector('.cc-legenda');
  return { existe:!!l, dentroDeAba:!!(l&&l.closest('.cc-painel')),
           exemplos:l?l.querySelectorAll('.cc-marca').length:0 };
});
checa('a legenda existe', leg.existe, true);
checa('  fora das abas, como os botões do pé', leg.dentroDeAba, false);
checa('  e mostra os dois estados', leg.exemplos, 2);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', err.length, 0);
if(err.length)err.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('MARCA: cada token diz se está no arquivo ou só nesta máquina');
