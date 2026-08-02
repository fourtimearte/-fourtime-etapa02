/* Teste do preenchimento automático (v3.260) num navegador de verdade.

   As APIs são simuladas — mas com os NOMES DE CAMPO exatos que a medição no
   navegador do usuário devolveu em 02/08/2026. O que se testa aqui é o nosso
   código: a cadeia de provedores, a validação, e a regra de nunca sobrescrever.
*/
import { abreNavegador } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const falhas = [];
function checa(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${rotulo.padEnd(52)} obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
  if (!ok) falhas.push(rotulo);
}

const browser = await abreNavegador();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(DIR+'fourtime-editor-v260.html').href);
await page.waitForTimeout(2500);

// ---- dublê das APIs, com os campos reais medidos ----
await page.evaluate(() => {
  window.__chamadas = [];
  window.__respostas = {};
  window.fetch = async (url) => {
    window.__chamadas.push(String(url));
    const r = window.__respostas[Object.keys(window.__respostas).find(k => String(url).includes(k))];
    if (!r) return { ok: false, status: 404, json: async () => ({}) };
    if (r.demora) await new Promise(s => setTimeout(s, r.demora));
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.corpo };
  };
  // abre a seção de clientes com uma ficha em branco
  window.__ficha = (dados) => {
    DB.clientes = [Object.assign({ id: 'x1', n: '', resp: '', doc: '', cep: '', rua: '',
      num: '', bairro: '', cidade: '', uf: '', email: '', zap: '', insta: '', fone: '' }, dados || {})];
    CLI_SEL = 'x1';
    const pg = document.getElementById('cliPage');
    if (pg) { pg.hidden = false; }
    cliFicha();
  };
  window.__digita = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.__campo = k => (DB.clientes[0] || {})[k];
  window.__dica = k => { const d = document.getElementById('dica_' + k); return d ? d.textContent : null; };
});

console.log('\n=== 0. O EDITOR CARREGA ===');
checa('versão', await page.evaluate(() => FT_EDITOR), '3.260');
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 3).forEach(e => console.log('     ! ' + e));

const CEP_OK = { corpo: { cep: '01310100', state: 'SP', city: 'São Paulo',
                          neighborhood: 'Bela Vista', street: 'Avenida Paulista', service: 'x' } };

console.log('\n=== 1. CEP PREENCHE O ENDEREÇO ===');
let r = await page.evaluate(async (resp) => {
  window.__respostas = { 'brasilapi.com.br/api/cep': resp };
  window.__ficha();
  window.__digita('cli_cep', '01310100');
  await new Promise(s => setTimeout(s, 400));
  return { rua: __campo('rua'), bairro: __campo('bairro'), cidade: __campo('cidade'),
           uf: __campo('uf'), cep: __campo('cep'), dica: __dica('cep'),
           foco: document.activeElement && document.activeElement.id };
}, CEP_OK);
checa('rua', r.rua, 'Avenida Paulista');
checa('bairro', r.bairro, 'Bela Vista');
checa('cidade', r.cidade, 'São Paulo');
checa('uf', r.uf, 'SP');
checa('CEP formatado', r.cep, '01310-100');
checa('avisa o que fez', r.dica, 'preenchi 4 campos');
checa('cursor pula para o número', r.foco, 'cli_num');

console.log('\n=== 2. NÃO SOBRESCREVE O QUE JÁ FOI DIGITADO ===');
r = await page.evaluate(async (resp) => {
  window.__respostas = { 'brasilapi.com.br/api/cep': resp };
  window.__ficha({ rua: 'MINHA RUA À MÃO', cidade: 'CIDADE QUE EU PUS' });
  window.__digita('cli_cep', '01310100');
  await new Promise(s => setTimeout(s, 400));
  return { rua: __campo('rua'), cidade: __campo('cidade'), bairro: __campo('bairro'),
           uf: __campo('uf'), dica: __dica('cep') };
}, CEP_OK);
checa('a rua digitada fica', r.rua, 'MINHA RUA À MÃO');
checa('a cidade digitada fica', r.cidade, 'CIDADE QUE EU PUS');
checa('mas o vazio é preenchido', r.bairro, 'Bela Vista');
checa('  e a UF também', r.uf, 'SP');
checa('a contagem é honesta', r.dica, 'preenchi 2 campos');

console.log('\n=== 3. CEP QUE NÃO EXISTE — 200 COM CAMPOS VAZIOS ===');
// medido: o CEP 99999999 devolve HTTP 200, não 404. Confiar no status encheria
// a ficha de lixo em silêncio.
r = await page.evaluate(async () => {
  const vazio = { corpo: { cep: '99999999', state: '', city: '', neighborhood: '', street: '' } };
  window.__respostas = { 'brasilapi.com.br/api/cep': vazio, 'opencep.com': vazio,
                         'viacep.com.br': { corpo: { erro: true } } };
  window.__ficha();
  window.__digita('cli_cep', '99999999');
  await new Promise(s => setTimeout(s, 500));
  return { rua: __campo('rua'), cidade: __campo('cidade'), uf: __campo('uf'), dica: __dica('cep') };
});
checa('não preencheu rua', r.rua, '');
checa('não preencheu cidade', r.cidade, '');
checa('não preencheu uf', r.uf, '');
checa('e avisou', r.dica, 'não encontrei esse CEP — preencha à mão');

console.log('\n=== 4. RESPOSTA DE OUTRO CEP É RECUSADA ===');
r = await page.evaluate(async () => {
  const trocado = { corpo: { cep: '99000000', state: 'RS', city: 'Passo Fundo',
                             neighborhood: 'Centro', street: 'Rua X' } };
  window.__respostas = { 'brasilapi.com.br/api/cep': trocado, 'opencep.com': trocado,
                         'viacep.com.br': { corpo: { erro: true } } };
  window.__ficha();
  window.__digita('cli_cep', '99999999');
  await new Promise(s => setTimeout(s, 500));
  return { cidade: __campo('cidade'), dica: __dica('cep') };
});
checa('não aceita endereço de outro CEP', r.cidade, '');
checa('  e avisa', r.dica, 'não encontrei esse CEP — preencha à mão');

console.log('\n=== 5. UF INVENTADA É RECUSADA ===');
r = await page.evaluate(async () => {
  const mau = { corpo: { cep: '01310100', state: 'XX', city: 'Nárnia', neighborhood: '', street: '' } };
  window.__respostas = { 'brasilapi.com.br/api/cep': mau, 'opencep.com': mau,
                         'viacep.com.br': { corpo: { erro: true } } };
  window.__ficha();
  window.__digita('cli_cep', '01310100');
  await new Promise(s => setTimeout(s, 500));
  return { cidade: __campo('cidade'), uf: __campo('uf') };
});
checa('UF fora das 27 é descartada', r.uf, '');
checa('  e a cidade junto', r.cidade, '');

console.log('\n=== 6. A CADEIA DE PROVEDORES FUNCIONA ===');
r = await page.evaluate(async () => {
  window.__respostas = {
    'brasilapi.com.br/api/cep': { ok: false, status: 500, corpo: {} },   // 1ª fora do ar
    'opencep.com': { corpo: { cep: '01310100', logradouro: 'Avenida Paulista',
                              bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' } },
  };
  window.__chamadas = [];
  window.__ficha();
  window.__digita('cli_cep', '01310100');
  await new Promise(s => setTimeout(s, 600));
  return { cidade: __campo('cidade'), rua: __campo('rua'), chamadas: window.__chamadas.length };
});
checa('a 2ª opção salvou (nomes de campo diferentes)', r.cidade, 'São Paulo');
checa('  e traduziu logradouro -> rua', r.rua, 'Avenida Paulista');
checa('  tentou as duas', r.chamadas, 2);

r = await page.evaluate(async () => {
  window.__respostas = {
    'brasilapi.com.br/api/cep': { ok: false, status: 500, corpo: {} },
    'opencep.com': { ok: false, status: 500, corpo: {} },
    'viacep.com.br': { corpo: { cep: '01310-100', logradouro: 'Avenida Paulista',
                                bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' } },
  };
  window.__ficha();
  window.__digita('cli_cep', '01310100');
  await new Promise(s => setTimeout(s, 700));
  return { cidade: __campo('cidade') };
});
checa('a 3ª também (e com CEP com hífen)', r.cidade, 'São Paulo');

const CNPJ = { corpo: {
  razao_social: 'PETROLEO BRASILEIRO S A PETROBRAS', nome_fantasia: 'PETROBRAS',
  cep: '20031170', descricao_tipo_de_logradouro: 'AVENIDA', logradouro: 'REPUBLICA DO CHILE',
  numero: '65', bairro: 'CENTRO', municipio: 'RIO DE JANEIRO', uf: 'RJ',
  email: 'Contato@Petrobras.com.BR', ddd_telefone_1: '2132242040',
  descricao_situacao_cadastral: 'ATIVA' } };

console.log('\n=== 7. CNPJ PREENCHE O CADASTRO INTEIRO ===');
r = await page.evaluate(async (resp) => {
  window.__respostas = { 'brasilapi.com.br/api/cnpj': resp };
  window.__ficha({ n: 'NOVO CLIENTE' });
  window.__digita('cli_doc', '33000167000101');
  await new Promise(s => setTimeout(s, 500));
  return { n: __campo('n'), resp: __campo('resp'), doc: __campo('doc'), cep: __campo('cep'),
           rua: __campo('rua'), num: __campo('num'), bairro: __campo('bairro'),
           cidade: __campo('cidade'), uf: __campo('uf'), email: __campo('email'),
           fone: __campo('fone'), dica: __dica('doc') };
}, CNPJ);
checa('nome = fantasia', r.n, 'PETROBRAS');
checa('responsável = razão social', r.resp, 'PETROLEO BRASILEIRO S A PETROBRAS');
checa('CNPJ formatado', r.doc, '33.000.167/0001-01');
checa('CEP formatado', r.cep, '20031-170');
checa('rua com o tipo junto', r.rua, 'AVENIDA REPUBLICA DO CHILE');
checa('número', r.num, '65');
checa('bairro', r.bairro, 'CENTRO');
checa('cidade', r.cidade, 'RIO DE JANEIRO');
checa('uf', r.uf, 'RJ');
checa('e-mail em minúsculas', r.email, 'contato@petrobras.com.br');
checa('telefone formatado', r.fone, '(21) 3224-2040');
checa('contou 10 campos', r.dica, 'preenchi 10 campos');

console.log('\n=== 8. O NOME DO VENDEDOR VENCE A RECEITA ===');
r = await page.evaluate(async (resp) => {
  window.__respostas = { 'brasilapi.com.br/api/cnpj': resp };
  window.__ficha({ n: 'POSTO DA ESQUINA' });
  window.__digita('cli_doc', '33000167000101');
  await new Promise(s => setTimeout(s, 500));
  return { n: __campo('n'), resp: __campo('resp') };
}, CNPJ);
checa('o nome digitado fica', r.n, 'POSTO DA ESQUINA');
checa('  e a razão social vai para Responsável', r.resp, 'PETROLEO BRASILEIRO S A PETROBRAS');

console.log('\n=== 9. CNPJ BAIXADO AVISA ===');
r = await page.evaluate(async (resp) => {
  const baixado = { corpo: Object.assign({}, resp.corpo, { descricao_situacao_cadastral: 'BAIXADA' }) };
  window.__respostas = { 'brasilapi.com.br/api/cnpj': baixado };
  window.__ficha();
  window.__digita('cli_doc', '33000167000101');
  await new Promise(s => setTimeout(s, 500));
  return __dica('doc');
}, CNPJ);
checa('avisa a situação', r.includes('ATENÇÃO') && r.includes('BAIXADA'), true);

console.log('\n=== 10. CPF NÃO CONSULTA (e nem deveria) ===');
r = await page.evaluate(async () => {
  window.__respostas = {}; window.__chamadas = [];
  window.__ficha();
  window.__digita('cli_doc', '12345678909');
  await new Promise(s => setTimeout(s, 300));
  return { doc: __campo('doc'), dica: __dica('doc'), chamadas: window.__chamadas.length };
});
checa('CPF formatado', r.doc, '123.456.789-09');
checa('nenhuma consulta disparada', r.chamadas, 0);
checa('e explica', r.dica, 'CPF não tem consulta pública — preencha o resto à mão');

console.log('\n=== 11. TROCAR DE FICHA NO MEIO DESCARTA A RESPOSTA ===');
// sem isto, o endereço de um cliente cairia na ficha de outro
r = await page.evaluate(async (resp) => {
  window.__respostas = { 'brasilapi.com.br/api/cep': Object.assign({ demora: 500 }, resp) };
  DB.clientes = [
    { id: 'a1', n: 'CLIENTE A', cep: '', rua: '', bairro: '', cidade: '', uf: '', num: '' },
    { id: 'b2', n: 'CLIENTE B', cep: '', rua: '', bairro: '', cidade: '', uf: '', num: '' }];
  CLI_SEL = 'a1'; cliFicha();
  window.__digita('cli_cep', '01310100');
  await new Promise(s => setTimeout(s, 100));
  CLI_SEL = 'b2'; cliFicha();                    // troca antes de a resposta chegar
  await new Promise(s => setTimeout(s, 900));
  return { a: DB.clientes[0].rua, b: DB.clientes[1].rua };
}, CEP_OK);
checa('não escreveu no cliente A', r.a, '');
checa('nem vazou para o cliente B', r.b, '');

console.log('\n=== 12. NÃO CONSULTA DUAS VEZES O MESMO ===');
r = await page.evaluate(async (resp) => {
  window.__respostas = { 'brasilapi.com.br/api/cep': resp };
  window.__ficha();
  window.__chamadas = [];
  window.__digita('cli_cep', '01310100');
  await new Promise(s => setTimeout(s, 300));
  document.getElementById('cli_cep').dispatchEvent(new Event('blur'));
  await new Promise(s => setTimeout(s, 300));
  return window.__chamadas.length;
}, CEP_OK);
checa('uma consulta só', r, 1);

console.log('\n=== 13. SEM INTERNET, FALHA EM SILÊNCIO ÚTIL ===');
r = await page.evaluate(async () => {
  window.fetch = async () => { throw new TypeError('Failed to fetch'); };
  window.__ficha();
  window.__digita('cli_cep', '01310100');
  await new Promise(s => setTimeout(s, 600));
  return { cidade: __campo('cidade'), cep: __campo('cep'), dica: __dica('cep') };
});
checa('nada quebrou', r.cidade, '');
checa('o CEP digitado foi guardado assim mesmo', r.cep, '01310-100');
checa('e explica sem travar', r.dica, 'não encontrei esse CEP — preencha à mão');

console.log('\n' + '='.repeat(60));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.260: TODOS OS TESTES PASSARAM');
