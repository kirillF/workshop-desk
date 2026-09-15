import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewView } from '../../apps/web/src/features/participant-preview/ui/PreviewView.tsx';
import type { PreviewViewProps } from '../../apps/web/src/features/participant-preview/ui/PreviewView.tsx';
const target = { id: 'p', displayName: 'Анна', role: 'participant' as const };
const workshop = {
  id: 'w',
  title: 'API',
  description: '',
  startsAt: '2026-09-16T10:00:00Z',
  location: 'A',
  capacity: 2,
  confirmedCount: 0,
  waitlistedCount: 0,
  availableSeats: 2,
};
const props = (): PreviewViewProps => ({
  target,
  catalog: { status: 'ready', workshops: [{ ...workshop, myRegistration: null }] },
  details: { workshop, myRegistration: null },
  selectedWorkshopId: 'w',
  formOpen: false,
  onWorkshopChange: vi.fn(),
  onRefresh: vi.fn(),
  onOpenForm: vi.fn(),
  onCloseForm: vi.fn(),
  onBack: vi.fn(),
});
it('renders a form for inspection without editable fields or submit capability', () => {
  const p = props();
  const view = render(<PreviewView {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Открыть форму регистрации' }));
  expect(p.onOpenForm).toHaveBeenCalledOnce();
  view.rerender(<PreviewView {...p} formOpen />);
  expect((screen.getByLabelText('Имя участника') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('Комментарий') as HTMLTextAreaElement).disabled).toBe(true);
  expect(
    (
      screen.getByRole('button', {
        name: 'Отправка недоступна в режиме просмотра',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(p.onCloseForm).toHaveBeenCalledOnce();
});
it('shows participant state and only offers a new form for a cancelled registration', () => {
  const p = props();
  const registration = {
    id: 'r',
    workshopId: 'w',
    participantId: 'p',
    attendeeName: 'Анна',
    comment: 'Комментарий участника',
    status: 'confirmed' as const,
    version: 1,
  };
  const view = render(<PreviewView {...p} details={{ workshop, myRegistration: registration }} />);
  expect(screen.getByText('Комментарий участника')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Открыть форму регистрации' })).toBeNull();
  view.rerender(
    <PreviewView
      {...p}
      details={{ workshop, myRegistration: { ...registration, status: 'cancelled' } }}
    />,
  );
  expect(screen.getByRole('button', { name: 'Открыть форму регистрации' })).toBeTruthy();
});
it('exposes catalog retry and workshop selection as read-only navigation', () => {
  const p = props();
  const view = render(<PreviewView {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
  expect(p.onWorkshopChange).toHaveBeenCalledWith('w');
  fireEvent.change(screen.getByLabelText('Воркшоп'), { target: { value: 'w' } });
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться' }));
  expect(p.onBack).toHaveBeenCalledOnce();
  view.rerender(
    <PreviewView
      {...p}
      details={null}
      catalog={{ status: 'error', workshops: [], error: 'Не удалось загрузить' }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(p.onRefresh).toHaveBeenCalledOnce();
});
