# AGENTS.md

Instructions for AI agents working in this repository. This file is loaded into every
agent conversation, so it describes only what is stable and true of the project.

## Project

QuizMaker is a greenfield app for teachers who will later collaborate on an MCQ test bank.
**Identity is shipped**: register, login, and logout against Cloudflare D1. There is no
MCQ authoring yet. `/mcqs` is a stub (greeting + logout).

The technical PRD in `ai-workspace/register-login-logout_prd.md` is the source of truth
for the completed identity sprint. Write a **new** PRD before starting MCQ work. Do not
treat `sessionStorage["quizmaker_user"]` as authentication.

## Stack

- **Next.js 16** with the App Router and React 19
- **Cloudflare Workers** for hosting, via `@opennextjs/cloudflare`
- **Cloudflare D1** bound as `DB` (`quizmaker-db`, id `750d1dc9-93c7-4839-b76c-57cc8ca3c272`)
- **Tailwind CSS v4**, configured in CSS rather than a JS config file
- **shadcn/ui** on Base UI, `base-nova` style, with Lucide icons
- **TypeScript** in strict mode
- **Zod** for request validation
- **bcryptjs** (salt rounds 10) for `users.password_hash`; client SHA-256 before POST
- **Vitest 3** + Testing Library + jsdom (`npm test`)
- **Wrangler** for Cloudflare configuration, secrets, and deployment

Ask before adding a new dependency. Do not bump `@vitejs/plugin-react` to v6 (needs Babel 8).
Pin stays at `@vitejs/plugin-react@4`.

## Layout

```
src/app/            Routes, layouts, and global styles (App Router)
src/app/api/auth/   Register, login, logout route handlers
src/components/     Feature UI (`login-form`, `signup-form`) plus `ui/`
src/components/ui/  shadcn/ui components (generated; avoid hand-editing)
src/lib/            Shared utilities and services (`services/user-service.ts`)
migrations/         D1 SQL (`0001_create_users_table.sql` already applied local + remote)
ai-workspace/       Technical PRDs and planning documents
.cursor/rules/      File-scoped conventions
.cursor/skills/     Task-specific guidance loaded on demand
public/             Static assets
```

Import through the `@/` alias, which maps to `src/`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on Node at `localhost:3000` |
| `npm run preview` | Build and run on the local **Workers** runtime |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest once (`vitest run`) |
| `npm run test:watch` | Vitest watch |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing bindings |

`npm run dev` runs on Node and will not surface Workers-specific problems. Verify
anything runtime-sensitive with `npm run preview`.

Production Worker (already deployed for identity):
`https://aisprints-starter.quiz-maker-007.workers.dev`

## Working agreements

- **Do not deploy.** Never run `npm run deploy` unless explicitly asked.
- **Do not touch the remote database unless asked.** New migrations: `--local` first.
  `0001_create_users_table` is already applied remotely. Do not re-apply it.
- **Ask before adding a dependency.** This is a teaching repository; an unexplained
  dependency is a cost. Propose it and say why.
- **Do not edit generated files.** `cloudflare-env.d.ts`, `next-env.d.ts`, and
  `package-lock.json` are generated.
- **Keep secrets out of the repo.** Local values belong in `.dev.vars`, which is
  gitignored. When adding a variable, also add an empty placeholder to
  `.dev.vars.example`. Production values go in `wrangler secret put`.
- **Verify before claiming completion.** Run `npm run lint` and `npm run build` and
  report the actual result. Do not describe work as done based on inspection alone.
- **Say when you are unsure.** A flagged uncertainty is more useful than a confident
  guess that has to be unwound later.
- Keep `tsconfig.json` `exclude` of `.next/dev` (corrupt generated `routes.d.ts` breaks build).
- Keep ESLint ignore of `.wrangler/**` (generated bundles).
- If `npm install` 401s against Pearson Nexus, retry that command with
  `--registry https://registry.npmjs.org/`. Do not change the user's global npm config.

## Cursor Cloud specific instructions

Cloud agents have no Cloudflare credentials and no `.dev.vars`. In that environment:

- `npm run dev`, `npm run build`, and `npm run lint` work normally.
- `npm run preview`, `npm run deploy`, and any `wrangler` command that needs
  authentication will fail. This is expected. Do not try to authenticate.
- If a task genuinely requires Cloudflare access, stop and report that it must be run
  locally instead.
