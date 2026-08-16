/* v3.261 — botão Salvar e o apagar-campo que gruda. Chromium de verdade. */
import { abreNavegador } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const browser = await abreNavegador();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v272.html').href);
await page.waitForTimeout(2500);

await page.evaluate(() => {
  window.__ficha = (d) => {
    DB.clientes = [Object.assign({ id: '84612fef-0de6-4fd2-b024-6f77bfdf4494', n: 'AÇAI NO COCO',
      resp: '', doc: '', cep: '', rua: '', num: '', bairro: '', cidade: '', uf: '',
      email: '', zap: '', insta: '', fone: '' }, d || {})];
    CLI_SEL = DB.clientes[0].id;
    const pg = document.getElementById('cliPage'); if (pg) pg.hidden = false;
    FT_SYNC.limpezas = {};
    cliFicha();
  };
  window.__muda = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
});

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), "3.272");
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 3).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. O BOTÃO SALVAR EXISTE EM CADA CADASTRO ===');
let r = await page.evaluate(() => {
  __ficha();
  const bt = document.getElementById('cliSalvar');
  const es = document.getElementById('cliEstado');
  return { tem: !!bt, texto: bt && bt.textContent, temEstado: !!es };
});
checa('botão presente', r.tem, true);
checa('rotulado Salvar', r.texto, 'Salvar');
checa('e o indicador de estado junto', r.temEstado, true);

console.log('\n=== 2. APAGAR UM CAMPO É DECLARADO ===');
r = await page.evaluate(() => {
  __ficha({ rua: '234234234', zap: '234234', fone: '234234', insta: '234234234' });
  __muda('cli_rua', '');
  __muda('cli_zap', '');
  return { limpezas: JSON.parse(JSON.stringify(FT_SYNC.limpezas)), rua: DB.clientes[0].rua };
});
checa('a rua saiu do modelo', r.rua, '');
checa('e a limpeza foi declarada',
  r.limpezas.clientes['84612fef-0de6-4fd2-b024-6f77bfdf4494'], ['rua', 'zap']);

console.log('\n=== 3. PREENCHER NÃO GERA LIMPEZA ===');
r = await page.evaluate(() => {
  __ficha({ rua: 'RUA VELHA' });
  __muda('cli_rua', 'RUA NOVA');
  __muda('cli_cidade', 'SALVADOR');
  return { limpezas: JSON.parse(JSON.stringify(FT_SYNC.limpezas)), rua: DB.clientes[0].rua };
});
checa('trocar valor não é limpeza', Object.keys(r.limpezas).length, 0);
checa('  e o valor novo entrou', r.rua, 'RUA NOVA');

console.log('\n=== 4. CADASTRO AINDA NÃO SUBIDO NÃO GERA LIMPEZA ===');
// sem id do servidor não há o que limpar lá
r = await page.evaluate(() => {
  __ficha({ id: 'tmp_abc', rua: 'X' });
  __muda('cli_rua', '');
  return Object.keys(JSON.parse(JSON.stringify(FT_SYNC.limpezas))).length;
});
checa('id provisório não vira limpeza', r, 0);

console.log('\n=== 5. O BOTÃO RECOLHE A TELA INTEIRA ===');
// mesmo o campo que não disparou change (ex.: alterado por script)
r = await page.evaluate(async () => {
  __ficha({ rua: 'RUA ANTIGA', cidade: 'CIDADE ANTIGA' });
  document.getElementById('cli_rua').value = '';          // sem disparar change
  document.getElementById('cli_cidade').value = 'NOVA CIDADE';
  FT_SYNC.on = false;                                     // sem servidor: salva local
  document.getElementById('cliSalvar').click();
  /* ESPERA O RECADO, E NAO UM RELOGIO.
     O salvamento passa por 'salvando...' antes de assentar em 'salvo
     nesta maquina ... servidor desligado'. Os 300ms davam conta sozinhos,
     mas na bateria (duas suites de uma vez, mais o navegador) o assentar
     passava disso e a suite falhava so nesta linha, com as tres de cima
     passando. O sinal honesto e o proprio texto parar de dizer que ainda
     esta salvando. */
  for (let i = 0; i < 60; i++) {
    const t = document.getElementById('cliEstado').textContent || '';
    if (t && !/salvando/i.test(t)) break;
    await new Promise(s => setTimeout(s, 60));
  }
  return { rua: DB.clientes[0].rua, cidade: DB.clientes[0].cidade,
           limpezas: JSON.parse(JSON.stringify(FT_SYNC.limpezas)),
           estado: document.getElementById('cliEstado').textContent };
});
checa('pegou o campo esvaziado', r.rua, '');
checa('  e o alterado', r.cidade, 'NOVA CIDADE');
checa('  declarando a limpeza',
  r.limpezas.clientes['84612fef-0de6-4fd2-b024-6f77bfdf4494'], ['rua']);
checa('e diz a verdade sem servidor', r.estado.includes('servidor desligado'), true);

console.log('\n=== 6. COM SERVIDOR, O BOTÃO EMPURRA NA HORA ===');
r = await page.evaluate(async () => {
  let chamou = 0, corpo = null;
  FT_SYNC.on = true; FT_SYNC.url = 'https://exemplo.invalido';
  window.fetch = async (u, o) => {
    chamou++; corpo = JSON.parse(o.body);
    return { ok: true, status: 200, json: async () => ({ rev: 99, mesclado: true, data: DB }) };
  };
  __ficha({ rua: 'APAGAR ISTO' });
  __muda('cli_rua', '');
  const t0 = Date.now();
  document.getElementById('cliSalvar').click();
  await new Promise(s => setTimeout(s, 350));
  return { chamou, temLimpezas: !!(corpo && corpo.limpezas),
           limpezas: corpo && corpo.limpezas, ms: Date.now() - t0,
           estado: document.getElementById('cliEstado').textContent,
           filaVazia: Object.keys(FT_SYNC.limpezas).length === 0 };
});
checa('gravou sem esperar o segundo de folga', r.chamou >= 1, true);
checa('  e antes do temporizador (1200ms)', r.ms < 1000, true);
checa('a limpeza foi no envio', r.temLimpezas, true);
checa('  com o campo certo',
  r.limpezas.clientes['84612fef-0de6-4fd2-b024-6f77bfdf4494'], ['rua']);
checa('a fila esvaziou depois do sucesso', r.filaVazia, true);
checa('e confirmou na tela', /^salvo às \d\d:\d\d$/.test(r.estado), true);

console.log('\n=== 7. FALHA DE REDE APARECE, NÃO SOME ===');
r = await page.evaluate(async () => {
  FT_SYNC.on = true; FT_SYNC.url = 'https://exemplo.invalido';
  window.fetch = async () => { throw new TypeError('Failed to fetch'); };
  __ficha({ rua: 'X' });
  __muda('cli_rua', '');
  document.getElementById('cliSalvar').click();
  await new Promise(s => setTimeout(s, 400));
  return { estado: document.getElementById('cliEstado').textContent,
           filaGuardada: !!(FT_SYNC.limpezas.clientes),
           rua: DB.clientes[0].rua,
           botaoLiberado: !document.getElementById('cliSalvar').disabled };
});
checa('avisa que não subiu', r.estado.includes('não'), true);
checa('  mas diz que está guardado aqui', r.estado.includes('guardado aqui'), true);
checa('a limpeza fica na fila para a próxima', r.filaGuardada, true);
checa('o dado continua apagado localmente', r.rua, '');
checa('o botão volta a funcionar', r.botaoLiberado, true);

console.log('\n' + '='.repeat(60));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.261: TODOS OS TESTES DO EDITOR PASSARAM');
