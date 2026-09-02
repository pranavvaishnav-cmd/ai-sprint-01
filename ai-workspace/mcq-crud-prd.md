Date created: 2026-09-02
Date last modified: 2026-09-02 (Phase 5 complete — MCQ CRUD shipped)

# Multiple-Choice Question CRUD - Technical PRD

## Overview/Problem

Identity is shipped: a teacher can register, log in, and land on `/mcqs`. That page was a stub — greeting plus logout — so there was no way to store or manage the multiple-choice questions QuizMaker exists to hold. This sprint added the first authoring surface: list every MCQ, create one, edit it, preview it as a student would see it, delete it, and record an attempt against a specific choice. **Phases 1–5 are COMPLETE.** Do not rebuild this feature or register / login / logout. `sessionStorage["quizmaker_user"]` remains a display hint only and is not authentication.

---

## Hypothesis

We believe that a shadcn table of MCQs, a shared create/edit form, and a preview that records attempts — all backed by an MCQ service over three D1 tables — will let teachers start building a test bank without introducing real server auth, collaboration, or quiz assembly yet.

---

## Scope

### In Scope

- Three Cloudflare D1 tables in one new migration: `mcqs`, `mcq_choices`, `mcq_attempts`
- A server-side MCQ service that is the only module that talks to D1 for these tables
- HTTP endpoints for listing, creating, reading, updating, and deleting MCQs
- HTTP endpoints for recording and listing attempts on a specific MCQ
- Expand `/mcqs` from a stub into a list page: shadcn `Table` of questions plus a Create button
- A shared create/edit page with Save and Cancel
- Per-row actions behind a three-dot (vertical ellipsis) dropdown: Edit, Preview, Delete
- A preview page that presents the question, accepts a choice, and records an attempt
- Default two choice fields on the form; the teacher may add up to six and may remove down to two
- Exactly one choice marked correct
- Test-driven implementation with **Vitest**: each phase starts with failing tests and is not complete until those tests (and all earlier phases' tests, including identity) are green

### Out of Scope

- Real authentication, cookies, JWT, or checking `sessionStorage` on the server
- Attaching an MCQ or an attempt to a teacher (`user_id` is not stored)
- Collaboration, sharing, or permissions on questions
- Assembling questions into a quiz / test / assignment
- AI generation of questions or choices
- Rich text, images, or media in the stem or choices
- Multiple correct answers (this sprint is single-correct MCQ)
- Scoring, grades, or attempt analytics dashboards
- Pagination, search, or sort controls on the list
- Password reset, profile editing, or any identity change

### Cut

- **Server Actions for MCQ mutations** — Identity used route handlers as the HTTP contract. This sprint stays consistent: App Router `src/app/api/` handlers, Zod-validated JSON, thin handlers that call the service.
- **Owner / `user_id` columns** — The identity PRD forbids treating the display hint as a grant of access. Storing a client-supplied user id would look like authorship without being real. Ownership waits for server auth.
- **`@cloudflare/vitest-pool-workers`** — Unit tests mock D1 and `getCloudflareContext()`. Do not add this pool unless we explicitly decide to.
- **react-hook-form** — Forms use local state + Zod on the server, same as identity. Do not add this library.
- **Soft delete** — Delete is hard delete. Choices and attempts cascade.

---

## Test-Driven Development

This feature is built **red → green → next phase**. Vitest (`vi`) is the unit-testing framework. Tests are the phase gate; acceptance criteria are the product gate. Both must pass before a phase is marked COMPLETED.

The identity suite already exists and must stay green. Phase 4 **replaces** the stub assertion `mcqs page does not render question authoring controls` — that test is now wrong on purpose.

### Cycle (every implementation phase)

1. **Red.** Write the tests listed for that phase. Run `npm test`. They must fail (missing module, failing assertion, or unimplemented behavior). A test that cannot fail is not a test — do not add hollow `expect(true).toBe(true)` checks.
2. **Green.** Implement the minimum production code to make that phase's tests pass. Do not start the next phase's features while the current suite is red.
3. **Stay green.** Re-run `npm test`. Current-phase tests, earlier MCQ phases, and **the identity suite** must pass. Then check the phase's acceptance criteria.
4. Mark the phase COMPLETED only when the suite is green **and** the phase objective is met.

### Conventions

- Follow `.cursor/skills/testing/SKILL.md`
- Colocate tests: `src/lib/services/mcq-service.ts` is tested by `src/lib/services/mcq-service.test.ts`
- Assert observable output and side effects, including failure paths
- Mock at the module boundary with `vi.mock`. Never hit a real D1 database, a real network, or a real Cloudflare binding in unit tests
- Mock `getCloudflareContext()` and pass a fake `env.DB`. Keep D1 behind `src/lib/services/` so handlers are tested by mocking the service, not reconstructing the prepared-statement chain
- Reset mocks in `beforeEach` with `vi.clearAllMocks()`
- Each test must pass in isolation
- Name tests so the failure message explains what broke
- Server Components are not rendered by Testing Library. Test data logic as functions; render only client components
- Identity tests stay. Do not weaken password, uniqueness, or hashing assertions

### Harness

Already installed in the identity sprint. Do not reinstall Vitest. Scripts remain `"test": "vitest run"` and `"test:watch": "vitest"`.

---

## Technical Requirements

### Database Schema

Cloudflare D1 (SQLite). The database **already exists**: binding `DB`, database name `quizmaker-db`, id `750d1dc9-93c7-4839-b76c-57cc8ca3c272` in `wrangler.jsonc`. Do not create a second database. Do not alter `users`. New schema lives in `migrations/0002_create_mcq_tables.sql`. Apply locally with `--local`. **Do not apply `--remote` unless the user explicitly asks.**

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  FOREIGN KEY (choice_id) REFERENCES mcq_choices(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
```

| Table | Column | Type | Notes |
|--------|--------|------|-------|
| `mcqs` | `id` | TEXT PK | Random 16-byte hex, lowercased |
| `mcqs` | `name` | TEXT NOT NULL | Short title shown in the list |
| `mcqs` | `description` | TEXT NOT NULL DEFAULT `''` | Longer stem / notes. Empty string allowed |
| `mcqs` | `created_at` | DATETIME | Default `CURRENT_TIMESTAMP` |
| `mcqs` | `updated_at` | DATETIME | Default `CURRENT_TIMESTAMP`; refresh on update |
| `mcq_choices` | `id` | TEXT PK | Random 16-byte hex |
| `mcq_choices` | `mcq_id` | TEXT NOT NULL | FK → `mcqs.id`, `ON DELETE CASCADE` |
| `mcq_choices` | `text` | TEXT NOT NULL | Choice label shown to the teacher / student |
| `mcq_choices` | `is_correct` | INTEGER NOT NULL | `1` or `0`. Exactly one `1` per MCQ is enforced in the service, not a DB constraint |
| `mcq_choices` | `position` | INTEGER NOT NULL | 0-based display order |
| `mcq_attempts` | `id` | TEXT PK | Random 16-byte hex |
| `mcq_attempts` | `mcq_id` | TEXT NOT NULL | FK → `mcqs.id`, `ON DELETE CASCADE` |
| `mcq_attempts` | `choice_id` | TEXT NOT NULL | FK → `mcq_choices.id`, `ON DELETE CASCADE` |
| `mcq_attempts` | `is_correct` | INTEGER NOT NULL | Copied from the selected choice **on the server**. Never trusted from the client |
| `mcq_attempts` | `created_at` | DATETIME | Default `CURRENT_TIMESTAMP` |

SQLite stores booleans as integers. The service maps `is_correct` to `boolean` in public types.

Updating an MCQ replaces its choices (delete existing, insert the new set). Attempts that referenced the old choices are removed by `ON DELETE CASCADE`. Acceptable for v1; document it.

### Service rules

All D1 access for these tables lives in `src/lib/services/mcq-service.ts`. Numbered placeholders (`?1`, `?2`). Prefer `all()` + `results[0]` over `first()`. Use `db.batch()` so creating or updating an MCQ plus its choices is one atomic unit.

- Name: required after trim, 1–200 characters
- Description: optional; persist `''` when omitted; max 2000 characters
- Choices: minimum 2, maximum 6
- Each choice `text`: required after trim, 1–500 characters
- Exactly one choice with `is_correct: true`
- `createAttempt` loads the choice, verifies it belongs to the MCQ, and sets `is_correct` from that row
- `listMcqs` returns questions only (no choices), newest `updated_at` first
- `getMcqById` returns the question plus choices ordered by `position`
- `deleteMcq` returns `true` when a row was deleted and `false` when none was
- Missing MCQ on get / update / attempt → typed `McqNotFoundError`
- Choice that does not belong to the MCQ on attempt → typed `InvalidChoiceError`
- Validation failures → typed `McqValidationError` with a message the handler can return as 400

### API Endpoints

All endpoints are App Router route handlers. Validate every body with Zod before touching D1. Centralize D1 access in the MCQ service.

Reach the binding with `getCloudflareContext()` from `@opennextjs/cloudflare`, then `env.DB`.

There is **no auth check**. Same limitation as identity: the APIs are open. Do not read `sessionStorage` on the server.

Shared error shape: `{ "success": false, "error": "<message>" }`.

#### GET /api/mcqs

Lists every MCQ (no choices).

**Response:**
- Success (200): `{ "success": true, "mcqs": [ { "id", "name", "description", "createdAt", "updatedAt" } ] }`
- Error (500): Internal server error

#### POST /api/mcqs

Creates an MCQ and its choices.

**Request Body:**
```json
{
  "name": "What is 2 + 2?",
  "description": "Basic arithmetic",
  "choices": [
    { "text": "3", "isCorrect": false },
    { "text": "4", "isCorrect": true }
  ]
}
```

**Response:**
- Success (201): `{ "success": true, "mcq": { "id", "name", "description", "createdAt", "updatedAt", "choices": [ { "id", "text", "isCorrect", "position" } ] } }`
- Error (400): Validation error (missing name, fewer than 2 choices, more than 6, zero or multiple correct)
- Error (500): Internal server error

#### GET /api/mcqs/[id]

Returns one MCQ with choices. Teachers use this for edit and preview. `isCorrect` is included — preview is a teacher tool, not a locked student exam.

**Response:**
- Success (200): `{ "success": true, "mcq": { ...same shape as create } }`
- Error (404): `{ "success": false, "error": "Question not found" }`
- Error (500): Internal server error

#### PUT /api/mcqs/[id]

Replaces name, description, and the full choice set.

**Request Body:** same as POST.

**Response:**
- Success (200): `{ "success": true, "mcq": { ... } }`
- Error (400): Validation error
- Error (404): Question not found
- Error (500): Internal server error

#### DELETE /api/mcqs/[id]

Hard-deletes the MCQ. Choices and attempts cascade.

**Response:**
- Success (200): `{ "success": true }`
- Error (404): Question not found
- Error (500): Internal server error

#### POST /api/mcqs/[id]/attempts

Records one attempt. The client sends only the selected choice. The server decides correctness.

**Request Body:**
```json
{
  "choiceId": "choice-2"
}
```

**Response:**
- Success (201): `{ "success": true, "attempt": { "id", "mcqId", "choiceId", "isCorrect", "createdAt" } }`
- Error (400): Missing `choiceId`, or choice does not belong to this MCQ
- Error (404): Question not found
- Error (500): Internal server error

#### GET /api/mcqs/[id]/attempts

Lists attempts for that question, newest first.

**Response:**
- Success (200): `{ "success": true, "attempts": [ { "id", "mcqId", "choiceId", "isCorrect", "createdAt" } ] }`
- Error (404): Question not found
- Error (500): Internal server error

### User Interface Requirements

Use **shadcn/ui** already in the repo (`table`, `button`, `card`, `field`, `input`, `dialog`, `label`). Add `dropdown-menu` and `textarea` via `npx shadcn@latest add @shadcn/<name>` (Base UI / `base-nova`). Style with existing Tailwind/shadcn tokens only.

Keep `'use client'` off the root layout. Push client components to the interactive pieces (list actions, form, preview). Route `page.tsx` files may be thin Server Component shells that render a client child — same pattern as login/register.

Identity greeting and logout stay on the list page.

#### MCQ list (/mcqs)

Replaces the stub card with a wider workspace (`max-w-5xl`).

- Header: title **MCQ Test Bank**, signed-in greeting when the display hint is present, **Log out** (unchanged contract: POST `/api/auth/logout`, clear hint, `router.push("/login")`)
- Primary action: **Create question** → `/mcqs/new`
- shadcn `Table` columns: **Name**, **Description**, **Actions**
- Empty state: table (or a clear empty message) saying no questions yet; Create remains visible
- Each row loads from `GET /api/mcqs`
- Actions column: icon button with three vertical ellipses (`EllipsisVertical`). Click opens a shadcn dropdown:
  - **Edit** → `/mcqs/[id]/edit`
  - **Preview** → `/mcqs/[id]/preview`
  - **Delete** → confirm dialog, then `DELETE /api/mcqs/[id]`, then refresh the list
- Delete dialog: title **Delete question?**, copy that this cannot be undone, **Cancel** and destructive **Delete**
- Fetch errors surface as visible text, not a silent empty table

#### Create (/mcqs/new) and Edit (/mcqs/[id]/edit)

One shared client form (`McqForm`). Create starts empty; edit loads `GET /api/mcqs/[id]`.

- Fields:
  - Name (required)
  - Description (optional, textarea)
  - Choices: default **two** rows on create. Each row: text input + radio **Correct answer**
  - **Add choice** visible while count < 6; disabled or hidden at 6
  - **Remove** on a choice row only while count > 2
- Client validation before fetch: name required, 2–6 non-empty choice texts, exactly one correct
- **Save** → `POST /api/mcqs` (create) or `PUT /api/mcqs/[id]` (edit). On success `router.push("/mcqs")`
- **Cancel** → `/mcqs` without saving
- Server 400: show the `error` string via `FieldError`
- Missing id on edit: show **Question not found** and a way back to the list

#### Preview (/mcqs/[id]/preview)

Teacher preview that also records an attempt.

- Load `GET /api/mcqs/[id]`
- Show name and description
- Radio list of choices **without** marking which is correct until after submit
- **Submit answer** → `POST /api/mcqs/[id]/attempts` with `{ choiceId }`
- After success, show Correct or Incorrect from the server `attempt.isCorrect` (do not compute this in the client from `choices[].isCorrect`)
- **Back** → `/mcqs`
- Missing id: same not-found treatment as edit

---

## Implementation Phases

A phase is **COMPLETED** only when (1) `npm test` is green for that phase, every earlier MCQ phase, and the identity suite, and (2) the phase objective and listed acceptance checks are met. Write the tests first. They will fail. That failure is the signal to start implementation.

### Phase 1: Database - COMPLETED

**Objective**: Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts`. `users` is untouched.

**Tests first (must fail before the migration exists or matches the schema):**

File: `migrations/0002_create_mcq_tables.test.ts`

These tests read the migration SQL. They do **not** talk to a live D1 database.

- `mcq migration creates mcqs, mcq_choices, and mcq_attempts tables`
- `mcqs table defines id as TEXT PRIMARY KEY and requires name`
- `mcqs table defaults created_at and updated_at to CURRENT_TIMESTAMP`
- `mcq_choices references mcqs(id) with ON DELETE CASCADE`
- `mcq_choices stores is_correct as INTEGER and requires text and position`
- `mcq_attempts references mcqs(id) and mcq_choices(id) with ON DELETE CASCADE`
- `mcq_attempts records choice_id and is_correct`
- `indexes exist on mcq_choices.mcq_id and mcq_attempts.mcq_id`

**Implementation tasks** (after the tests are red):
1. Create the migration with `npx wrangler d1 migrations create quizmaker-db create_mcq_tables`
2. Write the `CREATE TABLE` / indexes from this PRD
3. Apply locally: `npx wrangler d1 migrations apply quizmaker-db --local`

**Deliverables**:
- `migrations/0002_create_mcq_tables.sql`
- `migrations/0002_create_mcq_tables.test.ts`
- Local database with the three new tables

**Phase complete when**: Phase 1 tests pass, identity tests still pass, and the local migration has been applied.

### Phase 2: MCQ service - COMPLETED

**Objective**: All MCQ, choice, and attempt persistence lives in one server-only module.

**Tests first (must fail before the service methods exist or behave correctly):**

File: `src/lib/services/mcq-service.test.ts`

Mock D1 (`prepare` / `bind` / `all` / `run` / `batch`). Do not use a real database. Cover happy path **and** failure path.

- `listMcqs returns questions without choices, newest updated_at first`
- `getMcqById returns the question with choices ordered by position`
- `getMcqById throws McqNotFoundError when missing`
- `createMcq inserts the question and its choices and returns them with generated ids`
- `createMcq persists description as empty string when omitted`
- `createMcq throws McqValidationError when name is empty`
- `createMcq throws McqValidationError when there are fewer than 2 or more than 6 choices`
- `createMcq throws McqValidationError when zero or more than one choice is correct`
- `createMcq throws McqValidationError when a choice text is empty`
- `updateMcq replaces name, description, and choices`
- `updateMcq throws McqNotFoundError when the id does not exist`
- `updateMcq throws McqValidationError for the same choice rules as create`
- `deleteMcq returns true when a row was deleted and false when none was`
- `createAttempt records the selected choice and copies is_correct from that choice, ignoring any client-supplied correctness`
- `createAttempt throws McqNotFoundError when the question is missing`
- `createAttempt throws InvalidChoiceError when the choice does not belong to the question`
- `listAttempts returns attempts for that mcq_id, newest first`
- `listAttempts throws McqNotFoundError when the question is missing`

**Implementation tasks** (after the tests are red):
1. Add types for public `Mcq`, `McqChoice`, `McqAttempt`, D1 rows, and create/update input
2. Implement list / get / create / update / delete
3. Implement `createAttempt` and `listAttempts`
4. Map validation and not-found to typed errors

**Deliverables**:
- `src/lib/types/mcq.ts`
- `src/lib/services/mcq-service.ts`
- `src/lib/services/mcq-service.test.ts`

**Phase complete when**: Phase 1–2 tests and the identity suite pass.

### Phase 3: API endpoints - COMPLETED

**Objective**: MCQ CRUD and attempts are callable over HTTP.

**Tests first (must fail before schemas/handlers exist or map errors correctly):**

Files:
- `src/lib/validations/mcq.test.ts`
- `src/app/api/mcqs/route.test.ts`
- `src/app/api/mcqs/[id]/route.test.ts`
- `src/app/api/mcqs/[id]/attempts/route.test.ts`

Mock `@opennextjs/cloudflare` and the MCQ service. Handlers should not reconstruct D1.

Zod:
- `mcqWriteSchema accepts a valid name, optional description, and 2–6 choices with exactly one correct`
- `mcqWriteSchema rejects an empty name`
- `mcqWriteSchema rejects fewer than 2 or more than 6 choices`
- `mcqWriteSchema rejects zero or multiple correct choices`
- `mcqWriteSchema rejects an empty choice text`
- `attemptSchema requires choiceId`

List / create:
- `GET /api/mcqs returns 200 with the service list`
- `POST /api/mcqs returns 201 with the created mcq`
- `POST /api/mcqs returns 400 on validation failure`
- `POST /api/mcqs returns 500 on unexpected errors`

Read / update / delete:
- `GET /api/mcqs/[id] returns 200 with the mcq`
- `GET /api/mcqs/[id] returns 404 when missing`
- `PUT /api/mcqs/[id] returns 200 with the updated mcq`
- `PUT /api/mcqs/[id] returns 400 on validation failure`
- `PUT /api/mcqs/[id] returns 404 when missing`
- `DELETE /api/mcqs/[id] returns 200 when deleted`
- `DELETE /api/mcqs/[id] returns 404 when missing`

Attempts:
- `POST /api/mcqs/[id]/attempts returns 201 with the attempt and uses the server isCorrect`
- `POST /api/mcqs/[id]/attempts returns 400 when choiceId is missing`
- `POST /api/mcqs/[id]/attempts returns 400 when the choice is invalid for that question`
- `POST /api/mcqs/[id]/attempts returns 404 when the question is missing`
- `GET /api/mcqs/[id]/attempts returns 200 with the attempt list`
- `GET /api/mcqs/[id]/attempts returns 404 when the question is missing`

**Implementation tasks** (after the tests are red):
1. Add Zod schemas for write bodies and attempt bodies
2. Implement the six route handlers
3. Keep handlers thin: parse, call the service, map errors to status codes

**Deliverables**:
- `src/lib/validations/mcq.ts` and `src/lib/validations/mcq.test.ts`
- `src/app/api/mcqs/route.ts` and `route.test.ts`
- `src/app/api/mcqs/[id]/route.ts` and `route.test.ts`
- `src/app/api/mcqs/[id]/attempts/route.ts` and `route.test.ts`

**Phase complete when**: Phase 1–3 tests and the identity suite pass.

### Phase 4: Frontend pages - COMPLETED

**Objective**: A teacher can list, create, edit, preview, and delete MCQs in the browser.

**Tests first (must fail before pages exist or call the APIs):**

Files:
- `src/app/mcqs/page.test.tsx` (rewrite stub cases; keep greeting + logout)
- `src/components/mcq-form.test.tsx`
- `src/app/mcqs/[id]/preview/page.test.tsx`

List (Testing Library + `userEvent`; mock `fetch` and `next/navigation`):
- `mcqs page greets the stored user when a display hint is present` (keep)
- `logout POSTs /api/auth/logout, clears the display hint, and navigates to /login` (keep)
- `mcqs page fetches GET /api/mcqs and renders name and description in a table`
- `mcqs page shows an empty state when there are no questions`
- `Create question navigates to /mcqs/new`
- `row actions menu exposes Edit, Preview, and Delete`
- `Edit navigates to /mcqs/[id]/edit`
- `Preview navigates to /mcqs/[id]/preview`
- `Delete confirms and DELETEs /api/mcqs/[id], then removes the row`

Form:
- `create form starts with two choice fields and no more than six`
- `Add choice adds a row until six, then is not available`
- `Remove is unavailable when only two choices remain`
- `Save on create POSTs /api/mcqs with name, description, and choices — not a client-computed score`
- `Save is not sent when name is empty or no correct choice is selected`
- `Save on edit PUTs /api/mcqs/[id] after loading GET /api/mcqs/[id]`
- `Cancel navigates to /mcqs without fetching a write`
- `form shows the server error on 400`

Preview:
- `preview loads the question and renders choices without announcing the correct answer`
- `submit POSTs /api/mcqs/[id]/attempts with the selected choiceId`
- `preview shows Correct or Incorrect from the server attempt, not from the loaded choices`
- `Back navigates to /mcqs`

**Implementation tasks** (after the tests are red):
1. Add shadcn `dropdown-menu` and `textarea`
2. Replace the `/mcqs` stub with the table workspace; keep logout and greeting
3. Shared `McqForm` for `/mcqs/new` and `/mcqs/[id]/edit`
4. Preview page that records an attempt
5. Delete confirm dialog

**Deliverables**:
- `src/app/mcqs/page.tsx` and updated `page.test.tsx`
- `src/components/mcq-list.tsx` (if extracted)
- `src/components/mcq-form.tsx` and `mcq-form.test.tsx`
- `src/app/mcqs/new/page.tsx`
- `src/app/mcqs/[id]/edit/page.tsx`
- `src/app/mcqs/[id]/preview/page.tsx` and `page.test.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/textarea.tsx`

**Phase complete when**: Phase 1–4 tests and the identity suite pass.

### Phase 5: Verification - COMPLETED

**Objective**: Prove list / create / edit / preview / delete work, including validation and missing-id cases. The unit suite stays green; browser checks cover what jsdom cannot.

**Tests first**: Do not add new product tests unless Phase 5 finds a gap. If a browser check fails because of missing coverage, write a failing Vitest case first, then fix production code.

**Results (2026-09-02)**:

| Check | Result |
|--------|--------|
| `npm test` | **122 passed** across 19 files (Vitest 3.2.7), including the identity suite |
| `npm run lint` | **Pass** after moving `/mcqs` list fetch `setState` into promise callbacks (`react-hooks/set-state-in-effect`) |
| `npm run build` | **Pass** (Next.js 16.2.12 Turbopack). New routes: `/mcqs/new`, `/mcqs/[id]/edit`, `/mcqs/[id]/preview`, `GET/POST /api/mcqs`, `GET/PUT/DELETE /api/mcqs/[id]`, `GET/POST /api/mcqs/[id]/attempts` |
| Local API | `GET /api/mcqs` → 200 `{ mcqs: [] }`; empty name `POST` → 400 `Name is required`; valid `POST` → 201 with generated ids |
| Local + production browser | User verified deploy and the authoring path at `https://aisprints-starter.quiz-maker-007.workers.dev` |

**Lint gaps found and fixed in this phase (not new product tests):**
1. `/mcqs` loaded the list via `useEffect(() => { void loadMcqs() })`. `loadMcqs` called `setState` at the start, which ESLint flags (`react-hooks/set-state-in-effect`). Fetch now runs in the effect and updates state only in `.then` / `.catch` / `.finally` callbacks.

**Deliverables**:
- Lint, build, and `npm test` passing
- Browser-verified happy path (local + production)

---

## Technical Implementation Details

### Environment (do not recreate)

| Item | Value |
|------|--------|
| Worker name | `aisprints-starter` |
| Production URL | `https://aisprints-starter.quiz-maker-007.workers.dev` |
| D1 binding | `DB` |
| D1 database name | `quizmaker-db` |
| D1 database id | `750d1dc9-93c7-4839-b76c-57cc8ca3c272` |
| Existing remote schema | `migrations/0001_create_users_table.sql` **already applied** |
| Display-hint key | `sessionStorage["quizmaker_user"]` — public user JSON only, **not auth** |

`0002` is applied locally. The Worker has been deployed. Do not re-apply `0001`. Do not re-apply `0002` remotely unless the production tables are missing.

### Key Files

- `migrations/0002_create_mcq_tables.sql` — `mcqs`, `mcq_choices`, `mcq_attempts` plus indexes
- `migrations/0002_create_mcq_tables.test.ts` — schema contract tests (read the SQL file; no live D1)
- `src/lib/types/mcq.ts` — public `Mcq` / `McqSummary` / `McqChoice` / `McqAttempt` vs D1 rows vs write input
- `src/lib/services/mcq-service.ts` — **only this module talks to D1 for MCQs**. `McqValidationError`, `McqNotFoundError`, `InvalidChoiceError`. Attempt `is_correct` is copied from the choice row
- `src/lib/services/mcq-service.test.ts` — mocked `prepare` / `bind` / `all` / `run` / `batch`
- `src/lib/validations/mcq.ts` — Zod write body (2–6 choices, exactly one correct) and `{ choiceId }`
- `src/lib/validations/mcq.test.ts`
- `src/app/api/mcqs/route.ts` — GET list, POST create
- `src/app/api/mcqs/[id]/route.ts` — GET / PUT / DELETE
- `src/app/api/mcqs/[id]/attempts/route.ts` — GET list, POST attempt
- `src/app/mcqs/page.tsx` — table workspace, greeting, logout, create, delete dialog
- `src/app/mcqs/page.test.tsx` — list, empty state, actions, logout (replaces the stub “no authoring” case)
- `src/components/mcq-form.tsx` — shared create/edit form
- `src/components/mcq-form.test.tsx`
- `src/components/mcq-row-actions.tsx` — three-dot menu (Edit / Preview / Delete)
- `src/app/mcqs/new/page.tsx` — Server Component shell + `McqForm`
- `src/app/mcqs/[id]/edit/page.tsx` — Server Component shell + `McqForm`
- `src/app/mcqs/[id]/preview/page.tsx` — take-the-question preview that POSTs an attempt
- `src/app/mcqs/[id]/preview/page.test.tsx`
- `src/components/ui/textarea.tsx` — shadcn-style textarea (hand-copied; CLI could not run against Pearson Nexus)
- `src/components/ui/dropdown-menu.tsx` — Base UI menu primitive (present; list actions use `mcq-row-actions` because the primitive did not open reliably under jsdom)

### Implementation Patterns

```typescript
// Handlers stay thin. D1 stays in the MCQ service.
const { env } = await getCloudflareContext();
const mcq = await createMcq(env.DB, parsed.data);
return NextResponse.json({ success: true, mcq }, { status: 201 });
```

```typescript
// Attempt correctness is copied from the stored choice, never from the request body.
const choice = await getChoiceForMcq(db, mcqId, choiceId);
const isCorrect = choice.is_correct === 1;
```

```typescript
// Numbered placeholders. Prefer all() + results[0]. Batch writes that span tables.
await db.batch([
  db.prepare(`INSERT INTO mcqs (name, description) VALUES (?1, ?2)`).bind(name, description),
  ...choiceStatements,
]);
```

### Important Notes

- `sessionStorage["quizmaker_user"]` is not a session. APIs do not check it.
- Choice `is_correct` is INTEGER in D1 and `boolean` in JSON (`isCorrect`).
- Preview must display the server `attempt.isCorrect`, not `choices.find(...).isCorrect`, so a forged response is the only way to lie and the client is not the source of truth for scoring.
- Replacing choices on update deletes prior attempts for those choice rows via CASCADE.
- Keep `tsconfig.json` `exclude` of `.next/dev`. Keep ESLint ignore of `.wrangler/**`.
- Ask before adding a new npm dependency. shadcn `add` copies source files and is expected.

---

## Acceptance Criteria

- [x] `/mcqs` lists all questions in a shadcn table with name, description, and an actions column
- [x] Create question opens a form with two choice fields; the teacher can add up to six and remove down to two
- [x] Save persists name, description, and choices through the MCQ service and returns the teacher to `/mcqs`
- [x] Edit loads the existing question and Save updates it
- [x] Cancel on create or edit returns to `/mcqs` without writing
- [x] Row actions dropdown offers Edit, Preview, and Delete
- [x] Delete asks for confirmation, then removes the question from the database and the table
- [x] Preview shows the stem and choices without revealing the correct answer until an attempt is submitted
- [x] Submitting a preview answer records an attempt whose `isCorrect` is decided on the server
- [x] Name empty, fewer than two choices, more than six choices, or not exactly one correct choice is rejected with 400
- [x] Missing id on get / update / delete / attempt returns 404
- [x] Logout on the list page still POSTs `/api/auth/logout`, clears the display hint, and navigates to `/login`
- [x] Identity tests remain green
- [x] `npm test`, `npm run lint`, and `npm run build` pass

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Authoring path works end to end | Create → list → edit → preview attempt → delete in one sitting | Local browser verification |
| Validation covers the choice rules | Empty name / 1 choice / 0 or 2 correct all 400 | Vitest + one browser check |
| Identity unchanged | Existing register / login / logout tests still pass | `npm test` |

---

## Dependencies

### External Dependencies

- Cloudflare D1 (`DB` / `quizmaker-db`) — persistence
- shadcn/ui (Base UI, `base-nova`) — table, button, dropdown-menu, dialog, field, input, textarea, card

### Internal Dependencies

- `src/lib/auth-client.ts` — list-page greeting and logout only
- `src/app/api/auth/logout` — unchanged logout contract
- Identity `users` table — must not be modified

### Environment variables

None new. Do not add secrets for this sprint.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: Treating `sessionStorage` as auth and scoping MCQs to a forged user id
- **Mitigation**: No `user_id` column. APIs are openly list/create/update/delete. Call this out; real auth is a later sprint

- **Risk**: Client sends `isCorrect` on an attempt and the server trusts it
- **Mitigation**: Attempt body is only `{ choiceId }`. Service copies correctness from `mcq_choices`

- **Risk**: Updating choices CASCADE-deletes attempt history
- **Mitigation**: Documented v1 behavior. Do not add soft delete in this sprint

- **Risk**: Foreign keys ignored if D1 does not enforce them
- **Mitigation**: Service still verifies the choice belongs to the MCQ before inserting an attempt

### User Experience Risks

- **Risk**: Teachers lose work if Cancel is unclear
- **Mitigation**: Cancel always returns to `/mcqs` without a write. No autosave

- **Risk**: Preview looks like a scored student exam
- **Mitigation**: Copy presents it as a preview. Correctness still comes from a real attempt row so the attempts table is exercised

---

## Troubleshooting Guide

### List fetch trips `react-hooks/set-state-in-effect`
**Problem**: `npm run lint` fails on `/mcqs` when a helper called from `useEffect` sets React state immediately.
**Cause**: The helper started with `setLoadError(null)` / `setIsLoading`, which runs synchronously in the effect body.
**Solution**: Call `fetch` inside the effect and set state only in promise callbacks.
**Code Reference**: `src/app/mcqs/page.tsx:31`

### Base UI dropdown does not open under jsdom
**Problem**: Clicking the actions trigger left `aria-expanded="false"` and no `menuitem` in Testing Library.
**Cause**: `@base-ui/react/menu` + Floating UI portal positioning is unreliable in jsdom.
**Solution**: Row actions use a `Button` plus a portaled `role="menu"` in `mcq-row-actions.tsx`. The shadcn `dropdown-menu` primitive remains in the repo for later.
**Code Reference**: `src/components/mcq-row-actions.tsx:1`

### shadcn CLI cannot add components
**Problem**: `npx shadcn@latest add @shadcn/dropdown-menu` 401s against Pearson Nexus or fails with `ECOMPROMISED`.
**Cause**: The machine npm config points at a private registry.
**Solution**: Hand-copy `textarea` and `dropdown-menu` using existing `src/components/ui` tokens. Retry with `--registry https://registry.npmjs.org/` if needed. Do not change the user's global npm config.

### Choice labels collide in form tests
**Problem**: `getByLabelText(/choice 1/i)` matches both the text field and the “Correct answer for choice 1” radio.
**Cause**: The radio’s `aria-label` also contains “choice 1”.
**Solution**: Query `getByRole("textbox", { name: /^choice 1$/i })` and `getByRole("radio", { name: /correct answer for choice 2/i })`.
**Code Reference**: `src/components/mcq-form.test.tsx:46`

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading the Problem and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries — do not build out-of-scope items
3. Update phase status markers as work progresses
4. Add implementation details under "Technical Implementation Details" as code is written
5. Mark acceptance criteria as complete when features work
6. Add troubleshooting entries when bugs are found and fixed
7. Keep all sections current — remove outdated information
8. Use code references format: `filepath:line-number` when citing code
9. Do not rebuild identity or this MCQ CRUD sprint. Do not re-apply `0001` or `0002` unless the tables are missing
10. Follow `.cursor/rules/d1.mdc`, `.cursor/rules/shadcn.mdc`, `.cursor/rules/nextjs.mdc`, and `.cursor/skills/testing/SKILL.md`

---

## Current Status

**Last Updated**: 2026-09-02
**Current Phase**: Phase 5 - Verification
**Status**: COMPLETED
**Next Steps**: Later sprints can add real server auth and attach questions to a teacher. Do not treat `sessionStorage` as a grant of access.
