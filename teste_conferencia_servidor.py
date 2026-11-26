"""A REGRA DE ACHAR O CARTAO DA CONFERENCIA DO TRELLO (v3.385).

   Roda a funcao pura _conf_casa do server.py, sem rede: os cartoes aqui
   imitam o que a API do Trello devolve (name, idList, shortUrl,
   dateLastActivity, labels)."""
import os, sys
os.environ.setdefault("FT_DB_PATH", "/tmp/ft-conf-teste.db")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server

falhas = []
def checa(r, obtido, esperado):
    ok = obtido == esperado
    print("  %s  %-58s obtido=%r esperado=%r" % ("OK " if ok else "FALHOU", r, obtido, esperado))
    if not ok:
        falhas.append(r)

def cartao(nome, lista="L1", quando="2026-11-20", tags=()):
    return {"name": nome, "idList": lista, "shortUrl": "https://trello.com/c/" + str(abs(hash(nome)) % 99999),
            "dateLastActivity": quando, "labels": [{"name": n, "color": c} for n, c in tags]}

LISTAS = {"L1": "IMPRESSÃO DTF", "L2": "PRENSA"}
CARTOES = [
    cartao("PEDIDO 4430 ARENA CROSS", "L1", tags=[("MONTAGEM", "orange"), ("DTF ENTREGUE PARA IMPRESSÃO", "green")]),
    cartao("PD044301 OUTRO CLIENTE", "L2"),
    cartao("SUPERE SPORTS camisetas time", "L2", tags=[("REVISAR", "yellow")]),
    cartao("PD004428 ATLETICA (antigo)", "L1", "2026-11-01"),
    cartao("PD004428 ATLETICA MEDICINA", "L2", "2026-11-22", tags=[("REVISAO H", "blue")]),
    cartao("Colégio Yolanda  uniformes", "L2"),
]
PEDIDOS = [
    {"id": "a", "pedido": "PD004430", "cliente": "ARENA CROSS"},
    {"id": "b", "pedido": "PD004421", "cliente": "SUPERE SPORTS LTDA"},
    {"id": "c", "pedido": "PD004428", "cliente": "ATLETICA MEDICINA UFG"},
    {"id": "d", "pedido": "PD004439", "cliente": "TIA KAROL SPORTS"},
    {"id": "e", "pedido": "PD004425", "cliente": "COLEGIO YOLANDA"},
    {"id": "f", "pedido": "", "cliente": "ME"},
]
R = server._conf_casa(PEDIDOS, CARTOES, LISTAS)

print("\n[1] pelo numero")
checa("PD004430 acha 'PEDIDO 4430 ...'", (R["a"]["como"], R["a"]["cartao"]["titulo"]), ("numero", "PEDIDO 4430 ARENA CROSS"))
checa("a coluna vem pelo nome da lista", R["a"]["cartao"]["coluna"], "IMPRESSÃO DTF")
checa("as tags vem todas, com a cor", R["a"]["cartao"]["tags"],
      [{"n": "MONTAGEM", "c": "orange"}, {"n": "DTF ENTREGUE PARA IMPRESSÃO", "c": "green"}])
checa("4430 nao casa com 044301", all(x["cartao"]["titulo"] != "PD044301 OUTRO CLIENTE" for x in R.values() if x["cartao"]), True)
checa("dois cartoes com o numero: o mais recente", (R["c"]["cartao"]["titulo"], R["c"]["cartao"]["varios"]),
      ("PD004428 ATLETICA MEDICINA", 2))

print("\n[2] pelo nome")
checa("sem numero no titulo, acha pelo nome sem LTDA", (R["b"]["como"], R["b"]["cartao"]["titulo"]),
      ("nome", "SUPERE SPORTS camisetas time"))
checa("nome com acento no cartao casa sem acento", (R["e"]["como"], R["e"]["cartao"]["coluna"]), ("nome", "PRENSA"))

print("\n[3] sem cartao")
checa("nem numero nem nome: sem cartao", R["d"], {"como": "", "cartao": None})
checa("nome curto demais nao procura", R["f"], {"como": "", "cartao": None})
checa("uma resposta para cada pedido", sorted(R), ["a", "b", "c", "d", "e", "f"])

print("\n[4] a rota existe e pede login")
from fastapi.testclient import TestClient
cli = TestClient(server.app)
r = cli.post("/api/trello/conferencia", json={"pedidos": []})
checa("sem sessao: 401", r.status_code, 401)

print("\n%s" % ("TUDO CERTO" if not falhas else "FALHAS: " + ", ".join(falhas)))
sys.exit(1 if falhas else 0)
