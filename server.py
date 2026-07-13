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
#  Variáveis de ambiente:
#    FT_DRIVE_CREDENCIAIS = conteúdo do JSON da service account
#    FT_DRIVE_PASTA       = ID da pasta raiz de layouts no Drive
# ============================================================
FT_DRIVE_CREDENCIAIS = os.environ.get("FT_DRIVE_CREDENCIAIS", "")
FT_DRIVE_PASTA = os.environ.get("FT_DRIVE_PASTA", "")

_drive = None
_drive_lock = threading.Lock()

def drive():
    """Cliente do Drive, criado uma única vez."""
    global _drive
    if _drive is None:
        with _drive_lock:
            if _drive is None:
                from google.oauth2 import service_account
                from googleapiclient.discovery import build
                info = json.loads(FT_DRIVE_CREDENCIAIS)
                cred = service_account.Credentials.from_service_account_info(
                    info, scopes=["https://www.googleapis.com/auth/drive.readonly"])
                _drive = build("drive", "v3", credentials=cred, cache_discovery=False)
    return _drive

def exige_drive():
    if not FT_DRIVE_CREDENCIAIS or not FT_DRIVE_PASTA:
        raise HTTPException(status_code=503,
            detail="Banco de Imagens não configurado no servidor (FT_DRIVE_CREDENCIAIS / FT_DRIVE_PASTA).")

# --- segurança: só devolve arquivos que estejam dentro da pasta raiz ---
def _dentro_da_raiz(fid: str, profundidade: int = 12) -> bool:
    """Sobe pela cadeia de pais até achar a pasta raiz. Impede acessar fora dela."""
    svc = drive()
    atual = fid
    for _ in range(profundidade):
        if atual == FT_DRIVE_PASTA:
            return True
        meta = svc.files().get(fileId=atual, fields="parents",
                               supportsAllDrives=True).execute()
        pais = meta.get("parents") or []
        if not pais:
            return False
        atual = pais[0]
    return False

@app.get("/api/drive/status")
def drive_status(request: Request):
    exige_token(request)
    return {"ativo": bool(FT_DRIVE_CREDENCIAIS and FT_DRIVE_PASTA), "raiz": FT_DRIVE_PASTA}

@app.get("/api/drive/listar")
def drive_listar(request: Request, pasta: str = "", busca: str = ""):
    """Lista subpastas e imagens. 'pasta' vazia = pasta raiz. 'busca' procura em toda a árvore."""
    exige_token(request)
    exige_drive()
    svc = drive()
    alvo = pasta or FT_DRIVE_PASTA
    if pasta and not _dentro_da_raiz(pasta):
        raise HTTPException(status_code=403, detail="Pasta fora da raiz permitida.")

    termo = (busca or "").strip()
    if termo:
        # busca por nome em toda a árvore compartilhada (só imagens)
        seguro = termo.replace("'", "\\'")
        q = ("mimeType contains 'image/' and trashed = false "
             f"and name contains '{seguro}'")
    else:
        q = f"'{alvo}' in parents and trashed = false"

    itens, page = [], None
    while True:
        r = svc.files().list(
            q=q, pageSize=200, pageToken=page,
            orderBy="folder,name",
            fields="nextPageToken, files(id,name,mimeType,thumbnailLink,modifiedTime,size)",
            includeItemsFromAllDrives=True, supportsAllDrives=True).execute()
        itens.extend(r.get("files", []))
        page = r.get("nextPageToken")
        if not page or len(itens) >= 600:
            break

    pastas, imagens = [], []
    for f in itens:
        if f["mimeType"] == "application/vnd.google-apps.folder":
            if not termo:
                pastas.append({"id": f["id"], "nome": f["name"]})
        elif f["mimeType"].startswith("image/"):
            imagens.append({
                "id": f["id"], "nome": f["name"], "tipo": f["mimeType"],
                "miniatura": f"/api/drive/miniatura/{f['id']}",
                "atualizado": f.get("modifiedTime", ""),
                "tamanho": int(f.get("size") or 0),
            })

    caminho = []
    if not termo and alvo != FT_DRIVE_PASTA:
        atual = alvo
        for _ in range(12):
            meta = svc.files().get(fileId=atual, fields="id,name,parents",
                                   supportsAllDrives=True).execute()
            caminho.insert(0, {"id": meta["id"], "nome": meta["name"]})
            pais = meta.get("parents") or []
            if not pais or pais[0] == FT_DRIVE_PASTA:
                break
            atual = pais[0]

    return {"pasta": alvo, "raiz": FT_DRIVE_PASTA, "caminho": caminho,
            "pastas": pastas, "imagens": imagens, "busca": termo}

def _baixar(fid: str):
    import io
    from googleapiclient.http import MediaIoBaseDownload
    svc = drive()
    meta = svc.files().get(fileId=fid, fields="name,mimeType",
                           supportsAllDrives=True).execute()
    buf = io.BytesIO()
    dl = MediaIoBaseDownload(buf, svc.files().get_media(fileId=fid, supportsAllDrives=True))
    pronto = False
    while not pronto:
        _, pronto = dl.next_chunk()
    return buf.getvalue(), meta.get("mimeType", "image/jpeg"), meta.get("name", "imagem")

@app.get("/api/drive/miniatura/{fid}")
def drive_miniatura(fid: str, request: Request):
    """Miniatura da imagem (rápida, só para a grade do painel)."""
    exige_token(request)
    exige_drive()
    if not _dentro_da_raiz(fid):
        raise HTTPException(status_code=403, detail="Arquivo fora da raiz permitida.")
    svc = drive()
    meta = svc.files().get(fileId=fid, fields="thumbnailLink",
                           supportsAllDrives=True).execute()
    link = meta.get("thumbnailLink")
    if link:
        import urllib.request
        link = link.replace("=s220", "=s400")
        with urllib.request.urlopen(link, timeout=15) as r:
            dados = r.read()
        return Response(content=dados, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})
    dados, tipo, _ = _baixar(fid)
    return Response(content=dados, media_type=tipo,
                    headers={"Cache-Control": "public, max-age=86400"})

@app.get("/api/drive/imagem/{fid}")
def drive_imagem(fid: str, request: Request):
    """Arquivo ORIGINAL, byte a byte, sem qualquer compressão ou conversão."""
    exige_token(request)
    exige_drive()
    if not _dentro_da_raiz(fid):
        raise HTTPException(status_code=403, detail="Arquivo fora da raiz permitida.")
    dados, tipo, nome = _baixar(fid)
    return Response(content=dados, media_type=tipo, headers={
        "Cache-Control": "public, max-age=3600",
        "X-FT-Nome": nome,
    })

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
