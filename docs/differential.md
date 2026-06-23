# Differential Behavior Checks

`codedecay differential` compares configured probe behavior between two git
refs. It creates temporary worktrees for `--base` and `--head`, runs the same
configured probes in both worktrees, reports behavior differences, and removes
the worktrees afterward.

Differential checks are useful when a PR looks locally tested but may change a
real behavior path outside the touched files.

## Run

```bash
npx codedecay differential --base main --head HEAD --format markdown
npx codedecay differential --cwd ../my-repo --base origin/main --head HEAD --format json
npx codedecay differential --base main --head HEAD --output codedecay-differential.md
```

`--base` and `--head` are required.

Exit codes:

- `0`: configured probes behaved the same, or probes were safely skipped.
- `1`: probe behavior changed, timed out, or hit an execution error.
- `2`: CLI/internal error, such as missing refs or invalid config.

## What It Compares

CodeDecay compares each configured probe by:

- command status
- exit code
- JSON stdout when stdout is valid JSON
- text stdout when stdout is not JSON
- stderr

The report includes base/head status, exit codes, output snippets for changed
or failed probes, and the exact differences detected.

## Config

Differential checks use probes from the current repo config:

```yaml
version: 1

commands: {}

probes:
  - name: users api
    command: node scripts/check-users-api.js
    timeoutMs: 5000

safety:
  commandTimeoutMs: 120000
  allowCommands: true
```

Only `probes` are used by `codedecay differential`. Test, build, and start
commands are handled by `codedecay execute`.

## Safety Model

- Probes must come from CodeDecay config.
- `safety.allowCommands` must be true or probes are skipped.
- Probes run in temporary git worktrees, not by mutating the current checkout.
- Worktrees are removed after the run.
- CodeDecay does not run commands from LLMs, memory files, MCP clients, or
  remote services.
- No telemetry, API keys, cloud services, LLMs, or model calls are required.
