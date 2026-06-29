export const scenarios = [
  {
    id: "api-auth-weak-tests",
    title: "API/auth regression hidden by copied implementation tests",
    whyItMatters:
      "A coding agent can add tests that mirror the changed implementation while missing the real API authorization regression.",
    baselineFiles: {
      "package.json": JSON.stringify({ type: "module", scripts: { test: "node --test" } }, null, 2),
      "src/auth/session.js": [
        "export function canExportDiagnostics(session) {",
        "  if (!session?.userId) {",
        "    return false;",
        "  }",
        "",
        "  return session.role === \"admin\";",
        "}",
        "",
        "export function exportScope(session) {",
        "  return canExportDiagnostics(session) ? \"full\" : \"none\";",
        "}",
        ""
      ].join("\n"),
      "src/routes/export.js": [
        "import { canExportDiagnostics } from \"../auth/session.js\";",
        "",
        "export function exportDiagnostics(session, payload) {",
        "  if (!canExportDiagnostics(session)) {",
        "    return { status: 403, body: { error: \"forbidden\" } };",
        "  }",
        "",
        "  return { status: 200, body: { exported: true, deviceId: payload.deviceId } };",
        "}",
        ""
      ].join("\n"),
      "test/export.test.mjs": [
        "import { strictEqual } from \"node:assert\";",
        "import test from \"node:test\";",
        "import { exportDiagnostics } from \"../src/routes/export.js\";",
        "",
        "test(\"allows admins to export diagnostics\", () => {",
        "  const result = exportDiagnostics({ userId: \"u1\", role: \"admin\" }, { deviceId: \"imu-1\" });",
        "  strictEqual(result.status, 200);",
        "});",
        ""
      ].join("\n"),
      "scripts/probe-export.mjs": [
        "import { strictEqual } from \"node:assert\";",
        "import { exportDiagnostics } from \"../src/routes/export.js\";",
        "",
        "const result = exportDiagnostics({ userId: \"u2\", role: \"member\" }, { deviceId: \"imu-1\" });",
        "strictEqual(result.status, 403, \"member users must not export diagnostics\");",
        ""
      ].join("\n")
    },
    riskyFiles: {
      "src/auth/session.js": [
        "export function canExportDiagnostics(session) {",
        "  const hasUser = Boolean(session?.userId);",
        "  const hasAnyRole = Boolean(session?.role);",
        "  const safeMode = session?.flags?.includes(\"safe-mode\") ?? false;",
        "",
        "  return hasUser && (hasAnyRole || safeMode);",
        "}",
        "",
        "export function exportScope(session) {",
        "  return canExportDiagnostics(session) ? \"full\" : \"none\";",
        "}",
        ""
      ].join("\n"),
      "src/routes/export.js": [
        "import { canExportDiagnostics } from \"../auth/session.js\";",
        "",
        "export function exportDiagnostics(session, payload) {",
        "  if (!canExportDiagnostics(session)) {",
        "    return { status: 403, body: { error: \"forbidden\" } };",
        "  }",
        "",
        "  return { status: 200, body: { exported: true, deviceId: payload.deviceId, scope: \"full\" } };",
        "}",
        ""
      ].join("\n"),
      "test/export.test.mjs": [
        "import { strictEqual } from \"node:assert\";",
        "import test from \"node:test\";",
        "import { canExportDiagnostics } from \"../src/auth/session.js\";",
        "import { exportDiagnostics } from \"../src/routes/export.js\";",
        "",
        "function expectedCanExportDiagnostics(session) {",
        "  const hasUser = Boolean(session?.userId);",
        "  const hasAnyRole = Boolean(session?.role);",
        "  const safeMode = session?.flags?.includes(\"safe-mode\") ?? false;",
        "",
        "  return hasUser && (hasAnyRole || safeMode);",
        "}",
        "",
        "test(\"allows admins to export diagnostics\", () => {",
        "  const session = { userId: \"u1\", role: \"admin\" };",
        "  strictEqual(canExportDiagnostics(session), expectedCanExportDiagnostics(session));",
        "  strictEqual(exportDiagnostics(session, { deviceId: \"imu-1\" }).status, 200);",
        "});",
        ""
      ].join("\n")
    },
    weakTestCommand: ["node", "--test", "test/export.test.mjs"],
    probeCommand: ["node", "scripts/probe-export.mjs"],
    expected: {
      riskLevel: "high",
      impactedAreaKinds: ["api", "auth", "test"],
      findingRuleIds: [
        "risky-api-change",
        "risky-auth-change",
        "copied-implementation-in-test",
        "happy-path-only-test"
      ],
      redteamTestProofStatus: "weak",
      weakTestFindingsAtLeast: 1,
      missingTestFindingsAtLeast: 0
    }
  },
  {
    id: "config-db-runtime-regression",
    title: "Config/database runtime regression missed by normal tests",
    whyItMatters:
      "A PR can pass a narrow unit test while changing runtime defaults and database semantics that affect production behavior.",
    baselineFiles: {
      "package.json": JSON.stringify({ type: "module", scripts: { test: "node --test" } }, null, 2),
      "next.config.js": [
        "export function loadRuntimeConfig(env) {",
        "  if (!env.DATABASE_URL) {",
        "    throw new Error(\"DATABASE_URL is required\");",
        "  }",
        "",
        "  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {",
        "    throw new Error(\"SESSION_SECRET must be at least 16 characters\");",
        "  }",
        "",
        "  return {",
        "    databaseUrl: env.DATABASE_URL,",
        "    sessionSecret: env.SESSION_SECRET,",
        "    requireSsl: env.NODE_ENV === \"production\"",
        "  };",
        "}",
        ""
      ].join("\n"),
      "src/db/schema.js": [
        "export const userDefaults = {",
        "  role: \"member\",",
        "  isActive: true",
        "};",
        "",
        "export function createUserRecord(input) {",
        "  return {",
        "    id: input.id,",
        "    email: input.email,",
        "    role: input.role ?? userDefaults.role,",
        "    isActive: input.isActive ?? userDefaults.isActive",
        "  };",
        "}",
        ""
      ].join("\n"),
      "test/config.test.mjs": [
        "import { strictEqual } from \"node:assert\";",
        "import test from \"node:test\";",
        "import { loadRuntimeConfig } from \"../next.config.js\";",
        "",
        "test(\"loads configured database url\", () => {",
        "  const config = loadRuntimeConfig({",
        "    DATABASE_URL: \"postgres://local\",",
        "    SESSION_SECRET: \"0123456789abcdef\",",
        "    NODE_ENV: \"test\"",
        "  });",
        "  strictEqual(config.databaseUrl, \"postgres://local\");",
        "});",
        ""
      ].join("\n"),
      "scripts/probe-runtime.mjs": [
        "import { strictEqual, throws } from \"node:assert\";",
        "import { loadRuntimeConfig } from \"../next.config.js\";",
        "import { createUserRecord } from \"../src/db/schema.js\";",
        "",
        "throws(() => loadRuntimeConfig({ DATABASE_URL: \"postgres://local\" }), /SESSION_SECRET/);",
        "strictEqual(createUserRecord({ id: \"u1\", email: \"a@example.com\" }).role, \"member\");",
        ""
      ].join("\n")
    },
    riskyFiles: {
      "next.config.js": [
        "export function loadRuntimeConfig(env) {",
        "  const databaseUrl = env.DATABASE_URL ?? \"postgres://localhost/dev\";",
        "  const sessionSecret = env.SESSION_SECRET ?? \"dev-secret\";",
        "",
        "  return {",
        "    databaseUrl,",
        "    sessionSecret,",
        "    requireSsl: false",
        "  };",
        "}",
        ""
      ].join("\n"),
      "src/db/schema.js": [
        "export const userDefaults = {",
        "  role: \"admin\",",
        "  isActive: true",
        "};",
        "",
        "export function createUserRecord(input) {",
        "  return {",
        "    id: input.id,",
        "    email: input.email,",
        "    role: input.role ?? userDefaults.role,",
        "    isActive: input.isActive ?? userDefaults.isActive",
        "  };",
        "}",
        ""
      ].join("\n")
    },
    weakTestCommand: ["node", "--test", "test/config.test.mjs"],
    probeCommand: ["node", "scripts/probe-runtime.mjs"],
    expected: {
      riskLevel: "high",
      impactedAreaKinds: ["config", "database"],
      findingRuleIds: ["risky-config-change", "risky-database-change", "missing-nearby-tests"],
      redteamTestProofStatus: "missing",
      weakTestFindingsAtLeast: 0,
      missingTestFindingsAtLeast: 1
    }
  }
];
