/* APAGAR E RENOMEAR UMA REFERÊNCIA NO BANCO (v3.333)

   A lista de referências era a única do Banco sem as duas coisas que
   todas as outras tinham: um campo para corrigir o nome e um X para
   apagar. Ela nasceu na v3.301 já agrupada, com a linha inteira virando
   o botão que abre a ficha de material, e os dois controles nunca
   entraram. Um cadastro errado só saía de lá editando o arquivo do banco
   à mão.

   O que este teste defende, acima de tudo, é a FICHA DE MATERIAL. Ela é
   indexada pelo TEXTO da referência, então as duas operações mexem em
   duas listas ao mesmo tempo:

     apagar sem levar a ficha   = lixo órfão, que volta a valer sozinho
                                  se alguém recadastrar o mesmo texto
     renomear sem levar a ficha = a ficha fica presa a um nome que não
                                  existe mais, e a referência renomeada
                                  aparece como "sem ficha"

   E as duas precisam marcar remoção no servidor: sem a marca, a
   mesclagem devolve o que foi apagado na próxima sincronização. */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(56)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const erros = [];
p.on('pageerror', e => erros.push(String(e).slice(0, 180)));
await p.goto(pathToFileURL(DIR + (process.env.FT_ARQ || editorAtual())).href);
await esperaPronto(p);

/* um cenário próprio, para não depender do cadastro de verdade */
const REF_A = 'FT-010-901M — CAMISETA DE TESTE';
const REF_B = 'FT-010-902M — CAMISETA COM FICHA';
const REF_C = 'FT-010-903M — CAMISETA VIZINHA';

const abre = () => p.evaluate(async ([A, B, C]) => {
  DB.referencias = DB.referencias.filter(v => !/90[123]/.test(String(v)));
  DB.referencias.push(A, B, C);
  DB.fichas = (DB.fichas || []).filter(f => !/90[123]/.test(String(f.n)));
  DB.fichas.push({ n: B, esc: 6, tec: [{ nome: 'PV ANTIPILING', parte: 'Corpo', base: 1, aj: {} }],
                   avi: [{ nome: 'Linha', qtd: 100, uni: 'm' }] });
  FT_SYNC.remocoes = {};
  /* apagar e renomear são privilégio de admin, como no resto do Banco:
     sem isto o editor recusa e o teste mede a recusa, não a função */
  FT_SYNC.ehAdmin = true;
  document.querySelector('.ft-rail-bt[data-sec="banco"]').click();
  await new Promise(s => setTimeout(s, 600));
  bdCat = 'referencias'; bdBusca = ''; _bdRefAbertos = new Set(['010']);
  bdRender();
  await new Promise(s => setTimeout(s, 300));
}, [REF_A, REF_B, REF_C]);

const linha = (txt) => p.evaluate(txt =>
  document.querySelector('#bdPage .bd-rf[data-ref="' + txt.replace(/"/g, '\\"') + '"]') ? true : false, txt);

await abre();

console.log('\n=== 1. OS DOIS BOTOES EXISTEM EM TODA LINHA ===');
let r = await p.evaluate(() => {
  const pg = document.getElementById('bdPage');
  const linhas = [...pg.querySelectorAll('.bd-rf')];
  return { linhas: linhas.length,
    comEditar: linhas.filter(l => l.querySelector('.bd-rf-ed-bt')).length,
    comApagar: linhas.filter(l => l.querySelector('.bd-rf-del')).length,
    /* e o botão de abrir a ficha continua funcionando ao lado deles */
    comCabecalho: linhas.filter(l => l.querySelector('.bd-rf-cab')).length };
});
console.log('     ' + JSON.stringify(r));
checa('toda referência tem o botão de renomear', r.comEditar, r.linhas);
checa('  e o de apagar', r.comApagar, r.linhas);
checa('  sem perder o de abrir a ficha', r.comCabecalho, r.linhas);
checa('e há linhas de verdade para conferir', r.linhas > 3, true);

console.log('\n=== 2. ABRIR A FICHA CONTINUA FUNCIONANDO ===');
/* os botões novos entraram DENTRO da linha que era o botão de abrir: se
   a estrutura tivesse quebrado, o clique cairia no lugar errado */
r = await p.evaluate(async B => {
  document.querySelector('.bd-rf[data-ref="' + B + '"] .bd-rf-cab').click();
  await new Promise(s => setTimeout(s, 250));
  const l = document.querySelector('.bd-rf[data-ref="' + B + '"]');
  return { aberta: l.classList.contains('aberto'), temFicha: !!l.querySelector('.bd-ficha') };
}, REF_B);
console.log('     ' + JSON.stringify(r));
checa('clicar na linha ainda abre a ficha', [r.aberta, r.temFicha], [true, true]);

console.log('\n=== 3. APAGAR UMA REFERENCIA SEM FICHA ===');
r = await p.evaluate(async A => {
  document.querySelector('.bd-rf[data-ref="' + A + '"] .bd-rf-del').click();
  await new Promise(s => setTimeout(s, 400));
  return { existe: DB.referencias.includes(A),
    naTela: !!document.querySelector('.bd-rf[data-ref="' + A + '"]'),
    /* sem esta marca, a mesclagem do servidor devolve o item apagado */
    marcou: (FT_SYNC.remocoes.referencias || []).includes(A.toUpperCase()) };
}, REF_A);
console.log('     ' + JSON.stringify(r));
checa('sem ficha, apaga direto', r.existe, false);
checa('  e some da tela', r.naTela, false);
checa('  marcando a remoção para o servidor', r.marcou, true);

console.log('\n=== 4. APAGAR UMA REFERENCIA COM FICHA PERGUNTA ANTES ===');
r = await p.evaluate(async B => {
  document.querySelector('.bd-rf[data-ref="' + B + '"] .bd-rf-del').click();
  await new Promise(s => setTimeout(s, 350));
  const fundo = document.getElementById('ftStatusFundo');
  const txt = fundo ? fundo.textContent : '';
  return { perguntou: !!(fundo && fundo.classList.contains('on')),
    falaDaFicha: /ficha de material/i.test(txt),
    /* nada foi apagado ainda: a pergunta é uma pergunta */
    aindaExiste: DB.referencias.includes(B) };
}, REF_B);
console.log('     ' + JSON.stringify(r));
checa('com ficha, pergunta antes', r.perguntou, true);
checa('  dizendo que a ficha vai junto', r.falaDaFicha, true);
checa('  e não apaga nada enquanto não responder', r.aindaExiste, true);

/* cancelar não apaga */
r = await p.evaluate(async B => {
  const fundo = document.getElementById('ftStatusFundo');
  [...fundo.querySelectorAll('button')].find(x => /cancelar/i.test(x.textContent)).click();
  await new Promise(s => setTimeout(s, 350));
  return { existe: DB.referencias.includes(B), temFicha: !!DB.fichas.find(f => f.n === B) };
}, REF_B);
console.log('     ' + JSON.stringify(r));
checa('cancelar não apaga nada', [r.existe, r.temFicha], [true, true]);

/* confirmar apaga as duas */
r = await p.evaluate(async B => {
  document.querySelector('.bd-rf[data-ref="' + B + '"] .bd-rf-del').click();
  await new Promise(s => setTimeout(s, 350));
  const fundo = document.getElementById('ftStatusFundo');
  [...fundo.querySelectorAll('button')].find(x => /apagar as duas/i.test(x.textContent)).click();
  await new Promise(s => setTimeout(s, 450));
  return { existe: DB.referencias.includes(B),
    temFicha: !!DB.fichas.find(f => f.n === B),
    marcouRef: (FT_SYNC.remocoes.referencias || []).includes(B.toUpperCase()),
    marcouFicha: (FT_SYNC.remocoes.fichas || []).includes(B.toUpperCase()) };
}, REF_B);
console.log('     ' + JSON.stringify(r));
checa('confirmar apaga a referência', r.existe, false);
checa('  e a ficha de material junto', r.temFicha, false);
checa('  marcando as duas remoções para o servidor',
  [r.marcouRef, r.marcouFicha], [true, true]);

console.log('\n=== 5. RENOMEAR LEVA A FICHA JUNTO ===');
await abre();
const NOVO = 'FT-010-902M — CAMISETA RENOMEADA';
r = await p.evaluate(async ([B, NOVO]) => {
  document.querySelector('.bd-rf[data-ref="' + B + '"] .bd-rf-ed-bt').click();
  await new Promise(s => setTimeout(s, 300));
  const inp = document.getElementById('bdRefEd');
  const antes = { abriu: !!inp, valor: inp ? inp.value : '' };
  inp.value = NOVO; inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(s => setTimeout(s, 450));
  return { antes,
    velhaSumiu: !DB.referencias.includes(B),
    novaEntrou: DB.referencias.includes(NOVO),
    fichaVelha: !!DB.fichas.find(f => f.n === B),
    fichaNova: !!DB.fichas.find(f => f.n === NOVO),
    marcou: (FT_SYNC.remocoes.referencias || []).includes(B.toUpperCase()),
    /* a linha na tela mostra o selo "ficha", e não "sem ficha" */
    selo: (document.querySelector('.bd-rf[data-ref="' + NOVO + '"] .bd-rf-selo') || {}).textContent };
}, [REF_B, NOVO]);
console.log('     ' + JSON.stringify(r));
checa('o campo abre com o texto inteiro, código e nome',
  [r.antes.abriu, r.antes.valor], [true, REF_B]);
checa('renomear tira o nome velho', r.velhaSumiu, true);
checa('  e põe o novo', r.novaEntrou, true);
checa('A FICHA VAI JUNTO: não fica presa ao nome velho', r.fichaVelha, false);
checa('  e responde pelo nome novo', r.fichaNova, true);
checa('  a linha continua dizendo que tem ficha', r.selo, 'ficha');
checa('  e a remoção do nome velho foi marcada', r.marcou, true);

console.log('\n=== 6. ESC CANCELA, E NOME REPETIDO E RECUSADO ===');
await abre();
r = await p.evaluate(async ([A, C]) => {
  document.querySelector('.bd-rf[data-ref="' + A + '"] .bd-rf-ed-bt').click();
  await new Promise(s => setTimeout(s, 250));
  const inp = document.getElementById('bdRefEd');
  inp.value = 'QUALQUER OUTRA COISA'; inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise(s => setTimeout(s, 350));
  const cancelou = DB.referencias.includes(A) && !DB.referencias.includes('QUALQUER OUTRA COISA');

  /* agora tentar dar a A o nome que já é de C */
  document.querySelector('.bd-rf[data-ref="' + A + '"] .bd-rf-ed-bt').click();
  await new Promise(s => setTimeout(s, 250));
  const i2 = document.getElementById('bdRefEd');
  i2.value = C; i2.dispatchEvent(new Event('input', { bubbles: true }));
  i2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(s => setTimeout(s, 400));
  const fundo = document.getElementById('ftStatusFundo');
  const avisou = !!(fundo && fundo.classList.contains('on') && /já se chama/i.test(fundo.textContent));
  const quantos = DB.referencias.filter(v => v === C).length;
  if (fundo) { const ok = [...fundo.querySelectorAll('button')].find(x => /^ok$/i.test(x.textContent.trim())); if (ok) ok.click(); }
  return { cancelou, avisou, quantos, aindaTemA: DB.referencias.includes(A) };
}, [REF_A, REF_C]);
console.log('     ' + JSON.stringify(r));
checa('Esc cancela sem gravar', r.cancelou, true);
checa('nome repetido é recusado com o motivo à vista', r.avisou, true);
checa('  e não cria uma segunda cópia', r.quantos, 1);
checa('  deixando a referência como estava', r.aindaTemA, true);

console.log('\n=== 7. QUEM NAO E ADMIN NAO VE OS BOTOES ===');
r = await p.evaluate(async () => {
  const pg = document.getElementById('bdPage');
  const antes = getComputedStyle(pg.querySelector('.bd-rf-acoes')).display;
  const on = FT_SYNC.on, adm = FT_SYNC.ehAdmin;
  FT_SYNC.on = true; FT_SYNC.ehAdmin = false;
  bdRender();
  await new Promise(s => setTimeout(s, 300));
  const depois = getComputedStyle(document.querySelector('#bdPage .bd-rf-acoes')).display;
  FT_SYNC.on = on; FT_SYNC.ehAdmin = adm;
  bdRender();
  await new Promise(s => setTimeout(s, 250));
  return { antes, depois };
});
console.log('     ' + JSON.stringify(r));
checa('admin vê os botões', r.antes !== 'none', true);
checa('  e quem não é admin não vê', r.depois, 'none');

console.log('\n' + '='.repeat(76));
checa('nenhum erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 5).forEach(e => console.log('     ! ' + e));
await b.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('REFERÊNCIAS NO BANCO: dá para renomear e apagar, e a ficha de material vai junto');
