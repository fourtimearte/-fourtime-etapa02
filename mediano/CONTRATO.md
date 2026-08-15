# Contrato dos blocos do mediano

Cada arquivo aqui exporta uma funcao:

```js
export async function roda(F) { ... }
```

`F` traz tudo o que o bloco pode precisar. NAO importe `abreNavegador`:
o navegador e um so e ja esta aberto.

| campo | o que e |
| --- | --- |
| `F.diz(rotulo, obtido, esperado)` | a conferencia. Compara por JSON.stringify |
| `F.secao(titulo)` | imprime um subtitulo dentro do bloco |
| `F.novaPagina(opcoes)` | devolve `{ctx, p}`. Padrao 1500x1000. Passe `{viewport, isMobile, hasTouch, ...}` quando precisar |
| `F.URL_EDITOR` | o `file://` do editor atual |
| `F.ARQ`, `F.VER`, `F.DIR` | nome do arquivo, versao, pasta |
| `F.esperaPronto(p, ms, limite)` | espera o editor ficar pronto |
| `F.montaKit(p)` | clica no kit de teste e espera assentar. Sem sleep fixo |
| `F.assenta(p, fn)` | roda `fn` na pagina ate duas leituras iguais seguidas |
| `F.readFileSync`, `F.writeFileSync`, `F.existsSync`, `F.pathToFileURL`, `F.tmpdir`, `F.join` | utilitarios de arquivo |

## Regras

1. **Feche o que abrir.** `await ctx.close()` no fim de cada pagina.
2. **Nada de `waitForTimeout` fixo acima de 400ms.** Se precisar esperar
   algo assentar, use `F.assenta`. Espera fixa longa e o que fez a bateria
   inchar.
3. **Nao confira "nenhum erro de pagina"**: o runner ja recolhe `pageerror`
   de todas as paginas e cobra uma vez no fim.
4. **Nao use `process.exit` nem `console.log` de resultado.** So `F.diz` e
   `F.secao`.
5. **Use `F.URL_EDITOR`**, nunca um nome de versao escrito a mao. Duas das
   suites originais apontavam para a v309 e a v306 e ninguem tinha notado.
