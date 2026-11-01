// Service Worker do VOTAIASD V2
// Habilita os requisitos de PWA instalável no navegador (beforeinstallprompt).
// Por diretriz estrita de segurança e anonimato, NUNCA armazena em cache dados de reuniões,
// votos, resultados, pautas, autenticação ou endpoints de API.

const CACHE_NAME = 'votaiasd-pwa-v4';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/church-logo.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NUNCA interceptar nem colocar em cache requisições de API, SSE ou serviços do Firebase
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/events') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('identitytoolkit') ||
    event.request.method !== 'GET'
  ) {
    return; // Passa direto para a rede (Network Only)
  }

  // Navegações e arquivos estáticos públicos básicos
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((cached) => cached || Response.error());
    })
  );
});
