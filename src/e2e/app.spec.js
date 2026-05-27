import { expect, test } from '@playwright/test';

test('renders, masks silver, manages players, and copies actions', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Трибунал Луту' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Розподіл луту' })).toBeVisible();

  const silverInputs = page.locator('.silver-input input');
  await expect(silverInputs).toHaveCount(3);

  await silverInputs.nth(0).fill('1200000');
  await expect(silverInputs.nth(0)).toHaveValue('1,200,000');
  await expect(page.getByText('1,200,000').first()).toBeVisible();

  await page.getByRole('button', { name: 'Додати гравця' }).click();
  await expect(silverInputs).toHaveCount(4);

  await page.getByRole('button', { name: 'Прибрати гравця' }).click();
  await expect(silverInputs).toHaveCount(3);

  await page.getByRole('button', { name: 'Скопіювати перекази' }).click();
  await expect(page.getByRole('status')).toContainText('Перекази скопійовано');

  await page.getByRole('button', { name: 'Скопіювати лінк' }).click();
  await expect(page.getByRole('status')).toContainText('Лінк скопійовано');

  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-smoke.png`) });
});
