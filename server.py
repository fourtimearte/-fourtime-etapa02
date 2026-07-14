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
import os, json, glob, sqlite3, threading
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware

FT_TOKEN = os.environ.get("FT_TOKEN", "fourtime2026")
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

@app.get("/api/db")
def ler_db(request: Request):
    exige_token(request)
    with conn() as c:
        r = c.execute("SELECT rev,data,atualizado FROM banco WHERE id=1").fetchone()
    return {"rev": r["rev"], "data": json.loads(r["data"]), "atualizado": r["atualizado"]}

@app.put("/api/db")
async def gravar_db(request: Request):
    exige_token(request)
    corpo = await request.json()
    rev_cliente = int(corpo.get("rev", 0))
    dados = corpo.get("data")
    if not isinstance(dados, dict):
        raise HTTPException(status_code=400, detail="Campo 'data' inválido")
    with _lock, conn() as c:
        atual = c.execute("SELECT rev,data FROM banco WHERE id=1").fetchone()
        if rev_cliente < atual["rev"]:
            # cliente está desatualizado — devolve a versão do servidor
            return JSONResponse(status_code=409, content={
                "rev": atual["rev"], "data": json.loads(atual["data"]),
                "detalhe": "Banco no servidor é mais novo. Sincronize antes de gravar."})
        nova_rev = atual["rev"] + 1
        c.execute("UPDATE banco SET rev=?,data=?,atualizado=? WHERE id=1",
                  (nova_rev, json.dumps(dados, ensure_ascii=False), agora()))
    return {"rev": nova_rev, "ok": True}

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
                    info, scopes=["https://www.googleapis.com/auth/drive.readonly"])
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
def _editor_path():
    achados = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "*editor*.html")))
    return achados[-1] if achados else None

@app.get("/")
def raiz():
    p = _editor_path()
    if p:
        return FileResponse(p, media_type="text/html")
    return {"servidor": "Fourtime Etapa 02", "editor": "nenhum editor*.html na pasta"}
