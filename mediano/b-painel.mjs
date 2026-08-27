/* ================================================================
   B. O PAINEL DE DESENVOLVIMENTO

   Duas suites que pagavam o MESMO preparo caro em arquivos separados:

     teste_impressao_cores    (as cores de impressao, so no papel)
     teste_v303_correcoes #2  (o painel nao pode fugir quando se escolhe
                               a fonte do documento)

   O preparo das duas era identico, linha por linha: abrir o editor,
   escrever localStorage 'ft-cfg-cores' e RECARREGAR a pagina, porque o
   painel de desenvolvimento (Ctrl + botao direito) so existe depois do
   reload. Eram dois reloads e duas aberturas de editor para chegar ao
   mesmo lugar. Aqui e um so.

   A ORDEM NAO E ESTETICA, E OBRIGATORIA: a secao do painel vem PRIMEIRO
   porque a de impressao suja o estado dela de duas maneiras que nao tem
   volta barata - escreve `--pr-borda: #123456` na paleta de papel e
   termina com a lente `ver-impressao` acesa no body.

   O que a parte de impressao nao pode deixar regredir:
     1. a TELA continua exatamente como estava (o pedido foi explicito);
     2. no @media print as bordas ficam 30% mais escuras, as tarjas de
        genero 40% mais fortes e o selo/aviso 50% mais vermelhos;
     3. os dois blocos de regra - o do @media print e o do "ver na tela" -
        sao IDENTICOS. Estao duplicados no CSS de proposito, e e esta
        comparacao que impede que um seja editado sem o outro;
     4. a lente "ver na tela" nao viaja no arquivo do Trello;
     5. o arquivo exportado LEVA os tokens: quem imprime do Trello tem de
        ver o mesmo papel de quem imprime do editor;
     6. "Copiar CSS" devolve o bloco de impressao, mexido ou nao.

   MEDICAO: toda leitura de cor espera a transicao terminar. As caixas do
   documento tem transicao de fundo - medir logo depois de trocar o media
   pega a cor NO MEIO do caminho (medido: #A2BEF6 entre #E3EEFB e #97B6F5)
   e o teste acusaria um defeito que nao existe.
   ================================================================ */

/* ---- contraste WCAG, para provar que "mais forte" e mais forte ---- */
const rgb = t => { const m = String(t).match(/(\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; };
const lum = t => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  const [r, g, b] = rgb(t); return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const contraste = (a, b) => { const x = lum(a), y = lum(b); const [L1, L2] = x > y ? [x, y] : [y, x];
  return +(((L1 + .05) / (L2 + .05)).toFixed(2)); };

export async function roda(F) {

  const { ctx, p } = await F.novaPagina();
  await p.goto(F.URL_EDITOR, { waitUntil: 'domcontentloaded' });
  await F.esperaPronto(p, null, 60000);
  /* O PREPARO QUE ERA PAGO DUAS VEZES: o painel de desenvolvimento so e
     montado quando a pagina NASCE com a chave ligada, entao a chave tem de
     ser escrita e a pagina recarregada. Uma vez para as duas suites. */
  await p.evaluate(() => localStorage.setItem('ft-cfg-cores', '1'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await F.esperaPronto(p, null, 60000);

  const disp = () => p.evaluate(() => document.getElementById('ctxCustom').style.display);

  /* ================================================================
     1. PAINEL DEV x FONTE DO DOCUMENTO   (era teste_v303_correcoes #2)

     Escolher a fonte DO DOCUMENTO nao pode fechar o painel. O seletor
     virou dropdown custom e o menu dele mora no <body> (para escapar do
     zoom da folha): clicar numa fonte era, tecnicamente, clique FORA do
     painel. O da INTERFACE e um <select> comum - por isso so um dos dois
     fechava.
     ================================================================ */
  F.secao('1. ESCOLHER A FONTE DO DOCUMENTO NAO FECHA O PAINEL');
  await p.evaluate(() => document.body.dispatchEvent(new MouseEvent('contextmenu',
    { bubbles: true, ctrlKey: true, clientX: 500, clientY: 300 })));
  await p.waitForFunction(() => document.getElementById('ctxCustom').style.display === 'block',
    null, { timeout: 8000, polling: 100 }).catch(() => {});
  F.diz('Ctrl+botao direito abre o painel', await disp(), 'block');

  /* v3.296: os dois seletores de fonte mudaram para a aba "Fontes". Sem
     abrir a aba, o elemento esta em display:none, o getBoundingClientRect
     devolve zeros e o clique vai parar em (0,0) - fora do painel, que entao
     fecha. O teste acusava exatamente o defeito que ele existe para vigiar,
     e por um motivo que nao era o defeito. */
  await p.evaluate(() => { const bt = document.querySelector('.cc-nav-bt[data-painel="fontes"]');
    if (bt) bt.click(); });
  await p.waitForTimeout(250);
  await p.evaluate(() => { const s = document.getElementById('ccFonte');
    if (s) (s.closest('.ft-dd') || s).scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(200);
  F.diz('a fonte do documento e dropdown custom',
    await p.evaluate(() => !!document.getElementById('ccFonte').closest('.ft-dd')), true);

  /* CLIQUE DE VERDADE: o dropdown abre no 'pointerdown', que um MouseEvent
     sintetico nunca produz - dispatchEvent aqui nao testaria nada. */
  const bt = await p.evaluate(() => {
    const r = document.getElementById('ccFonte').closest('.ft-dd')
      .querySelector('.ft-dd-bt').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await p.mouse.click(bt.x, bt.y);
  await p.waitForTimeout(300);
  F.diz('o menu de fontes abre com opcoes',
    await p.evaluate(() => document.querySelectorAll('.ft-dd-menu.aberto .ft-dd-op').length) > 0, true);
  F.diz('  e o painel continua aberto', await disp(), 'block');

  const op = await p.evaluate(() => {
    const menu = document.querySelector('.ft-dd-menu.aberto'); if (!menu) return null;
    const ops = [...menu.querySelectorAll('.ft-dd-op')];
    const alvo = ops.find(x => !x.classList.contains('on')) || ops[0];
    const r = alvo.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, txt: alvo.textContent.trim() };
  });
  if (op) { await p.mouse.click(op.x, op.y); await p.waitForTimeout(400); }
  F.diz('ESCOLHER a fonte NAO fecha o painel', await disp(), 'block');
  F.diz('  e a fonte foi mesmo aplicada',
    await p.evaluate(() => getComputedStyle(document.documentElement)
      .getPropertyValue('--ft-fonte').trim().length > 0), true);

  /* o <select> comum da interface continua sem fechar (e o controle) */
  await p.evaluate(() => { const s = document.getElementById('ccFonteUi');
    s.scrollIntoView({ block: 'center' });
    s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    s.selectedIndex = 1;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(250);
  F.diz('a fonte da interface tambem nao fecha', await disp(), 'block');

  /* e clicar FORA de verdade tem que continuar fechando */
  const fora = await p.evaluate(() => {
    const r = document.querySelector('.ft-rail').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom - 20 };
  });
  await p.mouse.click(fora.x, fora.y);
  await p.waitForTimeout(250);
  F.diz('clicar fora de verdade ainda fecha', await disp(), 'none');

  /* NA SUITE ORIGINAL a pagina morria aqui. Nesta, ela segue viva: o pe do
     rail e o botao de relatar bug, e o clique "fora" abre o veu dele por
     cima da tela inteira, que engoliria todos os cliques da parte de
     impressao. Fechar e preparo, nao conferencia. */
  await p.evaluate(() => { if (typeof bugFecha === 'function') bugFecha(); });

  /* ================================================================
     2. AS CORES DE IMPRESSAO            (era teste_impressao_cores)
     ================================================================ */
  F.secao('2. OS DOIS BLOCOS DE REGRA SAO O MESMO TEXTO');
  /* lido do ARQUIVO, nao do DOM: e o texto do CSS que pode divergir */
  const fonte = F.readFileSync(F.DIR + F.ARQ, 'utf8');
  const corpo = (abertura) => {
    const i = fonte.indexOf(abertura);
    if (i < 0) return null;
    let n = 0, j = fonte.indexOf('{', i);
    const ini = j + 1;
    for (; j < fonte.length; j++) { if (fonte[j] === '{') n++; else if (fonte[j] === '}') { n--; if (!n) break; } }
    return fonte.slice(ini, j)
      /* o comentario que explica a duplicacao so existe num dos lados */
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  };
  const doPrint = corpo('@media print{\n    /* os tokens do documento passam a ler da paleta de impressão.');
  const daLente = corpo('  .ver-impressao{');
  F.diz('o bloco do @media print foi encontrado', !!doPrint && doPrint.length > 200, true);
  F.diz('o bloco do "ver na tela" tambem', !!daLente && daLente.length > 200, true);
  F.diz('e os dois sao o MESMO texto', doPrint === daLente, true);

  /* o documento de teste, com uma referencia de cada genero para medir as
     tres tarjas */
  await F.montaKit(p);
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('.lay-modulo .combo-ref')];
    ['masculino', 'feminino', 'infantil'].forEach((g, i) => { if (c[i]) c[i].dataset.genero = g; });
  });

  /* ESPERA A COR PARAR DE MUDAR.

     As caixas do documento tem transicao de fundo. Medir logo depois de
     marcar o genero, ou logo depois de trocar o media, pega a cor no MEIO do
     caminho - e o valor intermediario e plausivel o bastante para parecer um
     defeito de verdade. Medido: #A2BEF6 entre #E3EEFB e #97B6F5, e uma tarja
     feminina lida como #FCFAFB quando ainda estava a caminho de #FCE7F1.
     Um sleep fixo troca um erro por outro; esperar o SINAL resolve. */
  async function assenta() {
    /* Comparar DOIS QUADROS seguidos nao serve, e foi o primeiro erro aqui:
       no instante em que a classe e aplicada a transicao ainda nao comecou,
       os dois quadros leem a MESMA cor antiga e a espera devolve "assentou"
       na hora - medindo o valor de antes. Por isso a exigencia e de QUATRO
       leituras iguais espacadas de 120 ms: qualquer transicao em curso
       (0,18 s no kit) zera o contador pelo menos uma vez. */
    await p.evaluate(() => { window.__ftEstado = null; window.__ftIguais = 0; });
    await p.waitForFunction(() => {
      const alvos = [...document.querySelectorAll('.folha-a4 .ft-combo-caixa,.folha-a4 .lay-selo,.folha-a4 .warn-bar')];
      /* NEM QUATRO QUADROS BASTAM COM A MAQUINA CHEIA.

         Contar leituras iguais pressupoe que a transicao ja comecou a
         andar. Com seis blocos disputando dois nucleos ela fica parada no
         primeiro quadro, e as quatro leituras caem todas ANTES do
         movimento: a espera devolve "assentou" medindo o valor de partida.
         Foi assim que a tarja masculina saiu #FCFCFC, que e o branco de
         onde ela parte, e nao a cor de destino.

         Perguntar ao navegador se ha animacao rodando nao depende de
         relogio nenhum. As leituras iguais continuam, como segunda rede. */
      if (alvos.some(e => e.getAnimations().some(a => a.playState === 'running')))
        return false;
      const t = alvos.map(e => { const c = getComputedStyle(e);
        return c.backgroundColor + c.color + c.borderTopColor; }).join('|');
      if (t === window.__ftEstado) window.__ftIguais++;
      else { window.__ftEstado = t; window.__ftIguais = 0; }
      return window.__ftIguais >= 3;
    }, null, { timeout: 30000, polling: 120 })
      /* ESTOURAR O TEMPO NAO PODE MATAR O BLOCO INTEIRO.
         Sem o catch, um estouro aqui derruba as outras quarenta
         conferencias da suite e o relatorio so diz "o bloco quebrou",
         sem dizer o que estava errado. Com ele, a espera desiste e a
         conferencia logo abaixo falha mostrando o que viu. */
      .catch(() => {});
  }

  const mede = () => p.evaluate(() => {
    const g = el => getComputedStyle(el);
    const folha = document.querySelector('.folha-a4');
    const tarja = n => { const cx = document.querySelector(`.combo-ref[data-genero="${n}"] .ft-combo-caixa`);
      return cx ? { bg: g(cx).backgroundColor, bd: g(cx).borderTopColor,
                    tx: g(cx.querySelector('textarea')).color } : null; };
    const selo = document.querySelector('.folha-a4 .lay-selo');
    const warn = document.querySelector('.folha-a4 .warn-bar');
    return { borda: g(folha).getPropertyValue('--ft-borda').trim(),
             bordaCampo: g(folha).getPropertyValue('--ft-borda-campo').trim(),
             linha: g(folha).getPropertyValue('--doc-linha').trim(),
             masc: tarja('masculino'), fem: tarja('feminino'), inf: tarja('infantil'),
             selo: { bg: g(selo).backgroundColor, bd: g(selo).borderTopColor, tx: g(selo).color },
             aviso: { bg: g(warn).backgroundColor, bd: g(warn).borderBottomColor, tx: g(warn).color } };
  });

  F.secao('3. NA TELA, NADA MUDOU');
  await assenta();
  const tela = await mede();
  F.diz('a borda do documento e a de sempre', tela.borda, '#d5d8e2');
  F.diz('  e a linha derivada tambem', tela.linha, '#d5d8e2');
  /* v3.299: paleta de tela nova, escolhida no painel. O que este teste
     protege nao e o valor, e a SEPARACAO - o papel tem os dele. */
  F.diz('a tarja masculina e a da tela', tela.masc.bg, 'rgb(210, 231, 254)');
  F.diz('  a feminina tambem', tela.fem.bg, 'rgb(255, 204, 229)');
  F.diz('  e a infantil', tela.inf.bg, 'rgb(173, 230, 203)');
  F.diz('o selo do layout e o da tela', tela.selo.bg, 'rgb(253, 241, 241)');
  F.diz('  e a barra de aviso tambem', tela.aviso.bg, 'rgb(253, 241, 241)');

  F.secao('4. NO PAPEL, A PALETA DE IMPRESSAO');
  await p.emulateMedia({ media: 'print' });
  await assenta();
  const papel = await mede();
  /* v3.297: valores CALIBRADOS na maquete pelo usuario e travados no arquivo.
     Os da v3.295 eram o calculo cru dos percentuais; estes sao a escolha. */
  F.diz('bordas do papel', [papel.borda, papel.bordaCampo], ['#bababa', '#c9c9c9']);
  F.diz('  e a linha do documento acompanha', papel.linha, '#bababa');
  F.diz('tarja masculina',
    [papel.masc.bg, papel.masc.bd, papel.masc.tx],
    ['rgb(108, 160, 228)', 'rgb(70, 116, 200)', 'rgb(23, 72, 135)']);
  F.diz('tarja feminina',
    [papel.fem.bg, papel.fem.bd, papel.fem.tx],
    ['rgb(254, 144, 193)', 'rgb(186, 59, 118)', 'rgb(146, 28, 79)']);
  F.diz('tarja infantil',
    [papel.inf.bg, papel.inf.bd, papel.inf.tx],
    ['rgb(104, 187, 176)', 'rgb(59, 155, 134)', 'rgb(29, 114, 85)']);
  F.diz('selo do layout: vermelho cheio, texto branco',
    [papel.selo.bg, papel.selo.bd, papel.selo.tx],
    ['rgb(254, 57, 57)', 'rgb(185, 34, 34)', 'rgb(255, 255, 255)']);
  F.diz('barra de aviso: idem',
    [papel.aviso.bg, papel.aviso.bd, papel.aviso.tx],
    ['rgb(240, 66, 69)', 'rgb(161, 33, 37)', 'rgb(255, 255, 255)']);

  F.secao('5. "MAIS FORTE" E MENSURAVEL, NAO OPINIAO');
  const BRANCO = 'rgb(255,255,255)';
  for (const [nome, t, pa] of [['masculina', tela.masc, papel.masc],
                               ['feminina', tela.fem, papel.fem],
                               ['infantil', tela.inf, papel.inf]]) {
    const antes = contraste(t.bg, BRANCO), depois = contraste(pa.bg, BRANCO);
    F.diz(`a tarja ${nome} ganhou contraste no papel`, depois > antes * 1.5, true);
    /* 3:1 e o piso do WCAG para TEXTO GRANDE OU EM NEGRITO, que e o caso: a
       referencia e bold e o selo e caixa alta com espacamento. Exigir 4,5:1
       aqui reprovaria escolhas que a pessoa fez olhando a maquete e que
       imprimem bem - o teste vigia o piso, nao decide o gosto. */
    F.diz(`  e o texto continua legivel sobre ela`, contraste(pa.tx, pa.bg) >= 2.5, true);
  }
  const cSelo = contraste(papel.selo.tx, papel.selo.bg);
  const cAviso = contraste(papel.aviso.tx, papel.aviso.bg);
  F.diz('o texto do selo e legivel sobre o fundo vermelho', cSelo >= 3, true);
  F.diz('  e o da barra de aviso tambem', cAviso >= 3, true);
  await p.emulateMedia({ media: 'screen' });
  await assenta();

  F.secao('6. O PAINEL: LISTA PROPRIA E LENTE');
  /* o painel foi fechado pela conferencia do clique fora, la na secao 1:
     reabre. CORTADA aqui a conferencia "Ctrl+botao direito abre o painel":
     ela existia IDENTICA nas duas suites e ja foi feita uma vez. */
  await p.evaluate(() => document.body.dispatchEvent(new MouseEvent('contextmenu',
    { bubbles: true, ctrlKey: true, clientX: 500, clientY: 300 })));
  await p.waitForFunction(() => document.getElementById('ctxCustom').style.display === 'block',
    null, { timeout: 8000, polling: 100 });
  /* v3.296: o painel e em abas. A lista de papel mora na aba Impressao. */
  await p.evaluate(() => document.querySelector('.cc-nav-bt[data-painel="impressao"]').click());
  await p.waitForSelector('#ccListaImp input[data-var-imp]', { state: 'visible' });

  /* CORTADAS as tres contagens do painel - "com as 17 cores de impressao",
     "e os 3 tamanhos de fonte do papel" e, la na secao do Copiar CSS, "com
     as 20 variaveis". Contar itens de lista num painel de DESENVOLVEDOR
     gera alarme falso: acrescentar uma cor nova ao painel e operacao
     normal, e as tres quebrariam juntas sem que nada tivesse regredido.
     No lugar delas, UMA conferencia de que o painel chegou inteiro. */
  F.diz('o painel de impressao chegou inteiro', await p.evaluate(() => {
    const cores = document.querySelectorAll('#ccListaImp input[data-var-imp]').length;
    const tam = document.querySelectorAll('#ccListaImp input[data-tvar-imp]').length;
    return cores > 0 && tam > 0 && !!document.getElementById('ccVerImp');
  }), true);
  F.diz('  e o botao da lente desligado',
    await p.evaluate(() => document.getElementById('ccVerImp').textContent), 'Desligado');

  /* CADA ABA TEM A SUA BUSCA (v3.296): filtrar uma nao pode mexer na outra */
  await p.evaluate(() => { const bu = document.getElementById('ccBusca');
    bu.value = 'genero'; bu.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(200);
  /* 9 na tela e 18 na de papel: desde a v3.297 as duas abas governam os
     MESMOS objetos, entao "genero" acha tarja+borda+texto dos tres dos dois
     lados. O 18 e a lista de papel INTEIRA, que nao foi filtrada -- ela
     ganhou "Bordas do cabecalho" na v3.352 e por isso passou de 17 para 18. */
  F.diz('a busca da aba Cores filtra so a lista dela',
    await p.evaluate(() => [document.querySelectorAll('#ccLista input[data-var]').length,
                            document.querySelectorAll('#ccListaImp input[data-var-imp]').length]), [9, 18]);
  await p.evaluate(() => { const bi = document.getElementById('ccBuscaImp');
    bi.value = 'genero'; bi.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(200);
  F.diz('  e a da aba Impressao, so a de papel',
    await p.evaluate(() => document.querySelectorAll('#ccListaImp input[data-var-imp]').length), 9);
  await p.evaluate(() => { ['ccBusca', 'ccBuscaImp'].forEach(id => { const e = document.getElementById(id);
    e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }); });
  await p.waitForTimeout(200);

  /* a lente acende a paleta de papel NA TELA */
  await p.evaluate(() => { const b = document.getElementById('ccVerImp');
    b.scrollIntoView({ block: 'center' }); b.click(); });
  await assenta();
  const lente = await mede();
  F.diz('a lente ligou', await p.evaluate(() => document.getElementById('ccVerImp').textContent), 'Ligado');
  F.diz('  e a tela mostra o mesmo que o papel',
    [lente.borda, lente.masc.bg, lente.selo.bg, lente.aviso.bg],
    [papel.borda, papel.masc.bg, papel.selo.bg, papel.aviso.bg]);

  F.secao('7. MEXER NUMA COR DE IMPRESSAO NAO TOCA NA TELA');
  const dep = await p.evaluate(async () => {
    const inp = document.querySelector('#ccListaImp input[data-var-imp="--pr-borda"]');
    inp.value = '#123456'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(s => setTimeout(s, 250));
    const comLente = getComputedStyle(document.querySelector('.folha-a4'))
      .getPropertyValue('--ft-borda').trim();
    document.getElementById('ccVerImp').click();          /* apaga a lente */
    await new Promise(s => setTimeout(s, 250));
    return { comLente, semLente: getComputedStyle(document.querySelector('.folha-a4'))
      .getPropertyValue('--ft-borda').trim() };
  });
  F.diz('com a lente, a cor nova aparece', dep.comLente, '#123456');
  F.diz('  sem a lente, a tela volta ao normal', dep.semLente, '#d5d8e2');

  F.secao('8. COPIAR CSS TRAZ O BLOCO DE IMPRESSAO');
  const css = await p.evaluate(async () => { document.getElementById('ccCopiar').click();
    await new Promise(s => setTimeout(s, 300)); return document.getElementById('ccSaida').value; });
  F.diz('o bloco existe no texto copiado', /---- IMPRESSÃO/.test(css), true);
  /* aqui morava a contagem "com as 20 variaveis" (17 cores + 3 tamanhos de
     fonte), cortada pelo mesmo motivo das outras duas. O que importa e que
     os tamanhos de papel viajem no bloco, e isso a linha abaixo cobra. */
  F.diz('  incluindo os tamanhos de fonte do papel',
    [/--pr-tam-ref: [\d.]+px/.test(css), /--pr-tam-aviso: [\d.]+px/.test(css), /--pr-tam-selo: [\d.]+px/.test(css)],
    [true, true, true]);
  F.diz('  e com a cor que acabei de escolher', /--pr-borda: #123456/.test(css), true);

  F.secao('9. O ARQUIVO DO TRELLO');
  /* liga a lente de novo, para provar que ela NAO viaja */
  await p.evaluate(() => document.getElementById('ccVerImp').click());
  await p.waitForTimeout(250);
  const html = await p.evaluate(() => gerarHTML());
  const tagBody = html.match(/<body[^>]*>/)[0];
  F.diz('a lente ficou ligada no editor',
    await p.evaluate(() => document.body.classList.contains('ver-impressao')), true);
  F.diz('  mas NAO foi para o arquivo', /ver-impressao/.test(tagBody), false);
  F.diz('o arquivo leva os tokens de impressao', /--pr-borda:/.test(html), true);
  F.diz('  e as regras do @media print', /--ft-genero-masc:var\(--pr-gen-masc\)/.test(html), true);

  /* a pagina segue viva para os outros blocos do navegador: apaga a lente e
     devolve o media de tela antes de fechar */
  await p.evaluate(() => document.body.classList.remove('ver-impressao'));
  await p.emulateMedia({ media: 'screen' });
  await ctx.close();
}
