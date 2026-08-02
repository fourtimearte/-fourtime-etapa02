/* v3.266 — o controle de escala volta a funcionar, e a tabela por resolução. */
import { abreNavegador } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r);}
const browser = await abreNavegador();
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const erros=[]; page.on('pageerror',e=>erros.push(String(e).slice(0,200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v272.html').href);
await page.waitForTimeout(2600);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(()=>FT_EDITOR), "3.272");
checa('sem erro de página', erros.length, 0);
if(erros.length)erros.slice(0,4).forEach(e=>console.log('     ! '+e));

console.log('\n=== 1. O CONTROLE FUNCIONA EM QUALQUER MODO DE ZOOM ===');
// era aqui o defeito: o modo fica gravado no localStorage e vencia a calibragem
let r=await page.evaluate(()=>{
  const w=()=>Math.round(document.querySelector('.folha-a4').getBoundingClientRect().width);
  return ['largura','pagina','manual'].map(modo=>{
    ZOOM_MODO=modo; window.CC_ESC_FOLHA=0; window.V4_FAIXA_FORCADA=''; aplicaZoom();
    const antes=w();
    const sf=document.getElementById('ccEscFolha');
    sf.value='0.60'; sf.dispatchEvent(new Event('input',{bubbles:true}));
    const depois=w();
    sf.value='1.00'; sf.dispatchEvent(new Event('input',{bubbles:true}));
    return {modo, mudou:antes!==depois, depois};
  });
});
r.forEach(x=>checa('modo '+x.modo+': a folha se mexe', x.mudou, true));
checa('e chega ao tamanho pedido (794 × 0,60)', r[0].depois, 476);

console.log('\n=== 2. A TABELA TEM AS CINCO RESOLUÇÕES ===');
r=await page.evaluate(()=>{
  ccFaixasMonta();
  return {linhas:[...document.querySelectorAll('#ccFaixas tbody tr')].map(t=>t.dataset.f),
          campos:document.querySelectorAll('#ccFaixas input').length,
          marcada:(document.querySelector('#ccFaixas tr.agora')||{}).dataset};
});
checa('as cinco faixas', r.linhas, ['2160p','1440p','1080p','900p','768p']);
// v3.267: entrou a coluna do LIMITE — 3 campos por faixa, menos o da última
// (que é "resto" e não tem limite editável)
checa('três campos por faixa (menos o resto)', r.campos, 14);
checa('a faixa da janela está marcada', r.marcada.f, '1080p');

console.log('\n=== 3. EDITAR UM NÚMERO APLICA NA HORA ===');
r=await page.evaluate(()=>{
  const w=()=>Math.round(document.querySelector('.folha-a4').getBoundingClientRect().width);
  ZOOM_MODO='largura'; window.CC_ESC_FOLHA=0; window.V4_FAIXA_FORCADA=''; aplicaZoom();
  const antes=w();
  const inp=document.querySelector('#ccFaixas input[data-f="1080p"][data-k="folha"]');
  inp.value='0.75'; inp.dispatchEvent(new Event('input',{bubbles:true}));
  // o handler repinta dentro de requestAnimationFrame — medir antes disso
  // lê a largura ANTIGA. Não era o código: era o teste com pressa.
  return new Promise(res=>setTimeout(()=>{
    const depois=w();
    const faixa=V4_FAIXAS.find(f=>f.nome==='1080p').folha;
    inp.value='1.00'; inp.dispatchEvent(new Event('input',{bubbles:true}));
    res({antes, depois, faixa});
  },120));
});
checa('a folha encolheu', r.depois < r.antes, true);
checa('  para 0,75 de 794 (595,5 arredondado)', r.depois, 595);
checa('  e o valor ficou guardado na faixa', r.faixa, 0.75);

console.log('\n=== 4. EDITAR OUTRA FAIXA NÃO MEXE NA TELA ===');
r=await page.evaluate(()=>{
  const w=()=>Math.round(document.querySelector('.folha-a4').getBoundingClientRect().width);
  const antes=w();
  const inp=document.querySelector('#ccFaixas input[data-f="2160p"][data-k="folha"]');
  inp.value='2.00'; inp.dispatchEvent(new Event('input',{bubbles:true}));
  return {antes, depois:w(), guardado:V4_FAIXAS.find(f=>f.nome==='2160p').folha};
});
checa('a tela não muda', r.depois, r.antes);
checa('  mas o valor foi guardado', r.guardado, 2);

console.log('\n=== 5. "VER" FORÇA UMA RESOLUÇÃO QUE NÃO É A MINHA ===');
r=await page.evaluate(()=>{
  const w=()=>Math.round(document.querySelector('.folha-a4').getBoundingClientRect().width);
  const antes=w();
  document.querySelector('#ccFaixas [data-ver="2160p"]').click();
  return new Promise(res=>setTimeout(()=>res({
    antes, depois:w(), forcada:window.V4_FAIXA_FORCADA,
    faixaUsada:v4Faixa().nome, faixaReal:v4FaixaReal().nome,
    dica:document.getElementById('ccFaixaDica').textContent,
  }),120));
});
checa('força a faixa 2160p', r.forcada, '2160p');
checa('  v4Faixa passa a devolver ela', r.faixaUsada, '2160p');
checa('  mas a real continua sendo a da janela', r.faixaReal, '1080p');
checa('  a folha cresce (2.00 de escala)', r.depois > r.antes, true);
/* v3.268 mudou o texto: a dica agora conta as DUAS medidas (monitor e janela) */
checa('  e a dica avisa que está forçado', r.dica.includes('folha forçada em 2160p'), true);

r=await page.evaluate(()=>{
  document.querySelector('#ccFaixas [data-ver="2160p"]').click();  // clicar de novo solta
  return new Promise(res=>setTimeout(()=>res({forcada:window.V4_FAIXA_FORCADA,
    dica:document.getElementById('ccFaixaDica').textContent}),120));
});
checa('clicar de novo solta', r.forcada, '');
checa('  e a dica volta ao normal', /^monitor \d+px → \S+ \(folha\)/.test(r.dica), true);

console.log('\n=== 6. O CÓDIGO PARA COLAR ===');
r=await page.evaluate(()=>{
  V4_FAIXAS.find(f=>f.nome==='2160p').folha=1.45;
  V4_FAIXAS.find(f=>f.nome==='2160p').menu =1.60;
  return ccFaixasCodigo();
});
console.log('     ' + r.split('\n').join('\n     '));
checa('começa com a constante', r.startsWith('const V4_FAIXAS = ['), true);
checa('tem as cinco linhas', r.split('\n').length, 7);
checa('carrega o valor editado', r.includes('folha:1.45'), true);
checa('  e o do menu', r.includes('menu:1.60'), true);

console.log('\n=== 7. O PAINEL EM DUAS COLUNAS ===');
r=await page.evaluate(()=>{
  const p=document.getElementById('ctxCustom');
  p.style.display='block';
  const cols=getComputedStyle(document.querySelector('.cc-cols'));
  const c=[...document.querySelectorAll('.cc-col')];
  const cx=p.getBoundingClientRect();
  const alt=cx.height, larg=cx.width;
  const altCol=[...document.querySelectorAll('.cc-col')].map(c=>Math.round(c.getBoundingClientRect().height));
  p.style.display='';
  return {altCol, colunas:cols.gridTemplateColumns.split(' ').length,
          quantasCol:c.length,
          escalaNaEsquerda:!!c[0].querySelector('#ccEscala'),
          coresNaDireita:!!c[1].querySelector('#ccLista'),
          tipografiaNaDireita:!!c[1].querySelector('#ccTamLista'),
          largura:Math.round(larg), altura:Math.round(alt)};
});
checa('duas colunas', r.colunas, 2);
checa('  dois containers', r.quantasCol, 2);
checa('escalas à esquerda', r.escalaNaEsquerda, true);
// a Tipografia foi para a direita ao equilibrar as colunas: com ela na
// esquerda, a diferença entre os lados passava de 300px
checa('tipografia à direita (junto das cores)', r.tipografiaNaDireita, true);
checa('cores à direita', r.coresNaDireita, true);
checa('largura 600px', r.largura, 600);
console.log('     altura do painel: ' + r.altura + 'px · colunas: ' + JSON.stringify(r.altCol));
checa('cabe numa tela de 768', r.altura < 744, true);

console.log('\n'+'='.repeat(60));
checa('nenhum erro de página', erros.length, 0);
await browser.close();
if(falhas.length){console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`);process.exit(1);}
console.log('v3.266: ESCALA FUNCIONANDO E PAINEL EM DUAS COLUNAS');
