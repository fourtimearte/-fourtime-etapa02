/* ================================================================
   A ORDEM DO PAINEL E A BUSCA GERAL (v3.362)

   Duas coisas que so se provam olhando o DOM de cima para baixo e
   medindo o que a busca acha:

     1. a ordem pedida: acoes, busca, quando, quem/o que;
     2. o campo que era "Cliente" agora varre cliente, pedido, vendedor
        e nome do arquivo, e casa palavra por palavra.
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
const pagina = await b.newPage({viewport:{width:1600,height:1000}});
const erros = [];
pagina.on('pageerror', e => erros.push(String(e).slice(0,180)));
await pagina.goto(path.isAbsolute(ARQ) ? 'file://'+ARQ : 'file://'+path.resolve(ARQ));
await esperaPronto(pagina);

const dados = await pagina.evaluate(async () => {
  REL.periodos = {anos:[2026], meses:[7,8,9], comMovimento:[7,8,9]};
  REL.sel = {ano:2026, meses:[8,9], mes:8, dia:0};
  REL.filtro = {vendedor:'', cliente:'', dia:0, tipo:''};
  REL.dados = {ano:2026, meses:[8,9], mes:8, dia:0, geradoEm:new Date().toISOString(), itens:[
    {id:'a',dia:3,mes:8,ano:2026,arquivo:'3B CROSS-PD004881-030826.ft',cliente:'3B CROSS',pedido:'PD004881',vendedor:'Lucas',subPecas:120,subValor:12000,perPecas:50,perValor:5000,mistos:[]},
    {id:'b',dia:14,mes:8,ano:2026,arquivo:'SAGA-PD004902-140826.ft',cliente:'SAGA',pedido:'PD004902',vendedor:'Dani',subPecas:80,subValor:8000,perPecas:20,perValor:2000,mistos:[]},
    {id:'c',dia:3,mes:9,ano:2026,arquivo:'PRIME-PD004955-030926.ft',cliente:'PRIME',pedido:'PD004955',vendedor:'Lucas',subPecas:60,subValor:6000,perPecas:40,perValor:4000,mistos:[]}
  ], falhas:[]};
  ftSecao('relatorio');
  document.body.classList.remove('menu-fechado');
  await new Promise(r => setTimeout(r, 500));
  relDesenha();
  await new Promise(r => setTimeout(r, 300));

  const painel = document.querySelector('.ft-painel[data-sec="relatorio"]');
  const ordem = [...painel.querySelectorAll('.ft-menu-item span,.ft-menu-div,.rl-campo label,.rl-meses')]
    .map(e => e.classList.contains('ft-menu-div') ? '---'
            : (e.classList.contains('rl-meses') ? '[meses]' : e.textContent.trim()));

  const busca = t => { REL.filtro.cliente = t; return relVisiveis().map(i => i.cliente).sort(); };
  const out = {
    ordem,
    /* os titulos de grupo sairam: o separador ja diz onde um bloco acaba */
    semTitulos: painel.querySelectorAll('.rl-tit').length,
    rotulo: (painel.querySelector('label[for="rlCli"]')||{}).textContent||'',
    dica: (document.getElementById('rlCli')||{}).placeholder||'',
    pedidoInteiro: busca('PD004955'),
    pedidoPedaco: busca('4881'),
    cliente:      busca('saga'),
    vendedor:     busca('lucas'),
    arquivo:      busca('030926'),
    duasPalavras: busca('3b lucas'),
    naoCasa:      busca('saga lucas'),
    vazio:        (REL.filtro.cliente='', relVisiveis().length)
  };
  return out;
});

/* ---------- 1. a ordem ---------- */
const esperada = ['Gerar Relatório','Impressão / PDF','---','Busca','---',
                  'Ano','[meses]','Dia','---','Vendedor','Tipo'];
ok('a ordem do painel é a pedida',
   JSON.stringify(dados.ordem) === JSON.stringify(esperada), JSON.stringify(dados.ordem));
ok('três separadores, um por bloco',
   dados.ordem.filter(x => x === '---').length === 3);
ok('os títulos de grupo saíram', dados.semTitulos === 0, String(dados.semTitulos));

/* ---------- 2. o campo não é mais só cliente ---------- */
ok('o rótulo virou "Busca"', dados.rotulo === 'Busca', dados.rotulo);
ok('a dica diz o que dá para procurar',
   /Cliente.*pedido.*vendedor/i.test(dados.dica), dados.dica);

/* ---------- 3. o que ela acha ---------- */
ok('acha pelo número do pedido inteiro',
   JSON.stringify(dados.pedidoInteiro) === '["PRIME"]', JSON.stringify(dados.pedidoInteiro));
ok('acha por um pedaço do número',
   JSON.stringify(dados.pedidoPedaco) === '["3B CROSS"]', JSON.stringify(dados.pedidoPedaco));
ok('continua achando pelo cliente',
   JSON.stringify(dados.cliente) === '["SAGA"]', JSON.stringify(dados.cliente));
ok('acha pelo vendedor',
   JSON.stringify(dados.vendedor) === '["3B CROSS","PRIME"]', JSON.stringify(dados.vendedor));
ok('acha pelo nome do arquivo',
   JSON.stringify(dados.arquivo) === '["PRIME"]', JSON.stringify(dados.arquivo));
/* PALAVRA POR PALAVRA, e nao a frase inteira: "3b lucas" nunca aparece
   junto em campo nenhum, e mesmo assim tem de achar o pedido. */
ok('duas palavras em campos diferentes casam',
   JSON.stringify(dados.duasPalavras) === '["3B CROSS"]', JSON.stringify(dados.duasPalavras));
ok('e uma palavra que não bate derruba a linha',
   JSON.stringify(dados.naoCasa) === '[]', JSON.stringify(dados.naoCasa));
ok('busca vazia mostra tudo', dados.vazio === 3, String(dados.vazio));

ok('nenhum erro de página', erros.length === 0, erros.slice(0,2).join(' // '));
await b.close();
console.log('\n' + feitas + ' conferencias, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
