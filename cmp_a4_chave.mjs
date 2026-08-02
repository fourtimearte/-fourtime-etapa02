/* cmp_a4 comparava por ÍNDICE. Como a v272 acrescentou 2 <span> na barra de
   aviso, TODOS os elementos seguintes deslocam e o teste acusa 181 diferenças
   que não existem. Aqui a comparação é por CHAVE (tag+classe+ordem entre os
   iguais), então só aparece o que mudou de verdade. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';
const b = await abreNavegador();
async function foto(arq){
  const p = await b.newPage({ viewport:{width:1600,height:1000} });
  await p.goto(pathToFileURL(DIR+''+arq).href);
  await esperaPronto(p);
  const r = await p.evaluate(()=>{
    const cont = {};
    const m = {};
    document.querySelectorAll('.folha-a4 *').forEach(el=>{
      const c = getComputedStyle(el);
      const base = el.tagName+'.'+(el.className||'').toString().trim().replace(/\s+/g,'_');
      cont[base] = (cont[base]||0)+1;
      const r = el.getBoundingClientRect();
      m[base+'#'+cont[base]] = [c.fontFamily,c.fontSize,c.fontWeight,c.color,
        c.backgroundColor,c.padding,c.margin,c.borderRadius,
        +r.width.toFixed(1),+r.height.toFixed(1)].join('|');
    });
    return m;
  });
  await p.close(); return r;
}
const A = await foto('fourtime-editor-v269.html');
const B = await foto('fourtime-editor-v275.html');
await b.close();
const chaves = new Set([...Object.keys(A),...Object.keys(B)]);
const dif = [];
for (const k of chaves){
  if (A[k] === B[k]) continue;
  dif.push({ k, v269:A[k]||'(não existe)', v272:B[k]||'(não existe)' });
}
console.log(`elementos: v269=${Object.keys(A).length}  v272=${Object.keys(B).length}`);
console.log(`diferenças reais: ${dif.length}`);
dif.slice(0,30).forEach(d=>{ console.log('  '+d.k); console.log('    269: '+d.v269); console.log('    272: '+d.v272); });
