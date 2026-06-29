import type { KnowledgePack } from "../types";

const OWASP_JWT =
  "https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html";
const OWASP_AUTH =
  "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html";
const OWASP_SESSION =
  "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html";
const RFC_8725 = "https://www.rfc-editor.org/rfc/rfc8725.html";
const RFC_7519 = "https://www.rfc-editor.org/rfc/rfc7519.html";
const CWE_345 = "https://cwe.mitre.org/data/definitions/345.html";
const CWE_347 = "https://cwe.mitre.org/data/definitions/347.html";
const CWE_613 = "https://cwe.mitre.org/data/definitions/613.html";
const CWE_918 = "https://cwe.mitre.org/data/definitions/918.html";
const PORTSWIGGER_JWT = "https://portswigger.net/web-security/jwt";
const NVD_CVE_2022_23540 = "https://nvd.nist.gov/vuln/detail/CVE-2022-23540";

export const JWT_AUTH_KNOWLEDGE_PACK: KnowledgePack = {
  area: "jwt-auth",
  title: "JWT authentication edge cases",
  cwe: ["CWE-345", "CWE-347", "CWE-613", "CWE-918"],
  match: {
    impactedAreas: ["auth", "api"],
    fileKeywords: ["auth", "jwt", "token", "session", "jwks", "jwk", "middleware"]
  },
  edgeCases: [
    {
      id: "jwt-decode-without-verify",
      title: "Decoded token trusted before signature verification",
      symptom: "A forged token can influence user identity, role, tenant, or authorization decisions.",
      rootCause:
        "Application code reads JWT claims with a decode helper and treats those claims as authenticated before a signature verification step succeeds.",
      detectionHint:
        "Look for jwt.decode, decodeJwt, atob, or manual base64 claim parsing feeding auth decisions, session objects, or request context.",
      fixHint:
        "Verify the token signature and expected claims first, then derive identity and authorization context only from the verified payload.",
      sources: [OWASP_JWT, RFC_8725, CWE_345, CWE_347, PORTSWIGGER_JWT]
    },
    {
      id: "jwt-algorithm-confusion",
      title: "Algorithm confusion or unsigned JWT accepted",
      symptom: "Tokens signed with an unexpected algorithm, or with no effective signature, are accepted as valid.",
      rootCause:
        "Verification trusts the token header algorithm or allows unsafe algorithms instead of enforcing a server-side allowlist tied to the configured key.",
      detectionHint:
        "Look for verification options that include none, dynamic algorithm selection from token headers, or missing algorithm pinning around JWT verification.",
      fixHint:
        "Pin allowed algorithms in server configuration, reject unsigned tokens, and keep asymmetric and symmetric verification keys on separate code paths.",
      sources: [OWASP_JWT, RFC_8725, CWE_347, NVD_CVE_2022_23540, PORTSWIGGER_JWT]
    },
    {
      id: "jwt-untrusted-key-header",
      title: "Untrusted kid, jku, jwk, or x5u header controls verification key",
      symptom: "An attacker can steer verification toward a key they control, or make the service fetch attacker-chosen key material.",
      rootCause:
        "The verifier resolves signing keys from token-controlled header values without an allowlisted issuer, key set URL, key id, and cache policy.",
      detectionHint:
        "Check whether kid, jku, jwk, x5u, or JWKS URLs from token headers are used directly in key lookup, filesystem lookup, SQL lookup, or HTTP fetches.",
      fixHint:
        "Resolve keys only from trusted issuer configuration, allowlist JWKS origins and key ids, and never treat token headers as authority.",
      sources: [RFC_8725, CWE_345, CWE_347, CWE_918, PORTSWIGGER_JWT]
    },
    {
      id: "jwt-weak-or-shared-secret",
      title: "Weak or shared HMAC secret allows offline token forgery",
      symptom: "A leaked, guessed, reused, or low-entropy secret lets attackers mint valid tokens.",
      rootCause:
        "HMAC JWT signing uses human-readable secrets, test defaults, shared application secrets, or secrets committed near the auth code.",
      detectionHint:
        "Look for short literals, default secret fallbacks, test strings, or cross-environment shared secrets used in JWT signing or verification.",
      fixHint:
        "Use high-entropy environment-managed secrets or asymmetric signing keys, rotate exposed keys, and avoid fallback defaults.",
      sources: [OWASP_JWT, OWASP_AUTH, CWE_347]
    },
    {
      id: "jwt-missing-registered-claim-validation",
      title: "Issuer, audience, expiry, not-before, or token type not enforced",
      symptom: "Tokens issued for another service, old tokens, future tokens, or wrong token types are accepted.",
      rootCause:
        "Signature verification succeeds but the application omits expected claim checks for issuer, audience, expiration, not-before, subject, or token type.",
      detectionHint:
        "Inspect verification options and post-verify checks for iss, aud, exp, nbf, sub, typ, clock tolerance, and maximum token age.",
      fixHint:
        "Require expected issuer and audience, enforce expiration and not-before, separate access and refresh token types, and test expired/wrong-audience tokens through the real API.",
      sources: [RFC_7519, RFC_8725, OWASP_JWT, CWE_613]
    },
    {
      id: "jwt-storage-and-revocation-gap",
      title: "JWT storage or revocation gap keeps stolen tokens useful",
      symptom: "A copied browser token remains usable after logout, role downgrade, password reset, or suspected theft.",
      rootCause:
        "Long-lived bearer tokens are stored in script-readable locations or have no revocation/version check for high-risk account changes.",
      detectionHint:
        "Look for localStorage/sessionStorage bearer tokens, long access-token TTLs, logout without revocation, or missing session version checks.",
      fixHint:
        "Use short-lived access tokens, protected refresh-token storage, revocation/version checks for sensitive changes, and real logout/role-change tests.",
      sources: [OWASP_JWT, OWASP_SESSION, CWE_613]
    }
  ]
};
