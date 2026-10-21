# -*- coding: utf-8 -*-
"""
O LINK DO CLIENTE NO SERVIDOR (v3.376)

Roda o server.py de verdade (TestClient, sem rede) com o Drive trocado
por um dicionario. Confere o caminho inteiro: gerar o link, o cliente
abrir (sem nenhum valor), devolver, a trava depois de devolvido, o 409
que protege o que o cliente mandou, liberar de novo, e o link que morre
quando o orcamento vai para Organizados.

    python3 teste_cliente_servidor.py
"""
import os, sys, json, re

os.environ["FT_LOGIN_DESLIGADO"] = "1"
os.environ["FT_VARRE_SEG"] = "0"
os.environ["FT_DB_PATH"] = "/tmp/ft-teste-cliente-%d.db" % os.getpid()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server as S
from fastapi.testclient import TestClient

falhas = []
def checa(rot, obtido, esperado):
    ok = obtido == esperado
    print(("  ok    " if ok else "  FALHA ") + rot + ("" if ok else
          "  obtido=%r esperado=%r" % (obtido, esperado)))
    if not ok:
        falhas.append(rot)

from ft_drive_falso import ARQ, poe, le, _fake_acha, instala
instala(S)

cli = TestClient(S.app, base_url="https://testserver")
ED = {"X-FT-Editor": "3.376"}

DOC = {
    "_formato": "FOURTIME_ORCAMENTO", "_versao": 2,
    "header": {"cliente": "ACME <b>ESPORTES</b>", "nomedoc": "ACME", "pedido": "PD004900",
               "vendedor": "*Dani", "contato": "62 99999-0000", "pagamento": "50% PIX",
               "obs": "<div>Entrega na fábrica</div>"},
    "layouts": [
        {"ref": "FT-010-001M \u2014 Camiseta", "genero": "masculino", "tecidos": ["Dry"],
         "cores": ["Preto"], "cor": "Preto", "design": [{"tag": "Subli", "cores": []}],
         "grade": "adulto", "tamanhos": {"M": {"q": "", "u": "84,00"}, "G": {"q": "2", "u": "84,00"}},
         "obs": "<div>Gola <b>V</b></div>", "img": "data:image/webp;base64,AAAA",
         "info": False, "nomeNum": True, "lista": []},
        {"ref": "FT-030-002F \u2014 Regata", "genero": "feminino", "tecidos": ["Dry"],
         "cores": ["Branco"], "design": [], "grade": "adulto",
         "tamanhos": {"P": {"q": "", "u": "71,50"}}, "obs": "", "img": None,
         "info": False, "nomeNum": False, "lista": []},
        {"ref": "", "info": True, "tamanhos": {}, "img": "data:image/png;base64,BBBB"},
    ],
    "anotacoes": ["<div>nota interna do vendedor</div>"],
    "ajustes": [{"sinal": "-", "valor": 150, "tipo": "R$", "motivo": "Brinde secreto"}],
}

print("\n=== 1. GERAR O LINK ===")
poe("ft-trab-0001", "ACME-PD004900.ft", "TRAB", DOC)
poe("ft-org-00001", "OUTRO-PD1-201026.ft", "ORG", DOC)
r = cli.post("/api/cliente/link", json={"driveId": ""}, headers=ED)
checa("sem arquivo salvo: 400", r.status_code, 400)
r = cli.post("/api/cliente/link", json={"driveId": "ft-org-00001"}, headers=ED)
checa("orcamento de Organizados: 409", r.status_code, 409)
r = cli.post("/api/cliente/link", json={"driveId": "ft-trab-0001"})
checa("editor que nao diz a versao: 426", r.status_code, 426)
r = cli.post("/api/cliente/link", json={"driveId": "ft-trab-0001"}, headers={"X-FT-Editor": "3.375"})
checa("editor 3.375 (abaixo do piso novo): 426", r.status_code, 426)
r = cli.post("/api/cliente/link", json={"driveId": "ft-trab-0001"}, headers=ED)
checa("gerou: 200", r.status_code, 200)
d = r.json()
COD = d["codigo"]
checa("codigo longo e sem significado", bool(re.fullmatch(r"[A-Za-z0-9_-]{32}", COD)), True)
checa("o .ft guarda o codigo", le("ft-trab-0001")["cliente"]["codigo"], COD)
checa("  e o estado aguardando", le("ft-trab-0001")["cliente"]["estado"], "aguardando")
checa("o indice nasceu na pasta dos relatorios",
      _fake_acha("links-do-cliente.ftc", "RELATORIOS") is not None, True)
checa("o resto do .ft ficou igual", le("ft-trab-0001")["ajustes"], DOC["ajustes"])
r2 = cli.post("/api/cliente/link", json={"driveId": "ft-trab-0001"}, headers=ED).json()
checa("gerar de novo devolve o MESMO codigo", r2["codigo"], COD)
checa("  e nao e novo", r2["novo"], False)

print("\n=== 2. O CLIENTE ABRE (SEM VALOR NENHUM) ===")
r = cli.get("/cliente/" + COD)
checa("a pagina abre", r.status_code, 200)
checa("  e nao e indexada", r.headers.get("x-robots-tag"), "noindex, nofollow")
r = cli.get("/api/cliente/ver/" + COD)
checa("ver: 200", r.status_code, 200)
v = r.json()
bruto = r.text
checa("cliente em texto puro", v["cliente"], "ACME ESPORTES")
checa("vendedor sem o asterisco", v["vendedor"], "Dani")
checa("observacao do layout em texto", v["layouts"][0]["obs"], "Gola V")
checa("grade: so as quantidades preenchidas", v["layouts"][0]["tamanhos"], {"G": 2})
checa("layout marcado pede nome e numero", v["layouts"][0]["nomeNum"], True)
checa("layout sem marca nao pede", v["layouts"][1]["nomeNum"], False)
checa("modulo de informacao vai como info", v["layouts"][2]["info"], True)
for proibido in ["84,00", "71,50", "Brinde secreto", "nota interna", "99999", "PIX", "\"u\""]:
    checa("nao vaza: " + proibido, proibido in bruto, False)
checa("codigo torto: 404", cli.get("/api/cliente/ver/abc").status_code, 404)
checa("codigo que nao existe: 404", cli.get("/api/cliente/ver/" + "x" * 32).status_code, 404)

print("\n=== 3. A DEVOLUCAO RECUSA O QUE NAO PRESTA ===")
def devolve(layouts):
    return cli.post("/api/cliente/devolver/" + COD, json={"layouts": layouts})
r = devolve([{"n": 1, "tamanhos": {"XXL": "3"}}])
checa("tamanho que nao existe: 400", r.status_code, 400)
r = devolve([{"n": 1, "tamanhos": {"M": "3a"}}])
checa("quantidade com letra: 400", r.status_code, 400)
r = devolve([{"n": 9, "tamanhos": {}}])
checa("layout que nao existe: 400", r.status_code, 400)
r = devolve([{"n": 1, "tamanhos": {"M": "1"}, "lista": [{"nome": "Ana", "num": "10A", "gen": "feminino", "tam": "M"}]}])
checa("numero com letra: 400", r.status_code, 400)
checa("  e diz a linha", "linha 1" in r.json().get("detail", ""), True)
r = devolve([{"n": 1, "tamanhos": {"M": "1"}, "lista": [{"nome": "Ana", "num": "10", "gen": "", "tam": "M"}]}])
checa("sem genero: 400", r.status_code, 400)
r = devolve([{"n": 1, "tamanhos": {"M": "1"}, "lista": [{"nome": "Ana", "num": "10", "gen": "feminino", "tam": ""}]}])
checa("sem tamanho: 400", r.status_code, 400)
checa("nada disso mexeu no .ft", le("ft-trab-0001")["layouts"][0]["tamanhos"],
      DOC["layouts"][0]["tamanhos"])

print("\n=== 4. A DEVOLUCAO BOA ===")
LISTA = [{"nome": "Ana  Souza", "num": "7", "gen": "feminino", "tam": "M"},
         {"nome": "", "num": "", "gen": "", "tam": ""},          # linha vazia: some
         {"nome": "Beto", "num": "10", "gen": "masculino", "tam": "G"}]
r = devolve([{"n": 1, "tamanhos": {"M": "3", "G": ""}, "lista": LISTA},
             {"n": 2, "tamanhos": {"P": "5", "GG": "1"}, "lista": LISTA},
             {"n": 3, "tamanhos": {"M": "9"}}])
checa("devolveu: 200", r.status_code, 200)
checa("  total de pecas", r.json().get("pecas"), 9)
f = le("ft-trab-0001")
checa("grade 1: M entrou com o preco de antes",
      f["layouts"][0]["tamanhos"]["M"], {"q": "3", "u": "84,00"})
checa("grade 1: G zerado guarda o preco", f["layouts"][0]["tamanhos"]["G"], {"q": "", "u": "84,00"})
checa("grade 2: tamanho novo sem preco", f["layouts"][1]["tamanhos"]["GG"], {"q": "1", "u": ""})
checa("lista do layout 1, sem a linha vazia e com o espaco arrumado",
      f["layouts"][0]["lista"], [{"nome": "Ana Souza", "num": "7", "gen": "feminino", "tam": "M"},
                                  {"nome": "Beto", "num": "10", "gen": "masculino", "tam": "G"}])
checa("layout 2 sem marca: a lista que o cliente abriu entra (v3.377)", len(f["layouts"][1]["lista"]), 2)
checa("  e liga a marca, para o vendedor ver o botao", f["layouts"][1]["nomeNum"], True)
checa("o modulo de informacao nao ganhou grade", f["layouts"][2]["tamanhos"], {})
checa("o .ft diz devolvido", f["cliente"]["estado"], "devolvido")
checa("o ajuste continua la", f["ajustes"], DOC["ajustes"])
checa("as anotacoes continuam la", f["anotacoes"], DOC["anotacoes"])
checa("ver depois de devolvido mostra o estado", cli.get("/api/cliente/ver/" + COD).json()["estado"], "devolvido")
r = devolve([{"n": 1, "tamanhos": {"M": "99"}}])
checa("devolver de novo: 409 (travado)", r.status_code, 409)
nov = cli.get("/api/cliente/novidades").json()
it = [x for x in nov["itens"] if x["codigo"] == COD]
checa("novidades: aparece como devolvido", it and it[0]["estado"], "devolvido")
checa("  com o nome do arquivo", it and it[0]["nome"], "ACME-PD004900")

print("\n=== 5. O 409 QUE PROTEGE O QUE O CLIENTE MANDOU ===")
velho = json.loads(json.dumps(DOC)); velho["cliente"] = {"codigo": COD, "estado": "aguardando"}
r = cli.post("/api/ft/salvar", headers=ED, json={"nome": "ACME-PD004900.ft", "conteudo": velho,
             "destino": "trabalho", "driveId": "ft-trab-0001"})
checa("salvar por cima com a tela velha: 409", r.status_code, 409)
checa("  e a lista do cliente continua no arquivo", len(le("ft-trab-0001")["layouts"][0]["lista"]), 2)
novo = le("ft-trab-0001")
r = cli.post("/api/ft/salvar", headers=ED, json={"nome": "ACME-PD004900.ft", "conteudo": novo,
             "destino": "trabalho", "driveId": "ft-trab-0001"})
checa("salvar com o arquivo reaberto: 200", r.status_code, 200)

print("\n=== 6. LIBERAR DE NOVO ===")
r = cli.post("/api/cliente/liberar", headers=ED, json={"codigo": COD})
checa("liberar: 200", r.status_code, 200)
checa("  o .ft volta a aguardando", le("ft-trab-0001")["cliente"]["estado"], "aguardando")
v = cli.get("/api/cliente/ver/" + COD).json()
checa("  o cliente ve o que ja tinha mandado", v["layouts"][0]["tamanhos"], {"M": 3})
checa("  e a lista", len(v["layouts"][0]["lista"]), 2)
r = devolve([{"n": 1, "tamanhos": {"M": "4"}, "lista": LISTA}])
checa("devolver depois de liberado: 200", r.status_code, 200)

print("\n=== 7. ORGANIZADOS ENCERRA O LINK ===")
fim = le("ft-trab-0001")
r = cli.post("/api/ft/salvar", headers=ED, json={"nome": "ACME-PD004900-211026.ft", "conteudo": fim,
             "destino": "organizado", "driveId": "ft-trab-0001"})
checa("salvar em Organizados: 200", r.status_code, 200)
checa("ver depois de encerrado: 410", cli.get("/api/cliente/ver/" + COD).status_code, 410)
novo_id = r.json()["id"]
checa("o definitivo nasceu marcado encerrado", le(novo_id)["cliente"]["estado"], "encerrado")
checa("liberar um encerrado: 410",
      cli.post("/api/cliente/liberar", headers=ED, json={"codigo": COD}).status_code, 410)
r = cli.post("/api/cliente/link", json={"driveId": "ft-trab-0001"}, headers=ED).json()
checa("gerar de novo depois de encerrado nasce outro codigo", r["codigo"] != COD, True)

print("\n=== 8. O FREIO DAS ROTAS SEM LOGIN ===")
S._CLI_FREIO.clear()
cods = [cli.get("/api/cliente/ver/" + "y" * 32).status_code for _ in range(31)]
checa("30 por minuto passam", cods[:30].count(404), 30)
checa("a 31a para", cods[30], 429)

print()
if falhas:
    print("FALHARAM %d:" % len(falhas))
    for f_ in falhas:
        print("  - " + f_)
    sys.exit(1)
print("tudo certo")
