/* ================================================================
   A. O DOCUMENTO

   Sete suites que faziam a MESMA coisa antes de conferir qualquer coisa:
   abrir o editor, esperar ficar pronto e montar o orcamento de teste.
   Eram sete aberturas de pagina e tres montagens de kit para conferir
   coisas que convivem numa unica pagina sem se atrapalhar.

   Aqui a pagina e UMA. A ordem dos blocos nao e estetica, e obrigatoria,
   porque uns sujam o estado dos outros:

     1. cabecalho        nao suja nada
     2. tabela           devolve aplicaDinheiro(true) no fim
     3. arquivar         so abre e fecha modais
     4. CEP + visualizador
     5. CNPJ             destroi DB.clientes, entao vem depois de quem le
     6. cores por grupo  mexe em DB.cores e vai ate a secao Banco
     7. aviso de versao  desliga FT_SYNC, entao fica por ultimo
   ================================================================ */

export async function roda(F) {
  const { ctx, p } = await F.novaPagina();

  /* ---------------- os servidores de mentira ----------------
     Todas as rotas ficam instaladas desde antes do goto: sao tres
     assuntos (CEP, CNPJ e versao publica) que convivem porque cada um
     tem o seu caminho. O estado de cada fonte muda por variavel, e nao
     reinstalando rota, para que a pagina nunca fique sem cobertura. */

  /* resposta REAL do 59607838, com atraso parecido com o da rede: sem o
     atraso, a resposta chegaria antes do 'change' e o defeito de sair do
     campo nao apareceria */
  const CEP = { cep:'59607838', state:'RN', city:'Mossoró',
                neighborhood:'Aeroporto', street:'Rua Tereza Costa' };
  await p.route('**/brasilapi.com.br/api/cep/**', async r => {
    await new Promise(s => setTimeout(s, 900));
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(CEP) });
  });
  await p.route('**/opencep.com/**', r => r.abort());
  await p.route('**/viacep.com.br/**', r => r.abort());

  /* as duas fontes de CNPJ chamam os campos de nomes diferentes: o teste
     manda o formato de cada uma, senao validaria um normalizador que nao
     existe */
  const BASE = { razao_social:'ESCOLA MODELO LTDA', nome_fantasia:'ESCOLA MODELO',
    cep:'74000000', logradouro:'REPUBLICA DO CHILE', numero:'150',
    bairro:'CENTRO', municipio:'GOIANIA', uf:'GO' };
  const RECEITA_BRASILAPI = Object.assign({}, BASE,
    { descricao_tipo_de_logradouro:'AVENIDA', ddd_telefone_1:'6232000000',
      descricao_situacao_cadastral:'ATIVA' });
  const RECEITA_OPENCNPJ = Object.assign({}, BASE,
    { tipo_logradouro:'AVENIDA', telefones:[{ ddd:'62', numero:'32000000' }],
      situacao_cadastral:'Ativa' });

  let brasilapi = { modo:'403' }, opencnpj = { modo:'ok', espera:0 };
  await p.route('**/brasilapi.com.br/api/cnpj/**', async r => {
    if (brasilapi.espera) await new Promise(s => setTimeout(s, brasilapi.espera));
    if (brasilapi.modo === '403') return r.fulfill({ status:403, body:'Forbidden' });
    if (brasilapi.modo === 'morto') return r.abort();
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RECEITA_BRASILAPI) });
  });
  await p.route('**/api.opencnpj.org/**', async r => {
    if (opencnpj.espera) await new Promise(s => setTimeout(s, opencnpj.espera));
    if (opencnpj.modo === '404') return r.fulfill({ status:404, body:'{}' });
    if (opencnpj.modo === 'morto') return r.abort();
    r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(RECEITA_OPENCNPJ) });
  });

  /* a versao publica comeca MUDA de proposito: e assim que a pagina se
     comporta nas outras seis suites (o pedido falha e ninguem acende
     cartao nenhum). O bloco 7 e quem liga a resposta, logo antes de
     chamar a vigia na mao. */
  let versao = { modo:'morto' };
  await p.route('**/api/versao-publica', route => {
    if (versao.modo === 'morto') return route.abort();
    route.fulfill({ status:200, contentType:'application/json',
                    body:JSON.stringify(versao.corpo) });
  });

  await p.goto(F.URL_EDITOR, { waitUntil: 'domcontentloaded' });
  await F.esperaPronto(p, null, 60000);
  await F.montaKit(p);

  /* trocar de secao nao e so esconder uma div: o editor redesenha a
     pagina da secao num setTimeout de 120ms. Esperar pelo SINAL (a classe
     no body e a pagina visivel) em vez dos 600ms fixos de cada suite. */
  async function vaiPara(sec, marcador) {
    await p.evaluate(s => document.querySelector('.ft-rail-bt[data-sec="' + s + '"]').click(), sec);
    await p.waitForFunction(s => document.body.classList.contains('sec-' + s), sec);
    if (marcador) await p.waitForSelector(marcador, { state:'visible' });
    await p.waitForTimeout(250);
  }

  /* Cada Salvar de verdade acende o veu de "Salvando..." e ele fica aceso:
     no navegador do teste nao ha servidor nem onde gravar o arquivo, entao
     ninguem chama o fecha(). Cada suite original terminava logo depois do
     seu Salvar e ninguem via. Numa pagina que continua viva, esse veu cobre
     a tela inteira e engole os cliques de mouse dos blocos seguintes. */
  async function fechaVeuDeSalvar() {
    await p.evaluate(() => ftStatus.fecha());
    await p.waitForFunction(() => !document.getElementById('ftStatusFundo').classList.contains('on'));
  }

  /* ================================================================
     1. A GRADE DO CABECALHO (v3.293/v3.294)

     O cabecalho e uma grade de 4 colunas por 3 fileiras com posicionamento
     AUTOMATICO: so a logo tem lugar fixo, todo o resto cai pela ordem do
     HTML. Isso e pratico (mexer na ordem move o campo) e perigoso pela
     mesma razao: inserir um campo no meio EMPURRA todos os seguintes, e
     ninguem percebe ate alguem imprimir.

     A partir da v3.293 o STATUS fica embaixo da logo e o TOTAL fecha a
     quarta coluna. Na v3.294 a celula do STATUS perdeu o rotulo E o
     placeholder (a palavra aparecia duas vezes na mesma celula) e o "+"
     passou a ser visualmente o MESMO botao do "+" do tecido. Aqui isso e
     medido, nao conferido de olho.
     ================================================================ */
  F.secao('1. CABECALHO: a grade e o que mora em cada celula');

  /* a posicao e MEDIDA na tela, nao lida do HTML: e o desenho que importa */
  const grade = await p.evaluate(() => {
    const h = document.querySelector('.doc-header');
    const hr = h.getBoundingClientRect();
    const nCols = getComputedStyle(h).gridTemplateColumns.split(' ').length;
    const larg = hr.width / nCols;
    const topos = [];
    const itens = [...h.children].filter(c => !c.classList.contains('hd-oculto')).map(c => {
      const r = c.getBoundingClientRect();
      const t = Math.round(r.top - hr.top);
      if (!topos.some(x => Math.abs(x - t) < 4)) topos.push(t);
      /* o STATUS nao tem mais rotulo (v3.294): quem nao tem .hd-label e
         identificado pela classe da celula */
      const rot = (c.querySelector('.hd-label') || {}).textContent
        || (c.classList.contains('hd-obs') ? 'Status' : 'LOGO');
      return { rot, col:Math.round((r.left - hr.left) / larg) + 1, topoPx:t,
               altura:Math.round(r.height) };
    });
    topos.sort((a, b) => a - b);
    itens.forEach(i => { i.fila = topos.findIndex(t => Math.abs(t - i.topoPx) < 4) + 1; });
    return { nCols, filas:topos.length, itens };
  });
  /* CORTE: as onze conferencias de [fila, coluna] campo a campo viraram
     estas duas. Um cabecalho torto se ve na primeira folha que alguem
     olha, e a ORDEM dos rotulos ainda e cobrada duas vezes: aqui e na
     secao do arquivo exportado. */
  F.diz('a grade tem 4 colunas e 3 fileiras', [grade.nCols, grade.filas], [4, 3]);
  F.diz('  e os campos estao na ordem certa', grade.itens.map(i => i.rot),
    ['LOGO','Cliente','CPF/CNPJ','Pedido Nº','Vendedor','Departamento','Entrega',
     'Status','Embalagem','Pagamento','Total']);

  /* a quebra de pagina do orcamento e uma conta fixa: se o cabecalho passar
     a depender do conteudo, a ultima folha estoura sem aviso */
  const alturas = await p.evaluate(() => {
    const h = document.querySelector('.doc-header');
    const a = [...h.children].filter(c => !c.classList.contains('hd-oculto')
                                       && !c.classList.contains('logo-box'))
      .map(c => Math.round(c.getBoundingClientRect().height));
    return { min:Math.min(...a), max:Math.max(...a) };
  });
  F.diz('todas as celulas com a mesma altura', alturas.max - alturas.min <= 1, true);

  const tot = await p.evaluate(() => {
    const cel = document.querySelector('.hd-totais');
    const r = cel.getBoundingClientRect();
    const hr = document.querySelector('.doc-header').getBoundingClientRect();
    const val = document.getElementById('hdTotValor');
    const vr = val.getBoundingClientRect();
    return { pecas:document.getElementById('hdTotPecas').textContent,
             valor:val.textContent,
             /* o valor nao pode vazar da celula: ele e o que estava sumindo antes */
             cabeNaCelula: vr.right <= r.right + 1 && vr.left >= r.left - 1,
             /* e a celula e mesmo a ultima da grade */
             ultimaDaGrade: Math.abs(r.right - hr.right) < 2 };
  });
  F.diz('o total conta pecas', /^[0-9]+$/.test(tot.pecas) && tot.pecas !== '0', true);
  F.diz('  e mostra o valor em reais', /^R\$/.test(tot.valor), true);
  F.diz('  o valor nao vaza da celula', tot.cabeNaCelula, true);
  F.diz('  e a celula fecha a grade a direita', tot.ultimaDaGrade, true);

  const st = await p.evaluate(() => {
    const add = document.querySelector('.hd-tags-add');
    const cel = document.querySelector('.hd-obs');
    const r = cel.getBoundingClientRect();
    const hr = document.querySelector('.doc-header').getBoundingClientRect();
    const ar = add.getBoundingClientRect();
    return { temBotao:!!add,
             botaoDentro: ar.right <= r.right + 1 && ar.top >= r.top - 1,
             /* embaixo da logo: mesma borda esquerda que ela */
             alinhadoComALogo: Math.abs(r.left - hr.left) < 2,
             campoVivo: !!document.querySelector('.hd-tags-wrap[data-h="obs"]') };
  });
  F.diz('o botao de adicionar tag continua la', st.temBotao, true);
  F.diz('  e dentro da celula', st.botaoDentro, true);
  F.diz('  a celula encosta na borda esquerda, como a logo', st.alinhadoComALogo, true);
  F.diz('  e o campo data-h="obs" do formato .ft segue vivo', st.campoVivo, true);

  const html = await p.evaluate(() => gerarHTML());
  const ordem = [...html.matchAll(/class="hd-campo[^"]*"><span class="hd-label">([^<]+)</g)].map(m => m[1]);
  /* o Status sumiu desta lista de proposito: ele nao tem mais rotulo */
  F.diz('a ordem dos rotulos no arquivo e a da tela', ordem,
    ['Cliente','CPF/CNPJ','Vendedor','Departamento','Entrega','Embalagem','Pagamento','Total']);
  F.diz('  e a celula do status viaja sem rotulo',
    /class="hd-campo hd-obs">\s*<div class="hd-tags-caixa"/.test(html), true);

  const mais = await p.evaluate(() => {
    const le = el => { const c = getComputedStyle(el), r = el.getBoundingClientRect();
      const s = el.querySelector('svg'), sr = s ? s.getBoundingClientRect() : null;
      return [+r.width.toFixed(1), +r.height.toFixed(1), c.backgroundColor,
              c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
              c.borderRadius, c.color, sr ? +sr.width.toFixed(1) : null]; };
    const cel = document.querySelector('.hd-obs');
    return { texto:(cel.textContent || '').trim(),
             temLabel:!!cel.querySelector('.hd-label'),
             temPh:!!cel.querySelector('.hd-tags-ph'),
             tecido:le(document.querySelector('.tec-btn.tec-add')),
             status:le(document.querySelector('.hd-tags-add')) };
  });
  F.diz('a celula do status nao escreve nada', mais.texto, '');
  F.diz('  nao tem rotulo', mais.temLabel, false);
  F.diz('  nem placeholder', mais.temPh, false);
  /* tamanho, fundo, borda, raio, cor e icone: sete medidas, uma comparacao */
  F.diz('o "+" do status e identico ao do tecido', mais.status, mais.tecido);

  const tags = await p.evaluate(() => {
    const w = document.querySelector('.hd-tags-wrap');
    w.innerHTML = '<span class="design-tag" data-tag="URGENTE">URGENTE</span>'
                + '<span class="design-tag" data-tag="ATRASADO">ATRASADO</span>';
    w.classList.add('com-tags');
    const bt = document.querySelector('.hd-tags-add').getBoundingClientRect();
    const cel = document.querySelector('.hd-obs').getBoundingClientRect();
    const ts = [...w.querySelectorAll('.design-tag')].map(t => t.getBoundingClientRect());
    return { folga:+(bt.left - ts[ts.length - 1].right).toFixed(1),
             umaLinhaSo: ts.every(t => Math.abs(t.top - ts[0].top) < 2),
             tudoDentro: ts.every(t => t.bottom <= cel.bottom + 1 && t.top >= cel.top - 1) };
  });
  F.diz('as duas tags nao encostam no botao', tags.folga > 0, true);
  F.diz('  e cabem na MESMA linha', tags.umaLinhaSo, true);
  F.diz('  sem serem cortadas pela celula', tags.tudoDentro, true);

  /* ================================================================
     2. OS QUATRO CANTOS DA TABELA, NOS DOIS MODOS (v3.299)

     No modo SEM VALORES as colunas de dinheiro continuam no HTML com
     display:none. `:last-child` e seletor de DOM, nao de olho: quem carrega
     o raio e a borda direita e a ultima celula do MARKUP, que ali esta
     invisivel, e o canto some.

     Isso ja tinha sido corrigido no cabecalho quando o modo nasceu, e ficou
     esquecido no rodape: em cima arredondava, embaixo nao. Aqui os quatro
     cantos sao medidos nos dois modos, para os dois lados nao voltarem a
     divergir.
     ================================================================ */
  F.secao('2. TABELA: os quatro cantos com e sem valores');

  /* mede o canto de cada PONTA VISIVEL: e o que a pessoa ve */
  const cantos = () => p.evaluate(() => {
    const t = document.querySelector('.lay-modulo .lay-tabela-mini');
    const vis = el => getComputedStyle(el).display !== 'none';
    const th = [...t.querySelectorAll('thead th')].filter(vis);
    const td = [...t.querySelectorAll('tfoot td')].filter(vis);
    const g = (e, prop) => Math.round(parseFloat(getComputedStyle(e)[prop]) || 0);
    return {
      colunas:th.length,
      supEsq:g(th[0], 'borderTopLeftRadius'),
      supDir:g(th[th.length - 1], 'borderTopRightRadius'),
      infEsq:g(td[0], 'borderBottomLeftRadius'),
      infDir:g(td[td.length - 1], 'borderBottomRightRadius'),
      /* a moldura tem de fechar dos dois lados nas duas pontas */
      bdDirCab:Math.round(parseFloat(getComputedStyle(th[th.length - 1]).borderRightWidth) * 100) / 100,
      bdDirRod:Math.round(parseFloat(getComputedStyle(td[td.length - 1]).borderRightWidth) * 100) / 100
    };
  });

  let c = await cantos();
  F.diz('com valores: a tabela mostra as quatro colunas', c.colunas, 4);
  F.diz('  os quatro cantos tem raio', [c.supEsq, c.supDir, c.infEsq, c.infDir], [6, 6, 6, 6]);
  F.diz('  e a moldura fecha a direita', [c.bdDirCab > 0, c.bdDirRod > 0], [true, true]);

  await p.evaluate(async () => { aplicaDinheiro(false); await new Promise(s => setTimeout(s, 400)); });
  c = await cantos();
  F.diz('sem valores: sobram duas colunas visiveis', c.colunas, 2);
  F.diz('  os quatro cantos CONTINUAM com raio', [c.supEsq, c.supDir, c.infEsq, c.infDir], [6, 6, 6, 6]);
  F.diz('  e a moldura fecha a direita nas duas pontas', [c.bdDirCab > 0, c.bdDirRod > 0], [true, true]);
  F.diz('  cabecalho e rodape com o MESMO tratamento', c.supDir, c.infDir);

  await p.evaluate(async () => { aplicaDinheiro(true); await new Promise(s => setTimeout(s, 400)); });
  c = await cantos();
  F.diz('voltando: as quatro colunas voltam', c.colunas, 4);
  F.diz('  e os cantos seguem certos', [c.supEsq, c.supDir, c.infEsq, c.infDir], [6, 6, 6, 6]);

  /* ================================================================
     3. ARQUIVAR EM ORGANIZADOS COM DATA ESCOLHIDA

     A data manda na PASTA e no NOME. O teste nao confere pixels: confere
     que a escolha vira o carimbo DDMMAA que o resto do sistema usa.
     ================================================================ */
  F.secao('3. ARQUIVAR: a data escolhida chega ao nome e a pasta');

  let r = await p.evaluate(async () => {
    const pr = perguntaDataArquivo();            /* nao espera: so abrir */
    await new Promise(s => setTimeout(s, 200));
    const f = document.getElementById('ftArqFundo');
    const aberto = f.classList.contains('on');
    const caminho = document.getElementById('arqCaminho').textContent;
    const hojeMarcado = document.getElementById('arqOpHoje').classList.contains('on');
    const campoVisivel = getComputedStyle(document.getElementById('arqLinhaData')).display !== 'none';
    document.getElementById('arqCancelar').click();
    const cancelou = await pr;
    return { aberto, caminho, hojeMarcado, campoVisivel, cancelou,
             fechou:!f.classList.contains('on') };
  });
  F.diz('abre com "hoje" marcado', [r.aberto, r.hojeMarcado], [true, true]);
  F.diz('  o campo de data fica escondido no modo automatico', r.campoVisivel, false);
  F.diz('  o caminho ja vem montado', /Organizados/.test(r.caminho) && /\.ft/.test(r.caminho), true);
  F.diz('cancelar devolve nada e fecha', [r.cancelou, r.fechou], [null, true]);

  r = await p.evaluate(async () => {
    const pr = perguntaDataArquivo();
    await new Promise(s => setTimeout(s, 150));
    document.getElementById('arqOpManual').click();
    const campo = document.getElementById('arqCampoData');
    campo.value = '';
    for (const ch of '28072026') { campo.value += ch; campo.dispatchEvent(new Event('input', { bubbles:true })); }
    await new Promise(s => setTimeout(s, 150));
    const caminho = document.getElementById('arqCaminho').textContent;
    document.getElementById('arqConfirmar').click();
    return { carimbo:await pr, caminho };
  });
  F.diz('28/07/2026 vira 280726', r.carimbo, '280726');
  F.diz('  o caminho mostra a pasta certa',
    /2026 - 07 - JULHO/.test(r.caminho) && /DIA 28/.test(r.caminho), true);
  F.diz('  e o nome termina com a data escolhida', /-280726\.ft/.test(r.caminho), true);

  r = await p.evaluate(async () => {
    const pr = perguntaDataArquivo();
    await new Promise(s => setTimeout(s, 150));
    document.getElementById('arqOpManual').click();
    const campo = document.getElementById('arqCampoData'), bt = document.getElementById('arqConfirmar');
    const poe = v => { campo.value = '';
      for (const ch of v) { campo.value += ch; campo.dispatchEvent(new Event('input', { bubbles:true })); } };
    poe('3107202');                          /* incompleta */
    const incompleta = { txt:campo.value, travado:bt.disabled };
    poe('31022026');                         /* 31 de fevereiro nao existe */
    const impossivel = { txt:campo.value, travado:bt.disabled };
    poe('01012099');                         /* futuro */
    const futuro = { aviso:document.getElementById('arqNota').textContent,
                     alerta:document.getElementById('arqNota').classList.contains('alerta'),
                     travado:bt.disabled };
    document.getElementById('arqCancelar').click(); await pr;
    return { incompleta, impossivel, futuro };
  });
  F.diz('a mascara poe as barras sozinha', r.incompleta.txt, '31/07/202');
  F.diz('  data incompleta trava o botao', r.incompleta.travado, true);
  F.diz('31/02 nao passa', r.impossivel.travado, true);
  F.diz('data futura avisa mas NAO trava', [r.futuro.alerta, r.futuro.travado], [true, false]);

  r = await p.evaluate(async () => {
    const pr = perguntaDataArquivo();
    await new Promise(s => setTimeout(s, 150));
    const campo = document.getElementById('arqCampoData');
    campo.value = '';
    for (const ch of '15082026') { campo.value += ch; campo.dispatchEvent(new Event('input', { bubbles:true })); }
    const bt = document.getElementById('arqBtCal');
    const rb = bt.getBoundingClientRect();
    bt.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }));
    bt.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    await new Promise(s => setTimeout(s, 200));
    const menu = document.getElementById('calMenu');
    const em = getComputedStyle(menu), rm = menu.getBoundingClientRect();
    const veu = getComputedStyle(document.getElementById('ftArqFundo')).zIndex;
    const aberto = { visivel:em.display === 'block',
                     acimaDoVeu:+em.zIndex > +veu,
                     dentroDaTela:rm.left >= 0 && rm.top >= 0 && rm.right <= innerWidth && rm.bottom <= innerHeight,
                     perto:Math.abs(rm.top - rb.bottom) < 400,
                     mes:document.getElementById('calMes').textContent.trim(),
                     marcado:(menu.querySelector('.cal-dia.sel') || {}).textContent,
                     temLimpar:getComputedStyle(document.getElementById('calLimpar')).display !== 'none',
                     manualLigou:document.getElementById('arqOpManual').classList.contains('on') };
    /* escolhe o dia 3 do mesmo mes */
    const dia = [...menu.querySelectorAll('.cal-dia:not(.fora)')].find(d => d.textContent.trim() === '3');
    dia.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    await new Promise(s => setTimeout(s, 200));
    const depois = { campo:campo.value, fechou:getComputedStyle(menu).display === 'none',
                     caminho:document.getElementById('arqCaminho').textContent,
                     modalAberto:document.getElementById('ftArqFundo').classList.contains('on') };
    document.getElementById('arqConfirmar').click();
    return { aberto, depois, carimbo:await pr };
  });
  F.diz('o icone abre o calendario', r.aberto.visivel, true);
  F.diz('  ele fica ACIMA do veu do modal', r.aberto.acimaDoVeu, true);
  F.diz('  e dentro da tela, perto do icone', [r.aberto.dentroDaTela, r.aberto.perto], [true, true]);
  F.diz('  ja abre no mes da data digitada', r.aberto.mes, 'agosto 2026');
  F.diz('  com o dia 15 marcado', r.aberto.marcado, '15');
  F.diz('  sem "Limpar" (a data aqui e obrigatoria)', r.aberto.temLimpar, false);
  F.diz('  e marca a opcao manual sozinho', r.aberto.manualLigou, true);
  F.diz('clicar num dia preenche o campo', r.depois.campo, '03/08/2026');
  F.diz('  fecha o calendario e mantem o modal', [r.depois.fechou, r.depois.modalAberto], [true, true]);
  F.diz('  o caminho acompanha', /DIA 03/.test(r.depois.caminho), true);
  F.diz('  e o carimbo sai certo', r.carimbo, '030826');

  r = await p.evaluate(async () => {
    const campo = document.querySelector('[data-h="envio"]');
    campo.value = ''; campo.dispatchEvent(new Event('input', { bubbles:true }));
    const ic = document.querySelector('.hd-cal');
    ic.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }));
    await new Promise(s => setTimeout(s, 200));
    const menu = document.getElementById('calMenu');
    const abriu = getComputedStyle(menu).display === 'block';
    const temLimpar = getComputedStyle(document.getElementById('calLimpar')).display !== 'none';
    const semAcima = !menu.classList.contains('acima');
    const dia = [...menu.querySelectorAll('.cal-dia:not(.fora)')].find(d => d.textContent.trim() === '9');
    dia.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    await new Promise(s => setTimeout(s, 150));
    return { abriu, temLimpar, semAcima, valor:campo.value,
             fechou:getComputedStyle(menu).display === 'none' };
  });
  F.diz('o icone do cabecalho ainda abre', r.abriu, true);
  F.diz('  com "Limpar" de volta', r.temLimpar, true);
  F.diz('  e sem o z-index de modal', r.semAcima, true);
  F.diz('escolher o dia 9 preenche o ENVIO', /^09\/\d{2}\/\d{4}$/.test(r.valor), true);
  F.diz('  e fecha o calendario', r.fechou, true);

  /* MASCARA DE DATA: O CURSOR FICA ONDE ESTAVA.
     Reescrever o value de um input joga o cursor para o fim. Apagar um
     digito do DIA mandava o cursor para depois do ANO e nao dava para
     corrigir so um pedaco. Vale nos DOIS campos de data do sistema. */
  async function editaDigito(sel) {
    await p.click(sel);
    await p.evaluate(s => { const el = document.querySelector(s); el.value = '';
      el.dispatchEvent(new Event('input', { bubbles:true })); }, sel);
    await p.keyboard.type('15082026');
    const digitado = await p.evaluate(s => document.querySelector(s).value, sel);
    /* cursor logo depois do "5" do DIA */
    await p.evaluate(s => document.querySelector(s).setSelectionRange(2, 2), sel);
    await p.keyboard.press('Backspace');
    const apagou = await p.evaluate(s => document.querySelector(s).selectionStart, sel);
    await p.keyboard.type('7');
    const dia = await p.evaluate(s => document.querySelector(s).value, sel);
    /* agora o MES: cursor depois do segundo digito dele */
    await p.evaluate(s => document.querySelector(s).setSelectionRange(5, 5), sel);
    await p.keyboard.press('Backspace'); await p.keyboard.type('9');
    const mes = await p.evaluate(s => document.querySelector(s).value, sel);
    /* e o ANO: cursor no fim */
    await p.evaluate(s => document.querySelector(s).setSelectionRange(10, 10), sel);
    await p.keyboard.press('Backspace'); await p.keyboard.type('7');
    const ano = await p.evaluate(s => document.querySelector(s).value, sel);
    /* Backspace em cima da BARRA apaga o digito, nao a barra */
    await p.evaluate(s => document.querySelector(s).setSelectionRange(3, 3), sel);
    await p.keyboard.press('Backspace');
    const naBarra = await p.evaluate(s => document.querySelector(s).value, sel);
    return { digitado, apagou, dia, mes, ano, naBarra };
  }
  /* CORTE: eram DUAS rodadas identicas de cinco asserçoes escritas duas
     vezes, uma para cada campo de data. Agora e uma funcao, chamada duas
     vezes: o mesmo que era conferido, sem o copiar e colar. */
  async function conferaCursor(sel, rotulo) {
    const x = await editaDigito(sel);
    F.diz(rotulo, x.digitado, '15/08/2026');
    F.diz('  apagar no DIA deixa o cursor no DIA', x.apagou, 1);
    F.diz('  e o digito novo entra ali mesmo', x.dia, '17/08/2026');
    F.diz('  o mesmo vale para o MES', x.mes, '17/09/2026');
    F.diz('  e para o ANO', x.ano, '17/09/2027');
    return x;
  }

  await p.evaluate(() => { perguntaDataArquivo();
    setTimeout(() => document.getElementById('arqOpManual').click(), 100); });
  await p.waitForFunction(() => document.getElementById('arqOpManual').classList.contains('on'));
  r = await conferaCursor('#arqCampoData', 'modal: a mascara poe as barras');
  /* estava 17/09/2027 com o cursor logo DEPOIS da barra: some o "7" do dia
     (o digito antes da barra), nao a barra */
  F.diz('  Backspace na barra apaga o digito, nao a barra', r.naBarra.replace(/\D/g, ''), '1092027');
  await p.evaluate(() => document.getElementById('arqCancelar').click());
  await p.waitForFunction(() => !document.getElementById('ftArqFundo').classList.contains('on'));

  await conferaCursor('[data-h="envio"]', 'ENVIO: ganhou a mascara (antes ficava 15082026)');
  r = await p.evaluate(async () => {
    const el = document.querySelector('[data-h="envio"]');
    el.value = ''; el.dispatchEvent(new Event('input', { bubbles:true }));
    el.focus();
    for (const ch of 'A COMBINAR') { el.value += ch; el.dispatchEvent(new Event('input', { bubbles:true })); }
    return el.value;
  });
  F.diz('  mas texto livre continua passando inteiro', r, 'A COMBINAR');

  r = await p.evaluate(async () => {
    defineDataArquivo('280726');
    const antes = dataArquivo();
    document.getElementById('opSalvarOrganizado').click();
    await new Promise(s => setTimeout(s, 400));
    const abriu = document.getElementById('ftArqFundo').classList.contains('on');
    defineDataArquivo('');
    return { antes, abriu };
  });
  F.diz('com data registrada, o modal nao aparece', r.abriu, false);
  F.diz('  e a data registrada e a que estava', r.antes, '280726');
  await fechaVeuDeSalvar();

  /* ================================================================
     4. CEP E VISUALIZADOR (as correcoes da v3.292)

     CEP: sair do campo nao pode mais matar a busca. Sair dispara 'change'
     -> bdPersiste() -> normalizaClientes(), que REFAZ cada cliente e cada
     endereco num objeto novo. As guardas antigas comparavam por
     REFERENCIA, entao a resposta que chegava depois era jogada fora e a
     ficha ficava vazia. Agora o alvo e buscado de novo depois do await e a
     identidade e conferida por ID.

     VISUALIZADOR: clicar fora da imagem fecha. Sem estragar o arrasto:
     soltar longe de onde apertou continua sendo pan.

     (a terceira correcao, a do painel de desenvolvimento x fonte do
     documento, mora no bloco B: ela precisa do painel ligado.)
     ================================================================ */
  F.secao('4. CEP: digitar e SAIR do campo ainda preenche');

  await vaiPara('clientes', '#cliPage');
  r = await p.evaluate(async () => {
    const ate = async f => { for (let i = 0; i < 60; i++) { if (f()) return true;
      await new Promise(s => setTimeout(s, 60)); } return false; };
    const out = {};

    /* CASO A: digita e NAO sai do campo (sempre funcionou) */
    DB.clientes = [{ id:'c1', n:'CLIENTE TESTE' }]; CLI_SEL = 'c1'; cliFicha();
    await new Promise(s => setTimeout(s, 300));
    let cep = document.getElementById('cli_cep');
    cep.value = '59607838'; cep.dispatchEvent(new Event('input', { bubbles:true }));
    await ate(() => document.getElementById('cli_cidade').value);
    out.semSair = { cidade:document.getElementById('cli_cidade').value,
                    rua:document.getElementById('cli_rua').value };

    /* CASO B: digita e SAI do campo, que e o gesto de quem usa */
    DB.clientes = [{ id:'c2', n:'CLIENTE DOIS' }]; CLI_SEL = 'c2'; cliFicha();
    await new Promise(s => setTimeout(s, 300));
    cep = document.getElementById('cli_cep');
    cep.value = '59607838'; cep.dispatchEvent(new Event('input', { bubbles:true }));
    await new Promise(s => setTimeout(s, 120));
    cep.dispatchEvent(new Event('change', { bubbles:true }));   /* o blur real dispara isto */
    await ate(() => document.getElementById('cli_cidade').value);
    out.saindoDoCampo = { cidade:document.getElementById('cli_cidade').value,
                          rua:document.getElementById('cli_rua').value };

    /* CASO C: endereco avulso, mesmo gesto */
    DB.clientes = [{ id:'c3', n:'CLIENTE TRES', enderecos:[] }]; CLI_SEL = 'c3'; cliFicha();
    await new Promise(s => setTimeout(s, 300));
    document.getElementById('cliMaisEnd').click();
    await new Promise(s => setTimeout(s, 400));
    const id = (DB.clientes.find(x => x.id === 'c3').enderecos[0] || {}).id;
    const c2 = document.getElementById('end_' + id + '_cep');
    c2.value = '59607838'; c2.dispatchEvent(new Event('input', { bubbles:true }));
    await new Promise(s => setTimeout(s, 120));
    c2.dispatchEvent(new Event('change', { bubbles:true }));
    await ate(() => (document.getElementById('end_' + id + '_cidade') || {}).value);
    out.avulso = { cidade:(document.getElementById('end_' + id + '_cidade') || {}).value,
                   rua:(document.getElementById('end_' + id + '_rua') || {}).value };
    return out;
  });
  F.diz('sem sair do campo, preenche', [r.semSair.cidade, r.semSair.rua], ['Mossoró', 'Rua Tereza Costa']);
  F.diz('SAINDO do campo, tambem preenche', [r.saindoDoCampo.cidade, r.saindoDoCampo.rua], ['Mossoró', 'Rua Tereza Costa']);
  F.diz('  e no endereco avulso igual', [r.avulso.cidade, r.avulso.rua], ['Mossoró', 'Rua Tereza Costa']);

  F.secao('4b. VISUALIZADOR: clique fora fecha, arrasto nao');
  /* a imagem do layout so existe na secao do orcamento: com a pagina de
     clientes por cima, o editor fica oculto por uma classe do body e a
     imagem mede 0x0 */
  await vaiPara('orcamento', '.area-paginas');

  /* O visualizador tem que ser aberto pelo CAMINHO OFICIAL, clicando numa
     imagem de layout. Abrir "na mao" pondo a classe .open deixa o V.img do
     runtime valendo null e o pan quebra: seria um defeito do teste, nao do
     editor. */
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAQUlEQVR42u3QMQEAAAgDoC251a3gLzSgmXBPCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCV0tXHkBAWvIrmMAAAAASUVORK5CYII=';
  const vAberto = () => p.evaluate(() => document.getElementById('viewer').classList.contains('open'));
  async function abreVisualizador() {
    await p.evaluate(async png => {
      const cx = document.querySelector('.lay-img');
      cx.classList.add('com-img');
      cx.innerHTML = '<img alt="">';
      const im = cx.querySelector('img'); im.src = png;
      await new Promise(s => { im.onload = s; if (im.complete && im.naturalWidth) s(); });
      im.click();                                   /* e este clique que abre */
    }, PNG);
    await p.waitForSelector('#viewer.open', { state:'attached' });
    await p.waitForTimeout(300);
  }
  /* onde a imagem foi parar na tela: o runtime e quem decide o encaixe */
  const vCaixa = () => p.evaluate(() => {
    const el = document.getElementById('vImg');
    const b = el.getBoundingClientRect();
    return { l:b.left, t:b.top, w:b.width, h:b.height, larg:innerWidth,
             transform:el.style.transform };
  });
  await abreVisualizador();
  F.diz('o visualizador esta aberto para o teste', await vAberto(), true);
  let cai = await vCaixa();
  /* o encaixe e pela dimensao mais restritiva: uma imagem quadrada numa tela
     deitada preenche a ALTURA toda e deixa faixas de fundo a esquerda e a
     direita. Basta uma dessas faixas para o teste ter onde clicar. */
  F.diz('  e sobra faixa de fundo para clicar', cai.l > 20 || cai.t > 20, true);

  /* clique num ponto do FUNDO, comprovadamente fora da imagem */
  const foraX = cai.l > 20 ? Math.round(cai.l / 2)
                           : Math.round(cai.l + cai.w + (cai.larg - cai.l - cai.w) / 2);
  const foraY = cai.t > 20 ? Math.round(cai.t / 2) : Math.round(cai.t + cai.h / 2);
  await p.mouse.click(foraX, foraY);
  await p.waitForTimeout(250);
  F.diz('clicar FORA da imagem fecha o visualizador', await vAberto(), false);

  /* reabre pelo mesmo caminho e confere que clicar NA IMAGEM nao fecha */
  await abreVisualizador();
  cai = await vCaixa();
  await p.mouse.click(Math.round(cai.l + cai.w / 2), Math.round(cai.t + cai.h / 2));
  await p.waitForTimeout(250);
  F.diz('clicar NA imagem nao fecha', await vAberto(), true);

  /* ARRASTAR o fundo (pan) nao pode fechar */
  await p.mouse.move(foraX, foraY);
  await p.mouse.down();
  await p.mouse.move(foraX + 200, foraY + 100, { steps:8 });
  await p.mouse.up();
  await p.waitForTimeout(250);
  F.diz('arrastar o fundo e pan, nao fecha', await vAberto(), true);
  const depoisDoArrasto = await vCaixa();
  F.diz('  e a imagem andou os 200x100 do arrasto',
    [Math.round(depoisDoArrasto.l - cai.l), Math.round(depoisDoArrasto.t - cai.t)], [200, 100]);

  await p.evaluate(() => document.getElementById('vClose').click());
  await p.waitForTimeout(250);
  F.diz('o botao X continua fechando', await vAberto(), false);

  /* ================================================================
     5. CNPJ NO CADASTRO DE CLIENTES

     Tres coisas, e nenhuma delas depende da internet: a mascara (digitar
     so numeros e ver a pontuacao aparecer), a consulta em PARALELO as duas
     fontes (uma fora do ar nao pode derrubar a outra) e o preenchimento de
     uma ficha que abre com o CNPJ ja la.

     Este bloco refaz DB.clientes do zero varias vezes: por isso vem depois
     de todo mundo que le o banco de clientes.
     ================================================================ */
  F.secao('5. CNPJ: a mascara, as duas fontes e a ficha que se preenche');

  await vaiPara('clientes', '#cliPage');
  await p.evaluate(async () => {
    DB.clientes = [{ id:'m1', n:'NOVO CLIENTE' }]; CLI_SEL = 'm1'; cliFicha();
    await new Promise(s => setTimeout(s, 300));
  });
  await p.click('#cli_doc');
  const passos = [];
  for (const ch of '25260940000140') { await p.keyboard.type(ch);
    passos.push(await p.evaluate(() => document.getElementById('cli_doc').value)); }
  F.diz('digitando so numeros sai pontuado', passos[13], '25.260.940/0001-40');
  F.diz('  o CPF tambem se monta sozinho', passos[10], '252.609.400-00');
  /* apagar um digito no meio nao joga o cursor para o fim */
  await p.evaluate(() => { document.getElementById('cli_doc').setSelectionRange(4, 4); });
  await p.keyboard.press('Backspace');
  r = await p.evaluate(() => ({ v:document.getElementById('cli_doc').value,
                                cur:document.getElementById('cli_doc').selectionStart }));
  F.diz('apagar no meio mantem o cursor no meio', r.cur < 8, true);

  /* e o caso medido em producao: a BrasilAPI passou a responder 403 */
  r = await p.evaluate(async () => {
    const e = await ftBuscaCnpj('25260940000140');
    return { razao:e && e.razao, cidade:e && e.cidade, rua:e && e.rua };
  });
  F.diz('BrasilAPI em 403: a OpenCNPJ resolve', r.razao, 'ESCOLA MODELO LTDA');
  F.diz('  a rua vem com o tipo do logradouro junto', r.rua, 'AVENIDA REPUBLICA DO CHILE');

  /* e o contrario: a segunda fonte morta, a primeira boa */
  brasilapi = { modo:'ok', espera:0 }; opencnpj = { modo:'morto', espera:0 };
  r = await p.evaluate(async () => { const e = await ftBuscaCnpj('25260940000140'); return e && e.razao; });
  F.diz('a ordem nao importa: qualquer uma serve', r, 'ESCOLA MODELO LTDA');

  /* em serie, os 4s da fonte lenta somavam com a outra e estouravam o
     limite. Em paralelo, a boa responde no tempo dela. */
  brasilapi = { modo:'ok', espera:0 }; opencnpj = { modo:'ok', espera:4000 };
  r = await p.evaluate(async () => {
    const t0 = Date.now();
    const e = await ftBuscaCnpj('25260940000140');
    return { ms:Date.now() - t0, achou:!!(e && e.razao) };
  });
  F.diz('a resposta boa nao espera a fonte lenta', r.ms < 3000, true);
  F.diz('  e vem preenchida', r.achou, true);
  /* e a lenta ainda serve quando e a unica */
  brasilapi = { modo:'morto', espera:0 }; opencnpj = { modo:'ok', espera:1500 };
  r = await p.evaluate(async () => { const e = await ftBuscaCnpj('25260940000140'); return e && e.razao; });
  F.diz('  fonte lenta sozinha ainda e esperada', r, 'ESCOLA MODELO LTDA');

  brasilapi = { modo:'morto', espera:0 }; opencnpj = { modo:'morto', espera:0 };
  r = await p.evaluate(async () => await ftBuscaCnpj('25260940000140'));
  F.diz('sem nenhuma fonte, devolve nada (nao inventa)', r, null);
  F.diz('CNPJ incompleto nao vira consulta',
    await p.evaluate(async () => await ftBuscaCnpj('2526094')), null);
  brasilapi = { modo:'403', espera:0 }; opencnpj = { modo:'ok', espera:0 };

  /* o buraco de verdade: o numero entrou por outro caminho e ninguem nunca
     digitou NESTE campo, entao input/blur jamais dispararam */
  r = await p.evaluate(async () => {
    const ate = async f => { for (let i = 0; i < 60; i++) { if (f()) return true;
      await new Promise(s => setTimeout(s, 60)); } return false; };
    DB.clientes = [{ id:'y1', n:'CLIENTE ANTIGO', doc:'25260940000140' }];
    CLI_SEL = 'y1'; cliFicha();
    await ate(() => (DB.clientes[0] || {}).razao);
    const cl = DB.clientes[0];
    return { doc:document.getElementById('cli_doc').value,
             razao:cl.razao, cidade:cl.cidade, rua:cl.rua, uf:cl.uf };
  });
  F.diz('o documento aparece pontuado', r.doc, '25.260.940/0001-40');
  F.diz('  e a ficha se preenche sozinha ao abrir', [r.razao, r.cidade, r.uf],
    ['ESCOLA MODELO LTDA', 'GOIANIA', 'GO']);

  /* aqui a espera E o teste: o que se confere e que nada mudou depois de
     um tempo em que a consulta teria voltado */
  r = await p.evaluate(async () => {
    DB.clientes = [{ id:'z1', n:'CLIENTE MEU', doc:'25260940000140',
                     razao:'RAZAO ESCRITA A MAO', cidade:'ANAPOLIS', rua:'RUA MINHA', cep:'75000000' }];
    CLI_SEL = 'z1'; cliFicha();
    await new Promise(s => setTimeout(s, 1200));
    const cl = DB.clientes[0];
    return { n:cl.n, razao:cl.razao, cidade:cl.cidade, rua:cl.rua };
  });
  F.diz('nada do que estava escrito foi trocado', [r.n, r.razao, r.cidade, r.rua],
    ['CLIENTE MEU', 'RAZAO ESCRITA A MAO', 'ANAPOLIS', 'RUA MINHA']);

  /* O caso relatado: cadastrar cliente novo e nada salvar. O rascunho
     ("NOVO CLIENTE") de proposito nao sobe para o servidor; a mescla
     refazia DB.clientes do zero e ele evaporava no meio da digitacao. A
     partir dai cliAberto() devolvia null e TUDO desistia em silencio: o
     nome, o botao Salvar e o CNPJ. */
  r = await p.evaluate(async () => {
    const ate = async f => { for (let i = 0; i < 60; i++) { if (f()) return true;
      await new Promise(s => setTimeout(s, 60)); } return false; };
    DB.clientes = [{ id:'ja1', n:'CLIENTE QUE JA EXISTIA' }];
    cliListaDesenha();
    document.getElementById('cliNovo').click();
    await new Promise(s => setTimeout(s, 350));
    const criou = (DB.clientes[0] || {}).n;
    /* chega uma mescla do servidor no meio do cadastro */
    aplicarDBExterno({ clientes:[{ id:'ja1', n:'CLIENTE QUE JA EXISTIA' }] });
    await new Promise(s => setTimeout(s, 200));
    const sobreviveu = !!cliAberto();
    const inp = document.getElementById('cli_n');
    inp.value = 'ESCOLA JOAO XXIII';
    inp.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(s => setTimeout(s, 250));
    const salvouNome = (DB.clientes.find(x => x.id === CLI_SEL) || {}).n;
    const doc = document.getElementById('cli_doc');
    doc.focus(); doc.value = '';
    for (const ch of '25260940000140') { doc.value += ch; doc.dispatchEvent(new Event('input', { bubbles:true })); }
    await ate(() => (DB.clientes.find(x => x.id === CLI_SEL) || {}).cidade);
    const cl = DB.clientes.find(x => x.id === CLI_SEL) || {};
    const antesDoSalvar = (ftDadosParaEnviar().clientes || []).map(x => x.n).sort();
    document.getElementById('cliSalvar').click();
    await new Promise(s => setTimeout(s, 500));
    const vaiSubir = (ftDadosParaEnviar().clientes || []).map(x => x.n).sort();
    return { criou, sobreviveu, salvouNome, doc:cl.doc, cidade:cl.cidade, antesDoSalvar, vaiSubir };
  });
  F.diz('o botao cria o rascunho', r.criou, 'NOVO CLIENTE');
  F.diz('  e ele NAO some quando o servidor mescla', r.sobreviveu, true);
  F.diz('o nome digitado e gravado', r.salvouNome, 'ESCOLA JOAO XXIII');
  F.diz('  e o CNPJ preenche a ficha depois disso', [r.doc, r.cidade],
    ['25.260.940/0001-40', 'GOIANIA']);
  F.diz('antes do Salvar, ainda nao sobe', r.antesDoSalvar, ['CLIENTE QUE JA EXISTIA']);
  F.diz('depois do Salvar, sobe', r.vaiSubir, ['CLIENTE QUE JA EXISTIA', 'ESCOLA JOAO XXIII']);
  /* e o rascunho SEM nome continua sem subir: a peneira que evita dois
     "NOVO CLIENTE" virarem um so nao pode ter sido derrubada pelo conserto */
  r = await p.evaluate(async () => {
    DB.clientes = [{ id:'ja1', n:'CLIENTE QUE JA EXISTIA' }];
    document.getElementById('cliNovo').click();
    await new Promise(s => setTimeout(s, 300));
    return (ftDadosParaEnviar().clientes || []).map(x => x.n);
  });
  F.diz('rascunho sem nome continua fora do envio', r, ['CLIENTE QUE JA EXISTIA']);

  /* O que criava um segundo cliente: cada saida de campo ja enviava o
     banco, e o servidor casa cadastro sem id pelo NOME. Digitar "ESCOLA",
     sair do campo e depois completar mandava DOIS nomes em dois envios, e
     la viravam DOIS clientes. */
  r = await p.evaluate(async () => {
    DB.clientes = [{ id:'ja1', n:'CLIENTE QUE JA EXISTIA' }]; cliListaDesenha();
    FT_SYNC.renomeacoes.clientes = {};      /* zera o que as secoes anteriores deixaram */
    document.getElementById('cliNovo').click();
    await new Promise(s => setTimeout(s, 350));
    const o = {};
    o.avisa = document.getElementById('cliEstado').textContent;
    o.marcaNaLista = /não salvo/.test(document.getElementById('cliLista').textContent);
    const inp = document.getElementById('cli_n');
    inp.value = 'ESCOLA'; inp.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(s => setTimeout(s, 200));
    o.noMeio = (ftDadosParaEnviar().clientes || []).map(x => x.n);
    o.semRenome = JSON.stringify((FT_SYNC.renomeacoes || {}).clientes || {});
    inp.value = 'ESCOLA JOAO XXIII'; inp.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(s => setTimeout(s, 200));
    o.completo = (ftDadosParaEnviar().clientes || []).map(x => x.n);
    document.getElementById('cliSalvar').click();
    await new Promise(s => setTimeout(s, 500));
    o.aposSalvar = (ftDadosParaEnviar().clientes || []).map(x => x.n).sort();
    o.marcaSaiu = !/não salvo/.test(document.getElementById('cliLista').textContent);
    /* confirmado, editar volta a ser edicao normal, e nao vira outro cadastro */
    inp.value = 'ESCOLA JOAO XXIII - MATRIZ'; inp.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(s => setTimeout(s, 200));
    o.depoisDeSalvo = (ftDadosParaEnviar().clientes || []).map(x => x.n).sort();
    return o;
  });
  F.diz('a ficha avisa que ainda nao subiu', /apertar Salvar/.test(r.avisa), true);
  F.diz('  e a lista marca "nao salvo"', r.marcaNaLista, true);
  F.diz('nome pela metade NAO vai para o servidor', r.noMeio, ['CLIENTE QUE JA EXISTIA']);
  F.diz('  e nao declara renomeacao de quem nao existe la', r.semRenome, '{}');
  F.diz('nome completo, ainda nao vai (falta o Salvar)', r.completo, ['CLIENTE QUE JA EXISTIA']);
  F.diz('o Salvar e que faz o cliente existir', r.aposSalvar,
    ['CLIENTE QUE JA EXISTIA', 'ESCOLA JOAO XXIII']);
  F.diz('  e a marca "nao salvo" sai da lista', r.marcaSaiu, true);
  F.diz('depois de salvo, editar e edicao: segue UM cliente', r.depoisDeSalvo,
    ['CLIENTE QUE JA EXISTIA', 'ESCOLA JOAO XXIII - MATRIZ']);
  r = await p.evaluate(async () => {
    DB.clientes = []; cliListaDesenha();
    document.getElementById('cliNovo').click();
    await new Promise(s => setTimeout(s, 300));
    document.getElementById('cliSalvar').click();
    await new Promise(s => setTimeout(s, 300));
    return { estado:document.getElementById('cliEstado').textContent,
             envio:(ftDadosParaEnviar().clientes || []).map(x => x.n) };
  });
  F.diz('Salvar sem nome nao cria nada e explica',
    [/escreva o nome/.test(r.estado), r.envio], [true, []]);
  await fechaVeuDeSalvar();      /* o Salvar do cliente acende o veu de novo */

  /* ================================================================
     6. CORES DE TECIDO POR GRUPO (v3.288)

     Tres frentes: o menu do orcamento, a pagina do Banco e, a que importa
     de verdade, a compatibilidade: pedido antigo continua achando a cor
     pelo NOME, e o catalogo novo nao some quando o servidor manda a lista
     velha de volta.

     Este bloco mexe em DB.cores e vai ate a secao Banco, entao fica
     depois de tudo o que le o documento.
     ================================================================ */
  F.secao('6. CORES: 12 grupos no menu e no banco, e nada de antes se perde');

  /* as 50 cores que existiam antes da v3.288: nenhuma pode ter se perdido */
  const ANTIGAS = ['Branco','Preto','Cinza Mescla','Cinza Chumbo','Cinza Claro','Prata','Vermelho',
  'Vermelho Escuro','Vinho','Bordô','Coral','Salmão','Rosa','Rosa Pink','Rosa Bebê','Magenta',
  'Laranja','Laranja Neon','Terracota','Ferrugem','Amarelo Ouro','Amarelo Canário','Amarelo Neon',
  'Mostarda','Creme','Bege','Verde Bandeira','Verde Musgo','Verde Militar','Verde Limão','Verde Água',
  'Verde Neon','Verde Menta','Verde Oliva','Azul Royal','Azul Marinho','Azul Celeste','Azul Turquesa',
  'Azul Petróleo','Azul Bebê','Ciano','Roxo','Lilás','Violeta','Púrpura','Marrom','Café','Chocolate',
  'Caqui','Nude'];

  /* o menu de cor mora no editor: sem voltar para o orcamento, o combo
     mede 0x0 e o menu abriria no canto da tela */
  await vaiPara('orcamento', '.area-paginas');

  r = await p.evaluate(ANT => {
    const nomes = DB.cores.map(x => x.n);
    return { total:DB.cores.length, grupos:corPorGrupo().length,
      semGrupo:DB.cores.filter(x => !x.g).length,
      faltando:ANT.filter(n => !nomes.includes(n)),
      repetidas:[...new Set(nomes.filter((n, i) => nomes.indexOf(n) !== i))],
      porGrupo:corPorGrupo().map(g => g.cores.length),
      temSubli:!!DB.cores.find(x => x.g === 'SUB') };
  }, ANTIGAS);
  F.diz('as 50 cores de antes continuam todas la', r.faltando, []);
  F.diz('  e nenhuma ficou repetida', r.repetidas, []);
  /* CORTE: "12 grupos", "10 cores em cada", "as 120 cores do menu" e "as
     120 linhas do banco" eram quatro conferencias do MESMO catalogo, que e
     constante e se ve de olho. Ficou esta. A secao de compatibilidade, que
     e logica de mescla e nao se ve de olho, ficou inteira. */
  F.diz('o catalogo chegou inteiro', [r.grupos, [...new Set(r.porGrupo)]], [12, [10]]);
  F.diz('  ninguem ficou sem grupo', r.semGrupo, 0);
  F.diz('SUBLIMACAO existe e fica fora dos grupos', r.temSubli, true);

  r = await p.evaluate(async () => {
    /* v3.340: o quadrado saiu de DENTRO do .combo-cor e virou irmao dele
       dentro da .tec-linha, para poder ocupar as duas fileiras da linha. */
    const sw = document.querySelector('.tec-linha .cor-sw');
    sw.click(); await new Promise(s => setTimeout(s, 250));
    const m = document.getElementById('corMenu');
    const o = { abriu:m.style.display === 'block',
                subliNoTopo:m.querySelector('.cor-lista').firstElementChild.className,
                recolhidos:m.querySelectorAll('.cor-grupo.aberto').length,
                naTela:(() => { const b = m.getBoundingClientRect();
                  return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; })() };
    /* busca */
    const bu = m.querySelector('.cor-busca');
    bu.value = 'musgo'; bu.dispatchEvent(new Event('input', { bubbles:true }));
    await new Promise(s => setTimeout(s, 150));
    /* o ".cor-novo" ("Usar tal") e a saida de texto livre, nao uma cor do
       banco: fica de fora da contagem */
    o.busca = { grupos:[...m.querySelectorAll('.cor-grupo:not(.oculto)')].map(g => g.dataset.g),
                itens:[...m.querySelectorAll('.cor-item:not(.oculta):not(.cor-novo)')].map(i => i.dataset.nome),
                temUsarAssim:!!m.querySelector('.cor-novo'),
                abriuSozinho:m.querySelectorAll('.cor-grupo.aberto:not(.oculto)').length };
    /* busca sem acento acha o que tem acento */
    bu.value = 'pessego'; bu.dispatchEvent(new Event('input', { bubbles:true }));
    await new Promise(s => setTimeout(s, 120));
    o.semAcento = [...m.querySelectorAll('.cor-item:not(.oculta):not(.cor-novo)')].map(i => i.dataset.nome);
    bu.value = ''; bu.dispatchEvent(new Event('input', { bubbles:true }));
    await new Promise(s => setTimeout(s, 120));
    /* escolher uma cor de dentro do grupo */
    const g = [...m.querySelectorAll('.cor-grupo')].find(x => x.dataset.g === 'VD');
    /* GARANTE ABERTO, e nao clica no cabecalho as cegas.
       O cabecalho ALTERNA. A busca por "musgo" logo acima abre o grupo VD
       sozinha (e outra conferencia cobra isso), e limpar a busca nem sempre
       o fecha de volta. Quando ele sobrava aberto, este clique FECHAVA, e a
       suite falhava com abriuGrupo=false uma vez a cada tantas rodadas.
       Nao era o editor: era o teste supondo um estado que ele mesmo tinha
       mexido tres linhas antes. */
    if (!g.classList.contains('aberto')) g.querySelector('.cor-grupo-cab').click();
    await new Promise(s => setTimeout(s, 100));
    o.abriuGrupo = g.classList.contains('aberto');
    [...g.querySelectorAll('.cor-item')].find(i => i.dataset.nome === 'Verde Musgo').click();
    await new Promise(s => setTimeout(s, 200));
    const combo = document.querySelector('.combo-cor');
    o.escolha = { campo:combo.querySelector('textarea').value,
                  sw:getComputedStyle(sw).getPropertyValue('--cor-sw').trim(),
                  fechou:m.style.display === 'none' };
    /* reabrindo, o grupo da cor escolhida ja vem aberto e marcado */
    sw.click();
    await new Promise(s => setTimeout(s, 250));
    o.reabre = { abertos:[...m.querySelectorAll('.cor-grupo.aberto')].map(x => x.dataset.g),
                 marcados:[...m.querySelectorAll('.cor-grupo.tem-escolhida')].map(x => x.dataset.g),
                 itemOn:(m.querySelector('.cor-item.on') || { dataset:{} }).dataset.nome };
    /* SUBLIMACAO pinta o swatch de arco-iris */
    m.querySelector('.cor-subli').click();
    await new Promise(s => setTimeout(s, 200));
    o.subli = { campo:combo.querySelector('textarea').value,
                arco:/conic-gradient/.test(getComputedStyle(sw).getPropertyValue('--cor-sw')) };
    /* limpar cor */
    sw.click(); await new Promise(s => setTimeout(s, 200));
    m.querySelector('.cor-limpar').click(); await new Promise(s => setTimeout(s, 200));
    o.limpou = { campo:combo.querySelector('textarea').value,
                 vazio:sw.classList.contains('vazio') };
    return o;
  });
  /* aqui o "12 grupos recolhidos" do original nao cabe mais: o documento de
     teste ja vem com cor escolhida, e o grupo dela abre sozinho de proposito
     (e o que a conferencia do "reabrindo" adiante cobra). Sobra o que o
     resto da secao pressupoe: o menu abriu. */
  F.diz('o menu do orcamento abre', r.abriu, true);
  F.diz('  SUBLIMACAO e o primeiro item, fora dos grupos', r.subliNoTopo, 'cor-subli');
  F.diz('  e o menu cabe na tela', r.naTela, true);
  F.diz('buscar "musgo" deixa so o grupo certo', r.busca.grupos, ['VD']);
  F.diz('  com so a cor certa dentro', r.busca.itens, ['Verde Musgo']);
  F.diz('  e ele abre sozinho', r.busca.abriuSozinho, 1);
  F.diz('  com a saida de texto livre a mao', r.busca.temUsarAssim, true);
  F.diz('buscar sem acento acha o acentuado', r.semAcento, ['Pêssego']);
  F.diz('abrir o grupo e clicar escolhe a cor', [r.abriuGrupo, r.escolha.campo], [true, 'Verde Musgo']);
  F.diz('  o swatch pinta com o hex dela', r.escolha.sw, '#4A5D23');
  F.diz('  e o menu fecha', r.escolha.fechou, true);
  F.diz('reabrindo, o grupo da cor escolhida ja vem aberto',
    [r.reabre.abertos, r.reabre.marcados, r.reabre.itemOn], [['VD'], ['VD'], 'Verde Musgo']);
  F.diz('SUBLIMACAO entra no campo e pinta arco-iris', [r.subli.campo, r.subli.arco], ['SUBLIMAÇÃO', true]);
  F.diz('"limpar cor" esvazia o campo', [r.limpou.campo, r.limpou.vazio], ['', true]);

  await vaiPara('banco', '#bdPage');
  r = await p.evaluate(async () => {
    bdCat = 'cores'; bdRender();
    await new Promise(s => setTimeout(s, 300));
    const pg = document.getElementById('bdPage');
    const o = { subli:!!pg.querySelector('.bd-cor-subli'),
                seletorNovo:!!pg.querySelector('#bdNovoGrupo'),
                recolhidos:pg.querySelectorAll('.bd-cg.aberto').length };
    /* mudar uma cor de grupo */
    const g = [...pg.querySelectorAll('.bd-cg')].find(x => x.dataset.g === 'AZ');
    g.querySelector('.bd-cg-cab').click();
    await new Promise(s => setTimeout(s, 120));
    const sel = g.querySelector('.bd-cor-grupo');
    const nome = DB.cores[+sel.dataset.idx].n;
    sel.value = 'MT'; sel.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(s => setTimeout(s, 350));
    o.mudou = { nome, grupo:DB.cores.find(x => x.n === nome).g,
                abriuDestino:!!document.querySelector('.bd-cg[data-g="MT"].aberto') };
    DB.cores.find(x => x.n === nome).g = 'AZ'; bdPersiste(); bdRender();
    await new Promise(s => setTimeout(s, 250));
    /* acrescentar cor dentro de um grupo */
    const pg2 = document.getElementById('bdPage');
    pg2.querySelector('#bdNovo').value = 'Verde Teste';
    pg2.querySelector('#bdNovaCor').value = '#123456';
    pg2.querySelector('#bdNovoGrupo').value = 'VD';
    pg2.querySelector('#bdAddBtn').click();
    await new Promise(s => setTimeout(s, 450));
    const nova = DB.cores.find(x => x.n === 'Verde Teste');
    o.nova = { g:nova && nova.g, c:nova && nova.c,
               noMenu:corPorGrupo().find(x => x.cod === 'VD').cores.some(x => x.n === 'Verde Teste') };
    /* e some quando apagada */
    const i = DB.cores.findIndex(x => x.n === 'Verde Teste');
    corMarcaApagada('Verde Teste'); DB.cores.splice(i, 1); bdPersiste(); bdRender();
    await new Promise(s => setTimeout(s, 250));
    o.apagou = !DB.cores.find(x => x.n === 'Verde Teste');
    return o;
  });
  F.diz('a pagina do banco mostra os grupos recolhidos', r.recolhidos, 0);
  F.diz('  a SUBLIMACAO aparece fora deles', r.subli, true);
  F.diz('  e ha para onde escolher o grupo da cor nova', r.seletorNovo, true);
  F.diz('trocar o grupo de uma cor funciona', r.mudou.grupo, 'MT');
  F.diz('  e o grupo de destino abre para mostra-la', r.mudou.abriuDestino, true);
  F.diz('cor nova nasce no grupo escolhido', [r.nova.g, r.nova.c], ['VD', '#123456']);
  F.diz('  e aparece no menu do orcamento na hora', r.nova.noMenu, true);
  F.diz('apagar tira do banco', r.apagou, true);

  r = await p.evaluate(async () => {
    const antigas = [{ n:'Branco', c:'#FFFFFF' }, { n:'Preto', c:'#111111' }, { n:'Vinho', c:'#6B1F2B' },
                     { n:'Verde Musgo', c:'#4A5D23' }, { n:'Azul Marinho', c:'#12213F' }];
    /* o servidor manda a lista ANTIGA, sem grupo: e o caso real de quem ja usa */
    aplicarDBExterno({ cores:antigas });
    await new Promise(s => setTimeout(s, 200));
    const o = { replantou:DB.cores.length,
                grupoDoVinho:(DB.cores.find(x => x.n === 'Vinho') || {}).g,
                catalogoInteiro:!!DB.cores.find(x => x.n === 'Marsala'),
                semGrupo:DB.cores.filter(x => !x.g).length };
    /* cor que ninguem conhece nao some: cai em "Sem grupo" */
    aplicarDBExterno({ cores:antigas.concat([{ n:'Cor Da Casa', c:'#ABCDEF' }]) });
    await new Promise(s => setTimeout(s, 200));
    const ch = DB.cores.find(x => x.n === 'Cor Da Casa');
    o.desconhecida = { existe:!!ch, grupo:ch && ch.g,
                       noMenu:corPorGrupo().some(g => g.cod === '') };
    /* apagada de proposito nao ressuscita no replantio */
    const i = DB.cores.findIndex(x => x.n === 'Marsala');
    corMarcaApagada('Marsala'); DB.cores.splice(i, 1);
    aplicarDBExterno({ cores:antigas });
    await new Promise(s => setTimeout(s, 200));
    o.apagadaNaoVolta = !DB.cores.find(x => x.n === 'Marsala');
    corDesmarcaApagada('Marsala'); ftSemeiaCores(); normalizaCores();
    o.recadastradaVolta = !!DB.cores.find(x => x.n === 'Marsala');
    /* pedido antigo: o .ft guarda o NOME, e o nome ainda pinta */
    const combo = document.querySelector('.combo-cor');
    combo.querySelector('textarea').value = 'Verde Musgo';
    pintaSwatch(combo);
    o.pedidoAntigo = getComputedStyle(combo.closest('.tec-linha')
      .querySelector('.cor-sw')).getPropertyValue('--cor-sw').trim();
    return o;
  });
  F.diz('mescla do servidor nao leva o catalogo embora', r.catalogoInteiro, true);
  F.diz('  e a cor antiga ganha o grupo pelo nome', r.grupoDoVinho, 'VM');
  F.diz('  ninguem fica sem grupo por engano', r.semGrupo, 0);
  F.diz('cor desconhecida do servidor nao some', [r.desconhecida.existe, r.desconhecida.grupo], [true, '']);
  F.diz('  e aparece num "Sem grupo" no menu', r.desconhecida.noMenu, true);
  F.diz('cor apagada de proposito nao ressuscita', r.apagadaNaoVolta, true);
  F.diz('  mas volta se for cadastrada de novo', r.recadastradaVolta, true);
  F.diz('pedido antigo continua achando a cor pelo nome', r.pedidoAntigo, '#4A5D23');

  /* UM MENU SO PARA COR.
     CLIQUE DE VERDADE (mouse.click = mousedown+mouseup+click), nao um
     mousedown avulso. Foi essa a cegueira que deixou passar o menu que
     abria e sumia no mesmo gesto: o `click` do mesmo movimento chegava ao
     ouvinte do documento e fechava o que o `mousedown` acabara de abrir. */
  const centro = async sel => await p.evaluate(s => {
    const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x:Math.round(b.left + Math.min(30, b.width / 2)), y:Math.round(b.top + b.height / 2) };
  }, sel);
  const displayCor = () => p.evaluate(() => getComputedStyle(document.getElementById('corMenu')).display);
  /* volta ao ORCAMENTO pelo trilho: esconder o #bdPage na marra nao basta,
     o editor fica oculto por uma classe do body e o campo mede 0x0 */
  await vaiPara('orcamento', '.area-paginas');
  await p.evaluate(() => document.querySelector('.lay-modulo .combo-cor').scrollIntoView({ block:'center' }));
  await p.waitForTimeout(300);
  /* o alvo e o CAMPO em si, e nao os primeiros 30px da caixa: com o
     documento de teste montado, ali mora o rotulo do combo e o clique cairia
     num <span> que nao abre nada */
  /* ESPERA O MENU, E NAO O RELOGIO.
     Ele abre com transicao, e sob a carga da bateria os 350ms nao davam:
     a suite falhava so nestas linhas, uma vez a cada tantas rodadas. Se
     ele nunca abrir, o tempo estoura e a conferencia mostra o 'none' do
     mesmo jeito.
     O 'seguiuAberto' CONTINUA com espera de relogio de proposito: ali a
     pergunta e se ele FICA aberto, e para isso e preciso deixar o tempo
     passar mesmo. */
  const esperaCor = async alvo => {
    await p.waitForFunction(q => {
      const m = document.getElementById('corMenu');
      return !!m && getComputedStyle(m).display === q;
    }, alvo, { timeout: 8000 }).catch(() => {});
  };
  let pt = await centro('.lay-modulo .combo-cor textarea');
  await p.mouse.click(pt.x, pt.y);
  await esperaCor('block');
  const abriuNoClique = await displayCor();
  await p.waitForTimeout(400);
  const seguiuAberto = await displayCor();
  await p.mouse.click(60, 620);
  await esperaCor('none');
  const fechouFora = await displayCor();
  F.diz('clique de verdade no campo ABRE o menu', abriuNoClique, 'block');
  F.diz('  e ele NAO some no mesmo gesto', seguiuAberto, 'block');
  F.diz('  um clique fora fecha', fechouFora, 'none');
  pt = await centro('.lay-modulo .tec-linha .cor-sw');
  await p.mouse.click(pt.x, pt.y);
  /* ESPERA O MENU APARECER, e nao 350ms.
     O menu abre com transicao, e sob a carga da bateria os 350ms nao
     davam: a suite falhava so nesta linha, uma vez a cada tantas rodadas.
     Se ele nunca abrir, o tempo estoura e a conferencia mostra o 'none'
     do mesmo jeito. */
  await p.waitForFunction(() => {
    const m = document.getElementById('corMenu');
    return !!m && getComputedStyle(m).display === 'block';
  }, null, { timeout: 8000 }).catch(() => {});
  F.diz('o quadradinho tambem abre com clique de verdade', await displayCor(), 'block');
  await p.mouse.click(60, 620); await p.waitForTimeout(250);

  /* O campo tinha DOIS caminhos: o quadradinho abria o menu de grupos e o
     campo (ou a seta) abria o dropdown generico dos outros combos: duas
     listas diferentes para a mesma escolha. */
  r = await p.evaluate(async () => {
    const combo = document.querySelector('.lay-modulo .combo-cor');
    const ta = combo.querySelector('textarea');
    const seta = combo.querySelector('.ft-combo-abrir') || combo.querySelector('.ft-combo-seta');
    const cm = document.getElementById('corMenu'), pm = document.getElementById('pickMenu');
    const o = {};
    ta.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }));
    await new Promise(s => setTimeout(s, 250));
    o.campo = { cor:cm.style.display, pick:pm.style.display, grupos:cm.querySelectorAll('.cor-grupo').length };
    /* v3.340: o campo de cor perdeu a .ft-combo-caixa (ele virou o nome
       solto embaixo do tecido, dentro do cartao). O que o menu tem de
       acompanhar agora e o proprio campo. */
    const cx = combo.querySelector('.ft-combo-caixa') || combo;
    const rc = cx.getBoundingClientRect();
    const rm = cm.getBoundingClientRect();
    o.alinhado = Math.abs(rm.left - rc.left) < 2 || Math.round(rm.left) === 12;
    document.body.click(); await new Promise(s => setTimeout(s, 150));
    /* v3.340: o campo de cor perdeu a seta. Dentro do cartao unico quem
       abre a lista e o QUADRADO, ja conferido com mouse de verdade logo
       acima. A seta continua aqui no `if` porque, se algum dia voltar,
       ela nao pode levar a outra lista. */
    o.temSeta = !!seta;
    if (seta) { seta.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }));
      await new Promise(s => setTimeout(s, 250));
      o.seta = { cor:cm.style.display, pick:pm.style.display };
      document.body.click(); await new Promise(s => setTimeout(s, 150)); }
    /* CORTE: aqui havia mais uma abertura pelo quadradinho, com .click().
       O quadradinho ja foi conferido logo acima com mouse de verdade, que
       e o gesto que pegou o defeito. Ficou so aquela. */
    combo.closest('.tec-linha').querySelector('.cor-sw').click();
    await new Promise(s => setTimeout(s, 250));
    /* texto que nao esta no banco continua podendo ser usado */
    const bu = cm.querySelector('.cor-busca');
    bu.value = 'AZUL DA CASA'; bu.dispatchEvent(new Event('input', { bubbles:true }));
    await new Promise(s => setTimeout(s, 200));
    const novo = cm.querySelector('.cor-novo');
    o.livre = { temBotao:!!novo };
    if (novo) novo.click();
    await new Promise(s => setTimeout(s, 250));
    o.usou = ta.value;
    /* e o combo de TECIDO segue com o dropdown de sempre */
    const tec = document.querySelector('.lay-modulo .combo-tecido textarea');
    tec.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }));
    await new Promise(s => setTimeout(s, 250));
    o.tecido = { pick:pm.style.display, cor:cm.style.display };
    return o;
  });
  F.diz('clicar no CAMPO abre o menu de grupos', [r.campo.cor, r.campo.grupos], ['block', 12]);
  F.diz('  e nao o dropdown generico', r.campo.pick !== 'block', true);
  F.diz('  alinhado com a caixa do campo', r.alinhado, true);
  F.diz('o campo de cor nao tem mais seta: quem abre e o quadrado', r.temSeta, false);
  if (r.seta) F.diz('  e se a seta voltar, leva ao mesmo menu',
    [r.seta.cor, r.seta.pick !== 'block'], ['block', true]);
  F.diz('cor fora do banco ainda pode ser usada', r.livre.temBotao, true);
  F.diz('  e o nome digitado entra no campo', r.usou, 'AZUL DA CASA');
  F.diz('TECIDO continua com o dropdown de sempre', [r.tecido.pick, r.tecido.cor], ['block', 'none']);

  /* ================================================================
     7. O AVISO DE VERSAO NOVA

     Nao pode depender de estar logado na sincronizacao. O teste finge um
     servidor que responde /api/versao-publica e confere que o cartao
     acende com a sincronizacao DESLIGADA, que e o caso de quem mais
     precisa do aviso. Como ele desliga o FT_SYNC, fica por ultimo.

     CORTE: a terceira secao ("a vigia engole o erro") so conferia que a
     funcao existe e devolve uma string depois de um pedido abortado. Quem
     cobra isso e o "nenhum erro de pagina" do runner.
     ================================================================ */
  F.secao('7. AVISO DE VERSAO: chega mesmo sem sincronizacao');

  versao = { modo:'ok', corpo:{ editor:'9.999', minimo:'0' } };
  r = await p.evaluate(async () => {
    FT_SYNC.on = false; FT_SYNC.url = ''; FT_SYNC.token = '';
    document.getElementById('ftAvisoVersao').classList.remove('on');
    await ftVigiaVersao();
    await new Promise(s => setTimeout(s, 300));
    const cx = document.getElementById('ftAvisoVersao');
    return { aceso:cx.classList.contains('on'),
             texto:(document.getElementById('ftAvisoVersaoSub') || {}).textContent || '',
             minha:FT_EDITOR };
  });
  F.diz('o cartao de versao nova acendeu', r.aceso, true);
  F.diz('  e diz qual e a minha e qual a publicada',
    /9\.999/.test(r.texto) && r.texto.includes(r.minha), true);

  versao = { modo:'ok', corpo:{ editor:'0.001' } };
  r = await p.evaluate(async () => {
    document.getElementById('ftAvisoVersao').classList.remove('on');
    await ftVigiaVersao();
    await new Promise(s => setTimeout(s, 300));
    return document.getElementById('ftAvisoVersao').classList.contains('on');
  });
  F.diz('versao publicada MENOR nao acende nada', r, false);

  await ctx.close();
}
