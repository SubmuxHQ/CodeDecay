# CodeDecay CLI

CodeDecay analyzes pull requests for regression risk and maintainability decay.
It is deterministic, local-first, and does not require telemetry, cloud
services, API keys, LLMs, or model calls.

## Usage

```bash
codedecay analyze --format json
codedecay analyze --format markdown
codedecay analyze --format sarif --output codedecay.sarif
codedecay analyze --base main --head HEAD --fail-on high
codedecay analyze --cwd ../my-repo --format markdown
```

Reports are written to stdout by default. Relative `--output` paths are resolved
from the analysis working directory.
