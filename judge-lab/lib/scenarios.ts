import weakTestArtifact from "../public/evidence/weak-test-report.json";
import type {
  JudgeFinding,
  JudgeLabResult,
  ReviewState,
  ScenarioId,
  ScenarioSummary,
} from "./contracts";
import { sourceCommit, sourceLinks } from "./source";

const GUARDED_ROUTE = `import { requireSession } from "../../../lib/auth/session";

export async function GET(request: Request) {
  const session = requireSession(request.headers.get("authorization"));
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json([{ id: session.userId, role: session.role }]);
}`;

const BROKEN_ROUTE = `export async function GET() {
  return Response.json([{ id: "anonymous", role: "admin" }]);
}

export async function POST(request: Request) {
  const body = await request.json();
  const ADMIN_API_SECRET = "codedecay_judge_lab_admin_2026";
  await db.query(\`SELECT * FROM users WHERE id = '\${body.id}'\`);
  return Response.json({ id: body.id, role: body.role ?? "admin" });
}`;

const BASE_TEST = `test("normalizes a device ID", () => {
  expect(normalizeUserId(" SENSOR-123 ")).toBe("sensor");
});`;

const WEAK_TEST = `vi.mock("./normalize", () => ({
  normalizeUserId: vi.fn(() => "sensor"),
}));

function copiedNormalize(value: string) {
  const normalized = value.trim().toLowerCase();
  const bounded = normalized.slice(0, 8);
  return bounded.replace(/[^a-z]/g, "");
}

expect(normalizeUserId(input)).toBe(copiedNormalize(input));`;

const STRONG_TEST = `test("normalizes through the real public module", () => {
  expect(normalizeUserId(" SENSOR-123 ")).toBe("sensor");
  expect(normalizeUserId("")).toBe("");
  expect(normalizeUserId("0123456789")).toBe("");
});`;

const DECOY_BEFORE = `# Install
npm install @submuxhq/codedecay`;
const DECOY_AFTER = `# Install
pnpm add -D @submuxhq/codedecay`;

export const SCENARIOS: ScenarioSummary[] = [
  {
    id: "auth-api",
    title: "Anonymous admin API",
    kicker: "Broken auth / API PR",
    blurb: "A shallow unit check passes while a real users route becomes public.",
    mode: "live",
  },
  {
    id: "weak-test",
    title: "The test that tests itself",
    kicker: "Weak-test PR",
    blurb: "The changed test mocks the module and copies its implementation.",
    mode: "precomputed",
  },
  {
    id: "clean-decoy",
    title: "Harmless docs cleanup",
    kicker: "Clean decoy",
    blurb: "A low-risk change proves the lab does not invent drama.",
    mode: "live",
  },
];

export interface ScenarioMaterial {
  file: string;
  before: string;
  after: string;
  route: string;
  methods: string[];
  userImpact: string;
  testProof: JudgeLabResult["testProof"];
  edgeCases: string[];
  repairTasks: string[];
  verification: string[];
}

export function scenarioMaterial(scenarioId: ScenarioId, state: ReviewState): ScenarioMaterial {
  if (scenarioId === "auth-api") {
    const after = state === "risky" ? BROKEN_ROUTE : GUARDED_ROUTE;
    return {
      file: "src/app/api/users/route.ts",
      before: state === "repaired" ? BROKEN_ROUTE : GUARDED_ROUTE,
      after,
      route: "/api/users",
      methods: ["GET", ...(state === "risky" ? ["POST"] : [])],
      userImpact:
        state === "risky"
          ? "An anonymous visitor can read users as an admin and create admin-shaped records."
          : "Anonymous requests fail closed before user data is returned.",
      testProof:
        state === "risky"
          ? {
              status: "weak",
              detail:
                "A shallow session test executes the helper but never calls the real route anonymously.",
            }
          : {
              status: "present",
              detail:
                "Route-level checks cover anonymous 401, invalid roles, and an authenticated success path.",
            },
      edgeCases: [
        "Missing Authorization header",
        "Malformed or expired token",
        "Authenticated non-admin role",
        "POST body with a forged admin role",
      ],
      repairTasks:
        state === "risky"
          ? [
              "Restore a fail-closed session guard inside the route.",
              "Validate POST input and reject caller-supplied privilege.",
              "Add a route-level anonymous request regression test.",
            ]
          : ["Keep the real route check in CI and rerun CodeDecay after auth changes."],
      verification: [
        "GET /api/users without a token returns 401",
        "POST cannot assign an admin role from request input",
        "Run the configured API/user-flow checks",
      ],
    };
  }

  if (scenarioId === "weak-test") {
    const after = state === "base" ? BASE_TEST : state === "repaired" ? STRONG_TEST : WEAK_TEST;
    return {
      file: "src/imu/normalize.test.ts",
      before: state === "repaired" ? WEAK_TEST : BASE_TEST,
      after,
      route: "normalizeUserId() public module",
      methods: ["MODULE"],
      userImpact:
        state === "risky"
          ? "Malformed device IDs can reach production even though the mirrored test remains green."
          : "The real exported behavior is exercised with boundary inputs.",
      testProof:
        state === "risky"
          ? {
              status: "weak",
              detail:
                "Deterministic audit: the test mocks the changed module and duplicates three implementation statements.",
            }
          : {
              status: "present",
              detail:
                "The repaired test imports the real module and checks empty, long, and malformed values.",
            },
      edgeCases: [
        "Empty ID",
        "Digits-only ID",
        "Unicode input",
        "Input longer than eight characters",
      ],
      repairTasks:
        state === "risky"
          ? [
              "Remove the mock around the changed source module.",
              "Delete the copied implementation from the test.",
              "Exercise the exported function and a downstream consumer.",
            ]
          : ["Retain real-module coverage and add a downstream device registration check."],
      verification: [
        "No vi.mock call targets the changed module",
        "Assertions fail when normalization logic is mutated",
        "Boundary cases execute the real export",
      ],
    };
  }

  return {
    file: "README.md",
    before: DECOY_BEFORE,
    after: state === "base" ? DECOY_BEFORE : DECOY_AFTER,
    route: "No runtime route",
    methods: ["DOCS"],
    userImpact: "No production code path changes; installation wording becomes pnpm-specific.",
    testProof: {
      status: "not-applicable",
      detail: "No executable source changed, so CodeDecay does not demand runtime proof.",
    },
    edgeCases: [
      "Confirm the package name is unchanged",
      "Keep npm instructions elsewhere if supported",
    ],
    repairTasks: ["No code repair required. Review the command for documentation accuracy."],
    verification: ["Render README", "Confirm package installation command"],
  };
}

export function precomputedWeakTest(state: ReviewState): JudgeLabResult {
  const material = scenarioMaterial("weak-test", state);
  const risky = state === "risky";
  const findings: JudgeFinding[] = risky
    ? weakTestArtifact.findings.map((finding) => ({
        ...finding,
        severity: finding.severity as JudgeFinding["severity"],
        evidenceKind: finding.evidenceKind as JudgeFinding["evidenceKind"],
      }))
    : [];
  const commit = sourceCommit();

  return {
    scenarioId: "weak-test",
    scenarioTitle: "The test that tests itself",
    scenarioKicker: "Weak-test PR",
    state,
    execution: {
      mode: "precomputed",
      label: "Precomputed with the release-candidate analyzer; no model call",
      engineVersion: weakTestArtifact.engineVersion,
      sourceCommit: commit,
      generatedAt: weakTestArtifact.generatedAt,
      durationMs: null,
      reproduction: "pnpm judge-lab:evidence",
    },
    diff: { file: material.file, before: material.before, after: material.after },
    summary: {
      riskLevel: risky ? "high" : "low",
      mergeRiskScore: risky ? 70 : 8,
      securityScore: 0,
      recommendation: risky
        ? "Block merge until the test exercises the real module."
        : "Low deterministic risk. Review normally.",
    },
    impactedRoute: {
      route: material.route,
      methods: material.methods,
      userImpact: material.userImpact,
    },
    testProof: material.testProof,
    findings,
    edgeCases: material.edgeCases,
    repairTasks: material.repairTasks,
    verification: material.verification,
    links: sourceLinks(commit),
  };
}
