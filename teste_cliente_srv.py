# -*- coding: utf-8 -*-
"""
O SERVIDOR DE VERDADE COM O DRIVE DE MENTIRA (v3.376)

Sobe o server.py numa porta local, sem login e com o Drive trocado pelo
dicionario do ft_drive_falso. Usado pelo teste_cliente.mjs, que precisa
do caminho inteiro: o editor salvando, o cliente abrindo pelo link, a
devolucao e o aviso.

    python3 teste_cliente_srv.py 9471
"""
import os, sys, tempfile
os.environ["FT_LOGIN_DESLIGADO"] = "1"
os.environ["FT_VARRE_SEG"] = "0"
os.environ["FT_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "ft.db")
os.environ.setdefault("FT_DRIVE_ORCAMENTOS", "RAIZ")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server as S
from ft_drive_falso import instala
instala(S)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(S.app, host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
