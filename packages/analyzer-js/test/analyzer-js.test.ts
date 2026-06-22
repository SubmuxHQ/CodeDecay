import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeJsProject } from "../src/index";

const fixtureRoot = join(process.cwd(), "test/fixtures/high-risk-auth");

describe("analyzeJsProject", () => {
  it("flags high-risk auth changes without changed tests", () => {
    const changedFiles: FileChange[] = [
      {
        path: "src/auth/session.ts",
        status: "modified",
        additions: 8,
        deletions: 1,
        addedLines: [
          { line: 1, content: "export function validateSession(token: string | null) {" },
          { line: 2, content: "  if (!token) {" },
          { line: 3, content: "    return null;" }
        ]
      }
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("risky-auth-change");
    expect(result.findings.map((finding) => finding.ruleId)).toContain("missing-nearby-tests");
    expect(result.impactedAreas[0]?.kind).toBe("auth");
  });

  it("flags duplicated added logic across changed files", () => {
    const block = [
      { line: 10, content: "const userId = input.userId;" },
      { line: 11, content: "const account = await loadAccount(userId);" },
      { line: 12, content: "if (!account) throw new Error('missing account');" },
      { line: 13, content: "return account.status === 'active';" }
    ];

    const changedFiles: FileChange[] = [
      {
        path: "src/api/users.ts",
        status: "modified",
        additions: 4,
        deletions: 0,
        addedLines: block
      },
      {
        path: "src/api/admin.ts",
        status: "modified",
        additions: 4,
        deletions: 0,
        addedLines: block
      }
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("duplicated-added-logic");
  });
});
