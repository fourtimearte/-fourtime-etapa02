/* ================================================================
   O NIVEL EXTREMO, NUMA SUITE SO

   Aqui esta tudo o que, se quebrar sem ninguem perceber, custa caro:
   perde dado, tranca gente do lado de fora, ou faz o sistema mentir
   numero. Antes eram nove arquivos separados, 195s de bateria.

   O QUE ERA REDUNDANTE, E POR QUE CUSTAVA TANTO

   Nao eram as CONFERENCIAS que se repetiam. Era o PREPARO. Medido:

       carregar a tela de login .......... 12,8s
       carregar o editor ................. 11,7s
       um ciclo de login pela interface .. 27,0s
       a mesma preparacao pela API ........ 0,2s

   As nove suites faziam 18 ciclos de login pela interface, quase todos
   so para chegar ao estado em que a conferencia de verdade comecava.
   Eram 486s gastos em preparo, e nao em teste.

   A SEPARACAO QUE RESOLVEU

   Duas perguntas diferentes, dois jeitos de responder:

     A VERDADE DO SERVIDOR e quem pode o que. Isso se pergunta ao
     servidor, com fetch, sem navegador nenhum: 50ms por resposta. Nao
     ha por que carregar 1,3MB de editor para descobrir que um vendedor
     leva 403 no relatorio.

     O COMPORTAMENTO DA TELA e o que o editor faz com uma identidade.
     Isso precisa do editor carregado, mas nao precisa de um editor POR
     PESSOA: uma pagina so, e a identidade trocada em memoria. E a
     identidade injetada nao e inventada, e a resposta de verdade do
     /api/auth/eu daquela pessoa. O servidor continua sendo a fonte.

   O que NAO foi encurtado: a porta inteira, uma vez, pela interface de
   verdade. Login com a senha de partida, troca obrigatoria, editor
   abrindo. Essa corrente precisa ser provada de ponta a ponta, e um
   fetch nao prova.

   ORDEM: os blocos de arquivo (compatibilidade e login de admin) nao
   usam o servidor e comecam junto, no comeco, em paralelo com o resto.
   ================================================================ */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { spawn, execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const DIR    = import.meta.dirname + '/';
const CACHE  = DIR + 'fontes-cache/';
const ARQ    = process.env.FT_ARQ || editorAtual();
const VER    = (readFileSync(DIR + ARQ, 'utf8').match(/const\s+FT_EDITOR\s*=\s*'([\d.]+)'/) || [])[1];
const PORTA  = 9500 + (process.pid % 300);
const BASE   = 'http://127.0.0.1:' + PORTA;
const S_ADMIN = '21560110', S_EQUIPE = '2026@Fourtime';
const CAB = { 'Content-Type': 'application/json', 'X-FT-Editor': VER };

const falhas = [], err = [];
let contaOk = 0;
function checa(rot, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${rot.padEnd(58)} obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
  if (ok) contaOk++; else falhas.push(rot);
}
let _t0 = Date.now(), _tb = Date.now();
const titulo = t => {
  const d = ((Date.now() - _tb) / 1000).toFixed(1); _tb = Date.now();
  console.log(`\n=== ${t} ===   (o bloco anterior levou ${d}s)`);
};

/* ---------------- o servidor, um so ---------------- */
const srv = spawn('python3', ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1',
  '--port', String(PORTA), '--log-level', 'warning'], {
  cwd: DIR,
  env: { ...process.env,
    FT_DB_PATH: join(mkdtempSync(join(tmpdir(), 'ftx-')), 't.db'),
    FT_TOKEN: S_EQUIPE, FT_ADMIN_TOKEN: S_ADMIN,
    FT_DRIVE_CREDENCIAIS: '', FT_LOGIN_DESLIGADO: '' },
  stdio: ['ignore', 'pipe', 'pipe'] });
srv.stderr.on('data', d => { const t = String(d);
  if (/Error|Traceback/.test(t)) console.log('  [servidor] ' + t.slice(0, 300)); });
const morre = () => { try { srv.kill('SIGKILL'); } catch (e) {} };
process.on('exit', morre);
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(BASE + '/api/auth/eu'); if (r.status === 401 || r.ok) break; }
  catch (e) {} await new Promise(s => setTimeout(s, 200));
}

/* ---------------- conversar com o servidor sem navegador ----------------
   Um pote de biscoitos por pessoa. E tudo o que separa "logado" de
   "nao logado" quando nao ha navegador no meio. */
async function pede(cookie, metodo, url, corpo) {
  const r = await fetch(BASE + url, { method: metodo,
    headers: { ...CAB, ...(cookie ? { cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo), redirect: 'manual' });
  let json = null; try { json = await r.json(); } catch (e) {}
  const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  return { status: r.status, json,
           cookie: set.map(x => x.split(';')[0]).join('; ') || cookie };
}
async function entraApi(u, senha) {
  const r = await pede('', 'POST', '/api/auth/login', { usuario: u, senha });
  return { ...r, u };
}

const SENHAS = {};   /* usuario -> senha definitiva */
const SESSAO = {};   /* usuario -> cookie */

/* ---------------- o navegador, um so ---------------- */
const nav = await abreNavegador();
const novaAba = async (viewport) => {
  const ctx = await nav.newContext({ viewport: viewport || { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(90000); p.setDefaultNavigationTimeout(90000);
  p.on('pageerror', e => err.push(String(e).slice(0, 200)));
  return { ctx, p };
};
const comFontes = async p => {
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200,
    contentType: 'text/css', body: readFileSync(CACHE + 'plex.css', 'utf8') }));
  await p.route('**://fonts.gstatic.com/**', r => {
    const n = CACHE + r.request().url().split('/').pop();
    if (!existsSync(n)) return r.abort();
    r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(n) });
  });
};

console.log(`\nservindo ${ARQ} (v${VER}) em ${BASE}`);

/* ================================================================
   OS BLOCOS DE ARQUIVO COMECAM AGORA, EM PARALELO

   Nenhum dos dois usa o servidor: um abre editores antigos do disco, o
   outro finge o servidor remoto dentro da propria pagina. Enquanto o
   bloco da porta gasta os 27s dele carregando o editor, estes dois ja
   estao rodando. As respostas sao recolhidas no fim.
   ================================================================ */
/* MEDIDO, E NAO SUPOSTO. A maquina tem 2 nucleos, e a intuicao dizia que
   tres paginas Chromium ao mesmo tempo iam brigar e piorar o total. Foi o
   contrario: com os dois blocos de arquivo correndo JUNTOS ao lado do
   fluxo principal deu 147s; enfileirando um depois do outro deu 181s.
   Estes blocos passam a maior parte do tempo esperando pagina carregar, e
   nao ocupando nucleo. */
const fila = [];

/* ---- COMPATIBILIDADE: o .ft das versoes anteriores ----

   ANTES: abria seis editores antigos, 1,3MB cada, mandava cada um montar
   um orcamento de teste, e so entao abria o resultado no editor novo. Era
   o bloco mais caro da suite, e o unico que segurava o relogio.

   O que aquilo tinha de errado: a v279 e um arquivo CONGELADO. Ela produz
   a mesma saida hoje, amanha e daqui a tres anos. Carregar o editor dela a
   cada rodada era pagar de novo por bytes que nunca mudam.

   AGORA: o que esta guardado nao e o editor antigo, e o ARQUIVO que ele
   produzia. Seis amostras em compat-amostras/, geradas uma vez por
   gera_fixtures_compat.mjs, que abre as 54 versoes de verdade. Aqui elas
   entram numa pagina ja aberta, e a conferencia e a mesma de antes: o que
   a pessoa digitou na versao antiga tem de aparecer igual na versao nova.

   POR QUE SEIS, E NAO CINQUENTA E QUATRO. O gerador comparou a FORMA do
   arquivo das 54 versoes e achou duas. Rodando duas vezes, as duas formas
   cairam em grupos diferentes: a diferenca era sorteio do kit de teste, e
   nao evolucao do formato. Ou seja, o formato do .ft nao mudou em 54
   versoes, e as dezenas de voltas testavam a mesma coisa.

   As seis foram escolhidas por EPOCA, uma a cada quinze versoes, e nao
   pelo agrupamento. A forma nao enxerga o perigo maior: o campo continua
   la, com o mesmo tipo, e o SIGNIFICADO do valor muda. Um genero que era
   'M' e virou 'masculino' tem a mesma assinatura e quebra igual. Uma
   amostra por periodo cobre as convencoes daquele periodo.

   A VARREDURA PROFUNDA continua existindo, e e o proprio gerador: quando
   houver duvida, `node gera_fixtures_compat.mjs` abre as 54 versoes de
   verdade e refaz as amostras. Nao e coisa de bateria. */
fila.push(async () => {
  const t0 = Date.now();
  const linhas = [];
  const diz = (rot, o, e) => { const ok = JSON.stringify(o) === JSON.stringify(e);
    linhas.push(`  ${ok ? 'OK ' : 'FALHOU'}  ${rot.padEnd(58)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
    if (ok) contaOk++; else falhas.push('[compat] ' + rot); };

  const RESUMO = `(()=>{
    const est=coletaEstado(); const h=est.header||{};
    return {
      header:['cliente','cpf','vendedor','departamento','embalagem','pagamento','entrega','envio','pedido','prazo']
        .reduce((o,k)=>(o[k]=h[k]===undefined?null:h[k],o),{}),
      layouts:(est.layouts||[]).map(L=>({
        ref:L.ref||'', genero:L.genero||'', tecidos:(L.tecidos||[]).filter(Boolean),
        cor:L.cor||'', grade:L.grade||'', obs:(L.obs||'').replace(/<[^>]*>/g,'').trim(),
        temImg:!!L.img,
        design:(L.design||[]).map(d=>d.tag+'['+((d.cores||[]).join(','))+']').sort(),
        tamanhos:Object.keys(L.tamanhos||{}).sort().map(t=>t+':'+(L.tamanhos[t].q||'')+'/'+(L.tamanhos[t].u||''))
      })),
      ajustes:(est.ajustes||[]).map(a=>JSON.stringify(a)),
      pecas:document.querySelector('.rt-pecas')?document.querySelector('.rt-pecas').textContent:null,
      total:document.querySelector('.rt-geral')?document.querySelector('.rt-geral').textContent:null
    };
  })()`;

  const PASTA = DIR + 'compat-amostras/';
  const amostras = existsSync(PASTA)
    ? readdirSync(PASTA).filter(n => /^v\d+\.json$/.test(n)).sort()
    : [];
  diz('as amostras de compatibilidade estao na pasta', amostras.length >= 4, true);
  if (!amostras.length) {
    linhas.push('  ! rode `node gera_fixtures_compat.mjs` para criar as amostras');
    return { nome: 'COMPATIBILIDADE DOS .ft', linhas };
  }
  linhas.push('  (' + amostras.length + ' amostras: '
    + amostras.map(n => n.replace('.json', '')).join(' ') + ')');

  const { ctx, p } = await novaAba({ width: 1400, height: 900 });
  await p.goto(pathToFileURL(DIR + ARQ).href, { waitUntil: 'domcontentloaded' });
  await esperaPronto(p, null, 90000);

  /* ESPERAR O SINAL, E NAO O RELOGIO: o documento assentou quando para de
     mudar, ou seja, duas leituras iguais seguidas do mesmo resumo que a
     comparacao vai usar. Antes eram 4,2s fixos por volta. */
  const assenta = async minimo => {
    let ant = null;
    for (let i = 0; i < 60; i++) {
      const agora = await p.evaluate(R => JSON.stringify(eval(R)), RESUMO);
      if (ant === agora && (!minimo || JSON.parse(agora).layouts.length >= minimo))
        return JSON.parse(agora);
      ant = agora;
      await p.waitForTimeout(120);
    }
    return JSON.parse(ant);
  };
  const virgem = await assenta();

  for (const nome of amostras) {
    const rot = nome.replace('.json', '');
    const dados = JSON.parse(readFileSync(PASTA + nome, 'utf8'));

    /* ZERAR ANTES, E CONFERIR QUE ZEROU. A pagina e reaproveitada entre as
       amostras; sem isto, sobra da volta anterior poderia fazer a
       comparacao bater por acaso, e um teste que bate por acaso e pior que
       teste nenhum. A referencia de "vazio" e o documento recem-aberto, e
       nao zero layouts: o editor sempre mantem um layout em branco. */
    await p.evaluate(() => aplicaEstado({ header: {}, layouts: [], ajustes: [] }));
    diz(rot + ': o documento voltou ao estado virgem', await assenta(), virgem);

    await p.evaluate(arq => aplicaEstado(arq), dados.arquivo);
    const depois = await assenta(dados.resumo.layouts.length);
    const folha = await p.evaluate(() => ({
      versao: FT_EDITOR, folhas: document.querySelectorAll('.folha-a4').length,
      estouro: [...document.querySelectorAll('.folha-a4')].map(f => +excedeFolha(f).toFixed(1)) }));

    diz(rot + ':   abriu na v' + VER, folha.versao, VER);
    diz(rot + ':   cabecalho identico', depois.header, dados.resumo.header);
    diz(rot + ':   mesmo numero de layouts',
      depois.layouts.length, dados.resumo.layouts.length);
    for (let i = 0; i < dados.resumo.layouts.length; i++)
      diz(rot + ':   layout ' + (i + 1) + ' identico',
        depois.layouts[i], dados.resumo.layouts[i]);
    diz(rot + ':   ajustes de valor preservados', depois.ajustes, dados.resumo.ajustes);
    diz(rot + ':   pecas e total batem',
      [depois.pecas, depois.total], [dados.resumo.pecas, dados.resumo.total]);
    diz(rot + ':   nenhuma folha estourada', folha.estouro.every(v => v <= 0.5), true);
  }
  await ctx.close();
  return { nome: 'COMPATIBILIDADE DOS .ft ('
    + ((Date.now() - t0) / 1000).toFixed(1) + 's)', linhas };
});


/* ---- LOGIN DE ADMINISTRADOR: modal, localStorage e as tres falhas ---- */
fila.push(async () => {
  const linhas = [];
  const diz = (rot, o, e) => { const ok = JSON.stringify(o) === JSON.stringify(e);
    linhas.push(`  ${ok ? 'OK ' : 'FALHOU'}  ${rot.padEnd(58)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
    if (ok) contaOk++; else falhas.push('[admin] ' + rot); };
  const t0 = Date.now();
  const SENHA_CERTA = 'senha-de-teste-2026';
  const servidor = { modo: 'normal' };   /* normal | token-invalido | fora-do-ar */
  const { ctx, p } = await novaAba({ width: 1500, height: 950 });
  await p.route('**/fourtime-etapa02.onrender.com/**', async rota => {
    const req = rota.request();
    const cam = new URL(req.url()).pathname;
    const adm = (req.headers()['x-ft-admin'] || '').trim();
    const json = (o, st) => rota.fulfill({ status: st || 200,
      contentType: 'application/json', body: JSON.stringify(o) });
    if (servidor.modo === 'fora-do-ar') return rota.abort('failed');
    if (servidor.modo === 'token-invalido') return json({ detail: 'token' }, 401);
    if (cam === '/api/ping') return json({ ok: true });
    if (cam === '/api/versao') return json({ editor: VER });
    if (cam === '/api/db/rev') return json({ rev: 1 });
    if (cam === '/api/db') return json({ data: {}, rev: 1 });
    if (cam === '/api/db/sou-admin')
      return json({ admin: adm === SENHA_CERTA, admin_configurado: true });
    return json({});
  });
  await p.goto(pathToFileURL(DIR + ARQ).href, { waitUntil: 'domcontentloaded' });
  await esperaPronto(p, null, 90000);
  /* MAQUINA NOVA: e a condicao em que o defeito aparecia. Quem ja era
     admin carregava a senha do localStorage desde antes da mudanca, e por
     isso nao via nada de errado.

     O teste antigo limpava o localStorage e RECARREGAVA para chegar nesse
     estado. Aqui a aba nasce num contexto proprio, e contexto novo ja vem
     sem localStorage nenhum: a maquina ja e nova. O recarregamento custava
     um editor inteiro para chegar onde a pagina ja estava. */
  diz('a aba nasce como maquina nova, sem senha guardada',
    await p.evaluate(() => localStorage.getItem('ft_sync_admin')), null);

  const abre = async () => { await p.evaluate(() => loginAbre()); await p.waitForTimeout(350); };
  const estado = () => p.evaluate(() => ({
    ehAdmin: FT_SYNC.ehAdmin, on: FT_SYNC.on,
    gravado: localStorage.getItem('ft_sync_admin'),
    msg: document.getElementById('ftLoginMsg')?.textContent || '',
    tipo: document.getElementById('ftLoginMsg')?.dataset.tipo || '',
    botao: document.querySelector('#ftLoginCorpo #ftSyncBtn')?.textContent || '',
    papel: document.querySelector('#ftLoginCorpo .bd-sync-papel')?.textContent || '',
    aberto: document.getElementById('ftLoginFundo').classList.contains('on') }));
  /* ESPERA O SERVIDOR RESPONDER, e nao um relogio.
     Cada Enter aqui e uma ida de verdade ao uvicorn local. As esperas fixas
     de 600 e 900 ms davam conta sozinhas, mas na bateria (duas suites de
     uma vez, mais o navegador) a ida passava disso e a suite falhava com
     ehAdmin=false, sempre so na linha do sucesso. O sinal honesto e o
     proprio FT_SYNC.ehAdmin virar. Se ele nao virar, o tempo estoura e a
     conferencia falha dizendo exatamente o que viu. */
  const esperaAdmin = async (v, ms = 8000) => {
    try { await p.waitForFunction(q => FT_SYNC.ehAdmin === q, v, { timeout: ms }); }
    catch (erro) { /* segue e deixa a conferencia mostrar o estado real */ }
  };
  const digita = async txt => {
    await p.click('#ftLoginCorpo #ftSyncAdmin');
    await p.evaluate(() => { document.querySelector('#ftLoginCorpo #ftSyncAdmin').value = ''; });
    if (txt) await p.type('#ftLoginCorpo #ftSyncAdmin', txt);
  };

  /* 1. a ligacao existe MESMO. Foi a ausencia silenciosa dela, protegida
        por um `if (typeof bdLigaSync === 'function')`, que deixou o modal
        sem comportamento nenhum: digitar a senha e dar Enter nao fazia nada */
  const ligacao = await p.evaluate(async () => {
    const t = typeof window.bdLigaSync;
    loginAbre(); await new Promise(s => setTimeout(s, 300));
    const cx = document.getElementById('ftLoginCorpo');
    return { tipo: t, botaoLigado: !!cx.querySelector('#ftSyncBtn')?.onclick,
             campo: !!cx.querySelector('#ftSyncAdmin'),
             recado: !!cx.querySelector('#ftLoginMsg') };
  });
  diz('bdLigaSync existe de verdade', ligacao.tipo, 'function');
  diz('  o botao do modal tem comportamento', ligacao.botaoLigado, true);
  diz('  e existe onde escrever a resposta', [ligacao.campo, ligacao.recado], [true, true]);

  await digita('chute-errado'); await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  let e = await estado();
  diz('senha errada avisa que esta errada', e.msg, 'Senha de administrador incorreta.');
  diz('  em vermelho', e.tipo, 'erro');
  diz('  nao virou admin', e.ehAdmin, false);
  diz('  e a senha errada NAO fica no localStorage', e.gravado, '');
  diz('  o modal continua aberto para tentar de novo', e.aberto, true);

  await digita(SENHA_CERTA); await p.keyboard.press('Enter');
  await esperaAdmin(true); await p.waitForTimeout(120);
  e = await estado();
  diz('a senha certa entra', e.ehAdmin, true);
  diz('  e diz que entrou', e.msg, 'Entrou como administrador.');
  diz('  fica guardada', e.gravado, SENHA_CERTA);
  diz('  o cracha muda', e.papel, 'ADMIN');
  diz('  e o botao vira a saida', e.botao, 'Sair do modo administrador');
  await p.waitForTimeout(900);
  diz('  o modal se fecha sozinho', (await estado()).aberto, false);

  await abre();
  await p.click('#ftLoginCorpo #ftSyncBtn');
  await esperaAdmin(false); await p.waitForTimeout(120);
  e = await estado();
  diz('sair deixa de ser admin', e.ehAdmin, false);
  diz('  a senha sai do localStorage', e.gravado, '');
  diz('  o cracha volta', e.papel, 'so leitura + adicao'.replace('so ', 'só ').replace('adicao', 'adição'));
  diz('  e o botao volta a Entrar', e.botao, 'Entrar');

  /* AS TRES FALHAS QUE NAO PODEM SER CONFUNDIDAS COM SENHA ERRADA.
     Acusar a senha quando o problema e outro manda a pessoa procurar no
     lugar errado, e ela vai tentar a mesma senha certa a tarde inteira. */
  await digita(''); await p.keyboard.press('Enter'); await p.waitForTimeout(350);
  e = await estado();
  diz('campo vazio pede a senha', e.msg, 'Digite a senha de administrador.');
  diz('  e nao vai ao servidor a toa', e.ehAdmin, false);

  servidor.modo = 'token-invalido';
  await digita(SENHA_CERTA); await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  e = await estado();
  diz('token da equipe invalido fala do TOKEN', e.msg,
    'O token da equipe está inválido. Fale com o administrador.');
  diz('  e o guardado volta ao que era antes', e.gravado, '');
  servidor.modo = 'normal';

  servidor.modo = 'fora-do-ar';
  await digita(SENHA_CERTA); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  e = await estado();
  diz('servidor fora do ar avisa em vermelho', e.tipo, 'erro');
  diz('  e nao acusa a senha', e.msg.indexOf('incorreta') < 0, true);
  servidor.modo = 'normal';

  /* o botao ao lado nasce escrito "Conectado" e o trabalho dele e
     DESCONECTAR: quem da Enter esperando entrar nao pode acabar saindo */
  await digita(SENHA_CERTA); await p.keyboard.press('Enter');
  await esperaAdmin(true); await p.waitForTimeout(120);
  e = await estado();
  diz('o Enter entra', e.ehAdmin, true);
  diz('  e a conexao continua de pe', e.on, true);

  await ctx.close();
  return { nome: 'LOGIN DE ADMINISTRADOR (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)', linhas };
});

/* A FILA DE ARQUIVO COMECA A CORRER AGORA, e nao uma linha antes.

   A primeira versao disto criava o corredor no topo, antes dos push: uma
   funcao async comeca a executar na hora em que e chamada, entao ele
   percorreu uma fila vazia, devolveu nada, e os dois blocos simplesmente
   nunca rodaram. O teste passou com 132 conferencias em vez de 242 e nao
   reclamou de nada, que e o pior jeito de um teste falhar. Por isso a
   contagem minima, mais abaixo, virou conferencia. */
const emParalelo = Promise.all(fila.map(f => f()));

/* ================================================================
   BLOCO 1: A PORTA, INTEIRA, UMA VEZ

   Este e o unico ciclo de login pela interface, e ele existe porque a
   corrente inteira precisa ser provada: tela de login -> senha de
   partida -> troca obrigatoria -> sessao -> editor servido. Um fetch
   prova o meio dela, nao as pontas.
   ================================================================ */
titulo('1. A PORTA: LOGIN, TROCA OBRIGATORIA E O EDITOR');
/* A PAGINA QUE SAI DAQUI E A MESMA QUE ATENDE OS BLOCOS 4 A 7.

   A primeira versao provava a porta com o Kev, fechava a aba, e abria
   outra do zero para o resto. Eram dois carregamentos do editor, 24s, e o
   segundo nao provava nada que o primeiro nao tivesse provado. Entra o
   Henrique: a corrente e a mesma (senha de partida, troca obrigatoria,
   editor), e no fim dela a pagina ja esta logada como admin, que e o que
   os blocos seguintes precisam. */
const { ctx: ctxEd, p: pEd } = await novaAba();
const pPorta = pEd;
await comFontes(pEd);
await pPorta.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
let r = await pPorta.evaluate(() => ({
  temLogin: !!document.getElementById('fLogin'),
  temEditor: !!document.querySelector('.folha-a4'),
  titulo: document.title }));
console.log('     ' + JSON.stringify(r));
checa('sem sessao, aparece a tela de login', r.temLogin, true);
checa('  e o editor NAO veio junto', r.temEditor, false);
checa('  nem no titulo', r.titulo, 'Fourtime - Entrar');
checa('  e o token da equipe nao esta escrito na pagina',
  (await pPorta.content()).includes(S_EQUIPE), false);

await pPorta.fill('#u', 'henrique'); await pPorta.fill('#s', S_ADMIN);
await pPorta.click('#bt');
/* O SINAL E A TELA TROCAR, E NAO 900ms.

   Com a bateria cheia, a resposta do login demorava mais que o prazo fixo
   e a conferencia da troca obrigatoria media a tela de login ainda no
   lugar. O sinal e o proprio painel de troca aparecer, ou o editor. */
await pPorta.waitForFunction(() =>
  !document.getElementById('fTroca').classList.contains('oculto')
  || !!document.querySelector('.folha-a4'), null, { timeout: 30000 });
r = await pPorta.evaluate(() => ({
  pediuTroca: !document.getElementById('fTroca').classList.contains('oculto'),
  sumiuOLogin: document.getElementById('fLogin').classList.contains('oculto'),
  entrouNoEditor: !!document.querySelector('.folha-a4') }));
console.log('     ' + JSON.stringify(r));
checa('a senha de partida para na troca obrigatoria', r.pediuTroca, true);
checa('  e nao deixa passar antes disso', r.entrouNoEditor, false);
/* a API tambem tem de recusar: uma trava que so existe na tela se
   contorna digitando o endereco. Cobrada com OUTRA pessoa, que nao trocou
   a senha nem vai trocar aqui. */
checa('  a API tambem recusa quem nao trocou',
  (await pede((await entraApi('kev', S_EQUIPE)).cookie, 'GET', '/api/db')).status, 403);

SENHAS.henrique = 'henrique-forte-2026';
await pPorta.fill('#n1', SENHAS.henrique); await pPorta.fill('#n2', SENHAS.henrique);
await pPorta.click('#bt2'); await pPorta.waitForTimeout(1400);
await esperaPronto(pPorta, null, 90000);
await pPorta.evaluate(() => document.fonts.ready);
checa('trocou a senha, e o editor abre',
  await pPorta.evaluate(() => !!document.querySelector('.folha-a4')), true);
checa('  o editor sabe quem entrou',
  await pPorta.evaluate(() => [FT_EU.nome, FT_EU.papel]), ['Henrique', 'admin']);

/* ================================================================
   BLOCO 2: TODO MUNDO COM SENHA, PELA API

   O que custava 27s por pessoa agora custa 0,2s. Feito de proposito
   DEPOIS do bloco 1: se a troca de senha pela interface estiver
   quebrada, o bloco 1 avisa antes de qualquer atalho ser usado.
   ================================================================ */
titulo('2. AS SENHAS, PELA API');
/* o Henrique ja trocou a senha no bloco 1, pela tela */
const GENTE = [['kev', S_EQUIPE], ['dani', S_ADMIN], ['patricia', S_EQUIPE],
               ['lucas', S_EQUIPE], ['fabricio', S_EQUIPE], ['dayane', S_EQUIPE]];
for (const [u, inicial] of GENTE) {
  const nova = u + '-forte-2026';
  const e = await entraApi(u, inicial);
  await pede(e.cookie, 'POST', '/api/auth/senha', { atual: inicial, nova });
  SENHAS[u] = nova;
}
for (const u of Object.keys(SENHAS)) SESSAO[u] = (await entraApi(u, SENHAS[u])).cookie;
/* A PATRICIA VIRA EDITORA. Na semente ela nasce vendedora; o papel editor
   existe justamente para ela, e e o unico jeito de exercitar a marca * no
   campo Vendedor. Feito pela API, como o admin faria na tela. */
await pede((await entraApi('henrique', SENHAS.henrique)).cookie, 'POST',
  '/api/auth/usuarios', { acao: 'papel', u: 'patricia', papel: 'editor' });
SESSAO.patricia = (await entraApi('patricia', SENHAS.patricia)).cookie;
const euDe = {};
for (const u of Object.keys(SESSAO))
  euDe[u] = (await pede(SESSAO[u], 'GET', '/api/auth/eu')).json.usuario;
checa('a Patricia e editora, e nao vende', [euDe.patricia.papel, euDe.patricia.vende],
  ['editor', false]);
console.log('     ' + Object.keys(SENHAS).map(u => u + ':' + euDe[u].papel).join('  '));
checa('todo mundo entrou e ninguem ficou preso na troca',
  Object.keys(SESSAO).filter(u => !SESSAO[u] || euDe[u].trocar), []);
checa('  e o hash da senha nunca sai do servidor',
  Object.values(euDe).some(x => 'senha' in x), false);

/* semeia o banco: a conferencia do financeiro precisa de item na lista */
await pede(SESSAO.henrique, 'PUT', '/api/db',
  { data: { tecidos: ['DRY FIT', 'PIQUET', 'HELANCA'] } });

/* ================================================================
   BLOCO 3: A MATRIZ DE PERMISSAO, NO SERVIDOR

   Esconder o botao na tela nao impede ninguem de digitar o endereco.
   Aqui cada pessoa bate em cada porta, e a resposta e comparada com a
   esperada. Sem navegador: sao 30 conferencias em menos de 2s.

   403 e "voce nao pode". Qualquer outra coisa (400, 502) e erro de
   Drive, que e outro assunto e nao interessa aqui.
   ================================================================ */
titulo('3. A MATRIZ DE PERMISSAO NO SERVIDOR');
const PORTAS = [
  ['GET',  '/api/db',                                'ver o banco'],
  ['GET',  '/api/ft/relatorio-periodos',             'Relatorio de Pedidos'],
  ['GET',  '/api/ft/atividade-lista?ano=2026&mes=8', 'ver a Atividade'],
  ['POST', '/api/ft/atividade-guardar',              'planejar a semana'],
  ['GET',  '/api/auth/usuarios',                     'administrar pessoas'],
];
const ESPERADO = {
  /*         banco  relatorio  atividade  planejar  pessoas */
  henrique: [true,  true,  true,  true,  true],
  kev:      [true,  false, false, false, false],
  patricia: [true,  false, false, false, false],
  dayane:   [true,  true,  false, false, false],
};
for (const u of Object.keys(ESPERADO)) {
  const obtido = [];
  for (const [m, url] of PORTAS) {
    const corpo = m === 'POST' ? { semana: '2026-08-17', linhas: [] } : undefined;
    const st = (await pede(SESSAO[u], m, url, corpo)).status;
    obtido.push(st !== 403);
  }
  console.log('     ' + u.padEnd(9) + ' ' + PORTAS.map((x, i) =>
    (obtido[i] ? ' sim' : ' NAO')).join(''));
  checa(u + ' (' + euDe[u].papel + ') bate certo em todas as portas',
    obtido, ESPERADO[u]);
}
/* O FINANCEIRO NAO LEVA 403 NO BANCO, E ISSO E DE PROPOSITO.

   Ela salva um cliente e o banco dela vai junto no mesmo pacote, como vai
   o de todo mundo. Recusar o pacote inteiro faria ela nao salvar cliente
   nenhum. O servidor aceita e DESCARTA em silencio so as categorias que
   nao sao dela. E essa a conferencia que vale, e nao o codigo HTTP. */
await pede(SESSAO.henrique, 'PUT', '/api/db',
  { data: { tecidos: ['DRY FIT', 'PIQUET', 'HELANCA'], clientes: [{ n: 'ANTIGO' }] } });
const posta = await pede(SESSAO.dayane, 'PUT', '/api/db',
  { data: { tecidos: ['ELA MEXEU'], clientes: [{ n: 'ANTIGO' }, { n: 'CLIENTE DELA' }] } });
const bancoAgora = (await pede(SESSAO.henrique, 'GET', '/api/db')).json.data || {};
console.log('     tecidos=' + JSON.stringify(bancoAgora.tecidos)
  + '  clientes=' + JSON.stringify((bancoAgora.clientes || []).map(c => c.n || c)));
checa('o pacote do financeiro e aceito', posta.status !== 403, true);
checa('  o cliente dela entra', (bancoAgora.clientes || []).length, 2);
checa('  e o banco dela e descartado em silencio',
  bancoAgora.tecidos, ['DRY FIT', 'PIQUET', 'HELANCA']);

checa('sem sessao nenhuma, a API recusa com 401',
  (await pede('', 'GET', '/api/db')).status, 401);
checa('  e o token publico nao abre mais nada',
  (await fetch(BASE + '/api/db', { headers: { ...CAB, 'X-FT-Token': S_EQUIPE } })).status, 401);

titulo('3b. A MARCA DE ATIVIDADE E DA PESSOA, NAO DO PAPEL');
let m = await pede(SESSAO.henrique, 'POST', '/api/auth/usuarios',
  { acao: 'atividade', u: 'patricia', atividade: true });
let pat = m.json.usuarios.find(x => x.u === 'patricia');
checa('o admin liga a marca', [m.status, pat.atividade], [200, true]);
checa('  ela entra no que a pessoa pode', pat.pode.includes('atividade'), true);
checa('  mas ela NAO planeja: isso e do admin', pat.planeja, false);
checa('  e o papel dela nao mudou', pat.papel, euDe.patricia.papel);
SESSAO.patricia = (await entraApi('patricia', SENHAS.patricia)).cookie;
checa('com a marca, ela ve a Atividade',
  (await pede(SESSAO.patricia, 'GET', '/api/ft/atividade-lista?ano=2026&mes=8')).status !== 403, true);
let g = await pede(SESSAO.patricia, 'POST', '/api/ft/atividade-guardar',
  { semana: '2026-08-17', linhas: [] });
checa('  ver nao e mexer: gravar continua 403', g.status, 403);
checa('  e a recusa explica que e do administrador',
  /administrador/.test(g.json.detail || ''), true);
await pede(SESSAO.henrique, 'POST', '/api/auth/usuarios',
  { acao: 'atividade', u: 'patricia', atividade: false });
checa('tirar a marca fecha a porta na hora, na sessao ja aberta',
  (await pede(SESSAO.patricia, 'GET', '/api/ft/atividade-lista?ano=2026&mes=8')).status, 403);

titulo('3c. DINHEIRO NAO PASSA PELA ATIVIDADE');
/* a marca de acesso pode ser dada a quem o faturamento nao diz respeito.
   Um campo de valor que ninguem usa e um campo de valor que um dia vaza.
   Sem Drive nao ha como chamar o endpoint de verdade, entao a ausencia e
   cobrada onde ela pode ser cobrada: no codigo que monta o item. */
const py = readFileSync(DIR + 'server.py', 'utf8');
const corpoLote = (py.match(/async def ft_atividade_lote[\s\S]*?\n@app\./) || [''])[0];
for (const proibido of ['subValor', 'perValor', 'mistos'])
  checa('  "' + proibido + '" nao aparece no lote da atividade',
    corpoLote.includes(proibido), false);
for (const preciso of ['envio', 'subPecas', 'perPecas', 'total', 'vendedor'])
  checa('  "' + preciso + '" aparece', corpoLote.includes(preciso), true);
checa('(o Relatorio de Pedidos continua com o dinheiro dele)',
  /async def ft_relatorio_lote[\s\S]*?subValor/.test(py), true);
/* O NOME DO ARQUIVO DA SEMANA e o unico lugar em que um texto vindo de
   fora vira nome de arquivo no Drive. Cobrado na funcao, e nao pelo
   endpoint: sem Drive o endpoint para em 503 antes de chegar ao nome, e o
   teste estaria medindo a ausencia do Drive, nao a conferencia. */
const nomes = `
import importlib.util, json
spec = importlib.util.spec_from_file_location('srv', ${JSON.stringify(DIR + 'server.py')})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
fora = {}
for x in ['2026-08-17', '', '2026-8-17', 'semana', '2026-08-17.fta', '../../senha']:
    try: fora[x] = m._atv_nome_arquivo(x)
    except Exception as e: fora[x] = getattr(e, 'status_code', 0)
print(json.dumps(fora, ensure_ascii=False))`;
let nm = {};
try { nm = JSON.parse(execFileSync('python3', ['-c', nomes], { encoding: 'utf8' })); }
catch (e) { console.log('     ! ' + String(e).slice(0, 160)); }
checa('  a segunda-feira vira o nome', nm['2026-08-17'], '2026-08-17.fta');
for (const ruim of ['', '2026-8-17', 'semana', '2026-08-17.fta', '../../senha'])
  checa('  semana ' + JSON.stringify(ruim) + ' e recusada', nm[ruim], 400);

/* ================================================================
   BLOCO 4: O EDITOR, UMA PAGINA SO, TROCANDO DE IDENTIDADE

   A pagina carrega uma vez (11,7s) e atende a todas as pessoas. A
   identidade injetada e a resposta DE VERDADE do /api/auth/eu daquela
   pessoa, buscada no bloco 2: o servidor continua sendo a fonte, e o
   que se mede aqui e so o que a TELA faz com essa resposta.
   ================================================================ */
titulo('4. O EDITOR COM A IDENTIDADE DE CADA PESSOA');
/* a mesma pagina do bloco 1, ja logada como admin */
checa('quem ja trocou a senha entra direto no editor',
  (await pede((await entraApi('henrique', SENHAS.henrique)).cookie, 'GET', '/api/db')).status !== 403, true);

/* LIMPAR A TELA ENTRE OS BLOCOS.

   Cada modal deste editor e um veu que cobre a pagina inteira. Numa suite
   por arquivo isso nunca apareceu: a pagina morria no fim do arquivo. Com
   uma pagina so atendendo a todos os blocos, um modal esquecido aberto
   engole o proximo clique, e o Playwright fica 90s tentando clicar em algo
   que esta atras do veu. Fechar e barato; descobrir por que o clique nao
   chegou, nao. */
const VEUS = ['ftLoginFundo', 'ftUsersFundo', 'ftStatusFundo', 'cfgFundo', 'bugFundo'];
const limpaTela = async () => {
  await pEd.evaluate(ids => {
    ids.forEach(i => document.getElementById(i)?.classList.remove('on'));
    if (window.ftStatus && ftStatus.fecha) ftStatus.fecha();
  }, VEUS);
  await pEd.waitForTimeout(250);
};
const sobrando = () => pEd.evaluate(ids =>
  ids.filter(i => document.getElementById(i)?.classList.contains('on')), VEUS);

const vira = async quem => pEd.evaluate(e => {
  Object.assign(FT_EU, e, { carregado: true });
  ftAplicaAcesso();
  if (typeof ftVendedorAssina === 'function') {
    const c = document.querySelector('input[data-h="vendedor"]');
    if (c) c.value = '';
    ftVendedorAssina();
  }
  return null;
}, euDe[quem]);
/* ftAplicaAcesso() SO ESCONDE, nunca mostra de volta: em producao a
   identidade nao muda sem recarregar, entao uma passada basta. Aqui, com
   varias identidades na mesma pagina, e preciso devolver tudo ao estado
   inicial antes de cada medida, senao o que a segunda pessoa nao podia
   continuaria escondido para a terceira. O que se mede continua sendo o
   mesmo: o que ftAplicaAcesso decide esconder para aquela pessoa.

   A secao 'bugs' fica de fora da comparacao: quem manda nela e um
   interruptor de desenvolvimento, e nao a permissao da pessoa. */
const SECOES = ['orcamento', 'relatorio', 'atividade', 'clientes', 'banco'];
const trilho = () => pEd.evaluate(secs => {
  document.querySelectorAll('.ft-rail-bt').forEach(b => { b.hidden = false; });
  ftAplicaAcesso();
  return [...document.querySelectorAll('.ft-rail-bt')]
    .filter(b => !b.hidden && secs.includes(b.dataset.sec)).map(b => b.dataset.sec);
}, SECOES);

for (const [quem, esperado] of [
  ['henrique', ['orcamento', 'relatorio', 'atividade', 'clientes', 'banco']],
  ['kev',      ['orcamento', 'clientes', 'banco']],
  ['patricia', ['orcamento', 'clientes', 'banco']],
  ['dayane',   ['orcamento', 'relatorio', 'clientes', 'banco']],
]) {
  await vira(quem);
  const t = await trilho();
  console.log('     ' + quem.padEnd(9) + JSON.stringify(t));
  checa('o trilho de ' + quem + ' mostra so o que e dele',
    esperado.every(x => t.includes(x)) && t.length === esperado.length, true);
}

titulo('4b. O FINANCEIRO VE O BANCO E NAO MEXE');
await vira('dayane');
r = await pEd.evaluate(async () => {
  /* O BANCO E POSTO NA MAO, E NAO PUXADO DO SERVIDOR.

     Puxar com ftSyncPull() custava 12,8s MEDIDOS, sozinho um quarto da
     suite inteira. E o que se cobra aqui nao e a sincronizacao: e se o
     Financeiro consegue MEXER no que esta na tela. Para isso basta haver
     item na tela. A sincronizacao tem suite propria, e o servidor ja foi
     cobrado no bloco 3. */
  if (typeof DB === 'object') DB.tecidos = ['DRY FIT', 'PIQUET', 'HELANCA', 'MALHA FRIA'];
  ftSecao('banco');
  if (typeof bdCat !== 'undefined') bdCat = 'tecidos';
  if (typeof bdRender === 'function') bdRender();
  await new Promise(s => setTimeout(s, 300));
  const vis = e => !!e && getComputedStyle(e).display !== 'none';
  const pg = document.getElementById('bdPage');
  return { travado: document.body.classList.contains('sem-banco-editar'),
           adicionar: vis(pg?.querySelector('.bd-add-btn')),
           apagar: vis(pg?.querySelector('.bd-item-del')),
           itens: pg ? pg.querySelectorAll('.bd-item-input').length : 0,
           editavel: (() => { const i = pg?.querySelector('.bd-item-input');
             return i ? getComputedStyle(i).pointerEvents !== 'none' : null; })() };
});
console.log('     ' + JSON.stringify(r));
checa('a marca de somente leitura esta no body', r.travado, true);
checa('  sem "Adicionar"', r.adicionar, false);
checa('  sem apagar', r.apagar, false);
checa('  ha item na lista para medir', r.itens > 0, true);
checa('  e os campos nao recebem clique', r.editavel, false);
await vira('henrique');
await pEd.evaluate(() => ftSecao('orcamento'));
checa('o admin nao fica com o banco travado',
  await pEd.evaluate(() => document.body.classList.contains('sem-banco-editar')), false);

titulo('4c. O MODAL VIROU MINHA CONTA');
r = await pEd.evaluate(async () => {
  loginAbre(); await new Promise(s => setTimeout(s, 400));
  const cx = document.getElementById('ftLoginCorpo');
  const t = cx.textContent || '';
  return { titulo: document.querySelector('#ftLoginFundo .tit')?.textContent || '',
           nome: t.includes('Henrique'), papel: t.includes('admin'),
           sair: !!cx.querySelector('#ftCtSair'), trocar: !!cx.querySelector('#ftCtSalvar') };
});
console.log('     ' + JSON.stringify(r));
checa('o modal se chama Minha conta', r.titulo, 'Minha conta');
checa('  com nome, papel, trocar senha e sair',
  [r.nome, r.papel, r.trocar, r.sair], [true, true, true, true]);
await limpaTela();
checa('  e o modal fecha, liberando a tela', await sobrando(), []);

/* ================================================================
   BLOCO 5: A MARCA DO EDITOR NO CAMPO VENDEDOR

   A Patricia monta orcamento e nao vende. Se ela assinasse como
   vendedora, o Relatorio de Pedidos somaria a venda no nome errado. A
   correcao nao e escrever dois nomes: e um asterisco na frente. Se
   "*Dani" agrupasse diferente de "Dani", a venda dela sairia partida em
   duas linhas, que e a mentira mais dificil de perceber.
   ================================================================ */
titulo('5. O CAMPO VENDEDOR E A MARCA *');
const escolhe = nome => pEd.evaluate(async n => {
  const c = document.querySelector('input[data-h="vendedor"]');
  c.focus(); c.value = n;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  c.dispatchEvent(new Event('change', { bubbles: true }));
  c.blur();
  await new Promise(s => setTimeout(s, 200));
  return c.value;
}, nome);
const campo = () => pEd.evaluate(() => document.querySelector('input[data-h="vendedor"]').value);

await vira('patricia');
checa('o campo do editor nasce vazio', await campo(), '');
checa('escolhido o vendedor, ele ganha o asterisco', await escolhe('Dani'), '*Dani');
checa('  trocar de vendedor nao empilha asterisco', await escolhe('Kev'), '*Kev');
checa('  colar o campo ja marcado nao duplica', await escolhe('*Dani'), '*Dani');
checa('  nem dois asteriscos digitados a mao', await escolhe('**Dani'), '*Dani');
checa('  o formato antigo com barra vira a marca nova', await escolhe('Dani / Patricia'), '*Dani');
checa('  esvaziar deixa vazio', await escolhe(''), '');
await escolhe('Dani');
r = await pEd.evaluate(() => {
  const doc = (typeof coletaEstado === 'function') ? coletaEstado() : null;
  const d = new DOMParser().parseFromString(gerarHTML(), 'text/html');
  return { noFt: doc ? ((doc.header || {}).vendedor || '') : '(sem coletaEstado)',
           naBarra: (d.querySelector('.ft-barra .ft-bi.vendedor .val') || {}).textContent || '',
           noCabecalho: (d.querySelector('input[data-h="vendedor"]') || {}).value || '' };
});
console.log('     ' + JSON.stringify(r));
checa('a marca vai inteira para o .ft, o Trello e o A4',
  [r.noFt, r.naBarra, r.noCabecalho], ['*Dani', '*Dani', '*Dani']);

/* E O PRINCIPAL: o relatorio conta a Dani uma vez so */
r = await pEd.evaluate(() => {
  const itens = [{ vendedor: 'Dani' }, { vendedor: '*Dani' }, { vendedor: 'Kev' },
                 { vendedor: '*Kev' }, { vendedor: '' }, { vendedor: 'Dani / Patricia' }];
  const lista = [...new Set(itens.map(relVendedorDe).filter(Boolean))].sort();
  REL.dados = { ano: 2026, mes: 8, dia: 0, itens: itens.map(x => Object.assign(
    { id: 'x', subPecas: 1, subValor: 1, perPecas: 0, perValor: 0, mistos: [], dia: 1, cliente: 'C' }, x)) };
  REL.filtro = { vendedor: 'Dani', cliente: '', dia: 0, tipo: '' };
  const daDani = relVisiveis().length;
  REL.filtro = { vendedor: '', cliente: '', dia: 0, tipo: '' };
  REL.dados = null;
  return { lista, daDani };
});
console.log('     ' + JSON.stringify(r));
checa('a lista de vendedores nao repete a Dani', r.lista, ['Dani', 'Kev']);
checa('  e filtrar por Dani pega TODOS os pedidos dela', r.daDani, 3);

await vira('kev');
checa('quem vende assina sozinho', await campo(), 'Kev');
checa('  e trocar de vendedor nao gruda o nome dele', await escolhe('Dani'), 'Dani');
await vira('dayane');
checa('o financeiro tambem nao vende', await pEd.evaluate(() => FT_EU.vende), false);
checa('  e o vendedor escolhido por ela ganha a marca', await escolhe('Dani'), '*Dani');
await vira('henrique');
await escolhe('');

/* ================================================================
   BLOCO 6: A TELA DE PESSOAS

   O ponto central: RENOMEAR leva a senha e o papel junto. Criar e
   desativar pareceria igual e nao e: mandaria a pessoa de volta para a
   senha de partida, e ela ficaria trancada do lado de fora.
   ================================================================ */
titulo('6. PESSOAS: RENOMEAR LEVA A SENHA JUNTO');
const listaPessoas = () => pEd.evaluate(() => [...document.querySelectorAll('.ft-us-linha')]
  .map(l => ({ u: l.dataset.u, papel: l.querySelector('select')?.value,
               ativo: !l.classList.contains('off'),
               atv: !!l.querySelector('.ft-us-atv')?.classList.contains('on') })));
const recado = () => pEd.evaluate(() => { const m = document.getElementById('ftUsersMsg');
  return m ? { tipo: m.dataset.tipo, txt: m.textContent } : null; });

await pEd.evaluate(() => ftUsersAbre()); await pEd.waitForTimeout(800);
let ls = await listaPessoas();
console.log('     ' + JSON.stringify(ls.map(x => x.u)));
checa('as sete pessoas aparecem', ls.length, 7);
checa('  com o papel de cada uma',
  ls.filter(x => x.u === 'henrique' || x.u === 'dayane').map(x => x.papel),
  ['admin', 'financeiro']);
checa('  e o admin aparece com a marca de Atividade ligada e travada',
  await pEd.evaluate(() => { const b = document.querySelector('.ft-us-linha[data-u="henrique"] .ft-us-atv');
    return [b.classList.contains('on'), b.disabled]; }), [true, true]);

const senhaDaDayane = SENHAS.dayane;
await pEd.evaluate(() => ftUsersFaz({ acao: 'renomear', u: 'dayane', novo: 'daiane' }));
await pEd.waitForTimeout(1100);
ls = await listaPessoas();
checa('agora e daiane', ls.some(x => x.u === 'daiane'), true);
checa('  e dayane nao existe mais', ls.some(x => x.u === 'dayane'), false);
checa('  o papel foi junto', ls.find(x => x.u === 'daiane').papel, 'financeiro');
/* A CONFERENCIA QUE JUSTIFICA A SUITE INTEIRA */
const daiane = await entraApi('daiane', senhaDaDayane);
checa('daiane entra com a senha que ELA escolheu', daiane.status, 200);
checa('  e continua sendo a mesma pessoa',
  (await pede(daiane.cookie, 'GET', '/api/auth/eu')).json.usuario.nome, 'Dayane');
checa('  o usuario antigo nao entra mais', (await entraApi('dayane', senhaDaDayane)).status, 401);

titulo('6b. CRIAR, DESATIVAR, REATIVAR, REDEFINIR');
await pEd.evaluate(() => ftUsersFaz({ acao: 'criar', u: 'maria', nome: 'Maria', papel: 'vendedor' }));
await pEd.waitForTimeout(1000);
checa('a Maria entrou na lista', (await listaPessoas()).some(x => x.u === 'maria'), true);
const rc = await recado();
checa('  e o recado diz a senha de partida', (rc?.txt || '').includes(S_EQUIPE), true);
const maria = await entraApi('maria', S_EQUIPE);
checa('ela entra e cai na troca obrigatoria',
  [maria.status, (await pede(maria.cookie, 'GET', '/api/db')).status], [200, 403]);
await pEd.evaluate(() => ftUsersFaz({ acao: 'ativo', u: 'maria', ativo: false }));
await pEd.waitForTimeout(900);
checa('desativada', (await listaPessoas()).find(x => x.u === 'maria').ativo, false);
checa('  e desativada nao entra', (await entraApi('maria', S_EQUIPE)).status, 401);
await pEd.evaluate(() => ftUsersFaz({ acao: 'ativo', u: 'maria', ativo: true }));
await pEd.waitForTimeout(900);
checa('reativada', (await listaPessoas()).find(x => x.u === 'maria').ativo, true);
await pEd.evaluate(() => ftUsersFaz({ acao: 'resetar', u: 'daiane' }));
await pEd.waitForTimeout(900);
checa('redefinir tira a senha antiga dela',
  (await entraApi('daiane', senhaDaDayane)).status, 401);
checa('  e a de partida volta, pedindo troca',
  (await pede((await entraApi('daiane', S_EQUIPE)).cookie, 'GET', '/api/db')).status, 403);

titulo('6c. AS TRAVAS QUE IMPEDEM FICAR TRANCADO DO LADO DE FORA');
const recusa = async corpo => (await pede(SESSAO.henrique, 'POST', '/api/auth/usuarios', corpo)).status;
checa('usuario repetido e recusado',
  await recusa({ acao: 'criar', u: 'maria', nome: 'M', papel: 'vendedor' }), 400);
checa('usuario curto ou com maiuscula e recusado',
  await recusa({ acao: 'criar', u: 'AB', nome: 'M', papel: 'vendedor' }), 400);
checa('renomear para um nome que ja existe e recusado',
  await recusa({ acao: 'renomear', u: 'maria', novo: 'kev' }), 400);
checa('desativar a si mesmo e recusado',
  await recusa({ acao: 'ativo', u: 'henrique', ativo: false }), 400);
checa('rebaixar o outro admin passa (ainda sobro eu)',
  await recusa({ acao: 'papel', u: 'dani', papel: 'vendedor' }), 200);
checa('  mas ficar SEM administrador nenhum e recusado',
  await recusa({ acao: 'papel', u: 'henrique', papel: 'vendedor' }), 400);
checa('e um vendedor nao administra ninguem',
  (await pede(SESSAO.kev, 'GET', '/api/auth/usuarios')).status, 403);
await limpaTela();
checa('nenhum veu ficou aberto tapando a tela', await sobrando(), []);

/* ================================================================
   BLOCO 7: O RELATORIO DE ATIVIDADE

   Metade do dado dele e escrita a mao, e o botao que rele o Drive se
   chama "Atualizar". Se a fusao quebrar, alguem perde a manha inteira
   de trabalho num clique, sem erro nenhum na tela.
   ================================================================ */
titulo('7. ATIVIDADE: GERAR DE NOVO NAO DERRUBA O PLANEJAMENTO');
const DRIVE = { arquivos: [], conteudo: {}, semanas: {}, aberturas: [] };
await pEd.route('**/api/ft/atividade-lista*', r => r.fulfill({ status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ ok: true, arquivos: DRIVE.arquivos, total: DRIVE.arquivos.length }) }));
await pEd.route('**/api/ft/atividade-lote', r => {
  const c = JSON.parse(r.request().postData() || '{}');
  const itens = (c.arquivos || []).map(a => { DRIVE.aberturas.push(a.id);
    return Object.assign({}, DRIVE.conteudo[a.id], { id: a.id, mod: a.mod }); })
    .filter(x => x.pedido !== undefined);
  return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, itens, falhas: [] }) });
});
await pEd.route('**/api/ft/atividade-guardado*', r => {
  const sem = new URL(r.request().url()).searchParams.get('semana') || '';
  const d = DRIVE.semanas[sem];
  return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(d ? Object.assign({ ok: true, existe: true }, d)
                           : { ok: true, existe: false, semana: sem }) });
});
await pEd.route('**/api/ft/atividade-guardar', r => {
  const c = JSON.parse(r.request().postData() || '{}');
  const salvoEm = new Date().toISOString();
  DRIVE.semanas[c.semana] = { semana: c.semana, linhas: c.linhas, vistos: c.vistos, salvoEm };
  return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, salvoEm, nome: c.semana + '.fta' }) });
});
const SEMANA = '2026-08-17';
const pedido = (n, dia, total, sub) => ({
  id: 'ID' + String(n).padStart(8, '0') + 'xx', pedido: 'PD00' + (4100 + n),
  arquivo: 'CLIENTE ' + n + '.ft', cliente: 'CLIENTE ' + n, vendedor: 'Dani',
  envio: dia + '/08/2026', dia: 1, subPecas: sub, perPecas: total - sub, total });
const poe = lista => { DRIVE.arquivos = lista.map((x, i) =>
  ({ id: x.id, nome: x.arquivo, dia: 1, mod: 'm' + i }));
  DRIVE.conteudo = {}; lista.forEach(x => { DRIVE.conteudo[x.id] = x; }); };

await pEd.evaluate(s => { ATV.semana = s; ATV.linhas = []; ATV.vistos = {}; ATV.salvoEm = ''; }, SEMANA);
await pEd.evaluate(() => { ATV_CAP.semana = 1500; ATV_CAP.dia = 325; ATV_CAP.dias = 6; });
await pEd.evaluate(() => ftSecao('atividade'));
await pEd.waitForTimeout(500);
poe([pedido(1, 17, 100, 100), pedido(2, 18, 200, 0), pedido(3, 19, 150, 150),
     pedido(4, 20, 300, 0), pedido(5, 21, 80, 80), pedido(6, 22, 120, 60)]);
await pEd.evaluate(() => atvGera()); await pEd.waitForTimeout(1100);
r = await pEd.evaluate(() => ({ linhas: ATV.linhas.length,
  planos: ATV.linhas.map(l => l.plan).sort(),
  novos: ATV.linhas.filter(l => l.novo).length,
  pecas: ATV.linhas.reduce((a, l) => a + l.total, 0) }));
console.log('     ' + JSON.stringify(r));
checa('os seis pedidos entraram, um por dia', r.linhas, 6);
checa('  950 pecas somadas', r.pecas, 950);
checa('a primeira geracao nao pinta nada de novo', r.novos, 0);

await pEd.evaluate(() => { ATV.linhas[0].plan = '2026-08-21';
  ATV.linhas[1].etapa = 'prensa'; ATV.linhas[2].etapa = 'finalizado';
  ATV.sujo = true; atvDesenha(); });
await pEd.click('#miAtvSalvar'); await pEd.waitForTimeout(900);
checa('salvar grava, e a TELA avisa que gravou',
  await pEd.evaluate(() => !!ATV.salvoEm &&
    (document.body.textContent.includes('Planejamento salvo')
     || !!document.querySelector('.atv-selo.salvo'))), true);
await limpaTela();

/* o pedido 1 muda no Drive e a entrega dele volta para segunda; o plano
   continua sexta, porque alguem decidiu isso */
DRIVE.conteudo['ID00000001xx'] = { ...DRIVE.conteudo['ID00000001xx'],
  cliente: 'CLIENTE 1 RENOMEADO', total: 999, subPecas: 999, perPecas: 0 };
DRIVE.arquivos.find(a => a.id === 'ID00000001xx').mod = 'MUDOU';
DRIVE.arquivos.push({ id: 'IDNOVO0001xx', nome: 'n1.ft', dia: 1, mod: 'n1' });
DRIVE.conteudo['IDNOVO0001xx'] = { ...pedido(7, 19, 70, 70), id: 'IDNOVO0001xx' };
DRIVE.aberturas = [];
await pEd.evaluate(() => atvGera()); await pEd.waitForTimeout(1300);
r = await pEd.evaluate(() => { const l1 = ATV.linhas.find(l => l.id === 'ID00000001xx');
  return { plano1: l1.plan, cliente1: l1.cliente, total1: l1.total, entrega1: l1.entrega,
           etapa2: (ATV.linhas.find(l => l.id === 'ID00000002xx') || {}).etapa,
           novos: ATV.linhas.filter(l => l.novo).map(l => l.id) }; });
console.log('     ' + JSON.stringify(r) + '  abriu=' + JSON.stringify(DRIVE.aberturas));
checa('O PLANO FEITO A MAO CONTINUA DE PE', r.plano1, '2026-08-21');
checa('  mesmo com a entrega tendo voltado para 17/08', r.entrega1, '17/08/2026');
checa('  e a etapa escolhida a mao continua', r.etapa2, 'prensa');
checa('mas o que vem do orcamento foi reescrito',
  [r.cliente1, r.total1], ['CLIENTE 1 RENOMEADO', 999]);
checa('so o que chegou depois do salvamento fica marcado', r.novos, ['IDNOVO0001xx']);
checa('  e a marca e dark teal',
  await pEd.evaluate(() => { const l = document.querySelector('.atv-linha.novo');
    return !!l && getComputedStyle(l).boxShadow.includes('rgb(17, 94, 89)'); }), true);
checa('a leitura e incremental: so o que mudou foi reaberto',
  [...DRIVE.aberturas].sort(), ['ID00000001xx', 'IDNOVO0001xx']);

await pEd.click('#miAtvSalvar'); await pEd.waitForTimeout(900);
await limpaTela();
checa('depois de salvar, a marca some',
  await pEd.evaluate(() => document.querySelectorAll('.atv-linha.novo').length), 0);

titulo('7ab. QUEM SO OLHA NAO MEXE');
/* a marca de acesso da leitura; planejar e do admin. No servidor isso ja
   foi cobrado no bloco 3b. Aqui e o lado da tela: o cursor e o arraste
   precisam dizer nao antes do clique, senao a pessoa tenta e leva 403 */
r = await pEd.evaluate(() => {
  const real = FT_EU.papel;
  FT_EU.papel = 'editor'; atvAtualizaAcesso();
  const fora = { trava: document.body.classList.contains('atv-so-olha'),
                 planeja: atvPodePlanejar() };
  FT_EU.papel = real; atvAtualizaAcesso();
  fora.voltou = !document.body.classList.contains('atv-so-olha');
  return fora; });
checa('sem ser admin, a tela entra em modo so-leitura', [r.trava, r.planeja], [true, false]);
checa('  e volta ao normal para o admin', r.voltou, true);

titulo('7b. O QUE ATRASOU CAI NA SEGUNDA E ENTRA NA CONTA DO DIA');
DRIVE.semanas['2026-08-10'] = { semana: '2026-08-10', salvoEm: '2026-08-15T12:00:00.000Z',
  vistos: {}, linhas: [
    { id: 'IDVELHO001xx', pedido: 'PD004000', cliente: 'ATRASADO SA', entrega: '14/08/2026',
      plan: '2026-08-14', etapa: 'costura', sub: 50, per: 0, total: 50, chegouEm: '2026-08-10T10:00:00.000Z' },
    { id: 'IDVELHO002xx', pedido: 'PD004001', cliente: 'ENTREGUE SA', entrega: '13/08/2026',
      plan: '2026-08-13', etapa: 'finalizado', sub: 30, per: 0, total: 30, chegouEm: '2026-08-10T10:00:00.000Z' }] };
const segAntes = await pEd.evaluate(() => atvSoma(ATV.linhas.filter(l => l.plan === '2026-08-17')));
await pEd.evaluate(() => atvGera()); await pEd.waitForTimeout(1200);
r = await pEd.evaluate(() => { const seg = document.querySelector('.atv-dia[data-dia="2026-08-17"]');
  const v = ATV.linhas.find(l => l.id === 'IDVELHO001xx') || {};
  return { grupoAtraso: document.querySelectorAll('.atv-dia[data-dia="atraso"]').length,
           plan: v.plan, tarja: !!v.atrasado,
           primeiro: seg.querySelector('.atv-linha').dataset.id,
           temTarja: !!seg.querySelector('.atv-linha .atv-atraso'),
           soma: atvSoma(ATV.linhas.filter(l => l.plan === '2026-08-17')),
           total: ATV.linhas.length }; });
console.log('     antes a segunda somava ' + segAntes + '; ' + JSON.stringify(r));
checa('nao ha mais um grupo de atrasados a parte', r.grupoAtraso, 0);
checa('o atrasado foi para a segunda, com tarja e primeiro da fila',
  [r.plan, r.tarja, r.temTarja, r.primeiro],
  ['2026-08-17', true, true, 'IDVELHO001xx']);
checa('  e as 50 pecas dele entram na conta do dia', r.soma, segAntes + 50);
checa('o finalizado NAO desce', r.total, 8);

titulo('7c. ARRASTAR MUDA O DIA');
await pEd.evaluate(() => { document.getElementById('atvPage').scrollTop = 0; });
await pEd.waitForTimeout(200);
const cx = await pEd.evaluate(() => {
  const l = document.querySelector('.atv-linha[data-id="ID00000002xx"]');
  const a = l.querySelector('.atv-puxador').getBoundingClientRect();
  return { ax: a.x + a.width / 2, ay: a.y + a.height / 2 }; });
await pEd.mouse.move(cx.ax, cx.ay); await pEd.mouse.down();
await pEd.mouse.move(cx.ax + 10, cx.ay + 22, { steps: 4 });
await pEd.waitForTimeout(140);
const meio = await pEd.evaluate(() => ({
  voando: document.querySelectorAll('.atv-voando').length,
  fantasma: document.querySelectorAll('.atv-linha.fantasma').length }));
/* a medida do destino so vale DEPOIS de o arrasto comecar: a linha
   original encolhe a zero e a pagina inteira sobe com ela */
const alvo = await pEd.evaluate(() => {
  const d = document.querySelector('.atv-dia[data-dia="2026-08-22"]');
  d.scrollIntoView({ block: 'center' });
  const q = d.getBoundingClientRect();
  return { dx: q.x + q.width / 2, dy: Math.round(q.y + q.height - 10) }; });
await pEd.waitForTimeout(120);
await pEd.mouse.move(alvo.dx, alvo.dy, { steps: 16 });
await pEd.waitForTimeout(250);
const buraco = await pEd.evaluate(() => document.querySelectorAll('.atv-buraco').length);
await pEd.mouse.up(); await pEd.waitForTimeout(900);
r = await pEd.evaluate(() => ({
  plano: ATV.linhas.find(l => l.id === 'ID00000002xx').plan,
  etapa: ATV.linhas.find(l => l.id === 'ID00000002xx').etapa, sujo: ATV.sujo,
  sobrou: document.querySelectorAll('.atv-voando,.atv-linha.fantasma,.atv-buraco').length }));
console.log('     ' + JSON.stringify({ ...meio, buraco, ...r }));
checa('as tres pecas da animacao existem durante o arrasto',
  [meio.voando, meio.fantasma, buraco > 0], [1, 1, true]);
checa('o dia mudou de verdade', r.plano, '2026-08-22');
checa('  a etapa nao foi junto', r.etapa, 'prensa');
checa('  a tela marca que ha coisa a salvar', r.sujo, true);
checa('nada sobrou voando depois de soltar', r.sobrou, 0);

titulo('7d. A FOLHA A4 DA ATIVIDADE');
r = await pEd.evaluate(() => {
  const n = atvMontaImpressao();
  document.body.classList.add('atv-imprimindo');
  const f = document.querySelector('.atv-folha').getBoundingClientRect();
  const mm = x => Math.round(x * 25.4 / 96);
  const out = { folhas: n, larg: mm(f.width), alt: mm(f.height),
    vaza: [...document.querySelectorAll('.atv-folha-corpo')]
      .filter(c => c.scrollHeight > c.clientHeight + 1).length,
    linhas: document.querySelectorAll('.atv-tab tbody tr:not(.f-dia)').length,
    rod: document.querySelectorAll('.atv-f-rodape .atv-f-med .tr i').length };
  document.body.classList.remove('atv-imprimindo');
  atvDesmontaImpressao();
  return out; });
console.log('     ' + JSON.stringify(r));
checa('a folha e A4 deitada', [r.larg, r.alt], [297, 210]);
checa('  nada vaza da margem, e toda linha entrou', [r.vaza, r.linhas], [0, 8]);
checa('  com o rodape de saturacao', r.rod, 1);
const virada = await pEd.evaluate(() => {
  const guarda = ATV.linhas.slice(), base = ATV.linhas[0];
  const dias = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22'];
  const mede = etapa => { let corte = 0, vaza = 0;
    for (let n = 20; n <= 30; n++) {
      ATV.linhas = Array.from({ length: n }, (_, i) => Object.assign({}, base,
        { id: 'X' + i, pedido: 'PD' + i, cliente: 'CLIENTE DE TESTE ' + i, plan: dias[i % 6],
          etapa, entrega: '17/08/2026', total: 100, sub: 100, per: 0, novo: false, atrasado: false }));
      const f = atvMontaImpressao();
      vaza += [...document.querySelectorAll('.atv-folha-corpo')]
        .filter(c => c.scrollHeight > c.clientHeight + 1).length;
      atvDesmontaImpressao();
      if (f > 1 && !corte) corte = n;
    }
    return { corte, vaza }; };
  const com = mede('prensa'), sem = mede('');
  ATV.linhas = guarda; atvDesenha();
  return { com, sem }; });
console.log('     ' + JSON.stringify(virada));
checa('com etapa em toda linha, a folha vira em 24 pedidos', virada.com.corte, 24);
checa('  sem etapa, vira em 26', virada.sem.corte, 26);
checa('  e nada vaza em nenhum dos casos', virada.com.vaza + virada.sem.vaza, 0);

titulo('7e. OS CARTOES E O RODAPE');
/* o numero grande sozinho ("1.670 pecas") nao diz de onde veio nem se
   cabe. A segunda linha de cada cartao e a barra do rodape sao o que
   transformam o numero em algo sobre o que decidir */
r = await pEd.evaluate(() => {
  ATV.linhas = [0, 1, 2].map(i => ({ id: 'C' + i, pedido: 'PD0' + i, cliente: 'CLIENTE ' + i,
    vendedor: 'Dani', entrega: '17/08/2026', plan: '2026-08-17',
    etapa: i === 0 ? 'finalizado' : 'prensa', sub: 60, per: 40, total: 100,
    chegouEm: '', novo: false, atrasado: false }));
  ATV_CAP.semana = 1500; ATV_CAP.dia = 325; ATV_CAP.dias = 6;
  atvDesenha();
  const t = q => (document.querySelector(q) || {}).textContent || '';
  const larg = q => { const e = document.querySelector(q);
    return e ? Math.round(parseFloat(e.style.width)) : -1; };
  return { cartoes: document.querySelectorAll('.atv-card').length,
    pecas: t('.atv-card.c-pec .val'), pecasPe: t('.atv-card.c-pec .pe'),
    capPe: t('.atv-card.c-cap .pe'), pedPe: t('.atv-card.c-ped .pe'),
    sat: t('.atv-card.c-sat .val'), satBarra: larg('.atv-satbar i'),
    rodTit: t('#atvRodape .esq b'), rodDet: t('#atvRodape .esq .det'),
    rodPct: t('#atvRodape .medidor .linha b'), rodBarra: larg('#atvRodape .trilho i') }; });
console.log('     ' + JSON.stringify(r));
checa('os quatro cartoes estao la, com a conta que explica o numero',
  [r.cartoes, r.pecas, r.pecasPe],
  [4, '300', '180 sublimação · 120 personalizado']);
checa('  capacidade traz o teto do dia', r.capPe, '325 peças por dia · 6 dias');
checa('  pedidos traz o que ja esta pronto', r.pedPe, '1 finalizados · 100 peças prontas');
checa('  a saturacao e 20% e a barra acompanha', [r.sat, r.satBarra], ['20%', 20]);
checa('o rodape repete o total, a folga e o medidor',
  [r.rodTit, r.rodDet, r.rodPct, r.rodBarra],
  ['300 peças planejadas nesta semana',
   'Ainda cabem 1.200 peças antes de encostar no limite de 1.500.', '20%', 20]);
r = await pEd.evaluate(() => {
  ATV.linhas.forEach(l => { l.total = 600; l.sub = 600; l.per = 0; });
  atvDesenha();
  return { det: document.querySelector('#atvRodape .esq .det').textContent,
    pct: document.querySelector('.atv-card.c-sat .val').textContent,
    cor: getComputedStyle(document.querySelector('.atv-card.c-sat .val')).color,
    barra: Math.round(parseFloat(document.querySelector('#atvRodape .trilho i').style.width)) }; });
checa('passou do limite: o texto diz o que fazer',
  r.det, 'A semana passou o limite em 300 peças. Alguma coisa precisa mudar de dia.');
checa('  em vermelho, e a barra para em 100% sem transbordar',
  [r.pct, r.cor, r.barra], ['120%', 'rgb(198, 22, 27)', 100]);

titulo('7f. A CAPACIDADE NAS CONFIGURACOES');
r = await pEd.evaluate(() => {
  const s = document.getElementById('cfgCapSemana'), d = document.getElementById('cfgCapDia');
  s.value = 1500; s.dispatchEvent(new Event('change', { bubbles: true }));
  d.value = 250;  d.dispatchEvent(new Event('change', { bubbles: true }));
  const fora = { semana: ATV_CAP.semana, dia: ATV_CAP.dia,
    guardado: JSON.parse(localStorage.getItem('ft_capacidade') || '{}').semana,
    semBriga: document.getElementById('cfgCapAviso').hidden };
  d.value = 325; d.dispatchEvent(new Event('change', { bubbles: true }));
  fora.comBriga = !document.getElementById('cfgCapAviso').hidden;
  return fora; });
console.log('     ' + JSON.stringify(r));
checa('os campos mudam a capacidade e ficam guardados',
  [r.semana, r.dia, r.guardado], [1500, 250, 1500]);
checa('250 x 6 = 1.500: sem briga, sem aviso', r.semBriga, true);
checa('325 x 6 = 1.950 contra 1.500: o aviso aparece', r.comBriga, true);

titulo('7g. TROCAR DE SEMANA');
await pEd.evaluate(() => { ATV.sujo = false; });
await pEd.click('#atvAnterior'); await pEd.waitForTimeout(900);
r = await pEd.evaluate(() => ({ semana: ATV.semana, linhas: ATV.linhas.length }));
console.log('     ' + JSON.stringify(r));
checa('a semana anterior e a de 10/08', r.semana, '2026-08-10');
checa('  e ela traz o que estava salvo nela', r.linhas, 2);
await pEd.click('#atvSeguinte'); await pEd.waitForTimeout(900);
checa('voltar traz a semana de 17/08', await pEd.evaluate(() => ATV.semana), SEMANA);

titulo('7h. A MARCA DE ATIVIDADE, PELA TELA DE PESSOAS');
r = await pEd.evaluate(async () => {
  await ftUsersAbre(); await new Promise(s => setTimeout(s, 600));
  const bt = document.querySelector('.ft-us-linha[data-u="kev"] .ft-us-atv');
  const antes = bt.classList.contains('on');
  bt.click(); await new Promise(s => setTimeout(s, 900));
  return { antes,
    depois: document.querySelector('.ft-us-linha[data-u="kev"] .ft-us-atv').classList.contains('on'),
    noServidor: (FT_US.lista.find(x => x.u === 'kev') || {}).atividade }; });
console.log('     ' + JSON.stringify(r));
checa('a marca comeca desligada e um clique liga', [r.antes, r.depois], [false, true]);
checa('  e o servidor gravou', r.noServidor, true);
SESSAO.kev = (await entraApi('kev', SENHAS.kev)).cookie;
checa('  o Kev passa a ver a Atividade, sem mudar de papel',
  [(await pede(SESSAO.kev, 'GET', '/api/ft/atividade-lista?ano=2026&mes=8')).status !== 403,
   (await pede(SESSAO.kev, 'GET', '/api/auth/eu')).json.usuario.papel], [true, 'vendedor']);
await limpaTela();
await ctxEd.close();

/* ================================================================
   BLOCO 8: O FREIO DO BANCO E A VERSAO SERVIDA
   Nao precisam de navegador nem de servidor no ar.
   ================================================================ */
titulo('8. O FREIO CONTRA DUPLICACAO');
const html = readFileSync(DIR + ARQ, 'utf8');
checa('o envio leva o campo semente', /semente:ftSementeDeclarada\(\)/.test(html), true);
checa('  montado do catalogo embutido',
  /function ftSementeDeclarada\(\)[\s\S]{0,240}CORES_GRUPOS/.test(html), true);
const freio = `
import importlib.util, json
spec = importlib.util.spec_from_file_location('srv', ${JSON.stringify(DIR + 'server.py')})
m = importlib.util.module_from_spec(spec)
try: spec.loader.exec_module(m)
except Exception: pass
_inchou = m._inchou
base  = {'cores': [{'n':'Branco'},{'n':'Preto'}] + [{'n':'C%02d'%i} for i in range(50)]}
novos = [{'n':'F%02d'%i} for i in range(70)]
junto = {'cores': base['cores'] + novos}
sem   = {'cores': ['F%02d'%i for i in range(70)]}
dupl  = {'cores': base['cores'] + [{'n':'X%02d'%i} for i in range(40)]}
so_um = {'cores': base['cores'] + [{'n':'Nova Cor'}]}
cli   = {'clientes': [{'n':'K%02d'%i} for i in range(60)]}
cli2  = {'clientes': cli['clientes'] + [{'n':'Z%02d'%i} for i in range(60)]}
print(json.dumps({
  'catalogoDeclarado': _inchou(base, junto, semente=sem),
  'catalogoSemDeclarar': (_inchou(base, junto) or {}).get('somou'),
  'declarandoOqueJaExiste': (_inchou(base, dupl, semente={'cores':['C%02d'%i for i in range(50)]}) or {}).get('somou'),
  'edicaoNormal': _inchou(base, so_um, semente=sem),
  'outraCategoriaIntacta': (_inchou(cli, cli2, semente=sem) or {}).get('somou'),
}, ensure_ascii=False))`;
let fr = {};
try { fr = JSON.parse(execFileSync('python3', ['-c', freio], { encoding: 'utf8' })); }
catch (e) { console.log('     ! nao consegui rodar o servidor: ' + String(e).slice(0, 160)); }
console.log('     ' + JSON.stringify(fr));
checa('catalogo declarado passa', fr.catalogoDeclarado, null);
checa('  o MESMO envio sem declarar e barrado', fr.catalogoSemDeclarar, 70);
checa('declarar o que ja existe nao abre a porta', fr.declarandoOqueJaExiste, 40);
checa('uma edicao normal continua passando', fr.edicaoNormal, null);
checa('a declaracao de cores nao afrouxa clientes', fr.outraCategoriaIntacta, 60);

titulo('8b. O SERVIDOR LE A VERSAO DO EDITOR INTEIRO');
const todos = readdirSync(DIR).filter(f => /editor.*\.html$/.test(f)).sort();
checa('serve o editor de maior numero', todos[todos.length - 1], ARQ);
checa('a constante FT_EDITOR existe no arquivo', !!VER, true);
console.log('     FT_EDITOR=' + VER + ' na posicao ' + html.indexOf('const FT_EDITOR=')
  + ' de ' + html.length + ' caracteres');
checa('o servidor le o arquivo INTEIRO, e nao um pedaco',
  /f\.read\(\)\s*\n\s*m = _re\.search/.test(py) || /trecho = f\.read\(\)/.test(py), true);
checa('  nao sobrou nenhum f.read(N) limitando',
  (py.match(/f\.read\((\d+)\)/) || [null, null])[1], null);
checa('e o servidor no ar devolve essa mesma versao',
  (await pede('', 'GET', '/api/versao-publica')).json.editor, VER);

titulo('8c. A CHAVE DE EMERGENCIA');
/* FT_LOGIN_DESLIGADO=1 devolve o sistema ao que era antes do login por
   pessoa. E a saida para o dia em que o login travar a empresa inteira, e
   precisa funcionar justamente nesse dia. Sobe um segundo servidor, so
   para isto, e desce em seguida. */
const P2 = PORTA + 1;
const srv2 = spawn('python3', ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1',
  '--port', String(P2), '--log-level', 'warning'], {
  cwd: DIR, env: { ...process.env,
    FT_DB_PATH: join(mkdtempSync(join(tmpdir(), 'ftx2-')), 't.db'),
    FT_TOKEN: S_EQUIPE, FT_ADMIN_TOKEN: S_ADMIN,
    FT_DRIVE_CREDENCIAIS: '', FT_LOGIN_DESLIGADO: '1' },
  stdio: ['ignore', 'ignore', 'ignore'] });
let vivo = false;
for (let i = 0; i < 80; i++) {
  try { const q = await fetch('http://127.0.0.1:' + P2 + '/api/auth/eu');
    if (q.status === 401 || q.ok) { vivo = true; break; } } catch (e) {}
  await new Promise(s => setTimeout(s, 200));
}
const semLogin = async u => (await fetch('http://127.0.0.1:' + P2 + u, { headers: CAB })).status;
checa('o servidor sobe com o login desligado', vivo, true);
checa('  sem sessao nenhuma, a API nao recusa mais', await semLogin('/api/db') !== 401, true);
checa('  nem a Atividade', await semLogin('/api/ft/atividade-lista?ano=2026&mes=8') !== 403, true);
checa('  e o editor volta a sair direto de /',
  (await (await fetch('http://127.0.0.1:' + P2 + '/')).text()).includes('folha-a4'), true);
try { srv2.kill('SIGKILL'); } catch (e) {}

/* ================================================================
   O QUE RODOU EM PARALELO
   ================================================================ */
let contaFila = 0;
for (const bloco of await emParalelo) {
  console.log('\n=== ' + bloco.nome + ' ===');
  bloco.linhas.forEach(l => console.log(l));
  contaFila += bloco.linhas.length;
}
checa('os dois blocos de arquivo rodaram mesmo', contaFila > 40, true);

console.log('\n' + '='.repeat(80));
console.log('     ' + ((Date.now() - _t0) / 1000).toFixed(1) + 's no total');
/* UM TESTE QUE ENCOLHE SEM AVISAR E PIOR QUE UM TESTE QUEBRADO.
   Esta suite juntou nove arquivos; se um bloco parar de rodar por um erro
   de encanamento, o resto continua verde e ninguem percebe que metade da
   cobertura sumiu. O piso conta as amostras de compatibilidade que
   existirem na pasta, para nao reprovar quando alguem acrescentar uma. */
const CONFERENCIAS_MINIMAS = 180 + 13 *
  (existsSync(DIR + 'compat-amostras/')
    ? readdirSync(DIR + 'compat-amostras/').filter(n => /^v\d+\.json$/.test(n)).length
    : 0);
checa('a suite nao encolheu: ao menos ' + CONFERENCIAS_MINIMAS + ' conferencias',
  (falhas.length + contaOk) >= CONFERENCIAS_MINIMAS, true);
checa('nenhum erro de pagina em lugar nenhum', err.length, 0);
if (err.length) err.slice(0, 6).forEach(e => console.log('     ! ' + e));
await nav.close(); morre();
if (falhas.length) {
  console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`);
  process.exit(1);
}
console.log('EXTREMO: a porta, quem pode o que, o planejamento e o .ft de sempre');
