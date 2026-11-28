import { expect, test, type Page } from '@playwright/test';

/** Botão + da propriedade: abre a lista e escolhe a ação. */
async function adicionar(page: Page, acao: 'Nova visita' | 'Novo animal') {
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('menuitem', { name: acao }).click();
}
async function novoAnimal(page: Page, identificacao: string) {
  await adicionar(page, 'Novo animal');
  await page.getByLabel('Identificação (número ou nome)').fill(identificacao);
  await page.getByRole('button', { name: 'Salvar animal' }).click();
}

async function controladoPeloSW(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('visita preenchida sem internet sobrevive a fechar e reabrir o app', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await controladoPeloSW(page);

  // Cadastro com sinal.
  await page.getByRole('button', { name: 'Nova propriedade' }).click();
  await page.getByLabel('Nome da propriedade').fill('Sítio Teste');
  await page.getByRole('button', { name: 'Salvar propriedade' }).click();
  await page.getByRole('link', { name: /Sítio Teste/ }).click();
  await novoAnimal(page, '064');
  await expect(page.getByRole('list', { name: 'Animais' }).getByText('064')).toBeVisible();

  // Chega na fazenda: sem sinal.
  await context.setOffline(true);
  await adicionar(page, 'Nova visita');
  await page.getByRole('button', { name: 'Adicionar animal à visita' }).click();
  await page.getByRole('button', { name: '064', exact: true }).click();

  // AE: Tamis negativo, CMT N → avança sozinho para AD.
  await page.getByTestId('tamis').getByRole('radio', { name: 'Negativo' }).click();
  await page.getByTestId('cmt').getByRole('radio', { name: 'N', exact: true }).click();
  await expect(page.getByTestId('teto-AD')).toHaveAttribute('aria-pressed', 'true');
  // AD: positivo, +++ e tubo 7.
  await page.getByTestId('tamis').getByRole('radio', { name: 'Positivo' }).click();
  await page.getByTestId('cmt').getByRole('radio', { name: '+++', exact: true }).click();
  await page.getByTestId('teto-AD').click();
  await page.getByLabel('Nº do tubo').fill('7');
  await page.getByRole('button', { name: 'Tubo deste teto' }).click();
  await expect(page.getByTestId('teto-AD')).toContainText('tubo 7');
  await page.getByRole('button', { name: 'Restantes negativos' }).click();
  await expect(page.getByTestId('teto-PD')).toContainText('CMT -');
  const urlVisita = page.url().replace(/\/animal\/.*/, '');

  // Fecha o app e reabre ainda offline.
  await page.close();
  const p2 = await context.newPage();
  await p2.goto(urlVisita);
  await expect(p2.getByTestId('estado-rede')).toHaveText('Offline');
  await expect(p2.getByText('4/4 tetos')).toBeVisible();

  // Resultado do laboratório chega depois.
  await p2.getByRole('link', { name: 'Laboratório' }).click();
  await p2.getByTestId('tubo-7').getByRole('button', { name: 'Staphylococcus aureus' }).click();
  await p2.getByRole('link', { name: 'Resumo' }).click();
  await expect(p2.getByTestId('totais')).toHaveText('1 animais · 4 tetos · 1 amostras de 1 animais');
  const t1 = p2.getByTestId('tabela-1');
  await expect(t1.getByRole('row', { name: /POSITIVO/ })).toContainText('25%');
  await expect(p2.getByTestId('tabela-3').getByRole('row', { name: /Staphylococcus aureus/ })).toContainText('100%');

  await context.setOffline(false);
  await expect(p2.getByTestId('estado-rede')).toHaveText('Online');
  await context.close();
});

test('laudo de exemplo reproduz as Tabelas 1 a 3', async ({ page }) => {
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Carregar laudo de exemplo' }).click();
  await expect(page.getByTestId('totais')).toHaveText('8 animais · 32 tetos · 11 amostras de 6 animais');
  await expect(page.getByTestId('tabela-1').getByRole('row', { name: /NEGATIVO/ })).toContainText('93,75%');
  await expect(page.getByTestId('tabela-2').getByRole('row', { name: /^\+\+\+\+/ })).toContainText('6,25%');
  await expect(page.getByText('Streptococcus aureus – amostra 10 e 11 (pool)')).toBeVisible();
});
