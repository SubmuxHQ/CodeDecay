import { describe, expect, it } from "vitest";
import { parseAddedLines, parseNameStatus, parseNumStat } from "../src/index";

describe("parseNameStatus", () => {
  it("detects changed, deleted, and renamed files", () => {
    expect(parseNameStatus("M\tsrc/app.ts\nD\tsrc/old.ts\nR100\tsrc/a.ts\tsrc/b.ts\n")).toEqual([
      {
        path: "src/app.ts",
        status: "modified"
      },
      {
        path: "src/old.ts",
        status: "deleted"
      },
      {
        path: "src/b.ts",
        oldPath: "src/a.ts",
        status: "renamed"
      }
    ]);
  });
});

describe("parseNumStat", () => {
  it("parses numeric additions and deletions", () => {
    const stats = parseNumStat("10\t2\tsrc/app.ts\n-\t-\tpublic/logo.png\n");

    expect(stats.get("src/app.ts")).toEqual({ additions: 10, deletions: 2 });
    expect(stats.get("public/logo.png")).toEqual({ additions: 0, deletions: 0 });
  });
});

describe("parseAddedLines", () => {
  it("captures added line numbers from unified diff output", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -4,0 +5,2 @@",
      "+const value = 1;",
      "+export { value };"
    ].join("\n");

    expect(parseAddedLines(diff).get("src/app.ts")).toEqual([
      { line: 5, content: "const value = 1;" },
      { line: 6, content: "export { value };" }
    ]);
  });
});
