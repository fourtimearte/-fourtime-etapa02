/* v3.276 — o KIT DE TESTE trocava Entrega por Envio.

   No cabeçalho, `entrega` é COMO a mercadoria vai (datalist dl-entrega,
   banco DB.entregas: AEREO, CORREIOS, MOTOBOY…) e `envio` é QUANDO (o
   campo com ícone de calendário, dd/mm/aaaa). A receita do documento de
   teste punha a data em `entrega` e a transportadora em `envio`.

   O teste não confere só a receita: confere que o valor chega ao campo
   com o RÓTULO certo na tela, e que a corrente
   DOM -> coletaEstado -> aplicaEstado -> HTML do Trello não inverte. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';

const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const browser = await abreNavegador();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(DIR + (process.env.FT_ARQ||'fourtime-editor-v276.html')).href);
await esperaPronto(page);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), (process.env.FT_VER||'3.276'));
checa('sem erro de página', erros.length, 0);

console.log('\n=== 1. QUEM É QUEM NO CABEÇALHO ===');
let r = await page.evaluate(() => {
  const c = k => document.querySelector('.doc-header [data-h="' + k + '"]');
  const rot = k => c(k).closest('.hd-campo,.hd-meia').querySelector('.hd-label').textContent;
  return {
    rotEntrega: rot('entrega'), rotEnvio: rot('envio'),
    /* o campo de DATA é o que tem o calendário do lado */
    calNoEnvio: !!c('envio').closest('.hd-input-wrap').querySelector('.hd-cal'),
    calNaEntrega: !!c('entrega').closest('.hd-input-wrap').querySelector('.hd-cal'),
    dicaEnvio: c('envio').placeholder,
  };
});
checa('o campo entrega tem o rótulo Entrega', r.rotEntrega, 'Entrega');
checa('o campo envio tem o rótulo Envio', r.rotEnvio, 'Envio');
checa('o calendário fica no Envio', r.calNoEnvio, true);
checa('  e NÃO na Entrega', r.calNaEntrega, false);
checa('Envio pede uma data', r.dicaEnvio, 'dd/mm/aaaa');

console.log('\n=== 2. O KIT DE TESTE PREENCHE CADA UM NO SEU LUGAR ===');
r = await page.evaluate(async () => {
  /* o botão é #miKitTeste (não #miTeste) e nasce escondido: só aparece
     com a chave "Kit de teste" ligada nas Configurações. Chamar o
     handler pelo clique no elemento é o caminho do usuário. */
  const mi = document.getElementById('miKitTeste');
  mi.hidden = false; mi.style.display = '';
  mi.click();
  await new Promise(s => setTimeout(s, 1200));
  const c = k => document.querySelector('.doc-header [data-h="' + k + '"]').value;
  const data = /^\d{2}\/\d{2}\/\d{4}$/;
  return { entrega: c('entrega'), envio: c('envio'),
           entregaEhData: data.test(c('entrega')),
           envioEhData: data.test(c('envio')),
           entregaEstaNoBanco: (DB.entregas || []).includes(c('entrega')) };
});
console.log(`     entrega="${r.entrega}"  envio="${r.envio}"`);
checa('Envio recebe a DATA', r.envioEhData, true);
checa('Entrega NÃO recebe data', r.entregaEhData, false);
checa('  Entrega recebe uma forma de envio do banco', r.entregaEstaNoBanco, true);

console.log('\n=== 3. A CORRENTE NÃO INVERTE ===');
r = await page.evaluate(async () => {
  const c = k => document.querySelector('.doc-header [data-h="' + k + '"]');
  c('entrega').value = 'MOTOBOY'; c('entrega').dispatchEvent(new Event('input', { bubbles: true }));
  c('envio').value = '15/08/2026'; c('envio').dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(s => setTimeout(s, 200));
  const est = coletaEstado();
  c('entrega').value = ''; c('envio').value = '';
  aplicaEstado(est);
  await new Promise(s => setTimeout(s, 300));
  const d = new DOMParser().parseFromString(gerarHTML([]), 'text/html');
  const exp = k => { const el = d.querySelector('.doc-header [data-h="' + k + '"]'); return el ? (el.getAttribute('value') || el.value || '') : '(sem)'; };
  return { estado: [est.header.entrega, est.header.envio],
           dom: [c('entrega').value, c('envio').value],
           trello: [exp('entrega'), exp('envio')] };
});
checa('coletaEstado guarda na ordem certa', r.estado, ['MOTOBOY', '15/08/2026']);
checa('aplicaEstado devolve na ordem certa', r.dom, ['MOTOBOY', '15/08/2026']);
checa('e o Trello exporta na ordem certa', r.trello, ['MOTOBOY', '15/08/2026']);

console.log('\n=== 4. TRILHO: o rótulo virou "Editor" ===');
r = await page.evaluate(() => {
  const b = document.querySelector('.ft-rail-bt[data-sec="orcamento"]');
  return { texto: b.querySelector('span').textContent, titulo: b.title,
           /* a chave do código NÃO pode mudar junto com o rótulo */
           chave: b.dataset.sec,
           painelExiste: !!document.querySelector('.ft-painel[data-sec="orcamento"]') };
});
checa('rótulo', r.texto, 'Editor');
checa('  e a dica do mouse', r.titulo, 'Editor');
checa('a chave interna continua "orcamento"', r.chave, 'orcamento');
checa('  e o painel dela existe', r.painelExiste, true);

r = await page.evaluate(async () => {
  document.querySelector('.ft-rail-bt[data-sec="relatorio"]').click();
  await new Promise(s => setTimeout(s, 400));
  const foiPraRel = !document.querySelector('.ft-painel[data-sec="relatorio"]').hidden;
  document.querySelector('.ft-rail-bt[data-sec="orcamento"]').click();
  await new Promise(s => setTimeout(s, 400));
  return { foiPraRel, voltou: !document.querySelector('.ft-painel[data-sec="orcamento"]').hidden };
});
checa('trocar de painel continua funcionando', [r.foiPraRel, r.voltou], [true, true]);

console.log('\n' + '='.repeat(62));
checa('nenhum erro de página no total', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.276: ENTREGA E ENVIO NO LUGAR CERTO · TRILHO DIZ EDITOR');
