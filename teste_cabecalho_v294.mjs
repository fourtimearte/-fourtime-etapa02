/* A GRADE DO CABEÇALHO — POSIÇÃO DE CADA CAMPO (v3.293)

   O cabeçalho é uma grade de 4 colunas por 3 fileiras com posicionamento
   AUTOMÁTICO: só a logo tem lugar fixo, todo o resto cai pela ordem do HTML.
   Isso é prático (mexer na ordem move o campo) e perigoso pela mesma razão:
   inserir um campo no meio EMPURRA todos os seguintes, e ninguém percebe até
   alguém imprimir.

   A partir da v3.293 o STATUS fica embaixo da logo e o TOTAL fecha a quarta
   coluna — era o contrário. Este teste trava as doze posições.

       [LOGO ] | CLIENTE    | CPF/CNPJ     | PEDIDO Nº | ENVIO
       [LOGO ] | VENDEDOR   | DEPARTAMENTO | ENTREGA
       STATUS  | EMBALAGEM  | PAGAMENTO    | TOTAL

   Na v3.294 a célula do STATUS perdeu o rótulo E o placeholder — a palavra
   aparecia duas vezes na mesma célula — e o "+" passou a ser visualmente o
   MESMO botão do "+" do tecido. Aqui isso é medido, não conferido de olho. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || 'fourtime-editor-v294.html';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:1000}});
const err=[]; p.on('pageerror',e=>err.push(String(e).slice(0,200)));
await p.goto(pathToFileURL(DIR+ARQ).href);
await esperaPronto(p);

console.log('\n=== 1. CADA CAMPO NA SUA CÉLULA ===');
/* a posição é MEDIDA na tela, não lida do HTML: é o desenho que importa */
const grade=await p.evaluate(()=>{
  const h=document.querySelector('.doc-header');
  const hr=h.getBoundingClientRect();
  const nCols=getComputedStyle(h).gridTemplateColumns.split(' ').length;
  const larg=hr.width/nCols;
  const topos=[];
  const itens=[...h.children].filter(c=>!c.classList.contains('hd-oculto')).map(c=>{
    const r=c.getBoundingClientRect();
    const t=Math.round(r.top-hr.top);
    if(!topos.some(x=>Math.abs(x-t)<4))topos.push(t);
    /* o STATUS não tem mais rótulo (v3.294): quem não tem .hd-label é
       identificado pela classe da célula */
    const rot=(c.querySelector('.hd-label')||{}).textContent
      || (c.classList.contains('hd-obs')?'Status':'LOGO');
    return {rot,
            col:Math.round((r.left-hr.left)/larg)+1, topoPx:t,
            altura:Math.round(r.height)};
  });
  topos.sort((a,b)=>a-b);
  itens.forEach(i=>{ i.fila=topos.findIndex(t=>Math.abs(t-i.topoPx)<4)+1; });
  return {nCols, filas:topos.length, itens};
});
console.log('     '+JSON.stringify(grade.itens.map(i=>i.rot+'@'+i.fila+','+i.col)));
checa('a grade tem 4 colunas', grade.nCols, 4);
checa('  e 3 fileiras', grade.filas, 3);

const onde=r=>{ const i=grade.itens.find(x=>x.rot===r); return i?[i.fila,i.col]:null; };
checa('LOGO na coluna 1, fileiras 1 e 2', [onde('LOGO'),grade.itens.find(x=>x.rot==='LOGO').altura>60], [[1,1],true]);
checa('Cliente      fileira 1, coluna 2', onde('Cliente'),      [1,2]);
checa('CPF/CNPJ     fileira 1, coluna 3', onde('CPF/CNPJ'),     [1,3]);
checa('Pedido Nº    fileira 1, coluna 4', onde('Pedido Nº'),    [1,4]);
checa('Vendedor     fileira 2, coluna 2', onde('Vendedor'),     [2,2]);
checa('Departamento fileira 2, coluna 3', onde('Departamento'), [2,3]);
checa('Entrega      fileira 2, coluna 4', onde('Entrega'),      [2,4]);
checa('STATUS embaixo da logo (3,1)',     onde('Status'),       [3,1]);
checa('Embalagem    fileira 3, coluna 2', onde('Embalagem'),    [3,2]);
checa('Pagamento    fileira 3, coluna 3', onde('Pagamento'),    [3,3]);
checa('TOTAL na quarta coluna (3,4)',     onde('Total'),        [3,4]);

console.log('\n=== 2. AS TRÊS FILEIRAS TÊM A MESMA ALTURA ===');
/* a quebra de página do orçamento é uma conta fixa: se o cabeçalho passar a
   depender do conteúdo, a última folha estoura sem aviso */
const alturas=await p.evaluate(()=>{
  const h=document.querySelector('.doc-header');
  const a=[...h.children].filter(c=>!c.classList.contains('hd-oculto')
                                  &&!c.classList.contains('logo-box'))
    .map(c=>Math.round(c.getBoundingClientRect().height));
  return {min:Math.min(...a), max:Math.max(...a), cab:Math.round(h.getBoundingClientRect().height)};
});
console.log('     '+JSON.stringify(alturas));
checa('todas as células com a mesma altura', alturas.max-alturas.min<=1, true);

console.log('\n=== 3. O TOTAL CONTINUA VIVO NA NOVA CASA ===');
const tot=await p.evaluate(async()=>{
  const mi=document.getElementById('miKitTeste'); mi.hidden=false; mi.style.display=''; mi.click();
  for(let i=0;i<120;i++){ if(document.querySelectorAll('.lay-area').length>2)break;
    await new Promise(s=>setTimeout(s,100)); }
  await new Promise(s=>setTimeout(s,700));
  const cel=document.querySelector('.hd-totais');
  const r=cel.getBoundingClientRect(), hr=document.querySelector('.doc-header').getBoundingClientRect();
  const val=document.getElementById('hdTotValor');
  const vr=val.getBoundingClientRect();
  return { pecas:document.getElementById('hdTotPecas').textContent,
           valor:val.textContent,
           /* o valor não pode vazar da célula: ele é o que estava sumindo antes */
           cabeNaCelula: vr.right<=r.right+1 && vr.left>=r.left-1,
           /* e a célula é mesmo a última da grade */
           ultimaDaGrade: Math.abs(r.right-hr.right)<2 };
});
console.log('     '+JSON.stringify(tot));
checa('o total conta peças', /^[0-9]+$/.test(tot.pecas)&&tot.pecas!=='0', true);
checa('  e mostra o valor em reais', /^R\$/.test(tot.valor), true);
checa('  o valor não vaza da célula', tot.cabeNaCelula, true);
checa('  e a célula fecha a grade à direita', tot.ultimaDaGrade, true);

console.log('\n=== 4. O STATUS CONTINUA ACEITANDO TAGS ===');
const st=await p.evaluate(async()=>{
  const add=document.querySelector('.hd-tags-add');
  const cel=document.querySelector('.hd-obs');
  const r=cel.getBoundingClientRect(), hr=document.querySelector('.doc-header').getBoundingClientRect();
  const ar=add.getBoundingClientRect();
  return { temBotao:!!add,
           botaoDentro: ar.right<=r.right+1 && ar.top>=r.top-1,
           /* embaixo da logo: mesma borda esquerda que ela */
           alinhadoComALogo: Math.abs(r.left-hr.left)<2,
           campoVivo: !!document.querySelector('.hd-tags-wrap[data-h="obs"]') };
});
console.log('     '+JSON.stringify(st));
checa('o botão de adicionar tag continua lá', st.temBotao, true);
checa('  e dentro da célula', st.botaoDentro, true);
checa('  a célula encosta na borda esquerda, como a logo', st.alinhadoComALogo, true);
checa('  e o campo data-h="obs" do formato .ft segue vivo', st.campoVivo, true);

console.log('\n=== 5. NO ARQUIVO EXPORTADO A GRADE VIAJA IGUAL ===');
const html=await p.evaluate(()=>gerarHTML());
const ordem=[...html.matchAll(/class="hd-campo[^"]*"><span class="hd-label">([^<]+)</g)].map(m=>m[1]);
console.log('     '+JSON.stringify(ordem));
/* o Status sumiu desta lista de propósito: ele não tem mais rótulo */
checa('a ordem dos rótulos no arquivo é a da tela',
  ordem, ['Cliente','CPF/CNPJ','Vendedor','Departamento','Entrega','Embalagem','Pagamento','Total']);
checa('  e a célula do status viaja sem rótulo',
  /class="hd-campo hd-obs">\s*<div class="hd-tags-caixa"/.test(html), true);

console.log('\n=== 6. O STATUS SÓ TEM O "+", E ELE É O "+" DO TECIDO ===');
const mais=await p.evaluate(()=>{
  const le=el=>{ const c=getComputedStyle(el), r=el.getBoundingClientRect();
    const s=el.querySelector('svg'), sr=s?s.getBoundingClientRect():null;
    return [+r.width.toFixed(1),+r.height.toFixed(1),c.backgroundColor,
            c.borderTopWidth+' '+c.borderTopStyle+' '+c.borderTopColor,
            c.borderRadius,c.color,sr?+sr.width.toFixed(1):null]; };
  const cel=document.querySelector('.hd-obs');
  return { texto:(cel.textContent||'').trim(),
           temLabel:!!cel.querySelector('.hd-label'),
           temPh:!!cel.querySelector('.hd-tags-ph'),
           tecido:le(document.querySelector('.tec-btn.tec-add')),
           status:le(document.querySelector('.hd-tags-add')) };
});
console.log('     tecido='+JSON.stringify(mais.tecido));
console.log('     status='+JSON.stringify(mais.status));
checa('a célula do status não escreve nada', mais.texto, '');
checa('  não tem rótulo', mais.temLabel, false);
checa('  nem placeholder', mais.temPh, false);
/* tamanho, fundo, borda, raio, cor e ícone: sete medidas, uma comparação */
checa('o "+" do status é idêntico ao do tecido', mais.status, mais.tecido);

console.log('\n=== 7. COM TAGS, NADA PASSA POR BAIXO DO BOTÃO ===');
const tags=await p.evaluate(()=>{
  const w=document.querySelector('.hd-tags-wrap');
  w.innerHTML='<span class="design-tag" data-tag="URGENTE">URGENTE</span>'
             +'<span class="design-tag" data-tag="ATRASADO">ATRASADO</span>';
  w.classList.add('com-tags');
  const bt=document.querySelector('.hd-tags-add').getBoundingClientRect();
  const cel=document.querySelector('.hd-obs').getBoundingClientRect();
  const ts=[...w.querySelectorAll('.design-tag')].map(t=>t.getBoundingClientRect());
  return { folga:+(bt.left-ts[ts.length-1].right).toFixed(1),
           umaLinhaSo: ts.every(t=>Math.abs(t.top-ts[0].top)<2),
           tudoDentro: ts.every(t=>t.bottom<=cel.bottom+1 && t.top>=cel.top-1) };
});
console.log('     '+JSON.stringify(tags));
checa('as duas tags não encostam no botão', tags.folga>0, true);
checa('  e cabem na MESMA linha', tags.umaLinhaSo, true);
checa('  sem serem cortadas pela célula', tags.tudoDentro, true);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', err.length, 0);
if(err.length)err.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('CABEÇALHO v3.294: status só com o "+" do tecido, total fechando a quarta coluna');
