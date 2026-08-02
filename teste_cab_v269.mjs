/* v3.269 — cabeçalho variante C + barra de aviso vazada.
   O que este teste protege: a mudança é VISUAL, mas mexe no markup que o
   formato .ft, a exportação para o Trello e a impressão leem. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const ARQ = DIR+'fourtime-editor-v276.html';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}
function quase(r, o, e, tol) {
  const ok = Math.abs(o - e) <= tol;
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(52)} obtido=${o} esperado=${e}±${tol}`);
  if (!ok) falhas.push(r);
}

const browser = await abreNavegador();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(ARQ).href);
await esperaPronto(page);
await page.evaluate(() => { window.CC_ESC_FOLHA = 1; aplicaZoom(); });

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), '3.276');
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. A ORDEM DOS CAMPOS ===');
let r = await page.evaluate(() => {
  /* a célula dividida É um .hd-campo e contém dois .hd-meia: sem o :not ela
     entra duas vezes na lista (foi o que a 1ª versão do teste fez) */
  const cel = [...document.querySelectorAll(
    '.doc-header .hd-campo:not(.hd-dupla), .doc-header .hd-meia')];
  return cel.map(c => (c.querySelector('.hd-label') || {}).textContent || '?');
});
checa('11 posições na ordem combinada', r,
  ['Cliente', 'CPF/CNPJ', 'Pedido Nº', 'Envio', 'Vendedor', 'Departamento',
   'Entrega', 'Total', 'Embalagem', 'Pagamento', 'Status']);

console.log('\n=== 2. A GRADE DE VERDADE (coluna × fileira) ===');
/* medir a posição na tela é a única prova de que a grade colocou cada campo
   onde se pediu — a ordem no HTML sozinha não garante isso */
r = await page.evaluate(() => {
  const h = document.querySelector('.doc-header').getBoundingClientRect();
  const col = x => Math.round((x - h.left) / (h.width / 4)) + 1;
  const lin = y => Math.round((y - h.top) / (h.height / 3)) + 1;
  const m = {};
  document.querySelectorAll('.doc-header .hd-campo').forEach(c => {
    const k = (c.querySelector('.hd-label') || {}).textContent || '?';
    const b = c.getBoundingClientRect();
    m[k] = col(b.left) + 'x' + lin(b.top);
  });
  const lb = document.querySelector('.logo-box').getBoundingClientRect();
  m['LOGO'] = col(lb.left) + 'x' + lin(lb.top) + ' span' + Math.round(lb.height / (h.height / 3));
  return m;
});
checa('logo: coluna 1, fileiras 1-2', r.LOGO, '1x1 span2');
checa('Total: coluna 1, fileira 3', r.Total, '1x3');
checa('Cliente: coluna 2, fileira 1', r.Cliente, '2x1');
checa('Vendedor: coluna 2, fileira 2', r.Vendedor, '2x2');
checa('Embalagem: coluna 2, fileira 3', r.Embalagem, '2x3');
checa('CPF/CNPJ: coluna 3, fileira 1', r['CPF/CNPJ'], '3x1');
checa('Departamento: coluna 3, fileira 2', r.Departamento, '3x2');
checa('Pagamento: coluna 3, fileira 3', r.Pagamento, '3x3');
checa('Pedido+Envio: coluna 4, fileira 1', r['Pedido Nº'], '4x1');
checa('Entrega: coluna 4, fileira 2', r.Entrega, '4x2');
checa('Status: coluna 4, fileira 3', r.Status, '4x3');

console.log('\n=== 3. ALTURA ===');
r = await page.evaluate(() => {
  const mm = px => +(px / (96 / 25.4)).toFixed(1);
  return { cab: mm(document.querySelector('.doc-header').getBoundingClientRect().height),
           aviso: mm(document.querySelector('.warn-bar').getBoundingClientRect().height),
           fileiras: [...document.querySelectorAll('.doc-header .hd-campo')]
             .map(c => mm(c.getBoundingClientRect().height)) };
});
quase('cabeçalho ~28 mm (era 31,4)', r.cab, 28.3, 0.6);
checa('as 3 fileiras têm a mesma altura', [...new Set(r.fileiras)].length, 1);
console.log(`     (aviso ${r.aviso} mm)`);

console.log('\n=== 4. CONTATO SAIU DE VISTA MAS CONTINUA VIVO ===');
r = await page.evaluate(() => {
  const el = document.querySelector('[data-h="contato"]');
  return { existe: !!el, largura: el ? Math.round(el.getBoundingClientRect().width) : -1,
           noCabecalho: !!(el && el.closest('.doc-header')) };
});
checa('o campo existe no DOM', r.existe, true);
checa('  dentro do cabeçalho', r.noCabecalho, true);
checa('  mas sem área na tela', r.largura <= 2, true);

console.log('\n=== 5. SALVAR E ABRIR NÃO PERDE NADA (formato .ft) ===');
r = await page.evaluate(() => {
  const vals = { cliente: 'ACAI NO COCO', cpf: '25.260.940/0001-40', pedido: 'PD003929',
                 envio: '22/08/2026', vendedor: 'Henrique', departamento: 'Uniforme',
                 entrega: 'Retirada', embalagem: 'Saco', pagamento: '50% + 50%',
                 contato: 'WhatsApp 62 99999-0000' };
  Object.entries(vals).forEach(([k, v]) => {
    const el = document.querySelector('[data-h="' + k + '"]');
    if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  const doc = coletaEstado();
  /* zera tudo e reabre: é o caminho real de salvar e abrir */
  Object.keys(vals).forEach(k => {
    const el = document.querySelector('[data-h="' + k + '"]'); if (el) el.value = '';
  });
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'teste.ft', 'trabalho');
  const depois = {};
  Object.keys(vals).forEach(k => {
    const el = document.querySelector('[data-h="' + k + '"]');
    depois[k] = el ? el.value : null;
  });
  return { gravado: doc.header, depois, iguais: Object.entries(vals)
             .every(([k, v]) => depois[k] === v) };
});
checa('contato foi gravado no .ft', r.gravado.contato, 'WhatsApp 62 99999-0000');
checa('  e voltou ao reabrir', r.depois.contato, 'WhatsApp 62 99999-0000');
checa('todos os campos do cabeçalho voltaram', r.iguais, true);

console.log('\n=== 6. OS CONTROLES CONTINUAM LIGADOS ===');
r = await page.evaluate(() => ({
  setas: document.querySelectorAll('.doc-header .hd-abrir').length,
  calendario: !!document.querySelector('.doc-header .hd-cal'),
  botaoTag: !!document.querySelector('.doc-header .hd-tags-add'),
  totPecas: !!document.getElementById('hdTotPecas'),
  totValor: !!document.getElementById('hdTotValor'),
}));
checa('6 setas de lista', r.setas, 6);
checa('calendário do Envio', r.calendario, true);
checa('botão de tag do Status', r.botaoTag, true);
checa('ids dos totais preservados', [r.totPecas, r.totValor], [true, true]);

r = await page.evaluate(async () => {
  /* o picker abre em MOUSEDOWN, não em click — .click() não dispara mousedown
     e o teste dava falso negativo */
  document.querySelector('[data-h="vendedor"]').closest('.hd-input-wrap')
    .querySelector('.hd-abrir')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await new Promise(s => setTimeout(s, 250));
  const m = document.getElementById('pickMenu');
  const aberto = !!m && getComputedStyle(m).display !== 'none';
  if (m) m.style.display = 'none';
  return aberto;
});
checa('a seta abre a lista de vendedores', r, true);

console.log('\n=== 7. TIPOGRAFIA: cabeçalho em Plex, resto em Roboto ===');
r = await page.evaluate(() => {
  const f = e => getComputedStyle(e).fontFamily;
  return {
    cabecalho: f(document.querySelector('.doc-header [data-h="cliente"]')),
    cpfMono: f(document.querySelector('.doc-header [data-h="cpf"]')),
    aviso: f(document.querySelector('.warn-bar')),
    refDoLayout: f(document.querySelector('.lay-modulo textarea')),
    tabela: f(document.querySelector('.lay-tabela-mini td')),
    rodape: f(document.querySelector('.rodape-endereco')),
  };
});
checa('cliente em IBM Plex Sans', /IBM Plex Sans/.test(r.cabecalho), true);
checa('CNPJ em IBM Plex Mono', /IBM Plex Mono/.test(r.cpfMono), true);
checa('aviso em IBM Plex Sans', /IBM Plex Sans/.test(r.aviso), true);
checa('o RESTO do A4 continua Roboto — referência', /Roboto/.test(r.refDoLayout), true);
checa('  tabela de tamanhos', /Roboto/.test(r.tabela), true);
checa('  rodapé', /Roboto/.test(r.rodape), true);

console.log('\n=== 8. BARRA DE AVISO VAZADA (kit §01) ===');
r = await page.evaluate(() => {
  const c = getComputedStyle(document.querySelector('.warn-bar'));
  return { fundo: c.backgroundColor, cor: c.color, raio: c.borderRadius,
           /* a LARGURA é o que prova que a borda existe. borderTopColor
              continua devolvendo o vermelho mesmo com largura 0 — a
              asserção antiga passaria com a moldura inteira apagada. */
           larguras: [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth],
           corDeBaixo: c.borderBottomColor };
});
checa('fundo suave, não sólido', r.fundo, 'rgb(253, 241, 241)');
checa('texto no vermelho da marca', r.cor, 'rgb(198, 22, 27)');
/* v3.274: só o traço de baixo, não a moldura inteira */
checa('só a borda de baixo', r.larguras, ['0px', '0px', '1px', '0px']);
checa('  no vermelho da marca', r.corDeBaixo, 'rgb(198, 22, 27)');
checa('raio 4px', r.raio, '4px');

console.log('\n=== 8b. TAGS DO STATUS (o defeito da 1ª entrega) ===');
/* A tag entrava no DOM e era CORTADA: o chip tem 20 px e a célula ficou com
   4 mm úteis depois que a fileira apertou, com overflow:hidden por cima.
   E o visual estava sólido, contra o kit §01 (alerta = contorno). */
r = await page.evaluate(async () => {
  const espera = ms => new Promise(s => setTimeout(s, ms));
  for (const t of ['URGENTE', 'ATRASADO']) {
    document.querySelector('.hd-tags-add').click();
    await espera(150);
    document.querySelector('#ctxObs .ft-ctx-opcao[data-tag="' + t + '"]').click();
    await espera(150);
  }
  document.getElementById('ctxObs').style.display = 'none';
  const tags = [...document.querySelectorAll('.hd-tags-wrap .design-tag')];
  const cel = tags[0].closest('.hd-campo').getBoundingClientRect();
  const c = getComputedStyle(tags[0]);
  return {
    quantas: tags.length,
    nomes: tags.map(t => t.dataset.tag),
    todasInteiras: tags.every(t => {
      const b = t.getBoundingClientRect();
      return b.bottom <= cel.bottom + .5 && b.top >= cel.top - .5;
    }),
    umaLinha: new Set(tags.map(t => Math.round(t.getBoundingClientRect().top))).size === 1,
    fundo: c.backgroundColor, cor: c.color, borda: c.borderTopColor, raio: c.borderRadius,
  };
});
checa('as duas tags entram', r.quantas, 2);
checa('  URGENTE e ATRASADO', r.nomes, ['URGENTE', 'ATRASADO']);
checa('nenhuma é cortada pela célula', r.todasInteiras, true);
checa('  e as duas cabem na MESMA linha', r.umaLinha, true);
checa('vazada, não preenchida (kit §01)', r.fundo, 'rgba(0, 0, 0, 0)');
checa('  texto na cor do alerta', r.cor, 'rgb(198, 22, 27)');
checa('  borda na cor do alerta', r.borda, 'rgb(198, 22, 27)');
checa('  formato de pílula', r.raio, '999px');

console.log('\n=== 8c. CANTOS ARREDONDADOS ===');
r = await page.evaluate(() => {
  const c = getComputedStyle(document.querySelector('.doc-header'));
  return { raio: c.borderRadius, recorte: c.overflow,
           borda: c.borderTopWidth, fundo: c.backgroundColor, gap: c.gap };
});
checa('raio r-sm 6px (v3.275: o r-md do app virou r-sm)', r.raio, '6px');
/* v3.274: o quadro de fora saiu; as linhas INTERNAS não, porque são o gap
   sobre o fundo do container e nunca dependeram da borda */
checa('  sem borda externa', r.borda, '0px');
checa('  mas as linhas internas ficam (gap)', r.gap, '1px');
checa('  sobre o fundo que as desenha', r.fundo, 'rgb(212, 212, 212)');
/* sem o recorte, os cantos quadrados das CÉLULAS aparecem por cima do raio */
checa('  com recorte, senão as células vazam no canto', r.recorte, 'hidden');

console.log('\n=== 9. IMPRESSÃO ===');
await page.emulateMedia({ media: 'print' });
r = await page.evaluate(() => ({
  seta: getComputedStyle(document.querySelector('.doc-header .hd-abrir')).display,
  cal: getComputedStyle(document.querySelector('.doc-header .hd-cal')).display,
  tag: getComputedStyle(document.querySelector('.doc-header .hd-tags-add')).display,
  cabecalho: getComputedStyle(document.querySelector('.doc-header')).display,
  aviso: getComputedStyle(document.querySelector('.warn-bar')).display,
  corExata: getComputedStyle(document.querySelector('.warn-bar')).printColorAdjust,
}));
checa('as setas somem no papel', r.seta, 'none');
checa('o calendário some', r.cal, 'none');
checa('o "+" das tags some', r.tag, 'none');
checa('o cabeçalho fica', r.cabecalho, 'grid');
checa('a barra fica', r.aviso, 'flex');
checa('  com a cor forçada', r.corExata, 'exact');
await page.emulateMedia({ media: 'screen' });

console.log('\n=== 10. EXPORTAÇÃO PARA O TRELLO ===');
r = await page.evaluate(() => {
  const html = gerarHTML([]);
  const d = new DOMParser().parseFromString(html, 'text/html');
  const cab = d.querySelector('.doc-header');
  return {
    temCabecalho: !!cab,
    campos: [...d.querySelectorAll('.doc-header [data-h]')].map(e => e.dataset.h),
    contatoValor: (d.querySelector('[data-h="contato"]') || {}).value,
    clienteValor: (d.querySelector('[data-h="cliente"]') || {}).value,
    temBarra: !!d.querySelector('.warn-bar'),
    setasRemovidas: d.querySelectorAll('.doc-header .hd-abrir').length,
    calRemovido: d.querySelectorAll('.doc-header .hd-cal').length,
    cssCelular: /\.hd-dupla/.test(html) && /\.hd-oculto\{display:none/.test(html),
    tamanho: Math.round(html.length / 1024) + ' KB',
  };
});
checa('o cabeçalho vai no arquivo', r.temCabecalho, true);
checa('com os 11 campos', r.campos.length, 11);
checa('  incluindo contato', r.campos.includes('contato'), true);
checa('o valor do cliente vai junto', r.clienteValor, 'ACAI NO COCO');
checa('  e o do contato também', r.contatoValor, 'WhatsApp 62 99999-0000');
checa('a barra de aviso vai', r.temBarra, true);
checa('as setas não vão (não são clicáveis lá)', r.setasRemovidas, 0);
checa('nem o calendário', r.calRemovido, 0);
checa('o CSS de celular fala do novo cabeçalho', r.cssCelular, true);
console.log('     (arquivo gerado: ' + r.tamanho + ')');

console.log('\n=== 11. NADA VAZA DA FOLHA ===');
r = await page.evaluate(() => {
  const f = document.querySelector('.folha-a4').getBoundingClientRect();
  const fora = [];
  document.querySelectorAll('.doc-header *, .warn-bar').forEach(e => {
    const b = e.getBoundingClientRect();
    if (b.width && (b.right > f.right - 18 || b.left < f.left + 17))
      fora.push(e.className.toString().slice(0, 24));
  });
  return fora;
});
checa('nenhum elemento passa da margem', r, []);

console.log('\n' + '='.repeat(62));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.270: CABEÇALHO C + BARRA DE AVISO');
