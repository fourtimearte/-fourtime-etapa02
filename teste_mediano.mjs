/* ================================================================
   O NIVEL MEDIANO, NUMA SUITE SO

   Eram catorze arquivos. O que se repetia entre eles nao eram as
   conferencias, era o PREPARO, como no extremo. Contado antes de mexer:

       22 aberturas de pagina de editor
        8 montagens do orcamento de teste (miKitTeste)
        4 exportacoes do arquivo do Trello, uma por suite

   O documento de teste e sempre o mesmo. O arquivo exportado atende os
   quatro usos sem conflito. E oito perfis de pagina dao conta de tudo:
   o que separa uma suite da outra nao e o conteudo, e o AMBIENTE (tema,
   media de impressao, largura de celular, localStorage, modo admin).

   Por isso a divisao aqui e por AMBIENTE, e nao por assunto:

     A  editor limpo, kit montado uma vez, rotas de CEP/CNPJ/versao
     B  editor com o painel de desenvolvimento ligado
     C  editor com troca de tema e de media
     D  editor em tema escuro
     E  editor em modo administrador, com trocas de largura
     F  o arquivo exportado, no computador
     G  o arquivo exportado, recem-aberto (a animacao so toca ao abrir)
     H  o arquivo exportado, num celular de verdade

   As de ambiente pesado (C, D, E) e as do arquivo (F, G, H) correm em
   paralelo com as demais, do mesmo jeito que no extremo.
   ================================================================ */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { tmpdir } from 'os';
import { join } from 'path';

const DIR = import.meta.dirname + '/';
const ARQ = process.env.FT_ARQ || editorAtual();
const VER = (readFileSync(DIR + ARQ, 'utf8').match(/const\s+FT_EDITOR\s*=\s*'([\d.]+)'/) || [])[1];
const URL_EDITOR = pathToFileURL(DIR + ARQ).href;

const falhas = [], err = [];
let contaOk = 0;

/* cada bloco recebe o SEU proprio 'diz', que carimba o nome do bloco.
   Assim, quando algo falha, a linha diz de onde veio sem precisar de
   arqueologia. */
function fazDiz(bloco, linhas) {
  return (rot, obtido, esperado) => {
    const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
    linhas.push(`  ${ok ? 'OK ' : 'FALHOU'}  ${rot.padEnd(58)} obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
    if (ok) contaOk++; else falhas.push('[' + bloco + '] ' + rot);
  };
}
const secao = (linhas, t) => linhas.push('\n  --- ' + t + ' ---');

const nav = await abreNavegador();

/* ---------------- as pecas que todo bloco pode pedir ---------------- */
async function novaPagina(opcoes) {
  const ctx = await nav.newContext(Object.assign({ viewport: { width: 1500, height: 1000 } }, opcoes || {}));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000); p.setDefaultNavigationTimeout(60000);
  p.on('pageerror', e => err.push(String(e).slice(0, 180)));
  return { ctx, p };
}

/* O DOCUMENTO DE TESTE, MONTADO UMA VEZ.
   Oito das catorze suites clicavam no kit e esperavam de 0,6 a 2,6s
   depois. E sempre o mesmo documento. */
async function montaKit(p) {
  await p.evaluate(() => { const mi = document.getElementById('miKitTeste');
    if (!mi) throw new Error('sem kit de teste');
    mi.hidden = false; mi.style.display = ''; mi.click(); });
  let ant = null;
  for (let i = 0; i < 80; i++) {
    const agora = await p.evaluate(() => JSON.stringify({
      n: (coletaEstado().layouts || []).length,
      t: (document.querySelector('.rt-geral') || {}).textContent || '' }));
    if (ant === agora && JSON.parse(agora).n > 0) return;
    ant = agora; await p.waitForTimeout(120);
  }
}

/* espera o documento parar de mudar: duas leituras iguais seguidas */
async function assenta(p, ler) {
  let ant = null;
  for (let i = 0; i < 60; i++) {
    const agora = await p.evaluate(ler);
    const s = JSON.stringify(agora);
    if (ant === s) return agora;
    ant = s; await p.waitForTimeout(120);
  }
  return JSON.parse(ant);
}

const F = { DIR, ARQ, VER, URL_EDITOR, novaPagina, montaKit, assenta,
            esperaPronto, tmpdir, join, readFileSync, writeFileSync,
            existsSync, pathToFileURL };

/* ---------------- os blocos ---------------- */
const BLOCOS = [
  { nome: 'A. O DOCUMENTO', mod: './mediano/a-documento.mjs', junto: false },
  { nome: 'B. O PAINEL DE DESENVOLVIMENTO', mod: './mediano/b-painel.mjs', junto: true },
  { nome: 'C. OS AJUSTES DA v3.277', mod: './mediano/c-ajustes.mjs', junto: true },
  { nome: 'D. A IMPRESSAO EM TEMA ESCURO', mod: './mediano/d-escura.mjs', junto: true },
  { nome: 'E. O MENU DE DIAS', mod: './mediano/e-dropdown.mjs', junto: true },
  { nome: 'F. O ARQUIVO DO TRELLO', mod: './mediano/f-trello.mjs', junto: true },
];

const so = process.argv.slice(2).filter(a => !a.startsWith('-'));
const escolhidos = so.length
  ? BLOCOS.filter(b => so.some(s => b.mod.includes(s) || b.nome.toLowerCase().includes(s.toLowerCase())))
  : BLOCOS;

console.log(`\nmediano em ${ARQ} (v${VER})  ·  ${escolhidos.length} blocos\n`);

const t0 = Date.now();
async function roda(b) {
  const linhas = [];
  const t = Date.now();
  try {
    const m = await import(b.mod);
    await m.roda(Object.assign({}, F, { diz: fazDiz(b.nome.split('.')[0], linhas),
                                        secao: t => secao(linhas, t) }));
  } catch (e) {
    linhas.push('  FALHOU  o bloco quebrou: ' + String(e.message || e).slice(0, 200));
    falhas.push('[' + b.nome + '] o bloco quebrou: ' + String(e.message || e).slice(0, 160));
  }
  return { nome: b.nome + '  (' + ((Date.now() - t) / 1000).toFixed(1) + 's)', linhas };
}

/* os de ambiente proprio correm juntos; o A fica no fluxo principal
   porque e o mais longo e o que gera o arquivo exportado */
const emParalelo = Promise.all(escolhidos.filter(b => b.junto).map(roda));
const sozinhos = [];
for (const b of escolhidos.filter(b => !b.junto)) sozinhos.push(await roda(b));

for (const r of sozinhos.concat(await emParalelo)) {
  console.log('=== ' + r.nome + ' ===');
  r.linhas.forEach(l => console.log(l));
  console.log('');
}

console.log('='.repeat(80));
console.log('     ' + ((Date.now() - t0) / 1000).toFixed(1) + 's no total');
/* uma suite que encolhe em silencio e pior que uma suite quebrada */
const MINIMO = 250;
const total = contaOk + falhas.length;
const ok = total >= MINIMO;
console.log(`  ${ok ? 'OK ' : 'FALHOU'}  a suite nao encolheu: ${total} conferencias (piso ${MINIMO})`);
if (!ok) falhas.push('a suite encolheu para ' + total + ' conferencias');
const semErro = err.length === 0;
console.log(`  ${semErro ? 'OK ' : 'FALHOU'}  nenhum erro de pagina: ${err.length}`);
if (!semErro) { err.slice(0, 6).forEach(e => console.log('     ! ' + e));
  falhas.push('erro de pagina'); }

await nav.close();
if (falhas.length) {
  console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`);
  process.exit(1);
}
console.log('MEDIANO: o documento, o painel, a impressao e o arquivo do Trello');
