/* v3.262 — Nome separado da Razão Social, e endereços avulsos. */
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

const UID = '84612fef-0de6-4fd2-b024-6f77bfdf4494';
await page.evaluate((UID) => {
  window.__ficha = (d) => {
    DB.clientes = [Object.assign(cliVazio(), { id: UID, n: '' }, d || {})];
    CLI_SEL = UID;
    const pg = document.getElementById('cliPage'); if (pg) pg.hidden = false;
    FT_SYNC.limpezas = {}; FT_SYNC.renomeacoes = {}; FT_SYNC.on = false;
    cliFicha();
  };
  window.__muda = (id, v) => {
    const el = document.getElementById(id);
    el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  window.__c = () => DB.clientes[0];
  window.__fetchFake = (resp) => {
    window.fetch = async () => ({ ok: true, status: 200, json: async () => resp });
  };
}, UID);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), "3.272");
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. NOME E RAZÃO SOCIAL SÃO CAMPOS DIFERENTES ===');
let r = await page.evaluate(() => {
  __ficha();
  return { temNome: !!document.getElementById('cli_n'),
           temRazao: !!document.getElementById('cli_razao'),
           rotuloNome: document.querySelector('label[for=cli_n]').textContent,
           rotuloRazao: document.querySelector('label[for=cli_razao]').textContent,
           rotuloResp: document.querySelector('label[for=cli_resp]').textContent };
});
checa('campo Nome', r.temNome, true);
checa('campo Razão social', r.temRazao, true);
checa('rótulo do Nome', r.rotuloNome, 'Nome');
checa('rótulo da Razão', r.rotuloRazao, 'Razão social');
checa('Responsável virou contato', r.rotuloResp, 'Responsável (contato)');

const CNPJ = { razao_social: 'ASSOCIACAO EDUCACIONAL MODELO LTDA', nome_fantasia: '',
  cep: '40010000', descricao_tipo_de_logradouro: 'RUA', logradouro: 'CHILE', numero: '10',
  bairro: 'CENTRO', municipio: 'SALVADOR', uf: 'BA', email: 'x@y.com',
  ddd_telefone_1: '7133334444', descricao_situacao_cadastral: 'ATIVA' };

console.log('\n=== 2. SÓ RAZÃO SOCIAL: ELA VAI PARA O NOME (e para o orçamento) ===');
r = await page.evaluate(async (d) => {
  __fetchFake(d);
  __ficha({ n: 'NOVO CLIENTE' });
  const el = document.getElementById('cli_doc');
  el.value = '33000167000101'; el.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(s => setTimeout(s, 400));
  sincClientes();
  return { n: __c().n, razao: __c().razao, resp: __c().resp,
           noMenu: CLIENTES_NOMES.indexOf('ASSOCIACAO EDUCACIONAL MODELO LTDA') >= 0,
           acha: !!achaCliente('ASSOCIACAO EDUCACIONAL MODELO LTDA') };
}, CNPJ);
checa('Nome recebeu a razão social', r.n, 'ASSOCIACAO EDUCACIONAL MODELO LTDA');
checa('Razão social guardada', r.razao, 'ASSOCIACAO EDUCACIONAL MODELO LTDA');
checa('Responsável NÃO foi tocado', r.resp, '');
checa('aparece no menu Cliente do orçamento', r.noMenu, true);
checa('  e o cabeçalho acha por ele', r.acha, true);

console.log('\n=== 3. COM NOME FANTASIA, ELE É QUE VIRA O NOME ===');
r = await page.evaluate(async (d) => {
  __fetchFake(Object.assign({}, d, { nome_fantasia: 'ESCOLA MODELO' }));
  __ficha({ n: 'NOVO CLIENTE' });
  const el = document.getElementById('cli_doc');
  el.value = '33000167000101'; el.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(s => setTimeout(s, 400));
  return { n: __c().n, razao: __c().razao };
}, CNPJ);
checa('Nome = fantasia', r.n, 'ESCOLA MODELO');
checa('Razão social continua a oficial', r.razao, 'ASSOCIACAO EDUCACIONAL MODELO LTDA');

console.log('\n=== 4. NOME PERSONALIZADO É RENOMEAÇÃO DECLARADA ===');
r = await page.evaluate((UID) => {
  __ficha({ n: 'ASSOCIACAO EDUCACIONAL MODELO LTDA', razao: 'ASSOCIACAO EDUCACIONAL MODELO LTDA' });
  __muda('cli_n', 'ESCOLA MODELO');
  return { n: __c().n, razao: __c().razao,
           ren: JSON.parse(JSON.stringify(FT_SYNC.renomeacoes)) };
}, UID);
checa('o Nome mudou', r.n, 'ESCOLA MODELO');
checa('a Razão social ficou intacta', r.razao, 'ASSOCIACAO EDUCACIONAL MODELO LTDA');
checa('e a renomeação foi declarada', r.ren.clientes[UID], 'ESCOLA MODELO');

console.log('\n=== 5. O BLOCO OFICIAL TEM O RÓTULO CERTO ===');
r = await page.evaluate(() => {
  __ficha();
  const tits = [...document.querySelectorAll('#cliPage .cli-tit')].map(t => t.textContent.trim());
  return { temOficial: tits.some(t => t.startsWith('Endereço oficial de CNPJ')),
           temLink: !!document.getElementById('cliMaisEnd'),
           textoLink: document.getElementById('cliMaisEnd').textContent };
});
checa('rótulo "Endereço oficial de CNPJ"', r.temOficial, true);
checa('link de acrescentar existe', r.temLink, true);
checa('  com o texto certo', r.textoLink, '+ acrescentar endereço');

console.log('\n=== 6. O LINK CRIA UM MÓDULO NOVO ===');
r = await page.evaluate(() => {
  __ficha();
  document.getElementById('cliMaisEnd').click();
  document.getElementById('cliMaisEnd').click();
  return { quantos: document.querySelectorAll('.cli-end').length,
           noModelo: __c().enderecos.length,
           idsUnicos: new Set(__c().enderecos.map(e => e.id)).size };
});
checa('dois blocos na tela', r.quantos, 2);
checa('  e no cadastro', r.noModelo, 2);
checa('  com ids diferentes', r.idsUnicos, 2);

console.log('\n=== 7. O ENDEREÇO AVULSO É EDITÁVEL E TEM CEP PRÓPRIO ===');
r = await page.evaluate(async () => {
  __fetchFake({ cep: '41770000', state: 'BA', city: 'Salvador',
                neighborhood: 'Itaigara', street: 'Rua das Palmeiras' });
  __ficha();
  document.getElementById('cliMaisEnd').click();
  const id = __c().enderecos[0].id;
  const rot = document.getElementById('end_' + id + '_rotulo');
  rot.value = 'Entrega'; rot.dispatchEvent(new Event('change', { bubbles: true }));
  const cep = document.getElementById('end_' + id + '_cep');
  cep.value = '41770000'; cep.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(s => setTimeout(s, 400));
  const e = __c().enderecos[0];
  return { rotulo: e.rotulo, rua: e.rua, bairro: e.bairro, cidade: e.cidade, uf: e.uf,
           cep: e.cep, oficialIntacto: __c().rua };
});
checa('o rótulo é texto livre', r.rotulo, 'Entrega');
checa('o CEP preencheu a rua', r.rua, 'Rua das Palmeiras');
checa('  bairro', r.bairro, 'Itaigara');
checa('  cidade', r.cidade, 'Salvador');
checa('  uf', r.uf, 'BA');
checa('  cep formatado', r.cep, '41770-000');
checa('e NÃO encostou no oficial', r.oficialIntacto, '');

console.log('\n=== 8. ENTREGA É EXCLUSIVA ===');
r = await page.evaluate(() => {
  __ficha();
  document.getElementById('cliMaisEnd').click();
  document.getElementById('cliMaisEnd').click();
  const ids = __c().enderecos.map(e => e.id);
  const marcados = () => [...document.querySelectorAll('.cli-entrega.on')].map(b => b.dataset.alvo);
  const inicial = marcados();
  document.querySelector('.cli-entrega[data-alvo="' + ids[0] + '"]').click();
  const depois1 = marcados();
  document.querySelector('.cli-entrega[data-alvo="' + ids[1] + '"]').click();
  const depois2 = marcados();
  document.getElementById('entOficial').click();
  return { inicial, depois1, depois2, voltaOficial: marcados(), entrega: __c().entrega };
});
checa('começa no oficial', r.inicial, ['']);
checa('marcar o 1º desmarca o oficial', r.depois1.length, 1);
checa('marcar o 2º desmarca o 1º', r.depois2.length, 1);
checa('dá para voltar ao oficial', r.voltaOficial, ['']);
checa('e o cadastro guarda vazio = oficial', r.entrega, '');

console.log('\n=== 9. O ENDEREÇO DE ENTREGA É O QUE O ROMANEIO LÊ ===');
r = await page.evaluate(() => {
  __ficha({ rua: 'RUA OFICIAL', num: '1', cidade: 'SALVADOR', uf: 'BA' });
  document.getElementById('cliMaisEnd').click();
  const id = __c().enderecos[0].id;
  Object.assign(__c().enderecos[0],
    { rotulo: 'Galpão', rua: 'RUA DO GALPAO', num: '99', cidade: 'LAURO DE FREITAS', uf: 'BA' });
  const antes = clienteEndEntrega(__c());
  __c().entrega = id;
  const depois = clienteEndEntrega(__c());
  const nota = clienteEnd(__c());
  // e se apagarem o bloco marcado, cai no oficial em vez de ficar sem endereço
  __c().enderecos = [];
  const sumiu = clienteEndEntrega(__c());
  return { antes, depois, nota, sumiu };
});
checa('sem marcar, entrega = oficial', r.antes, 'RUA OFICIAL, 1 · SALVADOR/BA');
checa('marcado, entrega = o avulso', r.depois, 'RUA DO GALPAO, 99 · LAURO DE FREITAS/BA');
checa('a NOTA continua no oficial', r.nota, 'RUA OFICIAL, 1 · SALVADOR/BA');
checa('bloco apagado cai no oficial', r.sumiu, 'RUA OFICIAL, 1 · SALVADOR/BA');

console.log('\n=== 10. REMOVER BLOCO ===');
r = await page.evaluate(() => {
  __ficha();
  document.getElementById('cliMaisEnd').click();
  const id = __c().enderecos[0].id;
  __c().enderecos[0].rotulo = 'Some';
  document.querySelector('[data-remove="' + id + '"]').click();
  return { quantos: __c().enderecos.length, naTela: document.querySelectorAll('.cli-end').length };
});
checa('saiu do cadastro', r.quantos, 0);
checa('  e da tela', r.naTela, 0);

console.log('\n=== 11. BLOCO EM BRANCO NÃO VIRA LIXO; COM RÓTULO SOBREVIVE ===');
r = await page.evaluate(() => {
  __ficha();
  document.getElementById('cliMaisEnd').click();
  document.getElementById('cliMaisEnd').click();
  __c().enderecos[0].rotulo = 'Entrega';      // só o rótulo
  bdPersiste();                                // normaliza e filtra
  return { restaram: __c().enderecos.length, rotulo: (__c().enderecos[0] || {}).rotulo };
});
checa('o vazio some', r.restaram, 1);
checa('  e o que tem rótulo fica', r.rotulo, 'Entrega');

console.log('\n=== 12. CADASTRO ANTIGO (sem os campos novos) ABRE SEM QUEBRAR ===');
r = await page.evaluate(() => {
  DB.clientes = [{ n: 'CLIENTE ANTIGO', doc: '111', rua: 'RUA VELHA' }];
  normalizaClientes();
  CLI_SEL = DB.clientes[0].id;
  cliFicha();
  const c = DB.clientes[0];
  return { n: c.n, razao: c.razao, enderecos: c.enderecos, entrega: c.entrega,
           rua: c.rua, temFicha: !!document.getElementById('cli_razao') };
});
checa('nome preservado', r.n, 'CLIENTE ANTIGO');
checa('razão social nasce vazia', r.razao, '');
checa('lista de endereços nasce vazia', r.enderecos, []);
checa('entrega nasce no oficial', r.entrega, '');
checa('o endereço antigo continua lá', r.rua, 'RUA VELHA');
checa('e a ficha desenha', r.temFicha, true);

console.log('\n' + '='.repeat(60));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.262: TODOS OS TESTES PASSARAM');
