import type { FormEvent } from 'react';

export type LoginScreenProps = {
  email: string;
  password: string;
  error?: string;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

export function LoginScreen({
  email,
  password,
  error,
  submitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginScreenProps) {
  return (
    <main className="app-shell auth-shell">
      <section className="panel auth-panel" aria-labelledby="login-title">
        <div className="eyebrow">Практика</div>
        <h1 id="login-title">Войти в Практику</h1>
        <p className="lead">Войдите, чтобы открыть каталог воркшопов.</p>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        <form
          className="form-grid"
          noValidate
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="control"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              autoComplete="username"
              disabled={submitting}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Пароль</label>
            <input
              id="login-password"
              className="control"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              autoComplete="current-password"
              disabled={submitting}
              required
            />
          </div>
          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
}
