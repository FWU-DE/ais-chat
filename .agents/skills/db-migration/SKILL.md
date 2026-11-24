---
name: db-migration
description: 'Create a database migration if there are any changes to the database schema. Use when asked to create a database migration or apply changes to the database schema.'
---

## When to use

Use this skill when the user asks to:

- Create a new database migration
- Apply changes to the database schema

## How to create a database migration

- update the schema file at 'packages/shared/src/db/schema.ts' with the necessary changes
- navigate to 'packages/shared' from the repo root
- the `db:generate` script loads env from `apps/chat-bot/.env.local` via dotenvx;
  it needs `DATABASE_URL` defined but does NOT need a real DB connection;
  `drizzle-kit generate` only diffs the schema against the previous snapshot
- if `apps/chat-bot/.env.local` does not exist or lacks `DATABASE_URL`, create it with a dummy value first:
  ```
  echo "DATABASE_URL=postgres://dummy" > ../../apps/chat-bot/.env.local
  ```
- run `pnpm run db:generate --name <snake_case_description>` OR `pnpm run db:generate --custom --name <snake_case_description>` if there are no schema changes
- always pass a descriptive `--name` (e.g. `add_assistant_visibility`, `drop_unused_chat_columns`) summarizing the change; never keep the random name drizzle generates by default (e.g. `fearless_lethal_legion`)
- for each migration 2 files will be created:
  - a .json file in 'packages/shared/migrations/meta' containing the current database schema metadata
  - a .sql file in 'packages/shared/migrations' with the SQL code for the migration
- for each migration the file 'packages/shared/migrations/meta/\_journal.json' will be updated with a reference to the new migration and its metadata

## Validate

- verify that all three files are created for the migration
- run `pnpm run check-types` to ensure there are no type errors
- run `pnpm run db:check` from the repo root to validate the snapshot chain; the unit tests additionally verify that the latest snapshot matches the schema
