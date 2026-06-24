# local-setup

Use this when onboarding a new contributor or a fresh worktree.

```bash
./.codedecay/setup.local.sh
```

The setup script:

- checks Node.js, pnpm, and git,
- installs dependencies,
- runs lint, typecheck, tests, and build,
- writes `.codedecay/local/state.json`.

CodeDecay currently does not require:

- a local database,
- seed data,
- Docker services,
- API keys,
- LLM or model credentials.

To inspect setup state:

```bash
./.codedecay/status.local.sh
```

To remove local setup state:

```bash
./.codedecay/teardown.local.sh
```
