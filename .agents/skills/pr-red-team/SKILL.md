# PR Red-Team Skill

Use this skill when reviewing CodeDecay changes or reviewing another repository
with CodeDecay.

## Goal

Find what a coding agent may have missed before merge.

Ask:

```text
What could this PR break, and are the tests actually proving it will not?
```

## Workflow

1. Read `AGENTS.md` and the PR diff.
2. Identify changed product surfaces:
   - CLI behavior
   - git diff handling
   - JS/TS analyzer rules
   - report rendering
   - GitHub Action behavior
   - GitHub App behavior
   - config, memory, execution, differential, MCP, LLM adapters
3. Run or request deterministic evidence:
   - `pnpm run lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - relevant built CLI commands
4. Look for hidden risk:
   - changed public flags or report schema without docs
   - weak tests that only assert mocks
   - missing error-path tests
   - missing cwd/path/ref handling
   - accidental telemetry, network calls, API keys, or model calls
5. Produce an actionable report:
   - likely impacted areas
   - concrete failure modes
   - missing tests or probes
   - whether the PR should merge, wait, or be split

## Constraints

- Do not run destructive commands.
- Do not add cloud dependencies.
- Treat model/agent output as suggestions, not proof.
- Keep evidence and speculation separate.
