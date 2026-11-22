# Antigravity workspace configuration

Google Antigravity discovers the repository-level `AGENTS.md` automatically. That
file remains the always-on authority for project rules. The files in this directory
add narrowly activated context and repeatable procedures without duplicating the
source pack.

## Included customizations

- `rules/project-context.md` loads when a task concerns architecture, requirements,
  planning, migration or repository status.
- `skills/start-work-package/SKILL.md` provides the reviewed implementation and PR
  workflow for an ordinary work package.
- `skills/review-aws-staging/SKILL.md` provides the no-surprises workflow for AWS
  infrastructure planning and validation.

All contributors read and update `docs/PROGRESS.md` as the shared implementation
handoff. Git history and CI remain the evidence behind that summary.

Open the repository root as the Antigravity workspace. In Antigravity, inspect
Customizations to confirm that the root `AGENTS.md`, rule and two skills are loaded.
Use review-driven execution. Do not add credentials to this directory.

No workspace MCP configuration is committed. Add MCP servers only when a concrete
task requires them, keep credentials in the supported user-level configuration or
environment, and never commit API keys.
