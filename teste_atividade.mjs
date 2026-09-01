/* O RELATORIO DE ATIVIDADE, NA TELA (v3.311)

   Este relatorio tem uma diferenca perigosa em relacao a todos os outros do
   editor: metade do dado dele e escrita a mao. O dia de cada pedido e a
   etapa em que ele esta nao vem do Drive, vem da cabeca de quem planeja a
   semana. E o botao que le o Drive de novo se chama "Atualizar".

   Por isso o teste comeca pela fusao, e nao pela aparencia:

     1. gerar de novo REESCREVE o que vem do orcamento (cliente, pecas, data
        de envio) e NAO TOCA no que foi decidido a mao. Se um dia isto
        quebrar, alguem perde a manha inteira de trabalho num clique;
     2. o que chega depois do ultimo salvamento fica marcado em dark teal, e
        a marca some no salvamento seguinte. Ela responde "o que apareceu
        desde que eu olhei", e nao "o que e recente";
     3. a leitura e incremental: o que ja foi lido e nao mudou nao e aberto
        de novo;
     4. o que sobrou da semana passada sem finalizar cai na SEGUNDA desta,
        primeiro da fila e com tarja, e entra na conta do dia;
     5. quem so olha nao arrasta nem troca etapa;
     6. arrastar muda o dia de verdade, com as tres pecas da animacao;
     7. a folha A4 pagina medindo, como o mockup 2 provou: ate 24 pedidos em
        uma folha, e nada vaza da margem.

   O servidor sobe de verdade, mas sem Drive: quem produz os dados aqui e o
   proprio teste, empurrando respostas no lugar do Drive. E o unico jeito de
   cobrar a fusao sem depender do Google. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const DIR = import.meta.dirname + '/';
const CACHE = DIR + 'fontes-cache/';
const PORTA = 9420 + (process.pid % 150);
const BASE = 'http://127.0.0.1:' + PORTA;
const S_ADMIN = '21560110';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const srv = spawn('python3', ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1',
  '--port', String(PORTA), '--log-level', 'warning'], {
  cwd: DIR,
  env: { ...process.env,
    FT_DB_PATH: join(mkdtempSync(join(tmpdir(), 'ftatv-')), 't.db'),
    FT_TOKEN: '2026@Fourtime', FT_ADMIN_TOKEN: '21560110',
    FT_DRIVE_CREDENCIAIS: '', FT_LOGIN_DESLIGADO: '',
    /* O SERVIDOR TAMBEM PRECISA SABER QUE DIA E (v3.356). A tela ja tinha
       o ATV.hojeFixo; desde que a varredura passa para a segunda de hoje
       tudo o que ficou para tras, o relogio do servidor decide o resultado
       tanto quanto o da tela. Sem fixar os dois, esta suite mediria o
       calendario da maquina: passaria hoje e falharia na semana que vem
       sem nada ter mudado. */
    FT_HOJE_FIXO: '2026-08-19' },
  stdio: ['ignore', 'pipe', 'pipe'] });
srv.stderr.on('data', d => { const t = String(d);
  if (/Error|Traceback/.test(t)) console.log('  [servidor] ' + t.slice(0, 300)); });
const morre = () => { try { srv.kill('SIGKILL'); } catch (e) {} };
process.on('exit', morre);
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(BASE + '/api/auth/eu'); if (r.status === 401 || r.ok) break; }
  catch (e) {} await new Promise(s => setTimeout(s, 250));
}

const b = await abreNavegador();
const ctx = await b.newContext({ viewport: { width: 1560, height: 1000 } });
const p = await ctx.newPage();
p.setDefaultTimeout(90000); p.setDefaultNavigationTimeout(90000);
const err = [];
p.on('pageerror', e => err.push(String(e).slice(0, 200)));

/* as fontes de verdade: a paginacao da folha e medida, e fonte errada da
   contagem errada de paginas */
await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200,
  contentType: 'text/css', body: readFileSync(CACHE + 'plex.css', 'utf8') }));
await p.route('**://fonts.gstatic.com/**', r => {
  const n = CACHE + r.request().url().split('/').pop();
  if (!existsSync(n)) return r.abort();
  r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(n) });
});

/* ---------- O DRIVE DE MENTIRA, DEPOIS DA VIRADA (v3.326) ----------

   Ele mudou de forma junto com a arquitetura, e a forma dele E o teste.

   Antes: `semanas`, um documento por semana, e uma rota que recebia a
   semana INTEIRA de volta. Bastava olhar para o mock para ver de onde
   vinham os bugs: o mesmo pedido cabia em dois documentos.

   Agora: `MES`, um indice por mes com um registro por pedido, e uma rota
   de RECADO que so aceita um campo de cada vez. Nao ha como um pedido
   estar em dois lugares, e nao ha como uma tela mandar um arquivo por
   cima do que outra escreveu -- nem de proposito.

   O `carimbo` imita o modifiedTime do Drive: e ele que a tela pergunta
   de quinze em quinze segundos, e e mudando ele na mao que se simula
   "outra maquina acabou de gravar". */
const MES = {};              /* '2026-08' -> {carimbo, pedidos:{id->reg}} */
let RECADOS = [];            /* tudo o que a tela mandou, na ordem */
let VARREDURAS = [];         /* meses varridos, para provar que o botao chama */
let LEITURAS = [];           /* meses abertos de verdade */
let RECADO_FALHA = '';       /* quando preenchido, a rota recusa */

function mesVazio(k) {
  if (!MES[k]) MES[k] = { carimbo: 'c0', versao: 0, pedidos: {} };
  return MES[k];
}
function carimbaNovo(k) {
  const m = mesVazio(k);
  m.versao++; m.carimbo = 'c' + m.versao + '-' + Math.random().toString(36).slice(2, 7);
  return m.carimbo;
}
/* O QUE O SERVIDOR FAZ COM UM RECADO. E copia da regra do server.py de
   proposito: se as duas divergirem, o teste passa e o produto quebra, e
   e melhor que a copia esteja aqui a vista do que escondida. */
function aplicaRecado(rec) {
  const m = MES[rec.mes]; if (!m) return null;
  const p = m.pedidos[rec.id]; if (!p) return null;
  if (rec.campo === 'etapa') {
    p.etapa = String(rec.valor || '');
    if (p.etapa === 'finalizado') { if (!p.concluidoEm) p.concluidoEm = p.plan || ''; }
    else p.concluidoEm = '';
  } else if (rec.campo === 'plan') {
    p.plan = String(rec.valor || '');
    p.planManual = true;
    if (p.etapa === 'finalizado') p.concluidoEm = p.plan;
    const destino = p.plan.slice(0, 7);
    if (destino !== rec.mes) {
      delete m.pedidos[rec.id];
      mesVazio(destino).pedidos[rec.id] = p;
      carimbaNovo(destino);
    }
  } else if (rec.campo === 'planManual') {
    p.planManual = !!rec.valor;
  } else {
    p[rec.campo] = rec.valor;
  }
  p.mexidoEm = new Date().toISOString();
  return p;
}

await p.route('**/api/ft/atv/mes*', async r => {
  const k = new URL(r.request().url()).searchParams.get('mes') || '';
  LEITURAS.push(k);
  const m = MES[k];
  await r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, mes: k, existe: !!m,
      carimbo: m ? m.carimbo : '', versao: m ? m.versao : 0,
      pedidos: m ? m.pedidos : {} }) });
});
await p.route('**/api/ft/atv/carimbo*', async r => {
  const lista = (new URL(r.request().url()).searchParams.get('meses') || '').split(',');
  const carimbos = {};
  lista.filter(Boolean).forEach(k => { carimbos[k] = MES[k] ? MES[k].carimbo : ''; });
  await r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, carimbos }) });
});
await p.route('**/api/ft/atv/recado', async r => {
  if (RECADO_FALHA) {
    await r.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ detail: RECADO_FALHA }) });
    return;
  }
  const c = JSON.parse(r.request().postData() || '{}');
  const carimbos = {}; const tocados = new Set();
  (c.recados || []).forEach(rec => {
    RECADOS.push(rec);
    if (aplicaRecado(rec)) tocados.add(rec.mes);
  });
  tocados.forEach(k => { carimbos[k] = carimbaNovo(k); });
  await r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, meses: [...tocados], carimbos,
      salvoEm: new Date().toISOString() }) });
});
/* A VARREDURA. No produto ela roda no servidor; aqui a rota executa a
   LEI DAS TRES LINHAS sobre o mesmo `Drive` de mentira, porque e essa
   lei que o teste precisa cobrar: ela pode criar e atualizar campo de
   leitura, e nao pode encostar em etapa nem em plano marcado a mao. */
const DRIVE = { arquivos: [] };   /* [{id,pedido,cliente,envio,departamento,sub,per,total}] */
await p.route('**/api/ft/atv/varrer', async r => {
  const c = JSON.parse(r.request().postData() || '{}');
  VARREDURAS.push(c.mes);
  let criados = 0, atualizados = 0, sumidos = 0;
  const vistos = new Set();
  DRIVE.arquivos.forEach(it => {
    vistos.add(it.id);
    const [d, mo, a] = String(it.envio || '').split('/');
    if (!a) return;
    const entIso = a + '-' + mo.padStart(2, '0') + '-' + d.padStart(2, '0');
    let onde = null;
    Object.keys(MES).forEach(k => { if (MES[k].pedidos[it.id]) onde = onde || k; });
    if (onde) {
      const p = MES[onde].pedidos[it.id];
      const entregaVelha = p.entrega;
      p.pedido = it.pedido; p.cliente = it.cliente;
      p.departamento = it.departamento || ''; p.entrega = it.envio;
      p.sub = it.sub; p.per = it.per; p.total = it.total;
      p.sumiu = false;
      if (entregaVelha && entregaVelha !== it.envio && p.planManual)
        p.entregaMudou = entregaVelha;
      if (!p.planManual) {
        p.plan = entIso;
        const destino = entIso.slice(0, 7);
        if (destino !== onde) {
          delete MES[onde].pedidos[it.id];
          mesVazio(destino).pedidos[it.id] = p;
          carimbaNovo(destino);
        }
      }
      atualizados++;
    } else {
      mesVazio(entIso.slice(0, 7)).pedidos[it.id] = {
        id: it.id, pedido: it.pedido, cliente: it.cliente, vendedor: it.vendedor || 'Dani',
        departamento: it.departamento || '', entrega: it.envio,
        sub: it.sub, per: it.per, total: it.total,
        etapa: '', plan: entIso, planManual: false, concluidoEm: '',
        sumiu: false, entregaMudou: '', mesArq: entIso.slice(0, 7) };
      carimbaNovo(entIso.slice(0, 7));
      criados++;
    }
  });
  Object.keys(MES).forEach(k => {
    Object.values(MES[k].pedidos).forEach(p => {
      if (p.mesArq && !vistos.has(p.id) && !p.sumiu) { p.sumiu = true; sumidos++; carimbaNovo(k); }
    });
  });
  await r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, criados, atualizados, sumidos }) });
});

const SEMANA = '2026-08-17';   /* uma segunda-feira */
function pedido(n, dia, total, sub) {
  return { id: 'ID' + String(n).padStart(8, '0') + 'xx', pedido: 'PD00' + (4100 + n),
    arquivo: 'CLIENTE ' + n + '-PD00' + (4100 + n) + '.ft', cliente: 'CLIENTE ' + n,
    vendedor: 'Dani', envio: dia + '/08/2026', departamento: 'Sublimação',
    sub, per: total - sub, total };
}
/* POR AS COISAS NO DRIVE e deixar a varredura descobri-las, que e como
   funciona de verdade. Nenhum teste daqui em diante escreve direto no
   indice: o caminho e sempre Drive -> varredura -> indice -> tela. */
function poeNoDrive(lista) { DRIVE.arquivos = lista.slice(); }

const entra = async (u, senha) => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.fill('#u', u); await p.fill('#s', senha); await p.click('#bt');
  await p.waitForTimeout(900);
};
const troca = async nova => { await p.fill('#n1', nova); await p.fill('#n2', nova);
  await p.click('#bt2'); await p.waitForTimeout(1400); };

/* ESPERAR O SINAL, NUNCA O RELOGIO. A fila do salvamento automatico anda
   sozinha; perguntar "ja acabou?" e o unico jeito honesto de saber. */
const filaVazia = () => p.waitForFunction(
  () => !ATV.enviando && !ATV.fila.length, null, { timeout: 15000 }).catch(() => {});
const carregou = () => p.waitForFunction(
  () => !ATV.carregando && !ATV.varrendo, null, { timeout: 30000 }).catch(() => {});

await entra('henrique', S_ADMIN);
await troca('henrique-forte-2026');
await esperaPronto(p, null, 90000);
await p.waitForTimeout(1200);
await p.evaluate(() => document.fonts.ready);

console.log('\n=== 1. A SECAO EXISTE E E DO ADMIN ===');
let r = await p.evaluate(() => ({
  papel: FT_EU.papel,
  pode: FT_EU.pode.indexOf('atividade') >= 0,
  trilho: !document.getElementById('ftRailAtv').hidden,
  planeja: atvPodePlanejar(),
}));
console.log('     ' + JSON.stringify(r));
checa('o admin ve a Atividade no trilho', [r.pode, r.trilho], [true, true]);
checa('  e pode planejar', r.planeja, true);

await p.evaluate(s => { ATV.semana = s; ATV.hojeFixo = '2026-08-19'; }, SEMANA);
await p.click('#ftRailAtv');
await carregou();
checa('a pagina abre', await p.evaluate(() => !document.getElementById('atvPage').hidden), true);
checa('  e o orcamento sai da frente',
  await p.evaluate(() => document.querySelector('.area-paginas').style.display), 'none');

console.log('\n=== 2. O PEDIDO ENTRA SOZINHO, PELA DATA DE ENTREGA ===');
/* Nao ha mais "primeira geracao". A varredura ve o orcamento na pasta e
   cria o registro no endereco da entrega dele. A semana e o que sobra
   depois do filtro. */
poeNoDrive([pedido(1, 17, 100, 100), pedido(2, 18, 200, 0), pedido(3, 19, 150, 150),
            pedido(4, 20, 300, 0), pedido(5, 21, 80, 80), pedido(6, 22, 120, 60)]);
await p.evaluate(() => atvVarrer());
await carregou();
r = await p.evaluate(() => ({
  linhas: ATV.linhas.length,
  planos: ATV.linhas.map(l => l.plan).sort(),
  pecas: ATV.linhas.reduce((a, l) => a + l.total, 0),
  manual: ATV.linhas.filter(l => l.planManual).length,
  dep: ATV.linhas[0].departamento,
}));
console.log('     ' + JSON.stringify(r));
checa('os seis pedidos entraram sem ninguem salvar', r.linhas, 6);
checa('  cada um no dia da entrega dele', r.planos,
  ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22']);
checa('  950 pecas somadas', r.pecas, 950);
checa('  e nenhum nasce marcado a mao', r.manual, 0);
checa('  o departamento veio do cabecalho', r.dep, 'Sublimação');
/* O INDICE E MENSAL. Esta e a afirmacao que a arquitetura inteira existe
   para poder fazer: nao ha arquivo de semana, ha arquivo de mes.
   Sao DOIS meses e nao um desde a v3.356: o mes da semana aberta e o
   seguinte. O aviso de "movido para a proxima semana" e desenhado a
   partir do registro DEPOIS de ele ter rolado, e um pedido que rolou do
   fim de agosto para setembro passa a morar no arquivo de setembro. O que
   nao existe, e continua nao existindo, e arquivo de SEMANA. */
r = await p.evaluate(() => Object.keys(ATV.meses));
checa('a semana veio de indice MENSAL, nao de arquivo de semana',
  r, ['2026-08', '2026-09']);

console.log('\n=== 3. MUDAR A ETAPA MANDA UM RECADO, NAO MANDA O ARQUIVO ===');
/* O ponto da virada. Se o editor mandasse a semana inteira, duas maquinas
   se apagariam; mandando um campo de um pedido, nao ha o que atropelar. */
RECADOS.length = 0;
await p.evaluate(() => atvRecado('ID00000002xx', 'etapa', 'prensa'));
await filaVazia();
r = await p.evaluate(() => ({
  naTela: (ATV.linhas.find(l => l.id === 'ID00000002xx') || {}).etapa,
  selo: (document.querySelector('.atv-selo.salvo') || {}).textContent || '',
  temBotaoSalvar: !!document.getElementById('miAtvSalvar'),
}));
r.mandados = RECADOS.slice();
r.noIndice = MES['2026-08'].pedidos['ID00000002xx'].etapa;
console.log('     ' + JSON.stringify(r));
checa('foi UM recado so', r.mandados.length, 1);
checa('  com um campo de um pedido, e nada mais',
  [r.mandados[0].id, r.mandados[0].campo, r.mandados[0].valor],
  ['ID00000002xx', 'etapa', 'prensa']);
checa('  a tela pintou na hora', r.naTela, 'prensa');
checa('  e o indice gravou sozinho', r.noIndice, 'prensa');
checa('nao existe mais botao de salvar', r.temBotaoSalvar, false);
checa('  o selo diz que esta salvo', /^salvo/.test(r.selo), true);

console.log('\n=== 4. O CALENDARIO E O ENDERECO DO PEDIDO ===');
/* O pedido do dia 18 vai para o dia 21. Nao e "editar um campo": e mudar
   de lugar na semana, e a linha muda de cartao de dia na tela. */
RECADOS.length = 0;
const abriuCal = async id => {
  await p.evaluate(i => {
    const b = document.querySelector('.atv-cal-bt[data-id="' + i + '"]');
    b.scrollIntoView({ block: 'center' }); b.click();
  }, id);
  await p.waitForFunction(() => document.getElementById('atvCal').classList.contains('on'),
    null, { timeout: 8000 });
};
await abriuCal('ID00000002xx');
r = await p.evaluate(() => ({
  aberto: document.getElementById('atvCal').classList.contains('on'),
  dias: document.querySelectorAll('#atvCal .atv-cal-grade button').length,
  sel: (document.querySelector('#atvCal .sel') || {}).dataset,
  naSemana: document.querySelectorAll('#atvCal .nasemana').length,
  pe: (document.querySelector('#atvCal .atv-cal-pe') || {}).textContent || '',
}));
console.log('     ' + JSON.stringify({ ...r, sel: r.sel && r.sel.iso }));
checa('o calendario abre com seis semanas na grade', [r.aberto, r.dias], [true, 42]);
checa('  o dia de hoje do pedido vem marcado', r.sel.iso, '2026-08-18');
checa('  a semana aberta fica sombreada, os seis dias', r.naSemana, 6);
checa('  e o rodape diz o que a escolha faz', /em que semana/.test(r.pe), true);
await p.evaluate(() => document.querySelector('#atvCal button[data-iso="2026-08-21"]').click());
await filaVazia();
r = await p.evaluate(() => ({
  noDia: !!document.querySelector('.atv-dia[data-dia="2026-08-21"] .atv-linha[data-id="ID00000002xx"]'),
  fechou: !document.getElementById('atvCal').classList.contains('on'),
}));
r.mandados = RECADOS.map(x => x.campo + '=' + x.valor);
r.plan = MES['2026-08'].pedidos['ID00000002xx'].plan;
r.manual = MES['2026-08'].pedidos['ID00000002xx'].planManual;
console.log('     ' + JSON.stringify(r));
checa('escolher a data manda um recado de plan', r.mandados, ['plan=2026-08-21']);
checa('  o indice guardou a data nova', r.plan, '2026-08-21');
checa('  e assinou embaixo: decidido a mao', r.manual, true);
checa('  a linha esta no cartao da sexta', r.noDia, true);
checa('  e o calendario fechou sozinho', r.fechou, true);

console.log('\n=== 5. ESCOLHER PARA TRAS MOVE PARA A SEMANA PASSADA ===');
/* O caso que ele descreveu: "alguns pedidos dessa semana foram
   finalizados anteriormente". Antes nao havia onde dizer isso. */
await abriuCal('ID00000002xx');
await p.evaluate(() => {
  const b = document.querySelector('#atvCal .atv-cal-nav[data-passo="-1"]');
  if (document.querySelector('#atvCal button[data-iso="2026-08-13"]')) return;
  b.click();
});
await p.evaluate(() => document.querySelector('#atvCal button[data-iso="2026-08-13"]').click());
await filaVazia();
r = await p.evaluate(() => ({
  naSemana: ATV.linhas.some(l => l.id === 'ID00000002xx'),
  linhas: ATV.linhas.length,
}));
r.plan = MES['2026-08'].pedidos['ID00000002xx'].plan;
console.log('     ' + JSON.stringify(r));
checa('a data virou 13/08', r.plan, '2026-08-13');
checa('  e o pedido saiu desta semana', r.naSemana, false);
checa('  sobraram cinco na semana de 17', r.linhas, 5);
/* E ELE ESTA NA SEMANA DE 10 A 15, NAO EM DUAS. */
await p.evaluate(() => atvTrocaSemana(-1));
await carregou();
r = await p.evaluate(() => ({ semana: ATV.semana,
  achou: ATV.linhas.filter(l => l.id === 'ID00000002xx').length }));
checa('na semana de 10/08 ele aparece', [r.semana, r.achou], ['2026-08-10', 1]);
await p.evaluate(() => atvTrocaSemana(1));
await carregou();
/* devolve para onde estava, para as secoes seguintes acharem seis linhas */
await p.evaluate(() => atvRecado('ID00000002xx', 'plan', '2026-08-18'));
await filaVazia();

console.log('\n=== 6. FINALIZADO GRAVA QUANDO ACABOU ===');
await p.evaluate(() => atvRecado('ID00000003xx', 'etapa', 'finalizado'));
await filaVazia();
r = (x => ({ etapa: x.etapa, concluido: x.concluidoEm, plan: x.plan }))
    (MES['2026-08'].pedidos['ID00000003xx']);
console.log('     ' + JSON.stringify(r));
checa('marcar finalizado grava a conclusao sozinho', r.concluido, '2026-08-19');
checa('  no dia em que ele estava planejado', r.plan, '2026-08-19');
/* AGORA A PARTE QUE ELE PEDIU: um finalizado que na verdade acabou antes.
   Escolher a data passada e a MESMA porta, e ela move e grava de uma vez. */
await abriuCal('ID00000003xx');
r = await p.evaluate(() => (document.querySelector('#atvCal .atv-cal-pe') || {}).textContent || '');
checa('num finalizado o calendario avisa que a data e a da conclusao',
  /conclus/.test(r), true);
await p.evaluate(() => document.querySelector('#atvCal button[data-iso="2026-08-17"]').click());
await filaVazia();
r = (x => ({ plan: x.plan, concluido: x.concluidoEm, manual: x.planManual }))
    (MES['2026-08'].pedidos['ID00000003xx']);
console.log('     ' + JSON.stringify(r));
checa('escolher 17 num finalizado grava a conclusao em 17', r.concluido, '2026-08-17');
checa('  e o registra na semana do 17', r.plan, '2026-08-17');
await p.evaluate(() => atvRecado('ID00000003xx', 'etapa', ''));
await filaVazia();
checa('sair de finalizado apaga a data de conclusao',
  MES['2026-08'].pedidos['ID00000003xx'].concluidoEm, '');

console.log('\n=== 7. ATRASADO E UMA CONTA, NAO UMA ETAPA ===');
/* O erro que isto conserta: Atrasado estava na lista de etapas, e como so
   cabe uma etapa por linha, um pedido que atrasava PERDIA a informacao de
   onde estava na producao. */
r = await p.evaluate(() => ({
  noMenu: ATV_ETAPAS.some(e => e.k === 'atrasado'),
  organizarNoMenu: ATV_ETAPAS.some(e => e.k === 'organizar'),
  botoes: [...document.querySelectorAll('#atvMenuEtapa button')].map(b => b.dataset.k),
}));
checa('Atrasado nao e mais uma etapa escolhivel', r.noMenu, false);
checa('  nem Organizar, que so existia para empurrar pedido', r.organizarNoMenu, false);
checa('  e nenhum dos dois esta no menu', 
  [r.botoes.includes('atrasado'), r.botoes.includes('organizar')], [false, false]);
/* hoje e 19; o pedido do dia 17 esta vencido e o do dia 21 nao */
r = await p.evaluate(() => {
  const seg = ATV.linhas.find(l => l.id === 'ID00000001xx');
  const sex = ATV.linhas.find(l => l.id === 'ID00000005xx');
  return { hoje: ATV.hojeFixo, seg: atvAtrasado(seg), sex: atvAtrasado(sex),
    etapaSeg: seg.etapa,
    tarja: !!document.querySelector('.atv-linha[data-id="ID00000001xx"] .atv-atraso') };
});
console.log('     ' + JSON.stringify(r));
checa('com entrega em 17 e hoje 19, ele esta atrasado', r.seg, true);
checa('  a entrega em 21 nao esta', r.sex, false);
checa('  e a tarja vermelha aparece na linha', r.tarja, true);
/* A INFORMACAO NAO SE PERDE MAIS: atrasado E numa etapa ao mesmo tempo. */
await p.evaluate(() => atvRecado('ID00000001xx', 'etapa', 'costura'));
await filaVazia();
r = await p.evaluate(() => ({
  atrasado: atvAtrasado(ATV.linhas.find(l => l.id === 'ID00000001xx')),
  chip: (document.querySelector('.atv-linha[data-id="ID00000001xx"] .atv-chip span') || {}).textContent,
  tarja: !!document.querySelector('.atv-linha[data-id="ID00000001xx"] .atv-atraso'),
}));
console.log('     ' + JSON.stringify(r));
checa('um pedido atrasado pode estar em Costura', [r.atrasado, r.chip], [true, 'Costura']);
checa('  e as duas coisas aparecem juntas na linha', r.tarja, true);
/* MARCAR FINALIZADO TIRA O ATRASO, porque nao ha mais o que atrasar */
await p.evaluate(() => atvRecado('ID00000001xx', 'etapa', 'finalizado'));
await filaVazia();
checa('finalizado deixa de estar atrasado',
  await p.evaluate(() => atvAtrasado(ATV.linhas.find(l => l.id === 'ID00000001xx'))), false);
await p.evaluate(() => atvRecado('ID00000001xx', 'etapa', 'costura'));
await filaVazia();

console.log('\n=== 8. A LEI DAS TRES LINHAS: A VARREDURA NAO ENCOSTA ===');
/* O bug que gerou a sessao inteira: a varredura decidia onde o pedido
   mora. Aqui ela roda com o planejamento ja feito a mao, e nao pode
   desfazer nada. */
await p.evaluate(() => atvRecado('ID00000004xx', 'plan', '2026-08-17'));
await p.evaluate(() => atvRecado('ID00000005xx', 'etapa', 'silk'));
await filaVazia();
const antesDaVarredura = { plan4: MES['2026-08'].pedidos['ID00000004xx'].plan,
  etapa5: MES['2026-08'].pedidos['ID00000005xx'].etapa };
/* o orcamento do 4 muda de valor E de entrega no Drive */
poeNoDrive([pedido(1, 17, 100, 100), pedido(2, 18, 200, 0), pedido(3, 19, 150, 150),
            { ...pedido(4, 26, 999, 0), cliente: 'CLIENTE 4 RENOMEADO' },
            pedido(5, 21, 80, 80), pedido(6, 22, 120, 60)]);
await p.evaluate(() => atvVarrer());
await carregou();
r = (q => ({ plan: q.plan, manual: q.planManual, cliente: q.cliente, total: q.total,
    entrega: q.entrega, remarcou: q.entregaMudou,
    etapa5: MES['2026-08'].pedidos['ID00000005xx'].etapa, etapa4: q.etapa }))
    (MES['2026-08'].pedidos['ID00000004xx']);
console.log('     antes=' + JSON.stringify(antesDaVarredura) + '  ' + JSON.stringify(r));
checa('a varredura ATUALIZOU o que vem do orcamento', [r.cliente, r.total],
  ['CLIENTE 4 RENOMEADO', 999]);
checa('  e a data de entrega nova chegou', r.entrega, '26/08/2026');
checa('NAO moveu o pedido marcado a mao', r.plan, '2026-08-17');
checa('  nao encostou na etapa de ninguem', [r.etapa4, r.etapa5], ['', 'silk']);
checa('  e avisou que a entrega mudou debaixo da escolha', r.remarcou, '20/08/2026');
checa('  a tela mostra a marca de remarcado',
  await p.evaluate(() => !!document.querySelector('.atv-linha[data-id="ID00000004xx"] .atv-remarc')),
  true);
/* SEM A MARCA, ELE ACOMPANHA SOZINHO. E o outro lado da mesma regra. */
poeNoDrive([pedido(1, 17, 100, 100), pedido(2, 18, 200, 0), pedido(3, 19, 150, 150),
            { ...pedido(4, 26, 999, 0), cliente: 'CLIENTE 4 RENOMEADO' },
            pedido(5, 21, 80, 80), pedido(6, 25, 120, 60)]);
await p.evaluate(() => atvVarrer());
await carregou();
r = await p.evaluate(() => ({ naSemana: ATV.linhas.some(l => l.id === 'ID00000006xx') }));
r.plan6 = MES['2026-08'].pedidos['ID00000006xx'].plan;
console.log('     ' + JSON.stringify(r));
checa('sem marca, o planejamento acompanha a entrega nova', r.plan6, '2026-08-25');
checa('  e a linha sai desta semana sozinha', r.naSemana, false);
/* VOLTAR AO AUTOMATICO: o botao do rodape do calendario desfaz a assinatura */
await abriuCal('ID00000004xx');
r = await p.evaluate(() => !!document.getElementById('atvCalSolta'));
checa('num pedido marcado a mao o calendario oferece voltar ao automatico', r, true);
await p.evaluate(() => document.getElementById('atvCalSolta').click());
await filaVazia();
r = (q => ({ plan: q ? q.plan : '', manual: q ? q.planManual : null }))
    (MES['2026-08'].pedidos['ID00000004xx']);
console.log('     ' + JSON.stringify(r));
checa('voltar ao automatico devolve o pedido para a data de entrega', r.plan, '2026-08-26');
checa('  e apaga a assinatura', r.manual, false);

console.log('\n=== 8b. UM PEDIDO SO EXISTE UMA VEZ ===');
/* A afirmacao central. Antes o mesmo pedido cabia em dois arquivos de
   semana e os dois discordavam; foi assim que a VIAPOL ficou finalizada
   numa semana e em Costura na outra ao mesmo tempo. */
r = (() => {
  const conta = {};
  Object.values(MES).forEach(m => Object.keys(m.pedidos).forEach(id => {
    conta[id] = (conta[id] || 0) + 1; }));
  return { repetidos: Object.entries(conta).filter(([, n]) => n > 1).map(([k]) => k),
    total: Object.keys(conta).length };
})();
console.log('     ' + JSON.stringify(r));
checa('nenhum pedido aparece em dois indices', r.repetidos, []);
checa('  e os seis continuam existindo', r.total, 6);

console.log('\n=== 8c. DUAS MAQUINAS NAO SE APAGAM ===');
/* O problema que a v3.325 remendou com um aviso. Aqui ele deixa de
   existir: as duas telas mandam recados de pedidos diferentes, e o
   servidor encosta em linhas diferentes do mesmo arquivo. */
/* a outra maquina grava direto no indice, como se fosse outro navegador */
MES['2026-08'].pedidos['ID00000005xx'].etapa = 'embalagem';
MES['2026-08'].pedidos['ID00000005xx'].mexidoEm = new Date().toISOString();
carimbaNovo('2026-08');
await p.evaluate(() => atvRecado('ID00000001xx', 'etapa', 'conferencia'));
await filaVazia();
r = { meu: MES['2026-08'].pedidos['ID00000001xx'].etapa,
      dele: MES['2026-08'].pedidos['ID00000005xx'].etapa };
console.log('     ' + JSON.stringify(r));
checa('o que eu mudei ficou', r.meu, 'conferencia');
checa('  e o que a outra maquina mudou tambem', r.dele, 'embalagem');
checa('  sem nenhum aviso de conflito na tela',
  await p.evaluate(() => /Outra máquina/.test(ATV.aviso || '')), false);

console.log('\n=== 8d. O CARIMBO TRAZ O QUE A OUTRA MAQUINA FEZ ===');
/* A pergunta barata: mudou? So quando muda e que vale abrir. */
LEITURAS.length = 0;
await p.evaluate(() => atvOlhaCarimbos());
await p.waitForTimeout(500);
checa('sem mudanca, ninguem abre nada', LEITURAS.length, 0);
MES['2026-08'].pedidos['ID00000006xx'].etapa = 'calandra';
MES['2026-08'].pedidos['ID00000006xx'].plan = '2026-08-20';
carimbaNovo('2026-08');
await p.evaluate(() => atvOlhaCarimbos());
await carregou();
r = await p.evaluate(() => ({
  naTela: (ATV.linhas.find(l => l.id === 'ID00000006xx') || {}).etapa }));
r.leu = LEITURAS.length;
console.log('     ' + JSON.stringify(r));
checa('carimbo diferente: o mes e reaberto', r.leu, 1);
checa('  e o que a outra maquina fez aparece aqui', r.naTela, 'calandra');

console.log('\n=== 8e. A FILA ESPERA A REDE, E NAO PERDE NADA ===');
RECADO_FALHA = 'servidor fora do ar';
await p.evaluate(() => atvRecado('ID00000001xx', 'etapa', 'corte'));
await p.waitForFunction(() => !!ATV.erroFila, null, { timeout: 12000 }).catch(() => {});
r = await p.evaluate(() => ({
  fila: ATV.fila.length, erro: ATV.erroFila,
  naTela: (ATV.linhas.find(l => l.id === 'ID00000001xx') || {}).etapa,
  selo: (document.querySelector('.atv-selo.sujo') || {}).textContent || '',
}));
r.noIndice = MES['2026-08'].pedidos['ID00000001xx'].etapa;
console.log('     ' + JSON.stringify(r));
checa('sem rede, a mudanca fica na fila', r.fila, 1);
checa('  a tela mostra o que ela ja pintou', r.naTela, 'corte');
checa('  o servidor ainda nao sabe', r.noIndice, 'conferencia');
checa('  e o selo diz quantas esperam', /1 alteração na fila/.test(r.selo), true);
RECADO_FALHA = '';
await p.evaluate(() => atvEnviaFila());
await filaVazia();
r = await p.evaluate(() => ({ fila: ATV.fila.length, erro: ATV.erroFila }));
r.noIndice = MES['2026-08'].pedidos['ID00000001xx'].etapa;
console.log('     ' + JSON.stringify(r));
checa('a rede volta e a fila vai sozinha', [r.fila, r.erro], [0, '']);
checa('  e nada se perdeu', r.noIndice, 'corte');

console.log('\n=== 8f. UM PEDIDO QUE SAIU DA PASTA E MARCADO, NAO APAGADO ===');
poeNoDrive([pedido(1, 17, 100, 100), pedido(3, 19, 150, 150),
            { ...pedido(4, 26, 999, 0), cliente: 'CLIENTE 4 RENOMEADO' },
            pedido(5, 21, 80, 80), pedido(6, 25, 120, 60)]);
await p.evaluate(() => atvVarrer());
await carregou();
r = await p.evaluate(() => ({ naTela: ATV.linhas.some(l => l.id === 'ID00000002xx') }));
r.existe = !!MES['2026-08'].pedidos['ID00000002xx'];
r.sumiu = (MES['2026-08'].pedidos['ID00000002xx'] || {}).sumiu;
console.log('     ' + JSON.stringify(r));
checa('o registro continua gravado', r.existe, true);
checa('  com a marca de que saiu da pasta', r.sumiu, true);
checa('  e some da tela do dia a dia', r.naTela, false);

console.log('\n=== 8g. TROCAR DE SEMANA DENTRO DO MES NAO LE NADA ===');
/* Um dos ganhos que a virada dava de brinde: as quatro semanas de agosto
   sao o MESMO arquivo, entao andar entre elas ja esta na memoria. */
LEITURAS.length = 0;
await p.evaluate(() => atvTrocaSemana(-1));
await carregou();
await p.evaluate(() => atvTrocaSemana(1));
await carregou();
checa('ir e voltar dentro de agosto nao volta ao servidor', LEITURAS.length, 0);
console.log('\n=== 9. ARRASTAR MUDA O DIA ===');
/* Arrastar e a outra porta para a mesma coisa que o calendario faz: ele
   solta o MESMO recado de `plan` e ganha a MESMA marca de decidido a mao.
   Duas portas para o mesmo campo, e nao dois caminhos com regras
   diferentes, que era como o `plan` e o `herdada` brigavam antes. */
RECADOS.length = 0;
await p.evaluate(() => { document.getElementById('atvPage').scrollTop = 0; });
await p.waitForTimeout(200);
const alvoDia = '2026-08-22';
/* ROLAR E MEDIR SAO DOIS MOMENTOS. Medir no mesmo quadro em que se pede
   o scrollIntoView devolve o retangulo de ANTES da rolagem, e o ponteiro
   desce num lugar onde nao ha puxador nenhum: o arrasto nao comeca e o
   teste acusa nove falhas que nao existem. */
/* O AVISO DE SUCESSO COBRE O CANTO DA TELA, e ele e o que fica por cima
   do puxador depois de uma varredura. Sem esperar que ele saia, o
   pointerdown cai no veu do aviso e o arrasto nunca comeca: nove falhas
   sem nenhum defeito no produto. Esperar o SINAL, e nao o relogio. */
await p.waitForFunction(
  () => !document.querySelector('.ft-status-fundo.on'),
  null, { timeout: 15000 }).catch(() => {});
await p.evaluate(() => {
  const l = document.querySelector('.atv-linha[data-id="ID00000005xx"]');
  if (l) l.scrollIntoView({ block: 'center' });
});
await p.waitForTimeout(250);
const caixa = await p.evaluate(() => {
  const l = document.querySelector('.atv-linha[data-id="ID00000005xx"]');
  const a = l.querySelector('.atv-puxador').getBoundingClientRect();
  return { ax: a.x + a.width / 2, ay: a.y + a.height / 2 };
});
const planoAntes = await p.evaluate(() => ATV.linhas.find(l => l.id === 'ID00000005xx').plan);
await p.mouse.move(caixa.ax, caixa.ay);
await p.mouse.down();
await p.mouse.move(caixa.ax + 10, caixa.ay + 22, { steps: 4 });
await p.waitForTimeout(140);
const meio = await p.evaluate(() => ({
  voando: document.querySelectorAll('.atv-voando').length,
  fantasma: document.querySelectorAll('.atv-linha.fantasma').length }));
/* A MEDIDA DO DESTINO SO VALE DEPOIS DE O ARRASTO COMECAR.
   A linha original encolhe a zero ao virar fantasma, e a pagina inteira
   sobe uns 26px com ela. Um retangulo medido antes do pointerdown aponta
   para onde o dia ESTAVA, e o ponteiro cai no vao entre dois cartoes: o
   arraste simplesmente nao encontra destino nenhum. */
const alvo = await p.evaluate(d => {
  const dd = document.querySelector('.atv-dia[data-dia="' + d + '"]');
  dd.scrollIntoView({ block: 'center' });
  const r = dd.getBoundingClientRect();
  return { dx: r.x + r.width / 2, dy: Math.round(r.y + r.height - 10) };
}, alvoDia);
await p.waitForTimeout(120);
await p.mouse.move(alvo.dx, alvo.dy, { steps: 16 });
await p.waitForTimeout(250);
const buraco = await p.evaluate(() => document.querySelectorAll('.atv-buraco').length);
await p.screenshot({ path: 'shot-atv-arrasto.png' });
await p.mouse.up();
await p.waitForTimeout(900);
await filaVazia();
r = await p.evaluate(() => ({
  plano: (ATV.linhas.find(l => l.id === 'ID00000005xx') || {}).plan,
  sobrou: document.querySelectorAll('.atv-voando,.atv-linha.fantasma,.atv-buraco').length,
}));
r.recados = RECADOS.map(x => x.campo);
r.manual = MES['2026-08'].pedidos['ID00000005xx'].planManual;
r.noIndice = MES['2026-08'].pedidos['ID00000005xx'].plan;
r.etapa = MES['2026-08'].pedidos['ID00000005xx'].etapa;
console.log('     antes=' + planoAntes + '  ' + JSON.stringify(r));
checa('durante o arrasto existe o clone voando', meio.voando, 1);
checa('  a original vira fantasma', meio.fantasma, 1);
checa('  e o destino abre um buraco', buraco > 0, true);
checa('o dia mudou de verdade', r.plano, alvoDia);
checa('  arrastar solta um recado de plan, e so', r.recados, ['plan']);
checa('  gravado sem ninguem clicar em nada', r.noIndice, alvoDia);
checa('  e com a marca de decidido a mao', r.manual, true);
checa('  a etapa nao foi junto', r.etapa, 'embalagem');
checa('nada sobrou voando depois de soltar', r.sobrou, 0);

console.log('\n=== 9b. AS SEIS CORRECOES DA v3.327 ===');
/* Conferidas juntas porque cinco das seis moram na mesma tela e a sexta
   (a folha) depende do que as outras deixam nela. */

/* --- 1. atualizacao de outra maquina nao tapa a tela --- */
MES['2026-08'].pedidos['ID00000003xx'].etapa = 'futurize';
carimbaNovo('2026-08');
const viuModal = [];
const espia = setInterval(async () => {
  try { viuModal.push(await p.evaluate(() => !document.getElementById('atvCarga').hidden)); }
  catch (e) {}
}, 60);
await p.evaluate(() => atvOlhaCarimbos());
await carregou();
clearInterval(espia);
r = await p.evaluate(() => ({
  etapa: (ATV.linhas.find(l => l.id === 'ID00000003xx') || {}).etapa,
  toast: !document.getElementById('atvToast').hidden,
  txt: document.getElementById('atvToast').textContent,
}));
console.log('     ' + JSON.stringify(r) + '  modal visto=' + viuModal.filter(Boolean).length);
checa('o que a outra maquina fez chegou', r.etapa, 'futurize');
/* O INCOMODO QUE ISTO CONSERTA: o veu do carregamento piscava no meio do
   trabalho toda vez que alguem em outra maquina mexia em qualquer coisa. */
checa('  e o modal de carregamento NAO apareceu', viuModal.filter(Boolean).length, 0);
checa('  quem avisa e um toast de canto', r.toast, true);
checa('  dizendo o que mudou, e nao "algo mudou"', /atualizado/.test(r.txt), true);
/* mas o modal continua existindo para quem PEDIU: abrir e conferir */
r = await p.evaluate(() => {
  ATV.carregando = true; ATV.prog = { feito: 1, total: 2, onde: '' }; atvDesenha();
  const v = !document.getElementById('atvCarga').hidden;
  ATV.carregando = false; ATV.prog = { feito: 0, total: 0, onde: '' }; atvDesenha();
  return v;
});
checa('  o modal continua valendo para quem esta esperando', r, true);

/* --- 3. Bordado --- */
r = await p.evaluate(() => ({
  existe: ATV_ETAPAS.some(e => e.k === 'bordado'),
  nomes: ATV_ETAPAS.map(e => e.n),
  noMenu: [...document.getElementById('atvMenuEtapa').querySelectorAll('button')]
    .map(b => b.textContent).includes('Bordado'),
}));
checa('Bordado entrou nas etapas', r.existe, true);
checa('  entre Silk e Calandra', r.nomes.slice(4, 7), ['Silk', 'Bordado', 'Calandra']);
checa('  e esta no menu de escolha', r.noMenu, true);
await p.evaluate(() => atvRecado('ID00000005xx', 'etapa', 'bordado'));
await filaVazia();
checa('  e o servidor aceita a etapa nova',
  MES['2026-08'].pedidos['ID00000005xx'].etapa, 'bordado');

/* --- 6. Situacao e Etapas filtram --- */
const acha = (f, v) => [...document.querySelectorAll('#atvLat .l')]
  .find(b => b.dataset.f === f && b.dataset.v === v);
r = await p.evaluate(() => {
  atvLimpaFiltro();
  const antes = ATV.linhas.length;
  const acha = (f, v) => [...document.querySelectorAll('#atvLat .l')]
    .find(b => b.dataset.f === f && b.dataset.v === v);
  acha('etapa', 'bordado').click();
  return { antes, depois: ATV.linhas.length, todas: ATV.todasDaSemana.length,
    nome: atvFiltroNome(),
    tarja: (document.querySelector('.atv-filtro-tarja b') || {}).textContent,
    /* O ITEM ACESO E OUTRO NO: a lista e redesenhada quando o filtro muda,
       e o botao clicado ja saiu do documento. Procurar de novo e o certo. */
    ligado: acha('etapa', 'bordado').classList.contains('on'),
    /* AS CONTAS NAO PODEM ENCOLHER: capacidade e da semana, nao do filtro */
    cartao: document.querySelector('.atv-card.c-pec .val').textContent };
});
console.log('     ' + JSON.stringify(r));
checa('clicar numa etapa filtra a semana', r.depois, 1);
checa('  sem tirar ninguem da semana', r.todas, r.antes);
checa('  a tarja diz o que esta ligado', r.tarja, 'Bordado');
checa('  o proprio item fica aceso', r.ligado, true);
/* a folha diria "cabe" para uma semana que nao cabe, se o filtro contasse */
const pecasSemana = await p.evaluate(() =>
  ATV.todasDaSemana.reduce((a, l) => a + (+l.total || 0), 0).toLocaleString('pt-BR'));
checa('  e os cartoes continuam contando a semana inteira', r.cartao, pecasSemana);
r = await p.evaluate(() => {
  const acha = (f, v) => [...document.querySelectorAll('#atvLat .l')]
    .find(b => b.dataset.f === f && b.dataset.v === v);
  const total = ATV.todasDaSemana.length;
  acha('situacao', 'andamento').click();
  const trocou = { n: ATV.linhas.length, nome: atvFiltroNome() };
  acha('situacao', 'andamento').click();       /* o mesmo de novo desliga */
  return { trocou, total, desligado: ATV.filtro.tipo, todos: ATV.linhas.length,
    semTarja: !document.querySelector('.atv-filtro-tarja'),
    /* ITEM COM ZERO NAO E CLICAVEL: filtrar para ver nada nao e um pedido
       que alguem faz de proposito, e um clique perdido */
    zeroTravado: (acha('etapa', 'prensa') || {}).className || '' };
});
console.log('     ' + JSON.stringify(r));
checa('clicar numa situacao troca o filtro', r.trocou.nome, 'Em andamento');
checa('  clicar no mesmo desliga', [r.desligado, r.semTarja], ['', true]);
checa('  e a semana inteira volta', r.todos, r.total);
checa('  uma etapa com zero pedidos nao e clicavel',
  /zero/.test(r.zeroTravado), true);

/* --- 2. a faixa estreita --- */
r = await p.evaluate(() => {
  document.body.classList.add('menu-fechado');
  atvSemanaNoPainel(); atvLateral();
  const tit = document.getElementById('atxSemTitFalso');
  const est = { tit: document.getElementById('atvSemTit').textContent,
    sub: document.getElementById('atvSemSub').textContent,
    listaEscondida: getComputedStyle(document.getElementById('atvLat')).display,
    botoes: [...document.querySelectorAll('#atvLatBtns button')].map(b => b.dataset.lista),
    /* CABEM NA FAIXA: a regua e a largura do painel, e nao um numero
       escrito aqui. O painel muda de largura com o zoom da tela. */
    cabeNaFaixa: (() => {
      const cx = document.getElementById('atvLatBtns');
      const larg = cx.getBoundingClientRect().width;
      return [...cx.querySelectorAll('button')]
        .every(b => b.getBoundingClientRect().width <= larg + 0.5); })() };
  document.getElementById('atvLatBtns').querySelector('[data-lista="etapas"]').click();
  est.modal = !document.getElementById('atvListaModal').hidden;
  est.itens = document.querySelectorAll('#atvListaCorpo .l').length;
  est.titulo = document.getElementById('atvListaTit').textContent;
  return est;
});
console.log('     ' + JSON.stringify(r));
checa('na faixa estreita a semana vira duas linhas', [r.tit, r.sub], ['17|22', 'ago']);
checa('  a lista empilhada some', r.listaEscondida, 'none');
checa('  e viram dois botoes', r.botoes, ['situacao', 'etapas']);
checa('  que cabem na faixa de 64px', r.cabeNaFaixa, true);
checa('clicar em Etapas abre a lista num modal', [r.modal, r.titulo], [true, 'Etapas']);
/* treze postos: os doze da v3.326 mais o Bordado. "sem etapa" so aparece
   quando ha alguem sem etapa, e aqui nao ha. */
checa('  com as treze etapas', r.itens, 13);
r = await p.evaluate(() => {
  atvLimpaFiltro();
  atvListaModalAbre('etapas');
  const b = [...document.querySelectorAll('#atvListaCorpo .l')]
    .find(x => x.dataset.v === 'bordado');
  b.click();
  const fora = { filtro: ATV.filtro.valor, linhas: ATV.linhas.length,
    fechou: document.getElementById('atvListaModal').hidden,
    acendeu: document.querySelector('#atvLatBtns [data-lista="etapas"]')
      .classList.contains('filtrando') };
  atvLimpaFiltro();
  document.body.classList.remove('menu-fechado');
  atvSemanaNoPainel(); atvLateral();
  fora.voltouLargo = document.getElementById('atvSemTit').textContent;
  return fora;
});
console.log('     ' + JSON.stringify(r));
checa('escolher no modal filtra igual', [r.filtro, r.linhas], ['bordado', 1]);
checa('  e fecha o modal, senao ele tapa o que se foi ver', r.fechou, true);
checa('  o botao da faixa fica aceso enquanto o filtro dele vale', r.acendeu, true);
checa('voltar para a faixa larga devolve a frase inteira',
  r.voltouLargo, '17 a 22 de agosto de 2026');

/* --- 4. o nome e o numero abrem o orcamento --- */
let pediuAbrir = '';
await p.route('**/api/ft/abrir/*', async rt => {
  pediuAbrir = rt.request().url().split('/abrir/')[1];
  await p.evaluate(() => { window.__pediuAbrir = 1; }).catch(() => {});
  await rt.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: false, detail: 'so queria saber que voce pediu' }) });
});
r = await p.evaluate(() => ({
  botoes: document.querySelectorAll('.atv-linha .abre').length,
  linhas: document.querySelectorAll('.atv-linha').length,
}));
checa('cada linha tem dois botoes que abrem (pedido e nome)',
  r.botoes, r.linhas * 2);
await p.evaluate(() => { document.querySelector('.atv-linha .ped.abre').click(); });
/* O ORCAMENTO ABERTO TEM ALTERACOES NAO SALVAS, e o editor pergunta antes
   de trocar de documento. Isso e o certo, e faz parte do caminho: o teste
   responde a pergunta em vez de fingir que ela nao existe. */
const perguntou = await p.waitForSelector('#ftEscFundo.on .ft-esc-bt.principal',
  { timeout: 8000 }).then(() => true).catch(() => false);
if (perguntou) await p.click('#ftEscFundo.on .ft-esc-bt.principal');
await p.waitForFunction(() => !!window.__pediuAbrir, null, { timeout: 8000 })
  .catch(() => {});
console.log('     pediu abrir: ' + pediuAbrir + '  perguntou=' + perguntou);
checa('o editor pergunta antes de trocar um documento nao salvo', perguntou, true);
checa('  e clicar no numero do pedido pede o orcamento ao servidor',
  /^ID0000000/.test(pediuAbrir), true);
await p.unroute('**/api/ft/abrir/*');
await p.evaluate(() => { if (typeof ftStatus === 'object' && ftStatus.fecha) ftStatus.fecha(); });

/* --- 5. a folha nunca mais come o rodape --- */
console.log('\n=== 9c. A FOLHA NAO COME O RODAPE (v3.327) ===');
/* O defeito: a medida antiga era `corpo.scrollHeight <= corpo.clientHeight`,
   duas propriedades INTEIRAS que nao sabem onde o rodape esta. Meio pixel
   de transbordo lia como "igual", e o rodape saia riscado no meio da
   ultima linha. Agora a pergunta e geometrica, entre os dois elementos que
   se colidiam, com folga. */
const FORMAS = [
  ['nomes curtos', 'ACME', 'DTF'],
  ['nome que quebra', 'PREFEITURA MUNICIPAL DE SAO BERNARDO DO CAMPO SECRETARIA DE ESPORTES', 'DTF + Sublimação'],
  ['departamento longo', 'ACME', 'Silk + sublimação + DTF'],
];
for (const [rot, cli, dep] of FORMAS) {
  const q = await p.evaluate(([cli, dep]) => {
    const fora = [];
    [12, 26, 30, 31, 34, 48, 77].forEach(n => {
      ATV.todasDaSemana = Array.from({ length: n }, (_, i) => ({
        id: 'F' + i, pedido: 'PD00' + (7000 + i), cliente: cli + ' ' + i, vendedor: 'Dani',
        entrega: String(17 + (i % 6)).padStart(2, '0') + '/08/2026',
        plan: '2026-08-' + String(17 + (i % 6)).padStart(2, '0'),
        etapa: 'corte', departamento: dep, sub: 5, per: 5, total: 10, novo: false }));
      ATV.linhas = ATV.todasDaSemana.slice();
      const folhas = atvMontaImpressao();
      document.body.classList.add('atv-imprimindo');
      let invade = 0, pior = 0, dados = 0, maxLinhas = 0, vaza = 0;
      document.querySelectorAll('.atv-folha').forEach(f => {
        const rod = f.querySelector('.atv-f-rodape').getBoundingClientRect();
        const cai = f.querySelector('.atv-folha-corpo');
        if (cai.scrollHeight > cai.clientHeight + 1) vaza++;
        maxLinhas = Math.max(maxLinhas, f.querySelectorAll('.atv-tab tbody tr').length);
        dados += f.querySelectorAll('.atv-tab tbody tr:not(.f-dia)').length;
        f.querySelectorAll('.atv-tab tr').forEach(tr => {
          const t = tr.getBoundingClientRect();
          if (t.bottom > rod.top) { invade++; pior = Math.max(pior, t.bottom - rod.top); }
        });
      });
      document.body.classList.remove('atv-imprimindo');
      atvDesmontaImpressao();
      fora.push({ n, folhas, invade, px: +pior.toFixed(2), dados, maxLinhas, vaza });
    });
    return fora;
  }, [cli, dep]);
  const invadiu = q.filter(x => x.invade).length;
  const perdeu = q.filter(x => x.dados !== x.n).length;
  const transbordou = q.filter(x => x.vaza).length;
  console.log('     ' + rot.padEnd(20) + ' ' + JSON.stringify(q.map(x => x.n + '=>' + x.folhas + 'f/' + x.maxLinhas + 'l')));
  checa('[' + rot + '] nenhuma linha passa por cima do rodape', invadiu, 0);
  checa('  nenhuma folha transborda', transbordou, 0);
  checa('  e nenhum pedido se perde na quebra', perdeu, 0);
  checa('  no maximo 31 linhas por folha, contando os cabecalhos de dia',
    q.every(x => x.maxLinhas <= 31), true);
}
/* O FILTRO E ESTADO DA TELA, e as secoes seguintes montam fixtures na mao:
   deixar um filtro ligado aqui faria as linhas delas simplesmente nao
   aparecerem, e o erro apontaria para o lugar errado. */
await p.evaluate(() => { ATV.filtro = { tipo: '', valor: '' };
  ATV.linhas = ATV.todasDaSemana = []; atvDesenha(); });

console.log('\n=== 10. QUEM SO OLHA NAO MEXE ===');
r = await p.evaluate(() => {
  const real = FT_EU.papel;
  FT_EU.papel = 'editor';                  /* finge ser quem so tem a marca */
  atvAtualizaAcesso();
  const trava = document.body.classList.contains('atv-so-olha');
  const planeja = atvPodePlanejar();
  FT_EU.papel = real; atvAtualizaAcesso();
  return { trava, planeja };
});
checa('sem ser admin, a tela entra em modo so-leitura', r.trava, true);
checa('  e atvPodePlanejar diz nao', r.planeja, false);

console.log('\n=== 11. A FOLHA A4 ===');
/* NOVE LINHAS POSTAS DE PROPOSITO. Antes esta secao herdava o que as
   secoes anteriores tinham deixado na tela, e mudar qualquer uma delas
   quebrava a contagem da folha sem ter nada a ver com impressao. */
await p.evaluate(() => {
  ATV.linhas = Array.from({ length: 9 }, (_, i) => ({
    id: 'F' + i, pedido: 'PD007' + i, cliente: 'CLIENTE ' + i, vendedor: 'Dani',
    entrega: '1' + (7 + (i % 6)) + '/08/2026', plan: '2026-08-1' + (7 + (i % 6)),
    etapa: 'corte', departamento: 'DTF', sub: 5, per: 5, total: 10, novo: false }));
  ATV.todasDaSemana = ATV.linhas;
  atvDesenha();
});
r = await p.evaluate(() => {
  const n = atvMontaImpressao();
  /* a caixa de impressao vive em display:none ate a hora de imprimir, e um
     elemento escondido mede zero. Para conferir o tamanho da folha e
     preciso liga-la, que e exatamente o que atvImprime faz. */
  document.body.classList.add('atv-imprimindo');
  const f = document.querySelector('.atv-folha').getBoundingClientRect();
  const mm = x => Math.round(x * 25.4 / 96);
  const vaza = [...document.querySelectorAll('.atv-folha-corpo')]
    .filter(c => c.scrollHeight > c.clientHeight + 1).length;
  const pag = [...document.querySelectorAll('.atv-f-pag')].map(x => x.textContent);
  const rod = document.querySelectorAll('.atv-f-rodape .atv-f-med .tr i').length;
  const linhas = document.querySelectorAll('.atv-tab tbody tr:not(.f-dia)').length;
  const out = { folhas: n, larg: mm(f.width), alt: mm(f.height), vaza, pag, rod, linhas };
  document.body.classList.remove('atv-imprimindo');
  atvDesmontaImpressao();
  return out;
});
console.log('     ' + JSON.stringify(r));
checa('a folha e A4 deitada', [r.larg, r.alt], [297, 210]);
checa('  nove pedidos cabem numa folha so', r.folhas, 1);
checa('  nada vaza da margem', r.vaza, 0);
checa('  toda linha entrou', r.linhas, 9);
checa('  a numeracao esta certa', r.pag, ['Página 1 de 1']);
checa('  e o rodape de total, com a barra, esta na folha', r.rod, 1);

/* AGORA A PARTE QUE IMPORTA: o ponto de virada. O mockup 2 mediu 24 pedidos
   por folha com seis dias em faixa. Se o editor tiver saido diferente, e
   porque alguma coisa do CSS dele entrou na folha, e a resposta que eu dei
   ao dono deixa de valer. */
const virada = await p.evaluate(() => {
  const guarda = ATV.linhas.slice();
  const base = ATV.linhas[0];
  const dias = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22'];
  const mede = etapa => {
    let corte = 0, vaza = 0, mapa = {};
    for (let n = 18; n <= 34; n++) {
      ATV.linhas = [];
      for (let i = 0; i < n; i++) {
        ATV.linhas.push(Object.assign({}, base, { id: 'X' + i, pedido: 'PD00' + (5000 + i),
          cliente: 'CLIENTE DE TESTE ' + i, plan: dias[i % 6], etapa,
          entrega: '17/08/2026', total: 100, sub: 100, per: 0, novo: false }));
      }
      const f = atvMontaImpressao();
      mapa[n] = f;
      vaza += [...document.querySelectorAll('.atv-folha-corpo')]
        .filter(c => c.scrollHeight > c.clientHeight + 1).length;
      atvDesmontaImpressao();
      if (f > 1 && !corte) corte = n;
    }
    return { corte, vaza, mapa };
  };
  const comChip = mede('prensa');
  const semChip = mede('');
  ATV.linhas = guarda;
  atvDesenha();
  return { comChip, semChip };
});
console.log('     com etapa em toda linha: ' + JSON.stringify(virada.comChip.mapa));
console.log('     sem etapa nenhuma:       ' + JSON.stringify(virada.semChip.mapa));
console.log('     vira 2 folhas a partir de ' + virada.comChip.corte
  + ' (com etapa) e ' + virada.semChip.corte + ' (sem etapa)');
/* A PASTILHA DA ETAPA E MAIS ALTA QUE O TEXTO, e por isso uma folha em que
   toda linha tem etapa cabe um pedido a menos. Nao e defeito: e o preco de
   uma coluna que se le de relance. O que o teste cobra e que o numero nao
   mude sem alguem perceber, e que nada vaze da margem em nenhum dos casos.

   V3.316: era 23 com etapa e 25 sem; passou a 24 e 25. A folha ganhou uma
   coluna (Departamento) e um cabecalho mais alto (os quatro cartoes), e
   mesmo assim cabe MAIS um pedido: a pastilha perdeu o ponto colorido e o
   vao dele, e o que ela deixou de gastar em altura pagou o cabecalho.

   V3.327: caiu um pedido em cada caso (25 -> 24 e 26 -> 25). E o preco
   escolhido: a quebra deixou de perguntar "o conteudo transbordou?", em
   inteiros arredondados, e passou a perguntar "a ultima linha termina
   acima do rodape, com 6px de folga?". Esses 6px sao um pedido por folha,
   e compram a garantia de que o rodape nunca mais aparece riscado no meio
   da ultima linha. O numero e medido a cada rodada justamente para a troca
   ser uma decisao, e nao uma surpresa. */
checa('com etapa em toda linha, a folha vira em 24 pedidos', virada.comChip.corte, 24);
checa('  sem etapa, vira em 25', virada.semChip.corte, 25);
checa('  e em nenhum dos casos alguma coisa vaza da folha',
  virada.comChip.vaza + virada.semChip.vaza, 0);

console.log('\n=== 11b. OS CARTOES E O RODAPE ===');
/* Os quatro cartoes e o rodape sairam do mockup 1 e nao tinham vindo para o
   editor. Nao sao enfeite: o numero grande sozinho ("1.670 pecas") nao diz
   de onde veio nem se cabe. A segunda linha de cada cartao e a barra do
   rodape sao o que transformam o numero em algo sobre o que decidir. E
   depois de rolar sete cartoes de dia o topo ja saiu da tela, entao a
   pergunta "e no total, cabe?" precisa ter resposta embaixo tambem. */
r = await p.evaluate(() => {
  /* uma semana conhecida: 3 pedidos, 100 pecas cada, um deles finalizado */
  ATV.linhas = [0, 1, 2].map(i => ({ id: 'C' + i, pedido: 'PD0' + i, cliente: 'CLIENTE ' + i,
    vendedor: 'Dani', entrega: '17/08/2026', plan: '2026-08-17',
    etapa: i === 0 ? 'finalizado' : 'prensa',
    sub: 60, per: 40, total: 100, chegouEm: '', novo: false }));
  ATV_CAP.semana = 1500; ATV_CAP.dia = 325; ATV_CAP.dias = 6;
  ATV.todasDaSemana = ATV.linhas;
  atvDesenha();
  const txt = s => (document.querySelector(s) || {}).textContent || '';
  const larg = s => { const e = document.querySelector(s);
    return e ? Math.round(parseFloat(e.style.width)) : -1; };
  return {
    cartoes: document.querySelectorAll('.atv-card').length,
    pecas: txt('.atv-card.c-pec .val'), pecasPe: txt('.atv-card.c-pec .pe'),
    capPe: txt('.atv-card.c-cap .pe'),
    sat: txt('.atv-card.c-sat .val'), satBarra: larg('.atv-satbar i'),
    pedPe: txt('.atv-card.c-ped .pe'),
    temRodape: !!document.getElementById('atvRodape'),
    rodTitulo: txt('#atvRodape .esq b'),
    rodDet: txt('#atvRodape .esq .det'),
    rodPct: txt('#atvRodape .medidor .linha b'),
    rodBarra: larg('#atvRodape .trilho i'),
  };
});
console.log('     ' + JSON.stringify(r));
checa('os quatro cartoes estao la', r.cartoes, 4);
checa('  peças na semana: 300', r.pecas, '300');
checa('  e a conta que explica o número',
  r.pecasPe, '180 sublimação · 120 personalizado');
checa('  capacidade traz o teto do dia', r.capPe, '325 peças por dia · 6 dias');
checa('  pedidos traz o que já está pronto', r.pedPe, '1 finalizados · 100 peças prontas');
checa('a saturação é 20% e a barra acompanha', [r.sat, r.satBarra], ['20%', 20]);
checa('o rodapé existe', r.temRodape, true);
checa('  com o total da semana', r.rodTitulo, '300 peças planejadas nesta semana');
checa('  e a folga até o limite',
  r.rodDet, 'Ainda cabem 1.200 peças antes de encostar no limite de 1.500.');
checa('  o medidor do rodapé bate com o do topo', [r.rodPct, r.rodBarra], ['20%', 20]);

/* PASSAR DO LIMITE MUDA O TEXTO E A COR, e é esse o momento em que o
   relatório precisa ser lido: cabe é informação, passou é decisão. */
r = await p.evaluate(() => {
  ATV.linhas.forEach(l => { l.total = 600; l.sub = 600; l.per = 0; });
  atvDesenha();
  const cor = s => getComputedStyle(document.querySelector(s)).color;
  return { det: document.querySelector('#atvRodape .esq .det').textContent,
    pct: document.querySelector('.atv-card.c-sat .val').textContent,
    corSat: cor('.atv-card.c-sat .val'),
    barra: Math.round(parseFloat(document.querySelector('#atvRodape .trilho i').style.width)) };
});
console.log('     ' + JSON.stringify(r));
checa('passou do limite: o texto diz o que fazer',
  r.det, 'A semana passou o limite em 300 peças. Alguma coisa precisa mudar de dia.');
checa('  a saturação é 120%', r.pct, '120%');
checa('  em vermelho', r.corSat, 'rgb(198, 22, 27)');
checa('  e a barra para em 100%, sem transbordar', r.barra, 100);

console.log('\n=== 12. TROCAR DE SEMANA ===');
/* Trocar de semana deixou de perguntar qualquer coisa: nao existe mais
   "alteracao nao salva" para se perder. */
await p.click('#atvAnterior');
await p.waitForTimeout(800);
r = await p.evaluate(() => ({ semana: ATV.semana, linhas: ATV.linhas.length,
  tit: document.getElementById('atvSemTit').textContent }));
console.log('     ' + JSON.stringify(r));
checa('a semana anterior e a de 10/08', r.semana, '2026-08-10');
checa('  e ela sai do MESMO indice, sem ler nada novo', r.linhas, 0);
await p.click('#atvSeguinte');
await p.waitForTimeout(800);
checa('voltar traz a semana de 17/08',
  await p.evaluate(() => ATV.semana), SEMANA);

console.log('\n=== 13. A CAPACIDADE NAS CONFIGURACOES ===');
r = await p.evaluate(() => {
  const s = document.getElementById('cfgCapSemana');
  const d = document.getElementById('cfgCapDia');
  s.value = 1500; s.dispatchEvent(new Event('change', { bubbles: true }));
  d.value = 250; d.dispatchEvent(new Event('change', { bubbles: true }));
  const dep = { semana: ATV_CAP.semana, dia: ATV_CAP.dia,
    guardado: JSON.parse(localStorage.getItem('ft_capacidade') || '{}'),
    aviso: document.getElementById('cfgCapAviso').hidden };
  d.value = 325; d.dispatchEvent(new Event('change', { bubbles: true }));
  dep.avisoDepois = document.getElementById('cfgCapAviso').hidden;
  dep.textoAviso = document.getElementById('cfgCapAviso').textContent.slice(0, 40);
  return dep;
});
console.log('     ' + JSON.stringify(r));
checa('os campos mudam a capacidade', [r.semana, r.dia], [1500, 250]);
checa('  e ficam guardados', r.guardado.semana, 1500);
checa('250 x 6 = 1500: sem briga, sem aviso', r.aviso, true);
checa('325 x 6 = 1950 contra 1500: o aviso aparece', r.avisoDepois, false);

console.log('\n=== 8l. O CARREGAMENTO E UM MODAL CENTRAL (v3.322) ===');
/* Era uma tira fina no alto da lista, junto do conteudo: dizia o que
   estava acontecendo e ao mesmo tempo deixava a pagina parecer utilizavel,
   com linhas velhas mudando sozinhas por baixo dela. */
r = await p.evaluate(() => {
  ATV.carregando = true; ATV.prog = { feito: 3, total: 12, onde: '8/2026' };
  atvDesenha();
  const cx = document.getElementById('atvCarga');
  const e = getComputedStyle(cx);
  const c = cx.getBoundingClientRect();
  const jan = cx.querySelector('.atv-carga').getBoundingClientRect();
  const fora = { visivel: !cx.hidden, pos: e.position,
    cobreATela: Math.round(c.width) === innerWidth && Math.round(c.height) === innerHeight,
    /* centrado: as sobras dos dois lados sao iguais */
    centrado: Math.abs(jan.left - (innerWidth - jan.right)) < 2
           && Math.abs(jan.top - (innerHeight - jan.bottom)) < 2,
    pct: document.getElementById('atvCargaPct').textContent,
    rot: document.getElementById('atvCargaRot').textContent,
    conta: document.getElementById('atvCargaConta').textContent,
    barra: document.getElementById('atvCargaBarra').style.width,
    /* a tira antiga nao pode ter sobrado na pagina */
    tiraNaPagina: document.querySelectorAll('#atvPage .atv-prog').length };
  ATV.carregando = false; ATV.prog = { feito: 0, total: 0, onde: '' };
  atvDesenha();
  fora.sumiu = document.getElementById('atvCarga').hidden;
  return fora;
});
console.log('     ' + JSON.stringify(r));
checa('o carregamento e um modal por cima de tudo', [r.visivel, r.pos], [true, 'fixed']);
checa('  cobrindo a tela inteira', r.cobreATela, true);
checa('  com a caixa no centro', r.centrado, true);
checa('  mostrando a porcentagem de verdade', r.pct, '25%');
checa('  e a conta de arquivos', r.conta, '3 de 12 arquivos  ·  8/2026');
checa('  com a barra no mesmo tanto', r.barra, '25%');
checa('a tira antiga saiu da pagina', r.tiraNaPagina, 0);
checa('e o modal some quando a leitura acaba', r.sumiu, true);

console.log('\n=== 8m. A SECAO SOBREVIVE AO F5 (v3.322) ===');
/* Atualizar a pagina voltava sempre para o editor. Nao era decisao de
   ninguem: a secao so existia numa variavel de memoria. */
r = await p.evaluate(() => {
  const antes = localStorage.getItem('ft_secao');
  ftSecao('relatorio');
  const gravouRel = localStorage.getItem('ft_secao');
  ftSecao('atividade');
  const gravouAtv = localStorage.getItem('ft_secao');
  /* a devolucao: finge o recarregamento voltando para o orcamento e
     mandando devolver */
  ftSecao('orcamento');
  localStorage.setItem('ft_secao', 'atividade');
  ftSecaoDevolve();
  const voltou = ftSecao();
  /* e uma secao cujo botao esta escondido por permissao NAO e destino */
  const bt = document.querySelector('.ft-rail-bt[data-sec="banco"]');
  const eraHidden = bt.hidden;
  bt.hidden = true;
  ftSecao('orcamento');
  localStorage.setItem('ft_secao', 'banco');
  ftSecaoDevolve();
  const naoVoltou = ftSecao();
  bt.hidden = eraHidden;
  ftSecao('atividade');
  return { antes, gravouRel, gravouAtv, voltou, naoVoltou };
});
console.log('     ' + JSON.stringify(r));
checa('trocar de secao grava a escolha', [r.gravouRel, r.gravouAtv],
  ['relatorio', 'atividade']);
checa('  e o recarregamento devolve a pessoa para ela', r.voltou, 'atividade');
/* a rede de seguranca: botao escondido por permissao nao e destino */
checa('secao sem permissao nao e devolvida', r.naoVoltou, 'orcamento');

console.log('\n=== 8o. O MENU DE ETAPAS ROLA (v3.324) ===');
/* Ele fecha ao rolar a PAGINA, porque e position:fixed e ficaria apontando
   para a linha errada. So que o ouvinte estava na fase de captura, no
   documento inteiro, e nao olhava de onde o evento vinha: rolar DENTRO do
   menu fechava ele no gesto de escolher. Quando a lista nao cabia na tela
   (que e justamente quando rolar importa), era impossivel chegar nas
   ultimas etapas. */
r = await p.evaluate(async () => {
  ATV.semana = '2026-08-17';
  ATV.linhas = [{ id: 'R1', pedido: 'PD009400', cliente: 'CLIENTE', vendedor: 'Dani',
    entrega: '18/08/2026', plan: '2026-08-18', etapa: 'corte', departamento: 'DTF',
    sub: 1, per: 0, total: 1, chegouEm: '', novo: false }];
  ATV.todasDaSemana = ATV.linhas;
  atvDesenha();
  const m = document.getElementById('atvMenuEtapa');
  document.querySelector('.atv-chip').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  /* forca o caso ruim: teto pequeno, lista maior que ele */
  m.style.maxHeight = '120px';
  await new Promise(r => setTimeout(r, 80));
  const precisaRolar = m.scrollHeight > m.clientHeight + 1;
  /* rolar DENTRO do menu, como a roda do mouse faz */
  m.scrollTop = 60;
  m.dispatchEvent(new Event('scroll', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  const continuaAberto = m.classList.contains('on');
  const andou = m.scrollTop > 0;
  /* e rolar a PAGINA continua fechando, que e o certo */
  document.getElementById('atvPage').dispatchEvent(new Event('scroll', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  const fechouComAPagina = !m.classList.contains('on');
  return { precisaRolar, continuaAberto, andou, fechouComAPagina,
    barra: getComputedStyle(m).scrollbarWidth };
});
console.log('     ' + JSON.stringify(r));
checa('com pouco espaco, a lista precisa rolar', r.precisaRolar, true);
checa('  rolar DENTRO do menu nao fecha ele', r.continuaAberto, true);
checa('  e a rolagem anda de verdade', r.andou, true);
/* a barra de rolagem volta a aparecer aqui: o editor apaga todas, e sem
   ela nada diz que ha mais etapa embaixo */
checa('  com barra de rolagem visivel', r.barra, 'thin');
/* mas rolar a PAGINA continua fechando: o menu e fixed e ficaria apontando
   para a linha errada */
checa('rolar a pagina continua fechando', r.fechouComAPagina, true);

console.log('\n=== 13b. AS MUDANCAS DA v3.316 ===');
console.log('     estado: ' + JSON.stringify(await p.evaluate(() => ({
  semana: ATV.semana, filtro: ATV.filtro, aberto: atvAberto,
  pgHidden: document.getElementById('atvPage').hidden,
  linhas: document.querySelectorAll('.atv-linha').length }))));
/* As sete coisas pedidas de uma vez. Sao conferidas JUNTAS de proposito:
   quase todas moram na mesma linha da tabela, e o que quebra uma quebra a
   do lado (uma coluna a mais desloca todas as outras). */
r = await p.evaluate(() => {
  ATV.linhas = [
    /* plan IGUAL ao envio: nao mudou de data */
    { id: 'V1', pedido: 'PD009001', cliente: 'CLIENTE A', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-17', etapa: 'corte',
      departamento: 'DTF + Silk', sub: 60, per: 40, total: 100, chegouEm: '', novo: false },
    /* MARCADO A MAO: e `planManual` que faz o negrito vermelho agora, e
       nao a comparacao entre plano e entrega. Sao coisas diferentes: uma
       e a pessoa que moveu, a outra o cliente que remarcou depois. */
    { id: 'V2', pedido: 'PD009002', cliente: 'CLIENTE B', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-19', planManual: true, etapa: 'futurize',
      departamento: 'Sublimação', sub: 10, per: 0, total: 10, chegouEm: '', novo: false },
    /* ATRASADO E SEM ETAPA: a tarja aparece, e o chip continua dizendo
       "sem etapa". Antes Atrasado OCUPAVA o chip e a etapa se perdia. */
    { id: 'V3', pedido: 'PD009003', cliente: 'CLIENTE C', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-17', etapa: '',
      departamento: 'DTF', sub: 5, per: 0, total: 5, chegouEm: '', novo: false },
    /* ATRASADO E EM COSTURA: as duas coisas ao mesmo tempo, que e o ponto */
    { id: 'V4', pedido: 'PD009004', cliente: 'CLIENTE D', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-17', etapa: 'costura',
      departamento: 'Silk', sub: 5, per: 0, total: 5, chegouEm: '', novo: false },
    /* etapa de arquivo antigo, que saiu da lista */
    { id: 'V5', pedido: 'PD009005', cliente: 'CLIENTE E', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-17', etapa: 'separacao',
      departamento: 'DTF', sub: 5, per: 0, total: 5, chegouEm: '', novo: false },
  ];
  /* ATV.linhas E DERIVADA (v3.326): quem monta fixture na mao tem de pôr
     tambem a lista de contagem, senao os cartoes e a barra lateral contam
     a semana de verdade enquanto a tabela mostra a de mentira. */
  ATV.todasDaSemana = ATV.linhas;
  ATV.todasDaSemana = ATV.linhas;
  atvDesenha();
  const li = id => document.querySelector('.atv-linha[data-id="' + id + '"]');
  const chip = id => (li(id).querySelector('.atv-chip span') || {}).textContent;
  const peso = (id, sel) => getComputedStyle(li(id).querySelector(sel)).fontWeight;
  const cor = (id, sel) => getComputedStyle(li(id).querySelector(sel)).color;
  const trilho = sel => getComputedStyle(document.querySelector('.atv-linha ' + sel)).boxShadow;
  /* a distancia da tinta ate cada borda da pastilha */
  const folga = id => { const c = li(id).querySelector('.atv-chip');
    const g = document.createRange(); g.selectNodeContents(c.querySelector('span'));
    const rc = c.getBoundingClientRect(), ri = g.getBoundingClientRect();
    return [+(ri.left - rc.left).toFixed(1), +(rc.right - ri.right).toFixed(1)]; };
  return {
    cabecalho: [...document.querySelectorAll('.atv-cab-lista > span')].map(s => s.textContent),
    dep: li('V1').querySelector('.dep').textContent,
    /* as etapas, na ordem pedida */
    etapas: ATV_ETAPAS.map(e => e.n),
    noMenu: [...document.getElementById('atvMenuEtapa').querySelectorAll('button')]
      .map(b => b.textContent),
    chips: { V1: chip('V1'), V2: chip('V2'), V3: chip('V3'), V4: chip('V4'), V5: chip('V5') },
    velha: li('V5').querySelector('.atv-chip').classList.contains('velha'),
    tarjaV4: !!li('V4').querySelector('.atv-atraso'),
    pesoPed: peso('V1', '.ped'), pesoTot: peso('V1', '.tot'),
    planParado: [peso('V1', '.plan'), cor('V1', '.plan')],
    planMudou: [peso('V2', '.plan'), cor('V2', '.plan')],
    trilhos: [trilho('.tr-t'), trilho('.tr-s'), trilho('.tr-p')],
    folgas: ['V1', 'V2', 'V4'].map(folga),
    /* o submenu conta pela MESMA regra da etiqueta */
    lateral: [...document.querySelectorAll('#atvLat .l')].map(l =>
      l.querySelector('.n').textContent + '=' + l.querySelector('.q').textContent),
  };
});
console.log('     ' + JSON.stringify(r.chips) + '  ' + JSON.stringify(r.folgas));
checa('a coluna Departamento entrou no cabecalho', r.cabecalho,
  ['', 'Pedido', 'Nome', 'Departamento', 'Entrega', 'Planejamento',
   'Total', 'Subl.', 'Person.', 'Atualização']);
checa('  e traz o departamento do orcamento', r.dep, 'DTF + Silk');


/* DOZE ETAPAS, e todas sao POSTOS DE VERDADE (v3.326). Sairam as duas que
   nao eram: Atrasado, que e situacao e nao lugar, e Organizar, que so
   existia para empurrar pedido de semana -- coisa que agora se faz
   mudando a data no calendario. */
/* treze na v3.327: Bordado entrou entre Silk e Calandra, a pedido */
checa('as treze etapas sao os treze postos, na ordem pedida', r.etapas,
  ['Corte', 'Impressão sublimação', 'Impressão DTF', 'Prensa DTF', 'Silk',
   'Bordado', 'Calandra', 'Futurize', 'Conferência', 'Cd costura', 'Costura',
   'Embalagem', 'Finalizado']);
checa('  e o menu oferece as treze mais "sem etapa"', r.noMenu,
  ['Corte', 'Impressão sublimação', 'Impressão DTF', 'Prensa DTF', 'Silk',
   'Bordado', 'Calandra', 'Futurize', 'Conferência', 'Cd costura', 'Costura',
   'Embalagem', 'Finalizado', 'sem etapa']);
checa('a etapa escolhida aparece', [r.chips.V1, r.chips.V2], ['Corte', 'Futurize']);
/* O CONSERTO: atrasado sem etapa continua "sem etapa", com a tarja por
   fora. Antes Atrasado tomava o chip e a etapa desaparecia da tela. */
checa('  atrasado sem etapa continua sem etapa, com tarja', r.chips.V3, 'sem etapa');
checa('  e atrasado em Costura mostra as duas coisas',
  [r.chips.V4, r.tarjaV4], ['Costura', true]);
checa('  mas a escolha do operador vence o atraso', r.chips.V4, 'Costura');
/* uma semana ja salva nao pode perder o planejamento so porque a lista de
   etapas mudou: a etapa antiga continua desenhada, tracejada */
checa('  etapa de arquivo antigo nao some', r.chips.V5, 'Separação');
checa('    e vem marcada como fora da lista', r.velha, true);
checa('negrito no numero do pedido', r.pesoPed, '700');
checa('  e no total de pecas', r.pesoTot, '700');
checa('planejamento na data do envio: sem destaque', r.planParado[0] === '700', false);
checa('  planejamento marcado a mao: negrito', r.planMudou[0], '700');
checa('  e vermelho', r.planMudou[1], 'rgb(198, 22, 27)');
checa('trilho vertical antes de Total, Subl. e Person.',
  r.trilhos.map(t => /rgb\(240, 195, 197\)|rgb\(187, 211, 242\)|rgb\(240, 220, 182\)/.test(t)),
  [true, true, true]);
/* O DEFEITO QUE ELE VIU: o ponto colorido empurrava o texto 11px para a
   direita e a pastilha ficava torta em TODAS as etapas. Aqui a folga dos
   dois lados tem de ser a mesma, e nao "parecida". */
checa('a pastilha tem a mesma folga dos dois lados',
  r.folgas.map(f => f[0] === f[1]), [true, true, true]);
/* A SITUACAO E CONTADA A PARTE DA ETAPA, que e a separacao dos dois eixos
   vista na barra lateral: os dois atrasados aparecem em Entrega vencida E
   cada um na etapa dele. */
checa('a barra lateral conta a situacao separada da etapa',
  r.lateral.indexOf('Entrega vencida=5') >= 0, true);
checa('  e mostra a etapa antiga so porque ainda ha alguem nela',
  r.lateral.indexOf('Separação=1') >= 0, true);

/* A COLUNA TEM DE CABER O MAIOR DEPARTAMENTO QUE EXISTE (v3.318).
   "DTF + Sublimação" estava sendo cortado. Conferir com o valor mais longo
   dos sete, na tela E no papel, e o unico jeito de a largura nao voltar a
   ficar apertada sem ninguem ver. */
const DEPS = ['DTF + Sublimação', 'Silk + sublimação', 'Sublimação + DTF',
              'DTF + Silk', 'Bordado', 'Sublimação', 'Silk', 'DTF'];
const rDep = await p.evaluate(deps => {
  ATV.linhas = deps.map((d, i) => ({ id: 'W' + i, pedido: 'PD008' + i,
    cliente: 'CLIENTE ' + i, vendedor: 'Dani', entrega: '18/08/2026',
    plan: '2026-08-18', etapa: 'corte', departamento: d,
    sub: 1, per: 1, total: 2, chegouEm: '', novo: false }));
  ATV.todasDaSemana = ATV.linhas;
  atvDesenha();
  const cortado = e => e.scrollWidth > e.clientWidth + 0.5;
  const tela = [...document.querySelectorAll('.atv-linha .dep')]
    .filter(cortado).map(e => e.textContent);
  atvMontaImpressao();
  document.body.classList.add('atv-imprimindo');
  const papel = [...document.querySelectorAll('.atv-folha .atv-tab td.dep')]
    .filter(cortado).map(e => e.textContent);
  document.body.classList.remove('atv-imprimindo');
  atvDesmontaImpressao();
  return { tela, papel };
}, DEPS);
checa('nenhum departamento e cortado na tela', rDep.tela, []);
checa('  nem no papel', rDep.papel, []);

console.log('\n=== 13b2. O NEGRITO DE VERDADE E O MENU QUE CABE (v3.317) ===');
/* O NEGRITO QUE NAO APARECIA.
   As colunas de numero usam IBM Plex Mono, e a folha de estilo pedia
   wght@400;500;600 — sem 700. Quando o CSS pede 700 e a familia so tem ate
   600, o navegador NAO inventa negrito: ele escolhe a face mais proxima que
   existe, a de 600, que a 11,5px e quase igual a de 500. O peso estava no
   CSS, o teste lia "700", e na tela nao havia negrito nenhum. Por isso a
   conferencia aqui nao e do CSS: e da FONTE. */
r = await p.evaluate(async () => {
  await document.fonts.ready;
  const mede = (txt, peso) => {
    const e = document.createElement('span');
    e.style.cssText = 'position:fixed;left:-9999px;white-space:pre;font-size:11.5px;'
      + 'font-family:' + getComputedStyle(document.documentElement)
        .getPropertyValue('--ft-fonte-mono') + ';font-weight:' + peso;
    e.textContent = txt;
    document.body.appendChild(e);
    const w = e.getBoundingClientRect().width;
    e.remove();
    return w;
  };
  /* IBM Plex Mono e MONOESPACADA: 400, 600 e 700 tem exatamente a mesma
     largura de avanco. Medir texto nao prova nada aqui — o que prova e o
     INVENTARIO das faces declaradas. Se a de 700 nao existe, o navegador
     cai na de 600 em silencio, que foi o defeito. */
  const faces = [...document.fonts].filter(f => f.family === 'IBM Plex Mono');
  return {
    pesosMono: [...new Set(faces.map(f => f.weight))].sort(),
    l400: mede('PD004119', 400), l700: mede('PD004119', 700),
    pedidoPede: getComputedStyle(
      document.querySelector('.atv-linha .ped')).fontWeight,
    totalPede: getComputedStyle(
      document.querySelector('.atv-linha .tot')).fontWeight,
  };
});
console.log('     ' + JSON.stringify(r));
checa('a fonte mono declara ate a face de 700', r.pesosMono,
  ['400', '500', '600', '700']);
checa('a coluna Pedido pede 700', r.pedidoPede, '700');
checa('  e a coluna Total tambem', r.totalPede, '700');

/* O MENU CORTANDO ETAPAS.
   Com dez etapas ele cabia embaixo de qualquer chip. Com treze passou de
   440px: clicado numa linha do meio para baixo, nao cabia nem embaixo nem
   em cima, o teto de 340px cortava as ultimas e o editor apaga TODA barra
   de rolagem — nao sobrava nem o sinal de que havia mais coisa.
   O teste abre pelo ULTIMO chip da lista, que e o pior caso. */
r = await p.evaluate(async () => {
  ATV.linhas = Array.from({ length: 26 }, (_, i) => ({
    id: 'M' + i, pedido: 'PD007' + String(i).padStart(3, '0'), cliente: 'CLIENTE ' + i,
    vendedor: 'Dani', entrega: '17/08/2026', plan: '2026-08-17', etapa: 'corte',
    departamento: 'DTF', sub: 1, per: 0, total: 1, chegouEm: '', novo: false }));
  ATV.todasDaSemana = ATV.linhas;
  atvDesenha();
  const chips = [...document.querySelectorAll('.atv-chip')];
  const ultimo = chips[chips.length - 1];
  ultimo.scrollIntoView({ block: 'end' });
  await new Promise(r => setTimeout(r, 250));
  ultimo.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  const m = document.getElementById('atvMenuEtapa');
  const rm = m.getBoundingClientRect();
  const bts = [...m.querySelectorAll('button')];
  return {
    aberto: m.classList.contains('on'),
    botoes: bts.length,
    dentroDaTela: rm.top >= 0 && rm.bottom <= innerHeight + 0.5
      && rm.left >= 0 && rm.right <= innerWidth + 0.5,
    recortados: bts.filter(b => b.offsetTop + b.offsetHeight > m.scrollHeight + 0.5).length,
    cabeSemRolar: m.scrollHeight <= m.clientHeight + 0.5,
    alturaMenu: Math.round(rm.height), tela: innerHeight,
  };
});
console.log('     ' + JSON.stringify(r));
checa('o menu abre com as catorze escolhas', [r.aberto, r.botoes], [true, 14]);
checa('  inteiro dentro da tela', r.dentroDaTela, true);
checa('  sem nenhum botao recortado', r.recortados, 0);
checa('  e sem precisar rolar', r.cabeSemRolar, true);
await p.evaluate(() => document.body.click());

console.log('\n=== 13b3. O TEMA ESCURO E A LOGO DO PAPEL (v3.321) ===');
/* DUAS VARIAVEIS QUE NUNCA EXISTIRAM. O fundo da pagina pedia
   `--ft-fundo` e a linha da lista pedia `--ft-linha`; os nomes de verdade
   sao `--ft-fundo-pagina` e `--ft-borda`. CSS nao reclama de variavel
   inexistente: usa o valor de reserva escrito ao lado, e os dois eram
   claros. O relatorio inteiro ficava com fundo cinza claro no tema
   escuro, sem nada na tela dizendo o motivo.

   Por isso a conferencia NAO e "a cor e tal": e que a cor MUDA quando o
   tema muda. Uma cor fixa passaria por qualquer valor esperado. */
r = await p.evaluate(() => {
  const pg = document.getElementById('atvPage');
  const le = () => {
    const li = document.querySelector('.atv-linha');
    return { fundo: getComputedStyle(pg).backgroundColor,
             linha: getComputedStyle(li).borderBottomColor,
             folga: getComputedStyle(document.querySelector('.atv-dia-cab .folga')).backgroundColor };
  };
  delete document.body.dataset.tema;
  const claro = le();
  document.body.dataset.tema = 'escuro';
  const escuro = le();
  /* a folha impressa e sempre branca, mesmo com o editor no escuro */
  atvMontaImpressao();
  document.body.classList.add('atv-imprimindo');
  const f = document.querySelector('.atv-folha');
  const papel = {
    barra: getComputedStyle(f.querySelector('.atv-f-satbar i')).backgroundColor,
    logoClara: f.querySelector('.atv-f-logo').src === LOGO_H_CLARA,
    logoEscura: f.querySelector('.atv-f-logo').src === LOGO_H_ESCURA };
  document.body.classList.remove('atv-imprimindo');
  atvDesmontaImpressao();
  delete document.body.dataset.tema;
  return { claro, escuro, papel };
});
console.log('     ' + JSON.stringify(r));
checa('o fundo da pagina muda com o tema', r.claro.fundo !== r.escuro.fundo, true);
checa('  e o escuro e escuro mesmo',
  r.escuro.fundo.replace(/[^\d,]/g, '').split(',').every(n => +n < 60), true);
checa('a linha da lista muda com o tema', r.claro.linha !== r.escuro.linha, true);
/* as seis pastilhas de folga, uma por dia, viravam ilhas brancas */
checa('a pastilha de folga muda com o tema', r.claro.folga !== r.escuro.folga, true);
checa('  e para de brilhar no escuro',
  r.escuro.folga.replace(/[^\d,]/g, '').split(',').every(n => +n < 70), true);
/* A LOGO DO PAPEL. Os nomes dizem para que FUNDO cada uma serve: a CLARA
   e a de fundo claro, com texto escuro. Estava a ESCURA, de texto branco,
   numa folha branca: o "FOUR" vermelho aparecia e o "TIME" sumia. */
checa('a folha usa a logo de fundo claro', [r.papel.logoClara, r.papel.logoEscura],
  [true, false]);
/* e imprimir com o editor no escuro nao pode levar tom de tela escura
   para o papel */
checa('  e a barra do papel nao vem do tema escuro',
  r.papel.barra, 'rgb(22, 163, 74)');

console.log('\n=== 13c. A FOLHA IMPRESSA DA v3.316 ===');
r = await p.evaluate(() => {
  atvMontaImpressao();
  document.body.classList.add('atv-imprimindo');
  const f = document.querySelector('.atv-folha');
  const topo = f.querySelector('.atv-f-topo').getBoundingClientRect();
  const cx = [...f.querySelectorAll('.atv-f-res .cx')];
  const rod = f.querySelector('.atv-f-rodape');
  const rr = rod.getBoundingClientRect();
  const dentro = el => +(el.getBoundingClientRect().top - rr.top).toFixed(1);
  const chip = f.querySelector('.atv-f-chip');
  const g = document.createRange(); g.selectNodeContents(chip);
  const rc = chip.getBoundingClientRect(), ri = g.getBoundingClientRect();
  const lin = rod.querySelector('.atv-f-med .lin');
  const out = {
    logo: !!f.querySelector('.atv-f-logo'),
    marcaEscrita: !!f.querySelector('.atv-f-marca'),
    /* OS CARTOES: quatro caixas iguais. O de Saturacao levava uma barra a
       mais e ficava 2,3px abaixo dos outros tres. */
    cartoes: cx.length,
    topos: cx.map(c => +(c.getBoundingClientRect().top - topo.top).toFixed(1)),
    alturas: cx.map(c => +c.getBoundingClientRect().height.toFixed(1)),
    rotulos: cx.map(c => +(c.querySelector('.r').getBoundingClientRect().top - topo.top).toFixed(1)),
    temCaixa: cx.every(c => getComputedStyle(c).borderLeftWidth !== '0px'),
    /* O RODAPE: os tres blocos comecavam em 6, 10.8 e 15px do filete. */
    rodape: [dentro(rod.querySelector('.esq')), dentro(rod.querySelector('.atv-f-med')),
             dentro(rod.querySelector('.atv-f-pag'))],
    /* A LINHA DE BASE, E NAO O FUNDO DA CAIXA.
       O rotulo tem 7,5px e a porcentagem 9px: alinhados pela base, a caixa
       maior desce 1px a mais, e comparar os fundos acusaria desalinhamento
       onde nao ha. A sonda e um inline-block vazio: a base dele E a linha
       de base do texto em volta. */
    ...(() => {
      const sonda = () => { const e = document.createElement('span');
        e.style.cssText = 'display:inline-block;width:0;height:0'; return e; };
      const a = sonda(), b = sonda();
      lin.querySelector('span').appendChild(a); lin.querySelector('b').appendChild(b);
      const v = { baseRotulo: +a.getBoundingClientRect().bottom.toFixed(2),
                  baseNumero: +b.getBoundingClientRect().bottom.toFixed(2) };
      a.remove(); b.remove();
      return v;
    })(),
    colunas: [...f.querySelectorAll('.atv-tab thead th')].map(t => t.textContent),
    /* nada pode transbordar: "PLANEJAMENTO" e uma palavra sem espaco e
       chegou a invadir a coluna do lado */
    cortadas: [...f.querySelectorAll('.atv-tab th, .atv-tab tbody td:not([colspan])')]
      .filter(t => t.scrollWidth > t.clientWidth + 0.5).length,
    folgaChip: [+(ri.left - rc.left).toFixed(1), +(rc.right - ri.right).toFixed(1)],
    trilhos: ['tr-t', 'tr-s', 'tr-p'].map(k =>
      getComputedStyle(f.querySelector('th.' + k)).borderLeftColor),
  };
  document.body.classList.remove('atv-imprimindo');
  atvDesmontaImpressao();
  return out;
});
console.log('     ' + JSON.stringify(r.topos) + ' ' + JSON.stringify(r.rodape)
  + '  base rotulo=' + r.baseRotulo + ' numero=' + r.baseNumero);
checa('a logo entrou no lugar do nome escrito', [r.logo, r.marcaEscrita], [true, false]);
checa('os quatro cartoes estao na folha', r.cartoes, 4);
checa('  todos comecam na mesma altura', new Set(r.topos).size, 1);
checa('  todos com a mesma altura', new Set(r.alturas).size, 1);
checa('  e os quatro rotulos na mesma linha', new Set(r.rotulos).size, 1);
checa('  cada um numa caixa, como na tela', r.temCaixa, true);
checa('no rodape os tres blocos partem do mesmo lugar', new Set(r.rodape).size, 1);
checa('  e o numero da saturacao pousa na linha de base do rotulo',
  Math.abs(r.baseRotulo - r.baseNumero) < 0.5, true);
checa('a folha tem as nove colunas', r.colunas,
  ['Pedido', 'Nome', 'Departamento', 'Entrega', 'Planejamento',
   'Total', 'Subl.', 'Person.', 'Atualização']);
checa('  e nenhuma delas transborda', r.cortadas, 0);
checa('a pastilha do papel tambem esta reta', r.folgaChip[0], r.folgaChip[1]);
checa('os trilhos do papel usam as cores do relatorio de pedidos', r.trilhos,
  ['rgb(240, 195, 197)', 'rgb(187, 211, 242)', 'rgb(240, 220, 182)']);

console.log('\n=== 14. A TELA DE PESSOAS LIGA A MARCA ===');
r = await p.evaluate(async () => {
  await ftUsersAbre();
  await new Promise(s => setTimeout(s, 500));
  const linha = document.querySelector('.ft-us-linha[data-u="patricia"]');
  const bt = linha.querySelector('.ft-us-atv');
  const antes = bt.classList.contains('on');
  bt.click();
  await new Promise(s => setTimeout(s, 900));
  const dep = document.querySelector('.ft-us-linha[data-u="patricia"] .ft-us-atv');
  const admin = document.querySelector('.ft-us-linha[data-u="henrique"] .ft-us-atv');
  return { antes, depois: dep.classList.contains('on'),
    noServidor: (FT_US.lista.find(x => x.u === 'patricia') || {}).atividade,
    adminLigado: admin.classList.contains('on'), adminTravado: admin.disabled };
});
console.log('     ' + JSON.stringify(r));
checa('a marca comeca desligada', r.antes, false);
checa('  um clique liga', r.depois, true);
checa('  e o servidor gravou', r.noServidor, true);
checa('o admin aparece ligado e travado', [r.adminLigado, r.adminTravado], [true, true]);

console.log('\n' + '='.repeat(76));
checa('nenhum erro de pagina', err.length, 0);
if (err.length) err.slice(0, 5).forEach(e => console.log('     ! ' + e));
await b.close(); morre();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('ATIVIDADE: gerar de novo nao derruba o que foi planejado a mao');
