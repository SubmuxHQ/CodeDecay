# Configuration

CodeDecay can load repo-local configuration for future red-team orchestration,
tool adapters, and real behavior probes.

Configuration is optional. If no config file exists, CodeDecay uses safe
defaults and does not run project commands.

## Supported Files

CodeDecay discovers the first matching file from the analysis working directory:

- `.codedecay/config.yml`
- `.codedecay/config.yaml`
- `codedecay.config.yml`
- `codedecay.config.yaml`

Use `--cwd` to inspect another repository:

```bash
npx codedecay config --cwd ../my-repo --format markdown
```

## Example

```yaml
version: 1

commands:
  test:
    - pnpm test
  build:
    - pnpm build
  start:
    - pnpm dev

probes:
  - name: users api
    command: curl -f http://localhost:3000/api/users
    timeoutMs: 5000

safety:
  commandTimeoutMs: 120000
  allowCommands: false
```

## Safety Model

Config files make project commands explicit. CodeDecay should not guess commands
from model output or run arbitrary commands by default.

Current behavior:

- `codedecay analyze` does not require config.
- `codedecay config` only loads and prints config.
- missing config returns safe defaults.
- no telemetry, API keys, LLM calls, or cloud services are used.

Future execution features should use this config as their allowlisted command
source.
