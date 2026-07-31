import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRepo, run, writeFile } from "./helpers";

describe("session command", () => {
  it("runs the start/context/checkpoint/finish lifecycle without commands or model calls", async () => {
    const repo = createRepo({
      "src/app/api/billing/payouts/retry/route.ts": [
        "export async function POST() {",
        "  return Response.json({ status: 'queued' });",
        "}",
        ""
      ].join("\n"),
      "src/billing/payouts.ts": "export function retryPayout(id: string) { return { id, status: 'queued' }; }\n",
      "tests/payouts.test.ts": "import { retryPayout } from '../src/billing/payouts';\n",
      ".codedecay/config.yml": [
        "version: 1",
        "commands:",
        "  test: pnpm test",
        "safety:",
        "  allowCommands: false",
        ""
      ].join("\n")
    });

    const start = await run([
      "session",
      "start",
      "--cwd",
      repo,
      "--session",
      "billing-retry",
      "--task",
      "Allow finance admins to retry failed payouts with api_key=sk-session-secret",
      "--format",
      "json"
    ], repo);

    expect(start.exitCode).toBe(0);
    const started = JSON.parse(start.stdout);
    expect(started.session).toMatchObject({
      id: "billing-retry",
      status: "active",
      safety: {
        llmCalled: false,
        commandsExecuted: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(start.stdout).not.toContain("sk-session-secret");
    const sessionPath = join(repo, ".codedecay/local/agent-sessions/billing-retry.json");
    expect(existsSync(sessionPath)).toBe(true);

    writeFile(
      repo,
      "src/billing/payouts.ts",
      "export function retryPayout(id: string) { return { id, status: 'queued', retryCount: 1 }; }\n"
    );

    const context = await run([
      "session",
      "context",
      "--cwd",
      repo,
      "--session",
      "billing-retry",
      "--format",
      "json",
      "--max-nodes",
      "8"
    ], repo);

    expect(context.exitCode).toBe(0);
    const refreshed = JSON.parse(context.stdout);
    expect(refreshed.stale).toBe(true);
    expect(refreshed.outOfBandEditsDetected).toBe(true);
    expect(refreshed.session.status).toBe("stale");
    expect(refreshed.session.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "task-context",
          artifactPath: ".codedecay/local/task-context.json"
        })
      ])
    );
    expect(existsSync(join(repo, ".codedecay/local/task-context.json"))).toBe(true);

    const checkpoint = await run([
      "session",
      "checkpoint",
      "--cwd",
      repo,
      "--session",
      "billing-retry",
      "--kind",
      "diff",
      "--summary",
      "Implemented retry count",
      "--agent-output",
      "Plan included token=do-not-store",
      "--format",
      "json"
    ], repo);

    expect(checkpoint.exitCode).toBe(0);
    const checkpointed = JSON.parse(checkpoint.stdout);
    expect(checkpointed.session.status).toBe("active");
    expect(checkpointed.session.checkpoints[0]).toMatchObject({
      kind: "diff",
      agentOutputTrusted: false
    });
    expect(checkpoint.stdout).not.toContain("do-not-store");
    expect(readFileSync(sessionPath, "utf8")).not.toContain("do-not-store");

    const finish = await run([
      "session",
      "finish",
      "--cwd",
      repo,
      "--session",
      "billing-retry",
      "--format",
      "json"
    ], repo);

    expect(finish.exitCode).toBe(0);
    const finished = JSON.parse(finish.stdout);
    expect(finished.session.status).toBe("needs-verification");
    expect(finished.verification).toMatchObject({
      commandsExecuted: false,
      verdict: "needs-verification"
    });
    expect(finished.verification.allowedChecks).toContain("test: pnpm test");
  });
});
