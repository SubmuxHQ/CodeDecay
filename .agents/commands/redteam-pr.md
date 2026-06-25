# redteam-pr

Use this to review a PR like a cautious senior engineer.

1. Read `AGENTS.md`.
2. Inspect the changed files:

   ```bash
   git diff --name-status origin/main...HEAD
   git diff --stat origin/main...HEAD
   ```

3. Build CodeDecay:

   ```bash
   pnpm build
   ```

4. Generate deterministic PR safety evidence:

   ```bash
   node packages/cli/dist/index.js analyze --base origin/main --head HEAD --format markdown
   node packages/cli/dist/index.js redteam --base origin/main --head HEAD --format markdown --output codedecay-redteam.md
   node packages/cli/dist/index.js agent --base origin/main --head HEAD --format markdown --output codedecay-agent.md
   ```

5. Read `codedecay-redteam.md`.
6. If the change touches redteam, test-audit, analyzer, eval, CLI, release, or dogfood behavior, run the efficacy benchmark:

   ```bash
   pnpm eval:pr-safety -- --run-id local-pr-safety-eval
   ```

7. Use the `Copy-Paste Prompt` section from `codedecay-agent.md` with the
   current user-owned agent if the PR needs fixes.
8. Apply `.agents/skills/pr-red-team/SKILL.md`.
9. Apply `.agents/skills/test-quality-review/SKILL.md` when tests changed.
10. Summarize:

   - what could break,
   - impacted user/API flows,
   - whether tests prove the real behavior,
   - missing edge cases,
   - agent fix tasks from `codedecay-agent.md`,
   - commands or checks that should be run before merge.

Keep tool evidence separate from agent suggestions. Do not claim a PR is 100%
safe. Do not run destructive commands or unconfigured deployment/migration
commands. Use evidence-backed language.
