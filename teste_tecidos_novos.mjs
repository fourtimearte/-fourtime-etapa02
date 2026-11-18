/* AS TRES POLIAMIDAS NOVAS (v3.383)

   POLIAMIDA SPEED, POLIAMIDA FURADINHA C/ ELASTANO LIGHT e PLUS entram no
   tipo POLIAMIDA com o nome IDENTICO ao do Fourtime OS (migracao 089).
   A suite cobra:
     · os tres estao no catalogo de fabrica, no tipo POL
     · quem ja tem banco (sem eles) recebe os tres pelo plantio
     · quem apagou um deles de proposito nao o ve voltar
     · o menu de tecido do orcamento mostra os tres
     · o nome que vai para o .ft e o texto exato, com o "C/"
*/
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}
const NOVOS = ['POLIAMIDA SPEED', 'POLIAMIDA FURADINHA C/ ELASTANO LIGHT', 'POLIAMIDA FURADINHA C/ ELASTANO PLUS'];
const URL_ED = pathToFileURL(DIR + (process.env.FT_ARQ || editorAtual())).href;

const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 1500, height: 1050 } });
p.on('pageerror', e => falhas.push('erro na pagina: ' + e.message));
await p.goto(URL_ED);
await esperaPronto(p);

console.log('\n[1] catalogo de fabrica');
let r = await p.evaluate((novos) => {
  const doGrupo = {};
  TEC_GRUPOS.forEach(g => g.tecidos.forEach(t => { doGrupo[t] = g.cod; }));
  const noBanco = new Set(DB.tecidos.map(o => o && o.n || o));
  return { grupos: novos.map(n => doGrupo[n] || null), banco: novos.map(n => noBanco.has(n)),
           padrao: novos.map(n => DB_PADRAO.tecidos.some(o => o.n === n)) };
}, NOVOS);
checa('os tres no tipo POLIAMIDA', r.grupos, ['POL', 'POL', 'POL']);
checa('os tres no banco desta maquina', r.banco, [true, true, true]);
checa('os tres no banco de fabrica', r.padrao, [true, true, true]);

console.log('\n[2] banco antigo recebe pelo plantio, e o apagado de proposito nao volta');
r = await p.evaluate((novos) => {
  DB.tecidos = DB.tecidos.filter(o => !novos.includes(o && o.n || o));
  tecMarcaApagado(novos[2]);
  const n = ftSemeiaTecidos();
  const tem = new Set(DB.tecidos.map(o => o && o.n || o));
  const res = { plantados: n, tem: novos.map(x => tem.has(x)) };
  tecDesmarcaApagado(novos[2]);
  return res;
}, NOVOS);
checa('plantou so os dois nao apagados', r.plantados, 2);
checa('SPEED e LIGHT voltaram, PLUS apagado ficou fora', r.tem, [true, true, false]);
await p.evaluate(() => ftSemeiaTecidos());

console.log('\n[3] o menu de tecido do orcamento');
await p.reload(); await esperaPronto(p);
r = await p.evaluate((novos) => {
  /* TEC_NOMES e a lista que os combos de tecido do orcamento leem */
  return novos.map(n => TEC_NOMES.includes(n));
}, NOVOS);
checa('os tres aparecem para escolher', r, [true, true, true]);

await b.close();
console.log(falhas.length ? `\n${falhas.length} FALHA(S): ${falhas.join(' | ')}` : '\nTUDO OK');
process.exit(falhas.length ? 1 : 0);
