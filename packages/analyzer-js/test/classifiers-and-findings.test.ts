import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { classifyChange, classifyPath, isLowSignalChange, isTestPath } from "../src/classifiers/paths";
import { createRiskyAreaFinding } from "../src/findings/builders";
import { dedupeFindings } from "../src/findings/sorting";

describe("analyzer-js path classifiers", () => {
  it("classifies risky source areas without treating package names as tests", () => {
    expect(classifyPath("src/auth/session.ts")).toEqual({
      kind: "auth",
      name: "Authentication and authorization",
      risk: "high"
    });
    expect(classifyPath("prisma/schema.prisma")).toEqual({
      kind: "database",
      name: "Database and schema",
      risk: "high"
    });
    expect(classifyPath("app/dashboard/page.tsx")).toEqual({
      kind: "ui",
      name: "UI route",
      risk: "medium"
    });
    expect(classifyPath("packages/test-audit/src/index.ts")).toEqual({
      kind: "source",
      name: "Source code",
      risk: "low"
    });
  });

  it("keeps low-signal assets, docs, lockfiles, and package metadata separate", () => {
    expect(classifyPath("public/logo.svg")).toBeUndefined();
    expect(classifyPath("docs/getting-started.md")).toEqual({
      kind: "docs",
      name: "Documentation",
      risk: "low"
    });
    expect(classifyChange(change("pnpm-lock.yaml", "lockfile: true"))).toEqual({
      kind: "config",
      name: "Dependency lockfile",
      risk: "low"
    });
    expect(
      classifyChange({
        path: "package.json",
        status: "modified",
        additions: 1,
        deletions: 0,
        addedLines: [{ line: 2, content: '  "description": "CodeDecay"' }]
      })
    ).toEqual({
      kind: "config",
      name: "Package metadata",
      risk: "low"
    });
    expect(isLowSignalChange(change("README.md", "# CodeDecay"))).toBe(true);
  });

  it("detects test paths by directory or file stem", () => {
    expect(isTestPath("src/auth/session.test.ts")).toBe(true);
    expect(isTestPath("src/__tests__/session.ts")).toBe(true);
    expect(isTestPath("packages/test-audit/src/index.ts")).toBe(false);
  });
});

describe("analyzer-js finding builders", () => {
  it("creates stable risky area findings and dedupes equivalent findings", () => {
    const fileChange = change("src/auth/session.ts", "export function validateSession() {}");
    const classification = classifyChange(fileChange);

    if (!classification) {
      throw new Error("Expected auth file to be classified");
    }

    const finding = createRiskyAreaFinding(fileChange, classification);
    expect(finding).toEqual({
      ruleId: "risky-auth-change",
      title: "Auth area changed",
      description: "src/auth/session.ts touches a auth area and should be reviewed for regression impact.",
      severity: "high",
      category: "regression",
      file: "src/auth/session.ts",
      line: 1
    });
    expect(dedupeFindings([finding, { ...finding }])).toEqual([finding]);
  });
});

function change(path: string, content: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line: 1, content }]
  };
}
