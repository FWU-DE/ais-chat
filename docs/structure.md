# Project Directory Structure

This document provides an overview of the top-level directories in the project with brief explanations of their purpose and contents.

## [`/apps/chat-bot`](/apps/chat-bot)

The main user-facing web application. A Next.js app with the app router used by students and teachers.

## [`/apps/admin`](/apps/admin)

The admin web application. A Next.js app that allows admins to configure ais-chat-api and ais-chat-app (federal state settings, models, etc.).

## [`/apps/api`](/apps/api)

The AIS.chat proxy API. A Fastify REST API that acts as a proxy to LLM providers, handling billing and access control. Swagger docs are served at `/docs`.

## [`/packages/shared`](/packages/shared)

Shared code used by the `chat-bot` and `admin` apps (Next.js).
Contains the chat-bot database schema, Drizzle ORM configuration, database access functions, services, and utilities.

Key contents:

- `src/db/` — Schema definitions, migrations, seed scripts, and database access functions
- `src/knotenpunkt/` — Client for calling the ais-chat-api service to access LLM providers (completions, embeddings, images). Note: ai-core now reads model configuration directly from the database, but still uses knotenpunkt to make requests to the ais-chat-api service.
- `src/s3/` — S3-compatible storage utilities
- `src/logging/` — Shared logging helpers

## [`/packages/shared-core`](/packages/shared-core)

Cross-app shared utilities used by all applications (`admin`, `chat-bot`, and `api`).
Contains framework-agnostic code that does not depend on app-specific runtimes.

## [`/packages/api-database`](/packages/api-database)

Database schema, Drizzle ORM configuration, and seed scripts for the API app. Manages the separate PostgreSQL database used exclusively by `apps/api`.

Key contents:

- `src/schema.ts` — Table definitions (organizations, projects, API keys, LLM models)
- `src/seed.ts` — Database seed script
- `src/migrate.ts` — Migration runner

## [`/packages/ai-core`](/packages/ai-core)

Logic to communicate with AI providers and LLMs. Handles chat completions, embeddings, image generation, and API key management including billing and access control.

## [`/packages/ui`](/packages/ui)

Shared UI component library based on [shadcn/ui](https://ui.shadcn.com/). Contains reusable React components and global Tailwind styles used across chat-bot and admin apps.

## [`/packages/typescript-config`](/packages/typescript-config)

Shared TypeScript configuration presets (`base.json`, `nextjs.json`, `react-library.json`, `api-base.json`) used across all apps and packages.

## [`/devops`](/devops)

Infrastructure configuration.

Key contents:

- `docker/docker-compose.local.yml` — Local development services (PostgreSQL, Keycloak, Valkey)
- `docker/monitoring.yml` — Local metrics stack (Prometheus, Grafana)
- `docker/keycloak/` — Keycloak realm configuration
