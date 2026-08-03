/* v3.274 — nenhuma caixa do NAVEGADOR sobrou.

   Eram três confirm() e vinte e dois alert(). O teste não confere só o
   desenho: confere que a DECISÃO continua valendo — fechar aba suja com
   "Cancelar" tem de manter a aba, e com "Fechar mesmo assim" tem de
   fechar. Se o modal virar enfeite e o fechamento acontecer de qualquer
   jeito, este teste acusa. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(52)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const browser = await abreNavegador();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
/* se alguma caixa NATIVA escapar, o Playwright a entrega aqui. É a prova
   mais direta que existe: não é leitura de código, é o navegador falando. */
const nativas = [];
page.on('dialog', async d => { nativas.push({ tipo: d.type(), texto: d.message().slice(0, 80) }); await d.dismiss(); });
await page.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v276.html')).href);
await esperaPronto(page);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), (process.env.FT_VER||'3.276'));
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. A API EXISTE ===');
let r = await page.evaluate(() => ({
  metodos: Object.keys(window.ftStatus).sort(),
  alertTrocado: window.alert !== window.ftAlertNativo,
  guardouONativo: typeof window.ftAlertNativo === 'function',
}));
checa('ftStatus tem pergunta e aviso', r.metodos, ['aviso', 'carregando', 'erro', 'fecha', 'pergunta', 'sucesso']);
checa('o alert do navegador foi redirecionado', r.alertTrocado, true);
checa('  e o nativo ficou guardado', r.guardouONativo, true);

console.log('\n=== 2. alert() VIRA MODAL, NÃO CAIXA DO CHROME ===');
r = await page.evaluate(async () => {
  alert('Conecte o servidor primeiro (Banco de Dados → servidor).');
  await new Promise(s => setTimeout(s, 250));
  const f = document.getElementById('ftStatusFundo');
  const out = { aberto: f.classList.contains('on'),
                titulo: document.getElementById('ftStatusTitulo').textContent,
                msg: document.getElementById('ftStatusMsg').textContent,
                naoTemCancelar: getComputedStyle(document.getElementById('ftStatusNao')).display === 'none' };
  ftStatus.fecha();
  return out;
});
checa('o modal abriu', r.aberto, true);
checa('  título padrão', r.titulo, 'Atenção');
checa('  com o texto do alert', r.msg, 'Conecte o servidor primeiro (Banco de Dados → servidor).');
checa('  sem botão Cancelar (não é pergunta)', r.naoTemCancelar, true);

console.log('\n=== 3. A 1ª LINHA VIRA TÍTULO quando há parágrafos ===');
r = await page.evaluate(async () => {
  alert('EDITOR DESATUALIZADO\n\nA versão publicada é mais nova que esta.');
  await new Promise(s => setTimeout(s, 250));
  const out = { titulo: document.getElementById('ftStatusTitulo').textContent,
                msg: document.getElementById('ftStatusMsg').textContent };
  ftStatus.fecha();
  return out;
});
checa('título', r.titulo, 'EDITOR DESATUALIZADO');
checa('corpo', r.msg, 'A versão publicada é mais nova que esta.');

console.log('\n=== 4. pergunta() DEVOLVE A ESCOLHA ===');
r = await page.evaluate(async () => {
  const p = ftStatus.pergunta('Fechar sem salvar?', 'A aba tem alterações.', { ok: 'Fechar mesmo assim' });
  await new Promise(s => setTimeout(s, 250));
  const cx = document.getElementById('ftStatusCx');
  const visual = {
    ehPergunta: cx.classList.contains('pergunta'),
    ehPerigo: cx.classList.contains('perigo'),
    cancelarVisivel: getComputedStyle(document.getElementById('ftStatusNao')).display !== 'none',
    rotuloOk: document.getElementById('ftStatusOk').textContent,
    /* numa pergunta destrutiva o foco começa em Cancelar */
    focoEmCancelar: document.activeElement.id === 'ftStatusNao',
    /* e o OK perde o preenchimento vermelho (kit §01) */
    okPreenchido: getComputedStyle(document.getElementById('ftStatusOk')).backgroundColor,
  };
  document.getElementById('ftStatusNao').click();
  return { visual, resposta: await p };
});
checa('marcada como pergunta', r.visual.ehPergunta, true);
checa('  e como destrutiva', r.visual.ehPerigo, true);
checa('Cancelar aparece', r.visual.cancelarVisivel, true);
checa('rótulo do OK veio da chamada', r.visual.rotuloOk, 'Fechar mesmo assim');
checa('foco começa em Cancelar', r.visual.focoEmCancelar, true);
checa('OK vazado, não preenchido (kit §01)', r.visual.okPreenchido, 'rgb(255, 255, 255)');
checa('clicar em Cancelar devolve false', r.resposta, false);

r = await page.evaluate(async () => {
  const p = ftStatus.pergunta('Vai?', 'texto');
  await new Promise(s => setTimeout(s, 200));
  document.getElementById('ftStatusOk').click();
  return await p;
});
checa('clicar em OK devolve true', r, true);

console.log('\n=== 5. FECHAR SEM ESCOLHER É "NÃO" ===');
r = await page.evaluate(async () => {
  const p1 = ftStatus.pergunta('Esc?', 'texto');
  await new Promise(s => setTimeout(s, 200));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const esc = await p1;
  const p2 = ftStatus.pergunta('Véu?', 'texto');
  await new Promise(s => setTimeout(s, 200));
  const f = document.getElementById('ftStatusFundo');
  f.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return { esc, veu: await p2 };
});
checa('Esc = não', r.esc, false);
checa('clique no véu = não', r.veu, false);

console.log('\n=== 6. FECHAR ABA SUJA — A DECISÃO VALE ===');
r = await page.evaluate(async () => {
  const espera = ms => new Promise(s => setTimeout(s, ms));
  /* Duas abas. A SUJA é a de índice 0, que não é a ativa — o "+" ativa a
     nova. Esse detalhe importa: fechaAba lê `a.sujo` para aba inativa e a
     variável FT_DOC_SUJO para a ativa, e FT_DOC_SUJO é `let` de módulo —
     window.FT_DOC_SUJO=true não a alcança (primeira versão deste teste
     falhava por isso, e a culpa era da asserção). */
  document.getElementById('ftTabMais').click(); await espera(350);
  const antes = ABAS.length;
  ABAS[0].sujo = true;

  /* 1) Cancelar -> a aba CONTINUA */
  fechaAba(0); await espera(300);
  const perguntou = document.getElementById('ftStatusFundo').classList.contains('on');
  document.getElementById('ftStatusNao').click(); await espera(300);
  const depoisDeCancelar = ABAS.length;

  /* 2) Confirmar -> a aba SAI */
  fechaAba(0); await espera(300);
  document.getElementById('ftStatusOk').click(); await espera(400);
  const depoisDeConfirmar = ABAS.length;

  /* 3) aba limpa fecha DIRETO, sem perguntar */
  document.getElementById('ftTabMais').click(); await espera(350);
  const comLimpa = ABAS.length;
  ABAS[0].sujo = false;
  fechaAba(0); await espera(300);
  return { antes, perguntou, depoisDeCancelar, depoisDeConfirmar,
           semPerguntar: !document.getElementById('ftStatusFundo').classList.contains('on'),
           comLimpa, aposLimpa: ABAS.length };
});
checa('abriu a 2ª aba', r.antes, 2);
checa('aba suja PERGUNTA', r.perguntou, true);
checa('  Cancelar mantém a aba', r.depoisDeCancelar, 2);
checa('  Confirmar fecha', r.depoisDeConfirmar, 1);
checa('aba limpa não pergunta', r.semPerguntar, true);
checa('  e fecha direto', [r.comLimpa, r.aposLimpa], [2, 1]);

console.log('\n=== 6b. A ABA ATIVA, SUJA DE VERDADE (o caso da imagem) ===');
r = await page.evaluate(async () => {
  const espera = ms => new Promise(s => setTimeout(s, ms));
  document.getElementById('ftTabMais').click(); await espera(350);
  const antes = ABAS.length;
  /* nada de mexer em variável: digita no documento e deixa o próprio
     editor marcar como sujo, como acontece com o usuário */
  const campo = document.querySelector('.area-paginas [data-h="cliente"]');
  campo.value = 'KIT DE TESTE';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  await espera(200);
  const marcouSozinho = FT_DOC_SUJO === true && ABA_ATUAL === ABAS.length - 1;
  fechaAba(ABA_ATUAL); await espera(300);
  const perguntou = document.getElementById('ftStatusFundo').classList.contains('on');
  const texto = document.getElementById('ftStatusMsg').textContent;
  document.getElementById('ftStatusNao').click(); await espera(300);
  const manteve = ABAS.length;
  fechaAba(ABA_ATUAL); await espera(300);
  document.getElementById('ftStatusOk').click(); await espera(400);
  return { antes, marcouSozinho, perguntou, texto, manteve, fechou: ABAS.length };
});
checa('o editor marcou a aba como suja sozinho', r.marcouSozinho, true);
checa('fechar a aba ATIVA suja pergunta', r.perguntou, true);
checa('  e a mensagem nomeia a aba', /tem altera\u00e7\u00f5es n\u00e3o salvas/.test(r.texto), true);
checa('  Cancelar mantém', r.manteve, r.antes);
checa('  Confirmar fecha', r.fechou, r.antes - 1);

console.log('\n=== 7. NUNCA FICA SEM ABA ===');
r = await page.evaluate(async () => {
  ftDocLimpo(); ABAS.forEach(a => a.sujo = false);
  while (ABAS.length > 1) fechaAba(ABAS.length - 1);
  fechaAba(0);
  await new Promise(s => setTimeout(s, 400));
  return ABAS.length;
});
checa('sempre sobra uma', r, 1);

console.log('\n=== 8. O DESENHO É O DO KIT §15 ===');
r = await page.evaluate(() => {
  const f = getComputedStyle(document.getElementById('ftStatusFundo'));
  const c = getComputedStyle(document.getElementById('ftStatusCx'));
  return { veu: f.backgroundColor, raio: c.borderRadius, sombra: c.boxShadow };
});
checa('véu rgba(14,17,22,.5)', r.veu, 'rgba(14, 17, 22, 0.5)');
checa('caixa raio 16 (r-xl)', r.raio, '16px');
checa('elevação sh-4', r.sombra,
  'rgba(16, 20, 28, 0.18) 0px 18px 48px 0px, rgba(16, 20, 28, 0.1) 0px 4px 12px 0px');

console.log('\n=== 9. NENHUMA CAIXA NATIVA APARECEU ===');
checa('o navegador não abriu diálogo nenhum', nativas, []);
if (nativas.length) nativas.forEach(d => console.log('     ! ' + d.tipo + ': ' + d.texto));

console.log('\n' + '='.repeat(64));
checa('nenhum erro de página no total', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.274: ADEUS alert() E confirm() DO NAVEGADOR');
