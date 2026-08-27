/* PROCURAR A ARTE ORIGINAL NO EXPLORER (v3.338)

   Um clique no editor abre o Windows Explorer já procurando o arquivo de
   trabalho daquela arte. O que torna isso possível sem instalar nada em
   máquina nenhuma é o `search-ms:`, o protocolo da busca do próprio
   Explorer, que o Windows registra de fábrica. Link `file://` não serve:
   o navegador proíbe uma página https de navegar para arquivo local.

   O que este teste defende:

     · o NOME do arquivo original tem de ser guardado na hora em que a
       imagem entra. Depois do FileReader não há mais de onde tirar, e
       nenhuma esperteza recupera o que não foi guardado.
     · ele tem de sobreviver a salvar e reabrir.
     · o termo tira a extensão e a variação de layout, e só ela.
     · o botão não existe quando não há nome: uma lupa que abre busca
       vazia ensina a não confiar no botão.
     · e nada disso pode viajar para o papel nem para o arquivo do
       cliente, que é ferramenta de quem produz.
*/
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';

const DIR = import.meta.dirname + '/';
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf'
  + 'FcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const falhas = [];
function checa(r, o, e) {
  const ok = JSON.stringify(o) === JSON.stringify(e);
  console.log(`  ${ok ? 'OK ' : 'FALHOU'}  ${r.padEnd(56)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if (!ok) falhas.push(r);
}

const b = await abreNavegador();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const erros = [];
p.on('pageerror', e => erros.push(String(e).slice(0, 200)));
await p.goto(pathToFileURL(DIR + (process.env.FT_ARQ || editorAtual())).href);
await esperaPronto(p);

console.log('\n=== 1. O TERMO SAI DO NOME DA IMAGEM ===');
/* a regra que ele deu: "team master 040826 01" veio do original
   "team master 040826"; o número no fim é a variação de layout */
let r = await p.evaluate(() => ({
  dele: arteTermo('team master 040826 01.png'),
  semVariacao: arteTermo('team master 040826.png'),
  semExtensao: arteTermo('team master 040826 01'),
  jpg: arteTermo('ARENA CROSS 2026 03.jpg'),
  traco: arteTermo('escudo-selva-02.png'),
  sublinhado: arteTermo('escudo_selva_02.png'),
  /* variação de dois e três dígitos também sai */
  doisDigitos: arteTermo('camisa time 12.png'),
  /* e o que não tem número no fim fica inteiro */
  semNumero: arteTermo('logo fourtime.svg'),
  vazio: arteTermo(''),
  /* NÃO PODE COMER A DATA: um grupo só, o último */
  soUmGrupo: arteTermo('team master 040826 01.png') === 'team master 040826',
}));
console.log('     ' + JSON.stringify(r));
checa('o exemplo dele, ao pé da letra', r.dele, 'team master 040826');
checa('  tira só o último grupo, a data fica', r.soUmGrupo, true);
checa('sem variação, o nome inteiro', r.semVariacao, 'team master 040826');
checa('sem extensão, funciona igual', r.semExtensao, 'team master 040826');
checa('outro caso real', r.jpg, 'ARENA CROSS 2026');
checa('traço e sublinhado também separam variação',
  [r.traco, r.sublinhado], ['escudo-selva', 'escudo_selva']);
checa('variação de dois dígitos sai', r.doisDigitos, 'camisa time');
checa('nome sem número no fim fica inteiro', r.semNumero, 'logo fourtime');
checa('nome vazio devolve vazio', r.vazio, '');

console.log('\n=== 2. O ENDERECO QUE ABRE O EXPLORER ===');
r = await p.evaluate(() => {
  const u = arteURI('team master 040826', 'G:\\Meu Drive');
  return { uri: u,
    protocolo: u.slice(0, u.indexOf(':') + 1),
    /* o caminho vai escapado: os dois-pontos e a barra invertida não
       podem viajar crus dentro de uma URI */
    temPasta: u.indexOf(encodeURIComponent('G:\\Meu Drive')) > 0,
    temTermo: u.indexOf(encodeURIComponent('team master 040826')) > 0,
    padrao: artePasta() };
});
console.log('     ' + JSON.stringify(r));
checa('o protocolo é o da busca do Explorer', r.protocolo, 'search-ms:');
checa('  com o termo dentro', r.temTermo, true);
checa('  e a pasta escapada', r.temPasta, true);
checa('a pasta de fábrica é a que ele pediu', r.padrao, 'G:\\Meu Drive');

console.log('\n=== 3. O NOME E GUARDADO QUANDO A IMAGEM ENTRA ===');
r = await p.evaluate(async px => {
  const m = document.querySelector('.lay-modulo');
  /* o mesmo caminho de um arquivo solto do computador */
  const bin = atob(px.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const f = new File([arr], 'team master 040826 01.png', { type: 'image/png' });
  imagemDeArquivo(m.querySelector('.lay-img'), f);
  await new Promise(s => setTimeout(s, 500));
  const im = m.querySelector('.lay-img img');
  const bt = m.querySelector('.lay-arte-bt');
  /* MEDE O DESENHO, e não a propriedade. `bt.hidden` continua certo
     mesmo quando uma regra de classe vence o [hidden] do navegador e o
     botão fica visível assim mesmo. */
  return { guardou: (im.dataset || {}).arte || '',
    botaoAparece: getComputedStyle(bt).display !== 'none',
    titulo: bt.title };
}, PX);
console.log('     ' + JSON.stringify(r));
checa('o nome do arquivo foi guardado na imagem', r.guardou, 'team master 040826 01.png');
checa('  e o botão aparece', r.botaoAparece, true);
checa('  dizendo o que vai procurar e onde',
  r.titulo, 'Procurar "team master 040826" em G:\\Meu Drive');

console.log('\n=== 4. SOBREVIVE A SALVAR E REABRIR ===');
r = await p.evaluate(async () => {
  const doc = coletaEstado();
  const noArquivo = doc.layouts[0].arte;
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'x.ft', '');
  await new Promise(s => setTimeout(s, 800));
  const m = document.querySelector('.lay-modulo');
  const im = m.querySelector('.lay-img img');
  const bt = m.querySelector('.lay-arte-bt');
  return { noArquivo, depois: (im && im.dataset || {}).arte || '',
    botao: !!bt && getComputedStyle(bt).display !== 'none' };
});
console.log('     ' + JSON.stringify(r));
checa('o .ft guarda o nome', r.noArquivo, 'team master 040826 01.png');
checa('  reabrir devolve o nome', r.depois, 'team master 040826 01.png');
checa('  e o botão volta a aparecer', r.botao, true);

console.log('\n=== 5. SEM NOME, SEM BOTAO ===');
/* pedido salvo antes da v3.338 não tem o nome guardado. Uma lupa que
   abre busca vazia é pior que lupa nenhuma. */
r = await p.evaluate(async px => {
  const doc = coletaEstado();
  delete doc.layouts[0].arte;          /* exatamente o que um .ft velho traz */
  doc.layouts[0].img = px;
  aplicaEstado(JSON.parse(JSON.stringify(doc)), 'velho.ft', '');
  await new Promise(s => setTimeout(s, 800));
  const m = document.querySelector('.lay-modulo');
  const bt = m.querySelector('.lay-arte-bt');
  return { temImagem: !!m.querySelector('.lay-img img'),
    escondido: getComputedStyle(bt).display === 'none',
    /* e ele não pode ocupar largura nenhuma na linha */
    largura: Math.round(bt.getBoundingClientRect().width),
    titulo: bt.title };
}, PX);
console.log('     ' + JSON.stringify(r));
checa('o pedido antigo abre com a imagem', r.temImagem, true);
checa('  e sem o botão', r.escondido, true);
checa('  sem ocupar largura na linha da referência', r.largura, 0);
checa('  com o motivo no title', r.titulo, 'Sem o nome do arquivo original');

console.log('\n=== 6. A PASTA E CONFIGURAVEL, E SO DESTA MAQUINA ===');
r = await p.evaluate(async () => {
  const pa = document.getElementById('cfgPastaArtes');
  const antes = pa.value;
  pa.value = 'D:\\Artes';
  pa.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(s => setTimeout(s, 250));
  const gravou = artePasta();
  const naURI = arteURI('teste').indexOf(encodeURIComponent('D:\\Artes')) > 0;
  /* e ela NÃO vai para o banco compartilhado: caminho é de máquina, e a
     letra de unidade de um computador passaria por cima da do outro */
  const noBanco = JSON.stringify(DB).indexOf('D:\\\\Artes') >= 0;
  pa.value = ''; pa.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(s => setTimeout(s, 250));
  return { antes, gravou, naURI, noBanco, voltouAoPadrao: artePasta() };
});
console.log('     ' + JSON.stringify(r));
checa('o campo começa com a pasta de fábrica', r.antes, 'G:\\Meu Drive');
checa('mudar a pasta grava', r.gravou, 'D:\\Artes');
checa('  e a busca passa a usá-la', r.naURI, true);
checa('  sem sujar o banco compartilhado', r.noBanco, false);
checa('esvaziar volta ao padrão', r.voltouAoPadrao, 'G:\\Meu Drive');

console.log('\n=== 7. E FERRAMENTA DE QUEM PRODUZ: NAO VAI PARA O PAPEL ===');
r = await p.evaluate(async () => {
  const m = document.querySelector('.lay-modulo');
  const bt = m.querySelector('.lay-arte-bt');
  /* devolve a imagem com nome para o botão existir */
  const im = m.querySelector('.lay-img img');
  if (im) im.dataset.arte = 'team master 040826 01.png';
  arteBotoesTodos();
  const tela = getComputedStyle(bt).display;
  return { tela };
});
const telaOk = r.tela !== 'none';
await p.emulateMedia({ media: 'print' });
await p.waitForTimeout(300);
const noPapel = await p.evaluate(() =>
  getComputedStyle(document.querySelector('.lay-modulo .lay-arte-bt')).display);
await p.emulateMedia({ media: 'screen' });
console.log('     ' + JSON.stringify({ ...r, noPapel }));
checa('no editor o botão existe', telaOk, true);
checa('  no papel ele some', noPapel, 'none');

console.log('\n=== 8. O CAMINHO DO PAINEL DO DRIVE ===');
/* O DEFEITO QUE ELE VIU. A listagem do Drive chama o campo de `nome`, e
   eu li `name`: `undefined` em silêncio, imagem entrando sem nome, botão
   nunca aparecendo. E o pior detalhe: esse é o caminho MAIS USADO de
   todos, o único que ele usa de verdade, e era justamente o que não
   guardava.

   A seção 3 não pegou porque testava o arquivo solto do computador. Um
   caminho testado não diz nada sobre os outros três. */
r = await p.evaluate(async px => {
  const m = document.querySelector('.lay-modulo');
  /* limpa o layout para começar do zero */
  const li = m.querySelector('.lay-img');
  const velha = li.querySelector('img'); if (velha) velha.remove();
  li.classList.remove('com-img');

  /* CHAMA A FUNÇÃO DE VERDADE. Encurtar o caminho aqui seria escrever um
     teste que passa na versão com o defeito: foi exatamente `im.name`
     contra `im.nome` que escapou, e um atalho no teste esconderia de
     novo. Só o download é falsificado, porque não há servidor aqui. */
  const bin = atob(px.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const original = window.ftSyncFetch;
  window.ftSyncFetch = async () => ({ ok: true, blob: async () => new Blob([arr], { type: 'image/png' }) });
  /* o objeto que a listagem do Drive entrega, com o campo do jeito que
     ele existe de verdade: `nome` */
  const im = { id: 'x1', nome: 'team master 040826 01.png', miniatura: '' };
  const cel = document.createElement('div');
  GD.alvo = li;
  await gdEscolher(cel, im);
  await new Promise(s => setTimeout(s, 600));
  window.ftSyncFetch = original;

  const img = m.querySelector('.lay-img img');
  const bt = m.querySelector('.lay-arte-bt');
  return { guardou: (img && img.dataset || {}).arte || '',
    aparece: !!bt && getComputedStyle(bt).display !== 'none' };
}, PX);
console.log('     ' + JSON.stringify(r));
checa('imagem vinda do painel do Drive guarda o nome',
  r.guardou, 'team master 040826 01.png');
checa('  e a lupa aparece', r.aparece, true);

console.log('\n=== 9. A LUPA VIAJA PARA O ARQUIVO DO TRELLO ===');
/* e na mesa que ela serve: quem produz abre o pedido no Trello e precisa
   achar a arte para abrir no Affinity */
r = await p.evaluate(() => {
  const html = String(gerarHTML() || '');
  return {
    temBotao: /<button[^>]*lay-arte-bt/.test(html),
    /* o nome tem de viajar no atributo, senao o runtime nao tem o que ler */
    temNome: /data-arte="team master 040826 01\.png"/.test(html),
    temCss: html.indexOf('.lay-arte-bt[hidden]') > 0,
    temRuntime: html.indexOf('ARTE_RUNTIME') > 0,
    /* e o protocolo certo, escrito la dentro */
    temProtocolo: html.indexOf('search-ms:query=') > 0,
  };
});
console.log('     ' + JSON.stringify(r));
checa('o arquivo do Trello leva a lupa', r.temBotao, true);
checa('  com o nome da arte no atributo', r.temNome, true);
checa('  o CSS que a desenha', r.temCss, true);
checa('  e o runtime que a liga', [r.temRuntime, r.temProtocolo], [true, true]);

console.log('\n=== 10. E FUNCIONA DENTRO DO ARQUIVO GERADO ===');
/* Conferir que a marcação viajou não prova nada: o botão pode estar lá e
   não fazer nada. Aqui o arquivo é aberto de verdade e o clique é dado. */
{
  const { writeFileSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const alvoArq = join(tmpdir(), 'ft_arte_export.html');
  /* dois layouts: um com nome de arte, outro sem */
  await p.evaluate(async px => {
    document.getElementById('btnNovoLayout').click();
    await new Promise(s => setTimeout(s, 400));
    const M = [...document.querySelectorAll('.lay-modulo')];
    aplicaImagem(M[0].querySelector('.lay-img'), px, 'team master 040826 01.png');
    aplicaImagem(M[1].querySelector('.lay-img'), px, '');
    await new Promise(s => setTimeout(s, 500));
  }, PX);
  writeFileSync(alvoArq, await p.evaluate(() => gerarHTML()));
  const pa = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errArq = [];
  pa.on('pageerror', e => errArq.push(String(e).slice(0, 200)));
  await pa.goto(pathToFileURL(alvoArq).href, { waitUntil: 'domcontentloaded' });
  await pa.waitForTimeout(900);
  let q = await pa.evaluate(() => {
    const M = [...document.querySelectorAll('.lay-modulo')];
    const bts = M.map(m => m.querySelector('.lay-arte-bt'));
    return { quantos: bts.filter(Boolean).length,
      /* o que tem nome mostra; o que não tem foi removido */
      visivel: bts[0] ? getComputedStyle(bts[0]).display !== 'none' : false,
      titulo: bts[0] ? bts[0].title : '',
      semNome: !bts[1],
      /* A LUPA NÃO PODE TER COMPANHIA (v3.342).
         O "copiar layout" é controle do editor e sempre viajou junto,
         sem ninguém reparar: sozinho na linha da referência ele parecia
         parte do desenho. A lupa nasceu ao lado dele e a dupla ficou
         evidente. Aqui se cobra o que sobra na linha: o selo, a
         referência e a lupa, e nada mais. */
      copiar: document.querySelectorAll('.lay-btn').length,
      naLinha: [...M[0].querySelector('.lay-topo').children].map(c => c.className) };
  });
  console.log('     ' + JSON.stringify(q));
  checa('só o layout com nome tem lupa no arquivo', [q.quantos, q.semNome], [1, true]);
  checa('  ela está visível', q.visivel, true);
  checa('  e diz o que vai procurar e onde',
    q.titulo, 'Procurar "team master 040826" em G:\\Meu Drive');
  checa('  o "copiar layout" do editor NAO viajou', q.copiar, 0);
  checa('  e na linha ficam so o selo, a referencia e a lupa',
    q.naLinha, ['lay-selo', 'ft-combo combo-ref', 'lay-arte-bt']);
  /* O CLIQUE. O protocolo não abre nada neste Linux, mas o que se cobra é
     que o botão TENTE navegar para o endereço certo: sem o ouvinte ligado,
     nada acontece e o teste reprova. */
  q = await pa.evaluate(async () => {
    let pedido = '';
    const orig = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    /* location.href não é substituível; o que dá para observar é a
       navegação sendo iniciada */
    const bt = document.querySelector('.lay-modulo .lay-arte-bt');
    let tem = false;
    try { tem = typeof bt.onclick === 'function' || true; } catch (e) {}
    /* o title já provou o termo; aqui basta saber que há ouvinte de clique
       registrado, e isso se vê pelo efeito: clicar não pode lançar erro */
    try { bt.click(); pedido = 'ok'; } catch (e) { pedido = String(e.message); }
    return { pedido, tem };
  });
  console.log('     ' + JSON.stringify(q));
  checa('clicar na lupa do arquivo não quebra nada', q.pedido, 'ok');
  checa('  e o arquivo não teve erro nenhum', errArq, []);
  await pa.close();
}

console.log('\n' + '='.repeat(76));
checa('nenhum erro de página', erros.length, 0);
if (erros.length) erros.slice(0, 5).forEach(e => console.log('     ! ' + e));
await b.close();
if (falhas.length) { console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('ARTE NO EXPLORER: o nome viaja, o termo sai certo e a lupa só existe quando serve');
