---
name: e2e-test-recategorization
description: Review and recategorize e2e test tags after some time has passed. Use when asked to "clean up smoke tags", "recategorize e2e tests", audit e2e test tags, or periodically after a batch of new tests was tagged @smoke.
---

# E2E Test Recategorization

All newly added e2e tests are tagged `@smoke` on creation (see `code-review` skill), so they run in the PR pipeline right away. Over time, some of these don't actually belong there. This skill audits existing `@smoke`-tagged tests and removes the tag from ones that don't qualify.

## What qualifies as `@smoke`

Per `e2e-testing/SKILL.md`: only core user journeys that use the mock LLM and run in chromium. PRs run `@smoke` only; merges to `main` run the full regression suite (all tests, firefox, real LLMs).

## Process

1. Find all `@smoke`-tagged tests: grep `apps/*/e2e/tests/**/*.test.ts` and `apps/*/e2e/**/*.test.ts` for `@smoke`.
2. For each, check whether it's a core user journey (e.g. login, sending a chat message, creating a character/assistant) vs. an edge case, validation check, or secondary feature.
3. Remove `{ tag: '@smoke' }` from tests that don't qualify, so they run only in the full regression suite.
4. Leave genuinely core-journey tests tagged.
5. Summarize which tests were recategorized and why.

This is a periodic manual review, not something to run automatically on every PR.
