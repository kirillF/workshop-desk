import { test, expect } from './fixtures.mjs';

const spare = 'workshop-spare';
const r1 = 'registration-spare-confirmed';
const r2 = 'registration-spare-waitlisted';
const row = (page, id) => page.getByTestId(`registration-row-${id}`);
const unknown = (page) => page.locator('[data-testid^="unknown-operation-"]');
const synced = (page) => expect(page.getByTestId('sync-status')).toHaveText('Синхронизировано');
const credentials = {
  'organizer-1': { email: 'organizer@praktika.local', password: 'Praktika-demo-2026!' },
  'participant-1': { email: 'anna@praktika.local', password: 'Praktika-demo-2026!' },
  'participant-2': { email: 'boris@praktika.local', password: 'Praktika-demo-2026!' },
  'participant-3': { email: 'vera@praktika.local', password: 'Praktika-demo-2026!' },
  'participant-4': { email: 'gleb@praktika.local', password: 'Praktika-demo-2026!' },
};
async function signIn(page, actor) {
  const account = credentials[actor];
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Пароль').fill(account.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
}
async function open(page, actor = 'organizer-1', workshop = spare) {
  await page.goto('http://127.0.0.1:14701/');
  await signIn(page, actor);
  if (actor === 'organizer-1') {
    await page.getByLabel('Воркшоп', { exact: true }).selectOption(workshop);
  } else {
    await page
      .getByTestId(`workshop-card-${workshop}`)
      .getByRole('button', { name: 'Подробнее' })
      .click();
  }
  await synced(page);
}
async function cancel(page, locator) {
  await locator.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function fill(page, name = 'Тестовый участник') {
  await page.getByRole('button', { name: /Открыть форму регистрации|Подать заявку снова/ }).click();
  await page.getByLabel('Имя участника', { exact: true }).fill(name);
  await page.getByLabel('Комментарий', { exact: true }).fill('Мой черновик');
}
const patch = (desk, id, action, version = 1, actor = 'organizer-1') =>
  desk.json(`/registrations/${id}`, {
    method: 'PATCH',
    actor,
    data: { action, expectedVersion: version },
  });
const read = async (desk, workshop = spare) =>
  (await desk.json(`/workshops/${workshop}/registrations`, { actor: 'organizer-1' })).data;
const control = (desk, id, phase = 'before', action = 'hold') =>
  desk.rule({ method: 'PATCH', path: `/registrations/${id}`, phase, action });

test('AC01/07: booking, reload, cancellation, and conditional re-registration', async ({
  page,
  desk,
}) => {
  await open(page, 'participant-4');
  await fill(page);
  await page.getByRole('button', { name: 'Забронировать место', exact: true }).click();
  await synced(page);
  await expect(page.getByLabel('Имя участника', { exact: true })).toHaveCount(0);
  let data = await read(desk);
  const original = data.registrations.find((r) => r.participantId === 'participant-4');
  expect(original.status).toBe('confirmed');
  expect(data.workshop.confirmedCount).toBe(2);
  await page.reload();
  await page.getByRole('button', { name: 'Текущий воркшоп' }).click();
  await synced(page);
  await cancel(page, page.getByRole('button', { name: 'Отменить регистрацию', exact: true }));
  await synced(page);
  await fill(page, 'Повторная заявка');
  await page.getByRole('button', { name: 'Забронировать место', exact: true }).click();
  await synced(page);
  data = await read(desk);
  const current = data.registrations.find((r) => r.participantId === 'participant-4');
  expect(current.id).toBe(original.id);
  expect(current.version).toBe(3);
  expect(current.status).toBe('confirmed');
});

test('AC03: capacity conflict preserves fields and requires explicit waiting-list consent', async ({
  page,
  desk,
}) => {
  await open(page, 'participant-1', 'workshop-last-seat');
  await fill(page);
  expect(
    (
      await desk.json('/workshops/workshop-last-seat/registrations', {
        method: 'POST',
        actor: 'participant-2',
        data: { attendeeName: 'Борис', comment: '', mode: 'seat', expectedVersion: null },
      })
    ).status,
  ).toBe(201);
  await page.getByRole('button', { name: 'Забронировать место', exact: true }).click();
  await synced(page);
  await expect(page.getByLabel('Имя участника', { exact: true })).toHaveValue('Тестовый участник');
  await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Мой черновик');
  expect(
    (await read(desk, 'workshop-last-seat')).registrations.some(
      (r) => r.participantId === 'participant-1',
    ),
  ).toBe(false);
  await page.getByRole('button', { name: 'Встать в лист ожидания', exact: true }).click();
  await synced(page);
  expect(
    (await read(desk, 'workshop-last-seat')).registrations.find(
      (r) => r.participantId === 'participant-1',
    ).status,
  ).toBe('waitlisted');
});

test('FR03/AC04: full-workshop form keeps explicit waitlist intent after a seat opens', async ({
  page,
  desk,
}) => {
  await patch(desk, 'registration-full-waitlisted-1', 'cancel');
  await open(page, 'participant-1', 'workshop-full');
  await fill(page);
  await patch(desk, 'registration-full-confirmed-1', 'cancel');
  await page.getByRole('button', { name: 'Обновить статус', exact: true }).first().click();
  await synced(page);
  await page.getByLabel('Имя участника', { exact: true }).press('Enter');
  await synced(page);
  let data = await read(desk, 'workshop-full');
  expect(data.registrations.find((r) => r.participantId === 'participant-1').status).toBe(
    'waitlisted',
  );
  expect(data.workshop.availableSeats).toBe(1);
  await cancel(page, page.getByRole('button', { name: 'Отменить регистрацию', exact: true }));
  await synced(page);
  expect((await read(desk, 'workshop-full')).workshop.availableSeats).toBe(1);
});

for (const rejectionFirst of [false, true])
  test(`AC08/09: independent rollback with rejection ${rejectionFirst ? 'before' : 'after'} B acknowledgement`, async ({
    page,
    desk,
  }) => {
    await open(page);
    const a = await control(desk, r1);
    const b = await control(desk, r2, 'after');
    await cancel(page, row(page, r1).getByRole('button', { name: 'Отменить', exact: true }));
    const qa = await desk.queued(a);
    await row(page, r2).getByRole('button', { name: 'Подтвердить', exact: true }).click();
    const qb = await desk.queued(b);
    const refresh = await desk.rule({
      method: 'GET',
      path: `/workshops/${spare}/registrations`,
      phase: 'before',
      action: 'hold',
      count: 2,
    });
    if (rejectionFirst) {
      await desk.release(qa, 'reject');
      await desk.queued(refresh);
      await desk.release(qb);
    } else {
      await desk.release(qb);
      await desk.queued(refresh);
      await desk.release(qa, 'reject');
    }
    await expect(row(page, r1)).toContainText('Подтверждена');
    await expect(row(page, r2)).toContainText('Подтверждена');
    await expect(page.getByTestId(`registration-error-${r1}`)).toBeVisible();
    await expect
      .poll(
        async () =>
          (await desk.json('/__test/queue')).data.queue.filter((q) => q.ruleId === refresh).length,
      )
      .toBe(2);
    for (const q of (await desk.json('/__test/queue')).data.queue) await desk.release(q);
    await synced(page);
    await expect(page.getByTestId('counter-confirmed').locator('strong')).toHaveText('2');
  });

test('AC11: stale second client conflicts and synchronizes', async ({ page, browser, desk }) => {
  await open(page);
  const context = await browser.newContext();
  const second = await context.newPage();
  try {
    await open(second);
    await row(page, r2).getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await synced(page);
    await row(second, r2).getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await synced(second);
    await expect(second.getByTestId(`registration-error-${r2}`)).toBeVisible();
    expect((await read(desk)).registrations.find((r) => r.id === r2).version).toBe(2);
    await expect(row(second, r2)).toContainText('Подтверждена');
  } finally {
    await context.close();
  }
});

test('AC12: committed lost response stays unknown through refresh until explicit continuation', async ({
  page,
  desk,
}) => {
  await open(page);
  await control(desk, r2, 'after', 'drop');
  await row(page, r2).getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(unknown(page)).toHaveCount(1);
  await unknown(page).getByRole('button', { name: 'Обновить статус', exact: true }).click();
  await expect(
    unknown(page).getByRole('button', { name: 'Продолжить с текущего состояния' }),
  ).toBeEnabled();
  await expect(unknown(page)).toContainText('Подтверждена');
  await expect(row(page, r2).getByRole('button', { name: 'Отменить', exact: true })).toBeDisabled();
  expect((await read(desk)).registrations.find((r) => r.id === r2).version).toBe(2);
  await unknown(page).getByRole('button', { name: 'Продолжить с текущего состояния' }).click();
  await expect(unknown(page)).toHaveCount(0);
  await synced(page);
});

test('AC13: held old snapshot cannot overwrite an acknowledged mutation', async ({
  page,
  desk,
}) => {
  await open(page);
  const rule = await desk.rule({
    method: 'GET',
    path: `/workshops/${spare}/registrations`,
    phase: 'after',
    action: 'hold',
  });
  // Start mutation while the fresh UI is actionable, then issue an older read before commit.
  const mutation = await control(desk, r2);
  await row(page, r2).getByRole('button', { name: 'Подтвердить', exact: true }).click();
  const qm = await desk.queued(mutation);
  await page.getByRole('button', { name: 'Обновить статус', exact: true }).first().click();
  const qr = await desk.queued(rule);
  await desk.release(qm);
  await synced(page);
  await desk.release(qr);
  await expect(row(page, r2)).toContainText('Подтверждена');
  await expect(page.getByTestId('counter-confirmed').locator('strong')).toHaveText('2');
  await synced(page);
});

test('AC15: invalid input and definitive service rejection preserve the draft', async ({
  page,
  desk,
}) => {
  await open(page, 'participant-4');
  await fill(page, '   ');
  await page.getByRole('button', { name: 'Забронировать место', exact: true }).click();
  await expect(page.getByLabel('Имя участника', { exact: true })).toBeFocused();
  await page.getByLabel('Имя участника', { exact: true }).fill('Исправлено');
  await desk.rule({
    method: 'POST',
    path: `/workshops/${spare}/registrations`,
    phase: 'before',
    action: 'reject',
  });
  await page.getByRole('button', { name: 'Забронировать место', exact: true }).click();
  await synced(page);
  await expect(page.getByLabel('Имя участника', { exact: true })).toHaveValue('Исправлено');
  await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Мой черновик');
  await expect(page.getByRole('alert').first()).toBeVisible();
});

test('AC15: initial read failure has an effective retry', async ({ page }) => {
  await page.route(`**/workshops/${spare}/registrations`, (route) => route.abort('failed'));
  await page.goto('http://127.0.0.1:14701/');
  await signIn(page, 'organizer-1');
  await expect(page.getByTestId('sync-status')).toHaveText('Ошибка обновления');
  await page.unroute(`**/workshops/${spare}/registrations`);
  await page.getByRole('button', { name: 'Обновить статус', exact: true }).first().click();
  await synced(page);
  await expect(row(page, r2)).toBeVisible();
});

for (const reregister of [false, true])
  test(`AC10/17/20: reopening pending ${reregister ? 're-registration' : 'creation'} preserves draft and shared guard`, async ({
    page,
    desk,
  }) => {
    const actor = reregister ? 'participant-1' : 'participant-4';
    if (reregister) await patch(desk, r1, 'cancel');
    await open(page, actor);
    await fill(page);
    const id = await desk.rule({
      method: 'POST',
      path: `/workshops/${spare}/registrations`,
      phase: 'after',
      action: 'hold',
    });
    await page.getByRole('button', { name: 'Забронировать место', exact: true }).click();
    const q = await desk.queued(id);
    await page.getByRole('button', { name: 'Закрыть и удалить черновик' }).click();
    await fill(page, 'Новый черновик');
    await expect(
      page.getByRole('button', { name: 'Забронировать место', exact: true }),
    ).toBeDisabled();
    await desk.release(q);
    await synced(page);
    await expect(page.getByLabel('Имя участника', { exact: true })).toHaveValue('Новый черновик');
    expect((await read(desk)).registrations.filter((r) => r.participantId === actor)).toHaveLength(
      1,
    );
    expect(
      (await desk.json('/__test/log')).data.events.filter(
        (e) =>
          e.event === 'arrived' &&
          e.method === 'POST' &&
          e.path === `/workshops/${spare}/registrations`,
      ),
    ).toHaveLength(1);
  });

test('AC17: old workshop response cannot alter the new context', async ({ page, desk }) => {
  await open(page);
  const id = await control(desk, r2, 'after');
  await row(page, r2).getByRole('button', { name: 'Подтвердить', exact: true }).click();
  const q = await desk.queued(id);
  await page.getByLabel('Воркшоп', { exact: true }).selectOption('workshop-full');
  await synced(page);
  await desk.release(q);
  await expect(row(page, r2)).toHaveCount(0);
  await expect(page.getByTestId('counter-available').locator('strong')).toHaveText('0');
  await page.getByLabel('Воркшоп', { exact: true }).selectOption(spare);
  await synced(page);
  await expect(row(page, r2)).toContainText('Подтверждена');
});

test('AC18/19: precommit timeout, explicit continuation, and old callback preserve new guard', async ({
  page,
  desk,
}) => {
  await open(page);
  const old = await control(desk, r2);
  await row(page, r2).getByRole('button', { name: 'Подтвердить', exact: true }).click();
  const qo = await desk.queued(old);
  await expect(unknown(page)).toHaveCount(1);
  await unknown(page).getByRole('button', { name: 'Обновить статус', exact: true }).click();
  await expect(
    unknown(page).getByRole('button', { name: 'Продолжить с текущего состояния' }),
  ).toBeEnabled();
  await expect(unknown(page)).toContainText('В листе ожидания');
  await unknown(page).getByRole('button', { name: 'Продолжить с текущего состояния' }).click();
  const fresh = await control(desk, r2, 'after');
  await cancel(page, row(page, r2).getByRole('button', { name: 'Отменить', exact: true }));
  const qn = await desk.queued(fresh);
  await desk.release(qo);
  await expect(row(page, r2)).toContainText('Отменена');
  await expect(row(page, r2)).toContainText('Ожидаем ответ сервера');
  await desk.release(qn);
  await synced(page);
  const registration = (await read(desk)).registrations.find((r) => r.id === r2);
  expect(registration.status).toBe('cancelled');
  expect(registration.version).toBe(2);
});

test('AC21: reload restores pending as unknown without resending', async ({ page, desk }) => {
  await open(page);
  const id = await control(desk, r2);
  await row(page, r2).getByRole('button', { name: 'Подтвердить', exact: true }).click();
  const q = await desk.queued(id);
  await page.reload();
  await expect(unknown(page)).toHaveCount(1);
  await expect(
    unknown(page).getByRole('button', { name: 'Продолжить с текущего состояния' }),
  ).toBeEnabled();
  const log = (await desk.json('/__test/log')).data;
  expect(log.events.filter((e) => e.event === 'arrived' && e.method === 'PATCH')).toHaveLength(1);
  await desk.release(q);
  await unknown(page).getByRole('button', { name: 'Обновить статус', exact: true }).click();
  await expect(unknown(page)).toContainText('Подтверждена');
  await expect(unknown(page)).toHaveCount(1);
});

for (const width of [390, 1280])
  test(`AC16: keyboard registration at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, 'participant-4');
    await page.getByRole('button', { name: 'Открыть форму регистрации' }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Имя участника', { exact: true }).focus();
    await page.keyboard.type('Keyboard');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Комментарий', { exact: true })).toBeFocused();
    await page.keyboard.type('Comment');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Забронировать место', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await synced(page);
    await expect(
      page.getByRole('button', { name: 'Отменить регистрацию', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

test('AC05: full organizer confirmation rejects without taking a seat', async ({ page, desk }) => {
  await open(page, 'organizer-1', 'workshop-full');
  const id = 'registration-full-waitlisted-1';
  await row(page, id).getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await synced(page);
  await expect(row(page, id)).toContainText('В листе ожидания');
  await expect(page.getByTestId(`registration-error-${id}`)).toBeVisible();
  expect((await read(desk, 'workshop-full')).workshop.availableSeats).toBe(0);
});

test('AC17: late rejection across identity switches leaves the new draft intact', async ({
  page,
  desk,
}) => {
  await open(page, 'participant-4');
  await fill(page);
  const id = await desk.rule({
    method: 'POST',
    path: `/workshops/${spare}/registrations`,
    phase: 'before',
    action: 'hold',
  });
  await page.getByRole('button', { name: 'Забронировать место', exact: true }).click();
  const q = await desk.queued(id);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Войти в Практику' })).toBeVisible();
  await signIn(page, 'participant-3');
  await page
    .getByTestId(`workshop-card-${spare}`)
    .getByRole('button', { name: 'Подробнее' })
    .click();
  await synced(page);
  await fill(page, 'Новая личность');
  await desk.release(q, 'reject');
  await synced(page);
  await expect(page.getByLabel('Имя участника', { exact: true })).toHaveValue('Новая личность');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Войти в Практику' })).toBeVisible();
  await signIn(page, 'participant-4');
  await page
    .getByTestId(`workshop-card-${spare}`)
    .getByRole('button', { name: 'Подробнее' })
    .click();
  await synced(page);
  await expect(page.getByRole('button', { name: 'Открыть форму регистрации' })).toBeEnabled();
});

test('AC15/16: cancellation failure remains visible and dialog returns keyboard focus', async ({
  page,
  desk,
}) => {
  await open(page, 'participant-1');
  const trigger = page.getByRole('button', { name: 'Отменить регистрацию', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await control(desk, r1, 'before', 'reject');
  await cancel(page, trigger);
  await synced(page);
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(trigger).toBeEnabled();
});

for (const [actor, workshop, id, status] of [
  ['participant-3', 'workshop-full', 'registration-full-confirmed-1', 'confirmed'],
  ['participant-2', 'workshop-spare', 'registration-spare-waitlisted', 'waitlisted'],
]) {
  test(`edit ${status}: save and reload preserve status and capacity`, async ({ page, desk }) => {
    await open(page, actor, workshop);
    const before = await read(desk, workshop);
    await page.getByRole('button', { name: 'Изменить данные', exact: true }).click();
    await page.getByLabel('Имя участника', { exact: true }).fill('Новое имя');
    await page.getByLabel('Комментарий', { exact: true }).fill('Уточнение к заявке');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('button', { name: 'Изменить данные', exact: true })).toBeVisible();
    await synced(page);
    const after = await read(desk, workshop);
    expect(after.workshop).toEqual(before.workshop);
    expect(after.registrations.find((r) => r.id === id)).toMatchObject({
      attendeeName: 'Новое имя',
      comment: 'Уточнение к заявке',
      status,
      version: 2,
    });
    await page.reload();
    await page.getByRole('button', { name: 'Текущий воркшоп' }).click();
    await synced(page);
    await page.getByRole('button', { name: 'Изменить данные', exact: true }).click();
    await expect(page.getByLabel('Имя участника', { exact: true })).toHaveValue('Новое имя');
    await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Уточнение к заявке');
  });
}

test('edit keeps the opening version after an external cancellation and retains the draft', async ({
  page,
  desk,
}) => {
  await open(page, 'participant-1');
  await page.getByRole('button', { name: 'Изменить данные', exact: true }).click();
  await page.getByLabel('Комментарий', { exact: true }).fill('Несохранённое уточнение');
  expect((await patch(desk, r1, 'cancel')).status).toBe(200);
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /измен|устар/i })
      .first(),
  ).toBeVisible();
  await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue(
    'Несохранённое уточнение',
  );
  const after = await read(desk);
  expect(after.registrations.find((r) => r.id === r1)).toMatchObject({
    status: 'cancelled',
    version: 2,
  });
});
