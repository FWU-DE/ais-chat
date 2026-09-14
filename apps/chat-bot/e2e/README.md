# E2E Testing

This folder contains test files and utils for running e2e and api tests.
For e2e tests we use [playwright](https://playwright.dev/).

## Mock LLM

Most e2e tests use a local mock Azure/OpenAI Responses-compatible server (`services/mock-llm/`)
as the default text model instead of calling real LLMs. The mock server streams deterministic SSE
responses and can be controlled with `MOCK_LLM_COMMANDS` to trigger tool calls.

Seeded e2e models are routed through Bifrost, including the mock models. Make sure Bifrost is
running and `BIFROST_ADMIN_URL`, `BIFROST_ADMIN_USERNAME`, and `BIFROST_ADMIN_PASSWORD` are
configured when seeding so the mock provider key is synced.
For local Docker Compose runs, leave `LLM_MOCK_BASE_URL` unset or set it to `http://mock-llm:6556`;
the URL must be reachable from the Bifrost container, not from the host.

### Starting the mock LLM locally

Use the local Docker Compose setup which includes the mock server.

### External-services tests

Tests in `tests/external-services/` are intentionally excluded from the mock and always run against real LLMs.
They are skipped from the chromium/firefox test projects and must be run separately.

## Run e2e tests

Make sure that there is a `.env.local` file that contains the configuration necessary for the tests to run.

Ensure that all the required browsers are installed.

```sh
pnpm playwright install
```

Then you can run the e2e tests from the apps/chat-bot directory.

1. `pnpm e2e` - This runs all tests in headless mode without a visible browser.
2. `pnpm e2e:headed` - This runs the tests in a visible browser.
3. `pnpm e2e:ui` - This starts the playwright ui for the e2e tests.
4. `pnpm e2e:api` - This runs the api tests.
5. `pnpm e2e:api:ui` - This starts the playwright ui for the api tests.

### Run tests in vscode

In order to run tests directly in vscode, the extension `Playwright Test for VSCode` is recommended.
The extension provides a `Test Explorer` available through the `Testing` icon on the left menu bar.
Run or debug a test directly from here.

# Load Testing

## Run load tests locally

If you want to run load tests, you need to install `k6`.
Follow the instructions at https://grafana.com/docs/k6/latest/set-up/install-k6

Ensure that all the required browsers are installed.

```sh
pnpm playwright install
```

Set the username and password for the load test user in the .env.local file

```dotenv
LOADTEST_PASSWORD=test
LOADTEST_USERNAME=test
```

Then you can run the load tests from the directory apps/chat-bot.

This runs the tests in a visible browser:

```sh
pnpm k6:build && K6_BROWSER_HEADLESS=false k6 run e2e/load_test/run-chat-test.js -e LOADTEST_PASSWORD=test -e LOADTEST_USERNAME=test
```

or

```sh
pnpm k6:build && K6_BROWSER_HEADLESS=false k6 run e2e/load_test/run-file-test.js -e LOADTEST_PASSWORD=test -e LOADTEST_USERNAME=test
```

This runs the tests in headless mode without a visible browser:

```sh
pnpm k6:build && K6_BROWSER_HEADLESS=true K6_BROWSER_ARGS='no-sandbox' k6 run e2e/load_test/run-chat-test.js
```

or

```sh
pnpm k6:build && K6_BROWSER_HEADLESS=true K6_BROWSER_ARGS='no-sandbox' k6 run e2e/load_test/run-file-test.js
```

## Run load tests in Grafana Cloud K6

```sh
cd apps/chat-bot
k6 cloud login
```

Run load tests locally:

```sh
pnpm k6:run e2e/load_test/run-chat-test.js
pnpm k6:run e2e/load_test/run-file-test.js
```

Or run on the Grafana Cloud.
Remember to export env variables in the same shell before running `pnpm k6:run:cloud`.

```sh
export LOADTEST_BASE_URL=https://app-staging.ais-chat.schule
export LOADTEST_IDP_HINT=telli-chatbot
export LOADTEST_PASSWORD=your-password
export LOADTEST_USERNAME=your-user
pnpm k6:run:cloud e2e/load_test/run-chat-test.js
pnpm k6:run:cloud e2e/load_test/run-file-test.js
```
