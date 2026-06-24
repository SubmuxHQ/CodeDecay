# redteam-pr

Use this to review a PR like a cautious senior engineer.

1. Read `AGENTS.md`.
2. Inspect the changed files:

   ```bash
   git diff --name-status origin/main...HEAD
   git diff --stat origin/main...HEAD
   ```

3. Build and run CodeDecay:

   ```bash
   pnpm build
   node packages/cli/dist/index.js analyze --base origin/main --head HEAD --format markdown
   ```

4. Apply `.agents/skills/pr-red-team/SKILL.md`.
5. Apply `.agents/skills/test-quality-review/SKILL.md` when tests changed.
6. Summarize:

   - what could break,
   - impacted user/API flows,
   - whether tests prove the real behavior,
   - missing edge cases,
   - commands or checks that should be run before merge.

Do not claim a PR is 100% safe. Use evidence-backed language.
