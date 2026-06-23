# CodeDecay CLI

CodeDecay is an open-source CLI for pull request regression-risk analysis,
code-decay detection, and change-impact analysis. It is deterministic,
local-first, and does not require telemetry, cloud services, API keys, LLMs,
or model calls.

## Usage

After a local install, run the CLI with `npx codedecay` or add `codedecay` to
an npm script.

```bash
npx codedecay analyze --format json
npx codedecay analyze --format markdown
npx codedecay analyze --format sarif --output codedecay.sarif
npx codedecay analyze --base main --head HEAD --fail-on high
npx codedecay analyze --cwd ../my-repo --format markdown
npx codedecay config --cwd ../my-repo --format markdown
npx codedecay mcp --cwd ../my-repo
```

Reports are written to stdout by default. Relative `--output` paths are resolved
from the analysis working directory.
