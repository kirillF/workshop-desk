import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ParticipantForm } from '../../apps/web/src/features/registrations/ui/ParticipantForm.tsx';
const props = () => ({
  draft: { name: 'Анна', comment: 'Черновик' },
  errors: {},
  formSubmitting: false,
  formReady: true,
  busy: false,
  capacityConflict: false,
  formMode: 'seat' as const,
  availableSeats: 1,
  onDraftChange: vi.fn(),
  onClose: vi.fn(),
  onSubmit: vi.fn(),
});

it('requires explicit waiting-list intent after seats run out, retaining the draft', () => {
  const p = props();
  const view = render(<ParticipantForm {...p} />);
  view.rerender(<ParticipantForm {...p} availableSeats={0} capacityConflict />);
  expect((screen.getByLabelText('Имя участника') as HTMLInputElement).value).toBe('Анна');
  expect((screen.getByLabelText('Комментарий') as HTMLTextAreaElement).value).toBe('Черновик');
  expect(p.onSubmit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Встать в лист ожидания' }));
  expect(p.onSubmit).toHaveBeenCalledExactlyOnceWith('waitlist');
});

it.each(['busy', 'formSubmitting', 'notReady'])(
  'prevents duplicate submission while %s',
  (state) => {
    const p = props();
    render(
      <ParticipantForm
        {...p}
        busy={state === 'busy'}
        formSubmitting={state === 'formSubmitting'}
        formReady={state !== 'notReady'}
      />,
    );
    const button = screen.getByRole('button', {
      name: /Забронировать место|Отправляем/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(p.onSubmit).not.toHaveBeenCalled();
  },
);

it('announces field errors and reports edits without owning the persisted draft', () => {
  const p = props();
  render(
    <ParticipantForm
      {...p}
      errors={{
        name: 'Имя обязательно',
        comment: 'Слишком длинный комментарий',
        form: 'Сервис недоступен',
      }}
    />,
  );
  expect(screen.getAllByRole('alert')).toHaveLength(3);
  const name = screen.getByLabelText('Имя участника');
  expect(name.getAttribute('aria-invalid')).toBe('true');
  fireEvent.change(name, { target: { value: 'Борис' } });
  expect(p.onDraftChange).toHaveBeenCalledWith('name', 'Борис');
  fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: 'Новый' } });
  expect(p.onDraftChange).toHaveBeenCalledWith('comment', 'Новый');
});

it('does not silently turn a waitlist submission into booking when seats reopen', () => {
  const p = props();
  render(<ParticipantForm {...p} formMode="waitlist" availableSeats={2} />);
  fireEvent.click(screen.getByRole('button', { name: 'Встать в лист ожидания' }));
  expect(p.onSubmit).toHaveBeenCalledExactlyOnceWith('waitlist');
});

it('editing at full capacity only offers saving the existing registration', () => {
  const p = props();
  render(<ParticipantForm {...p} editing availableSeats={0} />);
  expect(screen.queryByRole('button', { name: 'Встать в лист ожидания' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect(p.onSubmit).toHaveBeenCalledOnce();
});
