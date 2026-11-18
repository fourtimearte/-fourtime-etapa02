/* O FORNECEDOR DO TECIDO E O TELEFONE NO CABECALHO (v3.383)

   Pedido do Henrique, aprovado no wireframe de 17/11/2026:
     · uma linha FORNECEDOR embaixo de cada tecido, escolhida da LISTA
       (todos os fornecedores, sem filtro pelo tecido)
     · pagina Fornecedores no Banco, com ficha e "O que fornece" (tecido
       e cor, so registro)
     · fornecedor so aparece para a FABRICA: some na folha com valor
     · os fornecedores do Fourtime OS vem junto
     · CPF/CNPJ dividido com Telefone, coluna do meio mais larga; o
       telefone e escrito a mao ou vem da ficha do cliente
*/
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

const DIR = import.meta.dirname + '/';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(58)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}
const URL_ED = pathToFileURL(DIR + (process.env.FT_ARQ || editorAtual())).href;
const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
p.on('pageerror', e => falhas.push('erro na pagina: ' + e.message));
await p.goto(URL_ED);
await esperaPronto(p);

console.log('\n[1] os fornecedores do Fourtime OS');
let r = await p.evaluate(() => ({
  nomes: FORN_NOMES.slice(),
  transp: DB.fornecedores.filter(f => /BRASPRESS|CORREIOS|JADLOG|TOTAL EXPRESS/.test(f.n)).length,
  menegotti: (DB.fornecedores.find(f => f.n === 'MENEGOTTI TEXTIL') || {}).fornece?.length,
  doc: (DB.fornecedores.find(f => f.n === 'TEXMALHA') || {}).doc,
  /* todo tecido registrado existe no editor, menos o que o editor nao tem */
  foraDoEditor: [...new Set(DB.fornecedores.flatMap(f => f.fornece.map(x => x.t)))].filter(t => !TEC_NOMES.includes(t)),
}));
checa('os seis fornecedores de tecido, em ordem', r.nomes, ['COMESC INDUSTRIA E COMERCIO', 'DIKLATEX INDUSTRIAL TEXTIL S/A',
  'EXCIM IMPORTACAO E EXPORTACAO LTDA', 'MENEGOTTI TEXTIL', 'SAGESSE TEXTIL', 'TEXMALHA']);
checa('nenhuma transportadora', r.transp, 0);
checa('MENEGOTTI fornece seis pares de tecido e cor', r.menegotti, 6);
checa('o CNPJ veio junto', r.doc, '04.776.216/0004-47');
checa('tecido fora do catalogo do editor: so o SEM ELASTANO', r.foraDoEditor, ['POLIAMIDA FURADINHA SEM ELASTANO']);

console.log('\n[2] apagado de proposito nao volta no plantio');
r = await p.evaluate(() => {
  const i = DB.fornecedores.findIndex(f => f.n === 'TEXMALHA');
  DB.fornecedores.splice(i, 1); fornMarcaApagado('TEXMALHA');
  const n1 = ftSemeiaFornecedores();
  fornDesmarcaApagado('TEXMALHA');
  const n2 = ftSemeiaFornecedores(); sincFornecedores();
  return [n1, n2, FORN_NOMES.includes('TEXMALHA')];
});
checa('nao replanta o apagado, replanta quando desmarcado', r, [0, 1, true]);

console.log('\n[3] a linha do fornecedor no orcamento');
r = await p.evaluate(() => {
  const m = document.querySelector('.lay-modulo');
  m.querySelector('.btn-add-tecido').click();
  document.getElementById('btnNovoLayout').click();
  return {
    linhas: document.querySelectorAll('.tec-linha').length,
    comForn: document.querySelectorAll('.tec-linha .combo-forn').length,
    rotulo: document.querySelector('.combo-forn .forn-rot').textContent,
    soLeitura: [...document.querySelectorAll('.combo-forn textarea')].every(t => t.readOnly),
  };
});
checa('toda linha de tecido tem fornecedor (3 linhas)', [r.linhas, r.comForn], [3, 3]);
checa('rotulo', r.rotulo, 'Fornecedor');
checa('campo so pela lista (readonly)', r.soLeitura, true);

console.log('\n[4] o menu: a lista inteira, sem "Usar", com "Sem fornecedor"');
await p.click('.lay-modulo .tec-linha .combo-forn .forn-rot');
await p.waitForTimeout(150);
r = await p.evaluate(() => ({
  aberto: getComputedStyle(pickMenu).display,
  itens: [...pickLista.querySelectorAll('.pick-item')].map(i => i.textContent),
}));
checa('menu abriu', r.aberto, 'block');
checa('mostra os seis, sem filtro pelo tecido', r.itens.length, 6);
await p.fill('#pickMenu input', 'zzz');
r = await p.evaluate(() => ({ usar: !!pickLista.querySelector('.pick-novo'), vazio: (pickLista.querySelector('.pick-vazio') || {}).textContent || '' }));
checa('nome fora do cadastro nao vira "Usar"', r.usar, false);
checa('e explica onde cadastrar', /Banco/.test(r.vazio), true);
await p.mouse.click(1400, 900);   /* fechar clicando fora */
await p.waitForTimeout(100);
r = await p.evaluate(() => document.querySelector('.combo-forn textarea').value);
checa('o texto da busca nao fica no campo', r, '');
await p.click('.lay-modulo .tec-linha .combo-forn .forn-rot');
await p.fill('#pickMenu input', 'texm');
await p.click('#pickMenu .pick-item');
r = await p.evaluate(() => {
  const cf = document.querySelector('.combo-forn');
  return [cf.querySelector('textarea').value, cf.classList.contains('vazio')];
});
checa('escolheu TEXMALHA', r, ['TEXMALHA', false]);
await p.click('.lay-modulo .tec-linha .combo-forn .forn-rot');
r = await p.evaluate(() => (pickLista.querySelector('.pick-sem') || {}).textContent || '');
checa('com valor, aparece "Sem fornecedor"', r, 'Sem fornecedor');
await p.keyboard.press('Escape');

console.log('\n[5] o .ft guarda um fornecedor por tecido');
r = await p.evaluate(() => {
  const linhas = document.querySelectorAll('.lay-modulo')[0].querySelectorAll('.tec-linha .combo-forn textarea');
  linhas[1].value = 'SAGESSE TEXTIL';
  const doc = coletaEstado();
  return JSON.parse(JSON.stringify(doc));
});
checa('layout 1: dois fornecedores na ordem dos tecidos', r.layouts[0].fornecedores, ['TEXMALHA', 'SAGESSE TEXTIL']);
checa('layout 2: um, vazio', r.layouts[1].fornecedores, ['']);
const docSalvo = r;
r = await p.evaluate((doc) => {
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'teste.ft');
  const v = [...document.querySelectorAll('.lay-modulo')].map(m =>
    [...m.querySelectorAll('.combo-forn')].map(cf => [cf.querySelector('textarea').value, cf.classList.contains('vazio')]));
  /* arquivo antigo, sem o campo */
  const velho = JSON.parse(JSON.stringify(doc)); velho.layouts.forEach(L => delete L.fornecedores);
  aplicaEstado(velho, 'velho.ft');
  const v2 = [...document.querySelectorAll('.combo-forn textarea')].map(t => t.value);
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'teste.ft');
  return { v, v2 };
}, docSalvo);
checa('reabriu com os fornecedores', r.v, [[['TEXMALHA', false], ['SAGESSE TEXTIL', false]], [['', true]]]);
checa('arquivo antigo abre com fornecedor vazio', r.v2, ['', '', '']);

console.log('\n[6] so a fabrica ve: impressao');
await p.emulateMedia({ media: 'print' });
r = await p.evaluate(() => {
  window.dispatchEvent(new Event('beforeprint'));
  const vis = () => [...document.querySelectorAll('.combo-forn')].map(cf => getComputedStyle(cf).display !== 'none');
  document.body.classList.remove('sem-dinheiro');
  const comValor = vis();
  document.body.classList.add('sem-dinheiro');
  const semValor = vis();
  document.body.classList.remove('sem-dinheiro');
  return { comValor, semValor };
});
checa('folha COM valor (cliente): nenhum fornecedor', r.comValor, [false, false, false]);
checa('folha SEM valor (fabrica): so os preenchidos', r.semValor, [true, true, false]);
await p.emulateMedia({ media: 'screen' });

console.log('\n[7] so a fabrica ve: o HTML do Trello');
r = await p.evaluate(() => {
  const h = gerarHTML({});
  return { texmalha: h.includes('>TEXMALHA</textarea>'), placeholder: /placeholder="escolher"/.test(h), linhas: (h.match(/combo-forn"/g) || []).length };
});
checa('leva o fornecedor escolhido', r.texmalha, true);
checa('a linha em branco sai', [r.placeholder, r.linhas], [false, 2]);

console.log('\n[8] a pagina do cliente nunca recebe');
const py = execFileSync('python3', ['-c', `
import sys, json; sys.path.insert(0, ${JSON.stringify(DIR)})
import server
d = json.loads(sys.stdin.read())
v = server._cli_visao(d, {})
print(json.dumps(["TEXMALHA" in json.dumps(v), "contato" in json.dumps(v),
  server._id_serve("fornecedores", "tmp_x"), server._id_serve("fornecedores", "1b4e28ba-2fa1-11d2-883f-0016d3cca427"),
  "fornecedores" in server.CATEGORIAS_DO_BANCO, "fornecedores" in server.CATEGORIAS_COM_ID]))
`], { input: JSON.stringify(docSalvo), cwd: DIR }).toString().trim().split('\n').pop();
checa('pagina do cliente: sem fornecedor e sem telefone', JSON.parse(py).slice(0, 2), [false, false]);
checa('servidor: id provisorio troca, uuid fica', JSON.parse(py).slice(2, 4), [false, true]);
checa('servidor: e categoria do banco, com id', JSON.parse(py).slice(4), [true, true]);

console.log('\n[9] o Banco: cadastrar, o que fornece, renomear, apagar');
/* renomear e apagar sao do admin, como no resto do Banco */
await p.evaluate(() => { FT_SYNC.ehAdmin = true; FT_SYNC.remocoes = {}; });
await p.click('.ft-rail-bt[data-sec="banco"]');
await p.waitForTimeout(200);
await p.click('.bd-lat-bt[data-cat="fornecedores"]');
await p.fill('#fornNovo', 'tecelagem modelo');
await p.click('#fornAdd');
await p.waitForTimeout(100);
r = await p.evaluate(() => ({ tem: !!DB.fornecedores.find(f => f.n === 'TECELAGEM MODELO'), menu: FORN_NOMES.includes('TECELAGEM MODELO'),
  aberto: (document.querySelector('.forn-ficha h1') || {}).textContent }));
checa('cadastrou, em maiusculas, e ja no menu do orcamento', [r.tem, r.menu], [true, true]);
checa('a ficha abriu nele', r.aberto, 'TECELAGEM MODELO');
await p.fill('#forn_cidade', 'Goiania');
await p.dispatchEvent('#forn_cidade', 'change');
await p.fill('#forn_zap', '62999998888');
await p.dispatchEvent('#forn_zap', 'change');
r = await p.evaluate(() => { const f = DB.fornecedores.find(f => f.n === 'TECELAGEM MODELO'); return [f.cidade, f.zap]; });
checa('campos gravam, telefone formatado', r, ['Goiania', '(62) 99999-8888']);
await p.click('#fornTec');
await p.fill('#pickMenu input', 'POLIAMIDA SPEED');
await p.click('#pickMenu .pick-item:not(.pick-novo)');
await p.click('#fornCor');
await p.fill('#pickMenu input', 'Preto');
await p.click('#pickMenu .pick-item:not(.pick-novo)');
await p.click('#fornTecAdd');
await p.waitForTimeout(100);
r = await p.evaluate(() => ({ fornece: DB.fornecedores.find(f => f.n === 'TECELAGEM MODELO').fornece, chips: document.querySelectorAll('.forn-chip').length }));
checa('o que fornece registrou tecido e cor', r.fornece[0] && r.fornece[0].t, 'POLIAMIDA SPEED');
checa('e virou etiqueta na ficha', r.chips, 1);
r = await p.evaluate(() => {
  const f = DB.fornecedores.find(f => f.n === 'TECELAGEM MODELO');
  const inp = document.getElementById('forn_n'); inp.value = 'TECELAGEM NOVA';
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return [!!DB.fornecedores.find(x => x.n === 'TECELAGEM NOVA'), !!DB.fornecedores.find(x => x.n === 'TECELAGEM MODELO'), FORN_NOMES.includes('TECELAGEM NOVA'), f.fornece.length];
});
checa('renomear troca o nome sem duplicar', r, [true, false, true, 1]);
await p.click('#fornApagar');
await p.waitForTimeout(150);
await p.evaluate(() => [...document.querySelectorAll('#ftStatusFundo button')].find(x => /^apagar$/i.test(x.textContent.trim())).click());
await p.waitForTimeout(250);
r = await p.evaluate(() => [!!DB.fornecedores.find(x => x.n === 'TECELAGEM NOVA'), FORN_NOMES.includes('TECELAGEM NOVA'), fornApagados().has('TECELAGEM NOVA'),
  (FT_SYNC.remocoes.fornecedores || []).includes('TECELAGEM NOVA')]);
checa('apagar tira do banco e do menu, marca para o servidor, nao replanta', r, [false, false, true, true]);
await p.evaluate(() => fornDesmarcaApagado('TECELAGEM NOVA'));

console.log('\n[10] o telefone no cabecalho');
await p.click('.ft-rail-bt[data-sec="orcamento"]');
await p.waitForTimeout(200);
r = await p.evaluate(() => {
  const rot = [...document.querySelectorAll('.doc-header .hd-label')].map(x => x.textContent);
  const v = { cpf: '08.528.821/0001-07', contato: '(62) 99999-8888' };
  const cabe = {};
  for (const k in v) { const i = document.querySelector(`[data-h="${k}"]`); i.value = v[k]; cabe[k] = i.scrollWidth <= i.clientWidth; }
  const logo = document.querySelector('.doc-header [class*="cnpj"]');
  return { rot: rot.slice(1, 4), cabe, logo: logo ? logo.scrollWidth <= logo.clientWidth : null, oculto: document.querySelectorAll('.hd-oculto[data-h="contato"]').length };
});
checa('CPF/CNPJ e Telefone lado a lado', r.rot, ['Cliente', 'CPF/CNPJ', 'Telefone']);
checa('CNPJ e celular inteiros', r.cabe, { cpf: true, contato: true });
checa('o CNPJ da Fourtime embaixo da logo inteiro', r.logo, true);
checa('o campo escondido saiu (um contato so)', r.oculto, 0);
r = await p.evaluate(() => {
  DB.clientes = DB.clientes || [];
  DB.clientes.push({ id: 'tmp_a', n: 'CLIENTE TESTE A', doc: '11.222.333/0001-81', zap: '62988887777', fone: '', email: 'a@a.com' });
  DB.clientes.push({ id: 'tmp_b', n: 'CLIENTE TESTE B', doc: '', zap: '', fone: '6232221100', email: 'b@b.com' });
  DB.clientes.push({ id: 'tmp_c', n: 'CLIENTE TESTE C', doc: '', zap: '', fone: '', email: 'c@c.com' });
  const cli = document.querySelector('[data-h="cliente"]'), tel = document.querySelector('[data-h="contato"]');
  const poe = n => { cli.value = n; cli.dispatchEvent(new Event('input', { bubbles: true })); return tel.value; };
  tel.value = '';
  const a = poe('CLIENTE TESTE A'), bb = poe('CLIENTE TESTE B'), c = poe('CLIENTE TESTE C');
  tel.value = '(62) 3000-0000'; tel.dispatchEvent(new Event('input', { bubbles: true }));
  const manual = poe('CLIENTE TESTE A');
  DB.clientes = DB.clientes.filter(x => !/^tmp_[abc]$/.test(x.id));
  return [a, bb, c, manual];
});
checa('WhatsApp; senao Telefone; sem telefone limpa o automatico; manual fica', r,
  ['(62) 98888-7777', '(62) 3222-1100', '', '(62) 3000-0000']);
r = await p.evaluate(() => {
  const t = document.querySelector('[data-h="contato"]');
  t.value = ''; t.focus();
  return null;
});
await p.focus('[data-h="contato"]');
await p.keyboard.type('62999991234');
r = await p.evaluate(() => document.querySelector('[data-h="contato"]').value);
checa('mascara ao digitar', r, '(62) 99999-1234');
await p.fill('[data-h="contato"]', '');
await p.focus('[data-h="contato"]');
await p.keyboard.type('a@b.com');
r = await p.evaluate(() => document.querySelector('[data-h="contato"]').value);
checa('e-mail antigo no campo nao e mexido', r, 'a@b.com');

await b.close();
console.log(falhas.length ? `\n${falhas.length} FALHA(S): ${falhas.join(' | ')}` : '\nTUDO CERTO');
process.exit(falhas.length ? 1 : 0);
