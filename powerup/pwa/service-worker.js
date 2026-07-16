/* ============================================================
   PERSONIFOUR — SERVICE WORKER (offline + atualização automática)

   Estratégia:
   - O EDITOR (/ e /?app=1): "network-first". Online, busca a versão
     nova do servidor e atualiza o cache. Offline, serve o cache.
     Assim o vendedor sempre pega a versão publicada quando tem net,
     e continua trabalhando quando a net cai — mesma URL, transparente.
   - ÍCONES e o MANIFEST: "cache-first" (mudam pouco, carregam na hora).
   - Qualquer chamada de API (/api/...): NUNCA passa pelo cache. São
     dados vivos (Drive, banco); offline elas simplesmente falham e o
     editor já sabe lidar (cai pro local / mostra "sem servidor").

   Para forçar todos os vendedores a atualizarem o cache do próprio SW,
   basta subir o número do CACHE_VERSION abaixo.
   ============================================================ */
const CACHE_VERSION = 'personifour-v1';
const CACHE_ESTATICO = CACHE_VERSION + '-estatico';

/* arquivos que valem a pena pré-cachear na instalação (o "casco" do app) */
const PRECACHE = [
  '/pwa/manifest.json',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/icon-maskable-512.png',
  '/pwa/apple-touch-icon.png',
  '/pwa/favicon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();  // ativa o SW novo assim que instalar
  e.waitUntil(
    caches.open(CACHE_ESTATICO).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes.filter((n) => n.indexOf(CACHE_VERSION) !== 0)  // apaga caches de versões antigas
             .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // só cuidamos de GET do próprio domínio
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // 1) API nunca entra no cache — dados vivos
  if (url.pathname.indexOf('/api/') === 0) return;

  // 2) o EDITOR (raiz ou /?app=1) e navegações: network-first
  const ehEditor = req.mode === 'navigate' ||
                   url.pathname === '/' ||
                   url.pathname === '' ||
                   url.pathname === '/index.html';
  if (ehEditor) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          // guarda a versão fresca do editor para uso offline
          const copia = resp.clone();
          caches.open(CACHE_ESTATICO).then((c) => c.put('/', copia)).catch(() => {});
          return resp;
        })
        .catch(() =>
          // offline: serve o editor que ficou no cache
          caches.match('/').then((r) => r || caches.match(req))
        )
    );
    return;
  }

  // 3) ícones / manifest / estáticos: cache-first
  e.respondWith(
    caches.match(req).then((cacheado) =>
      cacheado ||
      fetch(req).then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE_ESTATICO).then((c) => c.put(req, copia)).catch(() => {});
        return resp;
      }).catch(() => cacheado)
    )
  );
});
