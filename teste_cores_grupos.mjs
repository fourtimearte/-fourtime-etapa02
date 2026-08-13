/* CORES DE TECIDO POR GRUPO (v3.288)
   Três frentes: o menu do orçamento, a página do Banco e — a que importa
   de verdade — a compatibilidade: pedido antigo continua achando a cor
   pelo NOME, e o catálogo novo não some quando o servidor manda a lista
   velha de volta. */
import { abreNavegador, esperaPronto, editorAtual } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(54)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

/* as 50 cores que existiam antes da v3.288 — nenhuma pode ter se perdido */
const ANTIGAS=['Branco','Preto','Cinza Mescla','Cinza Chumbo','Cinza Claro','Prata','Vermelho',
'Vermelho Escuro','Vinho','Bordô','Coral','Salmão','Rosa','Rosa Pink','Rosa Bebê','Magenta',
'Laranja','Laranja Neon','Terracota','Ferrugem','Amarelo Ouro','Amarelo Canário','Amarelo Neon',
'Mostarda','Creme','Bege','Verde Bandeira','Verde Musgo','Verde Militar','Verde Limão','Verde Água',
'Verde Neon','Verde Menta','Verde Oliva','Azul Royal','Azul Marinho','Azul Celeste','Azul Turquesa',
'Azul Petróleo','Azul Bebê','Ciano','Roxo','Lilás','Violeta','Púrpura','Marrom','Café','Chocolate',
'Caqui','Nude'];

const b=await abreNavegador();
const p=await b.newPage({viewport:{width:1500,height:1000}});
const erros=[]; p.on('pageerror',e=>erros.push(String(e).slice(0,180)));
await p.goto(pathToFileURL(DIR+(process.env.FT_ARQ||editorAtual())).href);
await esperaPronto(p);

console.log('\n=== 1. O CATÁLOGO ===');
let r=await p.evaluate(ANT=>{
  const nomes=DB.cores.map(c=>c.n);
  return { total:DB.cores.length, grupos:corPorGrupo().length,
    semGrupo:DB.cores.filter(c=>!c.g).length,
    faltando:ANT.filter(n=>!nomes.includes(n)),
    repetidas:[...new Set(nomes.filter((n,i)=>nomes.indexOf(n)!==i))],
    porGrupo:corPorGrupo().map(g=>g.cores.length),
    temSubli:!!DB.cores.find(c=>c.g==='SUB') };
}, ANTIGAS);
console.log('     '+JSON.stringify(r));
checa('as 50 cores de antes continuam todas lá', r.faltando, []);
checa('  e nenhuma ficou repetida', r.repetidas, []);
checa('12 grupos, 10 cores em cada', [r.grupos,[...new Set(r.porGrupo)]], [12,[10]]);
checa('  ninguém ficou sem grupo', r.semGrupo, 0);
checa('SUBLIMAÇÃO existe e fica fora dos grupos', r.temSubli, true);

console.log('\n=== 2. O MENU DO ORÇAMENTO ===');
r=await p.evaluate(async ()=>{
  const sw=document.querySelector('.combo-cor .cor-sw');
  sw.click(); await new Promise(s=>setTimeout(s,250));
  const m=document.getElementById('corMenu');
  const o={ abriu:m.style.display==='block',
            grupos:m.querySelectorAll('.cor-grupo').length,
            itens:m.querySelectorAll('.cor-item').length,
            subliNoTopo:m.querySelector('.cor-lista').firstElementChild.className,
            recolhidos:m.querySelectorAll('.cor-grupo.aberto').length,
            naTela:(()=>{const r=m.getBoundingClientRect();
              return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})() };
  /* busca */
  const bu=m.querySelector('.cor-busca');
  bu.value='musgo'; bu.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,150));
  /* o ".cor-novo" ("Usar tal") é a saída de texto livre, não uma cor do
     banco — fica de fora da contagem */
  o.busca={grupos:[...m.querySelectorAll('.cor-grupo:not(.oculto)')].map(g=>g.dataset.g),
           itens:[...m.querySelectorAll('.cor-item:not(.oculta):not(.cor-novo)')].map(i=>i.dataset.nome),
           temUsarAssim:!!m.querySelector('.cor-novo'),
           abriuSozinho:m.querySelectorAll('.cor-grupo.aberto:not(.oculto)').length};
  /* busca sem acento acha o que tem acento */
  bu.value='pessego'; bu.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,120));
  o.semAcento=[...m.querySelectorAll('.cor-item:not(.oculta):not(.cor-novo)')].map(i=>i.dataset.nome);
  bu.value=''; bu.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,120));
  /* escolher uma cor de dentro do grupo */
  const g=[...m.querySelectorAll('.cor-grupo')].find(x=>x.dataset.g==='VD');
  g.querySelector('.cor-grupo-cab').click();
  await new Promise(s=>setTimeout(s,100));
  o.abriuGrupo=g.classList.contains('aberto');
  [...g.querySelectorAll('.cor-item')].find(i=>i.dataset.nome==='Verde Musgo').click();
  await new Promise(s=>setTimeout(s,200));
  const combo=document.querySelector('.combo-cor');
  o.escolha={campo:combo.querySelector('textarea').value,
             sw:getComputedStyle(combo.querySelector('.cor-sw')).getPropertyValue('--cor-sw').trim(),
             fechou:m.style.display==='none'};
  /* reabrindo, o grupo da cor escolhida já vem aberto e marcado */
  combo.querySelector('.cor-sw').click();
  await new Promise(s=>setTimeout(s,250));
  o.reabre={abertos:[...m.querySelectorAll('.cor-grupo.aberto')].map(x=>x.dataset.g),
            marcados:[...m.querySelectorAll('.cor-grupo.tem-escolhida')].map(x=>x.dataset.g),
            itemOn:(m.querySelector('.cor-item.on')||{dataset:{}}).dataset.nome};
  /* SUBLIMAÇÃO pinta o swatch de arco-íris */
  m.querySelector('.cor-subli').click();
  await new Promise(s=>setTimeout(s,200));
  o.subli={campo:combo.querySelector('textarea').value,
           arco:/conic-gradient/.test(getComputedStyle(combo.querySelector('.cor-sw')).getPropertyValue('--cor-sw'))};
  /* limpar cor */
  combo.querySelector('.cor-sw').click(); await new Promise(s=>setTimeout(s,200));
  m.querySelector('.cor-limpar').click(); await new Promise(s=>setTimeout(s,200));
  o.limpou={campo:combo.querySelector('textarea').value,
            vazio:combo.querySelector('.cor-sw').classList.contains('vazio')};
  return o;
});
console.log('     '+JSON.stringify(r));
checa('o menu abre com os 12 grupos recolhidos', [r.abriu,r.grupos,r.recolhidos], [true,12,0]);
checa('  com as 120 cores dentro deles', r.itens, 120);
checa('  SUBLIMAÇÃO é o primeiro item, fora dos grupos', r.subliNoTopo, 'cor-subli');
checa('  e o menu cabe na tela', r.naTela, true);
checa('buscar "musgo" deixa só o grupo certo', r.busca.grupos, ['VD']);
checa('  com só a cor certa dentro', r.busca.itens, ['Verde Musgo']);
checa('  e ele abre sozinho', r.busca.abriuSozinho, 1);
checa('  com a saída de texto livre à mão', r.busca.temUsarAssim, true);
checa('buscar sem acento acha o acentuado', r.semAcento, ['Pêssego']);
checa('abrir o grupo e clicar escolhe a cor', [r.abriuGrupo,r.escolha.campo], [true,'Verde Musgo']);
checa('  o swatch pinta com o hex dela', r.escolha.sw, '#4A5D23');
checa('  e o menu fecha', r.escolha.fechou, true);
checa('reabrindo, o grupo da cor escolhida já vem aberto',
      [r.reabre.abertos,r.reabre.marcados,r.reabre.itemOn], [['VD'],['VD'],'Verde Musgo']);
checa('SUBLIMAÇÃO entra no campo e pinta arco-íris',
      [r.subli.campo,r.subli.arco], ['SUBLIMAÇÃO',true]);
checa('"limpar cor" esvazia o campo', [r.limpou.campo,r.limpou.vazio], ['',true]);

console.log('\n=== 3. A PÁGINA DO BANCO ===');
r=await p.evaluate(async ()=>{
  document.querySelector('.ft-rail-bt[data-sec="banco"]').click();
  await new Promise(s=>setTimeout(s,600));
  bdCat='cores'; bdRender();
  await new Promise(s=>setTimeout(s,300));
  const pg=document.getElementById('bdPage');
  const o={grupos:pg.querySelectorAll('.bd-cg').length,
           linhas:pg.querySelectorAll('.bd-cor-linha').length,
           subli:!!pg.querySelector('.bd-cor-subli'),
           seletorNovo:!!pg.querySelector('#bdNovoGrupo'),
           recolhidos:pg.querySelectorAll('.bd-cg.aberto').length};
  /* mudar uma cor de grupo */
  const g=[...pg.querySelectorAll('.bd-cg')].find(x=>x.dataset.g==='AZ');
  g.querySelector('.bd-cg-cab').click();
  await new Promise(s=>setTimeout(s,120));
  const sel=g.querySelector('.bd-cor-grupo');
  const nome=DB.cores[+sel.dataset.idx].n;
  sel.value='MT'; sel.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(s=>setTimeout(s,350));
  o.mudou={nome,grupo:DB.cores.find(c=>c.n===nome).g,
           abriuDestino:!!document.querySelector('.bd-cg[data-g="MT"].aberto')};
  DB.cores.find(c=>c.n===nome).g='AZ'; bdPersiste(); bdRender();
  await new Promise(s=>setTimeout(s,250));
  /* acrescentar cor dentro de um grupo */
  const pg2=document.getElementById('bdPage');
  pg2.querySelector('#bdNovo').value='Verde Teste';
  pg2.querySelector('#bdNovaCor').value='#123456';
  pg2.querySelector('#bdNovoGrupo').value='VD';
  pg2.querySelector('#bdAddBtn').click();
  await new Promise(s=>setTimeout(s,450));
  const nova=DB.cores.find(c=>c.n==='Verde Teste');
  o.nova={g:nova&&nova.g,c:nova&&nova.c,
          noMenu:corPorGrupo().find(x=>x.cod==='VD').cores.some(c=>c.n==='Verde Teste')};
  /* e some quando apagada */
  const i=DB.cores.findIndex(c=>c.n==='Verde Teste');
  corMarcaApagada('Verde Teste'); DB.cores.splice(i,1); bdPersiste(); bdRender();
  await new Promise(s=>setTimeout(s,250));
  o.apagou=!DB.cores.find(c=>c.n==='Verde Teste');
  return o;
});
console.log('     '+JSON.stringify(r));
checa('a página mostra os 12 grupos recolhidos', [r.grupos,r.recolhidos], [12,0]);
checa('  com as 120 linhas editáveis dentro', r.linhas, 120);
checa('  a SUBLIMAÇÃO aparece fora deles', r.subli, true);
checa('  e há para onde escolher o grupo da cor nova', r.seletorNovo, true);
checa('trocar o grupo de uma cor funciona', r.mudou.grupo, 'MT');
checa('  e o grupo de destino abre para mostrá-la', r.mudou.abriuDestino, true);
checa('cor nova nasce no grupo escolhido', [r.nova.g,r.nova.c], ['VD','#123456']);
checa('  e aparece no menu do orçamento na hora', r.nova.noMenu, true);
checa('apagar tira do banco', r.apagou, true);

console.log('\n=== 4. COMPATIBILIDADE: NADA SE PERDE ===');
r=await p.evaluate(async ()=>{
  const antigas=[{n:'Branco',c:'#FFFFFF'},{n:'Preto',c:'#111111'},{n:'Vinho',c:'#6B1F2B'},
                 {n:'Verde Musgo',c:'#4A5D23'},{n:'Azul Marinho',c:'#12213F'}];
  /* o servidor manda a lista ANTIGA, sem grupo — é o caso real de quem já usa */
  aplicarDBExterno({cores:antigas});
  await new Promise(s=>setTimeout(s,200));
  const o={ replantou:DB.cores.length,
            grupoDoVinho:(DB.cores.find(c=>c.n==='Vinho')||{}).g,
            catalogoInteiro:!!DB.cores.find(c=>c.n==='Marsala'),
            semGrupo:DB.cores.filter(c=>!c.g).length };
  /* cor que ninguém conhece não some: cai em "Sem grupo" */
  aplicarDBExterno({cores:antigas.concat([{n:'Cor Da Casa',c:'#ABCDEF'}])});
  await new Promise(s=>setTimeout(s,200));
  const ch=DB.cores.find(c=>c.n==='Cor Da Casa');
  o.desconhecida={existe:!!ch, grupo:ch&&ch.g,
                  noMenu:corPorGrupo().some(g=>g.cod==='')};
  /* apagada de propósito não ressuscita no replantio */
  const i=DB.cores.findIndex(c=>c.n==='Marsala');
  corMarcaApagada('Marsala'); DB.cores.splice(i,1);
  aplicarDBExterno({cores:antigas});
  await new Promise(s=>setTimeout(s,200));
  o.apagadaNaoVolta=!DB.cores.find(c=>c.n==='Marsala');
  corDesmarcaApagada('Marsala'); ftSemeiaCores(); normalizaCores();
  o.recadastradaVolta=!!DB.cores.find(c=>c.n==='Marsala');
  /* pedido antigo: o .ft guarda o NOME, e o nome ainda pinta */
  const combo=document.querySelector('.combo-cor');
  combo.querySelector('textarea').value='Verde Musgo';
  pintaSwatch(combo);
  o.pedidoAntigo=getComputedStyle(combo.querySelector('.cor-sw')).getPropertyValue('--cor-sw').trim();
  return o;
});
console.log('     '+JSON.stringify(r));
checa('mescla do servidor não leva o catálogo embora', r.catalogoInteiro, true);
checa('  e a cor antiga ganha o grupo pelo nome', r.grupoDoVinho, 'VM');
checa('  ninguém fica sem grupo por engano', r.semGrupo, 0);
checa('cor desconhecida do servidor não some', [r.desconhecida.existe,r.desconhecida.grupo], [true,'']);
checa('  e aparece num "Sem grupo" no menu', r.desconhecida.noMenu, true);
checa('cor apagada de propósito não ressuscita', r.apagadaNaoVolta, true);
checa('  mas volta se for cadastrada de novo', r.recadastradaVolta, true);
checa('pedido antigo continua achando a cor pelo nome', r.pedidoAntigo, '#4A5D23');

console.log('\n=== 5. UM MENU SÓ PARA COR ===');
/* CLIQUE DE VERDADE (mouse.click = mousedown+mouseup+click), não um
   mousedown avulso. Foi essa a cegueira que deixou passar o menu que
   abria e sumia no mesmo gesto: o `click` do mesmo movimento chegava ao
   ouvinte do documento e fechava o que o `mousedown` acabara de abrir. */
const centro=async sel=>await p.evaluate(s=>{
  const e=document.querySelector(s); if(!e)return null;
  const r=e.getBoundingClientRect();
  return {x:Math.round(r.left+Math.min(30,r.width/2)),y:Math.round(r.top+r.height/2)};
},sel);
const displayCor=()=>p.evaluate(()=>getComputedStyle(document.getElementById('corMenu')).display);
/* volta ao ORÇAMENTO pelo trilho: esconder o #bdPage na marra não basta —
   o editor fica oculto por uma classe do body, e o campo media 0x0 */
await p.evaluate(async ()=>{
  document.querySelector('.ft-rail-bt[data-sec="orcamento"]').click();
  await new Promise(s=>setTimeout(s,500));
  document.querySelector('.lay-modulo .combo-cor').scrollIntoView({block:'center'});
});
await p.waitForTimeout(400);
let pt=await centro('.lay-modulo .combo-cor .ft-combo-caixa');
await p.mouse.click(pt.x,pt.y);
await p.waitForTimeout(350);
const abriuNoClique=await displayCor();
await p.waitForTimeout(700);
const seguiuAberto=await displayCor();
await p.mouse.click(60,620); await p.waitForTimeout(250);
const fechouFora=await displayCor();
checa('clique de verdade no campo ABRE o menu', abriuNoClique, 'block');
checa('  e ele NÃO some no mesmo gesto', seguiuAberto, 'block');
checa('  um clique fora fecha', fechouFora, 'none');
pt=await centro('.lay-modulo .combo-cor .cor-sw');
await p.mouse.click(pt.x,pt.y); await p.waitForTimeout(350);
checa('o quadradinho também abre com clique de verdade', await displayCor(), 'block');
await p.mouse.click(60,620); await p.waitForTimeout(250);

/* O campo tinha DOIS caminhos: o quadradinho abria o menu de grupos e o
   campo (ou a seta) abria o dropdown genérico dos outros combos — duas
   listas diferentes para a mesma escolha. */
r=await p.evaluate(async ()=>{
  const combo=document.querySelector('.lay-modulo .combo-cor');
  const ta=combo.querySelector('textarea');
  const seta=combo.querySelector('.ft-combo-abrir')||combo.querySelector('.ft-combo-seta');
  const cm=document.getElementById('corMenu'), pm=document.getElementById('pickMenu');
  const o={};
  ta.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  await new Promise(s=>setTimeout(s,250));
  o.campo={cor:cm.style.display,pick:pm.style.display,grupos:cm.querySelectorAll('.cor-grupo').length};
  const rc=combo.querySelector('.ft-combo-caixa').getBoundingClientRect();
  const rm=cm.getBoundingClientRect();
  o.alinhado=Math.abs(rm.left-rc.left)<2||Math.round(rm.left)===12;
  document.body.click(); await new Promise(s=>setTimeout(s,150));
  if(seta){ seta.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    await new Promise(s=>setTimeout(s,250));
    o.seta={cor:cm.style.display,pick:pm.style.display};
    document.body.click(); await new Promise(s=>setTimeout(s,150)); }
  combo.querySelector('.cor-sw').click();
  await new Promise(s=>setTimeout(s,250));
  o.swatch={cor:cm.style.display,pick:pm.style.display};
  /* texto que não está no banco continua podendo ser usado */
  const bu=cm.querySelector('.cor-busca');
  bu.value='AZUL DA CASA'; bu.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(s=>setTimeout(s,200));
  const novo=cm.querySelector('.cor-novo');
  o.livre={temBotao:!!novo};
  if(novo)novo.click();
  await new Promise(s=>setTimeout(s,250));
  o.usou=ta.value;
  /* e o combo de TECIDO segue com o dropdown de sempre */
  const tec=document.querySelector('.lay-modulo .combo-tecido textarea');
  tec.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  await new Promise(s=>setTimeout(s,250));
  o.tecido={pick:pm.style.display,cor:cm.style.display};
  return o;
});
console.log('     '+JSON.stringify(r));
checa('clicar no CAMPO abre o menu de grupos',
      [r.campo.cor,r.campo.grupos], ['block',12]);
checa('  e não o dropdown genérico', r.campo.pick!=='block', true);
checa('  alinhado com a caixa do campo', r.alinhado, true);
checa('a seta leva ao mesmo menu', [r.seta.cor,r.seta.pick!=='block'], ['block',true]);
checa('o quadradinho também', [r.swatch.cor,r.swatch.pick!=='block'], ['block',true]);
checa('cor fora do banco ainda pode ser usada', r.livre.temBotao, true);
checa('  e o nome digitado entra no campo', r.usou, 'AZUL DA CASA');
checa('TECIDO continua com o dropdown de sempre',
      [r.tecido.pick,r.tecido.cor], ['block','none']);

console.log('\n'+'='.repeat(64));
checa('nenhum erro de página', erros.length, 0);
if(erros.length)erros.slice(0,3).forEach(e=>console.log('     ! '+e));
await b.close();
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('CORES: 12 grupos vivos no menu e no banco, e nada de antes se perdeu');
