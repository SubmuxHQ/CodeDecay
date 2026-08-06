/** Deterministic human-UAT fixture trees for #692 kit smoke (not human evidence). */

export const HUMAN_UAT_TASK_IDS = [
  "UAT-HUMAN-1",
  "UAT-HUMAN-2",
  "UAT-HUMAN-3",
  "UAT-HUMAN-4",
  "UAT-HUMAN-5",
  "UAT-HUMAN-6",
  "UAT-HUMAN-7",
  "UAT-HUMAN-8"
];

export function plantedBaselineFiles() {
  return {
    ".gitignore": [".codedecay/local/", "codedecay-*.json", "codedecay-*.md", ""].join("\n"),
    "README.md": [
      "# Acme Billing Lookup",
      "",
      "Synthetic UAT fixture. Invariant: anonymous `GET /api/invoices` must return `401`.",
      "",
      "Ambiguous requirement seed (UAT-HUMAN-2):",
      "> Make invoice lookup safer for operators.",
      "",
      "Participants must ask whether anonymous callers may see invoice totals.",
      ""
    ].join("\n"),
    "package.json":
      JSON.stringify(
        {
          name: "codedecay-human-uat-planted",
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
      "probes:",
      "  - name: anonymous invoice probe",
      "    command: npm run probe:anonymous",
      "    timeoutMs: 10000",
      "safety:",
      "  allowCommands: true",
      "  commandTimeoutMs: 30000",
      "llm:",
      "  provider: disabled",
      ""
    ].join("\n"),
    ".codedecay/memory.json": JSON.stringify(
      {
        version: 1,
        flows: [
          {
            name: "Invoice lookup",
            areas: ["api", "auth"],
            checks: ["anonymous request", "missing authorization header"]
          }
        ],
        invariants: [
          {
            name: "Invoices fail closed",
            description: "GET /api/invoices must return 401 when Authorization is missing.",
            areas: ["api", "auth"],
            severity: "high"
          }
        ]
      },
      null,
      2
    ),
    "src/auth/session.js": [
      "export function requireSession(authorization) {",
      "  if (!authorization) return null;",
      "  return { userId: 'u_42', role: 'ops' };",
      "}",
      ""
    ].join("\n"),
    "src/routes/invoices.js": [
      "export function getInvoices(session) {",
      "  if (!session) return { status: 401, body: { error: 'unauthorized' } };",
      "  return { status: 200, body: [{ id: 'inv_1', total: 12 }] };",
      "}",
      ""
    ].join("\n"),
    "src/server.js": [
      "import { createServer } from 'node:http';",
      "import { requireSession } from './auth/session.js';",
      "import { getInvoices } from './routes/invoices.js';",
      "",
      "export function createApp() {",
      "  return createServer((request, response) => {",
      "    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;",
      "    if (request.method !== 'GET' || path !== '/api/invoices') {",
      "      response.writeHead(404).end();",
      "      return;",
      "    }",
      "    const session = requireSession(request.headers.authorization);",
      "    const result = getInvoices(session);",
      "    response.writeHead(result.status, { 'content-type': 'application/json' });",
      "    response.end(JSON.stringify(result.body));",
      "  });",
      "}",
      ""
    ].join("\n"),
    "scripts/probe-anonymous.mjs": [
      "import { createApp } from '../src/server.js';",
      "import { requestApp } from './request-app.mjs';",
      "",
      "const response = await requestApp(createApp(), '/api/invoices');",
      "const body = JSON.parse(response.body || '{}');",
      "console.log(JSON.stringify({ flow: 'anonymous GET /api/invoices', expected: 401, actual: response.status, body }));",
      "if (response.status !== 401) process.exitCode = 1;",
      ""
    ].join("\n"),
    "scripts/request-app.mjs": requestAppHelper(),
    "test/unit/session.test.js": [
      "import { test } from 'node:test';",
      "import { strictEqual } from 'node:assert/strict';",
      "import { requireSession } from '../../src/auth/session.js';",
      "",
      "test('keeps the authenticated user id', () => {",
      "  strictEqual(requireSession('Bearer demo-token')?.userId, 'u_42');",
      "});",
      ""
    ].join("\n")
  };
}

export function plantedRiskyFiles() {
  return {
    "src/auth/session.js": [
      "export function requireSession(authorization) {",
      "  // Keep ops dashboards usable when identity is unavailable.",
      "  if (!authorization) return { userId: 'anonymous', role: 'ops' };",
      "  return { userId: 'u_42', role: 'ops' };",
      "}",
      ""
    ].join("\n"),
    "src/routes/invoices.js": [
      "export function getInvoices(session) {",
      "  return {",
      "    status: 200,",
      "    body: [{ id: 'inv_1', total: 12, role: session?.role ?? 'ops' }]",
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
      "  strictEqual(requireSession('Bearer demo-token')?.userId, 'u_42');",
      "});",
      ""
    ].join("\n")
  };
}

/** Clean decoy: docs-only change should not force repair. */
export function decoyBaselineFiles() {
  return {
    ".gitignore": [".codedecay/local/", "codedecay-*.json", "codedecay-*.md", ""].join("\n"),
    "README.md": "# Acme Docs\n\nClean decoy fixture for UAT-HUMAN-7.\n",
    "package.json":
      JSON.stringify(
        {
          name: "codedecay-human-uat-decoy",
          private: true,
          type: "module",
          scripts: { test: "node --test test/ok.test.js" }
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
      "  commandTimeoutMs: 15000",
      "llm:",
      "  provider: disabled",
      ""
    ].join("\n"),
    "src/ok.js": "export function ok() { return true; }\n",
    "test/ok.test.js": [
      "import { test } from 'node:test';",
      "import { strictEqual } from 'node:assert/strict';",
      "import { ok } from '../src/ok.js';",
      "",
      "test('ok', () => {",
      "  strictEqual(ok(), true);",
      "});",
      ""
    ].join("\n")
  };
}

export function decoyChangedFiles() {
  return {
    "README.md": "# Acme Docs\n\nClean decoy fixture for UAT-HUMAN-7.\n\nDocs-only clarifying note.\n"
  };
}

/** Unsafe-target fixture: configured commands present but execution disabled. */
export function unsafeTargetFiles() {
  return {
    ".gitignore": [".codedecay/local/", ""].join("\n"),
    "README.md": "# Unsafe action fixture (UAT-HUMAN-6)\n",
    "package.json":
      JSON.stringify(
        {
          name: "codedecay-human-uat-unsafe",
          private: true,
          type: "module",
          scripts: {
            test: "node -e \"console.log('should-not-run')\"",
            "danger:rm": "rm -rf /tmp/codedecay-human-uat-should-not-delete"
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
      "  allowCommands: false",
      "  commandTimeoutMs: 5000",
      "llm:",
      "  provider: disabled",
      ""
    ].join("\n")
  };
}

function requestAppHelper() {
  return [
    "import { Agent, request } from 'node:http';",
    "import { Duplex } from 'node:stream';",
    "",
    "class MemorySocket extends Duplex {",
    "  #peer;",
    "  connect(peer) { this.#peer = peer; }",
    "  _read() {}",
    "  _write(chunk, _encoding, callback) { this.#peer.push(Buffer.from(chunk)); callback(); }",
    "  _final(callback) { this.#peer.push(null); callback(); }",
    "  setNoDelay() { return this; }",
    "  setKeepAlive() { return this; }",
    "  setTimeout() { return this; }",
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
    "      response.on('data', (chunk) => { body += chunk; });",
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
  ].join("\n");
}
