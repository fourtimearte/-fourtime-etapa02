/* O FREIO DE MÃO DO SERVIDOR CONTRA DUPLICAÇÃO
   Ele salvou o sistema quando 225 clientes viraram 675 — e barrou, com
   razão, o catálogo novo de cores: de fora, plantar 71 cores de uma vez é
   igualzinho a duplicar. A saída foi dar informação ao freio, não tirar os
   dentes dele. Este teste garante as duas coisas ao mesmo tempo: o
   catálogo declarado passa, e a duplicação continua barrada. */
import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(56)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

const SRV = existsSync(DIR+'server.py') ? DIR+'server.py' : '/home/claude/repo/server.py';
console.log('\n=== 1. O EDITOR DECLARA O QUE TRAZ DE FÁBRICA ===');
const ed = DIR+(process.env.FT_ARQ||'fourtime-editor-v291.html');
const html = readFileSync(ed,'utf8');
checa('o envio leva o campo semente', /semente:ftSementeDeclarada\(\)/.test(html), true);
checa('  e ele é montado do catálogo embutido',
      /function ftSementeDeclarada\(\)[\s\S]{0,240}CORES_GRUPOS/.test(html), true);

console.log('\n=== 2. O FREIO, COM E SEM A DECLARAÇÃO ===');
/* roda a função REAL do servidor, não uma cópia da lógica */
const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('srv', ${JSON.stringify(SRV)})
m = importlib.util.module_from_spec(spec)
try: spec.loader.exec_module(m)
except Exception: pass
_inchou = m._inchou
base = {'cores': [{'n':'Branco'},{'n':'Preto'}] + [{'n':'C%02d'%i} for i in range(50)]}
novos = [{'n':'F%02d'%i} for i in range(70)]
junto = {'cores': base['cores'] + novos}
sem   = {'cores': ['F%02d'%i for i in range(70)]}
dupl  = {'cores': base['cores'] + [{'n':'X%02d'%i} for i in range(40)]}
so_um = {'cores': base['cores'] + [{'n':'Nova Cor'}]}
print(json.dumps({
  'catalogoDeclarado': _inchou(base, junto, semente=sem),
  'catalogoSemDeclarar': (_inchou(base, junto) or {}).get('somou'),
  'declarandoOqueJaExiste': (_inchou(base, dupl, semente={'cores':['C%02d'%i for i in range(50)]}) or {}).get('somou'),
  'edicaoNormal': _inchou(base, so_um, semente=sem),
  'outraCategoriaIntacta': (_inchou({'clientes':[{'n':'A'},{'n':'B'}]+[{'n':'K%02d'%i for i in range(0)} ] if False else [{'n':'A'}]*0 + [{'n':'K%02d'%i} for i in range(60)]},
                                    {'clientes':[{'n':'K%02d'%i} for i in range(60)] + [{'n':'Z%02d'%i} for i in range(60)]},
                                    semente=sem) or {}).get('somou'),
}, ensure_ascii=False))
`;
let r;
try{ r=JSON.parse(execFileSync('python3',['-c',py],{encoding:'utf8'})); }
catch(e){ console.log('     ! não consegui rodar o servidor:',String(e).slice(0,200)); r={}; }
console.log('     '+JSON.stringify(r));
checa('catálogo declarado passa', r.catalogoDeclarado, null);
checa('  o MESMO envio sem declarar é barrado', r.catalogoSemDeclarar, 70);
checa('declarar o que já existe não abre a porta', r.declarandoOqueJaExiste, 40);
checa('uma edição normal continua passando', r.edicaoNormal, null);
checa('a declaração de cores não afrouxa clientes', r.outraCategoriaIntacta, 60);

console.log('\n'+'='.repeat(64));
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('FREIO: o catálogo declarado passa e a duplicação continua barrada');
