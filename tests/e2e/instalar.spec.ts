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

test('a faixa de instalar pode ser fechada e a instalação continua em Configurações', async ({ page }) => {
  await page.goto('/');
  await oferecerInstalacao(page);
  const faixa = page.getByTestId('faixa-instalar');
  await expect(faixa).toBeVisible();
  await faixa.getByRole('button', { name: 'Agora não' }).click();
  await expect(faixa).toBeHidden();

  // A escolha fica guardada: ao reabrir, a faixa não volta.
  await page.reload();
  await oferecerInstalacao(page);
  await expect(page.getByRole('heading', { name: 'Propriedades' })).toBeVisible();
  await expect(page.getByTestId('faixa-instalar')).toBeHidden();

  await page.getByRole('link', { name: /Configurações: instalar o app/ }).click();
  const secao = page.getByTestId('config-instalar');
  await expect(secao.getByRole('heading', { name: 'Instalar o app' })).toBeVisible();
  await secao.getByRole('button', { name: 'Instalar' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { pediuInstalar?: number }).pediuInstalar)).toBe(1);
  await expect(secao.getByText('Tudo bem, dá para instalar depois por aqui.')).toBeVisible();
});
