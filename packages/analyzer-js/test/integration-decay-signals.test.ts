import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeJsProject } from "../src/index";
import { complexFunction, createTempProject, fixtureRoot, largeFunction } from "./helpers/integration";

describe("analyzeJsProject decay signal integration", () => {
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

  it("flags large and high-complexity changed functions", () => {
    const rootDir = createTempProject({
      "src/risk.ts": [largeFunction("largeHandler", 121), complexFunction("complexHandler", 12)].join("\n\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        {
          path: "src/risk.ts",
          status: "modified",
          additions: 30,
          deletions: 0,
          addedLines: [
            { line: 2, content: "  let total = 0;" },
            { line: 127, content: "  if (input.flag0) score += 1;" }
          ]
        }
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["large-function", "high-complexity"])
    );
  });

  it("flags fragile abstractions", () => {
    const changedFiles: FileChange[] = [
      {
        path: "src/services/user.ts",
        status: "modified",
        additions: 4,
        deletions: 0,
        addedLines: [
          { line: 1, content: "const value: any = input;" },
          { line: 2, content: "// @ts-ignore" },
          { line: 3, content: "try { risky(); } catch {}" }
        ]
      }
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["typescript-any", "compiler-suppression", "silent-failure"])
    );
  });
});
