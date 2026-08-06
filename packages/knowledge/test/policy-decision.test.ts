import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { analyzePolicyDecision } from "../src/index";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "policy");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UAT engineering policy (#691)", () => {
  it("UAT-POLICY-1: payment migration requires database compatibility proof and payment-owner approval", () => {
    const root = seed("payment-migration");
    const missingApproval = analyzePolicyDecision({
      rootDir: root,
      policyDirs: [".codedecay/policies"],
      approvalDirs: [],
      exceptionDirs: [],
      changedPaths: ["prisma/migrations/20260806_payout/migration.sql"],
      changeClass: "migration",
      now: "2026-08-06T12:00:00.000Z",
      generatedAt: "2026-08-06T12:00:00.000Z"
    });
    expect(missingApproval.verdict).toBe("require-approval");
    expect(missingApproval.obligations.some((item) => item.kind === "proof" && item.evidenceId === "migration-matrix")).toBe(true);
    expect(missingApproval.obligations.some((item) => item.detail.includes("@payment-owners"))).toBe(true);

    const withApproval = analyzePolicyDecision({
      rootDir: root,
      policyDirs: [".codedecay/policies"],
      approvalDirs: [".codedecay/approvals"],
      exceptionDirs: [],
      changedPaths: ["prisma/migrations/20260806_payout/migration.sql"],
      changeClass: "migration",
      now: "2026-08-06T12:00:00.000Z",
      generatedAt: "2026-08-06T12:00:00.000Z"
    });
    expect(withApproval.verdict).toBe("require-proof");
    expect(withApproval.fullyVerified).toBe(false);
  });

  it("UAT-POLICY-2: docs-only change does not inherit unrelated critical policy", () => {
    const root = seed("docs-only");
    const report = analyzePolicyDecision({
      rootDir: root,
      policyDirs: [".codedecay/policies"],
      approvalDirs: [],
      exceptionDirs: [],
      changedPaths: ["docs/getting-started.md"],
      changeClass: "docs",
      now: "2026-08-06T12:00:00.000Z"
    });
    expect(report.applicable.map((item) => item.policy.id)).toEqual(["docs-only"]);
    expect(report.applicable.some((item) => item.policy.id === "payment-migration")).toBe(false);
    expect(report.verdict).toBe("allow");
  });

  it("UAT-POLICY-3: conflicting repo and organization policies fail closed", () => {
    const root = seed("conflict");
    const report = analyzePolicyDecision({
      rootDir: root,
      policyDirs: [".codedecay/policies"],
      orgPolicyDirs: [".codedecay/org-policies"],
      approvalDirs: [],
      exceptionDirs: [],
      changedPaths: ["src/auth/session.ts"],
      now: "2026-08-06T12:00:00.000Z"
    });
    expect(report.verdict).toBe("conflict");
    expect(report.conflicts.join(" ")).toMatch(/requiredEvidence|requiredApprovers/i);
  });

  it("UAT-POLICY-4: expired or overly broad exception is rejected", () => {
    const root = seed("expired-exception");
    const report = analyzePolicyDecision({
      rootDir: root,
      policyDirs: [".codedecay/policies"],
      approvalDirs: [],
      exceptionDirs: [".codedecay/exceptions"],
      changedPaths: ["prisma/migrations/20260806_payout/migration.sql"],
      changeClass: "migration",
      now: "2026-08-06T12:00:00.000Z"
    });
    expect(report.verdict).toBe("exception-invalid");
    expect(report.blockers.join(" ")).toMatch(/expired|overly broad/i);
  });

  it("UAT-POLICY-5: agent edit to policy cannot authorize its own protected-path change", () => {
    const root = seed("self-mod");
    const report = analyzePolicyDecision({
      rootDir: root,
      policyDirs: [".codedecay/policies"],
      approvalDirs: [".codedecay/approvals"],
      exceptionDirs: [],
      changedPaths: [
        ".codedecay/policies/payment-migration.json",
        "prisma/migrations/20260806_payout/migration.sql"
      ],
      changeClass: "protected-path",
      now: "2026-08-06T12:00:00.000Z"
    });
    expect(report.verdict).toBe("denied");
    expect(report.safety.agentCanModifyPolicy).toBe(false);
    expect(report.blockers.join(" ")).toMatch(/cannot authorize/i);
  });

  it("UAT-POLICY-6: identical decision IDs for the same inputs (CLI/MCP/Action/loop share engine)", () => {
    const root = seed("cross-surface");
    const input = {
      rootDir: root,
      policyDirs: [".codedecay/policies"],
      approvalDirs: [".codedecay/approvals"],
      exceptionDirs: [],
      changedPaths: ["prisma/migrations/20260806_payout/migration.sql"],
      changeClass: "migration" as const,
      now: "2026-08-06T12:00:00.000Z",
      generatedAt: "2026-08-06T12:00:00.000Z"
    };
    const a = analyzePolicyDecision(input);
    const b = analyzePolicyDecision(input);
    expect(a.decisionId).toBe(b.decisionId);
    expect(a.verdict).toBe(b.verdict);
    expect(a.obligations).toEqual(b.obligations);
  });
});

function seed(name: string): string {
  const root = join(tmpdir(), `codedecay-policy-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  cpSync(join(fixtures, name), join(root, ".codedecay"), { recursive: true });
  roots.push(root);
  return root;
}
