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
import os, re, json, glob, sqlite3, threading
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware

FT_TOKEN = os.environ.get("FT_TOKEN", "fourtime2026")
# Token do ADMIN: só quem tem este pode APAGAR ou RENOMEAR itens do banco.
# Sem ele, o servidor MESCLA tudo — ninguém consegue destruir o trabalho alheio.
FT_ADMIN_TOKEN = os.environ.get("FT_ADMIN_TOKEN", "").strip()
# Versão MÍNIMA do editor aceita para GRAVAR. Editores antigos têm um banco
# local possivelmente velho — e a mesclagem ressuscitaria itens já apagados.
# Ler, qualquer versão pode; gravar, só quem está em dia.
FT_EDITOR_MINIMO = os.environ.get("FT_EDITOR_MINIMO", "3.131").strip()
DB_PATH  = os.environ.get("FT_DB_PATH", os.path.join(os.path.dirname(__file__), "fourtime.db"))

app = FastAPI(title="Fourtime Etapa 02", docs_url=None, redoc_url=None)
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
        if not c.execute("SELECT 1 FROM banco WHERE id=1").fetchone():
            c.execute("INSERT INTO banco(id,rev,data,atualizado) VALUES(1,0,'{}',?)",
                      (agora(),))
init_db_done = False

def agora():
    return datetime.now(timezone.utc).isoformat()

def exige_token(req: Request):
    tok = req.headers.get("X-FT-Token", "")
    if tok != FT_TOKEN:
        raise HTTPException(status_code=401, detail="Token inválido")

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
    """Como saber se dois itens são 'o mesmo'."""
    if isinstance(item, dict):
        return str(item.get("n", "")).strip().upper()
    return str(item).strip().upper()

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
                    if valor not in (None, "", []):
                        junto[campo] = valor
                saida[indice[k]] = junto
        else:
            indice[k] = len(saida)
            saida.append(it)
    return saida

LAPIDES = "_removidos"   # não é categoria do banco: não aparece na tela

def mescla_banco(base, novo, remocoes=None, admin=False):
    """Une base + novo. Itens com LÁPIDE não voltam — é isso que impede um
       navegador com banco velho de ressuscitar o que já foi apagado."""
    base = base or {}
    novo = novo or {}
    lapides = dict(base.get(LAPIDES) or {})

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
    return saida

def eh_admin(request: Request) -> bool:
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

@app.put("/api/db")
async def gravar_db(request: Request):
    exige_token(request)
    exige_editor_atual(request)          # editor velho não grava (ressuscitaria itens)
    corpo = await request.json()
    dados = corpo.get("data")
    if not isinstance(dados, dict):
        raise HTTPException(status_code=400, detail="Campo 'data' inválido")

    remocoes = corpo.get("remocoes") or {}
    if remocoes and not eh_admin(request):
        raise HTTPException(status_code=403, detail=(
            "Só o administrador pode apagar ou renomear itens do banco. "
            "Suas ADIÇÕES foram preservadas; as exclusões, não."))
    admin = eh_admin(request)

    if not drive_ligado():
        with _lock, conn() as c:
            atual = c.execute("SELECT rev,data FROM banco WHERE id=1").fetchone()
            base = json.loads(atual["data"])
            junto = mescla_banco(base, dados, remocoes if admin else None, admin=admin)
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
        junto = mescla_banco(base, dados, remocoes if admin else None, admin=admin)

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
    itens = {k: len(v) for k, v in (d.get("data") or {}).items() if isinstance(v, list)}
    return {"onde": "drive", "persistente": True, "arquivo": DB_NOME,
            "pasta": _pasta_do_banco(), "existe": True,
            "rev": d.get("rev"), "atualizado": d.get("atualizado"), "itens": itens}

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
    corpo = json.dumps({"rev": rev, "data": data, "atualizado": agora()},
                       ensure_ascii=False).encode("utf-8")
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
                                headers={"Cache-Control": "public, max-age=86400"})
            except Exception:
                time.sleep(0.4 * (n + 1))
    dados, tipo = _drive_get("/files/" + fid, {"alt": "media", "supportsAllDrives": "true"}, binario=True)
    return Response(content=dados, media_type=tipo or "image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})

@app.get("/api/drive/imagem/{fid}")
def drive_imagem(fid: str, request: Request):
    """Arquivo ORIGINAL, byte a byte, sem qualquer compressão ou conversão."""
    exige_token(request)
    exige_drive()
    if not _dentro_da_raiz(fid):
        raise HTTPException(status_code=403, detail="Arquivo fora da raiz permitida.")
    dados, tipo = _drive_get("/files/" + fid, {"alt": "media", "supportsAllDrives": "true"}, binario=True)
    return Response(content=dados, media_type=tipo or "image/jpeg",
                    headers={"Cache-Control": "public, max-age=3600"})

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

# ---------------- Prova reaproveitada: JWT do quadro + cartão é daquele quadro
# Mesma lógica que o GET /api/trello/anexo já usa. Foi extraída para as rotas
# novas (remover e metadados) não repetirem — e para que TODAS compartilhem
# exatamente a mesma verificação RS256 e o mesmo token de serviço.
def _prova_cartao(request: Request, card: str) -> dict:
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
    return dados

def _apaga_anexo(card: str, anexo: str) -> None:
    """Remove o anexo no Trello com o token de serviço. A exclusão é DEFINITIVA."""
    url = ("https://api.trello.com/1/cards/%s/attachments/%s?key=%s&token=%s"
           % (urllib.parse.quote(card), urllib.parse.quote(anexo),
              urllib.parse.quote(FT_TRELLO_KEY), urllib.parse.quote(FT_TRELLO_TOKEN)))
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except urllib.error.HTTPError as e:
        corpo = e.read().decode("utf-8", "ignore")[:200]
        if e.code == 404:
            return                      # já não existe: tratamos como sucesso
        if e.code in (401, 403):
            raise HTTPException(status_code=502,
                detail="O token de serviço não pode remover este anexo. " + corpo)
        raise HTTPException(status_code=e.code, detail="Trello recusou: " + corpo)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Falha ao remover o anexo: %r" % (e,))

@app.delete("/api/trello/anexo")
def trello_anexo_remover(request: Request, anexo: str, card: str = ""):
    """Remove UM anexo do cartão. Mesma prova do GET: o JWT diz o quadro e o
       membro; o servidor confere que o cartão é daquele quadro antes de apagar.
       Quem apaga de fato é o SERVIDOR, com o token de serviço — a equipe não
       precisa autorizar nada. ATENÇÃO: anexo excluído no Trello não volta."""
    _prova_cartao(request, card)
    if not anexo:
        raise HTTPException(status_code=400, detail="Faltou o anexo.")
    _apaga_anexo(card, anexo)
    return Response(status_code=204)

def _meta_anexos(card: str):
    """Lista os anexos do cartão com a data de envio (campo `date` do Trello)."""
    url = ("https://api.trello.com/1/cards/%s/attachments?fields=id,name,bytes,date&key=%s&token=%s"
           % (urllib.parse.quote(card), urllib.parse.quote(FT_TRELLO_KEY),
              urllib.parse.quote(FT_TRELLO_TOKEN)))
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        corpo = e.read().decode("utf-8", "ignore")[:200]
        raise HTTPException(status_code=e.code, detail="Trello recusou: " + corpo)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Falha ao ler os anexos: %r" % (e,))

@app.get("/api/trello/anexos")
def trello_anexos(request: Request, card: str = ""):
    """Metadados dos anexos do cartão — inclui a data de envio de cada um.
       Fallback usado pela seção quando o Trello não entrega o campo `date`
       direto no cliente. Mesma prova de quadro do resto das rotas."""
    _prova_cartao(request, card)
    itens = _meta_anexos(card)
    magro = [{"id": a.get("id"), "name": a.get("name"),
              "bytes": a.get("bytes"), "date": a.get("date")}
             for a in itens if isinstance(a, dict)]
    return JSONResponse(magro)

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
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            trecho = f.read(400000)      # a constante fica no começo do script
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

def _orc_ano_mes(nome):
    """Extrai DDMMAA do nome do arquivo. Sem data -> hoje."""
    m = re.search(r"(\d{2})(\d{2})(\d{2})", nome or "")
    if m:
        dd, mm, aa = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mm <= 12 and 1 <= dd <= 31:
            return 2000 + aa, mm
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

def _orc_pasta_destino(ano, mes):
    """Acha (ou cria) 'Orçamentos Organizados' > ANO > 'ANO - MM - MÊS'.
       Devolve (id, 'caminho legível')."""
    raiz_org = _orc_subpasta_raiz(FT_PASTA_ORGANIZADOS)
    nome_ano, nome_mes = str(ano), _orc_nome_pasta_mes(ano, mes)
    chave = FT_PASTA_ORGANIZADOS + "/" + nome_ano + "/" + nome_mes
    if chave in _orc_pastas_cache:
        return _orc_pastas_cache[chave], nome_ano + "/" + nome_mes
    chave_ano = FT_PASTA_ORGANIZADOS + "/" + nome_ano
    pid_ano = _orc_pastas_cache.get(chave_ano) or _drive_acha_pasta(nome_ano, raiz_org)
    if not pid_ano:
        pid_ano = _drive_cria_pasta(nome_ano, raiz_org)
    _orc_pastas_cache[chave_ano] = pid_ano
    pid_mes = _drive_acha_pasta(nome_mes, pid_ano)
    if not pid_mes:
        pid_mes = _drive_cria_pasta(nome_mes, pid_ano)
    _orc_pastas_cache[chave] = pid_mes
    return pid_mes, nome_ano + "/" + nome_mes

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


def _orc_salva_via_script(nome, destino, ano, mes, conteudo_texto):
    """Plano B da GRAVAÇÃO: o Apps Script cria as pastas e o arquivo."""
    dados = {"acao": "salvar", "nome": nome, "conteudo": conteudo_texto, "destino": destino}
    if destino == "organizado":
        dados["ano"] = str(ano)
        dados["mesPasta"] = _orc_nome_pasta_mes(ano, mes)
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
    """Devolve o nome da PRÓXIMA versão dentro da pasta.
       O arquivo sem sufixo conta como v1, então a próxima nasce -v2."""
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
    ano = mes = None
    if destino == "organizado":
        ano, mes = _orc_ano_mes(nome)
        caminho = "%d/%s" % (ano, _orc_nome_pasta_mes(ano, mes))
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
            pid, _cam = _orc_pasta_destino(ano, mes)
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
                fid = _orc_salva_via_script(nome, destino, ano, mes, texto)
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
                fid = _orc_salva_via_script(nome, destino, ano, mes, texto)
                return {"ok": True, "id": fid, "pasta": caminho, "acao": "criado",
                        "destino": destino, "nome": nome, "via": "apps-script"}
            except Exception as e2:
                raise HTTPException(status_code=502,
                    detail="Falha na service account e no Apps Script: %s" % str(e2)[:300])
        raise HTTPException(status_code=500, detail="Erro ao salvar: %s" % str(e)[:300])

@app.get("/api/ft/buscar")
def ft_buscar(request: Request, q: str = ""):
    exige_token(request)
    exige_orcamentos()
    q = (q or "").strip()
    filtro = ("trashed = false and mimeType != 'application/vnd.google-apps.folder'"
              " and name contains '.ft'")
    if q:
        filtro += " and name contains '%s'" % q.replace("'", "\\'")
    r = _drive_get("/files", {
        "q": filtro, "orderBy": "modifiedTime desc", "pageSize": "60",
        "fields": "files(id,name,modifiedTime,size,parents)",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true"})
    itens = []
    for f in r.get("files", []):
        if not f["name"].lower().endswith(".ft"):
            continue
        if not _orc_dentro(f["id"]):
            continue        # a service account enxerga outras pastas: só valem os orçamentos
        itens.append({"id": f["id"], "nome": f["name"],
                      "modificado": f.get("modifiedTime", ""),
                      "tamanho": int(f.get("size") or 0)})
        if len(itens) >= 30:
            break
    itens.sort(key=lambda a: a["modificado"], reverse=True)   # mais recentes primeiro
    return {"ok": True, "itens": itens}


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
    onde = ""
    try:
        pai = _pai(fid)
        if pai and pai == _orc_subpasta_raiz(FT_PASTA_TRABALHO):
            onde = "trabalho"
        elif pai:
            onde = "organizado"
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


@app.get("/")
def raiz():
    p = _editor_path()
    if p:
        # SEM CACHE: o navegador não pode servir uma versão velha do editor.
        # Isso NÃO recarrega ninguém no meio do trabalho — só garante que,
        # ao ABRIR o editor da próxima vez, venha a versão publicada.
        return FileResponse(p, media_type="text/html", headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        })
    return {"servidor": "Fourtime Etapa 02", "editor": "nenhum editor*.html na pasta"}
