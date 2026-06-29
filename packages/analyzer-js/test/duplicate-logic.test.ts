import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { normalizeCodeLine, normalizeImplementationLine } from "../src/code/normalize";
import { detectDuplicateAddedLogic } from "../src/duplicates/added-logic";

describe("code normalization", () => {
  it("normalizes strings, comments, and whitespace without changing code shape", () => {
    expect(normalizeCodeLine("  const label = 'hello';   // user-facing copy")).toBe("const label = \"\";");
    expect(normalizeCodeLine('return value === "active" && count > 0;')).toBe("return value === \"\" && count > 0;");
  });

  it("normalizes implementation lines used for copied-test comparison", () => {
    expect(normalizeImplementationLine("expect(normalize(value)).toBe(copiedNormalize(value));")).toBe(
      "(normalize(value)).toBe(copiedNormalize(value));"
    );
  });
});

describe("duplicate added logic detection", () => {
  it("flags duplicated added source blocks across files", () => {
    const duplicatedBlock = [
      { line: 10, content: "const userId = input.userId;" },
      { line: 11, content: "const account = await loadAccount(userId);" },
      { line: 12, content: "if (!account) throw new Error('missing account');" },
      { line: 13, content: "return account.status === 'active';" }
    ];

    expect(
      detectDuplicateAddedLogic([
        change("src/api/users.ts", duplicatedBlock),
        change("src/api/admin.ts", duplicatedBlock)
      ])
    ).toEqual([
      expect.objectContaining({
        ruleId: "duplicated-added-logic",
        title: "Duplicated added logic",
        severity: "medium",
        category: "decay",
        file: "src/api/users.ts",
        line: 10
      })
    ]);
  });

  it("ignores test files and non-source files", () => {
    const duplicatedBlock = [
      { line: 1, content: "const userId = input.userId;" },
      { line: 2, content: "const account = await loadAccount(userId);" },
      { line: 3, content: "if (!account) throw new Error('missing account');" },
      { line: 4, content: "return account.status === 'active';" }
    ];

    expect(
      detectDuplicateAddedLogic([
        change("src/api/users.test.ts", duplicatedBlock),
        change("docs/example.md", duplicatedBlock)
      ])
    ).toEqual([]);
  });
});

function change(path: string, addedLines: Array<{ line: number; content: string }>): FileChange {
  return {
    path,
    status: "modified",
    additions: addedLines.length,
    deletions: 0,
    addedLines
  };
}
