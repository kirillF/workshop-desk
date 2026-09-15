# Deterministic test controls

Normal mode returns 404 for `/__test/*`. Enable only for isolated test data with
`WORKSHOP_TEST_MODE=1`, or `createApiServer({ databasePath, testMode: true })`.
The controls use the same API/database mutation paths as the application.

Create a rule with `POST /__test/rules`:

```json
{
  "method": "PATCH",
  "path": "/registrations/registration-spare-waitlisted",
  "identity": "organizer-1",
  "phase": "before",
  "action": "hold",
  "count": 1
}
```

`identity` and `count` are optional. The response supplies `ruleId`.

- `before` + `hold`: pause before entering the transaction.
- `before` + `reject`: return a definitive 503 without writing.
- `after` + `hold`: commit/capture the read snapshot, then hold its response.
- `after` + `drop`: flush headers and an incomplete body, then close the connection.
  This prevents Chromium from transparently retrying a request on a stale socket
  before it has received any response bytes. The client sees an unknown outcome.

`GET /__test/queue` returns readiness and held requests with `queueId`, `ruleId`,
phase and metadata. Wait for this observable event before releasing a request:

```json
{ "queueId": "returned-queue-id", "outcome": "continue" }
```

Send that object to `POST /__test/release`. For a before-phase hold, `outcome` may
be `reject`; after-phase rejection is prohibited because the write already happened.
`GET /__test/log` provides ordered arrival, hold, release, commit, rejection and
response events. `X-Operation-Id` correlates UI actions; this is tracing, not an
idempotency key. `GET /__test/rules` shows remaining rule counts.

See `tests/e2e/fixtures.mjs` for the temporary database/server fixture and
`tests/e2e/acceptance.spec.mjs` for executable sequences. The browser timeout is
1500 ms in tests via `VITE_OPERATION_TIMEOUT_MS`; the application default is 10000 ms.
Initial load failure uses a browser network fault; mutation ordering uses server controls.
No test resets the working demo database.
