/* Mede as APIs de CEP e CNPJ de dentro de um navegador de verdade.
   O que importa não é se elas respondem no curl — é se respondem para uma
   PÁGINA, com CORS. É isso que o editor vai fazer. */
import { abreNavegador } from './ft_navegador.mjs';

const browser = await abreNavegador();
const page = await browser.newPage();
// origem realista: uma página https qualquer, como o editor no Render
await page.setContent('<!doctype html><title>t</title>');
await page.waitForTimeout(500);

const alvos = [
  ['CEP  BrasilAPI v2', 'https://brasilapi.com.br/api/cep/v2/01310100'],
  ['CEP  BrasilAPI v1', 'https://brasilapi.com.br/api/cep/v1/01310100'],
  ['CEP  ViaCEP',       'https://viacep.com.br/ws/01310100/json/'],
  ['CEP  OpenCEP',      'https://opencep.com/v1/01310100'],
  ['CEP  inexistente',  'https://brasilapi.com.br/api/cep/v2/99999999'],
  ['CNPJ BrasilAPI',    'https://brasilapi.com.br/api/cnpj/v1/33000167000101'],
  ['CNPJ OpenCNPJ',     'https://api.opencnpj.org/33000167000101'],
];

for (const [nome, url] of alvos) {
  const r = await page.evaluate(async (u) => {
    const t0 = performance.now();
    try {
      const resp = await fetch(u, { signal: AbortSignal.timeout(12000) });
      const txt = await resp.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      return { ok: true, status: resp.status, ms: Math.round(performance.now() - t0),
               chaves: j ? Object.keys(j).slice(0, 40) : null,
               amostra: j ? JSON.stringify(j).slice(0, 600) : txt.slice(0, 200) };
    } catch (e) {
      return { ok: false, erro: String(e).slice(0, 160), ms: Math.round(performance.now() - t0) };
    }
  }, url);
  console.log(`\n### ${nome}  (${url})`);
  if (!r.ok) { console.log(`   FALHOU em ${r.ms}ms — ${r.erro}`); continue; }
  console.log(`   HTTP ${r.status} em ${r.ms}ms`);
  if (r.chaves) console.log(`   campos: ${r.chaves.join(', ')}`);
  console.log(`   ${r.amostra}`);
}

await browser.close();
