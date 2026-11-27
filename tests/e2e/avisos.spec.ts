import { expect, test } from '@playwright/test';

test('revisita marcada para hoje aparece no sino e na tela Avisos, mesmo sem servidor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova propriedade' }).click();
  await page.getByLabel('Nome da propriedade').fill('Sítio Avisos');
  await page.getByRole('button', { name: 'Salvar propriedade' }).click();
  await page.getByRole('link', { name: /Sítio Avisos/ }).click();
  await page.getByLabel('Identificação (número ou nome)').fill('Estrela');
  await page.getByRole('button', { name: 'Adicionar animal' }).click();
  await page.getByRole('button', { name: 'Nova visita' }).click();
  await page.getByRole('button', { name: 'Adicionar animal à visita' }).click();
  await page.getByRole('button', { name: 'Estrela', exact: true }).click();

  await expect(page.getByTestId('avisos')).toHaveAccessibleName('Avisos');
  const hoje = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.getByRole('button', { name: 'Registrar conduta' }).click();
  await page.getByRole('combobox', { name: 'Conduta', exact: true }).selectOption('revisita');
  await page.getByLabel('Data da revisita').fill(hoje);
  await page.getByRole('button', { name: 'Salvar conduta' }).click();

  await expect(page.getByTestId('avisos')).toHaveAccessibleName('1 avisos');
  await page.getByTestId('avisos').click();
  await expect(page.getByTestId('aviso-revisita')).toContainText('Revisita hoje');
  await expect(page.getByTestId('aviso-revisita')).toContainText('Estrela · Sítio Avisos');
  await page.getByTestId('aviso-revisita').getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Estrela', level: 1 })).toBeVisible();

  // Sem servidor configurado, o app explica que os avisos ficam na tela Avisos.
  await page.goto('/configuracoes#notificacoes');
  await expect(page.getByTestId('estado-push')).toContainText('precisam do servidor');
});
