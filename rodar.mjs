#!/usr/bin/env node
/* ================================================================
   RODAR — executa as suítes em paralelo e resume.

     node rodar.mjs extremo      o que não pode quebrar em silêncio    ~32s
     node rodar.mjs mediano      + o que atrapalha o trabalho do dia     ~50s
     node rodar.mjs normal       + aparência e versões antigas          140s
     node rodar.mjs              o mesmo que 'normal'
     node rodar.mjs tudo         + Trello/A4 + as 9 antigas             ~3min

   A compatibilidade dos .ft não abre mais os editores antigos: ela usa as
   amostras congeladas em compat-amostras/. Para refazê-las abrindo as 54
   versões de verdade: `node gera_fixtures_compat.mjs` (uns 20 minutos).
     node rodar.mjs subida       só o que a publicação muda de verdade
     node rodar.mjs pop modal    só as que casarem com esses nomes

   Os níveis SOMAM: 'mediano' roda o extremo junto. A tabela de quem está
   em qual nível fica logo abaixo de SUBIDA, com o motivo de cada um.

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
  'teste_v303_ajustes', 'teste_compat_v303', 'teste_impressao_escura', 'teste_painel_v303',
  'teste_arquivar_data', 'teste_cnpj', 'teste_brilho_obs', 'teste_cores_grupos',
  'teste_freio_servidor', 'teste_v303_correcoes', 'teste_cabecalho_v303',
  'teste_impressao_cores', 'teste_painel_abas', 'teste_marca_padrao', 'teste_tabela_cantos',
  'teste_filtros_trello', 'teste_login_admin', 'teste_dropdown_altura',
  'teste_login_editor', 'teste_pessoas', 'teste_celular_trello',
  'teste_papel_editor',
  /* v3.311 — Relatório de Atividade */
  'teste_atividade', 'teste_atividade_servidor',
  'teste_aviso_versao', 'teste_versao_servidor',
  /* v3.313 — os dois primeiros níveis, uma suíte cada */
  'teste_extremo', 'teste_mediano',
  /* v3.314 — o pacote de DTF e os dois botões de cópia */
  'teste_dtf',
  /* v3.326 — o índice mensal: a semana virou pergunta, o pedido virou
     registro. Este roda o server.py por dentro, sem HTTP nem navegador,
     porque a regra do recado precisa ser cobrada onde ela mora. */
  'teste_indice_mensal',
  /* v3.348 — a mesclagem do servidor: a exclusão vence o cadastro do
     mesmo envio, e a lápide só cede ao admin. É a regra que obriga o
     editor a cancelar a exclusão pendente ao recadastrar. */
  'teste_mescla_servidor',
  /* v3.328 — o anexo que se reconhece sozinho e o cliente com tres nomes */
  'teste_info_e_busca',
  /* v3.333 — renomear e apagar referencia, com a ficha de material junto */
  'teste_ref_banco',
  /* v3.334 — o catalogo de tecidos por tipo, a conversao e as duas telas */
  'teste_tecidos_tipos',
  /* v3.338 — a lupa que abre a busca da arte no Explorer */
  'teste_arte_explorer',
  /* v3.351 — a varredura das caixas espremidas. Um flex em coluna sem
     altura + um filho com overflow:hidden e flex-shrink no padrao corta
     o conteudo SEM barra de rolagem: some sem deixar rastro. Roda em
     janela baixa, em todas as secoes. */
  'teste_caixas_espremidas',
  /* v3.358 - A RESPOSTA QUE NUNCA CHEGA. Categoria que as 37 suites nao
     cobriam: todas mediam o que acontece QUANDO a resposta chega, certa
     ou errada. Um fetch pendurado deixava o cadeado da sincronizacao
     fechado para sempre e so o F5 recuperava. */
  'teste_sync_travado',
];
const EXTRA = ['verifica_trello', 'cmp_a4_chave',
  /* o Relatório de Atividade ainda é maquete, não faz parte do editor
     publicado. Mas a maquete é onde a decisão de layout está sendo
     tomada, e decisão tomada em cima de medida errada custa caro:
     ficam aqui, e entram com "tudo". */
  'teste_mockup_a4', 'teste_a4_impressao'];
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
  'teste_v303_ajustes',      /* o que a versão trouxe                        */
  'teste_arquivar_data',     /* a data de arquivamento: modal, máscara, pasta */
  'teste_cnpj',              /* CNPJ: máscara, duas fontes, ficha se preenche   */
  'teste_brilho_obs',        /* brilhar/pulsar no arquivo do Trello             */
  'teste_cores_grupos',      /* cores por grupo: menu, banco e compatibilidade  */
  'teste_freio_servidor',    /* o catálogo passa, a duplicação continua barrada */
  'teste_v303_correcoes',    /* CEP após o blur, painel x fonte, visualizador   */
  'teste_cabecalho_v303',    /* as 12 células do cabeçalho, uma a uma           */
  'teste_impressao_cores',   /* a paleta de papel: só no print, e sincronizada  */
  'teste_painel_abas',       /* as quatro abas, a maquete e o copiar-tudo       */
  'teste_marca_padrao',      /* cada token diz se está no arquivo ou só aqui    */
  'teste_tabela_cantos',     /* os 4 cantos da tabela, com e sem valores        */
  'teste_filtros_trello',    /* filtros do arquivo do Trello + barra fixa       */
  'teste_login_admin',       /* a senha de administrador entra em maquina nova  */
  'teste_dropdown_altura',   /* o menu mostra a lista inteira, e avisa se rola  */
  'teste_login_editor',      /* login por pessoa: porta, papel e troca de senha  */
  'teste_pessoas',           /* administrar gente: renomear leva a senha junto   */
  'teste_celular_trello',    /* o arquivo do Trello num celular de verdade      */
  'teste_papel_editor',      /* quem monta assina depois de quem vendeu         */
  'teste_atividade',         /* gerar de novo não derruba o planejamento da semana */
  'teste_atividade_servidor',/* a marca por pessoa, e dinheiro nenhum na atividade */
  'teste_compat_v303',       /* aqui a versão anterior entra como origem     */
  'teste_painel_v303',       /* nenhum token do painel pode ter morrido      */
  'teste_impressao_escura',  /* o documento do cliente e o papel             */
  'teste_aviso_versao', 'teste_versao_servidor',      /* sem isto, ninguém fica sabendo da publicação */
];

/* ================================================================
   OS TRES NIVEIS

   O criterio NAO e "quebra com que frequencia". E outro:

       o que custa se isto quebrar E NINGUEM PERCEBER?

   Um defeito que salta aos olhos na primeira tela e barato: alguem ve e
   avisa. O caro e o que passa despercebido por semanas, e e esse que
   precisa de rede embaixo.

   EXTREMO   perde dado, tranca gente do lado de fora, ou faz o sistema
             mentir numero. Silencioso e caro de desfazer. Roda SEMPRE,
             por menor que seja a alteracao.

   MEDIANO   quebra visivel, mas atrapalha o trabalho do dia e e cara de
             achar depois. Roda quando a alteracao encosta no editor.

   NORMAL    aparencia, tokens do painel de desenvolvimento e as suites
             presas em versoes antigas. Some se quebrar, ninguem perde
             nada. Roda antes de publicar.

   Os niveis SOMAM: mediano roda o extremo junto, normal roda os tres.
   ================================================================ */
/* EXTREMO É UMA SUÍTE SÓ desde a v3.313.

   Eram nove arquivos e 195s. O que se repetia entre eles não eram as
   conferências: era o PREPARO. Cada arquivo subia o próprio servidor,
   abria o próprio navegador e fazia os próprios logins pela interface, e
   um ciclo de login pela interface custa 27s medidos. Os nove faziam 18
   desses ciclos, quase todos só para CHEGAR ao estado em que a
   conferência começava.

   `teste_extremo.mjs` faz 267 conferências em 32s: um servidor, um
   navegador, as senhas pela API, a verdade do servidor por fetch, o
   comportamento da tela numa página só trocando a identidade em memória,
   e a compatibilidade dos .ft lida de amostras congeladas em vez de
   editores antigos carregados na hora.

   Os nove arquivos originais continuam na pasta e rodam por nome
   (`node rodar.mjs teste_pessoas`), para quando for preciso isolar uma
   parte. Não entram em nenhum modo automático: rodá-los junto seria
   pagar o preço antigo de novo. */
/* O DTF ENTRA NO EXTREMO, e não no mediano, por um motivo só: o que sai
   daquele botão vira ordem de produção. Um número errado ali não aparece
   na tela de ninguém — aparece na mesa de corte, com o material já
   gasto. É a definição de perder dado, só que do lado de fora do
   editor. São 15 segundos a mais na suíte. */
const EXTREMO = ['teste_extremo', 'teste_dtf'];
const ABSORVIDAS = [
  /* viraram teste_extremo.mjs */
  'teste_compat_v303', 'teste_login_editor', 'teste_pessoas', 'teste_papel_editor',
  'teste_atividade', 'teste_atividade_servidor', 'teste_login_admin',
  'teste_freio_servidor', 'teste_versao_servidor',
  /* viraram teste_mediano.mjs */
  'teste_v303_ajustes', 'teste_v303_correcoes', 'teste_cabecalho_v303',
  'teste_arquivar_data', 'teste_cnpj', 'teste_cores_grupos', 'teste_filtros_trello',
  'teste_celular_trello', 'teste_brilho_obs', 'teste_dropdown_altura',
  'teste_impressao_cores', 'teste_impressao_escura', 'teste_tabela_cantos',
  'teste_aviso_versao',
];
/* MEDIANO TAMBÉM É UMA SUÍTE SÓ, desde a v3.313.

   Eram catorze arquivos. Contado antes de mexer: 22 aberturas de página de
   editor, 8 montagens do orçamento de teste e 4 exportações do arquivo do
   Trello, para fazer o que precisa de 8 páginas, 1 kit e 1 exportação. O
   que separa uma suíte da outra não é o assunto, é o AMBIENTE (tema, mídia
   de impressão, largura de celular, localStorage, modo admin), e por isso
   `teste_mediano.mjs` é dividido por ambiente e não por assunto.

   398 conferências em 32s, contra 14 arquivos e uns 150s.

   Os catorze originais continuam na pasta e rodam por nome, para isolar
   uma parte quando for preciso. Não entram em modo automático nenhum. */
const MEDIANO = ['teste_mediano'];
/* NORMAL é o resto do que já rodava: o que sobrar de SUITES depois de tirar
   os dois primeiros níveis. Escrito assim de propósito — acrescentar uma
   suíte nova a SUITES não pode deixá-la de fora da bateria por esquecimento. */
const NORMAL = SUITES.filter(x => !EXTREMO.includes(x) && !MEDIANO.includes(x)
                               && !ABSORVIDAS.includes(x));

const arg = process.argv.slice(2);
const MODOS = ['tudo', 'subida', 'extremo', 'mediano', 'normal'];
let lista = SUITES.filter(x => !ABSORVIDAS.includes(x));
let nivel = 'normal (a bateria de sempre)';
if (arg.includes('subida')) { lista = SUBIDA; nivel = 'subida'; }
else if (arg.includes('tudo')) { lista = lista.concat(EXTRA, ANTIGAS); nivel = 'tudo'; }
else if (arg.includes('extremo')) { lista = EXTREMO; nivel = 'extremo'; }
else if (arg.includes('mediano')) { lista = EXTREMO.concat(MEDIANO); nivel = 'extremo + mediano'; }
else if (arg.includes('normal'))  { lista = EXTREMO.concat(MEDIANO, NORMAL); nivel = 'os tres niveis'; }
/* os modos são MODOS, não filtros de nome */
const filtros = arg.filter(a => !MODOS.includes(a));
if (filtros.length) {
  lista = SUITES.concat(EXTRA, ANTIGAS).filter(s => filtros.some(f => s.includes(f)));
  nivel = 'filtro: ' + filtros.join(' ');
}
const ondeEsta = n => EXTREMO.includes(n) ? 'EXTREMO'
                    : MEDIANO.includes(n) ? 'mediano'
                    : ABSORVIDAS.includes(n) ? 'absorvida' : 'normal';
console.log('nivel: ' + nivel + '  ·  ' + lista.length + ' suites\n');

/* DOIS DE CADA VEZ, E NAO TRES, DESDE QUE EXTREMO E MEDIANO VIRARAM
   SUITES UNICAS. Cada uma delas ja abre de tres a seis paginas por dentro;
   multiplicar isso por tres na fila de fora punha quinze Chromium em dois
   nucleos, e o que aparecia era leitura tirada no meio de transicao. Os
   defeitos foram consertados esperando sinal, mas o paralelismo de fora
   perdeu a razao de ser: quem paraleliza agora sao as proprias suites. */
const LIMITE = 2;
const t0 = Date.now();
const resultados = [];
let fila = lista.slice();

/* NEM TODA SUÍTE É JAVASCRIPT.
   As do servidor são Python, e rodavam à mão até agora: ficavam de fora da
   bateria justamente por isso, que é o mesmo que não existir. Quem decide
   com o que rodar é o arquivo que está na pasta. */
import { existsSync } from 'fs';
function comando(nome) {
  return existsSync(DIR + nome + '.py')
    ? ['python3', [nome + '.py']]
    : ['node', [nome + '.mjs']];
}

function roda(nome) {
  return new Promise(res => {
    const ini = Date.now();
    const [exe, args] = comando(nome);
    const p = spawn(exe, args, { cwd: DIR.slice(0,-1) });
    let saida = '';
    p.stdout.on('data', d => saida += d);
    p.stderr.on('data', d => saida += d);
    p.on('close', code => {
      const seg = ((Date.now() - ini) / 1000).toFixed(1);
      resultados.push({ nome, code, seg, saida });
      process.stdout.write(`${code === 0 ? '  ok ' : 'FALHA'}  ${nome.padEnd(26)}`
        + `${String(seg).padStart(6)}s  ${ondeEsta(nome)}\n`);
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
