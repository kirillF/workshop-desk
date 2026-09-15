import { useCallback, useState } from 'react';
import type { ParticipantsResponse, User } from '@workshop-desk/contracts';
import type { ApiRequestOptions } from '../../../shared/api/index.ts';
import { isUnauthenticatedError, toOperationError } from '../../../shared/lib/errors.ts';
import { displayNameForParticipant } from '../../../shared/lib/format.ts';

export interface ParticipantDirectoryApi {
  getParticipants(options?: ApiRequestOptions): Promise<ParticipantsResponse>;
}

export type ParticipantDirectoryState = {
  users: User[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
};

export function useParticipantDirectory(
  api: ParticipantDirectoryApi,
  onSessionExpired: () => void,
) {
  const [state, setState] = useState<ParticipantDirectoryState>({
    users: [],
    status: 'idle',
  });

  const load = useCallback(() => {
    if (state.status === 'loading') {
      return;
    }
    setState((current) => ({ ...current, status: 'loading', error: undefined }));
    void api
      .getParticipants()
      .then((response) => {
        setState({ users: response.users, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (isUnauthenticatedError(error)) {
          onSessionExpired();
          return;
        }
        setState({
          users: [],
          status: 'error',
          error: toOperationError(error, 'Не удалось загрузить список участников.').message,
        });
      });
  }, [api, onSessionExpired, state.status]);

  const participantName = useCallback(
    (id: string) =>
      state.users.find((user) => user.id === id)?.displayName ?? displayNameForParticipant(id),
    [state.users],
  );

  return { ...state, load, participantName };
}
