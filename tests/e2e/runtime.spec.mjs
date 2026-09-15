import { test, expect } from './fixtures.mjs';

test('isolated browser and API runtime starts', async ({ page, desk }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Практика — воркшопы для инженеров');
  await expect(page.getByRole('main')).toBeVisible();
  const health = await desk.json('/health');
  expect(health.status).toBe(200);
  expect(health.data.database).toBe('ready');
});
