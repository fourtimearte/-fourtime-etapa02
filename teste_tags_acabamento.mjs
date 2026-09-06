/* ================================================================
   ACABAMENTO NO MODULO DE DESIGN (v3.360)

   "Gola Tecido" e "Ribana" nao sao etiqueta nem forma de imprimir: sao
   como a peca e montada. Secao propria no menu, fileira propria no
   cartao, e -- o que quase passou batido -- fora da conta de "misto" do
   relatorio, senao um layout de sublimacao com gola marcada acenderia o
   vermelho sem nenhuma tecnica nova ter entrado nele.
   ================================================================ */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import path from 'path';

const ARQ = process.env.FT_ARQ || editorAtual();
let falhas = 0, feitas = 0;
function ok(nome, cond, extra) {
  feitas++;
  if (cond) console.log('  ok   ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (extra ? '  ->  ' + extra : '')); }
}

const b = await abreNavegador();
const pagina = await b.newPage();
pagina.on('pageerror', e => { falhas++; console.log('  FALHA erro de pagina: ' + String(e).slice(0, 120)); });
await pagina.goto('file://' + path.resolve(ARQ));
await esperaPronto(pagina);

/* ---------- 1. a lista existe e nao atropelou as antigas ---------- */
const lista = await pagina.evaluate(() => ({
  acab: typeof TAG_ACABAMENTO !== 'undefined' ? TAG_ACABAMENTO : null,
  eti: TAG_ETIQUETA.length,
  tec: TAG_TECNICA.length,
  ordem: typeof TAG_ORDEM !== 'undefined' ? TAG_ORDEM : [],
  cores: typeof DESIGN_COR !== 'undefined'
    ? { g: DESIGN_COR['Gola Tecido'], r: DESIGN_COR['Ribana'] } : {}
}));
ok('TAG_ACABAMENTO tem as duas', JSON.stringify(lista.acab) === '["Gola Tecido","Ribana"]', JSON.stringify(lista.acab));
ok('as etiquetas continuam cinco', lista.eti === 5, String(lista.eti));
ok('as tecnicas continuam cinco', lista.tec === 5, String(lista.tec));
ok('TAG_ORDEM tem as doze', lista.ordem.length === 12, String(lista.ordem.length));
ok('o acabamento vem no fim da ordem',
   lista.ordem.slice(-2).join('|') === 'Gola Tecido|Ribana', lista.ordem.slice(-3).join('|'));
ok('Gola Tecido em marrom', lista.cores.g === '#8B5B4B', lista.cores.g);
ok('Ribana em cinza-azulado', lista.cores.r === '#5B6B7A', lista.cores.r);
ok('as duas cores sao novas no cartao',
   Object.values(await pagina.evaluate(() => DESIGN_COR))
     .filter(c => c === '#8B5B4B' || c === '#5B6B7A').length === 2);

/* ---------- 2. o menu ganhou a terceira secao ---------- */
const menu = await pagina.evaluate(() => {
  const m = document.getElementById('ctxTagsGrupo');
  return {
    seps: [...m.querySelectorAll('.ft-ctx-sep')].map(e => e.textContent),
    tags: [...m.querySelectorAll('.ft-ctx-opcao')].map(e => e.dataset.tag),
    ponto: (m.querySelector('[data-tag="Gola Tecido"] .dot') || {}).style?.background || ''
  };
});
ok('o menu tem as duas divisorias', menu.seps.join('|') === 'Tipo de impressão|Acabamento', menu.seps.join('|'));
ok('as doze opcoes estao no menu', menu.tags.length === 12, String(menu.tags.length));
ok('e as duas novas por ultimo',
   menu.tags.slice(-2).join('|') === 'Gola Tecido|Ribana', menu.tags.slice(-2).join('|'));
ok('a bolinha da Gola sai colorida', /139/.test(menu.ponto), menu.ponto);

/* ---------- 3. a fileira propria no cartao ---------- */
const cartao = await pagina.evaluate(async () => {
  const mod = document.querySelector('.lay-modulo');
  const wrap = mod.querySelector('.des-fila').parentElement;
  const monta = tags => {
    [...wrap.querySelectorAll('.design-grupo')].forEach(g => g.remove());
    tags.forEach(t => wrap.appendChild(criaGrupo(t)));
    ordenaTags(wrap);
    return [...wrap.querySelectorAll('.des-fila')].map(f => ({
      cl: f.className.replace('des-fila', '').trim(),
      t: [...f.querySelectorAll('.design-grupo')].map(g => g.dataset.tag).join(',')
    }));
  };
  const out = {};
  out.completo = monta(['Eti. Fourtime', 'DTF', 'Silk', 'Gola Tecido', 'Ribana']);
  out.soAcab = monta(['Gola Tecido']);
  out.semAcab = monta(['Eti. Fourtime', 'Silk']);
  monta([]);
  return out;
});
const ultima = cartao.completo[cartao.completo.length - 1];
ok('o acabamento fica na ultima fileira', ultima.cl === 'des-fila-acab', JSON.stringify(ultima));
ok('  com as duas juntas', ultima.t === 'Gola Tecido,Ribana', ultima.t);
/* DTF sem cor escolhida nao ganha fileira propria: ele cai na fileira
   comum junto com Silk. O que se cobra aqui e que a fileira comum exista
   com as tecnicas dentro e SEM nenhum acabamento nela. */
const comum = cartao.completo.find(f => f.cl === '');
ok('  as tecnicas ficam na fileira comum',
   !!comum && /Silk/.test(comum.t), JSON.stringify(cartao.completo));
ok('  e nenhum acabamento entra nela',
   !!comum && !/Gola|Ribana/.test(comum.t), comum && comum.t);
ok('so acabamento: a etiqueta segue com o convite e o acabamento tem fileira',
   cartao.soAcab.length === 2 && cartao.soAcab[1].cl === 'des-fila-acab', JSON.stringify(cartao.soAcab));
ok('SEM acabamento nao nasce fileira vazia',
   !cartao.semAcab.some(f => f.cl === 'des-fila-acab'), JSON.stringify(cartao.semAcab));

/* ---------- 4. as tags viajam no .ft e voltam ---------- */
const viagem = await pagina.evaluate(async () => {
  const mod = document.querySelector('.lay-modulo');
  const wrap = mod.querySelector('.des-fila').parentElement;
  ['Subli', 'Gola Tecido', 'Ribana'].forEach(t => wrap.appendChild(criaGrupo(t)));
  ordenaTags(wrap);
  const doc = coletaEstado();
  const noArquivo = (doc.layouts[0].design || []).map(d => d.tag);
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'x.ft', '');
  await new Promise(r => setTimeout(r, 800));
  const m2 = document.querySelector('.lay-modulo');
  return { noArquivo,
    depois: [...m2.querySelectorAll('.design-grupo')].map(g => g.dataset.tag) };
});
ok('o .ft guarda as tags de acabamento',
   viagem.noArquivo.includes('Gola Tecido') && viagem.noArquivo.includes('Ribana'),
   JSON.stringify(viagem.noArquivo));
ok('reabrir devolve as duas',
   viagem.depois.includes('Gola Tecido') && viagem.depois.includes('Ribana'),
   JSON.stringify(viagem.depois));

/* ---------- 5. e chegam no arquivo do cliente ---------- */
const exportado = await pagina.evaluate(() => {
  const html = gerarHTML();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('.design-grupo')].map(g => g.dataset.tag);
});
ok('as duas aparecem no arquivo exportado',
   exportado.includes('Gola Tecido') && exportado.includes('Ribana'), JSON.stringify(exportado));

/* ---------- 6. clique direito nelas nao abre menu de cor ---------- */
const semCor = await pagina.evaluate(async () => {
  const g = document.querySelector('.design-grupo[data-tag="Gola Tecido"]');
  if (!g) return 'nao achei a tag';
  const menuCor = document.getElementById('ctxCores');
  const antes = getComputedStyle(menuCor).display;
  g.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 200));
  return { antes, depois: getComputedStyle(menuCor).display };
});
ok('acabamento nao abre o menu de cores', semCor.depois === semCor.antes, JSON.stringify(semCor));

await b.close();
console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
