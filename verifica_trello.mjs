/* Gera o HTML de exportação e abre no tamanho de um celular e de uma
   impressora. É o caminho real do arquivo que vai para o Trello. */
import { abreNavegador, esperaPronto } from './ft_navegador.mjs';
import { pathToFileURL } from 'url';
import { writeFileSync } from 'fs';
/* a pasta deste arquivo — assim as suítes rodam de qualquer clone,
   e não só de /home/claude/ft */
const DIR = import.meta.dirname + '/';

const b = await abreNavegador();
const p = await b.newPage({viewport:{width:1600,height:1100}});
await p.goto(pathToFileURL(DIR+'fourtime-editor-v275.html').href);
await esperaPronto(p);
const html = await p.evaluate(()=>{
  const põe=(k,v)=>{const e=document.querySelector('[data-h="'+k+'"]');if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}};
  põe('cliente','ASSOCIAÇÃO ATLÉTICA JARDIM AMÉRICA'); põe('cpf','25.260.940/0001-40');
  põe('pedido','PD003929'); põe('envio','22/08/2026'); põe('vendedor','Henrique');
  põe('departamento','Uniforme de gala'); põe('entrega','Retirada na loja');
  põe('embalagem','Saco individual'); põe('pagamento','50% + 50% na entrega');
  põe('contato','WhatsApp comercial');
  return gerarHTML([]);
});
await p.close();
writeFileSync('/tmp/export_trello.html', html);

// 1) celular
const cel = await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errC=[]; cel.on('pageerror',e=>errC.push(String(e).slice(0,200)));
await cel.goto(pathToFileURL('/tmp/export_trello.html').href);
await cel.waitForTimeout(1800);
console.log('CELULAR', JSON.stringify(await cel.evaluate(()=>{
  const f=document.querySelector('.folha-a4').getBoundingClientRect();
  const cab=document.querySelector('.doc-header');
  const campos=[...cab.querySelectorAll('.hd-campo')].filter(c=>c.getBoundingClientRect().width>2).length;
  const logo=cab.querySelector('.logo-box img').getBoundingClientRect();
  return {larguraFolha:Math.round(f.width), rolagemH:document.documentElement.scrollWidth>window.innerWidth+1,
          camposVisiveis:campos, logoVisivel:logo.width>10,
          contatoOculto:document.querySelector('[data-h="contato"]').getBoundingClientRect().width<=2,
          colunas:getComputedStyle(cab).gridTemplateColumns.split(' ').length};
})));
console.log('  erros:', errC);
await cel.screenshot({path:'/tmp/trello_cel.png', fullPage:false});

// 2) impressão (viewport de papel)
const imp = await b.newPage({viewport:{width:794,height:1123}});
await imp.goto(pathToFileURL('/tmp/export_trello.html').href);
await imp.emulateMedia({media:'print'});
await imp.waitForTimeout(1200);
console.log('IMPRESSÃO', JSON.stringify(await imp.evaluate(()=>{
  const f=document.querySelector('.folha-a4').getBoundingClientRect();
  const cab=document.querySelector('.doc-header');
  return {larguraFolha:Math.round(f.width), cabecalho:getComputedStyle(cab).display,
          colunas:getComputedStyle(cab).gridTemplateColumns,
          aviso:getComputedStyle(document.querySelector('.warn-bar')).display,
          cliente:(document.querySelector('[data-h="cliente"]')||{}).value};
})));
await imp.pdf({path:'/tmp/trello.pdf', format:'A4', printBackground:true});
await b.close();
console.log('PDF gerado');
