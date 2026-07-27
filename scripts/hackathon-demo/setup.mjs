#!/usr/bin/env node
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readOptionValue } from "../lib/args.mjs";
import { resetDir, writeFiles } from "../lib/files.mjs";
import { initFixtureGitRepo, runGit, runGitOutput } from "../lib/git.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const allowedOutputRoot = resolve(repoRoot, ".codedecay/local/hackathon-demo");
const outputDir = resolve(repoRoot, options.outputDir ?? ".codedecay/local/hackathon-demo/repo");
assertSafeOutputDir(outputDir);

resetDir(outputDir);
writeFiles(outputDir, baselineFiles());
initFixtureGitRepo(outputDir, {
  userName: "CodeDecay Hackathon Demo",
  commitMessage: "baseline: protect the users API"
});
const base = runGitOutput(outputDir, ["rev-parse", "HEAD"]).trim();

writeFiles(outputDir, riskyFiles());
runGit(outputDir, ["add", "."]);
runGit(outputDir, ["commit", "-m", "feat: add admin user lookup"]);
const head = runGitOutput(outputDir, ["rev-parse", "HEAD"]).trim();

process.stdout.write(
  [
    "CodeDecay hackathon fixture ready.",
    `Repository: ${outputDir}`,
    `Base: ${base}`,
    `Risky head: ${head}`,
    "Shallow test: npm test",
    "Real-path probe: npm run probe:anonymous",
    ""
  ].join("\n")
);

function parseArgs(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const parsed = { outputDir: undefined, help: false };

  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--output-dir") {
      parsed.outputDir = readOptionValue(normalized, ++index, arg);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}

function assertSafeOutputDir(candidate) {
  const relativePath = relative(allowedOutputRoot, candidate);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(
      "The fixture output must be a child of .codedecay/local/hackathon-demo/."
    );
  }
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/hackathon-demo/setup.mjs [options]",
      "",
      "Materialize an isolated git repository for the three-minute Codex demo.",
      "",
      "Options:",
      "  --output-dir <path>  Destination under .codedecay/local/hackathon-demo/",
      "  --help               Show this help",
      ""
    ].join("\n")
  );
}

function baselineFiles() {
  return {
    ".gitignore": [
      ".codedecay/local/",
      "codedecay-ai-*.md",
      "codedecay-before.json",
      "codedecay-revalidation.md",
      ""
    ].join("\n"),
    "README.md": [
      "# Acme Admin API",
      "",
      "A dependency-free API fixture for the CodeDecay hackathon demo.",
      "",
      "Invariant: anonymous requests to `GET /api/users` must return `401`.",
      ""
    ].join("\n"),
    "package.json":
      JSON.stringify(
        {
          name: "codedecay-hackathon-auth-demo",
          private: true,
          type: "module",
          scripts: {
            test: "node --test test/unit/session.test.js",
            "probe:anonymous": "node scripts/probe-anonymous.mjs"
          }
        },
        null,
        2
      ) + "\n",
    ".codedecay/config.yml": [
      "version: 1",
      "commands:",
      "  test:",
      "    - npm test",
      "safety:",
      "  allowCommands: true",
      "  commandTimeoutMs: 30000",
      ""
    ].join("\n"),
    ".codedecay/memory.json": JSON.stringify(
      {
        version: 1,
        flows: [
          {
            name: "Admin user lookup",
            areas: ["api", "auth"],
            checks: ["anonymous request", "missing authorization header", "valid admin token"]
          }
        ],
        invariants: [
          {
            name: "Users API fails closed",
            description: "GET /api/users must return 401 when the Authorization header is missing.",
            areas: ["api", "auth"],
            severity: "high"
          }
        ],
        regressions: [
          {
            title: "Anonymous admin fallback",
            description: "A missing token previously received an administrator session.",
            areas: ["api", "auth"],
            check: "Request GET /api/users without an Authorization header.",
            severity: "high"
          }
        ]
      },
      null,
      2
    ),
    ".agents/skills/api-review/SKILL.md": [
      "---",
      "name: api-review",
      "description: Review API changes from the caller's perspective and require endpoint-level proof.",
      "---",
      "",
      "# API review",
      "",
      "Verify the real HTTP status and response for anonymous and authorized callers.",
      ""
    ].join("\n"),
    "src/auth/session.js": [
      "export function requireSession(authorization) {",
      "  if (!authorization) return null;",
      "  return { userId: 'u_123', role: 'admin' };",
      "}",
      ""
    ].join("\n"),
    "src/routes/users.js": [
      "export function getUsers(session) {",
      "  if (!session) return { status: 401, body: { error: 'unauthorized' } };",
      "  return { status: 200, body: [{ id: 'u_123', role: session.role }] };",
      "}",
      ""
    ].join("\n"),
    "src/server.js": [
      "import { createServer } from 'node:http';",
      "import { requireSession } from './auth/session.js';",
      "import { getUsers } from './routes/users.js';",
      "",
      "export function createApp() {",
      "  return createServer((request, response) => {",
      "    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;",
      "    if (request.method !== 'GET' || path !== '/api/users') {",
      "      response.writeHead(404).end();",
      "      return;",
      "    }",
      "",
      "    const session = requireSession(request.headers.authorization);",
      "    const result = getUsers(session);",
      "    response.writeHead(result.status, { 'content-type': 'application/json' });",
      "    response.end(JSON.stringify(result.body));",
      "  });",
      "}",
      ""
    ].join("\n"),
    "scripts/request-app.mjs": [
      "import { Agent, request } from 'node:http';",
      "import { Duplex } from 'node:stream';",
      "",
      "class MemorySocket extends Duplex {",
      "  #peer;",
      "",
      "  connect(peer) {",
      "    this.#peer = peer;",
      "  }",
      "",
      "  _read() {}",
      "",
      "  _write(chunk, _encoding, callback) {",
      "    this.#peer.push(Buffer.from(chunk));",
      "    callback();",
      "  }",
      "",
      "  _final(callback) {",
      "    this.#peer.push(null);",
      "    callback();",
      "  }",
      "",
      "  setNoDelay() {",
      "    return this;",
      "  }",
      "",
      "  setKeepAlive() {",
      "    return this;",
      "  }",
      "",
      "  setTimeout() {",
      "    return this;",
      "  }",
      "}",
      "",
      "function makeSocketPair() {",
      "  const client = new MemorySocket();",
      "  const server = new MemorySocket();",
      "  client.connect(server);",
      "  server.connect(client);",
      "  return { client, server };",
      "}",
      "",
      "function makeRequest(options) {",
      "  return new Promise((resolve, reject) => {",
      "    const outgoing = request(options, (response) => {",
      "      let body = '';",
      "      response.setEncoding('utf8');",
      "      response.on('data', (chunk) => {",
      "        body += chunk;",
      "      });",
      "      response.on('end', () => resolve({ body, status: response.statusCode }));",
      "    });",
      "    outgoing.on('error', reject);",
      "    outgoing.end();",
      "  });",
      "}",
      "",
      "export async function requestApp(app, path, { headers } = {}) {",
      "  try {",
      "    await new Promise((resolve, reject) => {",
      "      app.once('error', reject);",
      "      app.listen(0, '127.0.0.1', resolve);",
      "    });",
      "",
      "    const address = app.address();",
      "    return await makeRequest({",
      "      headers,",
      "      host: '127.0.0.1',",
      "      method: 'GET',",
      "      path,",
      "      port: address.port",
      "    });",
      "  } catch (error) {",
      "    if (error.code !== 'EPERM') throw error;",
      "",
      "    const sockets = makeSocketPair();",
      "    const agent = new Agent();",
      "    agent.createConnection = () => sockets.client;",
      "    app.emit('connection', sockets.server);",
      "    return await makeRequest({",
      "      agent,",
      "      headers,",
      "      host: 'in-memory',",
      "      method: 'GET',",
      "      path,",
      "      port: 80",
      "    });",
      "  } finally {",
      "    if (app.listening) {",
      "      await new Promise((resolve, reject) => {",
      "        app.close((error) => (error ? reject(error) : resolve()));",
      "      });",
      "    }",
      "  }",
      "}",
      ""
    ].join("\n"),
    "scripts/probe-anonymous.mjs": [
      "import { createApp } from '../src/server.js';",
      "import { requestApp } from './request-app.mjs';",
      "",
      "const response = await requestApp(createApp(), '/api/users');",
      "const body = JSON.parse(response.body);",
      "",
      "console.log(JSON.stringify({ flow: 'anonymous GET /api/users', expected: 401, actual: response.status, body }));",
      "if (response.status !== 401) process.exitCode = 1;",
      ""
    ].join("\n"),
    "test/unit/session.test.js": [
      "import { test } from 'node:test';",
      "import { strictEqual } from 'node:assert/strict';",
      "import { requireSession } from '../../src/auth/session.js';",
      "",
      "test('keeps the authenticated user id', () => {",
      "  strictEqual(requireSession('Bearer demo-token')?.userId, 'u_123');",
      "});",
      ""
    ].join("\n")
  };
}

function riskyFiles() {
  return {
    "src/auth/session.js": [
      "export function requireSession(authorization) {",
      "  // Keep the admin screen usable when the identity provider is unavailable.",
      "  if (!authorization) return { userId: 'anonymous', role: 'admin' };",
      "  return { userId: 'u_123', role: 'admin' };",
      "}",
      ""
    ].join("\n"),
    "src/routes/users.js": [
      "export function getUsers(session) {",
      "  return {",
      "    status: 200,",
      "    body: [{ id: session?.userId ?? 'anonymous', role: session?.role ?? 'admin' }]",
      "  };",
      "}",
      ""
    ].join("\n"),
    "test/unit/session.test.js": [
      "import { test } from 'node:test';",
      "import { strictEqual } from 'node:assert/strict';",
      "import { requireSession } from '../../src/auth/session.js';",
      "",
      "test('keeps the authenticated user id', () => {",
      "  strictEqual(requireSession('Bearer demo-token')?.userId, 'u_123');",
      "});",
      ""
    ].join("\n")
  };
}
