Date created: 2026-08-26
Date last modified: 2026-08-26 (Phase 5 complete — identity shipped)

# Register, Login, and Logout - Technical PRD

## Overview/Problem

QuizMaker is a greenfield application for teachers to collaborate on a shared test bank of multiple-choice questions. Before any of that collaboration can exist, more than one teacher must be able to create an account and come back to it. This sprint added that identity layer: a D1 `users` table, register/login/logout HTTP APIs, and shadcn forms that SHA-256 hash the typed password in the browser before POST. **Phases 0–5 are COMPLETE.** Do not rebuild this feature. Later sprints can attach MCQ authoring to a known teacher, but they must add real server auth first — `sessionStorage` is a display hint only.

---

## Hypothesis

We believe that a simple register / login / logout flow, backed by a hashed-password user table, will let multiple teachers create distinct accounts and reach the MCQ workspace stub without introducing tokens, cookies, or session infrastructure yet.

---

## Scope

### In Scope

- A Cloudflare D1 `users` table and a Wrangler migration that creates it
- A server-side user service with create, read, update, and delete
- HTTP POST endpoints for register, login, and logout
- Client-side password hashing before the password is sent on the wire
- Server-side salted hashing so the database never stores plaintext (or a raw client digest)
- Register and login pages that POST JSON to those endpoints
- After a successful register or login, redirect to an MCQ workspace stub at `/mcqs`
- A logout control on the stub that calls the logout endpoint and returns the teacher to login
- Unique username and unique email; a single user may set username and email to the same value
- Test-driven implementation with **Vitest**: each phase starts with failing tests and is not complete until those tests (and all earlier phases' tests) are green

### Out of Scope

- Multiple-choice question authoring, storage, or collaboration
- Social login (Google, Microsoft, etc.)
- JWT or other token-based auth
- Cookies, server sessions, CSRF tokens, or any session store
- Password reset, email verification, or account lockout
- Role-based access control (admin vs teacher)
- User profile editing UI, even though the service will expose update/delete
- HTTPS termination details (Cloudflare handles TLS in production; this phase does not add extra transport security)

### Cut

- **Server Actions for register/login** — The App Router convention prefers Server Actions for forms, but this feature is explicitly an HTTP POST contract so the client can hash the password and send JSON. Route handlers in `src/app/api/` are the intended surface.
- **Real session management** — A cookie or server session would be the usual next step after login. It is deferred so this sprint stays a thin identity layer. Any client-only display hint (for example `sessionStorage` of the public user) is not authentication and must not be treated as a grant of access.
- **Dedicated REST endpoints for update/delete user** — The user service will implement those methods for later sprints. This phase only exposes register, login, and logout over HTTP.
- **Google / social buttons on the shadcn login and signup blocks** — The stock blocks include them. Social login is out of scope, so they are omitted.
- **Forgot password link on the login block** — Password reset is out of scope.
- **`@cloudflare/vitest-pool-workers`** — Real Workers-runtime tests change how the whole suite runs. Unit tests mock D1 and `getCloudflareContext()`. Do not add this pool unless we explicitly decide to.

---

## Test-Driven Development

This feature is built **red → green → next phase**. Vitest (`vi`) is the unit-testing framework. Tests are the phase gate; acceptance criteria are the product gate. Both must pass before a phase is marked COMPLETED.

### Cycle (every implementation phase)

1. **Red.** Write the tests listed for that phase. Run `npm test`. They must fail (missing module, failing assertion, or unimplemented behavior). A test that cannot fail is not a test — do not add hollow `expect(true).toBe(true)` checks.
2. **Green.** Implement the minimum production code to make that phase's tests pass. Do not start the next phase's features while the current suite is red.
3. **Stay green.** Re-run `npm test`. Current-phase tests and **all earlier phases' tests** must pass. Then check the phase's acceptance criteria.
4. Mark the phase COMPLETED only when the suite is green **and** the phase objective is met.

### Conventions

- Follow `.cursor/skills/testing/SKILL.md`
- Colocate tests: `src/lib/services/user-service.ts` is tested by `src/lib/services/user-service.test.ts`
- Assert observable output and side effects, including failure paths
- Mock at the module boundary with `vi.mock`. Never hit a real D1 database, a real network, or a real Cloudflare binding in unit tests
- Mock `getCloudflareContext()` and pass a fake `env.DB`. Keep D1 behind `src/lib/services/` so handlers are tested by mocking the service, not reconstructing the prepared-statement chain
- Reset mocks in `beforeEach` with `vi.clearAllMocks()`
- Each test must pass in isolation
- Name tests so the failure message explains what broke
- Server Components are not rendered by Testing Library. Test data logic as functions; render only client components (`register`, `login`, `mcqs`)

### Harness (installed in Phase 0)

Vitest is not in the starter. Phase 0 adds it. The user has approved these devDependencies for this feature:

- `vitest`
- `@vitejs/plugin-react`
- `@testing-library/react`
- `@testing-library/user-event`
- `jsdom`
- `vite-tsconfig-paths`

Scripts: `"test": "vitest run"` and `"test:watch": "vitest"`. Config lives in `vitest.config.ts` at the repo root with `environment: "jsdom"`, `globals: true`, and `vite-tsconfig-paths` so the `@/` alias resolves.

---

## Technical Requirements

### Database Schema

Cloudflare D1 (SQLite). The database **already exists**: binding `DB`, database name `quizmaker-db`, id `750d1dc9-93c7-4839-b76c-57cc8ca3c272` in `wrangler.jsonc`. Schema lives in `migrations/0001_create_users_table.sql` and is applied both locally and remotely. Never change the schema with ad-hoc SQL. For new migrations: apply locally with `--local`. Do not apply `--remote` unless the user explicitly asks.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Random 16-byte hex, lowercased |
| `first_name` | TEXT NOT NULL | Teacher given name |
| `last_name` | TEXT NOT NULL | Teacher family name |
| `username` | TEXT NOT NULL UNIQUE | Login identifier. May equal `email` for the same row |
| `email` | TEXT NOT NULL UNIQUE | Login identifier. Independent UNIQUE from `username` |
| `password_hash` | TEXT NOT NULL | Server-side salted hash. Never returned in API responses |
| `created_at` | DATETIME | Default `CURRENT_TIMESTAMP` |
| `updated_at` | DATETIME | Default `CURRENT_TIMESTAMP`; refresh on update |

Uniqueness is per-column. Two different users cannot share a username or an email. One user **may** register with `username === email`.

### Password hashing

Plaintext must not be stored and must not be posted.

1. **Browser (register and login):** hash the typed password with the Web Crypto API (`SHA-256`) and send the hex digest in the JSON `password` field.
2. **Server (register / password update):** treat the incoming digest as the secret. Hash it again with `bcryptjs` (salt rounds 10) and persist that value in `password_hash`.
3. **Server (login):** bcrypt-compare the incoming digest against `password_hash`. Use a generic `"Invalid credentials"` failure so callers cannot tell whether the username/email existed.
4. Never log the plaintext, the SHA-256 digest, or the bcrypt hash.

Client hashing keeps plaintext off the JSON body. Server bcrypt keeps a stolen `users` row from being replayed as the wire credential. This is still not a full auth system; it is the minimum bar for this phase.

`bcryptjs` is a pure-JS bcrypt that works under Workers `nodejs_compat`. It is already a dependency (`bcryptjs@^3`). Do not use Node `crypto` APIs that are unavailable on Workers.

### API Endpoints

All three endpoints are App Router route handlers. Validate every body with Zod before touching D1. Centralize D1 access in the user service; do not query `env.DB` from the handler beyond passing the binding in.

Reach the binding with `getCloudflareContext()` from `@opennextjs/cloudflare`, then `env.DB`. Use numbered placeholders (`?1`, `?2`). Prefer `all()` and `results[0]` over `first()`.

#### POST /api/auth/register

Creates a user, then the client redirects to `/mcqs`.

**Request Body:**
```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada",
  "email": "ada@school.edu",
  "password": "<sha-256 hex of the typed password>"
}
```

Username and email may be the same string, for example both `"ada@school.edu"`.

**Response:**
- Success (201): `{ "success": true, "user": { "id", "firstName", "lastName", "username", "email" } }` — never include `password_hash`
- Error (400): `{ "success": false, "error": "<validation message>" }`
- Error (409): `{ "success": false, "error": "A user with this username already exists" }` or the email equivalent
- Error (500): `{ "success": false, "error": "Internal server error" }`

#### POST /api/auth/login

Looks up by username **or** email, then verifies the hashed password.

**Request Body:**
```json
{
  "identifier": "ada",
  "password": "<sha-256 hex of the typed password>"
}
```

`identifier` is username or email. Lookup: `WHERE username = ?1 OR email = ?1`.

**Response:**
- Success (200): `{ "success": true, "user": { "id", "firstName", "lastName", "username", "email" } }`
- Error (400): validation failure
- Error (401): `{ "success": false, "error": "Invalid credentials" }` for both unknown identifier and bad password
- Error (500): `{ "success": false, "error": "Internal server error" }`

No `Set-Cookie`. No token in the body.

#### POST /api/auth/logout

No body. No server state to clear in this phase.

**Response:**
- Success (200): `{ "success": true, "message": "Logged out" }`

The client then clears any local display hint and navigates to `/login`.

### User Interface Requirements

Use **shadcn/ui login and signup blocks** as the visual starting point (centered `min-h-svh` shell, `Card`, `Field`/`FieldGroup`/`FieldLabel`/`FieldDescription`, `Input`, `Button`). Style with existing Tailwind/shadcn tokens only. Do not add a CSS module or extra styling library.

Forms are client components (`LoginForm`, `SignupForm`) because they need local state, Web Crypto hashing, and `fetch`. Route `page.tsx` files stay Server Components that only compose the layout + form. Keep `'use client'` off the root layout.

**Cut from the stock blocks (do not ship):**
- "Login with Google" / "Sign up with Google" — social login is out of scope
- "Forgot your password?" — password reset is out of scope
- Single "Full Name" field — QuizMaker stores first name and last name separately

**Adaptations required:**
- Login identifier is **username or email**, not email-only
- Register fields: first name, last name, username, email, password, confirm password
- Username and email may be the same value
- Surface API/client errors with `FieldError` (`errors={[{ message }]}`)
- Cross-links use Next.js `Link` to `/register` and `/login`, not `href="#"`

#### Home (/)

- Short explanation that QuizMaker is a collaborative MCQ test bank
- Primary action: Register
- Secondary action: Log in
- Same centered card layout as the auth blocks (`min-h-svh`, `p-6 md:p-10`)

#### Register (/register)

Page shell from the shadcn signup block:

```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    <SignupForm />
  </div>
</div>
```

`SignupForm` lives in `src/components/signup-form.tsx` (`'use client'`).

- Fields: first name, last name, username, email, password, confirm password
- Client validation:
  - All fields required
  - Email must look like an email
  - Username at least 3 characters; letters, numbers, underscore, hyphen **or** a valid email (so username may equal email)
  - Password at least 8 characters (typed password, before hashing)
  - Confirm password must match password **before** hashing
- On submit: hash password, POST `/api/auth/register`, on 201 store the public user as a client-only display hint and `router.push("/mcqs")`
- On 400/409: show the server `error` string via `FieldError`
- Primary button copy from the block: **Create Account**
- `FieldDescription` link: already have an account → `/login`

#### Login (/login)

Page shell from the shadcn login block:

```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    <LoginForm />
  </div>
</div>
```

`LoginForm` lives in `src/components/login-form.tsx` (`'use client'`).

- Fields: username or email (`identifier`), password
- On submit: hash password, POST `/api/auth/login`, on 200 store the public user hint and `router.push("/mcqs")`
- On 401: show "Invalid credentials" via `FieldError`
- Primary button copy from the block: **Login**
- `FieldDescription` link: don't have an account → `/register`

#### MCQ stub (/mcqs)

- Same centered card layout as the auth pages
- Placeholder copy that question authoring arrives in the next sprint
- If a public user hint is present, greet by name/username
- Logout button: POST `/api/auth/logout`, clear the hint, navigate to `/login`
- Do **not** build MCQ CRUD, lists, or forms

Client-only display hint: `sessionStorage` of the public user object is acceptable so a refresh of `/mcqs` can still greet the teacher. It is not a session. It is not checked by the API. Forging it does not grant server access because this phase has none.

---

## Implementation Phases

A phase is **COMPLETED** only when (1) `npm test` is green for that phase and every earlier phase, and (2) the phase objective and listed acceptance checks are met. Write the tests first. They will fail. That failure is the signal to start implementation.

### Phase 0: Vitest harness - COMPLETED

**Objective**: `npm test` is a working Vitest command so later phases can go red, then green.

This phase has no product tests. An empty suite (or "no test files") is acceptable here. Do not add a hollow smoke test.

**Tasks**:
1. Install the approved devDependencies listed under Test-Driven Development
2. Add `vitest.config.ts` per `.cursor/skills/testing/SKILL.md` (`jsdom`, `globals`, `vite-tsconfig-paths`)
3. Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`

**Deliverables**:
- `vitest.config.ts`
- `package.json` test scripts and Vitest-related devDependencies

**Phase complete when**: `npx vitest run` starts using this config (it may report no tests). Do not implement feature code in this phase.

### Phase 1: Database - COMPLETED

**Objective**: D1 is bound and the `users` table exists locally.

**Tests first (must fail before the migration exists or matches the schema):**

File: `migrations/0001_create_users_table.test.ts`

These tests read the migration SQL. They do **not** talk to a live D1 database.

- `users migration creates a users table`
- `users table defines id as TEXT PRIMARY KEY`
- `users table requires first_name, last_name, username, email, and password_hash`
- `username and email are each UNIQUE`
- `password is stored as password_hash, not password`
- `created_at and updated_at default to CURRENT_TIMESTAMP`
- `indexes exist on username and email`

**Implementation tasks** (after the tests are red):
1. Confirm or create the D1 database and the `DB` binding in `wrangler.jsonc`
2. Run `npm run cf-typegen` so `env.DB` is typed
3. Create the migration with `npx wrangler d1 migrations create <db> create_users_table`
4. Write the `CREATE TABLE` / indexes from this PRD
5. Apply locally: `npx wrangler d1 migrations apply <db> --local`

**Deliverables**:
- `wrangler.jsonc` `d1_databases` binding
- `migrations/0001_create_users_table.sql` (or the generated equivalent)
- `migrations/0001_create_users_table.test.ts`
- Local database with an empty `users` table

**Phase complete when**: Phase 1 tests pass, `npm test` is otherwise green, and the local migration has been applied.

### Phase 2: User service - COMPLETED

**Objective**: All user persistence and password hashing live in one server-only module.

**Tests first (must fail before the service methods exist or behave correctly):**

File: `src/lib/services/user-service.test.ts`

Mock D1 (`prepare` / `bind` / `all` / `run`). Do not use a real database. Cover happy path **and** failure path.

- `createUser inserts a user and returns a public user without password_hash`
- `createUser bcrypt-hashes the incoming password and does not persist plaintext or the raw digest as password_hash`
- `createUser throws DuplicateUserError for an existing username`
- `createUser throws DuplicateUserError for an existing email`
- `createUser allows username to equal email for the same user`
- `getUserById returns the user when present and null when missing`
- `getUserByUsername and getUserByEmail look up by that column`
- `getUserByIdentifier matches username or email`
- `verifyPassword returns true for the original secret and false for a different secret`
- `updateUser changes provided fields and re-hashes when password is present`
- `updateUser returns null when the id does not exist`
- `updateUser throws DuplicateUserError when the new username or email belongs to someone else`
- `deleteUser returns true when a row was deleted and false when none was`

**Implementation tasks** (after the tests are red):
1. Add types for public `User`, `UserRow`, create input, and update input
2. Implement `createUser`, `updateUser`, `deleteUser`
3. Implement reads needed by login: `getUserById`, `getUserByUsername`, `getUserByEmail`, `getUserByIdentifier`
4. Implement `hashPassword` / `verifyPassword` with bcrypt; never return `password_hash` from public mappers
5. Map unique-constraint collisions to a typed duplicate error (username vs email)

**Deliverables**:
- `src/lib/types/user.ts`
- `src/lib/services/user-service.ts`
- `src/lib/services/user-service.test.ts`
- Public mapper that strips `password_hash`

**Phase complete when**: Phase 0–2 tests pass.

### Phase 3: Auth endpoints - COMPLETED

**Objective**: Register, login, and logout are callable over HTTP.

**Tests first (must fail before schemas/handlers exist or map errors correctly):**

Files:
- `src/lib/validations/auth.test.ts`
- `src/app/api/auth/register/route.test.ts`
- `src/app/api/auth/login/route.test.ts`
- `src/app/api/auth/logout/route.test.ts`

Mock `@opennextjs/cloudflare` and the user service. Handlers should not reconstruct D1.

Zod:
- `registerSchema accepts a valid body including username equal to email`
- `registerSchema rejects missing names, invalid email, and invalid username`
- `registerSchema treats password as an opaque digest (does not require min 8 on the hashed value)`
- `loginSchema requires identifier and password`
- `loginSchema rejects an empty identifier`

Register:
- `POST register returns 201 with a public user and never includes password_hash`
- `POST register returns 400 on validation failure`
- `POST register returns 409 when username is taken`
- `POST register returns 409 when email is taken`
- `POST register returns 500 on unexpected errors`

Login:
- `POST login returns 200 with a public user for a matching username and password`
- `POST login succeeds when identifier is the email`
- `POST login returns 401 Invalid credentials for an unknown identifier`
- `POST login returns 401 Invalid credentials for a bad password` (same message as unknown identifier)
- `POST login returns 400 on validation failure`
- `POST login does not set a cookie or return a token`

Logout:
- `POST logout returns 200 with success true`

**Implementation tasks** (after the tests are red):
1. Add Zod schemas for register and login bodies
2. Implement `POST /api/auth/register`
3. Implement `POST /api/auth/login`
4. Implement `POST /api/auth/logout` as a success no-op
5. Keep handlers thin: parse, call the service, map errors to status codes

**Deliverables**:
- `src/lib/validations/auth.ts` and `src/lib/validations/auth.test.ts`
- `src/app/api/auth/register/route.ts` and `route.test.ts`
- `src/app/api/auth/login/route.ts` and `route.test.ts`
- `src/app/api/auth/logout/route.ts` and `route.test.ts`

**Phase complete when**: Phase 0–3 tests pass.

### Phase 4: Frontend pages - COMPLETED

**Objective**: A teacher can register or log in in the browser and land on the MCQ stub.

**Tests first (must fail before helpers/pages exist or hash-then-POST):**

Files:
- `src/lib/hash-password.test.ts`
- `src/lib/auth-client.test.ts`
- `src/app/register/page.test.tsx`
- `src/app/login/page.test.tsx`
- `src/app/mcqs/page.test.tsx`

Hash helper:
- `hashPasswordForWire returns a 64-character hex SHA-256 digest`
- `hashPasswordForWire is deterministic for the same input`
- `hashPasswordForWire does not return the plaintext password`

Display hint (`sessionStorage`):
- `setStoredUser then getStoredUser round-trips the public user`
- `clearStoredUser removes the stored user`

Register page (Testing Library + `userEvent`; mock `fetch` and `next/navigation`):
- `register form hashes the password before POSTing /api/auth/register`
- `register form POSTs firstName, lastName, username, email, and the digest — not the typed password`
- `register form shows an error when passwords do not match and does not fetch`
- `register form stores the public user and navigates to /mcqs on 201`
- `register form shows the server error on 409`

Login page:
- `login form hashes the password before POSTing /api/auth/login`
- `login form POSTs identifier and the digest — not the typed password`
- `login form stores the public user and navigates to /mcqs on 200`
- `login form shows Invalid credentials on 401`

MCQ stub:
- `mcqs page greets the stored user when a display hint is present`
- `logout POSTs /api/auth/logout, clears the display hint, and navigates to /login`
- `mcqs page does not render question authoring controls`

**Implementation tasks** (after the tests are red):
1. Shared client helper to SHA-256 a password to hex
2. Optional `sessionStorage` helper for the public user display hint
3. Home, register, login, and `/mcqs` stub pages using the shadcn login/signup **blocks** (`LoginForm`, `SignupForm`) plus `card` / `field` / `input` / `button`. Omit Google and forgot-password from the stock blocks.
4. Hash-then-POST on register and login; redirect to `/mcqs` on success
5. Logout on the stub

**Deliverables**:
- `src/app/page.tsx`
- `src/app/register/page.tsx` and `page.test.tsx`
- `src/app/login/page.tsx` and `page.test.tsx`
- `src/app/mcqs/page.tsx` and `page.test.tsx`
- `src/components/login-form.tsx` — shadcn login block, adapted
- `src/components/signup-form.tsx` — shadcn signup block, adapted
- `src/lib/hash-password.ts` and `src/lib/hash-password.test.ts`
- `src/lib/auth-client.ts` and `src/lib/auth-client.test.ts`

**Phase complete when**: Phase 0–4 tests pass.

### Phase 5: Verification - COMPLETED

**Objective**: Prove the flow works end to end, including duplicate and bad-password cases. The unit suite stays green; browser checks cover what jsdom cannot.

**Tests first**: Do not add new product tests unless Phase 5 finds a gap. If a browser check fails because of missing coverage, write a failing Vitest case first, then fix production code.

**Results (2026-08-26)**:

| Check | Result |
|--------|--------|
| `npm test` | **55 passed** across 11 files (Vitest 3.2.7), including the Phase 5 snapshot-stability case |
| `npm run lint` | **Pass** after ignoring `.wrangler/**` and replacing `useEffect`+`setState` on `/mcqs` with `useSyncExternalStore` (`react-hooks/set-state-in-effect`) |
| `npm run build` | **Pass** (Next.js 16.2.12 Turbopack). Routes: `/`, `/login`, `/register`, `/mcqs`, `POST /api/auth/{register,login,logout}` |
| Local browser | User verified register, login, logout |
| Production browser | User verified register and login at `https://aisprints-starter.quiz-maker-007.workers.dev` |
| Production duplicate register | `409` `{ "success": false, "error": "A user with this username already exists" }` |
| Production bad password | `401` `{ "success": false, "error": "Invalid credentials" }` |
| Production valid login | `200` public user only (no `password_hash`, no cookie, no token) |
| Remote `password_hash` | Prefix `$2b$10$` (bcrypt, salt rounds 10), not plaintext and not the SHA-256 digest |

**Lint gaps found and fixed in this phase (not new product tests):**
1. `eslint .` was linting generated Wrangler bundles under `.wrangler/tmp`. Added `.wrangler/**` to `eslint.config.mjs` ignores.
2. `/mcqs` read `sessionStorage` via `useEffect` → `setUser(...)`, which ESLint flags (`react-hooks/set-state-in-effect`). Switched to `useSyncExternalStore`. `getStoredUser` caches the parsed object so the snapshot reference is stable (otherwise React infinite-loops).

**Deliverables**:
- Lint, build, and `npm test` passing
- Browser-verified happy path (local + production) and API error paths above

---

## Technical Implementation Details

### Shipped environment (do not recreate)

| Item | Value |
|------|--------|
| Git branch | `feature/register-login-logout` (all phases on this branch) |
| Worker name | `aisprints-starter` (starter name; do not rename unless asked) |
| Production URL | `https://aisprints-starter.quiz-maker-007.workers.dev` |
| D1 binding | `DB` |
| D1 database name | `quizmaker-db` |
| D1 database id | `750d1dc9-93c7-4839-b76c-57cc8ca3c272` |
| Remote schema | `migrations/0001_create_users_table.sql` **already applied** with `--remote` |
| Display-hint key | `sessionStorage["quizmaker_user"]` — public user JSON only, **not auth** |

`npm run deploy` has already been run for this sprint. Do not deploy again and do not re-apply `0001` remotely unless the user asks.

### Key Files

- `vitest.config.ts` — Vitest 3 harness (`jsdom`, `@/` via `vite-tsconfig-paths`, `@vitejs/plugin-react@4`). Excludes `node_modules`, `.next`, `.open-next`, `.wrangler`.
- `eslint.config.mjs` — Next ESLint. **Must ignore `.wrangler/**`** or `npm run lint` scans generated Wrangler bundles and fails.
- `tsconfig.json` — **Must `exclude: [".next/dev"]`**. Next.js re-adds `.next/dev/types/**/*.ts` to `include`; a corrupt `routes.d.ts` there breaks `npm run build` TypeScript. Excluding `.next/dev` is the durable fix.
- `wrangler.jsonc` — Worker `aisprints-starter`, `nodejs_compat`, D1 `DB` → `quizmaker-db` / `750d1dc9-93c7-4839-b76c-57cc8ca3c272`
- `next.config.ts` — `turbopack.root` pinned; `initOpenNextCloudflareForDev()` so `getCloudflareContext()` works in `npm run dev`
- `migrations/0001_create_users_table.sql` — `users` schema
- `migrations/0001_create_users_table.test.ts` — schema contract tests (read the SQL file; no live D1)
- `src/lib/types/user.ts` — public `User` vs D1 `UserRow` vs `CreateUserInput` / `UpdateUserInput`
- `src/lib/services/user-service.ts` — CRUD + bcrypt; **only this module talks to D1 for users**. `DuplicateUserError` on pre-check and UNIQUE races. Public `User` never includes `password_hash`. `getUserByIdentifier` returns `UserRow` so login can `verifyPassword`.
- `src/lib/services/user-service.test.ts` — mocked `prepare` / `bind` / `all` / `run`
- `src/lib/validations/auth.ts` — Zod. Password is an opaque digest (no min-8). Username may be `[a-zA-Z0-9_-]+` **or** a valid email.
- `src/lib/validations/auth.test.ts` — schema accept/reject cases
- `src/lib/hash-password.ts` — Web Crypto SHA-256 hex used by both forms
- `src/lib/hash-password.test.ts` — 64-char hex, deterministic, not plaintext
- `src/lib/auth-client.ts` — `sessionStorage` display hint. `getStoredUser` **caches** the parsed object so `useSyncExternalStore` does not infinite-loop.
- `src/lib/auth-client.test.ts` — round-trip, clear, stable snapshot identity
- `src/components/login-form.tsx` — shadcn login block (no Google, no forgot-password); identifier = username or email; `minLength={8}` on typed password
- `src/components/signup-form.tsx` — shadcn signup block (first + last name, no Google); confirm password before hash
- `src/app/api/auth/register/route.ts` — POST register → 201 / 400 / 409 / 500
- `src/app/api/auth/register/route.test.ts` — mocks Cloudflare + `createUser`
- `src/app/api/auth/login/route.ts` — POST login → 200 / 400 / 401 / 500
- `src/app/api/auth/login/route.test.ts` — username or email, generic 401, no cookie/token
- `src/app/api/auth/logout/route.ts` — POST logout 200 no-op
- `src/app/api/auth/logout/route.test.ts`
- `src/app/page.tsx` — landing Register / Log in
- `src/app/register/page.tsx` — Server Component shell + `SignupForm`
- `src/app/register/page.test.tsx` — hash-then-POST, mismatch, 201, 409
- `src/app/login/page.tsx` — Server Component shell + `LoginForm`
- `src/app/login/page.test.tsx` — hash-then-POST, 401, redirect
- `src/app/mcqs/page.tsx` — stub + logout; reads hint via `useSyncExternalStore`
- `src/app/mcqs/page.test.tsx` — greeting, logout, no MCQ authoring

### Implementation Patterns

```typescript
// Client: hash before POST. Never send the typed password.
// Source: src/lib/hash-password.ts
export async function hashPasswordForWire(plain: string): Promise<string> {
  const bytes = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

```typescript
// Forms POST the digest in `password`, not the typed value.
const digest = await hashPasswordForWire(password);
await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier, password: digest }),
});
```

```typescript
// Server: D1 stays in the user service. Numbered placeholders. Prefer all() + results[0].
const result = await db
  .prepare(
    `INSERT INTO users (first_name, last_name, username, email, password_hash)
     VALUES (?1, ?2, ?3, ?4, ?5)
     RETURNING id, first_name, last_name, username, email, password_hash, created_at, updated_at`,
  )
  .bind(input.firstName, input.lastName, input.username, input.email, passwordHash)
  .all<UserRow>();
const row = result.results[0];
```

```typescript
// Login lookup: username OR email. Returns the row (includes password_hash).
`SELECT ... FROM users WHERE username = ?1 OR email = ?1`
```

```typescript
// Route handlers: getCloudflareContext then env.DB. Map DuplicateUserError → 409.
const { env } = await getCloudflareContext();
const user = await createUser(env.DB, parsed.data);
```

```typescript
// Tests: mock Cloudflare context; never call real D1.
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { DB: mockDb },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});
```

```jsonc
// wrangler.jsonc — keep this binding. Do not revert to a placeholder UUID.
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "quizmaker-db",
    "database_id": "750d1dc9-93c7-4839-b76c-57cc8ca3c272"
  }
]
```

```json
// tsconfig.json — Next re-includes .next/dev/types; exclude the folder or typecheck can fail.
"exclude": ["node_modules", ".next/dev"]
```

```tsx
// /mcqs display hint: useSyncExternalStore, not useEffect+setState.
// getStoredUser must return a stable object reference when storage is unchanged.
const user = useSyncExternalStore(subscribeStoredUser, getStoredUser, () => null);
```

Do not import the user service (or any D1 module) into a `'use client'` file.

### Password pipeline (do not change)

1. Browser: typed password → SHA-256 hex (`hashPasswordForWire`).
2. Wire JSON `password` field = that hex digest (64 chars).
3. Server `hashPassword` / `verifyPassword` treat the incoming string as the secret. They bcrypt it (salt rounds **10**) / compare. They do **not** SHA-256 again.
4. D1 `password_hash` = bcrypt string (`$2b$10$...`).
5. API JSON never includes `password_hash`.

Client `minLength={8}` applies to the **typed** password. Zod `password: z.string().min(1)` applies to the **digest**.

### Important Notes

- Prepared statements with bound parameters only. Never concatenate user input into SQL. Use `?1`, `?2`, not anonymous `?`.
- Register Zod schema validates names/username/email. After client hashing, `password` is an opaque digest; do not apply "min 8 characters" to the hex string on the server.
- Duplicate username/email: check before insert and still handle UNIQUE failures so a race does not 500. `DuplicateUserError.field` is `"username"` or `"email"`.
- Logout has nothing to revoke on the server. The endpoint exists so the client has a single, explicit contract: POST, clear `quizmaker_user`, go to `/login`.
- `npm run dev` is Node. D1 and Workers behavior need `npm run preview`. Production is Cloudflare Workers via OpenNext.
- **Do not deploy** unless the user explicitly asks. Production is already live for this sprint.
- **Do not apply D1 migrations with `--remote`** unless the user explicitly asks. `0001` is already on the remote `quizmaker-db`.
- Ask before adding a dependency beyond what this PRD already has: `bcryptjs`, `@types/bcryptjs`, Vitest 3, `@vitejs/plugin-react@4`, Testing Library, `jsdom`, `vite-tsconfig-paths`. Zod is in the starter.
- TDD is required for new product work. This identity feature is complete; do not re-implement it.
- Corporate npm often 401s against Pearson Nexus. Install with `--registry https://registry.npmjs.org/` for that command only. Do not change the user's global npm config.
- `gh` is not installed in this environment. Git push to `origin` works.

---

## Acceptance Criteria

- [x] A teacher can register with first name, last name, username, email, and password, and is taken to `/mcqs`
- [x] A teacher can register with username equal to email
- [x] The typed password is SHA-256 hashed in the browser before the register and login POST bodies are sent
- [x] `users.password_hash` is a bcrypt hash, never plaintext and never the raw SHA-256 digest (remote prefix `$2b$10$`)
- [x] API success payloads never include `password_hash`
- [x] A teacher can log in with username **or** email and the matching password, and is taken to `/mcqs`
- [x] A wrong password or unknown identifier returns 401 `"Invalid credentials"` and does not reveal which was wrong
- [x] A duplicate username or email on register returns 409 and does not create a second row
- [x] Invalid payloads return 400 with a validation message
- [x] Logout calls `POST /api/auth/logout`, clears any client display hint, and returns the teacher to `/login`
- [x] `/mcqs` is a stub only: greeting + logout, no question authoring
- [x] No cookies, JWTs, social login, or server session store are introduced
- [x] User service supports create, update, and delete even though update/delete have no UI in this phase
- [x] D1 queries use prepared statements and numbered placeholders
- [x] `npm test` is green for the tests listed in Phases 1–4 (55 tests including Phase 5 snapshot-stability case)
- [x] Each implementation phase was developed red-then-green (tests existed and failed before the production code that makes them pass)
- [x] `npm run lint` and `npm run build` succeed

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Happy-path completion | Register and login each reach `/mcqs` on the first try with valid input | Manual browser pass (local + production) in Phase 5 |
| Duplicate handling | Second register with the same username or email is rejected and the table has one row | Production `409` + unique constraints |
| Password secrecy | No plaintext password in D1 or in network JSON | Request payload is hex digest; `password_hash` is `$2b$10$...` |
| Unit-test gate | Every listed phase test is green | `npm test` (`vitest run`) |
| Scope discipline | Zero tokens, cookies, or MCQ tables | Code review against Out of Scope |

This sprint's identity layer is in production. There is still no MCQ traffic to measure.

---

## Dependencies

### External Dependencies

- Cloudflare D1 — user persistence (`quizmaker-db`)
- `bcryptjs@^3` — server-side salted password hashing (installed)
- Web Crypto API — client SHA-256; built into the browser, no package
- Vitest 3 — unit tests (`vi` mocks, `vitest run`)
- `@testing-library/react` and `@testing-library/user-event` — client page tests
- `jsdom` — Vitest DOM environment
- `vite-tsconfig-paths` — `@/` alias in tests
- `@vitejs/plugin-react@4` — JSX in `.test.tsx`. Do **not** bump to v6 (needs Babel 8)

### Internal Dependencies

- Next.js App Router route handlers — HTTP surface (exception to the Server Actions rule)
- `@opennextjs/cloudflare` `getCloudflareContext()` — `env.DB`
- Zod 4 — request validation
- shadcn/ui `card`, `button`, `input`, `field`, `label` — forms and stub
- `src/lib/services/user-service.ts` — all user D1 access
- `.cursor/skills/testing/SKILL.md` — Vitest harness and mocking

### Environment / config

- `wrangler.jsonc` D1 binding name `DB`, database `quizmaker-db`, id `750d1dc9-93c7-4839-b76c-57cc8ca3c272`
- No auth secrets for this phase (no JWT secret, no OAuth client ids)
- Local migrations: `npx wrangler d1 migrations apply quizmaker-db --local`
- Remote `0001` already applied; do not re-run unless asked
- `tsconfig.json` exclude `.next/dev` (see troubleshooting)
- `eslint.config.mjs` ignore `.wrangler/**`

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `bcryptjs` is CPU-heavy on the Workers isolate, or behaves differently under `npm run dev` (Node) vs `npm run preview` (Workers).
- **Mitigation**: Salt rounds stay at 10. Register/login were verified on production Workers, not only `npm run dev`. If bcrypt becomes unusable, switch the server hash to Web Crypto PBKDF2 and document the change here.

- **Risk**: Client SHA-256 without a per-user salt would be replayable if it were stored directly.
- **Mitigation**: Store bcrypt of the digest, not the digest itself. Compare with `bcrypt.compare`.

- **Risk**: Treating a `sessionStorage` user object as "logged in" and later protecting MCQ APIs with it.
- **Mitigation**: Document it as a display hint only. **Next sprint that adds MCQ writes must add real server auth** (cookie or equivalent). Until then APIs are unauthenticated by design. Forging `quizmaker_user` does not grant server access because there is none.

- **Risk**: Unique username/email races produce a raw SQLite error as 500.
- **Mitigation**: Pre-check plus catch UNIQUE failures (`users.username` / `users.email` in the error message) and map them to 409.

### User Experience Risks

- **Risk**: Teachers expect to stay logged in across tabs/devices.
- **Mitigation**: Out of scope. The stub is a first-pass sign-in, not a lasting session.

- **Risk**: Hashing on the client makes debugging "wrong password" harder.
- **Mitigation**: Keep login errors generic. Both forms use `hashPasswordForWire` so a mismatch is a code bug, not a user error.

---

## Troubleshooting Guide

### D1 binding missing at runtime

**Problem**: Register/login throw because `env.DB` is undefined.
**Cause**: Binding not in `wrangler.jsonc`, or running only `npm run dev` without a local D1, or `cf-typegen` not re-run.
**Solution**: Keep the existing `d1_databases` block, apply new migrations with `--local`, run `npm run cf-typegen`, verify with `npm run preview`.
**Code Reference**: `wrangler.jsonc`

### Placeholder D1 id blocks deploy

**Problem**: `npm run deploy` / Wrangler fails or binds the wrong database because `database_id` is `00000000-0000-0000-0000-000000000001`.
**Cause**: The starter used a placeholder UUID. Production needs the real D1 id from `npx wrangler d1 create quizmaker-db`.
**Solution**: Keep `database_id` as `750d1dc9-93c7-4839-b76c-57cc8ca3c272`. Do not recreate the database.
**Code Reference**: `wrangler.jsonc`

### Production register 500 because remote DB has no `users` table

**Problem**: Local register works; production returns 500.
**Cause**: Migrations applied with `--local` only. Remote D1 starts empty.
**Solution**: After the user asks to fix production: `npx wrangler d1 migrations apply quizmaker-db --remote`. `0001` is already applied; do not run this again unless a **new** migration exists and the user asks.
**Code Reference**: `migrations/0001_create_users_table.sql`

### `npm run build` TypeScript fails on `.next/dev/types/routes.d.ts`

**Problem**: Typecheck errors in generated `routes.d.ts` (truncated/corrupt tokens such as `d'>`).
**Cause**: Next.js adds `.next/dev/types/**/*.ts` to `tsconfig` include. Dev-server generated types can be corrupt and are not a source of truth for production build.
**Solution**: `"exclude": ["node_modules", ".next/dev"]` in `tsconfig.json`. Do not try to hand-edit files under `.next/`.
**Code Reference**: `tsconfig.json`

### `npm run lint` floods errors from `.wrangler/tmp`

**Problem**: Thousands of ESLint errors in generated Wrangler middleware bundles.
**Cause**: `.wrangler` is gitignored but ESLint still walks it unless ignored.
**Solution**: Include `".wrangler/**"` in `eslint.config.mjs` `ignores`.
**Code Reference**: `eslint.config.mjs`

### `/mcqs` infinite loop: "getSnapshot should be cached"

**Problem**: `useSyncExternalStore` maximum update depth exceeded.
**Cause**: `getStoredUser()` `JSON.parse`s on every call, so each snapshot is a new object reference.
**Solution**: Cache parsed user against the raw `sessionStorage` string; return the same object when the raw value is unchanged.
**Code Reference**: `src/lib/auth-client.ts`, `src/app/mcqs/page.tsx`

### Client hash not applied on one of the forms

**Problem**: Register succeeds but login always 401, or the stored hash looks like bcrypt of the typed password rather than of the digest.
**Cause**: One form POSTs plaintext; the other hashes. Or the server hashes twice on one path.
**Solution**: One shared client helper used by both forms; server always bcrypts the incoming `password` field as-is.
**Code Reference**: `src/lib/hash-password.ts`, `src/lib/services/user-service.ts`

### UNIQUE constraint 500 instead of 409

**Problem**: Duplicate register returns 500.
**Cause**: Duplicate error from D1 is not mapped.
**Solution**: Catch `DuplicateUserError` and UNIQUE failures; return 409 with a field-specific message that does not leak the other column.
**Code Reference**: `src/app/api/auth/register/route.ts`, `src/lib/services/user-service.ts`

### npm install against Pearson Nexus returns 401

**Problem**: `npm install` fails with `E401 Unable to authenticate, need: BASIC realm="Sonatype Nexus Repository Manager"`.
**Cause**: User npm config points `registry` at `https://nexus.releng.pearsondev.com/repository/npm-all/` with `always-auth = true`.
**Solution**: For this repo, install from the public registry for that command only: `npm install ... --registry https://registry.npmjs.org/`. Do not change the user's global npm config.

### @vitejs/plugin-react peer dependency conflict

**Problem**: Latest `@vitejs/plugin-react` (v6) cannot resolve against the starter's Babel 7 tree.
**Cause**: plugin-react v6 wants `@babel/core@^8`.
**Solution**: Keep `vitest@3` and `@vitejs/plugin-react@4`.

---

## Notes for AI Agents

When working from this PRD:

1. This identity sprint is **done**. Do not re-create the `users` table, Vitest harness, auth routes, or forms.
2. Source of truth for *this* feature remains this file. For the next feature, write a new PRD; do not silently expand this one into MCQ authoring.
3. Use Scope (In/Out/Cut) — social login, JWTs, cookies, and MCQ tables stay out until a new PRD says otherwise.
4. Prefer route handlers for auth even though the Next.js rule prefers Server Actions — that exception is explicit in Cut.
5. Never treat `sessionStorage["quizmaker_user"]` as authentication. The next sprint that writes MCQs must add a real server session (or equivalent) first.
6. Ask before adding dependencies. Do not bump `@vitejs/plugin-react` to v6.
7. Do not deploy unless asked. Do not apply D1 migrations remotely unless asked. `0001` is already on remote `quizmaker-db`.
8. Follow `.cursor/skills/testing/SKILL.md`. Mock D1 and `getCloudflareContext()`. Do not add `@cloudflare/vitest-pool-workers` unless asked.
9. Keep `tsconfig.json` exclude `.next/dev` and ESLint ignore `.wrangler/**`.
10. Stay on `feature/register-login-logout` unless the user asks for a new branch.
11. Corporate npm: `--registry https://registry.npmjs.org/` per install if Nexus 401s.

---

## Notes for the next sprint (MCQ authoring)

- Add **real server auth** before any MCQ create/update/delete API. This sprint's APIs are intentionally unauthenticated.
- Reuse `users.id` as the teacher foreign key. Do not invent a second identity table.
- `/mcqs` is a stub: greeting + logout only. Replace it when authoring UI exists; keep logout.
- Reuse shadcn `card` / `button` / `input` / `field`. Ask before new dependencies.
- Continue TDD with the existing Vitest harness. Colocate `*.test.ts(x)`.
- New D1 tables get a new numbered migration (`0002_...`). Apply `--local` first. Remote only if the user asks.

---

## Current Status

**Last Updated**: 2026-08-26
**Current Phase**: Phase 5 complete
**Status**: COMPLETED (Phases 0–5)
**Next Steps**: New PRD for MCQ authoring. Do not start MCQ work from this document. Real sessions before any MCQ writes.

