/* Mede as ideias de ganho vertical ANTES de eu propor qualquer uma.
   Todas na tipografia do protótipo v269 confortável, largura de A4 (756px úteis). */
import { abreNavegador } from './ft_navegador.mjs';

const TAMS = ['10A','PP','P','M','G','GG','XG','G1','G2','G3','G4'];
const QTD  = ['6','4','','10','8','','','','','',''];
const UNI  = ['79,90','89,90','','89,90','89,90','','','','','',''];
const TOT  = ['479,40','359,60','','899,00','719,20','','','','','',''];

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:14px}
.folha{width:794px;padding:5mm;background:#fff}
table{border-collapse:collapse;font-family:'IBM Plex Mono',monospace;
  font-variant-numeric:tabular-nums;font-size:11px;border:1px solid #E4E8ED}
th,td{border-bottom:1px solid #E4E8ED;padding:1.15mm 2mm;text-align:right;white-space:nowrap}
th{font-family:'IBM Plex Sans';font-size:9.5px;font-weight:600;color:#5D6775}
.t-tam{text-align:left;font-family:'IBM Plex Sans';font-weight:600;border-right:1px solid #E4E8ED}
tfoot td{background:#F6F8FA;font-weight:700}

/* A · vertical, como está hoje (referência) */
#A table{width:265px}

/* B · horizontal: tamanhos viram COLUNAS, largura total do módulo */
#B table{width:100%;table-layout:fixed}
#B th,#B td{padding:1.15mm 1mm;text-align:center;font-size:10px}
#B .r-rot{text-align:left;font-family:'IBM Plex Sans';font-weight:600;font-size:9.5px;
  color:#5D6775;width:52px;padding-left:2mm}

/* C · vertical dobrada em dois blocos lado a lado */
#C .par{display:flex;gap:4mm}
#C table{flex:1}

/* D · horizontal SEM a linha de total por tamanho (o total só no rodapé do doc) */
#D table{width:100%;table-layout:fixed}
#D th,#D td{padding:1.15mm 1mm;text-align:center;font-size:10px}
#D .r-rot{text-align:left;font-family:'IBM Plex Sans';font-weight:600;font-size:9.5px;
  color:#5D6775;width:52px;padding-left:2mm}
`;

function vertical(tams, q, u, t) {
  const linhas = tams.map((s, i) =>
    `<tr><td class="t-tam">${s}</td><td>${q[i]}</td><td>${u[i]}</td><td>${t[i]}</td></tr>`).join('');
  return `<table><thead><tr><th class="t-tam">Tam</th><th>Qtd</th><th>Uni (R$)</th><th>Total (R$)</th></tr></thead>
    <tbody>${linhas}</tbody><tfoot><tr><td class="t-tam">Total</td><td>28</td><td>—</td><td>2.457,20</td></tr></tfoot></table>`;
}
function horizontal(comTotalLinha) {
  const cab = '<tr><th class="r-rot"></th>' + TAMS.map(s => `<th>${s}</th>`).join('') + '<th>Total</th></tr>';
  const lq = '<tr><td class="r-rot">Qtd</td>' + QTD.map(v => `<td>${v}</td>`).join('') + '<td>28</td></tr>';
  const lu = '<tr><td class="r-rot">Uni R$</td>' + UNI.map(v => `<td>${v}</td>`).join('') + '<td>—</td></tr>';
  const lt = '<tr><td class="r-rot">Total R$</td>' + TOT.map(v => `<td>${v}</td>`).join('') + '<td>2.457,20</td></tr>';
  return `<table><thead>${cab}</thead><tbody>${lq}${lu}${comTotalLinha ? lt : ''}</tbody></table>`;
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="folha" id="A">${vertical(TAMS, QTD, UNI, TOT)}</div>
<div class="folha" id="B">${horizontal(true)}</div>
<div class="folha" id="C"><div class="par">
  ${vertical(TAMS.slice(0,6), QTD.slice(0,6), UNI.slice(0,6), TOT.slice(0,6))}
  ${vertical(TAMS.slice(6), QTD.slice(6), UNI.slice(6), TOT.slice(6))}
</div></div>
<div class="folha" id="D">${horizontal(false)}</div>
</body></html>`;

const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
await p.setContent(html);
await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const mm = px => +(px / (96 / 25.4)).toFixed(1);
  const alt = sel => mm(document.querySelector(sel).getBoundingClientRect().height);
  /* transborda? em tabela fixa o texto é cortado sem aviso — conferir célula a célula */
  const corta = sel => [...document.querySelectorAll(sel + ' td, ' + sel + ' th')]
    .filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent.trim());
  return {
    A_vertical_hoje: alt('#A table'),
    B_horizontal_3linhas: alt('#B table'), B_corta: corta('#B'),
    C_dobrada: alt('#C .par'),
    D_horizontal_2linhas: alt('#D table'), D_corta: corta('#D'),
  };
});
console.log(JSON.stringify(r, null, 1));
await p.locator('#B').screenshot({ path: '/tmp/i_b.png' });
await p.locator('#C').screenshot({ path: '/tmp/i_c.png' });
await b.close();
