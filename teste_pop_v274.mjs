/* v3.274 — painéis flutuantes e modais pelo Design Kit v5 §15.

   O que se cobra aqui é o DESENHO (raio, elevação, recheio, hover) e o
   COMPORTAMENTO (abrir, escolher, fechar). Nada disso entra no A4 nem no
   relatório — a última seção prova isso. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
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
await page.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v276.html')).href);
await esperaPronto(page);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), (process.env.FT_VER||'3.276'));
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

/* os valores do kit §15, escritos aqui em número e não em token: se alguém
   trocar o token por engano, o teste tem de reclamar */
const SH3 = 'rgba(16, 20, 28, 0.1) 0px 8px 24px 0px, rgba(16, 20, 28, 0.06) 0px 2px 6px 0px';
const SH4 = 'rgba(16, 20, 28, 0.18) 0px 18px 48px 0px, rgba(16, 20, 28, 0.1) 0px 4px 12px 0px';

console.log('\n=== 1. AS SETE CASCAS FLUTUANTES ===');
/* medir com display:none devolve zeros em algumas propriedades, mas raio,
   sombra e recheio são computados mesmo escondido — e é só isso que se lê */
let r = await page.evaluate(([sh3]) => {
  const alvos = {
    'ctxSalvar (Salvar em)': '#ctxSalvar',
    'ctxAbrir (Abrir de)': '#ctxAbrir',
    'ctxObs (tags de observação)': '#ctxObs',
    'ctxTags (tags de status)': '#ctxTags',
    'ctxCores (cores DTF)': '#ctxCores',
    'pickMenu (referência)': '#pickMenu',
    'calMenu (calendário)': '#calMenu',
    'corMenu (cores do tecido)': '.cor-menu',
    'origMenu (de onde abrir)': '#origMenu',
    'anPop (anotações)': '.an-pop',
  };
  const out = {};
  for (const [nome, sel] of Object.entries(alvos)) {
    const el = document.querySelector(sel);
    if (!el) { out[nome] = 'NÃO EXISTE'; continue; }
    const c = getComputedStyle(el);
    out[nome] = { raio: c.borderRadius, sombra: c.boxShadow, temBorda: c.borderTopWidth !== '0px' };
  }
  return out;
}, [SH3]);
for (const [nome, v] of Object.entries(r)) {
  checa(`${nome}: raio 12 (r-lg)`, v.raio, '12px');
  checa(`${nome}: elevação sh-3`, v.sombra, SH3);
  checa(`${nome}: tem borda`, v.temBorda, true);
}

console.log('\n=== 2. O DROPDOWN CUSTOM (r-sm + sh-4 desde a v3.275) ===');
r = await page.evaluate(() => {
  const m = document.querySelector('.ft-dd-menu');
  const c = getComputedStyle(m);
  return { raio: c.borderRadius, sombra: c.boxShadow };
});
checa('raio 6 (r-sm), menor de propósito', r.raio, '6px');
checa('elevação sh-4', r.sombra, SH4);

console.log('\n=== 3. OS SEIS MODAIS ===');
r = await page.evaluate(() => {
  const veus = { bug: '.bug-fundo', drive: '.gd-fundo', cfg: '.cfg-fundo',
                 recuperar: '.ftr-fundo', valores: '.val-fundo' };
  const caixas = { bug: '.bug-cx', drive: '.gd-janela', cfg: '.cfg-modal',
                   recuperar: '.ftr-cx', valores: '.val-caixa', arrastar: '.ft-drop-ft .cx' };
  const out = { veu: {}, caixa: {} };
  for (const [n, s] of Object.entries(veus)) {
    const el = document.querySelector(s);
    out.veu[n] = el ? getComputedStyle(el).backgroundColor : 'NÃO EXISTE';
  }
  for (const [n, s] of Object.entries(caixas)) {
    const el = document.querySelector(s);
    const c = el && getComputedStyle(el);
    out.caixa[n] = el ? { raio: c.borderRadius, sombra: c.boxShadow } : 'NÃO EXISTE';
  }
  return out;
});
for (const [n, v] of Object.entries(r.veu)) checa(`véu ${n} = rgba(14,17,22,.5)`, v, 'rgba(14, 17, 22, 0.5)');
for (const [n, v] of Object.entries(r.caixa)) {
  checa(`caixa ${n}: raio 16 (r-xl)`, v.raio, '16px');
  checa(`caixa ${n}: elevação sh-4`, v.sombra, SH4);
}

console.log('\n=== 4. O MENU "SALVAR EM" — o da imagem ===');
r = await page.evaluate(() => {
  const m = document.getElementById('ctxSalvar');
  m.style.display = 'block';
  const it = document.getElementById('opSalvarTrabalho');
  const c = getComputedStyle(it);
  const rIt = it.getBoundingClientRect(), rM = m.getBoundingClientRect();
  const sep = m.querySelector('.ft-pop-sep');
  const cs = sep && getComputedStyle(sep);
  const largItens = [...m.querySelectorAll('.ft-ctx-opcao')].map(o => Math.round(o.getBoundingClientRect().width));
  const topos = [...m.querySelectorAll('.ft-ctx-opcao')].map(o => Math.round(o.getBoundingClientRect().top));
  /* medir ANTES de esconder: o objeto de retorno é avaliado depois desta
     linha, e com display:'' o offsetWidth volta a ser 0 */
  const sobra = m.offsetWidth - it.offsetWidth;
  m.style.display = '';
  return {
    padding: c.padding, raio: c.borderRadius, fonte: c.fontSize, peso: c.fontWeight,
    borda: c.borderTopWidth, fundo: c.backgroundColor,
    /* linha inteira, não pastilha: todos com a mesma largura */
    umaLarguraSo: new Set(largItens).size === 1,
    empilhados: topos.every((t, i) => i === 0 || t > topos[i - 1]),
    /* offsetWidth e NÃO getBoundingClientRect: o menu ainda está dentro de
       um ancestral com zoom (só sai para o <body> quando posiciona() o
       abre de verdade), e ali o rect vem em pixel de tela enquanto o
       recheio do CSS é layout — a conta 250-2-12 dava 13 em vez de 14
       porque eu estava subtraindo unidades diferentes. */
    sobra,
    separador: sep ? { altura: cs.height, cor: cs.backgroundColor, margem: cs.margin } : 'NÃO EXISTE',
  };
});
checa('item 9px 10px (kit --menu-item-py)', r.padding, '9px 10px');
checa('  raio 6 (r-sm)', r.raio, '6px');
checa('  fonte 13 (fs-13)', r.fonte, '13px');
checa('  peso normal, não 500 de pastilha', r.peso, '400');
checa('  sem contorno', r.borda, '0px');
checa('  fundo transparente', r.fundo, 'rgba(0, 0, 0, 0)');
checa('vira LISTA: itens da mesma largura', r.umaLarguraSo, true);
checa('  empilhados, um por linha', r.empilhados, true);
checa('  sobra = 2×6 de recheio + 2×1 de borda', r.sobra, 14);
checa('separador 1px', r.separador.altura, '1px');
checa('  na cor da borda', r.separador.cor, 'rgb(212, 212, 212)');
checa('  margem 5px 4px do kit', r.separador.margem, '5px 4px');

console.log('\n=== 5. HOVER SEGUE O §01: cinza, não vermelho ===');
r = await page.evaluate(() => {
  const regras = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } })
    .map(x => x.cssText).join('\n');
  const regra = sel => (regras.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}', 'g')) || []).join(' ');
  return {
    origItem: regra('.ft-orig-item:hover'),
    lista: regra('.ft-ctx-lista .ft-ctx-opcao:hover'),
    popItem: regra('.ft-pop-item:hover'),
  };
});
checa('origMenu: hover não pinta de vermelho', /C6161B|vermelho/.test(r.origItem), false);
checa('  usa o cinza de hover', /--ft-hover/.test(r.origItem), true);
checa('salvar/abrir: hover no cinza', /--ft-hover/.test(r.lista), true);
checa('a classe base do kit existe', /--ft-hover/.test(r.popItem), true);

console.log('\n=== 6. TEMA ESCURO: as cascas acompanham ===');
r = await page.evaluate(async () => {
  document.body.dataset.tema = 'escuro';
  await new Promise(s => setTimeout(s, 300));
  const lum = c => { const [R, G, B] = c.match(/\d+/g).map(Number); return +(0.2126 * R + 0.7152 * G + 0.0722 * B).toFixed(0); };
  const orig = getComputedStyle(document.getElementById('origMenu'));
  const gd = getComputedStyle(document.querySelector('.gd-janela'));
  const bug = getComputedStyle(document.querySelector('.bug-cx'));
  const out = { origFundo: lum(orig.backgroundColor), gdFundo: lum(gd.backgroundColor), bugFundo: lum(bug.backgroundColor) };
  document.body.dataset.tema = '';
  return out;
});
/* antes estes três usavam --ft-branco com fallback #fff cravado: no escuro
   ficavam brancos no meio da tela escura */
checa('origMenu escurece', r.origFundo < 90, true);
checa('janela do Drive escurece', r.gdFundo < 90, true);
checa('caixa do bug escurece', r.bugFundo < 90, true);

console.log('\n=== 7. COMPORTAMENTO: salvar e abrir continuam funcionando ===');
r = await page.evaluate(async () => {
  const ids = ['opSalvarTrabalho', 'opSalvarOrganizado', 'opSalvarCopia', 'opSalvarLocal',
               'opAbrirLocal', 'opAbrirDrive'];
  const existem = ids.filter(i => document.getElementById(i)).length;
  /* o separador não pode ter virado um item clicável */
  const sep = document.querySelector('#ctxSalvar .ft-pop-sep');
  return { existem, total: ids.length,
           sepNaoEhOpcao: !sep.classList.contains('ft-ctx-opcao'),
           sepSemId: !sep.id,
           opcoesDeSalvar: document.querySelectorAll('#ctxSalvar .ft-ctx-opcao').length };
});
checa('todos os destinos continuam lá', r.existem, r.total);
checa('o separador não virou opção', r.sepNaoEhOpcao, true);
checa('  e não tem id', r.sepSemId, true);
checa('4 destinos em Salvar em', r.opcoesDeSalvar, 4);

console.log('\n=== 8. NADA DISSO ENTRA NO A4 / TRELLO / PAPEL ===');
r = await page.evaluate(() => {
  const html = gerarHTML([]);
  const d = new DOMParser().parseFromString(html, 'text/html');
  return {
    noArquivo: d.querySelectorAll('.ft-contexto,.ft-orig-menu,.cfg-fundo,.gd-fundo,.ft-pop,.ft-pop-item').length,
    dentroDaFolha: document.querySelectorAll('.folha-a4 .ft-pop-item,.folha-a4 .ft-orig-menu').length,
  };
});
checa('nenhum painel vai para o Trello', r.noArquivo, 0);
checa('nenhum vive dentro da folha', r.dentroDaFolha, 0);
await page.emulateMedia({ media: 'print' });
r = await page.evaluate(() => ({
  orig: getComputedStyle(document.getElementById('origMenu')).display,
  cor: getComputedStyle(document.querySelector('.cor-menu')).display,
  dd: getComputedStyle(document.querySelector('.ft-dd-menu')).display,
}));
checa('no papel o menu de origem some', r.orig, 'none');
checa('  o de cores também', r.cor, 'none');
checa('  e o dropdown', r.dd, 'none');
await page.emulateMedia({ media: 'screen' });

console.log('\n' + '='.repeat(62));
checa('nenhum erro de página no total', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.274: PAINÉIS FLUTUANTES E MODAIS PELO KIT v5 §15');
