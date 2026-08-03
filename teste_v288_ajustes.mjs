/* v3.277 — quatro pedidos:
   1) a barra de marca-texto aparece EM CIMA da seleção (não longe);
   2) o botão de copiar não sai na impressão;
   3) o separador entre layouts não existe: nem editor, nem papel, nem Trello;
   4) o quadrado da cor tem a medida e o alinhamento do botão "+" do tecido. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const browser=await abreNavegador();
const page=await browser.newPage({ viewport:{width:1400,height:900} });
const erros=[]; page.on('pageerror',e=>erros.push(String(e).slice(0,200)));
await page.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v288.html')).href);
await esperaPronto(page);
await page.evaluate(async ()=>{ const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click(); await new Promise(s=>setTimeout(s,1500)); });

console.log('\n=== 1. BARRA DE MARCA-TEXTO SOBRE A SELEÇÃO ===');
let r=await page.evaluate(async ()=>{
  const area=document.querySelector('.lay-area');
  if(!area.textContent.trim()){ area.textContent='Texto de teste para selecionar aqui.'; }
  const no=[...area.childNodes].find(n=>n.nodeType===3)||area.firstChild;
  const rg=document.createRange(); rg.setStart(no,0); rg.setEnd(no,Math.min(12,no.textContent.length));
  const sel=getSelection(); sel.removeAllRanges(); sel.addRange(rg);
  document.dispatchEvent(new Event('selectionchange'));
  await new Promise(s=>requestAnimationFrame(()=>requestAnimationFrame(s)));
  await new Promise(s=>setTimeout(s,120));
  const sb=document.getElementById('selbar');
  const b=sb.getBoundingClientRect(), t=rg.getBoundingClientRect();
  return { pai: sb.parentElement===document.body?'body':sb.parentElement.className,
    aberta: sb.classList.contains('open'),
    /* a barra fica ACIMA e centrada no trecho selecionado */
    acima: +(t.top-b.bottom).toFixed(0),
    desvioHorizontal: Math.abs(Math.round((b.left+b.width/2)-(t.left+t.width/2))),
    dentroDaTela: b.top>=0 && b.left>=0 && b.right<=innerWidth && b.bottom<=innerHeight };
});
checa('a barra mora no <body> (fora do zoom)', r.pai, 'body');
checa('  e está aberta', r.aberta, true);
checa('fica ACIMA do texto, com folga de 8px', r.acima, 8);
checa('centrada no trecho (desvio <= 2px)', r.desvioHorizontal<=2, true);
checa('  e inteira dentro da tela', r.dentroDaTela, true);

console.log('\n=== 2. IMPRESSÃO: copiar some, layout continua ===');
await page.emulateMedia({ media:'print' });
r=await page.evaluate(()=>{
  const v=el=>el?getComputedStyle(el).display:'(sem)';
  return { copiar:v(document.querySelector('.lay-btn')),
           excluir:v(document.querySelector('.lay-del')),
           maisTecido:v(document.querySelector('.tec-btn')),
           barraSel:v(document.getElementById('selbar')),
           separador:getComputedStyle(document.querySelectorAll('.lay-modulo')[1]||document.querySelector('.lay-modulo')).borderTopWidth };
});
checa('botão copiar escondido no papel', r.copiar, 'none');
checa('  excluir também (já era)', r.excluir, 'none');
checa('  e o + do tecido', r.maisTecido, 'none');
checa('separador some no papel', r.separador, '0px');
await page.emulateMedia({ media:'screen' });

console.log('\n=== 3. SEPARADOR: nem na tela, nem no Trello ===');
r=await page.evaluate(()=>{
  const mods=document.querySelectorAll('.lay-modulo');
  const html=gerarHTML([]);
  return { naTela:getComputedStyle(mods[1]||mods[0]).borderTopWidth,
           quantos:mods.length,
           noCssDoCelular: /\.lay-modulo\{[^}]*border-top:1px/.test(html),
           regraAntiga: /lay-modulo \+ \.lay-modulo\{border-top:1px/.test(html) };
});
checa('sem risco entre módulos na tela', r.naTela, '0px');
checa('  e o CSS do celular não traz borda', r.noCssDoCelular, false);
checa('  nem a regra antiga do editor', r.regraAntiga, false);

console.log('\n=== 4. QUADRADO DA COR = BOTÃO + DO TECIDO ===');
r=await page.evaluate(()=>{
  const mod=[...document.querySelectorAll('.lay-modulo')].find(m=>m.querySelector('.cor-sw')&&m.querySelector('.tec-btn'));
  const sw=mod.querySelector('.cor-sw'), bt=mod.querySelector('.tec-add')||mod.querySelector('.tec-btn');
  const a=sw.getBoundingClientRect(), b=bt.getBoundingClientRect();
  const cx=el=>el.closest('.ft-combo-caixa').getBoundingClientRect();
  const meio=el=>{const c=cx(el),e=el.getBoundingClientRect();return +((e.top+e.height/2)-(c.top+c.height/2)).toFixed(1);};
  const s=getComputedStyle(sw), t=getComputedStyle(bt);
  return { larg:[+a.width.toFixed(1),+b.width.toFixed(1)], alt:[+a.height.toFixed(1),+b.height.toFixed(1)],
    raio:[s.borderRadius,t.borderRadius],
    /* distância da borda direita da caixa: os dois têm de recuar igual */
    recuo:[+(cx(sw).right-a.right).toFixed(1), +(cx(bt).right-b.right).toFixed(1)],
    centro:[meio(sw),meio(bt)] };
});
checa('mesma largura', r.larg[0], r.larg[1]);
checa('mesma altura', r.alt[0], r.alt[1]);
checa('mesmo raio', r.raio[0], r.raio[1]);
checa('mesmo recuo da borda direita', r.recuo[0], r.recuo[1]);
checa('ambos centrados na caixa', r.centro, [0,0]);

console.log('\n=== 5. BORDA DA FILEIRA SINALIZADA SEGUE A TINTA ===');
r=await page.evaluate(async ()=>{
  const t=document.querySelector('.lay-modulo .lay-tabela-mini');
  const est=coletaEstado(); const L=est.layouts[0];
  L.tamanhos['10A']={q:'6',u:'79,90'};          /* infantil na grade adulta */
  aplicaEstado(est); await new Promise(s=>setTimeout(s,500));
  const t2=document.querySelector('.lay-modulo .lay-tabela-mini');
  const cruz=[...t2.querySelectorAll('tbody tr')].find(x=>x.className.includes('tam-infantil'));
  const normal=[...t2.querySelectorAll('tbody tr')].find(x=>!x.className);
  const g=td=>{const s=getComputedStyle(td);return {topo:s.borderTopColor,esq:s.borderLeftColor,base:s.boxShadow};};
  const inf={cruz:g(cruz.children[1]), normal:g(normal.children[1]),
             hCruz:+cruz.getBoundingClientRect().height.toFixed(2),
             hNormal:+normal.getBoundingClientRect().height.toFixed(2)};
  /* agora o espelho: grade infantil com tamanho adulto */
  const est2=coletaEstado(); const L2=est2.layouts[0];
  L2.grade='infantil'; L2.tamanhos['G']={q:'4',u:'50,00'};
  aplicaEstado(est2); await new Promise(s=>setTimeout(s,500));
  const t3=document.querySelector('.lay-modulo .lay-tabela-mini');
  const adu=[...t3.querySelectorAll('tbody tr')].find(x=>x.className.includes('tam-adulto'));
  const cab=document.querySelector('.folha-a4 .doc-header');
  return { inf, adu: adu?g(adu.children[1]):null,
           linhaDoDocumento: cab?getComputedStyle(cab).backgroundColor:null };
});
checa('infantil: borda de topo vermelha', r.inf.cruz.topo, 'rgb(244, 199, 201)');
checa('  divisórias internas também', r.inf.cruz.esq, 'rgb(244, 199, 201)');
checa('  e a base (sombra, não borda)', r.inf.cruz.base, 'rgb(244, 199, 201) 0px -1px 0px 0px inset');
/* a linha do documento agora é uma só: comparar com ELA, e não com um hex */
checa('fileira normal usa a linha do documento', r.inf.normal.topo, r.linhaDoDocumento);
checa('a linha NÃO fica mais alta', r.inf.hCruz, r.inf.hNormal);
checa('adulto: borda azul', r.adu && r.adu.topo, 'rgb(187, 211, 245)');
checa('  e a base azul', r.adu && r.adu.base, 'rgb(187, 211, 245) 0px -1px 0px 0px inset');

console.log('\n=== 6. PAGINAÇÃO: a última folha não se parte em duas ===');
r=await page.evaluate(async ()=>{
  /* 5 sorteios do KIT DE TESTE: o documento é aleatório, então a garantia
     tem de valer para vários. A regra da paginação é 2 layouts por folha;
     só a ÚLTIMA pode ter 1. Duas folhas seguidas com 1 layout cada é o
     sintoma de que a compressão desistiu cedo demais. */
  const casos=[];
  for(let i=0;i<5;i++){
    const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
    await new Promise(s=>setTimeout(s,2600));
    const d=[...document.querySelectorAll('.folha-a4')].map(f=>f.querySelectorAll('.lay-modulo').length);
    casos.push(d);
  }
  const ruins=casos.filter(d=>d.slice(0,-1).some(n=>n<2 && n>0));
  return { casos, ruins:ruins.length };
});
console.log('     distribuições: '+JSON.stringify(r.casos));
checa('nenhuma folha do meio com 1 layout só', r.ruins, 0);

console.log('\n=== 7. AJUSTES: colados ao rodapé, sem linha quando vazios ===');
r=await page.evaluate(()=>{
  const f=[...document.querySelectorAll('.folha-a4')].slice(-1)[0];
  const bl=f.querySelector('.obs-fin-bloco'), rod=f.querySelector('.doc-rodape');
  return { colado:+(rod.getBoundingClientRect().top-bl.getBoundingClientRect().bottom).toFixed(0),
           temAjustes:document.body.classList.contains('tem-ajustes'),
           bordaTela:getComputedStyle(bl,'::before').borderTopWidth };
});
checa('o bloco encosta no rodapé', r.colado, 0);
checa('  sem ajuste nenhum no documento', r.temAjustes, false);
checa('  e sem linha na tela', r.bordaTela, '0px');
await page.emulateMedia({ media:'print' });
r=await page.evaluate(()=>getComputedStyle(document.querySelector('.folha-a4:last-of-type .obs-fin-bloco'),'::before').borderTopWidth);
checa('nem no papel', r, '0px');
r=await page.evaluate(async ()=>{
  document.getElementById('finAdd').click();
  await new Promise(s=>setTimeout(s,600));
  const bl=document.querySelector('.folha-a4:last-of-type .obs-fin-bloco');
  return { comAjuste:document.body.classList.contains('tem-ajustes'),
           borda:getComputedStyle(bl,'::before').borderTopWidth };
});
checa('com um ajuste, a linha volta no papel', [r.comAjuste,r.borda], [true,'1px']);
await page.emulateMedia({ media:'screen' });
r=await page.evaluate(()=>{
  const f=[...document.querySelectorAll('.folha-a4')].slice(-1)[0];
  const bl=f.querySelector('.obs-fin-bloco'), ln=f.querySelector('.doc-rodape-linha');
  const a=getComputedStyle(bl,'::before'), c=getComputedStyle(ln), rod=getComputedStyle(f.querySelector('.doc-rodape'));
  const w=el=>+el.getBoundingClientRect().width.toFixed(1);
  return { cor:[a.borderTopColor,c.borderTopColor], esp:[a.borderTopWidth,c.borderTopWidth],
           abaixo:[getComputedStyle(bl).paddingTop,c.marginBottom], larg:[w(bl),w(ln)] };
});
checa('a linha do ajuste e a do rodapé têm a mesma cor', r.cor[0], r.cor[1]);
checa('  a mesma espessura', r.esp[0], r.esp[1]);
checa('  o mesmo respiro abaixo', r.abaixo[0], r.abaixo[1]);
checa('  e a mesma largura', r.larg[0], r.larg[1]);

console.log('\n=== 8. CABEÇALHO DAS PÁGINAS 2+ ===');
r=await page.evaluate(()=>{
  const fs=[...document.querySelectorAll('.folha-a4')];
  const f1=fs[0], f2=fs[1];
  const cab=f2.querySelector('.folha-topo');
  if(!cab)return {erro:'sem cabeçalho na página 2'};
  const cols=getComputedStyle(cab).gridTemplateColumns.split(' ');
  const av=cab.querySelector('.warn-bar');
  const lh=parseFloat(getComputedStyle(av).lineHeight)||1;
  const logo=cab.querySelector('.logo-box');
  return { colunas:cols.length,
    /* 1 de 4 para a logo, as outras 3 combinadas: a proporção é o que
       importa, e não o número em px — a página 1 tem gaps de 1px entre as
       colunas e este cabeçalho não tem nenhum. */
    proporcao:+(parseFloat(cols[1])/parseFloat(cols[0])).toFixed(2),
    fileiras:+(cab.getBoundingClientRect().height/ (f1.querySelector('.hd-campo').getBoundingClientRect().height)).toFixed(1),
    linhasDoAviso:Math.round(av.querySelector('.warn-com').getBoundingClientRect().height/lh),
    logoAEsquerda:getComputedStyle(logo).justifyContent,
    pecasSoltas:f2.querySelectorAll(':scope > .folha-logo, :scope > .warn-clone').length,
    /* o comportamento com/sem valores continua valendo */
    avisoTemOsDois:!!av.querySelector('.warn-com') && !!av.querySelector('.warn-sem') };
});
checa('duas colunas', r.colunas, 2);
checa('  a 2ª vale exatamente pelas outras três', r.proporcao, 3);
checa('duas fileiras 20% mais baixas', r.fileiras, 1.6);
checa('logo encostada à esquerda', r.logoAEsquerda, 'flex-start');
checa('sem as peças soltas antigas', r.pecasSoltas, 0);
checa('o aviso mantém os dois recados', r.avisoTemOsDois, true);

console.log('\n=== 9. COM / SEM VALORES não derruba o cabeçalho ===');
r=await page.evaluate(async ()=>{
  const ler=()=>{
    const fs=[...document.querySelectorAll('.folha-a4')];
    const vis=el=>el&&getComputedStyle(el).display!=='none';
    const c=fs[1]&&fs[1].querySelector('.folha-topo .warn-bar');
    return { cabecalhos:fs.slice(1).every(f=>!!f.querySelector('.folha-topo')),
             quantos:fs.slice(1).length,
             msg:c?(vis(c.querySelector('.warn-com'))?'com':(vis(c.querySelector('.warn-sem'))?'sem':'nenhuma')):'(sem cabeçalho)' };
  };
  const antes=ler();
  document.getElementById('miDinheiro').click();
  await new Promise(s=>setTimeout(s,1400));
  const depois=ler();
  document.getElementById('miDinheiro').click();     /* devolve o modo original */
  await new Promise(s=>setTimeout(s,1400));
  const voltou=ler();
  return { antes, depois, voltou };
});
checa('cabeçalho presente em todas as páginas 2+', r.antes.cabecalhos, true);
checa('  continua depois de ocultar os valores', r.depois.cabecalhos, true);
checa('  e depois de mostrar de novo', r.voltou.cabecalhos, true);
checa('a mensagem do aviso troca junto', [r.antes.msg,r.depois.msg,r.voltou.msg], ['com','sem','com']);

console.log('\n=== 10. RODAPÉ EM TODAS AS PÁGINAS, NOS DOIS MODOS ===');
for(const modo of ['com','sem']){
  if(modo==='sem'){ await page.evaluate(async ()=>{ document.getElementById('miDinheiro').click();
    await new Promise(s=>setTimeout(s,1400)); }); }
  for(const media of ['screen','print']){
    await page.emulateMedia({ media });
    r=await page.evaluate(()=>{
      const fs=[...document.querySelectorAll('.folha-a4')];
      const ult=fs[fs.length-1], rod=ult.querySelector('.doc-rodape');
      const fr=ult.getBoundingClientRect(), rr=rod.getBoundingClientRect();
      const pad=parseFloat(getComputedStyle(ult).paddingBottom)||0;
      return { porFolha:fs.map(f=>f.querySelectorAll('.doc-rodape').length),
               folga:+((fr.bottom-pad)-rr.bottom).toFixed(0) };
    });
    checa(`${modo} valores · ${media}: um rodapé por página`,
          r.porFolha.every(n=>n===1), true);
    checa(`   e o da última colado no pé`, r.folga<=2, true);
  }
}
await page.evaluate(async ()=>{ document.getElementById('miDinheiro').click(); await new Promise(s=>setTimeout(s,1400)); });
await page.emulateMedia({ media:'screen' });

console.log('\n=== 11. CASO EXTREMO: nenhuma folha termina estourada ===');
r=await page.evaluate(async ()=>{
  /* Dois layouts de ficha pesada na mesma folha: 3 tecidos num, 2 no outro,
     grade cheia, cinco tags de design e observação comprida. Medido: nem com
     a tabela no último nível e a imagem no piso de 90px isso cabe — o certo
     é abrir folha. O teste cobra o RESULTADO: nada estourado, nada invadindo. */
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1600"><rect width="100%" height="100%" fill="#2b6"/></svg>';
  const img='data:image/svg+xml;base64,'+btoa(svg);
  const est=coletaEstado();
  const T=['PP','P','M','G','GG','XG','G1','G2','G3','G4'];
  [2,3].forEach((i,k)=>{
    const L=est.layouts[i]; if(!L)return;
    L.img=img;
    L.tecidos=k===0?['DRYFIT POLIESTER 100% COM PROTECAO UV50','ALGODAO STRONG PENTEADO 30.1','PIQUET COM ELASTANO E ACABAMENTO']
                   :['DRYFIT POLIESTER 100% COM PROTECAO UV50','ALGODAO STRONG PENTEADO 30.1'];
    L.design=[{tag:'DTF',cores:['001','015','021','033','046']},{tag:'Subli',cores:['S14','S21','S64']},
              {tag:'Silk',cores:[]},{tag:'Patch',cores:[]},{tag:'Bordado',cores:[]}];
    L.tamanhos={}; T.forEach(t=>L.tamanhos[t]={q:'10',u:'99,00'});
    L.obs='Observação longa de teste para o caso extremo, com bastante texto para ocupar quatro ou cinco linhas na ficha do layout e apertar a folha ao máximo possível.';
  });
  aplicaEstado(est);
  await new Promise(s=>setTimeout(s,5200));
  const fs=[...document.querySelectorAll('.folha-a4')];
  const sobre=[];
  fs.forEach(f=>{ const m=[...f.querySelectorAll('.lay-modulo')];
    for(let i=1;i<m.length;i++) sobre.push(m[i-1].getBoundingClientRect().bottom-m[i].getBoundingClientRect().top); });
  const inv=fs.map(f=>{ const m=[...f.querySelectorAll('.lay-modulo')], rod=f.querySelector('.doc-rodape');
    if(!m.length||!rod)return -99;
    return m[m.length-1].getBoundingClientRect().bottom-rod.getBoundingClientRect().top; });
  return { estouro:fs.map(f=>+excedeFolha(f).toFixed(1)),
           maiorSobreposicao:+Math.max(...(sobre.length?sobre:[-99])).toFixed(1),
           maiorInvasao:+Math.max(...inv).toFixed(1) };
});
console.log('     estouro por folha: '+JSON.stringify(r.estouro));
checa('nenhuma folha passa do A4', r.estouro.every(v=>v<=0.5), true);
checa('nenhum layout entra no de cima', r.maiorSobreposicao<=0.5, true);
checa('nenhum layout invade o rodapé', r.maiorInvasao<=0.5, true);

console.log('\n=== 12. A TABELA NÃO FICA MAIS COMPRIMIDA DO QUE PRECISA ===');
{
  const olha=async()=>page.evaluate(()=>{
    const out=[];
    document.querySelectorAll('.folha-a4').forEach((f,i)=>{
      const tabs=[...f.querySelectorAll('.lay-tabela-mini')];
      if(!tabs.length)return;
      const nv=Math.max(0,...tabs.map(t=>+(t.dataset.nivel||0)));
      let seSubisse=null;
      /* se dá para soltar UM nível e a folha continuar cabendo, então ela
         estava comprimida à toa — é o defeito relatado */
      if(nv>0){ aplicaNivel(tabs,nv-1); seSubisse=+excedeFolha(f).toFixed(1); aplicaNivel(tabs,nv); }
      out.push({folha:i+1,nivel:nv,seSubisse});
    });
    return { modo:document.body.classList.contains('sem-dinheiro')?'sem':'com', folhas:out };
  });
  for(const passo of ['agora','trocando','voltando']){
    if(passo!=='agora') await page.evaluate(async ()=>{ document.getElementById('miDinheiro').click();
      await new Promise(s=>setTimeout(s,2800)); });
    const x=await olha();
    const aToa=x.folhas.filter(o=>o.nivel>0 && o.seSubisse!==null && o.seSubisse<=0.5);
    console.log('     '+x.modo+' → '+JSON.stringify(x.folhas));
    checa(`modo ${x.modo} (${passo}): nenhuma tabela comprimida à toa`, aToa.length, 0);
  }
}

console.log('\n=== 13. AVISO 2+, PROFUNDIDADE E PAPEL ===');
r=await page.evaluate(()=>{
  const cab=document.querySelector('.folha-topo .warn-bar');
  const s=cab?getComputedStyle(cab):null;
  const alvo=cab?cab.querySelector('.warn-com'):null;
  const lh=s?parseFloat(s.lineHeight):1;
  return { bordaEsq:s?s.borderLeftWidth:null, bordaBaixo:s?s.borderBottomWidth:null,
           corDeBaixo:s?s.borderBottomColor:null,
           linhas:alvo?Math.round(alvo.getBoundingClientRect().height/lh):null,
           centrado:s?s.alignItems:null,
           sombraFolha:getComputedStyle(document.querySelector('.folha-a4')).boxShadow,
           sombraSubmenu:getComputedStyle(document.querySelector('.ft-menu')).boxShadow };
});
checa('aviso sem borda à esquerda', r.bordaEsq, '0px');
checa('  só o traço de baixo, em vermelho', [r.bordaBaixo!=='0px', r.corDeBaixo], [true,'rgb(198, 22, 27)']);
checa('  texto em UMA linha', r.linhas, 1);
checa('  centrado verticalmente', r.centrado, 'center');
checa('folha com o 2º nível do kit', /0px 2px 6px/.test(r.sombraFolha), true);
checa('submenu com o mesmo nível', /0px 2px 6px/.test(r.sombraSubmenu), true);

await page.emulateMedia({ media:'print' });
r=await page.evaluate(()=>{
  const mod=[...document.querySelectorAll('.lay-modulo')].find(m=>m.querySelector('.design-tag'));
  const tag=mod.querySelector('.design-tag'), s=getComputedStyle(tag);
  const desloc=el=>{const c=el.closest('.ft-combo-caixa');
    const a=el.getBoundingClientRect(),b=c.getBoundingClientRect();
    return +(((a.top+a.height/2)-(b.top+b.height/2))).toFixed(1);};
  return { esq:s.paddingLeft, dir:s.paddingRight, gap:s.gap,
           ref:desloc(mod.querySelector('.combo-ref textarea')),
           tecido:desloc(mod.querySelector('.combo-tecido textarea')),
           rotulo:desloc(mod.querySelector('.combo-tecido .ft-combo-rotulo')) };
});
checa('papel: pílula com recheio igual dos dois lados', r.esq, r.dir);
checa('  e sem o vão do "x" que não é impresso', r.gap, '0px');
checa('papel: referência centrada na caixa', r.ref, 0);
checa('  tecido também', [r.tecido,r.rotulo], [0,0]);
await page.emulateMedia({ media:'screen' });

console.log('\n=== 14. NEGRITO NO SELO E NA REFERÊNCIA ===');
for(const media of ['screen','print']){
  await page.emulateMedia({ media });
  r=await page.evaluate(()=>{
    const m=document.querySelector('.lay-modulo');
    const w=el=>el?getComputedStyle(el).fontWeight:null;
    const t=m.querySelector('.combo-ref textarea');
    /* nome de tamanho REAL, e não o que o sorteio do kit trouxe: um nome
       muito comprido não cabe nem em peso normal, e aí o teste mediria o
       sorteio, não o negrito */
    const antes=t.value;
    t.value='FT-020-001M — RAGLAN MASC COM PUNHO';
    const cabe=t.scrollWidth<=t.clientWidth+1;
    t.value=antes;
    return { selo:w(m.querySelector('.lay-selo')), ref:w(t),
             tecido:w(m.querySelector('.combo-tecido textarea')),
             rotulo:w(m.querySelector('.combo-tecido .ft-combo-rotulo')),
             cabe };
  });
  checa(`${media}: selo L-NN em negrito`, r.selo, '700');
  checa(`   referência em negrito`, r.ref, '700');
  checa(`   e só elas — tecido segue normal`, [r.tecido,r.rotulo], ['400','600']);
  checa(`   um nome de tamanho normal cabe em negrito`, r.cabe, true);
}
await page.emulateMedia({ media:'screen' });

console.log('\n=== 15. UMA COR DE BORDA NO DOCUMENTO · LOGO NO PAPEL ===');
for(const tema of ['claro','escuro']){
  for(const media of ['screen','print']){
    await page.emulateMedia({ media });
    r=await page.evaluate(async (tema)=>{
      document.body.dataset.tema=tema; if(window.aplicaLogos)aplicaLogos();
      await new Promise(s=>setTimeout(s,400));
      const f=document.querySelector('.folha-a4');
      /* toda linha CINZA do documento tem de ser a mesma. Vermelho, tinta de
         gênero e o selo são sinal, não estrutura: ficam de fora. */
      const sinal=new Set(['rgb(198, 22, 27)']);
      const cinzas={};
      const conta=(cor,quem)=>{ if(!cor||cor==='rgba(0, 0, 0, 0)'||sinal.has(cor))return;
        (cinzas[cor]=cinzas[cor]||new Set()).add(quem); };
      f.querySelectorAll('*').forEach(el=>{
        if(el.closest('.lay-selo')||el.closest('.dtf-chip')||el.closest('.design-grupo'))return;
        if(el.closest('.ft-combo[data-genero]'))return;      /* tinta de gênero */
        const s=getComputedStyle(el);
        const nome=el.tagName.toLowerCase()+'.'+((el.className&&el.className.split)?el.className.split(' ')[0]:'');
        ['borderTop','borderRight','borderBottom','borderLeft'].forEach(l=>{
          if(parseFloat(s[l+'Width'])>0 && s[l+'Style']!=='none') conta(s[l+'Color'],nome);
        });
      });
      const cab=f.querySelector('.doc-header');
      if(cab)conta(getComputedStyle(cab).backgroundColor,'grade do cabeçalho');
      const tab=f.querySelector('.lay-tabela-mini td.num');
      const img=f.querySelector('.lay-img');
      const logos=[...f.querySelectorAll('.logo-box,.folha-logo')].map(cx=>{
        const v=[...cx.querySelectorAll('img')].filter(i=>getComputedStyle(i).display!=='none');
        return v.map(i=>i.classList.contains('logo-papel')?'papel':'tema').join('+');
      });
      return { quantasCores:Object.keys(cinzas).length, cores:Object.keys(cinzas),
               tabela:tab?getComputedStyle(tab).borderTopColor:null,
               imagem:img?getComputedStyle(img).borderTopColor:null,
               cabecalho:cab?getComputedStyle(cab).backgroundColor:null, logos };
    }, tema);
    checa(`${tema}/${media}: uma única cor de linha no documento`, r.quantasCores, 1);
    checa(`   tabela = cabeçalho = caixa de imagem`, [r.tabela,r.imagem], [r.cabecalho,r.cabecalho]);
    checa(`   logo: ${media==='print'?'a de papel':'a do tema'}`,
          r.logos.every(v=>v===(media==='print'?'papel':'tema')), true);
  }
}
await page.emulateMedia({ media:'screen' });
await page.evaluate(()=>{ document.body.dataset.tema='claro'; if(window.aplicaLogos)aplicaLogos(); });
r=await page.evaluate(async ()=>{
  document.body.dataset.tema='escuro'; if(window.aplicaLogos)aplicaLogos();
  await new Promise(s=>setTimeout(s,300));
  /* getComputedStyle devolve um objeto VIVO: guardar `c` e ler depois de
     trocar o tema devolvia a cor do tema novo. A string tem de ser copiada
     na hora. */
  const escuro=getComputedStyle(document.querySelector('.lay-selo')).borderTopColor;
  document.body.dataset.tema='claro'; if(window.aplicaLogos)aplicaLogos();
  await new Promise(s=>setTimeout(s,300));
  const claro=getComputedStyle(document.querySelector('.lay-selo')).borderTopColor;
  return { escuro, claro };
});
checa('o selo tem borda própria no escuro', r.escuro!==r.claro, true);
console.log('     selo: claro='+r.claro+'  escuro='+r.escuro);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
if(erros.length)erros.slice(0,4).forEach(e=>console.log('     ! '+e));
await browser.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.277: SELBAR NO LUGAR · COPIAR FORA DO PAPEL · SEM SEPARADOR · SWATCH = BOTÃO + · BORDA SEGUE A TINTA');
