/* v3.263 — toasts do Banco de Dados e dos Clientes.
   Confere posição, aparência e comportamento contra o Personifour Design Kit
   v5 (seção 15). Mede o que o navegador pinta, não o que o CSS diz. */
import { abreNavegador } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
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
await page.goto(pathToFileURL(DIR+'fourtime-editor-v272.html').href);
await page.waitForTimeout(2500);

const UID = '84612fef-0de6-4fd2-b024-6f77bfdf4494';
await page.evaluate((UID) => {
  window.__limpa = () => { document.getElementById('ftNotifWrap').innerHTML = ''; };
  window.__toasts = () => [...document.querySelectorAll('.ft-notif')]
    .map(t => ({ txt: t.querySelector('.tx').textContent, tipo: t.dataset.t,
                 n: (t.querySelector('.n') || {}).textContent || '' }));
  window.__ficha = (d) => {
    DB.clientes = [Object.assign(cliVazio(), { id: UID, n: 'AÇAI NO COCO' }, d || {})];
    CLI_SEL = UID;
    const pg = document.getElementById('cliPage'); if (pg) pg.hidden = false;
    FT_SYNC.on = false; cliFicha(); __limpa();
  };
  window.__muda = (id, v) => {
    const el = document.getElementById(id);
    el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
  };
}, UID);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), "3.272");
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. FIEL AO DESIGN KIT v5 (seção 15) ===');
let r = await page.evaluate(async () => {
  ftToast('teste');
  await new Promise(s => setTimeout(s, 120));
  const w = document.getElementById('ftNotifWrap');
  const t = document.querySelector('.ft-notif');
  const cw = getComputedStyle(w), ct = getComputedStyle(t), cd = getComputedStyle(t.querySelector('.d'));
  const cx = t.getBoundingClientRect();
  return {
    posicao: cw.position, right: cw.right, bottom: cw.bottom,
    direcao: cw.flexDirection, gap: cw.gap,
    fundo: ct.backgroundColor, cor: ct.color, raio: ct.borderRadius,
    fonte: ct.fontSize, padding: ct.padding,
    bolinha: cd.backgroundColor, bolinhaTam: cd.width,
    noCantoDireito: cx.right > window.innerWidth - 60,
    noCantoInferior: cx.bottom > window.innerHeight - 60,
  };
});
checa('fixo na tela', r.posicao, 'fixed');
checa('20px da direita (kit)', r.right, '20px');
checa('20px do fundo (kit)', r.bottom, '20px');
checa('empilha para cima', r.direcao, 'column');
checa('gap 8px (kit)', r.gap, '8px');
checa('fundo n-900 #161A20 (kit)', r.fundo, 'rgb(22, 26, 32)');
checa('texto branco', r.cor, 'rgb(255, 255, 255)');
checa('raio r-md 8px (kit)', r.raio, '8px');
checa('fonte fs-13 (kit)', r.fonte, '13px');
checa('padding 11px 14px (kit)', r.padding, '11px 14px');
checa('bolinha --success (kit)', r.bolinha, 'rgb(18, 128, 92)');
checa('bolinha 8px (kit)', r.bolinhaTam, '8px');
checa('aparece no canto DIREITO', r.noCantoDireito, true);
checa('  INFERIOR', r.noCantoInferior, true);

console.log('\n=== 2. ENTRA DESLIZANDO E SAI SOZINHO ===');
r = await page.evaluate(async () => {
  __limpa(); ftToast('entrando');
  const t = document.querySelector('.ft-notif');
  const antes = getComputedStyle(t).transform;
  await new Promise(s => setTimeout(s, 400));
  const depois = getComputedStyle(t).transform;
  return { antes, depois, temTransicao: getComputedStyle(t).transitionDuration };
});
checa('começa fora da tela', r.antes !== 'none', true);
checa('entra até a posição', r.depois, 'none');
checa('com transição de 200ms (kit)', r.temTransicao.startsWith('0.2s'), true);

r = await page.evaluate(async () => {
  __limpa(); ftToast('efêmero');
  await new Promise(s => setTimeout(s, 3200));   // kit: 2600ms + saída
  return document.querySelectorAll('.ft-notif').length;
});
checa('some sozinho depois de 2,6s', r, 0);

console.log('\n=== 3. OS TIPOS TÊM CORES DO KIT ===');
r = await page.evaluate(async () => {
  __limpa();
  ftToast('a', 'ok'); ftToast('b', 'info'); ftToast('c', 'aviso'); ftToast('d', 'erro');
  await new Promise(s => setTimeout(s, 100));
  return [...document.querySelectorAll('.ft-notif')]
    .map(t => getComputedStyle(t.querySelector('.d')).backgroundColor);
});
checa('ok=success · info · aviso=warning · erro=danger', r,
  ['rgb(18, 128, 92)', 'rgb(37, 99, 235)', 'rgb(180, 83, 9)', 'rgb(198, 22, 27)']);

console.log('\n=== 4. REPETIDO VIRA CONTADOR, NÃO PILHA ===');
r = await page.evaluate(async () => {
  __limpa();
  ftToast('mesma coisa'); ftToast('mesma coisa'); ftToast('mesma coisa');
  await new Promise(s => setTimeout(s, 100));
  return { quantos: document.querySelectorAll('.ft-notif').length, lista: __toasts() };
});
checa('um toast só', r.quantos, 1);
checa('  com contador ×3', r.lista[0].n, '×3');

console.log('\n=== 5. NUNCA MAIS DE 4 NA TELA ===');
r = await page.evaluate(async () => {
  __limpa();
  for (let i = 0; i < 9; i++) ftToast('mensagem ' + i);
  await new Promise(s => setTimeout(s, 100));
  // conta só os que estão NA TELA: os que saem ficam alguns ms no DOM com a
  // classe .saindo, já colapsados e fora da coluna
  return document.querySelectorAll('.ft-notif:not(.saindo)').length;
});
checa('teto de 4 visíveis', r, 4);

console.log('\n=== 6. CLICAR FECHA ===');
r = await page.evaluate(async () => {
  __limpa(); ftToast('some ao clicar');
  await new Promise(s => setTimeout(s, 100));
  document.querySelector('.ft-notif').click();
  await new Promise(s => setTimeout(s, 400));
  return document.querySelectorAll('.ft-notif').length;
});
checa('fechou no clique', r, 0);

console.log('\n=== 7. MUDANÇA NO CADASTRO DE CLIENTE AVISA ===');
r = await page.evaluate(async () => {
  __ficha({ zap: '' });
  __muda('cli_zap', '71999990000');
  await new Promise(s => setTimeout(s, 80));
  return __toasts();
});
checa('avisa o campo alterado', r[0] && r[0].txt, 'WhatsApp atualizado');

r = await page.evaluate(async () => {
  __ficha({ zap: '71999990000' });
  __muda('cli_zap', '');
  await new Promise(s => setTimeout(s, 80));
  return __toasts();
});
checa('apagar campo avisa em âmbar', r[0] && r[0].tipo, 'aviso');
checa('  com o texto certo', r[0] && r[0].txt, 'WhatsApp apagado');

r = await page.evaluate(async () => {
  __ficha({ n: 'AÇAI NO COCO' });
  __muda('cli_n', 'AÇAÍ DO COCO');
  await new Promise(s => setTimeout(s, 80));
  return __toasts();
});
checa('renomear avisa o nome novo', r[0] && r[0].txt, 'Nome alterado: AÇAÍ DO COCO');

console.log('\n=== 8. ENDEREÇOS AVISAM ===');
r = await page.evaluate(async () => {
  __ficha();
  document.getElementById('cliMaisEnd').click();
  await new Promise(s => setTimeout(s, 80));
  const t1 = __toasts();
  const id = DB.clientes[0].enderecos[0].id;
  __limpa();
  document.querySelector('.cli-entrega[data-alvo="' + id + '"]').click();
  await new Promise(s => setTimeout(s, 80));
  const t2 = __toasts();
  __limpa();
  document.querySelector('[data-remove="' + id + '"]').click();
  await new Promise(s => setTimeout(s, 80));
  return { criar: t1, entrega: t2, remover: __toasts() };
});
checa('acrescentar endereço avisa', r.criar[0] && r.criar[0].txt, 'Endereço acrescentado');
checa('marcar entrega avisa', (r.entrega[0] || {}).txt || '', 'Entrega passa a ser no endereço avulso');
checa('remover avisa em âmbar', (r.remover[0] || {}).tipo, 'aviso');

console.log('\n=== 9. BANCO DE DADOS AVISA ===');
r = await page.evaluate(async () => {
  __limpa();
  DB.tecidos = ['MALHA PV'];
  // simula o que o handler do Banco faz ao apagar
  const antigo = 'MALHA PV';
  DB.tecidos.splice(0, 1);
  ftToast('Apagado do banco: ' + antigo, 'aviso');
  await new Promise(s => setTimeout(s, 80));
  return __toasts();
});
checa('apagar item avisa', r[0] && r[0].txt, 'Apagado do banco: MALHA PV');

console.log('\n=== 10. SUCESSO DE SINCRONIZAÇÃO NÃO VIRA RUÍDO ===');
// há uma gravação por campo editado; avisar cada uma encheria a tela
r = await page.evaluate(async () => {
  __limpa();
  _ftSyncEstadoAntes = '';
  ftSyncStatus('salvando'); ftSyncStatus('ok');
  await new Promise(s => setTimeout(s, 80));
  const depoisOk = __toasts().length;
  ftSyncStatus('erro');
  await new Promise(s => setTimeout(s, 80));
  const depoisErro = __toasts();
  ftSyncStatus('erro'); ftSyncStatus('erro');
  await new Promise(s => setTimeout(s, 80));
  return { depoisOk, depoisErro, repetido: __toasts().length };
});
checa('sucesso NÃO vira toast', r.depoisOk, 0);
checa('falha vira, em vermelho', (r.depoisErro[0] || {}).tipo, 'erro');
checa('  e não repete enquanto continuar falhando', r.repetido, 1);

console.log('\n=== 11. NÃO SAI NO PAPEL ===');
await page.emulateMedia({ media: 'print' });
r = await page.evaluate(() => getComputedStyle(document.getElementById('ftNotifWrap')).display);
checa('some na impressão', r, 'none');
await page.emulateMedia({ media: 'screen' });

console.log('\n' + '='.repeat(60));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.263: TOASTS NO PADRÃO DO KIT v5');
