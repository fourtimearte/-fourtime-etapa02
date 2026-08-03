/* O SERVIDOR CONSEGUE LER A VERSÃO DO EDITOR?
   Parece bobo até acontecer: a constante FT_EDITOR fica DEPOIS do CSS, e
   o servidor lia só um pedaço do começo do arquivo. Quando o módulo de
   layout cresceu, a constante passou do limite, a rota passou a devolver
   versão vazia e ninguém mais foi avisado de publicação nova.
   Este teste roda a extração do jeito do servidor, no arquivo de verdade. */
import fs from 'fs';
const DIR = import.meta.dirname + '/';
const falhas=[];
function checa(r,o,e){ const ok=JSON.stringify(o)===JSON.stringify(e);
  console.log(`  ${ok?'OK ':'FALHOU'}  ${r.padEnd(56)} obtido=${JSON.stringify(o)} esperado=${JSON.stringify(e)}`);
  if(!ok)falhas.push(r); }

/* o editor que o servidor serviria: o ÚLTIMO em ordem alfabética */
const editores = fs.readdirSync(DIR).filter(f=>/editor.*\.html$/.test(f)).sort();
const servido = editores[editores.length-1];
console.log('\n=== 1. QUAL ARQUIVO O SERVIDOR SERVE ===');
console.log('     '+servido);
checa('é o editor de maior número', servido, process.env.FT_ARQ || servido);

console.log('\n=== 2. A EXTRAÇÃO DA VERSÃO ===');
const texto = fs.readFileSync(DIR+servido,'utf8');
const m = texto.match(/const\s+FT_EDITOR\s*=\s*['"]([0-9.]+)['"]/);
checa('a constante existe no arquivo', !!m, true);
const pos = texto.indexOf("const FT_EDITOR=");
console.log('     posição da constante: '+pos+' de '+texto.length+' caracteres');

/* o jeito do servidor: ler o arquivo INTEIRO */
const py = fs.readFileSync(DIR+'server.py','utf8');
const leTudo = /f\.read\(\)\s*\n\s*m = _re\.search/.test(py) || /trecho = f\.read\(\)/.test(py);
checa('o servidor lê o arquivo inteiro (e não um pedaço)', leTudo, true);
const janela = py.match(/f\.read\((\d+)\)/);
checa('  não sobrou nenhum f.read(N) limitando', janela?janela[1]:null, null);

console.log('\n=== 3. E SE ALGUÉM VOLTAR A LIMITAR ===');
/* simula a janela antiga: a constante caberia? */
const CABIA = 400000;
console.log('     com a janela antiga de '+CABIA+' caracteres, a constante '
  +(pos<CABIA?'ainda caberia':'FICARIA DE FORA — foi o que aconteceu na v279'));

console.log('\n'+'='.repeat(64));
if(falhas.length){ console.log(`FALHARAM ${falhas.length}:\n  - ${falhas.join('\n  - ')}`); process.exit(1); }
console.log('SERVIDOR LÊ A VERSÃO: '+m[1]);
