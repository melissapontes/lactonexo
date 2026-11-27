import { expect, test, type Page } from '@playwright/test';

async function visitaCom(page: Page, data: string, cmtAE: string) {
  await page.getByLabel('Data da visita').fill(data);
  await page.getByRole('button', { name: 'Nova visita' }).click();
  await page.getByRole('button', { name: 'Adicionar animal à visita' }).click();
  await page.getByRole('button', { name: 'Mimosa', exact: true }).click();
  await page.getByTestId('tamis').getByRole('radio', { name: 'Negativo' }).click();
  await page.getByTestId('cmt').getByRole('radio', { name: cmtAE, exact: true }).click();
  await page.getByRole('button', { name: 'Restantes negativos' }).click();
  await expect(page.getByTestId('teto-PD')).toContainText('CMT -');
}

test('duas visitas com CMT alto geram sugestão; o vet registra a conduta e vê o histórico', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova propriedade' }).click();
  await page.getByLabel('Nome da propriedade').fill('Sítio Histórico');
  await page.getByRole('button', { name: 'Salvar propriedade' }).click();
  await page.getByRole('link', { name: /Sítio Histórico/ }).click();
  const urlProp = page.url();
  await page.getByLabel('Identificação (número ou nome)').fill('Mimosa');
  await page.getByRole('button', { name: 'Adicionar animal' }).click();

  await visitaCom(page, '2026-09-01', '++');
  await page.goto(urlProp);
  await visitaCom(page, '2026-10-01', '+++');

  // Na propriedade, o atalho do painel mostra as sugestões abertas.
  await page.goto(urlProp);
  await expect(page.getByTestId('link-painel')).toContainText('sugestões abertas');
  await page.getByTestId('link-painel').click();
  await expect(page.getByTestId('prevalencia')).toContainText('25%');
  await expect(page.getByTestId('comparacao').getByRole('row')).toHaveCount(3);

  const sug = page.getByTestId('sugestao').filter({ hasText: 'Teto AE com CMT ++ ou mais em 2 visitas seguidas' });
  await expect(sug).toBeVisible();
  await sug.getByRole('button', { name: 'Registrar conduta' }).click();
  await sug.getByLabel('Produto').fill('Cefalosporina intramamária');
  await sug.getByRole('button', { name: 'Salvar conduta' }).click();
  await expect(page.getByTestId('sugestao').filter({ hasText: 'Teto AE com CMT' })).toHaveCount(0);
  await page.getByRole('button', { name: /Ver respondidas/ }).click();
  await expect(page.getByTestId('sugestao').filter({ hasText: 'Teto AE com CMT' })).toHaveAttribute('data-estado', 'conduta_registrada');

  // Dispensar a sugestão de revisita.
  const rev = page.getByTestId('sugestao').filter({ hasText: 'Revisitar até' });
  await rev.getByRole('button', { name: 'Dispensar' }).click();
  await expect(page.getByTestId('sugestao').filter({ hasText: 'Revisitar até' })).toHaveAttribute('data-estado', 'dispensado');

  // Histórico do animal: gráficos por teto e a conduta na linha do tempo.
  await page.getByRole('link', { name: 'Mimosa' }).first().click();
  await expect(page.getByTestId('evolucao-cmt').getByRole('img', { name: /AE.*01\/09\/2026: CMT \+\+;.*01\/10\/2026: CMT \+\+\+/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Visitas do animal' }).getByText('Cefalosporina intramamária')).toBeVisible();

  // Regras ficam em Configurações e podem ser desligadas.
  await page.goto('/configuracoes');
  const caixa = page.getByTestId('regra-cmt_consecutivo').getByRole('checkbox');
  await expect(caixa).toBeChecked();
  // A caixa reflete o banco local: muda assim que a gravação termina.
  await caixa.click();
  await expect(caixa).not.toBeChecked();
  await page.goto(urlProp + '/painel');
  await page.getByRole('button', { name: /Ver respondidas/ }).click();
  await expect(page.getByTestId('sugestao').filter({ hasText: 'Teto AE com CMT' })).toHaveCount(0);
});
