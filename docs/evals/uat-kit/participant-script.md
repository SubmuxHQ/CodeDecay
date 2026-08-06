# Participant script (UAT-HUMAN-1..8)

Use the published package (or a packed tarball install), not a monorepo workspace
import. Fixture setup for facilitators: `node scripts/human-uat-setup.mjs`.

1. **UAT-HUMAN-1** — Install `@submuxhq/codedecay`, run `codedecay --help` / `codedecay ai --help`, and produce a first useful analyze or ai report against the planted fixture.
2. **UAT-HUMAN-2** — Read the ambiguous requirement in the planted `README.md` (“Make invoice lookup safer for operators.”). Clarify whether anonymous callers may see invoice totals before coding.
3. **UAT-HUMAN-3** — Observe that `npm test` passes while the changed auth/API path lacks endpoint-level proof.
4. **UAT-HUMAN-4** — Run `npm run probe:anonymous` (or CodeDecay with configured checks) and confirm the planted defect (anonymous `GET /api/invoices` is not `401`).
5. **UAT-HUMAN-5** — Repair with your user-owned agent (or deterministic edits), add real-path proof, rerun checks, and `codedecay revalidate` / current-tree `codedecay ai`.
6. **UAT-HUMAN-6** — On the `unsafe` fixture (`allowCommands: false`), run `codedecay execute` and confirm commands are skipped/blocked; explain why that is correct.
7. **UAT-HUMAN-7** — On the `decoy` fixture, confirm a docs-only change does not force unnecessary repair.
8. **UAT-HUMAN-8** — Explain what in the final report is deterministic evidence, runtime/tool proof, memory, AI suggestion, unverified, needs-human, and verified — without treating agent text as proof.
