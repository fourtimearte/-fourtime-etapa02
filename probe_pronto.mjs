/* Quanto tempo o editor REALMENTE leva para ficar pronto?
   As suítes esperam 2600-2800 ms fixos. Se ele fica pronto antes, isso é
   espera pura jogada fora — 10 suítes × várias páginas. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

const marcos = [];
for (let i = 0; i < 3; i++) {
  const p = await b.newPage({ viewport:{width:1600,height:1000} });
  const t0 = Date.now();
  await p.goto(pathToFileURL(DIR+'fourtime-editor-v274.html').href);
  const tGoto = Date.now() - t0;

  /* o que qualquer suíte precisa que exista */
  await p.waitForFunction(() => typeof FT_EDITOR !== 'undefined'
    && document.querySelector('.folha-a4')
    && document.querySelector('.ft-tab')
    && typeof window.zoomMedidas === 'function'
    && typeof window.gerarHTML === 'function', null, { timeout: 15000 });
  const tPronto = Date.now() - t0;

  /* o zoom só assenta depois que aplicaZoom() roda */
  await p.waitForFunction(() => window.ZOOM > 0, null, { timeout: 15000 });
  const tZoom = Date.now() - t0;

  /* os dropdowns custom são ligados num setTimeout(0) após o load */
  await p.waitForFunction(() => document.querySelector('.ft-dd-bt') !== null
    || document.getElementById('rlVend') === null, null, { timeout: 15000 });
  const tDd = Date.now() - t0;

  marcos.push({ goto: tGoto, pronto: tPronto, zoom: tZoom, dropdowns: tDd });
  await p.close();
}
console.table(marcos);
await b.close();
