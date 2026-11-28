import { expect, test, type Page } from '@playwright/test';

/** Simula o convite de instalação do navegador (Chrome/Edge/Android). */
async function oferecerInstalacao(page: Page) {
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>;
    e.prompt = async () => {
      (window as unknown as { pediuInstalar: number }).pediuInstalar = ((window as unknown as { pediuInstalar?: number }).pediuInstalar ?? 0) + 1;
    };
    e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
}

test('o convite de instalar some sozinho e a instalação continua no menu e em Configurações', async ({ page }) => {
  await page.goto('/');
  await oferecerInstalacao(page);
  const convite = page.getByTestId('convite-instalar');
  await expect(convite).toBeVisible();
  await expect(convite.getByRole('button', { name: 'Instalar' })).toBeVisible();
  // Some sozinho em 6 segundos e não volta na mesma sessão.
  await expect(convite).toBeHidden({ timeout: 8000 });
  await page.reload();
  await oferecerInstalacao(page);
  await expect(page.getByRole('heading', { name: 'Propriedades' })).toBeVisible();
  await expect(page.getByTestId('convite-instalar')).toBeHidden();

  // Menu ☰ → Instalar o app
  await page.getByTestId('menu').click();
  await page.getByRole('button', { name: 'Instalar o app' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { pediuInstalar?: number }).pediuInstalar)).toBe(1);

  // Menu ☰ → Configurações → Instalar o app
  await oferecerInstalacao(page);
  await page.getByTestId('menu').click();
  await page.getByRole('link', { name: 'Configurações', exact: true }).click();
  const secao = page.getByTestId('config-instalar');
  await secao.getByRole('button', { name: 'Instalar' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { pediuInstalar?: number }).pediuInstalar)).toBe(2);
});
