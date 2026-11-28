import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { APP } from './src/config/app';
import splash from './scripts/splash.json';

/** Injeta nome do app, cores e telas de abertura do iOS no index.html a partir de src/config/app.ts. */
function identidadeNoHtml(): Plugin {
  return {
    name: 'lactonexo-identidade',
    transformIndexHtml(html) {
      const links = splash
        .map(({ w, h, dpr }) => {
          const arquivo = `/splash/splash-${w * dpr}x${h * dpr}.png`;
          const media = `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`;
          return `<link rel="apple-touch-startup-image" media="${media}" href="${arquivo}">`;
        })
        .join('\n    ');
      return html
        .replaceAll('%APP_NOME%', APP.nome)
        .replaceAll('%APP_NOME_CURTO%', APP.nomeCurto)
        .replaceAll('%APP_DESCRICAO%', APP.descricao)
        .replaceAll('%APP_COR_TEMA%', APP.corTema)
        .replace('<!-- SPLASH -->', links);
    },
  };
}

export default defineConfig({
  define: { __APP_VERSAO__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  plugins: [
    react(),
    identidadeNoHtml(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        globIgnores: ['splash/**'],
      },
      includeAssets: ['logo.svg', 'favicon.svg', 'apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        id: '/',
        name: APP.nome,
        short_name: APP.nomeCurto,
        description: APP.descricao,
        lang: APP.idioma,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: APP.corTema,
        background_color: APP.corFundo,
        icons: [
          ...[48, 72, 96, 128, 144, 152, 192, 256, 384, 512].map((t) => ({
            src: `/icons/icon-${t}.png`,
            sizes: `${t}x${t}`,
            type: 'image/png',
            purpose: 'any',
          })),
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
  },
} as import('vite').UserConfig & { test: unknown });
