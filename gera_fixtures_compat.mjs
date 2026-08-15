/* AS AMOSTRAS DE COMPATIBILIDADE, GERADAS UMA VEZ SO

   O teste de compatibilidade abria os editores antigos a cada rodada para
   que eles produzissem um .ft, e so entao abria esse .ft no editor novo.
   Metade do custo era isso: carregar 1,3MB de editor antigo para ele
   devolver, de novo, exatamente os mesmos bytes de sempre.

   A v279 e um arquivo congelado. Ela vai produzir a mesma saida hoje e
   daqui a tres anos. O que precisa ser guardado nao e o EDITOR antigo, e o
   ARQUIVO que ele produzia.

   Este script roda de vez em quando, e nao na bateria:

     1. abre cada editor da pasta;
     2. manda montar o orcamento de teste e um ajuste de valor;
     3. guarda o .ft e o resumo do que a tela mostrava;
     4. calcula a ASSINATURA da estrutura daquele .ft;
     5. agrupa as versoes por assinatura e guarda UMA de cada grupo.

   A assinatura e o conjunto de "caminho:tipo" de tudo o que existe dentro
   do arquivo. Duas versoes com a mesma assinatura produzem arquivos da
   MESMA FORMA, e testar as duas seria testar a mesma coisa duas vezes. O
   que muda de uma versao para a outra sao valores; o que quebra a leitura
   e a forma.

   De cada grupo fica a versao MAIS ANTIGA: e a que esta mais longe de hoje
   e a que tem menos campos, entao e a que mais cobra do editor novo.       */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
const SAIDA = DIR + 'compat-amostras/';
if (!existsSync(SAIDA)) mkdirSync(SAIDA);

const RESUMO = `(()=>{
  const est=coletaEstado(); const h=est.header||{};
  return {
    header:['cliente','cpf','vendedor','departamento','embalagem','pagamento','entrega','envio','pedido','prazo']
      .reduce((o,k)=>(o[k]=h[k]===undefined?null:h[k],o),{}),
    layouts:(est.layouts||[]).map(L=>({
      ref:L.ref||'', genero:L.genero||'', tecidos:(L.tecidos||[]).filter(Boolean),
      cor:L.cor||'', grade:L.grade||'', obs:(L.obs||'').replace(/<[^>]*>/g,'').trim(),
      temImg:!!L.img,
      design:(L.design||[]).map(d=>d.tag+'['+((d.cores||[]).join(','))+']').sort(),
      tamanhos:Object.keys(L.tamanhos||{}).sort().map(t=>t+':'+(L.tamanhos[t].q||'')+'/'+(L.tamanhos[t].u||''))
    })),
    ajustes:(est.ajustes||[]).map(a=>JSON.stringify(a)),
    pecas:document.querySelector('.rt-pecas')?document.querySelector('.rt-pecas').textContent:null,
    total:document.querySelector('.rt-geral')?document.querySelector('.rt-geral').textContent:null
  };
})()`;

/* A ASSINATURA DA FORMA, e nao do conteudo.

   Percorre o objeto inteiro e anota "caminho:tipo" de cada folha. Arrays
   viram um caminho so, com a UNIAO das formas dos elementos: uma lista de
   3 layouts iguais nao pode contar como estrutura diferente de uma lista
   de 2. Strings longas, numeros e datas nao entram: o que importa e que
   ali existe uma string, e nao qual string. */
function assinatura(v, caminho = '', achados = new Set()) {
  if (v === null || v === undefined) { achados.add(caminho + ':vazio'); return achados; }
  if (Array.isArray(v)) {
    achados.add(caminho + ':lista');
    v.forEach(x => assinatura(x, caminho + '[]', achados));
    return achados;
  }
  if (typeof v === 'object') {
    Object.keys(v).sort().forEach(k => assinatura(v[k], caminho + '.' + k, achados));
    return achados;
  }
  achados.add(caminho + ':' + typeof v);
  return achados;
}

const arquivos = readdirSync(DIR)
  .filter(n => /^fourtime-editor-v\d+\.html$/.test(n))
  .sort((a, b) => (+a.match(/v(\d+)/)[1]) - (+b.match(/v(\d+)/)[1]));
const ATUAL = arquivos[arquivos.length - 1];
const ANTIGAS = arquivos.filter(n => n !== ATUAL);

console.log(`editor atual: ${ATUAL}`);
console.log(`versoes anteriores a examinar: ${ANTIGAS.length}\n`);

const nav = await abreNavegador();
const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
const colhidas = [];

for (const arq of ANTIGAS) {
  const v = arq.match(/v(\d+)/)[1];
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000); p.setDefaultNavigationTimeout(60000);
  const erros = [];
  p.on('pageerror', e => erros.push(String(e).slice(0, 120)));
  try {
    await p.goto(pathToFileURL(DIR + arq).href, { waitUntil: 'domcontentloaded' });
    await esperaPronto(p, null, 60000);
    await p.evaluate(() => { const mi = document.getElementById('miKitTeste');
      if (!mi) throw new Error('sem kit de teste');
      mi.hidden = false; mi.style.display = ''; mi.click(); });
    /* espera o kit assentar: o documento parar de mudar por duas leituras */
    let ant = null, resumo = null;
    for (let i = 0; i < 60; i++) {
      const agora = await p.evaluate(R => JSON.stringify(eval(R)), RESUMO);
      if (ant === agora && JSON.parse(agora).layouts.length > 0) { resumo = JSON.parse(agora); break; }
      ant = agora; await p.waitForTimeout(150);
    }
    if (!resumo) throw new Error('o kit nao assentou');
    await p.evaluate(() => { const a = document.getElementById('finAdd'); if (a) a.click(); });
    await p.waitForSelector('.fin-valor', { timeout: 10000 }).catch(() => {});
    await p.evaluate(() => {
      const x = document.querySelector('.fin-valor');
      if (x) { x.value = '150,00'; x.dispatchEvent(new Event('input', { bubbles: true })); }
      const m = document.querySelector('.fin-motivo');
      if (m) { m.value = 'Brinde'; m.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    ant = null;
    for (let i = 0; i < 60; i++) {
      const agora = await p.evaluate(R => JSON.stringify(eval(R)), RESUMO);
      if (ant === agora) { resumo = JSON.parse(agora); break; }
      ant = agora; await p.waitForTimeout(150);
    }
    const estado = await p.evaluate(() => coletaEstado());
    const ass = [...assinatura(estado)].sort().join('\n');
    colhidas.push({ v: +v, arq, estado, resumo, ass, erros: erros.length });
    console.log(`  v${v}  ok   ${[...assinatura(estado)].length} campos na forma`
      + (erros.length ? `   (${erros.length} erro(s) de pagina)` : ''));
  } catch (e) {
    console.log(`  v${v}  --   ${String(e.message || e).slice(0, 70)}`);
  }
  await p.close();
}
await nav.close();

/* ---- agrupar por forma ---- */
const grupos = new Map();
for (const c of colhidas) {
  if (!grupos.has(c.ass)) grupos.set(c.ass, []);
  grupos.get(c.ass).push(c);
}
console.log(`\n${colhidas.length} versoes lidas, ${grupos.size} FORMAS diferentes de arquivo\n`);

let n = 0;
const formas = [];
for (const [ass, membros] of grupos) {
  n++;
  membros.sort((a, b) => a.v - b.v);
  const nums = membros.map(m => 'v' + m.v);
  console.log(`  forma ${n}: representada por v${membros[0].v}  (${membros.length}: ${nums.join(' ')})`);
  formas.push(membros[0]);
}

/* ---- QUAIS GUARDAR ----

   A forma sozinha nao basta para escolher, por dois motivos.

   O kit de teste monta dados com alguma variacao, entao parte da
   diferenca entre uma forma e outra e sorteio, e nao evolucao do formato.
   E, principalmente, a forma nao enxerga o tipo de mudanca mais
   perigoso: o campo continua la, com o mesmo tipo, e o SIGNIFICADO do
   valor muda. Um genero que era 'M' e virou 'masculino' tem exatamente a
   mesma assinatura e quebra a leitura do mesmo jeito.

   Por isso a escolha e por EPOCA, e nao por agrupamento automatico: uma a
   cada quinze versoes, mais a mais antiga, mais a anterior a atual, mais
   um representante de cada forma encontrada. Cobre as convencoes de valor
   de cada periodo, que e o que o agrupamento nao ve. */
const PASSO = 15;
const escolhidas = new Set();
escolhidas.add(colhidas[0].v);                       /* a mais antiga de todas */
escolhidas.add(colhidas[colhidas.length - 1].v);     /* a anterior a atual     */
for (let alvo = colhidas[0].v; alvo <= colhidas[colhidas.length - 1].v; alvo += PASSO) {
  const perto = colhidas.reduce((a, b) =>
    Math.abs(b.v - alvo) < Math.abs(a.v - alvo) ? b : a);
  escolhidas.add(perto.v);
}
formas.forEach(f => escolhidas.add(f.v));            /* uma de cada forma      */
const guardadas = colhidas.filter(c => escolhidas.has(c.v)).sort((a, b) => a.v - b.v);
console.log(`\nescolhidas por epoca (uma a cada ${PASSO} versoes, mais os extremos`
  + ` e um representante de cada forma): ${guardadas.map(g => 'v' + g.v).join(' ')}`);

/* que campos cada forma acrescentou em relacao a anterior: e a resposta
   para "por que estas e nao aquelas" */
console.log('\nO QUE MUDA DE UMA FORMA PARA A OUTRA:');
guardadas.sort((a, b) => a.v - b.v);
let anterior = null;
for (const g of guardadas) {
  if (anterior) {
    const a = new Set(anterior.ass.split('\n')), b = new Set(g.ass.split('\n'));
    const entrou = [...b].filter(x => !a.has(x));
    const saiu = [...a].filter(x => !b.has(x));
    console.log(`  v${anterior.v} -> v${g.v}`);
    if (entrou.length) console.log('     entrou: ' + entrou.slice(0, 12).join(', ')
      + (entrou.length > 12 ? ` ... (+${entrou.length - 12})` : ''));
    if (saiu.length) console.log('     saiu:   ' + saiu.slice(0, 12).join(', ')
      + (saiu.length > 12 ? ` ... (+${saiu.length - 12})` : ''));
  }
  anterior = g;
}

for (const g of guardadas) {
  const alvo = SAIDA + 'v' + String(g.v).padStart(3, '0') + '.json';
  writeFileSync(alvo, JSON.stringify(
    { versao: g.v, deQualEditor: g.arq, geradoPor: 'gera_fixtures_compat.mjs',
      arquivo: g.estado, resumo: g.resumo }, null, 0));
  console.log(`\n  gravado ${alvo.replace(DIR, '')}  ${(statSync(alvo).size / 1024).toFixed(0)} KB`);
}
console.log(`\n${guardadas.length} amostras guardadas em compat-amostras/`);
