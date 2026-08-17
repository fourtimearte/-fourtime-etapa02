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
  F.secao('4. QUADRADO DA COR = BOTAO + DO TECIDO');
  r = await p.evaluate(() => {
    const mod = [...document.querySelectorAll('.lay-modulo')]
      .find(m => m.querySelector('.cor-sw') && m.querySelector('.tec-btn'));
    const sw = mod.querySelector('.cor-sw'), bt = mod.querySelector('.tec-add') || mod.querySelector('.tec-btn');
    const a = sw.getBoundingClientRect(), b = bt.getBoundingClientRect();
    const cx = el => el.closest('.ft-combo-caixa').getBoundingClientRect();
    const meio = el => { const c = cx(el), e = el.getBoundingClientRect();
      return +((e.top + e.height / 2) - (c.top + c.height / 2)).toFixed(1); };
    const s = getComputedStyle(sw), t = getComputedStyle(bt);
    return { larg: [+a.width.toFixed(1), +b.width.toFixed(1)],
      alt: [+a.height.toFixed(1), +b.height.toFixed(1)],
      raio: [s.borderRadius, t.borderRadius],
      /* distancia da borda direita da caixa: os dois tem de recuar igual */
      recuo: [+(cx(sw).right - a.right).toFixed(1), +(cx(bt).right - b.right).toFixed(1)],
      centro: [meio(sw), meio(bt)] };
  });
  F.diz('mesma largura', r.larg[0], r.larg[1]);
  F.diz('mesma altura', r.alt[0], r.alt[1]);
  F.diz('mesmo raio', r.raio[0], r.raio[1]);
  F.diz('mesmo recuo da borda direita', r.recuo[0], r.recuo[1]);
  F.diz('ambos centrados na caixa', r.centro, [0, 0]);

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
    const cab = document.querySelector('.folha-a4 .doc-header');
    return { adu: adu ? g(adu.children[1]) : null,
             linhaDoDocumento: cab ? getComputedStyle(cab).backgroundColor : null };
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
             rotulo: desloc(mod.querySelector('.combo-tecido .ft-combo-rotulo')) };
  });
  F.diz('papel: pilula com recheio igual dos dois lados', r.esq, r.dir);
  F.diz('  e sem o vao do "x" que nao e impresso', r.gap, '0px');
  F.diz('papel: referencia centrada na caixa', r.ref, 0);
  F.diz('  tecido tambem', [r.tecido, r.rotulo], [0, 0]);
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
      t.value = antes;
      return { selo: w(m.querySelector('.lay-selo')), ref: w(t),
               tecido: w(m.querySelector('.combo-tecido textarea')),
               rotulo: w(m.querySelector('.combo-tecido .ft-combo-rotulo')),
               cabe };
    });
    F.diz(`${media}: selo L-NN em negrito`, r.selo, '700');
    F.diz(`   referencia em negrito`, r.ref, '700');
    F.diz(`   e so elas - tecido segue normal`, [r.tecido, r.rotulo], ['400', '600']);
    F.diz(`   um nome de tamanho normal cabe em negrito`, r.cabe, true);
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
        if (el.closest('.ft-combo[data-genero]')) return;      /* tinta de genero */
        /* A BARRA DE AVISO e sinal, como o selo - e desde a v3.295 o traco
           dela tem cor PROPRIA no papel (--pr-aviso-bd), diferente do
           vermelho da marca. Excluir pela COR, como era antes, dependia de
           ela ser exatamente #C6161B; excluir pelo ELEMENTO e o criterio de
           verdade e e o mesmo ja usado para o selo. */
        if (el.closest('.warn-bar')) return;
        const s = getComputedStyle(el);
        const nome = el.tagName.toLowerCase() + '.' + ((el.className && el.className.split) ? el.className.split(' ')[0] : '');
        ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'].forEach(l => {
          if (parseFloat(s[l + 'Width']) > 0 && s[l + 'Style'] !== 'none') conta(s[l + 'Color'], nome);
        });
      });
      const cab = f.querySelector('.doc-header');
      if (cab) conta(getComputedStyle(cab).backgroundColor, 'grade do cabeçalho');
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
      return { quantasCores: Object.keys(cinzas).length, cores: Object.keys(cinzas), deQuem };
    });
    /* quando falha, o que interessa e QUAL cor sobrou e de quem - sem isso
       a falha so diz "2" e nao da para consertar nada */
    F.diz(`claro/${media}: uma unica cor de linha no documento`
      + (r.quantasCores !== 1 ? '  ' + JSON.stringify(r.deQuem) : ''), r.quantasCores, 1);
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

  /* deixa a pagina como estava: tema claro e media de tela */
  await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => { document.body.dataset.tema = 'claro'; if (window.aplicaLogos) aplicaLogos(); });
  await ctx.close();
}
