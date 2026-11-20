# Local Environment

## Where an env var goes

- Working local default in `apps/<app>/.env.development` (tracked). Dummy secrets only; shared values like `API_KEY` and `ENCRYPTION_KEY` are identical across apps.
- Documented in `apps/<app>/.env.example`, including vars that also have a default.
- Validated in the zod env module of the app or package and listed in `turbo.json` `globalEnv`.
- Real secrets and personal overrides only in `apps/<app>/.env.local` (gitignored). Never put real secrets in git.

## Loading precedence

Highest to lowest: process env, `.env.local`, `.env.development`.

- chat-bot and admin: Next.js loads `.env.local` and `.env.development` (plus `.env`).
- api: `apps/api/src/load-env.ts` loads `.env.development`, then `.env.local` with `override: true`.
- db scripts and e2e scripts: `dotenvx run -f .env.local -f .env.development`, first file wins.

Process env set by CI beats every file, so CI is unaffected by new defaults unless the var is missing from the job env. Do not add vars to `.env.development` that switch behavior on (e.g. `DB_CACHE_TTL_SECONDS`, `SENTRY_*`). Avoid `$` in values, dotenvx and compose `env_file` interpolate it.

## Dev scripts

chat-bot and admin run `dotenvx run -f .env.local -f .env.development -- next dev --turbo`. `next dev` reads `PORT` before it loads any env file, so dotenvx has to inject it beforehand. `PORT` exported in the shell beats both files.

`NEXTAUTH_URL` and `AUTH_URL` must not be set: next-auth uses them to override the request origin, which pins the admin's auth callbacks to one port.

## Scheduled tasks

The local `scheduled-tasks` container reads `API_KEY` and `PORT` from `apps/chat-bot/.env.development`, overridden by `.env.local`.

## Local ports

`pnpm dev:ports` writes free, OS-assigned ports into `apps/*/.env.local`, e.g. for a second git worktree: `PORT` and `API_URL` for chat-bot, `PORT`, `API_URL` and `CHAT_BOT_BASE_URL` for admin, `PORT` for api. Other lines are untouched. Delete the keys to return to 3000 / 3001 / 3002.

Without it, Playwright uses the `.env.development` ports and reuses any server already listening there.

Known limitations:

- Worktrees share one docker stack and the `app_db` / `api_db` databases.
- Keycloak backchannel logout is pinned to port 3000.
- Auth cookies are not port-scoped on `localhost`, so a login in one copy replaces the session of another.
- The single `scheduled-tasks` container targets the chat-bot named in `.env.development` / `.env.local`.
- RustFS allows any CORS origin locally.
