import { expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useParticipantPreview,
  type PreviewApi,
} from '../../apps/web/src/features/participant-preview/model/use-participant-preview.ts';
import type { CatalogWorkshop, WorkshopResponse } from '@workshop-desk/contracts';
const anna = { id: 'a', displayName: 'Анна', role: 'participant' as const };
const boris = { ...anna, id: 'b', displayName: 'Борис' };
const workshop: CatalogWorkshop = {
  id: 'w',
  title: 'API',
  description: '',
  startsAt: '',
  location: 'A',
  capacity: 2,
  confirmedCount: 0,
  waitlistedCount: 0,
  availableSeats: 2,
  myRegistration: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const api = {
    getWorkshops: vi.fn<PreviewApi['getWorkshops']>().mockResolvedValue({ workshops: [workshop] }),
    getWorkshop: vi
      .fn<PreviewApi['getWorkshop']>()
      .mockResolvedValue({ workshop, myRegistration: null }),
  };
  const expired = vi.fn();
  return { api, expired, ...renderHook(() => useParticipantPreview(api, expired)) };
}
it('ignores old target catalog and clears form/details on exit', async () => {
  const { api, result } = setup();
  const old = deferred<{ workshops: CatalogWorkshop[] }>();
  api.getWorkshops.mockReturnValueOnce(old.promise);
  act(() => result.current.openPreview(anna));
  act(() => result.current.openPreview(boris));
  await waitFor(() => expect(result.current.previewDetails?.workshop.id).toBe('w'));
  await act(async () => old.resolve({ workshops: [{ ...workshop, id: 'old' }] }));
  expect(result.current.previewUser?.id).toBe('b');
  expect(result.current.previewWorkshopId).toBe('w');
  act(() => result.current.openPreviewForm());
  expect(result.current.previewFormOpen).toBe(true);
  act(() => result.current.closePreviewForm());
  expect(result.current.previewFormOpen).toBe(false);
  act(() => result.current.openPreviewForm());
  act(() => result.current.leavePreview());
  expect(result.current.previewFormOpen).toBe(false);
  expect(result.current.previewUser).toBeNull();
  expect(result.current.previewDetails).toBeNull();
  act(() => result.current.refreshPreviewCatalog());
  expect(api.getWorkshops).toHaveBeenCalledTimes(2);
});
it('does not let held detail replace another workshop or a context after exit', async () => {
  const { api, result } = setup();
  const old = deferred<WorkshopResponse>();
  api.getWorkshop.mockReturnValueOnce(old.promise);
  act(() => result.current.openPreview(anna));
  await waitFor(() => expect(api.getWorkshop).toHaveBeenCalledOnce());
  act(() => result.current.selectPreviewWorkshop('next'));
  await waitFor(() => expect(api.getWorkshop).toHaveBeenCalledTimes(2));
  act(() => result.current.leavePreview());
  await act(async () => old.resolve({ workshop, myRegistration: null }));
  expect(result.current.previewDetails).toBeNull();
});
it('treats catalogue errors as retryable and current 401 as expired session', async () => {
  const { api, result, expired } = setup();
  api.getWorkshops.mockRejectedValueOnce(Error('offline'));
  act(() => result.current.openPreview(anna));
  await waitFor(() => expect(result.current.previewCatalog.status).toBe('error'));
  act(() => result.current.refreshPreviewCatalog());
  await waitFor(() => expect(result.current.previewCatalog.status).toBe('ready'));
  api.getWorkshop.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });
  act(() => result.current.selectPreviewWorkshop('other'));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  api.getWorkshops.mockRejectedValueOnce({ code: 'UNAUTHENTICATED' });
  act(() => result.current.refreshPreviewCatalog());
  await waitFor(() => expect(expired).toHaveBeenCalledTimes(2));
});
it('ignores failures from an unmounted preview instead of expiring a new view', async () => {
  const { api, result, expired, unmount } = setup();
  const old = deferred<{ workshops: CatalogWorkshop[] }>();
  api.getWorkshops.mockReturnValueOnce(old.promise);
  act(() => result.current.openPreview(anna));
  unmount();
  await act(async () => old.reject({ code: 'UNAUTHENTICATED' }));
  expect(expired).not.toHaveBeenCalled();
});
it('handles an empty catalogue and failed detail without retaining a prior participant view', async () => {
  const { api, result } = setup();
  api.getWorkshops.mockResolvedValueOnce({ workshops: [] });
  act(() => result.current.openPreview(anna));
  await waitFor(() => expect(result.current.previewCatalog.status).toBe('ready'));
  expect(result.current.previewWorkshopId).toBe('');
  expect(api.getWorkshop).not.toHaveBeenCalled();
  act(() => result.current.selectPreviewWorkshop(''));
  api.getWorkshop.mockRejectedValueOnce(Error('offline'));
  act(() => result.current.refreshPreviewCatalog());
  await waitFor(() => expect(api.getWorkshop).toHaveBeenCalledOnce());
  expect(result.current.previewDetails).toBeNull();
  const held = deferred<WorkshopResponse>();
  api.getWorkshop.mockReturnValueOnce(held.promise);
  act(() => result.current.selectPreviewWorkshop('held'));
  await waitFor(() => expect(api.getWorkshop).toHaveBeenCalledTimes(2));
  act(() => result.current.leavePreview());
  await act(async () => held.reject({ code: 'UNAUTHENTICATED' }));
  expect(result.current.previewDetails).toBeNull();
});
