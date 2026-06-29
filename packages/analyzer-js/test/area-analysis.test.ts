import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeImpactedAreas } from "../src/areas/analysis";

describe("impacted area analysis", () => {
  it("returns impacted areas and risky area findings for classified changes", () => {
    const result = analyzeImpactedAreas([
      change("src/auth/session.ts", "export function validateSession() { return true; }"),
      change("prisma/schema.prisma", "model User { id String @id }")
    ]);

    expect(result.impactedAreas).toEqual([
      {
        name: "Authentication and authorization",
        kind: "auth",
        risk: "high",
        files: ["src/auth/session.ts"]
      },
      {
        name: "Database and schema",
        kind: "database",
        risk: "high",
        files: ["prisma/schema.prisma"]
      }
    ]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "risky-auth-change",
          file: "src/auth/session.ts",
          severity: "high"
        }),
        expect.objectContaining({
          ruleId: "risky-database-change",
          file: "prisma/schema.prisma",
          severity: "high"
        })
      ])
    );
  });

  it("skips unclassified low-signal files", () => {
    expect(analyzeImpactedAreas([change("public/logo.svg", "<svg />")])).toEqual({
      impactedAreas: [],
      findings: []
    });
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
