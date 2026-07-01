# Closed-Loop Agent Orchestration

`codedecay loop` turns the redteam report and agent task bundle into a safe fix -> re-verify loop.

It does not embed a model, call a hosted LLM, send telemetry, or use a CodeDecay API key. If you do not pass `--agent-cmd`, the command runs in plan-only mode and prints what it would send to your own agent.

## Plan-Only Mode

```bash
codedecay loop --format markdown
```

Plan-only mode:

- runs deterministic CodeDecay redteam analysis
- runs configured checks only when they exist and `safety.allowCommands: true`
- renders the agent bundle and fix tasks
- makes no edits
- runs no agent command

## Agent Mode

```bash
codedecay loop --agent-cmd "your-agent-command" --max-rounds 4
```

The command must be user-owned and explicit. CodeDecay passes the rendered task bundle on stdin. The agent may edit the working tree, but CodeDecay never commits or pushes those edits.

After each agent action, CodeDecay re-runs deterministic analysis and configured checks. Agent output is treated as untrusted suggestion text until the deterministic checks prove the result.

## Safety Rules

`codedecay loop` never prints an unqualified "safe" verdict. Clean outcomes are always qualified by evidence depth.

The loop can only report a `merge-safe-*` verdict when all of these are true:

- final risk is at or below the configured safe threshold, `low` by default
- weak-test findings are zero
- security score is at or below the configured threshold, `0` by default
- no high-severity findings remain in deterministic analysis
- configured checks exist and pass

If no checks are configured, the best possible terminal status is `unverified`, not a `merge-safe-*` verdict.

`merge-safe-verified` means configured checks passed, deterministic security matchers were clean, Semgrep was enabled and clean, and coverage/mutation evidence was available if configured.

`merge-safe-shallow` means the gates passed, but one or more deeper evidence streams were missing. Treat it as heuristic clean, not as deep verification. Run `codedecay doctor` to configure OSS adapters such as Semgrep, coverage, and StrykerJS.

Terminal statuses:

- `merge-safe-verified`: configured and enabled checks found nothing at the selected thresholds, including available security/coverage/mutation depth
- `merge-safe-shallow`: risk, weak-test, security-score, and configured-check gates passed, but depth evidence such as Semgrep, coverage, or mutation testing is missing
- `unverified`: risk and weak-test evidence are clean, but no configured checks proved the result
- `plan-only`: no agent command was configured
- `stuck`: the agent made no progress for two rounds
- `needs-human`: max rounds were reached
- `agent-error`: the agent command failed, timed out, was skipped, or was blocked by safety policy

## Example

```bash
codedecay loop \
  --cwd ../my-repo \
  --agent-cmd "codex exec --apply" \
  --max-rounds 3 \
  --max-security-score 0 \
  --format markdown
```

Enable command execution explicitly in `.codedecay/config.yml` before using agent mode:

```yaml
version: 1
commands:
  test:
    - pnpm test
safety:
  allowCommands: true
```

Do not configure deploys, production migrations, package publishes, or destructive git commands as loop commands.
