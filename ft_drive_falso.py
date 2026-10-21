# -*- coding: utf-8 -*-
"""
O DRIVE DE MENTIRA (v3.376), para os testes do link do cliente.

Um dicionario id -> {nome, pai, corpo, mod} no lugar do Google Drive. As
pastas sao tres nomes fixos: TRAB (Pasta de Trabalho), ORG (Organizados)
e RELATORIOS. instala(S) troca as funcoes de Drive do server.py por estas.
"""
import json, re


class S_erro_404(Exception):
    """O Drive de verdade responde 404 para um id que nao existe."""
    pass

# ------------------------------------------------------------------
# O DRIVE DE MENTIRA: id -> {nome, pai, corpo, mod}
# ------------------------------------------------------------------
ARQ = {}
REL = [0]
def _mod():
    REL[0] += 1
    return "2026-10-21T10:00:%02d.000Z" % REL[0]

def poe(fid, nome, pai, doc):
    ARQ[fid] = {"nome": nome, "pai": pai, "mod": _mod(),
                "corpo": json.dumps(doc, ensure_ascii=False).encode("utf-8")}

def le(fid):
    return json.loads(ARQ[fid]["corpo"].decode("utf-8"))

def _fake_drive_get(caminho, params=None, binario=False, tentativas=3):
    params = params or {}
    if caminho == "/files":
        q = params.get("q", "")
        m = re.search(r"'([^']+)' in parents.*name = '([^']+)'", q)
        fora = []
        if m:
            for fid, a in ARQ.items():
                if a["pai"] == m.group(1) and a["nome"] == m.group(2):
                    fora.append({"id": fid, "name": a["nome"], "modifiedTime": a["mod"]})
        return {"files": fora}
    fid = caminho.split("/files/")[1]
    a = ARQ.get(fid)
    if a is None and fid in ("TRAB", "ORG", "RELATORIOS"):
        return {"id": fid, "name": fid, "parents": ["RAIZ"]}
    if a is None:
        raise S_erro_404(fid)
    if binario or params.get("alt") == "media":
        return a["corpo"], {}
    return {"id": fid, "name": a["nome"], "modifiedTime": a["mod"], "parents": [a["pai"]]}

def _fake_grava(fid, corpo):
    ARQ[fid]["corpo"] = corpo
    ARQ[fid]["mod"] = _mod()
    return fid

def _fake_acha(nome, pasta):
    for fid, a in ARQ.items():
        if a["nome"] == nome and a["pai"] == pasta:
            return fid
    return None

def _fake_script(dados, timeout=120):
    pai = {"relatorio": "RELATORIOS", "organizado": "ORG", "trabalho": "TRAB"}[dados["destino"]]
    fid = "id-script-%03d" % (len(ARQ) + 1)
    ARQ[fid] = {"nome": dados["nome"], "pai": pai, "mod": _mod(),
                "corpo": dados["conteudo"].encode("utf-8")}
    return {"ok": True, "id": fid}

def _fake_sobe(nome, pasta_id, corpo):
    fid = _fake_acha(nome, pasta_id)
    if fid:
        _fake_grava(fid, corpo)
        return fid, "atualizado"
    fid = "id-novo-%03d" % (len(ARQ) + 1)
    ARQ[fid] = {"nome": nome, "pai": pasta_id, "mod": _mod(), "corpo": corpo}
    return fid, "criado"

def instala(S):
    S._drive_get = _fake_drive_get
    S._orc_grava_por_id = _fake_grava
    S._orc_acha_arquivo = _fake_acha
    S._script_post = _fake_script
    S._orc_sobe_arquivo = _fake_sobe
    S._rel_pasta = lambda: "RELATORIOS"
    S._orc_dentro = lambda fid: fid in ARQ
    S._sob_pasta = lambda fid, raiz, prof=8: fid in ARQ and ARQ[fid]["pai"] == raiz
    S._orc_raiz_destino = lambda destino: "ORG" if destino == "organizado" else "TRAB"
    S._orc_subpasta_raiz = lambda nome: "ORG" if nome == S.FT_PASTA_ORGANIZADOS else "TRAB"
    S._orc_pasta_destino = lambda ano, mes, dia=None: ("ORG", "2026/x")
    S.exige_orcamentos = lambda: None
    S.FT_SCRIPT_ORCAMENTOS = "http://mentira"

