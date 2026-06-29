export function lowRiskBaselineFiles() {
  return {
    "README.md": "# Low risk demo\n",
    ".gitignore": "codedecay-output/\n"
  };
}

export function lowRiskChangedFiles() {
  return {
    "README.md": "# Low risk demo\n\nDocs-only change.\n"
  };
}

export function mediumRiskBaselineFiles() {
  return {
    "src/app/dashboard/page.tsx": "export default function Page() { return <main>Dashboard</main>; }\n",
    "src/app/settings/page.tsx": "export default function Page() { return <main>Settings</main>; }\n",
    "src/app/reports/page.tsx": "export default function Page() { return <main>Reports</main>; }\n",
    "src/app/profile/page.tsx": "export default function Page() { return <main>Profile</main>; }\n",
    "src/app/billing/page.tsx": "export default function Page() { return <main>Billing</main>; }\n",
    ".gitignore": "codedecay-output/\n"
  };
}

export function mediumRiskChangedFiles() {
  return {
    "src/app/dashboard/page.tsx": "export default function Page() { return <main>Dashboard changed</main>; }\n",
    "src/app/settings/page.tsx": "export default function Page() { return <main>Settings changed</main>; }\n",
    "src/app/reports/page.tsx": "export default function Page() { return <main>Reports changed</main>; }\n",
    "src/app/profile/page.tsx": "export default function Page() { return <main>Profile changed</main>; }\n",
    "src/app/billing/page.tsx": "export default function Page() { return <main>Billing changed</main>; }\n"
  };
}

export function prSafetyBaselineFiles() {
  return {
    ".gitignore": "codedecay-output/\n",
    "README.md": "# PR safety demo\n\nA local demo repo for CodeDecay end-user testing.\n",
    "package.json": JSON.stringify(
      {
        name: "codedecay-pr-safety-demo",
        private: true,
        type: "module",
        scripts: {
          test: "node scripts/unit-smoke.mjs",
          build: "node scripts/build-smoke.mjs",
          start: "node scripts/start-smoke.mjs",
          "probe:behavior": "node scripts/probe-behavior.mjs"
        }
      },
      null,
      2
    ),
    ".codedecay/config.yml": [
      "version: 1",
      "",
      "commands:",
      "  test:",
      "    - node scripts/unit-smoke.mjs",
      "  build:",
      "    - node scripts/build-smoke.mjs",
      "  start:",
      "    - node scripts/start-smoke.mjs",
      "",
      "probes:",
      "  - name: behavior probe",
      "    command: node scripts/probe-behavior.mjs",
      "    timeoutMs: 5000",
      "",
      "toolAdapters:",
      "  playwright:",
      "    command: node scripts/user-flow-smoke.mjs",
      "  stryker:",
      "    command: node scripts/mutation-smoke.mjs",
      "  schemathesis:",
      "    command: node scripts/api-fuzz-smoke.mjs",
      "  pact:",
      "    command: node scripts/pact-verify.mjs",
      "",
      "safety:",
      "  commandTimeoutMs: 5000",
      "  allowCommands: true",
      "",
      "llm:",
      "  provider: disabled",
      "  timeoutMs: 30000",
      ""
    ].join("\n"),
    ".codedecay/memory.json": JSON.stringify(
      {
        version: 1,
        flows: [
          {
            name: "Admin user lookup",
            areas: ["api", "auth", "database"],
            checks: ["anonymous request", "missing role", "deleted user"]
          }
        ],
        commands: [
          {
            name: "Behavior probe",
            command: "node scripts/probe-behavior.mjs",
            areas: ["api", "auth"]
          }
        ],
        invariants: [
          {
            name: "Auth fails closed",
            description: "Missing or malformed credentials must never become admin users.",
            areas: ["auth"],
            severity: "high"
          }
        ],
        architecture: [
          {
            title: "API route owns validation",
            note: "Route handlers must validate request shape before touching persistence.",
            areas: ["api"]
          }
        ],
        regressions: [
          {
            title: "Anonymous admin fallback",
            description: "A previous auth fallback allowed anonymous admin access.",
            areas: ["auth", "api"],
            check: "Request users API without a token",
            severity: "high"
          }
        ]
      },
      null,
      2
    ),
    ".agents/skills/pr-red-team/SKILL.md": [
      "---",
      "name: pr-red-team",
      "description: Use when reviewing CodeDecay pull requests or running a red-team review with CodeDecay to find regression risk, missing tests, and hidden merge blockers before merge.",
      "---",
      "",
      "# PR Red-Team Skill",
      "",
      "Find missed user-facing regressions before merge.",
      ""
    ].join("\n"),
    ".agents/skills/test-quality-review/SKILL.md": [
      "---",
      "name: test-quality-review",
      "description: Use when a pull request adds or changes tests, or when CodeDecay reports missing tests, to identify weak tests that do not prove real behavior.",
      "---",
      "",
      "# Test Quality Review Skill",
      "",
      "Question tests that only prove mocks.",
      ""
    ].join("\n"),
    "src/lib/behavior-state.json": JSON.stringify(
      {
        mode: "baseline",
        allowsAnonymousAdmin: false,
        usersApiValidatesInput: true,
        mutationScore: 91
      },
      null,
      2
    ),
    "src/lib/auth/session.ts": [
      "export function requireSession(token?: string) {",
      "  if (!token) return null;",
      "  return { userId: 'u_123', role: 'user' };",
      "}",
      ""
    ].join("\n"),
    "src/app/api/users/route.ts": [
      "import { requireSession } from '../../../lib/auth/session';",
      "",
      "export async function GET(request: Request) {",
      "  const session = requireSession(request.headers.get('authorization') ?? undefined);",
      "  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });",
      "  return Response.json([{ id: 'u_123', role: session.role }]);",
      "}",
      ""
    ].join("\n"),
    "src/app/dashboard/page.tsx": "export default function Page() { return <main>Dashboard</main>; }\n",
    "src/lib/formatUser.ts": "export function formatUser(user: { id: string }) { return user.id.trim(); }\n",
    "src/lib/formatUser.test.ts": [
      "import { formatUser } from './formatUser';",
      "test('formats user ids', () => {",
      "  expect(formatUser({ id: ' u_123 ' })).toBe('u_123');",
      "});",
      ""
    ].join("\n"),
    "prisma/schema.prisma": [
      "model User {",
      "  id String @id",
      "  email String @unique",
      "}",
      ""
    ].join("\n"),
    "next.config.js": "export default { reactStrictMode: true };\n",
    "scripts/probe-behavior.mjs": scriptReadBehavior("console.log(JSON.stringify(state));"),
    "scripts/unit-smoke.mjs": scriptReadBehavior(
      "console.log(JSON.stringify({ check: 'unit-smoke', passed: true, mode: state.mode }));"
    ),
    "scripts/build-smoke.mjs": "console.log(JSON.stringify({ check: 'build-smoke', passed: true }));\n",
    "scripts/start-smoke.mjs": "console.log(JSON.stringify({ check: 'start-smoke', passed: true }));\n",
    "scripts/user-flow-smoke.mjs": scriptReadBehavior([
      "if (state.allowsAnonymousAdmin) {",
      "  console.error('browser flow detected anonymous admin access');",
      "  process.exit(1);",
      "}",
      "console.log(JSON.stringify({ check: 'browser-flow', passed: true }));"
    ].join("\n")),
    "scripts/mutation-smoke.mjs": scriptReadBehavior([
      "if (state.mutationScore < 60) {",
      "  console.error(`mutation score too low: ${state.mutationScore}`);",
      "  process.exit(1);",
      "}",
      "console.log(JSON.stringify({ check: 'mutation', score: state.mutationScore }));"
    ].join("\n")),
    "scripts/api-fuzz-smoke.mjs": scriptReadBehavior([
      "if (!state.usersApiValidatesInput) {",
      "  console.error('api fuzz check found missing input validation');",
      "  process.exit(1);",
      "}",
      "console.log(JSON.stringify({ check: 'api-fuzz', passed: true }));"
    ].join("\n")),
    "scripts/pact-verify.mjs": "console.log(JSON.stringify({ check: 'contract', passed: true }));\n"
  };
}

export function prSafetyRiskyFiles() {
  return {
    "src/lib/behavior-state.json": JSON.stringify(
      {
        mode: "risky",
        allowsAnonymousAdmin: true,
        usersApiValidatesInput: false,
        mutationScore: 38
      },
      null,
      2
    ),
    "src/lib/auth/session.ts": [
      "export function requireSession(token?: string) {",
      "  if (!token) return { userId: 'anonymous', role: 'admin' };",
      "  return { userId: 'u_123', role: 'admin' };",
      "}",
      ""
    ].join("\n"),
    "src/app/api/users/route.ts": [
      "import { requireSession } from '../../../lib/auth/session';",
      "",
      "export async function GET(request: Request) {",
      "  const session = requireSession(request.headers.get('authorization') ?? undefined);",
      "  return Response.json([{ id: session?.userId ?? 'anonymous', role: session?.role ?? 'admin' }]);",
      "}",
      "",
      "export async function POST(request: Request) {",
      "  const body = await request.json();",
      "  return Response.json({ id: body.id, role: body.role ?? 'admin' });",
      "}",
      ""
    ].join("\n"),
    "src/app/dashboard/page.tsx": "export default function Page() { return <main>Admin dashboard changed</main>; }\n",
    "src/lib/auth/session.test.ts": [
      "import { requireSession } from './session';",
      "test('creates a fallback session', () => {",
      "  requireSession(undefined);",
      "});",
      ""
    ].join("\n"),
    "prisma/schema.prisma": [
      "model User {",
      "  id String @id",
      "  email String @unique",
      "  role String @default(\"admin\")",
      "}",
      ""
    ].join("\n"),
    "next.config.js": "export default { reactStrictMode: false, experimental: { serverActions: true } };\n"
  };
}

function scriptReadBehavior(body) {
  return [
    "import { readFileSync } from 'node:fs';",
    "const state = JSON.parse(readFileSync(new URL('../src/lib/behavior-state.json', import.meta.url), 'utf8'));",
    body,
    ""
  ].join("\n");
}

