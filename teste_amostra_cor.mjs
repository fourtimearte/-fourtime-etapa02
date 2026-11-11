/* A PALETA DO DTF: 001 PRETO, 012 BRANCO (v3.382)

   Relatado: "a cor 012 e a cor 001 do DTF trocaram de posição ... 001 é
   preto e 012 é branco". Do 001 ao 012 a paleta vai do preto ao branco
   pelos cinzas; os dois hexadecimais das pontas estavam trocados. Confere:
     1. a tabela: 001 preto, 012 branco, e os cinzas no meio
     2. o painel mostra cada código com a cor certa
     3. a ficha no cartão sai com a cor certa, na ordem do clique
     4. um .ft com ["001","012"] abre com preto e branco, sem regravar
   Uso: node teste_amostra_cor.mjs   (FT_ARQ=fourtime-editor-vNNN.html) */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import path from 'path';
const ARQ = process.env.FT_ARQ || editorAtual();
let ok = 0, ruim = 0;
const conta = (r, c, x) => { if (c) { ok++; console.log('  ok    ' + r); } else { ruim++; console.log('  FALHA ' + r + (x ? '  ->  ' + x : '')); } };
const PRETO = 'rgb(0, 0, 0)', BRANCO = 'rgb(255, 255, 255)';

const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
p.on('pageerror', e => { ruim++; console.log('  FALHA erro de pagina: ' + String(e).slice(0, 150)); });
await p.goto('file://' + path.resolve(ARQ)); await esperaPronto(p);

const tab = await p.evaluate(() => DTF_CORES.slice(0, 12));
conta('001 é preto', tab[0].join(' ') === '001 #000000', tab[0].join(' '));
conta('012 é branco', tab[11].join(' ') === '012 #FFFFFF', tab[11].join(' '));
const luz = h => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
conta('do 002 ao 011 são cinzas entre o preto e o branco',
  tab.slice(1, 11).every(([, h]) => luz(h) > 0 && luz(h) < 765), tab.slice(1, 11).map(c => c[1]).join(','));
conta('corHexPorCodigo concorda', await p.evaluate(() => corHexPorCodigo('001') + corHexPorCodigo('012')) === '#000000#FFFFFF');

await p.evaluate(() => { const w = document.querySelector('.design-wrap'); w.appendChild(criaGrupo('DTF')); ordenaTags(w); });
await p.locator('.design-wrap').first().locator('.design-grupo[data-tag="DTF"] .design-tag').click({ button: 'right' });
await p.waitForTimeout(300);
const painel = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#ctxCores .dtf-item')]
  .filter(i => ['001', '012'].includes(i.dataset.num)).map(i => [i.dataset.num, i.querySelector('.sw').style.background])));
conta('no painel, 001 preto', painel['001'] === PRETO, painel['001']);
conta('no painel, 012 branco', painel['012'] === BRANCO, painel['012']);
for (const c of ['012', '001', '005']) { await p.locator(`#ctxCores .dtf-item[data-num="${c}"]`).click(); await p.waitForTimeout(120); }
await p.mouse.click(5, 500); await p.waitForTimeout(300);
const f = await p.evaluate(() => [...document.querySelector('.design-wrap').querySelectorAll('.dtf-tok')]
  .map(t => [t.dataset.dtf, t.querySelector('.dtf-chip').style.background]));
conta('as fichas na ordem do clique: 012, 001, 005', f.map(x => x[0]).join(',') === '012,001,005', JSON.stringify(f));
conta('a ficha do 012 é branca e a do 001 é preta', f[0][1] === BRANCO && f[1][1] === PRETO, JSON.stringify(f));

/* um orçamento já salvo guarda só o código */
const lido = await p.evaluate(() => {
  const mod = document.querySelector('.lay-modulo');
  const w = mod.querySelector('.design-wrap');
  w.querySelectorAll('.design-grupo').forEach(g => g.remove());
  const g = criaGrupo('DTF');
  g.querySelector('.design-tokens').innerHTML = ['001', '012'].map(tokenHTML).join('');
  w.appendChild(g);
  return [...g.querySelectorAll('.dtf-chip')].map(c => c.style.background);
});
conta('o .ft antigo com ["001","012"] abre preto e branco', lido[0] === PRETO && lido[1] === BRANCO, JSON.stringify(lido));

await b.close();
console.log(`\n${ok + ruim} conferencias, ${ruim} falha(s)`);
process.exit(ruim ? 1 : 0);
