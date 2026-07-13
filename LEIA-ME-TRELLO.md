# FOURTIME — VISUALIZADOR DE ORÇAMENTOS NO TRELLO

## Como vai funcionar

1. No editor: **HTML para Trello** → gera o arquivo com as imagens em 2160p/WebP,
   já dentro do limite de 10 MB.
2. Você anexa esse `.html` ao cartão do pedido (upload normal, arrastar e soltar).
3. No cartão aparece a seção **Orçamento Fourtime** com um botão **Abrir**.
4. Clicando, o orçamento abre **em tela cheia dentro do Trello**, completo:
   cabeçalho, tabelas, preços, e as imagens com zoom (duplo clique), como no editor.

Sem Google Drive, sem hospedagem externa, sem arquivo duplicado.

---

## Arquivos desta entrega

| Arquivo | O que é |
|---|---|
| `fourtime-editor-v123.html` | Editor com a exportação "HTML para Trello" |
| `server.py` | Servidor, agora com o proxy dos anexos + as páginas do Power-Up |
| `powerup/index.html` | Conector do Power-Up (o que o Trello carrega) |
| `powerup/secao.html` | A lista de orçamentos dentro do cartão |
| `powerup/visualizador.html` | A tela cheia que mostra o orçamento |
| `powerup/autorizar.html` | Pede a autorização do usuário (uma vez só) |
| `powerup/icone.svg` | Ícone da Fourtime |

---

## Instalação (≈15 min)

### 1. Subir os arquivos no GitHub
No repositório `fourtime-etapa02`, suba:
- `fourtime-editor-v123.html`
- `server.py`
- a pasta **`powerup/`** inteira (os 5 arquivos)

### 2. Criar o Power-Up no Trello
1. Acesse **https://trello.com/power-ups/admin**
2. **New** → preencha:
   - **Name:** `Fourtime Orçamentos`
   - **Workspace:** a workspace da Fourtime
   - **Iframe connector URL:** `https://fourtime-etapa02.onrender.com/powerup/index.html`
   - **Author:** Fourtime
3. Salve. Vá na aba **API Key** → **Generate a new API Key**.
   Copie a chave (algo como `a1b2c3...`).

### 3. Colocar a chave nos dois lugares
- **No servidor (Render):** Environment → nova variável
  `FT_TRELLO_KEY` = a API key gerada.
- **No arquivo `powerup/autorizar.html`:** troque
  `var CHAVE='COLE_AQUI_A_API_KEY';` pela chave, e suba de novo no GitHub.

### 4. Habilitar as capacidades
Ainda em **trello.com/power-ups/admin**, no seu Power-Up → aba **Capabilities**,
marque:
- `attachment-sections`
- `card-detail-badges`
- `authorization-status`
- `show-authorization`

### 5. Ligar no quadro
No quadro da Fourtime → **Power-Ups** → **Custom** → adicione **Fourtime Orçamentos**.

### 6. Primeiro uso
Ao abrir o primeiro orçamento, o Trello vai pedir a autorização (botão **Autorizar**).
É uma vez só, por pessoa.

---

## Por que existe um proxy no servidor

Desde dezembro de 2023 os anexos do Trello **exigem autorização** para serem lidos:
a URL do arquivo não abre sozinha, e o navegador não consegue buscá-la direto por
causa de CORS. Então o Power-Up não lê o anexo — ele pede ao **nosso servidor**,
que busca no Trello com as credenciais e devolve o HTML. É o
endpoint `/api/trello/anexo`.

Consequência prática: **o Render precisa estar no ar** para o visualizador funcionar.
No plano gratuito, a primeira abertura depois de um período ocioso demora ~30-50s
(o serviço "acorda"). Depois fica rápido.

---

## A conta do tamanho (medida nos seus mockups reais)

Uma imagem embutida em HTML vira **texto base64** e **infla 33%**. Por isso o
orçamento binário é bem menor do que parece:

| qualidade WebP | SSIM | 20 layouts (pior caso) |
|---|---|---|
| q92 | 0,993 | ~10,4 MB ✗ |
| **q88** | **0,988** | **~8,1 MB ✓** |
| q84 | 0,983 | ~6,5 MB ✓ |

O exportador **não fixa a qualidade**: começa em q92 e desce em degraus até o
arquivo caber em 9,3 MB. Um pedido de 6 layouts sai na qualidade máxima; um de
20 se ajusta sozinho. Se nem na qualidade mínima couber, ele avisa e sugere
dividir o pedido.

**O `.ft` continua guardando as imagens ORIGINAIS, sem compressão nenhuma.**
A compressão acontece só na exportação para o Trello.
