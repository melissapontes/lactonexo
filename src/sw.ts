/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { APP } from './config/app';

declare const self: ServiceWorkerGlobalScope;

// App shell: tudo que o build gera fica em cache e o app abre sem internet, inclusive após reiniciar o celular.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Qualquer navegação (inclusive /visita/123 aberta offline) recebe o index.html do cache.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// API: sempre rede. Os dados offline vêm do IndexedDB, nunca do cache HTTP, para não servir dado velho.
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly(), 'GET');
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly(), 'POST');

// Telas de abertura do iOS: sob demanda.
registerRoute(
  ({ url }) => url.pathname.startsWith('/splash/'),
  new CacheFirst({ cacheName: 'splash', plugins: [new ExpirationPlugin({ maxEntries: 20 })] }),
);

// Atualização: só troca de versão quando o vet tocar em "Atualizar" (dados locais preservados).
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// Push (Web Push/VAPID): avisos de revisita, cultura disponível e laudo pendente. Título já vem com o nome do app.
self.addEventListener('push', (e) => {
  const dados = (() => {
    try {
      return e.data?.json() ?? {};
    } catch {
      return { corpo: e.data?.text() };
    }
  })() as { titulo?: string; corpo?: string; url?: string; tag?: string };
  e.waitUntil(
    self.registration.showNotification(dados.titulo ?? APP.nome, {
      body: dados.corpo ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: { url: dados.url ?? '/' },
      tag: dados.tag,
      lang: APP.idioma,
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data as { url?: string })?.url ?? '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      const aberto = lista.find((c) => 'focus' in c);
      if (aberto) {
        void (aberto as WindowClient).navigate(url);
        return (aberto as WindowClient).focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
