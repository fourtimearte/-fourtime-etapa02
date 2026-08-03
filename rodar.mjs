#!/usr/bin/env node
/* ================================================================
   RODAR — executa as suítes em paralelo e resume.

     node rodar.mjs              as suítes de regressão
     node rodar.mjs subida       só o que a publicação muda de verdade
     node rodar.mjs tudo         + Trello/impressão + A4 + as 9 antigas
     node rodar.mjs pop modal    só as que casarem com esses nomes

   Por padrão as suítes rodam contra a versão do próprio arquivo delas.
   Para apontar todas para outra versão:

     FT_ARQ=fourtime-editor-v277.html FT_VER=3.277 node rodar.mjs tudo

   A máquina tem 2 núcleos, então o paralelismo útil é pequeno: 3 de cada
   vez foi o melhor medido (com 6 o tempo total PIOROU, porque três
   Chromium disputando 2 núcleos ficam mais lentos que a soma).
   ================================================================ */
import { spawn } from 'child_process';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const SUITES = [
  /* as mais demoradas primeiro: com fila, quem começa antes termina antes */
  'teste_dd_v273', 'teste_corte_v267', 'teste_largura_v267', 'teste_modal_v274',
  'teste_faixa_v268', 'teste_botoes_v271', 'teste_abas_v270', 'teste_cab_v269',
  'teste_pop_v274', 'teste_painel_v266', 'teste_kit_v276',
  /* v3.277 — módulo de layout, rodapé, cabeçalho 2+, compressão */
  'teste_v288_ajustes', 'teste_compat_v288', 'teste_impressao_escura', 'teste_painel_v288',
  'teste_arquivar_data', 'teste_cnpj', 'teste_brilho_obs', 'teste_cores_grupos',
  'teste_aviso_versao', 'teste_versao_servidor',
];
const EXTRA = ['verifica_trello', 'cmp_a4_chave'];
/* as suítes das versões anteriores: garantem que nada do que já funcionava
   foi perdido pelo caminho. Entram com "tudo". */
const ANTIGAS = [
  'teste_v260_em_261', 'teste_versao_v265', 'teste_toast_v263', 'teste_v261',
  'teste_v262', 'teste_escala_v266', 'teste_reg_v260', 'teste_logos_v263',
  'teste_relabre_v265',
];

/* O QUE RODAR NA HORA DE SUBIR

   Rodar a bateria inteira de novo no momento da publicação é quase toda
   redundante: o arquivo da versão nova é cópia byte a byte do que já foi
   testado, com uma linha diferente — a constante FT_EDITOR. O que MUDA na
   subida é outra coisa: a versão anterior passa a ser uma origem do teste
   de compatibilidade, e o servidor passa a servir outro arquivo.

   `node rodar.mjs subida` roda só isso — o específico da versão, a
   compatibilidade (que é onde a versão anterior entra) e o painel. Uns 45s
   em vez de 90s. A bateria inteira é para quando o CÓDIGO muda. */
const SUBIDA = [
  'teste_v288_ajustes',      /* o que a versão trouxe                        */
  'teste_arquivar_data',     /* a data de arquivamento: modal, máscara, pasta */
  'teste_cnpj',              /* CNPJ: máscara, duas fontes, ficha se preenche   */
  'teste_brilho_obs',        /* brilhar/pulsar no arquivo do Trello             */
  'teste_cores_grupos',      /* cores por grupo: menu, banco e compatibilidade  */
  'teste_compat_v288',       /* aqui a versão anterior entra como origem     */
  'teste_painel_v288',       /* nenhum token do painel pode ter morrido      */
  'teste_impressao_escura',  /* o documento do cliente e o papel             */
  'teste_aviso_versao', 'teste_versao_servidor',      /* sem isto, ninguém fica sabendo da publicação */
];

const arg = process.argv.slice(2);
let lista = SUITES.slice();
if (arg.includes('subida')) lista = SUBIDA;
else if (arg.includes('tudo')) lista = lista.concat(EXTRA, ANTIGAS);
/* 'subida' e 'tudo' são MODOS, não filtros de nome */
const filtros = arg.filter(a => a !== 'tudo' && a !== 'subida');
if (filtros.length) lista = SUITES.concat(EXTRA, ANTIGAS).filter(s => filtros.some(f => s.includes(f)));

const LIMITE = 3;
const t0 = Date.now();
const resultados = [];
let fila = lista.slice();

function roda(nome) {
  return new Promise(res => {
    const ini = Date.now();
    const p = spawn('node', [nome + '.mjs'], { cwd: DIR.slice(0,-1) });
    let saida = '';
    p.stdout.on('data', d => saida += d);
    p.stderr.on('data', d => saida += d);
    p.on('close', code => {
      const seg = ((Date.now() - ini) / 1000).toFixed(1);
      resultados.push({ nome, code, seg, saida });
      process.stdout.write(`${code === 0 ? '  ok ' : 'FALHA'}  ${nome.padEnd(22)} ${seg}s\n`);
      res();
    });
  });
}

async function trabalhador() { while (fila.length) await roda(fila.shift()); }
await Promise.all(Array.from({ length: Math.min(LIMITE, lista.length) }, trabalhador));

const ruins = resultados.filter(r => r.code !== 0);
console.log('-'.repeat(52));
console.log(`${resultados.length} suítes · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${ruins.length} falha(s)`);
for (const r of ruins) {
  console.log(`\n===== ${r.nome} =====`);
  const linhas = r.saida.split('\n').filter(l => /FALHOU|! /.test(l));
  console.log(linhas.slice(0, 25).join('\n') || r.saida.slice(-1500));
}
process.exit(ruins.length ? 1 : 0);
