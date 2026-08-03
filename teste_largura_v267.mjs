/* v3.267 — a escala segue a LARGURA da janela, e reage a redimensionar. */
import { abreNavegador, esperaPronto, redimensiona } from './ft_navegador.mjs';
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
await page.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v276.html')).href);
await esperaPronto(page);

const estado=()=>page.evaluate(()=>({
  larg:window.innerWidth, alt:window.innerHeight,
  faixa:v4FaixaReal().nome,
  escalaFolha:v4Faixa().folha, escalaMenu:v4Faixa().menu,
  folhaPx:Math.round(document.querySelector('.folha-a4').getBoundingClientRect().width),
  menuPx:Math.round(document.querySelector('.ft-menu').getBoundingClientRect().width),
}));

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(()=>FT_EDITOR), (process.env.FT_VER||'3.276'));
checa('sem erro de página', erros.length, 0);
if(erros.length)erros.slice(0,4).forEach(e=>console.log('     ! '+e));

console.log('\n=== 1. OS VALORES CALIBRADOS ENTRARAM ===');
let r=await page.evaluate(()=>V4_FAIXAS.map(f=>[f.nome,f.larguraMin,f.folha,f.menu]));
r.forEach(x=>console.log('     '+x[0].padEnd(7)+' ≥'+String(x[1]).padStart(4)+'px   folha '+x[2].toFixed(2)+'   menu '+x[3].toFixed(2)));
checa('2160p', r[0], ['2160p',3000,1.40,1.35]);
checa('1440p', r[1], ['1440p',2000,1.20,1.35]);
checa('1080p', r[2], ['1080p',1500,1.05,1.00]);
checa('900p',  r[3], ['900p', 1400,1.00,1.00]);
checa('768p',  r[4], ['768p',    0,0.90,0.90]);

console.log('\n=== 2. QUEM MANDA É A LARGURA, NÃO A ALTURA ===');
// janela ALTA e ESTREITA: pela altura seria 2160p; pela largura é 768p
await redimensiona(page, {width:1200,height:2000});
r=await estado();
console.log('     janela '+r.larg+'×'+r.alt);
checa('alta e estreita cai em 768p', r.faixa, '768p');
checa('  com a escala de 768p', r.escalaFolha, 0.90);

// janela BAIXA e LARGA: pela altura seria 768p; pela largura é 1440p
await redimensiona(page, {width:2400,height:700});
r=await estado();
console.log('     janela '+r.larg+'×'+r.alt);
checa('baixa e larga cai em 1440p', r.faixa, '1440p');
checa('  com a escala de 1440p', r.escalaFolha, 1.20);

console.log('\n=== 3. CADA LARGURA CAI NA FAIXA CERTA ===');
for(const [w,esperado] of [[3840,'2160p'],[3072,'2160p'],[2560,'1440p'],[2048,'1440p'],
                           [1920,'1080p'],[1600,'1080p'],[1500,'1080p'],[1440,'900p'],
                           [1366,'768p'],[1024,'768p']]){
  await redimensiona(page, {width:w,height:900});
  const e=await estado();
  checa('janela de '+w+'px', e.faixa, esperado);
}
console.log('     (3072 = 4K com o Windows a 125%; 2048 = 1440p a 125%)');

console.log('\n=== 4. REDIMENSIONAR MUDA A ESCALA NA HORA ===');
await redimensiona(page, {width:1920,height:1080});
const grande=await estado();
await redimensiona(page, {width:1200,height:1080});
const pequeno=await estado();
console.log('     1920px -> folha '+grande.folhaPx+'px, menu '+grande.menuPx+'px');
console.log('     1200px -> folha '+pequeno.folhaPx+'px, menu '+pequeno.menuPx+'px');
checa('a faixa mudou', [grande.faixa,pequeno.faixa], ['1080p','768p']);
checa('a folha encolheu', pequeno.folhaPx < grande.folhaPx, true);
checa('o menu também', pequeno.menuPx < grande.menuPx, true);

// e volta ao alargar
await redimensiona(page, {width:1920,height:1080});
const voltou=await estado();
checa('e volta ao alargar', voltou.faixa, '1080p');
checa('  com a folha de novo grande', voltou.folhaPx, grande.folhaPx);

console.log('\n=== 5. O LIMITE É EDITÁVEL NO PAINEL ===');
r=await page.evaluate(async ()=>{
  ccFaixasMonta();
  const antes=v4FaixaReal().nome;
  const inp=document.querySelector('#ccFaixas input[data-f="1080p"][data-k="larguraMin"]');
  if(!inp)return {erro:'sem campo de limite'};
  inp.value='1950';                      // a janela tem 1920: deixa de ser 1080p
  inp.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,200));
  const depois=v4FaixaReal().nome;
  inp.value='1500'; inp.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,200));
  return {antes, depois, restaurado:v4FaixaReal().nome,
          ultimaEhResto:!!document.querySelector('#ccFaixas tr[data-f="768p"] .cc-resto')};
});
checa('mexer no limite troca a faixa', [r.antes,r.depois], ['1080p','900p']);
checa('  e desfazer volta', r.restaurado, '1080p');
checa('a última faixa é "resto", sem campo', r.ultimaEhResto, true);

console.log('\n=== 6. O CÓDIGO PARA COLAR SAI COM larguraMin ===');
r=await page.evaluate(()=>ccFaixasCodigo());
console.log('     '+r.split('\n').join('\n     '));
checa('usa larguraMin', r.includes('larguraMin:'), true);
checa('não usa mais alturaMin', r.includes('alturaMin'), false);
checa('traz os valores calibrados', r.includes('folha:1.40') && r.includes('folha:0.90'), true);

console.log('\n=== 7. A DICA FALA EM LARGURA (monitor E janela, v3.268) ===');
r=await page.evaluate(()=>{ccFaixasDica();return document.getElementById('ccFaixaDica').textContent;});
console.log('     "'+r+'"');
/* v3.268: o texto virou "monitor 3072px → 2160p (folha) · janela 1535px →
   1080p (menu)". Continua sendo largura em px — mudou só a redação. */
checa('diz a largura do monitor', /monitor \d+px/.test(r), true);
checa('diz a largura da janela',  /janela \d+px/.test(r), true);
checa('  e a faixa', r.includes('1080p'), true);

console.log('\n'+'='.repeat(60));
checa('nenhum erro de página', erros.length, 0);
await browser.close();
if(falhas.length){console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`);process.exit(1);}
console.log('v3.267: ESCALA PELA LARGURA DA JANELA');
