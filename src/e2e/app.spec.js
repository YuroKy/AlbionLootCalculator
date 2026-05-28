import { expect, test } from '@playwright/test';

test('renders, imports players, applies deductions, tracks paid transfers, and restores history', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Трибунал Луту' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Розподіл луту' })).toBeVisible();

  await page.getByRole('button', { name: 'Імпорт списку' }).click();
  await page
    .getByPlaceholder('Player A 1,200,000\nPlayer B: 850000')
    .fill('Alice 1,200,000\nBob: 0\nBad row');
  await page.getByRole('button', { name: 'Застосувати імпорт' }).click();
  await expect(page.getByRole('status')).toContainText('Імпортовано 2');
  await expect(page.getByText('Рядок 3')).toBeVisible();

  const silverInputs = page.locator('.silver-input input');
  await expect(silverInputs).toHaveCount(2);
  await expect(silverInputs.nth(0)).toHaveValue('1,200,000');

  await page.locator('.deductions-panel input').nth(0).fill('100000');
  await expect(page.locator('.deductions-panel input').nth(0)).toHaveValue('100,000');
  await expect(page.locator('.summary-strip').getByText('До розподілу', { exact: true })).toBeVisible();
  await expect(page.getByText('1,100,000').first()).toBeVisible();

  await expect(page.getByText('0 / 1 сплачено')).toBeVisible();
  await page.locator('.transaction-paid input').first().check({ force: true });
  await expect(page.getByText('1 / 1 сплачено')).toBeVisible();

  await page.reload();
  await expect(page.getByText('1 / 1 сплачено')).toBeVisible();

  await page.getByRole('button', { name: 'Для Discord' }).click();
  await expect(page.getByRole('status')).toContainText('Discord summary скопійовано');

  await page.getByRole('button', { name: 'Завершити розподіл' }).click();
  await expect(page.getByText('Розподіл завершено').first()).toBeVisible();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.getByText('1 / 1').last()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Статистика гравців' })).toBeVisible();
  await expect(page.locator('.player-stats-row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Експорт журналу' }).click();
  await expect(page.getByRole('status')).toContainText('JSON журналу скопійовано');

  const backup = await page.evaluate(() => localStorage.getItem('albion-loot-calculator-history'));
  await page.getByRole('button', { name: 'Очистити журнал' }).click();
  await expect(page.getByText('Журнал порожній')).toBeVisible();
  await page.getByPlaceholder('Встав JSON журналу сюди').fill(backup);
  await page.getByRole('button', { name: 'Імпорт журналу' }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);

  await page.locator('.history-filters select').selectOption('Alice');
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.locator('.history-filters input').fill('2,000,000');
  await expect(page.getByText('Нічого не знайдено')).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-v2-smoke.png`) });
});

test('desktop and mobile smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByRole('heading', { name: 'Перекази' })).toBeVisible();
  await expect(page.locator('.market-window')).toBeVisible();

  await page.setViewportSize({ width: 1360, height: 900 });
  await expect(page.getByRole('heading', { name: 'Статистика сесії' })).toBeVisible();
});
