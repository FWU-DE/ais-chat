# Docker image publishing

`.github/workflows/docker.yml` pushes images to `ghcr.io/fwu-de/*` only when "Build"
(`checks.yml`) succeeded for a `push` to `main` in `FWU-DE/ais-chat`. Both jobs check
`workflow_run.event`, `head_repository.full_name` and `head_branch` before building or
tagging `:latest`, because `workflow_run` runs with repository secrets and write
permissions even when the triggering run came from a fork PR.

- `workflow_dispatch` builds without pushing.
- Pull requests never reach the publish jobs. Fork PR "Build" runs get a read-only token
  and no secrets; same-repository PRs run with repository secrets and the default token
  permissions, since only members with write access can push branches here.
- Write permissions are granted per job (`packages`, attestation scopes only); the
  checkout does not persist credentials.
- Workflows from external contributors require approval before running.
