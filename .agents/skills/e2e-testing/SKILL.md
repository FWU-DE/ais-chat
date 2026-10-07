---
name: e2e-testing
description: Generate, update, or debug Playwright end-to-end tests for the ais-chat-app monorepo. Use this when asked to create e2e tests, update existing e2e tests, or write integration tests using Playwright.
---

# E2E Test Generation for ais-chat-app

You are an expert at writing Playwright end-to-end tests for this monorepo. Follow these instructions carefully.

## Project Structure

This is a pnpm monorepo with three apps:

| App                 | Path             | E2E location                                          | Playwright config                                      |
| ------------------- | ---------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| chat-bot (main app) | `apps/chat-bot/` | `apps/chat-bot/e2e/`                                  | `apps/chat-bot/playwright.config.ts`                   |
| api                 | `apps/api/`      | `apps/api/e2e/`                                       | `apps/api/playwright.config.ts`                        |
| admin               | `apps/admin/`    | _(no e2e tests yet — create under `apps/admin/e2e/`)_ | _(create `apps/admin/playwright.config.ts` if needed)_ |

E2E tests for the **chat-bot** and **api** apps are already established. For **admin**, if asked to create e2e tests, mirror the existing structure and patterns.

## Chat-Bot E2E Folder Layout

```
apps/chat-bot/e2e/
├── global-setup.ts      # Runs once before all tests — logs in each user and saves auth state
├── fixtures/            # Test fixture files (e.g. images for upload)
├── utils/               # Shared test helpers (login, chat, character, etc.)
│   ├── authorizationHeader.ts
│   ├── character.ts
│   ├── chat.ts
│   ├── const.ts
│   ├── assistant.ts
│   ├── learning-scenario.ts
│   ├── login.ts
│   ├── mock.ts
│   ├── random.ts
│   └── utils.ts
└── tests/               # Test files, organized by feature
    ├── api/             # API-level tests (*.api.test.ts)
    ├── character/
    ├── custom-gpt/
    ├── generic-chat/
    ├── image-generation/
    ├── learning-scenarios/
    ├── teacher-login.test.ts
    ├── template-elements-visible.test.ts
    └── user-access.test.ts
```

## API App E2E Folder Layout

The API app has its own e2e tests that test the REST API endpoints directly (no browser). Tests use Playwright's `request` API context.

```
apps/api/e2e/
├── utils/
│   └── api.ts               # Auth header & base URL helpers
└── tests/                   # API endpoint tests (*.api.test.ts)
    ├── health.api.test.ts
    ├── chat-completions.api.test.ts
    ├── embeddings.api.test.ts
    ├── image-generations.api.test.ts
    ├── models.api.test.ts
    └── usage.api.test.ts
```

### API App Playwright Config

See `apps/api/playwright.config.ts` for configuration details.

### API App Utilities (`apps/api/e2e/utils/api.ts`)

See the exported functions and constants in `apps/api/e2e/utils/api.ts` for available helpers (auth headers, model lookup utilities, etc.).

### API App Test Patterns

API tests use Playwright's `request` fixture (no `page`). Every endpoint test should include:

1. **Auth check** — verify 401 without authentication
2. **Validation check** — verify 400 for invalid request bodies
3. **Happy path** — verify correct response shape and status

```typescript
import { test, expect } from '@playwright/test';
import { authorizationHeader } from '../utils/api.js';

test.describe('POST /v1/some-endpoint', () => {
  test('returns 401 without authentication', async ({ request }) => {
    const response = await request.post('/v1/some-endpoint', {
      data: {/* valid body */},
    });
    expect(response.status()).toBe(401);
  });

  test('returns 400 for invalid request body', async ({ request }) => {
    const response = await request.post('/v1/some-endpoint', {
      headers: authorizationHeader,
      data: { invalid: 'body' },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('returns expected response', async ({ request }) => {
    const response = await request.post('/v1/some-endpoint', {
      headers: authorizationHeader,
      data: {/* valid body */},
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Assert response shape
  });
});
```

**Dynamic model selection** — use the utility functions in `apps/api/e2e/utils/api.ts`:

```typescript
import { getTextModel, getEmbeddingModel, getImageModel } from '../utils/api.js';

const textModel = await getTextModel(request);
const embeddingModel = await getEmbeddingModel(request);
const imageModel = await getImageModel(request);
```

These throw if no matching model is found, keeping tests consistent.

### Running API App Tests

From `apps/api/`:

```sh
pnpm e2e          # run all API e2e tests
```

## Conventions & Patterns

### Imports

Always import from `@playwright/test`:

```typescript
import { expect, test } from '@playwright/test';
```

Import helpers with relative paths from the `utils/` directory:

```typescript
import { AUTH_FILES } from '../utils/const'; // top-level tests
import { AUTH_FILES } from '../../utils/const'; // nested tests (e.g. character/)
import { sendMessage } from '../../utils/chat';
import { waitForToast } from '../../utils/utils';
```

### Login / Authentication

Browser tests use **pre-authenticated storage state** instead of logging in during each test.
The `global-setup.ts` runs once before all tests — it logs in for each user in `AUTH_FILES` and saves the resulting cookies and localStorage to `.playwright-auth/<user>.json`.

To apply an auth state to a test file, add `test.use()` at the top of the file, or inside a `test.describe` block:

```typescript
import { AUTH_FILES } from '../utils/const'; // adjust depth as needed

test.use({ storageState: AUTH_FILES.teacher });
```

Available users: `teacher`, `teacher2`

With `storageState` set, tests can navigate directly to the page under test — no login step needed:

```typescript
test('can create a character', async ({ page }) => {
  await page.goto('/characters');
  // ...
});
```

The `.playwright-auth/` directory is git-ignored and regenerated automatically before each `playwright test` invocation.

> **Prefer not to call `login()` directly in tests.**
> The `login()` function should only be used when a new session is necessary (e.g., for changed federal state config).

### Test file naming

- **Browser e2e tests**: `<feature-name>.test.ts` (e.g. `create-character-chat.test.ts`)
- **API tests**: `<feature-name>.api.test.ts` (e.g. `costs.api.test.ts`)

API tests are matched by the Playwright config via `testMatch: /.*api.test.ts/` and run in a separate project without a browser.

### Test organization

- Group related tests in a `test.describe()` block with a descriptive name.
- Use `test.beforeEach()` for setup that varies per test (e.g. generating unique names).
- Use `nanoid` for generating unique identifiers to avoid test collisions:

```typescript
import { nanoid } from 'nanoid';
const characterName = 'My Character ' + nanoid(8);
```

### Existing utility functions

**Always reuse existing helpers** instead of reimplementing their logic. Check the utility files in `apps/chat-bot/e2e/utils/` and `apps/api/e2e/utils/` for available helpers — each function is documented with JSDoc comments.

Key utility files:

- `utils/login.ts` — Login via Keycloak
- `utils/const.ts` — `AUTH_FILES` map of user → storage state file path for pre-authenticated sessions
- `utils/chat.ts` — Chat message sending, regeneration, file upload, deletion
- `utils/character.ts` — Character CRUD
- `utils/assistant.ts` — Assistant CRUD
- `utils/learning-scenario.ts` — Learning scenario CRUD
- `utils/utils.ts` — Toast notifications, general helpers
- `utils/mock.ts` — Mock data generators for API tests
- `utils/random.ts` — Random string generation
- `utils/authorizationHeader.ts` — Bearer token header

If existing helpers don't cover the needed interaction, create a **new utility function** in the appropriate file inside `utils/`, or create a new utils file if the feature is new.

### Locator strategy

Follow Playwright best practices. Prefer these locator strategies **in order**:

1. **Test ID** — `page.getByTestId('...')` — most stable, specific to tests
2. **Role-based** — `page.getByRole('button', { name: '...' })`
3. **Label-based** — `page.getByLabel('...')`
4. **Text-based** — `page.getByText('...')`
5. **CSS selectors** — use only as a last resort

The UI is in **German**. Use German text for button names, labels, headings, and toast messages.

### Assertions

- Use `expect(locator).toBeVisible()` for visibility checks.
- Use `expect(locator).toContainText('...')` for content checks.
- Use `await page.waitForURL('/expected-path')` after navigation.
- Use `.toBeVisible({ timeout: 30000 })` for operations that may take longer (e.g. AI responses, image generation).

### Common patterns

**Navigate, create, verify, clean up:**

```typescript
import { AUTH_FILES } from '../../utils/const';

test.use({ storageState: AUTH_FILES.teacher });

test.describe('feature lifecycle', () => {
  const name = 'Test Item ' + nanoid(8);

  test('create item', async ({ page }) => {
    await page.goto('/feature-page');
    // fill form
    // submit
    // verify item appears
  });

  test('delete item', async ({ page }) => {
    await page.goto('/feature-page');
    // delete the item
    // verify it's gone
  });
});
```

**Chat interaction:**

```typescript
await sendMessage(page, 'Your question here');
// Wait for streaming to finish before asserting
await page.getByTestId('streaming-finished').waitFor({ state: 'attached', timeout: 30000 });
await expect(page.getByLabel('assistant message 1')).toContainText('expected content');
```

**API tests (no browser):**

```typescript
import test, { expect } from '@playwright/test';
import { db } from '@shared/db';
import { someTable } from '@shared/db/schema';

test.describe('api feature', () => {
  test('should do something', async () => {
    // Direct DB operations and function calls
    const mock = mockUserAndContext();
    await db.insert(someTable).values({ ... });
    const result = await someFunction(mock);
    expect(result).toBe(expected);
  });
});
```

### Database access in tests

API tests can import from `@shared/db` and `@shared/db/schema` to read/write test data directly. Use `drizzle-orm` operators like `eq`, `and`, `inArray` for queries.

### Configuration

See `apps/chat-bot/playwright.config.ts` for the chat-bot app's Playwright configuration.

### Running tests

From `apps/chat-bot/`:

```sh
pnpm e2e          # headless
pnpm e2e:headed   # visible browser
pnpm e2e:ui       # Playwright Test UI
pnpm e2e:api      # API tests only
pnpm e2e:smoke    # only tests tagged @smoke (run in the PR pipeline)
```

PRs run only `@smoke` tests (chromium, mock LLM). Pushing to `main` (i.e. merging a PR) runs the full regression suite (all tests, including firefox and real LLMs); regression can also be triggered manually via the workflow's `workflow_dispatch` input. Tag a new test with `{ tag: '@smoke' }` only for core user journeys that use the mock LLM and run in chromium.

## When creating tests for the admin app

The admin app has no e2e setup yet. If asked to create e2e tests:

1. Create the folder structure mirroring `apps/chat-bot/e2e/` or `apps/api/e2e/` (i.e. `e2e/tests/`, `e2e/utils/`).
2. Create a `playwright.config.ts` adapted for the admin app's port and test directory.
3. Reuse patterns and conventions from chat-bot and api tests.
4. Add e2e scripts to the app's `package.json` (e.g. `"e2e": "playwright test"`).
5. Document what you created.

## Checklist before finishing

- [ ] Tests import from `@playwright/test` and use the existing utility helpers.
- [ ] `test.use({ storageState: AUTH_FILES.<user> })` is set at the top of every browser test file — no `login()` calls inside tests.
- [ ] New utility functions are added to `utils/` and exported, not inlined in tests.
- [ ] Tests use TestIds when available and fall back to German UI text for locators (button names, labels, headings).
- [ ] Tests clean up after themselves (delete created entities).
- [ ] Unique identifiers use `nanoid` to avoid collisions.
- [ ] API test files are named `*.api.test.ts`.
- [ ] Test file is placed in the correct subdirectory under `e2e/tests/`.
- [ ] No hardcoded waits — use Playwright auto-waiting, `waitForURL`, or `expect().toBeVisible()`.
