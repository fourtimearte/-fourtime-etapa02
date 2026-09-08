/* ================================================================
   O MENU DE REFERENCIA NA MEDIDA DA LISTA (v3.375)

   O QUE ESTAVA ERRADO

   O menu nascia com a largura do CAMPO: `max(240, largura da celula)`. O
   campo mora na folha A4, que encolhe junto com a tela, e o menu encolhia
   com ele. Com as 114 referencias do catalogo, medido:

     1920px de tela -> campo de 283px ->  72 nomes cortados de 114
     1440px         -> campo de 269px ->  82 cortados
     1280px         -> campo de 242px ->  98 cortados

   Nao era escala quebrada dentro do menu: a fonte dele e 12.5px em
   qualquer tela. Era o menu preso a um campo que encolhe.

   O QUE ESTA SUITE COBRA

     1. NENHUM NOME CORTADO, em quatro tamanhos de tela. E a conferencia
        que importa: ela nao pergunta pela largura, pergunta pelo que a
        pessoa reclamou.
     2. Que o menu fica CENTRADO no campo, agora que e mais largo que ele.
     3. Que ele nunca sai da tela, nem quando a lista pede mais do que a
        tela tem.
     4. Que a largura NAO muda enquanto se digita: ela sai da lista
        inteira, uma vez, na abertura.
     5. Que a dica aparece ACIMA da linha, com o nome inteiro e o codigo.
     6. Que o menu de tecido e as listas simples continuam inteiros.
   ================================================================ */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import path from 'path';

const ARQ = process.env.FT_ARQ || editorAtual();
let falhas = 0, feitas = 0;
function ok(nome, cond, extra) {
  feitas++;
  if (cond) console.log('  ok   ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (extra ? '  ->  ' + extra : '')); }
}

const b = await abreNavegador();
const erros = [];

/* uma aba por tamanho de tela: a largura do campo vem da folha A4, que
   depende da tela, e um tamanho so nao provaria nada */
const TELAS = [
  { w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 1280, h: 720 }, { w: 1024, h: 700 },
];

async function abre(tela) {
  const p = await b.newPage({ viewport: { width: tela.w, height: tela.h } });
  p.on('pageerror', e => erros.push(String(e).slice(0, 180)));
  await p.goto(path.isAbsolute(ARQ) ? 'file://' + ARQ : 'file://' + path.resolve(ARQ));
  await esperaPronto(p);
  return p;
}

console.log('\n=== 1. NENHUM NOME CORTADO, EM QUALQUER TELA ===');
for (const tela of TELAS) {
  const p = await abre(tela);
  const r = await p.evaluate(() => {
    const ta = document.querySelector('.combo-ref textarea');
    if (!ta) return { erro: 'sem campo de referencia' };
    ta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const m = document.getElementById('pickMenu');
    if (!m || getComputedStyle(m).display === 'none') return { erro: 'o menu nao abriu' };
    /* todos os grupos abertos: um item fechado nao tem layout e mediria
       zero, e zero cortado por falta de layout nao prova nada */
    m.querySelectorAll('.pick-grp').forEach(g => g.classList.add('aberto'));
    const caixa = ta.closest('.hd-campo,.hd-meia,.rl-campo,.ft-combo') || ta;
    const rc = caixa.getBoundingClientRect(), rm = m.getBoundingClientRect();
    let cortados = 0, itens = 0, pior = '';
    m.querySelectorAll('.pick-item .nm').forEach(n => {
      itens++;
      if (n.scrollWidth - n.clientWidth > 0) { cortados++; if (!pior) pior = n.textContent.trim().slice(0, 44); }
    });
    return {
      itens, cortados, pior,
      menuW: +rm.width.toFixed(1), campoW: +rc.width.toFixed(1),
      centrado: Math.abs((rm.left + rm.width / 2) - (rc.left + rc.width / 2)) < 1.5,
      naTela: rm.left >= 11 && rm.right <= window.innerWidth - 11,
      naoEncolheu: rm.width >= rc.width - 0.5,
      fonte: getComputedStyle(m.querySelector('.pick-item')).fontSize,
    };
  });
  const t = tela.w + 'x' + tela.h;
  if (r.erro) { ok('[' + t + '] o menu de referencia abre', false, r.erro); await p.close(); continue; }
  ok('[' + t + '] nenhum dos ' + r.itens + ' nomes sai cortado',
     r.cortados === 0, r.cortados + ' cortados, o primeiro: ' + r.pior);
  ok('  e o menu fica centrado no campo', r.centrado,
     'menu ' + r.menuW + 'px, campo ' + r.campoW + 'px');
  ok('  sem sair da tela', r.naTela);
  ok('  e nunca mais estreito que o campo', r.naoEncolheu,
     r.menuW + ' vs ' + r.campoW);
  /* a fonte NAO encolhe em tela pequena: quem reclamou reclamou de LER, e
     letra menor e o contrario do pedido. Quem cede e a largura */
  ok('  com a fonte de sempre, sem encolher', r.fonte === '12.5px', r.fonte);
  await p.close();
}

console.log('\n=== 2. A LARGURA SAI DA LISTA, E NAO DO CAMPO ===');
{
  const p = await abre({ w: 1440, h: 900 });
  const r = await p.evaluate(async () => {
    const ta = document.querySelector('.combo-ref textarea');
    ta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const m = document.getElementById('pickMenu');
    const w0 = m.getBoundingClientRect().width;
    const busca = m.querySelector('.pick-busca');
    const larguras = [];
    for (const t of ['rag', 'raglan', 'ra', '', 'zzz']) {
      busca.value = t; busca.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
      larguras.push(m.getBoundingClientRect().width);
    }
    return { w0: +w0.toFixed(1), larguras: larguras.map(x => +x.toFixed(1)),
             estavel: larguras.every(x => Math.abs(x - w0) < 0.5) };
  });
  /* SE A LARGURA SEGUISSE A LISTA FILTRADA, o menu mudaria de tamanho a
     cada tecla, debaixo do mouse de quem esta escolhendo. Ela sai da
     lista INTEIRA, uma vez, na abertura. */
  ok('a largura nao muda enquanto se digita', r.estavel,
     r.w0 + ' -> ' + r.larguras.join(', '));
  await p.close();
}

console.log('\n=== 3. A TELA E O TETO ===');
{
  const p = await abre({ w: 480, h: 700 });
  const r = await p.evaluate(() => {
    const ta = document.querySelector('.combo-ref textarea');
    ta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const m = document.getElementById('pickMenu');
    const rm = m.getBoundingClientRect();
    return { w: +rm.width.toFixed(1), left: +rm.left.toFixed(1), tela: window.innerWidth,
             naTela: rm.left >= 11 && rm.right <= window.innerWidth - 11 };
  });
  /* numa tela de 480px a lista pede 502px. Nenhuma lista pode empurrar o
     menu para fora da tela: o teto e a tela menos o respiro. */
  ok('numa tela estreita o menu para no limite dela', r.naTela,
     'menu ' + r.w + 'px em ' + r.tela + 'px, esquerda ' + r.left);
  ok('  e ainda assim usa quase toda a largura disponivel', r.w >= r.tela - 30,
     r.w + ' de ' + r.tela);
  await p.close();
}

console.log('\n=== 4. A DICA DO NOME INTEIRO ===');
{
  const p = await abre({ w: 1280, h: 720 });
  const r = await p.evaluate(async () => {
    const ta = document.querySelector('.combo-ref textarea');
    ta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const m = document.getElementById('pickMenu');
    m.querySelectorAll('.pick-grp').forEach(g => g.classList.add('aberto'));
    const d = document.getElementById('pickDica');
    if (!d) return { erro: 'a dica nao existe' };
    const antes = getComputedStyle(d).display;
    const itens = [...m.querySelectorAll('.pick-grp-lista .pick-item')];
    const it = itens[3] || itens[0];
    it.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    /* nao aparece NA HORA: ha um respiro de 140ms de proposito, senao
       descer a lista com o mouse acende uma dica por linha */
    await new Promise(r => setTimeout(r, 40));
    const naHora = getComputedStyle(d).display;
    await new Promise(r => setTimeout(r, 260));
    const depois = getComputedStyle(d).display;
    const rd = d.getBoundingClientRect(), ri = it.getBoundingClientRect();
    const nome = it.querySelector('.nm').textContent.trim();
    const cod = it.querySelector('.cod') ? it.querySelector('.cod').textContent.trim() : '';
    const o = {
      antes, naHora, depois,
      acima: rd.bottom <= ri.top + 0.5,
      temNome: d.textContent.includes(nome),
      temCod: !cod || d.textContent.includes(cod),
      naTela: rd.left >= 9 && rd.right <= window.innerWidth - 9
              && rd.top >= 9 && rd.bottom <= window.innerHeight - 9,
    };
    pickFecha();
    await new Promise(r => setTimeout(r, 60));
    o.sumiuComOMenu = getComputedStyle(d).display === 'none';
    return o;
  });
  if (r.erro) ok('a dica existe', false, r.erro);
  else {
    ok('a dica comeca escondida', r.antes === 'none', r.antes);
    ok('  e nao pula na frente do mouse: espera o respiro', r.naHora === 'none', r.naHora);
    ok('  passar o mouse na linha mostra a dica', r.depois === 'block', r.depois);
    ok('  ACIMA da linha, para nao tapar a proxima referencia', r.acima);
    ok('  com o nome inteiro', r.temNome);
    ok('  e o codigo junto', r.temCod);
    ok('  sem sair da tela', r.naTela);
    ok('  e ela some quando o menu fecha', r.sumiuComOMenu);
  }
  await p.close();
}

console.log('\n=== 5. OS OUTROS MENUS CONTINUAM INTEIROS ===');
{
  const p = await abre({ w: 1280, h: 720 });
  const r = await p.evaluate(() => {
    const out = {};
    const mede = (sel, nome) => {
      const ta = document.querySelector(sel);
      if (!ta) { out[nome] = { erro: 'sem campo' }; return; }
      ta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const m = document.getElementById('pickMenu');
      if (!m || getComputedStyle(m).display === 'none') { out[nome] = { erro: 'nao abriu' }; return; }
      m.querySelectorAll('.pick-grp').forEach(g => g.classList.add('aberto'));
      const caixa = ta.closest('.hd-campo,.hd-meia,.rl-campo,.ft-combo') || ta;
      const rc = caixa.getBoundingClientRect(), rm = m.getBoundingClientRect();
      let cort = 0, tot = 0;
      m.querySelectorAll('.pick-item .nm').forEach(n => { tot++; if (n.scrollWidth - n.clientWidth > 0) cort++; });
      out[nome] = { itens: tot, cortados: cort,
        centrado: Math.abs((rm.left + rm.width / 2) - (rc.left + rc.width / 2)) < 1.5,
        naTela: rm.left >= 11 && rm.right <= window.innerWidth - 11,
        piso: rm.width >= 240 - 0.5 };
      pickFecha();
    };
    mede('.combo-tecido textarea', 'tecido');
    mede('[data-h="cliente"]', 'cliente');
    return out;
  });
  ok('o menu de tecido nao corta nenhum nome',
     r.tecido && r.tecido.cortados === 0, JSON.stringify(r.tecido));
  ok('  centrado no campo e dentro da tela',
     r.tecido && r.tecido.centrado && r.tecido.naTela, JSON.stringify(r.tecido));
  ok('a lista simples do cabecalho continua com o piso de 240px',
     r.cliente && r.cliente.piso && r.cliente.naTela, JSON.stringify(r.cliente));
  await p.close();
}

console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
if (erros.length) { console.log('  erros de pagina: ' + erros.slice(0, 3).join(' // ')); falhas++; }
await b.close();
process.exit(falhas ? 1 : 0);
