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
from fastapi.responses import FileResponse, JSONResponse
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
