import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CatalogView } from '../../apps/web/src/features/workshops/ui/CatalogView.tsx';
import type { CatalogWorkshop } from '@workshop-desk/contracts';
const identity = { id: 'p1', displayName: 'Анна', role: 'participant' as const };
const workshop: CatalogWorkshop = {
  id: 'w',
  title: 'API',
  description: 'Контракты',
  startsAt: '2026-09-16T10:00:00Z',
  location: 'A',
  capacity: 2,
  confirmedCount: 2,
  waitlistedCount: 0,
  availableSeats: 0,
  myRegistration: null,
};

describe('catalog user states', () => {
  it('offers retry after failure and distinguishes loading from an empty catalog', () => {
    const retry = vi.fn();
    const view = render(
      <CatalogView
        identity={identity}
        catalog={{ status: 'loading', workshops: [] }}
        onOpen={vi.fn()}
        onRefresh={retry}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Загружаем');
    view.rerender(
      <CatalogView
        identity={identity}
        catalog={{ status: 'error', workshops: [] }}
        onOpen={vi.fn()}
        onRefresh={retry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(retry).toHaveBeenCalledTimes(1);
    view.rerender(
      <CatalogView
        identity={identity}
        catalog={{ status: 'ready', workshops: [] }}
        onOpen={vi.fn()}
        onRefresh={retry}
      />,
    );
    expect(screen.getByText('В каталоге пока нет доступных воркшопов.')).toBeTruthy();
  });
  it('renders actual registration and capacity without treating a full workshop as available', () => {
    const open = vi.fn();
    render(
      <CatalogView
        identity={identity}
        catalog={{
          status: 'ready',
          workshops: [
            workshop,
            {
              ...workshop,
              id: 'free',
              availableSeats: 1,
              myRegistration: {
                id: 'r',
                workshopId: 'free',
                participantId: 'p1',
                attendeeName: 'Анна',
                comment: '',
                status: 'confirmed',
                version: 1,
              },
            },
          ],
        }}
        onOpen={open}
        onRefresh={vi.fn()}
      />,
    );
    const full = within(screen.getByTestId('workshop-card-w'));
    expect(full.getByText('Мест нет · доступен лист ожидания')).toBeTruthy();
    expect(full.getByText('Вы ещё не записаны')).toBeTruthy();
    fireEvent.click(full.getByRole('button', { name: 'Подробнее' }));
    expect(open).toHaveBeenCalledWith('w');
    expect(within(screen.getByTestId('workshop-card-free')).getByText('Подтверждена')).toBeTruthy();
  });
});
