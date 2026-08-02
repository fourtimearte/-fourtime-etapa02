/* v3.271 — botões e campos da INTERFACE pelo Design Kit v5 §07.

   A regra do escopo é o que este teste guarda: o contrato novo vale nos
   painéis da interface e NÃO alcança o A4 do orçamento nem o relatório. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const browser = await abreNavegador();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v276.html').href);
await esperaPronto(page);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), '3.276');
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. TOKENS DE CONTROLE DO KIT ===');
let r = await page.evaluate(() => {
  const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return { h: v('--ft-ctrl-h'), sm: v('--ft-ctrl-h-sm'), px: v('--ft-ctrl-px'), anel: v('--ft-anel') };
}); 
checa('--ft-ctrl-h = 36px (kit --control-h)', r.h, '36px');
checa('--ft-ctrl-h-sm = 30px', r.sm, '30px');
checa('--ft-ctrl-px = 14px', r.px, '14px');
checa('anel de foco definido', r.anel.length > 0, true);

console.log('\n=== 2. AS 4 VARIANTES DO KIT EXISTEM ===');
r = await page.evaluate(() => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:-9999px;top:0';
  d.innerHTML = '<button class="ft-btn ft-btn-primario">a</button>' +
                '<button class="ft-btn ft-btn-secundario">b</button>' +
                '<button class="ft-btn ft-btn-fantasma">c</button>' +
                '<button class="ft-btn ft-btn-perigo">d</button>' +
                '<button class="ft-btn sm ft-btn-primario">e</button>' +
                '<button class="ft-icobt">f</button>' +
                '<input class="ft-campo"><input class="ft-campo invalido">';
  document.body.appendChild(d);
  const g = i => getComputedStyle(d.children[i]);
  const out = {
    alturaBase: g(0).height, raioBase: g(0).borderRadius,
    primario: g(0).backgroundColor, primarioTxt: g(0).color,
    secundario: g(1).backgroundColor, secundarioBorda: g(1).borderTopColor,
    fantasma: g(2).backgroundColor,
    pequeno: g(4).height,
    icone: [g(5).width, g(5).height],
    campoAltura: g(6).height, campoRaio: g(6).borderRadius,
    invalidoBorda: g(7).borderTopColor,
  };
  d.remove();
  return out;
});
checa('botão com 36px de altura', r.alturaBase, '36px');
checa('  raio r-sm 6px (v3.275)', r.raioBase, '6px');
checa('primário no vermelho da marca', r.primario, 'rgb(198, 22, 27)');
checa('  texto branco', r.primarioTxt, 'rgb(255, 255, 255)');
checa('secundário na superfície com borda', r.secundarioBorda, 'rgb(212, 212, 212)');
checa('fantasma sem fundo', r.fantasma, 'rgba(0, 0, 0, 0)');
checa('tamanho sm = 30px', r.pequeno, '30px');
checa('botão de ícone 36×36', r.icone, ['36px', '36px']);
checa('campo com 36px', r.campoAltura, '36px');
checa('  raio 6px (v3.275)', r.campoRaio, '6px');
checa('campo inválido em vermelho', r.invalidoBorda, 'rgb(198, 22, 27)');

console.log('\n=== 3. O CONTRATO CHEGA AOS BOTÕES QUE JÁ EXISTIAM ===');
r = await page.evaluate(() => {
  const regras = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } })
    .map(x => x.cssText).join('\n');
  const alvo = document.querySelector('.ft-menu button, .ft-menu .ft-menu-item');
  const c = alvo ? getComputedStyle(alvo) : {};
  return {
    temFoco: /:focus-visible/.test(regras) && /--ft-anel/.test(regras),
    temPressionar: /:active[^{]*\{[^}]*a-pressionar/.test(regras),
    transicaoNoMenu: c.transitionProperty || '',
  };
}); 
checa('o anel de foco está no CSS', r.temFoco, true);
checa('o pressionar está no CSS', r.temPressionar, true);
checa('os controles do menu têm transição', /background|color/.test(r.transicaoNoMenu), true);

/* prova de comportamento: dar foco de teclado num botão do painel e medir */
r = await page.evaluate(async () => {
  const painel = document.getElementById('ctxCustom');
  painel.style.display = 'block';
  const bt = painel.querySelector('button');
  bt.focus({ focusVisible: true });
  await new Promise(s => setTimeout(s, 250));
  const sombra = getComputedStyle(bt).boxShadow;
  painel.style.display = '';
  return { sombra, temAnel: sombra !== 'none' };
}); 
checa('botão focado ganha o anel de verdade', r.temAnel, true);
console.log('     (' + r.sombra + ')');

console.log('\n=== 4. RAIOS NA ESCALA DO KIT ===');
r = await page.evaluate(async () => {
  /* .pick-item só existe DEPOIS que a lista é montada — no carregamento não
     há nenhum no DOM e o teste lia null. Abro o picker antes de medir. */
  document.querySelector('[data-h="vendedor"]')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await new Promise(s => setTimeout(s, 250));
  const um = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).borderRadius : null; };
  const out = { pick: um('.pick-item'), opcao: um('.ft-ctx-opcao'), ccBtn: um('.cc-btn'),
                calBtn: um('.cal-btn'), ccAba: um('.cc-aba') };
  document.getElementById('pickMenu').style.display = 'none';
  return out;
}); 
checa('itens de lista em 6px', [r.pick, r.opcao, r.ccAba], ['6px', '6px', '6px']);
checa('botões em 6px (v3.275)', [r.ccBtn, r.calBtn], ['6px', '6px']);

console.log('\n=== 5. O ESCOPO NÃO ALCANÇA O DOCUMENTO ===');
/* é esta seção que garante o "não mexa no A4 nem no relatório" */
r = await page.evaluate(() => {
  const regras = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } })
    .map(x => x.cssText).join('\n');
  const escopo = (regras.match(/:is\(\.ft-menu[^)]*\)/) || [''])[0];
  return {
    escopo,
    citaFolha: /folha-a4/.test(escopo),
    citaRelatorio: /rel-folha/.test(escopo) || /relPage/.test(escopo),
    containers: (escopo.match(/[#.][\w-]+/g) || []).length,
  };
}); 
checa('o escopo é uma lista explícita', r.containers > 15, true);
checa('não cita a folha do orçamento', r.citaFolha, false);
checa('não cita o relatório', r.citaRelatorio, false);

/* e a prova visual: os botões DENTRO da folha não podem ter mudado */
r = await page.evaluate(() => {
  const alvos = ['.folha-a4 .hd-abrir', '.folha-a4 .ft-combo-abrir', '.folha-a4 .design-add',
                 '.folha-a4 .lay-del', '.folha-a4 .hd-cal'];
  const m = {};
  alvos.forEach(sel => {
    const e = document.querySelector(sel);
    if (!e) { m[sel] = 'ausente'; return; }
    const c = getComputedStyle(e);
    m[sel] = { raio: c.borderRadius, anim: c.animationName };
  });
  return m;
}); 
Object.entries(r).forEach(([sel, v]) => {
  if (v === 'ausente') return;
  checa('sem pressionar em ' + sel.replace('.folha-a4 ', ''), v.anim, 'none');
}); 

console.log('\n=== 6. NADA QUEBROU NO QUE JÁ FUNCIONAVA ===');
r = await page.evaluate(async () => {
  const espera = ms => new Promise(s => setTimeout(s, ms));
  /* abre a lista de vendedores pelo caminho real (mousedown) */
  document.querySelector('[data-h="vendedor"]')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await espera(220);
  const menu = document.getElementById('pickMenu');
  const abriu = getComputedStyle(menu).display !== 'none';
  const itens = menu.querySelectorAll('.pick-item').length;
  /* escolhe o primeiro */
  const primeiro = menu.querySelector('.pick-item');
  const valor = primeiro ? primeiro.dataset.v : null;
  if (primeiro) primeiro.click();
  await espera(220);
  const escolhido = document.querySelector('[data-h="vendedor"]').value;
  menu.style.display = 'none';
  return { abriu, itens, valor, escolhido };
}); 
checa('a lista abre', r.abriu, true);
checa('  com itens', r.itens > 0, true);
checa('  e escolher preenche o campo', r.escolhido, r.valor);

r = await page.evaluate(async () => {
  const espera = ms => new Promise(s => setTimeout(s, ms));
  const p = document.getElementById('ctxCustom');
  p.style.display = 'block';
  await espera(150);
  const aberto = getComputedStyle(p).display;
  p.style.display = '';
  return aberto;
}); 
checa('o painel de desenvolvimento abre', r, 'block');

console.log('\n=== 7. IMPRESSÃO E TRELLO ===');
r = await page.evaluate(() => {
  const html = gerarHTML([]);
  return { temVariantes: /\.ft-btn-primario/.test(html),
           temEscopo: /:is\(\.ft-menu/.test(html),
           menuNoArquivo: /class="ft-menu"/.test(html) };
}); 
/* o CSS vai junto (é um arquivo só), mas os painéis não — então as regras
   ficam inertes lá dentro. O que importa é que o menu não vá. */
checa('o menu não vai para o Trello', r.menuNoArquivo, false);
await page.emulateMedia({ media: 'print' });
r = await page.evaluate(() => ({
  menu: getComputedStyle(document.querySelector('.ft-menu')).display,
  rail: getComputedStyle(document.querySelector('.ft-rail')).display,
}));
checa('no papel o menu some', r.menu, 'none');
checa('  e o trilho também', r.rail, 'none');
await page.emulateMedia({ media: 'screen' });

console.log('\n=== 8. TEMA ESCURO ===');
r = await page.evaluate(async () => {
  document.body.dataset.tema = 'escuro';
  await new Promise(s => setTimeout(s, 300));
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:-9999px';
  d.innerHTML = '<button class="ft-btn ft-btn-secundario">x</button><input class="ft-campo">';
  document.body.appendChild(d);
  const b = getComputedStyle(d.children[0]), i = getComputedStyle(d.children[1]);
  /* qual token exatamente vence no color do input depende de quem mais
     escreve em input{} — o que importa é o CONTRASTE: texto claro sobre
     fundo escuro. Medir luminância diz isso; comparar hex vira checagem
     de qual regra ganhou, que não é o que este teste protege. */
  const lum = cor => { const [R, G, B] = cor.match(/\d+/g).map(Number);
    return (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255; };
  const out = { botao: b.backgroundColor, campo: i.backgroundColor,
                lumTexto: +lum(i.color).toFixed(2), lumFundo: +lum(i.backgroundColor).toFixed(2) };
  d.remove(); document.body.dataset.tema = '';
  return out;
}); 
checa('secundário escurece', r.botao, 'rgb(35, 41, 48)');
checa('campo escurece', r.campo, 'rgb(35, 41, 48)');
checa('  com texto claro sobre fundo escuro', r.lumTexto > .8 && r.lumFundo < .2, true);
console.log(`     (luminância texto ${r.lumTexto} · fundo ${r.lumFundo})`);

console.log('\n' + '='.repeat(62));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.271: BOTÕES E CAMPOS PELO KIT v5 §07');
