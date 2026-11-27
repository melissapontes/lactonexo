import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('laudo em PDF e planilhas são gerados no aparelho, mesmo sem internet', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/configuracoes');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button', { name: 'Carregar laudo de exemplo' }).click();
  await expect(page.getByTestId('totais')).toHaveText('8 animais · 32 tetos · 11 amostras de 6 animais');

  // Sem sinal: o gerador de PDF (carregado sob demanda) vem do cache do app.
  await context.setOffline(true);
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar PDF' }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/^Laudo-.*-2026-09-29\.pdf$/);
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(10_000);
  await expect(page.getByTestId('aviso-baixado')).toContainText('PDF salvo no aparelho');
  await page.getByRole('button', { name: 'Marcar como enviado' }).click();
  await expect(page.getByText('marcada como "Laudo enviado"')).toBeVisible();

  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(readFileSync((await xlsx.path())!).subarray(0, 2).toString()).toBe('PK');

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()]);
  const texto = readFileSync((await csv.path())!, 'utf8');
  expect(texto).toContain('Ordem;Animal;Tubo;Teto;Tamis;CMT;Resultado');
  expect(texto).toContain('6;Maravilha 262;7;Composto;-;-;Sem crescimento');
  await context.close();
});
