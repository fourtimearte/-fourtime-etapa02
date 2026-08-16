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
    FT_DRIVE_CREDENCIAIS: '', FT_LOGIN_DESLIGADO: '' },
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

/* ---------- O DRIVE DE MENTIRA ----------
   O servidor sem credenciais nao chega ao Drive. Em vez de inventar um
   Google, as tres rotas do relatorio sao respondidas aqui, e o estado delas
   vive neste arquivo: assim da para dizer "agora mudou o pedido tal" e ver o
   que a fusao faz com isso. */
const DRIVE = {
  arquivos: [],          /* [{id,nome,dia,mod}] */
  conteudo: {},          /* id -> item do lote */
  semanas: {},           /* 'AAAA-MM-DD' -> doc guardado */
  aberturas: [],         /* ids abertos, para provar que a leitura e incremental */
};
await p.route('**/api/ft/atividade-lista*', async r => {
  await r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, arquivos: DRIVE.arquivos, total: DRIVE.arquivos.length }) });
});
await p.route('**/api/ft/atividade-lote', async r => {
  const corpo = JSON.parse(r.request().postData() || '{}');
  const itens = (corpo.arquivos || []).map(a => {
    DRIVE.aberturas.push(a.id);
    return Object.assign({}, DRIVE.conteudo[a.id], { id: a.id, mod: a.mod });
  }).filter(x => x.pedido !== undefined);
  await r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, itens, falhas: [] }) });
});
await p.route('**/api/ft/atividade-guardado*', async r => {
  const sem = new URL(r.request().url()).searchParams.get('semana') || '';
  const d = DRIVE.semanas[sem];
  await r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(d ? Object.assign({ ok: true, existe: true }, d)
                           : { ok: true, existe: false, semana: sem }) });
});
await p.route('**/api/ft/atividade-guardar', async r => {
  const c = JSON.parse(r.request().postData() || '{}');
  const salvoEm = new Date().toISOString();
  DRIVE.semanas[c.semana] = { semana: c.semana, linhas: c.linhas,
    vistos: c.vistos, salvoEm };
  await r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, salvoEm, nome: c.semana + '.fta' }) });
});

const SEMANA = '2026-08-17';   /* uma segunda-feira */
function pedido(n, dia, total, sub) {
  return { id: 'ID' + String(n).padStart(8, '0') + 'xx', pedido: 'PD00' + (4100 + n),
    arquivo: 'CLIENTE ' + n + '-PD00' + (4100 + n) + '.ft', cliente: 'CLIENTE ' + n,
    vendedor: 'Dani', envio: dia + '/08/2026', dia: 1,
    subPecas: sub, perPecas: total - sub, total };
}
function poeNoDrive(lista) {
  DRIVE.arquivos = lista.map((x, i) => ({ id: x.id, nome: x.arquivo, dia: 1, mod: 'm' + i }));
  DRIVE.conteudo = {}; lista.forEach(x => { DRIVE.conteudo[x.id] = x; });
}

const entra = async (u, senha) => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.fill('#u', u); await p.fill('#s', senha); await p.click('#bt');
  await p.waitForTimeout(900);
};
const troca = async nova => { await p.fill('#n1', nova); await p.fill('#n2', nova);
  await p.click('#bt2'); await p.waitForTimeout(1400); };

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

await p.evaluate(s => { ATV.semana = s; }, SEMANA);
await p.click('#ftRailAtv');
await p.waitForTimeout(600);
checa('a pagina abre', await p.evaluate(() => !document.getElementById('atvPage').hidden), true);
checa('  e o orcamento sai da frente',
  await p.evaluate(() => document.querySelector('.area-paginas').style.display), 'none');

console.log('\n=== 2. A PRIMEIRA GERACAO ===');
/* seis pedidos, um por dia da semana */
await p.evaluate(() => { DRIVE_PRONTO = true; });
poeNoDrive([pedido(1, 17, 100, 100), pedido(2, 18, 200, 0), pedido(3, 19, 150, 150),
            pedido(4, 20, 300, 0), pedido(5, 21, 80, 80), pedido(6, 22, 120, 60)]);
await p.evaluate(() => atvGera());
await p.waitForTimeout(1200);
r = await p.evaluate(() => ({
  linhas: ATV.linhas.length,
  dias: [...document.querySelectorAll('.atv-dia')].length,
  novos: ATV.linhas.filter(l => l.novo).length,
  pecas: ATV.linhas.reduce((a, l) => a + l.total, 0),
  planos: ATV.linhas.map(l => l.plan).sort(),
}));
console.log('     ' + JSON.stringify(r));
checa('os seis pedidos entraram', r.linhas, 6);
checa('  um por dia da semana', r.planos,
  ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22']);
checa('  950 pecas somadas', r.pecas, 950);
/* A PRIMEIRA GERACAO NAO PINTA NADA DE VERDE. Sem salvamento anterior nao
   ha "desde a ultima vez": pintar as seis linhas nao diria nada a ninguem. */
checa('nada e marcado como novo na primeira vez', r.novos, 0);
checa('  e nao ha nenhuma linha verde na tela',
  await p.evaluate(() => document.querySelectorAll('.atv-linha.novo').length), 0);

console.log('\n=== 3. O PLANEJAMENTO A MAO ===');
await p.evaluate(() => {
  ATV.linhas[0].plan = '2026-08-21';     /* movido da segunda para a sexta */
  ATV.linhas[1].etapa = 'prensa';
  ATV.linhas[2].etapa = 'finalizado';
  ATV.sujo = true; atvDesenha();
});
checa('a tela avisa que ha coisa nao salva',
  await p.evaluate(() => !!document.querySelector('.atv-selo.sujo')), true);
/* O BOTAO, E NAO A FUNCAO. Chamar atvSalva() na mao provaria que a funcao
   funciona, que nunca foi a duvida. O que quebrou de verdade foi o caminho
   do clique ate o aviso na tela. */
await p.click('#miAtvSalvar');
await p.waitForTimeout(900);
checa('salvou', await p.evaluate(() => !!ATV.salvoEm), true);
checa('  e a tela AVISA que salvou',
  await p.evaluate(() => {
    const t = document.body.textContent;
    return t.includes('Planejamento salvo') || !!document.querySelector('.atv-selo.salvo');
  }), true);
await p.evaluate(() => { if (window.ftStatus) ftStatus.fecha(); });
await p.waitForTimeout(400);
checa('  e o selo de salvo fica na tela depois do aviso fechar',
  await p.evaluate(() => (document.querySelector('.atv-selo.salvo') || {}).textContent || ''),
  'salvo ' + await p.evaluate(() => atvQuando(ATV.salvoEm)));
checa('  e o aviso de nao salvo sumiu',
  await p.evaluate(() => !!document.querySelector('.atv-selo.sujo')), false);
checa('  o arquivo da semana guardou o plano e a etapa',
  [DRIVE.semanas[SEMANA].linhas[0].plan, DRIVE.semanas[SEMANA].linhas[1].etapa],
  ['2026-08-21', 'prensa']);

console.log('\n=== 4. GERAR DE NOVO NAO DERRUBA O PLANEJAMENTO ===');
/* o pedido 1 e alterado no Drive: o cliente muda, as pecas mudam, e a data
   de envio volta para segunda. O plano dele continua sexta, porque alguem
   decidiu isso. */
const antes = { ...DRIVE.conteudo['ID00000001xx'] };
DRIVE.conteudo['ID00000001xx'] = { ...antes, cliente: 'CLIENTE 1 RENOMEADO', total: 999, subPecas: 999, perPecas: 0 };
DRIVE.arquivos.find(a => a.id === 'ID00000001xx').mod = 'MUDOU';
/* e chegam dois pedidos novos */
DRIVE.arquivos.push({ id: 'IDNOVO0001xx', nome: 'n1.ft', dia: 1, mod: 'n1' },
                    { id: 'IDNOVO0002xx', nome: 'n2.ft', dia: 1, mod: 'n2' });
DRIVE.conteudo['IDNOVO0001xx'] = { ...pedido(7, 19, 70, 70), id: 'IDNOVO0001xx' };
DRIVE.conteudo['IDNOVO0002xx'] = { ...pedido(8, 20, 90, 0), id: 'IDNOVO0002xx' };
DRIVE.aberturas = [];
await p.evaluate(() => atvGera());
await p.waitForTimeout(1400);
r = await p.evaluate(() => {
  const l1 = ATV.linhas.find(l => l.id === 'ID00000001xx');
  return { linhas: ATV.linhas.length,
    plano1: l1.plan, cliente1: l1.cliente, total1: l1.total, entrega1: l1.entrega,
    etapa2: (ATV.linhas.find(l => l.id === 'ID00000002xx') || {}).etapa,
    novos: ATV.linhas.filter(l => l.novo).map(l => l.id).sort() };
});
console.log('     ' + JSON.stringify(r));
console.log('     abriu do Drive: ' + JSON.stringify(DRIVE.aberturas.sort()));
checa('os dois novos entraram', r.linhas, 8);
checa('O PLANO FEITO A MAO CONTINUA DE PE', r.plano1, '2026-08-21');
checa('  mesmo com a entrega tendo voltado para 17/08', r.entrega1, '17/08/2026');
checa('a etapa escolhida a mao continua', r.etapa2, 'prensa');
checa('mas o que vem do orcamento foi reescrito',
  [r.cliente1, r.total1], ['CLIENTE 1 RENOMEADO', 999]);

console.log('\n=== 5. O QUE CHEGOU DEPOIS DO SALVAMENTO FICA MARCADO ===');
checa('so os dois novos ficam marcados', r.novos, ['IDNOVO0001xx', 'IDNOVO0002xx']);
checa('  e sao duas linhas verdes na tela',
  await p.evaluate(() => document.querySelectorAll('.atv-linha.novo').length), 2);
checa('  o cabecalho conta os novos',
  await p.evaluate(() => (document.querySelector('.atv-selo.novo') || {}).textContent || ''),
  '2 pedidos novos desde o último salvamento');
/* a cor precisa ser dark teal de verdade, e nao "alguma cor": o pedido foi
   explicito, e um verde qualquer se confunde com "finalizado" */
checa('  a marca e dark teal',
  await p.evaluate(() => {
    const l = document.querySelector('.atv-linha.novo');
    return !!l && getComputedStyle(l).boxShadow.includes('rgb(17, 94, 89)');
  }), true);

console.log('\n=== 6. SALVAR APAGA A MARCA ===');
await p.evaluate(() => atvSalva());
await p.waitForTimeout(700);
checa('depois de salvar, nada esta marcado',
  await p.evaluate(() => document.querySelectorAll('.atv-linha.novo').length), 0);
DRIVE.aberturas = [];
await p.evaluate(() => atvGera());
await p.waitForTimeout(1200);
checa('  e gerar de novo tambem nao remarca',
  await p.evaluate(() => ATV.linhas.filter(l => l.novo).length), 0);

console.log('\n=== 7. A LEITURA E INCREMENTAL ===');
console.log('     abriu do Drive: ' + JSON.stringify(DRIVE.aberturas));
checa('nada mudou, entao nada foi aberto de novo', DRIVE.aberturas.length, 0);
DRIVE.arquivos.find(a => a.id === 'ID00000004xx').mod = 'OUTRO';
DRIVE.aberturas = [];
await p.evaluate(() => atvGera());
await p.waitForTimeout(1000);
checa('  so o arquivo que mudou e reaberto', DRIVE.aberturas, ['ID00000004xx']);

console.log('\n=== 8. O QUE SOBROU DA SEMANA PASSADA CAI NA SEGUNDA ===');
DRIVE.semanas['2026-08-10'] = { semana: '2026-08-10',
  salvoEm: '2026-08-15T12:00:00.000Z', vistos: {},
  linhas: [{ id: 'IDVELHO001xx', pedido: 'PD004000', cliente: 'ATRASADO SA',
             entrega: '14/08/2026', plan: '2026-08-14', etapa: 'costura',
             sub: 50, per: 0, total: 50, chegouEm: '2026-08-10T10:00:00.000Z' },
           { id: 'IDVELHO002xx', pedido: 'PD004001', cliente: 'ENTREGUE SA',
             entrega: '13/08/2026', plan: '2026-08-13', etapa: 'finalizado',
             sub: 30, per: 0, total: 30, chegouEm: '2026-08-10T10:00:00.000Z' }] };
const segundaAntes = await p.evaluate(() =>
  atvSoma(ATV.linhas.filter(l => l.plan === '2026-08-17')));
await p.evaluate(() => atvGera());
await p.waitForTimeout(1200);
r = await p.evaluate(() => {
  const seg = document.querySelector('.atv-dia[data-dia="2026-08-17"]');
  const velho = ATV.linhas.find(l => l.id === 'IDVELHO001xx') || {};
  return {
    grupoAtraso: document.querySelectorAll('.atv-dia[data-dia="atraso"]').length,
    plan: velho.plan, tarja: !!velho.atrasado,
    /* PRIMEIRO DA FILA: o que atrasou sai antes do que nasceu no dia */
    primeiro: seg.querySelector('.atv-linha').dataset.id,
    temTarja: !!seg.querySelector('.atv-linha .atv-atraso'),
    noCabecalho: (seg.querySelector('.atv-dia-cab .atv-atraso') || {}).textContent || '',
    somaSegunda: atvSoma(ATV.linhas.filter(l => l.plan === '2026-08-17')),
    total: ATV.linhas.length,
  };
});
console.log('     antes a segunda somava ' + segundaAntes + '; ' + JSON.stringify(r));
checa('nao existe mais um grupo de atrasados a parte', r.grupoAtraso, 0);
checa('o atrasado foi para a segunda', r.plan, '2026-08-17');
checa('  com a tarja de atrasado', [r.tarja, r.temTarja], [true, true]);
checa('  e primeiro da fila do dia', r.primeiro, 'IDVELHO001xx');
checa('  o cabecalho do dia avisa', r.noCabecalho, '1 da semana passada');
/* O MOTIVO DE TUDO: um pedido atrasado e trabalho que a fabrica vai fazer.
   Fora de um dia, ele nao entrava na conta de dia nenhum e a saturacao da
   segunda mentia para menos. */
checa('  e as 50 pecas dele entram na conta da segunda',
  r.somaSegunda, segundaAntes + 50);
checa('o finalizado NAO desce', r.total, 9);

console.log('\n=== 9. ARRASTAR MUDA O DIA ===');
await p.evaluate(() => { document.getElementById('atvPage').scrollTop = 0; });
await p.waitForTimeout(200);
const alvoDia = '2026-08-22';
const caixa = await p.evaluate(() => {
  const l = document.querySelector('.atv-linha[data-id="ID00000002xx"]');
  const a = l.querySelector('.atv-puxador').getBoundingClientRect();
  return { ax: a.x + a.width / 2, ay: a.y + a.height / 2 };
});
const planoAntes = await p.evaluate(() => ATV.linhas.find(l => l.id === 'ID00000002xx').plan);
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
r = await p.evaluate(() => ({
  plano: ATV.linhas.find(l => l.id === 'ID00000002xx').plan,
  sujo: ATV.sujo,
  sobrou: document.querySelectorAll('.atv-voando,.atv-linha.fantasma,.atv-buraco').length,
  etapa: ATV.linhas.find(l => l.id === 'ID00000002xx').etapa,
}));
console.log('     antes=' + planoAntes + '  ' + JSON.stringify(r));
checa('durante o arrasto existe o clone voando', meio.voando, 1);
checa('  a original vira fantasma', meio.fantasma, 1);
checa('  e o destino abre um buraco', buraco > 0, true);
checa('o dia mudou de verdade', r.plano, alvoDia);
checa('  a tela marca que ha coisa a salvar', r.sujo, true);
checa('  a etapa nao foi junto', r.etapa, 'prensa');
checa('nada sobrou voando depois de soltar', r.sobrou, 0);

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
   vao dele, e o que ela deixou de gastar em altura pagou o cabecalho. O
   numero e medido a cada rodada justamente para nao ser suposto. */
checa('com etapa em toda linha, a folha vira em 25 pedidos', virada.comChip.corte, 25);
checa('  sem etapa, vira em 26', virada.semChip.corte, 26);
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

console.log('\n=== 12. TROCAR DE SEMANA LIMPA A TELA ===');
await p.evaluate(() => { ATV.sujo = false; });
await p.click('#atvAnterior');
await p.waitForTimeout(800);
r = await p.evaluate(() => ({ semana: ATV.semana, linhas: ATV.linhas.length,
  tit: document.getElementById('atvSemTit').textContent }));
console.log('     ' + JSON.stringify(r));
checa('a semana anterior e a de 10/08', r.semana, '2026-08-10');
checa('  e ela traz o que estava salvo nela', r.linhas, 2);
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

console.log('\n=== 13b. AS MUDANCAS DA v3.316 ===');
/* As sete coisas pedidas de uma vez. Sao conferidas JUNTAS de proposito:
   quase todas moram na mesma linha da tabela, e o que quebra uma quebra a
   do lado (uma coluna a mais desloca todas as outras). */
r = await p.evaluate(() => {
  ATV.linhas = [
    /* plan IGUAL ao envio: nao mudou de data */
    { id: 'V1', pedido: 'PD009001', cliente: 'CLIENTE A', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-17', etapa: 'corte',
      departamento: 'DTF + Silk', sub: 60, per: 40, total: 100, chegouEm: '', novo: false },
    /* plan DIFERENTE do envio: mudou */
    { id: 'V2', pedido: 'PD009002', cliente: 'CLIENTE B', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-19', etapa: 'futurize',
      departamento: 'Sublimação', sub: 10, per: 0, total: 10, chegouEm: '', novo: false },
    /* atrasado e SEM etapa escolhida: a etiqueta tem de aparecer sozinha */
    { id: 'V3', pedido: 'PD009003', cliente: 'CLIENTE C', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-17', etapa: '', atrasado: true,
      departamento: 'DTF', sub: 5, per: 0, total: 5, chegouEm: '', novo: false },
    /* atrasado MAS com etapa escolhida: a escolha do operador vence */
    { id: 'V4', pedido: 'PD009004', cliente: 'CLIENTE D', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-17', etapa: 'costura', atrasado: true,
      departamento: 'Silk', sub: 5, per: 0, total: 5, chegouEm: '', novo: false },
    /* etapa de arquivo antigo, que saiu da lista */
    { id: 'V5', pedido: 'PD009005', cliente: 'CLIENTE E', vendedor: 'Dani',
      entrega: '17/08/2026', plan: '2026-08-17', etapa: 'separacao',
      departamento: 'DTF', sub: 5, per: 0, total: 5, chegouEm: '', novo: false },
  ];
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
checa('as treze etapas, na ordem pedida', r.etapas,
  ['Corte', 'Impressão sublimação', 'Impressão DTF', 'Prensa DTF', 'Silk', 'Calandra',
   'Futurize', 'Conferência', 'Cd costura', 'Costura', 'Embalagem', 'Atrasado', 'Finalizado']);
/* ATRASADO nao se escolhe: ela acontece. Oferecer o botao criaria duas
   verdades sobre a mesma linha. */
checa('  o menu oferece doze, sem Atrasado', r.noMenu,
  ['Corte', 'Impressão sublimação', 'Impressão DTF', 'Prensa DTF', 'Silk', 'Calandra',
   'Futurize', 'Conferência', 'Cd costura', 'Costura', 'Embalagem', 'Finalizado', 'sem etapa']);
checa('a etapa escolhida aparece', [r.chips.V1, r.chips.V2], ['Corte', 'Futurize']);
checa('  atrasado sem etapa vira Atrasado sozinho', r.chips.V3, 'Atrasado');
checa('  mas a escolha do operador vence o atraso', r.chips.V4, 'Costura');
/* uma semana ja salva nao pode perder o planejamento so porque a lista de
   etapas mudou: a etapa antiga continua desenhada, tracejada */
checa('  etapa de arquivo antigo nao some', r.chips.V5, 'Separação');
checa('    e vem marcada como fora da lista', r.velha, true);
checa('negrito no numero do pedido', r.pesoPed, '700');
checa('  e no total de pecas', r.pesoTot, '700');
checa('planejamento na data do envio: sem destaque', r.planParado[0] === '700', false);
checa('  planejamento que mudou: negrito', r.planMudou[0], '700');
checa('  e vermelho', r.planMudou[1], 'rgb(198, 22, 27)');
checa('trilho vertical antes de Total, Subl. e Person.',
  r.trilhos.map(t => /rgb\(240, 195, 197\)|rgb\(187, 211, 242\)|rgb\(240, 220, 182\)/.test(t)),
  [true, true, true]);
/* O DEFEITO QUE ELE VIU: o ponto colorido empurrava o texto 11px para a
   direita e a pastilha ficava torta em TODAS as etapas. Aqui a folga dos
   dois lados tem de ser a mesma, e nao "parecida". */
checa('a pastilha tem a mesma folga dos dois lados',
  r.folgas.map(f => f[0] === f[1]), [true, true, true]);
checa('o submenu conta pela mesma regra da etiqueta', r.lateral.indexOf('Atrasado=1') >= 0, true);
checa('  e mostra a etapa antiga so porque ainda ha alguem nela',
  r.lateral.indexOf('Separação=1') >= 0, true);

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
