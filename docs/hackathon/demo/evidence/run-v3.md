# Genuine Codex repair run

This is the public evidence index for the CodeDecay hackathon demo recorded on
27 July 2026. It is a genuine `codex exec` session, not a staged command
animation.

## Identity

- Codex CLI: `0.145.0`
- Sandbox: `workspace-write`
- Fixture base: `f042684b1d7c306adf5b85c6ca43c6f9e14ab5cc`
- Risky fixture head: `36a38500031f8330654c5e04c0d49062f09314ec`
- Codex session: `019fa3f0-e029-7582-8a6d-64bdfb4ee67f`
- Target release shown in the video: `v0.4.1`

The fixture commits are created deterministically by
`scripts/hackathon-demo/setup.mjs`. Commit timestamps can vary, so the content
and two-commit structure are the reproducibility contract.

## Measured sequence

1. The original unit test passed: 1 of 1.
2. The anonymous probe returned HTTP `200` with an anonymous admin body.
3. The before CodeDecay bundle reported High risk at 78/100, two changed files,
   one missing-test finding, and one configured unit check passed.
4. Codex stated a four-step plan before editing.
5. Codex added a Node HTTP endpoint test and ran it before the repair:
   anonymous failed `200 !== 401`; authorized passed with `200`.
6. Codex restored fail-closed behavior in the session and route layers.
7. The unit test passed 1 of 1, endpoint tests passed 2 of 2, the anonymous
   probe returned `401 {"error":"unauthorized"}`, and `git diff --check` passed.
8. `codedecay ai --with-checks` ran against the current tree without
   `--base`; both allowlisted checks passed.
9. Revalidation marked the missing-nearby-test finding fixed. Four auth/API
   context findings remained confirmed.
10. Codex self-reviewed the evidence and called out the remaining limitation:
    any non-empty authorization value is still treated as an admin token.

## Evidence boundaries

- HTTP results and command outcomes are tool evidence.
- JWT hardening, fuzzing, mutation testing, and supply-chain follow-ups in the
  report are suggestions, not executed proof.
- The post-repair report remains High at 80/100 and labels changed-path proof
  static because the fixture supplies no runtime coverage artifact.
- CodeDecay does not guarantee a safe merge.

## Public files

- `codex-session-v3.sanitized.jsonl`: complete machine-readable session events
  with private absolute paths replaced by `<CODEDECAY_CHECKOUT>` and
  `<DEMO_REPO>`.
- `../generated/video-metadata.json`: media verification and fixture identity.
- `/demo/codedecay-codex-repair.vtt`: narration transcript and captions served
  by Judge Lab.
- `../cuts.md`: intentional timing-cut disclosure.
