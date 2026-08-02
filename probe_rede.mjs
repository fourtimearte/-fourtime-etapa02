/* 12,7 s no goto() de um arquivo LOCAL não é o navegador lendo 1 MB.
   Alguma coisa está sendo buscada na rede. Este probe lista o que é e
   quanto cada uma custa. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:1600,height:1000} });
const req = new Map();
p.on('request', r => req.set(r, Date.now()));
const linhas = [];
const fim = r => {
  const t0 = req.get(r.request());
  linhas.push({ ms: t0 ? Date.now() - t0 : null, url: r.url().slice(0, 78) });
};
p.on('response', fim);
p.on('requestfailed', r => linhas.push({ ms: Date.now() - (req.get(r) || Date.now()), url: 'FALHOU ' + r.url().slice(0, 70) }));
const t0 = Date.now();
await p.goto(pathToFileURL(DIR+'fourtime-editor-v274.html').href);
console.log('goto total: ' + (Date.now() - t0) + ' ms');
console.table(linhas.filter(l => !l.url.startsWith('file://')).sort((a, b) => b.ms - a.ms).slice(0, 12));
await b.close();
