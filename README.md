# Практика / Workshop Desk

Public UI name: **Практика**. Technical project: Workshop Desk. See
[interface direction](docs/DESIGN.md) for the latest redesign and verification scope.

A locally runnable workshop booking application: catalog, participant forms,
waiting list, cancellations, and organizer actions. React/Vite frontend, Node API,
and persistent SQLite in one npm workspace. Documentation is English; UI is Russian.

## Start

Verified with Node 26.5.0 and npm 11.17.0. No secrets or environment file required.
Run from the project root:

```sh
npm ci
npm run db:setup
npm run db:seed
npm run dev
```

Open http://127.0.0.1:5173. API: http://127.0.0.1:4000 (`GET /health`).
Ctrl+C stops both services. Sign in with a seeded local account:

| Role | Email | Local demo password |
|---|---|---|
| Organizer | `organizer@praktika.local` | `Praktika-demo-2026!` |
| Participant Anna | `anna@praktika.local` | `Praktika-demo-2026!` |

Other participant accounts are `boris@praktika.local`, `vera@praktika.local`, and
`gleb@praktika.local`, with the same local fixture password. These are deliberately
public demo credentials. The seed includes spare-seat, last-seat, and full workshops.

The organizer can open **Сервисы** to preview a participant's view. Preview is
read-only; **Вернуться** exits it. Normal participant actions require signing in
as that participant. Browser tabs in one profile share a cookie session; use separate
browser profiles/contexts to demonstrate different users simultaneously.

Data lives in `data/workshop.sqlite`. Setup/seed upgrade existing schemas; seed is
idempotent and preserves workshops, registrations and existing credentials.
`npm run demo:reset` explicitly replaces demo data; stop servers before resetting
and reload browser tabs afterward. Tests use temporary databases, never this file.

## Verify and run the build

```sh
npm run check
npm run lint
npm run format:check
npm test
npm run test:coverage
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

`npm test` runs Vitest unit tests, React Testing Library component/hook tests,
and real HTTP/SQLite integration tests. ESLint enforces React hook rules and
shared/feature import boundaries; Prettier provides consistent formatting.
`npm run test:coverage` generates separate unit/component and API reports with
focused coverage gates; see [testing strategy](docs/TESTING.md) for denominators
and limits. Browser tests run separately,
with isolated data and ports 14700/14701. The browser installation needs network
access once. After installation the application and tests need no external APIs.
Browser failures retain traces and screenshots in ignored `test-results/`.

`npm start` serves compiled API and frontend through a local Vite preview runner.
Build first. It uses the same default addresses as development; do not run both
at once. This is a local demo, not a production deployment recipe.

Export optional settings described in `.env.example`; Node does not automatically
load `.env`. `WORKSHOP_DB_PATH` can point to an isolated absolute path. `API_PORT`
and `WEB_PORT` set server ports. Set `WEB_ORIGIN` to the exact frontend origin when
changing the default address. Set `VITE_API_URL` at build time for a different
browser API address. The lockfile pins the verified dependencies.

## Navigation

- [Product specification](docs/PROJECT_SPEC.md): FR, INV, AC and source-of-truth policy.
- [Authentication and preview amendment](docs/AUTH_SPEC.md): sessions, roles and read-only preview.
- [Agent instructions](AGENTS.md): scope, navigation and evidence expectations.
- [Refactor review](docs/REFACTOR_REVIEW.md): resolved findings and verification evidence.
- [Testing strategy](docs/TESTING.md): layers, commands and coverage scope.
- [Architecture](docs/architecture.md): transaction and client operation boundaries.
- [Acceptance evidence](docs/acceptance.md): each AC mapped to observable checks.
- [Test controls](docs/test-controls.md): deterministic delay, rejection and response loss.
- [Task handoffs](tasks/README.md): WD-01–12 and integration results.

Authentication uses server-side cookie sessions and salted password hashes. The API
is intended for loopback use with seeded local credentials. There is no operation receipt ledger: an unknown outcome
stays unknown through a GET until explicit continuation. This implementation and
its tests do not establish the effectiveness of any AI review tool.
