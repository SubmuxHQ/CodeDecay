# CodeDecay v0.4.0

CodeDecay v0.4.0 is the frozen Codex India Hackathon 2026 submission release.
It keeps the project local-first and makes the AI-assisted PR safety workflow
easier to reproduce, inspect, and hand back to a user-owned coding agent.

## Shipped

- A recommended `codedecay ai` workflow that packages preflight, deterministic
  PR evidence, repair tasks, configured checks, and current-tree revalidation.
- Packed CLI and GitHub Action acceptance that exercises the same public
  command surface without workspace-only dependencies.
- Behavior-specific edge-case scenarios ranked by changed routes, symbols,
  user flows, requirements, memory, proof type, and confidence, with
  machine-readable overflow retained.
- Agent task bundles whose limitations accurately reflect whether configured
  commands or explicit model investigation ran.
- A bundled MCP CLI boundary that keeps its server dependency graph out of
  fresh npm consumer installs.
- A public, credential-free Judge Lab with fixed safe scenarios, reproducible
  analyzer evidence, benchmark disclosure, and an embedded captioned Codex
  repair demo.
- A genuine Codex repair record with a sanitized transcript, exact fixture
  commits and commands, red-before-green endpoint proof, and current-tree
  CodeDecay revalidation.
- Parser-grounded JavaScript security matchers that require real command sinks
  and data flow for path traversal and hardcoded-secret evidence.
- Output-aware analysis that prevents a generated JSON, Markdown, or SARIF
  report from becoming evidence in the next run while preserving intentional
  CodeDecay config, memory, and arbitrary user files.
- A parser-backed copied-implementation gate that suppresses type shapes,
  type-only imports, and declarative fixtures while preserving executable
  copied-oracle detection.

## Reproducible evaluation

The deterministic fixture corpus reports 23 of 23 planted issues recalled and
a 2.22% false-positive rate at zero model cost. These are finite planted-fixture
results, not production accuracy or a guarantee that a merge is safe.

The final release validation includes the full repository suite, package build
and dry-run, child-repository acceptance, PR-safety evaluation, deterministic
benchmark, fresh tarball consumer, published-package smoke, and Judge Lab
server/browser checks.

## Safety and privacy

- No required CodeDecay API key.
- No hidden telemetry.
- No hidden model call or private-code upload.
- Commands run only when explicitly configured and allowed.
- Deterministic/tool evidence remains distinct from agent suggestions.
- The public Judge Lab accepts fixed scenario IDs only; it does not accept a
  repository URL, prompt, upload, model credential, or arbitrary command.

## Known limitations

- The controlled paired real-agent outcome benchmark in
  [#683](https://github.com/SubmuxHQ/CodeDecay/issues/683) is not complete.
- Independent three-participant published-workflow UAT in
  [#692](https://github.com/SubmuxHQ/CodeDecay/issues/692) is not complete.
- The public benchmark is planted and finite, and deterministic findings can
  produce false positives.
- Framework/language coverage is incomplete; runtime confidence depends on the
  repository's configured checks and available tools.
- Copied-implementation detection remains a conservative three-line heuristic;
  unsupported syntax, shorter copies, or structurally rewritten logic may not
  be detected.
- The demo fixture deliberately does not model token expiry, malformed JWTs,
  or authorization scope, and its repaired report remains High without runtime
  coverage evidence.

CodeDecay helps find what a coding agent missed before merge. It does not
guarantee perfect safety.
