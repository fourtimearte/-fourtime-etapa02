# ============================================================
#  FOURTIME — ETAPA 02 — Servidor de Banco de Dados na Nuvem
#  FastAPI + SQLite · compartilha o Banco de Dados global do
#  editor de orçamentos entre todos os usuários.
#
#  Endpoints (todos exigem o cabeçalho  X-FT-Token):
#    GET  /api/ping                → teste de conexão
#    GET  /api/db                  → {rev, data}  banco global
#    PUT  /api/db                  → grava banco  {rev, data}
#    GET  /api/orcamentos          → lista de orçamentos salvos
#    GET  /api/orcamentos/{id}     → conteúdo .ft de um orçamento
#    POST /api/orcamentos          → salva orçamento {nome, data}
#    DELETE /api/orcamentos/{id}   → remove orçamento
#
#  O token é definido na variável de ambiente FT_TOKEN.
#  Se existir um arquivo editor*.html na mesma pasta, ele é
#  servido em "/" — editor completamente online.
# ============================================================
import os, re, json, glob, sqlite3, threading, hashlib, uuid, copy, hmac, time, secrets
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

FT_TOKEN = os.environ.get("FT_TOKEN", "fourtime2026")
# Token do ADMIN: só quem tem este pode APAGAR ou RENOMEAR itens do banco.
# Sem ele, o servidor MESCLA tudo — ninguém consegue destruir o trabalho alheio.
FT_ADMIN_TOKEN = os.environ.get("FT_ADMIN_TOKEN", "").strip()

# ============================================================
#  LOGIN POR PESSOA  (v3.307)
#
#  Antes: o editor era servido para QUALQUER UM que abrisse o
#  endereco, e a chave da equipe estava escrita dentro do HTML
#  (FT_TOKEN_PADRAO). Ou seja, quem abriu o link uma vez ficou
#  com a chave para sempre.
#
#  Agora: cada pessoa tem usuario e senha, e a sessao vive num
#  cookie assinado. O X-FT-Token deixa de abrir portas.
#
#  FT_SEGREDO      assina o cookie. Se nao existir, e derivado do
#                  FT_ADMIN_TOKEN (que NAO e publico) para a sessao
#                  sobreviver a reinicio sem exigir configuracao nova.
#  FT_SESSAO_DIAS  quanto tempo a pessoa fica logada. Padrao 30.
#  FT_LOGIN_DESLIGADO=1  DESLIGA o login e volta ao comportamento
#                  antigo. E a chave de emergencia: se algo der
#                  errado numa segunda de manha, um clique no painel
#                  do Render devolve o sistema para todo mundo.
# ============================================================
FT_SESSAO_DIAS = int(os.environ.get("FT_SESSAO_DIAS", "30") or 30)
FT_LOGIN_DESLIGADO = os.environ.get("FT_LOGIN_DESLIGADO", "").strip().lower() in ("1", "sim", "true", "on")
FT_SEGREDO = os.environ.get("FT_SEGREDO", "").strip()
COOKIE_SESSAO = "ft_sessao"

# Senhas de PARTIDA. Nenhuma delas sobrevive ao primeiro acesso: enquanto a
# pessoa nao trocar, o servidor nao entrega o editor (ver "precisaTrocar").
SENHA_INICIAL_ADMIN  = os.environ.get("FT_SENHA_ADMIN_INICIAL",  "21560110")
SENHA_INICIAL_EQUIPE = os.environ.get("FT_SENHA_EQUIPE_INICIAL", "2026@Fourtime")

# A equipe, como o Henrique passou. Isto so e usado UMA vez, para semear.
# Depois disso quem manda e a lista gravada.
FT_SEMENTE = [
    ("henrique", "Henrique", "admin",      SENHA_INICIAL_ADMIN),
    ("dani",     "Dani",     "admin",      SENHA_INICIAL_ADMIN),
    ("kev",      "Kev",      "vendedor",   SENHA_INICIAL_EQUIPE),
    ("patricia", "Patricia", "vendedor",   SENHA_INICIAL_EQUIPE),
    ("lucas",    "Lucas",    "vendedor",   SENHA_INICIAL_EQUIPE),
    ("fabricio", "Fabricio", "vendedor",   SENHA_INICIAL_EQUIPE),
    ("dayane",   "Dayane",   "financeiro", SENHA_INICIAL_EQUIPE),
]

# O QUE CADA PAPEL PODE. E uma lista de permissoes, nao de telas: a tela
# esconde o botao, mas quem recusa de verdade e o servidor, aqui.
#   orcamento     o editor de orcamentos
#   clientes      a secao de clientes
#   banco         VER o banco (tecidos, cores, referencias)
#   banco.editar  MEXER no banco (adicionar e alterar)
#   relatorio     a secao de relatorios
#   admin         apagar, renomear, padronizar mes, administrar usuarios
FT_PAPEIS = {
    "admin":      {"orcamento", "clientes", "banco", "banco.editar", "relatorio", "bugs", "admin"},
    "vendedor":   {"orcamento", "clientes", "banco", "banco.editar", "bugs"},
    # EDITOR (v3.310): monta e altera orcamento, e NAO vende. Nas permissoes
    # e igual ao vendedor, de proposito: quem escreve um orcamento precisa
    # cadastrar o tecido, a cor e a referencia que faltarem, senao trava no
    # meio do trabalho e chama alguem.
    "editor":     {"orcamento", "clientes", "banco", "banco.editar", "bugs"},
    "financeiro": {"orcamento", "clientes", "banco", "relatorio", "bugs"},
}

# QUEM APARECE COMO VENDEDOR NO ORCAMENTO.
#
# Desde a v3.307 o campo Vendedor nasce com o nome de quem esta logado. Isso
# fez o relatorio virar dado de verdade, e criou um defeito: quem NAO vende
# assinava como vendedor. O editor monta orcamento para os outros, e a
# Dayane e do financeiro; nenhum dos dois e o vendedor daquele pedido.
#
# Por isso a diferenca entre "vendedor" e "editor" NAO e uma permissao: os
# dois podem exatamente as mesmas coisas. A diferenca e esta linha.
FT_PAPEL_VENDE = {"admin", "vendedor"}
# Versão MÍNIMA do editor aceita para GRAVAR. Editores antigos têm um banco
# local possivelmente velho — e a mesclagem ressuscitaria itens já apagados.
# Ler, qualquer versão pode; gravar, só quem está em dia.
# v3.258/259: subiu de 3.131 para 3.258. Não é capricho de versão — as
# v3.256/257 inventavam o id do cliente NO NAVEGADOR, e cada máquina que
# sincronizava somava um conjunto inteiro de cadastros (225 viraram 900). Um
# editor antigo numa aba esquecida basta para bagunçar a identidade de novo.
# Quem não está em dia LÊ, mas não GRAVA.
#
# O PISO existe porque mudar o padrão do código não bastou: o Render tinha
# FT_EDITOR_MINIMO=3.131 na configuração, e a variável de ambiente vence o
# padrão — o servidor subiu a v258 ainda aceitando gravação da v257. Uma trava
# de segurança que depende de alguém lembrar de editar um painel não é trava.
# Agora o código impõe o piso, e a variável só pode ser usada para SUBIR.
FT_EDITOR_PISO = "3.258"
# o piso é aplicado logo depois de _versao_num() existir (ver abaixo)
FT_EDITOR_MINIMO = os.environ.get("FT_EDITOR_MINIMO", FT_EDITOR_PISO).strip() or FT_EDITOR_PISO
DB_PATH  = os.environ.get("FT_DB_PATH", os.path.join(os.path.dirname(__file__), "fourtime.db"))

app = FastAPI(title="Fourtime Etapa 02", docs_url=None, redoc_url=None)

# ================================================================
# BANDA (v3.337)
#
# O Render suspendeu o serviço por banda. A conta é simples e estava à
# vista: o editor tem 1,49 MB e saía CRU, sem compressão, em toda
# abertura e todo F5. Comprimido ele são 533 KB, e revalidado ele são
# 300 bytes (ver a rota "/").
#
# gzip é o mesmo mecanismo que qualquer site usa: o navegador diz que
# aceita, o servidor manda comprimido, o navegador descomprime. Não
# muda uma linha do que chega ao editor.
#
# minimum_size=1024 deixa passar as respostas curtas (rev, carimbo,
# versão), onde comprimir custaria mais CPU do que economiza byte.
# ================================================================
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # o editor pode abrir de file:// ou de qualquer host
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = threading.Lock()

def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    with conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS banco(
            id INTEGER PRIMARY KEY CHECK(id=1),
            rev INTEGER NOT NULL DEFAULT 0,
            data TEXT NOT NULL DEFAULT '{}',
            atualizado TEXT)""")
        c.execute("""CREATE TABLE IF NOT EXISTS orcamentos(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            data TEXT NOT NULL,
            atualizado TEXT)""")
        c.execute("""CREATE TABLE IF NOT EXISTS usuarios(
            u TEXT PRIMARY KEY,
            json TEXT NOT NULL)""")
        if not c.execute("SELECT 1 FROM banco WHERE id=1").fetchone():
            c.execute("INSERT INTO banco(id,rev,data,atualizado) VALUES(1,0,'{}',?)",
                      (agora(),))
init_db_done = False

def agora():
    return datetime.now(timezone.utc).isoformat()

def exige_token(req: Request):
    """Quem pode falar com a API.

       Era a comparacao de um token compartilhado, que estava impresso dentro
       do HTML servido publicamente. Agora e a SESSAO da pessoa. O nome da
       funcao ficou para nao reescrever as quarenta chamadas espalhadas pelo
       arquivo; o que ela faz mudou por inteiro.

       Com FT_LOGIN_DESLIGADO=1 ela volta a ser o que era. E a saida de
       emergencia, e existe de proposito."""
    if FT_LOGIN_DESLIGADO:
        # A CHAVE DE EMERGENCIA deixa o sistema ABERTO, e nao "com o token de
        # antes". Tem de ser assim: o editor novo nao carrega mais o token da
        # equipe (ele era publico, era esse o problema), entao exigir o token
        # aqui deixaria todo mundo de fora justamente no momento em que a
        # chave foi usada para colocar todo mundo de volta.
        return None
    u = usuario_da_req(req)
    if not u:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login de novo.")
    # A TROCA OBRIGATORIA E DE VERDADE. Enquanto a senha de partida estiver de
    # pe, nenhuma outra rota responde. Se a trava vivesse so na tela de login,
    # bastaria digitar o endereco da API para contornar.
    if u.get("trocar"):
        raise HTTPException(status_code=403,
            detail="Troque a senha de partida para continuar.")
    return u


def exige_pode(req: Request, permissao: str):
    """Recusa quem nao tem a permissao. Esconder o botao na tela nao basta:
       sem isto, bastaria chamar o endereco na mao."""
    if FT_LOGIN_DESLIGADO:
        return None
    u = exige_token(req)
    if not pode(u, permissao):
        raise HTTPException(status_code=403,
            detail="Seu acesso (%s) não inclui isto." % (u or {}).get("papel", "?"))
    return u

@app.on_event("startup")
def _startup():
    init_db()

# ---------------- API ----------------
@app.get("/api/ping")
def ping(request: Request):
    exige_token(request)
    return {"ok": True, "servidor": "Fourtime Etapa 02", "hora": agora()}

# ============================================================
#  MESCLAGEM DO BANCO
#
#  Antes era "a última gravação vence": dois vendedores cadastrando clientes
#  ao mesmo tempo → o segundo levava 409, o editor baixava o banco do servidor
#  por cima, e as adições dele SUMIAM. Era perda de dados silenciosa.
#
#  Agora toda gravação é uma MESCLAGEM (união). O que cada um acrescenta se
#  soma; ninguém apaga nada por omissão. Apagar e renomear exigem o token de
#  ADMIN e vão numa lista explícita ("remocoes"). Assim, um navegador com o
#  banco velho ou vazio não consegue destruir nada.
# ============================================================
def _versao_num(v):
    """'3.131' → (3,131). Tolera lixo."""
    try:
        return tuple(int(x) for x in str(v).strip().split(".")[:3])
    except Exception:
        return (0,)


# A variável de ambiente só pode SUBIR o mínimo, nunca baixá-lo. Ver o comentário
# do FT_EDITOR_PISO lá em cima: o painel do Render tinha 3.131 e derrubou a trava
# de uma versão inteira sem ninguém perceber.
if _versao_num(FT_EDITOR_MINIMO) < _versao_num(FT_EDITOR_PISO):
    FT_EDITOR_MINIMO = FT_EDITOR_PISO

def exige_editor_atual(request: Request):
    v = request.headers.get("X-FT-Editor", "").strip()
    if not v:
        raise HTTPException(status_code=426, detail=(
            "Editor antigo demais (não diz a versão). Atualize para a v%s ou mais nova. "
            "Versões antigas podem RESSUSCITAR itens já apagados do banco." % FT_EDITOR_MINIMO))
    if _versao_num(v) < _versao_num(FT_EDITOR_MINIMO):
        raise HTTPException(status_code=426, detail=(
            "Este editor é a v%s e o mínimo é a v%s. Atualize antes de gravar — "
            "versões antigas carregam um banco local velho e ressuscitariam itens "
            "já apagados." % (v, FT_EDITOR_MINIMO)))

def _chave(item):
    """Como saber se dois itens são 'o mesmo'.

    ORDEM: nome  ->  id  ->  impressão do conteúdo.

    A v3.257 pôs o `id` na frente do nome, e foi um erro caro: 225 clientes
    viraram 675. O motivo é que o id não vinha de lugar nenhum confiável —
    cada navegador inventava o seu com Date.now(). Duas máquinas olhando os
    MESMOS 225 cadastros produziam 450 chaves diferentes, e a mesclagem,
    obediente, guardava as 450.

    O nome volta à frente por três razões concretas, não por gosto:

      1. É o que o `.ft` guarda. O cabeçalho do orçamento tem
         `header.cliente` como TEXTO — nunca um id. Todo orçamento já
         salvo no Drive aponta para o cliente pelo nome, e isso não se
         reescreve retroativamente. Quando o CRM migrar para o Postgres,
         o `pedido.cliente_id` só poderá ser resolvido casando pelo nome.
         Logo, o nome já É a chave de junção — assumir isso é honestidade.

      2. É o que as lápides usam. O editor grava a remoção como o NOME em
         maiúsculas; com o id na frente, apagar um cliente parava de
         funcionar em silêncio e ele voltava na sincronização seguinte.

      3. Sobrevive a um banco velho. Um navegador com cópia antiga (sem
         id nenhum) casa pelo nome com o cadastro do servidor em vez de
         criar um clone.

    O `id` continua existindo e importa muito — mas quem o carimba agora é
    o SERVIDOR (ver `_carimba_ids`), e ele serve para o futuro: é o uuid que
    vira a chave primária no Supabase. Ele fica em segundo lugar para dar
    identidade a quem não tem nome — os relatos de bug, que são objetos sem
    `n` e cujo conteúdo muda quando alguém marca "concertado".

    Quem não tem nome nem id cai na impressão do conteúdo: melhor um item
    repetido que um item perdido.
    """
    if isinstance(item, dict):
        nome = str(item.get("n", "")).strip().upper()
        if nome:
            return nome
        ident = str(item.get("id", "")).strip()
        if ident:
            return "id:" + ident
        # sem nome nem id (bug antigo, por exemplo): o conteúdo é a identidade
        bruto = json.dumps(item, sort_keys=True, ensure_ascii=False)
        return "h:" + hashlib.sha1(bruto.encode("utf-8")).hexdigest()[:16]
    return str(item).strip().upper()


# Categorias que viram TABELA no Postgres/Supabase e portanto precisam de uma
# chave primária estável desde já. Referências, tecidos e cores são listas de
# nomes: o nome basta e acrescentar id só faria barulho.
CATEGORIAS_COM_ID = ("clientes", "bugs")

# Como é um uuid do servidor. Serve para reconhecer, no meio do banco, o que é
# identidade de verdade e o que é sobra de navegador (`cmsb3ge8h1`, `tmp_...`).
_RE_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _id_serve(cat, ident):
    """Este id pode ser mantido, ou precisa ser trocado por um do servidor?

    CLIENTES viram tabela no Postgres e a chave primária tem que ser um uuid
    nascido aqui. Qualquer outra coisa — vazio, `tmp_` do editor, ou os
    `c<base36>` que as v3.256/257 espalharam — é substituída. Uma troca só,
    agora, enquanto nada ainda aponta para esses ids; depois disso a regra do
    `mescla_listas` congela o valor para sempre.

    BUGS são diferentes de propósito: o id deles é `b...` (sorteado no ato do
    relato) ou `bh...` (derivado do conteúdo imutável, para que duas máquinas
    cheguem ao mesmo id sem combinar). Esses são identidade legítima e não
    podem virar uuid — só o vazio e o provisório são trocados.
    """
    ident = str(ident or "").strip()
    if not ident or ident.startswith("tmp_"):
        return False
    if cat == "clientes":
        return bool(_RE_UUID.match(ident))
    return True


def _carimba_ids(banco):
    """Dá identidade permanente a quem ainda não tem — e quem dá é o SERVIDOR.

    Este é o conserto de fundo da v3.258. O id não some: ele passa a nascer
    numa AUTORIDADE ÚNICA em vez de em cada navegador. Um uuid4 carimbado
    aqui é o mesmo valor que vira `cliente.id uuid PRIMARY KEY` quando o CRM
    migrar para o Supabase — a migração deixa de precisar inventar ids novos
    e perder o rastro do que é quem.

    Também recolhe os ids provisórios: o editor precisa de alguma coisa para
    saber qual ficha está aberta antes do primeiro sync, e usa um `tmp_...`.
    Esse prefixo é a marca de "isto ainda não é identidade" — o servidor o
    substitui pelo uuid de verdade na primeira gravação.

    Devolve quantos itens ganharam id (0 = nada a fazer).
    """
    carimbados = 0
    for cat in CATEGORIAS_COM_ID:
        itens = banco.get(cat)
        if not isinstance(itens, list):
            continue
        for it in itens:
            if not isinstance(it, dict):
                continue
            if not _id_serve(cat, it.get("id")):
                it["id"] = str(uuid.uuid4())
                carimbados += 1
    return carimbados

def mescla_listas(base, novos):
    """União preservando a ordem: primeiro o que já existia, depois o que é novo.
       Itens que já existem têm os CAMPOS atualizados (cor do tecido, CPF do cliente)."""
    saida, indice = [], {}
    for it in (base or []):
        k = _chave(it)
        if not k or k in indice:
            continue
        indice[k] = len(saida)
        saida.append(it)
    for it in (novos or []):
        k = _chave(it)
        if not k:
            continue
        if k in indice:
            antigo = saida[indice[k]]
            # objeto: campos preenchidos vencem os vazios (não apaga o doc de ninguém)
            if isinstance(antigo, dict) and isinstance(it, dict):
                junto = dict(antigo)
                for campo, valor in it.items():
                    # v3.259 — O `id` É A ÚNICA EXCEÇÃO À REGRA "PREENCHIDO VENCE".
                    #
                    # Um id que qualquer máquina pode reescrever não é chave
                    # primária, é sugestão. E era isso que acontecia: um
                    # navegador com cópia velha no IndexedDB mandava o id que
                    # ELE tinha, "preenchido vence vazio" aceitava, e o uuid do
                    # servidor era substituído. A cada sincronização de uma
                    # máquina atrasada, a identidade do cliente mudava.
                    #
                    # Depois de atribuído, o id não se altera. Ponto. É esse
                    # compromisso que permite prometer que o uuid de hoje é a
                    # chave primária do Supabase amanhã.
                    if campo == "id" and str(antigo.get("id", "")).strip():
                        continue
                    if valor not in (None, "", []):
                        junto[campo] = valor
                saida[indice[k]] = junto
        else:
            indice[k] = len(saida)
            saida.append(it)
    return saida

LAPIDES = "_removidos"   # não é categoria do banco: não aparece na tela

def aplica_renomeacoes(banco, renomeacoes, lapides=None):
    """Renomear um cadastro sem criar um sósia. (v3.262)

    A identidade do cliente é o NOME (ver a decisão da v3.258), e isso tem um
    preço que só apareceu agora: trocar o nome equivale a apagar um cadastro e
    criar outro. Medido antes de escrever isto:

        no servidor       ASSOCIACAO EDUCACIONAL MODELO LTDA
        o editor enviou   ESCOLA MODELO
        ficou             os DOIS, com o mesmo uuid em ambos

    Ninguém tinha esbarrado nisso porque quase ninguém renomeava. A separação
    entre Nome e Razão Social muda isso: a razão social entra pela Receita e o
    vendedor troca pelo apelido que usa — renomear vira rotina.

    A saída é a mesma das limpezas: o editor DECLARA a intenção, junto com o
    uuid do cadastro, e o servidor renomeia quem já existe em vez de deduzir
    pelo nome que chegou.

        {"clientes": {"<uuid>": "ESCOLA MODELO"}}

    Roda ANTES da mesclagem, sobre a base: assim, quando o item enviado chegar
    com o nome novo, ele encontra o cadastro já renomeado e os dois viram um.

    Se o nome novo tiver lápide (alguém apagou um cadastro com esse nome antes),
    a lápide é removida — renomear é uma declaração explícita de que este
    cadastro deve existir com este nome, e ela vence um enterro antigo.
    """
    trocados = 0
    for cat, por_item in (renomeacoes or {}).items():
        itens = banco.get(cat)
        if not isinstance(itens, list) or not isinstance(por_item, dict):
            continue
        for it in itens:
            if not isinstance(it, dict):
                continue
            novo = por_item.get(str(it.get("id", "")).strip())
            if not isinstance(novo, str):
                continue
            novo = novo.strip()
            # esvaziar o nome tornaria o cadastro inalcançável para todo
            # orçamento que aponta para ele: não é renomeação, é destruição
            if not novo or novo == str(it.get("n", "")).strip():
                continue
            it["n"] = novo
            trocados += 1
            if isinstance(lapides, dict):
                enterrados = lapides.get(cat)
                if isinstance(enterrados, dict):
                    enterrados.pop(novo.upper(), None)
                    if not enterrados:
                        lapides.pop(cat, None)
    return trocados


def aplica_limpezas(banco, limpezas):
    """Esvazia campos que alguém apagou DE PROPÓSITO. (v3.259+, servidor da v261)

    A regra de mesclagem é "campo preenchido vence campo vazio", e ela tem de
    continuar sendo — é o que impede um navegador com o banco velho de apagar
    o trabalho dos outros por omissão. Mas ela confundia duas coisas:

        "eu não tenho esse dado"             → ignorar o vazio, e ainda bem
        "eu apaguei esse dado de propósito"  → tinha de valer, e não valia

    Quem limpou um campo via a tela ficar em branco e o valor velho voltar na
    sincronização seguinte. Sem aviso nenhum.

    Agora o editor DECLARA o que esvaziou, e a declaração chega aqui:

        {"clientes": {"<uuid do cliente>": ["rua", "zap", "fone"]}}

    O cadastro é encontrado pelo `id` — este é o primeiro uso de verdade do
    uuid estável: pelo nome não daria, porque quem renomeia e limpa na mesma
    edição mandaria a limpeza para o cadastro errado.

    LIMITE CONHECIDO: uma máquina que esteja há muito tempo sem sincronizar
    ainda tem o valor antigo preenchido e vai reenviá-lo, ressuscitando o
    campo. Os editores conferem a revisão a cada 5 segundos, então a janela é
    curta — mas não é zero. Se isso virar problema de verdade, o conserto é
    lápide por campo, como já existe para item apagado.
    """
    contados = 0
    for cat, por_item in (limpezas or {}).items():
        itens = banco.get(cat)
        if not isinstance(itens, list) or not isinstance(por_item, dict):
            continue
        for it in itens:
            if not isinstance(it, dict):
                continue
            campos = por_item.get(str(it.get("id", "")).strip())
            if not isinstance(campos, list):
                continue
            for campo in campos:
                campo = str(campo)
                # o nome é a identidade do cadastro: esvaziá-lo o tornaria
                # inalcançável para todo orçamento que aponta para ele
                if campo in ("id", "n") or campo not in it:
                    continue
                if it.get(campo) not in (None, "", []):
                    it[campo] = ""
                    contados += 1
    return contados


def mescla_banco(base, novo, remocoes=None, admin=False, limpezas=None, renomeacoes=None):
    """Une base + novo. Itens com LÁPIDE não voltam — é isso que impede um
       navegador com banco velho de ressuscitar o que já foi apagado."""
    base = base or {}
    novo = novo or {}
    lapides = {k: dict(v) for k, v in (base.get(LAPIDES) or {}).items()
               if isinstance(v, dict)}

    # ANTES de tudo: quem foi renomeado passa a se chamar assim já na base, de
    # modo que o item que chega com o nome novo reencontre o seu cadastro em
    # vez de virar um segundo. Ver aplica_renomeacoes.
    if renomeacoes:
        base = copy.deepcopy(base)
        aplica_renomeacoes(base, renomeacoes, lapides)

    # o admin, ao ACRESCENTAR um item que estava enterrado, o desenterra
    if admin:
        for cat, itens in novo.items():
            if not isinstance(itens, list) or cat not in lapides:
                continue
            for it in itens:
                lapides[cat].pop(_chave(it), None)
            if not lapides[cat]:
                lapides.pop(cat, None)

    saida = {}
    for cat in set(list(base.keys()) + list(novo.keys())):
        if cat == LAPIDES:
            continue
        b, n = base.get(cat), novo.get(cat)
        if isinstance(b, list) or isinstance(n, list):
            enterrados = set((lapides.get(cat) or {}).keys())
            junto = mescla_listas(b if isinstance(b, list) else [],
                                  n if isinstance(n, list) else [])
            saida[cat] = [it for it in junto if _chave(it) not in enterrados]
        else:
            saida[cat] = n if cat in novo else b

    # novas remoções (só chegam aqui se for admin) viram lápides permanentes
    for cat, chaves in (remocoes or {}).items():
        fora = {str(k).strip().upper() for k in (chaves or []) if str(k).strip()}
        if not fora:
            continue
        if isinstance(saida.get(cat), list):
            saida[cat] = [it for it in saida[cat] if _chave(it) not in fora]
        marca = lapides.setdefault(cat, {})
        for k in fora:
            marca[k] = agora()

    if lapides:
        saida[LAPIDES] = lapides

    # depois da união de campos, e só depois: o que foi apagado de propósito
    # tem de vencer o que a mesclagem acabou de preservar
    aplica_limpezas(saida, limpezas)

    # último passo, sempre: quem entrou sem identidade sai com uma. Fica aqui
    # (e não nas rotas) para valer em TODOS os caminhos de gravação — Drive,
    # SQLite efêmero e qualquer rota futura.
    _carimba_ids(saida)
    return saida


def _inchou(base, junto, pct=50, minimo=25, semente=None):
    """Freio de mão: uma gravação que INCHA uma categoria é quase sempre bug.

    Existe o freio contrário desde a v3.2xx (o banco não pode ENCOLHER de
    repente, para um navegador vazio não apagar o trabalho dos outros). Faltava
    este. A duplicação dos clientes cresceu 225 → 450 → 675 sem nada reclamar:
    três gravações, cada uma somando um conjunto inteiro, todas aceitas em
    silêncio. Foi preciso um humano CONTAR as linhas na tela para descobrir.

    Uma sincronização honesta acrescenta alguns cadastros. Nenhuma triplica uma
    lista. Se triplicar, é acidente — e o certo é recusar e explicar, não gravar
    e esperar que alguém perceba.

    Os dois limites juntos (percentual E quantidade) evitam falso alarme em
    lista pequena: sair de 3 para 6 embalagens é crescer 100%, mas são 3 itens.

    CATÁLOGO DE FÁBRICA (v3.291). Existe um crescimento grande que é legítimo:
    quando o editor traz um catálogo novo embutido — as cores de tecido saltaram
    de 50 para 121 na v3.288 — e o planta no banco de quem já usa o sistema.
    Isso não é duplicação: são nomes NOVOS e DISTINTOS, o editor os declara no
    campo `semente` do envio, e eles aparecem na página do Banco para conferir.

    O desconto é conservador de propósito: só sai da conta o item que (a) o
    editor declarou pelo nome E (b) NÃO existia no banco do servidor. Um envio
    que repita o que já está lá continua sendo barrado, que é o ponto do freio.
    """
    for cat, depois in (junto or {}).items():
        if cat == LAPIDES or not isinstance(depois, list):
            continue
        antes_l = (base or {}).get(cat)
        antes = len(antes_l) if isinstance(antes_l, list) else 0
        if not antes:
            continue                      # categoria nova ou vazia: não há o que comparar
        somou = len(depois) - antes
        declarados = {str(n).strip().upper() for n in ((semente or {}).get(cat) or [])}
        if declarados:
            ja_tinha = {_chave(it) for it in (antes_l or [])}
            plantados = sum(1 for it in depois
                            if _chave(it) in declarados and _chave(it) not in ja_tinha)
            somou -= plantados
        if somou > minimo and somou > antes * pct / 100.0:
            return {"categoria": cat, "antes": antes, "depois": len(depois),
                    "somou": somou}
    return None

def _recado_inchou(c):
    """A mensagem que a pessoa lê. Sem jargão, e dizendo o que fazer."""
    return ("Não gravei: esta sincronização faria a lista de %s saltar de %d para "
            "%d itens (%d a mais de uma vez só). Isso quase sempre é duplicação, "
            "não cadastro novo. O banco do servidor foi trazido para esta máquina "
            "— confira a lista. Se a intenção era mesmo importar um banco inteiro, "
            "use o botão Importar DB conectado como administrador."
            % (c["categoria"], c["antes"], c["depois"], c["somou"]))


def eh_admin(request: Request) -> bool:
    """Quem pode apagar e renomear.

       Com login ligado quem manda e o PAPEL da pessoa. O X-FT-Admin continua
       valendo como porta dos fundos: se o login quebrar, ainda ha um caminho
       para operar o servidor."""
    if not FT_LOGIN_DESLIGADO:
        u = usuario_da_req(request)
        if u and pode(u, "admin"):
            return True
    if not FT_ADMIN_TOKEN:
        return False
    return request.headers.get("X-FT-Admin", "").strip() == FT_ADMIN_TOKEN

@app.get("/api/db/sou-admin")
def sou_admin(request: Request):
    exige_token(request)
    return {"admin": eh_admin(request), "admin_configurado": bool(FT_ADMIN_TOKEN)}

@app.get("/api/db")
def ler_db(request: Request):
    """A verdade mora no Drive. O SQLite é só cache, porque o disco do Render
       é apagado a cada deploy e a cada hibernação."""
    exige_token(request)
    if drive_ligado():
        try:
            d = le_banco_drive()
        except HTTPException:
            raise
        except Exception as e:
            # NUNCA responder "banco vazio" quando o Drive falha: o editor
            # entenderia como servidor novo e sobrescreveria tudo.
            raise HTTPException(status_code=502,
                detail="Não consegui ler o banco no Drive: %r" % (e,))
        if d:
            _guarda_cache(d["rev"], d["data"])
            _rev_memoria["rev"] = d["rev"]
            return {"rev": d["rev"], "data": d["data"],
                    "atualizado": d.get("atualizado", ""), "onde": "drive"}
        # não existe ainda: o primeiro a gravar cria
        return {"rev": 0, "data": {}, "atualizado": "", "onde": "drive-vazio"}

    with conn() as c:
        r = c.execute("SELECT rev,data,atualizado FROM banco WHERE id=1").fetchone()
    return {"rev": r["rev"], "data": json.loads(r["data"]),
            "atualizado": r["atualizado"], "onde": "sqlite-efemero"}

def _guarda_cache(rev, dados):
    try:
        with conn() as c:
            c.execute("UPDATE banco SET rev=?,data=?,atualizado=? WHERE id=1",
                      (rev, json.dumps(dados, ensure_ascii=False), agora()))
    except Exception:
        pass

# CATEGORIAS QUE SAO "O BANCO". As demais (clientes, bugs) todo mundo que
# entra pode gravar, porque cadastrar cliente e relatar bug e o trabalho de
# qualquer um. Quem nao tem "banco.editar" simplesmente nao mexe nestas.
CATEGORIAS_DO_BANCO = ("tecidos", "cores", "referencias", "fichas", "departamentos",
                       "embalagens", "vendedores", "entregas", "pagamentos", "grupos")


def _so_o_que_pode_gravar(dados, usuario):
    """Tira do pacote as categorias que esta pessoa nao pode alterar.

       Descarta em silencio, e nao recusa a gravacao inteira, de proposito: o
       Financeiro salva um cliente e o banco dela vai junto no mesmo pacote,
       como vai o de todo mundo. Recusar tudo faria ela nao conseguir salvar
       cliente nenhum; recusar so o que nao e dela deixa o trabalho passar."""
    if FT_LOGIN_DESLIGADO or not usuario or pode(usuario, "banco.editar"):
        return dados, []
    limpo = dict(dados)
    tirados = [c for c in CATEGORIAS_DO_BANCO if c in limpo]
    for c in tirados:
        limpo.pop(c, None)
    return limpo, tirados


@app.put("/api/db")
async def gravar_db(request: Request):
    eu = exige_token(request)
    _backup_se_for_a_hora()   # o primeiro salvamento do dia guarda o banco
    exige_editor_atual(request)          # editor velho não grava (ressuscitaria itens)
    corpo = await request.json()
    dados = corpo.get("data")
    if not isinstance(dados, dict):
        raise HTTPException(status_code=400, detail="Campo 'data' inválido")
    dados, _tirados = _so_o_que_pode_gravar(dados, eu)

    remocoes = corpo.get("remocoes") or {}
    # campos esvaziados de propósito (ver aplica_limpezas). Não exige admin:
    # limpar um campo é edição normal, que qualquer vendedor já pode fazer —
    # e, ao contrário de apagar um item, só chega aqui por ação explícita na
    # tela, nunca por um banco velho "achando" que o campo está vazio.
    limpezas = corpo.get("limpezas") or {}
    # trocas de nome declaradas (ver aplica_renomeacoes)
    renomeacoes = corpo.get("renomeacoes") or {}
    if remocoes and not eh_admin(request):
        raise HTTPException(status_code=403, detail=(
            "Só o administrador pode apagar ou renomear itens do banco. "
            "Suas ADIÇÕES foram preservadas; as exclusões, não."))
    admin = eh_admin(request)
    # "Importar DB" cresce de propósito — é a única gravação que pode inchar.
    # Vem marcada no corpo e é privilégio do admin.
    forcar = bool(corpo.get("forcar")) and admin
    # catálogo embutido no editor, declarado pelo nome (ver _inchou)
    semente = corpo.get("semente") or {}

    if not drive_ligado():
        with _lock, conn() as c:
            atual = c.execute("SELECT rev,data FROM banco WHERE id=1").fetchone()
            base = json.loads(atual["data"])
            junto = mescla_banco(base, dados, remocoes if admin else None, admin=admin,
                                 limpezas=limpezas, renomeacoes=renomeacoes)
            if not forcar:
                cresceu = _inchou(base, junto, semente=semente)
                if cresceu:
                    return JSONResponse(status_code=409, content={
                        "inchou": cresceu, "rev": atual["rev"], "data": base,
                        "detail": _recado_inchou(cresceu)})
            nova = atual["rev"] + 1
            c.execute("UPDATE banco SET rev=?,data=?,atualizado=? WHERE id=1",
                      (nova, json.dumps(junto, ensure_ascii=False), agora()))
        _rev_memoria["rev"] = nova          # sem isto, /api/db/rev congelava 
        return {"rev": nova, "ok": True, "onde": "sqlite-efemero",
                "data": junto, "mesclado": True, "admin": admin}

    with _db_lock:
        atual = le_banco_drive()
        rev_atual = atual["rev"] if atual else 0
        base = atual["data"] if atual else {}

        # MESCLAGEM: ninguém apaga por omissão. A revisão do cliente já não
        # precisa bater — o merge resolve concorrência sem descartar trabalho.
        junto = mescla_banco(base, dados, remocoes if admin else None, admin=admin,
                             limpezas=limpezas, renomeacoes=renomeacoes)

        if not forcar:
            cresceu = _inchou(base, junto, semente=semente)
            if cresceu:
                # não grava NADA e devolve o banco bom, para o editor adotá-lo
                return JSONResponse(status_code=409, content={
                    "inchou": cresceu, "rev": rev_atual, "data": base,
                    "detail": _recado_inchou(cresceu)})

        nova = rev_atual + 1
        grava_banco_drive(nova, junto)
        _guarda_cache(nova, junto)
        _rev_memoria["rev"] = nova

    return {"rev": nova, "ok": True, "onde": "drive",
            "data": junto, "mesclado": True, "admin": admin,
            "removidos": sum(len(v or []) for v in remocoes.values()) if admin else 0}

@app.get("/api/db/rev")
def rev_db(request: Request):
    """Só o número da revisão. É o que os editores consultam de 5 em 5 segundos
       para saber se alguém mexeu no banco — resposta minúscula, servida da
       memória, sem tocar no Drive. Só quando o número MUDA é que o editor
       baixa o banco inteiro."""
    exige_token(request)
    r = _rev_memoria["rev"]
    if r is None:                       # servidor recém-iniciado: lê uma vez
        try:
            if drive_ligado():
                d = le_banco_drive()
                r = d["rev"] if d else 0
            else:
                with conn() as c:
                    r = c.execute("SELECT rev FROM banco WHERE id=1").fetchone()["rev"]
        except Exception:
            r = 0
        _rev_memoria["rev"] = r
    return {"rev": r, "minimo": FT_EDITOR_MINIMO,
            "editor": versao_publicada()["versao"]}   # de brinde: o editor compara com o dele

@app.get("/api/db/diagnostico")
def db_diagnostico(request: Request):
    """Onde o banco está morando de verdade, e se sobrevive a um reinício."""
    exige_token(request)
    if not drive_ligado():
        return {"onde": "sqlite-efemero", "aviso":
                "O banco está no disco do Render, que é APAGADO a cada deploy e a cada "
                "hibernação. Configure FT_DRIVE_CREDENCIAIS e FT_DRIVE_PASTA para o banco "
                "morar no Google Drive.", "persistente": False}
    try:
        d = le_banco_drive()
    except HTTPException as e:
        return {"onde": "drive", "persistente": None, "erro": str(e.detail)}
    if not d:
        # ATENÇÃO: quando a service account não ENXERGA a pasta, a busca volta vazia
        # em vez de dar erro — então "não existe" pode significar "não consigo ver".
        # Aqui a gente pergunta pela pasta em si, que aí sim dá erro se não houver acesso.
        try:
            info = _drive_get("/files/" + _pasta_do_banco(),
                              {"fields": "id,name,capabilities(canAddChildren)",
                               "supportsAllDrives": "true"})
            pode = (info.get("capabilities") or {}).get("canAddChildren")
            return {"onde": "drive", "persistente": True, "arquivo": DB_NOME,
                    "pasta": _pasta_do_banco(), "pasta_nome": info.get("name"),
                    "enxerga_a_pasta": True, "pode_escrever_na_pasta": pode, "existe": False,
                    "aviso": ("Crie um arquivo chamado '%s' dentro dessa pasta. A service account "
                              "não consegue criar arquivos (contas de serviço não têm cota), mas "
                              "consegue EDITAR um que já exista." % DB_NOME)}
        except HTTPException as e:
            return {"onde": "drive", "persistente": True, "pasta": _pasta_do_banco(),
                    "enxerga_a_pasta": False, "erro": str(e.detail),
                    "aviso": "A service account NÃO enxerga essa pasta. Confira o ID e o "
                             "compartilhamento (precisa ser Editor)."}
    dados = d.get("data") or {}
    itens = {k: len(v) for k, v in dados.items() if isinstance(v, list)}

    # Saúde da identidade (v3.258). Um cliente sem id, ou com id provisório do
    # navegador, é exatamente o que triplicou o banco — e é o que impediria a
    # migração para o Supabase de casar os pedidos com os cadastros. Isto tem
    # que ser 0/0 num banco saudável, e dá para conferir sem abrir o editor.
    identidade = {}
    for cat in CATEGORIAS_COM_ID:
        lista = dados.get(cat)
        if not isinstance(lista, list):
            continue
        sem, tmp, nomes = 0, 0, []
        for it in lista:
            if not isinstance(it, dict):
                continue
            ident = str(it.get("id", "")).strip()
            if not ident:
                sem += 1
            elif ident.startswith("tmp_"):
                tmp += 1
            n = str(it.get("n", "")).strip().upper()
            if n:
                nomes.append(n)
        identidade[cat] = {"total": len(lista), "sem_id": sem, "id_provisorio": tmp,
                           "nomes_repetidos": len(nomes) - len(set(nomes))}

    return {"onde": "drive", "persistente": True, "arquivo": DB_NOME,
            "pasta": _pasta_do_banco(), "existe": True,
            "rev": d.get("rev"), "atualizado": d.get("atualizado"), "itens": itens,
            "identidade": identidade, "backup": _backup_estado,
            "editor_minimo": FT_EDITOR_MINIMO}

@app.get("/api/orcamentos")
def listar_orc(request: Request):
    exige_token(request)
    with conn() as c:
        rs = c.execute("SELECT id,nome,atualizado FROM orcamentos ORDER BY atualizado DESC").fetchall()
    return [{"id": r["id"], "nome": r["nome"], "atualizado": r["atualizado"]} for r in rs]

@app.get("/api/orcamentos/{oid}")
def ler_orc(oid: int, request: Request):
    exige_token(request)
    with conn() as c:
        r = c.execute("SELECT id,nome,data,atualizado FROM orcamentos WHERE id=?", (oid,)).fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    return {"id": r["id"], "nome": r["nome"], "data": json.loads(r["data"]), "atualizado": r["atualizado"]}

@app.post("/api/orcamentos")
async def salvar_orc(request: Request):
    exige_token(request)
    corpo = await request.json()
    nome = str(corpo.get("nome", "")).strip() or "Sem nome"
    dados = corpo.get("data")
    oid = corpo.get("id")
    if dados is None:
        raise HTTPException(status_code=400, detail="Campo 'data' obrigatório")
    with _lock, conn() as c:
        if oid:
            c.execute("UPDATE orcamentos SET nome=?,data=?,atualizado=? WHERE id=?",
                      (nome, json.dumps(dados, ensure_ascii=False), agora(), int(oid)))
            return {"id": int(oid), "ok": True}
        cur = c.execute("INSERT INTO orcamentos(nome,data,atualizado) VALUES(?,?,?)",
                        (nome, json.dumps(dados, ensure_ascii=False), agora()))
        return {"id": cur.lastrowid, "ok": True}

@app.delete("/api/orcamentos/{oid}")
def apagar_orc(oid: int, request: Request):
    exige_token(request)
    with _lock, conn() as c:
        c.execute("DELETE FROM orcamentos WHERE id=?", (oid,))
    return {"ok": True}


# ============================================================
#  BANCO DE IMAGENS — GOOGLE DRIVE (service account, somente leitura)
#
#  Chamadas REST diretas via urllib — SEM google-api-python-client/httplib2,
#  que não são thread-safe e corrompiam o SSL quando o painel pedia várias
#  miniaturas ao mesmo tempo (bad record mac / segfault).
#  Cada requisição abre a própria conexão; o token é assinado pelo google-auth.
#
#  Variáveis de ambiente:
#    FT_DRIVE_CREDENCIAIS = conteúdo do JSON da service account
#    FT_DRIVE_PASTA       = ID da pasta raiz de layouts no Drive
# ============================================================
import urllib.request, urllib.parse, urllib.error, time

FT_DRIVE_CREDENCIAIS = os.environ.get("FT_DRIVE_CREDENCIAIS", "")
FT_DRIVE_PASTA = os.environ.get("FT_DRIVE_PASTA", "")

DRIVE_API = "https://www.googleapis.com/drive/v3"
_cred = None
_cred_lock = threading.Lock()
_pais_cache = {}          # id do arquivo -> id do pai (a árvore do Drive muda pouco)
_raiz_cache = {}          # id -> True/False (está dentro da raiz?)
_cache_lock = threading.Lock()

def _credencial():
    global _cred
    if _cred is None:
        with _cred_lock:
            if _cred is None:
                from google.oauth2 import service_account
                info = json.loads(FT_DRIVE_CREDENCIAIS)
                _cred = service_account.Credentials.from_service_account_info(
                    info, scopes=["https://www.googleapis.com/auth/drive"])   # escrita: o banco vive aqui
    return _cred

def _precisa_renovar(c):
    if not c.token:
        return True
    if not c.expiry:
        return not c.valid
    falta = (c.expiry - datetime.now(timezone.utc).replace(tzinfo=None)).total_seconds()
    return falta < 120          # renova 2 min antes de vencer

def _token_drive():
    """Token de acesso válido. O refresh é protegido por lock; a leitura é barata."""
    c = _credencial()
    if _precisa_renovar(c):
        with _cred_lock:
            if _precisa_renovar(c):        # outra thread pode ter renovado enquanto esperávamos
                from google.auth.transport.requests import Request as GRequest
                c.refresh(GRequest())
    return c.token

def _drive_get(caminho, params=None, binario=False, tentativas=3):
    """GET na API do Drive. Conexão nova a cada chamada = seguro entre threads."""
    url = DRIVE_API + caminho
    if params:
        url += "?" + urllib.parse.urlencode(params)
    ultimo = None
    for n in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={
                "Authorization": "Bearer " + _token_drive(),
                "Accept-Encoding": "identity",
            })
            with urllib.request.urlopen(req, timeout=30) as r:
                dados = r.read()
                tipo = r.headers.get("Content-Type", "")
            return (dados, tipo) if binario else json.loads(dados)
        except urllib.error.HTTPError as e:
            corpo = e.read().decode("utf-8", "ignore")[:300]
            if e.code in (401, 403, 404):
                raise HTTPException(status_code=e.code, detail="Drive: " + corpo)
            ultimo = e
        except (ImportError, ValueError) as e:
            # dependência faltando ou JSON da credencial inválido: retentar não adianta
            raise HTTPException(status_code=500,
                detail="Credencial do Drive inválida ou dependência ausente: %r" % (e,))
        except Exception as e:                      # timeout, conexão caída, etc.
            ultimo = e
        time.sleep(0.4 * (n + 1))
    raise HTTPException(status_code=502,
        detail="Falha ao falar com o Google Drive: %r" % (ultimo,))

# ============================================================
#  O BANCO DE DADOS MORA NO GOOGLE DRIVE
#
#  O disco do Render (plano free) é EFÊMERO: some a cada deploy e a cada
#  hibernação. O SQLite ali era uma ilusão de persistência — por isso a
#  segunda máquina encontrava o servidor vazio.
#  Agora a verdade fica num arquivo JSON no Drive. O SQLite continua como
#  cache local (rápido), mas quem manda é o Drive.
#
#  Variáveis: FT_DRIVE_DB_PASTA (opcional; padrão = FT_DRIVE_PASTA)
# ============================================================
DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3"
FT_DRIVE_DB_PASTA = os.environ.get("FT_DRIVE_DB_PASTA", "").strip()
DB_NOME = "fourtime-banco.json"

_db_drive_id = None
_db_lock = threading.Lock()
_rev_memoria = {"rev": None}   # espelho da revisão: deixa /api/db/rev ser instantâneo

def _pasta_do_banco():
    return FT_DRIVE_DB_PASTA or FT_DRIVE_PASTA

def drive_ligado():
    return bool(FT_DRIVE_CREDENCIAIS and _pasta_do_banco())

def _drive_post(caminho, params, corpo, tipo):
    url = DRIVE_UPLOAD + caminho + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, data=corpo, method=params.pop("_metodo", "POST"))
    req.add_header("Authorization", "Bearer " + _token_drive())
    req.add_header("Content-Type", tipo)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def _acha_arquivo_banco():
    """Procura o fourtime-banco.json na pasta. Guarda o id."""
    global _db_drive_id
    if _db_drive_id:
        return _db_drive_id
    q = ("'%s' in parents and name = '%s' and trashed = false"
         % (_pasta_do_banco(), DB_NOME))
    r = _drive_get("/files", {"q": q, "fields": "files(id,name)",
                              "includeItemsFromAllDrives": "true",
                              "supportsAllDrives": "true"})
    arqs = r.get("files", [])
    _db_drive_id = arqs[0]["id"] if arqs else None
    return _db_drive_id

def le_banco_drive():
    """Devolve {rev, data, atualizado} ou None se ainda não existe."""
    fid = _acha_arquivo_banco()
    if not fid:
        return None
    dados, _ = _drive_get("/files/" + fid, {"alt": "media", "supportsAllDrives": "true"},
                          binario=True)
    bruto = (dados or b"").strip()
    if not bruto:
        # arquivo semente vazio: ainda não tem banco, mas já existe para a
        # service account escrever dentro (ela não pode CRIAR, só EDITAR)
        return {"rev": 0, "data": {}, "atualizado": ""}
    try:
        d = json.loads(bruto)
    except Exception:
        raise HTTPException(status_code=502,
            detail="O arquivo do banco no Drive está corrompido. Restaure uma versão anterior "
                   "pelo histórico do Google Drive (botão direito no arquivo → Gerenciar versões).")
    if not isinstance(d, dict):
        raise HTTPException(status_code=502, detail="O arquivo do banco no Drive tem formato inesperado.")
    if "data" not in d:
        return {"rev": 0, "data": {}, "atualizado": ""}
    return d

def grava_banco_drive(rev, data):
    global _db_drive_id
    # OS USUARIOS VAO JUNTO, e nao dentro de "data" (v3.307).
    # "data" e o banco que o navegador recebe inteiro; os usuarios ficam
    # IRMAOS dele, no topo do arquivo, e por isso nunca saem daqui. Sem esta
    # linha, a primeira gravacao do banco apagaria a lista de gente.
    pacote = {"rev": rev, "data": data, "atualizado": agora()}
    us = _usuarios_para_gravar()
    if us is not None:
        pacote["usuarios"] = us
    corpo = json.dumps(pacote, ensure_ascii=False).encode("utf-8")
    fid = _acha_arquivo_banco()
    if fid:
        # atualiza o conteúdo (o Drive guarda o histórico de versões — dá para restaurar)
        url = DRIVE_UPLOAD + "/files/" + fid + "?uploadType=media&supportsAllDrives=true"
        req = urllib.request.Request(url, data=corpo, method="PATCH")
        req.add_header("Authorization", "Bearer " + _token_drive())
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
        return fid

    # ainda não existe: cria (multipart = metadados + conteúdo)
    limite = "----ft-" + hashlib.sha1(os.urandom(8)).hexdigest()[:16]
    meta = json.dumps({"name": DB_NOME, "parents": [_pasta_do_banco()],
                       "mimeType": "application/json"}).encode()
    partes = (b"--" + limite.encode() + b"\r\n"
              b"Content-Type: application/json; charset=UTF-8\r\n\r\n" + meta + b"\r\n"
              b"--" + limite.encode() + b"\r\n"
              b"Content-Type: application/json\r\n\r\n" + corpo + b"\r\n"
              b"--" + limite.encode() + b"--")
    url = DRIVE_UPLOAD + "/files?uploadType=multipart&supportsAllDrives=true"
    req = urllib.request.Request(url, data=partes, method="POST")
    req.add_header("Authorization", "Bearer " + _token_drive())
    req.add_header("Content-Type", "multipart/related; boundary=" + limite)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            novo = json.loads(r.read())
    except urllib.error.HTTPError as e:
        corpo_erro = e.read().decode("utf-8", "ignore")[:400]
        if "storageQuotaExceeded" in corpo_erro or "quota" in corpo_erro.lower():
            # Limitação conhecida do Google: service accounts NÃO TÊM COTA própria.
            # Elas não conseguem CRIAR arquivos numa pasta de uma conta Gmail (o arquivo
            # ficaria com elas como donas, e elas têm 0 bytes). Mas conseguem EDITAR um
            # arquivo que já exista e pertença a você. A saída é você criar o arquivo.
            raise HTTPException(status_code=502, detail=(
                "A service account não pode CRIAR arquivos no Drive (contas de serviço não têm "
                "cota de armazenamento — é uma limitação do Google, não é permissão). "
                "SOLUÇÃO: crie você mesmo um arquivo chamado '%s' dentro da pasta do banco "
                "(pode ser um arquivo de texto vazio). Depois disso o servidor passa a atualizá-lo "
                "normalmente, porque EDITAR um arquivo que é seu ela pode." % DB_NOME))
        if e.code in (403, 404):
            raise HTTPException(status_code=502,
                detail="O Drive recusou a ESCRITA. A pasta precisa estar compartilhada com a "
                       "service account como EDITOR (não Leitor). " + corpo_erro)
        raise HTTPException(status_code=502, detail="Drive recusou: " + corpo_erro)
    _db_drive_id = novo.get("id")
    return _db_drive_id

def exige_drive():
    if not FT_DRIVE_CREDENCIAIS or not FT_DRIVE_PASTA:
        raise HTTPException(status_code=503,
            detail="Banco de Imagens não configurado no servidor (FT_DRIVE_CREDENCIAIS / FT_DRIVE_PASTA).")

def _pai(fid):
    with _cache_lock:
        if fid in _pais_cache:
            return _pais_cache[fid]
    meta = _drive_get("/files/" + fid, {"fields": "parents", "supportsAllDrives": "true"})
    pais = meta.get("parents") or []
    p = pais[0] if pais else None
    with _cache_lock:
        _pais_cache[fid] = p
    return p

def _dentro_da_raiz(fid, profundidade=12):
    """Sobe pela cadeia de pais até achar a pasta raiz. Impede acessar fora dela.
       Com cache: cada arquivo é verificado no Google uma única vez."""
    with _cache_lock:
        if fid in _raiz_cache:
            return _raiz_cache[fid]
    atual, ok = fid, False
    for _ in range(profundidade):
        if atual == FT_DRIVE_PASTA:
            ok = True
            break
        atual = _pai(atual)
        if not atual:
            break
    with _cache_lock:
        _raiz_cache[fid] = ok
    return ok

@app.get("/api/drive/status")
def drive_status(request: Request):
    exige_token(request)
    return {"ativo": bool(FT_DRIVE_CREDENCIAIS and FT_DRIVE_PASTA), "raiz": FT_DRIVE_PASTA}

@app.get("/api/drive/diagnostico")
def drive_diagnostico(request: Request):
    """Testa a corrente inteira e diz exatamente onde quebrou."""
    exige_token(request)
    passos = []
    def passo(nome, fn):
        try:
            passos.append({"passo": nome, "ok": True, "info": fn()})
            return True
        except Exception as e:
            passos.append({"passo": nome, "ok": False, "erro": repr(e)[:300]})
            return False

    if not passo("variaveis de ambiente", lambda: {
            "FT_DRIVE_CREDENCIAIS": "definida" if FT_DRIVE_CREDENCIAIS else "FALTANDO",
            "FT_DRIVE_PASTA": FT_DRIVE_PASTA or "FALTANDO"}):
        return {"passos": passos}
    if not FT_DRIVE_CREDENCIAIS or not FT_DRIVE_PASTA:
        return {"passos": passos, "conclusao": "Falta variável de ambiente no Render."}

    if not passo("bibliotecas (google-auth + requests)", lambda: (
            __import__("google.oauth2.service_account", fromlist=["x"]),
            __import__("google.auth.transport.requests", fromlist=["x"]),
            "instaladas")[-1]):
        return {"passos": passos, "conclusao": "Dependência ausente — confira o requirements.txt."}

    if not passo("ler credencial (JSON)", lambda: {
            "conta": json.loads(FT_DRIVE_CREDENCIAIS).get("client_email", "?")}):
        return {"passos": passos, "conclusao": "O JSON da service account está incompleto ou malformado."}

    if not passo("obter token do Google", lambda: "token obtido" if _token_drive() else "vazio"):
        return {"passos": passos, "conclusao": "Não consegui autenticar no Google."}

    if not passo("abrir a pasta raiz", lambda: _drive_get(
            "/files/" + FT_DRIVE_PASTA,
            {"fields": "id,name,mimeType", "supportsAllDrives": "true"})):
        return {"passos": passos, "conclusao":
                "A pasta não foi encontrada OU não foi compartilhada com o e-mail da service account."}

    passo("listar conteudo", lambda: {
        "itens": len(_drive_get("/files", {
            "q": "'%s' in parents and trashed = false" % FT_DRIVE_PASTA,
            "pageSize": "10", "fields": "files(id,name)",
            "includeItemsFromAllDrives": "true", "supportsAllDrives": "true",
        }).get("files", []))})
    return {"passos": passos, "conclusao": "Tudo certo."}

@app.get("/api/drive/listar")
def drive_listar(request: Request, pasta: str = "", busca: str = ""):
    """Lista subpastas e imagens. 'pasta' vazia = raiz. 'busca' procura em toda a árvore."""
    exige_token(request)
    exige_drive()
    alvo = pasta or FT_DRIVE_PASTA
    if pasta and not _dentro_da_raiz(pasta):
        raise HTTPException(status_code=403, detail="Pasta fora da raiz permitida.")

    termo = (busca or "").strip()
    if termo:
        seguro = termo.replace("\\", "").replace("'", "")
        q = "mimeType contains 'image/' and trashed = false and name contains '%s'" % seguro
    else:
        q = "'%s' in parents and trashed = false" % alvo

    itens, page = [], None
    while True:
        params = {
            "q": q, "pageSize": "200", "orderBy": "folder,name",
            "fields": "nextPageToken,files(id,name,mimeType,modifiedTime,size)",
            "includeItemsFromAllDrives": "true", "supportsAllDrives": "true",
        }
        if page:
            params["pageToken"] = page
        r = _drive_get("/files", params)
        itens.extend(r.get("files", []))
        page = r.get("nextPageToken")
        if not page or len(itens) >= 600:
            break

    # calculado UMA vez, fora do lock (chamar _dentro_da_raiz dentro do lock trava)
    alvo_valido = (alvo == FT_DRIVE_PASTA) or _dentro_da_raiz(alvo)

    pastas, imagens = [], []
    for f in itens:
        if f["mimeType"] == "application/vnd.google-apps.folder":
            if not termo:
                pastas.append({"id": f["id"], "nome": f["name"]})
                with _cache_lock:              # já sabemos que é filha de alvo
                    _pais_cache[f["id"]] = alvo
                    _raiz_cache[f["id"]] = alvo_valido
        elif f["mimeType"].startswith("image/"):
            imagens.append({
                "id": f["id"], "nome": f["name"], "tipo": f["mimeType"],
                "miniatura": "/api/drive/miniatura/" + f["id"],
                "atualizado": f.get("modifiedTime", ""),
                "tamanho": int(f.get("size") or 0),
            })
            if not termo:
                with _cache_lock:              # evita 1 chamada extra por miniatura
                    _pais_cache[f["id"]] = alvo
                    _raiz_cache[f["id"]] = alvo_valido

    caminho = []
    if not termo and alvo != FT_DRIVE_PASTA:
        atual = alvo
        for _ in range(12):
            meta = _drive_get("/files/" + atual, {"fields": "id,name,parents", "supportsAllDrives": "true"})
            caminho.insert(0, {"id": meta["id"], "nome": meta["name"]})
            pais = meta.get("parents") or []
            if not pais or pais[0] == FT_DRIVE_PASTA:
                break
            atual = pais[0]

    return {"pasta": alvo, "raiz": FT_DRIVE_PASTA, "caminho": caminho,
            "pastas": pastas, "imagens": imagens, "busca": termo}

# ============================================================
#  O CONTEUDO DE UM ID DO DRIVE NAO MUDA (v3.358)
#
#  A arte estava saindo com max-age=3600 e a miniatura com 86400. Uma
#  hora, um dia. Passado o prazo, a MESMA arte voltava a atravessar o
#  Render inteira, e a banda e cobrada por GB.
#
#  So que editar uma arte no Drive gera um id NOVO; o id que esta aqui
#  aponta para bytes que nunca mudam. Prazo curto ai nao era cautela,
#  era medo sem objeto.
#
#  Com `immutable` o navegador nem revalida: cada maquina baixa cada
#  arte uma vez na vida. E se algum dia um id precisar mesmo trocar de
#  conteudo, quem manda no cache e o id, entao basta o id novo.
# ============================================================
FT_CACHE_ETERNO = "public, max-age=31536000, immutable"

@app.get("/api/drive/miniatura/{fid}")
def drive_miniatura(fid: str, request: Request):
    """Miniatura leve, só para a grade do painel."""
    exige_token(request)
    exige_drive()
    if not _dentro_da_raiz(fid):
        raise HTTPException(status_code=403, detail="Arquivo fora da raiz permitida.")
    meta = _drive_get("/files/" + fid, {"fields": "thumbnailLink", "supportsAllDrives": "true"})
    link = meta.get("thumbnailLink")
    if link:
        link = link.replace("=s220", "=s400")
        for n in range(3):
            try:
                req = urllib.request.Request(link, headers={
                    "Authorization": "Bearer " + _token_drive()})
                with urllib.request.urlopen(req, timeout=25) as r:
                    dados = r.read()
                return Response(content=dados, media_type="image/jpeg",
                                headers={"Cache-Control": FT_CACHE_ETERNO})
            except Exception:
                time.sleep(0.4 * (n + 1))
    dados, tipo = _drive_get("/files/" + fid, {"alt": "media", "supportsAllDrives": "true"}, binario=True)
    return Response(content=dados, media_type=tipo or "image/jpeg",
                    headers={"Cache-Control": FT_CACHE_ETERNO})

@app.get("/api/drive/imagem/{fid}")
def drive_imagem(fid: str, request: Request):
    """Arquivo ORIGINAL, byte a byte, sem qualquer compressão ou conversão."""
    exige_token(request)
    exige_drive()
    if not _dentro_da_raiz(fid):
        raise HTTPException(status_code=403, detail="Arquivo fora da raiz permitida.")
    dados, tipo = _drive_get("/files/" + fid, {"alt": "media", "supportsAllDrives": "true"}, binario=True)
    return Response(content=dados, media_type=tipo or "image/jpeg",
                    headers={"Cache-Control": FT_CACHE_ETERNO})

# ============================================================
#  POWER-UP DO TRELLO — proxy dos anexos, com JWT
#
#  Ninguém da equipe autoriza nada. Quem baixa o anexo é o SERVIDOR,
#  com um token de serviço (FT_TRELLO_TOKEN).
#
#  Para isso não virar uma porta aberta na internet, cada chamada tem
#  de trazer um JWT ASSINADO PELO TRELLO com o segredo do nosso Power-Up
#  (FT_TRELLO_SECRET). O Trello só emite esse JWT para quem está mesmo
#  no quadro, através do Power-Up. O servidor confere a assinatura e usa
#  o ID DO CARTÃO que vem DENTRO do JWT — não o que o cliente mandou.
#  Assim ninguém consegue pedir anexo de outro cartão, nem forjar acesso.
#
#  Variáveis de ambiente:
#    FT_TRELLO_KEY     = API key do Power-Up (pública)
#    FT_TRELLO_SECRET  = segredo do Power-Up  (assina/verifica o JWT)
#    FT_TRELLO_TOKEN   = token de serviço que enxerga o quadro
#    FT_TRELLO_QUADRO  = (opcional) ID do quadro permitido
# ============================================================
import hmac, hashlib, base64

# .strip(): colar no Render costuma trazer espaço ou quebra de linha invisível,
# e um único caractere a mais faz a assinatura do JWT não bater.
FT_TRELLO_KEY    = os.environ.get("FT_TRELLO_KEY", "").strip()
FT_TRELLO_SECRET = os.environ.get("FT_TRELLO_SECRET", "").strip()
FT_TRELLO_TOKEN  = os.environ.get("FT_TRELLO_TOKEN", "").strip()
FT_TRELLO_QUADRO = os.environ.get("FT_TRELLO_QUADRO", "").strip()   # opcional

def _b64url_decode(txt: str) -> bytes:
    falta = "=" * (-len(txt) % 4)
    return base64.urlsafe_b64decode(txt + falta)

# ---------------- Chaves públicas do Trello ----------------
# O t.jwt() é assinado em RS256 com a chave PRIVADA do Trello (não com o nosso
# secret — isso foi uma premissa errada). Verificamos com a chave PÚBLICA que o
# Trello publica. O secret continua útil só para OAuth1, que não usamos aqui.
TRELLO_CHAVES_URL = "https://api.trello.com/1/resource/jwt-public-keys"
_chaves_cache = {"quando": 0, "chaves": []}
_chaves_lock = threading.Lock()

def _chaves_trello(forcar=False):
    """Baixa e guarda as chaves públicas por 12h. Aceita JWKS ou lista de PEM."""
    agora_s = time.time()
    with _chaves_lock:
        if not forcar and _chaves_cache["chaves"] and agora_s - _chaves_cache["quando"] < 43200:
            return _chaves_cache["chaves"]
    req = urllib.request.Request(TRELLO_CHAVES_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        bruto = json.loads(r.read())

    chaves = []
    def junta(v):
        if isinstance(v, str) and "BEGIN" in v:
            chaves.append({"tipo": "pem", "valor": v})
        elif isinstance(v, dict):
            if v.get("kty") == "RSA" and v.get("n"):
                chaves.append({"tipo": "jwk", "valor": v, "kid": v.get("kid")})
            else:
                for x in v.values():
                    junta(x)
        elif isinstance(v, list):
            for x in v:
                junta(x)
    junta(bruto)

    with _chaves_lock:
        _chaves_cache["chaves"] = chaves
        _chaves_cache["quando"] = agora_s
    return chaves

def _verifica_rs256(jwt: str, chave) -> dict:
    import jwt as pyjwt
    from jwt.algorithms import RSAAlgorithm
    if chave["tipo"] == "jwk":
        k = RSAAlgorithm.from_jwk(json.dumps(chave["valor"]))
    else:
        k = chave["valor"]
    return pyjwt.decode(
        jwt, k,
        algorithms=["RS256"],          # NUNCA aceitar o alg que vem no JWT: só RS256
        options={"verify_aud": False},
        leeway=60,
    )

def verifica_jwt(token: str) -> dict:
    """Confere a assinatura do Trello (RS256, chave pública) e devolve o conteúdo."""
    if not token or token.count(".") != 2:
        raise HTTPException(status_code=401, detail="JWT malformado.")
    try:
        cab = json.loads(_b64url_decode(token.split(".")[0]))
    except Exception:
        raise HTTPException(status_code=401, detail="Cabeçalho do JWT ilegível.")
    if cab.get("alg") != "RS256":
        raise HTTPException(status_code=401, detail="Algoritmo inesperado: %r" % cab.get("alg"))

    import jwt as pyjwt
    ultimo = None
    for tentativa in (False, True):                 # 2ª volta: força recarregar as chaves
        try:
            chaves = _chaves_trello(forcar=tentativa)
        except Exception as e:
            raise HTTPException(status_code=502,
                detail="Não consegui buscar as chaves públicas do Trello: %r" % (e,))
        kid = cab.get("kid")
        ordenadas = ([c for c in chaves if c.get("kid") == kid] or []) + chaves
        for c in ordenadas:
            try:
                dados = _verifica_rs256(token, c)
                if dados.get("iss") not in (None, "trello"):
                    raise HTTPException(status_code=401, detail="Emissor inesperado.")
                return dados
            except pyjwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="JWT expirado. Recarregue o Trello.")
            except HTTPException:
                raise
            except Exception as e:
                ultimo = e
        if not tentativa:
            continue
    raise HTTPException(status_code=401,
        detail="Assinatura do JWT não confere com nenhuma chave pública do Trello: %r" % (ultimo,))

def _do_jwt(dados: dict, *chaves):
    ctx = dados.get("context") or {}
    for c in chaves:
        if ctx.get(c):
            return ctx[c]
        if dados.get(c):
            return dados[c]
    return None

def exige_trello():
    faltando = [n for n, v in [("FT_TRELLO_KEY", FT_TRELLO_KEY),
                               ("FT_TRELLO_TOKEN", FT_TRELLO_TOKEN)] if not v]
    if faltando:
        raise HTTPException(status_code=503,
            detail="Faltam variáveis no servidor: " + ", ".join(faltando))

# ---------------- O cartão pertence mesmo ao quadro do JWT? ----------------
# O JWT do Trello NÃO diz de qual cartão veio — só o QUADRO e o MEMBRO. Então
# o cartão vem do cliente, e o servidor confere que ele é daquele quadro. Sem
# isso, qualquer pessoa de qualquer quadro poderia pedir qualquer anexo.
_cartao_cache = {}
_cartao_lock = threading.Lock()

def _quadro_do_cartao(card: str) -> str:
    with _cartao_lock:
        if card in _cartao_cache:
            return _cartao_cache[card]
    url = ("https://api.trello.com/1/cards/%s?fields=idBoard&key=%s&token=%s"
           % (urllib.parse.quote(card), urllib.parse.quote(FT_TRELLO_KEY),
              urllib.parse.quote(FT_TRELLO_TOKEN)))
    try:
        with urllib.request.urlopen(url, timeout=25) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=404 if e.code == 404 else 502,
            detail="Não consegui ler o cartão no Trello (%s)." % e.code)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Falha ao ler o cartão: %r" % (e,))
    q = d.get("idBoard", "")
    with _cartao_lock:
        _cartao_cache[card] = q
    return q

def _baixa_anexo(card: str, anexo: str, nome: str) -> bytes:
    url = ("https://api.trello.com/1/cards/%s/attachments/%s/download/%s"
           % (urllib.parse.quote(card), urllib.parse.quote(anexo),
              urllib.parse.quote(nome or "orcamento.html")))
    req = urllib.request.Request(url, headers={
        "Authorization": 'OAuth oauth_consumer_key="%s", oauth_token="%s"'
                         % (FT_TRELLO_KEY, FT_TRELLO_TOKEN),
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        corpo = e.read().decode("utf-8", "ignore")[:200]
        if e.code in (401, 403):
            raise HTTPException(status_code=502,
                detail="O token de serviço não tem acesso a este anexo. " + corpo)
        raise HTTPException(status_code=e.code, detail="Trello recusou: " + corpo)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Falha ao buscar o anexo: %r" % (e,))

@app.get("/api/trello/anexo")
def trello_anexo(request: Request, anexo: str, card: str = "", nome: str = "orcamento.html"):
    """Baixa um anexo. O JWT prova que quem pede está no quadro; o servidor
       confere que o cartão pedido é DAQUELE quadro antes de entregar."""
    exige_trello()
    token = request.headers.get("X-FT-JWT", "") or request.query_params.get("jwt", "")
    if not token:
        raise HTTPException(status_code=401, detail="Sem JWT do Trello.")
    dados = verifica_jwt(token)

    quadro_jwt = _do_jwt(dados, "idBoard", "board")
    if not quadro_jwt:
        raise HTTPException(status_code=401, detail="O JWT não diz de qual quadro veio.")
    if not card:
        raise HTTPException(status_code=400, detail="Faltou o cartão.")

    if _quadro_do_cartao(card) != quadro_jwt:
        raise HTTPException(status_code=403,
            detail="Este cartão não pertence ao quadro de onde o pedido veio.")

    if FT_TRELLO_QUADRO and quadro_jwt != FT_TRELLO_QUADRO:
        raise HTTPException(status_code=403, detail="Quadro não permitido.")

    dados_arq = _baixa_anexo(card, anexo, nome)
    return Response(content=dados_arq, media_type="text/html; charset=utf-8", headers={
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
    })

@app.get("/api/trello/diagnostico")
def trello_diagnostico(request: Request, jwt: str = "", card: str = ""):
    """Diz exatamente o que está faltando, sem expor nenhum segredo."""
    passos = []
    def passo(nome, ok, info=""):
        passos.append({"passo": nome, "ok": (None if ok is None else bool(ok)), "info": info})
        return ok

    passo("FT_TRELLO_KEY",   bool(FT_TRELLO_KEY),   "definida" if FT_TRELLO_KEY else "FALTANDO")
    passo("FT_TRELLO_TOKEN", bool(FT_TRELLO_TOKEN), "definido" if FT_TRELLO_TOKEN else "FALTANDO")
    passo("FT_TRELLO_SECRET", None,
          "não é usado: o t.jwt() do Trello é RS256, verificado com a CHAVE PÚBLICA dele")
    if not (FT_TRELLO_KEY and FT_TRELLO_TOKEN):
        return {"passos": passos, "conclusao": "Falta variável de ambiente no Render."}

    try:
        url = ("https://api.trello.com/1/members/me?key=%s&token=%s"
               % (urllib.parse.quote(FT_TRELLO_KEY), urllib.parse.quote(FT_TRELLO_TOKEN)))
        with urllib.request.urlopen(url, timeout=20) as r:
            eu = json.loads(r.read())
        passo("token de serviço vale", True, "conta: " + str(eu.get("username", "?")))
    except Exception as e:
        passo("token de serviço vale", False, repr(e)[:160])
        return {"passos": passos, "conclusao": "O FT_TRELLO_TOKEN não é aceito pelo Trello."}

    try:
        ch = _chaves_trello(forcar=True)
        passo("chaves públicas do Trello", bool(ch),
              {"quantas": len(ch), "tipos": sorted({c["tipo"] for c in ch})})
    except Exception as e:
        passo("chaves públicas do Trello", False, repr(e)[:160])
        return {"passos": passos, "conclusao": "Não consegui baixar as chaves públicas do Trello."}

    if not jwt:
        passo("JWT", None, "não enviado (mande ?jwt=... para testar de verdade)")
        return {"passos": passos, "conclusao": "Servidor pronto. Falta testar o JWT."}

    try:
        cab = json.loads(_b64url_decode(jwt.split(".")[0]))
        corpo = json.loads(_b64url_decode(jwt.split(".")[1]))
        passo("JWT recebido", True, {"algoritmo": cab.get("alg"), "kid": cab.get("kid"),
                                     "campos": sorted(corpo.keys())})
    except Exception as e:
        passo("JWT recebido", False, "não consegui decodificar: " + repr(e)[:120])
        return {"passos": passos, "conclusao": "O que chegou não parece um JWT."}

    try:
        d = verifica_jwt(jwt)
        passo("assinatura confere com a chave pública", True,
              {"quadro": _do_jwt(d, "idBoard", "board"),
               "membro": _do_jwt(d, "idMember", "member"),
               "powerup": _do_jwt(d, "idPlugin")})
    except HTTPException as e:
        passo("assinatura confere com a chave pública", False, str(e.detail))
        return {"passos": passos, "conclusao": "A assinatura do JWT não confere."}

    if card:
        try:
            q = _quadro_do_cartao(card)
            bate = (q == _do_jwt(d, "idBoard", "board"))
            passo("o cartão pertence ao quadro do JWT", bate, {"quadro_do_cartao": q})
            if not bate:
                return {"passos": passos, "conclusao": "O cartão não é do quadro de onde o pedido veio."}
        except HTTPException as e:
            passo("o cartão pertence ao quadro do JWT", False, str(e.detail))
            return {"passos": passos, "conclusao": "Não consegui ler o cartão."}

    return {"passos": passos, "conclusao": "Tudo certo."}

def _powerup(arquivo):
    p = os.path.join(os.path.dirname(__file__), "powerup", arquivo)
    if not os.path.exists(p):
        raise HTTPException(status_code=404, detail="Power-Up não encontrado: " + arquivo)
    tipos = {".html": "text/html", ".js": "application/javascript",
             ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml"}
    ext = os.path.splitext(arquivo)[1]
    return FileResponse(p, media_type=tipos.get(ext, "text/plain"))

@app.get("/powerup/{arquivo:path}")
def powerup(arquivo: str):
    if ".." in arquivo or arquivo.startswith("/"):
        raise HTTPException(status_code=400, detail="caminho inválido")
    return _powerup(arquivo)

# ------------- Editor online (opcional) -------------
import re as _re

def _editor_path():
    achados = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "*editor*.html")))
    return achados[-1] if achados else None

_versao_cache = {"quando": 0, "versao": "", "arquivo": ""}

def versao_publicada():
    """Lê a versão de dentro do editor mais novo que está na pasta.
       Assim, subir um editor novo JÁ atualiza o aviso — sem mexer em variável."""
    p = _editor_path()
    if not p:
        return {"versao": "", "arquivo": ""}
    marca = os.path.getmtime(p)
    if _versao_cache["quando"] == marca and _versao_cache["arquivo"] == p:
        return {"versao": _versao_cache["versao"], "arquivo": os.path.basename(p)}
    versao = ""
    try:
        # ARQUIVO INTEIRO, e não os primeiros 400 KB.
        #
        # A constante fica depois do CSS. Enquanto o CSS foi pequeno ela caía
        # dentro da janela; na v279 o módulo de layout empurrou o `const
        # FT_EDITOR` para o caractere 416.188 — fora dos 400.000 lidos. O
        # servidor passou a devolver versão VAZIA, e como o editor ignora
        # versão vazia, ninguém mais era avisado de publicação nova.
        # É 1 MB lido uma vez por deploy: o resultado fica no cache por mtime.
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            trecho = f.read()
        m = _re.search(r"const\s+FT_EDITOR\s*=\s*['\"]([0-9.]+)['\"]", trecho)
        if m:
            versao = m.group(1)
    except Exception:
        pass
    _versao_cache.update({"quando": marca, "versao": versao, "arquivo": p})
    return {"versao": versao, "arquivo": os.path.basename(p)}

@app.get("/api/versao")
def api_versao(request: Request):
    exige_token(request)
    v = versao_publicada()
    return {"editor": v["versao"], "arquivo": v["arquivo"], "minimo": FT_EDITOR_MINIMO}


@app.get("/api/versao-publica")
def api_versao_publica():
    """A versão publicada, SEM token.

    O aviso de versão nova viajava de carona na vigia do banco
    (/api/db/rev), que exige token e só roda com a sincronização ligada.
    Quem usava o editor sem estar logado NUNCA era avisado — e é justamente
    quem mais precisa, porque fica com o arquivo velho em cache.

    Só devolve o número da versão: não expõe nada. A página do editor já é
    pública, e a versão está escrita dentro dela."""
    v = versao_publicada()
    return {"editor": v["versao"], "minimo": FT_EDITOR_MINIMO}



# ============================================================
#  ORÇAMENTOS (.ft) NO GOOGLE DRIVE  (v152)
#
#  Estrutura automática de pastas dentro da pasta de orçamentos:
#      ANO  >  "ANO - MM - MÊS"      (ex.: 2026 > 2026 - 07 - JULHO)
#  O mês vem da DATA NO NOME do arquivo (DDMMAA, ex. 140726);
#  se o nome não tiver data, vale a data de hoje.
#
#  Variáveis de ambiente:
#    FT_DRIVE_ORCAMENTOS  = ID da pasta raiz de orçamentos (obrigatória)
#    FT_SCRIPT_ORCAMENTOS = URL do Apps Script (opcional — ver abaixo)
#
#  POR QUE O APPS SCRIPT EXISTE: service accounts NÃO TÊM cota de
#  armazenamento e o Google recusa que elas CRIEM arquivos no "Meu Drive"
#  de uma conta Gmail (storageQuotaExceeded) — foi a mesma limitação do
#  fourtime-banco.json. Elas LEEM e BUSCAM sem problema. Então:
#    - buscar/abrir  -> service account (rápido, já configurada)
#    - salvar        -> tenta a service account; se o Google recusar por
#                       cota, delega ao Apps Script (que roda como o DONO
#                       da conta e pode criar o que quiser)
# ============================================================
FT_DRIVE_ORCAMENTOS = os.environ.get("FT_DRIVE_ORCAMENTOS", "").strip()
# a pasta dos backups diários; fica de fora da navegação do "Abrir"
PASTA_BACKUP = "Backup do Database"
FT_SCRIPT_ORCAMENTOS = os.environ.get("FT_SCRIPT_ORCAMENTOS", "").strip()

# Dentro da pasta raiz de orçamentos existem DUAS subpastas:
#   - "Pasta de Trabalho"       -> rascunhos; salva direto, SEM ano/mês
#   - "Orçamentos Organizados"  -> arquivo final; cria ANO > MÊS pela data do nome
# Os nomes podem ser trocados por env, mas o padrão já casa com o combinado.
FT_PASTA_TRABALHO  = os.environ.get("FT_PASTA_TRABALHO",  "Pasta de Trabalho").strip()
FT_PASTA_ORGANIZADOS = os.environ.get("FT_PASTA_ORGANIZADOS", "Orçamentos Organizados").strip()
# Para onde vão os rascunhos depois que a versão final é arquivada em Organizados.
FT_PASTA_LIXEIRA = os.environ.get("FT_PASTA_LIXEIRA", "Lixeira da Área de Trabalho").strip()

MESES_FT = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
            "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]

_orc_arvore_cache = {}          # (fid) -> True/False: está dentro da pasta de orçamentos?
_orc_pastas_cache = {}          # "2026" ou "2026/2026 - 07 - JULHO" -> id da pasta

def exige_orcamentos():
    if not FT_DRIVE_CREDENCIAIS or not FT_DRIVE_ORCAMENTOS:
        raise HTTPException(status_code=503,
            detail="Orçamentos no Drive não configurados (FT_DRIVE_ORCAMENTOS no Render).")

def _orc_dia_mes_ano(nome):
    """Dia, mês e ano do nome do arquivo. Mesma leitura de _orc_ano_mes,
       devolvendo também o DIA — usado para a pasta de dia."""
    nome = nome or ""
    def _v(t):
        dd, mm, aa = int(t[0:2]), int(t[2:4]), int(t[4:6])
        return (dd, mm, 2000 + aa) if (1 <= mm <= 12 and 1 <= dd <= 31) else None
    m = re.search(r"(\d{6})(?:-v\d+)?\.ft$", nome, flags=re.I)
    if m:
        r = _v(m.group(1))
        if r:
            return r
    for t in reversed(re.findall(r"\d{6}", nome)):
        r = _v(t)
        if r:
            return r
    h = datetime.now(timezone.utc)
    return h.day, h.month, h.year


def _orc_ano_mes(nome):
    """Extrai DDMMAA do nome do arquivo (NOME-PEDIDO-DDMMAA.ft). Sem data -> hoje.

       A data fica no FIM do nome, logo antes do .ft — e é lá que procuramos.
       Antes a busca pegava a primeira sequência de 6 dígitos que aparecesse,
       o que quebrou quando o pedido virou PD00#### (v175): em
       "GOIAS-PD004113-150626.ft" ela achava "004113" do pedido em vez de
       "150626" da data, concluía que "41" não é mês e caía no mês de HOJE.
       Resultado: todo orçamento arquivado ia para a pasta do mês corrente,
       qualquer que fosse a data dele."""
    nome = nome or ""

    def _valida(txt):
        dd, mm, aa = int(txt[0:2]), int(txt[2:4]), int(txt[4:6])
        if 1 <= mm <= 12 and 1 <= dd <= 31:
            return 2000 + aa, mm
        return None

    # 1) a data no fim do nome, aceitando o sufixo de versão (-v2, -v3...)
    m = re.search(r"(\d{6})(?:-v\d+)?\.ft$", nome, flags=re.I)
    if m:
        r = _valida(m.group(1))
        if r:
            return r

    # 2) sem .ft no fim (ou nome fora do padrão): tenta a ÚLTIMA sequência de
    #    6 dígitos, que ainda é mais provável de ser a data que a primeira
    achados = re.findall(r"\d{6}", nome)
    for txt in reversed(achados):
        r = _valida(txt)
        if r:
            return r

    h = datetime.now(timezone.utc)
    return h.year, h.month

def _orc_nome_pasta_mes(ano, mes):
    return "%d - %02d - %s" % (ano, mes, MESES_FT[mes - 1])

def _drive_acha_pasta(nome, pai):
    q = ("'%s' in parents and name = '%s' and "
         "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
         % (pai, nome.replace("'", "\\'")))
    r = _drive_get("/files", {"q": q, "fields": "files(id,name)", "pageSize": "5",
                              "includeItemsFromAllDrives": "true",
                              "supportsAllDrives": "true"})
    arqs = r.get("files", [])
    return arqs[0]["id"] if arqs else None

def _drive_cria_pasta(nome, pai):
    meta = json.dumps({"name": nome, "parents": [pai],
                       "mimeType": "application/vnd.google-apps.folder"}).encode()
    url = DRIVE_API + "/files?supportsAllDrives=true"
    req = urllib.request.Request(url, data=meta, method="POST")
    req.add_header("Authorization", "Bearer " + _token_drive())
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["id"]

def _orc_subpasta_raiz(nome):
    """Acha (ou cria) uma subpasta direta da raiz de orçamentos. Cacheada."""
    chave = "@raiz/" + nome
    if chave in _orc_pastas_cache:
        return _orc_pastas_cache[chave]
    pid = _drive_acha_pasta(nome, FT_DRIVE_ORCAMENTOS)
    if not pid:
        pid = _drive_cria_pasta(nome, FT_DRIVE_ORCAMENTOS)
    _orc_pastas_cache[chave] = pid
    return pid

# Nível de pasta por DIA dentro do mês. Pode ser desligado no Render com
# FT_PASTA_DIA=0, e aí volta a ser só ANO > MÊS.
FT_PASTA_DIA = (os.environ.get("FT_PASTA_DIA", "1").strip().lower()
                not in ("0", "nao", "não", "false", "off"))


def _orc_nome_pasta_dia(dia):
    return "DIA %02d" % dia


def _orc_pasta_destino(ano, mes, dia=None):
    """Acha (ou cria) 'Orçamentos Organizados' > ANO > 'ANO - MM - MÊS' > 'DIA NN'.
       O dia vem da data de CRIAÇÃO do orçamento (a que está no nome do
       arquivo), não do dia em que ele está sendo arquivado.
       Devolve (id, 'caminho legível')."""
    raiz_org = _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)
    nome_ano, nome_mes = str(ano), _orc_nome_pasta_mes(ano, mes)

    chave_ano = FT_PASTA_ORGANIZADOS + "/" + nome_ano
    pid_ano = _orc_pastas_cache.get(chave_ano) or _drive_acha_pasta(nome_ano, raiz_org)
    if not pid_ano:
        pid_ano = _drive_cria_pasta(nome_ano, raiz_org)
    _orc_pastas_cache[chave_ano] = pid_ano

    chave_mes = chave_ano + "/" + nome_mes
    pid_mes = _orc_pastas_cache.get(chave_mes) or _drive_acha_pasta(nome_mes, pid_ano)
    if not pid_mes:
        pid_mes = _drive_cria_pasta(nome_mes, pid_ano)
    _orc_pastas_cache[chave_mes] = pid_mes

    caminho = nome_ano + "/" + nome_mes
    if not FT_PASTA_DIA or not dia:
        return pid_mes, caminho

    nome_dia = _orc_nome_pasta_dia(dia)
    chave_dia = chave_mes + "/" + nome_dia
    pid_dia = _orc_pastas_cache.get(chave_dia) or _drive_acha_pasta(nome_dia, pid_mes)
    if not pid_dia:
        pid_dia = _drive_cria_pasta(nome_dia, pid_mes)
    _orc_pastas_cache[chave_dia] = pid_dia
    return pid_dia, caminho + "/" + nome_dia

def _orc_acha_arquivo(nome, pasta):
    q = ("'%s' in parents and name = '%s' and trashed = false"
         % (pasta, nome.replace("'", "\\'")))
    r = _drive_get("/files", {"q": q, "fields": "files(id,name)", "pageSize": "3",
                              "includeItemsFromAllDrives": "true",
                              "supportsAllDrives": "true"})
    arqs = r.get("files", [])
    return arqs[0]["id"] if arqs else None

def _orc_sobe_arquivo(nome, pasta_id, corpo):
    """Atualiza se já existe (isso a service account PODE); senão cria."""
    fid = _orc_acha_arquivo(nome, pasta_id)
    if fid:
        url = DRIVE_UPLOAD + "/files/" + fid + "?uploadType=media&supportsAllDrives=true"
        req = urllib.request.Request(url, data=corpo, method="PATCH")
        req.add_header("Authorization", "Bearer " + _token_drive())
        req.add_header("Content-Type", "application/octet-stream")
        with urllib.request.urlopen(req, timeout=120) as r:
            r.read()
        return fid, "atualizado"
    limite = "----ft-" + hashlib.sha1(os.urandom(8)).hexdigest()[:16]
    meta = json.dumps({"name": nome, "parents": [pasta_id]}).encode()
    partes = (b"--" + limite.encode() + b"\r\n"
              b"Content-Type: application/json; charset=UTF-8\r\n\r\n" + meta + b"\r\n"
              b"--" + limite.encode() + b"\r\n"
              b"Content-Type: application/octet-stream\r\n\r\n" + corpo + b"\r\n"
              b"--" + limite.encode() + b"--")
    url = DRIVE_UPLOAD + "/files?uploadType=multipart&supportsAllDrives=true"
    req = urllib.request.Request(url, data=partes, method="POST")
    req.add_header("Authorization", "Bearer " + _token_drive())
    req.add_header("Content-Type", "multipart/related; boundary=" + limite)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())["id"], "criado"

def _script_post(dados, timeout=120):
    """Fala com o Apps Script, que roda COMO DONO da conta (a service account
       não tem cota: não cria arquivo nem pasta, e às vezes não move/renomeia).
       Todo pedido leva o token e os nomes das pastas."""
    if not FT_SCRIPT_ORCAMENTOS:
        raise HTTPException(status_code=502, detail=(
            "Falta configurar FT_SCRIPT_ORCAMENTOS no Render (URL do Apps Script)."))
    dados = dict(dados)
    dados.setdefault("token", FT_TOKEN)
    dados.setdefault("pastaTrabalho", FT_PASTA_TRABALHO)
    dados.setdefault("pastaOrganizados", FT_PASTA_ORGANIZADOS)
    dados.setdefault("pastaLixeira", FT_PASTA_LIXEIRA)
    corpo = json.dumps(dados).encode("utf-8")
    req = urllib.request.Request(FT_SCRIPT_ORCAMENTOS, data=corpo, method="POST")
    req.add_header("Content-Type", "text/plain; charset=utf-8")   # evita preflight do Apps Script
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read())
    if not d.get("ok"):
        raise HTTPException(status_code=502, detail="Apps Script recusou: %s" % d.get("erro", "?"))
    return d


def _orc_salva_via_script(nome, destino, ano, mes, conteudo_texto, dia=None,
                          pasta_trabalho=None):
    """Plano B da GRAVAÇÃO: o Apps Script cria as pastas e o arquivo."""
    dados = {"acao": "salvar", "nome": nome, "conteudo": conteudo_texto, "destino": destino}
    if destino == "organizado":
        dados["ano"] = str(ano)
        dados["mesPasta"] = _orc_nome_pasta_mes(ano, mes)
        if FT_PASTA_DIA and dia:
            dados["diaPasta"] = _orc_nome_pasta_dia(dia)
    return _script_post(dados).get("id", "")


# ---------------- gravar/renomear/mover um arquivo JÁ existente ----------------

def _orc_grava_por_id(fid, corpo):
    """Sobrescreve o conteúdo de um arquivo pelo ID. A service account PODE
       fazer isso (o que ela não pode é CRIAR). É o que resolve a duplicação:
       o arquivo é o mesmo, não importa se o nome mudou de data."""
    url = DRIVE_UPLOAD + "/files/" + fid + "?uploadType=media&supportsAllDrives=true"
    req = urllib.request.Request(url, data=corpo, method="PATCH")
    req.add_header("Authorization", "Bearer " + _token_drive())
    req.add_header("Content-Type", "application/octet-stream")
    with urllib.request.urlopen(req, timeout=120) as r:
        r.read()
    return fid


def _orc_renomeia(fid, novo_nome):
    """Renomeia; se a service account não puder, o Apps Script renomeia."""
    try:
        meta = json.dumps({"name": novo_nome}).encode()
        url = DRIVE_API + "/files/" + fid + "?supportsAllDrives=true"
        req = urllib.request.Request(url, data=meta, method="PATCH")
        req.add_header("Authorization", "Bearer " + _token_drive())
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        return "service-account"
    except Exception:
        _script_post({"acao": "renomear", "id": fid, "nome": novo_nome})
        return "apps-script"


def _orc_move(fid, destino_id):
    """Move um arquivo para outra pasta; com o Apps Script como plano B."""
    try:
        pai_atual = _pai(fid) or ""
        url = (DRIVE_API + "/files/" + fid + "?supportsAllDrives=true"
               + "&addParents=" + destino_id
               + ("&removeParents=" + pai_atual if pai_atual else ""))
        req = urllib.request.Request(url, data=b"{}", method="PATCH")
        req.add_header("Authorization", "Bearer " + _token_drive())
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        _orc_arvore_cache.pop(fid, None)          # a árvore mudou
        return "service-account"
    except Exception:
        _script_post({"acao": "mover", "id": fid, "pastaDestino": FT_PASTA_LIXEIRA})
        _orc_arvore_cache.pop(fid, None)
        return "apps-script"


# ---------------- versões (-v2, -v3 …) e rascunhos do mesmo orçamento ----------------

def _orc_lista_ft(pasta_id, limite=200):
    """Todos os .ft de uma pasta (id + nome)."""
    r = _drive_get("/files", {
        "q": "'%s' in parents and trashed = false" % pasta_id,
        "orderBy": "name", "pageSize": str(limite),
        "fields": "files(id,name,modifiedTime,size)",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"})
    return [f for f in r.get("files", []) if f.get("name", "").lower().endswith(".ft")]


def _orc_base_e_versao(nome):
    """'CLIENTE-PD004886-210726-v3.ft' -> ('CLIENTE-PD004886-210726', 3).
       Sem sufixo, a versão é 1 (o arquivo original)."""
    base = re.sub(r"\.ft$", "", nome, flags=re.I)
    m = re.search(r"-v(\d+)$", base, flags=re.I)
    if m:
        return base[:m.start()], int(m.group(1))
    return base, 1


def _orc_proxima_versao(nome, pasta_id):
    """Nome da PRÓXIMA versão dentro da pasta.

       A cópia carrega a MESMA data do original — a data de criação nunca muda.
       O que a distingue é só o sufixo: o arquivo sem sufixo conta como v1,
       então a primeira cópia nasce -v2, a seguinte -v3, e assim por diante."""
    base, _ = _orc_base_e_versao(nome)
    maior = 0
    for f in _orc_lista_ft(pasta_id):
        b, v = _orc_base_e_versao(f["name"])
        if b.upper() == base.upper():
            maior = max(maior, v)
    return "%s-v%d.ft" % (base, (maior or 1) + 1)

def _orc_dentro(fid, profundidade=8):
    """O arquivo está dentro da pasta de orçamentos? (sobe pelos pais, com cache)"""
    if fid in _orc_arvore_cache:
        return _orc_arvore_cache[fid]
    atual, ok = fid, False
    for _ in range(profundidade):
        if atual == FT_DRIVE_ORCAMENTOS:
            ok = True
            break
        atual = _pai(atual)
        if not atual:
            break
    _orc_arvore_cache[fid] = ok
    return ok

@app.post("/api/ft/salvar")
async def ft_salvar(request: Request):
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")
    nome = (corpo.get("nome") or "").strip()
    conteudo = corpo.get("conteudo")
    if not nome or conteudo is None:
        raise HTTPException(status_code=400, detail="Campos 'nome' e 'conteudo' são obrigatórios.")
    if not nome.lower().endswith(".ft"):
        nome += ".ft"
    nome = re.sub(r'[\\/:*?"<>|]+', "-", nome)
    texto = json.dumps(conteudo, ensure_ascii=False, indent=1)

    # destino: "trabalho" (rascunho, direto) | "organizado" (ano/mês pela data)
    destino = (corpo.get("destino") or "trabalho").strip().lower()
    if destino != "organizado":
        destino = "trabalho"
    ano = mes = dia = None
    if destino == "organizado":
        dia, mes, ano = _orc_dia_mes_ano(nome)
        caminho = "%d/%s" % (ano, _orc_nome_pasta_mes(ano, mes))
        if FT_PASTA_DIA:
            caminho += "/" + _orc_nome_pasta_dia(dia)
    else:
        caminho = FT_PASTA_TRABALHO

    # --------- como gravar (v175) ---------
    # drive_id  -> sobrescreve ESTE arquivo, mesmo que o nome tenha mudado de
    #              data. É o que acaba com as cópias duplicadas.
    # renomear  -> junto com drive_id, atualiza o nome do arquivo no Drive.
    # nova_versao -> ignora o drive_id e cria "-v2", "-v3"... ao lado.
    drive_id = (corpo.get("driveId") or "").strip()
    if drive_id and not re.fullmatch(r"[A-Za-z0-9_-]{10,}", drive_id):
        drive_id = ""
    renomear = bool(corpo.get("renomear"))
    nova_versao = bool(corpo.get("novaVersao"))

    def _pasta_destino():
        if destino == "organizado":
            pid, _cam = _orc_pasta_destino(ano, mes, dia)
            return pid
        return _orc_subpasta_raiz(FT_PASTA_TRABALHO)

    # 1) SOBRESCREVER um arquivo conhecido (não depende do nome nem da data).
    #    Só vale se ele estiver NA PASTA DE DESTINO. Sem essa checagem, um
    #    rascunho aberto da Pasta de Trabalho seria sobrescrito lá mesmo ao
    #    "arquivar em Organizados" — e o definitivo nunca nasceria.
    if drive_id and not nova_versao:
        if not _orc_dentro(drive_id):
            raise HTTPException(status_code=403, detail="Arquivo fora da pasta de orçamentos.")
        # Basta estar DENTRO do destino (em qualquer nível). Antes eu comparava
        # com a pasta exata do mês — então, virado o mês, o mesmo orçamento não
        # "batia" e nascia uma cópia na pasta nova. Agora ele é gravado onde já
        # mora, mantendo nome e lugar. O que a checagem ainda impede é o caso
        # certo: arquivar em Organizados um arquivo que está na Pasta de
        # Trabalho não pode sobrescrever o rascunho — ali o definitivo nasce.
        try:
            dentro = _sob_pasta(drive_id, _orc_raiz_destino(destino))
        except Exception:
            dentro = False
        if not dentro:
            drive_id = ""            # cai para o fluxo de criação, na pasta certa
    if drive_id and not nova_versao:
        _orc_grava_por_id(drive_id, texto.encode("utf-8"))
        nome_final = nome
        via_nome = ""
        if renomear:
            try:
                via_nome = _orc_renomeia(drive_id, nome)
            except Exception:
                nome_final = ""      # não deu para renomear: o conteúdo já foi salvo
        return {"ok": True, "id": drive_id, "pasta": caminho, "acao": "atualizado",
                "destino": destino, "nome": nome_final, "via": "service-account",
                "renomeado": bool(renomear and nome_final), "viaNome": via_nome}

    # 2) NOVA VERSÃO: descobre o próximo -vN livre na pasta
    if nova_versao:
        try:
            nome = _orc_proxima_versao(nome, _pasta_destino())
        except Exception:
            pass                     # sem conseguir ler a pasta, segue com o nome pedido

    # 3) CRIAR/atualizar por nome (fluxo de sempre)
    # Tenta pela service account (achar/criar a pasta E subir o arquivo).
    # QUALQUER passo pode falhar por falta de cota — criar a subpasta, criar
    # ano/mês, ou criar o arquivo. Em todos esses casos delegamos ao Apps
    # Script, que roda como DONO e cria pastas + arquivo sem limite.
    def _via_service_account():
        return _orc_sobe_arquivo(nome, _pasta_destino(), texto.encode("utf-8"))

    try:
        fid, acao = _via_service_account()
        return {"ok": True, "id": fid, "pasta": caminho, "acao": acao,
                "destino": destino, "nome": nome, "via": "service-account"}
    except urllib.error.HTTPError as e:
        erro = e.read().decode("utf-8", "ignore")[:400]
        # cota OU qualquer recusa da service account -> tenta pelo Apps Script
        if FT_SCRIPT_ORCAMENTOS:
            try:
                fid = _orc_salva_via_script(nome, destino, ano, mes, texto, dia)
                return {"ok": True, "id": fid, "pasta": caminho, "acao": "criado",
                        "destino": destino, "nome": nome, "via": "apps-script"}
            except Exception as e2:
                raise HTTPException(status_code=502,
                    detail="Drive recusou e o Apps Script também: %s" % str(e2)[:300])
        raise HTTPException(status_code=502, detail="Drive recusou a gravação: " + erro)
    except Exception as e:
        # erro que não é HTTPError (ex.: falha ao criar a subpasta) -> Apps Script
        if FT_SCRIPT_ORCAMENTOS:
            try:
                fid = _orc_salva_via_script(nome, destino, ano, mes, texto, dia)
                return {"ok": True, "id": fid, "pasta": caminho, "acao": "criado",
                        "destino": destino, "nome": nome, "via": "apps-script"}
            except Exception as e2:
                raise HTTPException(status_code=502,
                    detail="Falha na service account e no Apps Script: %s" % str(e2)[:300])
        raise HTTPException(status_code=500, detail="Erro ao salvar: %s" % str(e)[:300])

def _nome_pasta(fid):
    """Nome de uma pasta pelo id, com cache (a busca repete muito os mesmos)."""
    chave = "@nome/" + fid
    if chave in _orc_pastas_cache:
        return _orc_pastas_cache[chave]
    try:
        nome = _drive_get("/files/" + fid,
                          {"fields": "name", "supportsAllDrives": "true"}).get("name", "")
    except Exception:
        nome = ""
    _orc_pastas_cache[chave] = nome
    return nome


def _caminho_do_arquivo(fid, prof=6):
    """Onde este arquivo mora, em texto curto: 'Organizados › 2026 › JULHO'.
       Sobe pelos pais até a raiz de orçamentos e devolve o trecho de dentro
       dela — na busca é o que responde 'de que pasta é este arquivo?'."""
    partes = []
    atual = fid
    for _ in range(prof):
        p = _pai(atual)
        if not p or p == FT_DRIVE_ORCAMENTOS:
            break
        partes.append(_nome_pasta(p))
        atual = p
    partes = [x for x in reversed(partes) if x]
    if not partes:
        return ""
    # encurta o nome comprido da subpasta raiz para caber na coluna
    partes[0] = (partes[0].replace("Orçamentos Organizados", "Organizados")
                          .replace("Lixeira da Área de Trabalho", "Lixeira"))
    # a pasta do mês já traz o ano no nome ("2026 - 07 - JULHO"): evita repetir
    if len(partes) == 3 and partes[1] and partes[2].startswith(partes[1]):
        partes = [partes[0], partes[2]]
    return " › ".join(partes)


@app.get("/api/ft/buscar")
def ft_buscar(request: Request, q: str = "", pasta: str = ""):
    """Busca de orçamentos, com ESCOPO.

       Sem 'pasta' -> procura em toda a raiz de orçamentos.
       Com 'pasta' -> só dentro dela (em qualquer nível abaixo).

       Isso importa porque as três subpastas convivem na mesma raiz: buscando
       dentro de "Orçamentos Organizados", vinham junto arquivos da Pasta de
       Trabalho e até da Lixeira. Agora quem está numa pasta busca ali dentro."""
    exige_token(request)
    exige_orcamentos()
    q = (q or "").strip()
    pasta = (pasta or "").strip()
    if pasta and not re.fullmatch(r"[A-Za-z0-9_-]{10,}", pasta):
        raise HTTPException(status_code=400, detail="ID de pasta inválido.")

    filtro = ("trashed = false and mimeType != 'application/vnd.google-apps.folder'"
              " and name contains '.ft'")
    if q:
        filtro += " and name contains '%s'" % q.replace("'", "\\'")
    # a consulta traz mais do que o necessário porque o recorte por pasta é
    # feito aqui embaixo (o Drive só filtra pelo pai DIRETO, e as pastas de
    # orçamentos têm níveis: Organizados > ANO > MÊS)
    r = _drive_get("/files", {
        "q": filtro, "orderBy": "modifiedTime desc", "pageSize": "120",
        "fields": "files(id,name,modifiedTime,size,parents)",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"})
    itens = []
    for f in r.get("files", []):
        if not f["name"].lower().endswith(".ft"):
            continue
        if pasta:
            if not _sob_pasta(f["id"], pasta):
                continue    # está fora da pasta em que o usuário está navegando
        elif not _orc_dentro(f["id"]):
            continue        # a service account enxerga outras pastas: só valem os orçamentos
        itens.append({"id": f["id"], "nome": f["name"],
                      "modificado": f.get("modifiedTime", ""),
                      "tamanho": int(f.get("size") or 0),
                      "pasta": _caminho_do_arquivo(f["id"])})
        if len(itens) >= 30:
            break
    itens.sort(key=lambda a: a["modificado"], reverse=True)   # mais recentes primeiro
    return {"ok": True, "itens": itens, "escopo": pasta or "raiz"}


@app.get("/api/ft/listar")
def ft_listar(request: Request, pasta: str = ""):
    """Navegação por pastas. Sem 'pasta' -> raiz de orçamentos.
       Devolve subpastas e arquivos .ft daquele nível, já ordenados."""
    exige_token(request)
    exige_orcamentos()
    pai = (pasta or "").strip() or FT_DRIVE_ORCAMENTOS
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", pai):
        raise HTTPException(status_code=400, detail="ID de pasta inválido.")
    # trava de segurança: a pasta pedida tem de estar dentro da raiz de orçamentos
    if pai != FT_DRIVE_ORCAMENTOS and not _orc_dentro(pai):
        raise HTTPException(status_code=403, detail="Pasta fora dos orçamentos.")
    r = _drive_get("/files", {
        "q": "'%s' in parents and trashed = false" % pai,
        "orderBy": "folder,name desc,modifiedTime desc", "pageSize": "200",
        "fields": "files(id,name,mimeType,modifiedTime,size)",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"})
    pastas, arquivos = [], []
    for f in r.get("files", []):
        if f.get("mimeType") == "application/vnd.google-apps.folder":
            # pastas de SERVIÇO: o editor escreve nelas, mas elas não aparecem
            # em Abrir nem na caixa lateral — não guardam orçamentos, e listá-las
            # só atrapalha quem está procurando um pedido
            if f["name"] in (FT_PASTA_RELATORIOS, PASTA_BACKUP):
                continue
            pastas.append({"id": f["id"], "nome": f["name"]})
        elif f["name"].lower().endswith(".ft"):
            arquivos.append({"id": f["id"], "nome": f["name"],
                             "modificado": f.get("modifiedTime", ""),
                             "tamanho": int(f.get("size") or 0)})
    # pastas de ANO/MÊS: as mais recentes primeiro (nome decrescente)
    pastas.sort(key=lambda p: p["nome"], reverse=True)
    # arquivos: os mais recentes primeiro — procura-se um orçamento por
    # "o que eu mexi ontem", muito mais do que pela letra inicial
    arquivos.sort(key=lambda a: a["modificado"], reverse=True)
    return {"ok": True, "pastas": pastas, "arquivos": arquivos, "raiz": pai == FT_DRIVE_ORCAMENTOS}


@app.get("/api/ft/abrir/{fid}")
def ft_abrir(fid: str, request: Request):
    exige_token(request)
    exige_orcamentos()
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", fid):
        raise HTTPException(status_code=400, detail="ID inválido.")
    if not _orc_dentro(fid):
        raise HTTPException(status_code=403, detail="Arquivo fora da pasta de orçamentos.")
    meta = _drive_get("/files/" + fid, {"fields": "id,name", "supportsAllDrives": "true"})
    dados, _tipo = _drive_get("/files/" + fid,
                              {"alt": "media", "supportsAllDrives": "true"}, binario=True)
    try:
        doc = json.loads(dados.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=502, detail="O arquivo no Drive não é um .ft válido.")
    # em qual pasta este arquivo mora? o editor precisa saber para decidir se
    # "salvar por cima" grava no lugar certo (ou se tem de criar noutra pasta)
    # A pergunta certa é "está DENTRO de Organizados?", e não "o pai é a Pasta
    # de Trabalho?". Antes, qualquer coisa fora da raiz da Trabalho — uma
    # subpasta dela, a Lixeira — era dada como organizada, e o editor então
    # aceitava a data do nome como se fosse de arquivamento.
    onde = ""
    try:
        if _sob_pasta(fid, _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)):
            onde = "organizado"
        elif _pai(fid):
            onde = "trabalho"
    except Exception:
        onde = ""
    return {"ok": True, "nome": meta.get("name", ""), "conteudo": doc, "destino": onde}



@app.get("/api/ft/rascunhos")
def ft_rascunhos(request: Request, pedido: str = "", base: str = "", exceto: str = ""):
    """Rascunhos do MESMO orçamento que estão na Pasta de Trabalho.
       Casamos pelo número do pedido (o mais confiável) e, na falta dele,
       pelo começo do nome do documento. Serve para a limpeza pós-arquivamento
       — que só acontece depois de o usuário confirmar a lista."""
    exige_token(request)
    exige_orcamentos()
    pedido = (pedido or "").strip().upper()
    base = (base or "").strip().upper()
    if not pedido and not base:
        return {"ok": True, "itens": []}
    try:
        pasta = _orc_subpasta_raiz(FT_PASTA_TRABALHO)
    except Exception:
        return {"ok": True, "itens": []}          # a pasta ainda nem existe
    itens = []
    for f in _orc_lista_ft(pasta):
        nome = f.get("name", "")
        alvo = nome.upper()
        casa = (pedido and pedido in alvo) or (base and alvo.startswith(base + "-"))
        if not casa or f["id"] == exceto:
            continue
        itens.append({"id": f["id"], "nome": nome,
                      "modificado": f.get("modifiedTime", ""),
                      "tamanho": int(f.get("size") or 0)})
    itens.sort(key=lambda a: a["modificado"], reverse=True)
    return {"ok": True, "itens": itens, "pasta": FT_PASTA_TRABALHO}


@app.post("/api/ft/lixeira")
async def ft_lixeira(request: Request):
    """Move os rascunhos indicados para a 'Lixeira da Área de Trabalho'.
       Nada é apagado: só muda de pasta, dá para voltar atrás pelo Drive."""
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")
    ids = [str(i).strip() for i in (corpo.get("ids") or []) if str(i).strip()]
    ids = [i for i in ids if re.fullmatch(r"[A-Za-z0-9_-]{10,}", i)]
    if not ids:
        return {"ok": True, "movidos": 0, "itens": []}
    if len(ids) > 60:
        raise HTTPException(status_code=400, detail="Muitos arquivos de uma vez.")
    try:
        destino_id = _orc_subpasta_raiz(FT_PASTA_LIXEIRA)
    except Exception:
        destino_id = None          # a service account não cria pasta: o Apps Script cria

    movidos, falhas = [], []
    for fid in ids:
        try:
            if not _orc_dentro(fid):
                falhas.append({"id": fid, "erro": "fora dos orçamentos"})
                continue
            if destino_id:
                _orc_move(fid, destino_id)
            else:
                _script_post({"acao": "mover", "id": fid, "pastaDestino": FT_PASTA_LIXEIRA})
                _orc_arvore_cache.pop(fid, None)
            movidos.append(fid)
        except Exception as e:
            falhas.append({"id": fid, "erro": str(e)[:160]})
    return {"ok": True, "movidos": len(movidos), "itens": movidos,
            "falhas": falhas, "pasta": FT_PASTA_LIXEIRA}


def _sob_pasta(fid, raiz_id, prof=8):
    """O arquivo está DENTRO desta pasta (em qualquer nível)?"""
    atual = fid
    for _ in range(prof):
        p = _pai(atual)
        if not p:
            return False
        if p == raiz_id:
            return True
        atual = p
    return False


def _orc_raiz_destino(destino):
    return _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS if destino == "organizado" else FT_PASTA_TRABALHO)


@app.get("/api/ft/existente")
def ft_existente(request: Request, pedido: str = "", base: str = "", destino: str = "trabalho"):
    """Procura, DENTRO do destino, um orçamento que já seja deste mesmo pedido.

       Por que pelo pedido e não pelo ID do arquivo: o vínculo por ID se perde
       quando o navegador é reaberto, quando o .ft vem do computador ou quando
       o mês vira (a pasta de destino muda). O número do pedido é o que
       identifica o orçamento de verdade — e não muda com a data.
       A busca varre a subpasta inteira, então acha mesmo que o arquivo esteja
       num mês anterior."""
    exige_token(request)
    exige_orcamentos()
    pedido = (pedido or "").strip().upper()
    base = (base or "").strip().upper()
    destino = "organizado" if destino == "organizado" else "trabalho"
    chave = pedido or base
    if not chave:
        return {"ok": True, "itens": []}
    try:
        raiz = _orc_raiz_destino(destino)
    except Exception:
        return {"ok": True, "itens": []}

    filtro = ("name contains '%s' and trashed = false and "
              "mimeType != 'application/vnd.google-apps.folder'") % chave.replace("'", "")
    try:
        r = _drive_get("/files", {
            "q": filtro, "orderBy": "modifiedTime desc", "pageSize": "40",
            "fields": "files(id,name,modifiedTime,size,parents)",
            "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"})
    except Exception:
        return {"ok": True, "itens": []}

    itens = []
    for f in r.get("files", []):
        nome = f.get("name", "")
        if not nome.lower().endswith(".ft"):
            continue
        if pedido and pedido not in nome.upper():
            continue
        if not _sob_pasta(f["id"], raiz):
            continue
        itens.append({"id": f["id"], "nome": nome,
                      "modificado": f.get("modifiedTime", ""),
                      "tamanho": int(f.get("size") or 0)})
    itens.sort(key=lambda a: a["modificado"], reverse=True)
    return {"ok": True, "itens": itens[:10], "destino": destino}


@app.post("/api/ft/excluir")
async def ft_excluir(request: Request):
    """Manda o arquivo para a LIXEIRA do Google Drive (não apaga de vez).
       Dá para recuperar pelo próprio Drive por 30 dias — numa ação destrutiva
       acionada por um clique, essa rede vale muito."""
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido.")
    fid = (corpo.get("id") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", fid):
        raise HTTPException(status_code=400, detail="ID inválido.")
    if not _orc_dentro(fid):
        raise HTTPException(status_code=403, detail="Arquivo fora da pasta de orçamentos.")
    nome = ""
    try:
        nome = _drive_get("/files/" + fid, {"fields": "name", "supportsAllDrives": "true"}).get("name", "")
    except Exception:
        pass
    try:
        meta = json.dumps({"trashed": True}).encode()
        url = DRIVE_API + "/files/" + fid + "?supportsAllDrives=true"
        req = urllib.request.Request(url, data=meta, method="PATCH")
        req.add_header("Authorization", "Bearer " + _token_drive())
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        via = "service-account"
    except Exception:
        _script_post({"acao": "lixeira", "id": fid})
        via = "apps-script"
    with _cache_lock:
        _pais_cache.pop(fid, None)
    return {"ok": True, "id": fid, "nome": nome, "via": via}


@app.post("/api/ft/organizar-dias")
async def ft_organizar_dias(request: Request):
    """Distribui em pastas de DIA os orçamentos que estão soltos numa pasta de mês.

       Serve para acertar o que já existe: até agora os arquivos ficavam todos
       juntos dentro do mês. Cada um vai para a pasta do DIA que está no próprio
       nome — a data de criação, a mesma regra que vale daqui para frente.

       Sem 'mes' no corpo, arruma o MÊS ATUAL. Nada é apagado: os arquivos só
       mudam de pasta, e quem não tem data legível fica onde está.
       Com 'simular': só devolve o que faria, sem mover nada."""
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    simular = bool(corpo.get("simular"))

    h = datetime.now(timezone.utc)
    ano = int(corpo.get("ano") or h.year)
    mes = int(corpo.get("mes") or h.month)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido.")

    # a pasta do mês, sem criar o nível do dia ainda
    try:
        raiz_org = _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)
        nome_ano, nome_mes = str(ano), _orc_nome_pasta_mes(ano, mes)
        pid_ano = _drive_acha_pasta(nome_ano, raiz_org)
        pid_mes = _drive_acha_pasta(nome_mes, pid_ano) if pid_ano else None
    except Exception as e:
        raise HTTPException(status_code=502, detail="Não consegui abrir a pasta do mês: %s" % str(e)[:200])
    if not pid_mes:
        return {"ok": True, "mes": nome_mes, "movidos": 0, "itens": [],
                "aviso": "A pasta %s ainda não existe." % nome_mes}

    plano, sem_data = [], []
    for f in _orc_lista_ft(pid_mes, limite=400):
        dia, m2, a2 = _orc_dia_mes_ano(f["name"])
        # só move o que pertence a este mês; nome sem data legível fica parado
        if (m2, a2) != (mes, ano):
            sem_data.append(f["name"])
            continue
        plano.append({"id": f["id"], "nome": f["name"], "dia": dia,
                      "pasta": _orc_nome_pasta_dia(dia)})
    plano.sort(key=lambda x: (x["dia"], x["nome"].upper()))

    if simular:
        return {"ok": True, "mes": nome_mes, "simulacao": True,
                "movidos": 0, "aMover": len(plano), "itens": plano,
                "semData": sem_data}

    movidos, falhas = 0, []
    cache_dia = {}
    for it in plano:
        try:
            pid_dia = cache_dia.get(it["dia"])
            if not pid_dia:
                pid_dia = _drive_acha_pasta(it["pasta"], pid_mes) or _drive_cria_pasta(it["pasta"], pid_mes)
                cache_dia[it["dia"]] = pid_dia
            _orc_move(it["id"], pid_dia)
            movidos += 1
        except Exception as e:
            falhas.append({"nome": it["nome"], "erro": str(e)[:160]})
    _orc_pastas_cache.clear()          # a árvore mudou: o cache de pastas envelheceu
    return {"ok": True, "mes": nome_mes, "movidos": movidos,
            "itens": plano, "falhas": falhas, "semData": sem_data}


def _orc_subpastas(pai_id, limite=200):
    """Subpastas diretas de uma pasta (id + nome)."""
    r = _drive_get("/files", {
        "q": ("'%s' in parents and trashed = false and "
              "mimeType = 'application/vnd.google-apps.folder'") % pai_id,
        "orderBy": "name desc", "pageSize": str(limite),
        "fields": "files(id,name)",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"})
    return r.get("files", [])


def _orc_dia_mais_recente_com_arquivos(voltar_meses=6):
    """Procura a pasta de DIA mais recente que tenha orçamentos dentro.

       Começa no mês de hoje e caminha para trás. Em cada mês olha as pastas
       de dia da mais recente para a mais antiga, e devolve a primeira que
       tiver arquivo. É assim que a lista lateral tem o que mostrar mesmo num
       documento novo, que ainda não veio do Drive.

       Anda por MÊS e não dia a dia de propósito: listar as subpastas de um
       mês é uma consulta só, enquanto tentar 60 dias seriam 60 consultas."""
    try:
        raiz_org = _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)
    except Exception:
        return None
    h = datetime.now(timezone.utc)
    ano, mes = h.year, h.month
    for _ in range(max(1, voltar_meses)):
        nome_ano, nome_mes = str(ano), _orc_nome_pasta_mes(ano, mes)
        pid_ano = _drive_acha_pasta(nome_ano, raiz_org)
        pid_mes = _drive_acha_pasta(nome_mes, pid_ano) if pid_ano else None
        if pid_mes:
            dias = [p for p in _orc_subpastas(pid_mes) if p["name"].upper().startswith("DIA ")]
            dias.sort(key=lambda p: p["name"], reverse=True)      # do dia mais alto para o mais baixo
            for dpasta in dias:
                arqs = _orc_lista_ft(dpasta["id"], limite=60)
                if arqs:
                    return {"id": dpasta["id"],
                            "caminho": "%s / %s / %s" % (nome_ano, nome_mes, dpasta["name"]),
                            "itens": arqs}
            # mês sem pasta de dia: os arquivos podem estar soltos nele
            arqs = _orc_lista_ft(pid_mes, limite=60)
            if arqs:
                return {"id": pid_mes, "caminho": "%s / %s" % (nome_ano, nome_mes), "itens": arqs}
        mes -= 1
        if mes == 0:
            mes, ano = 12, ano - 1
    return None


def _caminho_da_pasta(pasta_id, prof=6):
    """Caminho legível de uma pasta, a partir da raiz de orçamentos."""
    if not pasta_id or pasta_id == FT_DRIVE_ORCAMENTOS:
        return "Orçamentos"
    partes, atual = [_nome_pasta(pasta_id)], pasta_id
    for _ in range(prof):
        p = _pai(atual)
        if not p or p == FT_DRIVE_ORCAMENTOS:
            break
        partes.append(_nome_pasta(p))
        atual = p
    partes = [x for x in reversed(partes) if x]
    if partes:
        partes[0] = (partes[0].replace("Orçamentos Organizados", "Organizados")
                              .replace("Lixeira da Área de Trabalho", "Lixeira"))
    return " / ".join(partes) or "Orçamentos"


def _conteudo_da_pasta(pasta_id):
    """Subpastas e orçamentos de uma pasta, já ordenados."""
    r = _drive_get("/files", {
        "q": "'%s' in parents and trashed = false" % pasta_id,
        "orderBy": "folder,name desc", "pageSize": "200",
        "fields": "files(id,name,mimeType,modifiedTime,size)",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"})
    pastas, arquivos = [], []
    for f in r.get("files", []):
        if f.get("mimeType") == "application/vnd.google-apps.folder":
            # pastas de SERVIÇO: o editor escreve nelas, mas elas não aparecem
            # em Abrir nem na caixa lateral — não guardam orçamentos, e listá-las
            # só atrapalha quem está procurando um pedido
            if f["name"] in (FT_PASTA_RELATORIOS, PASTA_BACKUP):
                continue
            pastas.append({"id": f["id"], "nome": f["name"]})
        elif f["name"].lower().endswith(".ft"):
            arquivos.append({"id": f["id"], "nome": f["name"],
                             "modificado": f.get("modifiedTime", ""),
                             "tamanho": int(f.get("size") or 0)})
    pastas.sort(key=lambda p: p["nome"], reverse=True)      # mais recente em cima
    arquivos.sort(key=lambda a: a["modificado"], reverse=True)
    return pastas, arquivos


@app.get("/api/ft/vizinhos")
def ft_vizinhos(request: Request, fid: str = "", pasta: str = ""):
    """O conteúdo de uma pasta de orçamentos, para a lista lateral.

       'pasta': navega para essa pasta (é assim que se anda para frente e
                para trás na caixa).
       'fid'  : sem 'pasta', abre a pasta onde mora aquele arquivo.
       nenhum : a pasta de dia mais recente que tenha arquivos, para que a
                lista sirva também num documento novo.

       Devolve também o 'paiId' — a pasta de cima — que é o caminho de volta.
       Ele vem vazio na raiz, e aí a caixa esconde o botão de voltar."""
    exige_token(request)
    exige_orcamentos()
    fid = (fid or "").strip()
    pasta = (pasta or "").strip()
    pasta_id, caminho = None, ""

    if pasta:
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", pasta):
            raise HTTPException(status_code=400, detail="ID de pasta inválido.")
        if pasta != FT_DRIVE_ORCAMENTOS and not _orc_dentro(pasta):
            raise HTTPException(status_code=403, detail="Pasta fora dos orçamentos.")
        pasta_id = pasta
    elif fid:
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", fid):
            raise HTTPException(status_code=400, detail="ID inválido.")
        if not _orc_dentro(fid):
            raise HTTPException(status_code=403, detail="Arquivo fora da pasta de orçamentos.")
        pasta_id = _pai(fid)

    pastas, itens = [], []
    if pasta_id:
        pastas, itens = _conteudo_da_pasta(pasta_id)
        caminho = _caminho_da_pasta(pasta_id)

    # nada aberto (ou pasta vazia sem subpastas): cai no dia mais recente com arquivos
    if not pasta and not pastas and not itens:
        achado = _orc_dia_mais_recente_com_arquivos()
        if achado:
            pasta_id = achado["id"]
            pastas, itens = _conteudo_da_pasta(pasta_id)
            caminho = _caminho_da_pasta(pasta_id)

    if not pasta_id:                       # nem isso: mostra a raiz
        pasta_id = FT_DRIVE_ORCAMENTOS
        pastas, itens = _conteudo_da_pasta(pasta_id)
        caminho = "Orçamentos"

    pai = "" if pasta_id == FT_DRIVE_ORCAMENTOS else (_pai(pasta_id) or "")
    return {"ok": True, "pasta": caminho, "pastaId": pasta_id,
            "paiId": pai, "raiz": pasta_id == FT_DRIVE_ORCAMENTOS,
            "pastas": pastas, "itens": itens}


def _dataDoISO_py(iso):
    """'2026-07-15T10:00:00Z' -> '150726'. Vazio se não der para ler."""
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except Exception:
        return ""
    return "%02d%02d%02d" % (d.day, d.month, d.year % 100)


def _orc_base_sem_data(nome):
    """Tira a extensão, a data e o sufixo de versão, deixando CLIENTE-PEDIDO.
       'SALUTE-PD004101-150726-v2.ft' -> ('SALUTE-PD004101', '-v2')"""
    base = re.sub(r"\.ft$", "", nome or "", flags=re.I)
    sufixo = ""
    m = re.search(r"(-v\d+)$", base, flags=re.I)
    if m:
        sufixo = m.group(1)
        base = base[:m.start()]
    base = re.sub(r"-\d{6}$", "", base)      # a data, se houver
    return base, sufixo


def _orc_normaliza_pedido(base):
    """Põe o número do pedido no padrão PD00####.

       Os orçamentos antigos usavam o número solto ('YASMIM-4052'); hoje o
       editor grava 'YASMIM-PD004052'. Como a busca por um pedido já
       arquivado é feita por esse número, um arquivo no formato velho não é
       encontrado e acabaria duplicado.

       Só mexe quando o trecho final é claramente um número de pedido: de 3 a
       6 dígitos, sozinho depois do último hífen. Nome sem número nenhum fica
       intacto — não há o que adivinhar."""
    m = re.match(r"^(.*)-(\d{3,6})$", base)
    if not m:
        return base
    cliente, num = m.group(1), m.group(2)
    if len(num) == 6:
        return base                        # já pode ser um PD sem o prefixo
    return "%s-PD%06d" % (cliente, int(num))


def _orc_dia_da_pasta(nome_pasta):
    """'DIA 20' -> 20. Zero se não for uma pasta de dia."""
    m = re.match(r"^DIA\s+(\d{1,2})$", (nome_pasta or "").strip(), flags=re.I)
    return int(m.group(1)) if m else 0


@app.post("/api/ft/padronizar-mes")
async def ft_padronizar_mes(request: Request):
    """Padroniza um mês de Orçamentos Organizados: nomes no formato certo,
       coerentes com a pasta onde cada arquivo está.

       A PASTA MANDA. Se um arquivo está em 'DIA 20', o nome dele passa a
       terminar em 20 daquele mês — mesmo que hoje diga 30. Isso porque a
       arrumação das pastas foi feita à mão e é ela que reflete a realidade;
       o nome é que ficou para trás durante as mudanças de regra.

       Também acerta o número do pedido: '4052' vira 'PD004052'. Sem isso um
       arquivo antigo não é encontrado ao salvar por cima, e vira duplicata.

       Arquivo solto no mês (fora de qualquer pasta de dia) não tem pasta em
       que se apoiar: para esse, e só para esse, vale a data do último
       salvamento, e ele é levado para a pasta daquele dia.

       Com 'simular', devolve só o plano."""
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    simular = bool(corpo.get("simular"))

    h = datetime.now(timezone.utc)
    ano = int(corpo.get("ano") or h.year)
    mes = int(corpo.get("mes") or h.month)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido.")

    try:
        raiz_org = _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)
        nome_ano, nome_mes = str(ano), _orc_nome_pasta_mes(ano, mes)
        pid_ano = _drive_acha_pasta(nome_ano, raiz_org)
        pid_mes = _drive_acha_pasta(nome_mes, pid_ano) if pid_ano else None
    except Exception as e:
        raise HTTPException(status_code=502, detail="Não consegui abrir a pasta do mês: %s" % str(e)[:200])
    if not pid_mes:
        return {"ok": True, "mes": nome_mes, "aMudar": 0, "itens": [],
                "aviso": "A pasta %s ainda não existe." % nome_mes}

    alvos = []
    for f in _orc_lista_ft(pid_mes, limite=400):
        alvos.append((f, "", 0))                       # solto: sem dia de apoio
    for sub in _orc_subpastas(pid_mes):
        dia = _orc_dia_da_pasta(sub["name"])
        for f in _orc_lista_ft(sub["id"], limite=400):
            alvos.append((f, sub["name"], dia))

    plano, parados = [], []
    for f, onde, dia_pasta in alvos:
        if dia_pasta:
            dia = dia_pasta                            # a pasta manda
            dt = "%02d%02d%02d" % (dia, mes, ano % 100)
            motivo = "pasta"
        else:
            dt = _dataDoISO_py(f.get("modifiedTime", ""))
            if not dt:
                parados.append(f["name"])
                continue
            dia = int(dt[0:2])
            motivo = "último salvamento"
        base, sufixo = _orc_base_sem_data(f["name"])
        base = _orc_normaliza_pedido(base)
        nome_novo = "%s-%s%s.ft" % (base, dt, sufixo)
        pasta_nova = _orc_nome_pasta_dia(dia)
        if f["name"] == nome_novo and onde == pasta_nova:
            continue
        plano.append({"id": f["id"], "de": f["name"], "para": nome_novo,
                      "ondeEstava": onde or "(solto no mês)",
                      "pasta": pasta_nova, "dia": dia, "porque": motivo,
                      "renomeia": f["name"] != nome_novo,
                      "move": onde != pasta_nova})
    plano.sort(key=lambda x: (x["dia"], x["para"].upper()))

    if simular:
        return {"ok": True, "mes": nome_mes, "simulacao": True,
                "aMudar": len(plano), "itens": plano, "parados": parados,
                "total": len(alvos)}

    feitos, falhas = 0, []
    cache_dia = {}
    for it in plano:
        try:
            if it["renomeia"]:
                _orc_renomeia(it["id"], it["para"])
            if it["move"]:
                pid_dia = cache_dia.get(it["dia"])
                if not pid_dia:
                    pid_dia = (_drive_acha_pasta(it["pasta"], pid_mes)
                               or _drive_cria_pasta(it["pasta"], pid_mes))
                    cache_dia[it["dia"]] = pid_dia
                _orc_move(it["id"], pid_dia)
            feitos += 1
        except Exception as e:
            falhas.append({"nome": it["de"], "erro": str(e)[:160]})
    _orc_pastas_cache.clear()
    return {"ok": True, "mes": nome_mes, "feitos": feitos,
            "itens": plano, "falhas": falhas, "parados": parados}

# --- Relatórios -----------------------------------------------------------
# A tag do módulo Design que marca sublimação. Tudo o que não a tem cai em
# "personalizado" — é a divisão que o relatório usa nas colunas.
FT_TAG_SUBLI = "subli"


def _rel_numero(x):
    """'1.234,50' ou '1234.5' -> float. Campo vazio vira zero."""
    s = str(x or "").strip()
    if not s:
        return 0.0
    s = s.replace(".", "").replace(",", ".") if "," in s else s
    try:
        return float(s)
    except Exception:
        return 0.0


def _rel_do_conteudo(c):
    """Peças e valor de um orçamento, separados em sublimação x personalizado.

       Um LAYOUT inteiro cai de um lado só: se tiver a tag de sublimação no
       Design, tudo dele é sublimação; senão, tudo é personalizado. A técnica
       é do layout, não da peça.

       Devolve também os layouts MISTOS — os que têm a tag de sublimação junto
       com outra (DTF, patch, silk, bordado, etiqueta). Pela regra eles entram
       inteiros em sublimação, mas parte do trabalho ali é de outra técnica:
       o relatório marca esses valores em vermelho para que a conta não passe
       por exata sem ser."""
    sp = sv = pp = pv = 0.0
    mistos = []
    for l in (c.get("layouts") or []):
        tags = {str(t.get("tag", "")).strip()
                for t in (l.get("design") or []) if str(t.get("tag", "")).strip()}
        baixas = {t.lower() for t in tags}
        pcs = val = 0.0
        for _tam, g in (l.get("tamanhos") or {}).items():
            q = _rel_numero((g or {}).get("q"))
            u = _rel_numero((g or {}).get("u"))
            pcs += q
            val += q * u
        if FT_TAG_SUBLI in baixas:
            sp += pcs; sv += val
            if len(tags) > 1:
                mistos.append({"ref": str(l.get("ref") or "").strip(),
                               "tags": sorted(tags),
                               "pecas": int(pcs), "valor": round(val, 2)})
        else:
            pp += pcs; pv += val
    return sp, sv, pp, pv, mistos


def _rel_cliente_pedido(nome_arq, header):
    """Cliente e pedido. O nome do arquivo manda (é o que foi padronizado);
       o cabeçalho do documento entra como reserva."""
    base = re.sub(r"\.ft$", "", nome_arq or "", flags=re.I)
    base = re.sub(r"-v\d+$", "", base)
    base = re.sub(r"-\d{6}$", "", base)
    m = re.search(r"(PD\d{6})", base)
    ped = m.group(1) if m else str((header or {}).get("pedido") or "").strip()
    cli = base.replace("-" + ped, "").strip(" -") if m else base
    if not cli:
        cli = str((header or {}).get("cliente") or "").strip()
    return cli, ped


def _rel_fontes(ano, mes, dia):
    """As pastas a percorrer e os arquivos que há nelas. Só listagem: não abre
       nenhum arquivo, por isso é rápido."""
    raiz_org = _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)
    nome_ano, nome_mes = str(ano), _orc_nome_pasta_mes(ano, mes)
    pid_ano = _drive_acha_pasta(nome_ano, raiz_org)
    pid_mes = _drive_acha_pasta(nome_mes, pid_ano) if pid_ano else None
    if not pid_mes:
        return None, []
    achados = []
    for sub in _orc_subpastas(pid_mes):
        d = _orc_dia_da_pasta(sub["name"])
        if d and (not dia or d == dia):
            for f in _orc_lista_ft(sub["id"], limite=400):
                achados.append({"id": f["id"], "nome": f["name"], "dia": d,
                                "mod": f.get("modifiedTime") or ""})
    if not dia:
        for f in _orc_lista_ft(pid_mes, limite=400):
            achados.append({"id": f["id"], "nome": f["name"],
                            "dia": _orc_dia_mes_ano(f["name"])[0],
                            "mod": f.get("modifiedTime") or ""})
    return pid_mes, achados


@app.get("/api/ft/relatorio-lista")
def ft_relatorio_lista(request: Request, ano: int = 0, mes: int = 0, dia: int = 0):
    """Só QUAIS arquivos entram no relatório, sem abrir nenhum.

       É o primeiro passo do carregamento em lotes: com esta lista o editor
       sabe quantos são e pode mostrar um progresso verdadeiro, em vez de um
       'aguarde' sem fim."""
    exige_pode(request, "relatorio")   # v3.307: vendedor nao ve relatorio
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    h = datetime.now(timezone.utc)
    ano = int(ano or h.year); mes = int(mes or h.month)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido.")
    try:
        _pid, achados = _rel_fontes(ano, mes, dia)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Não consegui abrir a pasta: %s" % str(e)[:200])
    return {"ok": True, "ano": ano, "mes": mes, "dia": dia,
            "mesNome": _orc_nome_pasta_mes(ano, mes),
            "total": len(achados), "arquivos": achados}


@app.post("/api/ft/relatorio-lote")
async def ft_relatorio_lote(request: Request):
    """Lê um punhado de orçamentos e devolve as linhas deles.

       O editor chama isto várias vezes, um lote de cada vez, e vai somando —
       assim a barra de progresso anda de verdade a cada resposta."""
    exige_pode(request, "relatorio")   # v3.307: vendedor nao ve relatorio
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    pedidos = corpo.get("arquivos") or []
    if not isinstance(pedidos, list) or len(pedidos) > 40:
        raise HTTPException(status_code=400, detail="Lote inválido.")
    itens, falhas = [], []
    for a in pedidos:
        fid = str((a or {}).get("id") or "")
        nome = str((a or {}).get("nome") or "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", fid):
            continue
        try:
            bruto, _ = _drive_get("/files/" + fid,
                                  {"alt": "media", "supportsAllDrives": "true"},
                                  binario=True)
            c = json.loads(bruto.decode("utf-8"))
        except Exception as e:
            falhas.append({"nome": nome, "erro": str(e)[:120]})
            continue
        header = c.get("header") or {}
        cli, ped = _rel_cliente_pedido(nome, header)
        sp, sv, pp, pv, mistos = _rel_do_conteudo(c)
        itens.append({
            "id": fid, "arquivo": nome, "mistos": mistos,
            "dia": int((a or {}).get("dia") or _orc_dia_mes_ano(nome)[0]),
            "cliente": cli, "pedido": ped,
            "vendedor": str(header.get("vendedor") or "").strip(),
            "subPecas": int(sp), "subValor": round(sv, 2),
            "perPecas": int(pp), "perValor": round(pv, 2),
        })
    return {"ok": True, "itens": itens, "falhas": falhas}


@app.get("/api/ft/relatorio")
def ft_relatorio(request: Request, ano: int = 0, mes: int = 0, dia: int = 0):
    """Os pedidos arquivados num período, já somados por técnica.

       Sem 'dia', é o mês inteiro. A leitura é feita aqui e não no navegador
       porque são dezenas de arquivos: uma resposta em vez de dezenas de
       viagens."""
    exige_pode(request, "relatorio")   # v3.307: vendedor nao ve relatorio
    exige_token(request)
    exige_editor_atual(request)          # relatório é coisa de administrador
    exige_orcamentos()

    h = datetime.now(timezone.utc)
    ano = int(ano or h.year)
    mes = int(mes or h.month)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido.")
    if dia and not (1 <= dia <= 31):
        raise HTTPException(status_code=400, detail="Dia inválido.")

    try:
        raiz_org = _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)
        nome_ano, nome_mes = str(ano), _orc_nome_pasta_mes(ano, mes)
        pid_ano = _drive_acha_pasta(nome_ano, raiz_org)
        pid_mes = _drive_acha_pasta(nome_mes, pid_ano) if pid_ano else None
    except Exception as e:
        raise HTTPException(status_code=502, detail="Não consegui abrir a pasta: %s" % str(e)[:200])
    if not pid_mes:
        return {"ok": True, "ano": ano, "mes": mes, "dia": dia,
                "mesNome": _orc_nome_pasta_mes(ano, mes), "itens": [],
                "aviso": "Nenhum orçamento arquivado neste mês."}

    # que pastas ler: um dia só, ou o mês inteiro (mais os soltos nele)
    fontes = []
    for sub in _orc_subpastas(pid_mes):
        d = _orc_dia_da_pasta(sub["name"])
        if d and (not dia or d == dia):
            fontes.append((d, sub["id"]))
    if not dia:
        fontes.append((0, pid_mes))       # o que estiver solto no mês

    itens, falhas = [], []
    for d, pid in fontes:
        for f in _orc_lista_ft(pid, limite=400):
            try:
                bruto, _ = _drive_get("/files/" + f["id"],
                                      {"alt": "media", "supportsAllDrives": "true"},
                                      binario=True)
                c = json.loads(bruto.decode("utf-8"))
            except Exception as e:
                falhas.append({"nome": f["name"], "erro": str(e)[:120]})
                continue
            header = c.get("header") or {}
            cli, ped = _rel_cliente_pedido(f["name"], header)
            sp, sv, pp, pv, mistos = _rel_do_conteudo(c)
            itens.append({
                "id": f["id"], "arquivo": f["name"], "mistos": mistos,
                "dia": d or _orc_dia_mes_ano(f["name"])[0],
                "cliente": cli, "pedido": ped,
                "vendedor": str(header.get("vendedor") or "").strip(),
                "subPecas": int(sp), "subValor": round(sv, 2),
                "perPecas": int(pp), "perValor": round(pv, 2),
            })
    itens.sort(key=lambda x: (x["dia"], x["cliente"].upper()))
    return {"ok": True, "ano": ano, "mes": mes, "dia": dia,
            "mesNome": _orc_nome_pasta_mes(ano, mes),
            "itens": itens, "falhas": falhas}


@app.get("/api/ft/relatorio-periodos")
def ft_relatorio_periodos(request: Request, ano: int = 0, mes: int = 0):
    """Que anos, meses e dias existem — para preencher os seletores sem chute."""
    exige_pode(request, "relatorio")   # v3.307: vendedor nao ve relatorio
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        raiz_org = _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)
    except Exception:
        return {"ok": True, "anos": [], "meses": [], "dias": []}
    anos = sorted((p["name"] for p in _orc_subpastas(raiz_org)
                   if re.fullmatch(r"\d{4}", p["name"])), reverse=True)
    meses, dias = [], []
    # Sem ano informado, assume o mais recente que existe.
    if not ano and anos:
        ano = int(anos[0])
    if ano:
        pid_ano = _drive_acha_pasta(str(ano), raiz_org)
        if pid_ano:
            for p in _orc_subpastas(pid_ano):
                m = re.match(r"^\d{4}\s*-\s*(\d{2})\s*-", p["name"])
                if m:
                    meses.append(int(m.group(1)))
            meses = sorted(set(meses), reverse=True)
            if mes:
                pid_mes = _drive_acha_pasta(_orc_nome_pasta_mes(ano, mes), pid_ano)
                if pid_mes:
                    dias = sorted({_orc_dia_da_pasta(p["name"])
                                   for p in _orc_subpastas(pid_mes)
                                   if _orc_dia_da_pasta(p["name"])}, reverse=True)
    # O ANO CORRENTE entra na lista mesmo sem pasta: em 1º de janeiro ainda não
    # há nada arquivado, e sem o ano na lista não haveria como gerar o primeiro
    # relatório do ano.
    lista_anos = sorted({int(a) for a in anos} | {datetime.now().year}, reverse=True)

    # "meses" diz quais têm MOVIMENTO — é o que o editor usa para marcar a lista.
    # A escolha em si não se limita a eles: um mês sem pasta é um mês sem
    # orçamentos arquivados, e o usuário precisa poder selecioná-lo para gerar
    # o relatório (que virá vazio, o que é a resposta correta).
    return {"ok": True, "anos": lista_anos, "meses": meses,
            "dias": dias, "ano": ano, "comMovimento": meses}


# Pasta onde os relatórios gerados ficam guardados. Fica ao lado das outras
# na raiz de orçamentos, mas NÃO aparece na navegação do editor: quem escreve
# nela é só o próprio relatório, e abrir um .ftr como se fosse orçamento não
# faria sentido nenhum.
FT_PASTA_RELATORIOS = "Relatórios gerados"


def _rel_pasta():
    """A pasta dos relatórios, criada na primeira vez que for preciso."""
    return _orc_subpasta_raiz(FT_PASTA_RELATORIOS)


def _rel_nome_arquivo(ano, mes, dia=0):
    """Um arquivo por período. Gerar de novo sobrescreve o mesmo arquivo,
       então nunca há dois relatórios do mesmo mês para escolher."""
    return ("%04d-%02d-%02d.ftr" % (ano, mes, dia)) if dia else ("%04d-%02d.ftr" % (ano, mes))


@app.post("/api/ft/relatorio-guardar")
async def ft_relatorio_guardar(request: Request):
    """Guarda o relatório recém-gerado, para não ser preciso refazê-lo."""
    exige_pode(request, "relatorio")   # v3.307: vendedor nao ve relatorio
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    h = datetime.now(timezone.utc)
    ano = int(corpo.get("ano") or h.year)
    mes = int(corpo.get("mes") or h.month)
    dia = int(corpo.get("dia") or 0)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido.")
    itens = corpo.get("itens")
    if not isinstance(itens, list):
        raise HTTPException(status_code=400, detail="Relatório sem itens.")

    doc = {"_formato": "fourtime-relatorio", "_versao": 1,
           "geradoEm": h.isoformat(), "ano": ano, "mes": mes, "dia": dia,
           "itens": itens, "falhas": corpo.get("falhas") or []}
    nome = _rel_nome_arquivo(ano, mes, dia)
    texto = json.dumps(doc, ensure_ascii=False)
    fid, acao, via = None, "", ""

    # 1) pela service account: só funciona se o arquivo JÁ existir. Ela pode
    #    ATUALIZAR, mas não CRIAR — contas de serviço não têm cota própria de
    #    armazenamento no Drive, e criar devolve 403.
    try:
        pid = _rel_pasta()
        existente = _orc_acha_arquivo(nome, pid)
        if existente:
            _orc_grava_por_id(existente, texto.encode("utf-8"))
            fid, acao, via = existente, "atualizado", "service-account"
    except Exception:
        pass

    # 2) senão, quem cria é o Apps Script: ele roda como dono da conta e tem
    #    cota. É o mesmo plano B que os orçamentos já usam.
    if not fid and FT_SCRIPT_ORCAMENTOS:
        try:
            r = _script_post({"acao": "salvar", "nome": nome, "conteudo": texto,
                              "destino": "relatorio",
                              "pastaRelatorios": FT_PASTA_RELATORIOS})
            fid, acao, via = r.get("id"), "criado", "apps-script"
        except Exception as e:
            # guardar é conveniência: se falhar, o relatório na tela continua
            # valendo. Por isso devolve o aviso em vez de derrubar a geração.
            return {"ok": False, "aviso": "Não consegui guardar: %s" % str(e)[:160]}

    if not fid:
        return {"ok": False, "aviso": "Não consegui guardar: a conta de serviço não "
                                      "tem cota para criar arquivos e o Apps Script "
                                      "não está configurado."}
    return {"ok": True, "id": fid, "acao": acao, "via": via,
            "nome": nome, "geradoEm": doc["geradoEm"]}


@app.get("/api/ft/relatorio-guardado")
def ft_relatorio_guardado(request: Request, ano: int = 0, mes: int = 0, dia: int = 0):
    """O último relatório guardado de um período, se houver."""
    exige_pode(request, "relatorio")   # v3.307: vendedor nao ve relatorio
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    h = datetime.now(timezone.utc)
    ano = int(ano or h.year)
    mes = int(mes or h.month)
    dia = int(dia or 0)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido.")
    nome = _rel_nome_arquivo(ano, mes, dia)
    try:
        pid = _rel_pasta()
        achados = _drive_get("/files", {
            "q": ("'%s' in parents and trashed = false and name = '%s'"
                  % (pid, nome.replace("'", "\\'"))),
            "fields": "files(id,name,modifiedTime)", "pageSize": "5",
            "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"}).get("files", [])
        if not achados:
            return {"ok": True, "existe": False}
        bruto, _ = _drive_get("/files/" + achados[0]["id"],
                              {"alt": "media", "supportsAllDrives": "true"}, binario=True)
        doc = json.loads(bruto.decode("utf-8"))
    except Exception as e:
        return {"ok": True, "existe": False, "aviso": str(e)[:160]}
    doc["existe"] = True
    doc["ok"] = True
    return doc


# =====================================================================
# RELATORIO DE ATIVIDADE (v3.311)
#
# O Relatorio de Pedidos responde "quanto vendemos". Este responde outra
# coisa: "o que a fabrica vai produzir nesta semana, e cabe?". Por isso e
# um endpoint separado e nao um parametro do outro:
#
#   1. NAO TEM DINHEIRO. Nenhum. Quem planeja producao nao precisa saber
#      quanto o pedido custou, e a marca de acesso pode ser dada a quem o
#      faturamento nao diz respeito. Um campo de valor que ninguem usa e
#      um campo de valor que um dia vaza.
#   2. TEM A DATA DE ENVIO, que o Relatorio de Pedidos nao carrega.
#   3. A LEITURA E INCREMENTAL. Gerar de novo nao pode custar o mes
#      inteiro outra vez, nem derrubar o que ja foi planejado a mao.
# =====================================================================

def exige_atividade(req: Request, planejar=False):
    """Recusa quem nao pode. 'planejar' e mais apertado que 'ver': mudar o
       dia de um pedido e coisa de admin."""
    if FT_LOGIN_DESLIGADO:
        return None
    u = exige_token(req)
    if planejar and not pode_planejar(u):
        raise HTTPException(status_code=403,
            detail="Só um administrador altera o planejamento da semana.")
    if not pode(u, "atividade"):
        raise HTTPException(status_code=403,
            detail="Seu acesso não inclui o Relatório de Atividade.")
    return u


def _atv_nome_arquivo(semana):
    """Um arquivo por semana, nomeado pela segunda-feira: 2026-08-17.fta.

       Nomear pela segunda e nao por numero de semana ISO e uma escolha a
       favor de quem abre o Drive: '2026-W34' nao diz nada a ninguem, e
       '2026-08-17' diz exatamente de que semana se trata."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(semana or "")):
        raise HTTPException(status_code=400, detail="Semana inválida.")
    return "%s.fta" % semana


@app.get("/api/ft/atividade-lista")
def ft_atividade_lista(request: Request, resposta: Response, ano: int = 0, mes: int = 0):
    """Quais arquivos existem no mes, sem abrir nenhum.

       Vem com o modifiedTime de cada um, e e ele que torna a geracao
       incremental possivel: o editor so manda abrir o que nunca viu ou o
       que mudou desde a ultima vez."""
    exige_atividade(request)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    resposta.headers["Cache-Control"] = "no-store, max-age=0"
    h = datetime.now(timezone.utc)
    ano = int(ano or h.year); mes = int(mes or h.month)
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido.")
    try:
        _pid, achados = _rel_fontes(ano, mes, 0)
    except Exception as e:
        raise HTTPException(status_code=502,
            detail="Não consegui abrir a pasta: %s" % str(e)[:200])
    return {"ok": True, "ano": ano, "mes": mes,
            "total": len(achados), "arquivos": achados}


@app.post("/api/ft/atividade-lote")
async def ft_atividade_lote(request: Request):
    """Abre um punhado de orcamentos e devolve so o que a producao precisa."""
    exige_atividade(request)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    pedidos = corpo.get("arquivos") or []
    if not isinstance(pedidos, list) or len(pedidos) > 40:
        raise HTTPException(status_code=400, detail="Lote inválido.")
    itens, falhas = [], []
    for a in pedidos:
        fid = str((a or {}).get("id") or "")
        nome = str((a or {}).get("nome") or "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", fid):
            continue
        try:
            bruto, _ = _drive_get("/files/" + fid,
                                  {"alt": "media", "supportsAllDrives": "true"},
                                  binario=True)
            c = json.loads(bruto.decode("utf-8"))
        except Exception as e:
            falhas.append({"nome": nome, "erro": str(e)[:120]})
            continue
        header = c.get("header") or {}
        cli, ped = _rel_cliente_pedido(nome, header)
        sp, _sv, pp, _pv, _ign = _rel_do_conteudo(c)
        itens.append({
            "id": fid, "arquivo": nome,
            "dia": int((a or {}).get("dia") or _orc_dia_mes_ano(nome)[0]),
            "mod": str((a or {}).get("mod") or ""),
            "cliente": cli, "pedido": ped,
            "vendedor": str(header.get("vendedor") or "").strip(),
            # O DEPARTAMENTO sai do cabecalho do orcamento e diz por quais
            # postos a peca passa (DTF, Silk, Sublimacao, e as combinacoes).
            # Sem ele o relatorio dizia o QUANTO e o QUANDO, e nunca o ONDE.
            "departamento": str(header.get("departamento") or "").strip(),
            # QUANDO a mercadoria sai. E a data que coloca o pedido na
            # semana, ate alguem arrastar a linha para outro dia.
            "envio": str(header.get("envio") or "").strip(),
            "subPecas": int(sp), "perPecas": int(pp),
            "total": int(sp) + int(pp),
        })
    return {"ok": True, "itens": itens, "falhas": falhas}


@app.get("/api/ft/atividade-guardado")
def ft_atividade_guardado(request: Request, resposta: Response, semana: str = ""):
    """O planejamento salvo de uma semana, se houver.

       SEM CACHE, EXPLICITAMENTE. A resposta nao trazia cabecalho de cache
       nenhum, e "nenhum" nao e o mesmo que "nao guarde": navegador e
       intermediario ficam livres para decidir por conta propria. Num dado
       que muda quando OUTRA MAQUINA salva, uma copia velha servida em
       silencio e a pior falha possivel -- duas telas mostrando
       planejamentos diferentes do mesmo dia, sem nada avisar."""
    resposta.headers["Cache-Control"] = "no-store, max-age=0"
    exige_atividade(request)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    nome = _atv_nome_arquivo(semana)
    try:
        pid = _rel_pasta()
        achados = _drive_get("/files", {
            "q": ("'%s' in parents and trashed = false and name = '%s'"
                  % (pid, nome.replace("'", "\\'"))),
            "fields": "files(id,name,modifiedTime)", "pageSize": "5",
            "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"}).get("files", [])
        if not achados:
            return {"ok": True, "existe": False, "semana": semana}
        bruto, _ = _drive_get("/files/" + achados[0]["id"],
                              {"alt": "media", "supportsAllDrives": "true"}, binario=True)
        doc = json.loads(bruto.decode("utf-8"))
    except Exception as e:
        return {"ok": True, "existe": False, "semana": semana, "aviso": str(e)[:160]}
    doc["existe"] = True
    doc["ok"] = True
    return doc


@app.post("/api/ft/atividade-guardar")
async def ft_atividade_guardar(request: Request):
    """Grava o planejamento da semana.

       O servidor NAO funde nada: quem funde e o editor, que tem na tela o
       salvo e o recem-lido. Aqui so se escreve o resultado. Fundir nos dois
       lados daria duas regras de fusao para manter de acordo, e a segunda
       silenciosamente erraria."""
    exige_atividade(request, planejar=True)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    semana = str(corpo.get("semana") or "")
    nome = _atv_nome_arquivo(semana)
    linhas = corpo.get("linhas")
    if not isinstance(linhas, list):
        raise HTTPException(status_code=400, detail="Semana sem linhas.")
    h = datetime.now(timezone.utc)
    doc = {"_formato": "fourtime-atividade", "_versao": 1,
           "salvoEm": h.isoformat(), "semana": semana,
           "linhas": linhas,
           # o que ja foi lido do Drive, para a proxima geracao nao reabrir
           # tudo de novo: id -> modifiedTime.
           "vistos": corpo.get("vistos") or {},
           "capacidade": corpo.get("capacidade") or {}}
    texto = json.dumps(doc, ensure_ascii=False)
    fid, acao, via = None, "", ""
    try:
        pid = _rel_pasta()
        existente = _orc_acha_arquivo(nome, pid)
        if existente:
            _orc_grava_por_id(existente, texto.encode("utf-8"))
            fid, acao, via = existente, "atualizado", "service-account"
    except Exception:
        pass
    if not fid and FT_SCRIPT_ORCAMENTOS:
        try:
            r = _script_post({"acao": "salvar", "nome": nome, "conteudo": texto,
                              "destino": "relatorio",
                              "pastaRelatorios": FT_PASTA_RELATORIOS})
            fid, acao, via = r.get("id"), "criado", "apps-script"
        except Exception as e:
            return {"ok": False, "aviso": "Não consegui guardar: %s" % str(e)[:160]}
    if not fid:
        return {"ok": False, "aviso": "Não consegui guardar: a conta de serviço não "
                                      "tem cota para criar arquivos e o Apps Script "
                                      "não está configurado."}
    return {"ok": True, "id": fid, "acao": acao, "via": via,
            "nome": nome, "salvoEm": doc["salvoEm"]}


# =====================================================================
#  O CACHE DA ATIVIDADE  (.ftk)
#
#  A leitura ja era incremental: cada semana guarda no proprio .fta o
#  mapa id -> modifiedTime do que ja abriu, e so reabre o que mudou. Mas
#  esse mapa e DE UMA SEMANA SO. Abrir a semana seguinte comecava do
#  zero e reabria os mesmos orcamentos, um por um, porque o que a semana
#  anterior aprendeu ficou trancado no arquivo dela.
#
#  O cache tira esse aprendizado de dentro da semana e o poe num arquivo
#  por MES, ao lado dos relatorios: 2026-08.ftk. Dentro dele, por id do
#  arquivo, exatamente os mesmos campos que o atividade-lote devolve,
#  mais o modifiedTime que os validou. Gerar qualquer semana passa a
#  aproveitar o que qualquer outra ja leu.
#
#  Por MES e nao num arquivo unico por dois motivos: a varredura ja e por
#  mes (entao le-se so o que interessa), e um arquivo unico cresceria sem
#  fim e seria reescrito inteiro a cada gravacao.
#
#  A CHAVE DE VALIDADE E O modifiedTime, e nao o tempo. Um orcamento
#  reaberto e salvo muda o modifiedTime, e a entrada envelhece na hora.
#  Cache que expira por relogio erra nos dois sentidos: guarda demais o
#  que mudou e joga fora o que continua bom.
# =====================================================================
def _atv_cache_nome(ano, mes):
    if not (1 <= int(mes) <= 12) or not (2000 <= int(ano) <= 2999):
        raise HTTPException(status_code=400, detail="Mês inválido.")
    return "%04d-%02d.ftk" % (int(ano), int(mes))


@app.get("/api/ft/atividade-cache")
def ft_atividade_cache_le(request: Request, ano: int = 0, mes: int = 0):
    """O que ja foi lido daquele mes, se houver."""
    exige_atividade(request)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    h = datetime.now(timezone.utc)
    nome = _atv_cache_nome(int(ano or h.year), int(mes or h.month))
    try:
        pid = _rel_pasta()
        achados = _drive_get("/files", {
            "q": ("'%s' in parents and trashed = false and name = '%s'"
                  % (pid, nome.replace("'", "\\'"))),
            "fields": "files(id,name,modifiedTime)", "pageSize": "5",
            "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"}).get("files", [])
        if not achados:
            return {"ok": True, "existe": False, "nome": nome, "itens": {}}
        bruto, _ = _drive_get("/files/" + achados[0]["id"],
                              {"alt": "media", "supportsAllDrives": "true"}, binario=True)
        doc = json.loads(bruto.decode("utf-8"))
        itens = doc.get("itens")
        if not isinstance(itens, dict):
            itens = {}
        return {"ok": True, "existe": True, "nome": nome, "itens": itens}
    except Exception:
        # cache e um ATALHO: falhar nele nao pode derrubar a geracao, so
        # devolve-la ao caminho longo.
        return {"ok": True, "existe": False, "nome": nome, "itens": {}}


@app.post("/api/ft/atividade-cache")
async def ft_atividade_cache_grava(request: Request):
    """Guarda o que foi lido daquele mes, para a proxima semana aproveitar."""
    exige_atividade(request)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    h = datetime.now(timezone.utc)
    nome = _atv_cache_nome(int(corpo.get("ano") or h.year),
                           int(corpo.get("mes") or h.month))
    itens = corpo.get("itens")
    if not isinstance(itens, dict):
        raise HTTPException(status_code=400, detail="Cache sem itens.")
    # um teto para o arquivo nao virar um problema por conta propria
    if len(itens) > 4000:
        raise HTTPException(status_code=400, detail="Cache grande demais.")
    doc = {"_formato": "fourtime-atividade-cache", "_versao": 1,
           "salvoEm": h.isoformat(), "nome": nome, "itens": itens}
    texto = json.dumps(doc, ensure_ascii=False)
    fid, acao, via = None, "", ""
    try:
        pid = _rel_pasta()
        existente = _orc_acha_arquivo(nome, pid)
        if existente:
            _orc_grava_por_id(existente, texto.encode("utf-8"))
            fid, acao, via = existente, "atualizado", "service-account"
    except Exception:
        pass
    if not fid and FT_SCRIPT_ORCAMENTOS:
        try:
            r = _script_post({"acao": "salvar", "nome": nome, "conteudo": texto,
                              "destino": "relatorio",
                              "pastaRelatorios": FT_PASTA_RELATORIOS})
            fid, acao, via = r.get("id"), "criado", "apps-script"
        except Exception as e:
            return {"ok": False, "aviso": "Não consegui guardar o cache: %s" % str(e)[:160]}
    if not fid:
        return {"ok": False, "aviso": "Não consegui guardar o cache."}
    return {"ok": True, "id": fid, "acao": acao, "via": via, "nome": nome,
            "quantos": len(itens)}


# =====================================================================
#  O INDICE MENSAL  (.ftx)   -- v3.326
#
#  A ARQUITETURA VELHA GUARDAVA A RESPOSTA DE UMA PERGUNTA.
#
#  Ate a v3.325 cada semana era um arquivo (.fta) com a lista dela
#  dentro. Mas "semana" nao e um lugar onde um pedido mora: e uma
#  pergunta que se faz ao calendario ("quais pedidos estao planejados
#  entre segunda e sabado?"). Guardar a RESPOSTA como se fosse a verdade
#  cria copias do mesmo pedido em arquivos diferentes, e copias
#  discordam.
#
#  Todo bug do relatorio de atividade nasceu dai:
#    . a VIAPOL finalizada na semana de 10 a 15 e ainda em Costura na de
#      17 a 22: duas copias, uma sem saber da outra;
#    . os 45 pedidos na semana de 24 a 29: 32 deles eram copias escritas
#      no arquivo errado;
#    . o pedido do dia 18 aparecendo na semana do dia 31: a varredura
#      tinha permissao de decidir sozinha onde o pedido mora.
#  Cada correcao foi uma RECONCILIACAO entre copias. Reconciliacao so
#  existe porque existe copia.
#
#  AGORA O PEDIDO E A UNIDADE, E A SEMANA E UM FILTRO.
#
#  Um registro por pedido, com um campo `plan` que e o ENDERECO dele. A
#  semana de 17 a 22 deixa de ser um arquivo e passa a ser "todo registro
#  cujo plan cai entre 17 e 22". Um registro tem um plan so, logo aparece
#  numa semana so. A duplicacao fica IMPOSSIVEL por construcao, e nao
#  "corrigida por uma rotina".
#
#  UM ARQUIVO POR MES, e nao um por pedido. O Drive nao sabe procurar
#  dentro dos arquivos: so listar nomes e abrir. Um arquivo por pedido
#  obrigaria a abrir 500 arquivos para montar uma tela de semana, ou a
#  manter um indice ao lado -- e ai sao duas verdades outra vez. Um
#  arquivo por mes e UMA leitura de uns 60 KB, e as quatro semanas do mes
#  saem dele por filtro. As quatro semanas passam a ser o MESMO arquivo:
#  e por isso que o mesmo pedido nao tem mais onde ser duas coisas.
#
#  QUEM ESCREVE MANDA RECADO, NAO MANDA O ARQUIVO. O editor nunca envia
#  "a semana deve ficar assim". Ele envia "PD004136, etapa = costura".
#  O servidor abre o mes, encosta naquele campo daquele pedido e grava.
#  Duas maquinas mexendo em pedidos diferentes no mesmo minuto entram as
#  duas, porque nenhuma mandou o arquivo. E o que dispensa o aviso de
#  "outra maquina salvou" da v3.325: nao ha mais o que atropelar.
# =====================================================================

_ATV_TRAVA_GERAL = threading.Lock()
_ATV_TRAVAS = {}          # "2026-08" -> Lock, uma por mes
_ATV_MEMORIA = {}         # "2026-08" -> {"doc":..., "fid":..., "mod":...}

# os unicos campos que uma tela pode mudar. Tudo o mais e da varredura, e
# essa separacao e a lei que impede o Gerar de desfazer o que foi decidido
# a mao (ver _atv_varre).
_ATV_CAMPOS_DA_TELA = {"etapa", "plan", "planManual", "concluidoEm", "obs"}
_ATV_ETAPAS_VALIDAS = {
    "", "corte", "subli", "dtf", "prensa", "silk", "bordado", "calandra",
    "futurize", "conferencia", "cdcostura", "costura", "embalagem", "finalizado",
    # as que sairam da lista mas continuam em arquivos antigos
    "separacao", "despacho", "organizar", "atrasado",
}


def _atv_trava(mes):
    """Uma trava por mes. Duas gravacoes no mesmo mes se enfileiram; em
       meses diferentes correm juntas."""
    with _ATV_TRAVA_GERAL:
        if mes not in _ATV_TRAVAS:
            _ATV_TRAVAS[mes] = threading.Lock()
        return _ATV_TRAVAS[mes]


def _atv_mes_ok(mes):
    if not re.fullmatch(r"\d{4}-\d{2}", str(mes or "")):
        raise HTTPException(status_code=400, detail="Mês inválido.")
    a, m = str(mes).split("-")
    if not (2000 <= int(a) <= 2999) or not (1 <= int(m) <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido.")
    return str(mes)


def _atv_mes_nome(mes):
    return "%s.ftx" % _atv_mes_ok(mes)


def _atv_mes_de_iso(iso):
    """De qual arquivo mensal e uma data AAAA-MM-DD."""
    return str(iso or "")[:7] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(iso or "")) else ""


# O SERVIDOR PENSA EM UTC E A FABRICA TRABALHA EM BRASILIA.
# Tres horas de diferenca nao importam para carimbo de gravacao, mas
# importam para a pergunta "que dia e hoje": as 22h de domingo em Goiania
# o relogio UTC ja marca segunda, e a virada da semana aconteceria com a
# fabrica ainda fechada, um dia antes do combinado.
FT_FUSO_HORAS = int(os.environ.get("FT_FUSO_HORAS", "-3") or "-3")


def _atv_hoje_br():
    """Hoje, no fuso da fabrica, em AAAA-MM-DD.

       O FT_HOJE_FIXO existe pelo mesmo motivo que o ATV.hojeFixo da tela:
       uma regra que depende do calendario da maquina nao pode ser
       conferida, porque o teste passaria hoje e falharia na semana que vem
       sem nada ter mudado. Em producao ele nao existe e vale o relogio."""
    fixo = os.environ.get("FT_HOJE_FIXO") or ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", fixo):
        return fixo
    return (datetime.now(timezone.utc)
            + timedelta(hours=FT_FUSO_HORAS)).strftime("%Y-%m-%d")


def _atv_segunda_iso(iso):
    """A segunda-feira da semana de uma data AAAA-MM-DD."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(iso or "")):
        return ""
    d = datetime(int(iso[:4]), int(iso[5:7]), int(iso[8:10]))
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")


def _atv_iso_de_br(br):
    """13/08/2026 -> 2026-08-13. Vazio quando nao da."""
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(br or "").strip())
    if not m:
        return ""
    d, mo, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        datetime(a, mo, d)
    except ValueError:
        return ""
    return "%04d-%02d-%02d" % (a, mo, d)


def _atv_mes_vazio(mes):
    return {"_formato": "fourtime-atividade-mes", "_versao": 1,
            "mes": mes, "versao": 0, "salvoEm": "", "pedidos": {}}


def _atv_mes_le(mes, usar_memoria=True):
    """Abre o indice do mes. Devolve (doc, fid, mod).

       A memoria de processo evita reabrir o mesmo arquivo a cada recado,
       e e VALIDADA pelo modifiedTime do Drive, nunca por relogio: se
       outra instancia gravou, o modifiedTime muda e a memoria cai. Cache
       que expira por tempo erra dos dois lados."""
    mes = _atv_mes_ok(mes)
    nome = _atv_mes_nome(mes)
    pid = _rel_pasta()
    achados = _drive_get("/files", {
        "q": ("'%s' in parents and trashed = false and name = '%s'" % (pid, nome)),
        "fields": "files(id,name,modifiedTime)", "pageSize": "5",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"}).get("files", [])
    if not achados:
        return _atv_mes_vazio(mes), None, ""
    fid = achados[0]["id"]
    mod = achados[0].get("modifiedTime") or ""
    guardado = _ATV_MEMORIA.get(mes)
    if usar_memoria and guardado and guardado.get("mod") == mod and guardado.get("fid") == fid:
        return json.loads(json.dumps(guardado["doc"])), fid, mod
    bruto, _ = _drive_get("/files/" + fid, {"alt": "media", "supportsAllDrives": "true"},
                          binario=True)
    doc = json.loads(bruto.decode("utf-8"))
    if not isinstance(doc.get("pedidos"), dict):
        doc["pedidos"] = {}
    doc["mes"] = mes
    _ATV_MEMORIA[mes] = {"doc": json.loads(json.dumps(doc)), "fid": fid, "mod": mod}
    return doc, fid, mod


def _atv_mes_grava(mes, doc, fid):
    """Grava o indice e devolve o novo modifiedTime, que e o carimbo que a
       tela usa para saber que algo mudou."""
    mes = _atv_mes_ok(mes)
    nome = _atv_mes_nome(mes)
    doc["_formato"] = "fourtime-atividade-mes"
    doc["_versao"] = 1
    doc["mes"] = mes
    doc["versao"] = int(doc.get("versao") or 0) + 1
    doc["salvoEm"] = datetime.now(timezone.utc).isoformat()
    texto = json.dumps(doc, ensure_ascii=False)
    if not fid:
        try:
            pid = _rel_pasta()
            fid = _orc_acha_arquivo(nome, pid)
        except Exception:
            fid = None
    if fid:
        _orc_grava_por_id(fid, texto.encode("utf-8"))
    elif FT_SCRIPT_ORCAMENTOS:
        r = _script_post({"acao": "salvar", "nome": nome, "conteudo": texto,
                          "destino": "relatorio", "pastaRelatorios": FT_PASTA_RELATORIOS})
        fid = r.get("id")
    if not fid:
        raise HTTPException(status_code=502,
            detail="Não consegui gravar o índice do mês: sem cota para criar arquivo.")
    mod = ""
    try:
        d = _drive_get("/files/" + fid, {"fields": "modifiedTime",
                                         "supportsAllDrives": "true"})
        mod = d.get("modifiedTime") or ""
    except Exception:
        pass
    _ATV_MEMORIA[mes] = {"doc": json.loads(json.dumps(doc)), "fid": fid, "mod": mod}
    return fid, mod


def _atv_carimbos(meses):
    """O carimbo de cada mes SEM abrir arquivo nenhum.

       E a pergunta barata que a tela faz de quinze em quinze segundos: uma
       so listagem do Drive, resposta de algumas dezenas de bytes, e nada
       e baixado. So quando o carimbo muda e que vale a pena abrir."""
    meses = [_atv_mes_ok(m) for m in meses][:6]
    if not meses:
        return {}
    pid = _rel_pasta()
    nomes = " or ".join("name = '%s'" % _atv_mes_nome(m) for m in meses)
    achados = _drive_get("/files", {
        "q": "'%s' in parents and trashed = false and (%s)" % (pid, nomes),
        "fields": "files(id,name,modifiedTime)", "pageSize": "20",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"}).get("files", [])
    fora = {m: "" for m in meses}
    for a in achados:
        k = str(a.get("name") or "")[:-4]
        if k in fora:
            fora[k] = a.get("modifiedTime") or ""
    return fora


@app.get("/api/ft/atv/mes")
def ft_atv_mes(request: Request, resposta: Response, mes: str = ""):
    """O indice de um mes inteiro. Uma leitura, e as quatro ou cinco semanas
       dele saem daqui por filtro, sem voltar ao Drive."""
    exige_atividade(request)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    resposta.headers["Cache-Control"] = "no-store, max-age=0"
    mes = _atv_mes_ok(mes or datetime.now(timezone.utc).strftime("%Y-%m"))
    try:
        doc, fid, mod = _atv_mes_le(mes)
    except HTTPException:
        raise
    except Exception as e:
        return {"ok": True, "mes": mes, "existe": False, "pedidos": {},
                "carimbo": "", "aviso": str(e)[:160]}
    return {"ok": True, "mes": mes, "existe": bool(fid), "carimbo": mod,
            "versao": int(doc.get("versao") or 0),
            "salvoEm": doc.get("salvoEm") or "",
            "pedidos": doc.get("pedidos") or {}}


@app.get("/api/ft/atv/carimbo")
def ft_atv_carimbo(request: Request, resposta: Response, meses: str = ""):
    """Mudou alguma coisa? A pergunta mais barata que existe aqui."""
    exige_atividade(request)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    resposta.headers["Cache-Control"] = "no-store, max-age=0"
    lista = [m for m in str(meses or "").split(",") if m.strip()]
    if not lista:
        lista = [datetime.now(timezone.utc).strftime("%Y-%m")]
    try:
        return {"ok": True, "carimbos": _atv_carimbos(lista)}
    except HTTPException:
        raise
    except Exception as e:
        return {"ok": False, "carimbos": {}, "aviso": str(e)[:160]}


def _atv_aplica(doc, id_ped, campo, valor, quem):
    """Encosta em UM campo de UM pedido. Devolve o registro, ou None se o
       pedido nao existe naquele mes."""
    p = (doc.get("pedidos") or {}).get(id_ped)
    if not p:
        return None
    if campo not in _ATV_CAMPOS_DA_TELA:
        raise HTTPException(status_code=400, detail="Campo '%s' não é da tela." % campo)
    if campo == "etapa":
        v = str(valor or "")
        if v not in _ATV_ETAPAS_VALIDAS:
            raise HTTPException(status_code=400, detail="Etapa inválida.")
        p["etapa"] = v
        # FINALIZADO GRAVA A CONCLUSAO SOZINHO, e sair dela apaga.
        # Sem isto a data de conclusao seria mais um campo para alguem
        # lembrar de preencher, e campo que se esquece nasce errado.
        if v == "finalizado":
            if not p.get("concluidoEm"):
                p["concluidoEm"] = p.get("plan") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        else:
            p["concluidoEm"] = ""
    elif campo == "plan":
        v = str(valor or "")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise HTTPException(status_code=400, detail="Data de planejamento inválida.")
        p["plan"] = v
        # ESCOLHER A DATA E ASSINAR EMBAIXO. A partir daqui a varredura
        # nunca mais arrasta este pedido: e a marca que separa "acompanha
        # o orcamento" de "acompanha a pessoa".
        p["planManual"] = True
        if p.get("etapa") == "finalizado":
            # marcar concluido e escolher a data sao a MESMA porta: quem
            # poe um finalizado no dia 13 esta dizendo que ele acabou no
            # dia 13.
            p["concluidoEm"] = v
    elif campo == "planManual":
        p["planManual"] = bool(valor)
    elif campo == "concluidoEm":
        v = str(valor or "")
        if v and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise HTTPException(status_code=400, detail="Data de conclusão inválida.")
        p["concluidoEm"] = v
    elif campo == "obs":
        p["obs"] = str(valor or "")[:400]
    p["mexidoEm"] = datetime.now(timezone.utc).isoformat()
    if quem:
        p["mexidoPor"] = str(quem)[:80]
    return p


@app.post("/api/ft/atv/recado")
async def ft_atv_recado(request: Request, resposta: Response):
    """O RECADO: um campo, um pedido.

       Nunca chega aqui "a semana deve ficar assim". Chega "PD004136,
       etapa = costura". O servidor e quem funde, e por isso duas maquinas
       mexendo em pedidos diferentes no mesmo minuto nao se apagam: as duas
       encostam em linhas diferentes do mesmo arquivo.

       MUDAR O PLANEJAMENTO PODE ATRAVESSAR O MES (30/08 para 02/09). Nesse
       caso o registro SAI de um indice e ENTRA no outro. E a unica mudanca
       de endereco de verdade que existe, acontece pouco, e e explicita."""
    u = exige_atividade(request, planejar=True)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    resposta.headers["Cache-Control"] = "no-store, max-age=0"
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    recados = corpo.get("recados")
    if not isinstance(recados, list) or not recados:
        raise HTTPException(status_code=400, detail="Sem recados.")
    if len(recados) > 200:
        raise HTTPException(status_code=400, detail="Recados demais de uma vez.")
    quem = ""
    if isinstance(u, dict):
        quem = str(u.get("nome") or u.get("email") or "")

    # agrupa por mes para abrir cada arquivo uma vez so
    por_mes = {}
    for r in recados:
        if not isinstance(r, dict):
            continue
        mes = _atv_mes_ok(r.get("mes") or "")
        por_mes.setdefault(mes, []).append(r)

    mudou, carimbos, mudancas = [], {}, {}
    # ordem alfabetica dos meses: duas requisicoes que mexem nos mesmos dois
    # meses pegam as travas na mesma ordem, e por isso nunca se abracam
    for mes in sorted(por_mes.keys()):
        mudancas.setdefault(mes, [])
    # um registro que muda de mes precisa entrar num indice que talvez nao
    # esteja na lista: descobre-se ao aplicar, entao a mudanca de mes e
    # feita numa segunda passada
    mudanca_de_mes = []
    for mes in sorted(por_mes.keys()):
        with _atv_trava(mes):
            doc, fid, _mod = _atv_mes_le(mes)
            tocou = False
            for r in por_mes[mes]:
                pid = str(r.get("id") or "")
                campo = str(r.get("campo") or "")
                p = _atv_aplica(doc, pid, campo, r.get("valor"), quem)
                if p is None:
                    continue
                tocou = True
                if campo == "plan":
                    destino = _atv_mes_de_iso(p.get("plan"))
                    if destino and destino != mes:
                        mudanca_de_mes.append((mes, destino, pid,
                                               json.loads(json.dumps(p))))
                mudancas[mes].append({"id": pid, "campo": campo})
            for de, para, pid, _copia in mudanca_de_mes:
                if de == mes and pid in (doc.get("pedidos") or {}):
                    doc["pedidos"].pop(pid, None)
                    tocou = True
            if tocou:
                fid, mod = _atv_mes_grava(mes, doc, fid)
                carimbos[mes] = mod
                mudou.append(mes)

    for _de, para, pid, copia in mudanca_de_mes:
        with _atv_trava(para):
            doc, fid, _mod = _atv_mes_le(para)
            doc.setdefault("pedidos", {})[pid] = copia
            fid, mod = _atv_mes_grava(para, doc, fid)
            carimbos[para] = mod
            if para not in mudou:
                mudou.append(para)

    return {"ok": True, "meses": mudou, "carimbos": carimbos,
            "salvoEm": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------
#  A VARREDURA, E A LEI DAS TRES LINHAS
#
#  Todo bug do relatorio veio da varredura ter permissao de decidir onde
#  um pedido mora. Aqui ela perde essa permissao, e o que sobra e curto o
#  bastante para caber num paragrafo:
#
#    PODE CRIAR    pedido que nunca viu.
#    PODE ATUALIZAR cliente, departamento, valores, quantidades e entrega.
#    NUNCA ENCOSTA em etapa, em planejamento marcado a mao, nem em
#                   data de conclusao.
#
#  Um processo que so insere e so atualiza campo burro e INCAPAZ de
#  baguncar planejamento. Por isso ele pode rodar sozinho de tempos em
#  tempos, e por isso o botao Gerar deixa de ser obrigacao: apertar ou
#  nao apertar nao muda mais nada que seja seu.
# ---------------------------------------------------------------------

def _atv_meses_de_arquivo(mes_alvo):
    """Os meses de ARQUIVAMENTO a varrer para cobrir um mes de entrega.

       Os orcamentos sao arquivados no Drive pela data em que foram
       fechados, e nao pela de entrega: um pedido entregue em agosto pode
       ter sido fechado em julho. O mes anterior cobre a distancia real
       entre fechar e entregar."""
    a, m = int(mes_alvo[:4]), int(mes_alvo[5:7])
    fora = []
    for delta in (-1, 0):
        mm = m + delta
        aa = a
        if mm < 1:
            mm += 12; aa -= 1
        fora.append((aa, mm))
    return fora


def _atv_le_orcamento(fid, nome, dia):
    bruto, _ = _drive_get("/files/" + fid, {"alt": "media", "supportsAllDrives": "true"},
                          binario=True)
    c = json.loads(bruto.decode("utf-8"))
    header = c.get("header") or {}
    cli, ped = _rel_cliente_pedido(nome, header)
    sp, _sv, pp, _pv, _ign = _rel_do_conteudo(c)
    return {"id": fid, "arquivo": nome, "dia": int(dia or 0),
            "cliente": cli, "pedido": ped,
            "vendedor": str(header.get("vendedor") or "").strip(),
            "departamento": str(header.get("departamento") or "").strip(),
            "envio": str(header.get("envio") or "").strip(),
            "subPecas": int(sp), "perPecas": int(pp), "total": int(sp) + int(pp)}


def _atv_rola(docs, pega, hoje_iso=""):
    """Passa para a segunda-feira de hoje tudo o que nao foi feito e ficou
       numa semana que ja acabou. Devolve quantos rolaram.

       `hoje_iso` existe para o teste dizer que dia e: uma regra que
       depende do calendario da maquina nao pode ser conferida."""
    seg_hoje = _atv_segunda_iso(hoje_iso or _atv_hoje_br())
    if not seg_hoje:
        return 0
    agora_iso = datetime.now(timezone.utc).isoformat()
    rolados = 0
    # duas passadas: a primeira pode ABRIR um mes novo (quando a segunda de
    # hoje cai fora dos que ja estavam abertos), e o que estiver la dentro
    # tambem tem direito a rolar
    for _passe in (1, 2):
        for mes in list(docs.keys()):
            for pid_reg, p in list((docs[mes].get("pedidos") or {}).items()):
                plan = str(p.get("plan") or "")
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", plan):
                    continue
                if plan >= seg_hoje:
                    continue
                if p.get("etapa") == "finalizado" or p.get("sumiu"):
                    continue
                hist = p.get("rolou")
                if not isinstance(hist, list):
                    hist = []
                if plan not in hist:
                    hist.append(plan)
                # a lista e curta de proposito: ela existe para desenhar o
                # aviso nas semanas passadas, nao para ser um diario
                p["rolou"] = [x for x in hist if isinstance(x, str)][-12:]
                p["plan"] = seg_hoje
                p["rolouEm"] = agora_iso
                rolados += 1
                destino = _atv_mes_de_iso(seg_hoje)
                if destino and destino != mes:
                    try:
                        pega(destino)["pedidos"][pid_reg] = \
                            docs[mes]["pedidos"].pop(pid_reg)
                    except Exception:
                        pass
    return rolados


def _atv_varre(mes_alvo, teto=400):
    """Le o Drive e encaixa o que achou nos indices mensais.

       Devolve um resumo do que fez. Nunca levanta: varredura que quebra a
       tela e pior que varredura que nao rodou."""
    mes_alvo = _atv_mes_ok(mes_alvo)
    criados, atualizados, sumidos, abertos = 0, 0, 0, 0
    docs, fids = {}, {}

    def pega(mes):
        if mes not in docs:
            d, f, _m = _atv_mes_le(mes)
            docs[mes], fids[mes] = d, f
        return docs[mes]

    # OS VIZINHOS ENTRAM ANTES, e nao por precaucao: um pedido so pode ser
    # dado por sumido se o indice onde ele mora estiver aberto. Sem abrir o
    # mes anterior e o seguinte, um registro de la nunca seria conferido e
    # um orcamento tirado da pasta continuaria na tela para sempre.
    _a, _m = int(mes_alvo[:4]), int(mes_alvo[5:7])
    for _d in (-1, 0, 1):
        _mm, _aa = _m + _d, _a
        if _mm < 1:
            _mm += 12; _aa -= 1
        if _mm > 12:
            _mm -= 12; _aa += 1
        try:
            pega("%04d-%02d" % (_aa, _mm))
        except Exception:
            pass

    for (aa, mm) in _atv_meses_de_arquivo(mes_alvo):
        try:
            _pid, achados = _rel_fontes(aa, mm, 0)
        except Exception:
            continue
        mes_arq = "%04d-%02d" % (aa, mm)
        cache_nome = _atv_cache_nome(aa, mm)
        cache = {}
        cache_fid = None
        try:
            pid = _rel_pasta()
            enc = _drive_get("/files", {
                "q": ("'%s' in parents and trashed = false and name = '%s'"
                      % (pid, cache_nome)),
                "fields": "files(id,name)", "pageSize": "5",
                "includeItemsFromAllDrives": "true",
                "supportsAllDrives": "true"}).get("files", [])
            if enc:
                cache_fid = enc[0]["id"]
                bruto, _ = _drive_get("/files/" + cache_fid,
                                      {"alt": "media", "supportsAllDrives": "true"},
                                      binario=True)
                cache = (json.loads(bruto.decode("utf-8")) or {}).get("itens") or {}
        except Exception:
            cache = {}

        vistos_agora = set()
        cache_mudou = False
        for a in achados[:teto]:
            fid = a.get("id"); nome = a.get("nome") or ""
            mod = a.get("mod") or ""
            vistos_agora.add(fid)
            it = cache.get(fid)
            if not it or it.get("mod") != mod:
                try:
                    it = _atv_le_orcamento(fid, nome, a.get("dia"))
                    it["mod"] = mod
                    abertos += 1
                except Exception:
                    continue
                cache[fid] = it
                cache_mudou = True
            entrega_iso = _atv_iso_de_br(it.get("envio"))
            if not entrega_iso:
                continue
            # ONDE O REGISTRO JA ESTA, se estiver em algum lugar.
            # Procura em ordem, e nao num conjunto: se um dia houver copia
            # em dois meses (bagunca herdada), a escolha tem de ser sempre
            # a mesma, senao a varredura oscila entre duas respostas.
            achou_em = None
            try:
                pega(_atv_mes_de_iso(entrega_iso))
            except Exception:
                pass
            for cand in sorted(docs.keys()):
                if fid in (docs[cand].get("pedidos") or {}):
                    achou_em = cand
                    break
            if achou_em:
                p = docs[achou_em]["pedidos"][fid]
                antes = json.dumps(p, sort_keys=True)
                # SO OS CAMPOS DE LEITURA. etapa, plan manual e conclusao
                # nao aparecem aqui, e essa ausencia e a lei.
                p["pedido"] = it.get("pedido") or p.get("pedido") or ""
                p["cliente"] = it.get("cliente") or ""
                p["vendedor"] = it.get("vendedor") or ""
                p["departamento"] = it.get("departamento") or ""
                p["sub"] = int(it.get("subPecas") or 0)
                p["per"] = int(it.get("perPecas") or 0)
                p["total"] = int(it.get("total") or 0)
                p["mod"] = mod
                p["mesArq"] = mes_arq
                p["sumiu"] = False
                entrega_velha = p.get("entrega") or ""
                p["entrega"] = it.get("envio") or ""
                if entrega_velha and entrega_velha != p["entrega"]:
                    if p.get("planManual"):
                        # NAO ARRASTA: avisa. A escolha da pessoa continua
                        # de pe e a linha ganha uma marca discreta.
                        p["entregaMudou"] = entrega_velha
                    else:
                        p["entregaMudou"] = ""
                if not p.get("planManual"):
                    # sem marca, o planejamento acompanha a entrega sozinho
                    p["plan"] = entrega_iso
                if json.dumps(p, sort_keys=True) != antes:
                    atualizados += 1
                destino = _atv_mes_de_iso(p.get("plan"))
                if destino and destino != achou_em:
                    pega(destino)["pedidos"][fid] = docs[achou_em]["pedidos"].pop(fid)
            else:
                destino = _atv_mes_de_iso(entrega_iso)
                if not destino:
                    continue
                pega(destino)["pedidos"][fid] = {
                    "id": fid, "pedido": it.get("pedido") or "",
                    "cliente": it.get("cliente") or "",
                    "vendedor": it.get("vendedor") or "",
                    "departamento": it.get("departamento") or "",
                    "entrega": it.get("envio") or "",
                    "sub": int(it.get("subPecas") or 0),
                    "per": int(it.get("perPecas") or 0),
                    "total": int(it.get("total") or 0),
                    "etapa": "", "plan": entrega_iso, "planManual": False,
                    "concluidoEm": "", "sumiu": False, "entregaMudou": "",
                    "mod": mod, "mesArq": mes_arq, "arquivo": it.get("arquivo") or "",
                    "criadoEm": datetime.now(timezone.utc).isoformat()}
                criados += 1

        # QUEM SAIU DA PASTA. Marca e esconde, nunca apaga: se alguem tirar
        # um orcamento de Organizados por engano, o registro continua la
        # para descobrir o que aconteceu.
        for mes in list(docs.keys()):
            for pid_reg, p in (docs[mes].get("pedidos") or {}).items():
                if p.get("mesArq") != mes_arq:
                    continue
                if pid_reg in vistos_agora:
                    continue
                if not p.get("sumiu"):
                    p["sumiu"] = True
                    p["sumiuEm"] = datetime.now(timezone.utc).isoformat()
                    sumidos += 1

        if cache_mudou and len(cache) <= 4000:
            try:
                doc_c = {"_formato": "fourtime-atividade-cache", "_versao": 1,
                         "salvoEm": datetime.now(timezone.utc).isoformat(),
                         "nome": cache_nome, "itens": cache}
                texto = json.dumps(doc_c, ensure_ascii=False).encode("utf-8")
                if cache_fid:
                    _orc_grava_por_id(cache_fid, texto)
                elif FT_SCRIPT_ORCAMENTOS:
                    _script_post({"acao": "salvar", "nome": cache_nome,
                                  "conteudo": texto.decode("utf-8"),
                                  "destino": "relatorio",
                                  "pastaRelatorios": FT_PASTA_RELATORIOS})
            except Exception:
                pass

    # =================================================================
    #  A SEMANA QUE ACABOU NAO SEGURA O QUE NAO FOI FEITO  (v3.356)
    #
    #  A regra cabe numa linha: nao finalizado e com planejamento ANTES da
    #  segunda-feira de hoje vai para a segunda-feira de hoje.
    #
    #  Ela ja quer dizer "so depois da semana terminar", sem precisar de
    #  nenhuma condicao a mais: dentro da semana corrente todo plan dela e
    #  maior ou igual a segunda, entao nada se mexe. E um pedido tres
    #  semanas atrasado cai direto na segunda de hoje, que e onde o
    #  trabalho esta -- nao adianta arrasta-lo de semana em semana ate
    #  chegar aqui.
    #
    #  ELA VALE TAMBEM PARA O planManual. A promessa daquele campo e "a
    #  varredura nao arrasta este pedido atras da data de entrega do
    #  orcamento", e nao "este pedido fica preso numa semana que ja
    #  acabou". Sem isto, quem foi planejado a mao e nao terminou continua
    #  sumindo da tela, que era justamente o defeito.
    #
    #  ONDE ELE ESTAVA FICA REGISTRADO, e nao copiado. O registro continua
    #  sendo UM, com UM plan; ele so ganha em `rolou` a lista dos enderecos
    #  de onde saiu. A semana antiga DESENHA o aviso a partir disso. Gravar
    #  uma linha fantasma de verdade seria recriar a copia que a v3.326
    #  existiu para matar.
    # =================================================================
    rolados = _atv_rola(docs, pega)

    carimbos = {}
    for mes in sorted(docs.keys()):
        with _atv_trava(mes):
            try:
                _f, mod = _atv_mes_grava(mes, docs[mes], fids.get(mes))
                carimbos[mes] = mod
            except Exception:
                pass
    return {"criados": criados, "atualizados": atualizados, "sumidos": sumidos,
            "abertos": abertos, "rolados": rolados,
            "carimbos": carimbos, "meses": sorted(docs.keys())}


@app.post("/api/ft/atv/varrer")
async def ft_atv_varrer(request: Request, resposta: Response):
    """Conferir agora. O mesmo que o relogio do servidor faz sozinho, so que
       na hora, para quem acabou de jogar um orcamento na pasta."""
    exige_atividade(request)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    resposta.headers["Cache-Control"] = "no-store, max-age=0"
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    mes = _atv_mes_ok(corpo.get("mes") or datetime.now(timezone.utc).strftime("%Y-%m"))
    try:
        r = _atv_varre(mes)
    except HTTPException:
        raise
    except Exception as e:
        return {"ok": False, "aviso": str(e)[:200]}
    r["ok"] = True
    return r


# ---------------------------------------------------------------------
#  O RELOGIO DO SERVIDOR
#
#  A varredura roda sozinha, uma vez, para todo mundo. No navegador ela
#  rodaria uma vez POR MAQUINA aberta, refazendo o mesmo trabalho.
#  No Render de graca a instancia dorme quando ninguem usa, entao o
#  relogio so bate enquanto ha gente trabalhando -- que e exatamente
#  quando se quer que ele bata.
# ---------------------------------------------------------------------
FT_VARRE_SEG = int(os.environ.get("FT_VARRE_SEG", "300") or "300")


def _atv_relogio():
    time.sleep(45)          # deixa o servidor subir antes
    while True:
        try:
            if FT_VARRE_SEG > 0 and (FT_PASTA_ORGANIZADOS or FT_SCRIPT_ORCAMENTOS):
                hoje = datetime.now(timezone.utc)
                _atv_varre(hoje.strftime("%Y-%m"))
        except Exception:
            pass
        time.sleep(max(60, FT_VARRE_SEG))


if FT_VARRE_SEG > 0:
    try:
        threading.Thread(target=_atv_relogio, daemon=True,
                         name="ft-varredura").start()
    except Exception:
        pass


# ---------------------------------------------------------------------
#  A MIGRACAO DOS .fta
#
#  As semanas ja salvas viram registros. E onde o mesmo pedido aparece em
#  varias semanas, esta migracao decide de uma vez qual e a verdade -- ou
#  seja, ela LIMPA as duplicatas tipo VIAPOL de brinde, em vez de deixar
#  voce cacar uma a uma.
#
#  A regra: se alguma semana diz finalizado, vence a MAIS ANTIGA que diz
#  isso (foi ali que o trabalho acabou de verdade). Senao, vence a mais
#  recente. E o planejamento que difere da entrega vira `planManual`,
#  porque foi alguem que o pos ali.
# ---------------------------------------------------------------------
@app.post("/api/ft/atv/migrar")
async def ft_atv_migrar(request: Request):
    exige_atividade(request, planejar=True)
    exige_token(request)
    exige_editor_atual(request)
    exige_orcamentos()
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    seco = bool(corpo.get("seco"))
    pid = _rel_pasta()
    try:
        arqs = _drive_get("/files", {
            "q": "'%s' in parents and trashed = false and name contains '.fta'" % pid,
            "fields": "files(id,name,modifiedTime)", "pageSize": "300",
            "orderBy": "name",
            "includeItemsFromAllDrives": "true",
            "supportsAllDrives": "true"}).get("files", [])
    except Exception as e:
        raise HTTPException(status_code=502, detail="Não consegui listar: %s" % str(e)[:160])
    semanas = []
    for a in arqs:
        nome = str(a.get("name") or "")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.fta", nome):
            continue
        try:
            bruto, _ = _drive_get("/files/" + a["id"],
                                  {"alt": "media", "supportsAllDrives": "true"},
                                  binario=True)
            doc = json.loads(bruto.decode("utf-8"))
        except Exception:
            continue
        semanas.append((nome[:-4], doc.get("linhas") or []))
    semanas.sort(key=lambda x: x[0])

    melhor = {}
    for seg, linhas in semanas:
        for l in linhas:
            lid = str(l.get("id") or "")
            if not lid:
                continue
            fim = (l.get("etapa") == "finalizado")
            atual = melhor.get(lid)
            if atual is None:
                melhor[lid] = {"seg": seg, "linha": l, "fim": fim}
                continue
            if fim and not atual["fim"]:
                melhor[lid] = {"seg": seg, "linha": l, "fim": True}
            elif fim and atual["fim"]:
                pass                      # o primeiro finalizado ganha
            elif not atual["fim"]:
                melhor[lid] = {"seg": seg, "linha": l, "fim": False}

    por_mes = {}
    for lid, m in melhor.items():
        l = m["linha"]
        entrega = str(l.get("entrega") or "")
        ent_iso = _atv_iso_de_br(entrega)
        plan = str(l.get("plan") or "") or ent_iso or m["seg"]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", plan):
            plan = m["seg"]
        mes = _atv_mes_de_iso(plan)
        if not mes:
            continue
        etapa = str(l.get("etapa") or "")
        if etapa == "atrasado":
            etapa = ""                    # atrasado deixou de ser etapa
        por_mes.setdefault(mes, {})[lid] = {
            "id": lid, "pedido": l.get("pedido") or "",
            "cliente": l.get("cliente") or "", "vendedor": l.get("vendedor") or "",
            "departamento": l.get("departamento") or "", "entrega": entrega,
            "sub": int(l.get("sub") or 0), "per": int(l.get("per") or 0),
            "total": int(l.get("total") or 0),
            "etapa": etapa, "plan": plan,
            "planManual": bool(ent_iso and ent_iso != plan),
            "concluidoEm": (plan if etapa == "finalizado" else ""),
            "sumiu": False, "entregaMudou": "", "mod": "", "mesArq": "",
            "migradoDe": m["seg"],
            "criadoEm": datetime.now(timezone.utc).isoformat()}

    resumo = {"semanas": len(semanas), "pedidos": len(melhor),
              "meses": {k: len(v) for k, v in sorted(por_mes.items())},
              "duplicatasResolvidas": sum(len(l) for _s, l in semanas) - len(melhor)}
    if seco:
        return {"ok": True, "seco": True, **resumo}
    for mes in sorted(por_mes.keys()):
        with _atv_trava(mes):
            doc, fid, _mod = _atv_mes_le(mes)
            alvo = doc.setdefault("pedidos", {})
            for lid, reg in por_mes[mes].items():
                if lid in alvo:
                    continue          # o que ja existe no indice manda
                alvo[lid] = reg
            _atv_mes_grava(mes, doc, fid)
    return {"ok": True, "seco": False, **resumo}


# ------------- PWA (offline + instalável) -------------
def _acha_pwa_dir():
    """Procura a pasta 'pwa' em locais comuns. Funciona esteja ela na raiz
       do projeto ou dentro de subpastas como 'powerup/'. Assim o PWA não
       depende de onde exatamente os arquivos foram enviados no repositório."""
    base = os.path.dirname(__file__)
    candidatos = [
        os.path.join(base, "pwa"),
        os.path.join(base, "powerup", "pwa"),
    ]
    # também varre 1 nível de subpastas atrás de uma pasta 'pwa' com manifest
    try:
        for nome in os.listdir(base):
            sub = os.path.join(base, nome, "pwa")
            if os.path.isdir(sub):
                candidatos.append(sub)
    except Exception:
        pass
    for c in candidatos:
        if os.path.isfile(os.path.join(c, "manifest.json")):
            return c
    return candidatos[0]  # padrão (mesmo que ainda não exista)

_PWA_DIR = _acha_pwa_dir()
_PWA_MIME = {
    ".json": "application/manifest+json",
    ".js":   "application/javascript",
    ".png":  "image/png",
}

@app.get("/pwa/{arquivo}")
def pwa_estatico(arquivo: str):
    """Serve manifest, service worker e ícones da pasta /pwa.
       O service-worker.js precisa do header Service-Worker-Allowed: /
       para poder controlar o editor na raiz (e não só a pasta /pwa)."""
    # trava contra path traversal: só nome de arquivo simples
    nome = os.path.basename(arquivo)
    caminho = os.path.join(_PWA_DIR, nome)
    if not os.path.isfile(caminho):
        raise HTTPException(status_code=404, detail="arquivo PWA não encontrado")
    ext = os.path.splitext(nome)[1].lower()
    mime = _PWA_MIME.get(ext, "application/octet-stream")
    headers = {}
    if nome == "service-worker.js":
        # deixa o SW controlar todo o site, mesmo estando em /pwa/
        headers["Service-Worker-Allowed"] = "/"
        # o SW nunca deve ficar preso em cache do navegador
        headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    elif ext == ".png":
        headers["Cache-Control"] = "public, max-age=86400"   # ícones podem cachear 1 dia
    return FileResponse(caminho, media_type=mime, headers=headers)


# =====================================================================
#  BACKUP DIÁRIO DO BANCO (v3.257)
#
#  Um arquivo por dia numa pasta própria do Drive. Nasceu de um susto
#  real: a v3.256 mudou o formato de clientes e bugs, e uma mesclagem mal
#  resolvida no servidor descartava relatos em silêncio. Um backup manual
#  cobre o dia em que alguém lembra de fazer; este cobre todos.
#
#  O arquivo do dia é SOBRESCRITO — não se acumulam dezenas por dia. E a
#  pasta fica de fora do "Abrir": ela não guarda orçamentos, e listá-la
#  ali só confundiria quem procura um pedido.
# =====================================================================

def _backup_pasta_id():
    """A pasta na raiz dos orçamentos. Criada na primeira vez."""
    pid = _drive_acha_pasta(PASTA_BACKUP, FT_DRIVE_ORCAMENTOS)
    if not pid:
        pid = _drive_cria_pasta(PASTA_BACKUP, FT_DRIVE_ORCAMENTOS)
    return pid

def _backup_grava(forcado=False):
    """Grava o banco de hoje. Devolve (nome, situação) ou (None, motivo).

    v3.258 — POR QUE ISTO NUNCA FUNCIONOU: a v257 chamava `_orc_sobe_arquivo`
    direto. Essa função ATUALIZA um arquivo existente sem problema, mas CRIAR
    um arquivo novo pela service account devolve 403 (storageQuotaExceeded):
    service account não tem cota de armazenamento e o Google recusa que ela
    crie arquivos no "Meu Drive" de uma conta Gmail. É a mesma limitação que
    já obrigou o Apps Script a existir para salvar orçamentos.

    Como o backup do dia é sempre um arquivo NOVO, ele caía exatamente no caso
    proibido — todo dia, para sempre. E como rodava numa thread solta com o
    erro engolido, falhava sem deixar rastro. Agora: mesma escada do salvamento
    de orçamento (service account -> Apps Script) e o resultado fica registrado
    em `_backup_estado`, visível no diagnóstico.
    """
    if not FT_DRIVE_CREDENCIAIS or not FT_DRIVE_ORCAMENTOS:
        return None, "Drive não configurado"
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    nome = "backup-%s.ftdb" % hoje
    try:
        pid = _backup_pasta_id()
        if not forcado and _orc_acha_arquivo(nome, pid):
            return nome, "já existe"      # o do dia já foi feito
        db = le_banco_drive() if drive_ligado() else {}
        texto = json.dumps(db, ensure_ascii=False, indent=1)
        try:
            _orc_sobe_arquivo(nome, pid, texto.encode("utf-8"))
            return nome, "gravado"
        except Exception as e1:
            # a service account recusou (quase sempre cota ao CRIAR): plano B
            if not FT_SCRIPT_ORCAMENTOS:
                return None, ("service account recusou (%s) e não há Apps Script "
                              "configurado" % str(e1)[:120])
            _orc_salva_via_script(nome, "trabalho", 0, 0, texto,
                                  pasta_trabalho=PASTA_BACKUP)
            return nome, "gravado pelo Apps Script"
    except Exception as e:
        return None, str(e)[:200]


# O que aconteceu na última tentativa. Existe porque o backup roda numa thread
# de fundo: sem isto, uma falha some no ar — foi o que aconteceu na v257.
_backup_estado = {"quando": "", "arquivo": "", "situacao": "nunca tentado"}


def _backup_registra(nome, situacao):
    _backup_estado.update({"quando": agora(), "arquivo": nome or "",
                           "situacao": situacao})


_backup_ultimo = {"dia": ""}

def _backup_se_for_a_hora():
    """Chamado de graça nas rotas do banco: se o dia virou, grava.

    Sem agendador: o Render free hiberna, e um cron que nunca acorda não
    faz backup nenhum. Assim, o primeiro acesso do dia dispara — e é
    exatamente quando há alguém trabalhando e dados novos para guardar.
    """
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _backup_ultimo["dia"] == hoje:
        return
    _backup_ultimo["dia"] = hoje          # marca ANTES, para não repetir se falhar

    def _tenta():
        nome, situacao = _backup_grava()
        _backup_registra(nome, situacao if nome else ("FALHOU: " + situacao))

    try:
        threading.Thread(target=_tenta, daemon=True).start()
    except Exception:
        pass

@app.post("/api/db/backup-agora")
def db_backup_agora(request: Request):
    """Backup sob demanda — para conferir que está funcionando."""
    exige_token(request)
    if not eh_admin(request):
        raise HTTPException(status_code=403, detail="Só administradores.")
    nome, situacao = _backup_grava(forcado=True)
    _backup_registra(nome, situacao if nome else ("FALHOU: " + situacao))
    if not nome:
        raise HTTPException(status_code=500, detail="Backup falhou: " + situacao)
    return {"ok": True, "arquivo": nome, "situacao": situacao}

@app.get("/api/db/backups")
def db_backups(request: Request):
    """Lista o que já foi guardado, do mais novo para o mais antigo."""
    exige_token(request)
    if not eh_admin(request):
        raise HTTPException(status_code=403, detail="Só administradores.")
    try:
        pid = _backup_pasta_id()
        q = ("'%s' in parents and trashed = false" % pid)
        r = _drive_get("/files", {"q": q, "fields": "files(id,name,size,modifiedTime)",
                                  "orderBy": "name desc", "pageSize": "60",
                                  "includeItemsFromAllDrives": "true",
                                  "supportsAllDrives": "true"})
        return {"ok": True, "arquivos": r.get("files", []), "ultimo": _backup_estado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:200])



# ============================================================
#  LOGIN: GUARDA, SENHA, SESSAO  (v3.307)
#
#  ONDE OS USUARIOS MORAM. Dentro do fourtime-banco.json, no Drive, numa
#  chave IRMA de "data". Isso importa: "data" e o banco que vai inteiro para
#  o navegador de todo mundo; "usuarios" fica de fora e nunca sai daqui.
#
#  Nao criei arquivo separado de proposito. A service account do Google NAO
#  CONSEGUE CRIAR arquivos no Drive (contas de servico nao tem cota; ver o
#  aviso do grava_banco_drive). Um arquivo novo exigiria o Henrique cria-lo a
#  mao antes de qualquer um conseguir entrar, e login que depende de um passo
#  manual para funcionar no primeiro dia e login que trava a empresa.
#
#  O sqlite continua sendo o espelho local, como ja e para o banco: se o
#  Drive estiver fora do ar, ninguem fica trancado do lado de fora.
# ============================================================
_usuarios_cache = None          # lista de dicts; None = ainda nao lida
_usuarios_lock = threading.Lock()
# DE ONDE VEIO E SE FICOU GRAVADO (v3.308). O risco que isto fecha: se a
# escrita no Drive falhasse, os usuarios existiriam so no sqlite do Render,
# que e efemero. Num reinicio a lista sumiria, o servidor semearia de novo e
# TODO MUNDO voltaria para a senha de partida, sem ninguem perceber. Agora a
# tela de usuarios mostra isso em vermelho.
_usuarios_fonte = ""            # "drive" | "local" | "semente"
_usuarios_drive_ok = None       # True/False/None(nao tentou)


def _senha_guarda(senha):
    """scrypt, da biblioteca padrao do Python: nada novo para instalar no
       Render. Sal proprio por pessoa, entao duas senhas iguais nao produzem
       o mesmo registro."""
    sal = secrets.token_hex(16)
    h = hashlib.scrypt(senha.encode("utf-8"), salt=bytes.fromhex(sal),
                       n=16384, r=8, p=1, dklen=32).hex()
    return "scrypt$16384$8$1$%s$%s" % (sal, h)


def _senha_confere(guardado, senha):
    try:
        _, n, r, p, sal, h = (guardado or "").split("$")
        calc = hashlib.scrypt(senha.encode("utf-8"), salt=bytes.fromhex(sal),
                              n=int(n), r=int(r), p=int(p), dklen=32).hex()
        return hmac.compare_digest(calc, h)     # comparacao de tempo constante
    except Exception:
        return False


def _semear():
    """A equipe inicial. So roda quando nao ha lista nenhuma."""
    return [{"u": u, "nome": nome, "papel": papel, "ativo": True,
             "senha": _senha_guarda(sen), "trocar": True, "criadoEm": agora()}
            for (u, nome, papel, sen) in FT_SEMENTE]


def _usuarios_do_local():
    try:
        with conn() as c:
            linhas = c.execute("SELECT json FROM usuarios").fetchall()
        return [json.loads(l["json"]) for l in linhas] or None
    except Exception:
        return None


def _usuarios_no_local(lista):
    try:
        with conn() as c:
            c.execute("DELETE FROM usuarios")
            for x in lista:
                c.execute("INSERT INTO usuarios(u,json) VALUES(?,?)",
                          (x["u"], json.dumps(x, ensure_ascii=False)))
    except Exception:
        pass


def usuarios_ler(forcar=False):
    global _usuarios_cache, _usuarios_fonte, _usuarios_drive_ok
    if _usuarios_cache is not None and not forcar:
        return _usuarios_cache
    with _usuarios_lock:
        if _usuarios_cache is not None and not forcar:
            return _usuarios_cache
        lista = None
        if drive_ligado():
            try:
                d = le_banco_drive()
                if d and isinstance(d.get("usuarios"), list) and d["usuarios"]:
                    lista = d["usuarios"]
                    _usuarios_fonte = "drive"
                    _usuarios_drive_ok = True
            except Exception:
                lista = None
        if lista is None:
            lista = _usuarios_do_local()
            if lista:
                _usuarios_fonte = "local"
        if not lista:
            lista = _semear()
            _usuarios_fonte = "semente"
            _usuarios_cache = lista
            _usuarios_no_local(lista)
            usuarios_gravar(lista)      # sobe a semente para o Drive
            return _usuarios_cache
        _usuarios_cache = lista
        _usuarios_no_local(lista)
        return _usuarios_cache


def _usuarios_para_gravar():
    """O que o grava_banco_drive deve carregar junto. None quando a lista
       ainda nem foi lida, para nunca gravar uma lista vazia por cima de uma
       cheia."""
    return _usuarios_cache


def usuarios_gravar(lista):
    """Grava a lista nos dois lugares, e CONFERE o Drive lendo de volta.

       A conferencia existe porque o modo de falhar aqui e silencioso e caro:
       sem ela, uma escrita recusada deixaria os usuarios so no sqlite do
       Render, que e efemero, e o proximo reinicio devolveria todo mundo para
       a senha de partida sem aviso nenhum."""
    global _usuarios_cache, _usuarios_drive_ok
    _usuarios_cache = lista
    _usuarios_no_local(lista)
    if not drive_ligado():
        _usuarios_drive_ok = None
        return
    try:
        with _db_lock:
            atual = None
            try:
                atual = le_banco_drive()
            except Exception:
                atual = None
            rev = (atual or {}).get("rev", 0)
            data = (atual or {}).get("data", {})
            grava_banco_drive(rev, data)
        # le de volta: gravou mesmo?
        conf = le_banco_drive()
        gravados = (conf or {}).get("usuarios")
        _usuarios_drive_ok = bool(isinstance(gravados, list)
                                  and len(gravados) == len(lista))
    except Exception:
        _usuarios_drive_ok = False


def acha_usuario(u):
    u = (u or "").strip().lower()
    for x in usuarios_ler():
        if x.get("u") == u:
            return x
    return None


def pode(usuario, permissao):
    if not usuario:
        return False
    # A ATIVIDADE NAO E UM PAPEL, E UMA MARCA NA PESSOA.
    #
    # Os outros acessos vem do papel: quem e vendedor pode o que vendedor
    # pode. O Relatorio de Atividade nao cabe nesse molde. Quem planeja a
    # producao nao e um cargo do sistema: hoje e a Patricia, que e editora,
    # amanha pode ser alguem do financeiro. Fazer disso um papel obrigaria a
    # mudar o cargo da pessoa para dar uma tela a ela.
    #
    # Entao e uma marca ligada em cada pessoa, e admin tem sempre.
    if permissao == "atividade":
        return usuario.get("papel") == "admin" or bool(usuario.get("atividade"))
    return permissao in FT_PAPEIS.get(usuario.get("papel", ""), set())


def pode_planejar(usuario):
    """VER e MEXER sao coisas diferentes aqui. A marca da a leitura; mudar o
       dia de um pedido, ou a etapa dele, e so do admin. Um planejamento que
       qualquer um pode reescrever nao e um planejamento."""
    return bool(usuario) and usuario.get("papel") == "admin"


# ---------------- sessao ----------------
def _segredo():
    if FT_SEGREDO:
        return FT_SEGREDO.encode("utf-8")
    # Deriva do token de admin, que NAO e publico (o da equipe esta impresso
    # no HTML). Assim a sessao sobrevive a reinicio sem exigir configuracao
    # nova no Render no dia da estreia.
    return ("ft-sessao|" + (FT_ADMIN_TOKEN or FT_TOKEN)).encode("utf-8")


def sessao_cria(u, dias=None):
    exp = int(time.time()) + int((dias or FT_SESSAO_DIAS)) * 86400
    msg = "%s|%d" % (u, exp)
    assin = hmac.new(_segredo(), msg.encode("utf-8"), hashlib.sha256).hexdigest()
    return msg + "|" + assin


def sessao_le(valor):
    """Devolve o nome de usuario, ou None. Sem tabela de sessao: a assinatura
       e a prova. Por isso reiniciar o servidor nao desloga ninguem."""
    try:
        u, exp, assin = (valor or "").split("|")
        msg = "%s|%s" % (u, exp)
        certo = hmac.new(_segredo(), msg.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(certo, assin):
            return None
        if int(exp) < int(time.time()):
            return None
        return u
    except Exception:
        return None


def usuario_da_req(req: Request):
    """A pessoa por tras da requisicao, ou None."""
    nome = sessao_le(req.cookies.get(COOKIE_SESSAO, ""))
    if not nome:
        return None
    x = acha_usuario(nome)
    if not x or not x.get("ativo", True):
        return None
    return x


def _poe_cookie(resp: Response, valor, dias=None):
    resp.set_cookie(COOKIE_SESSAO, valor, max_age=int((dias or FT_SESSAO_DIAS)) * 86400,
                    httponly=True, secure=True, samesite="lax", path="/")


def _limpo(x):
    """O que pode ser dito ao navegador sobre uma pessoa. Sem o hash."""
    marcas = set(FT_PAPEIS.get(x.get("papel", ""), set()))
    if x.get("papel") == "admin" or x.get("atividade"):
        marcas.add("atividade")
    return {"u": x.get("u"), "nome": x.get("nome"), "papel": x.get("papel"),
            "ativo": x.get("ativo", True), "trocar": bool(x.get("trocar")),
            "pode": sorted(marcas),
            # a marca crua, para a tela de Pessoas desenhar o interruptor.
            # Diferente de "atividade" dentro de pode: la o admin ja entra
            # ligado por ser admin, aqui e o que esta gravado na pessoa.
            "atividade": bool(x.get("atividade")),
            # quem planeja a semana, e nao so olha
            "planeja": x.get("papel") == "admin",
            # o editor usa isto para decidir se preenche o campo Vendedor
            "vende": x.get("papel") in FT_PAPEL_VENDE}


# ---------------- endpoints de login ----------------
@app.post("/api/auth/login")
async def auth_login(request: Request):
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    u = str(corpo.get("usuario") or "").strip().lower()
    senha = str(corpo.get("senha") or "")
    x = acha_usuario(u)
    # A MESMA resposta para usuario que nao existe e senha errada: dizer qual
    # dos dois falhou entrega metade da informacao a quem esta tentando.
    if not x or not x.get("ativo", True) or not _senha_confere(x.get("senha"), senha):
        time.sleep(0.4)          # atraso de proposito, contra tentativa em massa
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")
    resp = JSONResponse({"ok": True, "usuario": _limpo(x)})
    _poe_cookie(resp, sessao_cria(x["u"]))
    return resp


@app.post("/api/auth/sair")
def auth_sair():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE_SESSAO, path="/")
    return resp


@app.get("/api/auth/eu")
def auth_eu(request: Request):
    if FT_LOGIN_DESLIGADO:
        return {"ok": True, "login": False,
                "usuario": {"u": "", "nome": "", "papel": "admin",
                            "trocar": False, "pode": sorted(FT_PAPEIS["admin"])}}
    x = usuario_da_req(request)
    if not x:
        raise HTTPException(status_code=401, detail="Sem sessão.")
    return {"ok": True, "login": True, "usuario": _limpo(x)}


@app.post("/api/auth/senha")
async def auth_senha(request: Request):
    """Trocar a propria senha. Exige a atual, mesmo quando e a de partida:
       sem isso, um computador deixado aberto vira uma conta roubada."""
    x = usuario_da_req(request)
    if not x:
        raise HTTPException(status_code=401, detail="Sem sessão.")
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    atual = str(corpo.get("atual") or "")
    nova = str(corpo.get("nova") or "")
    if not _senha_confere(x.get("senha"), atual):
        time.sleep(0.4)
        raise HTTPException(status_code=401, detail="A senha atual está incorreta.")
    erro = _senha_fraca(nova)
    if erro:
        raise HTTPException(status_code=400, detail=erro)
    if _senha_confere(x.get("senha"), nova):
        raise HTTPException(status_code=400, detail="A senha nova tem de ser diferente da atual.")
    lista = [dict(y) for y in usuarios_ler()]
    for y in lista:
        if y["u"] == x["u"]:
            y["senha"] = _senha_guarda(nova)
            y["trocar"] = False
            y["senhaEm"] = agora()
    usuarios_gravar(lista)
    resp = JSONResponse({"ok": True})
    _poe_cookie(resp, sessao_cria(x["u"]))     # renova, para nao cair no meio
    return resp


def _senha_fraca(s):
    """Regra curta de proposito. Senha comprida e melhor que senha cheia de
       simbolo que a pessoa anota num papel colado no monitor."""
    s = s or ""
    if len(s) < 8:
        return "A senha precisa ter pelo menos 8 caracteres."
    if s.strip() == "":
        return "A senha não pode ser só espaços."
    if s in (SENHA_INICIAL_ADMIN, SENHA_INICIAL_EQUIPE):
        return "Essa é a senha de partida. Escolha uma sua."
    if s.lower() in ("12345678", "123456789", "senha123", "fourtime", "fourtime2026"):
        return "Essa senha é fácil demais de adivinhar."
    return ""


# ---------------- administracao de usuarios ----------------
@app.get("/api/auth/usuarios")
def auth_usuarios(request: Request):
    exige_pode(request, "admin")
    lista = usuarios_ler()
    return {"ok": True, "usuarios": [_limpo(x) for x in lista],
            "papeis": sorted(FT_PAPEIS.keys()),
            # onde a lista mora AGORA. Se o Drive estiver ligado e a gravacao
            # nao tiver sido confirmada, a tela avisa em vermelho: e o unico
            # jeito de a pessoa saber antes de um reinicio apagar tudo.
            "fonte": _usuarios_fonte, "driveLigado": drive_ligado(),
            "driveOk": _usuarios_drive_ok,
            # a tela precisa DIZER qual e a senha de partida, e ela nao pode
            # estar escrita dentro do editor: o editor e um arquivo publico
            # ate para quem nao entrou. Quem sabe o valor e o servidor, e ele
            # so conta para admin.
            "senhaInicial": SENHA_INICIAL_EQUIPE}


@app.post("/api/auth/usuarios")
async def auth_usuarios_grava(request: Request):
    """Criar, alterar, desativar e resetar senha. So admin."""
    eu = exige_pode(request, "admin")
    try:
        corpo = await request.json()
    except Exception:
        corpo = {}
    acao = str(corpo.get("acao") or "").strip()
    alvo = str(corpo.get("u") or "").strip().lower()
    lista = [dict(y) for y in usuarios_ler()]
    achado = next((y for y in lista if y["u"] == alvo), None)

    if acao == "criar":
        if not re.fullmatch(r"[a-z0-9._-]{3,20}", alvo):
            raise HTTPException(status_code=400,
                detail="Usuário: de 3 a 20 caracteres, só letras minúsculas, números, ponto, hífen.")
        if achado:
            raise HTTPException(status_code=400, detail="Já existe alguém com esse usuário.")
        papel = str(corpo.get("papel") or "vendedor")
        if papel not in FT_PAPEIS:
            raise HTTPException(status_code=400, detail="Papel desconhecido.")
        senha = str(corpo.get("senha") or SENHA_INICIAL_EQUIPE)
        lista.append({"u": alvo, "nome": str(corpo.get("nome") or alvo).strip(),
                      "papel": papel, "ativo": True, "senha": _senha_guarda(senha),
                      "trocar": True, "criadoEm": agora()})
    elif not achado:
        raise HTTPException(status_code=404, detail="Não achei esse usuário.")
    elif acao == "renomear":
        # RENOMEAR DE VERDADE, e nao criar outra pessoa: a senha, o papel e a
        # marca de "ja trocou" vao junto. Criar e desativar pareceria igual e
        # nao e: mandaria a pessoa de volta para a senha de partida.
        novo_u = str(corpo.get("novo") or "").strip().lower()
        if not re.fullmatch(r"[a-z0-9._-]{3,20}", novo_u):
            raise HTTPException(status_code=400,
                detail="Usuário: de 3 a 20 caracteres, só letras minúsculas, números, ponto, hífen.")
        if novo_u == alvo:
            raise HTTPException(status_code=400, detail="O nome de usuário é esse mesmo.")
        if any(y["u"] == novo_u for y in lista):
            raise HTTPException(status_code=400, detail="Já existe alguém com esse usuário.")
        achado["u"] = novo_u
        achado["renomeadoEm"] = agora()
        usuarios_gravar(lista)
        # A SESSAO APONTA PARA O NOME ANTIGO e morre na hora. Se quem
        # renomeou foi a propria pessoa, devolvo o cookie novo aqui mesmo,
        # senao o admin se deslogaria ao arrumar o proprio usuario. Para
        # qualquer outra pessoa nao ha o que fazer: ela entra de novo.
        resp = JSONResponse({"ok": True, "renomeado": novo_u,
                             "euMesmo": alvo == (eu or {}).get("u"),
                             "usuarios": [_limpo(x) for x in usuarios_ler()]})
        if alvo == (eu or {}).get("u"):
            _poe_cookie(resp, sessao_cria(novo_u))
        return resp
    elif acao == "papel":
        papel = str(corpo.get("papel") or "")
        if papel not in FT_PAPEIS:
            raise HTTPException(status_code=400, detail="Papel desconhecido.")
        # NAO deixar a empresa sem admin: e assim que se fica trancado do lado de fora
        if achado["papel"] == "admin" and papel != "admin" and _quantos_admins(lista) <= 1:
            raise HTTPException(status_code=400,
                detail="Este é o último administrador. Promova outra pessoa antes.")
        achado["papel"] = papel
    elif acao == "atividade":
        # a marca de quem ve o Relatorio de Atividade. Em admin nao muda
        # nada: admin ve por ser admin, com marca ou sem.
        achado["atividade"] = bool(corpo.get("atividade"))
    elif acao == "nome":
        achado["nome"] = str(corpo.get("nome") or achado["nome"]).strip()
    elif acao == "ativo":
        lig = bool(corpo.get("ativo"))
        if not lig and achado["u"] == (eu or {}).get("u"):
            raise HTTPException(status_code=400, detail="Não dá para desativar você mesmo.")
        if not lig and achado["papel"] == "admin" and _quantos_admins(lista) <= 1:
            raise HTTPException(status_code=400, detail="Este é o último administrador.")
        achado["ativo"] = lig
    elif acao == "resetar":
        senha = str(corpo.get("senha") or SENHA_INICIAL_EQUIPE)
        achado["senha"] = _senha_guarda(senha)
        achado["trocar"] = True         # a pessoa troca no proximo acesso
    else:
        raise HTTPException(status_code=400, detail="Ação desconhecida.")

    usuarios_gravar(lista)
    return {"ok": True, "usuarios": [_limpo(x) for x in usuarios_ler()]}


def _quantos_admins(lista):
    return sum(1 for y in lista if y.get("papel") == "admin" and y.get("ativo", True))



# ============================================================
#  A PORTA  (v3.307)
#  Sem sessao valida, "/" devolve esta pagina em vez do editor. Ela e escrita
#  aqui dentro, e nao num arquivo ao lado, porque um arquivo pode faltar num
#  deploy e a porta ficaria sem fechadura.
# ============================================================
PAGINA_LOGIN = """<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fourtime - Entrar</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  :root{--vm:#C6161B;--pt:#161A20;--cz:#68727E;--bd:#E4E8ED;--sf:#FFFFFF;--fd:#F2F4F7;}
  body{min-height:100vh;display:grid;place-items:center;background:var(--fd);
       font-family:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
       color:var(--pt);padding:20px;}
  .cx{width:100%;max-width:380px;background:var(--sf);border:1px solid var(--bd);
      border-radius:14px;box-shadow:0 10px 34px rgba(17,18,20,.08);padding:30px 28px 26px;}
  .marca{font-size:21px;font-weight:700;letter-spacing:.14em;color:var(--vm);text-align:center;}
  .sub{font-size:12.5px;color:var(--cz);text-align:center;margin-top:5px;margin-bottom:24px;}
  label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;
        text-transform:uppercase;color:var(--cz);margin:0 0 6px;}
  input{width:100%;height:44px;padding:0 13px;font:inherit;font-size:14.5px;color:var(--pt);
        background:#FBFCFD;border:1.5px solid var(--bd);border-radius:10px;outline:none;}
  input:focus{border-color:var(--vm);box-shadow:0 0 0 3px rgba(198,22,27,.13);}
  .campo{margin-bottom:15px;}
  button{width:100%;height:44px;border:1px solid var(--vm);border-radius:10px;background:var(--vm);
         color:#fff;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;margin-top:5px;}
  button:hover{filter:brightness(1.07);}
  button:disabled{opacity:.6;cursor:progress;}
  .msg{font-size:12.5px;line-height:1.45;margin-top:13px;min-height:17px;}
  .msg.erro{color:var(--vm);font-weight:600;}
  .msg.ok{color:#17803D;font-weight:600;}
  .msg.info{color:var(--cz);}
  .aviso{background:#FDF1F1;border:1px solid #F3C9CB;border-radius:10px;padding:11px 13px;
         font-size:12.5px;line-height:1.5;color:#8E1216;margin-bottom:19px;}
  .pe{margin-top:20px;font-size:11.5px;color:var(--cz);text-align:center;line-height:1.5;}
  .oculto{display:none;}
</style></head><body>
<div class="cx">
  <div class="marca">FOURTIME</div>
  <div class="sub" id="sub">Entre para usar o editor de orçamentos</div>

  <form id="fLogin" autocomplete="on">
    <div class="campo"><label for="u">Usuário</label>
      <input id="u" name="username" autocomplete="username" autocapitalize="none"
             spellcheck="false" autofocus></div>
    <div class="campo"><label for="s">Senha</label>
      <input id="s" name="password" type="password" autocomplete="current-password"></div>
    <button id="bt" type="submit">Entrar</button>
    <div class="msg" id="m"></div>
  </form>

  <form id="fTroca" class="oculto" autocomplete="on">
    <div class="aviso"><b>Troque a senha para continuar.</b><br>
      A senha de partida é a mesma para várias pessoas e já foi compartilhada.
      Enquanto ela não for trocada, o editor não abre.</div>
    <div class="campo"><label for="n1">Nova senha</label>
      <input id="n1" type="password" autocomplete="new-password"></div>
    <div class="campo"><label for="n2">Repita a nova senha</label>
      <input id="n2" type="password" autocomplete="new-password"></div>
    <button id="bt2" type="submit">Salvar e entrar</button>
    <div class="msg" id="m2">Pelo menos 8 caracteres.</div>
  </form>

  <div class="pe">Esqueceu a senha? Peça a um administrador para redefinir.</div>
</div>
<script>
(function(){
  var fL=document.getElementById('fLogin'), fT=document.getElementById('fTroca');
  var m=document.getElementById('m'), m2=document.getElementById('m2');
  var bt=document.getElementById('bt'), bt2=document.getElementById('bt2');
  var atual='';
  function diz(el,tipo,txt){ el.className='msg '+tipo; el.textContent=txt; }

  fL.addEventListener('submit', async function(e){
    e.preventDefault();
    var u=document.getElementById('u').value.trim();
    var s=document.getElementById('s').value;
    if(!u||!s){ diz(m,'erro','Preencha usuário e senha.'); return; }
    bt.disabled=true; diz(m,'info','Entrando...');
    try{
      var r=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({usuario:u,senha:s})});
      var d=await r.json().catch(function(){return {};});
      if(!r.ok){ diz(m,'erro',d.detail||'Não consegui entrar.'); return; }
      atual=s;
      if(d.usuario && d.usuario.trocar){
        document.getElementById('sub').textContent='Olá, '+(d.usuario.nome||u)+'. Falta um passo.';
        fL.className='oculto'; fT.className='';
        setTimeout(function(){document.getElementById('n1').focus();},60);
        return;
      }
      diz(m,'ok','Pronto. Abrindo o editor...');
      location.replace('/');
    }catch(err){ diz(m,'erro','Sem conexão com o servidor.'); }
    finally{ bt.disabled=false; }
  });

  fT.addEventListener('submit', async function(e){
    e.preventDefault();
    var a=document.getElementById('n1').value, b=document.getElementById('n2').value;
    if(a!==b){ diz(m2,'erro','As duas senhas não são iguais.'); return; }
    if(a.length<8){ diz(m2,'erro','Pelo menos 8 caracteres.'); return; }
    bt2.disabled=true; diz(m2,'info','Salvando...');
    try{
      var r=await fetch('/api/auth/senha',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({atual:atual,nova:a})});
      var d=await r.json().catch(function(){return {};});
      if(!r.ok){ diz(m2,'erro',d.detail||'Não consegui trocar.'); return; }
      diz(m2,'ok','Senha trocada. Abrindo o editor...');
      location.replace('/');
    }catch(err){ diz(m2,'erro','Sem conexão com o servidor.'); }
    finally{ bt2.disabled=false; }
  });
})();
</script></body></html>"""


@app.get("/")
def raiz(request: Request):
    # A PORTA (v3.307). Sem sessao, o editor nem sai do servidor. Antes ele
    # era entregue a qualquer um que soubesse o endereco, com a chave da
    # equipe escrita dentro.
    _eu = None if FT_LOGIN_DESLIGADO else usuario_da_req(request)
    if not FT_LOGIN_DESLIGADO and (not _eu or _eu.get("trocar")):
        # sem sessao, OU com a senha de partida ainda de pe
        return Response(PAGINA_LOGIN, media_type="text/html; charset=utf-8",
                        headers={"Cache-Control": "no-store"})
    p = _editor_path()
    if p:
        # ================================================================
        # REVALIDAR EM VEZ DE REBAIXAR (v3.337)
        #
        # Antes: "no-store". O navegador era proibido até de GUARDAR o
        # arquivo, então cada F5 baixava 1,49 MB de novo. Multiplicado por
        # todo mundo, todos os dias, foi o que estourou a banda do Render.
        #
        # O medo por trás do no-store era legítimo e continua atendido: o
        # editor NUNCA pode abrir numa versão velha. Só que "não guarde"
        # e "confira se mudou" são coisas diferentes. Com "no-cache" o
        # navegador guarda mas é OBRIGADO a perguntar ao servidor antes de
        # usar; se o arquivo não mudou, a resposta é um 304 de algumas
        # centenas de bytes e ele usa o que já tem.
        #
        # Fica idêntico para quem usa, e a conta muda de ordem:
        #     abrir depois de um deploy   1,49 MB  ->  533 KB (gzip)
        #     todo F5 entre dois deploys  1,49 MB  ->  ~0,3 KB
        #
        # A etiqueta é o mtime mais o tamanho do arquivo: publicar uma
        # versão nova troca os dois, e o 304 deixa de valer na hora.
        # ================================================================
        try:
            _st = os.stat(p)
            etiqueta = '"ft-%d-%d"' % (int(_st.st_mtime), _st.st_size)
        except OSError:
            etiqueta = ""
        # PRIVATE, e não só no-cache. O editor só sai daqui para quem tem
        # sessão (a porta da v3.307): sem o `private`, um cache
        # compartilhado no caminho (a borda do Render, um proxy de
        # empresa) teria permissão para GUARDAR o arquivo do editor. Ele
        # ainda revalidaria antes de servir, e sem o cookie a origem
        # devolveria a tela de login em vez de um 304 — mas guardar o que
        # é de sessão não é coisa que se deixe por conta da sorte.
        # O Vary: Accept-Encoding quem põe é o gzip do middleware.
        cabec = {"Cache-Control": "private, no-cache, must-revalidate, max-age=0"}
        if etiqueta:
            cabec["ETag"] = etiqueta
            recebida = request.headers.get("if-none-match", "")
            if etiqueta in [t.strip() for t in recebida.split(",") if t.strip()]:
                # o navegador já tem esta versão inteira
                return Response(status_code=304, headers=cabec)
        return FileResponse(p, media_type="text/html", headers=cabec)
    return {"servidor": "Fourtime Etapa 02", "editor": "nenhum editor*.html na pasta"}
