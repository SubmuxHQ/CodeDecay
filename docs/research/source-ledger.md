# Source Ledger

CodeDecay knowledge packs summarize public security and regression patterns in
our own words. They do not copy source code, rule files, tests, payload corpora,
or prose from external projects.

For external repositories, record the license before studying implementation
details. For non-repository public sources, record the source terms as
practical usage guidance and cite the URL in every derived edge case.

| Source | URL | License / terms | What we studied | Reimplemented from scratch |
| --- | --- | --- | --- | --- |
| OWASP Cheat Sheet Series repository | https://github.com/OWASP/CheatSheetSeries | Creative Commons Attribution-ShareAlike 4.0 International | JWT, authentication, and session-management guidance. Attribution retained through source URLs in the `jwt-auth` pack. | yes |
| OWASP JSON Web Token for Java Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html | OWASP Cheat Sheet Series content license; cited as guidance, no prose copied. | JWT verification, weak secret, and client-side storage pitfalls. | yes |
| OWASP Authentication Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html | OWASP Cheat Sheet Series content license; cited as guidance, no prose copied. | Authentication secret and credential-hardening guidance relevant to JWT signing keys. | yes |
| OWASP Session Management Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html | OWASP Cheat Sheet Series content license; cited as guidance, no prose copied. | Session lifetime, cookie protection, logout, and token lifecycle concepts. | yes |
| RFC 8725: JSON Web Token Best Current Practices | https://www.rfc-editor.org/rfc/rfc8725.html | IETF Trust legal provisions for RFC documents; specification concepts only. | JWT algorithm confusion, header trust boundaries, claim validation, and BCP guidance. | yes |
| RFC 7519: JSON Web Token | https://www.rfc-editor.org/rfc/rfc7519.html | IETF Trust legal provisions for RFC documents; specification concepts only. | Registered claims such as issuer, audience, expiration, not-before, and subject. | yes |
| MITRE CWE-345 | https://cwe.mitre.org/data/definitions/345.html | MITRE CWE terms of use; taxonomy concept only. | Insufficient verification of data authenticity. | yes |
| MITRE CWE-347 | https://cwe.mitre.org/data/definitions/347.html | MITRE CWE terms of use; taxonomy concept only. | Improper verification of cryptographic signature. | yes |
| MITRE CWE-613 | https://cwe.mitre.org/data/definitions/613.html | MITRE CWE terms of use; taxonomy concept only. | Insufficient session expiration. | yes |
| MITRE CWE-918 | https://cwe.mitre.org/data/definitions/918.html | MITRE CWE terms of use; taxonomy concept only. | SSRF risk relevant to untrusted JWT key URLs. | yes |
| PortSwigger Web Security Academy JWT materials | https://portswigger.net/web-security/jwt | Website training material; concept and citation only. Do not copy labs, payloads, or prose. | Real-world JWT attack classes including decode trust, algorithm confusion, and header-controlled key selection. | yes |
| NVD CVE-2022-23540 | https://nvd.nist.gov/vuln/detail/CVE-2022-23540 | NIST/NVD public vulnerability database; vulnerability fact pattern only. | JWT library vulnerability pattern around unsafe verification behavior. | yes |
| Mem0 repository and TypeScript package | https://github.com/mem0ai/mem0 / https://www.npmjs.com/package/mem0ai | Apache-2.0 | Public TypeScript SDK surface for optional external memory integration. No SDK code copied; CodeDecay uses an optional dynamic import boundary. | yes |

## Explicit Flags

- PortSwigger content is used as concept/citation only. Do not copy lab text,
  payload lists, exercises, or solution steps.
- MITRE CWE and IETF RFC entries are used as public taxonomy/specification
  grounding only.
- No external repository source code, matcher implementation, payload corpus, or
  test fixture was copied into CodeDecay.
