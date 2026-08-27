/* A MESCLAGEM DO SERVIDOR, E O QUE ELA FAZ COM O QUE ACABOU DE NASCER

   Esta suite existe por causa de um defeito de campo: cadastrar uma
   referencia, ve-la aparecer na tela e ve-la sumir um segundo depois.

   A causa nao estava no cadastro. Estava na ORDEM em que o servidor faz as
   coisas: ele MESCLA primeiro e aplica as REMOCOES depois. Um envio que
   leve o item novo e a ordem de apagar esse mesmo item obedece a ordem, e
   ainda deixa lapide, que impede o cadastro seguinte.

   A ordem esta certa e nao muda: e ela que garante que uma exclusao feita
   por um admin nao seja desfeita por um navegador com banco velho. Quem
   tem de mudar e o editor, e ele mudou na v3.348: cadastrar cancela a
   exclusao que ainda nao subiu.

   O que se cobra aqui e a REGRA DO SERVIDOR, congelada, porque o conserto
   do editor so faz sentido enquanto ela for esta. Se um dia alguem inverter
   a ordem para "consertar" o mesmo defeito do outro lado, esta suite conta.

   Python chamando Python: sem HTTP e sem navegador. */
import { spawnSync } from 'child_process';
const DIR = import.meta.dirname + '/';

const py = `
import os, sys, json
sys.path.insert(0, ${JSON.stringify(DIR)})
os.environ.setdefault("FT_DB_PATH", "/tmp/ftx-mescla.db")
os.environ["FT_VARRE_SEG"] = "0"
os.environ["FT_LOGIN_DESLIGADO"] = "1"
import server as S

falhas = []
def checa(rot, obtido, esperado):
    ok = json.dumps(obtido, sort_keys=True, default=str) == json.dumps(esperado, sort_keys=True, default=str)
    print(("  OK  " if ok else "  FALHOU") + "  " + rot.ljust(58)
          + "obtido=" + json.dumps(obtido, ensure_ascii=False, default=str)
          + " esperado=" + json.dumps(esperado, ensure_ascii=False, default=str))
    if not ok: falhas.append(rot)

VELHA = "FT-010-001M \\u2014 CAMISETA"
NOVA  = "FT-010-021M \\u2014 CAMISETA POLO GOLA V"
base  = {"referencias": [VELHA]}
novo  = {"referencias": [VELHA, NOVA]}

print("\\n=== 1. O CAMINHO NORMAL: o que nasce, fica ===")
r = S.mescla_banco(base, novo, admin=True)
checa("cadastro novo entra e o antigo continua", r["referencias"], [VELHA, NOVA])

print("\\n=== 2. CADASTRO E EXCLUSAO NO MESMO ENVIO: a exclusao vence ===")
# e por isso que o editor NAO pode deixar os dois sairem juntos
r = S.mescla_banco(base, novo, remocoes={"referencias": [NOVA.upper()]}, admin=True)
checa("o item apagado no mesmo envio nao fica", NOVA in r["referencias"], False)
checa("  e ele vira lapide, que barra o proximo cadastro",
      NOVA.upper() in (r.get(S.LAPIDES) or {}).get("referencias", {}), True)
checa("  o resto do banco nao se mexe", r["referencias"], [VELHA])

print("\\n=== 3. LAPIDE ANTIGA: o admin desenterra, os outros nao ===")
comLapide = {"referencias": [VELHA], S.LAPIDES: {"referencias": {NOVA.upper(): "2026-01-01"}}}
r = S.mescla_banco(comLapide, novo, admin=True)
checa("admin recadastrando desenterra", NOVA in r["referencias"], True)
checa("  e a lapide sai junto",
      NOVA.upper() in (r.get(S.LAPIDES) or {}).get("referencias", {}), False)
r = S.mescla_banco(comLapide, novo, admin=False)
checa("quem nao e admin nao desenterra", NOVA in r["referencias"], False)
checa("  e a lapide continua la",
      NOVA.upper() in (r.get(S.LAPIDES) or {}).get("referencias", {}), True)

print("\\n=== 4. A CHAVE E O TEXTO INTEIRO DA REFERENCIA ===")
# o mesmo codigo com outro nome e OUTRA chave para o servidor: e por isso
# que o editor recusa codigo repetido antes de chegar aqui
outro = {"referencias": [VELHA, "FT-010-021M \\u2014 OUTRO NOME"]}
r = S.mescla_banco(base, outro, admin=True)
checa("codigo igual com nome diferente vira dois itens", len(r["referencias"]), 2)

print("\\n" + "=" * 76)
if falhas:
    print("FALHARAM %d:" % len(falhas))
    for f in falhas: print("  - " + f)
    sys.exit(1)
print("MESCLA DO SERVIDOR: a exclusao vence o cadastro do mesmo envio, e a lapide so cede ao admin")
`;

const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.stderr && r.stderr.trim()) process.stderr.write(r.stderr);
process.exit(r.status === null ? 1 : r.status);
