import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentSessionPath,
  finishAgentSession,
  loadAgentSession,
  recordAgentSessionCheckpoint,
  refreshAgentSessionContext,
  renderAgentSessionMarkdown,
  startAgentSession
} from "../src";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("agent sessions", () => {
  it("starts a durable pre-diff session without running models or commands", () => {
    const repo = createRepo({
      "src/billing/payouts.ts": "export function retryPayout(id: string) { return { id, status: 'queued' }; }\n",
      "tests/payouts.test.ts": "import { retryPayout } from '../src/billing/payouts';\n"
    });

    const result = startAgentSession({
      rootDir: repo,
      sessionId: "SESSION-1",
      task: "Add retry proof without leaking api_key=sk-test-secret-value",
      repoFiles: ["src/billing/payouts.ts", "tests/payouts.test.ts"],
      generatedAt: "2026-08-01T00:00:00.000Z",
      requirements: {
        acceptanceCriteria: [
          {
            id: "AC-1",
            text: "Retry payouts are idempotent",
            requiredProof: ["integration test"]
          }
        ],
        affectedFlows: [
          {
            name: "Finance payout retry",
            kind: "api"
          }
        ]
      },
      config: {
        commands: {
          test: ["pnpm test"]
        }
      }
    });

    expect(result.session.id).toBe("SESSION-1");
    expect(result.session.schemaVersion).toBe(1);
    expect(result.session.repository.baseRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(result.session.safety).toMatchObject({
      llmCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false,
      agentOutputTrusted: false
    });
    expect(result.session.safety.secretsRedacted).toBeGreaterThan(0);
    expect(result.guidance?.proofPlan.join("\n")).toMatch(/test|proof/i);
    expect(existsSync(agentSessionPath(repo, "SESSION-1"))).toBe(true);
    expect(readFileSync(agentSessionPath(repo, "SESSION-1"), "utf8")).not.toContain("sk-test-secret-value");
    expect(loadAgentSession(repo, "SESSION-1").task).toContain("[REDACTED]");
  });

  it("does not silently overwrite an existing session id", () => {
    const repo = createRepo({ "src/index.ts": "export const value = 1;\n" });
    startAgentSession({
      rootDir: repo,
      sessionId: "duplicate-session",
      task: "Update value",
      repoFiles: ["src/index.ts"],
      generatedAt: "2026-08-01T00:00:00.000Z"
    });

    expect(() =>
      startAgentSession({
        rootDir: repo,
        sessionId: "duplicate-session",
        task: "Update another value",
        repoFiles: ["src/index.ts"],
        generatedAt: "2026-08-01T00:01:00.000Z"
      })
    ).toThrow(/already exists/i);
  });

  it("generates bounded session ids from punctuation-heavy tasks", () => {
    const repo = createRepo({ "src/index.ts": "export const value = 1;\n" });
    const result = startAgentSession({
      rootDir: repo,
      task: "----Add!!!! durable,,,, session;;;; guidance----",
      repoFiles: ["src/index.ts"],
      generatedAt: "2026-08-01T00:00:00.000Z"
    });

    expect(result.session.id).toMatch(/^add-durable-session-guidance-[a-f0-9]{10}$/);
  });

  it("fails explicitly when another session write holds the lock", () => {
    const repo = createRepo({ "src/index.ts": "export const value = 1;\n" });
    mkdirSync(`${agentSessionPath(repo, "locked-session")}.lock`, { recursive: true });

    expect(() =>
      startAgentSession({
        rootDir: repo,
        sessionId: "locked-session",
        task: "Update value",
        repoFiles: ["src/index.ts"],
        generatedAt: "2026-08-01T00:00:00.000Z"
      })
    ).toThrow(/write is already in progress/i);
  });

  it("detects stale context after out-of-band edits and accepts an explicit checkpoint", () => {
    const repo = createRepo({ "src/api/users.ts": "export function listUsers() { return []; }\n" });
    startAgentSession({
      rootDir: repo,
      sessionId: "stale-session",
      task: "Update users API",
      repoFiles: ["src/api/users.ts"],
      generatedAt: "2026-08-01T00:00:00.000Z"
    });

    writeFile(repo, "src/api/users.ts", "export function listUsers() { return [{ id: 'u1' }]; }\n");
    const stale = refreshAgentSessionContext({
      rootDir: repo,
      sessionId: "stale-session",
      generatedAt: "2026-08-01T00:01:00.000Z",
      evidence: {
        kind: "task-context",
        label: "Task context refresh",
        summary: "Context includes users API.",
        artifactPath: ".codedecay/local/task-context.json"
      }
    });

    expect(stale.stale).toBe(true);
    expect(stale.outOfBandEditsDetected).toBe(true);
    expect(stale.session.status).toBe("stale");
    expect(stale.warnings.join("\n")).toContain("Working tree changed");

    const checkpoint = recordAgentSessionCheckpoint({
      rootDir: repo,
      sessionId: "stale-session",
      kind: "diff",
      summary: "Users API returns one record",
      agentText: "Implemented with token=super-secret-token",
      generatedAt: "2026-08-01T00:02:00.000Z"
    });

    expect(checkpoint.session.status).toBe("active");
    expect(checkpoint.outOfBandEditsDetected).toBe(true);
    expect(checkpoint.session.checkpoints[0]).toMatchObject({
      kind: "diff",
      agentOutputTrusted: false,
      dirtyFiles: ["src/api/users.ts"]
    });
    expect(JSON.stringify(checkpoint.session)).not.toContain("super-secret-token");
  });

  it("finishes with an explicit verification boundary instead of executing checks", () => {
    const repo = createRepo({ "src/auth/session.ts": "export function isAdmin(role: string) { return role === 'admin'; }\n" });
    startAgentSession({
      rootDir: repo,
      sessionId: "finish-session",
      task: "Tighten admin sessions",
      repoFiles: ["src/auth/session.ts"],
      generatedAt: "2026-08-01T00:00:00.000Z",
      requirements: {
        acceptanceCriteria: [
          {
            id: "AC-1",
            text: "Unauthorized users are rejected",
            requiredProof: ["auth integration test"]
          }
        ]
      }
    });

    const result = finishAgentSession({
      rootDir: repo,
      sessionId: "finish-session",
      generatedAt: "2026-08-01T00:03:00.000Z",
      config: {
        commands: {
          test: ["pnpm test"],
          build: ["pnpm build"]
        },
        probes: [
          {
            name: "auth smoke",
            command: "curl http://127.0.0.1:3000/api/auth"
          }
        ]
      }
    });

    expect(result.session.status).toBe("needs-verification");
    expect(result.verification).toMatchObject({
      commandsExecuted: false,
      verdict: "needs-verification"
    });
    expect(result.verification?.allowedChecks).toEqual(
      expect.arrayContaining([
        "test: pnpm test",
        "build: pnpm build",
        "probe:auth smoke: curl http://127.0.0.1:3000/api/auth"
      ])
    );
    expect(result.verification?.acceptanceCriteria[0]).toMatchObject({
      id: "AC-1",
      status: "needs-proof"
    });

    const markdown = renderAgentSessionMarkdown(result);
    expect(markdown).toContain("# CodeDecay Agent Session");
    expect(markdown).toContain("## Verification Boundary");
    expect(markdown).toContain("Allowed check: test: pnpm test");
    expect(markdown).toContain("Commands executed: no");
  });
});

function createRepo(files: Record<string, string>): string {
  const repo = mkdtempSync(join(tmpdir(), "codedecay-agent-session-"));
  tempRoots.push(repo);
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

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
}
