import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type BenchmarkArea = "security" | "regression" | "quality";

export interface BenchmarkRuleExpectation {
  ruleId: string;
  area: BenchmarkArea;
}

export interface BenchmarkScenario {
  id: string;
  kind: "positive" | "decoy";
  setup: () => string;
  expectedRuleIds: string[];
}

export interface BenchmarkCorpus {
  id: string;
  rules: BenchmarkRuleExpectation[];
  scenarios: BenchmarkScenario[];
  cleanup(): void;
}

const tempRoots: string[] = [];

export const DEFAULT_BENCHMARK_RULES: BenchmarkRuleExpectation[] = [
  { ruleId: "security-sql-injection", area: "security" },
  { ruleId: "security-hardcoded-secret", area: "security" },
  { ruleId: "security-missing-auth-entrypoint", area: "security" },
  { ruleId: "security-path-traversal", area: "security" },
  { ruleId: "security-ssrf", area: "security" },
  { ruleId: "security-command-injection", area: "security" },
  { ruleId: "security-jwt-unsafe-verification", area: "security" },
  { ruleId: "security-unsafe-html", area: "security" },
  { ruleId: "risky-api-change", area: "regression" },
  { ruleId: "risky-auth-change", area: "regression" },
  { ruleId: "risky-config-change", area: "regression" },
  { ruleId: "risky-database-change", area: "regression" },
  { ruleId: "missing-nearby-tests", area: "regression" },
  { ruleId: "test-without-assertions", area: "quality" },
  { ruleId: "happy-path-only-test", area: "quality" },
  { ruleId: "large-function", area: "quality" },
  { ruleId: "high-complexity", area: "quality" },
  { ruleId: "duplicated-added-logic", area: "quality" }
];

const UNIFIED_EXPECTED_RULE_IDS = DEFAULT_BENCHMARK_RULES
  .map((rule) => rule.ruleId)
  .filter((ruleId) => ruleId !== "missing-nearby-tests");

export function createDefaultBenchmarkCorpus(): BenchmarkCorpus {
  return {
    id: "default",
    rules: DEFAULT_BENCHMARK_RULES,
    scenarios: [
      {
        id: "unified-harness-planted-issues",
        kind: "positive",
        setup: createUnifiedHarnessPlantedIssueRepo,
        expectedRuleIds: UNIFIED_EXPECTED_RULE_IDS
      },
      {
        id: "missing-real-api-test",
        kind: "positive",
        setup: createMissingRealApiTestRepo,
        expectedRuleIds: ["missing-nearby-tests"]
      },
      {
        id: "docs-only-clean-decoy",
        kind: "decoy",
        setup: createDocsOnlyCleanDecoyRepo,
        expectedRuleIds: []
      },
      {
        id: "jwt-auth-clean-decoy",
        kind: "decoy",
        setup: createJwtAuthDecoyRepo,
        expectedRuleIds: []
      }
    ],
    cleanup: cleanupBenchmarkCorpus
  };
}

export function cleanupBenchmarkCorpus(): void {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function createUnifiedHarnessPlantedIssueRepo(): string {
  const repo = createRepo({
    "src/api/search.ts": "export async function searchUsers(db, req) { return db.query('select 1'); }\n",
    "src/api/files.ts": "export function readUpload() { return 'ok'; }\n",
    "src/api/proxy.ts": "export async function proxy() { return fetch('https://example.com'); }\n",
    "src/api/archive.ts": "export function archive() { return 'ok'; }\n",
    "app/api/admin/route.ts": "export async function POST(request: Request) { return Response.json({ ok: true }); }\n",
    "src/auth/session.ts": "export function requireAdmin(session) { return session?.role === 'admin'; }\n",
    "src/auth/jwt.ts": "export function readClaims(jwt, token) { return jwt.verify(token, 'secret'); }\n",
    "src/config/secrets.ts": "export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;\n",
    "src/db/schema.prisma": "model User { id String @id role String @default(\"member\") }\n",
    "next.config.js": "export default { reactStrictMode: true };\n",
    "src/app/comment.tsx": "export function Comment({ html }) { return <p>{html}</p>; }\n",
    "src/api/risk.ts": "export function score(input) { return input ? 1 : 0; }\n",
    "src/api/users.ts": "export async function canUseAccount(input) { return Boolean(input.userId); }\n",
    "src/api/admin.ts": "export async function canUseAdmin(input) { return Boolean(input.userId); }\n",
    "test/search.test.ts": [
      "import { test } from 'node:test';",
      "import { searchUsers } from '../src/api/search';",
      "",
      "test('searches users', () => {",
      "  searchUsers({}, { query: { q: 'alice' } });",
      "});",
      ""
    ].join("\n")
  });

  const duplicateBlock = [
    "  const userId = input.userId;",
    "  const account = await loadAccount(userId);",
    "  if (!account) throw new Error('missing account');",
    "  return account.status === 'active';"
  ];
  writeFile(
    repo,
    "src/api/search.ts",
    [
      "export async function searchUsers(db, req) {",
      "  return db.query(`select * from users where name = '${req.query.q}'`);",
      "}",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "src/api/files.ts",
    [
      "import { readFileSync } from 'node:fs';",
      "",
      "export function readUpload(req) {",
      "  return readFileSync(req.query.file, 'utf8');",
      "}",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "src/api/proxy.ts",
    [
      "export async function proxy(req) {",
      "  return fetch(req.query.url);",
      "}",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "src/api/archive.ts",
    [
      "import { exec } from 'node:child_process';",
      "",
      "export function archive(req) {",
      "  return exec(`tar -czf ${req.query.name}.tgz uploads/${req.query.name}`);",
      "}",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "app/api/admin/route.ts",
    [
      "export async function POST(request: Request) {",
      "  const body = await request.json();",
      "  return Response.json({ created: true, user: body.email });",
      "}",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "src/auth/session.ts",
    [
      "export function requireAdmin(session) {",
      "  return Boolean(session?.userId);",
      "}",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "src/auth/jwt.ts",
    [
      "import jwt from 'jsonwebtoken';",
      "",
      "export function readClaims(token) {",
      "  const claims = jwt.decode(token);",
      "  return { userId: claims.sub, role: claims.role };",
      "}",
      "",
      "export function verifyLegacy(token, secret) {",
      "  return jwt.verify(token, secret, { ignoreExpiration: true });",
      "}",
      ""
    ].join("\n")
  );
  writeFile(repo, "src/config/secrets.ts", "export const STRIPE_SECRET_KEY = \"sk_live_1234567890abcdef\";\n");
  writeFile(repo, "src/db/schema.prisma", "model User { id String @id role String @default(\"admin\") }\n");
  writeFile(repo, "next.config.js", "export default { reactStrictMode: false, poweredByHeader: true };\n");
  writeFile(
    repo,
    "src/app/comment.tsx",
    "export function Comment({ html }) { return <div dangerouslySetInnerHTML={{ __html: html }} />; }\n"
  );
  writeFile(repo, "src/api/risk.ts", createBranchingFunction("score", 20));
  writeFile(repo, "src/api/users.ts", ["export async function canUseAccount(input) {", ...duplicateBlock, "}", ""].join("\n"));
  writeFile(repo, "src/api/admin.ts", ["export async function canUseAdmin(input) {", ...duplicateBlock, "}", ""].join("\n"));
  writeFile(
    repo,
    "test/search.test.ts",
    [
      "import { test } from 'node:test';",
      "import { strictEqual } from 'node:assert';",
      "import { searchUsers } from '../src/api/search';",
      "",
      "test('searches users', () => {",
      "  searchUsers({}, { query: { q: 'alice' } });",
      "});",
      "",
      "test('allows happy path admin', () => {",
      "  const session = { userId: 'u1', role: 'admin' };",
      "  strictEqual(session.role, 'admin');",
      "});",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "test/proxy.test.ts",
    [
      "import { test } from 'node:test';",
      "import { proxy } from '../src/api/proxy';",
      "",
      "test('proxies a url', () => {",
      "  proxy({ query: { url: 'https://example.com' } });",
      "});",
      ""
    ].join("\n")
  );

  return repo;
}

export function createMissingRealApiTestRepo(): string {
  const repo = createRepo({
    "src/api/orders.ts": "export function listOrders() { return []; }\n"
  });

  writeFile(
    repo,
    "src/api/orders.ts",
    [
      "export function listOrders(req) {",
      "  if (req.query.includeDeleted) return [{ id: 'deleted' }];",
      "  return [{ id: 'active' }];",
      "}",
      ""
    ].join("\n")
  );

  return repo;
}

export function createDocsOnlyCleanDecoyRepo(): string {
  const repo = createRepo({
    "README.md": "# Project\n"
  });

  writeFile(repo, "docs/review-checklist.md", "# Review checklist\n\n- Run tests.\n- Check API behavior.\n");
  return repo;
}

export function createJwtAuthDecoyRepo(): string {
  const repo = createRepo({
    "src/auth/jwt.ts": "export function verify(token, publicKey) { return jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: 'issuer', audience: 'api' }); }\n",
    "src/docs/jwt-notes.ts": "export const note = 'decode JWTs only for debugging, never for authentication';\n"
  });

  writeFile(
    repo,
    "src/auth/jwt.ts",
    [
      "import jwt from 'jsonwebtoken';",
      "",
      "export function verifyAccessToken(token, publicKey) {",
      "  return jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: 'issuer', audience: 'api' });",
      "}",
      ""
    ].join("\n")
  );
  writeFile(repo, "src/docs/jwt-notes.ts", "export const note = 'jwt.decode is for inspection only, not authentication';\n");

  return repo;
}

function createBranchingFunction(name: string, ifCount: number): string {
  return [
    `export function ${name}(input) {`,
    "  let score = 0;",
    ...Array.from({ length: 130 }, (_, index) => `  const baseline${index} = ${index};`),
    ...Array.from({ length: ifCount }, (_, index) => `  if (input.flag${index}) score += ${index};`),
    "  return score + baseline0;",
    "}",
    ""
  ].join("\n");
}

function createRepo(files: Record<string, string>): string {
  const repo = createTempDir();
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "codedecay@example.com"]);
  git(repo, ["config", "user.name", "CodeDecay Test"]);

  for (const [path, contents] of Object.entries(files)) {
    writeFile(repo, path, contents);
  }

  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function createTempDir(): string {
  const root = execFileSync("mktemp", ["-d", join(tmpdir(), "codedecay-benchmark-XXXXXX")], {
    encoding: "utf8"
  }).trim();
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore"
  });
}
