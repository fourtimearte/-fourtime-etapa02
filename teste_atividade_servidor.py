# -*- coding: utf-8 -*-
"""O RELATORIO DE ATIVIDADE, NO SERVIDOR (v3.311)

O que este teste cobra, e por que cada item existe:

  1. a marca de acesso e da PESSOA, nao do papel. O Henrique pediu assim
     porque quem planeja producao nao e um cargo do sistema: hoje e a
     Patricia, que e editora. Se isto virasse papel, dar uma tela a alguem
     custaria trocar o cargo dela;

  2. VER e MEXER sao coisas diferentes. A marca da leitura; gravar o
     planejamento e so de admin. Sem essa separacao, dar a tela a alguem
     daria junto o poder de reescrever a semana da fabrica;

  3. NAO SAI DINHEIRO NENHUM daqui. O Relatorio de Pedidos devolve subValor
     e perValor; este nao devolve, e o teste cobra campo por campo. A marca
     pode ser dada a quem o faturamento nao diz respeito, e um campo de
     valor que ninguem usa e um campo de valor que um dia vaza;

  4. a data de envio CHEGA. Sem ela o pedido nao sabe em que semana entra, e
     o relatorio inteiro perde o sentido. Ela existia no orcamento desde
     sempre e nunca tinha saido do servidor;

  5. o nome do arquivo da semana e conferido. '2026-08-17.fta' e uma
     segunda-feira legivel no Drive; qualquer outra coisa e recusada antes
     de virar arquivo;

  6. tirar a marca fecha a porta na hora, inclusive para quem ja esta
     logado.

Roda sem rede e sem Drive: com FT_DRIVE_CREDENCIAIS vazio o servidor usa o
espelho local, que e exatamente o caminho de quando o Drive cai. Os
endpoints que precisam do Drive devolvem erro de Drive, e nao 403: e essa a
diferenca que o teste procura.
"""
import os, sys, tempfile, importlib

os.environ["FT_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "teste.db")
os.environ["FT_TOKEN"] = "2026@Fourtime"
os.environ["FT_ADMIN_TOKEN"] = "21560110"
os.environ["FT_EDITOR_MINIMO"] = "3.258"
os.environ.pop("FT_DRIVE_CREDENCIAIS", None)
os.environ.pop("FT_LOGIN_DESLIGADO", None)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fastapi.testclient import TestClient
import server
importlib.reload(server)
server.init_db()

falhas = []


def checa(rotulo, obtido, esperado):
    ok = obtido == esperado
    print(u"  %s  %-58s obtido=%r esperado=%r"
          % ("OK    " if ok else "FALHOU", rotulo, obtido, esperado))
    if not ok:
        falhas.append(rotulo)


def cliente():
    return TestClient(server.app, base_url="https://testserver")


CAB = {"X-FT-Editor": "3.311"}
SENHA_ADMIN = "21560110"
SENHA_EQUIPE = "2026@Fourtime"
SEMANA = "2026-08-17"


def entra(c, u, senha, nova=None):
    r = c.post("/api/auth/login", json={"usuario": u, "senha": senha})
    if nova:
        c.post("/api/auth/senha", json={"atual": senha, "nova": nova})
    return r


print("\n=== 1. SEM A MARCA, A PORTA ESTA FECHADA ===")
c = cliente()
entra(c, "patricia", SENHA_EQUIPE, "patricia-forte-2026")
r = c.get("/api/ft/atividade-lista?ano=2026&mes=8", headers=CAB)
checa("a editora sem marca leva 403", r.status_code, 403)
checa("  e a recusa diz o motivo",
      "Relatório de Atividade" in (r.json().get("detail") or ""), True)
r = c.post("/api/ft/atividade-guardar",
           json={"semana": SEMANA, "linhas": []}, headers=CAB)
checa("  gravar tambem: 403", r.status_code, 403)
checa("nem o proprio /api/auth/eu inventa a permissao",
      "atividade" in c.get("/api/auth/eu").json()["usuario"]["pode"], False)

print("\n=== 2. O ADMIN LIGA A MARCA ===")
a = cliente()
entra(a, "henrique", SENHA_ADMIN, "henrique-forte-2026")
papel_antes = next(x for x in a.get("/api/auth/usuarios").json()["usuarios"]
                   if x["u"] == "patricia")["papel"]
r = a.post("/api/auth/usuarios",
           json={"acao": "atividade", "u": "patricia", "atividade": True})
checa("acao 'atividade' aceita", r.status_code, 200)
pat = next(x for x in r.json()["usuarios"] if x["u"] == "patricia")
checa("  a marca fica gravada na pessoa", pat["atividade"], True)
checa("  e entra na lista do que ela pode", "atividade" in pat["pode"], True)
checa("  mas ela NAO planeja (isso e do admin)", pat["planeja"], False)
# a marca nao e cargo: ligar o acesso nao pode promover nem rebaixar
# ninguem. Aqui se cobra que o papel continua o que era antes da acao.
checa("  e o papel dela nao mudou", pat["papel"], papel_antes)
kev = next(x for x in r.json()["usuarios"] if x["u"] == "kev")
checa("quem nao recebeu a marca continua fora",
      [kev["atividade"], "atividade" in kev["pode"]], [False, False])
hen = next(x for x in r.json()["usuarios"] if x["u"] == "henrique")
checa("o admin ve sem marca nenhuma ligada",
      [hen["atividade"], "atividade" in hen["pode"], hen["planeja"]],
      [False, True, True])

print("\n=== 3. COM A MARCA, ELA VE ===")
r = c.get("/api/auth/eu")
checa("a permissao aparece para ela na hora seguinte",
      "atividade" in r.json()["usuario"]["pode"], True)
r = c.get("/api/ft/atividade-lista?ano=2026&mes=8", headers=CAB)
checa("a lista nao devolve mais 403", r.status_code != 403, True)
# sem Drive, o que se espera e erro de Drive: 400 (nao configurado) ou 502
checa("  e sim o erro de Drive, que e outro assunto",
      r.status_code in (400, 502, 503), True)

print("\n=== 4. VER NAO E MEXER ===")
r = c.post("/api/ft/atividade-guardar",
           json={"semana": SEMANA, "linhas": []}, headers=CAB)
checa("ela ve, mas gravar continua 403", r.status_code, 403)
checa("  e a recusa explica que e do administrador",
      "administrador" in (r.json().get("detail") or ""), True)
r = a.post("/api/ft/atividade-guardar",
           json={"semana": SEMANA, "linhas": []}, headers=CAB)
checa("o admin passa da permissao", r.status_code != 403, True)

print("\n=== 5. O NOME DO ARQUIVO DA SEMANA ===")
checa("a segunda-feira vira o nome", server._atv_nome_arquivo("2026-08-17"),
      "2026-08-17.fta")
for ruim in ("", "2026-8-17", "semana", "2026-08-17.fta", "../../senha"):
    try:
        server._atv_nome_arquivo(ruim)
        obtido = "passou"
    except Exception as e:
        obtido = getattr(e, "status_code", 0)
    checa("  %r e recusado" % ruim, obtido, 400)

print("\n=== 6. NAO SAI DINHEIRO DAQUI ===")
# o item da atividade e montado no proprio endpoint; aqui se cobra o
# CONTRATO, lendo o codigo-fonte da funcao. Sem Drive nao ha como chamar o
# endpoint de verdade, e este e o unico jeito honesto de cobrar a ausencia
# de um campo: procurar por ele.
import inspect
fonte = inspect.getsource(server.ft_atividade_lote)
for proibido in ("subValor", "perValor", "valor", "mistos"):
    checa("  '%s' nao aparece no lote da atividade" % proibido,
          proibido in fonte, False)
for preciso in ("envio", "subPecas", "perPecas", "total", "vendedor"):
    checa("  '%s' aparece" % preciso, preciso in fonte, True)
fonte_rel = inspect.getsource(server.ft_relatorio_lote)
checa("(o Relatorio de Pedidos continua com o dinheiro dele)",
      "subValor" in fonte_rel, True)

print("\n=== 7. TIRAR A MARCA FECHA NA HORA ===")
a.post("/api/auth/usuarios",
       json={"acao": "atividade", "u": "patricia", "atividade": False})
r = c.get("/api/ft/atividade-lista?ano=2026&mes=8", headers=CAB)
checa("a sessao que ja estava aberta perde o acesso", r.status_code, 403)

print("\n=== 8. A CHAVE DE EMERGENCIA CONTINUA VALENDO ===")
os.environ["FT_LOGIN_DESLIGADO"] = "1"
importlib.reload(server)
server.init_db()
c2 = TestClient(server.app, base_url="https://testserver")
r = c2.get("/api/ft/atividade-lista?ano=2026&mes=8", headers=CAB)
checa("com o login desligado, ninguem leva 403", r.status_code != 403, True)
os.environ.pop("FT_LOGIN_DESLIGADO", None)

print("\n" + "=" * 76)
if falhas:
    print("FALHARAM %d:\n  - %s" % (len(falhas), "\n  - ".join(falhas)))
    sys.exit(1)
print("ATIVIDADE: a marca abre a porta, o admin e quem planeja, e dinheiro nao passa")
