---
name: docker-service
description: Use when creating, moving, hardening, or debugging a Dockerized service or its Compose/workflow integration.
---

# Dockerized service workflow

Use this skill for standalone services, Dockerfiles, Compose integration, and CI/container
maintenance. Keep the change small and verify it at the service boundary.

## Repository and dependency rules

- Put standalone services under `services/`; inspect existing layout and patterns first.
- Prefer Alpine when all required packages are natively compatible. Investigate native binaries, package availability, architecture support, and libc compatibility (musl versus glibc) before choosing or changing the base image.
- Preserve or improve Docker hardening: minimal runtime images, multi-stage builds where useful, non-root execution, least-privilege filesystem/runtime settings, and a pinned/reproducible dependency strategy.

## Integration checklist

- Add every Dockerfile directory to `.github/dependabot.yml` using the repository's existing
  Docker update conventions.
- Treat Dependabot coverage accurately: arbitrary Docker `ARG` values and downloaded binary hashes
  may not be discoverable or updateable automatically. Document or plan manual update ownership
  when needed; do not imply Dependabot can track them.
- If a service moves, update all affected Compose files, workflow paths, scripts, deployment
  references, and user/developer documentation. Derive facts from current code and configuration;
  snapshot files under `docs/current_architecture/` are not authoritative.
- Use `apps/api/Dockerfile` and `services/calculator/Dockerfile` as concrete repository examples,
  while checking that their current patterns still apply.

## Verification

Run focused unit/integration tests and lint/type checks for changed code. Build the affected image
and exercise its health and API endpoints. Start the relevant Compose configuration and verify
service-to-service behavior, logs, ports, and shutdown behavior. For user-facing changes, run
desktop and mobile browser regression checks and capture screenshots when applicable. Report any
unavailable credentials, services, or architecture-specific checks instead of skipping them
silently.
