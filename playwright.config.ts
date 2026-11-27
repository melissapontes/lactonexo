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
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
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
