# Testes do editor Fourtime

Suítes em Playwright que rodam contra o `fourtime-editor-vNNN.html` deste
mesmo diretório. Todas escrevem o que mediram na tela — `obtido=` ao lado
de `esperado=` — para que uma falha diga qual é o número errado, e não só
que falhou.

## Rodar

```bash
node rodar.mjs              # as suítes da versão atual
node rodar.mjs tudo         # + Trello/impressão + A4 + 9 antigas  ~75 s
node rodar.mjs pop modal    # só as que casarem com esses nomes

# apontar TODAS as suítes para outra versão do editor
FT_ARQ=fourtime-editor-v277.html FT_VER=3.277 node rodar.mjs tudo
```

As suítes leem o arquivo e a versão de `FT_ARQ` / `FT_VER`; sem eles, cada
uma roda contra a versão para a qual foi escrita. É assim que se prova que
uma versão nova não quebrou nada do que já funcionava: a mesma bateria roda
duas vezes, contra a versão antiga e contra a nova.

Concorrência 3. A máquina de desenvolvimento tem 2 núcleos; com 6 o tempo
total piora, porque três Chromium disputando 2 núcleos ficam mais lentos
que a soma.

## Sempre abrir o navegador por `ft_navegador.mjs`

```js
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
const browser = await abreNavegador();
const page = await browser.newPage({ viewport:{width:1600,height:1000} });
await page.goto(pathToFileURL(DIR+'fourtime-editor-v275.html').href);
await esperaPronto(page);
```

**Por quê.** `chromium.launch()` direto faz cada `page.goto()` custar
**12,7 s** — não pelo tamanho do editor (1,1 MB), mas por uma requisição:

```
FALHOU  https://fonts.googleapis.com/css2?family=Roboto...   12583 ms
```

O ambiente de teste não alcança o Google Fonts. O navegador tenta, espera
o timeout inteiro e só então desiste, e `goto()` só retorna no `load`. Com
~25 aberturas de página, eram ~315 s dos 325 s da regressão inteira.

`abreNavegador()` envelopa `newPage` e aborta essas requisições na hora.
Não muda nada do que é renderizado — a fonte já não carregava, o navegador
já caía na local. No Render as fontes carregam normalmente.

`esperaPronto()` substitui o `waitForTimeout(2800)` fixo: espera o sinal
(`FT_EDITOR`, `.folha-a4`, `.ft-tab`, `gerarHTML`, `zoomMedidas`,
`ZOOM > 0`, dropdowns quando a versão os tem) e mais 200 ms para as
animações assentarem.

| | antes | depois |
|---|---|---|
| regressão (10 suítes) | 325 s | 55 s sequencial · 28 s em paralelo |
| tudo (21 suítes) | ~400 s | 48 s |
| `teste_faixa_v268` sozinha | 111 s | 8 s |

## O que cada suíte cobre

| suíte | assunto |
|---|---|
| `teste_cab_v269` | cabeçalho de 4 colunas, barra de aviso, tipografia, impressão |
| `teste_abas_v270` | abas pelo kit §08 — abrir, trocar, fechar, animações |
| `teste_botoes_v271` | botões e campos pelo kit §07, foco, tema escuro |
| `teste_dd_v273` | dropdown custom: posição em qualquer zoom, escolha, fechamento |
| `teste_pop_v274` | 7 painéis flutuantes + 6 modais pelo kit §15 |
| `teste_modal_v274` | `alert`/`confirm` do navegador extintos; a decisão vale |
| `teste_painel_v266` | painel de cores e tipografia |
| `teste_largura_v267` · `teste_corte_v267` · `teste_faixa_v268` | **resolução**: faixas de zoom, folha pelo monitor, menu pela janela, nunca cortar |
| `verifica_trello` | export do Trello, layout de celular, impressão, PDF |
| `cmp_a4_chave` | compara elemento a elemento o A4 de duas versões |
| `teste_v281_ajustes` | módulo de layout, tabela, rodapé, cabeçalho das páginas 2+, compressão e caso extremo |
| `teste_compat_v281` | salva um `.ft` na v274/v275/v276 e abre na v277: cabeçalho, layouts, ajustes e totais campo a campo |

As três de **resolução** podem ser puladas quando a alteração não mexe em
responsividade — foi o combinado com o usuário.

## Regras

- **Medir, não supor.** Quando um teste falha, conferir se o erro é do
  código ou da asserção antes de mexer no código.
- **Foto para mudança visual.** Testes não pegam ícone invisível nem
  ícone errado; foto pega.
- Comentário explica **por quê**, não o quê.
