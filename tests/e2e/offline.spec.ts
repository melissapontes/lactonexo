import { expect, test, devices, type Page } from '@playwright/test';

async function esperarServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Recarrega para a página passar a ser controlada pelo service worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function novaPropriedade(page: Page, nome: string, municipio: string) {
  await page.getByRole('button', { name: 'Nova propriedade' }).click();
  await page.getByLabel('Nome da propriedade').fill(nome);
  await page.getByLabel('Município').fill(municipio);
  await page.getByRole('button', { name: 'Salvar propriedade' }).click();
}

test('abre e salva sem internet, mantém pendências após fechar e reabrir', async ({ browser, browserName }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveTitle(/LactoNexo/);
  await esperarServiceWorker(page);

  await expect(page.getByTestId('estado-rede')).toHaveText('Online');
  await novaPropriedade(page, 'Logradouro', 'Queimadas');
  await expect(page.getByTestId('pendentes')).toHaveText('1 alteração pendente');

  // Rede cai no meio do preenchimento.
  await page.getByRole('button', { name: 'Nova propriedade' }).click();
  await page.getByLabel('Nome da propriedade').fill('Sítio Boa Vista');
  await context.setOffline(true);
  await expect(page.getByTestId('estado-rede')).toHaveText('Offline');
  await page.getByLabel('Município').fill('Campina Grande');
  await page.getByRole('button', { name: 'Salvar propriedade' }).click();
  await expect(page.getByTestId('pendentes')).toHaveText('2 alterações pendentes');

  // Animal novo sem internet: confirmação visível logo abaixo do botão.
  await page.getByRole('link', { name: /Sítio Boa Vista/ }).click();
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Novo animal' }).click();
  await page.getByLabel('Identificação (número ou nome)').fill('Mimosa');
  await page.getByRole('button', { name: 'Salvar animal' }).click();
  await expect(page.getByTestId('animal-salvo')).toHaveText('✓ "Mimosa" salvo no aparelho.');
  await expect(page.getByRole('list', { name: 'Animais' })).toContainText('Mimosa');
  await expect(page.getByTestId('pendentes')).toHaveText('3 alterações pendentes');

  // Fecha o app e reabre ainda sem internet.
  await page.close();
  const reaberta = await context.newPage();
  await reaberta.goto('/');
  await expect(reaberta.getByTestId('estado-rede')).toHaveText('Offline');
  await expect(reaberta.getByText('Logradouro')).toBeVisible();
  await expect(reaberta.getByText('Sítio Boa Vista')).toBeVisible();
  await expect(reaberta.getByTestId('pendentes')).toHaveText('3 alterações pendentes');

  // Rota profunda também abre offline (fallback de navegação do service worker).
  await reaberta.goto('/configuracoes');
  await expect(reaberta.getByRole('heading', { name: 'Configurações' })).toBeVisible();

  // Volta a rede: sem servidor configurado ainda (etapa c), os dados continuam guardados no aparelho.
  await context.setOffline(false);
  await expect(reaberta.getByTestId('estado-rede')).toHaveText('Online');
  await expect(reaberta.getByTestId('pendentes')).toHaveText('3 alterações pendentes');
  void browserName;
  await context.close();
});

test('no iPhone sem instalar, mostra o guia de instalação e o alerta de perda de dados', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'], isMobile: undefined, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('onboarding-ios')).toBeVisible();
  await expect(page.getByText('Adicionar à Tela de Início')).toBeVisible();
  await page.getByRole('button', { name: 'Só quero conhecer, sem instalar' }).click();
  await expect(page.getByTestId('aviso-nao-instalado')).toBeVisible();
  await context.close();
});
