/* ================================================================
   C. OS AJUSTES DA v3.277

   Vem de teste_v303_ajustes.mjs. Quatro pedidos deram origem a ela:
     1) a barra de marca-texto aparece EM CIMA da selecao (nao longe);
     2) o botao de copiar nao sai na impressao;
     3) o separador entre layouts nao existe: nem editor, nem papel, nem Trello;
     4) o quadrado da cor tem a medida e o alinhamento do botao "+" do tecido.

   Era a mais cara das catorze. MEDIDO no arquivo original: 38,2 s, dos
   quais ~33 s eram `setTimeout` de relogio dentro de page.evaluate, mais
   seis remontagens do kit de teste a 2,6 s fixos cada uma.

   O que mudou aqui, e so isso:
     - o kit e montado UMA vez (F.montaKit) e o estado dele fica guardado
       DENTRO da pagina, para ser devolvido sem trafego;
     - toda espera de relogio virou espera de SINAL (F.assenta ou
       waitForFunction): espera-se o que MUDA quando a acao termina;
     - as voltas de tema escuro da secao 15 sairam: o tema escuro na
       impressao e coberto elemento a elemento pelo bloco D.
   ================================================================ */

export async function roda(F) {
  const { ctx, p } = await F.novaPagina({ viewport: { width: 1400, height: 900 } });
  await p.goto(F.URL_EDITOR, { waitUntil: 'domcontentloaded' });
  await F.esperaPronto(p, null, 60000);
  await F.montaKit(p);

  /* O DOCUMENTO DE TESTE, GUARDADO INTEIRO E DENTRO DA PAGINA.
     As secoes 5, 6 e 11 mexem no estado e as de baixo precisam de um
     documento de tres folhas de volta. Guardar em `window` (e nao no
     Node) evita mandar as imagens em base64 do kit para ca e de volta a
     cada uso. */
  await p.evaluate(() => { window.__ftKit = JSON.stringify(coletaEstado()); });

  /* O SINAL do documento: tudo o que muda quando a paginacao, o modo de
     dinheiro ou o cabecalho das paginas 2+ terminam de se refazer. Serve
     de criterio de parada para as secoes 5, 6, 9, 10, 11 e 12. */
  const SINAL = () => {
    const fs = [...document.querySelectorAll('.folha-a4')];
    const vis = el => el && getComputedStyle(el).display !== 'none';
    const c = fs[1] && fs[1].querySelector('.folha-topo .warn-bar');
    return {
      modo: document.body.classList.contains('sem-dinheiro') ? 'sem' : 'com',
      folhas: fs.map(f => f.querySelectorAll('.lay-modulo').length),
      niveis: [...document.querySelectorAll('.lay-tabela-mini')].map(t => +(t.dataset.nivel || 0)),
      rodapes: fs.map(f => f.querySelectorAll('.doc-rodape').length),
      cabecalhos: fs.slice(1).every(f => !!f.querySelector('.folha-topo')),
      quantos: fs.slice(1).length,
      msg: c ? (vis(c.querySelector('.warn-com')) ? 'com'
              : (vis(c.querySelector('.warn-sem')) ? 'sem' : 'nenhuma')) : '(sem cabeçalho)' };
  };

  /* trocar o modo de valores redesenha o documento inteiro: as suites
     originais dormiam 1400 ms (e 2800 ms na secao 12). Aqui espera-se o
     documento parar de mudar. */
  const trocaDinheiro = async () => {
    await p.evaluate(() => document.getElementById('miDinheiro').click());
    /* PISO CURTO ANTES DO SINAL. O editor nao recompoe na hora: aplicaDinheiro
       chama reajustaSoon(), que e um debounce de 120ms seguido de
       requestAnimationFrame. Sem o piso, as duas primeiras leituras de
       F.assenta cabiam DENTRO do debounce, davam iguais e a suite media o
       documento antigo - foi assim que a secao 12 passou a acusar "tabela
       comprimida a toa" no modo sem valores. O piso garante que o reajuste
       JA disparou; daqui em diante quem manda e o sinal. */
    await p.waitForTimeout(220);
    return F.assenta(p, SINAL);
  };

  /* ---------------------------------------------------------------- */
  F.secao('1. BARRA DE MARCA-TEXTO SOBRE A SELECAO');
  let r = await p.evaluate(async () => {
    const area = document.querySelector('.lay-area');
    if (!area.textContent.trim()) { area.textContent = 'Texto de teste para selecionar aqui.'; }
    const no = [...area.childNodes].find(n => n.nodeType === 3) || area.firstChild;
    const rg = document.createRange(); rg.setStart(no, 0); rg.setEnd(no, Math.min(12, no.textContent.length));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise(s => requestAnimationFrame(() => requestAnimationFrame(s)));
    const sb = document.getElementById('selbar');
    /* ESPERAR O SINAL: a barra abrir, ganhar largura e parar de se mexer.
       Aqui havia um sleep de 120 ms; o criterio de verdade e a posicao ter
       assentado, e nao um numero. */
    let ant = null;
    for (let i = 0; i < 60; i++) {
      const b = sb.getBoundingClientRect();
      const agora = sb.classList.contains('open') && b.width > 0
        ? Math.round(b.top) + 'x' + Math.round(b.left) : null;
      if (agora !== null && agora === ant) break;
      ant = agora;
      await new Promise(s => setTimeout(s, 40));
    }
    const b = sb.getBoundingClientRect(), t = rg.getBoundingClientRect();
    return { pai: sb.parentElement === document.body ? 'body' : sb.parentElement.className,
      aberta: sb.classList.contains('open'),
      /* a barra fica ACIMA e centrada no trecho selecionado.
         CORTADO: a igualdade exata "folga de 8px". Se virar 6 ou 10 nao
         quebra nada, e o defeito de verdade (a barra longe da selecao) e
         pego pelo desvio horizontal e pelo "inteira dentro da tela". */
      desvioHorizontal: Math.abs(Math.round((b.left + b.width / 2) - (t.left + t.width / 2))),
      dentroDaTela: b.top >= 0 && b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight };
  });
  F.diz('a barra mora no <body> (fora do zoom)', r.pai, 'body');
  F.diz('  e esta aberta', r.aberta, true);
  F.diz('centrada no trecho (desvio <= 2px)', r.desvioHorizontal <= 2, true);
  F.diz('  e inteira dentro da tela', r.dentroDaTela, true);

  /* ---------------------------------------------------------------- */
  F.secao('2. IMPRESSAO: copiar some, layout continua');
  await p.emulateMedia({ media: 'print' });
  r = await p.evaluate(() => {
    const v = el => el ? getComputedStyle(el).display : '(sem)';
    return { copiar: v(document.querySelector('.lay-btn')),
             excluir: v(document.querySelector('.lay-del')),
             maisTecido: v(document.querySelector('.tec-btn')),
             barraSel: v(document.getElementById('selbar')),
             separador: getComputedStyle(document.querySelectorAll('.lay-modulo')[1]
               || document.querySelector('.lay-modulo')).borderTopWidth };
  });
  F.diz('botao copiar escondido no papel', r.copiar, 'none');
  F.diz('  excluir tambem (ja era)', r.excluir, 'none');
  F.diz('  e o + do tecido', r.maisTecido, 'none');
  F.diz('separador some no papel', r.separador, '0px');
  await p.emulateMedia({ media: 'screen' });

  /* ---------------------------------------------------------------- */
  F.secao('3. SEPARADOR: nem na tela, nem no Trello');
  r = await p.evaluate(() => {
    const mods = document.querySelectorAll('.lay-modulo');
    const html = gerarHTML([]);
    return { naTela: getComputedStyle(mods[1] || mods[0]).borderTopWidth,
             quantos: mods.length,
             noCssDoCelular: /\.lay-modulo\{[^}]*border-top:1px/.test(html),
             regraAntiga: /lay-modulo \+ \.lay-modulo\{border-top:1px/.test(html) };
  });
  F.diz('sem risco entre modulos na tela', r.naTela, '0px');
  F.diz('  e o CSS do celular nao traz borda', r.noCssDoCelular, false);
  F.diz('  nem a regra antiga do editor', r.regraAntiga, false);

  /* ---------------------------------------------------------------- */
  F.secao('4. O QUADRADO DA COR NA LINHA DO TECIDO');
  /* ATE A v3.339 esta secao comparava o quadradinho da cor com o botao +
     do tecido: os dois moravam dentro da MESMA caixa de campo, e tinham
     de ter o mesmo tamanho, o mesmo raio e o mesmo recuo.

     Na v3.340 essa premissa deixou de existir. Tecido e cor viraram um
     cartao so: o + subiu para o cabecalho do cartao e o quadrado desceu
     para a linha do tecido, cobrindo as DUAS alturas do par (nome do
     tecido em cima, nome da cor embaixo).

     Entao o que se cobra mudou junto, e passa a ser o que o desenho novo
     promete: um quadrado por linha, todos do mesmo tamanho, cada um
     centrado na sua propria linha, e o + uma vez so, no cabecalho. */
  r = await p.evaluate(() => {
    const mod = [...document.querySelectorAll('.lay-modulo')].find(m => m.querySelector('.tec-card'));
    const linhas = [...mod.querySelectorAll('.tec-linha')];
    const sws = linhas.map(l => l.querySelector('.cor-sw'));
    const mede = el => { const r = el.getBoundingClientRect();
      return { l: +r.width.toFixed(1), a: +r.height.toFixed(1) }; };
    /* cada quadrado centrado na SUA linha, e nao numa caixa de campo */
    const centro = (sw, linha) => {
      const e = sw.getBoundingClientRect(), c = linha.getBoundingClientRect();
      return +((e.top + e.height / 2) - (c.top + c.height / 2)).toFixed(1);
    };
    return {
      linhas: linhas.length,
      todosTem: sws.every(Boolean),
      tamanhos: [...new Set(sws.filter(Boolean).map(s => JSON.stringify(mede(s))))],
      centros: sws.map((s, i) => s ? centro(s, linhas[i]) : null),
      /* o + existe uma vez so, e no cabecalho do cartao */
      mais: mod.querySelectorAll('.btn-add-tecido').length,
      maisNoCabecalho: !!mod.querySelector('.tec-cab .btn-add-tecido'),
      /* e nao sobrou rotulo Tecido em cada linha */
      rotulosNaLinha: mod.querySelectorAll('.tec-linha .ft-combo-rotulo').length,
      rotuloNoTopo: (mod.querySelector('.tec-cab-rot') || {}).textContent || '',
    };
  });
  F.diz('toda linha de tecido tem o seu quadrado', r.todosTem, true);
  F.diz('  e todos do mesmo tamanho', r.tamanhos.length, 1);
  F.diz('  cada um centrado na sua linha', r.centros.map(c => Math.abs(c) <= 1),
    r.centros.map(() => true));
  F.diz('o + existe uma vez so', r.mais, 1);
  F.diz('  e mora no cabecalho do cartao', r.maisNoCabecalho, true);
  F.diz('nenhuma linha carrega o rotulo Tecido', r.rotulosNaLinha, 0);
  F.diz('  ele e um so, no alto', r.rotuloNoTopo, 'Tecido');

  /* A DENSIDADE (v3.341).

     O desenho da v3.340 estava certo e a densidade errada: cada linha
     saia com 45px, quase o dobro da maquete, porque tres regras de
     fora do cartao mandavam nela (a altura minima da caixa de campo, a
     fonte unica dos dois campos e o alinhamento pela linha de base de
     um <textarea> inline-block). Nenhuma delas aparece no bloco do
     cartao, e por isso nenhuma seria notada relendo o bloco do cartao.
     O que se cobra aqui e o RESULTADO: a altura da linha, a cor em
     corpo menor que o tecido, e o quadrado na direita maxima com o "x"
     a esquerda dele. */
  r = await p.evaluate(() => {
    const mod = [...document.querySelectorAll('.lay-modulo')].find(m => m.querySelector('.tec-card'));
    const linha = mod.querySelector('.tec-linha');
    const card = mod.querySelector('.tec-card');
    const sw = linha.querySelector('.cor-sw');
    const x = linha.querySelector('.tec-remover');
    const px = el => parseFloat(getComputedStyle(el).fontSize);
    const dir = el => el.getBoundingClientRect().right;
    const cab = mod.querySelector('.tec-cab');
    const ref = mod.querySelector('.lay-topo .combo-ref .ft-combo-caixa');
    const alt = el => +el.getBoundingClientRect().height.toFixed(1);
    return {
      altura: +linha.getBoundingClientRect().height.toFixed(1),
      alturaSw: alt(sw),
      alturaCab: alt(cab),
      alturaRef: alt(ref),
      fonteTecido: px(linha.querySelector('.combo-tecido textarea')),
      fonteCor: px(linha.querySelector('.combo-cor textarea')),
      /* nada da linha passa do quadrado: ele e o ultimo */
      quadradoUltimo: [...linha.children].every(c => dir(c) <= dir(sw) + 0.5),
      /* o "x" some quando ha uma linha so; ai o rect dele e zero e a
         conferencia continua verdadeira, que e o que se quer */
      xAntes: dir(x) <= sw.getBoundingClientRect().left + 0.5,
      folgaDireita: +(card.getBoundingClientRect().right - dir(sw)).toFixed(1),
    };
  });
  F.diz('a linha do tecido cabe em 33px  (' + r.altura + ')', r.altura <= 33, true);
  /* RESPIRO EM CIMA E EMBAIXO (v3.342). Sem ele a linha aperta o
     quadrado contra o filete de cima e o de baixo. O que se cobra e a
     sobra vertical de cada lado do quadrado, que e o elemento mais alto
     da linha: 4px por lado, pedidos olhando a tela. */
  F.diz('  com respiro dos dois lados do quadrado  ('
    + ((r.altura - r.alturaSw) / 2).toFixed(1) + 'px)',
    (r.altura - r.alturaSw) / 2 >= 4, true);
  F.diz('  e o nome da cor e menor que o do tecido',
    r.fonteCor < r.fonteTecido, true);
  /* O CABECALHO DO CARTAO e a REFERENCIA sao a primeira linha das duas
     colunas do modulo, lado a lado. Alturas diferentes desalinham o topo
     inteiro, que e por onde o olho entra. */
  F.diz('o alto do cartao tem a altura da referencia ao lado  ('
    + r.alturaCab + ' x ' + r.alturaRef + ')',
    Math.abs(r.alturaCab - r.alturaRef) <= 0.5, true);
  F.diz('o quadrado e o ultimo da linha', r.quadradoUltimo, true);
  F.diz('  com o "x" a esquerda dele', r.xAntes, true);
  F.diz('  e rente a borda do cartao  (' + r.folgaDireita + 'px)',
    r.folgaDireita <= 8, true);

  /* ---------------------------------------------------------------- */
  F.secao('4B. O CARTAO DE DESIGN E O CONVITE DO TECIDO (v3.343)');
  /* O DESENHO NOVO, e o que ele promete:

       . o "+" no canto superior direito e a palavra DESIGN em pe logo
         abaixo dele, num trilho separado do conteudo;
       . o conteudo em FILEIRAS: etiquetas em cima, DTF, Sublimacao, e o
         resto junto no fim;
       . a ficha de cor com a amostra RENTE a borda esquerda e o codigo a
         direita, e a amostra e MEIO QUADRADO: metade da largura da
         altura dela;
       . o rotulo "Etiqueta" da fileira so aparece quando nao ha etiqueta
         nenhuma marcada, porque ali ele e o convite;
       . e o cartao de tecido convida ("Escolha o Tecido") enquanto
         estiver vazio, mas no PAPEL volta a se chamar Tecido: convite e
         ordem para quem monta, nao informacao para quem recebe. */
  await p.evaluate(async () => {
    aplicaEstado({ _formato:'FOURTIME_ORCAMENTO', _versao:2, header:{ cliente:'DESIGN' },
      layouts:[
        { ref:'COM TUDO', tecidos:['DRY FIT'], cores:['Verde Musgo'],
          design:[{ tag:'Eti. Fourtime', cores:[] }, { tag:'Eti. Cliente', cores:[] },
                  /* DEZ CORES para o DTF: com menos, elas cabem numa
                     fileira so na largura desta suite, e a conferencia do
                     alinhamento da pilula nao teria o que medir. */
                  { tag:'DTF', cores:['001','014','152','012','015','059','188','233','026','041'] },
                  { tag:'Subli', cores:['S17'] },
                  { tag:'Patch', cores:[] }, { tag:'Bordado', cores:[] }],
          grade:'adulto', tamanhos:{ M:{ q:'10', u:'50,00' } }, obs:'', img:'' },
        { ref:'SEM NADA', tecidos:[''], cores:[''], design:[],
          grade:'adulto', tamanhos:{}, obs:'', img:'' }],
      anotacoes:[], ajustes:[] });
    await new Promise(s => setTimeout(s, 700));
  });
  r = await p.evaluate(() => {
    const mods = [...document.querySelectorAll('.lay-modulo')];
    const cheio = mods[0], vazio = mods[1];
    const cx = cheio.querySelector('.design-caixa');
    const mais = cx.querySelector('.design-add'), rot = cx.querySelector('.design-rot');
    /* MEDE O QUE EXISTE, e devolve zero para o que nao existe: a suite
       tem de REPROVAR numa versao anterior, e nao morrer nela. */
    const NADA = { left:0, top:0, right:0, bottom:0, width:0, height:0 };
    const b = el => el ? el.getBoundingClientRect() : NADA;
    const rc = b(cx), rm = b(mais), rr = b(rot);
    const tok = cheio.querySelector('.dtf-tok');
    const chip = tok && tok.querySelector('.dtf-chip');
    const cod = tok && tok.querySelector('.dtf-cod');
    const rt = b(tok), rch = b(chip), rcd = b(cod);
    return {
      /* o trilho */
      maisNoCanto: [+(rc.right - rm.right).toFixed(0) <= 6, +(rm.top - rc.top).toFixed(0) <= 6],
      rotEmPe: rot ? getComputedStyle(rot).writingMode : '(sem rotulo)',
      rotAbaixoDoMais: rr.top >= rm.bottom - 1,
      rotNaDireita: rr.left > rc.left + rc.width / 2,
      /* as fileiras, na ordem */
      fileiras: [...cheio.querySelectorAll('.des-fila')]
        .map(f => [...f.querySelectorAll('.design-grupo')].map(g => g.dataset.tag).join('+')
                  || (f.querySelector('.design-ph') ? '(convite)' : '(vazia)')),
      /* a ficha de cor */
      /* "rente" e ate a moldura: a ficha tem 1px de borda de cada lado, e
         a amostra preenche o que sobra dentro dela. Por isso o esperado e
         1px de folga na esquerda e 2px a menos de altura, e nao zero. */
      chipRente: [+(rch.left - rt.left).toFixed(1), +(rt.height - rch.height).toFixed(1)],
      chipMeioQuadrado: +(rt.height / rch.width).toFixed(2),
      codigoADireita: !!cod && rcd.left >= rch.right - 0.5,
      corpoDoCodigo: cod ? getComputedStyle(cod.parentElement).fontSize : '(sem codigo)',
      /* A PILULA FICA CENTRADA NAS FILEIRAS DE COR, e nao alinhada com a
         primeira. So se pode medir com cor bastante para quebrar em duas
         fileiras: por isso o layout de teste leva dez codigos.
         O que se compara e o centro da pilula com o centro do BLOCO de
         cores, e nao com o da linha do cartao: quem tem de mandar aqui
         sao as cores daquela tecnica. */
      pilulaCentrada: (()=>{
        const g = cheio.querySelector('.design-grupo[data-tag="DTF"]');
        if(!g) return null;
        const tg = g.querySelector('.design-tag');
        const bandeja = g.querySelector('.design-tokens');
        const toks = [...g.querySelectorAll('.dtf-tok')];
        if(!tg || !bandeja || toks.length < 2) return null;
        const linhas = [...new Set(toks.map(t => Math.round(t.getBoundingClientRect().top)))];
        const rt = tg.getBoundingClientRect(), rb = bandeja.getBoundingClientRect();
        return { fileiras: linhas.length,
                 desvio: +((rt.top + rt.height / 2) - (rb.top + rb.height / 2)).toFixed(1) };
      })(),
      /* o convite da etiqueta */
      conviteComEtiqueta: !!cheio.querySelector('.design-ph'),
      conviteSemEtiqueta: !!vazio.querySelector('.design-ph'),
      /* O CARTAO DE TECIDO. O alto dele diz sempre "Tecido": ele nomeia o
         cartao. O convite mora na LINHA em branco, como placeholder do
         campo, com "Cor" logo abaixo como sempre. */
      rotuloDoCartao: [...document.querySelectorAll('.tec-cab-rot')]
        .map(r => r.textContent.trim()),
      conviteNoAlto: document.querySelectorAll('.tec-cab-conv').length,
      linhaVazia: (()=>{ const l = vazio.querySelector('.tec-linha');
        return [l.querySelector('.combo-tecido textarea').getAttribute('placeholder'),
                l.querySelector('.combo-cor textarea').getAttribute('placeholder')]; })(),
      linhaCheia: (()=>{ const l = cheio.querySelector('.tec-linha');
        return [l.querySelector('.combo-tecido textarea').value,
                l.querySelector('.combo-tecido textarea').getAttribute('placeholder')]; })(),
    };
  });
  F.diz('o "+" fica no canto superior direito do cartao', r.maisNoCanto, [true, true]);
  F.diz('  a palavra DESIGN esta em pe', r.rotEmPe, 'vertical-rl');
  F.diz('  abaixo do "+" e na direita', [r.rotAbaixoDoMais, r.rotNaDireita], [true, true]);
  F.diz('as fileiras saem na ordem combinada', r.fileiras,
    ['Eti. Fourtime+Eti. Cliente', 'DTF', 'Subli', 'Patch+Bordado']);
  F.diz('a amostra encosta na moldura da ficha  (' + r.chipRente + ')',
    [r.chipRente[0] <= 1.5, r.chipRente[1] <= 2.5], [true, true]);
  F.diz('  e e meio quadrado: a altura vale duas larguras  (' + r.chipMeioQuadrado + ')',
    Math.abs(r.chipMeioQuadrado - 2) <= 0.25, true);
  F.diz('  com o codigo a direita dela', r.codigoADireita, true);
  F.diz('  em 9px', r.corpoDoCodigo, '9px');
  F.diz('a pilula fica CENTRADA nas fileiras de cor  ('
    + JSON.stringify(r.pilulaCentrada) + ')',
    !!r.pilulaCentrada && r.pilulaCentrada.fileiras >= 2
      && Math.abs(r.pilulaCentrada.desvio) <= 1.5, true);
  F.diz('com etiqueta marcada, o rotulo Etiqueta sai', r.conviteComEtiqueta, false);
  F.diz('  sem nenhuma, ele fica de convite', r.conviteSemEtiqueta, true);
  F.diz('o alto do cartao de tecido diz sempre Tecido',
    [...new Set(r.rotuloDoCartao)], ['Tecido']);
  F.diz('  e nao ha mais convite no alto', r.conviteNoAlto, 0);
  F.diz('a linha em branco convida a escolher, com Cor embaixo',
    r.linhaVazia, ['Escolha o Tecido', 'Cor']);
  F.diz('  e a linha preenchida mostra o tecido', r.linhaCheia[0], 'DRY FIT');

  /* NO PAPEL O CONVITE CONTINUA. Um tecido faltando nao e um campo sem
     nome: e um furo no pedido, e tem de aparecer igual nos tres lugares.
     O convite e placeholder, e a impressao ja mostra placeholder dos
     campos do layout de proposito. E sem o "+", que nao e impresso, a
     palavra DESIGN nao pode ficar espremida no trilho. */
  await p.emulateMedia({ media: 'print' });
  r = await p.evaluate(() => {
    const vazio = [...document.querySelectorAll('.lay-modulo')]
      .find(m => { const t = m.querySelector('.tec-linha .combo-tecido textarea');
                   return t && !t.value.trim(); })
      || [...document.querySelectorAll('.lay-modulo')].pop();
    const campo = vazio && vazio.querySelector('.tec-linha .combo-tecido textarea');
    const tag = document.querySelector('.lay-modulo .design-tag');
    const cx = document.querySelector('.lay-modulo .design-caixa');
    const rot = cx && cx.querySelector('.design-rot');
    const rc = cx ? cx.getBoundingClientRect() : null;
    const rr = rot ? rot.getBoundingClientRect() : null;
    const mais = cx && cx.querySelector('.design-add');
    return { convite: campo ? campo.getAttribute('placeholder') : '(sem campo)',
             conviteVisivel: campo ? getComputedStyle(campo, '::placeholder').opacity : null,
             xDaPilula: tag ? getComputedStyle(tag, '::after').display : '(sem pilula)',
             maisImpresso: mais ? getComputedStyle(mais).display : 'none',
             folgaAcimaDoRotulo: rr ? +(rr.top - rc.top).toFixed(1) : null,
             trilho: (rc && cx) ? +(rc.right
               - cx.querySelector('.design-wrap').getBoundingClientRect().right).toFixed(1) : null,
             fonte: rot ? parseFloat(getComputedStyle(rot).fontSize) : null };
  });
  F.diz('no papel a linha em branco continua convidando',
    [r.convite, r.conviteVisivel], ['Escolha o Tecido', '1']);
  F.diz('  e o "x" da pilula de design nao e impresso', r.xDaPilula, 'none');
  F.diz('  o "+" tambem nao', r.maisImpresso, 'none');
  F.diz('  e a palavra DESIGN nao fica espremida no trilho  ('
    + r.trilho + ' para ' + r.fonte + 'px)',
    r.trilho !== null && (r.trilho - r.fonte) >= 6, true);
  await p.emulateMedia({ media: 'screen' });

  /* O PAINEL DE CORES ESCOLHE VARIAS DE UMA VEZ (v3.344).
     Ate a v3.343 ele fechava a cada cor: um pedido de DTF com oito cores
     custava oito aberturas, oito posicionamentos e oito buscas. Agora ele
     so fecha quando se clica fora, e clicar de novo na mesma cor tira, que
     e a unica leitura possivel do segundo clique com o painel aberto. */
  await p.evaluate(() => {
    /* comeca de um layout com DTF e NENHUMA cor, para o painel ser a
       unica origem do que entrar */
    aplicaEstado({ _formato:'FOURTIME_ORCAMENTO', _versao:2, header:{ cliente:'CORES' },
      layouts:[{ ref:'CORES', tecidos:['DRY FIT'], cores:[''],
        design:[{ tag:'DTF', cores:[] }],
        grade:'adulto', tamanhos:{ M:{ q:'2', u:'10,00' } }, obs:'', img:'' }],
      anotacoes:[], ajustes:[] });
  });
  await p.waitForFunction(() => !!document.querySelector('.lay-modulo .design-grupo[data-tag="DTF"]'));
  /* NA PILULA DTF, e nao no cartao (v3.354). O menu de cores deixou de
     pertencer ao cartao inteiro e passou a pertencer a pilula da tecnica:
     clique direito no vao vazio, no Silk ou numa etiqueta nao abre nada. */
  await p.click('.lay-modulo .design-grupo[data-tag="DTF"] .design-tag', { button: 'right' });
  await p.waitForFunction(() => {
    const m = document.getElementById('ctxCores');
    return m && getComputedStyle(m).display === 'block';
  }, null, { timeout: 8000 });
  const cores = async () => p.evaluate(() =>
    [...document.querySelectorAll('.lay-modulo .dtf-tok')].map(t => t.dataset.dtf));
  const painelAberto = () => p.evaluate(() =>
    getComputedStyle(document.getElementById('ctxCores')).display);

  /* CLICA SO SE O PAINEL AINDA ESTIVER ABERTO. Numa versao que fecha a
     cada escolha, o segundo clique esperaria por um botao invisivel ate
     estourar o tempo e derrubaria o bloco inteiro: a suite tem de
     REPROVAR na versao anterior, e nao morrer nela. */
  const escolhe = async cod => {
    if (await painelAberto() !== 'block') return;
    await p.click('#ctxCores .dtf-item[data-num="' + cod + '"]');
    await p.waitForTimeout(160);
  };
  await escolhe('014');
  const passo1 = { cores: await cores(), painel: await painelAberto() };
  await escolhe('152');
  const passo2 = { cores: await cores(), painel: await painelAberto() };
  /* o segundo clique na MESMA cor desfaz */
  await escolhe('014');
  const passo3 = { cores: await cores(), painel: await painelAberto() };
  const marcada = await p.evaluate(() => {
    const b = document.querySelector('#ctxCores .dtf-item[data-num="152"]');
    return !!b && b.classList.contains('escolhida');
  });
  /* clicar FORA e o gesto de terminar */
  await p.mouse.click(60, 620);
  await p.waitForTimeout(200);
  const depoisDeFora = await painelAberto();

  F.diz('a primeira cor entra e o painel FICA aberto',
    [passo1.cores, passo1.painel], [['014'], 'block']);
  F.diz('  a segunda entra sem reabrir nada',
    [passo2.cores, passo2.painel], [['014', '152'], 'block']);
  F.diz('  clicar de novo na mesma cor tira ela',
    [passo3.cores, passo3.painel], [['152'], 'block']);
  F.diz('  e o painel marca o que ja esta no layout', marcada, true);
  F.diz('clicar fora e que fecha o painel', depoisDeFora, 'none');

  /* devolve o documento do kit: as secoes de baixo contam com ele */
  await p.evaluate(() => aplicaEstado(JSON.parse(window.__ftKit)));
  await F.assenta(p, SINAL);

  /* ---------------------------------------------------------------- */
  F.secao('5. BORDA DA FILEIRA SINALIZADA SEGUE A TINTA');
  await p.evaluate(() => {
    const est = coletaEstado(); const L = est.layouts[0];
    L.tamanhos['10A'] = { q: '6', u: '79,90' };        /* infantil na grade adulta */
    aplicaEstado(est);
  });
  /* eram 500 ms fixos: o sinal e a fileira cruzada existir na tabela */
  await p.waitForFunction(() => !!document.querySelector('.lay-modulo .lay-tabela-mini tr.tam-infantil'));
  await F.assenta(p, SINAL);
  const inf = await p.evaluate(() => {
    const t2 = document.querySelector('.lay-modulo .lay-tabela-mini');
    const cruz = [...t2.querySelectorAll('tbody tr')].find(x => x.className.includes('tam-infantil'));
    const normal = [...t2.querySelectorAll('tbody tr')].find(x => !x.className);
    const g = td => { const s = getComputedStyle(td);
      return { topo: s.borderTopColor, esq: s.borderLeftColor, base: s.boxShadow }; };
    return { cruz: g(cruz.children[1]), normal: g(normal.children[1]),
             hCruz: +cruz.getBoundingClientRect().height.toFixed(2),
             hNormal: +normal.getBoundingClientRect().height.toFixed(2) };
  });
  /* agora o espelho: grade infantil com tamanho adulto */
  await p.evaluate(() => {
    const est2 = coletaEstado(); const L2 = est2.layouts[0];
    L2.grade = 'infantil'; L2.tamanhos['G'] = { q: '4', u: '50,00' };
    aplicaEstado(est2);
  });
  await p.waitForFunction(() => !!document.querySelector('.lay-modulo .lay-tabela-mini tr.tam-adulto'));
  await F.assenta(p, SINAL);
  r = await p.evaluate(() => {
    const t3 = document.querySelector('.lay-modulo .lay-tabela-mini');
    const adu = [...t3.querySelectorAll('tbody tr')].find(x => x.className.includes('tam-adulto'));
    const g = td => { const s = getComputedStyle(td);
      return { topo: s.borderTopColor, esq: s.borderLeftColor, base: s.boxShadow }; };
    /* A LINHA DO DOCUMENTO NAO E MAIS A DO CABECALHO (v3.353): a grade do
       cabecalho ganhou token proprio e um cinza mais claro. Quem representa
       a linha do documento aqui e a caixa de imagem, que sempre leu
       --doc-linha e nunca teve cor propria. */
    const img = document.querySelector('.folha-a4 .lay-img');
    return { adu: adu ? g(adu.children[1]) : null,
             linhaDoDocumento: img ? getComputedStyle(img).borderTopColor : null };
  });
  F.diz('infantil: borda de topo vermelha', inf.cruz.topo, 'rgb(244, 199, 201)');
  F.diz('  divisorias internas tambem', inf.cruz.esq, 'rgb(244, 199, 201)');
  F.diz('  e a base (sombra, nao borda)', inf.cruz.base, 'rgb(244, 199, 201) 0px -1px 0px 0px inset');
  /* a linha do documento agora e uma so: comparar com ELA, e nao com um hex */
  F.diz('fileira normal usa a linha do documento', inf.normal.topo, r.linhaDoDocumento);
  F.diz('a linha NAO fica mais alta', inf.hCruz, inf.hNormal);
  F.diz('adulto: borda azul', r.adu && r.adu.topo, 'rgb(187, 211, 245)');
  F.diz('  e a base azul', r.adu && r.adu.base, 'rgb(187, 211, 245) 0px -1px 0px 0px inset');

  /* ---------------------------------------------------------------- */
  F.secao('6. PAGINACAO: a ultima folha nao se parte em duas');
  /* A regra da paginacao e 2 layouts por folha; so a ULTIMA pode ter 1.
     Duas folhas seguidas com 1 layout cada e o sintoma de que a compressao
     desistiu cedo demais.

     O original clicava no KIT DE TESTE cinco vezes e dormia 2,6 s depois de
     cada clique, porque o kit sorteia o conteudo e a garantia tinha de
     valer para varios documentos. Mas o kit sempre entrega os MESMOS SEIS
     layouts: o que o laco precisava eram documentos de TAMANHOS diferentes.
     Isso se consegue com o documento ja montado, cortando a lista de
     layouts com aplicaEstado() - sem 13 s de relogio, e sem depender de
     sorteio para dizer se a paginacao esta certa. */
  const casos = [];
  for (const n of [6, 5, 4, 3, 2, 1]) {
    await p.evaluate(n => { const est = JSON.parse(window.__ftKit);
      est.layouts = est.layouts.slice(0, n); aplicaEstado(est); }, n);
    const s = await F.assenta(p, SINAL);
    casos.push(s.folhas);
  }
  const ruins = casos.filter(d => d.slice(0, -1).some(n => n < 2 && n > 0));
  F.diz('nenhuma folha do meio com 1 layout so  ' + JSON.stringify(casos), ruins.length, 0);
  /* devolve o documento inteiro para quem vem depois */
  await p.evaluate(() => aplicaEstado(JSON.parse(window.__ftKit)));
  await F.assenta(p, SINAL);

  /* ---------------------------------------------------------------- */
  F.secao('7. AJUSTES: colados ao rodape, sem linha quando vazios');
  r = await F.assenta(p, () => {
    const f = [...document.querySelectorAll('.folha-a4')].slice(-1)[0];
    const bl = f.querySelector('.obs-fin-bloco'), rod = f.querySelector('.doc-rodape');
    return { colado: +(rod.getBoundingClientRect().top - bl.getBoundingClientRect().bottom).toFixed(0),
             temAjustes: document.body.classList.contains('tem-ajustes'),
             bordaTela: getComputedStyle(bl, '::before').borderTopWidth };
  });
  F.diz('o bloco encosta no rodape', r.colado, 0);
  F.diz('  sem ajuste nenhum no documento', r.temAjustes, false);
  F.diz('  e sem linha na tela', r.bordaTela, '0px');
  await p.emulateMedia({ media: 'print' });
  r = await p.evaluate(() => getComputedStyle(
    document.querySelector('.folha-a4:last-of-type .obs-fin-bloco'), '::before').borderTopWidth);
  F.diz('nem no papel', r, '0px');
  /* eram 600 ms depois do clique: o sinal e a classe do body e a linha
     aparecer no bloco que sobrou na ultima folha */
  await p.evaluate(() => document.getElementById('finAdd').click());
  await p.waitForFunction(() => document.body.classList.contains('tem-ajustes'));
  r = await F.assenta(p, () => {
    const bl = document.querySelector('.folha-a4:last-of-type .obs-fin-bloco');
    return { comAjuste: document.body.classList.contains('tem-ajustes'),
             borda: bl ? getComputedStyle(bl, '::before').borderTopWidth : null };
  });
  F.diz('com um ajuste, a linha volta no papel', [r.comAjuste, r.borda], [true, '1px']);
  await p.emulateMedia({ media: 'screen' });
  r = await p.evaluate(() => {
    const f = [...document.querySelectorAll('.folha-a4')].slice(-1)[0];
    const bl = f.querySelector('.obs-fin-bloco'), ln = f.querySelector('.doc-rodape-linha');
    const a = getComputedStyle(bl, '::before'), c = getComputedStyle(ln);
    const w = el => +el.getBoundingClientRect().width.toFixed(1);
    return { cor: [a.borderTopColor, c.borderTopColor], esp: [a.borderTopWidth, c.borderTopWidth],
             abaixo: [getComputedStyle(bl).paddingTop, c.marginBottom], larg: [w(bl), w(ln)] };
  });
  F.diz('a linha do ajuste e a do rodape tem a mesma cor', r.cor[0], r.cor[1]);
  F.diz('  a mesma espessura', r.esp[0], r.esp[1]);
  F.diz('  o mesmo respiro abaixo', r.abaixo[0], r.abaixo[1]);
  F.diz('  e a mesma largura', r.larg[0], r.larg[1]);

  /* ---------------------------------------------------------------- */
  F.secao('8. CABECALHO DAS PAGINAS 2+');
  r = await p.evaluate(() => {
    const fs = [...document.querySelectorAll('.folha-a4')];
    const f1 = fs[0], f2 = fs[1];
    const cab = f2.querySelector('.folha-topo');
    if (!cab) return { erro: 'sem cabeçalho na página 2' };
    const cols = getComputedStyle(cab).gridTemplateColumns.split(' ');
    const av = cab.querySelector('.warn-bar');
    const lh = parseFloat(getComputedStyle(av).lineHeight) || 1;
    const logo = cab.querySelector('.logo-box');
    return { colunas: cols.length,
      /* 1 de 4 para a logo, as outras 3 combinadas: a proporcao e o que
         importa, e nao o numero em px - a pagina 1 tem gaps de 1px entre as
         colunas e este cabecalho nao tem nenhum. */
      proporcao: +(parseFloat(cols[1]) / parseFloat(cols[0])).toFixed(2),
      fileiras: +(cab.getBoundingClientRect().height
        / (f1.querySelector('.hd-campo').getBoundingClientRect().height)).toFixed(1),
      linhasDoAviso: Math.round(av.querySelector('.warn-com').getBoundingClientRect().height / lh),
      logoAEsquerda: getComputedStyle(logo).justifyContent,
      pecasSoltas: f2.querySelectorAll(':scope > .folha-logo, :scope > .warn-clone').length,
      /* o comportamento com/sem valores continua valendo */
      avisoTemOsDois: !!av.querySelector('.warn-com') && !!av.querySelector('.warn-sem') };
  });
  F.diz('duas colunas', r.colunas, 2);
  F.diz('  a 2a vale exatamente pelas outras tres', r.proporcao, 3);
  F.diz('duas fileiras 20% mais baixas', r.fileiras, 1.6);
  F.diz('logo encostada a esquerda', r.logoAEsquerda, 'flex-start');
  F.diz('sem as pecas soltas antigas', r.pecasSoltas, 0);
  F.diz('o aviso mantem os dois recados', r.avisoTemOsDois, true);

  /* ---------------------------------------------------------------- */
  F.secao('9. COM / SEM VALORES nao derruba o cabecalho');
  /* ESPERA A REPAGINACAO TERMINAR, e nao so PARAR DE MUDAR.
     Uma folha recem-criada existe por um instante sem o .folha-topo: o
     cabecalho e montado logo depois dela. O assenta() so cobra duas
     leituras iguais seguidas, e sob a carga da bateria (duas suites de uma
     vez) esse instante durou mais que os 120 ms entre as duas leituras.
     Resultado: a suite falhava aqui uma vez a cada tantas rodadas, sempre
     so nesta linha, com as duas seguintes passando.
     Cabecalho em toda folha 2+ E a condicao de documento pronto. Se ela
     nunca chegar, ai sim e defeito, e o tempo estoura dizendo isso. */
  await p.waitForFunction(() => {
    const fs = [...document.querySelectorAll('.folha-a4')];
    return fs.slice(1).every(f => !!f.querySelector('.folha-topo'));
  }, null, { timeout: 30000 })
    /* ESTOURAR O TEMPO NAO PODE MATAR O BLOCO INTEIRO.
       Sem o catch, um estouro aqui derruba as outras quarenta
       conferencias da suite e o relatorio so diz "o bloco quebrou",
       sem dizer o que estava errado. Com ele, a espera desiste e a
       conferencia logo abaixo falha mostrando o que viu. */
    .catch(() => {});
  const antes = await F.assenta(p, SINAL);
  const depois = await trocaDinheiro();
  const voltou = await trocaDinheiro();                 /* devolve o modo original */
  F.diz('cabecalho presente em todas as paginas 2+', antes.cabecalhos, true);
  F.diz('  continua depois de ocultar os valores', depois.cabecalhos, true);
  F.diz('  e depois de mostrar de novo', voltou.cabecalhos, true);
  F.diz('a mensagem do aviso troca junto', [antes.msg, depois.msg, voltou.msg], ['com', 'sem', 'com']);

  /* ---------------------------------------------------------------- */
  F.secao('10. RODAPE EM TODAS AS PAGINAS, NOS DOIS MODOS');
  for (const modo of ['com', 'sem']) {
    if (modo === 'sem') await trocaDinheiro();
    for (const media of ['screen', 'print']) {
      await p.emulateMedia({ media });
      r = await p.evaluate(() => {
        const fs = [...document.querySelectorAll('.folha-a4')];
        const ult = fs[fs.length - 1], rod = ult.querySelector('.doc-rodape');
        const fr = ult.getBoundingClientRect(), rr = rod.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(ult).paddingBottom) || 0;
        return { porFolha: fs.map(f => f.querySelectorAll('.doc-rodape').length),
                 folga: +((fr.bottom - pad) - rr.bottom).toFixed(0) };
      });
      F.diz(`${modo} valores · ${media}: um rodape por pagina`,
            r.porFolha.every(n => n === 1), true);
      F.diz(`   e o da ultima colado no pe`, r.folga <= 2, true);
    }
  }
  await p.emulateMedia({ media: 'screen' });
  await trocaDinheiro();

  /* ---------------------------------------------------------------- */
  F.secao('11. CASO EXTREMO: nenhuma folha termina estourada');
  /* Dois layouts de ficha pesada na mesma folha: 3 tecidos num, 2 no outro,
     grade cheia, cinco tags de design e observacao comprida. Medido: nem com
     a tabela no ultimo nivel e a imagem no piso de 90px isso cabe - o certo
     e abrir folha. O teste cobra o RESULTADO: nada estourado, nada invadindo. */
  await p.evaluate(() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1600"><rect width="100%" height="100%" fill="#2b6"/></svg>';
    const img = 'data:image/svg+xml;base64,' + btoa(svg);
    const est = coletaEstado();
    const T = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'G1', 'G2', 'G3', 'G4'];
    [2, 3].forEach((i, k) => {
      const L = est.layouts[i]; if (!L) return;
      L.img = img;
      L.tecidos = k === 0 ? ['DRYFIT POLIESTER 100% COM PROTECAO UV50', 'ALGODAO STRONG PENTEADO 30.1', 'PIQUET COM ELASTANO E ACABAMENTO']
                          : ['DRYFIT POLIESTER 100% COM PROTECAO UV50', 'ALGODAO STRONG PENTEADO 30.1'];
      L.design = [{ tag: 'DTF', cores: ['001', '015', '021', '033', '046'] }, { tag: 'Subli', cores: ['S14', 'S21', 'S64'] },
                  { tag: 'Silk', cores: [] }, { tag: 'Patch', cores: [] }, { tag: 'Bordado', cores: [] }];
      L.tamanhos = {}; T.forEach(t => L.tamanhos[t] = { q: '10', u: '99,00' });
      L.obs = 'Observação longa de teste para o caso extremo, com bastante texto para ocupar quatro ou cinco linhas na ficha do layout e apertar a folha ao máximo possível.';
    });
    aplicaEstado(est);
  });
  /* eram 5200 ms fixos. O sinal e a folha parar de se repaginar: o numero
     de folhas, os niveis de compressao da tabela e o pe de cada modulo. */
  await F.assenta(p, () => ({
    folhas: [...document.querySelectorAll('.folha-a4')].map(f => f.querySelectorAll('.lay-modulo').length),
    niveis: [...document.querySelectorAll('.lay-tabela-mini')].map(t => +(t.dataset.nivel || 0)),
    pes: [...document.querySelectorAll('.lay-modulo')].map(m => Math.round(m.getBoundingClientRect().bottom)) }));
  r = await p.evaluate(() => {
    const fs = [...document.querySelectorAll('.folha-a4')];
    const sobre = [];
    fs.forEach(f => { const m = [...f.querySelectorAll('.lay-modulo')];
      for (let i = 1; i < m.length; i++) sobre.push(m[i - 1].getBoundingClientRect().bottom - m[i].getBoundingClientRect().top); });
    const inv = fs.map(f => { const m = [...f.querySelectorAll('.lay-modulo')], rod = f.querySelector('.doc-rodape');
      if (!m.length || !rod) return -99;
      return m[m.length - 1].getBoundingClientRect().bottom - rod.getBoundingClientRect().top; });
    return { estouro: fs.map(f => +excedeFolha(f).toFixed(1)),
             maiorSobreposicao: +Math.max(...(sobre.length ? sobre : [-99])).toFixed(1),
             maiorInvasao: +Math.max(...inv).toFixed(1) };
  });
  F.diz('nenhuma folha passa do A4  ' + JSON.stringify(r.estouro), r.estouro.every(v => v <= 0.5), true);
  F.diz('nenhum layout entra no de cima', r.maiorSobreposicao <= 0.5, true);
  F.diz('nenhum layout invade o rodape', r.maiorInvasao <= 0.5, true);

  /* ---------------------------------------------------------------- */
  F.secao('12. A TABELA NAO FICA MAIS COMPRIMIDA DO QUE PRECISA');
  const olha = async () => p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.folha-a4').forEach((f, i) => {
      const tabs = [...f.querySelectorAll('.lay-tabela-mini')];
      if (!tabs.length) return;
      const nv = Math.max(0, ...tabs.map(t => +(t.dataset.nivel || 0)));
      let seSubisse = null;
      /* se da para soltar UM nivel e a folha continuar cabendo, entao ela
         estava comprimida a toa - e o defeito relatado */
      if (nv > 0) { aplicaNivel(tabs, nv - 1); seSubisse = +excedeFolha(f).toFixed(1); aplicaNivel(tabs, nv); }
      out.push({ folha: i + 1, nivel: nv, seSubisse });
    });
    return { modo: document.body.classList.contains('sem-dinheiro') ? 'sem' : 'com', folhas: out };
  });
  for (const passo of ['agora', 'trocando', 'voltando']) {
    if (passo !== 'agora') await trocaDinheiro();       /* eram 2800 ms fixos */
    const x = await olha();
    const aToa = x.folhas.filter(o => o.nivel > 0 && o.seSubisse !== null && o.seSubisse <= 0.5);
    F.diz(`modo ${x.modo} (${passo}): nenhuma tabela comprimida a toa  ` + JSON.stringify(x.folhas),
          aToa.length, 0);
  }

  /* ---------------------------------------------------------------- */
  F.secao('12B. SEM VALORES: os blocos da ficha ficam colados');
  /* A GRADE DO MODO SEM VALORES tinha quatro fileiras para cinco blocos.
     A v3.340 juntou tecido e cor e nao mexeu na grade: o `1fr` que estica
     ficou numa fileira VAZIA, e a altura da tabela ao lado passou a ser
     repartida entre tecido, design e observacao. Os tres blocos afastados
     por vaos enormes, e nada nos numeros da paginacao denunciava isso.
     Aqui os vaos sao medidos, e a sobra tem de ir toda para a observacao. */
  await trocaDinheiro();
  r = await p.evaluate(() => {
    const f = [...document.querySelectorAll('.lay-ficha')]
      .find(x => x.querySelector('.lf-tabela') && x.querySelector('.lf-tec'));
    const b = s => f.querySelector(s).getBoundingClientRect();
    const tec = b('.lf-tec'), des = b('.lf-design'), obs = b('.lf-obs');
    /* contra o FUNDO DA FICHA, e nao o da tabela: a observacao tem piso
       de 22mm, entao numa grade curta ela passa da tabela de proposito.
       O que se cobra e que ela feche a coluna, sem sobra embaixo. */
    return { vao1: +(des.top - tec.bottom).toFixed(1),
             vao2: +(obs.top - des.bottom).toFixed(1),
             obsAteOFim: +(f.getBoundingClientRect().bottom - obs.bottom).toFixed(1) };
  });
  F.diz('vao entre tecido e design e o do desenho  (' + r.vao1 + 'px)', r.vao1 <= 8, true);
  F.diz('  e o mesmo entre design e observacao  (' + r.vao2 + 'px)', r.vao2 <= 8, true);
  F.diz('  a sobra vertical vai toda para a observacao  (' + r.obsAteOFim + 'px)',
    Math.abs(r.obsAteOFim) <= 1, true);
  await trocaDinheiro();

  /* ---------------------------------------------------------------- */
  F.secao('13. AVISO 2+, PROFUNDIDADE E PAPEL');
  r = await p.evaluate(() => {
    const cab = document.querySelector('.folha-topo .warn-bar');
    const s = cab ? getComputedStyle(cab) : null;
    const alvo = cab ? cab.querySelector('.warn-com') : null;
    const lh = s ? parseFloat(s.lineHeight) : 1;
    /* CORTADAS DAQUI: as duas sombras do Design Kit ("folha com o 2o nivel do
       kit" e "submenu com o mesmo nivel", as duas regex /0px 2px 6px/ em
       boxShadow). Sao constantes de design kit, visiveis de olho, e sem
       relacao nenhuma com o defeito que originou esta suite. */
    return { bordaEsq: s ? s.borderLeftWidth : null, bordaBaixo: s ? s.borderBottomWidth : null,
             corDeBaixo: s ? s.borderBottomColor : null,
             linhas: alvo ? Math.round(alvo.getBoundingClientRect().height / lh) : null,
             centrado: s ? s.alignItems : null };
  });
  F.diz('aviso sem borda a esquerda', r.bordaEsq, '0px');
  F.diz('  so o traco de baixo, em vermelho', [r.bordaBaixo !== '0px', r.corDeBaixo], [true, 'rgb(198, 22, 27)']);
  F.diz('  texto em UMA linha', r.linhas, 1);
  F.diz('  centrado verticalmente', r.centrado, 'center');

  await p.emulateMedia({ media: 'print' });
  r = await p.evaluate(() => {
    const mod = [...document.querySelectorAll('.lay-modulo')].find(m => m.querySelector('.design-tag'));
    const tag = mod.querySelector('.design-tag'), s = getComputedStyle(tag);
    const desloc = el => { const c = el.closest('.ft-combo-caixa');
      const a = el.getBoundingClientRect(), b = c.getBoundingClientRect();
      return +(((a.top + a.height / 2) - (b.top + b.height / 2))).toFixed(1); };
    return { esq: s.paddingLeft, dir: s.paddingRight, gap: s.gap,
             ref: desloc(mod.querySelector('.combo-ref textarea')),
             tecido: desloc(mod.querySelector('.combo-tecido textarea')),
             /* o rotulo Tecido de cada linha saiu na v3.340: virou um so,
                no cabecalho do cartao. O que sobra para medir aqui e o
                quadrado da cor, que tem de estar centrado na LINHA. */
             quadrado: (()=>{ const l=mod.querySelector('.tec-linha');
               const sw=l&&l.querySelector('.cor-sw');
               if(!sw)return null;
               const a=sw.getBoundingClientRect(), b=l.getBoundingClientRect();
               return +((a.top+a.height/2)-(b.top+b.height/2)).toFixed(1); })() };
  });
  F.diz('papel: pilula com recheio igual dos dois lados', r.esq, r.dir);
  F.diz('  e sem o vao do "x" que nao e impresso', r.gap, '0px');
  F.diz('papel: referencia centrada na caixa', r.ref, 0);
  F.diz('  tecido tambem', r.tecido, 0);
  F.diz('  e o quadrado da cor centrado na linha', Math.abs(r.quadrado) <= 1, true);
  await p.emulateMedia({ media: 'screen' });

  /* ---------------------------------------------------------------- */
  F.secao('14. NEGRITO NO SELO E NA REFERENCIA');
  for (const media of ['screen', 'print']) {
    await p.emulateMedia({ media });
    r = await p.evaluate(() => {
      const m = document.querySelector('.lay-modulo');
      const w = el => el ? getComputedStyle(el).fontWeight : null;
      const t = m.querySelector('.combo-ref textarea');
      /* nome de tamanho REAL, e nao o que o sorteio do kit trouxe: um nome
         muito comprido nao cabe nem em peso normal, e ai o teste mediria o
         sorteio, nao o negrito */
      const antes = t.value;
      t.value = 'FT-020-001M — RAGLAN MASC COM PUNHO';
      const cabe = t.scrollWidth <= t.clientWidth + 1;
      const larg = t.clientWidth;
      t.value = antes;
      return { selo: w(m.querySelector('.lay-selo')), ref: w(t),
               tecido: w(m.querySelector('.combo-tecido textarea')),
               /* o rotulo de cada linha saiu na v3.340; o que existe agora
                  e um so, no cabecalho do cartao */
               rotulo: w(m.querySelector('.tec-cab-rot')),
               cabe, larg };
    });
    F.diz(`${media}: selo L-NN em negrito`, r.selo, '700');
    F.diz(`   referencia em negrito`, r.ref, '700');
    F.diz(`   e so elas - tecido segue normal`, [r.tecido, r.rotulo], ['400', '600']);
    /* NO PAPEL a referencia inteira TEM de caber: e o nome da peca, e o
       papel e o entregavel. Na TELA ela divide a linha com a seta e com as
       quatro bolinhas de genero (v3.352), que nao existem no papel -- ali o
       campo e menor e uma referencia longa rola dentro dele. O que se cobra
       na tela e um PISO de largura: se alguem espremer o campo ainda mais,
       este numero cai e a suite avisa. */
    if (media === 'print') F.diz(`   um nome de tamanho normal cabe em negrito`, r.cabe, true);
    else F.diz(`   na tela o campo nao encolhe abaixo do piso`, r.larg >= 165, true);
  }
  await p.emulateMedia({ media: 'screen' });

  /* ---------------------------------------------------------------- */
  F.secao('15. UMA COR DE BORDA NO DOCUMENTO');
  /* AS VOLTAS DE TEMA ESCURO SAIRAM DAQUI.
     Eram 2 temas x 2 medias = 4 trocas de emulateMedia so nesta secao. O
     tema escuro na impressao nao fica descoberto: o bloco D
     (teste_impressao_escura) compara os dois temas no papel ELEMENTO A
     ELEMENTO - cor, fundo, bordas e sombra de cada no da folha - e aponta
     qual divergiu. Isto aqui, que so conta quantas cores de linha existem,
     e mais fraco. Fica com o tema claro, que e o unico que o bloco D nao
     percorre nas duas medias. */
  for (const media of ['screen', 'print']) {
    await p.emulateMedia({ media });
    r = await p.evaluate(async () => {
      document.body.dataset.tema = 'claro'; if (window.aplicaLogos) aplicaLogos();
      /* ESPERAR O SINAL, E NAO O RELOGIO. Aqui havia um sleep de 400ms. Com a
         bateria em paralelo, e agora com duas suites subindo um servidor
         local, 400ms as vezes cai NO MEIO da transicao de tema, e a mesma
         borda e lida em dois cinzas de um degrau de diferenca
         (rgb(56,62,68) e rgb(57,63,69)). A medida so vale quando parou de
         mudar: tres leituras iguais seguidas. */
      /* E ANTES DA ESTABILIDADE, A TRANSICAO.
         Esperar "parar de mudar" tem uma armadilha: a troca de media e
         feita FORA daqui, e a transicao que ela dispara pode nem ter
         comecado quando o laco abaixo tira as tres leituras iguais. Ai o
         teste da por assentado o estado ANTIGO, e mede um documento no
         meio do caminho -- foi assim que apareceram tres cores de linha
         onde ha uma so. O getAnimations() responde a pergunta certa:
         ainda ha alguma coisa em movimento? */
      for (let i = 0; i < 120; i++) {
        if (!document.getAnimations().some(a => a.playState === 'running')) break;
        await new Promise(s => setTimeout(s, 40));
      }
      const medir = () => [...document.querySelectorAll('.folha-a4 *')]
        .map(e => { const c = getComputedStyle(e);
          return c.borderTopColor + c.borderLeftColor + c.borderBottomColor; }).join('|');
      let igual = 0, ultima = '';
      for (let i = 0; i < 80 && igual < 3; i++) {
        await new Promise(s => setTimeout(s, 60));
        const agora = medir();
        igual = (agora === ultima) ? igual + 1 : 0;
        ultima = agora;
      }
      const f = document.querySelector('.folha-a4');
      /* toda linha CINZA do documento tem de ser a mesma. Vermelho, tinta de
         genero e o selo sao sinal, nao estrutura: ficam de fora. */
      const sinal = new Set(['rgb(198, 22, 27)']);
      const cinzas = {};
      const conta = (cor, quem) => { if (!cor || cor === 'rgba(0, 0, 0, 0)' || sinal.has(cor)) return;
        (cinzas[cor] = cinzas[cor] || new Set()).add(quem); };
      f.querySelectorAll('*').forEach(el => {
        if (el.closest('.lay-selo') || el.closest('.dtf-chip') || el.closest('.design-grupo')) return;
        /* AS BOLINHAS DE GENERO (v3.352) sao tinta de genero, como a tarja:
           cada uma tem a borda da propria cor, de proposito. Sinal, e nao
           estrutura -- e ainda por cima nem vao para o papel. */
        if (el.closest('.ref-gen')) return;
        if (el.closest('.ft-combo[data-genero]')) return;      /* tinta de genero */
        /* A BARRA DE AVISO e sinal, como o selo - e desde a v3.295 o traco
           dela tem cor PROPRIA no papel (--pr-aviso-bd), diferente do
           vermelho da marca. Excluir pela COR, como era antes, dependia de
           ela ser exatamente #C6161B; excluir pelo ELEMENTO e o criterio de
           verdade e e o mesmo ja usado para o selo. */
        if (el.closest('.warn-bar')) return;
        /* A GRADE DO CABECALHO saiu do conjunto na v3.353. Ela ganhou token
           proprio (--ft-borda-cab) e um cinza mais claro que o do resto do
           documento, de proposito: o cabecalho recua e os dados do cliente
           ficam em primeiro plano. Continua sendo cobrada -- logo abaixo,
           com a pergunta certa para ela. */
        if (el.closest('.doc-header')) return;
        const s = getComputedStyle(el);
        const nome = el.tagName.toLowerCase() + '.' + ((el.className && el.className.split) ? el.className.split(' ')[0] : '');
        ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'].forEach(l => {
          if (parseFloat(s[l + 'Width']) > 0 && s[l + 'Style'] !== 'none') conta(s[l + 'Color'], nome);
        });
      });
      const cab = f.querySelector('.doc-header');
      const meia = f.querySelector('.hd-meia + .hd-meia');
      const cabCor = cab ? getComputedStyle(cab).backgroundColor : '(sem cabecalho)';
      const meiaCor = meia ? getComputedStyle(meia).borderLeftColor : '(sem celula dividida)';
      const deQuem = {};
      Object.keys(cinzas).forEach(c => deQuem[c] = [...cinzas[c]].slice(0, 6));
      /* CORTADAS DAQUI, as duas por estarem repetidas de forma mais forte em
         teste_impressao_escura (bloco D):
           - "logo: a de papel / a do tema": o bloco D pergunta o mesmo nas
             duas medias E ainda confere que a logo de papel e a de texto
             escuro (LOGO_H_CLARA);
           - "tabela = cabecalho = caixa de imagem": o bloco D compara a
             borda da tabela com a linha do documento no tema escuro. E
             aqui ela ja esta contida na conferencia de cima: o cabecalho
             entra no mesmo conjunto de cores, entao uma cor so JA quer
             dizer tabela = cabecalho = caixa de imagem. */
      return { quantasCores: Object.keys(cinzas).length, cores: Object.keys(cinzas), deQuem,
               cabCor, meiaCor, doc: Object.keys(cinzas)[0] };
    });
    /* quando falha, o que interessa e QUAL cor sobrou e de quem - sem isso
       a falha so diz "2" e nao da para consertar nada */
    F.diz(`claro/${media}: uma unica cor de linha no documento`
      + (r.quantasCores !== 1 ? '  ' + JSON.stringify(r.deQuem) : ''), r.quantasCores, 1);
    /* E O CABECALHO, com a pergunta que e dele: a grade INTEIRA fala com
       uma voz so -- o vao da grade e a borda da celula dividida (Pedido /
       Envio) tem de ser a MESMA cor, senao a linha do cabecalho muda de
       tom no meio do caminho. */
    F.diz(`   a grade do cabecalho fala com uma voz so  (${r.cabCor})`,
          r.meiaCor, r.cabCor);
    /* NA TELA ela e mais clara que a do documento, a pedido. NO PAPEL as
       duas leem a mesma paleta de impressao e voltam a ser uma so. */
    if (media === 'print') F.diz('   e no papel volta a ser a linha do documento', r.cabCor, r.doc);
    else F.diz(`   e na tela e mais clara que a do documento  (doc=${r.doc})`,
               r.cabCor !== r.doc, true);
  }
  await p.emulateMedia({ media: 'screen' });

  /* o selo tem borda propria no escuro: e uma conferencia de TELA, e nao de
     papel - por isso continua aqui e nao no bloco D */
  await p.evaluate(() => { document.body.dataset.tema = 'escuro'; if (window.aplicaLogos) aplicaLogos(); });
  /* getComputedStyle devolve um objeto VIVO: guardar `c` e ler depois de
     trocar o tema devolvia a cor do tema novo. A string tem de ser copiada
     na hora - e a espera e pela cor parar de mudar, nao por 300ms. */
  const seloEscuro = await F.assenta(p, () =>
    getComputedStyle(document.querySelector('.lay-selo')).borderTopColor);
  await p.evaluate(() => { document.body.dataset.tema = 'claro'; if (window.aplicaLogos) aplicaLogos(); });
  const seloClaro = await F.assenta(p, () =>
    getComputedStyle(document.querySelector('.lay-selo')).borderTopColor);
  F.diz(`o selo tem borda propria no escuro  (claro=${seloClaro} escuro=${seloEscuro})`,
        seloEscuro !== seloClaro, true);

  /* ---------------------------------------------------------------- */
  F.secao('16. A LINHA DA REFERENCIA E A GRADE DO CABECALHO (v3.352)');

  /* 16A. as quatro bolinhas de genero, na ponta da referencia */
  r = await p.evaluate(() => {
    const combo = document.querySelector('.combo-ref');
    const g = combo.querySelector('.ref-gen');
    if (!g) return { existe: false };
    const bts = [...g.querySelectorAll('.ref-gen-bt')];
    const antes = combo.dataset.genero || '';
    /* POR data-g, e nao por indice: a ordem das bolinhas mudou na v3.354
       (a branca passou para a frente) e um teste que clica por posicao
       muda de significado sem ninguem perceber */
    const clica = gen => g.querySelector(`.ref-gen-bt[data-g="${gen}"]`)
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clica('feminino'); const depoisF = combo.dataset.genero || '';
    clica('masculino'); const depoisM = combo.dataset.genero || '';
    clica(''); const limpou = combo.dataset.genero || '';
    if (antes) combo.dataset.genero = antes;
    const dot = bts[0].getBoundingClientRect();
    const ico = document.querySelector('.lay-btn svg').getBoundingClientRect();
    /* o menu tem de continuar fechado: um clique na bolinha nao pede lista */
    const menu = document.getElementById('pickMenu');
    return { existe: true, quantas: bts.length, depoisF, depoisM, limpou,
             dot: +dot.width.toFixed(1), ico: +ico.width.toFixed(1),
             redondo: Math.abs(dot.width - dot.height) < .6,
             ordem: bts.map(x => x.dataset.g),
             seta: !!combo.querySelector('.ft-combo-abrir'),
             menuFechado: !menu || getComputedStyle(menu).display === 'none' };
  });
  F.diz('as quatro bolinhas de genero estao na referencia', [r.existe, r.quantas], [true, 4]);
  F.diz('  clicar pinta o campo de feminino', r.depoisF, 'feminino');
  F.diz('  e de masculino', r.depoisM, 'masculino');
  F.diz('  e a quarta limpa o genero', r.limpou, '');
  F.diz('  sao redondas', r.redondo, true);
  /* v3.354: a BRANCA vem primeira. Ela e o estado de partida, e comeco de
     fileira e onde se procura o comeco de qualquer coisa. */
  F.diz('  a branca vem primeira, na esquerda', r.ordem, ['', 'masculino', 'feminino', 'infantil']);
  /* e a seta de abrir a lista saiu: clicar no campo ja abre, e o lugar
     dela era o unico pedaco de largura que sobrava para o nome da peca */
  F.diz('  a referencia nao tem mais seta de abrir', r.seta, false);
  /* "tamanho similar", a pedido: a bolinha e o icone do botao ao lado nao
     podem divergir mais que 3px */
  F.diz(`  do tamanho do icone dos botoes  (bolinha=${r.dot} icone=${r.ico})`,
        Math.abs(r.dot - r.ico) <= 3, true);
  F.diz('  e clicar nelas NAO abre a lista', r.menuFechado, true);

  /* 16B. os botoes da direita: mesma altura da barra, e quadrados */
  r = await p.evaluate(() => {
    const t = document.querySelector('.lay-topo');
    const cx = t.querySelector('.combo-ref .ft-combo-caixa').getBoundingClientRect();
    return [...t.querySelectorAll('.lay-info-btn,.lay-btn,.lay-del')].map(b => {
      const x = b.getBoundingClientRect();
      return { quadrado: Math.abs(x.width - x.height) < .6,
               mesmaAltura: Math.abs(x.height - cx.height) < 1 };
    });
  });
  F.diz('os botoes da direita sao quadrados (1:1)', r.every(x => x.quadrado), true);
  F.diz('  e tem a altura da barra de referencia', r.every(x => x.mesmaAltura), true);

  /* 16C. no papel e no arquivo do Trello as bolinhas nao existem */
  await p.emulateMedia({ media: 'print' });
  /* sentinela em vez de estouro: na versao anterior o elemento nao existe,
     e a suite tem de REPROVAR nele, e nao morrer nele */
  F.diz('no papel as bolinhas somem',
    await p.evaluate(() => { const g = document.querySelector('.ref-gen');
      return g ? getComputedStyle(g).display : '(sem bolinhas)'; }), 'none');
  await p.emulateMedia({ media: 'screen' });
  F.diz('  e o HTML do Trello nao as leva',
    await p.evaluate(() => /class="ref-gen"/.test(gerarHTML())), false);

  /* 16D. tabela sem valores: duas colunas iguais e QTD em caixa alta */
  r = await p.evaluate(() => {
    document.body.classList.add('sem-dinheiro');
    const t = document.querySelector('.lay-tabela-mini');
    const vis = e => getComputedStyle(e).display !== 'none';
    const th = [...t.querySelectorAll('thead th')].filter(vis).map(e => e.getBoundingClientRect().width);
    const td = [...t.querySelectorAll('tbody tr:first-child td')].filter(vis).map(e => e.getBoundingClientRect().width);
    const qtd = [...t.querySelectorAll('thead th')].filter(vis)[1];
    const caixa = getComputedStyle(qtd).textTransform;
    document.body.classList.remove('sem-dinheiro');
    return { th: th.map(x => +x.toFixed(1)), td: td.map(x => +x.toFixed(1)), caixa };
  });
  F.diz(`sem valores: as duas colunas medem o mesmo  ${JSON.stringify(r.th)}`,
        r.th.length === 2 && Math.abs(r.th[0] - r.th[1]) < 1, true);
  F.diz('  e as celulas tambem', r.td.length === 2 && Math.abs(r.td[0] - r.td[1]) < 1, true);
  F.diz('  o titulo QTD em caixa alta', r.caixa, 'uppercase');

  /* 16E. a grade do cabecalho: token proprio e espessura igual em qualquer zoom.

     A conta que importa e a ESPESSURA DEPOIS DA ESCALA: o vao em px da
     pagina ja vem multiplicado pelo zoom. Se ela ficar entre 1,00 e 1,03
     o navegador arredonda toda divisoria para 1 pixel; com 1,05 (o que
     havia antes) uma cai em 1 e a vizinha em 2, que era o defeito
     relatado. Isto e um proxy MEDIDO do que foi conferido pixel a pixel
     em 81 zooms quando a correcao foi escrita. */
  r = await p.evaluate(async () => {
    const area = document.querySelector('.area-paginas');
    const cab = document.querySelector('.doc-header');
    const zAntes = area.style.getPropertyValue('--zoom');
    const fora = [];
    for (const z of [1, 1.05, 1.13, 1.15, 1.24, 1.37, 0.78, 0.84, 0.7]) {
      area.style.setProperty('--zoom', z);
      await new Promise(s => setTimeout(s, 40));
      const cel = [...cab.children].map(c => c.getBoundingClientRect());
      const porY = {};
      cel.forEach(c => { const k = c.y.toFixed(1); (porY[k] = porY[k] || []).push(c); });
      Object.values(porY).forEach(arr => {
        arr.sort((a, b) => a.x - b.x);
        for (let i = 1; i < arr.length; i++) {
          const v = arr[i].x - (arr[i - 1].x + arr[i - 1].width);
          if (v < 1 || v > 1.03) fora.push([z, +v.toFixed(3)]);
        }
      });
    }
    if (zAntes) area.style.setProperty('--zoom', zAntes); else area.style.removeProperty('--zoom');
    return { fora: fora.slice(0, 6), quantos: fora.length,
             fundo: getComputedStyle(cab).backgroundColor,
             token: !!getComputedStyle(document.documentElement).getPropertyValue('--ft-borda-cab').trim(),
             noPainel: CC_VARS.some(v => v[0] === '--ft-borda-cab')
                    && CC_IMPRESSAO.some(v => v[0] === '--pr-borda-cab') };
  });
  F.diz('a linha do cabecalho tem token proprio', r.token, true);
  F.diz('  e ele esta nas duas abas do painel', r.noPainel, true);
  F.diz(`  espessura igual em todo zoom  ${JSON.stringify(r.fora)}`, r.quantos, 0);

  /* trocar o token muda o cabecalho e SO ele */
  r = await p.evaluate(() => {
    const raiz = document.documentElement;
    const tabAntes = getComputedStyle(document.querySelector('.lay-tabela-mini td')).borderTopColor;
    raiz.style.setProperty('--ft-borda-cab', 'rgb(1, 2, 3)');
    const o = { cab: getComputedStyle(document.querySelector('.doc-header')).backgroundColor,
                tab: getComputedStyle(document.querySelector('.lay-tabela-mini td')).borderTopColor,
                tabAntes };
    raiz.style.removeProperty('--ft-borda-cab');
    return o;
  });
  F.diz('  mexer nele pinta a grade do cabecalho', r.cab, 'rgb(1, 2, 3)');
  F.diz('  e nao encosta na linha da tabela', r.tab, r.tabAntes);

  /* ---------------------------------------------------------------- */
  F.secao('17. A PALETA COLADA VIROU PADRAO (v3.353)');

  /* 17A. o cinza do cabecalho e o escolhido, e o painel o da por gravado */
  r = await p.evaluate(() => {
    const c = getComputedStyle(document.documentElement);
    return { claro: (CC_PADRAO.claro['--ft-borda-cab'] || '').toLowerCase(),
             escuro: (CC_PADRAO.escuro['--ft-borda-cab'] || '').toLowerCase(),
             vivo: c.getPropertyValue('--ft-borda-cab').trim().toLowerCase(),
             /* o painel so diz "tudo igual ao arquivo" se NENHUM token
                estiver pendente: e a prova de que o padrao foi mesmo
                atualizado, e nao so o localStorage desta maquina.
                O contador nasce com um travessao e so e escrito quando
                alguem conta -- chamar aqui e o que faz a pergunta valer */
             pendentes: (typeof ccContaPendentes === 'function'
               ? (ccContaPendentes(), (document.getElementById('ccPendentes') || {}).textContent)
               : '(sem contador)') };
  });
  F.diz('o cinza do cabecalho e o escolhido', [r.claro, r.vivo], ['#e2e5ee', '#e2e5ee']);
  F.diz('  e o escuro segue a linha do tema escuro', r.escuro, '#383e44');
  F.diz('  o painel nao acusa pendencia', r.pendentes, 'tudo igual ao arquivo');

  /* 17B. a fonte do documento: Plex de ponta a ponta, numeros em Plex Mono */
  r = await p.evaluate(() => {
    const fam = {};
    document.querySelectorAll('.folha-a4, .folha-a4 *').forEach(e => {
      const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return;
      const nome = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim();
      (fam[nome] = fam[nome] || 0);
      fam[nome]++;
    });
    const num = document.querySelector('.folha-a4 .lay-tabela-mini td.num');
    return { familias: fam,
             folha: getComputedStyle(document.querySelector('.folha-a4')).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
             numeros: num ? getComputedStyle(num).fontFamily.split(',')[0].replace(/["']/g, '').trim() : '(sem tabela)',
             padrao: (CC_FONTE_PADRAO['--ft-fonte'] || '').replace(/["']/g, '') };
  });
  F.diz('a folha inteira em IBM Plex Sans', r.folha, 'IBM Plex Sans');
  F.diz('  e nao sobrou nada em Roboto no documento', r.familias.Roboto || 0, 0);
  /* os NUMEROS continuam monoespacados: quantidade em coluna se le com
     digito de largura fixa, e isso e decisao de leitura, nao de familia */
  F.diz('  os numeros da tabela seguem em IBM Plex Mono', r.numeros, 'IBM Plex Mono');
  F.diz('  e o padrao do painel diz o mesmo', r.padrao.split(',')[0], 'IBM Plex Sans');

  /* 17C. o "Copiar CSS" nao pode perder metade da escolha de fonte.
     Escolher a fonte do documento mexe em CINCO tokens; o bloco copiado
     levava so um, e colar de volta devolvia parte da escolha. */
  r = await p.evaluate(async () => {
    const sel = document.getElementById('ccFonte');
    sel.value = "'Plus Jakarta Sans',sans-serif";
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('ccCopiar').click();
    await new Promise(s => setTimeout(s, 250));
    const txt = (document.getElementById('ccSaida') || {}).value || '';
    document.getElementById('ccReset').click();
    await new Promise(s => setTimeout(s, 250));
    return ['--ft-fonte', '--ft-fonte-doc-ui', '--ft-fonte-doc-mono',
            '--ft-fonte-mod', '--ft-fonte-tab']
      .filter(v => !new RegExp('\\n\\s*' + v + ':').test(txt));
  });
  F.diz('o CSS copiado leva as cinco fontes, e nao so uma', r, []);

  /* ---------------------------------------------------------------- */
  F.secao('18. O CNPJ NO CABECALHO E O BLOCO DE CORES (v3.354)');

  /* 18A. a coluna 1 tem tres fileiras: logo, CNPJ, status */
  r = await p.evaluate(() => {
    const h = document.querySelector('.folha-a4 .doc-header');
    const hr = h.getBoundingClientRect();
    const col1 = [...h.children].filter(c => !c.classList.contains('hd-oculto')
      && Math.abs(c.getBoundingClientRect().left - hr.left) < 2)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map(c => c.className.split(' ').slice(-1)[0] || c.className);
    const cn = h.querySelector('.hd-cnpj');
    if (!cn) return { col1, num: '(sem celula de CNPJ)' };
    const cr = cn.getBoundingClientRect();
    const num = cn.querySelector('.hd-cnpj-num');
    const nr = num.getBoundingClientRect();
    const logo = h.querySelector('.logo-box').getBoundingClientRect();
    /* CENTRALIZADO E O CONJUNTO, e nao o numero sozinho: a celula tem o
       rotulo CNPJ e o numero lado a lado, e quem tem de ficar no meio e o
       par. Medir so o numero acusaria torto um cartao que esta certo. */
    const lb = cn.querySelector('.hd-label').getBoundingClientRect();
    const esq = Math.min(lb.left, nr.left), dir = Math.max(lb.right, nr.right);
    return { col1, num: num.textContent.trim(),
             centroX: Math.abs((esq + dir) / 2 - (cr.left + cr.right) / 2) < 1.5,
             centroY: Math.abs((nr.top + nr.bottom) / 2 - (cr.top + cr.bottom) / 2) < 1.5,
             logoUmaFileira: Math.abs(logo.height - cr.height) < 1.5,
             alturaCab: +(hr.height).toFixed(1) };
  });
  F.diz('a coluna 1 e logo, CNPJ e status, nesta ordem', r.col1, ['logo-box', 'hd-cnpj', 'hd-obs']);
  F.diz('  com o CNPJ da Fourtime', r.num, '25.260.940/0001-40');
  F.diz('  centralizado na horizontal', r.centroX, true);
  F.diz('  e na vertical', r.centroY, true);
  F.diz('  e a logo agora ocupa uma fileira so', r.logoUmaFileira, true);

  /* e ele viaja: papel e arquivo do cliente */
  await p.emulateMedia({ media: 'print' });
  F.diz('no papel o CNPJ continua la',
    await p.evaluate(() => { const n = document.querySelector('.hd-cnpj-num');
      return n ? getComputedStyle(n).display !== 'none' : false; }), true);
  await p.emulateMedia({ media: 'screen' });
  /* pelo ELEMENTO, e nao pelo numero: o CNPJ ja aparecia no RODAPE do
     documento, entao procurar o numero solto acha o rodape e passa mesmo
     sem a celula nova existir */
  F.diz('  e o arquivo do Trello leva a celula do cabecalho',
    await p.evaluate(() => /class="hd-cnpj-num">25\.260\.940\/0001-40</.test(gerarHTML())), true);

  /* 18B. as cores sao UM retangulo, sem vao e sem moldura por ficha */
  await p.evaluate(async () => {
    const w = document.querySelector('.lay-modulo .design-wrap');
    w.querySelectorAll('.design-grupo').forEach(g => g.remove());
    ['DTF', 'Silk'].forEach(t => w.appendChild(criaGrupo(t)));
    ordenaTags(w);
    const g = w.querySelector('.design-grupo[data-tag="DTF"]');
    ['120', '126', '143'].forEach(c =>
      g.querySelector('.design-tokens').insertAdjacentHTML('beforeend', tokenHTML(c)));
    atualizaGrupo(g);
    await new Promise(s => setTimeout(s, 120));
  });
  await p.waitForTimeout(220);
  r = await p.evaluate(() => {
    const g = document.querySelector('.lay-modulo .design-grupo[data-tag="DTF"]');
    const bl = g.querySelector('.design-tokens');
    const toks = [...bl.querySelectorAll('.dtf-tok')];
    const cs = getComputedStyle(bl);
    /* CONECTADAS: entre uma ficha e a seguinte nao pode sobrar nem um pixel */
    let maiorVao = 0;
    for (let i = 1; i < toks.length; i++) {
      const a = toks[i - 1].getBoundingClientRect(), b = toks[i].getBoundingClientRect();
      if (Math.abs(a.top - b.top) < 1) maiorVao = Math.max(maiorVao, b.left - a.right);
    }
    const t0 = getComputedStyle(toks[0]);
    const pilula = g.querySelector('.design-tag').getBoundingClientRect();
    const vazio = document.querySelector('.lay-modulo .design-grupo[data-tag="Silk"] .design-tokens');
    return { blocoTemMoldura: parseFloat(cs.borderTopWidth) > 0,
             blocoTemCanto: parseFloat(cs.borderTopLeftRadius) > 0,
             gap: cs.gap,
             fichaSemMoldura: parseFloat(t0.borderTopWidth) === 0,
             fichaSemCanto: parseFloat(t0.borderTopLeftRadius) === 0,
             maiorVao: +maiorVao.toFixed(2),
             /* a pilula NAO encosta no bloco: ela e uma peca a parte */
             pilulaSolta: bl.getBoundingClientRect().left - pilula.right > 1,
             /* largura igual e o que faz a segunda fileira virar grade */
             largurasIguais: new Set(toks.map(t => Math.round(t.getBoundingClientRect().width))).size === 1,
             semCorSemBloco: vazio ? getComputedStyle(vazio).display : '(sem grupo)' };
  });
  F.diz('as cores formam um retangulo unico', [r.blocoTemMoldura, r.blocoTemCanto], [true, true]);
  F.diz('  e a ficha de dentro nao tem moldura propria',
    [r.fichaSemMoldura, r.fichaSemCanto], [true, true]);
  F.diz('  nem vao entre uma e a seguinte', [r.gap, r.maiorVao], ['0px', 0]);
  F.diz('  as fichas medem o mesmo, entao a 2a fileira vira grade', r.largurasIguais, true);
  F.diz('  a pilula da tecnica fica fora do retangulo', r.pilulaSolta, true);
  F.diz('  e tecnica sem cor nao desenha retangulo nenhum', r.semCorSemBloco, 'none');

  /* 18B2. O CANTO SO NAS PONTAS DE VERDADE (v3.355)

     Numa fileira so o canto do retangulo cai onde tem de cair: esquerda
     da primeira cor, direita do ultimo codigo. Quebrada em duas, o
     `overflow:hidden` recortava pelo retangulo e a curva de baixo mordia
     a cor que ABRE a segunda fileira -- uma cor do MEIO da sequencia.
     Quebrada, a barra perde o canto: ou ele marca comeco e fim, ou nao
     marca nada. */
  r = await p.evaluate(async () => {
    const g = document.querySelector('.lay-modulo .design-grupo[data-tag="DTF"]');
    const bl = g.querySelector('.design-tokens');
    const raio = () => parseFloat(getComputedStyle(bl).borderTopLeftRadius);
    const umaFila = raio();
    /* enche ate quebrar */
    ['021','045','078','101','133','007','012','014','016','018','020','022']
      .forEach(c => bl.insertAdjacentHTML('beforeend', tokenHTML(c)));
    atualizaGrupo(g);
    await new Promise(s => requestAnimationFrame(() => requestAnimationFrame(s)));
    await new Promise(s => setTimeout(s, 120));
    const t = bl.querySelector('.dtf-tok');
    const quebrou = bl.getBoundingClientRect().height > t.getBoundingClientRect().height * 1.5;
    const variasFilas = raio();
    /* e volta ao que era */
    [...bl.querySelectorAll('.dtf-tok')].slice(3).forEach(x => x.remove());
    atualizaGrupo(g);
    await new Promise(s => requestAnimationFrame(() => requestAnimationFrame(s)));
    await new Promise(s => setTimeout(s, 120));
    return { umaFila, quebrou, variasFilas, voltou: raio() };
  });
  F.diz('numa fileira so a barra tem canto arredondado', r.umaFila > 0, true);
  F.diz('  com muitas cores ela quebra mesmo', r.quebrou, true);
  /* era o defeito relatado: canto arredondado no MEIO da barra */
  F.diz('  e quebrada ela perde o canto', r.variasFilas, 0);
  F.diz('  voltando a uma fileira, o canto volta', r.voltou > 0, true);

  /* 18C. o trilho e quadrado com a fileira */
  r = await p.evaluate(() => {
    const c = document.querySelector('.lay-modulo .design-caixa');
    const cols = getComputedStyle(c).gridTemplateColumns.split(' ');
    const trilho = parseFloat(cols[cols.length - 1]);
    const fila = c.querySelector('.des-fila-eti').getBoundingClientRect().height;
    const add = c.querySelector('.design-add').getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return { trilho: +trilho.toFixed(1), fila: +fila.toFixed(1),
             /* o "+" centrado na coluna: quem manda na largura e a coluna */
             maisCentrado: Math.abs((add.left + add.right) / 2 - (cr.right - trilho / 2)) < 2 };
  });
  F.diz(`o trilho tem a largura da altura da fileira  (${r.trilho} x ${r.fila})`,
    Math.abs(r.trilho - r.fila) < 1, true);
  F.diz('  e o "+" fica centrado nele', r.maisCentrado, true);

  /* 18D. so a pilula certa abre o menu certo */
  r = await p.evaluate(async () => {
    const menu = document.getElementById('ctxCores');
    const abre = async sel => {
      menu.style.display = 'none';
      const el = document.querySelector(sel);
      if (!el) return '(sem pilula)';
      const rr = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: rr.left + 3, clientY: rr.top + 3 }));
      await new Promise(s => setTimeout(s, 160));
      if (getComputedStyle(menu).display !== 'block') return 'nao abriu';
      const ab = menu.querySelector('.ft-aba.ativa');
      return 'abriu:' + (ab ? ab.dataset.tab : '?');
    };
    const w = document.querySelector('.lay-modulo .design-wrap');
    if (!w.querySelector('.design-grupo[data-tag="Subli"]')) {
      w.appendChild(criaGrupo('Subli')); ordenaTags(w);
      await new Promise(s => setTimeout(s, 120));
    }
    const o = {
      dtf: await abre('.lay-modulo .design-grupo[data-tag="DTF"] .design-tag'),
      subli: await abre('.lay-modulo .design-grupo[data-tag="Subli"] .design-tag'),
      silk: await abre('.lay-modulo .design-grupo[data-tag="Silk"] .design-tag'),
      vazio: await abre('.lay-modulo .des-fila-eti'),
    };
    menu.style.display = 'none';
    return o;
  });
  console.log('     ' + JSON.stringify(r));
  F.diz('a pilula DTF abre a lista de DTF', r.dtf, 'abriu:dtf');
  F.diz('  a Subli abre a de sublimacao', r.subli, 'abriu:sb');
  /* era ESTE o defeito: qualquer clique direito no cartao abria a lista de
     DTF, inclusive em cima de tecnica que nao tem cor nenhuma */
  F.diz('  Silk nao abre lista de cor', r.silk, 'nao abriu');
  F.diz('  e o vao vazio tambem nao', r.vazio, 'nao abriu');

  /* deixa a pagina como estava: tema claro e media de tela */
  await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => { document.body.dataset.tema = 'claro'; if (window.aplicaLogos) aplicaLogos(); });
  await ctx.close();
}
