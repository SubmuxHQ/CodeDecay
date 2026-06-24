# create-pr

Use this workflow for all meaningful CodeDecay changes.

1. Make sure a GitHub issue exists first.
2. Create a scoped branch from latest `main`:

   ```bash
   git checkout main
   git pull --ff-only origin main
   git checkout -b <type>/<issue-number>-short-title
   ```

3. Keep the change focused on the issue.
4. Run `.agents/commands/ci-check.md`.
5. Commit with conventional style:

   ```text
   feat(scope): short change
   fix(scope): short change
   docs(scope): short change
   test(scope): short change
   chore(scope): short change
   ```

6. Push and open a PR:

   ```bash
   git push -u origin <branch>
   gh pr create --base main --head <branch>
   ```

7. The PR body must include:

   ```text
   Closes #<issue-number>
   ```

Do not push directly to `main`.
