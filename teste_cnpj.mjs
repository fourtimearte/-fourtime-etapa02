/* CNPJ NO CADASTRO DE CLIENTES
   Três coisas, e nenhuma delas depende da internet: a máscara (digitar só
   números e ver a pontuação aparecer), a consulta em PARALELO às duas
   fontes (uma fora do ar não pode derrubar a outra) e o preenchimento de
   uma ficha que abre com o CNPJ já lá. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

/* as duas fontes chamam os campos de nomes diferentes — o teste manda o
   formato de cada uma, senão validaria um normalizador que não existe */
const BASE={ razao_social:'ESCOLA MODELO LTDA', nome_fantasia:'ESCOLA MODELO',
  cep:'74000000', logradouro:'REPUBLICA DO CHILE', numero:'150',
  bairro:'CENTRO', municipio:'GOIANIA', uf:'GO' };
const RECEITA_BRASILAPI=Object.assign({},BASE,
  {descricao_tipo_de_logradouro:'AVENIDA', ddd_telefone_1:'6232000000',
   descricao_situacao_cadastral:'ATIVA'});
const RECEITA_OPENCNPJ=Object.assign({},BASE,
  {tipo_logradouro:'AVENIDA', telefones:[{ddd:'62',numero:'32000000'}],
   situacao_cadastral:'Ativa'});

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:950}});
const erros=[]; p.on('pageerror',e=>erros.push(String(e).slice(0,160)));

/* estado das fontes, mudado a cada cenário */
let brasilapi={modo:'403'}, opencnpj={modo:'ok',espera:0};
await p.route('**/brasilapi.com.br/api/cnpj/**',async r=>{
  if(brasilapi.espera)await new Promise(s=>setTimeout(s,brasilapi.espera));
  if(brasilapi.modo==='403')return r.fulfill({status:403,body:'Forbidden'});
  if(brasilapi.modo==='morto')return r.abort();
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(RECEITA_BRASILAPI)});
});
await p.route('**/api.opencnpj.org/**',async r=>{
  if(opencnpj.espera)await new Promise(s=>setTimeout(s,opencnpj.espera));
  if(opencnpj.modo==='404')return r.fulfill({status:404,body:'{}'});
  if(opencnpj.modo==='morto')return r.abort();
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(RECEITA_OPENCNPJ)});
});

await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v285.html')).href);
await esperaPronto(p);

console.log('\n=== 1. A MÁSCARA: SÓ NÚMEROS ENTRAM, A PONTUAÇÃO APARECE ===');
await p.evaluate(async ()=>{
  document.querySelector('.ft-rail-bt[data-sec="clientes"]').click();
  await new Promise(s=>setTimeout(s,600));
  DB.clientes=[{id:'m1',n:'NOVO CLIENTE'}]; CLI_SEL='m1'; cliFicha();
  await new Promise(s=>setTimeout(s,400));
});
await p.click('#cli_doc');
const passos=[];
for(const c of '25260940000140'){ await p.keyboard.type(c);
  passos.push(await p.evaluate(()=>document.getElementById('cli_doc').value)); }
console.log('     '+passos.slice(-4).join(' · '));
checa('digitando só números sai pontuado', passos[13], '25.260.940/0001-40');
checa('  o CPF também se monta sozinho', passos[10], '252.609.400-00');
/* apagar um dígito no meio não joga o cursor para o fim */
let r=await p.evaluate(()=>{document.getElementById('cli_doc').setSelectionRange(4,4);});
await p.keyboard.press('Backspace');
r=await p.evaluate(()=>({v:document.getElementById('cli_doc').value,
                         cur:document.getElementById('cli_doc').selectionStart}));
console.log('     '+JSON.stringify(r));
checa('apagar no meio mantém o cursor no meio', r.cur<8, true);

console.log('\n=== 2. UMA FONTE FORA DO AR NÃO DERRUBA A OUTRA ===');
/* é o caso medido em produção: a BrasilAPI passou a responder 403 */
r=await p.evaluate(async ()=>{
  const t0=Date.now();
  const e=await ftBuscaCnpj('25260940000140');
  return {ms:Date.now()-t0, razao:e&&e.razao, cidade:e&&e.cidade, rua:e&&e.rua};
});
console.log('     '+JSON.stringify(r));
checa('BrasilAPI em 403 → a OpenCNPJ resolve', r.razao, 'ESCOLA MODELO LTDA');
checa('  a rua vem com o tipo do logradouro junto', r.rua, 'AVENIDA REPUBLICA DO CHILE');

/* e o contrário: a segunda fonte morta, a primeira boa */
brasilapi={modo:'ok',espera:0}; opencnpj={modo:'morto',espera:0};
r=await p.evaluate(async ()=>{
  const e=await ftBuscaCnpj('25260940000140');
  return e&&e.razao;
});
checa('a ordem não importa: qualquer uma serve', r, 'ESCOLA MODELO LTDA');

console.log('\n=== 3. EM PARALELO, A LENTA NÃO ATRASA A RÁPIDA ===');
/* em série, os 4s da fonte lenta somavam com a outra e estouravam o
   limite. Em paralelo, a boa responde no tempo dela. */
brasilapi={modo:'ok',espera:0}; opencnpj={modo:'ok',espera:4000};
r=await p.evaluate(async ()=>{
  const t0=Date.now();
  const e=await ftBuscaCnpj('25260940000140');
  return {ms:Date.now()-t0, achou:!!(e&&e.razao)};
});
console.log('     '+JSON.stringify(r));
checa('a resposta boa não espera a fonte lenta', r.ms<3000, true);
checa('  e vem preenchida', r.achou, true);
/* e a lenta ainda serve quando é a única */
brasilapi={modo:'morto',espera:0}; opencnpj={modo:'ok',espera:1500};
r=await p.evaluate(async ()=>{const e=await ftBuscaCnpj('25260940000140');return e&&e.razao;});
checa('  fonte lenta sozinha ainda é esperada', r, 'ESCOLA MODELO LTDA');

console.log('\n=== 4. AS DUAS MORTAS: AVISA, NÃO INVENTA ===');
brasilapi={modo:'morto',espera:0}; opencnpj={modo:'morto',espera:0};
r=await p.evaluate(async ()=>await ftBuscaCnpj('25260940000140'));
checa('sem nenhuma fonte, devolve nada (não inventa)', r, null);
checa('CNPJ incompleto não vira consulta',
      await p.evaluate(async ()=>await ftBuscaCnpj('2526094')), null);
brasilapi={modo:'403',espera:0}; opencnpj={modo:'ok',espera:0};

console.log('\n=== 5. FICHA QUE ABRE COM O CNPJ JÁ PREENCHIDO ===');
/* o buraco de verdade: o número entrou por outro caminho e ninguém nunca
   digitou NESTE campo, então input/blur jamais dispararam */
r=await p.evaluate(async ()=>{
  DB.clientes=[{id:'y1',n:'CLIENTE ANTIGO',doc:'25260940000140'}];
  CLI_SEL='y1'; cliFicha();
  await new Promise(s=>setTimeout(s,1500));
  const c=DB.clientes[0];
  return {doc:document.getElementById('cli_doc').value,
          razao:c.razao, cidade:c.cidade, rua:c.rua, uf:c.uf};
});
console.log('     '+JSON.stringify(r));
checa('o documento aparece pontuado', r.doc, '25.260.940/0001-40');
checa('  e a ficha se preenche sozinha ao abrir', [r.razao,r.cidade,r.uf],
      ['ESCOLA MODELO LTDA','GOIANIA','GO']);

console.log('\n=== 6. FICHA JÁ PREENCHIDA NÃO É SOBRESCRITA ===');
r=await p.evaluate(async ()=>{
  DB.clientes=[{id:'z1',n:'CLIENTE MEU',doc:'25260940000140',
                razao:'RAZAO ESCRITA A MAO',cidade:'ANAPOLIS',rua:'RUA MINHA',cep:'75000000'}];
  CLI_SEL='z1'; cliFicha();
  await new Promise(s=>setTimeout(s,1200));
  const c=DB.clientes[0];
  return {n:c.n, razao:c.razao, cidade:c.cidade, rua:c.rua};
});
console.log('     '+JSON.stringify(r));
checa('nada do que estava escrito foi trocado',
      [r.n,r.razao,r.cidade,r.rua],
      ['CLIENTE MEU','RAZAO ESCRITA A MAO','ANAPOLIS','RUA MINHA']);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
if(erros.length)erros.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('CNPJ: máscara viva, duas fontes em paralelo, ficha se preenche ao abrir');
