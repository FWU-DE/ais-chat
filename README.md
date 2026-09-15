# AIS.chat

## Self-Hosted / Quick Start

This guide helps you run AIS.chat using pre-built Docker images with minimal configuration.

> [!NOTE]
> The Docker Compose setup and credentials described in this section are intended **only for local exploration and testing**.
> They use hard-coded default secrets and users and are **not safe for production deployments**.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Quick Start

1. **Start all services:**

   ```sh
   docker compose -f devops/docker/docker-compose.yml up -d
   ```

2. **Wait for initialization**

   The first startup will automatically:
   - Initialize empty databases and run migrations
   - Import the Keycloak realm and create predefined users
   - Create S3 bucket in RustFS

3. **Access the applications:**
   - **Chat-bot app**: http://localhost:3000 (credentials: `teacher` / `password`)
   - **Admin app**: http://localhost:3001 (credentials: `admin` / `password` or `editor` / `password`)
   - **API**: http://localhost:3002
   - **Keycloak**: http://localhost:8080 (credentials: `admin` / `admin`)
   - **RustFS Console**: http://localhost:9001 (S3-compatible storage, credentials: `rustfsadmin` / `RustFS-Admin-123456`)

4. **Configure the application using ais-chat-admin:**
   - Navigate to the admin app at http://localhost:3001
   - Login with admin credentials (username: `admin`, password: `password`)
   - In `ais-chat-api` section:
     - Create your LLM models
     - Create Projects (i.e., federal states) and assign the models to them.
       The federal states `DE-TEST` must exist. Others can be created optionally.
     - Create API Key(s) for the project(s) you created and copy the key.
   - In `ais-chat-app` section:
     - Create at least the `DE-TEST` federal state and assign the corresponding API Key to it.
     - Configure settings as needed.

5. **Login with default credentials:**

   Open the chat-bot app at http://localhost:3000 and log in with any of the predefined users from the Keycloak realm configuration:
   - Username: `teacher` / Password: `password` (teacher)
   - See [ais-chat-local-realm.json](devops/docker/keycloak/ais-chat-local-realm.json) for all available users

### Customization

All services are preconfigured with sensible defaults in `devops/docker/docker-compose.yml`.
To customize environment variables edit `devops/docker/docker-compose.yml` directly or create a `docker-compose.override.yml`.

### Calculator arithmetic service

The Compose setup includes a libqalculate HTTP service. In the production/self-hosted Compose file,
calculator is reachable by the containerized chatbot through the internal calculator network and is also
published on the local host at `http://127.0.0.1:8081` for local testing. Host clients should use
the loopback port. The production calculator container has no external network access; the application
and Keycloak share a network namespace in this Compose setup so the application can reach calculator.

- `GET /healthz` returns `{"status":"success","result":"ok"}`.
- `POST /v1/calculate` accepts `Content-Type: application/json` and a body such as
  `{"expression":"2 + 2"}`. Successful responses contain `status: "success"` and the calculated string in `result`.
- Requests are limited to an 8 KiB body, a 4096-character expression, 16 KiB worker output, and
  a 2-second worker wall time. The pool runs up to 4 workers concurrently and queues up to 32
  additional requests in FIFO order. Invalid requests return structured HTTP 400 JSON; a full
  worker pool returns HTTP 429.

Start it with the self-hosted stack using `docker compose -f devops/docker/docker-compose.yml up -d`.
For source development, calculator starts with the normal local stack:
`docker compose -f devops/docker/docker-compose.local.yml up -d --build`.
The local calculator service explicitly joins the default Compose network so containerized local apps can
use `http://calculator:8080`; apps run directly on the host must use `http://127.0.0.1:8081`.
Enable **calculator** for the relevant federal state in AIS.chat Admin before using the chatbot tool.
Focused service tests run with `pnpm --filter @ais-chat/calculator-service test` (type and lint checks use
the corresponding `check-types` and `lint` scripts).

### Stopping and Cleanup

```sh
# Stop all services
docker compose -f devops/docker/docker-compose.yml down

# Remove all data (databases, volumes)
docker compose -f devops/docker/docker-compose.yml down -v
```

---

## Local Development (from source)

This section is for developers who want to run AIS.chat from source code.

### Requirements

- nvm
- [docker compose](https://docs.docker.com/compose/install/)

### Basic Tools

Before the application can be started, you need to install the necessary tools.

```sh
nvm use # sets up the node version
corepack enable # sets up the proper package manager
corepack prepare
pnpm i # installs the dependencies
```

### Updating Node.js

If your local Node version doesn't match the version required in `.nvmrc` (e.g. `pnpm install` or `pnpm dev` fails with an engine version error), install the correct version and set it as your nvm default:

```sh
nvm install # installs the node version from .nvmrc
nvm alias default "$(cat .nvmrc)" # sets it as the default node version
```

### Environment variables

The project uses environment variables in `.env.local` files for local development configuration.

**Required `.env.local` files:**

- `apps/chat-bot/.env.local` — For the chat-bot app (database URLs, API connection, authentication, storage)
- `apps/api/.env.local` — For the API app (database URL, logging, telemetry)

For detailed variable documentation and values for local development with docker-compose, see the `.env.example` files in each app directory.

**How env files are loaded:**

- Precedence (highest to lowest): `.env.local` > `.env.development`. `.env.development` holds working defaults for local dev, so `.env.local` doesn't need to set them.
- `apps/chat-bot`/`apps/admin` get this (plus a lower-priority `.env` tier) via Next.js's built-in env loading.
- `apps/api` (Fastify) has no built-in loading, so `apps/api/src/load-env.ts` replicates the `.env.local` > `.env.development` precedence manually (no `.env` tier, since no app ships one).

### Service dependencies

For local development spin up all required services using docker compose:

```sh
docker compose -f devops/docker/docker-compose.local.yml up -d --build
```

To remove all data and start from scratch, you can stop and remove the container and its volume.
This will delete your database and keycloak configuration.

```sh
docker compose -f devops/docker/docker-compose.local.yml down -v
```

### Adding chat tools

Chat tools are defined in `apps/chat-bot/src/app/api/chat/tools/` and registered in
`apps/chat-bot/src/app/api/chat/build-tools.ts`. To add a tool:

1. Create a tool builder that returns a `ToolRegistration` with its `definition` and `handler`.
2. Register the builder in `buildTools` under the tool definition name.
3. Add an `activity` descriptor when the tool should appear in the AI Activity panel and stream.
  The descriptor must create an `AiActivityToolStep` from the tool call. Add `applyResult` when
  the tool result contributes display data such as links or a calculated value.
4. Add the tool name to `AI_ACTIVITY_TOOL_NAMES` in
  `apps/chat-bot/src/types/ai-activity.ts` so the persisted and streamed activity step passes
  schema validation.
5. Add the corresponding icon and translation key in
  `apps/chat-bot/src/components/chat/activity/ai-activity.tsx` and the AI Activity messages.

Tools without an `activity` descriptor still run normally, but their calls are omitted from AI
Activity. Activity descriptors should return small, user-facing values only; do not send complete
tool results to the client.

To delete only the keycloak data, shutdown all containers and delete the volume:

```sh
docker compose -f devops/docker/docker-compose.local.yml down
docker volume rm ais-chat_keycloak_data
```

### Database

The project uses two separate PostgreSQL databases:

- **chat-bot database** — managed by `packages/shared`, used by the chat-bot and admin apps
- **API database** — managed by `packages/api-database`, used by the API app

Check that you can access the local postgresql databases:

```sh
psql "postgresql://admin:test1234@127.0.0.1:5432/app_db"
psql "postgresql://admin:test1234@127.0.0.1:5432/api_db"
```

If you start with a fresh database, apply migrations and seed both databases; otherwise the application will not work.

```sh
pnpm db:migrate
```

Add api keys in your `.env.local` files for all federal states that you want to seed. These keys are used to fetch the available LLM models from the ais-chat-api (e.g. `DE_BY_API_KEY` for Bavaria). If you previously seeded the api database, use the resulting API key.

The api database seed also requires LLM provider credentials for the models it creates locally. Add these to `apps/api/.env.local`:

```sh
LLM_IONOS_API_KEY=...
LLM_IONOS_BASE_URL=...
LLM_GPT4OMINI_API_KEY=...
LLM_GPT4OMINI_BASE_URL=...
LLM_GPT5NANO_API_KEY=...
LLM_GPT5NANO_BASE_URL=...
```

Without these, placeholder values are used and the models will not work until real keys are configured.

The seeded models are routed through Bifrost. Start the local Docker services before seeding and keep `BIFROST_ADMIN_URL`, `BIFROST_ADMIN_USERNAME`, and `BIFROST_ADMIN_PASSWORD` configured so the seed can sync provider keys to Bifrost. With the standard local Docker Compose setup, `BIFROST_ADMIN_USERNAME=admin` and `BIFROST_ADMIN_PASSWORD=admin` work out of the box. Leave `LLM_MOCK_BASE_URL` unset or set it to `http://mock-llm:6556`; the URL must be reachable from the Bifrost container, not from the host.

```sh
pnpm db:seed
```

You can now start the application from the root directory:

```sh
pnpm dev
```

### Keycloak

Keycloak is used for logins both locally and in e2e tests.
The realm, client and several predefined users are configured in [ais-chat-local-realm.json](devops/docker/keycloak/ais-chat-local-realm.json).
Users are defined at the bottom of the json.

The json is imported once when starting keycloak, but only if the realm does not yet exist.
When updating the json, remember to drop your local keycloak docker volume to re-import the realm.

### Valkey

We use Valkey for storing session data.
It is part of the `docker-compose.local.yml` file.
If you want to access the values for testing or experimenting, you can use [valkey-cli](https://valkey.io/topics/installation/).
Then you can access the local instance as follows:

```sh
# check if valkey-cli is installed correctly
valkey-cli --version
# check if connection to local instance is working, otherwise check hostname, port, etc.
valkey-cli PING
# show current stats
valkey-cli --stats
```

#### Testing Valkey cluster mode locally

To test cluster mode locally, use the override file `docker-compose.valkey-cluster.yml` alongside the base file:

```sh
docker compose \
  -f devops/docker/docker-compose.local.yml \
  -f devops/docker/docker-compose.valkey-cluster.yml \
  up -d --build
```

This replaces the standalone Valkey node with a single-node cluster.
A one-shot `valkey-cluster-init` container bootstraps the cluster automatically on first start.

To reset cluster state, stop only the valkey container and remove its volume:

```sh
docker compose -f devops/docker/docker-compose.local.yml \
               -f devops/docker/docker-compose.valkey-cluster.yml \
               down valkey valkey-cluster-init
docker volume rm ais-chat_valkey_cluster_data
```

## Monitoring

To set up the monitoring and tracing stack in local development, use the following docker compose file:

```sh
docker compose -f devops/docker/monitoring.yml up -d
```

Also make sure to include the required env variables in your `.env.local`.

## E2E Tests

We use playwright for e2e testing, refer to the [details](apps/chat-bot/e2e/README.md) for a setup guide.
The e2e tests are integrated into the pipeline and run on every pull request.

## Load Tests

If you need to run load tests, you need to install `k6`.
See the [official install guide](https://grafana.com/docs/k6/latest/set-up/install-k6/) for your platform.

## Updating Agent Skills

Installed coding-agent skills are stored in `.agents/skills/`, and the resolved source/hash is tracked in `skills-lock.json`.

To update a skill (for example `shadcn`):

1. Install or update the skill from the upstream source:

   ```sh
   pnpx skills install shadcn/ui
   ```

2. Review changes in `.agents/skills/shadcn/`.
3. Confirm `skills-lock.json` was updated consistently.
4. Commit the skill files and `skills-lock.json` in the same commit.

## More

You can find more docs in the [./docs](./docs) folder.
For information about the project structure, see [here](./docs/structure.md).

## Security issues

Please see [SECURITY.md](SECURITY.md) for guidance on reporting security-related issues.
