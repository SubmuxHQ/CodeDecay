import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECURITY_MATCHERS,
  createSecurityMatcherRegistry,
  scanSecurityCandidates
} from "../src/index";

describe("security matcher registry", () => {
  it("rejects duplicate matcher rule ids", () => {
    const matcher = DEFAULT_SECURITY_MATCHERS[0];

    if (!matcher) {
      throw new Error("Expected a default matcher");
    }

    const registry = createSecurityMatcherRegistry([matcher]);

    expect(() => registry.register(matcher)).toThrow("Security matcher already registered");
  });

  it("fires every default matcher example", () => {
    for (const matcher of DEFAULT_SECURITY_MATCHERS) {
      for (const example of matcher.examples) {
        const matches = matcher.match({
          filePath: example.filePath,
          content: example.content
        });

        expect(matches, `${matcher.ruleId} should match ${example.filePath}`).toEqual(
          expect.arrayContaining([expect.objectContaining({ ruleId: matcher.ruleId })])
        );
      }
    }
  });
});

describe("scanSecurityCandidates", () => {
  it("returns deterministic candidates and findings for high-value security signals", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/api/users.ts",
          content: [
            "export async function GET(req) {",
            "  await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${req.query.id}`);",
            "  return Response.json({ ok: true });",
            "}"
          ].join("\n")
        },
        {
          path: "src/app/comment.tsx",
          content: "return <div dangerouslySetInnerHTML={{ __html: comment.body }} />;"
        }
      ]
    });

    expect(result.scannedFiles).toEqual(["src/api/users.ts", "src/app/comment.tsx"]);
    expect(result.skippedFiles).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.ruleId)).toEqual(
      expect.arrayContaining(["security-missing-auth-entrypoint", "security-sql-injection", "security-unsafe-html"])
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "security-sql-injection",
          category: "security",
          severity: "high",
          file: "src/api/users.ts"
        })
      ])
    );
  });

  it("represents changed source files even when no matcher fires", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/lib/math.ts",
          content: "export function add(left: number, right: number) { return left + right; }"
        }
      ]
    });

    expect(result.scannedFiles).toEqual(["src/lib/math.ts"]);
    expect(result.skippedFiles).toEqual([]);
    expect(result.candidates).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("does not report matcher examples or fixture strings as production security candidates", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/security-fixtures.ts",
          content: [
            "export const fixtures = [",
            "  { content: 'await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${req.query.id}`);' },",
            "  { content: 'const STRIPE_SECRET_KEY = \"sk_live_1234567890abcdef\";' },",
            "  { content: 'exec(`tar -czf ${req.query.name}.tgz uploads/${req.query.name}`);' },",
            "  { content: 'return readFileSync(path.join(uploadRoot, req.query.file), \"utf8\");' },",
            "  { content: 'const response = await fetch(req.query.url);' },",
            "  { content: 'return <div dangerouslySetInnerHTML={{ __html: comment.body }} />;' },",
            "  { content: 'res.setHeader(\"Set-Cookie\", `session=${sessionId}; Path=/`);' }",
            "];"
          ].join("\n")
        }
      ]
    });

    expect(result.scannedFiles).toEqual(["src/security-fixtures.ts"]);
    expect(result.candidates).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("does not self-match safe query calls as user-controlled SQL", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/db/report.ts",
          content: [
            "export async function loadReport(db) {",
            "  return db.query('select * from reports where archived = false');",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(result.candidates.map((candidate) => candidate.ruleId)).not.toContain("security-sql-injection");
  });

  it("tracks simple function parameters into high-risk sinks", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/api/proxy.ts",
          content: "export async function proxy(targetUrl) { return fetch(targetUrl); }\n"
        },
        {
          path: "src/api/archive.ts",
          content: "export function archive(command) { return exec(command); }\n"
        },
        {
          path: "src/api/files.ts",
          content: "export function readUpload(filePath) { return readFileSync(filePath, 'utf8'); }\n"
        }
      ]
    });

    expect(result.candidates.map((candidate) => candidate.ruleId)).toEqual(
      expect.arrayContaining(["security-ssrf", "security-command-injection", "security-path-traversal"])
    );
  });

  it("tracks one-hop local variables assigned from request input into high-risk sinks", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/api/search.ts",
          content: [
            "export function searchUsers(db, req) {",
            "  const sql = 'select * from users where id = ' + req.query.id;",
            "  return db.query(sql);",
            "}",
            ""
          ].join("\n")
        },
        {
          path: "src/api/files.ts",
          content: [
            "import path from 'node:path';",
            "import { readFileSync } from 'node:fs';",
            "",
            "export function readUpload(req) {",
            "  const file = path.join(uploadRoot, req.query.file);",
            "  return readFileSync(file, 'utf8');",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(result.candidates.map((candidate) => candidate.ruleId)).toEqual(
      expect.arrayContaining(["security-sql-injection", "security-path-traversal"])
    );
  });

  it("flags indirect dynamic SQL built from function parameters without pretending to be a deep scan", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/reports/search.ts",
          content: [
            "export function buildSearchQuery(status) {",
            "  const sql = `select * from invoices where status = '${status}'`;",
            "  return sql;",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "security-sql-injection",
          confidence: "indirect"
        })
      ])
    );
  });

  it("does not flag dynamic SQL built only from local constants as request-controlled", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/reports/static.ts",
          content: [
            "export function buildStaticReportQuery() {",
            "  const status = 'paid';",
            "  const sql = 'select * from invoices where status = ' + status;",
            "  return sql;",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(result.candidates.map((candidate) => candidate.ruleId)).not.toContain("security-sql-injection");
  });

  it("does not treat function names ending in request as outbound request sinks", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/api/labels.ts",
          content: [
            "export function classifyRequest(req) {",
            "  return req.headers['x-kind'] === 'internal' ? 'internal' : 'external';",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(result.candidates.map((candidate) => candidate.ruleId)).not.toContain("security-ssrf");
  });

  it("flags exported destructive functions without auth markers as public entry points", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/services/users.ts",
          content: [
            "export function deleteUser(userId) {",
            "  return db.user.delete({ where: { id: userId } });",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(result.candidates.map((candidate) => candidate.ruleId)).toContain("security-missing-auth-entrypoint");
  });

  it("flags destructive exported functions when auth is mentioned only in comments", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/admin.ts",
          content: [
            "import { Pool } from \"pg\";",
            "const pool = new Pool();",
            "// destructive admin action with NO authentication/authorization check",
            "export async function deleteAllUsers(req: { body: unknown }) {",
            "  await pool.query(\"DELETE FROM users\");",
            "  return { ok: true };",
            "}",
            ""
          ].join("\n")
        }
      ]
    });
    const missingAuth = result.candidates.filter((candidate) => candidate.ruleId === "security-missing-auth-entrypoint");

    expect(missingAuth).toHaveLength(1);
    expect(missingAuth[0]).toMatchObject({
      file: "src/admin.ts",
      severity: "high"
    });
  });

  it("does not flag destructive exported functions with a real auth guard", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/admin.ts",
          content: [
            "import { Pool } from \"pg\";",
            "const pool = new Pool();",
            "export async function deleteAllUsers(req: { body: unknown }) {",
            "  requireAuth(req);",
            "  await pool.query(\"DELETE FROM users\");",
            "  return { ok: true };",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(result.candidates.map((candidate) => candidate.ruleId)).not.toContain("security-missing-auth-entrypoint");
  });

  it("does not treat author or authentication prose as missing-auth evidence in benign files", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/profile.ts",
          content: [
            "// This authentication note documents the author profile page.",
            "export function authorBio(author: { name: string }) {",
            "  const authorLabel = `Author: ${author.name}`;",
            "  return authorLabel;",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(result.candidates.map((candidate) => candidate.ruleId)).not.toContain("security-missing-auth-entrypoint");
  });

  it("detects JWT decode-without-verify and unsafe verification options while avoiding safe decoys", () => {
    const risky = scanSecurityCandidates({
      files: [
        {
          path: "src/auth/session.ts",
          content: [
            "import jwt from 'jsonwebtoken';",
            "export function session(token) {",
            "  const claims = jwt.decode(token);",
            "  return { id: claims.sub, role: claims.role };",
            "}",
            ""
          ].join("\n")
        },
        {
          path: "src/auth/verify.ts",
          content: "jwt.verify(token, secret, { algorithms: ['none'] });\n"
        }
      ]
    });

    expect(risky.candidates.map((candidate) => candidate.ruleId)).toEqual(
      expect.arrayContaining(["security-jwt-unsafe-verification"])
    );

    const decoy = scanSecurityCandidates({
      files: [
        {
          path: "src/auth/session.ts",
          content: "jwt.verify(token, publicKey, { algorithms: ['RS256'], audience: 'api', issuer: 'issuer' });\n"
        },
        {
          path: "src/lib/token-display.ts",
          content: "export const helpText = 'JWT decode means inspect only, not authenticate';\n"
        }
      ]
    });

    expect(decoy.candidates.map((candidate) => candidate.ruleId)).not.toContain("security-jwt-unsafe-verification");
  });
});
