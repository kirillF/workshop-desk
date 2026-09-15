import type { ServerResponse } from 'node:http';

import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from './service.ts';

export function setSessionCookie(response: ServerResponse, token: string, secure: boolean): void {
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  );
}

export function clearSessionCookie(response: ServerResponse, secure: boolean): void {
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  );
}
