import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach } from "vitest";
import { runCli } from "../src/index";

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface HealthServer {
  origin: string;
  healthUrl: string;
  close: () => Promise<void>;
}

interface DemoAppServer {
  origin: string;
  close: () => Promise<void>;
}

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

export async function expectExit(args: string[], cwd: string, expectedExitCode: number): Promise<void> {
  const result = await run(args, cwd);
  expect(result.exitCode).toBe(expectedExitCode);
}

export async function run(args: string[], cwd: string): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });

  return { exitCode, stdout, stderr };
}

export function stableReport(output: string): unknown {
  const report = JSON.parse(output);
  delete report.generatedAt;
  return report;
}

export async function startHealthServer(): Promise<HealthServer> {
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(404);
    response.end("not found");
  });

  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test health server.");
  }

  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    healthUrl: `${origin}/health`,
    close: async () => {
      await closeServer(server);
    }
  };
}

export async function startDemoAppServer(): Promise<DemoAppServer> {
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    response.setHeader("content-type", "text/html; charset=utf-8");

    if (url === "/" || url === "") {
      response.end(
        [
          "<!doctype html>",
          "<html>",
          "<head><title>Demo Home</title></head>",
          "<body>",
          '<script>Hidden script action</script>',
          "<style>.hidden-style { color: red; }</style>",
          '<a href="/settings"><span>Settings &amp; Details</span><script>Hidden script action</script></a>',
          '<a href="https://example.com">&amp;lt;External&amp;gt;</a>',
          '<form method="post" action="/users/delete" aria-label="Delete user">',
          '<button type="submit">Delete&nbsp;user<style>.hidden-style {}</style></button>',
          "</form>",
          "</body>",
          "</html>"
        ].join("")
      );
      return;
    }

    if (url === "/settings") {
      response.end(
        [
          "<!doctype html>",
          "<html>",
          "<head><title>Settings</title></head>",
          "<body>",
          '<a href="/">Home</a>',
          '<label>Email <input name="email" placeholder="Email address"></label>',
          '<button type="button">Preview settings</button>',
          "</body>",
          "</html>"
        ].join("")
      );
      return;
    }

    response.writeHead(404);
    response.end("<title>Not found</title>");
  });

  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind demo app server.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await closeServer(server);
    }
  };
}

export async function startDemoApiServer(): Promise<HealthServer> {
  const server = createServer((request, response) => {
    const url = request.url ?? "/";

    if (url === "/health") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (url === "/api/users") {
      response.setHeader("content-type", "application/json");
      if (request.method === "POST") {
        response.writeHead(201);
        response.end(JSON.stringify({ id: "created" }));
        return;
      }

      response.writeHead(200);
      response.end(JSON.stringify([{ id: 1, email: "codedecay@example.com" }]));
      return;
    }

    if (url === "/api/users/1") {
      response.setHeader("content-type", "application/json");
      response.writeHead(200);
      response.end(JSON.stringify({ id: 1, email: "codedecay@example.com" }));
      return;
    }

    response.writeHead(404);
    response.end("not found");
  });

  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind demo API server.");
  }

  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    healthUrl: `${origin}/health`,
    close: async () => {
      await closeServer(server);
    }
  };
}

export function installFakePlaywright(repo: string): void {
  writeFile(
    repo,
    "node_modules/playwright/index.js",
    [
      "const { writeFileSync } = require('node:fs');",
      "function titleFrom(html) {",
      "  const match = /<title[^>]*>([\\s\\S]*?)<\\/title>/i.exec(html);",
      "  return match ? match[1].replace(/\\s+/g, ' ').trim() : '';",
      "}",
      "exports.chromium = {",
      "  async launch() {",
      "    return {",
      "      async newPage() {",
      "        let currentUrl = '';",
      "        let currentHtml = '';",
      "        return {",
      "          async goto(url) {",
      "            const response = await fetch(url);",
      "            currentUrl = response.url.replace(/\\/$/, '');",
      "            currentHtml = await response.text();",
      "          },",
      "          async content() { return currentHtml; },",
      "          async title() { return titleFrom(currentHtml); },",
      "          url() { return currentUrl; },",
      "          async screenshot(options) { writeFileSync(options.path, 'fake screenshot'); },",
      "          async close() {}",
      "        };",
      "      },",
      "      async close() {}",
      "    };",
      "  }",
      "};",
      ""
    ].join("\n")
  );
  writeFile(
    repo,
    "node_modules/playwright/cli.js",
    [
      "const { existsSync, readFileSync } = require('node:fs');",
      "const { readFileSync: readText, writeFileSync } = require('node:fs');",
      "const sourcePath = process.argv.find((arg) => arg.endsWith('.spec.ts'));",
      "const source = sourcePath ? readFileSync(sourcePath, 'utf8') : '';",
      "const grepIndex = process.argv.indexOf('--grep');",
      "const grep = grepIndex === -1 ? undefined : new RegExp(process.argv[grepIndex + 1]);",
      "const titles = Array.from(source.matchAll(/test\\((['\"])(.*?)\\1/g)).map((match) => match[2]).filter(Boolean).filter((title) => !grep || grep.test(title));",
      "const forceFail = existsSync('fail-generated-tests.txt');",
      "const flaky = existsSync('flaky-generated-tests.txt');",
      "const flakyCounterPath = 'flaky-generated-tests-count.txt';",
      "const flakyCount = flaky && existsSync(flakyCounterPath) ? Number(readText(flakyCounterPath, 'utf8')) : 0;",
      "if (flaky) writeFileSync(flakyCounterPath, String(flakyCount + 1));",
      "const shouldFail = forceFail || (flaky && flakyCount === 0);",
      "const specs = titles.map((title, index) => ({",
      "  title,",
      "  tests: [{",
      "    status: shouldFail && index === 0 ? 'failed' : 'passed',",
      "    results: [{",
      "      status: shouldFail && index === 0 ? 'failed' : 'passed',",
      "      error: shouldFail && index === 0 ? { message: forceFail ? 'Forced generated test failure' : 'Flaky generated test failure' } : undefined",
      "    }]",
      "  }]",
      "}));",
      "console.log(JSON.stringify({ suites: [{ title: 'generated', specs }] }));",
      "process.exit(shouldFail ? 1 : 0);",
      ""
    ].join("\n")
  );
}

export function writeProductTargetConfig(repo: string, input: { baseUrl: string; allowCommands: boolean }): void {
  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "productTesting:",
      "  targets:",
      "    web:",
      `      baseUrl: ${input.baseUrl}`,
      "      timeoutMs: 2000",
      "safety:",
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  );
}

export function writeApiProductTargetConfig(repo: string, input: { baseUrl: string; healthCheck: string; allowCommands: boolean }): void {
  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "toolAdapters:",
      "  schemathesis:",
      "    schema: docs/openapi.yaml",
      `    baseUrl: ${input.baseUrl}`,
      "productTesting:",
      "  targets:",
      "    api:",
      `      baseUrl: ${input.baseUrl}`,
      `      healthCheck: ${input.healthCheck}`,
      "      timeoutMs: 2000",
      "safety:",
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  );
}

export function writeManualApiProductTargetConfig(repo: string, input: { baseUrl: string; healthCheck: string; allowCommands: boolean }): void {
  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "productTesting:",
      "  targets:",
      "    api:",
      `      baseUrl: ${input.baseUrl}`,
      `      healthCheck: ${input.healthCheck}`,
      "      timeoutMs: 2000",
      "      apiEndpoints:",
      "        - id: list-users",
      "          method: GET",
      "          path: /api/users",
      "          expectedStatuses: [200]",
      "          headers:",
      "            x-codedecay-scenario: list-users",
      "        - method: POST",
      "          path: /api/users",
      "          expectedStatuses: [201, 400]",
      "          body:",
      "            email: codedecay@example.com",
      "safety:",
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  );
}

export function writeDemoOpenApiSchema(repo: string): void {
  writeFile(
    repo,
    "docs/openapi.yaml",
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Demo API",
      "  version: 1.0.0",
      "paths:",
      "  /api/users:",
      "    get:",
      "      operationId: listUsers",
      "      responses:",
      "        '200':",
      "          description: users returned",
      "        '401':",
      "          description: auth required",
      "    post:",
      "      operationId: createUser",
      "      requestBody:",
      "        required: true",
      "        content:",
      "          application/json:",
      "            schema:",
      "              type: object",
      "              required: [email]",
      "              properties:",
      "                email:",
      "                  type: string",
      "                  format: email",
      "      responses:",
      "        '201':",
      "          description: created",
      "        '400':",
      "          description: bad request",
      "  /api/users/{id}:",
      "    get:",
      "      operationId: getUser",
      "      parameters:",
      "        - name: id",
      "          in: path",
      "          required: true",
      "          schema:",
      "            type: integer",
      "      responses:",
      "        '200':",
      "          description: user returned",
      "        '404':",
      "          description: missing user",
      ""
    ].join("\n")
  );
}

export function writeLatestProductRunReport(repo: string): void {
  writeFile(
    repo,
    ".codedecay/local/product-runs/latest.json",
    JSON.stringify(
      {
        tool: "CodeDecay",
        version: "0.3.0",
        summary: {
          status: "failed"
        },
        targets: [
          {
            id: "api",
            status: "failed",
            baseUrl: "http://127.0.0.1:3000",
            generatedApiTestRun: {
              status: "failed",
              failures: [
                {
                  testId: "api-get-users",
                  title: "GET /api/users returns a documented status",
                  failingStep: "Run generated test.",
                  error: "Expected documented status 200 but got 500.",
                  request: {
                    method: "GET",
                    url: "http://127.0.0.1:3000/api/users"
                  },
                  expected: "GET /api/users should return one of the documented statuses 200.",
                  actual: "Expected documented status 200 but got 500.",
                  impactedFiles: ["src/api/users.ts"],
                  testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
                  rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
                }
              ]
            }
          }
        ],
        safety: {
          telemetrySent: false,
          cloudDependency: false
        }
      },
      null,
      2
    )
  );
}

export function writeDashboardProductRun(
  repo: string,
  path: string,
  input: {
    generatedAt: string;
    status: "passed" | "failed";
    targetId: string;
    baseUrl: string;
    requestUrl: string;
    error: string;
  }
): void {
  const failed = input.status === "failed";
  writeFile(
    repo,
    path,
    JSON.stringify(
      {
        tool: "CodeDecay",
        version: "0.3.0",
        generatedAt: input.generatedAt,
        summary: {
          status: input.status,
          total: 1,
          passed: failed ? 0 : 1,
          failed: failed ? 1 : 0,
          blocked: 0,
          timedOut: 0,
          skipped: 0,
          durationMs: 25
        },
        targets: [
          {
            id: input.targetId,
            status: input.status,
            baseUrl: input.baseUrl,
            generatedApiTestRun: failed
              ? {
                  status: "failed",
                  failures: [
                    {
                      testId: "api-get-users",
                      title: "GET /api/users returns a documented status",
                      failingStep: "Run generated test.",
                      error: input.error,
                      request: {
                        method: "GET",
                        url: input.requestUrl
                      },
                      expected: "GET /api/users should return one of the documented statuses 200.",
                      actual: input.error,
                      impactedFiles: ["src/api/users.ts"],
                      testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
                      rerunCommand: "npx codedecay product --target api --run-generated-api-tests --test-id api-get-users --format markdown"
                    }
                  ]
                }
              : undefined
          }
        ],
        safety: {
          telemetrySent: false,
          cloudDependency: false
        }
      },
      null,
      2
    )
  );
}

export async function getFreePort(): Promise<number> {
  const server = createServer();
  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to reserve a free port.");
  }

  const port = address.port;
  await closeServer(server);
  return port;
}

export async function listenOnLoopback(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };

    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function currentCliVersion(): string {
  const packageJsonPath = join(process.cwd(), "packages/cli/package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
  return packageJson.version;
}

export function createLowRiskRepo(): string {
  const repo = createRepo({
    "README.md": "# Project\n"
  });

  writeFile(repo, "README.md", "# Project\nDocs change.\n");
  return repo;
}

export function createBroadLowOnlyRepo(): string {
  const repo = createRepo({
    "README.md": "# Project\n"
  });

  const files = [
    "docs/agent.md",
    "docs/getting-started.md",
    "docs/mcp.md",
    "docs/reports.md",
    "docs/scoring.md",
    "docs/examples/sample-report.md",
    "docs/examples/json-report.md",
    "docs/examples/sarif-report.md",
    "docs/examples/action-output.md",
    "docs/examples/redteam-report.md",
    "docs/examples/agent-handoff.md",
    "packages/agent/src/profile.ts",
    "packages/harness/src/registry.ts",
    "packages/memory/src/local.ts"
  ];

  for (const file of files) {
    writeFile(repo, file, `export const fixture = ${JSON.stringify(file)};\n`);
  }

  return repo;
}

export function createMediumRiskRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function handler() { return Response.json({ ok: true }); }\n"
  });

  writeFile(
    repo,
    "src/api/users.ts",
    [
      "export function handler(req: Request) {",
      "  if (req.method === \"POST\") return Response.json({ ok: true });",
      "  return Response.json({ ok: false });",
      "}",
      ""
    ].join("\n")
  );

  return repo;
}

export function createHighRiskRepo(): string {
  const repo = createRepo({
    "src/api/users.ts": "export function handler() { return true; }\n",
    "src/auth/session.ts": "export function session() { return true; }\n",
    "src/db/schema.prisma": "model User { id String @id }\n"
  });

  writeFile(repo, "src/api/users.ts", "export function handler() { return false; }\n");
  writeFile(repo, "src/auth/session.ts", "export function session(token?: string) { if (!token) return null; return true; }\n");
  writeFile(repo, "src/db/schema.prisma", "model User { id String @id email String }\n");

  return repo;
}

export function createNextRouteRiskRepo(): string {
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

export function createDifferentialRepo(input: { headValue: string; allowCommands: boolean }): {
  repo: string;
  base: string;
  head: string;
} {
  const repo = createRepo({
    "probe.js": [
      "const { readFileSync } = require('node:fs');",
      "const value = readFileSync('value.txt', 'utf8').trim();",
      "console.log(JSON.stringify({ value }));",
      ""
    ].join("\n"),
    "value.txt": "base\n",
    ".codedecay/config.yml": [
      "version: 1",
      "commands: {}",
      "probes:",
      "  - name: value probe",
      "    command: node probe.js",
      "    timeoutMs: 1000",
      "safety:",
      "  commandTimeoutMs: 1000",
      `  allowCommands: ${input.allowCommands}`,
      ""
    ].join("\n")
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  if (input.headValue === "base") {
    writeFile(repo, "README.md", "# Fixture\nDocs-only head change.\n");
  } else {
    writeFile(repo, "value.txt", `${input.headValue}\n`);
  }
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "update value"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
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
  const root = mkTempRoot();
  tempRoots.push(root);
  return root;
}

export function mkTempRoot(): string {
  return execFileSync("mktemp", ["-d", join(tmpdir(), "codedecay-XXXXXX")], {
    encoding: "utf8"
  }).trim();
}

export function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

export function writeExecutionConfig(
  repo: string,
  input: {
    allowCommands: boolean;
    testCommand?: string | undefined;
    buildCommand?: string | undefined;
    startCommand?: string | undefined;
    probeCommand?: string | undefined;
    toolAdapters?: boolean | undefined;
  }
): void {
  const lines = ["version: 1"];
  const commands = [
    ["test", input.testCommand],
    ["build", input.buildCommand],
    ["start", input.startCommand]
  ] as const;

  if (commands.some(([, command]) => command)) {
    lines.push("commands:");
    for (const [name, command] of commands) {
      appendCommand(lines, name, command);
    }
  } else {
    lines.push("commands: {}");
  }

  if (input.probeCommand) {
    lines.push("probes:");
    lines.push("  - name: smoke probe", `    command: ${input.probeCommand}`, "    timeoutMs: 1000");
  } else {
    lines.push("probes: []");
  }

  if (input.toolAdapters) {
    lines.push(
      "toolAdapters:",
      "  playwright: true",
      "  schemathesis:",
      "    schema: docs/openapi.yaml",
      "    baseUrl: http://127.0.0.1:4000"
    );
  }

  lines.push("safety:", "  commandTimeoutMs: 1000", `  allowCommands: ${input.allowCommands}`, "");
  writeFile(repo, ".codedecay/config.yml", lines.join("\n"));
}

export function appendCommand(lines: string[], name: "test" | "build" | "start", command: string | undefined): void {
  if (command) {
    lines.push(`  ${name}:`);
    lines.push(`    - ${command}`);
  }
}

export function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], {
    stdio: "ignore"
  });
}

export function gitOutput(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
}
