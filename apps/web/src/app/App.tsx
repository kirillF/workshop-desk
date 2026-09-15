import { useCallback, useMemo, useState } from 'react';
import type { LoginRequest } from '@workshop-desk/contracts';
import { createApiClient, type WorkshopApi } from '../shared/api/index.ts';
import { useSession, type SessionApi } from '../features/auth/model/use-session.ts';
import { SessionController } from '../features/auth/model/session-controller.ts';
import { LoginScreen } from '../features/auth/ui/LoginScreen.tsx';
import {
  LogoutErrorScreen,
  LogoutPendingScreen,
  SessionLoadingScreen,
  SessionRestoreErrorScreen,
} from '../features/auth/ui/SessionScreens.tsx';
import { AuthenticatedApp, type AuthenticatedApi } from './AuthenticatedApp.tsx';

export type AppProps = {
  api?: SessionApi & AuthenticatedApi;
};

export function App({ api: providedApi }: AppProps = {}) {
  const api = useMemo<SessionApi & AuthenticatedApi>(
    () => providedApi ?? (createApiClient() as WorkshopApi & AuthenticatedApi),
    [providedApi],
  );
  const session = useSession(api);
  const {
    phase,
    user,
    error,
    generation,
    login,
    retryRestore,
    requestLogout,
    retryLogout: retryLogoutRequest,
    expireSession,
  } = session;
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const submitLogin = useCallback(() => {
    const input: LoginRequest = {
      email: loginEmail,
      password: loginPassword,
    };
    void login(input)
      .then(() => setLoginPassword(''))
      .catch(() => undefined);
  }, [login, loginEmail, loginPassword]);

  const explicitLogout = useCallback(() => {
    void requestLogout()?.catch(() => undefined);
  }, [requestLogout]);

  const retryLogout = useCallback(() => {
    void retryLogoutRequest()?.catch(() => undefined);
  }, [retryLogoutRequest]);

  const expireCurrentSession = useCallback(() => {
    expireSession(generation);
  }, [expireSession, generation]);

  if (phase === 'restoring') {
    return <SessionLoadingScreen />;
  }

  if (phase === 'restore-error') {
    return <SessionRestoreErrorScreen message={error} onRetry={retryRestore} />;
  }

  if (phase === 'logging-out') {
    return <LogoutPendingScreen />;
  }

  if (phase === 'logout-error') {
    return <LogoutErrorScreen message={error} onRetry={retryLogout} />;
  }

  if (phase === 'authenticated' && user) {
    return (
      <AuthenticatedApp
        identity={user}
        api={api}
        onSessionExpired={expireCurrentSession}
        onLogout={explicitLogout}
      />
    );
  }

  return (
    <LoginScreen
      email={loginEmail}
      password={loginPassword}
      error={error}
      submitting={phase === 'logging-in'}
      onEmailChange={(value) => setLoginEmail(value)}
      onPasswordChange={(value) => setLoginPassword(value)}
      onSubmit={submitLogin}
    />
  );
}

export { SessionController };
export type { SessionApi };
export default App;
