# JWT Auth Knowledge Pack Coverage

This report documents the first knowledge-pack template slice.

## Pack

- Area: `jwt-auth`
- Sources: OWASP JWT, OWASP Authentication, OWASP Session Management, RFC 8725,
  RFC 7519, MITRE CWE, PortSwigger JWT materials, and NVD CVE-2022-23540.
- Runtime behavior: local static data only.

## Deterministic Coverage

| Edge case | Deterministic matcher | Status |
| --- | --- | --- |
| Decoded token trusted before signature verification | `security-jwt-unsafe-verification` | covered |
| Algorithm confusion or unsigned JWT accepted | `security-jwt-unsafe-verification` for explicit `algorithms: ["none"]` / `ignoreExpiration`-style options | partially covered |
| Untrusted `kid`, `jku`, `jwk`, or `x5u` controls verification key | none | needs `--investigate`, Semgrep-style rules, or review |
| Weak or shared HMAC secret | existing hardcoded secret signals catch some literals | partially covered |
| Missing issuer, audience, expiry, not-before, or token type validation | none | needs `--investigate`, tests, or framework/library-aware adapter |
| JWT storage or revocation gap | none | needs `--investigate`, browser/storage checks, or product tests |

## Template Metrics

Current template corpus target:

- Deterministic recall for JWT planted matcher cases: `2/2`.
- False positives on JWT decoys: `0/2`.
- Investigate-only JWT checklist cases: `4/6`.

These numbers are intentionally conservative. CodeDecay should not turn broad
JWT design advice into confirmed findings without a reliable local signal.
