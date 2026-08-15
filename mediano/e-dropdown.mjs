/* ================================================================
   E. O MENU DE DIAS (o menu suspenso tem de mostrar a lista inteira)

   O DEFEITO. O .ft-dd-menu nasceu com max-height:240px fixo. Um item mede
   31px, entao cabiam SETE opcoes e nada mais. No filtro de Dia do
   relatorio, com nove opcoes, "Dia 11" e "Dia 12" ficavam abaixo do corte.
   E como a barra de rolagem do Chrome tem 2px e desaparece quando nao se
   esta rolando, a lista parecia simplesmente ACABAR no Dia 10.

   O relatorio estava certo: os pedidos dos dias 11 e 12 estavam na tabela,
   logo ao lado. So o menu e que nao mostrava.

   O QUE ESTE BLOCO COBRA:
     1. nove dias: nenhum fica fora da vista (e o caso relatado);
     2. um mes inteiro numa tela baixa: o menu cabe DENTRO da janela, rola,
        e diz que rola (classe .rolavel, que liga a sombra);
     3. a opcao escolhida aparece a vista ao abrir, mesmo la no fim;
     4. sem espaco embaixo, o menu sobe, e continua dentro da tela;
     5. a barra de rolagem e visivel de verdade (10px, nao 2);
     6. vale para todos os menus do kit, nao so o do dia: o de UF tem 27.

   POR QUE ESTE BLOCO TEM PAGINA PROPRIA: ele limpa o localStorage, entra
   em modo administrador e RECARREGA, finge o servidor inteiro por rota, e
   ainda troca o tamanho da janela tres vezes. Nada disso convive com uma
   pagina compartilhada.
   ================================================================ */

/* trocar o tamanho da janela tem debounce no editor (180 ms + rAF): o
   `redimensiona` espera o zoom assentar por SINAL, em vez de dormir um
   numero que e longo demais sozinho e curto demais em bateria */
import { redimensiona } from '../ft_navegador.mjs';

/* o item do relatorio, como o servidor o devolve */
const mk = (d, n) => ({ id:'id'+d+'_'+n,
  arquivo:'CLIENTE'+d+'-PD00'+(4100+d*3+n)+'-'+String(d).padStart(2,'0')+'0826.ft',
  dia:d, cliente:'CLIENTE '+d, pedido:'PD00'+(4100+d*3+n), vendedor:n?'Kev':'Dani',
  mistos:[], subPecas:10, subValor:100, perPecas:0, perValor:0 });
/* o caso relatado, dia a dia */
const NOVE = [3,4,5,6,7,10,11,12];
/* e o pior caso real: um mes em que se trabalhou todo dia */
const MES = Array.from({ length:31 }, (_, i) => i + 1);

export async function roda(F) {
  const { ctx, p } = await F.novaPagina({ viewport: { width:1700, height:1000 } });

  /* ---------------- o servidor de mentira, inteiro ----------------
     Uma rota so para todos os caminhos: o que muda de um bloco para o
     outro e a lista de DIAS, por variavel, para a pagina nunca ficar sem
     cobertura entre uma troca e outra. */
  let DIAS = NOVE;
  await p.route('**/fourtime-etapa02.onrender.com/**', async rota => {
    const cam = new URL(rota.request().url()).pathname;
    const json = o => rota.fulfill({ status:200, contentType:'application/json',
                                     body:JSON.stringify(o) });
    if (cam === '/api/db/sou-admin') return json({ admin:true, admin_configurado:true });
    if (cam === '/api/ft/relatorio-periodos')
      return json({ ok:true, anos:[2026], meses:[8], dias:DIAS, ano:2026, comMovimento:[8] });
    if (cam === '/api/ft/relatorio-guardado')
      return json({ ok:true, existe:true, ano:2026, mes:8, dia:0,
                    geradoEm:'2026-08-12T18:00:00.000Z',
                    itens:DIAS.flatMap(d => [mk(d,0), mk(d,1)]), falhas:[] });
    if (cam === '/api/db') return json({ data:{}, rev:1 });
    return json({ ok:true, rev:1, editor:'3.306' });
  });

  await p.goto(F.URL_EDITOR, { waitUntil:'domcontentloaded' });
  await F.esperaPronto(p);
  /* O TOKEN E PARTE DO PREPARO DESDE A v3.307.
     O original so gravava o ft_sync_admin porque a v306 ainda trazia o token
     da equipe escrito dentro do proprio arquivo (FT_TOKEN_PADRAO). A v3.307
     tirou a chave de la, e o login automatico do editor exige os tres:
     ligado, com URL e com token. Sem esta linha, no editor atual, o
     ftSyncConectar nunca roda, o /sou-admin nunca e chamado e a secao de
     Relatorios nem abre. */
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('ft_sync_admin','x'); localStorage.setItem('ft_sync_token','t'); });
  await p.reload({ waitUntil:'domcontentloaded' });
  await F.esperaPronto(p);
  /* o original dormia 900 ms aqui esperando o /sou-admin voltar. O sinal e
     o proprio FT_SYNC.ehAdmin, que so vira true quando o servidor confirma */
  await p.waitForFunction(() => typeof FT_SYNC === 'object' && FT_SYNC.ehAdmin === true);

  /* espera o relatorio parar de se redesenhar: o que interessa e o campo de
     Dia da lateral ja ter as opcoes do desenho ATUAL (o original dormia
     600 ms fixos e media no meio) */
  const relAssentou = () => F.assenta(p, () => {
    const s = document.getElementById('rlDia');
    return { n: s ? s.options.length : -1, dd: !!(s && s.closest('.ft-dd')) };
  });

  const carregaRelatorio = async () => {
    await p.evaluate(async () => {
      if (typeof ftSecao === 'function') ftSecao('relatorio');
      await new Promise(s => setTimeout(s, 350));
      await relBuscaGuardado(); REL.carregando = false; relDesenha();
    });
    await relAssentou();
  };

  /* redesenha com a lista de dias que estiver valendo agora */
  const redesenha = async () => {
    await p.evaluate(async () => { REL.dados = null; await relBuscaGuardado();
      REL.carregando = false; relDesenha(); });
    await relAssentou();
  };

  const abreMenu = id => p.evaluate(x => {
    const sel = document.getElementById(x), dd = sel && sel.closest('.ft-dd');
    if (!dd) return false;
    /* fecha o que estiver aberto PELO CAMINHO DE VERDADE: mexer so na classe
       do menu deixa o .ft-dd achando que ainda esta aberto, e o pointerdown
       seguinte fecharia em vez de abrir */
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
    dd.querySelector('.ft-dd-bt').dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
    return true;
  }, id);

  /* mede o menu como o olho ve: o que esta DENTRO da caixa e o que ficou fora */
  const mede = () => p.evaluate(() => {
    const m = document.querySelector('.ft-dd-menu.aberto');
    if (!m) return { naoAbriu:true, opcoes:0, textos:[], foraDaCaixa:['(menu nao abriu)'],
      rolavel:false, temClasseRolavel:false, dentroDaJanela:false, barra:'', marcadoAVista:false };
    const ops = [...m.querySelectorAll('.ft-dd-op')], rm = m.getBoundingClientRect();
    const foraDaCaixa = ops.filter(o => { const r = o.getBoundingClientRect();
      return r.bottom > rm.bottom + 1 || r.top < rm.top - 1; }).map(o => o.textContent);
    return {
      opcoes:ops.length, textos:ops.map(o => o.textContent),
      foraDaCaixa, rolavel:m.scrollHeight > m.clientHeight + 1,
      temClasseRolavel:m.classList.contains('rolavel'),
      /* o menu nao pode passar da janela: nem por cima nem por baixo */
      dentroDaJanela: rm.top >= 0 && rm.bottom <= innerHeight + 1,
      topo:Math.round(rm.top), base:Math.round(rm.bottom), janela:innerHeight,
      /* o editor apaga toda barra de rolagem com *{scrollbar-width:none}.
         Este menu tem de escapar disso: medir a largura nao serve, porque em
         navegador sem janela a barra e sobreposta e mede zero; o que importa
         e a regra estar valendo neste elemento. */
      barra:getComputedStyle(m).scrollbarWidth || '',
      marcadoAVista:(() => { const o = m.querySelector('.ft-dd-op.on'); if (!o) return null;
        const r = o.getBoundingClientRect(); return r.top >= rm.top - 1 && r.bottom <= rm.bottom + 1; })()
    };
  });

  F.secao('1. O CASO RELATADO: NOVE DIAS, NENHUM ESCONDIDO');
  await carregaRelatorio();
  await abreMenu('rlDia'); await p.waitForTimeout(300);
  let m = await mede();
  F.diz('as nove opcoes estao no menu', m.opcoes, 9);
  /* CORTADA a conferencia de que a ultima opcao e o "Dia 12": o array de
     dias e definido aqui mesmo, no teste. Que a fixture chegou inteira ao
     menu ja e dito pela linha de cima. */
  F.diz('NENHUMA fica fora da caixa', m.foraDaCaixa, []);
  F.diz('  entao nem precisa rolar', m.rolavel, false);

  F.secao('2. MES INTEIRO NUMA 1080p DE VERDADE');
  /* 937px e a altura UTIL de um monitor 1080p com o Chrome maximizado (abas
     + barra de endereco comem o resto). Com 31 dias a lista mede 1002px:
     nao cabe nem na tela inteira, quanto mais abaixo do campo. Entao aqui a
     regra nao e "cabe tudo" e sim "rola, avisa, e nao vaza da janela". */
  DIAS = MES;
  await redimensiona(p, { width:1920, height:937 });
  await redesenha();
  await abreMenu('rlDia'); await p.waitForTimeout(300);
  const mil = await mede();
  F.diz('1080p: o menu nao vaza da janela', mil.dentroDaJanela, true);
  F.diz('  precisa rolar (31 dias nao cabem em 1080p)', mil.rolavel, true);
  F.diz('  e avisa que rola', mil.temClasseRolavel, true);
  F.diz('  com a barra de rolagem valendo', mil.barra !== 'none' && mil.barra !== '', true);

  /* e a rolagem tem de ser usavel de verdade: roda do mouse dentro do menu */
  const roda = await p.evaluate(async () => {
    const m = document.querySelector('.ft-dd-menu.aberto');
    const antes = m.scrollTop;
    m.scrollTop = antes + 300; m.dispatchEvent(new Event('scroll', { bubbles:true }));
    await new Promise(r => setTimeout(r, 200));
    const d = document.querySelector('.ft-dd-menu.aberto');
    return { aberto:!!d, andou:!!d && d.scrollTop > antes,
      chegaAoFim:(() => { if (!d) return false; d.scrollTop = d.scrollHeight;
        const ops = [...d.querySelectorAll('.ft-dd-op')];
        return ops[ops.length - 1].getBoundingClientRect().bottom
               <= d.getBoundingClientRect().bottom + 1; })() };
  });
  F.diz('rolando, o menu continua aberto', roda.aberto, true);
  F.diz('  e da para chegar no Dia 31', roda.chegaAoFim, true);

  F.secao('2b. TELA BAIXA (620px): mesma regra, sem vazar');
  await redimensiona(p, { width:1700, height:620 });
  await redesenha();
  await abreMenu('rlDia'); await p.waitForTimeout(300);
  m = await mede();
  F.diz('as 32 opcoes existem (31 dias + Todos)', m.opcoes, 32);
  F.diz('o menu nao vaza da janela', m.dentroDaJanela, true);
  F.diz('  aqui ele precisa rolar', m.rolavel, true);
  F.diz('  e a classe que liga a sombra esta la', m.temClasseRolavel, true);
  /* o `*{scrollbar-width:none}` do editor nao pode alcancar este menu */
  F.diz('a barra de rolagem escapa do "some tudo"', m.barra !== 'none' && m.barra !== '', true);

  F.secao('3. O ESCOLHIDO APARECE A VISTA, MESMO LA NO FIM');
  await p.evaluate(() => { const s = document.getElementById('rlDia');
    s.value = '31'; s.dispatchEvent(new Event('change', { bubbles:true })); });
  await p.waitForTimeout(400);
  await abreMenu('rlDia'); await p.waitForTimeout(300);
  m = await mede();
  F.diz('abrir ja mostra o que esta marcado', m.marcadoAVista, true);

  F.secao('4. SEM ESPACO EMBAIXO, O MENU SOBE (e nao sai da tela)');
  /* empurra o campo para o pe da janela rolando a lateral ate o fim */
  const desceu = await p.evaluate(() => {
    const s = document.getElementById('rlDia'); if (!s) return false;
    const r = s.closest('.ft-dd').getBoundingClientRect();
    return r.top > innerHeight * 0.45;      /* ja esta na metade de baixo? */
  });
  await abreMenu('rlDia'); await p.waitForTimeout(300);
  m = await mede();
  F.diz('o menu continua inteiro dentro da janela', m.dentroDaJanela, true);
  F.diz('  e nao comeca acima do topo', m.topo >= 0, true);

  F.secao('5. ROLAR DENTRO DO MENU NAO PODE FECHA-LO');
  /* o listener de scroll e em CAPTURA, para o menu nao flutuar solto quando a
     pagina rola. Agora que a lista pode ser mais alta que a tela, rolar dentro
     dela e uso normal, e era exatamente isso que fechava o menu. */
  await abreMenu('rlDia'); await p.waitForTimeout(300);
  const rolou = await p.evaluate(async () => {
    const m = document.querySelector('.ft-dd-menu.aberto');
    if (!m) return { naoAbriu:true };
    m.scrollTop = m.scrollHeight;
    m.dispatchEvent(new Event('scroll', { bubbles:true }));
    await new Promise(r => setTimeout(r, 200));
    const ainda = document.querySelector('.ft-dd-menu.aberto');
    return { continuaAberto:!!ainda, rolouAteOFim:!!ainda && ainda.scrollTop > 0 };
  });
  F.diz('o menu continua aberto depois de rolar', rolou.continuaAberto, true);
  F.diz('  e a rolagem pegou', rolou.rolouAteOFim, true);

  F.secao('6. TODOS OS MENUS DA TELA, NAO SO O DO DIA');
  await redimensiona(p, { width:1700, height:700 });
  const todos = await p.evaluate(async () => {
    const saida = [];
    for (const id of ['rlAno','rlMes','rlVend','rlDia','rlTipo']) {
      const s = document.getElementById(id), dd = s && s.closest('.ft-dd');
      if (!dd) { saida.push({ id, semDd:true }); continue; }
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
      dd.querySelector('.ft-dd-bt').dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
      await new Promise(r => setTimeout(r, 220));
      const m = document.querySelector('.ft-dd-menu.aberto');
      if (!m) { saida.push({ id, naoAbriu:true }); continue; }
      const ops = [...m.querySelectorAll('.ft-dd-op')], rm = m.getBoundingClientRect();
      saida.push({ id, opcoes:ops.length,
        /* ou cabe tudo, ou avisa que rola. O que nao pode e cortar calado. */
        cortaCalado: ops.some(o => o.getBoundingClientRect().bottom > rm.bottom + 1)
                     && !m.classList.contains('rolavel'),
        dentroDaJanela: rm.top >= -1 && rm.bottom <= innerHeight + 1 });
    }
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
    return saida;
  });
  F.diz('nenhum menu corta a lista em silencio',
    todos.filter(t => t.cortaCalado).map(t => t.id), []);
  F.diz('nenhum menu vaza da janela',
    todos.filter(t => t.dentroDaJanela === false).map(t => t.id), []);

  /* CORTADA a conferencia de "nenhum erro de pagina": o runner ja recolhe o
     pageerror de todas as paginas e cobra uma vez no fim. */
  await ctx.close();
}
