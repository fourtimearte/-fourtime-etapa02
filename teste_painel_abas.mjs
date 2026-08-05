/* O PAINEL DEV EM ABAS + A MAQUETE DE IMPRESSÃO (v3.296)

   O que não pode regredir:
     1. quatro abas, UMA coluna, e só um assunto visível de cada vez;
     2. nenhum controle sumiu na reorganização — os ids continuam todos lá,
        cada um na aba certa (é o risco real de mexer em markup: um bloco
        cai fora de todos os painéis e ninguém percebe até precisar dele);
     3. "Copiar CSS" copia TUDO — as quatro abas — esteja qual estiver
        aberta. Foi o pedido explícito;
     4. a aba escolhida é lembrada entre aberturas;
     5. a maquete aparece SÓ na aba Impressão, nunca por cima do painel, e
        pinta com a paleta de papel mesmo com a lente desligada;
     6. mexer numa cor ou num tamanho muda a maquete NA HORA e não toca no
        documento de verdade.                                              */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v300.html';
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

const abre=async()=>{ await p.evaluate(()=>document.body.dispatchEvent(
  new MouseEvent('contextmenu',{bubbles:true,ctrlKey:true,clientX:360,clientY:140})));
  await p.waitForTimeout(400); };
const vai=async n=>{ await p.evaluate(x=>document.querySelector(`.cc-nav-bt[data-painel="${x}"]`).click(),n);
  await p.waitForTimeout(250); };
await abre();

console.log('\n=== 1. QUATRO ABAS, UMA COLUNA ===');
const nav=await p.evaluate(()=>({
  abas:[...document.querySelectorAll('.cc-nav-bt')].map(b=>b.dataset.painel),
  rotulos:[...document.querySelectorAll('.cc-nav-bt')].map(b=>b.textContent.trim()),
  paineis:[...document.querySelectorAll('.cc-painel')].map(x=>x.dataset.painel),
  larguraPainel:Math.round(document.getElementById('ctxCustom').getBoundingClientRect().width),
  colunasAntigas:document.querySelectorAll('.cc-cols').length
}));
console.log('     '+JSON.stringify(nav));
checa('as quatro abas na ordem pedida', nav.abas, ['escala','cores','impressao','fontes']);
checa('  com os rótulos certos', nav.rotulos, ['Escala','Cores','Impressão','Fontes']);
checa('  e um painel para cada', nav.paineis, ['escala','cores','impressao','fontes']);
checa('as duas colunas antigas sumiram', nav.colunasAntigas, 0);
checa('o painel cabe numa coluna só', nav.larguraPainel<=380, true);

console.log('\n=== 2. SÓ UM ASSUNTO VISÍVEL DE CADA VEZ ===');
for(const aba of ['escala','cores','impressao','fontes']){
  await vai(aba);
  const r=await p.evaluate(()=>({
    visiveis:[...document.querySelectorAll('.cc-painel')].filter(x=>!x.hidden).map(x=>x.dataset.painel),
    marcadas:[...document.querySelectorAll('.cc-nav-bt.ativa')].map(x=>x.dataset.painel)
  }));
  checa(`aba ${aba}: um painel visível`, [r.visiveis,r.marcadas], [[aba],[aba]]);
}

console.log('\n=== 3. NENHUM CONTROLE SE PERDEU NA MUDANÇA ===');
/* o risco real de reorganizar markup: um bloco cai fora de todos os
   painéis e ninguém nota até precisar dele */
const ONDE={
  escala:['ccEscFolha','ccEscMenu','ccEscReset','ccFaixas','ccFaixasCopiar','ccMoldura'],
  cores:['ccBusca','ccConta','ccLista','ccDica'],
  impressao:['ccVerImp','ccBuscaImp','ccContaImp','ccListaImp'],
  fontes:['ccFonte','ccFonteUi','ccTamLista','ccBold','ccItalic']
};
const achados=await p.evaluate(mapa=>{
  const fora=[], errado=[];
  Object.entries(mapa).forEach(([aba,ids])=>ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el){ fora.push(id+' (não existe)'); return; }
    const pai=el.closest('.cc-painel');
    if(!pai) fora.push(id+' (fora de qualquer aba)');
    else if(pai.dataset.painel!==aba) errado.push(id+' está em '+pai.dataset.painel+', devia estar em '+aba);
  }));
  /* e os globais NÃO podem estar dentro de aba nenhuma */
  const globais=['ccSaida','ccMsg','ccReset','ccCopiar']
    .filter(id=>{ const e=document.getElementById(id); return !e||e.closest('.cc-painel'); });
  const dupes=['ccMoldura','ccVerImp','ccBusca','ccFonte']
    .filter(id=>document.querySelectorAll('#'+id).length!==1);
  return {fora,errado,globais,dupes};
}, ONDE);
console.log('     '+JSON.stringify(achados));
checa('nenhum controle ficou fora das abas', achados.fora, []);
checa('  e cada um na aba certa', achados.errado, []);
checa('os botões do pé continuam globais', achados.globais, []);
checa('  e nenhum id ficou duplicado', achados.dupes, []);

console.log('\n=== 4. A ABA ESCOLHIDA É LEMBRADA ===');
await vai('fontes');
await p.evaluate(()=>{ document.getElementById('ctxCustom').style.display='none'; });
await abre();
checa('reabrir volta na última aba',
  await p.evaluate(()=>[...document.querySelectorAll('.cc-nav-bt.ativa')].map(x=>x.dataset.painel)), ['fontes']);
await p.reload(); await esperaPronto(p); await abre();
checa('  e sobrevive a recarregar a página',
  await p.evaluate(()=>[...document.querySelectorAll('.cc-nav-bt.ativa')].map(x=>x.dataset.painel)), ['fontes']);

console.log('\n=== 5. A MAQUETE: SÓ NA ABA IMPRESSÃO, E SEM TAPAR O PAINEL ===');
const maq=async()=>p.evaluate(()=>{
  const pv=document.getElementById('ccPrev'), pn=document.getElementById('ctxCustom');
  const r=pv.getBoundingClientRect(), q=pn.getBoundingClientRect();
  return { ligada:pv.classList.contains('on'),
           sobrepoe: r.left < q.right && r.right > q.left,
           dentroDaTela: r.left>=0 && r.right<=innerWidth+1 && r.top>=0 };
});
for(const aba of ['escala','cores','fontes']){
  await vai(aba);
  checa(`na aba ${aba} a maquete some`, (await maq()).ligada, false);
}
await vai('impressao');
const m=await maq();
console.log('     '+JSON.stringify(m));
checa('na aba Impressão ela aparece', m.ligada, true);
checa('  sem tapar o painel', m.sobrepoe, false);
checa('  e dentro da tela', m.dentroDaTela, true);

console.log('\n=== 6. A MAQUETE MOSTRA O PAPEL, COM A LENTE DESLIGADA ===');
const lidos=await p.evaluate(()=>{
  const g=s=>getComputedStyle(document.querySelector(s));
  return { lente:document.body.classList.contains('ver-impressao'),
           masc:g('.cc-prev-ref.masc').backgroundColor,
           fem:g('.cc-prev-ref.fem').backgroundColor,
           inf:g('.cc-prev-ref.inf').backgroundColor,
           selo:g('#ccPrev .lay-selo').backgroundColor,
           aviso:g('#ccPrev .warn-bar').backgroundColor,
           borda:g('.cc-prev-cab').backgroundColor,
           /* e o documento de verdade continua com a paleta de tela */
           doc:g('.folha-a4').getPropertyValue('--ft-genero-masc').trim() };
});
console.log('     '+JSON.stringify(lidos));
checa('a lente está desligada', lidos.lente, false);
checa('  e mesmo assim a maquete mostra o papel',
  [lidos.masc,lidos.fem,lidos.inf],
  ['rgb(108, 160, 228)','rgb(254, 144, 193)','rgb(104, 187, 176)']);
checa('  selo e aviso vermelhos', [lidos.selo,lidos.aviso], ['rgb(254, 57, 57)','rgb(240, 66, 69)']);
checa('  bordas escurecidas', lidos.borda, 'rgb(186, 186, 186)');
checa('  e o documento de verdade intocado', lidos.doc, '#d2e7fe');

console.log('\n=== 7. MEXER MUDA A MAQUETE NA HORA, E SÓ ELA ===');
const dep=await p.evaluate(async()=>{
  const c=document.querySelector('#ccListaImp input[data-var-imp="--pr-gen-fem"]');
  c.value='#00ff00'; c.dispatchEvent(new Event('input',{bubbles:true}));
  const t=document.querySelector('#ccListaImp input[data-tvar-imp="--pr-tam-selo"]');
  t.value='15'; t.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,250));
  const g=s=>getComputedStyle(document.querySelector(s));
  return { fem:g('.cc-prev-ref.fem').backgroundColor,
           seloTam:g('#ccPrev .lay-selo').fontSize,
           rotulo:t.parentElement.querySelector('.cc-tam-val').textContent,
           doc:g('.folha-a4').getPropertyValue('--ft-genero-fem').trim(),
           docSelo:g('.folha-a4 .lay-selo').fontSize };
});
console.log('     '+JSON.stringify(dep));
checa('a cor nova aparece na maquete', dep.fem, 'rgb(0, 255, 0)');
checa('o tamanho novo também', dep.seloTam, '15px');
checa('  e o rótulo do slider acompanha', dep.rotulo, '15px');
checa('o documento de verdade não mudou de cor', dep.doc, '#ffcce5');
checa('  nem de tamanho', dep.docSelo, '8.4px');

console.log('\n=== 8. COPIAR CSS COPIA TUDO, DE QUALQUER ABA ===');
/* é o pedido, e é o que mais fácil se quebra ao esconder blocos */
for(const aba of ['escala','cores','impressao','fontes']){
  await vai(aba);
  const css=await p.evaluate(async()=>{ document.getElementById('ccCopiar').click();
    await new Promise(s=>setTimeout(s,250)); return document.getElementById('ccSaida').value; });
  const tem=[/TEMA CLARO/.test(css), /TEMA ESCURO/.test(css), /--pr-gen-masc:/.test(css),
             /--pr-tam-selo: 15px/.test(css), /--ft-fonte:/.test(css),
             /--ft-tam-campos:/.test(css), /--ft-fonte-peso:/.test(css)];
  checa(`da aba ${aba} vem tudo`, tem, [true,true,true,true,true,true,true]);
}

console.log('\n=== 9. FECHAR O PAINEL FECHA A MAQUETE ===');
await vai('impressao');
/* clicar DENTRO da maquete não fecha nada: ela é parte do painel */
await p.evaluate(()=>{ const r=document.getElementById('ccPrev').getBoundingClientRect();
  document.getElementById('ccPrev').dispatchEvent(new MouseEvent('mousedown',
    {bubbles:true,clientX:r.left+10,clientY:r.top+10})); });
await p.waitForTimeout(200);
checa('clicar na maquete não fecha o painel',
  await p.evaluate(()=>document.getElementById('ctxCustom').style.display), 'block');
await p.evaluate(()=>document.querySelector('.ft-rail').dispatchEvent(
  new MouseEvent('mousedown',{bubbles:true})));
await p.waitForTimeout(250);
checa('clicar fora fecha o painel',
  await p.evaluate(()=>document.getElementById('ctxCustom').style.display), 'none');
checa('  e a maquete vai junto', (await maq()).ligada, false);

console.log('\n=== 10. NADA DISSO VAI PARA O ARQUIVO DO TRELLO ===');
const html=await p.evaluate(()=>gerarHTML());
checa('o painel não viaja', /id="ctxCustom"/.test(html), false);
checa('  e a maquete também não', /id="ccPrev"/.test(html), false);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', err.length, 0);
if(err.length)err.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('PAINEL v3.296: quatro abas, uma coluna, e a maquete mostrando o papel');
