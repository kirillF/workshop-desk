import { test, expect } from './fixtures.mjs';

test('logout transport failure hides private UI and requires confirmed retry', async ({
  page,
  desk,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('organizer@praktika.local');
  await page.getByLabel('Пароль').fill('Praktika-demo-2026!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сервисы', exact: true })).toBeVisible();
  await page.route('**/auth/logout', (route) => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Выход не подтверждён');
  await expect(page.getByRole('button', { name: 'Сервисы', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Войти в Практику' })).toHaveCount(0);
  expect((await page.request.get(desk.apiUrl + '/auth/session')).status()).toBe(200);
  await page.getByRole('button', { name: 'Повторить выход', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Войти в Практику' })).toBeVisible();
  expect((await page.request.get(desk.apiUrl + '/auth/session')).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Войти в Практику' })).toBeVisible();
});
