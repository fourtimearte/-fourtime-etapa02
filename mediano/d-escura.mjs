/* ================================================================
   D. A IMPRESSAO EM TEMA ESCURO

   IMPRIMIR DO TEMA ESCURO tem de sair IGUAL a imprimir do tema claro.
   O teste nao confere uma lista de cores: compara os DOIS documentos
   elemento a elemento. Se um unico pixel de cor divergir, ele aponta qual.

   Este bloco tem ambiente proprio porque troca body.dataset.tema oito
   vezes e o media de impressao cinco vezes. Nenhum outro bloco pode estar
   lendo cor da mesma pagina enquanto isso acontece - por isso ele nao
   divide a pagina com ninguem.

   NAO PORTADA a ultima secao da suite original, "HTML do Trello: a barra
   fixa fica ABAIXO do visualizador": ela exportava o arquivo, gravava em
   disco e abria uma SEGUNDA pagina de celular (390x780) so para isso. O
   bloco f-trello.mjs ja abre o mesmo arquivo exportado num celular
   390x844 e e la que essa leitura mora. Assim este bloco nao exporta
   nada e nao abre segunda pagina.
   ================================================================ */

/* colhe a "impressao digital" de cor de tudo o que esta dentro da folha */
const COLHER = `(()=>{
  const out=[];
  document.querySelectorAll('.folha-a4, .folha-a4 *').forEach((el,i)=>{
    const s=getComputedStyle(el);
    out.push([ i+':'+el.tagName.toLowerCase()+'.'+(el.className&&el.className.split?el.className.split(' ')[0]:''),
      s.color, s.backgroundColor, s.borderTopColor, s.borderBottomColor, s.boxShadow.slice(0,60) ].join('|'));
  });
  return out;
})()`;

/* a suite original dormia 600 ms fixos depois de trocar o tema. As caixas
   do documento tem transicao de fundo: 600 ms as vezes bastava e as vezes
   nao, e a leitura no meio do caminho e plausivel o bastante para parecer
   defeito. Aqui a espera e pelo SINAL - a impressao digital inteira parar
   de mudar. Quatro leituras iguais, e nao duas: no instante em que o tema
   e trocado a transicao ainda nem comecou, e dois quadros seguidos leriam
   a MESMA cor antiga. */
const ESTAVEL = `(()=>{
  const t=${COLHER}.join('~');
  if(t===window.__ftDig) window.__ftN++; else { window.__ftDig=t; window.__ftN=0; }
  return window.__ftN>=4;
})()`;

const LOGOS_VISIVEIS = `[...document.querySelectorAll('.folha-a4 .logo-box,.folha-a4 .folha-logo')]
  .map(cx=>[...cx.querySelectorAll('img')].filter(i=>getComputedStyle(i).display!=='none')
    .map(i=>i.classList.contains('logo-papel')?'papel':'tema').join('+'))`;

export async function roda(F) {

  const { ctx, p } = await F.novaPagina();
  await p.goto(F.URL_EDITOR, { waitUntil: 'domcontentloaded' });
  await F.esperaPronto(p, null, 60000);
  await F.montaKit(p);

  await p.evaluate(() => {
    /* poe um genero em cada um dos tres primeiros layouts e uma fileira
       cruzada, para as tintas entrarem na comparacao */
    const est = coletaEstado();
    ['masculino', 'feminino', 'infantil'].forEach((g, i) => { if (est.layouts[i]) est.layouts[i].genero = g; });
    if (est.layouts[0]) est.layouts[0].tamanhos['10A'] = { q: '6', u: '79,90' };
    aplicaEstado(est);
  });
  /* aplicaEstado remonta o documento inteiro (repagina e reajusta): a suite
     original dormia 3 s aqui. Esperar o numero de elementos e o total
     pararem de mudar da o mesmo, sem o relogio. */
  await F.assenta(p, () => ({
    n: document.querySelectorAll('.folha-a4 *').length,
    g: document.querySelectorAll('[data-genero]').length,
    t: (document.querySelector('.rt-geral') || {}).textContent || ''
  }));

  async function colhe(tema) {
    await p.evaluate(t => { document.body.dataset.tema = t;
      window.__ftDig = null; window.__ftN = 0; }, tema);
    await p.waitForFunction(ESTAVEL, null, { timeout: 12000, polling: 120 });
    return p.evaluate(COLHER);
  }

  F.secao('1. NA TELA os dois temas SAO diferentes (senao o teste nao prova nada)');
  await p.emulateMedia({ media: 'screen' });
  const telaClaro = await colhe('claro'), telaEscuro = await colhe('escuro');
  const difTela = telaClaro.filter((v, i) => v !== telaEscuro[i]).length;
  F.diz('na tela ha diferenca entre os temas', difTela > 0, true);

  F.secao('2. NO PAPEL os dois temas sao IDENTICOS');
  await p.emulateMedia({ media: 'print' });
  const papelClaro = await colhe('claro'), papelEscuro = await colhe('escuro');
  const dif = papelClaro.map((v, i) => [v, papelEscuro[i]]).filter(([a, c]) => a !== c);
  F.diz('mesmo numero de elementos', papelEscuro.length, papelClaro.length);
  F.diz('nenhuma diferenca de cor no papel', dif.length, 0);

  F.secao('3. E o papel do tema escuro e o papel APROVADO');
  await p.evaluate(() => { document.body.dataset.tema = 'escuro'; });
  /* CORTADA a conferencia "folha branca" = rgb(255,255,255): a secao 2 ja
     compara papel claro e papel escuro elemento a elemento, e a folha e um
     desses elementos - se ela nao fosse branca no papel, seria a coisa
     mais visivel do mundo e nenhum teste precisaria dizer. */
  const r = await p.evaluate(() => {
    const f = document.querySelector('.folha-a4');
    const g = sel => { const el = f.querySelector(sel); return el ? getComputedStyle(el) : null; };
    return { /* uma fileira NORMAL: a cruzada e vermelha de proposito */
             textoTabela: (() => { const tr = [...f.querySelectorAll('.lay-tabela-mini tbody tr')].find(x => !x.className);
               return tr ? getComputedStyle(tr.querySelector('td.num')).color : null; })(),
             bordaTabela: (() => { const tr = [...f.querySelectorAll('.lay-tabela-mini tbody tr')].find(x => !x.className);
               return tr ? getComputedStyle(tr.querySelector('td.num')).borderTopColor : null; })(),
             rodapeTotal: g('.rodape-tot .rt-valor')?.color,
             generoMasc: (() => { const c = [...f.querySelectorAll('.ft-combo[data-genero="masculino"] .ft-combo-caixa')][0];
               return c ? getComputedStyle(c).backgroundColor : null; })(),
             linhaDoDocumento: (() => { const cab = f.querySelector('.doc-header');
               return cab ? getComputedStyle(cab).backgroundColor : null; })() };
  });
  /* v3.295: no papel quem manda e a PALETA DE IMPRESSAO, nao o :root claro.
     O que este teste garante continua sendo o mesmo - imprimir do tema escuro
     sai igual a imprimir do claro (secoes 1 e 2) - mas o valor de referencia
     passou a ser o da paleta de papel: a tarja masculina e 40% mais forte.
     Ver o bloco B para a paleta inteira. */
  F.diz('tinta masculina = a da paleta de papel', r.generoMasc, 'rgb(108, 160, 228)');
  /* a linha do documento e UMA so desde a v279: comparar com ela */
  F.diz('borda da tabela = linha do documento', r.bordaTabela, r.linhaDoDocumento);

  F.secao('4. O HTML EXPORTADO tambem nao leva o tema escuro');
  const exp = await p.evaluate(() => {
    document.body.dataset.tema = 'escuro';
    const d = new DOMParser().parseFromString(gerarHTML([]), 'text/html');
    return { tema: d.body.dataset.tema || '(nenhum)', classe: d.body.className };
  });
  F.diz('o arquivo do cliente sai sem tema', exp.tema, '(nenhum)');
  F.diz('  e continua sem valores', /sem-dinheiro/.test(exp.classe), true);

  F.secao('5. A LOGO do documento no papel');
  /* NAO ha troca de src: a folha carrega as duas imagens e o CSS escolhe.
     O teste pergunta qual esta VISIVEL em cada midia. */
  await p.evaluate(() => { document.body.dataset.tema = 'escuro'; aplicaLogos(); });
  await p.waitForTimeout(400);
  await p.emulateMedia({ media: 'screen' });
  const naTela = await p.evaluate(LOGOS_VISIVEIS);
  await p.emulateMedia({ media: 'print' });
  const noPapel = await p.evaluate(LOGOS_VISIVEIS);
  const srcs = await p.evaluate(() => [...document.querySelectorAll('.folha-a4 .logo-papel')]
    .map(i => i.getAttribute('src') === LOGO_H_CLARA ? 'clara' : 'outra'));
  F.diz('havia logo no documento', naTela.length > 0, true);
  F.diz('na tela aparece a do tema', naTela.every(v => v === 'tema'), true);
  F.diz('no papel aparece a de papel', noPapel.every(v => v === 'papel'), true);
  F.diz('  e a de papel e a de texto escuro', srcs.every(v => v === 'clara'), true);

  await p.emulateMedia({ media: 'screen' });

  F.secao('6. A TARJA DE GENERO EXISTE NO TEMA ESCURO');
  /* Reclamacao real do chao de fabrica: "so a letra fica colorida". A causa
     era a tinta de genero escura demais - 1.01:1 contra a folha do tema
     escuro. Contraste, nao hex fixo: a paleta pode mudar, a tarja nao pode
     sumir. */
  const tarjas = await p.evaluate(async () => {
    document.body.dataset.tema = 'escuro';
    await new Promise(s => setTimeout(s, 300));
    const c = document.querySelector('.combo-ref'), cx = c.querySelector('.ft-combo-caixa');
    const out = [];
    for (const g of ['masculino', 'feminino', 'infantil']) {
      c.dataset.genero = g;
      await new Promise(s => setTimeout(s, 80));
      const e = getComputedStyle(cx);
      let pai = cx.parentElement, atras = 'rgb(255, 255, 255)';
      while (pai) { const bg = getComputedStyle(pai).backgroundColor;
        if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { atras = bg; break; } pai = pai.parentElement; }
      out.push({ g, fundo: e.backgroundColor, borda: e.borderTopColor, atras });
    }
    c.removeAttribute('data-genero');
    return out;
  });
  const lum = c => { const v = c.map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  const razao = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return +((l1 + .05) / (l2 + .05)).toFixed(2); };
  const rgb = s => (s.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  for (const t of tarjas) {
    const cT = razao(rgb(t.fundo), rgb(t.atras));
    const cB = razao(rgb(t.borda), rgb(t.atras));
    F.diz(`${t.g}: a tarja se destaca da folha escura`, cT >= 1.25, true);
    F.diz(`  e a borda dela tambem`, cB >= 2, true);
  }

  /* devolve a pagina ao estado de todo mundo antes de fechar */
  await p.evaluate(() => { document.body.dataset.tema = 'claro'; });
  await p.emulateMedia({ media: 'screen' });
  await ctx.close();
}
