import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/** Botão + da propriedade: abre a lista e escolhe a ação. */
async function adicionar(page: Page, acao: 'Nova visita' | 'Novo animal') {
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('menuitem', { name: acao }).click();
}

/** E2E com servidor real: dois veterinários editam o mesmo teto sem internet. */
test.skip(!process.env.E2E_DATABASE_URL, 'Defina E2E_DATABASE_URL para rodar com servidor.');
test.use({ baseURL: 'http://localhost:4174' });

async function entrar(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill('senha-e2e-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: /Fazenda E2E/ })).toBeVisible({ timeout: 15_000 });
  return page;
}

async function sincronizarAgora(page: Page) {
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByTestId('pendentes')).toHaveText('Tudo salvo', { timeout: 15_000 });
}

async function marcarCmtAE(page: Page, grau: string) {
  await page.getByTestId('teto-AE').click();
  await page.getByTestId('cmt').getByRole('radio', { name: grau, exact: true }).click();
}

test('dois vets offline no mesmo teto: nada se perde e o conflito aparece para revisão', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await entrar(ctxA, 'ana@e2e.br');

  // Ana abre a visita com sinal e sincroniza.
  await a.getByRole('link', { name: /Fazenda E2E/ }).click();
  await expect(a.getByTestId('baixado')).toContainText('Pronta para uso offline');
  await adicionar(a, 'Nova visita');
  await a.getByRole('button', { name: 'Adicionar animal à visita' }).click();
  await a.getByRole('button', { name: '064', exact: true }).click();
  await marcarCmtAE(a, '+');
  const urlAnimal = a.url();
  await sincronizarAgora(a);

  // Beto entra e recebe a visita.
  const b = await entrar(ctxB, 'beto@e2e.br');
  await sincronizarAgora(b);
  await b.goto(urlAnimal);
  await expect(b.getByTestId('teto-AE')).toContainText('CMT +');

  // Os dois ficam sem sinal e alteram o mesmo teto.
  await ctxA.setOffline(true);
  await ctxB.setOffline(true);
  await marcarCmtAE(a, '++');
  await marcarCmtAE(b, '+++');
  await expect(a.getByTestId('pendentes')).toHaveText('1 alteração pendente');

  // Ana fecha e reabre o app ainda sem sinal: a alteração continua lá.
  await a.close();
  const a2 = await ctxA.newPage();
  await a2.goto(urlAnimal);
  await expect(a2.getByTestId('teto-AE')).toContainText('CMT ++');
  await expect(a2.getByTestId('pendentes')).toHaveText('1 alteração pendente');

  // Sinal volta: Ana envia primeiro, Beto depois (a edição do Beto é a mais recente).
  await ctxA.setOffline(false);
  await sincronizarAgora(a2);
  await ctxB.setOffline(false);
  await sincronizarAgora(b);
  await expect(b.getByTestId('teto-AE')).toContainText('CMT +++');
  await sincronizarAgora(a2);
  await expect(a2.getByTestId('teto-AE')).toContainText('CMT +++');

  // Os dois veem o conflito; Ana escolhe o valor dela.
  await expect(a2.getByTestId('conflitos')).toHaveText('1 conflito para revisar');
  await expect(b.getByTestId('conflitos')).toHaveText('1 conflito para revisar');
  await a2.getByTestId('conflitos').click();
  await expect(a2.getByTestId('conflito')).toContainText('CMT');
  await a2.getByRole('button', { name: /Usar “\+\+”/ }).click();
  await sincronizarAgora(a2);
  await sincronizarAgora(b);
  await b.goto(urlAnimal);
  await expect(b.getByTestId('teto-AE')).toContainText('CMT ++');
  await expect(b.getByTestId('conflitos')).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});
