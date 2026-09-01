/* O INDICE MENSAL, NO SERVIDOR DE VERDADE (v3.326)

   O teste_atividade prova a tela. Este prova o SERVIDOR, e ele existe por
   um motivo especifico: o mock de la reescreve a regra do recado em
   JavaScript para poder rodar sem Drive. Duas copias da mesma regra
   divergem sozinhas, e quando divergirem e o teste que passa enquanto o
   produto quebra.

   Entao aqui o Drive e falsificado no nivel mais baixo possivel -- as
   funcoes que falam com o Google sao trocadas por um dicionario em
   memoria -- e o codigo do server.py roda inteiro por cima dele: as
   travas, a fusao do recado, a mudanca de mes, a lei das tres linhas e a
   migracao dos .fta.

   Sem servidor HTTP, sem navegador: e Python chamando Python. Uma suite
   que leva menos de um segundo e cobra exatamente o que o outro teste nao
   tem como cobrar. */
import { spawnSync } from 'child_process';
const DIR = import.meta.dirname + '/';

const py = `
import os, sys, json, types
sys.path.insert(0, ${JSON.stringify(DIR)})
os.environ.setdefault("FT_DB_PATH", "/tmp/ftx-teste.db")
os.environ["FT_VARRE_SEG"] = "0"          # o relogio nao roda no teste
os.environ["FT_LOGIN_DESLIGADO"] = "1"
# HOJE E 3 DE AGOSTO NESTE ARQUIVO. As fixtures vivem entre 13 e 27 de
# agosto, e desde a v3.356 a varredura passa para a segunda de hoje tudo o
# que ficou para tras. Sem fixar o dia, a suite mediria o calendario da
# maquina em vez de medir a fusao do recado, e passaria hoje para falhar
# na semana que vem. A rolagem tem secao propria, com o dia dito na mao.
os.environ["FT_HOJE_FIXO"] = "2026-08-03"
import server as S

falhas = []
def checa(rot, obtido, esperado):
    ok = json.dumps(obtido, sort_keys=True, default=str) == json.dumps(esperado, sort_keys=True, default=str)
    print(("  OK  " if ok else "  FALHOU") + "  " + rot.ljust(56)
          + "obtido=" + json.dumps(obtido, ensure_ascii=False, default=str)
          + " esperado=" + json.dumps(esperado, ensure_ascii=False, default=str))
    if not ok: falhas.append(rot)

# ------------------------------------------------------------------
# O DRIVE DE MENTIRA, NO NIVEL MAIS BAIXO
# Um dicionario nome -> bytes, mais um contador de gravacoes. Tudo o que
# o server.py faz com arquivo passa por estas quatro funcoes.
# ------------------------------------------------------------------
ARQ = {}                 # nome -> {"id":..., "corpo": bytes, "mod": "..."}
RELOGIO = [0]
def _mod():
    RELOGIO[0] += 1
    return "2026-08-17T10:00:%02d.000Z" % RELOGIO[0]

def _fake_drive_get(caminho, params=None, binario=False, tentativas=3):
    params = params or {}
    if caminho == "/files":
        q = params.get("q", "")
        fora = []
        for nome, a in ARQ.items():
            if ("name = '%s'" % nome) in q or ("name contains '.fta'" in q and nome.endswith(".fta")):
                fora.append({"id": a["id"], "name": nome, "modifiedTime": a["mod"]})
        return {"files": fora}
    if caminho.startswith("/files/"):
        fid = caminho.split("/files/")[1]
        for nome, a in ARQ.items():
            if a["id"] == fid:
                if binario or params.get("alt") == "media":
                    return a["corpo"], {}
                return {"modifiedTime": a["mod"]}
    return {"files": []} if not binario else (b"{}", {})

def _fake_grava(fid, corpo):
    for nome, a in ARQ.items():
        if a["id"] == fid:
            a["corpo"] = corpo; a["mod"] = _mod()
            return fid
    raise Exception("id desconhecido")

def _fake_acha(nome, pasta):
    a = ARQ.get(nome)
    return a["id"] if a else None

def _fake_script(dados, timeout=120):
    nome = dados["nome"]
    ARQ[nome] = {"id": "fid-" + nome, "corpo": dados["conteudo"].encode("utf-8"),
                 "mod": _mod()}
    return {"id": ARQ[nome]["id"]}

S._drive_get = _fake_drive_get
S._orc_grava_por_id = _fake_grava
S._orc_acha_arquivo = _fake_acha
S._script_post = _fake_script
S._rel_pasta = lambda: "PASTA"
S.FT_SCRIPT_ORCAMENTOS = "http://mentira"
S._ATV_MEMORIA.clear()

def le(mes):
    return json.loads(ARQ["%s.ftx" % mes]["corpo"].decode("utf-8"))

# ------------------------------------------------------------------
print("\\n=== 1. O INDICE NASCE E O CARIMBO ANDA ===")
doc = S._atv_mes_vazio("2026-08")
doc["pedidos"]["A1"] = {"id": "A1", "pedido": "PD001", "cliente": "ACME",
    "entrega": "18/08/2026", "plan": "2026-08-18", "planManual": False,
    "etapa": "", "concluidoEm": "", "sumiu": False, "total": 100}
fid, mod1 = S._atv_mes_grava("2026-08", doc, None)
checa("o arquivo do mes foi criado", "2026-08.ftx" in ARQ, True)
checa("  com um pedido dentro", len(le("2026-08")["pedidos"]), 1)
d2, _f, mod2 = S._atv_mes_le("2026-08")
checa("  e le de volta igual", d2["pedidos"]["A1"]["plan"], "2026-08-18")
carimbos = S._atv_carimbos(["2026-08", "2026-09"])
checa("o carimbo do mes existe", carimbos["2026-08"] == mod1, True)
checa("  e o de um mes sem arquivo vem vazio", carimbos["2026-09"], "")

print("\\n=== 2. O RECADO ENCOSTA EM UM CAMPO SO ===")
doc, fid, _m = S._atv_mes_le("2026-08")
doc["pedidos"]["A2"] = {"id": "A2", "pedido": "PD002", "cliente": "BETA",
    "entrega": "19/08/2026", "plan": "2026-08-19", "planManual": False,
    "etapa": "corte", "concluidoEm": "", "sumiu": False, "total": 50}
S._atv_mes_grava("2026-08", doc, fid)
doc, fid, _m = S._atv_mes_le("2026-08")
S._atv_aplica(doc, "A1", "etapa", "costura", "henrique")
S._atv_mes_grava("2026-08", doc, fid)
d = le("2026-08")
checa("o recado mudou a etapa do A1", d["pedidos"]["A1"]["etapa"], "costura")
checa("  e nao encostou no A2", d["pedidos"]["A2"]["etapa"], "corte")
checa("  gravando quem foi", d["pedidos"]["A1"]["mexidoPor"], "henrique")

print("\\n=== 3. CAMPO QUE NAO E DA TELA E RECUSADO ===")
doc, fid, _m = S._atv_mes_le("2026-08")
recusou = False
try:
    S._atv_aplica(doc, "A1", "total", 999, "")
except S.HTTPException as e:
    recusou = "não é da tela" in str(e.detail)
checa("mudar o total pela tela e recusado", recusou, True)
recusou = False
try:
    S._atv_aplica(doc, "A1", "etapa", "inventada", "")
except S.HTTPException:
    recusou = True
checa("  e uma etapa que nao existe tambem", recusou, True)

print("\\n=== 4. FINALIZADO GRAVA A CONCLUSAO, E SAIR APAGA ===")
doc, fid, _m = S._atv_mes_le("2026-08")
S._atv_aplica(doc, "A1", "etapa", "finalizado", "")
checa("marcar finalizado grava a conclusao no dia planejado",
      doc["pedidos"]["A1"]["concluidoEm"], "2026-08-18")
S._atv_aplica(doc, "A1", "plan", "2026-08-13", "")
checa("escolher uma data passada move o pedido", doc["pedidos"]["A1"]["plan"], "2026-08-13")
checa("  e regrava a conclusao nela", doc["pedidos"]["A1"]["concluidoEm"], "2026-08-13")
checa("  assinando embaixo", doc["pedidos"]["A1"]["planManual"], True)
S._atv_aplica(doc, "A1", "etapa", "costura", "")
checa("sair de finalizado apaga a conclusao", doc["pedidos"]["A1"]["concluidoEm"], "")
S._atv_mes_grava("2026-08", doc, fid)

print("\\n=== 5. A LEI DAS TRES LINHAS ===")
# o Drive de orcamentos: tres pedidos, um deles ja no indice e marcado a mao
ORCS = [
  {"id": "A1", "nome": "ACME-PD001.ft", "envio": "26/08/2026", "cliente": "ACME NOVO",
   "pedido": "PD001", "dep": "Silk", "sub": 10, "per": 5},
  {"id": "A2", "nome": "BETA-PD002.ft", "envio": "21/08/2026", "cliente": "BETA",
   "pedido": "PD002", "dep": "DTF", "sub": 20, "per": 0},
  {"id": "A3", "nome": "GAMA-PD003.ft", "envio": "20/08/2026", "cliente": "GAMA",
   "pedido": "PD003", "dep": "Bordado", "sub": 7, "per": 3},
]
def _fake_fontes(ano, mes, dia):
    if (ano, mes) != (2026, 8):
        return None, []
    return "PID", [{"id": o["id"], "nome": o["nome"], "dia": 1, "mod": "m1"} for o in ORCS]
def _fake_le_orc(fid, nome, dia):
    o = [x for x in ORCS if x["id"] == fid][0]
    return {"id": fid, "arquivo": nome, "dia": 1, "cliente": o["cliente"],
            "pedido": o["pedido"], "vendedor": "Dani", "departamento": o["dep"],
            "envio": o["envio"], "subPecas": o["sub"], "perPecas": o["per"],
            "total": o["sub"] + o["per"]}
S._rel_fontes = _fake_fontes
S._atv_le_orcamento = _fake_le_orc

r = S._atv_varre("2026-08")
d = le("2026-08")
checa("a varredura criou o que nao existia", r["criados"], 1)
checa("  o A3 entrou pela data de entrega", d["pedidos"]["A3"]["plan"], "2026-08-20")
checa("  sem marca de mao nenhuma", d["pedidos"]["A3"]["planManual"], False)
checa("ATUALIZOU os campos de leitura do A1", d["pedidos"]["A1"]["cliente"], "ACME NOVO")
checa("  e o total dele", d["pedidos"]["A1"]["total"], 15)
checa("NAO moveu o A1, que esta marcado a mao", d["pedidos"]["A1"]["plan"], "2026-08-13")
checa("  nem encostou na etapa dele", d["pedidos"]["A1"]["etapa"], "costura")
checa("  e avisou que a entrega mudou", d["pedidos"]["A1"]["entregaMudou"], "18/08/2026")
checa("o A2, sem marca, acompanhou a entrega nova", d["pedidos"]["A2"]["plan"], "2026-08-21")
checa("  mas a etapa dele continua de pe", d["pedidos"]["A2"]["etapa"], "corte")

print("\\n=== 6. UM PEDIDO SO EXISTE UMA VEZ ===")
conta = {}
for nome, a in ARQ.items():
    if not nome.endswith(".ftx"): continue
    for pid in json.loads(a["corpo"].decode("utf-8")).get("pedidos", {}):
        conta[pid] = conta.get(pid, 0) + 1
checa("nenhum pedido esta em dois indices",
      sorted([k for k, n in conta.items() if n > 1]), [])

print("\\n=== 7. MUDAR DE MES MOVE DE ARQUIVO ===")
doc, fid, _m = S._atv_mes_le("2026-08")
S._atv_aplica(doc, "A3", "plan", "2026-09-02", "")
copia = json.loads(json.dumps(doc["pedidos"].pop("A3")))
S._atv_mes_grava("2026-08", doc, fid)
d9, f9, _m = S._atv_mes_le("2026-09")
d9.setdefault("pedidos", {})["A3"] = copia
S._atv_mes_grava("2026-09", d9, f9)
checa("o A3 saiu de agosto", "A3" in le("2026-08")["pedidos"], False)
checa("  e entrou em setembro", le("2026-09")["pedidos"]["A3"]["plan"], "2026-09-02")

print("\\n=== 8. QUEM SAI DA PASTA E MARCADO, NAO APAGADO ===")
ORCS = [o for o in ORCS if o["id"] != "A2"]
r = S._atv_varre("2026-08")
d = le("2026-08")
checa("o registro do A2 continua la", "A2" in d["pedidos"], True)
checa("  com a marca de que sumiu", d["pedidos"]["A2"]["sumiu"], True)
checa("  e a varredura contou", r["sumidos"] >= 1, True)

print("\\n=== 9. A MIGRACAO LIMPA A DUPLICATA DA VIAPOL ===")
# o caso de verdade: quatro pedidos finalizados na semana de 10 a 15 e ainda
# em Costura na de 17 a 22, dentro de DOIS arquivos de semana diferentes.
def semana(nome, linhas):
    ARQ[nome] = {"id": "fid-" + nome, "mod": _mod(),
        "corpo": json.dumps({"semana": nome[:-4], "linhas": linhas}).encode("utf-8")}
viapol = [{"id": "V%d" % i, "pedido": "PD00413%d" % i, "cliente": "VIAPOL %d" % i,
           "entrega": "13/08/2026", "plan": "2026-08-13", "etapa": "finalizado",
           "sub": 10, "per": 0, "total": 10} for i in (6, 7)]
viapol_costura = [dict(x, plan="2026-08-17", etapa="costura", atrasado=True) for x in viapol]
semana("2026-08-10.fta", viapol)
semana("2026-08-17.fta", viapol_costura + [
    {"id": "Z9", "pedido": "PD009999", "cliente": "OUTRO", "entrega": "19/08/2026",
     "plan": "2026-08-21", "etapa": "silk", "sub": 1, "per": 1, "total": 2}])
S._ATV_MEMORIA.clear()

import asyncio
# as guardas de acesso ja tem teste proprio; aqui o assunto e a fusao
S.exige_atividade = lambda req, planejar=False: {"nome": "teste"}
S.exige_token = lambda req: None
S.exige_editor_atual = lambda req: None
S.exige_orcamentos = lambda: None
class Req:
    async def json(self): return {"seco": True}
seco = asyncio.get_event_loop().run_until_complete(S.ft_atv_migrar(Req()))
checa("a migracao leu as duas semanas", seco["semanas"], 2)
checa("  e viu tres pedidos distintos, nao cinco", seco["pedidos"], 3)
checa("  resolvendo duas duplicatas", seco["duplicatasResolvidas"], 2)

class Req2:
    async def json(self): return {"seco": False}
asyncio.get_event_loop().run_until_complete(S.ft_atv_migrar(Req2()))
d = le("2026-08")
checa("a VIAPOL ficou finalizada, e uma vez so",
      [d["pedidos"]["V6"]["etapa"], d["pedidos"]["V6"]["plan"]],
      ["finalizado", "2026-08-13"])
checa("  com a data de conclusao gravada", d["pedidos"]["V6"]["concluidoEm"], "2026-08-13")
checa("o pedido movido a mao virou planManual", d["pedidos"]["Z9"]["planManual"], True)
checa("  e o que nasceu na data da entrega, nao", d["pedidos"]["V6"]["planManual"], False)

# ==================================================================
#  A SEMANA QUE ACABOU NAO SEGURA O QUE NAO FOI FEITO  (v3.356)
#
#  A regra roda no _atv_rola, que recebe o dia de hoje de fora: regra que
#  depende do calendario da maquina passaria hoje e falharia na semana
#  que vem sem nada ter mudado.
# ==================================================================
print("\\n=== A ROLAGEM DA SEMANA QUE ACABOU (v3.356) ===")
checa("a segunda de 01/09 e 31/08", S._atv_segunda_iso("2026-09-01"), "2026-08-31")
checa("  a de 27/08 e 24/08", S._atv_segunda_iso("2026-08-27"), "2026-08-24")
checa("  e lixo nao vira data", S._atv_segunda_iso("semana"), "")

def reg(**k):
    base = {"etapa": "corte", "planManual": False, "sumiu": False}
    base.update(k); return base

docs = {"2026-08": {"pedidos": {
          "A": reg(id="A", plan="2026-08-27", etapa="costura"),
          "B": reg(id="B", plan="2026-08-27", etapa="finalizado"),
          "C": reg(id="C", plan="2026-09-02"),
          "D": reg(id="D", plan="2026-08-20", etapa="silk", planManual=True),
          "E": reg(id="E", plan="2026-08-25", sumiu=True),
          "F": reg(id="F", plan="2026-08-31")}},
        "2026-09": {"pedidos": {}}}
pega = lambda m: docs.setdefault(m, {"pedidos": {}})
n = S._atv_rola(docs, pega, "2026-09-01")
achar = lambda i: next((p for d in docs.values() for k, p in d["pedidos"].items() if k == i), None)
checa("rolam so os dois que ficaram para tras", n, 2)
checa("  o nao finalizado vai para a segunda de hoje", achar("A")["plan"], "2026-08-31")
checa("  e guarda de onde saiu", achar("A")["rolou"], ["2026-08-27"])
checa("  o finalizado fica onde acabou", achar("B")["plan"], "2026-08-27")
checa("  quem esta na semana que vem nao se mexe", achar("C")["plan"], "2026-09-02")
# A PROMESSA DO planManual e "a varredura nao arrasta este pedido atras da
# data de entrega do orcamento", e nao "ele fica preso numa semana que
# acabou". Sem isto, quem foi planejado a mao e nao terminou continua
# sumindo da tela, que era o defeito relatado.
checa("  o planejado a mao tambem rola", achar("D")["plan"], "2026-08-31")
checa("  e continua sendo manual", achar("D")["planManual"], True)
checa("  quem saiu da pasta fica quieto", achar("E")["plan"], "2026-08-25")
checa("  e quem ja estava na segunda nao ganha marca", achar("F").get("rolou"), None)

checa("rodar de novo no mesmo dia nao mexe em nada", S._atv_rola(docs, pega, "2026-09-01"), 0)

# uma semana depois, o que continua aberto rola outra vez e o registro
# passa a lembrar dos DOIS enderecos: um aviso em cada semana por onde ele
# passou sem ser feito
S._atv_rola(docs, pega, "2026-09-08")
checa("na semana seguinte ele rola de novo", achar("A")["plan"], "2026-09-07")
checa("  lembrando dos dois lugares onde esteve",
      achar("A")["rolou"], ["2026-08-27", "2026-08-31"])
checa("  e muda de arquivo mensal junto", "A" in docs["2026-09"]["pedidos"], True)
checa("  saindo do mes antigo", "A" in docs["2026-08"]["pedidos"], False)

# o campo e da VARREDURA, e nao da tela: a tela nao pode escreve-lo
checa("a tela nao pode mexer no rolou", "rolou" in S._ATV_CAMPOS_DA_TELA, False)

print("\\n" + "=" * 76)
if falhas:
    print("FALHARAM %d:\\n  - %s" % (len(falhas), "\\n  - ".join(falhas)))
    sys.exit(1)
print("INDICE MENSAL: um pedido, um endereco, e a varredura nao encosta no que e seu")
`;

const r = spawnSync('python3', ['-c', py], { cwd: DIR, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
