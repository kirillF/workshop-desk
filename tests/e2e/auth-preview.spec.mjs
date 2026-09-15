import { test, expect } from './fixtures.mjs';

const accounts = {
  organizer: { email: 'organizer@praktika.local', password: 'Praktika-demo-2026!' },
  participant: { email: 'anna@praktika.local', password: 'Praktika-demo-2026!' },
};

async function signIn(page, account, password = accounts[account].password) {
  await page.getByLabel('Email').fill(accounts[account].email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Войти в Практику' })).toBeVisible();
}

async function openParticipantPreview(page) {
  await page.getByRole('button', { name: 'Сервисы', exact: true }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Анна', exact: true }).click();
  await expect(page.getByTestId('preview-banner')).toContainText('Просмотр от лица Анна');
  await expect(page.getByTestId('preview-banner')).toContainText('Только просмотр');
}

test('WD10: login exposes generic errors, restores session, and logs out', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Войти в Практику' })).toBeVisible();
  await page.getByLabel('Email').fill(accounts.organizer.email);
  await page.getByLabel('Пароль').fill('wrong-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль.');
  await signIn(page, 'organizer');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
  await signOut(page);
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('WD11/12: organizer preview is visibly read-only and participant access is absent', async ({
  page,
  desk,
}) => {
  await page.goto('/');
  await signIn(page, 'participant');
  await expect(page.getByRole('button', { name: 'Сервисы', exact: true })).toHaveCount(0);
  await signOut(page);
  await signIn(page, 'organizer');
  await openParticipantPreview(page);

  await expect(page.getByTestId('workshop-card-workshop-spare')).toContainText('Подтверждена');
  await page
    .getByTestId('workshop-card-workshop-last-seat')
    .getByRole('button', { name: 'Подробнее' })
    .click();
  await expect(page.locator('#preview-workshop-title')).toHaveText('Архитектура React');
  await page.getByRole('button', { name: 'Открыть форму регистрации' }).click();
  await expect(page.getByRole('heading', { name: 'Форма регистрации' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Отправка недоступна в режиме просмотра' }),
  ).toBeDisabled();
  await expect(page.getByLabel('Имя участника', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Комментарий', { exact: true })).toBeDisabled();

  const before = await desk.json('/workshops/workshop-last-seat/registrations', {
    actor: 'organizer-1',
  });
  await expect(
    page.getByRole('button', { name: 'Отправка недоступна в режиме просмотра' }),
  ).toBeDisabled();
  const after = await desk.json('/workshops/workshop-last-seat/registrations', {
    actor: 'organizer-1',
  });
  expect(after.data).toEqual(before.data);
});

test('WD11/12: leaving or reloading exits participant preview', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'organizer');
  await openParticipantPreview(page);
  await page
    .getByTestId('preview-banner')
    .getByRole('button', { name: 'Вернуться', exact: true })
    .click();
  await expect(page.getByTestId('preview-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сервисы', exact: true })).toBeVisible();

  await openParticipantPreview(page);
  await page.reload();
  await expect(page.getByTestId('preview-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сервисы', exact: true })).toBeVisible();
});

for (const status of [200, 401]) {
  test(`AUTH-AC-08: delayed old-session ${status} cannot affect a new login`, async ({
    page,
    desk,
  }) => {
    await page.goto('/');
    await signIn(page, 'participant');
    await expect(page.getByTestId('sync-status')).toHaveText('Синхронизировано');
    let captured;
    const held = new Promise((resolve) => {
      captured = resolve;
    });
    await page.route('**/workshops/workshop-spare', (route) => captured(route), { times: 1 });
    await page
      .getByTestId('workshop-card-workshop-spare')
      .getByRole('button', { name: 'Подробнее' })
      .click();
    // Opening cached details need not issue a request. Explicitly refresh the old session.
    await page.getByRole('button', { name: 'Обновить статус', exact: true }).first().click();
    const route = await held;
    const response = status === 200 ? await route.fetch() : null;
    await signOut(page);
    await signIn(page, 'organizer');
    const delivered = page.waitForResponse(
      (r) => r.url().endsWith('/workshops/workshop-spare') && r.status() === status,
    );
    if (response) await route.fulfill({ response });
    else
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Сессия истекла.' }),
      });
    await delivered;
    await page.getByRole('button', { name: 'Каталог', exact: true }).click();
    await expect(page.getByTestId('workshop-card-workshop-spare')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сервисы', exact: true })).toBeVisible();
    const session = await page.request.get(desk.apiUrl + '/auth/session');
    expect(session.status()).toBe(200);
    expect((await session.json()).user.id).toBe('organizer-1');
  });
}

test('AUTH-AC-07: held preview detail cannot replace another workshop or participant', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page, 'organizer');
  await openParticipantPreview(page);
  let captured;
  const held = new Promise((resolve) => {
    captured = resolve;
  });
  await page.route('**/workshops/workshop-last-seat', (route) => captured(route), { times: 1 });
  await page.locator('#preview-workshop-select').selectOption('workshop-last-seat');
  const route = await held;
  const response = await route.fetch();
  await page.locator('#preview-workshop-select').selectOption('workshop-full');
  await expect(page.locator('#preview-workshop-title')).toHaveText('Надёжный фронтенд');
  await page
    .getByTestId('preview-banner')
    .getByRole('button', { name: 'Вернуться', exact: true })
    .click();
  await page.getByRole('button', { name: 'Сервисы', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Борис', exact: true }).click();
  await expect(page.getByTestId('preview-banner')).toContainText('Борис');
  await route.fulfill({ response });
  await expect(page.getByTestId('preview-banner')).toContainText('Борис');
  await expect(page.getByRole('heading', { name: 'Борис', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Практика/ }).click();
  await expect(page.getByTestId('preview-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сервисы', exact: true })).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`AUTH-AC-12: keyboard login, services, preview and return at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByLabel('Email').focus();
    await page.keyboard.type(accounts.organizer.email);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Пароль')).toBeFocused();
    await page.keyboard.type(accounts.organizer.password);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
    await expect(page.locator('.context')).toContainText('Организатор');
    await expect(page.locator('.context > span').first()).toBeVisible();
    const services = page.getByRole('button', { name: 'Сервисы', exact: true });
    await services.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Анна', exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('menuitem', { name: 'Анна', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('preview-banner')).toContainText('Анна');
    const back = page
      .getByTestId('preview-banner')
      .getByRole('button', { name: 'Вернуться', exact: true });
    await back.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('preview-banner')).toHaveCount(0);
    await expect(services).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
