# Authentication and organizer preview — specification amendment

Version: 0.4 amendment, 2026-09-15. Status: APPROVED FOR IMPLEMENTATION.
This amendment supersedes the demo identity selector in PROJECT_SPEC.md v0.3,
Section 3. All existing booking FR/INV rules remain normative. Production identity
infrastructure remains excluded; a genuine local password/session login is added.
User approval: the author accepted organizer-only read-only preview and explicitly
requested requirements, task breakdown and implementation by Luna MAX.

## Functional requirements

| ID | Requirement |
|---|---|
| AUTH-FR-01 | Unauthenticated users see a Russian login form with email/password, errors and submit progress. Seeded accounts suffice; no sign-up/reset/OAuth. |
| AUTH-FR-02 | Successful login establishes a server session; GET /auth/session restores it on reload. The server supplies user ID, display name and role. |
| AUTH-FR-03 | Header shows the signed-in user's name/role and logout, never a general identity selector. Participants see their catalog/details; organizers see catalog and registration management. |
| AUTH-FR-04 | POST /auth/logout revokes the session and clears the cookie. Expired/revoked/absent sessions cannot read private data or mutate registrations. Logout/401 clears active UI, drafts and preview; late callbacks cannot inject old data into another login. Already accepted server writes need not be rolled back by logout. |
| AUTH-FR-05 | An organizer-only Services menu contains “Просмотр от лица участника”. The participant list comes from an authenticated organizer endpoint. Participants cannot enumerate it. |
| AUTH-FR-06 | Selecting a participant opens their catalog/details/status in read-only preview. A persistent banner names the participant, states “Только просмотр”, and offers “Вернуться”. Actual organizer session/role never changes. |
| AUTH-FR-07 | Preview can show/open a registration form for inspection, but submission, confirmation and cancellation cannot execute. Mutation handlers and API both reject preview writes; hiding buttons alone is insufficient. |
| AUTH-FR-08 | Leaving preview restores organizer context and fetches current data. Switching preview target/workshop ignores old responses and clears drafts. Reload exits preview while restoring the actual signed-in user. |
| AUTH-FR-09 | Identity supplied via X-Demo-User-Id or userId query never overrides session identity, including when testMode is enabled. Tests authenticate real sessions; no auth bypass. |
| AUTH-FR-10 | Leaving participant preview refreshes organizer data and restores transient organizer-list controls to their defaults. The selected organizer workshop remains unchanged. |

## Nonfunctional requirements / invariants

| ID | Requirement |
|---|---|
| AUTH-NFR-01 | Passwords are stored as salted password hashes using Node crypto scrypt, never plaintext. Session tokens use cryptographic randomness; store only their digest with user/expiry in SQLite. Rotate on login, revoke on logout, expire after 24 hours. |
| AUTH-NFR-02 | Session cookie is HttpOnly, SameSite=Lax, Path=/, with bounded lifetime; Secure when configured for HTTPS. Credentials never go into URLs, browser storage or logs. Demo account passwords are explicitly documented as local fixtures. |
| AUTH-NFR-03 | Credentialed CORS allows only configured exact UI origin. Reject foreign Origin on auth/state-changing requests; accept no-Origin native clients. JSON mutation bodies and Content-Type are required. No wildcard credentialed CORS. Bound failed-login attempts (5 per minute per IP, with bounded/expiring storage); generic invalid-credentials error. |
| AUTH-NFR-04 | Actual authenticated actor and viewed participant remain distinct. Server checks organizer role and participant target for each preview request. Any mutation carrying preview context is rejected even when the actor is an organizer. |
| AUTH-NFR-05 | Existing capacity/version/ownership, independent optimistic rollback and unknown-outcome semantics remain intact. Tests use isolated SQLite; existing working registrations and workshop copy are preserved. |
| AUTH-NFR-06 | Preserve the current minimal light design, Russian UI and keyboard-accessible forms/menu/banner, at 390px and desktop widths. English project/agent documentation. No additional UI framework or external service required. |
| AUTH-NFR-07 | Local setup remains reproducible with existing scripts. Document fixture credentials, cookie-session sharing across same-profile tabs, use isolated browser profiles for different users, auth limitations and exact checks. |

## Fixed integration contract

- POST /auth/login JSON {email,password} -> 200 {user}, Set-Cookie; wrong credentials 401 UNAUTHENTICATED; throttled 429 RATE_LIMITED.
- GET /auth/session -> 200 {user}; absent/invalid session -> 401 UNAUTHENTICATED.
- POST /auth/logout JSON {} -> 200 {ok:true}, revoke session and expire cookie (idempotent for absent session).
- GET /admin/participants -> 200 {users: User[]}, participant role only, organizer authorization required.
- Existing workshop GETs accept optional X-Preview-User-Id. Only organizer + existing participant target may use it; organizer registration-list endpoint is not a participant preview endpoint.
- Every POST/PATCH with X-Preview-User-Id -> 403 FORBIDDEN without mutation. Normal writes always use authenticated actor.
- All existing business routes require session. /health remains public; test controls remain test-mode-only.
- API client uses credentials: include and optional previewUserId; never sends a trusted demo actor header.
- Seed logins: organizer@praktika.local, anna@praktika.local, boris@praktika.local, vera@praktika.local, gleb@praktika.local. Local fixture password for each: Praktika-demo-2026! . Existing IDs stay unchanged.
- createApiServer may accept allowedOrigin for tests; default is configured WEB_ORIGIN or http://127.0.0.1:5173. Tests use http://127.0.0.1:14701.

## Acceptance

| ID | Observable criterion |
|---|---|
| AUTH-AC-01 | Correct login opens appropriate role UI; invalid password shows generic error and keeps email, no session. |
| AUTH-AC-02 | Reload restores real user. Logout revokes old cookie; expired cookie is rejected. |
| AUTH-AC-03 | No cookie + forged demo headers/query fails; participant + forged organizer identity still cannot confirm or cancel another person's row. |
| AUTH-AC-04 | Participant cannot access participant directory or any preview, including direct HTTP requests. |
| AUTH-AC-05 | Organizer opens Services, chooses participant, sees matching registration data and read-only banner; actual session still reports organizer. |
| AUTH-AC-06 | Form/row preview controls cannot send writes. Direct preview POST/PATCH returns 403 and the complete registration state stays unchanged. |
| AUTH-AC-07 | Exit preview restores organizer and fresh data. Reload leaves preview. Old reads after switching target/exit cannot replace current context. |
| AUTH-AC-08 | Logout/login as another user during held read/mutation cannot leak old rows, draft, errors or success messages into the new session. |
| AUTH-AC-09 | Foreign-origin login/logout/write is rejected; valid origin with credentials works; cookies have required flags; DB stores hashes/digests, not secrets. |
| AUTH-AC-10 | Repeated bad login is bounded and recovers after the window; error never reveals whether an account exists. |
| AUTH-AC-11 | Existing AC-01–21 still pass using authenticated isolated sessions; two independent users use distinct browser contexts. |
| AUTH-AC-12 | Keyboard login/menu/preview/exit and narrow layout work; built startup, existing-data upgrade and documented setup are checked. |

## Execution contract

Parent owns this amendment, task records, integration and independent acceptance.
Luna MAX owns implementation in assigned files. Backend/frontend may run concurrently
against the fixed contract above; only the designated owner changes shared contracts.
No agents spawn further agents. No publication, commits, database reset or new product
features. Budget: four bounded tasks, no numeric time/cost cap supplied; at least 20%
reserved for checks and handoff. Risks: cookie/session races, preview confused with
impersonation, and legacy test auth bypass. Recover through narrow fixes and regression
checks; do not weaken invariants to get green tests. This is local auth, not a claim of
production security certification. Changes to read-only scope require author approval.
