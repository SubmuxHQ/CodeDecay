import { describe, expect, it } from "vitest";
import { createRepo, git, gitOutput, run, writeFile } from "./helpers";

describe("requirement trace UAT and agentic closed-loop QA", () => {
  it("maps verified API proof, failed differential proof, and an unmapped criterion", async () => {
    const fixture = createTraceFixture();
    const args = [
      "--task", "Update users and export APIs",
      "--requirements", "requirements.json",
      "--base", fixture.base,
      "--head", fixture.head
    ];

    const json = await run(["redteam", "--with-checks", ...args, "--format", "json"], fixture.repo);
    const report = JSON.parse(json.stdout);
    const statuses = Object.fromEntries(
      report.requirementTrace.criteria.map((criterion: { requirementId: string; status: string }) =>
        [criterion.requirementId, criterion.status])
    );

    expect(json.exitCode).toBe(1);
    expect(statuses).toEqual({
      "AC-USERS": "verified",
      "AC-EXPORT": "proof-failed",
      "AC-BILLING": "unmapped"
    });
    expect(report.requirementTrace.criteria[0]).toMatchObject({
      requirementId: "AC-USERS",
      sourceIds: ["requirements-artifact"],
      implementation: {
        files: ["src/app/api/users/route.ts"],
        routes: ["/api/users"]
      }
    });
    expect(report.requirementTrace.criteria.find(
      (criterion: { requirementId: string }) => criterion.requirementId === "AC-EXPORT"
    ).evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "differential", outcome: "failed", trusted: true })
    ]));
    expect(report.safety).toMatchObject({
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false
    });

    const markdown = await run(["redteam", "--with-checks", ...args, "--format", "markdown"], fixture.repo);
    expect(markdown.stdout).toContain("### Acceptance Criteria Trace");
    expect(markdown.stdout).toContain("| AC-USERS | Verified |");
    expect(markdown.stdout).toContain("| AC-EXPORT | Proof failed |");
    expect(markdown.stdout).toContain("| AC-BILLING | Unmapped |");
  });

  it("preserves requirement IDs through analyze, agent, and loop and gates only when requested", async () => {
    const fixture = createTraceFixture();
    const requirementArgs = [
      "--task", "Update users and export APIs",
      "--requirements", "requirements.json"
    ];

    const analyze = await run(["analyze", ...requirementArgs, "--format", "json"], fixture.repo);
    const agent = await run(["agent", ...requirementArgs, "--format", "json"], fixture.repo);
    const loop = await run(["loop", ...requirementArgs, "--max-rounds", "1", "--format", "json"], fixture.repo);
    const ungated = await run(["redteam", ...requirementArgs, "--format", "json"], fixture.repo);
    const gated = await run([
      "redteam", ...requirementArgs, "--fail-on-requirements", "--format", "json"
    ], fixture.repo);

    const ids = ["AC-USERS", "AC-EXPORT", "AC-BILLING"];
    expect(JSON.parse(analyze.stdout).requirementTrace.criteria.map(
      (criterion: { requirementId: string }) => criterion.requirementId
    )).toEqual(ids);
    expect(JSON.parse(agent.stdout).requirementTrace.criteria.map(
      (criterion: { requirementId: string }) => criterion.requirementId
    )).toEqual(ids);
    expect(JSON.parse(loop.stdout).requirementTrace.criteria.map(
      (criterion: { requirementId: string }) => criterion.requirementId
    )).toEqual(ids);
    expect(JSON.parse(loop.stdout).rounds[0].requirementStatuses.map(
      (criterion: { requirementId: string }) => criterion.requirementId
    )).toEqual(ids);
    expect(ungated.exitCode).toBe(0);
    expect(gated.exitCode).toBe(1);
  });
});

function createTraceFixture(): { repo: string; base: string; head: string } {
  const repo = createRepo({
    "src/app/api/users/route.ts": "export async function GET() { return Response.json([{ id: 1, active: true }]); }\n",
    "src/app/api/export/route.ts": "export async function GET() { return Response.json({ version: 'v1' }); }\n",
    "test/users-api.integration.js": "console.log('users API integration passed');\n",
    "probe/export-api.js": [
      "const { readFileSync } = require('node:fs');",
      "console.log(JSON.stringify({ version: readFileSync('export-version.txt', 'utf8').trim() }));",
      ""
    ].join("\n"),
    "export-version.txt": "v1\n",
    "requirements.json": JSON.stringify({
      sources: [{
        id: "requirements-artifact",
        kind: "issue",
        label: "Issue acceptance criteria"
      }],
      acceptanceCriteria: [
        {
          id: "AC-USERS",
          text: "Users API returns active users.",
          requiredProof: ["Run the users API integration test."]
        },
        {
          id: "AC-EXPORT",
          text: "Export API preserves its response contract.",
          requiredProof: ["Compare export API behavior on base and head."]
        },
        {
          id: "AC-BILLING",
          text: "Billing refunds remain available."
        }
      ],
      affectedFlows: [
        { name: "Users API", kind: "api" },
        { name: "Export API", kind: "api" }
      ]
    }, null, 2),
    ".codedecay/config.yml": [
      "version: 1",
      "commands:",
      "  test:",
      "    - node test/users-api.integration.js",
      "probes:",
      "  - name: export API contract",
      "    command: node probe/export-api.js",
      "    timeoutMs: 1000",
      "safety:",
      "  commandTimeoutMs: 1000",
      "  allowCommands: true",
      ""
    ].join("\n")
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  writeFile(repo, "src/app/api/users/route.ts", "export async function GET() { return Response.json([{ id: 1, active: true }].filter((user) => user.active)); }\n");
  writeFile(repo, "src/app/api/export/route.ts", "export async function GET() { return Response.json({ version: 'v2' }); }\n");
  writeFile(repo, "export-version.txt", "v2\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "update users and export APIs"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
}
