import { defineConfig, devices } from '@playwright/test';

/**
 * E2E rodam contra o build de produção (service worker real).
 * WebKit é o alvo principal (motor do Safari): `npx playwright install webkit` na sua máquina ou no CI.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off', locale: 'pt-BR', timezoneId: 'America/Recife' },
  globalSetup: './tests/e2e/preparar-servidor.ts',
  webServer: [
    { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
    // Com E2E_DATABASE_URL: API real + build do app apontando para ela (npm run build:e2e).
    ...(process.env.E2E_DATABASE_URL
      ? [
          {
            command: 'npm run server',
            url: 'http://localhost:8787/api/saude',
            reuseExistingServer: true,
            timeout: 60_000,
            env: { DATABASE_URL: process.env.E2E_DATABASE_URL, ORIGENS: 'http://localhost:4174', PORT: '8787' },
          },
          { command: 'npx vite preview --port 4174 --outDir dist-e2e', url: 'http://localhost:4174', reuseExistingServer: true, timeout: 60_000 },
        ]
      : []),
  ],
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Permite apontar para um Chromium já instalado (ex.: CHROMIUM_PATH=/opt/pw-browsers/chromium).
        launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
      },
    },
  ],
});
