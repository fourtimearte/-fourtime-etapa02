/* ================================================================
   A RESPOSTA QUE NUNCA CHEGA (v3.358)

   Categoria inteira que as 37 suites nao cobriam. Todas elas medem o
   que acontece QUANDO a resposta chega: certa, errada, 401, 409, 426.
   Nenhuma media o que acontece quando ela simplesmente nao chega.

   Foi ai que morava o defeito relatado pela equipe: "parou de salvar,
   voltou ao atualizar a pagina". Um fetch pendurado deixava o cadeado
   FT_SYNC.push fechado para sempre, e com ele parava o envio, o tique
   de 5s e a rede de seguranca de 5min, sem erro nenhum na tela.
   ================================================================ */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import path from 'path';

const ARQ = process.env.FT_ARQ || editorAtual();
let falhas = 0, feitas = 0;
function ok(nome, cond, extra) {
  feitas++;
  if (cond) { console.log('  ok   ' + nome); }
  else { falhas++; console.log('  FALHA ' + nome + (extra ? '  ->  ' + extra : '')); }
}

const b = await abreNavegador();
const pagina = await b.newPage();
await pagina.goto('file://' + path.resolve(ARQ));
await esperaPronto(pagina);

/* ---------- 1. o codigo tem as tres protecoes ---------- */
const fonte = await pagina.evaluate(() => ({
  fetch: String(window.ftSyncFetch || ''),
  push:  String(window.ftSyncPush  || ftSyncPush),
  agenda:String(ftSyncAgendar),
}));
ok('ftSyncFetch tem AbortController', /AbortController/.test(fonte.fetch), fonte.fetch.slice(0,80));
ok('ftSyncFetch limpa o prazo no finally', /finally\s*\{\s*clearTimeout/.test(fonte.fetch));
ok('ftSyncPush abre o cadeado no finally', /finally\s*\{\s*FT_SYNC\.push\s*=\s*false/.test(fonte.push));
ok('ftSyncAgendar apaga o timer ao disparar', /FT_SYNC\.timer\s*=\s*null/.test(fonte.agenda));

/* ---------- 2. o timer nao fica preso depois de disparar ---------- */
const t = await pagina.evaluate(async () => {
  FT_SYNC.on = true; FT_SYNC.url = 'http://127.0.0.1:9'; FT_SYNC.token = 'x';
  FT_SYNC.push = false; FT_SYNC.timer = null;
  ftSyncAgendar();
  const agendado = typeof FT_SYNC.timer === 'number';
  await new Promise(r => setTimeout(r, 2200));
  return { agendado, aposDisparar: FT_SYNC.timer };
});
ok('ftSyncAgendar agenda mesmo', t.agendado);
ok('o timer volta a null depois de disparar', t.aposDisparar === null, 'ficou ' + t.aposDisparar);

/* ---------- 3. com o timer limpo, a vigia de 5s volta a falar ---------- */
const v = await pagina.evaluate(async () => {
  const orig = window.fetch;
  FT_SYNC.push = false; FT_SYNC.timer = null; FT_SYNC.estado = 'ok';
  /* a sequencia de verdade: a pessoa edita, o envio dispara, e SO
     DEPOIS o tique de 5s tem de continuar vivo. Zerar o timer na mao
     aqui faria o teste passar tambem na versao defeituosa. */
  ftSyncAgendar();
  await new Promise(r => setTimeout(r, 2200));
  FT_SYNC.push = false; FT_SYNC.estado = 'ok';
  let bateu = false;
  window.fetch = (...a) => { bateu = true; return orig(...a); };
  await ftSyncVigia();
  window.fetch = orig;
  return bateu;
});
ok('ftSyncVigia fala com o servidor apos uma edicao', v === true);

/* ---------- 4. O TESTE QUE IMPORTA: a resposta nunca chega ---------- */
/* Prazo proprio: na versao SEM o conserto este bloco fica pendurado para
   sempre (e o defeito em pessoa). Com prazo, a suite REPROVA em vez de
   estourar, que e como um teste deve morrer. */
const comPrazo = (pr, ms, seFalhar) =>
  Promise.race([pr, new Promise(r => setTimeout(() => r(seFalhar), ms))]);

const r = await comPrazo(pagina.evaluate(async () => {
  const orig = window.fetch;
  FT_SYNC.on = true; FT_SYNC.url = 'http://127.0.0.1:9'; FT_SYNC.token = 'x';
  FT_SYNC.push = false; FT_SYNC.timer = null; FT_SYNC.estado = 'ok';
  /* encurta o prazo so para o teste nao levar 25s */
  const prazoReal = FT_SYNC.prazo;
  FT_SYNC.prazo = 1200;
  /* Um fetch que NUNCA responde por conta propria, mas que obedece ao
     abort, que e exatamente como o fetch de verdade se comporta. Um
     dublê que ignorasse o sinal nao provaria nada: o teste passaria a
     medir o dublê em vez do editor. */
  window.fetch = (u,o) => new Promise((res,rej)=>{
    const s = o && o.signal;
    if(!s) return;
    if(s.aborted) return rej(Object.assign(new Error('abortado'),{name:'AbortError'}));
    s.addEventListener('abort',()=>rej(Object.assign(new Error('abortado'),{name:'AbortError'})));
  });
  const inicio = Date.now();
  await ftSyncPush();                       // com prazo, isto TEM de voltar
  const levou = Date.now() - inicio;
  const cadeado = FT_SYNC.push;
  /* a rede volta ao normal: alguem ainda consegue falar com o servidor? */
  let bateu = false;
  window.fetch = (...a) => { bateu = true; return orig(...a); };
  await ftSyncVigia();
  window.fetch = orig;
  FT_SYNC.prazo = prazoReal;
  return { levou, cadeado, estado: FT_SYNC.estado, destravou: bateu };
}), 15000, { levou: 999999, cadeado: true, estado: 'salvando', destravou: false });
ok('o envio volta sozinho em vez de ficar pendurado', r.levou < 20000, 'levou ' + r.levou + 'ms');
ok('o cadeado ficou ABERTO depois do prazo', r.cadeado === false, 'push=' + r.cadeado);
ok('o estado virou erro, nao "salvando" eterno', r.estado !== 'salvando', 'estado=' + r.estado);
ok('a sincronizacao volta a funcionar sem F5', r.destravou === true);

/* ---------- 5. um tropeco antes do try tambem abre o cadeado ---------- */
const g = await pagina.evaluate(async () => {
  FT_SYNC.on = true; FT_SYNC.url = 'http://127.0.0.1:9'; FT_SYNC.token = 'x';
  FT_SYNC.push = false; FT_SYNC.timer = null;
  /* estrutura circular: JSON.stringify lanca, e isso roda antes do try antigo */
  const circ = {}; circ.eu = circ;
  const guarda = FT_SYNC.remocoes;
  FT_SYNC.remocoes = circ;
  try { await ftSyncPush(); } catch (e) { /* pode lancar, o que importa e o cadeado */ }
  FT_SYNC.remocoes = guarda;
  return FT_SYNC.push;
});
ok('tropeco antes do try nao tranca a sessao', g === false, 'push=' + g);

await b.close();
console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
