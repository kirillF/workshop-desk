import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RegistrationAction, RegistrationStatus, UserRole } from '@workshop-desk/contracts';
import { OrganizerView } from '../../apps/web/src/features/organizer/ui/OrganizerView.tsx';
import { OperationStore } from '../../apps/web/src/features/registrations/model/operations.ts';

function setup() {
  const workshop = {
    id: 'w',
    title: 'API',
    description: '',
    startsAt: '',
    location: 'A',
    capacity: 3,
    confirmedCount: 1,
    waitlistedCount: 1,
    availableSeats: 2,
  };
  const registrations = [
    { id: 'r1', participantId: 'a', attendeeName: 'Анна', status: RegistrationStatus.Confirmed },
    { id: 'r2', participantId: 'b', attendeeName: 'Борис', status: RegistrationStatus.Waitlisted },
  ].map((row) => ({ ...row, workshopId: 'w', comment: '', version: 1 }));
  const store = new OperationStore({ actorId: 'o', workshopId: 'w' });
  store.acceptRead(store.beginRead(), { workshop, registrations });
  const props = {
    state: store.getState(),
    identity: { id: 'o', displayName: 'Организатор', role: UserRole.Organizer },
    workshops: [
      { ...workshop, myRegistration: null },
      { ...workshop, id: 'other', myRegistration: null },
    ],
    selectedWorkshopId: 'w',
    workshop,
    onWorkshopChange: vi.fn(),
    onRefresh: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onContinue: vi.fn(),
    canContinue: () => false,
    participantName: (id: string) => (id === 'a' ? 'Анна Иванова' : 'Борис Петров'),
  };
  const view = render(<OrganizerView {...props} />);
  return { store, props, view, registrations };
}

it('combines search and status without changing workshop counters; reset restores rows', () => {
  setup();
  fireEvent.change(screen.getByLabelText('Поиск по имени'), { target: { value: '  ПЕТРОВ ' } });
  expect(screen.getByText('Найдено 1 из 2')).toBeTruthy();
  expect(screen.queryByTestId('registration-row-r1')).toBeNull();
  expect(screen.getByTestId('counter-confirmed').textContent).toBe('Подтверждено1');
  fireEvent.change(screen.getByLabelText('Статус регистрации'), {
    target: { value: RegistrationStatus.Confirmed },
  });
  expect(screen.getByText('По выбранным фильтрам регистраций нет.')).toBeTruthy();
  expect(screen.queryByText('В выбранном воркшопе пока нет регистраций.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
  expect(screen.getByText('Найдено 2 из 2')).toBeTruthy();
});

it('matches either name without joining text across the fields', () => {
  setup();
  fireEvent.change(screen.getByLabelText('Поиск по имени'), {
    target: { value: 'Анна Анна' },
  });
  expect(screen.getByText('Найдено 0 из 2')).toBeTruthy();
});

it('keeps feedback visible when an optimistic row leaves the status filter', () => {
  const { store, props, view } = setup();
  fireEvent.change(screen.getByLabelText('Статус регистрации'), {
    target: { value: RegistrationStatus.Waitlisted },
  });
  const started = store.startOperation({
    participantId: 'b',
    registrationId: 'r2',
    action: RegistrationAction.Confirm,
    optimisticPatch: { status: RegistrationStatus.Confirmed },
  });
  expect(started.accepted).toBe(true);
  view.rerender(<OrganizerView {...props} state={store.getState()} />);
  expect(screen.queryByTestId('registration-row-r2')).toBeNull();
  expect(screen.getByText(/Ожидаем ответ сервера/).textContent).toContain('Борис');
  store.resolveRejection(started.operation!.opId, {
    code: 'VERSION_CONFLICT',
    message: 'Заявка уже изменена',
  });
  fireEvent.change(screen.getByLabelText('Поиск по имени'), { target: { value: 'Анна' } });
  view.rerender(<OrganizerView {...props} state={store.getState()} />);
  expect(screen.getByRole('alert').textContent).toContain('Заявка уже изменена');
});

it('clears filters when switching workshops and keeps them through same-workshop refresh', () => {
  const { props, view } = setup();
  fireEvent.change(screen.getByLabelText('Поиск по имени'), { target: { value: 'Анна' } });
  view.rerender(<OrganizerView {...props} />);
  expect((screen.getByLabelText('Поиск по имени') as HTMLInputElement).value).toBe('Анна');
  fireEvent.change(screen.getByLabelText('Воркшоп'), { target: { value: 'other' } });
  view.rerender(<OrganizerView {...props} selectedWorkshopId="other" />);
  expect((screen.getByLabelText('Поиск по имени') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Воркшоп'), { target: { value: 'w' } });
  view.rerender(<OrganizerView {...props} />);
  expect((screen.getByLabelText('Поиск по имени') as HTMLInputElement).value).toBe('');
});
