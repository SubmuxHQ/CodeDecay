import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import { createAnalysisReport, type AnalyzerResult, type FileChange } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";

export function createFixtureAnalysisReport() {
  return createAnalysisReport({
    base: "main",
    head: "HEAD",
    changedFiles: createFixtureChangedFiles(),
    analyzerResult: createFixtureAnalyzerResult(),
    productFailureBundles: [
      {
        schemaVersion: 1,
        id: "api-session-invalid-token",
        checkId: "api.session.invalid-token",
        checkKind: "api",
        priority: "high",
        target: {
          id: "api",
          baseUrl: "http://127.0.0.1:3000"
        },
        title: "Session API invalid-token regression",
        summary: "Invalid tokens now return 500 instead of 401.",
        classification: "confirmed-regression",
        failedStep: {
          index: 1,
          label: "GET /api/session with invalid token",
          status: "failed"
        },
        neighboringSteps: [],
        artifacts: [
          {
            kind: "request-response-diff",
            path: ".codedecay/artifacts/api-session.diff"
          }
        ],
        expected: "401 JSON error",
        actual: "500 HTML error",
        impactedFiles: ["src/auth/session.ts"],
        suggestedFixTasks: ["Restore invalid-token handling."],
        rerunCommand: "npx codedecay product run --check api.session.invalid-token"
      }
    ],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });
}

export function createFixtureChangedFiles(): FileChange[] {
  return [
    {
      path: "src/auth/session.ts",
      status: "modified",
      additions: 8,
      deletions: 2,
      addedLines: [{ line: 2, content: "return { role: 'admin' };" }]
    },
    {
      path: "src/auth/session.test.ts",
      status: "modified",
      additions: 4,
      deletions: 1,
      addedLines: [{ line: 3, content: "validateSession('token');" }]
    }
  ];
}

export function createFixtureAnalyzerResult(): AnalyzerResult {
  return {
    impactedAreas: [
      {
        name: "Authentication and session management",
        kind: "auth",
        risk: "high",
        files: ["src/auth/session.ts"]
      },
      {
        name: "Tests",
        kind: "test",
        risk: "medium",
        files: ["src/auth/session.test.ts"]
      }
    ],
    impactedRoutes: [
      {
        framework: "nextjs",
        kind: "api-route",
        route: "/api/session",
        methods: ["GET"],
        files: ["src/auth/session.ts"],
        risk: "high",
        reasons: ["Protected session API route changed"],
        recommendedTests: ["Add an API-level session regression test"]
      }
    ],
    findings: [
      {
        ruleId: "auth-session-risk",
        title: "Auth/session boundary changed",
        description: "Authentication behavior changed and may affect protected routes.",
        severity: "high",
        category: "regression",
        file: "src/auth/session.ts",
        line: 2
      },
      {
        ruleId: "test-without-assertions",
        title: "Changed test has no assertions",
        description: "Test calls production code but does not assert the behavior.",
        severity: "medium",
        category: "coverage",
        file: "src/auth/session.test.ts",
        line: 3
      }
    ],
    recommendedTests: ["Add assertion for missing token session handling", "src/auth/session.test.ts"]
  };
}

export function createFixtureConfig(): CodeDecayConfig {
  return {
    version: 1,
    commands: {
      test: ["pnpm test"],
      build: [],
      start: []
    },
    probes: [{ name: "session probe", command: "node probe.js", timeoutMs: 1000 }],
    safety: {
      commandTimeoutMs: 120000,
      allowCommands: true
    },
    llm: {
      provider: "disabled",
      timeoutMs: 30000
    },
    toolAdapters: {
      playwright: {
        enabled: true
      },
      stryker: {
        enabled: false
      },
      schemathesis: {
        enabled: true,
        schema: "docs/openapi.yaml",
        baseUrl: "http://127.0.0.1:4000"
      },
      pact: {
        enabled: true,
        command: "pnpm run pact:verify"
      }
    },
    productTesting: {
      targets: {}
    },
    plugins: {
      enabled: []
    }
  };
}

export function createFixtureMemory(): CodeDecayMemory {
  return {
    version: 1,
    flows: [{ name: "Login flow", areas: ["auth"], checks: ["missing token"] }],
    commands: [],
    invariants: [
      {
        name: "Auth fails closed",
        description: "Anonymous users must never become admins.",
        severity: "high",
        areas: ["auth"]
      }
    ],
    architecture: [],
    regressions: [
      {
        title: "Anonymous admin",
        description: "A missing token previously created an admin session.",
        check: "request protected route without token"
      }
    ]
  };
}

export function createEmptyMemory(): CodeDecayMemory {
  return {
    version: 1,
    flows: [],
    commands: [],
    invariants: [],
    architecture: [],
    regressions: []
  };
}

export function createFixtureSkills() {
  return {
    sourceDir: "/repo/.agents/skills",
    skills: [
      {
        id: "pr-red-team",
        title: "PR Red-Team Skill",
        path: ".agents/skills/pr-red-team/SKILL.md",
        summary: "Find missed PR risks.",
        content: "# PR Red-Team Skill\n\nFind missed PR risks.\n",
        untrusted: true as const
      }
    ]
  };
}
