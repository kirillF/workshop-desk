import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { LoginRequest } from '@workshop-desk/contracts';
import { SessionController, type SessionApi } from './session-controller.ts';

export type { SessionApi } from './session-controller.ts';

export function useSession(api: SessionApi) {
  const controller = useMemo(() => new SessionController(api), [api]);
  const subscribe = useMemo(() => controller.subscribe.bind(controller), [controller]);
  const state = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    void controller.restore();
  }, [controller]);

  const login = useCallback((input: LoginRequest) => controller.login(input), [controller]);
  const retryRestore = useCallback(() => controller.retryRestore(), [controller]);
  const requestLogout = useCallback(() => controller.requestLogout(), [controller]);
  const retryLogout = useCallback(() => controller.retryLogout(), [controller]);
  const expireSession = useCallback(
    (expectedGeneration?: number) => controller.expireSession(expectedGeneration),
    [controller],
  );

  return {
    ...state,
    controller,
    login,
    retryRestore,
    requestLogout,
    retryLogout,
    expireSession,
  };
}
