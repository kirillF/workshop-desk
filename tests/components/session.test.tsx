import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import { useSession } from '../../apps/web/src/features/auth/model/use-session.ts';
import { LoginScreen } from '../../apps/web/src/features/auth/ui/LoginScreen.tsx';
import {
  LogoutErrorScreen,
  LogoutPendingScreen,
  SessionLoadingScreen,
  SessionRestoreErrorScreen,
} from '../../apps/web/src/features/auth/ui/SessionScreens.tsx';
import type { SessionApi } from '../../apps/web/src/features/auth/model/session-controller.ts';
const user = { id: 'a', displayName: 'Анна', role: 'participant' as const };
const api = (): SessionApi => ({
  getSession: vi.fn().mockResolvedValue({ user }),
  login: vi.fn().mockResolvedValue({ user }),
  logout: vi.fn().mockResolvedValue({ ok: true }),
});

it('subscribes to the session under React StrictMode without duplicate restore calls', async () => {
  const client = api();
  const { result } = renderHook(() => useSession(client), { wrapper: StrictMode });
  await waitFor(() => expect(result.current.phase).toBe('authenticated'));
  expect(client.getSession).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.requestLogout();
  });
  expect(result.current.phase).toBe('unauthenticated');
  await act(async () => {
    await result.current.login({ email: 'a', password: 'b' });
  });
  expect(result.current.user?.id).toBe('a');
  act(() => {
    result.current.expireSession(result.current.generation);
  });
  expect(result.current.user).toBeNull();
});

it('routes restore and logout retry actions through the hook', async () => {
  const client = api();
  vi.mocked(client.getSession).mockRejectedValueOnce(Error('offline'));
  const { result } = renderHook(() => useSession(client));
  await waitFor(() => expect(result.current.phase).toBe('restore-error'));
  await act(async () => {
    await result.current.retryRestore();
  });
  expect(result.current.phase).toBe('authenticated');
  vi.mocked(client.logout).mockRejectedValueOnce(Error('offline'));
  await act(async () => {
    await result.current.requestLogout()?.catch(() => undefined);
  });
  expect(result.current.phase).toBe('logout-error');
  await act(async () => {
    await result.current.retryLogout();
  });
  expect(result.current.phase).toBe('unauthenticated');
});

it('announces distinct pending/failure screens and exposes explicit retries', () => {
  const retry = vi.fn();
  const view = render(<SessionLoadingScreen />);
  expect(screen.getByRole('status').textContent).toContain('Проверяем');
  view.rerender(<SessionRestoreErrorScreen onRetry={retry} />);
  expect(screen.getByRole('alert').textContent).toContain('Не удалось проверить');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  view.rerender(<LogoutPendingScreen />);
  expect(screen.getByRole('status').textContent).toContain('Завершаем выход');
  view.rerender(<LogoutErrorScreen onRetry={retry} />);
  expect(screen.getByRole('alert').textContent).toContain('Выход не подтверждён');
  expect(screen.queryByRole('heading', { name: 'Войти в Практику' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить выход' }));
  expect(retry).toHaveBeenCalledTimes(2);
});

it('keeps login accessible and prevents repeated submission while pending', () => {
  const props = {
    email: 'a',
    password: 'b',
    error: 'Неверный email или пароль.',
    submitting: false,
    onEmailChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onSubmit: vi.fn(),
  };
  const view = render(<LoginScreen {...props} />);
  expect(screen.getByRole('alert').textContent).toContain('Неверный');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@local' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secret' } });
  expect(props.onEmailChange).toHaveBeenCalledWith('new@local');
  expect(props.onPasswordChange).toHaveBeenCalledWith('secret');
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
  expect(props.onSubmit).toHaveBeenCalledTimes(1);
  view.rerender(<LoginScreen {...props} submitting />);
  expect((screen.getByRole('button', { name: 'Входим…' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect((screen.getByLabelText('Пароль') as HTMLInputElement).disabled).toBe(true);
});
