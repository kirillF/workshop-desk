import type { ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import { sendJson, sendProblem } from '../../apps/api/src/shared/http/response.ts';
import { ApiProblem } from '../../apps/api/src/shared/http/errors.ts';
function response() {
  const headers = new Map<string, string | number>();
  const reply = {
    writableEnded: false,
    destroyed: false,
    statusCode: 0,
    setHeader: (name: string, value: string | number) => headers.set(name, value),
    end: vi.fn(),
  };
  return { reply, headers, wire: reply as unknown as ServerResponse };
}
it('serializes UTF-8 JSON with correct byte length and no-store', () => {
  const { reply, headers, wire } = response();
  sendJson(wire, 200, { name: 'Анна' });
  const body = reply.end.mock.calls[0]![0] as string;
  expect(reply.statusCode).toBe(200);
  expect(headers.get('Content-Length')).toBe(Buffer.byteLength(body));
  expect(headers.get('Cache-Control')).toBe('no-store');
  expect(JSON.parse(body)).toEqual({ name: 'Анна' });
});
it('preserves actionable validation errors but never leaks internal failure details', () => {
  const a = response();
  sendProblem(a.wire, new ApiProblem('VALIDATION_ERROR', 'Invalid', { name: 'Required' }));
  expect(a.reply.statusCode).toBe(400);
  expect(JSON.parse(a.reply.end.mock.calls[0]![0] as string)).toMatchObject({
    code: 'VALIDATION_ERROR',
    fieldErrors: { name: 'Required' },
  });
  for (const failure of [
    Error('secret connection string'),
    null,
    'secret',
    { code: 'UNKNOWN', message: 'secret' },
  ]) {
    const b = response();
    sendProblem(b.wire, failure);
    expect(b.reply.statusCode).toBe(500);
    expect(b.reply.end.mock.calls[0]![0]).not.toContain('secret');
  }
});
it.each(['SQLITE_BUSY', 'SQLITE_LOCKED'])(
  'reports a database lock %s as recoverable unavailability',
  (code) => {
    const { reply, wire } = response();
    sendProblem(wire, { code });
    expect(reply.statusCode).toBe(503);
    expect(JSON.parse(reply.end.mock.calls[0]![0] as string).code).toBe('SERVICE_UNAVAILABLE');
  },
);
it.each(['destroyed', 'writableEnded'] as const)(
  'does not double-send after response is %s',
  (key) => {
    const { reply, wire } = response();
    reply[key] = true;
    sendJson(wire, 200, {});
    sendProblem(wire, Error('late failure'));
    expect(reply.end).not.toHaveBeenCalled();
  },
);
