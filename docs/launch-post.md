# Show HN: CodeDecay - catch what your AI coding agent missed before merge

CodeDecay is an open-source, local-first CLI and GitHub Action for AI-assisted PR safety.

It asks: what could this PR break, and are the tests actually proving it will not?

Latest reproducible benchmark: 18/18 planted issues caught (100.0% recall), 5.56% false-positive rate on clean decoys, $0.00 cost, LLM called: no, telemetry sent: no.

Install and run:

```bash
npm install -D @submuxhq/codedecay
npx codedecay analyze
```

It stays deterministic by default: no required API keys, no required LLM calls, no telemetry, and no CodeDecayCloud dependency.

GitHub: https://github.com/SubmuxHQ/CodeDecay
npm: https://www.npmjs.com/package/@submuxhq/codedecay
