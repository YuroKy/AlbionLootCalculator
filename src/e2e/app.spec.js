import { expect, test } from '@playwright/test';

test('renders, masks silver, manages players, logs history, and shows charts', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

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

  await page.getByRole('button', { name: 'Завершити розподіл' }).click();
  await expect(page.getByText('Розподіл завершено').first()).toBeVisible();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.locator('.chart-row').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Статистика сесії' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Журнал розподілів' })).toBeVisible();

  await page.reload();
  await expect(page.locator('.history-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'Очистити журнал' }).click();
  await expect(page.locator('.history-row')).toHaveCount(0);
  await expect(page.getByText('Журнал порожній')).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-smoke.png`) });
});
