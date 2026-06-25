# ci-check

Use this before pushing or opening a PR.

1. Confirm branch and working tree:

   ```bash
   git status -sb
   git branch --show-current
   ```

2. Run validation:

   ```bash
   pnpm install
   pnpm run lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

3. For CLI/package changes, also run:

   ```bash
   pnpm --filter @submuxhq/codedecay pack --dry-run
   ```

4. For GitHub App changes, also run:

   ```bash
   pnpm --filter @submuxhq/codedecay-github-app build
   ```

5. Report exact pass/fail results in the PR body.
