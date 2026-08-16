/* ================================================================
   A AMOSTRA DO ARENA CROSS, GERADA UMA VEZ SÓ

   O teste do DTF precisa de um pedido de verdade, e o de verdade é o
   ARENA CROSS: catorze layouts, 111 peças, três referências e uma grade
   infantil no meio. O arquivo exportado dele tem 6,5 MB, quase tudo
   imagem, e nada disso o teste usa: das imagens ele só quer saber QUAIS
   SÃO IGUAIS entre si, porque é isso que agrupa os layouts.

   Então este script guarda o esqueleto: os campos e, no lugar de cada
   imagem, uma letra dizendo de que arte ela é. Sete letras para catorze
   layouts. O resultado tem alguns kilobytes, entra no repositório sem
   peso e sem carregar arte de cliente junto.

   Rodar de novo só se o pedido de referência mudar:
       node gera_fixture_dtf.mjs [arquivo.html]
   ================================================================ */
import { abreNavegador } from './ft_navegador.mjs';
import { writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
const ENTRADA = process.argv[2] || (DIR + 'arena-cross-trello.html');
const SAIDA = DIR + 'dtf-arena.json';

const nav = await abreNavegador();
const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
const p = await ctx.newPage();
await p.goto(pathToFileURL(ENTRADA).href, { waitUntil: 'domcontentloaded' });

const est = await p.evaluate(() => {
  const header = {};
  document.querySelectorAll('[data-h]').forEach(el => {
    header[el.dataset.h] = el.tagName === 'INPUT' ? el.value : el.innerHTML;
  });
  const artes = new Map();
  const layouts = [...document.querySelectorAll('.lay-modulo')].map(m => {
    const tab = m.querySelector('.lay-tabela-mini');
    const tamanhos = {};
    tab.querySelectorAll('tbody tr').forEach(tr => {
      const t = tr.querySelector('.c-tam').textContent.trim();
      const q = tr.querySelector('.c-qtd').textContent.trim();
      const u = tr.querySelector('.c-uni').textContent.trim();
      if (q || u) tamanhos[t] = { q, u };
    });
    const im = m.querySelector('.lay-img img');
    const src = im ? (im.getAttribute('src') || '') : '';
    let arteId = null;
    if (src) {
      if (!artes.has(src)) artes.set(src, 'arte-' + (artes.size + 1));
      arteId = artes.get(src);
    }
    return {
      ref: m.querySelector('.combo-ref textarea').textContent,
      genero: m.querySelector('.combo-ref').dataset.genero || '',
      tecidos: [...m.querySelectorAll('.combo-tecido textarea')].map(t => t.textContent),
      cor: m.querySelector('.combo-cor textarea').textContent,
      design: [...m.querySelectorAll('.design-grupo')].map(g => ({
        tag: g.dataset.tag,
        cores: [...g.querySelectorAll('.dtf-tok')].map(t => t.dataset.dtf)
      })),
      grade: tab.dataset.modo || 'adulto',
      tamanhos, arteId
    };
  });
  return { header, layouts, artes: artes.size };
});
await nav.close();

const artes = est.artes; delete est.artes;
writeFileSync(SAIDA, JSON.stringify(est, null, 1));
console.log(`${est.layouts.length} layouts, ${artes} artes distintas`);
console.log(`gravado ${SAIDA.replace(DIR, '')}`);
