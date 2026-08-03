/* ================================================================
   NAVEGADOR DOS TESTES — um lugar só para abrir o Chromium.

   MEDIDO: cada page.goto() de um arquivo LOCAL estava levando 12,7 s.
   Não era o navegador lendo 1,1 MB — era UMA requisição:

     FALHOU https://fonts.googleapis.com/css2?family=Roboto...   12583 ms

   Este contêiner não alcança o Google Fonts. O navegador tenta, espera o
   tempo inteiro de timeout e só então desiste — e o goto() só termina
   quando o `load` acontece. Com ~25 aberturas de página na regressão,
   eram ~315 s dos 325 s: praticamente a regressão inteira era espera por
   uma requisição que SEMPRE falha.

   O remédio não muda NADA do que é renderizado: a fonte já não carregava,
   o navegador já caía na fonte local. Abortar na hora produz exatamente o
   mesmo desenho, só que 12,6 s antes. Provado rodando as 10 suítes com e
   sem o corte: as mesmas asserções, os mesmos números.

   Isto vale SÓ para os testes. No Render as fontes carregam normalmente.
   ================================================================ */
import { chromium } from 'playwright';

export async function abreNavegador(opcoes) {
  const b = await chromium.launch(Object.assign({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  }, opcoes || {}));

  /* envelopa newPage para que NENHUMA suíte precise lembrar do corte —
     esquecer numa página só já traz os 12,6 s de volta */
  const orig = b.newPage.bind(b);
  b.newPage = async (...a) => {
    const p = await orig(...a);
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    return p;
  };
  return b;
}

/* ================================================================
   ESPERAR O EDITOR FICAR PRONTO — em vez de dormir 2,8 s

   As suítes esperavam 2600-2800 ms fixos depois do goto(). Esse número
   foi calibrado quando o goto() ainda pagava os 12,6 s do Google Fonts;
   sem isso, MEDIDO, o editor fica pronto ~30 ms depois do goto.

   Dormir um tempo fixo tem os dois defeitos ao mesmo tempo: é longo
   demais no caso normal e curto demais numa máquina lenta. Esperar pelo
   SINAL resolve os dois.

   A lista é a interseção do que as 10 suítes tocam:
     FT_EDITOR      a versão já foi definida
     .folha-a4      o documento existe
     .ft-tab        a barra de abas foi montada
     gerarHTML      o export do Trello está no ar
     zoomMedidas    o motor de escala existe
     ZOOM > 0       e já rodou pelo menos uma vez
     .ft-dd-bt      os dropdowns custom foram ligados (setTimeout 0)

   O último item é CONDICIONAL: o cmp_a4_chave abre também a v269, que é
   anterior aos dropdowns custom, e exigir .ft-dd-bt ali travava 30 s até
   estourar o tempo. A condição pergunta antes se esta versão tem a
   função — assim a espera serve para qualquer arquivo do histórico.
   ================================================================ */
export async function esperaPronto(page, ms) {
  await page.waitForFunction(() =>
    typeof FT_EDITOR !== 'undefined'
    && document.querySelector('.folha-a4')
    && document.querySelector('.ft-tab')
    && typeof window.gerarHTML === 'function'
    && typeof window.zoomMedidas === 'function'
    && window.ZOOM > 0
    && (typeof window.ftDropdownsLiga !== 'function'
        || document.querySelector('.ft-dd-bt')), null, { timeout: 30000 });
  /* um respiro curto para as animações de entrada assentarem: várias
     asserções leem cor e posição, e a aba tem transição de 120 ms */
  await page.waitForTimeout(ms == null ? 200 : ms);
}

/* ================================================================
   REDIMENSIONAR E ESPERAR O ZOOM ASSENTAR

   O motor de escala não responde ao `resize`: ele responde ao FIM do
   resize, por um debounce de 180 ms seguido de requestAnimationFrame
   (ver aoTerminarDeRedimensionar no editor). As suítes de largura e de
   corte dormiam 360-600 ms fixos depois de setViewportSize e mediam.

   Isso funciona sozinho e falha em bateria. Com três Chromium disputando
   a máquina, o rAF é adiado: MEDIDO na v3.294, `teste_largura_v267` e
   `teste_corte_v267` falharam juntas na bateria completa e passaram as
   duas quando rodadas sozinhas, sem uma linha de código de editor
   diferente entre as duas execuções. Era o relógio, não a régua.

   Aqui a espera é pelo SINAL: a largura da folha parar de mudar por dois
   quadros seguidos. Volta assim que assentou — no caso normal é mais
   RÁPIDO que os 400 ms fixos — e aguenta até 4 s quando a máquina está
   ocupada, em vez de medir no meio da transição.
   ================================================================ */
export async function redimensiona(page, tamanho, ms) {
  await page.setViewportSize(tamanho);
  await page.waitForFunction(async () => {
    const folha = document.querySelector('.folha-a4');
    if (!folha) return true;
    const mede = () => Math.round(folha.getBoundingClientRect().width);
    const a = mede();
    await new Promise(s => requestAnimationFrame(() => requestAnimationFrame(s)));
    return mede() === a && a > 0;
  }, null, { timeout: 4000, polling: 120 }).catch(() => {});
  /* o debounce do editor é de 180 ms: um piso garante que ele JÁ disparou,
     e não que a folha ainda nem começou a mudar de tamanho */
  await page.waitForTimeout(ms == null ? 260 : ms);
}
