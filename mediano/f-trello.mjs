/* ================================================================
   F. O ARQUIVO DO TRELLO

   Eram tres suites separadas (teste_filtros_trello, teste_brilho_obs,
   teste_celular_trello) e QUATRO exportacoes: cada uma abria o editor do
   zero, montava o mesmo orcamento de teste, chamava gerarHTML() e gravava
   o seu proprio arquivo.

   Os requisitos de conteudo das tres nao brigam entre si:

     observacao escrita em dois layouts   (brilho e filtros)
     cor de DTF/Subli no design           (brilho)
     uma tabela em grade infantil         (filtros)
     cliente de nome longo                (celular)
     modo sem dinheiro                    (celular)

   Entao aqui e UM documento, UMA exportacao, e o MESMO arquivo aberto em
   tres paginas diferentes. O que separa uma leitura da outra nao e o
   conteudo, e o AMBIENTE:

     o arquivo no COMPUTADOR   -> os filtros de layout
     o arquivo RECEM-ABERTO    -> as animacoes de atencao
                                  (a animacao so toca ao abrir: a pagina
                                   precisa nascer com o arquivo)
     o arquivo no CELULAR      -> sem dinheiro, cabecalho 3x2, filtro numa
                                  linha (isMobile e hasTouch so podem ser
                                  definidos na criacao do contexto)
   ================================================================ */

/* CONTAR LINHAS DIREITO.
   A primeira versao do teste de celular agrupava pelo `top` de cada item, e
   reprovou coisa certa: numa linha com align-items:center, itens de alturas
   diferentes (o Pedido No tem fonte maior) comecam em alturas diferentes e
   ainda assim estao na MESMA linha. O que define linha e sobreposicao
   vertical, nao igualdade de topo. */
const CONTA_LINHAS = `(itens)=>{
  /* item escondido tem retangulo zerado (top=0,bottom=0) e seria contado
     como uma linha propria la em cima. O "limpar filtros" fica escondido
     enquanto nada esta filtrado: sem esta linha, o teste acusava duas
     linhas onde ha uma. */
  const r=itens.map(e=>e.getBoundingClientRect())
    .filter(x=>x.width>0&&x.height>0).sort((a,b)=>a.top-b.top);
  let n=0, fim=-1e9;
  r.forEach(x=>{ if(x.top >= fim-2){ n++; fim=x.bottom; } else { fim=Math.max(fim,x.bottom); } });
  return n;
}`;

/* O GOOGLE FONTS NAO EXISTE NESTE CONTEINER.
   O <link> da folha de estilo e render-blocking: o navegador tenta, espera o
   timeout inteiro e so entao cai na fonte local. MEDIDO neste bloco: 13,2s
   por pagina aberta, quatro paginas, 52s dos 68s. O ft_navegador ja corta
   isso ao envelopar `newPage`, mas as paginas daqui nascem do CONTEXTO
   (F.novaPagina), que nao passa por aquele envelope. O desenho e exatamente
   o mesmo: a fonte ja nao carregava. */
async function semGoogleFonts(pg) {
  await pg.p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return pg;
}

export async function roda(F) {

  /* ================================================================
     1. O EDITOR: MONTA O DOCUMENTO E EXPORTA UMA VEZ SO
     ================================================================ */
  F.secao('1. NO EDITOR NAO HA NADA DISSO (e daqui sai o arquivo)');
  const ed = await semGoogleFonts(await F.novaPagina());
  await ed.p.goto(F.URL_EDITOR, { waitUntil: 'domcontentloaded' });
  await F.esperaPronto(ed.p, null, 60000);
  await F.montaKit(ed.p);

  await ed.p.evaluate(() => {
    /* O KIT DE TESTE sorteia de ZERO a tres cores por tag de design: havia
       execucao em que nenhuma saia e o teste do `pulsar` ficava sem alvo.
       Se o sorteio nao deu cor, o teste poe uma: o que se mede e a
       animacao, nao a sorte. */
    if (!document.querySelector('.lay-modulo .dtf-tok')) {
      let g = document.querySelector('.lay-modulo .design-grupo');
      if (!g) {
        const wrap = document.querySelector('.lay-modulo .design-wrap');
        if (wrap) { g = criaGrupo('DTF'); wrap.appendChild(g); }
      }
      if (g) {
        g.querySelector('.design-tokens').insertAdjacentHTML('beforeend',
          tokenHTML('001') + tokenHTML('S05'));
        atualizaGrupo(g);
      }
    }
    /* observacao escrita em DOIS layouts e o resto vazio: e o que separa
       quem leva a marca .tem-obs (e brilha, e casa o filtro "com") de quem
       nao leva */
    const areas = [...document.querySelectorAll('.lay-area')];
    areas.forEach(a => a.innerHTML = '');
    if (areas[0]) areas[0].innerHTML = 'Conferir o escudo antes de imprimir.';
    if (areas[2]) areas[2].innerHTML = 'Gola em ribana preta.';
    /* uma tabela em grade infantil: sem ela o filtro "Infantil . com" nao
       teria alvo e o teste nao provaria nada */
    const t = [...document.querySelectorAll('.lay-modulo .lay-tabela-mini')];
    if (t[1]) t[1].querySelector('.tam-modo').click();
    /* CLIENTE DE NOME LONGO: e ele que empurrava o Pedido No para uma
       terceira linha no cabecalho fixo do celular */
    const c = document.querySelector('input[data-h="cliente"]');
    if (c) {
      c.value = 'ASSOCIAÇÃO ATLÉTICA CROSSFIT SELVA ÁGUAS CLARAS';
      c.dispatchEvent(new Event('input', { bubbles: true }));
      c.dispatchEvent(new Event('change', { bubbles: true }));
    }
    aplicaDinheiro(false);                 /* MODO SEM DINHEIRO */
  });
  /* o documento se remonta sozinho depois disso (repagina, reajusta,
     atualizaGrupo): espera pelo SINAL, nao por um relogio */
  await F.assenta(ed.p, () => ({
    mods: document.querySelectorAll('.lay-modulo').length,
    cores: document.querySelectorAll('.lay-modulo .dtf-tok').length,
    inf: document.querySelectorAll('.lay-tabela-mini tr.tam-infantil').length,
    sem: document.body.classList.contains('sem-dinheiro'),
    obs: [...document.querySelectorAll('.lay-area')]
      .filter(a => (a.textContent || '').trim()).length
  }));

  const noEditor = await ed.p.evaluate(() => ({
    filtros: document.querySelectorAll('.ft-filtros').length,
    apagados: document.querySelectorAll('.ft-apagado').length,
    animando: document.querySelectorAll('.play-brilhar,.play-pulsar').length,
    marcaObs: document.querySelectorAll('.lay-area.tem-obs').length,
    cores: document.querySelectorAll('.lay-modulo .dtf-tok').length
  }));

  const html = await ed.p.evaluate(() => gerarHTML());
  const alvo = F.join(F.tmpdir(), 'ft_mediano_export.html');
  F.writeFileSync(alvo, html);
  await ed.ctx.close();

  /* filtro e animacao sao recurso do ARQUIVO EXPORTADO: no editor nao
     existem, e e isso que se cobra aqui */
  F.diz('nenhuma barra de filtro no editor', noEditor.filtros, 0);
  F.diz('  e nenhum layout apagado', noEditor.apagados, 0);
  F.diz('nada brilha dentro do editor', noEditor.animando, 0);
  F.diz('  e nem a marca .tem-obs existe la', noEditor.marcaObs, 0);
  F.diz('  o kit_teste tem cor de DTF/Subli para pulsar', noEditor.cores > 0, true);
  /* CORTADAS as quatro regex que perguntavam se @keyframes a-brilhar,
     BRILHO_RUNTIME, @keyframes a-pulsar e a variavel --rep aparecem no
     texto do arquivo: o bloco 3 mede a animacao TOCAR dez vezes, com o
     nome e a duracao certos. Regex procurando codigo e tautologia quando a
     secao seguinte mede o efeito. Esta aqui fica porque ninguem mede
     impressao de animacao: */
  F.diz('  e nada anima na impressao do arquivo',
    /@media print\{ \.play-brilhar,\.play-pulsar\{animation:none/.test(html), true);

  const URL_ARQ = F.pathToFileURL(alvo).href;

  /* ================================================================
     2. O ARQUIVO NO COMPUTADOR: OS FILTROS DE LAYOUT

     O que nao pode regredir:
       1. duas barras, um estado: a de cima (antes da primeira folha) e a de
          baixo (dentro da barra fixa) sao a mesma lista, e clicar numa
          atualiza a outra;
       2. os chips saem do DOCUMENTO, nao de uma lista fixa: so aparece o
          que existe neste pedido, com a contagem certa;
       3. quem nao casa fica a 20% de opacidade e NAO some, porque sumir
          mudaria a paginacao;
       4. dentro de um grupo os filtros somam (OU); entre grupos,
          restringem (E);
       5. no papel nao ha filtro nem layout apagado.
     ================================================================ */
  F.secao('2. NO ARQUIVO: DUAS BARRAS, CHIPS DO DOCUMENTO');
  const pc = await semGoogleFonts(await F.novaPagina({ viewport: { width: 1180, height: 900 } }));
  await pc.p.goto(URL_ARQ, { waitUntil: 'domcontentloaded' });
  await pc.p.waitForSelector('#ftFiltros .ft-fsel');
  await F.assenta(pc.p, () => document.querySelectorAll('.lay-modulo').length);

  /* A FICHA DE COR NO ARQUIVO DO CLIENTE (v3.343).
     Ela e o unico lugar do pedido onde a cor de impressao aparece
     desenhada, e nao escrita. O bloco acima garante que existe pelo
     menos uma; aqui se cobra que ela chegou com a forma certa: amostra
     rente a moldura, meio quadrado, e o codigo a direita dela. */
  const ficha = await pc.p.evaluate(() => {
    const t = document.querySelector('.lay-modulo .dtf-tok');
    if (!t) return null;
    const ch = t.querySelector('.dtf-chip'), cd = t.querySelector('.dtf-cod');
    if (!ch || !cd) return { semPeca: true };
    const rt = t.getBoundingClientRect(), rc = ch.getBoundingClientRect();
    const rd = cd.getBoundingClientRect();
    return {
      folgaEsquerda: +(rc.left - rt.left).toFixed(1),
      meioQuadrado: +(rt.height / rc.width).toFixed(2),
      codigoADireita: rd.left >= rc.right - 0.5,
      corpo: getComputedStyle(t).fontSize,
    };
  });
  F.diz('a ficha de cor chegou inteira no arquivo', !!ficha && !ficha.semPeca, true);
  if (ficha && !ficha.semPeca) {
    F.diz('  amostra rente a moldura  (' + ficha.folgaEsquerda + 'px)',
      ficha.folgaEsquerda <= 1.5, true);
    F.diz('  meio quadrado: a altura vale duas larguras  (' + ficha.meioQuadrado + ')',
      Math.abs(ficha.meioQuadrado - 2) <= 0.25, true);
    F.diz('  e o codigo a direita, em 11px',
      [ficha.codigoADireita, ficha.corpo], [true, '11px']);
  }

  const r1 = await pc.p.evaluate(() => ({
    barras: document.querySelectorAll('.ft-filtros').length,
    cimaAntesDaFolha: (() => {
      const f = document.getElementById('ftFiltros'), fo = document.querySelector('.folha-a4');
      return !!(f && fo && (f.compareDocumentPosition(fo) & Node.DOCUMENT_POSITION_FOLLOWING));
    })(),
    baixoDentroDaBarraFixa: !!document.querySelector('#ftBarra #ftFiltrosFixo'),
    grupos: [...document.querySelectorAll('#ftFiltros .ft-fsel')].map(c => c.dataset.g),
    mods: document.querySelectorAll('.lay-modulo').length,
    conta: (document.querySelector('#ftFiltros .ft-fconta') || {}).textContent
  }));
  F.diz('duas barras', r1.barras, 2);
  F.diz('  a de cima vem ANTES da primeira folha', r1.cimaAntesDaFolha, true);
  F.diz('  e a de baixo mora na barra fixa', r1.baixoDentroDaBarraFixa, true);
  F.diz('os tres grupos de filtro', r1.grupos, ['design', 'obs', 'inf']);
  /* a palavra "layout" saiu do contador na v3.337: ela aparecia nos
     dois estados e era a maior fonte de variacao de largura da barra */
  F.diz('o contador comeca sem filtro', r1.conta, String(r1.mods));

  /* toda opcao precisa contar o que existe mesmo no documento */
  const bate = await pc.p.evaluate(() => {
    const mods = [...document.querySelectorAll('.lay-modulo')];
    const real = (g, v) => mods.filter(m => {
      if (g === 'design') return [...m.querySelectorAll('.design-tag')]
        .some(t => (t.dataset.tag || t.textContent || '').trim() === v);
      const tab = m.querySelector('.lay-tabela-mini');
      if (g === 'obs') return (v === 'com') === !!m.querySelector('.lay-area.tem-obs');
      const inf = !!(tab && (tab.dataset.modo === 'infantil' || m.querySelector('tr.tam-infantil')));
      return (v === 'com') === inf;
    }).length;
    const ruins = [];
    [...document.querySelectorAll('#ftFiltros .ft-fsel')].forEach(sel => {
      [...sel.options].forEach(o => {
        if (!o.value) return;                    /* a opcao vazia nao conta */
        const n = +(o.textContent.match(/\((\d+)\)$/) || [, '-'])[1];
        if (n !== real(sel.dataset.g, o.value)) ruins.push(sel.dataset.g + ':' + o.value);
      });
    });
    return ruins;
  });
  F.diz('toda opcao conta o que existe mesmo', bate, []);
  F.diz('  e nenhuma opcao devolve zero',
    await pc.p.evaluate(() => [...document.querySelectorAll('#ftFiltros .ft-fsel option')]
      .filter(o => o.value && /\(0\)$/.test(o.textContent)).length), 0);
  /* CORTADA daqui a conferencia de que toda lista comeca pelo NOME do
     filtro (['Design','Observacao','Infantil']): ela existia igual nas duas
     suites, e o defeito que a motivou era de LARGURA DE CELULAR. Fica a do
     bloco 4, que mede onde doi. */

  F.secao('3. APAGA A 20%, E NAO SOME');
  await pc.p.evaluate(() => {
    const c = document.querySelector('#ftFiltros .ft-fsel[data-g="design"]');
    const op = c.options[1];
    window.__alvo = op.value;
    window.__esperado = +(op.textContent.match(/\((\d+)\)$/) || [, 0])[1];
    c.value = op.value; c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  /* A OPACIDADE E O FIM DE UMA TRANSICAO, E NAO UM ESTADO IMEDIATO.

     Aqui havia 350ms fixos. Sozinho passava; com os seis blocos
     disputando a maquina, a leitura caia no meio do fade e voltava 0.99
     numa rodada e 0 na outra. O sinal e a opacidade parar de mudar. */
  /* A OPACIDADE E O FIM DE DUAS ANIMACOES, E NAO UM ESTADO IMEDIATO.

     Aqui havia 350ms fixos, e depois duas leituras iguais seguidas. Os
     dois falharam, e o motivo so apareceu instrumentando: o modulo tem
     uma animacao de ENTRADA (ft-modulo-in, que sobe a opacidade de 0 ate
     1) alem da transicao do filtro (1 para 0,2). Com a maquina ocupada, a
     animacao de entrada ficava parada no comeco, e duas leituras
     seguidas davam 0: "estavel" em cima de um valor que era so o
     primeiro quadro de uma animacao que nem tinha comecado a andar.

     O sinal honesto e outro: nenhuma animacao rodando no elemento, E o
     valor repetido. getAnimations() responde a primeira parte. */
  await pc.p.waitForFunction(() => {
    const ap = [...document.querySelectorAll('.lay-modulo.ft-apagado')];
    if (!ap.length) return false;
    if (ap[0].getAnimations().some(a => a.playState === 'running')) return false;
    const o = getComputedStyle(ap[0]).opacity;
    const igual = window.__op === o;
    window.__op = o;
    return igual;
  }, null, { timeout: 30000, polling: 100 })
    /* ESTOURAR O TEMPO NAO PODE MATAR O BLOCO INTEIRO.
       Sem o catch, um estouro aqui derruba as outras quarenta
       conferencias da suite e o relatorio so diz "o bloco quebrou",
       sem dizer o que estava errado. Com ele, a espera desiste e a
       conferencia logo abaixo falha mostrando o que viu. */
    .catch(() => {});
  const um = await pc.p.evaluate(() => {
    const alvo = window.__alvo, esperado = window.__esperado;
    const mods = [...document.querySelectorAll('.lay-modulo')];
    const ap = mods.filter(m => m.classList.contains('ft-apagado'));
    return {
      alvo, esperado, acesos: mods.length - ap.length, apagados: ap.length,
      opacidade: ap.length ? getComputedStyle(ap[0]).opacity : null,
      /* NAO some: continua ocupando o mesmo espaco */
      aindaVisivel: ap.length ? (getComputedStyle(ap[0]).display !== 'none'
        && ap[0].getBoundingClientRect().height > 10) : null,
      espelho: [document.querySelector('#ftFiltrosFixo .ft-fsel[data-g="design"]').value],
      marcado: document.querySelector('#ftFiltrosFixo .ft-fsel[data-g="design"]').classList.contains('on'),
      conta: document.querySelector('#ftFiltrosFixo .ft-fconta').textContent
    };
  });
  F.diz('acende exatamente o que o chip prometia', um.acesos, um.esperado);
  F.diz('  os outros ficam a 20%', um.opacidade, '0.2');
  F.diz('  mas continuam ocupando o lugar', um.aindaVisivel, true);
  F.diz('a outra barra acompanha', um.espelho, [um.alvo]);
  F.diz('  e mostra a mesma conta', um.conta, um.acesos + ' de ' + r1.mods);

  F.secao('4. CADA CAMPO E ESCOLHA UNICA; ENTRE CAMPOS RESTRINGE');
  const dois = await pc.p.evaluate(async () => {
    const sel = document.querySelector('#ftFiltros .ft-fsel[data-g="design"]');
    const troca = async v => {
      sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(s => setTimeout(s, 280));
      return document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length;
    };
    const n1 = await troca(sel.options[1].value);
    /* trocar a escolha SUBSTITUI: campo nao acumula, e escolha unica */
    const n2 = await troca(sel.options[2].value);
    const esperado2 = +(sel.options[2].textContent.match(/\((\d+)\)$/) || [, 0])[1];
    /* um filtro de OUTRO campo so pode diminuir */
    const o = document.querySelector('#ftFiltros .ft-fsel[data-g="obs"]');
    o.value = 'com'; o.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(s => setTimeout(s, 280));
    const cruz = document.querySelectorAll('.lay-modulo:not(.ft-apagado)').length;
    return { n1, n2, esperado2, cruz };
  });
  F.diz('trocar a escolha SUBSTITUI, nao soma', dois.n2, dois.esperado2);
  F.diz('outro campo restringe (E)', dois.cruz <= dois.n2, true);

  F.secao('5. LIMPAR, POR QUALQUER UMA DAS BARRAS');
  const lim = await pc.p.evaluate(async () => {
    const vis = getComputedStyle(document.querySelector('#ftFiltros .ft-flimpa')).visibility;
    document.querySelector('#ftFiltrosFixo .ft-flimpa').click();
    await new Promise(s => setTimeout(s, 300));
    return {
      limparAparece: vis,
      apagados: document.querySelectorAll('.lay-modulo.ft-apagado').length,
      marcados: document.querySelectorAll('.ft-fsel.on').length,
      valores: [...document.querySelectorAll('.ft-fsel')].map(s => s.value).join('|'),
      conta: document.querySelector('#ftFiltros .ft-fconta').textContent,
      escondeDeNovo: getComputedStyle(document.querySelector('#ftFiltros .ft-flimpa')).visibility
    };
  });
  F.diz('o "limpar" so aparece filtrando', [lim.limparAparece, lim.escondeDeNovo], ['visible', 'hidden']);
  F.diz('limpar pela barra fixa apaga tudo', [lim.apagados, lim.marcados], [0, 0]);
  F.diz('  e todos os campos voltam a "Todos"', lim.valores, '|||||');
  F.diz('  e o contador volta ao total', lim.conta, String(r1.mods));

  F.secao('6. O PAPEL NAO TEM FILTRO NEM LAYOUT APAGADO');
  await pc.p.evaluate(() => {
    const s = document.querySelector('#ftFiltros .ft-fsel[data-g="design"]');
    s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await F.assenta(pc.p, () => document.querySelectorAll('.lay-modulo.ft-apagado').length);
  await pc.p.emulateMedia({ media: 'print' });
  /* ESPERA A TRANSICAO, E NAO DUAS LEITURAS IGUAIS.
     O .ft-apagado tem transition:opacity .18s. Trocar para o papel dispara
     a volta de 0.2 para 1, e o assenta() so cobra duas leituras iguais
     separadas por 120ms: dentro da transicao ele pega 0.2 duas vezes e da
     por assentado. Sob a carga da bateria isso acontecia uma vez a cada
     tantas rodadas. O sinal honesto e o getAnimations(), como no resto da
     suite. */
  await pc.p.waitForFunction(() =>
    !document.getAnimations().some(a => a.playState === 'running'),
    null, { timeout: 8000 }).catch(() => {});
  const papel = await F.assenta(pc.p, () => {
    const f = document.querySelector('.ft-filtros');
    const ap = document.querySelector('.lay-modulo.ft-apagado');
    return {
      filtroVisivel: getComputedStyle(f).display,
      barraVisivel: getComputedStyle(document.getElementById('ftBarra')).display,
      opacidadeDoApagado: ap ? getComputedStyle(ap).opacity : null,
      aindaMarcadoNoDOM: !!ap
    };
  });
  F.diz('a barra de filtros some no papel', papel.filtroVisivel, 'none');
  F.diz('  a barra fixa tambem', papel.barraVisivel, 'none');
  F.diz('o layout apagado volta a 100% no papel', papel.opacidadeDoApagado, '1');
  F.diz('  (a marca continua no DOM: quem volta da impressao volta filtrando)',
    papel.aindaMarcadoNoDOM, true);
  await pc.p.emulateMedia({ media: 'screen' });

  F.secao('7. A BARRA FIXA: CORPO MAIOR E CENTRALIZADA');
  const cor = await pc.p.evaluate(() => {
    const g = s => getComputedStyle(document.querySelector(s));
    return {
      rotulo: g('#ftBarra .rot').fontSize, valor: g('#ftBarra .val').fontSize,
      pedido: g('#ftBarra .ft-bi.pedido .val').fontSize,
      total: g('#ftBarra .ft-bi.total .val').fontSize
    };
  });
  /* ERAM QUATRO CONFERENCIAS, VIROU UMA. Rotulo 9 -> 10,5px, valor 13 ->
     15px, pedido 13 -> 15px, total 12,5 -> 14px sao quatro constantes de
     CSS travadas, sem logica atras: ou o bloco de estilo esta la, ou nao
     esta. Quatro linhas de saida para uma pergunta so. E o comentario da
     propria suite admitia que esta secao nao pegou o defeito real: quem
     pegou foi a 8, que fica inteira. */
  F.diz('a barra fixa cresce a fonte no computador',
    [cor.rotulo, cor.valor, cor.pedido, cor.total], ['10.5px', '15px', '15px', '14px']);
  const centro = await pc.p.evaluate(() => {
    const int = document.querySelector('.ft-barra-int');
    const r = int.getBoundingClientRect();
    const itens = [...int.querySelectorAll('.ft-bi')];
    const e = itens[0].getBoundingClientRect().left - r.left;
    const d = r.right - itens[itens.length - 1].getBoundingClientRect().right;
    return {
      just: getComputedStyle(int).justifyContent,
      /* centrado = a folga da esquerda e a da direita sao parecidas */
      simetrico: Math.abs(e - d) < 26, esq: Math.round(e), dir: Math.round(d)
    };
  });
  F.diz('a barra fixa esta centralizada', centro.just, 'center');
  F.diz('  e as folgas dos dois lados batem', centro.simetrico, true);

  /* ---------------------------------------------------------------------
     O BURACO QUE DEIXOU O ERRO PASSAR (v3.304)

     A secao 7 media a centralizacao da LINHA DE DADOS e parava ai. A linha
     de filtros, logo abaixo, dentro da mesma barra, tinha margin:0 anulando
     o margin:0 auto da regra base: ficava colada na esquerda enquanto a de
     cima estava centrada. Em 1400px de tela a diferenca e pequena; em um
     monitor largo e gritante, e foi assim que apareceu.

     Agora a conta e direta: as DUAS linhas tem de comecar e terminar na
     mesma coluna, e medido numa tela larga, que e onde doi.
     --------------------------------------------------------------------- */
  F.secao('8. A LINHA DE FILTROS ALINHA COM A LINHA DE DADOS');
  await pc.p.setViewportSize({ width: 1900, height: 900 });
  await F.assenta(pc.p, () => Math.round(
    document.getElementById('ftBarra').getBoundingClientRect().width));
  const alinha = await pc.p.evaluate(() => {
    const int = document.querySelector('.ft-barra-int');
    const fora = document.getElementById('ftFiltrosFixo');
    /* sem o miolo separado (versoes ate a 3.303) mede-se a propria linha:
       e a geometria antiga, e e ela que tem de reprovar aqui */
    const fil = fora.querySelector('.ft-fint') || fora;
    const barra = document.getElementById('ftBarra');
    const a = int.getBoundingClientRect(), f = fil.getBoundingClientRect();
    const rb = barra.getBoundingClientRect(), rf = fora.getBoundingClientRect();
    return {
      esqIgual: Math.abs(a.left - f.left) < 2, dirIgual: Math.abs(a.right - f.right) < 2,
      esqDados: Math.round(a.left), esqFiltro: Math.round(f.left),
      dirDados: Math.round(a.right), dirFiltro: Math.round(f.right),
      /* e a linha de filtros continua centrada em si: folga igual dos dois lados */
      folgaEsq: Math.round(f.left - rf.left), folgaDir: Math.round(rf.right - f.right),
      /* o FUNDO e o filete, esses sim, atravessam a barra inteira */
      fundoCheio: Math.abs(rf.width - rb.width) < 2,
      larguraTela: Math.round(rb.width)
    };
  });
  F.diz('numa tela larga, a barra ocupa tudo', alinha.larguraTela > 1800, true);
  F.diz('filtro e dados comecam na mesma coluna', alinha.esqIgual, true);
  F.diz('  e terminam na mesma coluna', alinha.dirIgual, true);
  F.diz('  com folga igual dos dois lados', Math.abs(alinha.folgaEsq - alinha.folgaDir) < 2, true);
  F.diz('o fundo do filtro, esse, atravessa a barra toda', alinha.fundoCheio, true);
  await pc.ctx.close();

  /* ================================================================
     3. O ARQUIVO RECEM-ABERTO: AS ANIMACOES DE ATENCAO

     `brilhar` (900ms) na observacao do layout e `pulsar` (1,1s) nas cores
     de DTF/Sublimacao do design, as duas do Design Kit v5. So no arquivo
     exportado, so onde ha conteudo, 10 repeticoes ao ABRIR e 5 a cada vez
     que a janela recupera o foco. Por isso e pagina nova: a primeira
     rodada acontece uma vez, no carregamento.
     ================================================================ */
  F.secao('9. NO ARQUIVO: AO ABRIR, DEZ VEZES, SO ONDE HA CONTEUDO');
  const novo = await semGoogleFonts(await F.novaPagina({ viewport: { width: 1100, height: 700 } }));
  await novo.p.goto(URL_ARQ, { waitUntil: 'domcontentloaded' });
  await novo.p.waitForSelector('.lay-area.tem-obs');
  await novo.p.waitForTimeout(400);
  let r = await novo.p.evaluate(async () => {
    const comTexto = [...document.querySelectorAll('.lay-area.tem-obs')];
    const semTexto = [...document.querySelectorAll('.lay-area:not(.tem-obs)')];
    const cores = [...document.querySelectorAll('.lay-modulo .dtf-tok')];
    const obs = comTexto[0], cor = cores[0];
    const eo = getComputedStyle(obs), ec = cor ? getComputedStyle(cor) : null;
    return {
      todosComTexto: comTexto.every(e => (e.textContent || '').trim().length > 0),
      todosSemTexto: semTexto.every(e => (e.textContent || '').trim().length === 0),
      qtdSemTexto: semTexto.length, qtdCores: cores.length,
      /* AO ABRIR: 10 repeticoes, sem depender de rolagem */
      obs: {
        tocando: obs.classList.contains('play-brilhar'), anim: eo.animationName,
        dur: eo.animationDuration, easing: eo.animationTimingFunction,
        vezes: eo.animationIterationCount,
        /* O ANEL E AMOSTRADO, NAO FOTOGRAFADO.

           A animacao vai de rgba(198,22,27,.35) no 0% e no 45% ate
           rgba(0,0,0,0) no 100%: existe um instante, ao fim de CADA uma
           das dez voltas, em que o vermelho nao esta la. Ler o box-shadow
           uma vez so e apostar em nao cair justamente nele, e em bateria,
           com tres navegadores disputando a maquina, essa aposta se perde.
           Medido: passava sozinho e falhava junto. Amostrar por uma volta
           inteira pergunta o que interessa de verdade: o anel vermelho
           aparece? */
        temAnel: await (async () => {
          for (let i = 0; i < 40; i++) {
            if (/rgba\(198, 22, 27, 0\.35\)/.test(getComputedStyle(obs).boxShadow)) return true;
            await new Promise(s => setTimeout(s, 30));
          }
          return false;
        })(),
        guardouASombra: await (async () => {
          for (let i = 0; i < 40; i++) {
            if (/rgba\(17, 18, 20, 0\.05\)/.test(getComputedStyle(obs).boxShadow)) return true;
            await new Promise(s => setTimeout(s, 30));
          }
          return false;
        })()
      },
      cor: ec ? {
        tocando: cor.classList.contains('play-pulsar'), anim: ec.animationName,
        dur: ec.animationDuration, easing: ec.animationTimingFunction,
        vezes: ec.animationIterationCount
      } : null,
      vazioBrilhou: semTexto.length ? semTexto[0].classList.contains('play-brilhar') : null
    };
  });
  F.diz('a marca so caiu em quem tem texto', [r.todosComTexto, r.todosSemTexto], [true, true]);
  F.diz('  e sobrou campo sem marca para comparar', r.qtdSemTexto > 0, true);
  F.diz('  e ha cor de DTF/Subli no arquivo', r.qtdCores > 0, true);
  F.diz('abrir o documento ja dispara o brilho', r.obs.tocando, true);
  F.diz('  e a animacao do kit', [r.obs.anim, r.obs.dur], ['a-brilhar', '0.9s']);
  F.diz('  com o easing do kit', r.obs.easing, 'cubic-bezier(0.2, 0.7, 0.3, 1)');
  F.diz('  DEZ vezes na primeira rodada', r.obs.vezes, '10');
  F.diz('  o anel e o vermelho da marca', r.obs.temAnel, true);
  F.diz('  e a sombra normal do campo continua embaixo', r.obs.guardouASombra, true);
  F.diz('a cor de DTF/Subli pulsa junto', r.cor.tocando, true);
  F.diz('  com o tempo do kit', [r.cor.anim, r.cor.dur], ['a-pulsar', '1.1s']);
  F.diz('  e as mesmas dez vezes', r.cor.vezes, '10');
  F.diz('campo sem texto nunca brilha', r.vazioBrilhou, false);

  F.secao('10. PERDER E RECUPERAR O FOCO: MAIS CINCO');
  /* deixa a primeira rodada terminar antes de medir a segunda. Quem manda
     no relogio e a mais LONGA das duas: pulsar, 10 x 1,1s = 11s. Em vez de
     dormir esses 11s no escuro, espera pelo SINAL de que as duas pararam
     (o runtime tira a classe no animationend) com folga de tempo: se
     alguma nao parar, a espera estoura e as conferencias abaixo reprovam
     exatamente como reprovavam antes. */
  await novo.p.waitForFunction(() => {
    const obs = document.querySelector('.lay-area.tem-obs');
    const cor = document.querySelector('.lay-modulo .dtf-tok');
    return obs && cor && !obs.classList.contains('play-brilhar')
      && !cor.classList.contains('play-pulsar');
  }, null, { timeout: 20000 }).catch(() => { });
  r = await novo.p.evaluate(() => {
    const obs = document.querySelector('.lay-area.tem-obs');
    const cor = document.querySelector('.lay-modulo .dtf-tok');
    return {
      obsParou: !obs.classList.contains('play-brilhar'),
      corParou: !cor.classList.contains('play-pulsar'),
      sombraVoltou: getComputedStyle(obs).boxShadow
    };
  });
  F.diz('passadas as dez, o brilho para sozinho', r.obsParou, true);
  F.diz('  e o pulso tambem', r.corParou, true);
  F.diz('  a sombra do campo volta ao normal', r.sombraVoltou,
    'rgba(17, 18, 20, 0.05) 0px 1px 2px 0px');
  r = await novo.p.evaluate(async () => {
    window.dispatchEvent(new Event('focus'));
    await new Promise(s => setTimeout(s, 120));
    const obs = document.querySelector('.lay-area.tem-obs');
    const cor = document.querySelector('.lay-modulo .dtf-tok');
    const um = {
      obs: getComputedStyle(obs).animationIterationCount,
      cor: getComputedStyle(cor).animationIterationCount
    };
    /* focus e visibilitychange chegam juntos: a segunda chamada e ignorada */
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(s => setTimeout(s, 120));
    return { um, aindaCinco: getComputedStyle(obs).animationIterationCount };
  });
  F.diz('voltar o foco repete CINCO vezes', [r.um.obs, r.um.cor], ['5', '5']);
  F.diz('  e um segundo aviso na mesma volta nao reinicia', r.aindaCinco, '5');
  await novo.ctx.close();

  /* ================================================================
     4. O ARQUIVO NO CELULAR

     Tres defeitos vistos num Android de 720px, todos so no arquivo
     exportado e so na largura de celular. Nenhum deles aparecia no
     computador, que e onde os testes olhavam ate aqui.

       1. O TOTAL EM R$ VOLTAVA num orcamento sem dinheiro. A regra do
          celular trazia `display:flex !important` para toda .rodape-tot, e
          um !important vence qualquer regra sem !important, por mais
          especifica que seja. As duas que escondem valor nao tem
          !important. Resultado: um orcamento que ia para a producao sem
          valor mostrava o valor no rodape, no celular, e em nenhum outro
          lugar.

       2. O CABECALHO FIXO QUEBRAVA EM TRES LINHAS. Ele era
          flex-wrap:wrap, e a quebra dependia do comprimento do nome do
          cliente: nome curto cabia em duas linhas, nome longo empurrava o
          Pedido No sozinho para uma terceira. Sao seis campos e tem de
          caber em 3 colunas x 2 linhas sempre, independente do conteudo.

       3. OS FILTROS OCUPAVAM DUAS LINHAS. Tres rotulos mais tres campos
          nao cabem numa largura de celular. Agora o rotulo mora dentro do
          campo e a linha rola de lado.

     Mede em 390px, que e um celular de verdade, e nao em 820px, que e o
     limite da media query e passaria de raspao.
     ================================================================ */
  F.secao('11. SEM DINHEIRO E SEM DINHEIRO, TAMBEM NO CELULAR');
  const cel = await semGoogleFonts(await F.novaPagina({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true
  }));
  await cel.p.goto(URL_ARQ, { waitUntil: 'domcontentloaded' });
  await cel.p.waitForSelector('.folha-a4');
  await F.assenta(cel.p, () => document.querySelectorAll('.folha-a4').length);
  r = await cel.p.evaluate(() => {
    const vis = e => !!e && getComputedStyle(e).display !== 'none';
    const rod = document.querySelector('.folha-a4:last-of-type .doc-rodape')
      || document.querySelector('.doc-rodape');
    const txt = (document.body.innerText || '');
    return {
      modoSemDinheiro: document.body.classList.contains('sem-dinheiro'),
      totalGeralVisivel: vis(rod && rod.querySelector('.rodape-tot.geral')),
      subtotalVisivel: vis(rod && rod.querySelector('.rodape-tot.rt-sub-box')),
      pecasVisivel: vis(rod && rod.querySelector('.rodape-tot:not(.geral):not(.rt-sub-box)')),
      /* a prova final e a que o olho faz: existe "R$" em algum lugar da tela? */
      temCifraNaTela: /R\$/.test(txt)
    };
  });
  F.diz('o arquivo esta em modo sem dinheiro', r.modoSemDinheiro, true);
  F.diz('o TOTAL em R$ nao aparece', r.totalGeralVisivel, false);
  F.diz('  nem o Subtotal', r.subtotalVisivel, false);
  F.diz('  e nenhum "R$" sobra na tela', r.temCifraNaTela, false);
  F.diz('mas as PECAS continuam aparecendo', r.pecasVisivel, true);

  F.secao('12. O CABECALHO FIXO: 3 COLUNAS, 2 LINHAS, SEMPRE');
  /* rola para a barra aparecer */
  await cel.p.evaluate(() => window.scrollTo(0, 900));
  await cel.p.waitForFunction(
    () => document.getElementById('ftBarra').classList.contains('on'));
  await F.assenta(cel.p, () => [...document.querySelectorAll('.ft-barra-int .ft-bi')]
    .map(i => Math.round(i.getBoundingClientRect().top)));
  r = await cel.p.evaluate(CL => {
    CL = eval(CL);
    const int = document.querySelector('.ft-barra-int');
    const itens = [...int.querySelectorAll('.ft-bi')];
    const cols = [...new Set(itens.map(i => Math.round(i.getBoundingClientRect().left)))];
    const r = int.getBoundingClientRect();
    return {
      campos: itens.length, linhas: CL(itens), colunas: cols.length,
      display: getComputedStyle(int).display,
      /* nada pode vazar da largura da tela */
      vazaNaLateral: itens.some(i => i.getBoundingClientRect().right > innerWidth + 1),
      alturaDaBarra: Math.round(r.height),
      ordem: itens.map(i => i.className.replace('ft-bi ', ''))
    };
  }, CONTA_LINHAS);
  F.diz('os seis campos estao la', r.campos, 6);
  F.diz('em DUAS linhas', r.linhas, 2);
  F.diz('  e TRES colunas', r.colunas, 3);
  F.diz('  numa grade, nao em quebra de linha', r.display, 'grid');
  F.diz('nada vaza para fora da tela', r.vazaNaLateral, false);

  /* e com nome CURTO tem de dar exatamente a mesma coisa: o desenho nao
     pode depender do conteudo, que era o defeito */
  await cel.p.evaluate(() => {
    const v = document.querySelector('.ft-barra .ft-bi.cliente .val');
    if (v) v.textContent = 'SAGA';
  });
  await cel.p.waitForTimeout(400);
  const curto = await cel.p.evaluate(CL => {
    CL = eval(CL);
    const itens = [...document.querySelectorAll('.ft-barra-int .ft-bi')];
    return {
      linhas: CL(itens),
      colunas: [...new Set(itens.map(i => Math.round(i.getBoundingClientRect().left)))].length
    };
  }, CONTA_LINHAS);
  F.diz('com nome curto, as mesmas 2 linhas', curto.linhas, 2);
  F.diz('  e as mesmas 3 colunas', curto.colunas, 3);

  F.secao('13. OS FILTROS EM UMA LINHA, COM CARROSSEL');
  r = await cel.p.evaluate(CL => {
    CL = eval(CL);
    const fx = document.getElementById('ftFiltrosFixo');
    if (!fx) return { semFiltro: true };
    const fint = fx.querySelector('.ft-fint');
    const itens = [...fint.children];
    const sels = [...fx.querySelectorAll('.ft-fsel')];
    return {
      linhas: CL(itens),
      rotulosSoltos: fx.querySelectorAll('.ft-fcampo > span').length,
      /* o nome do filtro tem de estar DENTRO do campo */
      nomeNoCampo: sels.map(s => s.options[0].textContent),
      /* e as opcoes se descrevem sozinhas, senao "Com" e "Sem" nao dizem de que */
      opcoesDoObs: [...((sels.find(s => s.dataset.g === 'obs') || {}).options || [])].map(o => o.textContent),
      rola: fint.scrollWidth > fint.clientWidth + 1,
      temIma: getComputedStyle(fint).scrollSnapType.indexOf('x') >= 0,
      temEsmaecimento: /linear-gradient/.test(getComputedStyle(fint).maskImage
        || getComputedStyle(fint).webkitMaskImage || ''),
      alturaDoFiltro: Math.round(fx.getBoundingClientRect().height),
      vaza: itens.some(i => i.getBoundingClientRect().right > innerWidth + 400)
    };
  }, CONTA_LINHAS);
  F.diz('uma linha so', r.linhas, 1);
  F.diz('nenhum rotulo solto ao lado do campo', r.rotulosSoltos, 0);
  /* v3.309: a opcao vazia deixou de ser "Todos" e passou a ser o NOME do
     filtro. Foi o que permitiu tirar o rotulo de fora e caber os tres
     campos numa linha so no celular. E aqui, no celular, que essa
     conferencia mora: o defeito era de largura de celular. */
  F.diz('o nome do filtro esta dentro do campo', r.nomeNoCampo,
    ['Design', 'Observação', 'Infantil']);
  /* a lista nao e fixa: o filtro so oferece o que devolve algum layout, e
     num documento em que todos tem observacao o "Sem" nao existe mesmo. O
     que se cobra e que nenhuma opcao seja um "Com"/"Sem" solto, sem dizer
     de que. */
  F.diz('  e as opcoes dizem de que se trata',
    r.opcoesDoObs.slice(1).every(t => /observação/i.test(t)), true);
  F.diz('  nenhuma opcao e um "Com" ou "Sem" solto',
    r.opcoesDoObs.some(t => /^(Com|Sem)$/.test(t.trim())), false);
  F.diz('o trilho tem ima de rolagem', r.temIma, true);
  F.diz('  e esmaece na ponta enquanto houver campo escondido', r.temEsmaecimento, true);

  /* rolar o trilho tem de alcancar o ultimo campo */
  const alcanca = await cel.p.evaluate(async () => {
    const fint = document.querySelector('#ftFiltrosFixo .ft-fint');
    fint.scrollLeft = fint.scrollWidth;
    await new Promise(s => setTimeout(s, 300));
    const ult = fint.querySelector('.ft-fcampo:last-child');
    const rf = fint.getBoundingClientRect(), ru = ult.getBoundingClientRect();
    return { chegaAoUltimo: ru.right <= rf.right + 2 && ru.left >= rf.left - 2 };
  });
  F.diz('deslizando, chega no ultimo filtro', alcanca.chegaAoUltimo, true);

  F.secao('14. A BARRA INTEIRA CABE NUMA FAIXA RAZOAVEL');
  const topo = await cel.p.evaluate(() =>
    Math.round(document.getElementById('ftBarra').getBoundingClientRect().height));
  F.diz('a barra nao come mais de um quarto da tela', topo < 844 * 0.25, true);

  /* CORTADA a secao que abria uma TERCEIRA pagina em 1500x950 so para
     dizer que no computador a barra segue em flex, numa linha so, e o
     filtro numa grade de tres colunas: e exatamente o que o bloco 2 ja
     cobra no computador, e custava uma pagina inteira de navegador. */
  await cel.ctx.close();
}
