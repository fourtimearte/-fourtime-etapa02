/* Quais raios REALMENTE aparecem dentro da folha A4 — medidos no
   elemento, não adivinhados no CSS. Vários seletores são compartilhados
   entre a interface e o documento, então ler o CSS não diz onde cada um
   cai. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const b = await abreNavegador();
const p = await b.newPage({ viewport:{width:1600,height:1000} });
await p.goto(pathToFileURL(DIR + (process.argv[2]||'fourtime-editor-v276.html')).href);
await esperaPronto(p);
const r = await p.evaluate(() => {
  const mapa = {};
  document.querySelectorAll('.folha-a4, .folha-a4 *').forEach(el => {
    const c = getComputedStyle(el).borderRadius;
    if (!c || c === '0px') return;
    const cls = (el.className || '').toString().trim().split(/\s+/)[0] || el.tagName.toLowerCase();
    (mapa[c] = mapa[c] || new Set()).add(cls);
  });
  return Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, [...v]]));
});
for (const [raio, classes] of Object.entries(r).sort())
  console.log(String(raio).padEnd(12) + classes.join(', ').slice(0, 110));
await b.close();
