import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runMigrationSafetyTool } from "../src/index";
import { createRepo } from "./helpers/mcp";

describe("MCP migration_safety tool", () => {
  it("returns a plan-ready additive migration without secrets", async () => {
    const repo = createRepo({
      "migration.sql": 'ALTER TABLE "User" ADD COLUMN "nickname" text;\n'
    });
    const output = await runMigrationSafetyTool(
      { cwd: repo },
      {
        format: "json",
        files: ["migration.sql"],
        targetKind: "disposable-local",
        cleanupPlan: "drop volume codedecay-mig",
        databaseUrlEnv: "DATABASE_URL"
      }
    );
    const report = JSON.parse(output) as {
      verdict: string;
      fullyVerified: boolean;
      safety: { databaseConnected: boolean };
    };
    expect(report.verdict).toBe("plan-ready");
    expect(report.fullyVerified).toBe(false);
    expect(report.safety.databaseConnected).toBe(false);
    expect(output).not.toContain("postgres://");
  });

  it("blocks a production-looking host", async () => {
    const repo = createRepo({ "migration.sql": 'CREATE TABLE "T" ("id" text);\n' });
    writeFileSync(join(repo, "migration.sql"), 'CREATE TABLE "T" ("id" text);\n');
    const output = await runMigrationSafetyTool(
      { cwd: repo },
      { format: "json", files: ["migration.sql"], connectionHost: "db.rds.amazonaws.com" }
    );
    const report = JSON.parse(output) as { verdict: string; targetKind: string };
    expect(report.targetKind).toBe("production-like");
    expect(report.verdict).toBe("plan-blocked");
  });
});
