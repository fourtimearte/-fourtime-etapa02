/* Teste do editor v3.258 num navegador de verdade (Chromium).
   Verifica as três peças novas do lado do editor:
     · o id provisório não vai para o servidor
     · rascunho ("NOVO CLIENTE") não vai para o servidor
     · o id do bug é estável — inclusive entre máquinas diferentes
   Regra da casa: medir, não supor. */
import { abreNavegador } from './ft_navegador.mjs';
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const falhas = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${rotulo.padEnd(50)} obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
  if (!ok) falhas.push(rotulo);
}

// a versão do @playwright/test do container não bate com o pino do npm local:
// aponto para o Chromium que já está instalado em vez de baixar outro
const browser = await abreNavegador();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v258.html').href);
await page.waitForTimeout(2500);

console.log('\n=== 0. O EDITOR CARREGA SEM ERRO ===');
checa('versão publicada', await page.evaluate(() => FT_EDITOR), '3.258');
checa('nenhum erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 5).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. O ID PROVISÓRIO NÃO VAI PARA O SERVIDOR ===');
const r1 = await page.evaluate(() => {
  DB.clientes = [
    { n: 'CLIENTE REAL', id: 'tmp_abc', doc: '111' },
    { n: 'JÁ BATIZADO', id: '550e8400-e29b-41d4-a716-446655440000', doc: '222' },
  ];
  const env = ftDadosParaEnviar();
  return {
    quantos: env.clientes.length,
    tmpTemId: 'id' in env.clientes[0],
    uuidPreservado: env.clientes[1].id,
    docPreservado: env.clientes[0].doc,
    dbLocalIntacto: DB.clientes[0].id,   // o tmp continua aqui, para a tela
  };
});
checa('os dois cadastros sobem', r1.quantos, 2);
checa('o tmp_ foi removido do envio', r1.tmpTemId, false);
checa('o uuid do servidor é preservado', r1.uuidPreservado, '550e8400-e29b-41d4-a716-446655440000');
checa('os dados do cadastro seguem junto', r1.docPreservado, '111');
checa('mas o tmp_ continua no DB local', r1.dbLocalIntacto, 'tmp_abc');

console.log('\n=== 2. RASCUNHO NÃO VAI PARA O SERVIDOR ===');
const r2 = await page.evaluate(() => {
  DB.clientes = [
    { n: 'NOVO CLIENTE', id: 'tmp_1' },
    { n: '', id: 'tmp_2' },
    { n: '   ', id: 'tmp_3' },
    { n: 'CLIENTE DE VERDADE', id: 'tmp_4' },
  ];
  const env = ftDadosParaEnviar();
  return { sobem: env.clientes.map(c => c.n), localAinda: DB.clientes.length };
});
checa('só o cadastro nomeado sobe', r2.sobem, ['CLIENTE DE VERDADE']);
checa('os rascunhos continuam na máquina', r2.localAinda, 4);

console.log('\n=== 3. O ID DO BUG É ESTÁVEL ===');
const r3 = await page.evaluate(() => {
  const antigo = { quando: '14/07/2026 15:11', quem: 'DANI', texto: 'CONCERTAR ROLAGEM', versao: '3.131' };
  DB.bugs = [Object.assign({}, antigo)];
  bugNormaliza();
  const id1 = DB.bugs[0].id;
  // segunda leitura (o editor normaliza toda vez que lê o banco)
  bugNormaliza();
  const id2 = DB.bugs[0].id;
  // agora marcado como concertado — o id NÃO pode mudar
  DB.bugs[0].feito = true; DB.bugs[0].versaoFeito = '3.258'; DB.bugs[0].feitoEm = '2026-08-02';
  bugNormaliza();
  const id3 = DB.bugs[0].id;
  // "outra máquina": mesmo relato, objeto novo, do zero
  DB.bugs = [Object.assign({}, antigo)];
  bugNormaliza();
  const idOutraMaquina = DB.bugs[0].id;
  // relato diferente tem que dar id diferente
  DB.bugs = [Object.assign({}, antigo, { texto: 'OUTRO PROBLEMA' })];
  bugNormaliza();
  const idOutro = DB.bugs[0].id;
  return { id1, estavel: id1 === id2, sobreviveAoConserto: id1 === id3, idOutraMaquina, idOutro };
});
checa('ganhou id', r3.id1.length > 3, true);
checa('id não muda ao reler', r3.estavel, true);
checa('id não muda ao marcar concertado', r3.sobreviveAoConserto, true);
checa('outra máquina chega ao MESMO id', r3.idOutraMaquina, r3.id1);
checa('relato diferente tem id diferente', r3.idOutro !== r3.id1, true);

console.log('\n=== 4. BUG NOVO NASCE COM ID SORTEADO ===');
const r4 = await page.evaluate(() => {
  const a = bugNovoId(), b = bugNovoId();
  return { temPrefixo: a[0] === 'b', diferentes: a !== b, tamanho: a.length > 8 };
});
checa('prefixo b', r4.temPrefixo, true);
checa('dois sorteios diferem', r4.diferentes, true);
checa('tem tamanho razoável', r4.tamanho, true);

console.log('\n=== 5. O CABEÇALHO DO ORÇAMENTO CONTINUA ACHANDO O CLIENTE ===');
const r5 = await page.evaluate(() => {
  DB.clientes = [
    { n: 'ESCOLA MODELO', id: '550e8400-e29b-41d4-a716-446655440001', doc: '12.345.678/0001-90', zap: '71999990000', rua: 'Rua A', num: '10', cidade: 'Salvador', uf: 'BA' },
  ];
  if (typeof sincClientes === 'function') sincClientes();
  const c = (typeof achaCliente === 'function') ? achaCliente('ESCOLA MODELO') : null;
  return {
    achou: !!c,
    doc: c ? clienteDoc(c) : null,
    nome: c ? clienteNome(c) : null,
    endereco: c ? clienteEnd(c) : null,
    achaMinusculo: !!(typeof achaCliente === 'function' && achaCliente('escola modelo')),
  };
});
checa('acha o cliente pelo nome', r5.achou, true);
checa('acha ignorando maiúscula', r5.achaMinusculo, true);
checa('puxa o CPF/CNPJ', r5.doc, '12.345.678/0001-90');
checa('puxa o nome', r5.nome, 'ESCOLA MODELO');
// separador é ' · ' (conferido em clienteEnd) — a asserção é que estava errada
checa('monta o endereço', r5.endereco, 'Rua A, 10 · Salvador/BA');

console.log('\n=== 6. A LISTA DE CLIENTES CONTINUA FUNCIONANDO ===');
const r6 = await page.evaluate(() => {
  DB.clientes = [{ n: 'B EMPRESA' }, { n: 'A EMPRESA' }];
  normalizaClientes();
  const ids = DB.clientes.map(c => c.id);
  return {
    todosTemId: ids.every(i => i && i.length > 3),
    todosProvisorios: ids.every(i => i.startsWith('tmp_')),
    idsUnicos: new Set(ids).size,
    camposCompletos: Object.keys(DB.clientes[0]).length,
  };
});
checa('normalizar dá id a todos', r6.todosTemId, true);
checa('e todos são provisórios', r6.todosProvisorios, true);
checa('sem id repetido', r6.idsUnicos, 2);
checa('os 14 campos existem (13 + id)', r6.camposCompletos, 14);

console.log('\n' + '='.repeat(60));
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}: ${falhas.join(' | ')}`); process.exit(1); }
console.log('TODOS OS TESTES DO EDITOR PASSARAM');
