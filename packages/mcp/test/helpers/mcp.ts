import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

export function createWeakTestRepo(): string {
  const repo = createRepo({
    "src/auth/session.ts": "export function validateSession(token?: string) { return Boolean(token); }\n",
    "src/auth/session.test.ts": [
      "import { validateSession } from './session';",
      "test('validates session', () => {",
      "  expect(validateSession('token')).toBe(true);",
      "});",
      ""
    ].join("\n")
  });

  writeFile(
    repo,
    "src/auth/session.ts",
    "export function validateSession(token?: string) { return { id: token || 'anonymous', role: 'admin' }; }\n"
  );
  writeFile(
    repo,
    "src/auth/session.test.ts",
    ["import { validateSession } from './session';", "test('validates session', () => {", "  validateSession('token');", "});", ""].join("\n")
  );

  return repo;
}

export function createMissingTestRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function listUsers() { return []; }\n"
  });

  writeFile(repo, "src/api/users.ts", "export function listUsers() { return [{ id: 'admin', role: 'admin' }]; }\n");

  return repo;
}

export function createRouteImpactRepo(): string {
  const repo = createRepo({
    "src/app/api/users/route.ts": "export async function GET() { return Response.json([]); }\n",
    "src/app/dashboard/page.tsx": "export default function Page() { return <main />; }\n"
  });

  writeFile(
    repo,
    "src/app/api/users/route.ts",
    [
      "export async function GET() {",
      "  return Response.json([]);",
      "}",
      "export async function POST() {",
      "  return Response.json({ ok: true });",
      "}",
      ""
    ].join("\n")
  );
  writeFile(repo, "src/app/dashboard/page.tsx", "export default function Page() { return <main>Changed</main>; }\n");

  return repo;
}

export function createExecutionRepo(options: { allowCommands: boolean; failPact?: boolean | undefined }): string {
  const repo = createRepo({
    "src/index.ts": "export const ok = true;\n"
  });

  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "commands:",
      "  test:",
      "    - node scripts/command-check.mjs",
      "toolAdapters:",
      "  playwright:",
      "    enabled: true",
      "    command: node scripts/playwright-check.mjs",
      "  pact:",
      "    enabled: true",
      "    command: node scripts/pact-check.mjs",
      "safety:",
      `  allowCommands: ${options.allowCommands ? "true" : "false"}`,
      "  commandTimeoutMs: 5000",
      ""
    ].join("\n")
  );
  writeFile(repo, "scripts/command-check.mjs", "import { appendFileSync } from 'node:fs';\nappendFileSync('marker.txt', 'command\\n');\n");
  writeFile(
    repo,
    "scripts/playwright-check.mjs",
    "import { appendFileSync } from 'node:fs';\nappendFileSync('marker.txt', 'playwright\\n');\n"
  );
  writeFile(
    repo,
    "scripts/pact-check.mjs",
    [
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync('marker.txt', 'pact\\n');",
      options.failPact ? "process.exit(13);" : ""
    ].join("\n")
  );

  return repo;
}

export function createProductRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function listUsers() { return []; }\n"
  });

  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "productTesting:",
      "  targets:",
      "    api:",
      "      baseUrl: http://127.0.0.1:3000",
      "      healthCheck: http://127.0.0.1:3000/health",
      "      apiEndpoints:",
      "        - id: api-get-users",
      "          method: GET",
      "          path: /api/users",
      "          expectedStatuses: [200]",
      "safety:",
      "  allowCommands: true",
      ""
    ].join("\n")
  );

  return repo;
}

export function writeFakeProductCli(repo: string): string {
  const cliPath = join(repo, "fake-codedecay-cli.mjs");
  writeFile(
    repo,
    "fake-codedecay-cli.mjs",
    [
      "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "const args = process.argv.slice(2);",
      "appendFileSync('product-marker.txt', `${args.join(' ')}\\n`);",
      "const outputIndex = args.indexOf('--output');",
      "const outputPath = outputIndex === -1 ? '.codedecay/local/product-runs/latest.json' : args[outputIndex + 1];",
      "const report = {",
      "  tool: 'CodeDecay',",
      "  version: '0.3.0',",
      "  summary: { status: 'failed' },",
      "  targets: [{",
      "    id: 'api',",
      "    status: 'failed',",
      "    baseUrl: 'http://127.0.0.1:3000',",
      "    generatedApiTestRun: {",
      "      status: 'failed',",
      "      failures: [{",
      "        testId: 'api-get-users',",
      "        title: 'GET /api/users returns a documented status',",
      "        failingStep: 'Run generated test.',",
      "        error: 'Expected documented status 200 but got 500.',",
      "        request: { method: 'GET', url: 'http://127.0.0.1:3000/api/users' },",
      "        expected: 'GET /api/users should return one of the documented statuses 200.',",
      "        actual: 'Expected documented status 200 but got 500.',",
      "        impactedFiles: ['src/api/users.ts'],",
      "        testSourcePath: '.codedecay/local/generated-api-tests/api/api.generated.spec.ts',",
      "        rerunCommand: 'npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown'",
      "      }]",
      "    }",
      "  }]",
      "};",
      "const absoluteOutputPath = join(process.cwd(), outputPath);",
      "mkdirSync(dirname(absoluteOutputPath), { recursive: true });",
      "writeFileSync(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\\n`);",
      "process.exit(1);",
      ""
    ].join("\n")
  );
  return cliPath;
}

export function marker(repo: string): string {
  const path = join(repo, "marker.txt");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function productMarker(repo: string): string {
  const path = join(repo, "product-marker.txt");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function createRepo(files: Record<string, string>): string {
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

export function createTempDir(): string {
  const root = execFileSync("mktemp", ["-d", join(tmpdir(), "codedecay-mcp-XXXXXX")], {
    encoding: "utf8"
  }).trim();
  tempRoots.push(root);
  return root;
}

export function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

export function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], {
    stdio: "ignore"
  });
}
