/* ================================================================
   O NOME DA ARTE: LER DA IMAGEM OU DIGITAR (v3.359)

   A imagem colada do WhatsApp chega sem nome de arquivo, e sem nome nao
   ha busca no Explorer. Ate a v3.358 o botao SUMIA justamente nesse caso.

   Nada aqui depende da internet: o motor de OCR vem de CDN externo, e o
   que a suite prova e o desenho em volta dele, inclusive o que acontece
   quando o CDN nao vem.
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

/* 1x1 png, so para haver uma <img> de verdade no modulo */
const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const b = await abreNavegador();
const pagina = await b.newPage();
await pagina.goto('file://' + path.resolve(ARQ));
await esperaPronto(pagina);

/* ---------- 0. as pecas existem? ---------- */
/* Sem isto, uma versao sem a v3.359 morria de excecao no primeiro
   evaluate, e teste que estoura nao diz o que faltou. */
const pecas = await pagina.evaluate(() => ['arteOcrPedacos','arteOcrNota','arteOcrPrepara',
  'arteOcrLe','arteOcrCarrega','artePainel','ARTE_OCR']
  .filter(n => typeof window[n] === 'undefined'));
ok('as pecas do nome da arte existem', pecas.length === 0, 'faltam: ' + pecas.join(', '));
ok('o painel esta no documento', await pagina.evaluate(() => !!document.getElementById('ftArteFundo')));
if (pecas.length) {
  console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)  (parou: falta a v3.359)');
  await b.close(); process.exit(1);
}

/* ---------- 1. os pedacos, com o texto REAL que o motor devolveu ---------- */
const lidas = await pagina.evaluate(() => {
  /* Texto medido de verdade na arte do Henrique, degradada como o WhatsApp
     degrada. Os campos vem separados por UM espaco: nao ha onde cortar por
     pontuacao, e por isso a ancora e o codigo de data de seis digitos. */
  const casos = [
    '— es ‘ Res\nFI-010-000M CAMISETAMASCTRAD 3B CROSS 240326 24',
    'XY vm J\nFI-O10-000M  CAMISETAMASCTRAD 3B CROSS 240326 24',
    'FFO10-O00M CAMISETAMASC TRAD 3B CROSS 240326 24'
  ];
  return casos.map(t => arteOcrPedacos(t));
});
lidas.forEach((pd, i) => {
  ok('caso ' + (i + 1) + ': o nome da arte esta entre os dois primeiros',
     pd.slice(0, 2).some(t => /CROSS 240326$/.test(t)), JSON.stringify(pd.slice(0, 3)));
});
const so = await pagina.evaluate(() => arteOcrPedacos('ES RES\nXY VM\n5 .A ES\nMM . DM'));
ok('lixo de borda nao vira sugestao', so.length === 0, JSON.stringify(so));
const nota = await pagina.evaluate(() => ({
  arte: arteOcrNota('3B CROSS 240326'),
  ref:  arteOcrNota('FI-010-000M'),
  qtd:  arteOcrNota('24')
}));
ok('o nome da arte pontua acima da referencia', nota.arte > nota.ref, JSON.stringify(nota));
ok('o nome da arte pontua acima da quantidade', nota.arte > nota.qtd, JSON.stringify(nota));

/* ---------- 2. o botao, nos tres estados ---------- */
const est = await pagina.evaluate(async (PIX) => {
  const mod = document.querySelector('.lay-modulo');
  const bt = mod.querySelector('.lay-arte-bt');
  const out = {};
  arteBotaoAtualiza(mod);
  out.semImagem = bt.hidden;
  aplicaImagem(mod.querySelector('.lay-img'), PIX, '');
  await new Promise(r => setTimeout(r, 400));
  out.comImagemSemNome = { visivel: !bt.hidden, apagado: bt.classList.contains('sem-nome') };
  mod.querySelector('.lay-img img').dataset.arte = 'TEAM MASTER 040826 01';
  arteBotaoAtualiza(mod);
  out.comNome = { visivel: !bt.hidden, apagado: bt.classList.contains('sem-nome'), title: bt.title };
  mod.querySelector('.lay-img-limpar').click();
  await new Promise(r => setTimeout(r, 300));
  out.depoisDeLimpar = bt.hidden;
  return out;
}, PIX);
ok('sem imagem nao ha lupa', est.semImagem === true);
ok('com imagem e sem nome a lupa aparece', est.comImagemSemNome.visivel === true);
ok('e aparece APAGADA', est.comImagemSemNome.apagado === true);
ok('com nome a lupa acende', est.comNome.visivel && !est.comNome.apagado);
ok('o title com nome cita a busca', /Procurar/.test(est.comNome.title || ''), est.comNome.title);
ok('limpar a imagem apaga a lupa', est.depoisDeLimpar === true);

/* ---------- 3. o painel: abre, guarda, e o nome sobrevive ---------- */
const pn = await pagina.evaluate(async (PIX) => {
  const mod = document.querySelector('.lay-modulo');
  aplicaImagem(mod.querySelector('.lay-img'), PIX, '');
  await new Promise(r => setTimeout(r, 400));
  const bt = mod.querySelector('.lay-arte-bt');
  const fundo = document.getElementById('ftArteFundo');
  const out = {};
  bt.click();
  await new Promise(r => setTimeout(r, 150));
  out.abriuComCliqueEsquerdo = fundo.classList.contains('on');
  document.getElementById('ftArteCampo').value = 'aviacao naval 120826';
  document.getElementById('ftArteOk').click();
  await new Promise(r => setTimeout(r, 150));
  out.fechou = !fundo.classList.contains('on');
  out.gravado = mod.querySelector('.lay-img img').dataset.arte;
  out.lupaAcendeu = !bt.classList.contains('sem-nome');
  out.termo = arteTermo(arteNomeDoModulo(mod));
  /* botao direito com nome: abre para corrigir */
  bt.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 150));
  out.abriuComBotaoDireito = fundo.classList.contains('on');
  out.campoTrouxeONome = document.getElementById('ftArteCampo').value;
  document.getElementById('ftArteCancela').click();
  return out;
}, PIX);
ok('clique esquerdo sem nome abre o painel', pn.abriuComCliqueEsquerdo === true);
ok('guardar fecha o painel', pn.fechou === true);
ok('o nome digitado foi para data-arte', pn.gravado === 'AVIACAO NAVAL 120826', pn.gravado);
ok('a lupa acende depois de guardar', pn.lupaAcendeu === true);
ok('arteTermo tira a variacao de layout', pn.termo === 'AVIACAO NAVAL 120826', pn.termo);
ok('botao direito abre o painel', pn.abriuComBotaoDireito === true);
ok('o painel vem com o nome atual', pn.campoTrouxeONome === 'AVIACAO NAVAL 120826', pn.campoTrouxeONome);

/* ---------- 4. o CDN de reserva ---------- */
const cdn = await pagina.evaluate(async () => {
  const out = {};
  const pedidos = [];
  const origCriar = document.createElement.bind(document);
  document.createElement = (t) => {
    const el = origCriar(t);
    if (t === 'script') {
      Object.defineProperty(el, 'src', {
        set(v) { pedidos.push(v);
          setTimeout(() => {
            if (/jsdelivr/.test(v)) el.onerror && el.onerror();      /* o primeiro cai */
            else { window.Tesseract = { fingido: true }; el.onload && el.onload(); }
          }, 10);
        },
        get() { return ''; }
      });
    }
    return el;
  };
  ARTE_OCR.carregando = null; delete window.Tesseract;
  const T = await arteOcrCarrega();
  out.usouReserva = !!(T && T.fingido);
  out.tentouOsDois = pedidos.length === 2 && /jsdelivr/.test(pedidos[0]) && /unpkg/.test(pedidos[1]);
  document.createElement = origCriar;
  delete window.Tesseract; ARTE_OCR.carregando = null;
  return out;
});
ok('o primeiro CDN caindo, tenta o segundo', cdn.tentouOsDois === true);
ok('e o segundo serve', cdn.usouReserva === true);

/* ---------- 5. os dois caindo: o campo manual continua de pe ---------- */
const semRede = await pagina.evaluate(async () => {
  const origCriar = document.createElement.bind(document);
  document.createElement = (t) => {
    const el = origCriar(t);
    if (t === 'script') Object.defineProperty(el, 'src', {
      set(){ setTimeout(()=>el.onerror&&el.onerror(),10); }, get(){ return ''; } });
    return el;
  };
  ARTE_OCR.carregando = null; delete window.Tesseract;
  const mod = document.querySelector('.lay-modulo');
  const bt = mod.querySelector('.lay-arte-bt');
  bt.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 100));
  document.getElementById('ftArteLer').click();
  await new Promise(r => setTimeout(r, 700));
  const out = {
    painelSegueAberto: document.getElementById('ftArteFundo').classList.contains('on'),
    explicou: /Digite o nome/.test(document.getElementById('ftArteLidos').textContent || ''),
    botaoVoltouAoNormal: !document.getElementById('ftArteLer').disabled,
    campoUsavel: !document.getElementById('ftArteCampo').disabled
  };
  document.getElementById('ftArteCancela').click();
  document.createElement = origCriar;
  ARTE_OCR.carregando = null;
  return out;
});
ok('sem CDN o painel nao fecha na cara da pessoa', semRede.painelSegueAberto === true);
ok('sem CDN o painel explica e manda digitar', semRede.explicou === true, JSON.stringify(semRede));
ok('o botao de ler volta ao normal', semRede.botaoVoltouAoNormal === true);
ok('o campo de digitar continua usavel', semRede.campoUsavel === true);

/* ---------- 6. nada disso viaja para o arquivo do cliente ---------- */
const exp = await pagina.evaluate(async (PIX) => {
  const mod = document.querySelector('.lay-modulo');
  aplicaImagem(mod.querySelector('.lay-img'), PIX, '');      /* imagem SEM nome */
  await new Promise(r => setTimeout(r, 400));
  const html = gerarHTML();
  /* O NOME DA CLASSE APARECE NO CSS E NO RUNTIME de qualquer jeito:
     procurar a palavra no texto provaria nada. O que importa e se o
     ELEMENTO viajou, e isso se pergunta ao documento, nao a string. */
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return {
    painel: !!doc.getElementById('ftArteFundo'),
    baixaMotor: /cdn\.jsdelivr[^"']*tesseract/.test(html),
    lupas: doc.querySelectorAll('.lay-arte-bt').length
  };
}, PIX);
ok('o painel de nome nao vai no arquivo exportado', exp.painel === false);
ok('o exportado nao baixa o motor de OCR', exp.baixaMotor === false);
ok('a lupa viaja (o runtime e quem decide se some)', exp.lupas > 0, 'lupas=' + exp.lupas);

/* o exportado ABERTO: sem nome, a lupa tem de sumir de vez */
const expAberto = await pagina.evaluate(async (PIX) => {
  const mod = document.querySelector('.lay-modulo');
  aplicaImagem(mod.querySelector('.lay-img'), PIX, '');      /* imagem SEM nome */
  await new Promise(r => setTimeout(r, 400));
  return gerarHTML();
}, PIX);
const p2 = await b.newPage();
await p2.setContent(expAberto);
await p2.waitForTimeout(600);
const restou = await p2.evaluate(() => ({
  lupas: document.querySelectorAll('.lay-arte-bt').length,
  painel: !!document.getElementById('ftArteFundo')
}));
await p2.close();
ok('aberto o exportado, a lupa sem nome sumiu', restou.lupas === 0, 'lupas=' + restou.lupas);
ok('aberto o exportado, nao ha painel de nome', restou.painel === false);

await b.close();
console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
