## Summary

<!-- What changed? Keep this concrete. -->

## Why

<!-- Why is this needed? What problem does it solve? -->

## Risk Areas

- [ ] CLI or npm package behavior
- [ ] Core scoring, rules, or shared types
- [ ] JS/TS analyzer, impact map, or test-audit behavior
- [ ] Git diff, path normalization, or base/head handling
- [ ] Reports, Markdown, JSON, or SARIF output
- [ ] Redteam reports, agent bundles, MCP, memory, or LLM provider boundaries
- [ ] Safe execution, differential checks, or tool adapters
- [ ] GitHub Action, GitHub App, CI, or repository automation
- [ ] Docs, examples, contributor setup, or agentic development resources
- [ ] Packaging, release metadata, or published tarball contents

## CodeDecay Self-Check

<!-- For meaningful changes, run CodeDecay or explain why it is not applicable. Prefer the redteam workflow in .agents/commands/redteam-pr.md. -->

- Command:
- Risk level:
- Impacted areas/routes:
- Weak or missing test proof:
- Edge cases/fix tasks addressed:
- Not applicable reason:

## Validation

- [ ] `pnpm run lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm eval:pr-safety -- --run-id local-pr-safety-eval`
- [ ] `pnpm build`
- [ ] `pnpm --filter @submuxhq/codedecay pack --dry-run`
- [ ] Added or updated tests for behavior changes
- [ ] Updated docs for user-facing changes
- [ ] Included CodeDecay self-check evidence above, or explained why it is not applicable

## Related

<!-- Link issues, discussions, or follow-up work. -->
Closes #
