/* NENHUMA CAIXA ESCONDE CONTEUDO POR DENTRO (v3.351)

   O bug que deu origem a esta suite: no Banco de Dados, com varias
   categorias de referencia abertas ao mesmo tempo, cada uma aparecia
   CORTADA na vertical -- algumas linhas fatiadas ao meio -- e uma
   referencia recem cadastrada simplesmente nao estava na tela. Parecia
   erro de banco. Nao era.

   A causa e um padrao, e por isso este teste varre a interface INTEIRA
   em vez de olhar so o Banco. O padrao:

     um flex em COLUNA de altura limitada
     + um filho que esconde o que transborda (overflow:hidden)
     + o filho com flex-shrink no padrao, que e 1

   Faltando altura, o filho e espremido na proporcao do que falta, o
   overflow:hidden corta o resto, e NINGUEM VE BARRA DE ROLAGEM -- porque
   nada transbordou: o conteudo encolheu para caber. E a pior classe de
   bug de layout que existe, porque some sem deixar rastro.

   A varredura roda numa JANELA BAIXA de proposito: e onde falta altura.
   Ela olha cada elemento visivel da pagina e denuncia quem tem, ao mesmo
   tempo, conteudo escondido por dentro e um pai que pode te espremer. */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(56)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const SECOES = ['orcamento', 'clientes', 'banco', 'bugs', 'relatorio', 'atividade'];

const b = await abreNavegador();
/* 620px de altura: e a janela de um notebook com o navegador em tela
   cheia menos as barras. E onde o problema aparece. */
const p = await b.newPage({ viewport: { width: 1360, height: 620 } });
const erros = [];
p.on('pageerror', e => erros.push(String(e).slice(0, 180)));
await p.goto(pathToFileURL(DIR + (process.env.FT_ARQ || editorAtual())).href);
await esperaPronto(p);

const varre = () => p.evaluate(() => {
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(el);
    if (cs.overflowY !== 'hidden' && cs.overflowX !== 'hidden') return;
    /* tem conteudo escondido la dentro? */
    if (el.scrollHeight - el.clientHeight <= 1) return;
    const pai = el.parentElement; if (!pai) return;
    const pcs = getComputedStyle(pai);
    /* so acusa quem esta num flex em coluna: e ali que o encolhimento
       silencioso acontece */
    if (!/flex/.test(pcs.display)) return;
    if (pcs.flexDirection.indexOf('column') !== 0) return;
    /* quem declarou que nao encolhe esta fora de perigo */
    if (cs.flexShrink === '0') return;
    out.push(String(el.className || el.tagName).trim().slice(0, 44));
  });
  return [...new Set(out)];
});

console.log('\n=== CAIXAS QUE ESCONDEM CONTEUDO POR DENTRO ===');
for (const s of SECOES) {
  const abriu = await p.evaluate(async k => {
    const b = document.querySelector(`.ft-rail-bt[data-sec="${k}"]`);
    if (!b) return false;
    b.click(); await new Promise(s => setTimeout(s, 700)); return true;
  }, s);
  if (!abriu) { checa(`secao "${s}" existe no rail`, false, true); continue; }
  /* no Banco, abre TODOS os grupos de referencia: e o cenario do usuario */
  if (s === 'banco') await p.evaluate(async () => {
    try {
      FT_SYNC.ehAdmin = true;
      (DB.referencias || []).forEach(v => _bdRefAbertos.add(refParse(v).grupo));
      bdRender();
    } catch (e) {}
    await new Promise(s => setTimeout(s, 400));
  });
  checa(`${s}: nenhuma caixa espremida`, await varre(), []);
}

/* e a prova especifica do caso relatado: grupo aberto mostra TUDO */
await p.evaluate(async () => {
  const b = document.querySelector('.ft-rail-bt[data-sec="banco"]');
  if (b) { b.click(); await new Promise(s => setTimeout(s, 600)); }
});
const r = await p.evaluate(() => {
  const pg = document.getElementById('bdPage');
  const abertos = [...pg.querySelectorAll('.bd-rg.aberto')];
  let cortadas = 0;
  abertos.forEach(g => {
    const gr = g.getBoundingClientRect();
    g.querySelectorAll('.bd-rf').forEach(l => {
      const t = l.getBoundingClientRect();
      if (t.height < 1 || t.bottom > gr.bottom + 1 || t.top < gr.top - 1) cortadas++;
    });
  });
  return { abertos: abertos.length, cortadas,
           rola: pg.scrollHeight - pg.clientHeight > 1 };
});
console.log('     ' + JSON.stringify(r));
checa('varios grupos de referencia abertos', r.abertos > 3, true);
checa('  e nenhuma linha cortada pela borda', r.cortadas, 0);
checa('  a altura que sobra vira rolagem da pagina', r.rola, true);

console.log('\n' + '='.repeat(76));
checa('nenhum erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 5).forEach(e => console.log('     ! ' + e));
await b.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('CAIXAS: nenhuma esconde conteudo por dentro, em nenhuma seção');
