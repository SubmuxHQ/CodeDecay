import { beforeAll, describe, expect, it } from "vitest";
import { createRepo, ensureBuiltCli, runBuilt } from "./helpers/built-cli";

beforeAll(ensureBuiltCli, 120_000);

describe("built codedecay migration workflow", () => {
  it("parses Prisma migration SQL from the bundled CLI without database access", () => {
    const root = createRepo({ "prisma/migrations/001_email/migration.sql": 'ALTER TABLE "User" ADD COLUMN "email" text NOT NULL;\n' });
    const result = runBuilt(["migration", "--cwd", root, "--file", "prisma/migrations/001_email/migration.sql", "--target-kind", "disposable-local", "--format", "json"]);
    const report = JSON.parse(result.stdout) as { operations: Array<{ kind: string; risk: string }>; safety: Record<string, boolean> };
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.operations).toEqual([expect.objectContaining({ kind: "add-column", risk: "blocker" })]);
    expect(report.safety).toMatchObject({ commandsExecuted: false, databaseConnected: false, migrationApplied: false, secretsRead: false });
  });

  it("exposes migration help from the bundled command registry", () => {
    createRepo({ "README.md": "fixture\n" });
    const result = runBuilt(["migration", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CodeDecay migration");
    expect(result.stdout).toContain("--target-kind <kind>");
  });
});
