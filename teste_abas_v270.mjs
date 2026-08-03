/* v3.270 — abas do editor pelo Design Kit v5 §08.
   As abas não entram no A4 nem no relatório: mudança de interface. Este
   teste garante que o COMPORTAMENTO (abrir, trocar, fechar, sujo) não
   mudou junto com o visual. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(50)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const browser = await abreNavegador();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const erros = [];
page.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(DIR+(process.env.FT_ARQ||'fourtime-editor-v276.html')).href);
await esperaPronto(page);

console.log('\n=== 0. CARREGOU ===');
checa('versão', await page.evaluate(() => FT_EDITOR), (process.env.FT_VER||'3.276'));
checa('sem erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 4).forEach(e => console.log('     ! ' + e));

console.log('\n=== 1. COMPORTAMENTO: abrir, trocar, fechar ===');
let r = await page.evaluate(async () => {
  const espera = ms => new Promise(s => setTimeout(s, ms));
  const abas = () => [...document.querySelectorAll('.ft-tab')];
  const inicio = abas().length;
  document.getElementById('ftTabMais').click(); await espera(300);
  document.getElementById('ftTabMais').click(); await espera(300);
  const depois = abas().length;
  const ativaDepoisDeCriar = abas().findIndex(t => t.classList.contains('on'));
  abas()[0].click(); await espera(250);
  const ativaDepoisDeClicar = abas().findIndex(t => t.classList.contains('on'));
  const alvo = abas()[abas().length - 1];
  alvo.querySelector('.ft-tab-x').click(); await espera(300);
  return { inicio, depois, ativaDepoisDeCriar, ativaDepoisDeClicar, aposFechar: abas().length };
});
checa('nasce com 1 aba', r.inicio, 1);
checa('o "+" cria abas', r.depois, 3);
checa('  e a nova já vem ativa', r.ativaDepoisDeCriar, 2);
checa('clicar numa aba troca para ela', r.ativaDepoisDeClicar, 0);
checa('o × fecha', r.aposFechar, 2);

console.log('\n=== 2. VISUAL DO KIT §08 ===');
r = await page.evaluate(() => {
  const barra = getComputedStyle(document.querySelector('.ft-tabbar'));
  const abas = [...document.querySelectorAll('.ft-tab')];
  const off = abas.find(t => !t.classList.contains('on'));
  const on = abas.find(t => t.classList.contains('on'));
  const co = getComputedStyle(off), cn = getComputedStyle(on);
  return {
    barraFundo: barra.backgroundColor, gap: barra.gap,
    raioInativa: co.borderRadius, fundoInativa: co.backgroundColor, corInativa: co.color,
    fundoAtiva: cn.backgroundColor, corAtiva: cn.color, bordaAtiva: cn.borderTopColor,
    topoInativa: co.top, topoAtiva: cn.top,
    xOpacidade: getComputedStyle(off.querySelector('.ft-tab-x')).opacity,
  };
});
checa('barra no cinza n-100 do kit', r.barraFundo, 'rgb(238, 241, 244)');
checa('respiro de 2px entre abas', r.gap, '2px');
checa('raio r-sm só em cima', r.raioInativa, '6px 6px 0px 0px');
checa('inativa na superfície-2 do kit', r.fundoInativa, 'rgb(251, 252, 253)');
checa('  com o texto em --text-muted', r.corInativa, 'rgb(93, 103, 117)');
checa('ativa preenchida no vermelho da marca', r.fundoAtiva, 'rgb(198, 22, 27)');
checa('  texto branco', r.corAtiva, 'rgb(255, 255, 255)');
checa('  e a borda acompanha', r.bordaAtiva, 'rgb(198, 22, 27)');
/* é o degrau de 1px que faz a aba ativa "ser" a página */
checa('inativa 1px abaixo', r.topoInativa, '1px');
checa('  ativa encostada na área', r.topoAtiva, '0px');
checa('o × nasce discreto (.6)', r.xOpacidade, '0.6');

console.log('\n=== 3. ANIMAÇÕES NOMEADAS DO CATÁLOGO ===');
r = await page.evaluate(() => {
  const t = document.querySelector('.ft-tab');
  const nome = el => getComputedStyle(el).animationName;
  const dot = t.querySelector('.ft-tab-sujo');
  return { entrada: nome(t), sujo: nome(dot),
           dur: getComputedStyle(t).animationDuration,
           mais: getComputedStyle(document.getElementById('ftTabMais')).transitionProperty };
});
checa('aba entra com crescer-surgir', r.entrada, 'a-crescer');
checa('  em 0,32s como no catálogo', r.dur, '0.32s');
checa('o ● de não-salvo usa pulsar', r.sujo, 'a-pulsar');
checa('o "+" tem transição declarada', /background/.test(r.mais), true);

r = await page.evaluate(() => {
  const t = document.querySelector('.ft-tab');
  /* :active não dá para simular por JS; a regra é o que se pode conferir */
  const regras = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
  const txt = regras.map(x => x.cssText).join('\n');
  /* cssText normaliza para "seletor { regra; }" COM espaços — o \{ colado
     do 1º teste nunca casava. E /ft-tab-in/ casava com --ft-tab-inativa-bg,
     dando falso negativo na checagem da curva antiga. */
  /* TODAS as ocorrências, não a primeira: o mesmo seletor pode aparecer em
     dois blocos, e casar só a 1ª dava falso negativo quando a regra
     procurada estava na 2ª. */
  const regra = sel => (txt.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}', 'g')) || []).join(' ');
  return { pressionarAba: /a-pressionar/.test(regra('.ft-tab:active')),
           pressionarMais: /a-pressionar/.test(regra('.ft-tab-mais:active')),
           semAntigo: !/@keyframes ft-tab-in\b/.test(txt) && !/animation:[^;]*ft-tab-in\b/.test(txt) };
});
checa('clique na aba usa pressionar', r.pressionarAba, true);
checa('clique no "+" também', r.pressionarMais, true);
checa('a curva antiga saiu de cena', r.semAntigo, true);

console.log('\n=== 4. FOCO PELO TECLADO ===');
r = await page.evaluate(() => {
  const regras = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } })
    .map(x => x.cssText).join('\n');
  /* espaços dentro do rgba() variam conforme quem escreveu: comparar
     normalizado, senão o teste vira uma checagem de formatação */
  return { anel: getComputedStyle(document.documentElement).getPropertyValue('--ft-anel').replace(/\s+/g, ''),
           abaFoco: /\.ft-tab:focus-visible/.test(regras),
           maisFoco: /\.ft-tab-mais:focus-visible/.test(regras) };
});
checa('o token do anel existe', r.anel, 'rgba(198,22,27,.35)');
checa('a aba tem anel de foco', r.abaFoco, true);
checa('o "+" também', r.maisFoco, true);

console.log('\n=== 5. NADA DISSO ENTRA NO A4 / TRELLO / PAPEL ===');
r = await page.evaluate(() => {
  const html = gerarHTML([]);
  const d = new DOMParser().parseFromString(html, 'text/html');
  return { barraNoArquivo: !!d.getElementById('ftTabBar'),
           abasNoArquivo: d.querySelectorAll('.ft-tab').length,
           dentroDaFolha: !!document.querySelector('.folha-a4 .ft-tab') };
});
checa('a barra não vai para o Trello', r.barraNoArquivo, false);
checa('  nem as abas', r.abasNoArquivo, 0);
checa('as abas vivem fora da folha', r.dentroDaFolha, false);
await page.emulateMedia({ media: 'print' });
r = await page.evaluate(() => getComputedStyle(document.querySelector('.ft-tabbar')).display);
checa('no papel a barra some', r, 'none');
await page.emulateMedia({ media: 'screen' });

console.log('\n=== 6. TEMA ESCURO ===');
r = await page.evaluate(async () => {
  document.body.dataset.tema = 'escuro';
  /* a aba tem transição de 120 ms no fundo: lendo na hora, o computado ainda
     é o valor CLARO no meio do caminho. Não era o CSS: era pressa do teste. */
  await new Promise(s => setTimeout(s, 300));
  const off = [...document.querySelectorAll('.ft-tab')].find(t => !t.classList.contains('on'));
  const c = getComputedStyle(off);
  /* o bloco escuro é body[data-tema], não :root — ler do documentElement
     devolvia sempre o valor claro */
  const anel = getComputedStyle(document.body).getPropertyValue('--ft-anel').replace(/\s+/g, '');
  const barra = getComputedStyle(document.querySelector('.ft-tabbar')).backgroundColor;
  document.body.dataset.tema = '';
  return { fundo: c.backgroundColor, cor: c.color, anel, barra };
});
checa('inativa escura, não branca', r.fundo, 'rgb(28, 33, 42)');
checa('  texto legível', r.cor, 'rgb(154, 165, 179)');
checa('o anel clareia junto', r.anel, 'rgba(242,106,111,.40)');
checa('a barra escurece', r.barra, 'rgb(42, 48, 55)');

console.log('\n' + '='.repeat(60));
checa('nenhum erro de página no total', erros.length, 0);
await browser.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('v3.270: ABAS PELO KIT v5 §08');
