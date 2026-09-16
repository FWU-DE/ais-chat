# AGENTS.md

This file provides comprehensive guidance for coding agents working in the `ais-chat` repository.

## Purpose

Help coding agents ship safe changes quickly in the `ais-chat` monorepo (TypeScript + Turborepo). Follow repository conventions and concrete patterns in existing code.

## Documentation Index

- **[README.md](README.md)** — Setup instructions, quick start, local development, Docker usage
- **[docs/structure.md](docs/structure.md)** — Detailed project structure and directory purpose
- **[apps/chat-bot/e2e/README.md](apps/chat-bot/e2e/README.md)** — E2E and load testing guide
- **[SECURITY.md](SECURITY.md)** — Security issue reporting
- **[packages/ui/README.md](packages/ui/README.md)** — shadcn/ui component library usage

## Documentation Guardrails

### Non-authoritative architecture snapshots

- The files under `docs/current_architecture/` are snapshot documentation and can be incomplete or outdated.
- Do not use `docs/current_architecture/*` as factual context for implementation decisions, bug fixes, or code generation.
- For implementation work, always derive architecture facts from code in `apps/*`, `packages/*`, migrations, and runtime configuration.

### Manual update trigger only

- Update `docs/current_architecture/*` only when the user explicitly asks to update architecture documentation.
- Never update these files opportunistically during unrelated coding tasks.
- When updating, verify statements against current code and schema before editing.

## Tech Stack

TypeScript monorepo (Turborepo + pnpm) with:

- **Frontend**: Next.js 16 App Router, React Server Components, TailwindCSS, shadcn/ui
- **Backend**: Fastify API with OpenAPI/Swagger at `/docs`
- **Databases**: Two separate PostgreSQL databases (see Architecture section)
- **Auth**: Keycloak | **Cache**: Valkey | **Storage**: S3-compatible (RustFS/OTC)
- **Testing**: Vitest (unit), Playwright (e2e)
- **Observability**: Sentry + OpenTelemetry

## Architecture

### Monorepo Layout

- `apps/*` — Deployable applications (chat-bot, admin, api)
- `packages/*` — Shared libraries, defined in `pnpm-workspace.yaml`
- User-facing apps: `apps/chat-bot` (main product), `apps/admin` (configuration UI)
- Backend: `apps/api` — Fastify (`src/app.ts`, `src/handlers.ts`) exposing `/v1/*` and `/docs`

### Two Database Architecture

**Critical insight**: Two separate PostgreSQL databases with different purposes:

1. **App/Admin DB** (`packages/shared/src/db/`)
   - Used by: `apps/chat-bot/` and `apps/admin/`
   - Connection: `DATABASE_URL`
   - Migrations + seed in `packages/shared/src/db/`

2. **API DB** (`packages/api-database/`)
   - Used by: `apps/api/`
   - Connection: `API_DATABASE_URL`
   - Schema in `schema.ts`, seed in `seed.ts`

### AI Request Flow

UI/apps → shared services → `@ais-chat/ai-core` → knotenpunkt → `${env.apiUrl}/v1/models`

Key file: `packages/shared/src/knotenpunkt/index.ts`

### Critical Patterns

- **Fastify validation**: Implicit validation is **disabled** in `apps/api/src/app.ts` — always validate with Zod schemas
- **Business logic placement**: Keep logic in services (`packages/shared/src/**/*.ts`), not routes/components
- **Cross-app utilities**: Framework-agnostic code goes in `packages/shared-core/src`
- **Component reuse**: Check `packages/ui/` (shadcn/ui) before creating custom components

## Developer Workflows

### Initial Setup

```sh
nvm use && corepack enable && corepack prepare && pnpm i
```

### Running Applications

```sh
pnpm dev                 # Run all apps (Turbo)
pnpm dev:chat-bot        # Run chat-bot only
pnpm dev:admin           # Run admin only
pnpm dev:api             # Run API only
```

### Database Management

**Both databases required:**

```sh
pnpm db:migrate          # Migrate both databases
pnpm db:generate         # Generate migration (run in specific package)
pnpm db:seed             # Seed both databases (requires API keys + LLM credentials in .env.local)
```

**Database change workflow:**

1. Identify target: `packages/shared` (app/admin) vs `packages/api-database` (API)
2. Update schema in correct package
3. Generate migration: `pnpm db:generate` in that package
4. Apply: `pnpm db:migrate` from root

### Quality Gates (Always Run After Changes)

```sh
pnpm format && pnpm lint && pnpm check-types && pnpm test
```

**Critical**: Check exit codes (0 = success, non-zero = error). Turbo cache may show "successful" even when packages failed.

### Testing

```sh
pnpm test                           # Unit tests (Vitest)
cd apps/chat-bot && pnpm e2e        # E2E tests (Playwright)
```

**Testing policy**: Only write tests when user asks for them.

### Docker Infrastructure

```sh
docker compose -f devops/docker/docker-compose.local.yml up -d  # Local services
docker compose -f devops/docker/monitoring.yml up -d            # Observability stack
```

- `devops/docker/docker-compose.yml` is the self-hosted Compose file (see README.md); do not call it "production" or "standalone compose".
- `devops/docker/docker-compose.local.yml` is the local development Compose file.

### Verification Process

After making any file changes:

1. Run quality gates: `pnpm format && pnpm lint && pnpm check-types && pnpm test`
2. **Always check exit codes**: 0 = success; non-zero = error
3. **Do not rely on summary messages**: Turbo cache may show "successful" when packages failed
4. Treat issues as blocking — fix problems before finishing
5. If verification cannot run (missing deps, env issues), clearly report that

### Git Conventions

- **Jira tickets**: Use the `TD-<number>` format (for example, `TD-1234`). For ticket-based work without an identifier, ask the user for it unless they explicitly ask to work without a ticket.
- **Branches**: For ticket-based work, use `feat/TD-<number>-<description>`. When the user explicitly requests ticketless work, use a work-type prefix and concise description, such as `feat/sidebar-shadow`, `fix/arbitrary-redirect`, or `chore/fix-formatting`.
- **Prefix all commits with JIRA ticket**: `TD-1234: Concise summary`
- **Keep commit messages concise**: Short subject line, optional body if needed

## Pull Requests

- Write concise PR descriptions: 1-3 short paragraphs explaining what changed and why. Use the final changeset of the PR, to get an overview.
- Avoid formal section headings; keep it simple and direct.
- PRs must always be opened as draft

## Code Conventions

### General Principles

- TypeScript only; keep modules small and explicit
- Prefer clean, readable, maintainable code over clever solutions
- Follow modular architecture and keep files small
- Avoid code duplication

### Naming Conventions

- `camelCase` for variables and functions
- `PascalCase` for classes and interfaces
- `UPPER_SNAKE_CASE` for constants

### Comments

- Write comments only when intent is not obvious or for reusable functions/components
- Prefer self-explanatory code over excessive comments
- Comments are written in English

### Server Actions

All server actions must use `runServerAction` from `@shared/actions/run-server-action` — it handles error serialization and Sentry instrumentation.
Auth runs **before** `runServerAction` so navigation errors (e.g., redirect to login) propagate naturally without being caught by the error handler:

```typescript
export async function createNewAssistantAction({
  templateId,
  duplicateAssistantName,
}: {
  templateId?: string;
  duplicateAssistantName?: string;
}) {
  const { user } = await requireAuth();
  return runServerAction(
    'createNewAssistantAction',
    createNewAssistant,
  )({
    templateId,
    user,
    duplicateAssistantName,
  });
}
```

### Service Boundaries and File Placement

- **Business logic**: Keep in services (`packages/shared/src/**/*.ts`), not routes/components
- **Cross-app utilities**: Framework-agnostic code in `packages/shared-core/src`
- **Example pattern**: `apps/admin/src/app/.../actions.ts` performs auth/validation, delegates to `apps/admin/src/services/*`

**Component file organization**:

```
apps/<app_name>/src/components/        # App-specific use case components
apps/<app_name>/src/components/common/ # Reusable UI components
apps/<app_name>/src/components/hooks/  # Custom hooks
apps/<app_name>/src/components/utils/  # Custom utility functions
```

### React and UI Components

- **Prefer React Server Components**; add client components only for state/events/browser APIs
- Keep components small and reusable
- **Prefer composition over complex props**
- Use shadcn components from `@ais-chat/ui` before creating custom UI components
- Follow shadcn patterns for accessibility and responsiveness

**Always ensure**:

- Components are accessible (ARIA, keyboard navigation)
- Components are responsive (mobile, tablet, desktop)
- Cross-browser compatibility
- All text content is internationalized and can be easily translated

### State Management

- Prefer React hooks
- Keep state close to where it is used
- Avoid global state unless necessary

### Error Handling

- Use try-catch blocks to handle exceptions

### Logging (Never Console)

**DO NOT use `console.*`** in application code:

- **Next.js apps**: Use `packages/shared/src/logging/logging.ts`
- **API**: Use `apps/api/src/logger.ts`

### Internationalization

**All UI text must be internationalized** — chat-bot uses `next-intl`

Example: See `apps/chat-bot/src/components/**` for `useTranslations(...)` pattern

### Validation

- Fastify's implicit validation is **disabled** in `apps/api/src/app.ts`
- Always validate API requests with Zod schemas

## Integrations and Operational Context

- **Auth**: Keycloak (local realm in `devops/docker/keycloak/ais-chat-local-realm.json`)
- **Session/cache**: Valkey from local docker compose
- **Storage**: S3-compatible RustFS/OTC vars (`OTC_*` in `turbo.json` globalEnv)
- **Observability**: Sentry + OpenTelemetry across apps/packages (see dependencies and `turbo.json` envs)

## Agent Execution Checklist

Before starting:

1. Identify target layer: `apps/*` vs `packages/*`
2. Identify affected database: `packages/shared` (app/admin) vs `packages/api-database` (API)

During implementation:

3. Keep business logic in services, not routes/components
4. Prefer minimal, composable changes that follow existing file/feature structure
5. If schema changes needed:
   - Update correct package (`packages/shared` or `packages/api-database`)
   - Generate migration: `pnpm db:generate` in that package
   - Apply: `pnpm db:migrate` from root

After changes:

6. Run quality gates: `pnpm format && pnpm lint && pnpm check-types && pnpm test`
7. Check exit codes (0 = success), not summary messages
8. Treat failures as blocking — fix problems before finishing
