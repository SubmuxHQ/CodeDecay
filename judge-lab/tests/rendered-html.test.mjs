import assert from "node:assert/strict";
import test from "node:test";

async function createWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

const environment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};
const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("server-renders the Judge Lab landing experience", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    environment,
    context,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const html = await response.text();
  assert.match(html, /<title>Judge Lab \| CodeDecay<\/title>/i);
  assert.match(html, /href="(?:https?:\/\/[^"]+)?\/favicon\.svg"/);
  assert.match(html, /Find what your coding agent/);
  assert.match(html, /Red-team the risky PR/);
  assert.match(html, /No login\. No repository upload\./);
  assert.match(html, /Don’t trust the green check\./);
  assert.match(html, /From false green to real proof\./);
  assert.match(html, /\/demo\/codedecay-codex-repair\.mp4/);
  assert.match(html, /\/demo\/codedecay-codex-repair\.vtt/);
  assert.match(html, /Edited for time from one genuine session/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("health endpoint reports engine and build provenance", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/health"),
    environment,
    context,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.service, "codedecay-judge-lab");
  assert.match(payload.engineVersion, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(payload.evidenceModes, ["live", "precomputed"]);
});

test("live endpoint finds the curated anonymous admin route", async () => {
  const worker = await createWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId: "auth-api", state: "risky" }),
    }),
    environment,
    context,
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.execution.mode, "live");
  assert.equal(payload.summary.riskLevel, "high");
  assert.equal(payload.impactedRoute.route, "/api/users");
  assert.ok(
    payload.findings.some((finding) => finding.ruleId === "security-missing-auth-entrypoint"),
  );
});

test("endpoint rejects arbitrary inputs and extra command-shaped fields", async () => {
  const worker = await createWorker();
  const invalidBodies = [
    { scenarioId: "https://example.com/repo", state: "risky" },
    { scenarioId: "auth-api", state: "risky", command: "rm -rf /" },
    { scenarioId: "../secret", state: "risky" },
  ];

  for (const body of invalidBodies) {
    const response = await worker.fetch(
      new Request("http://localhost/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      environment,
      context,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Choose a known scenarioId and state.",
    });
  }
});

test("endpoint rejects malformed and oversized request bodies", async () => {
  const worker = await createWorker();
  const malformed = await worker.fetch(
    new Request("http://localhost/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    environment,
    context,
  );
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: "Expected a JSON request body.",
  });

  const oversized = await worker.fetch(
    new Request("http://localhost/api/run", {
      method: "POST",
      headers: {
        "content-length": "513",
        "content-type": "application/json",
      },
      body: JSON.stringify({ scenarioId: "auth-api", state: "risky" }),
    }),
    environment,
    context,
  );
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), {
    error: "Request body is too large.",
  });
});
