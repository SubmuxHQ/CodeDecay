import type { CodeDecayReport, ImpactedArea } from "@submuxhq/codedecay-core";
import type { RedteamPatternInsight } from "./types";

interface PatternPackEntry {
  id: string;
  title: string;
  areas: ImpactedArea["kind"][];
  fileKeywords: string[];
  edgeCases: string[];
  weakTestSigns: string[];
  suggestedChecks: string[];
  citations: Array<{ title: string; url: string }>;
}

const PATTERN_PACK: PatternPackEntry[] = [
  {
    id: "owasp-auth-session-negative-paths",
    title: "Auth and session boundaries fail closed",
    areas: ["auth", "api"],
    fileKeywords: ["auth", "session", "jwt", "token", "permission", "middleware"],
    edgeCases: [
      "Check missing, expired, malformed, replayed, and wrong-scope credentials.",
      "Verify anonymous or fallback users do not inherit privileged defaults.",
      "Exercise denied routes through the real API or middleware path and verify they fail closed."
    ],
    weakTestSigns: [
      "Tests call a helper directly but never hit protected routes.",
      "Tests only cover valid credentials or happy-path sessions.",
      "Auth mocks bypass middleware, cookie parsing, or token validation."
    ],
    suggestedChecks: [
      "Exercise protected routes without credentials, with malformed credentials, and with lower-privilege credentials.",
      "Add integration coverage around middleware/session parsing instead of only helper-level unit tests."
    ],
    citations: [
      {
        title: "OWASP Authentication Cheat Sheet",
        url: "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html"
      },
      {
        title: "OWASP Session Management Cheat Sheet",
        url: "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html"
      }
    ]
  },
  {
    id: "api-schema-fuzz-boundaries",
    title: "API schemas need malformed and boundary-value requests",
    areas: ["api"],
    fileKeywords: ["api", "route", "controller", "openapi", "graphql", "handler"],
    edgeCases: [
      "Check missing required fields, unknown fields, malformed JSON, invalid enum values, and boundary numbers.",
      "Exercise method, content-type, and auth combinations that normal unit tests do not generate.",
      "Verify downstream error responses do not leak internals or return successful status codes."
    ],
    weakTestSigns: [
      "Tests construct handler inputs directly instead of sending real HTTP requests.",
      "Only one valid payload shape is tested.",
      "No test proves OpenAPI or GraphQL contract compatibility."
    ],
    suggestedChecks: [
      "Run schema-driven API fuzzing with Schemathesis when an OpenAPI or GraphQL schema exists.",
      "Add route-level tests for malformed, missing, and boundary-value payloads."
    ],
    citations: [
      {
        title: "Schemathesis documentation",
        url: "https://schemathesis.readthedocs.io/"
      },
      {
        title: "OWASP REST Security Cheat Sheet",
        url: "https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html"
      }
    ]
  },
  {
    id: "database-schema-compatibility",
    title: "Database and schema changes need existing-data compatibility checks",
    areas: ["database"],
    fileKeywords: ["schema", "migration", "prisma", "database", "model", "sql"],
    edgeCases: [
      "Check existing rows with null, missing, duplicate, or legacy values.",
      "Verify backfill, rollback, and deployment-order compatibility.",
      "Exercise read paths and write paths that depend on new defaults or constraints."
    ],
    weakTestSigns: [
      "Tests use only freshly-created records that already match the new schema.",
      "No fixture covers legacy production-shaped data.",
      "Migration or generated schema changes have no API or product-flow proof."
    ],
    suggestedChecks: [
      "Add a legacy-data fixture that exercises reads and writes after the schema change.",
      "Run migration/schema checks plus one real API or product flow that depends on the changed field."
    ],
    citations: [
      {
        title: "OWASP Input Validation Cheat Sheet",
        url: "https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html"
      }
    ]
  },
  {
    id: "browser-user-flow-states",
    title: "User flows need loading, empty, error, and permission states",
    areas: ["ui"],
    fileKeywords: ["page", "component", "ui", "dashboard", "form", "view"],
    edgeCases: [
      "Check loading, empty, error, disabled, and permission-denied states.",
      "Verify keyboard, mobile viewport, and repeated-action behavior.",
      "Exercise real browser navigation and API failures, not only component snapshots."
    ],
    weakTestSigns: [
      "Snapshot-only tests without assertions about behavior.",
      "Component tests mock all data and never exercise the route.",
      "No browser or integration test covers the changed user flow."
    ],
    suggestedChecks: [
      "Run a Playwright user-flow check for the changed route.",
      "Add assertions for empty, error, and permission-denied UI states."
    ],
    citations: [
      {
        title: "Playwright documentation",
        url: "https://playwright.dev/docs/intro"
      }
    ]
  },
  {
    id: "mutation-tested-test-quality",
    title: "Passing tests may not protect behavior",
    areas: ["test"],
    fileKeywords: ["test", "spec", "__tests__", "mock", "fixture"],
    edgeCases: [
      "Verify a change in branch condition, boundary comparison, or returned value makes at least one test fail.",
      "Check mocks do not duplicate the same implementation logic they claim to verify.",
      "Add assertions for user/API-visible behavior, not only internal call shape."
    ],
    weakTestSigns: [
      "No assertions, snapshot-only assertions, or broad mocks around changed source.",
      "The expected value is computed by copied production logic.",
      "The test would pass if the real route, database, or downstream integration broke."
    ],
    suggestedChecks: [
      "Run StrykerJS mutation testing for changed modules when unit tests look suspicious.",
      "Replace implementation-shaped assertions with behavior or contract assertions."
    ],
    citations: [
      {
        title: "StrykerJS documentation",
        url: "https://stryker-mutator.io/docs/"
      }
    ]
  },
  {
    id: "supply-chain-config-checks",
    title: "Build and dependency changes need supply-chain checks",
    areas: ["config"],
    fileKeywords: ["package.json", "lock", "workflow", "dockerfile", "config", "ci"],
    edgeCases: [
      "Check lockfile drift, optional dependency differences, and CI-only install behavior.",
      "Verify workflow permission changes and dependency update posture.",
      "Run production build/start behavior in a clean environment."
    ],
    weakTestSigns: [
      "Only local tests ran, with no clean install/build proof.",
      "Dependency or workflow changes were merged without vulnerability or supply-chain checks.",
      "Config tests do not cover production-like environment variables."
    ],
    suggestedChecks: [
      "Run a clean install/build and dependency vulnerability scan such as OSV-Scanner.",
      "Review repository hardening with OpenSSF Scorecard when CI or workflow files change."
    ],
    citations: [
      {
        title: "OSV-Scanner documentation",
        url: "https://google.github.io/osv-scanner/"
      },
      {
        title: "OpenSSF Scorecard",
        url: "https://github.com/ossf/scorecard"
      }
    ]
  }
];

export function matchPatternIntelligence(report: CodeDecayReport): RedteamPatternInsight[] {
  const areaKinds = new Set(report.impactedAreas.map((area) => area.kind));
  const changedPaths = report.changedFiles.map((file) => file.path.toLowerCase());
  const insights: RedteamPatternInsight[] = [];

  for (const pattern of PATTERN_PACK) {
    const areaMatch = pattern.areas.some((area) => areaKinds.has(area));
    const fileMatch = changedPaths.some((path) => pattern.fileKeywords.some((keyword) => path.includes(keyword)));
    if (!areaMatch && !fileMatch) {
      continue;
    }

    insights.push({
      id: pattern.id,
      title: pattern.title,
      areas: pattern.areas,
      edgeCases: pattern.edgeCases,
      weakTestSigns: pattern.weakTestSigns,
      suggestedChecks: pattern.suggestedChecks,
      citations: pattern.citations,
      trust: "pattern-pack",
      proof: "suggestion"
    });
  }

  return insights.sort((left, right) => left.title.localeCompare(right.title));
}
