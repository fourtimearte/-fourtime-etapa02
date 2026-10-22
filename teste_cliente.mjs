/* ================================================================
   O ORÇAMENTO QUE O CLIENTE PREENCHE, DE PONTA A PONTA (v3.376)

   Sobe o server.py de verdade com o Drive de mentira (teste_cliente_srv.py)
   e faz o caminho inteiro com o mouse:

     A. o vendedor marca "Nº" num layout, monta o orçamento sem grade e
        gera o link pelo menu "Enviar para cliente"
     B. o cliente abre o link NO CELULAR: nenhum valor em R$, preenche a
        grade com os botões de mais e menos, a lista de nomes (digitando
        e colando do Excel), vê a lista não bater com a grade, recarrega a
        página sem perder nada, e envia
     C. a página trava depois de enviada
     D. o vendedor recebe o aviso, abre, e o que o cliente mandou está
        na folha: grade, lista, o ponto de "não bate"
     E. a folha de nomes na impressão
     F. o link na observação do HTML do Trello abre a tabela e copia o
        pacote FOURTIME_NOMES para o Affinity
     G. salvar em Organizados encerra o link
     H. a página do cliente também no computador

   Fotos em /tmp/cliente-*.png.

       node teste_cliente.mjs
   ================================================================ */
import { spawn } from 'child_process';
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';

const PORTA = 9470 + (process.pid % 200);
const BASE = 'http://127.0.0.1:' + PORTA;
let falhas = 0, total = 0;
function diz(rot, obtido, esperado) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log((ok ? '  ok    ' : '  FALHA ') + rot + (ok ? '' : '  obtido=' + JSON.stringify(obtido) + ' esperado=' + JSON.stringify(esperado)));
}
function secao(t) { console.log('\n=== ' + t + ' ==='); }

const srv = spawn('python3', ['teste_cliente_srv.py', String(PORTA)], { cwd: import.meta.dirname, stdio: ['ignore', 'inherit', 'inherit'] });
const fim = async (cod) => { try { srv.kill(); } catch (_) {} process.exit(cod); };
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(BASE + '/api/versao-publica'); if (r.ok) break; } catch (_) {}
  await new Promise(r => setTimeout(r, 250));
}

const nav = await abreNavegador();
const erros = [];
try {
  /* ---------------------------------------------------------------- */
  secao('A. o vendedor gera o link');
  const ctxV = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxV.addInitScript(b => { try { localStorage.setItem('ft_sync_url', b); localStorage.setItem('ft_sync_on', '1'); } catch (_) {} }, BASE);
  const pv = await ctxV.newPage();
  pv.on('pageerror', e => erros.push('editor: ' + e.message));
  await pv.goto(BASE + '/');
  await esperaPronto(pv);
  diz('a versão nova', await pv.evaluate(() => FT_EDITOR), '3.378');
  await pv.evaluate(() => {
    const p = (k, v) => { const e = document.querySelector('[data-h="' + k + '"]'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    p('cliente', 'ACME ESPORTES'); p('pedido', 'PD004900'); p('vendedor', 'Dani');
  });
  await pv.click('#btnNovoLayout');
  await pv.waitForTimeout(400);
  await pv.evaluate(() => {
    const ms = document.querySelectorAll('.area-paginas .lay-modulo');
    const ref = (m, t) => { const a = m.querySelector('.combo-ref textarea'); a.value = t; a.dispatchEvent(new Event('input', { bubbles: true })); };
    ref(ms[0], 'FT-010-001M \u2014 Camiseta Dry');
    ref(ms[1], 'FT-030-002F \u2014 Regata');
    /* um preço no L-02: o cliente não pode ver */
    const uni = ms[1].querySelectorAll('.c-uni')[1]; uni.textContent = '71,50'; uni.dispatchEvent(new Event('input', { bubbles: true }));
  });
  diz('sem marca, o Nº não aparece (a referência não perde largura)', await pv.locator('.area-paginas .lay-nn-bt:visible').count(), 0);
  await pv.click('#miCliente');
  await pv.waitForSelector('#ftCliFundo.on');
  diz('a janela pergunta antes de gerar', (await pv.textContent('#lcTitulo')).trim(), 'Enviar para o cliente preencher');
  diz('  com um botão por layout', await pv.locator('#lcLayouts .lc-lay').count(), 2);
  await pv.locator('#lcLayouts .lc-lay-nn').first().click();
  diz('  marcar o L-01 liga o botão', (await pv.locator('#lcLayouts .lc-lay-nn').first().textContent()).trim(), 'Com nome e número');
  diz('  e o Nº nasce só no L-01', await pv.locator('.area-paginas .lay-modulo').first().locator('.lay-nn-bt').isVisible() + '/'
    + await pv.locator('.area-paginas .lay-modulo').nth(1).locator('.lay-nn-bt').isVisible(), 'true/false');
  await pv.screenshot({ path: '/tmp/cliente-a-escolha.png' });
  await pv.click('#lcGerar');
  await pv.waitForSelector('#ftCliFundo.on', { timeout: 20000 });
  const link = await pv.inputValue('#lcLink');
  diz('o link aponta para a página do cliente', /^http:\/\/127\.0\.0\.1:\d+\/cliente\/[A-Za-z0-9_-]{32}$/.test(link), true);
  diz('o menu diz aguardando', (await pv.textContent('#miClienteRotulo')).trim(), 'Aguardando cliente');
  diz('com o link no ar, a janela ainda mostra os layouts para marcar', await pv.locator('#lcLayoutsCx').isVisible(), true);
  diz('  com o ponto âmbar', await pv.getAttribute('#miClienteSelo', 'class'), 'mi-cli-selo aguardando');
  await pv.screenshot({ path: '/tmp/cliente-a-link.png' });
  await pv.click('#lcFechar');
  await pv.locator('.area-paginas .lay-modulo').first().locator('.lay-nn-bt').click();
  await pv.waitForSelector('#ftNomesFundo.on');
  diz('o Nº abre a janela da lista', await pv.locator('#ftNomesFundo.on').count(), 1);
  await pv.screenshot({ path: '/tmp/cliente-a-janela-lista.png' });
  await pv.click('#nnFechar');
  const codigo = link.split('/').pop();
  const doc1 = await pv.evaluate(() => coletaEstado());
  diz('o documento guarda o código', doc1.cliente && doc1.cliente.codigo, codigo);
  diz('e a marca do layout', doc1.layouts.map(l => l.nomeNum), [true, false]);

  /* ---------------------------------------------------------------- */
  secao('B. o cliente no celular');
  const ctxC = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pc = await ctxC.newPage();
  pc.on('pageerror', e => erros.push('cliente: ' + e.message));
  await pc.goto(link);
  await pc.waitForSelector('#telaPrincipal:not(.oculto)', { timeout: 20000 });
  const texto = await pc.evaluate(() => document.body.innerText);
  diz('nenhum valor em R$ aparece', /71,50|R\$/.test(texto), false);
  diz('o cliente aparece no topo', (await pc.textContent('#topoCliente')).trim(), 'ACME ESPORTES');
  diz('dois modelos', await pc.locator('.modelo').count(), 2);
  diz('a lista só no modelo marcado', await pc.locator('.modelo').first().locator('.nn-tabela').count() + '/' + await pc.locator('.modelo').nth(1).locator('.nn-tabela').count(), '1/0');
  diz('a barra de envio fica embaixo no celular', await pc.evaluate(() => getComputedStyle(document.getElementById('barra')).position), 'fixed');
  diz('sem rolagem de lado', await pc.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const m1 = pc.locator('#modelo-1');
  /* M: 3 com o botão de mais; G: 2 digitando */
  for (let i = 0; i < 3; i++) await m1.locator('.tam:has(label:text-is("M")) .passo').nth(1).tap();
  await m1.locator('#q-1-G').fill('2');
  diz('o total do modelo anda', (await m1.locator('.secao-topo .soma b').first().textContent()).trim(), '5');
  await m1.locator('.nn-linha').first().locator('input').first().fill('Ana Souza');
  await m1.locator('.nn-linha').first().locator('input').nth(1).fill('7a');
  diz('o número aceita só algarismos', await m1.locator('.nn-linha').first().locator('input').nth(1).inputValue(), '7');
  await m1.locator('.nn-linha').first().locator('.seg .f').tap();
  await m1.locator('.nn-linha').first().locator('select').selectOption('M');
  await m1.locator('button:text-is("Colar do Excel")').tap();
  await pc.fill('#colarTexto', 'Beto Lima\t10\tMasculino\tG\nCaio\t9\tM\tG\nDani\t11\tF\tP');
  diz('a prévia conta as linhas', (await pc.textContent('#colarPrevia')).startsWith('3 linhas'), true);
  await pc.tap('#colarAdicionar');
  diz('a lista ficou com 4', await m1.locator('.nn-linha').count(), 4);
  const linhas = await m1.evaluate(el => [...el.querySelectorAll('.nn-linha')].map(tr => {
    const i = tr.querySelectorAll('input'); const g = tr.querySelector('.seg [aria-pressed="true"]');
    return [i[0].value, i[1].value, g ? g.textContent : '', tr.querySelector('select').value].join('|');
  }));
  diz('o Excel entrou certo, com o "M" lido como gênero', linhas, ['Ana Souza|7|Feminino|M', 'Beto Lima|10|Masculino|G', 'Caio|9|Masculino|G', 'Dani|11|Feminino|P']);
  diz('a conferência avisa que não bate', await m1.locator('.conf.at').count(), 1);
  await pc.locator('#modelo-2 #q-2-P').fill('5');
  /* v3.377: o L-02 não foi marcado pelo vendedor, mas o cliente abre a lista */
  diz('o modelo sem marca oferece abrir a lista', await pc.locator('#modelo-2 button:text-is("+ Adicionar nomes e números")').count(), 1);
  await pc.locator('#modelo-2 button:text-is("+ Adicionar nomes e números")').tap();
  diz('  e a tabela aparece', await pc.locator('#modelo-2 .nn-linha').count(), 1);
  const l2 = pc.locator('#modelo-2 .nn-linha').first();
  await l2.locator('input').first().fill('Zeca'); await l2.locator('input').nth(1).fill('5');
  await l2.locator('.seg .m').tap(); await l2.locator('select').selectOption('P');
  diz('o total geral', (await pc.textContent('#totalGeral')).trim(), '10');
  await pc.screenshot({ path: '/tmp/cliente-b-celular.png', fullPage: true });

  /* recarregar não perde nada */
  await pc.waitForTimeout(600);
  await pc.reload();
  await pc.waitForSelector('#telaPrincipal:not(.oculto)');
  diz('depois de recarregar, a grade continua', await pc.locator('#q-1-M').inputValue(), '3');
  diz('e a lista também', await pc.locator('#modelo-1 .nn-linha').count(), 4);
  diz('e a lista que o cliente abriu no L-02', await pc.locator('#modelo-2 .nn-linha').count(), 1);

  /* uma linha sem tamanho segura o envio */
  await pc.locator('#modelo-1 button:text-is("+ Adicionar linha")').tap();
  await pc.locator('#modelo-1 .nn-linha').last().locator('input').first().fill('Edu');
  await pc.tap('#btEnviar');
  await pc.waitForTimeout(300);
  diz('linha sem gênero e tamanho não deixa enviar', await pc.locator('#fundoConfirma.on').count(), 0);
  diz('  e a linha fica marcada', await pc.locator('#modelo-1 .nn-linha.erro').count(), 1);
  await pc.locator('#modelo-1 .nn-linha').last().locator('.x').tap();

  await pc.tap('#btEnviar');
  await pc.waitForSelector('#fundoConfirma.on');
  const conf = await pc.textContent('#confCorpo');
  diz('a confirmação mostra a diferença', /não bate com a grade/.test(conf), true);
  diz('  com o tamanho que não bate', /M \(grade 3, lista 1\)/.test(conf), true);
  await pc.screenshot({ path: '/tmp/cliente-b-confirma.png' });
  await pc.tap('#confEnviar');
  await pc.waitForSelector('body.travado', { timeout: 15000 });

  /* ---------------------------------------------------------------- */
  secao('C. travada depois de enviada');
  diz('a faixa diz recebido', /Recebido pela Fourtime/.test(await pc.textContent('#faixaEstado')), true);
  diz('o botão de enviar sumiu', await pc.locator('#btEnviar').isVisible(), false);
  diz('a grade virou leitura', await pc.locator('#q-1-M').evaluate(e => e.readOnly), true);
  await pc.screenshot({ path: '/tmp/cliente-c-enviado.png', fullPage: true });
  const r2 = await fetch(BASE + '/api/cliente/devolver/' + codigo, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layouts: [] }) });
  diz('enviar de novo pelo servidor: 409', r2.status, 409);
  await pc.reload();
  await pc.waitForSelector('body.travado');
  diz('recarregada, continua travada', /já foi enviado/.test(await pc.textContent('#faixaEstado')), true);

  /* ---------------------------------------------------------------- */
  secao('D. o vendedor é avisado e abre');
  await pv.evaluate(() => ftCliVigia());
  await pv.waitForSelector('.ft-aviso-cli', { timeout: 10000 });
  diz('o aviso aparece', await pv.locator('.ft-aviso-cli').count(), 1);
  diz('o menu diz que o cliente devolveu', (await pv.textContent('#miClienteRotulo')).trim(), 'Cliente devolveu');
  await pv.screenshot({ path: '/tmp/cliente-d-aviso.png' });
  await pv.locator('.ft-aviso-cli .abrir').click();
  await pv.waitForFunction(() => FT_CLIENTE && FT_CLIENTE.estado === 'devolvido', null, { timeout: 15000 });
  await pv.waitForTimeout(1000);
  const doc2 = await pv.evaluate(() => coletaEstado());
  diz('a grade do cliente chegou', doc2.layouts[0].tamanhos.M && doc2.layouts[0].tamanhos.M.q, '3');
  diz('  e o preço do L-02 continua lá', doc2.layouts[1].tamanhos.P, { q: '5', u: '71,50' });
  diz('a lista que o cliente abriu no L-02 chegou', doc2.layouts[1].lista.map(r => r.nome + '/' + r.num), ['Zeca/5']);
  diz('  e o L-02 ganhou a marca', doc2.layouts[1].nomeNum, true);
  diz('a lista chegou', doc2.layouts[0].lista.map(r => r.nome + '/' + r.num + '/' + r.gen + '/' + r.tam),
    ['Ana Souza/7/feminino/M', 'Beto Lima/10/masculino/G', 'Caio/9/masculino/G', 'Dani/11/feminino/P']);
  diz('o Nº ganha o ponto de "não bate"', await pv.locator('.area-paginas .lay-modulo').first().locator('.lay-nn-bt.difere').count(), 1);
  diz('a aba não ficou suja', await pv.evaluate(() => FT_DOC_SUJO), false);
  diz('o aviso de devolução não volta', (await pv.evaluate(async () => { await ftCliVigia(); return document.querySelectorAll('.ft-aviso-cli:not(.ft-aviso-nomes)').length; })), 0);
  /* v3.378: o orçamento devolvido diz onde estão os nomes */
  await pv.waitForSelector('.ft-aviso-nomes', { timeout: 5000 });
  diz('o aviso diz em que layouts vieram nomes', (await pv.textContent('.ft-aviso-nomes .sub')).trim(), 'L-01: 4 nomes  ·  L-02: 1 nome');
  await pv.screenshot({ path: '/tmp/cliente-d-aviso-nomes.png' });
  await pv.locator('.ft-aviso-nomes .abrir').click();
  await pv.waitForSelector('#ftNomesFundo.on');
  diz('  e "Ver os nomes" abre a lista do primeiro', (await pv.textContent('#nnTitulo')).includes('L-01'), true);
  await pv.click('#nnFechar');
  await pv.click('#miCliente');
  await pv.waitForSelector('#ftCliFundo.on');
  diz('a janela do link lista os layouts com nomes', await pv.locator('#lcRecebidosLista .lc-lay').count(), 2);
  await pv.screenshot({ path: '/tmp/cliente-d-janela-recebidos.png' });
  await pv.locator('#lcRecebidosLista .lc-lay-nn').nth(1).click();
  await pv.waitForSelector('#ftNomesFundo.on');
  diz('  e o "Ver os nomes" do L-02 abre a lista dele', (await pv.textContent('#nnTitulo')).includes('L-02'), true);
  await pv.click('#nnFechar');
  await pv.locator('.area-paginas .lay-modulo').first().locator('.lay-nn-bt').click();
  await pv.waitForSelector('#ftNomesFundo.on');
  diz('a janela mostra as 4 linhas', await pv.locator('#nnCorpo tr').count(), 4);
  diz('  e onde não bate', /M \(grade 3, lista 1\)/.test(await pv.textContent('#nnConf')), true);
  await pv.screenshot({ path: '/tmp/cliente-d-lista.png' });
  await pv.click('#nnFechar');

  /* ---------------------------------------------------------------- */
  secao('E. a folha de nomes na impressão');
  await pv.emulateMedia({ media: 'print' });
  await pv.evaluate(() => nnFolhas());
  const fn = await pv.evaluate(() => ({
    folhas: document.querySelectorAll('.folha-nomes').length,
    linhas: document.querySelectorAll('.folha-nomes .fn-tab tbody tr').length,
    dif: document.querySelectorAll('.fn-resumo td.fn-dif').length > 0,
    visivel: getComputedStyle(document.querySelector('.folha-nomes')).display
  }));
  diz('uma folha de nomes', fn.folhas, 1);
  diz('com as 5 linhas (4 do L-01 e 1 do L-02)', fn.linhas, 5);
  diz('o resumo marca o tamanho que não bate', fn.dif, true);
  diz('aparece no papel', fn.visivel, 'block');
  await pv.locator('.folha-nomes').screenshot({ path: '/tmp/cliente-e-folha-nomes.png' });
  await pv.evaluate(() => nnTiraFolhas());
  await pv.emulateMedia({ media: 'screen' });
  /* muitos nomes: as folhas se dividem e o resumo nunca fica sozinho */
  const muitas = await pv.evaluate(() => {
    const m = document.querySelector('.area-paginas .lay-modulo');
    const antes = m._lista;
    m._lista = Array.from({ length: 90 }, (_, i) => ({ nome: 'Pessoa ' + (i + 1), num: String(i + 1), gen: i % 2 ? 'masculino' : 'feminino', tam: 'M' }));
    nnFolhas();
    const r = { folhas: document.querySelectorAll('.folha-nomes').length, linhas: document.querySelectorAll('.folha-nomes .fn-tab tbody tr').length,
      resumos: document.querySelectorAll('.fn-resumo').length,
      resumoComLinha: [...document.querySelectorAll('.fn-resumo')].every(r => r.parentNode.querySelectorAll('tbody tr').length > 0) };
    nnTiraFolhas(); m._lista = antes; return r;
  });
  diz('90 nomes em 3 folhas', muitas.folhas, 3);
  diz('  todas as linhas (mais a do L-02)', muitas.linhas, 91);
  diz('  um resumo por layout, sempre junto de linhas', muitas.resumos + '/' + muitas.resumoComLinha, '2/true');

  /* ---------------------------------------------------------------- */
  secao('F. o HTML do Trello');
  const html = await pv.evaluate(() => gerarHTML());
  diz('o código do link não viaja', html.includes(codigo), false);
  diz('o botão Nº não viaja', /class="lay-nn-bt/.test(html), false);
  diz('os dados da lista viajam', /window\.FT_NOMES=/.test(html), true);
  const ctxT = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxT.addInitScript(`Object.defineProperty(navigator,'clipboard',{value:{writeText:function(t){ window.__copiado=t; return Promise.resolve(); }},configurable:true});`);
  const pt = await ctxT.newPage();
  pt.on('pageerror', e => erros.push('trello: ' + e.message));
  await pt.setContent(html, { waitUntil: 'load' });
  await pt.waitForTimeout(500);
  diz('o link está na observação do L-01', await pt.locator('.lay-modulo').first().locator('.lay-area .nn-link').count(), 1);
  diz('  e no L-02, a que o cliente abriu', await pt.locator('.lay-modulo').nth(1).locator('.nn-link').count(), 1);
  await pt.locator('.nn-link').first().click();
  await pt.waitForSelector('.nnr-fundo.on');
  diz('a janela mostra as 4 linhas', await pt.locator('.nnr-tab tbody tr').count(), 4);
  await pt.screenshot({ path: '/tmp/cliente-f-trello.png' });
  await pt.click('.nnr-aff');
  await pt.waitForFunction(() => !!window.__copiado);
  const pac = JSON.parse(await pt.evaluate(() => window.__copiado));
  diz('o pacote do Affinity', pac.formato + ' v' + pac.versao, 'FOURTIME_NOMES v1');
  diz('  o pedido', pac.pedido.numero, 'PD004900');
  diz('  as linhas', pac.lista.map(r => r.numero), ['7', '10', '9', '11']);
  diz('  por tamanho', pac.total.porTamanho.G, { masculino: 2, feminino: 0, total: 2 });
  await pt.click('.nnr-tab-bt');
  await pt.waitForTimeout(100);
  diz('a tabela para o Excel', (await pt.evaluate(() => window.__copiado)).split('\n')[1], 'Ana Souza\t7\tFeminino\tM');

  /* ---------------------------------------------------------------- */
  secao('G. Organizados encerra o link');
  await pv.evaluate(() => salvaDrive('organizado'));
  await pv.waitForTimeout(500);
  diz('o ponto some', await pv.locator('#miClienteSelo').isVisible(), false);
  diz('  e o menu volta a dizer enviar', (await pv.textContent('#miClienteRotulo')).trim(), 'Enviar para cliente');
  const r3 = await fetch(BASE + '/api/cliente/ver/' + codigo);
  diz('o link responde 410', r3.status, 410);
  await pc.reload();
  await pc.waitForSelector('#telaErro:not(.oculto)');
  diz('o cliente vê que foi finalizado', (await pc.textContent('#erroTitulo')).trim(), 'Orçamento finalizado');

  /* ---------------------------------------------------------------- */
  secao('H. a página do cliente no computador');
  const ctxV2 = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxV2.addInitScript(b => { try { localStorage.setItem('ft_sync_url', b); localStorage.setItem('ft_sync_on', '1'); } catch (_) {} }, BASE);
  const pv2 = await ctxV2.newPage();
  await pv2.goto(BASE + '/');
  await esperaPronto(pv2);
  await pv2.evaluate(() => { const m = document.querySelector('.area-paginas .lay-modulo'); m.classList.add('nome-num'); nnAtualiza(m);
    const a = m.querySelector('.combo-ref textarea'); a.value = 'FT-010-009M \u2014 Camiseta'; a.dispatchEvent(new Event('input', { bubbles: true }));
    const e = document.querySelector('[data-h="pedido"]'); e.value = 'PD004901'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await pv2.click('#miCliente');
  await pv2.waitForSelector('#ftCliFundo.on #lcGerar', { state: 'visible' });
  await pv2.click('#lcGerar');
  await pv2.waitForSelector('#ftCliFundo.on', { timeout: 20000 });
  const link2 = await pv2.inputValue('#lcLink');
  const ctxD = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const pd = await ctxD.newPage();
  pd.on('pageerror', e => erros.push('cliente pc: ' + e.message));
  await pd.goto(link2);
  await pd.waitForSelector('#telaPrincipal:not(.oculto)');
  diz('no computador a barra fica no alto', await pd.evaluate(() => getComputedStyle(document.getElementById('barra')).position), 'sticky');
  diz('a grade em fileira', await pd.evaluate(() => getComputedStyle(document.querySelector('.grade')).gridTemplateColumns.split(' ').length > 4), true);
  await pd.locator('#q-1-P').fill('4');
  await pd.locator('.nn-linha').first().locator('input').first().fill('Fulano de Tal');
  await pd.screenshot({ path: '/tmp/cliente-h-computador.png', fullPage: true });

  secao('erros de página');
  diz('nenhum erro de JavaScript', erros, []);
} catch (e) {
  console.log('ERRO NO TESTE: ' + (e && e.stack || e));
  falhas++;
} finally {
  await nav.close();
}
console.log('\n' + (falhas ? ('FALHARAM ' + falhas + ' de ' + total) : ('tudo certo (' + total + ')')));
await fim(falhas ? 1 : 0);
