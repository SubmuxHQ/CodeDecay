# Knowledge Packs

Knowledge packs are structured, cited edge-case checklists that CodeDecay can
use to ground red-team reports and optional AI investigation. They are guidance,
not confirmed findings.

The first template pack is `jwt-auth` in `packages/knowledge`.

## Shape

Each pack is TypeScript data:

```ts
{
  area: "jwt-auth",
  cwe: ["CWE-345", "CWE-347"],
  edgeCases: [
    {
      title: "Decoded token trusted before signature verification",
      symptom: "...",
      rootCause: "...",
      detectionHint: "...",
      fixHint: "...",
      sources: ["https://..."]
    }
  ]
}
```

## Citation Policy

- Every edge case must cite public sources.
- External repository licenses must be recorded in
  `docs/research/source-ledger.md` before studying implementation details.
- Apache-2.0, MIT, and BSD sources may inform reimplementation with
  attribution.
- GPL, LGPL, AGPL, proprietary, and unlicensed sources may be used only for
  high-level concept understanding. Reimplement from public specs such as CWE,
  OWASP, RFCs, or project documentation.
- Do not copy external code, rule files, payload lists, tests, or long prose.

## Runtime Safety

Knowledge packs are local static data. Loading them does not:

- install tools,
- execute commands,
- call an LLM,
- use network access,
- send telemetry.

`redteam --investigate` may include matching packs as opt-in provider context.
The report labels this material as pattern-pack guidance, not proof.

## Benchmark Expectations

For each new pack, add:

- planted risky fixtures for deterministic cases,
- clean or decoy fixtures to measure false positives,
- documentation of deterministic recall, false-positive rate, and cases that
  need `--investigate`, external tools, or human review.
